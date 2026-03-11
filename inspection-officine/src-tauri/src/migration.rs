use crate::db::Database;
use crate::audit_db::AuditDatabase;
use rusqlite::params;

/// Vérifie si une migration des grilles est nécessaire
pub fn should_migrate(db: &Database) -> bool {
    if let Ok(conn) = db.conn.lock() {
        if let Ok(count) = conn.query_row(
            "SELECT COUNT(*) FROM grids WHERE is_current = 1",
            [],
            |row| row.get::<_, i64>(0),
        ) {
            return count == 0;
        }
    }
    false
}

/// Migre les grilles hardcodées Rust vers la base de données
pub fn migrate_hardcoded_grids_to_db(db: &Database, audit_db: &AuditDatabase) -> Result<usize, String> {
    let conn = db.conn.lock().map_err(|e| format!("Impossible d'accéder à la DB: {}", e))?;

    // Charger les grilles hardcodées
    let grilles = vec![
        crate::grids::officine::build(),
        crate::grids::grossiste::build(),
    ];

    let mut migrated_count = 0;

    for grille in grilles {
        // 1. Insérer la grille principale avec version 1
        conn.execute(
            "INSERT INTO grids (id, version, name, code, description, icon, color, status, is_current)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', 1)",
            params![
                grille.id,
                grille.version,
                grille.name,
                grille.code,
                grille.description,
                grille.icon,
                grille.color
            ],
        ).map_err(|e| format!("Erreur insertion grille '{}': {}", grille.id, e))?;

        // 2. Insérer les sections
        for (idx, section) in grille.sections.iter().enumerate() {
            conn.execute(
                "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    grille.id,
                    grille.version,
                    section.id,
                    section.title,
                    idx as i32
                ],
            ).map_err(|e| format!("Erreur insertion section: {}", e))?;

            // 3. Insérer les critères
            for (c_idx, criterion) in section.items.iter().enumerate() {
                conn.execute(
                    "INSERT INTO grid_criteria
                     (grid_id, grid_version, section_id, criterion_id, reference, description, pre_opening, display_order)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    params![
                        grille.id,
                        grille.version,
                        section.id,
                        criterion.id,
                        criterion.reference,
                        criterion.description,
                        if criterion.pre_opening { 1 } else { 0 },
                        c_idx as i32
                    ],
                ).map_err(|e| format!("Erreur insertion critère: {}", e))?;
            }
        }

        // 4. Créer snapshot JSON pour la version initiale
        let snapshot_json = serde_json::to_string(&grille)
            .unwrap_or_else(|_| "{}".to_string());

        conn.execute(
            "INSERT INTO grid_versions (grid_id, version, snapshot_json, change_summary)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                grille.id,
                grille.version,
                snapshot_json,
                "Version initiale (migration depuis Rust)"
            ],
        ).map_err(|e| format!("Erreur création version snapshot: {}", e))?;

        migrated_count += 1;
    }

    // Log la migration dans l'audit
    audit_db.log_action(
        None,
        None,
        "MIGRATE_GRIDS",
        Some("system"),
        None,
        Some(&format!("{} grilles migrées depuis Rust vers DB", migrated_count)),
    );

    Ok(migrated_count)
}

/// Vérifie l'intégrité de la migration
pub fn verify_migration(db: &Database) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("Impossible d'accéder à la DB: {}", e))?;

    // Vérifier qu'il y a 2 grilles
    let grid_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM grids WHERE is_current = 1",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur vérification grilles: {}", e))?;

    if grid_count != 2 {
        return Err(format!("Attendu 2 grilles, trouvé {}", grid_count));
    }

    // Vérifier qu'il y a 31 sections (13 officine + 18 grossiste)
    let section_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM grid_sections",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur vérification sections: {}", e))?;

    if section_count != 31 {
        return Err(format!("Attendu 31 sections, trouvé {}", section_count));
    }

    // Vérifier qu'il y a 199 critères (104 officine + 95 grossiste)
    let criteria_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM grid_criteria",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur vérification critères: {}", e))?;

    if criteria_count != 199 {
        return Err(format!("Attendu 199 critères, trouvé {}", criteria_count));
    }

    // Vérifier qu'il y a des snapshots
    let snapshot_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM grid_versions WHERE snapshot_json IS NOT NULL AND LENGTH(snapshot_json) > 100",
        [],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur vérification snapshots: {}", e))?;

    if snapshot_count < 2 {
        return Err(format!("Attendu au moins 2 snapshots, trouvé {}", snapshot_count));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_hardcoded_grids_exist() {
        let officine = crate::grids::officine::build();
        let grossiste = crate::grids::grossiste::build();
        assert!(!officine.sections.is_empty(), "Officine doit avoir des sections");
        assert!(!grossiste.sections.is_empty(), "Grossiste doit avoir des sections");
    }
}
