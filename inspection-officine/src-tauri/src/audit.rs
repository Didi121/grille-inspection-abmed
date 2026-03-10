use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::db::Database;

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
}

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

/// Enregistre une entrée dans le journal d'audit
pub fn log_action(
    db: &Database,
    user_id: Option<&str>,
    username: Option<&str>,
    action: &str,
    entity_type: Option<&str>,
    entity_id: Option<&str>,
    details: Option<&str>,
) {
    if let Ok(conn) = db.conn.lock() {
        conn.execute(
            "INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![user_id, username, action, entity_type, entity_id, details],
        ).ok();
    }
}

/// Raccourci pour audit avec contexte utilisateur
pub fn log_user_action(
    db: &Database,
    user_id: &str,
    username: &str,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    details: &str,
) {
    log_action(
        db,
        Some(user_id),
        Some(username),
        action,
        Some(entity_type),
        Some(entity_id),
        if details.is_empty() { None } else { Some(details) },
    );
}

/// Requêter le journal d'audit avec filtres
pub fn query_audit(db: &Database, filter: &AuditFilter) -> Result<Vec<AuditEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT id, timestamp, user_id, username, action, entity_type, entity_id, details FROM audit_log WHERE 1=1"
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
        param_idx += 1;
    }

    sql.push_str(" ORDER BY timestamp DESC");

    let limit = filter.limit.unwrap_or(100);
    let offset = filter.offset.unwrap_or(0);
    sql.push_str(&format!(" LIMIT ?{} OFFSET ?{}", param_idx, param_idx + 1));
    bind_values.push(Box::new(limit));
    bind_values.push(Box::new(offset));

    let refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let entries = stmt.query_map(refs.as_slice(), |row| {
        Ok(AuditEntry {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            user_id: row.get(2)?,
            username: row.get(3)?,
            action: row.get(4)?,
            entity_type: row.get(5)?,
            entity_id: row.get(6)?,
            details: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(entries)
}

/// Compter le total d'entrées (pour pagination)
pub fn count_audit(db: &Database, filter: &AuditFilter) -> Result<u32, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut sql = String::from("SELECT COUNT(*) FROM audit_log WHERE 1=1");
    let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref uid) = filter.user_id {
        sql.push_str(&format!(" AND user_id = ?{}", idx));
        bind_values.push(Box::new(uid.clone())); idx += 1;
    }
    if let Some(ref action) = filter.action {
        sql.push_str(&format!(" AND action = ?{}", idx));
        bind_values.push(Box::new(action.clone())); idx += 1;
    }
    if let Some(ref etype) = filter.entity_type {
        sql.push_str(&format!(" AND entity_type = ?{}", idx));
        bind_values.push(Box::new(etype.clone())); idx += 1;
    }
    if let Some(ref eid) = filter.entity_id {
        sql.push_str(&format!(" AND entity_id = ?{}", idx));
        bind_values.push(Box::new(eid.clone())); idx += 1;
    }
    if let Some(ref from) = filter.from_date {
        sql.push_str(&format!(" AND timestamp >= ?{}", idx));
        bind_values.push(Box::new(from.clone())); idx += 1;
    }
    if let Some(ref to) = filter.to_date {
        sql.push_str(&format!(" AND timestamp <= ?{}", idx));
        bind_values.push(Box::new(to.clone())); // idx += 1;
    }

    let refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();
    conn.query_row(&sql, refs.as_slice(), |r| r.get(0)).map_err(|e| e.to_string())
}
