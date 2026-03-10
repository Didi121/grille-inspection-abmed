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
    pub must_change_password: bool,
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
        "SELECT id, username, full_name, role, active, password_hash, created_at, updated_at, must_change_password FROM users WHERE username = ?1",
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
                row.get::<_,bool>(8).unwrap_or(false),
            ))
        },
    ).map_err(|_| "Identifiants incorrects".to_string())?;

    let (id, uname, full_name, role, active, hash, created_at, updated_at, must_change_password) = result;

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
        user: User { id, username: uname, full_name, role, active, must_change_password, created_at, updated_at },
    })
}

pub fn validate_session(db: &Database, token: &str) -> Result<User, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT u.id, u.username, u.full_name, u.role, u.active, u.created_at, u.updated_at, u.must_change_password
         FROM sessions s JOIN users u ON s.user_id = u.id
         WHERE s.token = ?1 AND s.expires_at > datetime('now','localtime') AND u.active = 1",
        params![token],
        |row| Ok(User {
            id: row.get(0)?, username: row.get(1)?, full_name: row.get(2)?,
            role: row.get(3)?, active: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
            must_change_password: row.get::<_,bool>(7).unwrap_or(false),
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
              role: req.role.clone(), active: true, must_change_password: false, created_at: now.clone(), updated_at: now })
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
        "SELECT id, username, full_name, role, active, created_at, updated_at, must_change_password FROM users ORDER BY created_at"
    ).map_err(|e| e.to_string())?;
    let users = stmt.query_map([], |row| Ok(User {
        id: row.get(0)?, username: row.get(1)?, full_name: row.get(2)?,
        role: row.get(3)?, active: row.get(4)?, created_at: row.get(5)?, updated_at: row.get(6)?,
        must_change_password: row.get::<_,bool>(7).unwrap_or(false),
    })).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(users)
}

pub fn clear_must_change_password(db: &Database, user_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE users SET must_change_password = 0, updated_at = datetime('now','localtime') WHERE id = ?1",
        params![user_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn validate_input(value: &str, field_name: &str, min_len: usize, max_len: usize) -> Result<String, String> {
    let trimmed = value.trim().to_string();
    if trimmed.len() < min_len {
        return Err(format!("{} doit contenir au moins {} caractères", field_name, min_len));
    }
    if trimmed.len() > max_len {
        return Err(format!("{} ne peut pas dépasser {} caractères", field_name, max_len));
    }
    Ok(trimmed)
}

pub fn validate_password(password: &str) -> Result<(), String> {
    if password.len() < 8 {
        return Err("Le mot de passe doit contenir au moins 8 caractères".to_string());
    }
    if password.len() > 128 {
        return Err("Le mot de passe ne peut pas dépasser 128 caractères".to_string());
    }
    let has_letter = password.chars().any(|c| c.is_alphabetic());
    let has_digit = password.chars().any(|c| c.is_numeric());
    if !has_letter || !has_digit {
        return Err("Le mot de passe doit contenir des lettres et des chiffres".to_string());
    }
    Ok(())
}

pub fn delete_user(db: &Database, user_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE user_id = ?1", params![user_id]).ok();
    conn.execute("UPDATE users SET active = 0, updated_at=datetime('now','localtime') WHERE id = ?1",
        params![user_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ═══════════════════ TESTS UNITAIRES ═══════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── Tests de validation ──

    #[test]
    fn test_validate_input_ok() {
        assert!(validate_input("admin", "Username", 3, 50).is_ok());
        assert_eq!(validate_input("  test  ", "Field", 2, 50).unwrap(), "test");
    }

    #[test]
    fn test_validate_input_too_short() {
        assert!(validate_input("ab", "Username", 3, 50).is_err());
        assert!(validate_input("", "Field", 1, 50).is_err());
    }

    #[test]
    fn test_validate_input_too_long() {
        let long = "a".repeat(51);
        assert!(validate_input(&long, "Username", 3, 50).is_err());
    }

    #[test]
    fn test_validate_password_ok() {
        assert!(validate_password("secure1pass").is_ok());
        assert!(validate_password("Abcd1234").is_ok());
        assert!(validate_password("12345abc").is_ok());
    }

    #[test]
    fn test_validate_password_too_short() {
        assert!(validate_password("abc12").is_err());
        assert!(validate_password("1234567").is_err());
    }

    #[test]
    fn test_validate_password_no_digits() {
        assert!(validate_password("abcdefgh").is_err());
    }

    #[test]
    fn test_validate_password_no_letters() {
        assert!(validate_password("12345678").is_err());
    }

    #[test]
    fn test_validate_password_too_long() {
        let long = "a1".repeat(65);
        assert!(validate_password(&long).is_err());
    }

    // ── Tests avec base de données en mémoire ──

    fn create_test_db() -> Database {
        use rusqlite::Connection;
        use std::sync::Mutex;

        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").ok();
        conn.execute_batch("
            CREATE TABLE users (
                id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
                full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'inspector',
                password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
                must_change_password INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE sessions (
                token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                expires_at TEXT NOT NULL
            );
        ").unwrap();

        // Créer un admin de test
        let hash = bcrypt::hash("Test1234", 4).unwrap();
        conn.execute(
            "INSERT INTO users (id, username, full_name, role, password_hash, must_change_password) VALUES ('u1','admin','Admin','admin',?1,1)",
            params![hash],
        ).unwrap();

        Database { conn: Mutex::new(conn) }
    }

    #[test]
    fn test_login_success() {
        let db = create_test_db();
        let result = login(&db, "admin", "Test1234");
        assert!(result.is_ok());
        let session = result.unwrap();
        assert_eq!(session.user.username, "admin");
        assert!(session.user.must_change_password);
    }

    #[test]
    fn test_login_wrong_password() {
        let db = create_test_db();
        assert!(login(&db, "admin", "wrongpass").is_err());
    }

    #[test]
    fn test_login_unknown_user() {
        let db = create_test_db();
        assert!(login(&db, "unknown", "Test1234").is_err());
    }

    #[test]
    fn test_validate_session() {
        let db = create_test_db();
        let session = login(&db, "admin", "Test1234").unwrap();
        let user = validate_session(&db, &session.token);
        assert!(user.is_ok());
        assert_eq!(user.unwrap().username, "admin");
    }

    #[test]
    fn test_validate_session_invalid_token() {
        let db = create_test_db();
        assert!(validate_session(&db, "invalid-token").is_err());
    }

    #[test]
    fn test_logout() {
        let db = create_test_db();
        let session = login(&db, "admin", "Test1234").unwrap();
        assert!(logout(&db, &session.token).is_ok());
        assert!(validate_session(&db, &session.token).is_err());
    }

    #[test]
    fn test_create_user() {
        let db = create_test_db();
        let req = CreateUserRequest {
            username: "inspector1".to_string(),
            full_name: "Dr. Test".to_string(),
            role: "inspector".to_string(),
            password: "Secure1pass".to_string(),
        };
        let user = create_user(&db, &req);
        assert!(user.is_ok());
        let u = user.unwrap();
        assert_eq!(u.username, "inspector1");
        assert!(!u.must_change_password);
    }

    #[test]
    fn test_create_duplicate_user() {
        let db = create_test_db();
        let req = CreateUserRequest {
            username: "admin".to_string(),
            full_name: "Duplicate".to_string(),
            role: "inspector".to_string(),
            password: "Secure1pass".to_string(),
        };
        assert!(create_user(&db, &req).is_err());
    }

    #[test]
    fn test_change_password_and_login() {
        let db = create_test_db();
        assert!(change_password(&db, "u1", "NewPass123").is_ok());
        assert!(login(&db, "admin", "Test1234").is_err());
        assert!(login(&db, "admin", "NewPass123").is_ok());
    }

    #[test]
    fn test_clear_must_change_password() {
        let db = create_test_db();
        let session = login(&db, "admin", "Test1234").unwrap();
        assert!(session.user.must_change_password);
        assert!(clear_must_change_password(&db, "u1").is_ok());
        let user = validate_session(&db, &session.token).unwrap();
        assert!(!user.must_change_password);
    }

    #[test]
    fn test_deactivate_user() {
        let db = create_test_db();
        assert!(delete_user(&db, "u1").is_ok());
        assert!(login(&db, "admin", "Test1234").is_err()); // Compte désactivé
    }

    #[test]
    fn test_list_users() {
        let db = create_test_db();
        let users = list_users(&db).unwrap();
        assert_eq!(users.len(), 1);
        assert_eq!(users[0].username, "admin");
    }
}
