use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("inspections.db");
        let conn = Connection::open(&db_path)
            .expect("Impossible d'ouvrir la base de données");

        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;").ok();

        conn.execute_batch("
            -- Utilisateurs
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                username    TEXT NOT NULL UNIQUE,
                full_name   TEXT NOT NULL,
                role        TEXT NOT NULL DEFAULT 'inspector'
                            CHECK(role IN ('admin','lead_inspector','inspector','viewer')),
                password_hash TEXT NOT NULL,
                active      INTEGER NOT NULL DEFAULT 1,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- Sessions (token simple)
            CREATE TABLE IF NOT EXISTS sessions (
                token       TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id),
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                expires_at  TEXT NOT NULL
            );

            -- Inspections
            CREATE TABLE IF NOT EXISTS inspections (
                id          TEXT PRIMARY KEY,
                grid_id     TEXT NOT NULL,
                status      TEXT NOT NULL DEFAULT 'draft'
                            CHECK(status IN ('draft','in_progress','completed','validated','archived')),
                date_inspection TEXT,
                establishment   TEXT,
                inspection_type TEXT,
                inspectors      TEXT,  -- JSON array
                created_by  TEXT REFERENCES users(id),
                validated_by TEXT REFERENCES users(id),
                validated_at TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- Réponses
            CREATE TABLE IF NOT EXISTS responses (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                inspection_id   TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
                criterion_id    INTEGER NOT NULL,
                conforme        INTEGER,  -- NULL=non répondu, 0=non conforme, 1=conforme
                observation     TEXT DEFAULT '',
                updated_by      TEXT REFERENCES users(id),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                UNIQUE(inspection_id, criterion_id)
            );

            -- ═══════════════════════════════════════════════════════════
            -- TABLES GRILLES (gestion dynamique)
            -- ═══════════════════════════════════════════════════════════

            -- Grilles principales (stockage des grilles)
            CREATE TABLE IF NOT EXISTS grids (
                id              TEXT NOT NULL,
                version         TEXT NOT NULL,
                name            TEXT NOT NULL,
                code            TEXT NOT NULL,
                description     TEXT NOT NULL,
                icon            TEXT NOT NULL,
                color           TEXT NOT NULL,
                status          TEXT NOT NULL DEFAULT 'active'
                                CHECK(status IN ('draft','active','archived')),
                is_current      INTEGER NOT NULL DEFAULT 1,
                created_by      TEXT REFERENCES users(id),
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                PRIMARY KEY (id, version)
            );

            -- Sections des grilles
            CREATE TABLE IF NOT EXISTS grid_sections (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id         TEXT NOT NULL,
                grid_version    TEXT NOT NULL,
                section_id      INTEGER NOT NULL,
                title           TEXT NOT NULL,
                display_order   INTEGER NOT NULL,
                FOREIGN KEY (grid_id, grid_version) REFERENCES grids(id, version) ON DELETE CASCADE,
                UNIQUE(grid_id, grid_version, section_id)
            );

            -- Critères des grilles
            CREATE TABLE IF NOT EXISTS grid_criteria (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id         TEXT NOT NULL,
                grid_version    TEXT NOT NULL,
                section_id      INTEGER NOT NULL,
                criterion_id    INTEGER NOT NULL,
                reference       TEXT NOT NULL,
                description     TEXT NOT NULL,
                pre_opening     INTEGER NOT NULL DEFAULT 0,
                display_order   INTEGER NOT NULL,
                FOREIGN KEY (grid_id, grid_version) REFERENCES grids(id, version) ON DELETE CASCADE,
                UNIQUE(grid_id, grid_version, criterion_id)
            );

            -- Historique des versions de grilles
            CREATE TABLE IF NOT EXISTS grid_versions (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                grid_id         TEXT NOT NULL,
                version         TEXT NOT NULL,
                snapshot_json   TEXT NOT NULL,
                change_summary  TEXT,
                created_by      TEXT REFERENCES users(id),
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                FOREIGN KEY (grid_id, version) REFERENCES grids(id, version),
                UNIQUE(grid_id, version)
            );

            -- ═══════════════════════════════════════════════════════════
            -- INDEX POUR PERFORMANCE
            -- ═══════════════════════════════════════════════════════════

            CREATE INDEX IF NOT EXISTS idx_responses_insp ON responses(inspection_id);
            CREATE INDEX IF NOT EXISTS idx_inspections_status ON inspections(status);
            CREATE INDEX IF NOT EXISTS idx_inspections_user ON inspections(created_by);

            -- Grilles
            CREATE INDEX IF NOT EXISTS idx_grids_status ON grids(status);
            CREATE INDEX IF NOT EXISTS idx_grids_current ON grids(is_current);
            CREATE INDEX IF NOT EXISTS idx_grid_sections_grid ON grid_sections(grid_id, grid_version);
            CREATE INDEX IF NOT EXISTS idx_grid_criteria_grid ON grid_criteria(grid_id, grid_version);
            CREATE INDEX IF NOT EXISTS idx_grid_criteria_section ON grid_criteria(grid_id, grid_version, section_id);
        ").expect("Erreur création tables");

        // Migration : ajouter must_change_password si absent
        conn.execute_batch(
            "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;"
        ).ok(); // Silencieux si colonne existe déjà

        // Créer l'admin par défaut s'il n'existe pas (avec changement de MdP obligatoire)
        let admin_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE username = 'admin'",
            [], |r| r.get(0)
        ).unwrap_or(false);

        if !admin_exists {
            let hash = bcrypt::hash("admin123", 10).unwrap();
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO users (id, username, full_name, role, password_hash, must_change_password) VALUES (?1,?2,?3,?4,?5,1)",
                params![id, "admin", "Administrateur", "admin", hash],
            ).ok();
        }

        Database { conn: Mutex::new(conn) }
    }
}
