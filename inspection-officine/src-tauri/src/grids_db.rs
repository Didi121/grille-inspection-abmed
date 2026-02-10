use crate::db::Database;
use crate::audit_db::AuditDatabase;
use crate::grid::{GridInfo, Section, Criterion};
use crate::users::User;
use rusqlite::params;
use serde_json::{json, Value};

/// Charge toutes les grilles actives depuis la base de données
pub fn load_grids_from_db(db: &Database) -> Vec<GridInfo> {
    let conn = match db.conn.lock() {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    let mut stmt = match conn.prepare(
        "SELECT id, version, name, code, description, icon, color
         FROM grids WHERE is_current = 1 AND status = 'active'
         ORDER BY id"
    ) {
        Ok(s) => s,
        Err(_) => return Vec::new(),
    };

    let grids = stmt.query_map([], |row| {
        let grid_id: String = row.get(0)?;
        let version: String = row.get(1)?;
        let name: String = row.get(2)?;
        let code: String = row.get(3)?;
        let description: String = row.get(4)?;
        let icon: String = row.get(5)?;
        let color: String = row.get(6)?;

        // Charger les sections et critères pour cette grille
        let sections = load_grid_sections_from_db(&conn, &grid_id, &version)
            .unwrap_or_default();

        Ok(GridInfo {
            id: grid_id,
            name,
            code,
            version,
            description,
            icon,
            color,
            sections,
        })
    }).unwrap_or_default();

    grids.filter_map(|r| r.ok()).collect()
}

/// Charge les sections d'une grille spécifique
fn load_grid_sections_from_db(
    conn: &rusqlite::Connection,
    grid_id: &str,
    version: &str,
) -> Result<Vec<Section>, String> {
    let mut stmt = conn.prepare(
        "SELECT section_id, title FROM grid_sections
         WHERE grid_id = ?1 AND grid_version = ?2
         ORDER BY display_order"
    ).map_err(|e| format!("Erreur requête sections: {}", e))?;

    let sections = stmt.query_map(params![grid_id, version], |row| {
        let section_id: u32 = row.get(0)?;
        let title: String = row.get(1)?;

        // Charger les critères de cette section
        let items = load_section_criteria_from_db(conn, grid_id, version, section_id)
            .unwrap_or_default();

        Ok(Section {
            id: section_id,
            title,
            items,
        })
    }).map_err(|e| format!("Erreur mapping sections: {}", e))?;

    sections.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Erreur collect sections: {}", e))
}

/// Charge les critères d'une section
fn load_section_criteria_from_db(
    conn: &rusqlite::Connection,
    grid_id: &str,
    version: &str,
    section_id: u32,
) -> Result<Vec<Criterion>, String> {
    let mut stmt = conn.prepare(
        "SELECT criterion_id, reference, description, pre_opening
         FROM grid_criteria
         WHERE grid_id = ?1 AND grid_version = ?2 AND section_id = ?3
         ORDER BY display_order"
    ).map_err(|e| format!("Erreur requête critères: {}", e))?;

    let criteria = stmt.query_map(params![grid_id, version, section_id], |row| {
        Ok(Criterion {
            id: row.get(0)?,
            reference: row.get(1)?,
            description: row.get(2)?,
            pre_opening: row.get::<_, i32>(3)? == 1,
        })
    }).map_err(|e| format!("Erreur mapping critères: {}", e))?;

    criteria.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Erreur collect critères: {}", e))
}

/// Trouve une grille par son ID et version
pub fn find_grid_by_id(db: &Database, id: &str, version: Option<&str>) -> Option<GridInfo> {
    let conn = db.conn.lock().ok()?;

    // Si version non spécifiée, prendre la version courante
    let sql = if version.is_some() {
        "SELECT version FROM grids WHERE id = ?1 AND version = ?2 LIMIT 1"
    } else {
        "SELECT version FROM grids WHERE id = ?1 AND is_current = 1 LIMIT 1"
    };

    let actual_version: String = match if let Some(v) = version {
        conn.query_row(sql, params![id, v], |row| row.get(0))
    } else {
        conn.query_row(sql, params![id], |row| row.get(0))
    } {
        Ok(v) => v,
        Err(_) => return None,
    };

    // Charger la grille complète
    let grid: GridInfo = conn.query_row(
        "SELECT id, version, name, code, description, icon, color
         FROM grids WHERE id = ?1 AND version = ?2",
        params![id, actual_version],
        |row| {
            let grid_id: String = row.get(0)?;
            let version: String = row.get(1)?;
            let name: String = row.get(2)?;
            let code: String = row.get(3)?;
            let description: String = row.get(4)?;
            let icon: String = row.get(5)?;
            let color: String = row.get(6)?;

            let sections = load_grid_sections_from_db(&conn, &grid_id, &version)
                .unwrap_or_default();

            Ok(GridInfo {
                id: grid_id,
                name,
                code,
                version,
                description,
                icon,
                color,
                sections,
            })
        },
    ).ok()?;

    Some(grid)
}

/// Sauvegarde une nouvelle grille en base de données
pub fn save_grid(
    db: &Database,
    audit_db: &AuditDatabase,
    grid: &GridInfo,
    user: &User,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Insérer la grille
    conn.execute(
        "INSERT INTO grids (id, version, name, code, description, icon, color, status, is_current, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'active', 1, ?8)",
        params![
            grid.id,
            grid.version,
            grid.name,
            grid.code,
            grid.description,
            grid.icon,
            grid.color,
            user.id
        ],
    ).map_err(|e| format!("Erreur insertion grille: {}", e))?;

    // Insérer les sections et critères
    for (section_idx, section) in grid.sections.iter().enumerate() {
        conn.execute(
            "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![grid.id, grid.version, section.id, section.title, section_idx as i32],
        ).map_err(|e| format!("Erreur insertion section: {}", e))?;

        for (criterion_idx, criterion) in section.items.iter().enumerate() {
            conn.execute(
                "INSERT INTO grid_criteria
                 (grid_id, grid_version, section_id, criterion_id, reference, description, pre_opening, display_order)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    grid.id,
                    grid.version,
                    section.id,
                    criterion.id,
                    criterion.reference,
                    criterion.description,
                    if criterion.pre_opening { 1 } else { 0 },
                    criterion_idx as i32
                ],
            ).map_err(|e| format!("Erreur insertion critère: {}", e))?;
        }
    }

    // Créer snapshot et version
    let snapshot = serde_json::to_string(&grid)
        .unwrap_or_else(|_| "{}".to_string());

    conn.execute(
        "INSERT INTO grid_versions (grid_id, version, snapshot_json, change_summary, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![grid.id, grid.version, snapshot, "Création initiale", user.id],
    ).map_err(|e| format!("Erreur création version: {}", e))?;

    // Log audit
    audit_db.log_grid_action(
        &user.id,
        &user.username,
        "CREATE_GRID",
        &grid.id,
        None,
        Some(&snapshot),
        Some(&format!("Grille créée: {}", grid.name)),
    );

    Ok(())
}

/// Modifie les métadonnées d'une grille
pub fn update_grid_meta(
    db: &Database,
    audit_db: &AuditDatabase,
    id: &str,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    color: Option<String>,
    user: &User,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Récupérer la grille actuelle
    let before_snapshot = get_grid_snapshot(&conn, id, None)?;

    // Déterminer les champs à modifier
    let mut updates = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

    if let Some(n) = name {
        updates.push("name = ?");
        values.push(Box::new(n));
    }
    if let Some(d) = description {
        updates.push("description = ?");
        values.push(Box::new(d));
    }
    if let Some(i) = icon {
        updates.push("icon = ?");
        values.push(Box::new(i));
    }
    if let Some(c) = color {
        updates.push("color = ?");
        values.push(Box::new(c));
    }

    if updates.is_empty() {
        return Ok(());
    }

    updates.push("updated_at = datetime('now','localtime')");

    let sql = format!(
        "UPDATE grids SET {} WHERE id = ? AND is_current = 1",
        updates.join(", ")
    );

    let mut stmt = conn.prepare(&sql)
        .map_err(|e| format!("Erreur préparation update: {}", e))?;

    // Ajouter l'ID à la fin
    values.push(Box::new(id.to_string()));

    let params_refs: Vec<&dyn rusqlite::types::ToSql> = values.iter()
        .map(|b| b.as_ref())
        .collect();

    stmt.execute(params_refs.as_slice())
        .map_err(|e| format!("Erreur update: {}", e))?;

    let after_snapshot = get_grid_snapshot(&conn, id, None)?;

    // Log audit
    audit_db.log_grid_action(
        &user.id,
        &user.username,
        "UPDATE_GRID_META",
        id,
        Some(&before_snapshot),
        Some(&after_snapshot),
        None,
    );

    Ok(())
}

/// Archive une grille (soft delete)
pub fn archive_grid(
    db: &Database,
    audit_db: &AuditDatabase,
    id: &str,
    user: &User,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let before_snapshot = get_grid_snapshot(&conn, id, None)?;

    conn.execute(
        "UPDATE grids SET status = 'archived', updated_at = datetime('now','localtime')
         WHERE id = ? AND is_current = 1",
        params![id],
    ).map_err(|e| format!("Erreur archive: {}", e))?;

    audit_db.log_grid_action(
        &user.id,
        &user.username,
        "ARCHIVE_GRID",
        id,
        Some(&before_snapshot),
        None,
        None,
    );

    Ok(())
}

/// Récupère le snapshot JSON complet d'une grille
fn get_grid_snapshot(
    conn: &rusqlite::Connection,
    grid_id: &str,
    version: Option<&str>,
) -> Result<String, String> {
    let sql = if version.is_some() {
        "SELECT snapshot_json FROM grid_versions WHERE grid_id = ? AND version = ?"
    } else {
        "SELECT snapshot_json FROM grid_versions WHERE grid_id = ?
         AND version = (SELECT version FROM grids WHERE id = ? AND is_current = 1)"
    };

    let snapshot: String = if let Some(v) = version {
        conn.query_row(sql, params![grid_id, v], |row| row.get(0))
            .map_err(|e| format!("Erreur snapshot: {}", e))?
    } else {
        conn.query_row(sql, params![grid_id, grid_id], |row| row.get(0))
            .map_err(|e| format!("Erreur snapshot: {}", e))?
    };

    Ok(snapshot)
}

/// Crée une nouvelle version d'une grille
pub fn create_version(
    db: &Database,
    audit_db: &AuditDatabase,
    grid_id: &str,
    change_summary: &str,
    user: &User,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    // Récupérer la version actuelle
    let current_version: String = conn.query_row(
        "SELECT version FROM grids WHERE id = ? AND is_current = 1",
        params![grid_id],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur récupération version: {}", e))?;

    // Calculer nouvelle version
    let new_version = format!(
        "{}",
        current_version.parse::<i32>()
            .map_err(|_| "Version invalide".to_string())?
            + 1
    );

    // Marquer l'ancienne version comme non-courante
    conn.execute(
        "UPDATE grids SET is_current = 0 WHERE id = ? AND version = ?",
        params![grid_id, current_version],
    ).map_err(|e| format!("Erreur update version: {}", e))?;

    // Créer le snapshot pour la nouvelle version
    let before_snapshot = get_grid_snapshot(&conn, grid_id, Some(&current_version))?;

    // Insérer la nouvelle version (copie de l'actuelle pour le moment)
    conn.execute(
        "INSERT INTO grid_versions (grid_id, version, snapshot_json, change_summary, created_by)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![grid_id, new_version, before_snapshot, change_summary, user.id],
    ).map_err(|e| format!("Erreur création version: {}", e))?;

    // Insérer la grille avec nouvelle version
    conn.execute(
        "INSERT INTO grids (id, version, name, code, description, icon, color, status, is_current, created_by)
         SELECT id, ?, name, code, description, icon, color, status, 1, ?
         FROM grids WHERE id = ? AND version = ?",
        params![new_version, user.id, grid_id, current_version],
    ).map_err(|e| format!("Erreur insertion grille version: {}", e))?;

    // Copier les sections
    conn.execute(
        "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
         SELECT grid_id, ?, section_id, title, display_order
         FROM grid_sections WHERE grid_id = ? AND grid_version = ?",
        params![new_version, grid_id, current_version],
    ).map_err(|e| format!("Erreur copie sections: {}", e))?;

    // Copier les critères
    conn.execute(
        "INSERT INTO grid_criteria (grid_id, grid_version, section_id, criterion_id, reference, description, pre_opening, display_order)
         SELECT grid_id, ?, section_id, criterion_id, reference, description, pre_opening, display_order
         FROM grid_criteria WHERE grid_id = ? AND grid_version = ?",
        params![new_version, grid_id, current_version],
    ).map_err(|e| format!("Erreur copie critères: {}", e))?;

    audit_db.log_grid_action(
        &user.id,
        &user.username,
        "CREATE_GRID_VERSION",
        grid_id,
        Some(&before_snapshot),
        Some(&before_snapshot),
        Some(&format!("Version {} créée: {}", new_version, change_summary)),
    );

    Ok(new_version)
}

/// Liste les versions d'une grille
pub fn list_versions(
    db: &Database,
    grid_id: &str,
) -> Result<Vec<(String, String, String)>, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let mut stmt = conn.prepare(
        "SELECT version, change_summary, created_at FROM grid_versions
         WHERE grid_id = ?1 ORDER BY created_at DESC"
    ).map_err(|e| format!("Erreur requête versions: {}", e))?;

    let versions = stmt.query_map(params![grid_id], |row| {
        Ok((row.get(0)?, row.get::<_, Option<String>>(1)?.unwrap_or_default(), row.get(2)?))
    }).map_err(|e| format!("Erreur mapping: {}", e))?;

    versions.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Erreur collect: {}", e))
}

/// Obtient le snapshot d'une version spécifique
pub fn get_version_snapshot(
    db: &Database,
    grid_id: &str,
    version: &str,
) -> Result<GridInfo, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let snapshot_json: String = conn.query_row(
        "SELECT snapshot_json FROM grid_versions WHERE grid_id = ? AND version = ?",
        params![grid_id, version],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur snapshot: {}", e))?;

    serde_json::from_str(&snapshot_json)
        .map_err(|e| format!("Erreur parsing snapshot: {}", e))
}

/// Rollback vers une version antérieure
pub fn rollback_to_version(
    db: &Database,
    audit_db: &AuditDatabase,
    grid_id: &str,
    target_version: &str,
    user: &User,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let before_snapshot = get_grid_snapshot(&conn, grid_id, None)?;

    // Récupérer la version cible
    let target_snapshot = get_grid_snapshot(&conn, grid_id, Some(target_version))?;
    let target_grid: GridInfo = serde_json::from_str(&target_snapshot)
        .map_err(|e| format!("Erreur parsing target: {}", e))?;

    // Déterminer la nouvelle version
    let current_version: String = conn.query_row(
        "SELECT version FROM grids WHERE id = ? AND is_current = 1",
        params![grid_id],
        |row| row.get(0),
    ).map_err(|e| format!("Erreur version: {}", e))?;

    let new_version = format!(
        "{}",
        current_version.parse::<i32>()
            .map_err(|_| "Version invalide".to_string())?
            + 1
    );

    // Marquer ancienne comme non-courante
    conn.execute(
        "UPDATE grids SET is_current = 0 WHERE id = ? AND version = ?",
        params![grid_id, current_version],
    ).map_err(|e| format!("Erreur update ancien: {}", e))?;

    // Insérer la grille restaurée
    conn.execute(
        "INSERT INTO grids (id, version, name, code, description, icon, color, status, is_current, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?)",
        params![
            target_grid.id,
            new_version,
            target_grid.name,
            target_grid.code,
            target_grid.description,
            target_grid.icon,
            target_grid.color,
            user.id
        ],
    ).map_err(|e| format!("Erreur insertion restaurée: {}", e))?;

    // Copier sections
    for section in &target_grid.sections {
        conn.execute(
            "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
             VALUES (?, ?, ?, ?, ?)",
            params![grid_id, new_version, section.id, section.title, 0],
        ).map_err(|e| format!("Erreur section rollback: {}", e))?;

        // Copier critères
        for (idx, criterion) in section.items.iter().enumerate() {
            conn.execute(
                "INSERT INTO grid_criteria (grid_id, grid_version, section_id, criterion_id, reference, description, pre_opening, display_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                params![
                    grid_id,
                    new_version,
                    section.id,
                    criterion.id,
                    criterion.reference,
                    criterion.description,
                    if criterion.pre_opening { 1 } else { 0 },
                    idx as i32
                ],
            ).map_err(|e| format!("Erreur critère rollback: {}", e))?;
        }
    }

    // Créer version snapshot
    conn.execute(
        "INSERT INTO grid_versions (grid_id, version, snapshot_json, change_summary, created_by)
         VALUES (?, ?, ?, ?, ?)",
        params![
            grid_id,
            new_version,
            target_snapshot,
            format!("Rollback vers version {}", target_version),
            user.id
        ],
    ).map_err(|e| format!("Erreur version snapshot: {}", e))?;

    audit_db.log_grid_action(
        &user.id,
        &user.username,
        "ROLLBACK_GRID",
        grid_id,
        Some(&before_snapshot),
        Some(&target_snapshot),
        Some(&format!("Rollback vers version {}", target_version)),
    );

    Ok(())
}

/// Export une grille en JSON
pub fn export_grid_json(
    db: &Database,
    grid_id: &str,
    version: Option<&str>,
) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| format!("DB lock error: {}", e))?;

    let snapshot = get_grid_snapshot(&conn, grid_id, version)?;
    Ok(snapshot)
}

/// Import une grille depuis JSON
pub fn import_grid_from_json(
    db: &Database,
    audit_db: &AuditDatabase,
    json: &str,
    user: &User,
) -> Result<String, String> {
    let grid: GridInfo = serde_json::from_str(json)
        .map_err(|e| format!("Erreur parsing JSON: {}", e))?;

    // Sauvegarder comme nouvelle grille
    save_grid(db, audit_db, &grid, user)?;

    Ok(grid.id)
}
