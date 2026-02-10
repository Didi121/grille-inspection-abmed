#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod grid;
mod grids;
mod db;
mod users;
mod audit;
mod storage;
mod audit_db;
mod migration;
mod grids_db;
mod grid_diff;

use grid::{GridInfo, Section, Criterion};
use db::Database;
use users::{CreateUserRequest, UpdateUserRequest, SessionInfo, User};
use audit::{AuditEntry, AuditFilter};
use audit_db::{AuditDatabase, AuditFilter as AuditDbFilter, AuditEntry as AuditDbEntry};
use storage::{SavedInspection, SavedResponse, CreateInspectionRequest};
use serde::{Deserialize, Serialize};
use tauri::State;

// ── Grid summary (pour la sélection) ──
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridSummary {
    pub id: String, pub name: String, pub code: String, pub description: String,
    pub icon: String, pub color: String, pub criteria_count: usize, pub section_count: usize,
}

// ════════════════════ GRILLES ════════════════════

#[tauri::command]
fn list_grids() -> Vec<GridSummary> {
    grids::all().iter().map(|g| GridSummary {
        id: g.id.clone(), name: g.name.clone(), code: g.code.clone(),
        description: g.description.clone(), icon: g.icon.clone(), color: g.color.clone(),
        criteria_count: g.sections.iter().map(|s| s.items.len()).sum(),
        section_count: g.sections.len(),
    }).collect()
}

#[tauri::command]
fn get_grid(grid_id: String) -> Option<GridInfo> { grids::find(&grid_id) }

#[tauri::command]
fn get_sections(grid_id: String) -> Vec<Section> {
    grids::find(&grid_id).map(|g| g.sections).unwrap_or_default()
}

// ════════════════════ AUTH ════════════════════

#[tauri::command]
fn cmd_login(database: State<Database>, audit_database: State<AuditDatabase>, username: String, password: String) -> Result<SessionInfo, String> {
    let result = users::login(&database, &username, &password)?;
    audit_database.log_action(Some(&result.user.id), Some(&result.user.username),
        "LOGIN", Some("session"), Some(&result.token), None);
    Ok(result)
}

#[tauri::command]
fn cmd_logout(database: State<Database>, audit_database: State<AuditDatabase>, token: String) -> Result<(), String> {
    if let Ok(user) = users::validate_session(&database, &token) {
        audit_database.log_user_action(&user.id, &user.username,
            "LOGOUT", "session", &token, "");
    }
    users::logout(&database, &token)
}

#[tauri::command]
fn cmd_validate_session(database: State<Database>, token: String) -> Result<User, String> {
    users::validate_session(&database, &token)
}

// ════════════════════ UTILISATEURS ════════════════════

fn require_role(db: &Database, token: &str, roles: &[&str]) -> Result<User, String> {
    let user = users::validate_session(db, token)?;
    if roles.contains(&user.role.as_str()) { Ok(user) }
    else { Err(format!("Accès refusé. Rôle requis : {}", roles.join(" ou "))) }
}

#[tauri::command]
fn cmd_list_users(database: State<Database>, token: String) -> Result<Vec<User>, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    users::list_users(&database)
}

#[tauri::command]
fn cmd_create_user(database: State<Database>, audit_database: State<AuditDatabase>, token: String, req: CreateUserRequest) -> Result<User, String> {
    let admin = require_role(&database, &token, &["admin"])?;
    let user = users::create_user(&database, &req)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "CREATE_USER", "user", &user.id,
        &format!("{{\"username\":\"{}\",\"role\":\"{}\"}}", user.username, user.role));
    Ok(user)
}

#[tauri::command]
fn cmd_update_user(database: State<Database>, audit_database: State<AuditDatabase>, token: String, user_id: String, req: UpdateUserRequest) -> Result<(), String> {
    let admin = require_role(&database, &token, &["admin"])?;
    users::update_user(&database, &user_id, &req)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "UPDATE_USER", "user", &user_id,
        &serde_json::to_string(&req).unwrap_or_default());
    Ok(())
}

#[tauri::command]
fn cmd_change_password(database: State<Database>, audit_database: State<AuditDatabase>, token: String, user_id: String, new_password: String) -> Result<(), String> {
    let admin = require_role(&database, &token, &["admin"])?;
    users::change_password(&database, &user_id, &new_password)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "CHANGE_PASSWORD", "user", &user_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_delete_user(database: State<Database>, audit_database: State<AuditDatabase>, token: String, user_id: String) -> Result<(), String> {
    let admin = require_role(&database, &token, &["admin"])?;
    users::delete_user(&database, &user_id)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "DEACTIVATE_USER", "user", &user_id, "");
    Ok(())
}

// ════════════════════ INSPECTIONS PERSISTANTES ════════════════════

#[tauri::command]
fn cmd_create_inspection(database: State<Database>, audit_database: State<AuditDatabase>, token: String, req: CreateInspectionRequest) -> Result<String, String> {
    let user = users::validate_session(&database, &token)?;
    let id = storage::create_inspection(&database, &req, &user.id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "CREATE_INSPECTION", "inspection", &id,
        &format!("{{\"grid\":\"{}\",\"establishment\":\"{}\"}}", req.grid_id, req.establishment));
    Ok(id)
}

#[tauri::command]
fn cmd_list_inspections(database: State<Database>, token: String, my_only: bool, status: Option<String>) -> Result<Vec<SavedInspection>, String> {
    let user = users::validate_session(&database, &token)?;
    let user_filter = if my_only || user.role == "inspector" { Some(user.id.as_str()) } else { None };
    storage::list_inspections(&database, user_filter, status.as_deref())
}

#[tauri::command]
fn cmd_get_inspection(database: State<Database>, token: String, inspection_id: String) -> Result<SavedInspection, String> {
    users::validate_session(&database, &token)?;
    storage::get_inspection(&database, &inspection_id)
}

#[tauri::command]
fn cmd_get_responses(database: State<Database>, token: String, inspection_id: String) -> Result<Vec<SavedResponse>, String> {
    users::validate_session(&database, &token)?;
    storage::get_responses(&database, &inspection_id)
}

#[tauri::command]
fn cmd_save_response(database: State<Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String,
    criterion_id: u32, conforme: Option<bool>, observation: String) -> Result<(), String> {
    let user = users::validate_session(&database, &token)?;
    storage::save_response(&database, &inspection_id, criterion_id, conforme, &observation, &user.id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "SAVE_RESPONSE", "response", &format!("{}:{}", inspection_id, criterion_id),
        &format!("{{\"conforme\":{},\"has_obs\":{}}}", conforme.map(|b|b.to_string()).unwrap_or("null".into()), !observation.is_empty()));
    Ok(())
}

#[tauri::command]
fn cmd_update_inspection_meta(database: State<Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String, req: CreateInspectionRequest) -> Result<(), String> {
    let user = users::validate_session(&database, &token)?;
    storage::update_inspection_meta(&database, &inspection_id, &req)?;
    audit_database.log_user_action(&user.id, &user.username,
        "UPDATE_META", "inspection", &inspection_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_set_inspection_status(database: State<Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String, status: String) -> Result<(), String> {
    let user = if status == "validated" {
        require_role(&database, &token, &["admin", "lead_inspector"])?
    } else {
        users::validate_session(&database, &token)?
    };
    storage::set_status(&database, &inspection_id, &status, Some(&user.id))?;
    audit_database.log_user_action(&user.id, &user.username,
        &format!("SET_STATUS_{}", status.to_uppercase()), "inspection", &inspection_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_delete_inspection(database: State<Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::delete_inspection(&database, &inspection_id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "DELETE_INSPECTION", "inspection", &inspection_id, "");
    Ok(())
}

// ════════════════════ AUDIT ════════════════════

#[tauri::command]
fn cmd_query_audit(database: State<Database>, audit_database: State<AuditDatabase>, token: String, filter: AuditDbFilter) -> Result<Vec<AuditDbEntry>, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.query_audit(&filter)
}

#[tauri::command]
fn cmd_count_audit(database: State<Database>, audit_database: State<AuditDatabase>, token: String, filter: AuditDbFilter) -> Result<i64, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.count_audit(&filter)
}

// ════════════════════ GRILLES ADMIN ════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateGridRequest {
    pub id: String,
    pub name: String,
    pub code: String,
    pub description: String,
    pub icon: String,
    pub color: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSectionRequest {
    pub grid_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateCriterionRequest {
    pub grid_id: String,
    pub section_id: u32,
    pub reference: String,
    pub description: String,
    pub pre_opening: bool,
}

// Liste les grilles avec versioning
#[tauri::command]
fn cmd_list_grids_admin(database: State<Database>, token: String) -> Result<Vec<GridSummary>, String> {
    require_role(&database, &token, &["admin"])?;
    Ok(grids_db::load_grids_from_db(&database).iter().map(|g| GridSummary {
        id: g.id.clone(), name: g.name.clone(), code: g.code.clone(),
        description: g.description.clone(), icon: g.icon.clone(), color: g.color.clone(),
        criteria_count: g.sections.iter().map(|s| s.items.len()).sum(),
        section_count: g.sections.len(),
    }).collect())
}

// Crée une nouvelle grille
#[tauri::command]
fn cmd_create_grid(database: State<Database>, audit_database: State<AuditDatabase>, token: String, req: CreateGridRequest) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;

    let grid = GridInfo {
        id: req.id.clone(),
        name: req.name,
        code: req.code,
        version: "1".to_string(),
        description: req.description,
        icon: req.icon,
        color: req.color,
        sections: vec![],
    };

    grids_db::save_grid(&database, &audit_database, &grid, &user)?;
    Ok(grid.id)
}

// Modifie les métadonnées d'une grille
#[tauri::command]
fn cmd_update_grid_meta(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, name: Option<String>, description: Option<String>, icon: Option<String>, color: Option<String>) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::update_grid_meta(&database, &audit_database, &grid_id, name, description, icon, color, &user)
}

// Archive une grille
#[tauri::command]
fn cmd_archive_grid(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::archive_grid(&database, &audit_database, &grid_id, &user)
}

// Ajoute une section à une grille
#[tauri::command]
fn cmd_create_section(database: State<Database>, audit_database: State<AuditDatabase>, token: String, req: CreateSectionRequest) -> Result<u32, String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    // Récupérer l'ID max
    let max_id: u32 = conn.query_row(
        "SELECT COALESCE(MAX(section_id), 0) FROM grid_sections WHERE grid_id = ?",
        [&req.grid_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let new_id = max_id + 1;

    let section = Section {
        id: new_id,
        title: req.title.clone(),
        items: vec![],
    };

    conn.execute(
        "INSERT INTO grid_sections (grid_id, grid_version, section_id, title, display_order)
         SELECT ?, version, ?, ?, ?
         FROM grids WHERE id = ? AND is_current = 1",
        rusqlite::params![req.grid_id, new_id, req.title, 0, req.grid_id],
    ).map_err(|e| format!("Insert error: {}", e))?;

    audit_database.log_grid_action(
        &user.id, &user.username, "ADD_SECTION", &req.grid_id,
        None, None, Some(&format!("Section '{}' ajoutée", req.title))
    );

    Ok(new_id)
}

// Modifie une section
#[tauri::command]
fn cmd_update_section(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, section_id: u32, title: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    conn.execute(
        "UPDATE grid_sections SET title = ? WHERE grid_id = ? AND section_id = ?",
        rusqlite::params![title, grid_id, section_id],
    ).map_err(|e| format!("Update error: {}", e))?;

    audit_database.log_grid_action(
        &user.id, &user.username, "UPDATE_SECTION", &grid_id,
        None, None, Some(&format!("Section {} modifiée", section_id))
    );

    Ok(())
}

// Supprime une section
#[tauri::command]
fn cmd_delete_section(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, section_id: u32) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    conn.execute(
        "DELETE FROM grid_sections WHERE grid_id = ? AND section_id = ?",
        rusqlite::params![grid_id, section_id],
    ).map_err(|e| format!("Delete error: {}", e))?;

    conn.execute(
        "DELETE FROM grid_criteria WHERE grid_id = ? AND section_id = ?",
        rusqlite::params![grid_id, section_id],
    ).ok();

    audit_database.log_grid_action(
        &user.id, &user.username, "DELETE_SECTION", &grid_id,
        None, None, Some(&format!("Section {} supprimée", section_id))
    );

    Ok(())
}

// Ajoute un critère
#[tauri::command]
fn cmd_create_criterion(database: State<Database>, audit_database: State<AuditDatabase>, token: String, req: CreateCriterionRequest) -> Result<u32, String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    // Récupérer l'ID max
    let max_id: u32 = conn.query_row(
        "SELECT COALESCE(MAX(criterion_id), 0) FROM grid_criteria WHERE grid_id = ?",
        [&req.grid_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let new_id = max_id + 1;

    conn.execute(
        "INSERT INTO grid_criteria (grid_id, grid_version, section_id, criterion_id, reference, description, pre_opening, display_order)
         SELECT ?, version, ?, ?, ?, ?, ?, 0
         FROM grids WHERE id = ? AND is_current = 1",
        rusqlite::params![
            req.grid_id, req.section_id, new_id, req.reference, req.description,
            if req.pre_opening { 1 } else { 0 }, req.grid_id
        ],
    ).map_err(|e| format!("Insert error: {}", e))?;

    audit_database.log_grid_action(
        &user.id, &user.username, "ADD_CRITERION", &req.grid_id,
        None, None, Some(&format!("Critère '{}' ajouté", req.reference))
    );

    Ok(new_id)
}

// Modifie un critère
#[tauri::command]
fn cmd_update_criterion(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, criterion_id: u32, reference: String, description: String, pre_opening: bool) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    conn.execute(
        "UPDATE grid_criteria SET reference = ?, description = ?, pre_opening = ?
         WHERE grid_id = ? AND criterion_id = ?",
        rusqlite::params![reference, description, if pre_opening { 1 } else { 0 }, grid_id, criterion_id],
    ).map_err(|e| format!("Update error: {}", e))?;

    audit_database.log_grid_action(
        &user.id, &user.username, "UPDATE_CRITERION", &grid_id,
        None, None, Some(&format!("Critère {} modifié", criterion_id))
    );

    Ok(())
}

// Supprime un critère
#[tauri::command]
fn cmd_delete_criterion(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, criterion_id: u32) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    conn.execute(
        "DELETE FROM grid_criteria WHERE grid_id = ? AND criterion_id = ?",
        rusqlite::params![grid_id, criterion_id],
    ).map_err(|e| format!("Delete error: {}", e))?;

    audit_database.log_grid_action(
        &user.id, &user.username, "DELETE_CRITERION", &grid_id,
        None, None, Some(&format!("Critère {} supprimé", criterion_id))
    );

    Ok(())
}

// Liste les versions d'une grille
#[tauri::command]
fn cmd_list_grid_versions(database: State<Database>, token: String, grid_id: String) -> Result<Vec<(String, String, String)>, String> {
    require_role(&database, &token, &["admin"])?;
    grids_db::list_versions(&database, &grid_id)
}

// Crée une nouvelle version
#[tauri::command]
fn cmd_create_grid_version(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, change_summary: String) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::create_version(&database, &audit_database, &grid_id, &change_summary, &user)
}

// Récupère le snapshot d'une version
#[tauri::command]
fn cmd_get_grid_version(database: State<Database>, token: String, grid_id: String, version: String) -> Result<GridInfo, String> {
    require_role(&database, &token, &["admin"])?;
    grids_db::get_version_snapshot(&database, &grid_id, &version)
}

// Rollback vers une version antérieure
#[tauri::command]
fn cmd_rollback_grid_version(database: State<Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, target_version: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::rollback_to_version(&database, &audit_database, &grid_id, &target_version, &user)
}

// Compare deux versions
#[tauri::command]
fn cmd_compare_grid_versions(database: State<Database>, token: String, grid_id: String, version1: String, version2: String) -> Result<grid_diff::DiffReport, String> {
    require_role(&database, &token, &["admin"])?;

    let grid1 = grids_db::get_version_snapshot(&database, &grid_id, &version1)?;
    let grid2 = grids_db::get_version_snapshot(&database, &grid_id, &version2)?;

    Ok(grid_diff::compare_grids(&grid1, &grid2))
}

// Export une grille en JSON
#[tauri::command]
fn cmd_export_grid_json(database: State<Database>, token: String, grid_id: String, version: Option<String>) -> Result<String, String> {
    require_role(&database, &token, &["admin"])?;
    grids_db::export_grid_json(&database, &grid_id, version.as_deref())
}

// Import une grille depuis JSON
#[tauri::command]
fn cmd_import_grid_json(database: State<Database>, audit_database: State<AuditDatabase>, token: String, json: String) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::import_grid_from_json(&database, &audit_database, &json, &user)
}

// Export audit trail en CSV
#[tauri::command]
fn cmd_export_audit_csv(audit_database: State<AuditDatabase>, token: String, database: State<Database>, filter: AuditDbFilter) -> Result<String, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.export_audit_csv(&filter)
}

// Export audit trail en JSON
#[tauri::command]
fn cmd_export_audit_json(audit_database: State<AuditDatabase>, token: String, database: State<Database>, filter: AuditDbFilter) -> Result<String, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.export_audit_json(&filter)
}

// ════════════════════ MAIN ════════════════════

fn main() {
    let app_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("abmed-inspections");

    // Créer les deux bases de données
    let database = Database::new(app_dir.clone());
    let audit_database = AuditDatabase::new(app_dir.clone());

    // Exécuter la migration si nécessaire
    if migration::should_migrate(&database) {
        println!("Migration des grilles hardcodées vers la base de données...");
        match migration::migrate_hardcoded_grids_to_db(&database, &audit_database) {
            Ok(count) => {
                println!("✓ {} grilles migrées avec succès", count);
                if let Err(e) = migration::verify_migration(&database) {
                    eprintln!("⚠ Erreur vérification migration: {}", e);
                } else {
                    println!("✓ Migration vérifiée avec succès");
                }
            }
            Err(e) => {
                eprintln!("✗ Erreur migration: {}", e);
                // Continue même si migration échoue
            }
        }
    }

    // Log démarrage
    audit_database.log_action(None, None, "APP_START", Some("system"), None, None);

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(database)
        .manage(audit_database)
        .invoke_handler(tauri::generate_handler![
            // Grilles (ancien)
            list_grids, get_grid, get_sections,
            // Grilles admin (nouveau)
            cmd_list_grids_admin, cmd_create_grid, cmd_update_grid_meta, cmd_archive_grid,
            cmd_create_section, cmd_update_section, cmd_delete_section,
            cmd_create_criterion, cmd_update_criterion, cmd_delete_criterion,
            cmd_list_grid_versions, cmd_create_grid_version, cmd_get_grid_version, cmd_rollback_grid_version,
            cmd_compare_grid_versions, cmd_export_grid_json, cmd_import_grid_json,
            // Auth
            cmd_login, cmd_logout, cmd_validate_session,
            // Utilisateurs
            cmd_list_users, cmd_create_user, cmd_update_user,
            cmd_change_password, cmd_delete_user,
            // Inspections
            cmd_create_inspection, cmd_list_inspections, cmd_get_inspection,
            cmd_get_responses, cmd_save_response, cmd_update_inspection_meta,
            cmd_set_inspection_status, cmd_delete_inspection,
            // Audit
            cmd_query_audit, cmd_count_audit, cmd_export_audit_csv, cmd_export_audit_json,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application");
}
