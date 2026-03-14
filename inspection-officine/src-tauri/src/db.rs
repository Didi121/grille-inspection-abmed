use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::{Mutex, Arc};

#[derive(Clone)]
pub struct Database {
    pub conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn new(app_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&app_dir).ok();
        let db_path = app_dir.join("inspections.db");
        
        let conn = Connection::open(&db_path)
            .expect("Impossible d'ouvrir la base de données");

        // Configuration pour améliorer les performances concurrentes
        conn.execute_batch("
            PRAGMA journal_mode=WAL;
            PRAGMA foreign_keys=ON;
            PRAGMA synchronous=NORMAL;
            PRAGMA cache_size=1000;
            PRAGMA temp_store=MEMORY;
        ").expect("Erreur configuration base de données");

        // Vérifier que le mode WAL est activé
        let wal_mode: String = conn.query_row("PRAGMA journal_mode", [], |row| row.get(0))
            .expect("Impossible de vérifier le mode journal");
        if wal_mode != "wal" {
            eprintln!("⚠️  Mode WAL non activé: {}", wal_mode);
        }

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
            -- SNAPSHOTS RAPPORTS
            -- ═══════════════════════════════════════════════════════════

            CREATE TABLE IF NOT EXISTS report_snapshots (
                id              TEXT PRIMARY KEY,
                inspection_id   TEXT NOT NULL,
                version         INTEGER NOT NULL,
                status          TEXT NOT NULL,
                responses_json  TEXT NOT NULL DEFAULT '{}',
                meta_json       TEXT NOT NULL DEFAULT '{}',
                created_by      TEXT,
                created_by_name TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- ═══════════════════════════════════════════════════════════
            -- PLANNING & INDISPONIBILITES
            -- ═══════════════════════════════════════════════════════════

            CREATE TABLE IF NOT EXISTS planning (
                id              TEXT PRIMARY KEY,
                date_debut      TEXT,
                date_fin        TEXT,
                establishment   TEXT,
                inspection_type TEXT,
                departement     TEXT,
                commune         TEXT,
                priorite        TEXT DEFAULT 'normale',
                inspectors      TEXT DEFAULT '[]',
                notes           TEXT DEFAULT '',
                status          TEXT NOT NULL DEFAULT 'planifie',
                created_by      TEXT,
                created_by_name TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS indisponibilites (
                id              TEXT PRIMARY KEY,
                inspecteur      TEXT NOT NULL,
                date_debut      TEXT NOT NULL,
                date_fin        TEXT,
                motif           TEXT,
                created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );

            -- ═══════════════════════════════════════════════════════════
            -- SETTINGS (clef/valeur)
            -- ═══════════════════════════════════════════════════════════

            CREATE TABLE IF NOT EXISTS app_settings (
                key             TEXT PRIMARY KEY,
                value           TEXT NOT NULL
            );

            -- ═══════════════════════════════════════════════════════════
            -- INDEX POUR PERFORMANCE
            -- ═══════════════════════════════════════════════════════════

            CREATE INDEX IF NOT EXISTS idx_report_snapshots_insp ON report_snapshots(inspection_id);
            CREATE INDEX IF NOT EXISTS idx_planning_date ON planning(date_debut);
            CREATE INDEX IF NOT EXISTS idx_indispo_date ON indisponibilites(date_debut);

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

        // Migrations : ajouter les colonnes manquantes (silencieux si déjà présentes)
        conn.execute_batch(
            "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;"
        ).ok();
        conn.execute_batch(
            "ALTER TABLE responses ADD COLUMN severity TEXT DEFAULT NULL;"
        ).ok();
        conn.execute_batch(
            "ALTER TABLE responses ADD COLUMN factor TEXT DEFAULT NULL;"
        ).ok();
        conn.execute_batch(
            "ALTER TABLE responses ADD COLUMN factor_justification TEXT DEFAULT NULL;"
        ).ok();
        conn.execute_batch(
            "ALTER TABLE responses ADD COLUMN immediate_danger INTEGER DEFAULT 0;"
        ).ok();

        // Créer l'admin par défaut avec mot de passe aléatoire si n'existe pas
        let admin_exists: bool = conn.query_row(
            "SELECT COUNT(*) > 0 FROM users WHERE username = 'admin'",
            [], |r| r.get(0)
        ).unwrap_or(false);

        if !admin_exists {
            // Générer un mot de passe aléatoire sécurisé (16 caractères)
            let temp_password: String = std::iter::repeat_with(|| rand::random::<u8>())
                .filter(|&b| b.is_ascii_alphanumeric())
                .take(16)
                .map(|b| b as char)
                .collect();
            
            let hash = bcrypt::hash(&temp_password, 10).unwrap();
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute(
                "INSERT INTO users (id, username, full_name, role, password_hash, must_change_password) VALUES (?1,?2,?3,?4,?5,1)",
                params![id, "admin", "Administrateur", "admin", hash],
            ).ok();
            
            // Stocker le mot de passe temporaire dans les settings pour affichage
            conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES ('temp_admin_password', ?1)",
                params![temp_password],
            ).ok();
            
            eprintln!("╔════════════════════════════════════════════════════════════╗");
            eprintln!("║  PREMIER DÉMARRAGE - MOT DE PASSE ADMIN TEMPORAIRE         ║");
            eprintln!("╠════════════════════════════════════════════════════════════╣");
            eprintln!("║  Username: admin                                           ║");
            eprintln!("║  Password: {}                              ║", temp_password);
            eprintln!("╠════════════════════════════════════════════════════════════╣");
            eprintln!("║  ⚠️  Changez ce mot de passe immédiatement après connexion  ║");
            eprintln!("╚════════════════════════════════════════════════════════════╝");
        }

        Database { conn: Arc::new(Mutex::new(conn)) }
    }

    pub fn backup(&self, backup_path: &std::path::Path) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute(&format!("VACUUM INTO '{}'", backup_path.to_string_lossy()), [])
            .map_err(|e| format!("Erreur backup inspections: {}", e))?;
        Ok(())
    }

    pub fn export_to_json(&self) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        
        let mut data = serde_json::Map::new();
        
        // Export des tables principales
        let tables = ["users", "inspections", "responses", "grids", "grid_sections", "grid_criteria", "app_settings"];
        
        for table in tables {
            let mut stmt = conn.prepare(&format!("SELECT * FROM {}", table))
                .map_err(|e| format!("Erreur préparation export {}: {}", table, e))?;
            
            let columns: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
            
            let rows = stmt.query_map([], |row| {
                let mut map = serde_json::Map::new();
                for (i, col) in columns.iter().enumerate() {
                    let val: serde_json::Value = match row.get_ref(i)? {
                        rusqlite::types::ValueRef::Null => serde_json::Value::Null,
                        rusqlite::types::ValueRef::Integer(i) => serde_json::Value::Number(i.into()),
                        rusqlite::types::ValueRef::Real(f) => serde_json::Value::Number(serde_json::Number::from_f64(f).unwrap()),
                        rusqlite::types::ValueRef::Text(t) => serde_json::Value::String(String::from_utf8_lossy(t).into_owned()),
                        rusqlite::types::ValueRef::Blob(b) => serde_json::Value::String(format!("blob:{}", b.len())),
                    };
                    map.insert(col.clone(), val);
                }
                Ok(serde_json::Value::Object(map))
            }).map_err(|e| format!("Erreur export rows {}: {}", table, e))?
              .collect::<Result<Vec<_>, _>>()
              .map_err(|e| format!("Erreur collect rows {}: {}", table, e))?;
            
            data.insert(table.to_string(), serde_json::Value::Array(rows));
        }
        
        serde_json::to_string_pretty(&data).map_err(|e| e.to_string())
    }
}
