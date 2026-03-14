use crate::db::Database;
use crate::audit_db::AuditDatabase;
use crate::grid::{GridInfo, Section, Criterion};
use crate::users::User;
use rusqlite::params;
use serde_json;

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
    });

    match grids {
        Ok(rows) => rows.filter_map(|r| r.ok()).collect(),
        Err(_) => Vec::new(),
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::audit_db::AuditDatabase;
    use crate::grid::{GridInfo, Section, Criterion};
    use crate::users::User;
    use rusqlite::{Connection, params};
    use std::sync::{Mutex, Arc};

    fn create_test_grid_db() -> (Database, AuditDatabase) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").ok();
        conn.execute_batch("
            -- Tables users
            CREATE TABLE users (
                id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'inspector',
                password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                must_change_password INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- Tables grilles
            CREATE TABLE grids (
                id TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '1',
                name TEXT NOT NULL,
                code TEXT NOT NULL,
                description TEXT,
                icon TEXT,
                color TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                is_current INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                created_by TEXT,
                snapshot_before TEXT,
                snapshot_after TEXT,
                PRIMARY KEY (id, version)
            );

            CREATE TABLE IF NOT EXISTS grid_versions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id         TEXT NOT NULL,
                version         TEXT NOT NULL,
                snapshot_json   TEXT NOT NULL,
                change_summary  TEXT,
                created_by      TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(grid_id, version)
            );

            CREATE TABLE grid_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id TEXT NOT NULL,
                grid_version TEXT NOT NULL,
                section_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                UNIQUE(grid_id, grid_version, section_id)
            );

            CREATE TABLE grid_criteria (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id TEXT NOT NULL,
                grid_version TEXT NOT NULL,
                section_id INTEGER NOT NULL,
                criterion_id INTEGER NOT NULL,
                reference TEXT NOT NULL,
                description TEXT NOT NULL,
                pre_opening INTEGER NOT NULL DEFAULT 0,
                display_order INTEGER NOT NULL DEFAULT 0,
                UNIQUE(grid_id, grid_version, section_id, criterion_id)
            );

            -- Table audit
            CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                user_id TEXT,
                username TEXT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details TEXT,
                before_snapshot TEXT,
                after_snapshot TEXT
            );
        ").unwrap();

        // Créer un utilisateur de test
        conn.execute(
            "INSERT INTO users (id, username, full_name, role, password_hash) VALUES ('u1','admin','Admin','admin','hash')",
            [],
        ).unwrap();

        let db = Database { conn: Arc::new(Mutex::new(conn)) };

        // Créer une seconde connection pour audit
        let audit_conn = Connection::open_in_memory().unwrap();
        audit_conn.execute_batch("PRAGMA foreign_keys=ON;").ok();
        audit_conn.execute_batch("
            CREATE TABLE audit_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                user_id TEXT,
                username TEXT,
                action TEXT NOT NULL,
                entity_type TEXT,
                entity_id TEXT,
                details TEXT,
                before_snapshot TEXT,
                after_snapshot TEXT
            );
        ").unwrap();
        let audit_db = AuditDatabase { conn: Arc::new(Mutex::new(audit_conn)) };

        (db, audit_db)
    }

    fn create_test_user() -> User {
        User {
            id: "u1".to_string(),
            username: "admin".to_string(),
            full_name: "Admin".to_string(),
            role: "admin".to_string(),
            active: true,
            must_change_password: false,
            created_at: "2024-01-01".to_string(),
            updated_at: "2024-01-01".to_string(),
        }
    }

    #[test]
    fn test_save_and_load_grid() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        let grid = GridInfo {
            id: "grid1".to_string(),
            name: "Test Grid".to_string(),
            code: "TEST-001".to_string(),
            version: "1".to_string(),
            description: "Test grid description".to_string(),
            icon: "📋".to_string(),
            color: "#ff0000".to_string(),
            sections: vec![
                Section {
                    id: 1,
                    title: "Section 1".to_string(),
                    items: vec![
                        Criterion {
                            id: 1,
                            reference: "C1".to_string(),
                            description: "Criterion 1".to_string(),
                            pre_opening: false,
                        },
                        Criterion {
                            id: 2,
                            reference: "C2".to_string(),
                            description: "Criterion 2".to_string(),
                            pre_opening: true,
                        },
                    ],
                },
                Section {
                    id: 2,
                    title: "Section 2".to_string(),
                    items: vec![
                        Criterion {
                            id: 3,
                            reference: "C3".to_string(),
                            description: "Criterion 3".to_string(),
                            pre_opening: false,
                        },
                    ],
                },
            ],
        };

        let result = save_grid(&db, &audit_db, &grid, &user);
        assert!(result.is_ok());

        // Charger la grille depuis la BD
        let loaded = find_grid_by_id(&db, "grid1", None);
        assert!(loaded.is_some());

        let loaded_grid = loaded.unwrap();
        assert_eq!(loaded_grid.id, "grid1");
        assert_eq!(loaded_grid.name, "Test Grid");
        assert_eq!(loaded_grid.code, "TEST-001");
        assert_eq!(loaded_grid.version, "1");
        assert_eq!(loaded_grid.sections.len(), 2);
        assert_eq!(loaded_grid.sections[0].items.len(), 2);
        assert_eq!(loaded_grid.sections[1].items.len(), 1);
    }

    #[test]
    fn test_load_grids_empty() {
        let (db, audit_db) = create_test_grid_db();
        let _ = audit_db; // Suppress unused warning

        let grids = load_grids_from_db(&db);
        assert_eq!(grids.len(), 0);
    }

    #[test]
    fn test_load_multiple_grids() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        // Créer 2 grilles
        let grid1 = GridInfo {
            id: "grid1".to_string(),
            name: "Grid 1".to_string(),
            code: "G1".to_string(),
            version: "1".to_string(),
            description: "Desc 1".to_string(),
            icon: "1".to_string(),
            color: "#000".to_string(),
            sections: vec![],
        };

        let grid2 = GridInfo {
            id: "grid2".to_string(),
            name: "Grid 2".to_string(),
            code: "G2".to_string(),
            version: "1".to_string(),
            description: "Desc 2".to_string(),
            icon: "2".to_string(),
            color: "#fff".to_string(),
            sections: vec![],
        };

        save_grid(&db, &audit_db, &grid1, &user).unwrap();
        save_grid(&db, &audit_db, &grid2, &user).unwrap();

        let grids = load_grids_from_db(&db);
        assert_eq!(grids.len(), 2);
    }

    #[test]
    fn test_archive_grid() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        let grid = GridInfo {
            id: "grid1".to_string(),
            name: "Grid".to_string(),
            code: "G1".to_string(),
            version: "1".to_string(),
            description: "Desc".to_string(),
            icon: "📋".to_string(),
            color: "#f00".to_string(),
            sections: vec![],
        };

        save_grid(&db, &audit_db, &grid, &user).unwrap();

        // Vérifier que la grille est accessible
        assert!(find_grid_by_id(&db, "grid1", None).is_some());

        // Archiver
        let result = archive_grid(&db, &audit_db, "grid1", &user);
        assert!(result.is_ok());

        // Vérifier que la grille n'est plus dans les grilles actives
        let grids = load_grids_from_db(&db);
        assert_eq!(grids.len(), 0);

        // Vérifier que la grille est toujours accessible par ID
        assert!(find_grid_by_id(&db, "grid1", None).is_some());
    }

    #[test]
    fn test_find_grid_by_id_not_found() {
        let (db, audit_db) = create_test_grid_db();
        let _ = audit_db; // Suppress unused warning

        let result = find_grid_by_id(&db, "nonexistent", None);
        assert!(result.is_none());
    }

    #[test]
    fn test_export_and_import_grid_json() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        // Créer une grille
        let original = GridInfo {
            id: "grid1".to_string(),
            name: "Export Grid".to_string(),
            code: "EXP-001".to_string(),
            version: "1".to_string(),
            description: "For export test".to_string(),
            icon: "📤".to_string(),
            color: "#00ff00".to_string(),
            sections: vec![
                Section {
                    id: 1,
                    title: "Export Section".to_string(),
                    items: vec![
                        Criterion {
                            id: 1,
                            reference: "E1".to_string(),
                            description: "Export criterion".to_string(),
                            pre_opening: false,
                        },
                    ],
                },
            ],
        };

        save_grid(&db, &audit_db, &original, &user).unwrap();

        // Exporter
        let json = export_grid_json(&db, "grid1", None).unwrap();
        assert!(json.contains("Export Grid"));
        assert!(json.contains("EXP-001"));

        // Importer avec un nouvel ID
        let result = import_grid_from_json(&db, &audit_db, &json, &user);
        assert!(result.is_ok());

        let imported_id = result.unwrap();
        assert_ne!(imported_id, "grid1");

        // Vérifier l'import
        let imported = find_grid_by_id(&db, &imported_id, None);
        assert!(imported.is_some());
        let imported_grid = imported.unwrap();
        assert_eq!(imported_grid.name, "Export Grid");
        assert_eq!(imported_grid.sections.len(), 1);
    }

    #[test]
    fn test_versioning_grid() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        // Créer version initiale
        let v1 = GridInfo {
            id: "grid1".to_string(),
            name: "Grid V1".to_string(),
            code: "G1".to_string(),
            version: "1".to_string(),
            description: "Version 1".to_string(),
            icon: "V1".to_string(),
            color: "#f00".to_string(),
            sections: vec![
                Section {
                    id: 1,
                    title: "Section 1".to_string(),
                    items: vec![],
                },
            ],
        };

        save_grid(&db, &audit_db, &v1, &user).unwrap();

        // Créer version 2
        let new_version = create_version(&db, &audit_db, "grid1", "Added section 2", &user);
        assert!(new_version.is_ok());
        assert_eq!(new_version.unwrap(), "2");

        // Ajouter section 2 à la version 2
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
             VALUES ('grid1', '2', 2, 'Section 2', 1)",
            [],
        ).ok();

        // Vérifier les versions
        let versions = list_versions(&db, "grid1").unwrap();
        assert_eq!(versions.len(), 2);

        // Vérifier snapshot version 1
        let v1_snapshot = get_version_snapshot(&db, "grid1", "1");
        assert!(v1_snapshot.is_ok());
        let v1_grid = v1_snapshot.unwrap();
        assert_eq!(v1_grid.sections.len(), 1);

        // Vérifier snapshot version 2
        let v2_snapshot = get_version_snapshot(&db, "grid1", "2");
        assert!(v2_snapshot.is_ok());
        let v2_grid = v2_snapshot.unwrap();
        assert_eq!(v2_grid.sections.len(), 2);
    }

    #[test]
    fn test_rollback_grid_version() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        // Créer version 1 avec 1 section
        let v1 = GridInfo {
            id: "grid1".to_string(),
            name: "Rollback Test".to_string(),
            code: "RB-001".to_string(),
            version: "1".to_string(),
            description: "For rollback".to_string(),
            icon: "🔄".to_string(),
            color: "#f00".to_string(),
            sections: vec![
                Section {
                    id: 1,
                    title: "Original Section".to_string(),
                    items: vec![],
                },
            ],
        };

        save_grid(&db, &audit_db, &v1, &user).unwrap();

        // Créer version 2 (modifiée)
        create_version(&db, &audit_db, "grid1", "Modified", &user).unwrap();

        // Modifier version 2 (ajouter section)
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
             VALUES ('grid1', '2', 2, 'Modified Section', 1)",
            [],
        ).ok();
        drop(conn);

        // Vérifier état courant (2 sections)
        let current = find_grid_by_id(&db, "grid1", None).unwrap();
        assert_eq!(current.sections.len(), 2);

        // Rollback vers version 1
        let result = rollback_to_version(&db, &audit_db, "grid1", "1", &user);
        assert!(result.is_ok());

        // Vérifier rollback (1 section)
        let rolled_back = find_grid_by_id(&db, "grid1", None).unwrap();
        assert_eq!(rolled_back.sections.len(), 1);
        assert_eq!(rolled_back.sections[0].title, "Original Section");
    }

    #[test]
    fn test_update_grid_meta() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        let grid = GridInfo {
            id: "grid1".to_string(),
            name: "Original Name".to_string(),
            code: "ORIG".to_string(),
            version: "1".to_string(),
            description: "Original Description".to_string(),
            icon: "📋".to_string(),
            color: "#000".to_string(),
            sections: vec![],
        };

        save_grid(&db, &audit_db, &grid, &user).unwrap();

        // Mettre à jour
        let result = update_grid_meta(&db, &audit_db, "grid1",
            Some("Updated Name".to_string()),
            Some("Updated Description".to_string()),
            Some("✏️".to_string()),
            Some("#fff".to_string()),
            &user
        );
        assert!(result.is_ok());

        // Vérifier
        let updated = find_grid_by_id(&db, "grid1", None).unwrap();
        assert_eq!(updated.name, "Updated Name");
        assert_eq!(updated.description, "Updated Description");
        assert_eq!(updated.icon, "✏️");
        assert_eq!(updated.color, "#fff");
    }

    #[test]
    fn test_find_grid_by_specific_version() {
        let (db, audit_db) = create_test_grid_db();
        let user = create_test_user();

        let v1 = GridInfo {
            id: "grid1".to_string(),
            name: "V1".to_string(),
            code: "G1".to_string(),
            version: "1".to_string(),
            description: "Version 1".to_string(),
            icon: "1".to_string(),
            color: "#000".to_string(),
            sections: vec![
                Section {
                    id: 1,
                    title: "Section 1".to_string(),
                    items: vec![],
                },
            ],
        };

        save_grid(&db, &audit_db, &v1, &user).unwrap();
        create_version(&db, &audit_db, "grid1", "V2 created", &user).unwrap();

        // Modifier V2
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
             VALUES ('grid1', '2', 2, 'Section 2', 1)",
            [],
        ).ok();
        drop(conn);

        // Récupérer V1 explicite
        let v1_explicit = find_grid_by_id(&db, "grid1", Some("1")).unwrap();
        assert_eq!(v1_explicit.sections.len(), 1);

        // Récupérer V2 explicite
        let v2_explicit = find_grid_by_id(&db, "grid1", Some("2")).unwrap();
        assert_eq!(v2_explicit.sections.len(), 2);
    }
}
