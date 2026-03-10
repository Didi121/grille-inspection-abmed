use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;
use serde::{Deserialize, Serialize};

/// Structure pour représenter une entrée d'audit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditEntry {
    pub id: i64,
    pub timestamp: String,
    pub user_id: Option<String>,
    pub username: Option<String>,
    pub action: String,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub details: Option<String>,
    pub before_snapshot: Option<String>,
    pub after_snapshot: Option<String>,
}

/// Filtre pour les requêtes d'audit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuditFilter {
    pub user_id: Option<String>,
    pub action: Option<String>,
    pub entity_type: Option<String>,
    pub entity_id: Option<String>,
    pub from_date: Option<String>,
    pub to_date: Option<String>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

/// Base de données d'audit séparée (pour immuabilité et compliance)
pub struct AuditDatabase {
    pub conn: Mutex<Connection>,
}

impl AuditDatabase {
    /// Crée ou ouvre la base de données d'audit séparée
    pub fn new(app_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("audit.db");
        let conn = Connection::open(&db_path)
            .expect("Impossible d'ouvrir la base de données audit");

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").ok();

        // Créer la table audit_log si elle n'existe pas
        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS audit_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp       TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                user_id         TEXT,
                username        TEXT,
                action          TEXT NOT NULL,
                entity_type     TEXT,
                entity_id       TEXT,
                details         TEXT,
                before_snapshot TEXT,
                after_snapshot  TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
            CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_log(action);
            CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);
        ").expect("Erreur création table audit_log");

        AuditDatabase { conn: Mutex::new(conn) }
    }

    /// Enregistre une action d'audit simple
    pub fn log_action(
        &self,
        user_id: Option<&str>,
        username: Option<&str>,
        action: &str,
        entity_type: Option<&str>,
        entity_id: Option<&str>,
        details: Option<&str>,
    ) {
        if let Ok(conn) = self.conn.lock() {
            conn.execute(
                "INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![user_id, username, action, entity_type, entity_id, details],
            ).ok();
        }
    }

    /// Enregistre une action d'audit avec contexte utilisateur
    pub fn log_user_action(
        &self,
        user_id: &str,
        username: &str,
        action: &str,
        entity_type: &str,
        entity_id: &str,
        details: &str,
    ) {
        self.log_action(
            Some(user_id),
            Some(username),
            action,
            Some(entity_type),
            Some(entity_id),
            if details.is_empty() { None } else { Some(details) },
        );
    }

    /// Enregistre une action d'audit liée aux grilles avec snapshots before/after
    pub fn log_grid_action(
        &self,
        user_id: &str,
        username: &str,
        action: &str,
        grid_id: &str,
        before_snapshot: Option<&str>,
        after_snapshot: Option<&str>,
        details: Option<&str>,
    ) {
        if let Ok(conn) = self.conn.lock() {
            conn.execute(
                "INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, before_snapshot, after_snapshot)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    user_id,
                    username,
                    action,
                    "grid",
                    grid_id,
                    details,
                    before_snapshot,
                    after_snapshot
                ],
            ).ok();
        }
    }

    /// Requête l'audit trail avec filtres
    pub fn query_audit(&self, filter: &AuditFilter) -> Result<Vec<AuditEntry>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut sql = String::from(
            "SELECT id, timestamp, user_id, username, action, entity_type, entity_id, details, before_snapshot, after_snapshot
             FROM audit_log WHERE 1=1"
        );
        let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
        let mut param_idx = 1;

        if let Some(ref uid) = filter.user_id {
            sql.push_str(&format!(" AND user_id = ?{}", param_idx));
            bind_values.push(Box::new(uid.clone()));
            param_idx += 1;
        }
        if let Some(ref action) = filter.action {
            sql.push_str(&format!(" AND action = ?{}", param_idx));
            bind_values.push(Box::new(action.clone()));
            param_idx += 1;
        }
        if let Some(ref etype) = filter.entity_type {
            sql.push_str(&format!(" AND entity_type = ?{}", param_idx));
            bind_values.push(Box::new(etype.clone()));
            param_idx += 1;
        }
        if let Some(ref eid) = filter.entity_id {
            sql.push_str(&format!(" AND entity_id = ?{}", param_idx));
            bind_values.push(Box::new(eid.clone()));
            param_idx += 1;
        }
        if let Some(ref from) = filter.from_date {
            sql.push_str(&format!(" AND timestamp >= ?{}", param_idx));
            bind_values.push(Box::new(from.clone()));
            param_idx += 1;
        }
        if let Some(ref to) = filter.to_date {
            sql.push_str(&format!(" AND timestamp <= ?{}", param_idx));
            bind_values.push(Box::new(to.clone()));
            let _ = param_idx;
        }

        sql.push_str(" ORDER BY timestamp DESC");

        let limit = filter.limit.unwrap_or(100);
        let offset = filter.offset.unwrap_or(0);
        sql.push_str(&format!(" LIMIT {} OFFSET {}", limit, offset));

        // Construire les paramètres dynamiquement est compliqué en Rust
        // On va utiliser une approche alternative plus simple
        let mut stmt = conn.prepare(&sql)
            .map_err(|e| format!("Erreur requête audit: {}", e))?;

        let entries = stmt.query_map(rusqlite::params_from_iter(bind_values.iter().map(|v| v.as_ref())), |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                timestamp: row.get(1)?,
                user_id: row.get(2)?,
                username: row.get(3)?,
                action: row.get(4)?,
                entity_type: row.get(5)?,
                entity_id: row.get(6)?,
                details: row.get(7)?,
                before_snapshot: row.get(8)?,
                after_snapshot: row.get(9)?,
            })
        }).map_err(|e| format!("Erreur mapping: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Erreur collect: {}", e))?;

        Ok(entries)
    }

    /// Compte le total d'entrées d'audit avec filtres
    pub fn count_audit(&self, filter: &AuditFilter) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;

        let mut sql = String::from("SELECT COUNT(*) FROM audit_log WHERE 1=1");
        let mut params_list: Vec<String> = Vec::new();

        if let Some(ref uid) = filter.user_id {
            sql.push_str(" AND user_id = ?");
            params_list.push(uid.clone());
        }
        if let Some(ref action) = filter.action {
            sql.push_str(" AND action = ?");
            params_list.push(action.clone());
        }
        if let Some(ref etype) = filter.entity_type {
            sql.push_str(" AND entity_type = ?");
            params_list.push(etype.clone());
        }
        if let Some(ref eid) = filter.entity_id {
            sql.push_str(" AND entity_id = ?");
            params_list.push(eid.clone());
        }
        if let Some(ref from) = filter.from_date {
            sql.push_str(" AND timestamp >= ?");
            params_list.push(from.clone());
        }
        if let Some(ref to) = filter.to_date {
            sql.push_str(" AND timestamp <= ?");
            params_list.push(to.clone());
        }

        let params_refs: Vec<&dyn rusqlite::types::ToSql> = params_list.iter()
            .map(|s| s as &dyn rusqlite::types::ToSql)
            .collect();

        let count: i64 = conn.query_row(&sql, params_refs.as_slice(), |row| row.get(0))
            .map_err(|e| format!("Erreur count_audit: {}", e))?;

        Ok(count)
    }

    /// Export de l'audit trail en CSV
    pub fn export_audit_csv(&self, filter: &AuditFilter) -> Result<String, String> {
        let entries = self.query_audit(filter)?;
        let mut csv = String::from("timestamp,user_id,username,action,entity_type,entity_id,details\n");

        for entry in entries {
            let row = format!(
                "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",\"{}\"\n",
                entry.timestamp.replace("\"", "\"\""),
                entry.user_id.unwrap_or_default().replace("\"", "\"\""),
                entry.username.unwrap_or_default().replace("\"", "\"\""),
                entry.action.replace("\"", "\"\""),
                entry.entity_type.unwrap_or_default().replace("\"", "\"\""),
                entry.entity_id.unwrap_or_default().replace("\"", "\"\""),
                entry.details.unwrap_or_default().replace("\"", "\"\"")
            );
            csv.push_str(&row);
        }

        Ok(csv)
    }

    /// Export de l'audit trail en JSON
    pub fn export_audit_json(&self, filter: &AuditFilter) -> Result<String, String> {
        let entries = self.query_audit(filter)?;
        serde_json::to_string(&entries)
            .map_err(|e| format!("Erreur export JSON: {}", e))
    }
}
