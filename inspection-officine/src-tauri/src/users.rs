use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub token: String,
    pub user: User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub full_name: String,
    pub role: String,
    pub password: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserRequest {
    pub full_name: Option<String>,
    pub role: Option<String>,
    pub active: Option<bool>,
}

// ── Authentification ──

pub fn login(db: &Database, username: &str, password: &str) -> Result<SessionInfo, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let result = conn.query_row(
        "SELECT id, username, full_name, role, active, password_hash, created_at, updated_at FROM users WHERE username = ?1",
        params![username],
        |row| {
            Ok((
                row.get::<_,String>(0)?,
                row.get::<_,String>(1)?,
                row.get::<_,String>(2)?,
                row.get::<_,String>(3)?,
                row.get::<_,bool>(4)?,
                row.get::<_,String>(5)?,
                row.get::<_,String>(6)?,
                row.get::<_,String>(7)?,
            ))
        },
    ).map_err(|_| "Identifiants incorrects".to_string())?;

    let (id, uname, full_name, role, active, hash, created_at, updated_at) = result;

    if !active {
        return Err("Compte désactivé".to_string());
    }

    if !bcrypt::verify(password, &hash).unwrap_or(false) {
        return Err("Identifiants incorrects".to_string());
    }

    let token = uuid::Uuid::new_v4().to_string();
    let expires = chrono::Local::now()
        .checked_add_signed(chrono::Duration::hours(24))
        .unwrap()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    conn.execute(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)",
        params![token, id, expires],
    ).map_err(|e| e.to_string())?;

    Ok(SessionInfo {
        token: token.clone(),
        user: User { id, username: uname, full_name, role, active, created_at, updated_at },
    })
}

pub fn validate_session(db: &Database, token: &str) -> Result<User, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT u.id, u.username, u.full_name, u.role, u.active, u.created_at, u.updated_at
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.token = ?1 AND s.expires_at > datetime('now','localtime') AND u.active = 1",
        params![token],
        |row| Ok(User {
            id: row.get(0)?, username: row.get(1)?, full_name: row.get(2)?,
            role: row.get(3)?, active: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
        }),
    ).map_err(|_| "Session invalide ou expirée".to_string())
}

pub fn logout(db: &Database, token: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE token = ?1", params![token])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── CRUD Utilisateurs ──

pub fn create_user(db: &Database, req: &CreateUserRequest) -> Result<User, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let hash = bcrypt::hash(&req.password, 8).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO users (id, username, full_name, role, password_hash) VALUES (?1,?2,?3,?4,?5)",
        params![id, req.username, req.full_name, req.role, hash],
    ).map_err(|e| format!("Erreur création : {}", e))?;

    let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    Ok(User { id, username: req.username.clone(), full_name: req.full_name.clone(),
              role: req.role.clone(), active: true, created_at: now.clone(), updated_at: now })
}

pub fn update_user(db: &Database, user_id: &str, req: &UpdateUserRequest) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    if let Some(ref name) = req.full_name {
        conn.execute("UPDATE users SET full_name=?1, updated_at=datetime('now','localtime') WHERE id=?2",
            params![name, user_id]).map_err(|e| e.to_string())?;
    }
    if let Some(ref role) = req.role {
        conn.execute("UPDATE users SET role=?1, updated_at=datetime('now','localtime') WHERE id=?2",
            params![role, user_id]).map_err(|e| e.to_string())?;
    }
    if let Some(active) = req.active {
        conn.execute("UPDATE users SET active=?1, updated_at=datetime('now','localtime') WHERE id=?2",
            params![active, user_id]).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn change_password(db: &Database, user_id: &str, new_password: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let hash = bcrypt::hash(new_password, 8).map_err(|e| e.to_string())?;
    conn.execute("UPDATE users SET password_hash=?1, updated_at=datetime('now','localtime') WHERE id=?2",
        params![hash, user_id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_users(db: &Database) -> Result<Vec<User>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, username, full_name, role, active, created_at, updated_at FROM users ORDER BY created_at"
    ).map_err(|e| e.to_string())?;
    let users = stmt.query_map([], |row| Ok(User {
        id: row.get(0)?, username: row.get(1)?, full_name: row.get(2)?,
        role: row.get(3)?, active: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(users)
}

pub fn delete_user(db: &Database, user_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![user_id]).ok();
    conn.execute("UPDATE users SET active = 0, updated_at=datetime('now','localtime') WHERE id = ?1",
        params![user_id]).map_err(|e| e.to_string())?;
    Ok(())
}
