#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod grid;
mod grids;
mod db;
mod users;
mod storage;
mod audit_db;
mod migration;
mod grids_db;
mod grid_diff;
mod cloud_sync;
mod analytics;
mod pdf_report;
mod offline_mode;

use grid::{GridInfo, Section};
use db::Database;
use users::{CreateUserRequest, UpdateUserRequest, SessionInfo, User};
use audit_db::{AuditDatabase, AuditFilter as AuditDbFilter, AuditEntry as AuditDbEntry};
use storage::{SavedInspection, SavedResponse, CreateInspectionRequest,
    ReportSnapshot, PlanningEntry, CreatePlanningRequest, UpdatePlanningRequest,
    Indisponibilite, CreateIndispoRequest};
use serde::{Deserialize, Serialize};
use tauri::State;
use std::path::PathBuf;
use sha2::{Sha256, Digest};
use std::io::Write;

struct AppPath(PathBuf);

// ── Grid summary (pour la sélection) ──
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridSummary {
    pub id: String, pub name: String, pub code: String, pub description: String,
    pub icon: String, pub color: String, pub criteria_count: usize, pub section_count: usize,
}

// ════════════════════ GRILLES ════════════════════

#[tauri::command]
fn list_grids(database: State<'_, Database>, token: String) -> Result<Vec<GridSummary>, String> {
    let _user = users::validate_session(&database, &token)?;
    Ok(grids_db::load_grids_from_db(&database).iter().map(|g| GridSummary {
        id: g.id.clone(), name: g.name.clone(), code: g.code.clone(),
        description: g.description.clone(), icon: g.icon.clone(), color: g.color.clone(),
        criteria_count: g.sections.iter().map(|s| s.items.len()).sum(),
        section_count: g.sections.len(),
    }).collect())
}

#[tauri::command]
fn get_grid(database: State<'_, Database>, token: String, grid_id: String) -> Result<Option<GridInfo>, String> {
    let _user = users::validate_session(&database, &token)?;
    Ok(grids_db::find_grid_by_id(&database, &grid_id, None))
}

#[tauri::command]
fn get_sections(database: State<'_, Database>, token: String, grid_id: String) -> Result<Vec<Section>, String> {
    let _user = users::validate_session(&database, &token)?;
    Ok(grids_db::find_grid_by_id(&database, &grid_id, None)
        .map(|g| g.sections).unwrap_or_default())
}

// ════════════════════ AUTH ════════════════════

#[tauri::command]
fn cmd_login(database: State<'_, Database>, audit_database: State<AuditDatabase>, username: String, password: String) -> Result<SessionInfo, String> {
    let result = users::login(&database, &username, &password)?;
    audit_database.log_action(Some(&result.user.id), Some(&result.user.username),
        "LOGIN", Some("session"), Some(&result.token), None);
    Ok(result)
}

#[tauri::command]
fn cmd_logout(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String) -> Result<(), String> {
    // Utiliser validate_session_unchecked car logout est autorisé même si must_change_password
    if let Ok(user) = users::validate_session_unchecked(&database, &token) {
        audit_database.log_user_action(&user.id, &user.username,
            "LOGOUT", "session", &token, "");
    }
    users::logout(&database, &token)
}

#[tauri::command]
fn cmd_validate_session(database: State<'_, Database>, token: String) -> Result<User, String> {
    // Utiliser validate_session_unchecked pour permettre au frontend de voir must_change_password
    users::validate_session_unchecked(&database, &token)
}

// ════════════════════ UTILISATEURS ════════════════════

fn require_role(db: &Database, token: &str, roles: &[&str]) -> Result<User, String> {
    let user = users::validate_session(db, token)?;
    if roles.contains(&user.role.as_str()) { Ok(user) }
    else { Err(format!("Accès refusé. Rôle requis : {}", roles.join(" ou "))) }
}

fn sign_data(data: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data.as_bytes());
    hasher.update(b"ABMed-SECURE-SALT-2026"); // Sel statique pour l'intégrité
    format!("{:x}", hasher.finalize())
}

#[tauri::command]
fn cmd_list_users(database: State<'_, Database>, token: String) -> Result<Vec<User>, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    users::list_users(&database)
}

#[tauri::command]
fn cmd_create_user(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, req: CreateUserRequest) -> Result<User, String> {
    let admin = require_role(&database, &token, &["admin"])?;
    users::validate_input(&req.username, "Nom d'utilisateur", 3, 50)?;
    users::validate_input(&req.full_name, "Nom complet", 2, 100)?;
    users::validate_password(&req.password)?;
    // Validation du rôle
    users::validate_role(&req.role)?;
    let user = users::create_user(&database, &req)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "CREATE_USER", "user", &user.id,
        &format!("{{\"username\":\"{}\",\"role\":\"{}\"}}", user.username, user.role));
    Ok(user)
}

#[tauri::command]
fn cmd_update_user(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, user_id: String, req: UpdateUserRequest) -> Result<(), String> {
    let admin = require_role(&database, &token, &["admin"])?;
    // Validation du rôle si fourni
    if let Some(ref role) = req.role {
        users::validate_role(role)?;
    }
    users::update_user(&database, &user_id, &req)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "UPDATE_USER", "user", &user_id,
        &serde_json::to_string(&req).unwrap_or_default());
    Ok(())
}

#[tauri::command]
fn cmd_change_password(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, user_id: String, new_password: String) -> Result<(), String> {
    let admin = require_role(&database, &token, &["admin"])?;
    users::validate_password(&new_password)?;
    users::change_password(&database, &user_id, &new_password)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "CHANGE_PASSWORD", "user", &user_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_change_own_password(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, current_password: String, new_password: String) -> Result<(), String> {
    // Utiliser validate_session_unchecked car changement de mot de passe est autorisé même si must_change_password
    let user = users::validate_session_unchecked(&database, &token)?;
    users::validate_password(&new_password)?;
    // Vérifier le mot de passe actuel
    users::login(&database, &user.username, &current_password)?;
    users::change_password(&database, &user.id, &new_password)?;
    users::clear_must_change_password(&database, &user.id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "CHANGE_OWN_PASSWORD", "user", &user.id, "");
    Ok(())
}

#[tauri::command]
fn cmd_delete_user(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, user_id: String) -> Result<(), String> {
    let admin = require_role(&database, &token, &["admin"])?;
    users::delete_user(&database, &user_id)?;
    audit_database.log_user_action(&admin.id, &admin.username,
        "DEACTIVATE_USER", "user", &user_id, "");
    Ok(())
}

// ════════════════════ INSPECTIONS PERSISTANTES ════════════════════

#[tauri::command]
fn cmd_create_inspection(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, req: CreateInspectionRequest) -> Result<String, String> {
    let user = users::validate_session(&database, &token)?;
    let id = storage::create_inspection(&database, &req, &user.id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "CREATE_INSPECTION", "inspection", &id,
        &format!("{{\"grid\":\"{}\",\"establishment\":\"{}\"}}", req.grid_id, req.establishment));
    Ok(id)
}

#[tauri::command]
fn cmd_list_inspections(database: State<'_, Database>, token: String, my_only: bool, status: Option<String>) -> Result<Vec<SavedInspection>, String> {
    let user = users::validate_session(&database, &token)?;
    let user_filter = if my_only || user.role == "inspector" { Some(user.id.as_str()) } else { None };
    storage::list_inspections(&database, user_filter, status.as_deref())
}

#[tauri::command]
fn cmd_get_inspection(database: State<'_, Database>, token: String, inspection_id: String) -> Result<SavedInspection, String> {
    users::validate_session(&database, &token)?;
    storage::get_inspection(&database, &inspection_id)
}

#[tauri::command]
fn cmd_get_responses(database: State<'_, Database>, token: String, inspection_id: String) -> Result<Vec<SavedResponse>, String> {
    users::validate_session(&database, &token)?;
    storage::get_responses(&database, &inspection_id)
}

#[tauri::command]
fn cmd_save_response(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String,
    criterion_id: u32, conforme: Option<bool>, observation: String,
    severity: Option<String>, factor: Option<String>,
    factor_justification: Option<String>, immediate_danger: Option<bool>) -> Result<(), String> {
    let user = users::validate_session(&database, &token)?;
    storage::save_response(&database, &inspection_id, criterion_id, conforme, &observation, &user.id,
        severity.as_deref(), factor.as_deref(),
        factor_justification.as_deref(), immediate_danger.unwrap_or(false))?;
    audit_database.log_user_action(&user.id, &user.username,
        "SAVE_RESPONSE", "response", &format!("{}:{}", inspection_id, criterion_id),
        &format!("{{\"conforme\":{},\"has_obs\":{}}}", conforme.map(|b|b.to_string()).unwrap_or("null".into()), !observation.is_empty()));
    Ok(())
}

#[tauri::command]
fn cmd_update_inspection_meta(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String, req: CreateInspectionRequest) -> Result<(), String> {
    let user = users::validate_session(&database, &token)?;
    storage::update_inspection_meta(&database, &inspection_id, &req)?;
    audit_database.log_user_action(&user.id, &user.username,
        "UPDATE_META", "inspection", &inspection_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_set_inspection_status(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String, status: String) -> Result<(), String> {
    let user = if status == "validated" {
        require_role(&database, &token, &["admin", "lead_inspector"])?
    } else {
        users::validate_session(&database, &token)?
    };

    // Creer un snapshot automatique avant le changement de statut (completed/validated)
    if status == "completed" || status == "validated" {
        let responses = storage::get_responses(&database, &inspection_id).unwrap_or_default();
        let resps_map: std::collections::HashMap<String, serde_json::Value> = responses.iter().map(|r| {
            (r.criterion_id.to_string(), serde_json::json!({
                "conforme": r.conforme,
                "observation": r.observation,
                "severity": r.severity,
                "factor": r.factor,
                "factor_justification": r.factor_justification,
                "immediate_danger": r.immediate_danger
            }))
        }).collect();
        let resps_json = serde_json::to_string(&resps_map).unwrap_or_default();
        storage::create_report_snapshot(&database, &inspection_id, &status, &resps_json, "{}", Some(&user.id), Some(&user.full_name)).ok();
    }

    storage::set_status(&database, &inspection_id, &status, Some(&user.id))?;
    audit_database.log_user_action(&user.id, &user.username,
        &format!("SET_STATUS_{}", status.to_uppercase()), "inspection", &inspection_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_delete_inspection(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::delete_inspection(&database, &inspection_id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "DELETE_INSPECTION", "inspection", &inspection_id, "");
    Ok(())
}

// ════════════════════ AUDIT ════════════════════

#[tauri::command]
fn cmd_query_audit(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, filter: AuditDbFilter) -> Result<Vec<AuditDbEntry>, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.query_audit(&filter)
}

#[tauri::command]
fn cmd_count_audit(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, filter: AuditDbFilter) -> Result<i64, String> {
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
fn cmd_list_grids_admin(database: State<'_, Database>, token: String) -> Result<Vec<GridSummary>, String> {
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
fn cmd_create_grid(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, req: CreateGridRequest) -> Result<String, String> {
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
fn cmd_update_grid_meta(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, name: Option<String>, description: Option<String>, icon: Option<String>, color: Option<String>) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::update_grid_meta(&database, &audit_database, &grid_id, name, description, icon, color, &user)
}

// Archive une grille
#[tauri::command]
fn cmd_archive_grid(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::archive_grid(&database, &audit_database, &grid_id, &user)
}

// Duplique une grille existante
#[tauri::command]
fn cmd_duplicate_grid(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, new_id: String, new_name: String) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;
    let source = grids_db::find_grid_by_id(&database, &grid_id, None)
        .ok_or_else(|| format!("Grille '{}' introuvable", grid_id))?;

    let duplicated = GridInfo {
        id: new_id.clone(),
        name: new_name,
        code: format!("{}-copie", source.code),
        version: "1".to_string(),
        description: source.description.clone(),
        icon: source.icon.clone(),
        color: source.color.clone(),
        sections: source.sections.clone(),
    };

    grids_db::save_grid(&database, &audit_database, &duplicated, &user)?;
    audit_database.log_grid_action(
        &user.id, &user.username, "DUPLICATE_GRID", &new_id,
        None, None, Some(&format!("Dupliquée depuis '{}'", grid_id)),
    );
    Ok(new_id)
}

// Ajoute une section à une grille
#[tauri::command]
fn cmd_create_section(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, req: CreateSectionRequest) -> Result<u32, String> {
    let user = require_role(&database, &token, &["admin"])?;

    let conn = database.conn.lock().map_err(|e| format!("DB error: {}", e))?;

    // Récupérer l'ID max
    let max_id: u32 = conn.query_row(
        "SELECT COALESCE(MAX(section_id), 0) FROM grid_sections WHERE grid_id = ?",
        [&req.grid_id],
        |row| row.get(0),
    ).unwrap_or(0);

    let new_id = max_id + 1;

    let _section = Section {
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
fn cmd_update_section(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, section_id: u32, title: String) -> Result<(), String> {
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
fn cmd_delete_section(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, section_id: u32) -> Result<(), String> {
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
fn cmd_create_criterion(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, req: CreateCriterionRequest) -> Result<u32, String> {
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
fn cmd_update_criterion(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, criterion_id: u32, reference: String, description: String, pre_opening: bool) -> Result<(), String> {
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
fn cmd_delete_criterion(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, criterion_id: u32) -> Result<(), String> {
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
fn cmd_list_grid_versions(database: State<'_, Database>, token: String, grid_id: String) -> Result<Vec<(String, String, String)>, String> {
    require_role(&database, &token, &["admin"])?;
    grids_db::list_versions(&database, &grid_id)
}

// Crée une nouvelle version
#[tauri::command]
fn cmd_create_grid_version(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, change_summary: String) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::create_version(&database, &audit_database, &grid_id, &change_summary, &user)
}

// Récupère le snapshot d'une version
#[tauri::command]
fn cmd_get_grid_version(database: State<'_, Database>, token: String, grid_id: String, version: String) -> Result<GridInfo, String> {
    require_role(&database, &token, &["admin"])?;
    grids_db::get_version_snapshot(&database, &grid_id, &version)
}

// Rollback vers une version antérieure
#[tauri::command]
fn cmd_rollback_grid_version(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, grid_id: String, target_version: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::rollback_to_version(&database, &audit_database, &grid_id, &target_version, &user)
}

// Compare deux versions
#[tauri::command]
fn cmd_compare_grid_versions(database: State<'_, Database>, token: String, grid_id: String, version1: String, version2: String) -> Result<grid_diff::DiffReport, String> {
    require_role(&database, &token, &["admin"])?;

    let grid1 = grids_db::get_version_snapshot(&database, &grid_id, &version1)?;
    let grid2 = grids_db::get_version_snapshot(&database, &grid_id, &version2)?;

    Ok(grid_diff::compare_grids(&grid1, &grid2))
}

// Export une grille en JSON
#[tauri::command]
fn cmd_export_grid_json(database: State<'_, Database>, token: String, grid_id: String, version: Option<String>) -> Result<String, String> {
    require_role(&database, &token, &["admin"])?;
    grids_db::export_grid_json(&database, &grid_id, version.as_deref())
}

// Import une grille depuis JSON
#[tauri::command]
fn cmd_import_grid_json(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, json: String) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;
    grids_db::import_grid_from_json(&database, &audit_database, &json, &user)
}

// Export audit trail en CSV
#[tauri::command]
fn cmd_export_audit_csv(audit_database: State<AuditDatabase>, token: String, database: State<'_, Database>, filter: AuditDbFilter) -> Result<String, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.export_audit_csv(&filter)
}

// Export audit trail en JSON
#[tauri::command]
fn cmd_export_audit_json(audit_database: State<AuditDatabase>, token: String, database: State<'_, Database>, filter: AuditDbFilter) -> Result<String, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    audit_database.export_audit_json(&filter)
}

// ════════════════════ REPORT SNAPSHOTS ════════════════════

#[tauri::command]
fn cmd_list_report_snapshots(database: State<'_, Database>, token: String, inspection_id: String) -> Result<Vec<ReportSnapshot>, String> {
    users::validate_session(&database, &token)?;
    storage::list_report_snapshots(&database, &inspection_id)
}

#[tauri::command]
fn cmd_get_report_snapshot(database: State<'_, Database>, token: String, snapshot_id: String) -> Result<Option<ReportSnapshot>, String> {
    users::validate_session(&database, &token)?;
    storage::get_report_snapshot(&database, &snapshot_id)
}

#[tauri::command]
fn cmd_create_manual_snapshot(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, inspection_id: String, responses: serde_json::Value, meta: serde_json::Value) -> Result<u32, String> {
    let user = users::validate_session(&database, &token)?;
    let resps_json = serde_json::to_string(&responses).unwrap_or_default();
    let meta_json = serde_json::to_string(&meta).unwrap_or_default();
    let version = storage::create_report_snapshot(&database, &inspection_id, "manual", &resps_json, &meta_json, Some(&user.id), Some(&user.full_name))?;
    audit_database.log_user_action(&user.id, &user.username,
        "CREATE_MANUAL_SNAPSHOT", "inspection", &inspection_id, &format!("v{}", version));
    Ok(version)
}

// ════════════════════ PLANNING ════════════════════

#[tauri::command]
fn cmd_list_planning(database: State<'_, Database>, token: String) -> Result<Vec<PlanningEntry>, String> {
    users::validate_session(&database, &token)?;
    storage::list_planning(&database)
}

#[tauri::command]
fn cmd_create_planning(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, req: CreatePlanningRequest) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin", "lead_inspector"])?;
    let id = storage::create_planning(&database, &req, &user.id, &user.full_name)?;
    audit_database.log_user_action(&user.id, &user.username,
        "CREATE_PLANNING", "planning", &id, &req.establishment);
    Ok(id)
}

#[tauri::command]
fn cmd_update_planning(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, planning_id: String, req: UpdatePlanningRequest) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::update_planning(&database, &planning_id, &req)?;
    audit_database.log_user_action(&user.id, &user.username,
        "UPDATE_PLANNING", "planning", &planning_id, "");
    Ok(())
}

#[tauri::command]
fn cmd_delete_planning(database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, planning_id: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::delete_planning(&database, &planning_id)?;
    audit_database.log_user_action(&user.id, &user.username,
        "DELETE_PLANNING", "planning", &planning_id, "");
    Ok(())
}

// ════════════════════ INDISPONIBILITES ════════════════════

#[tauri::command]
fn cmd_list_indisponibilites(database: State<'_, Database>, token: String) -> Result<Vec<Indisponibilite>, String> {
    users::validate_session(&database, &token)?;
    storage::list_indisponibilites(&database)
}

#[tauri::command]
fn cmd_create_indisponibilite(database: State<'_, Database>, token: String, req: CreateIndispoRequest) -> Result<String, String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::create_indisponibilite(&database, &req)
}

#[tauri::command]
fn cmd_delete_indisponibilite(database: State<'_, Database>, token: String, indisponibilite_id: String) -> Result<(), String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::delete_indisponibilite(&database, &indisponibilite_id)
}

// ════════════════════ SETTINGS ════════════════════

#[tauri::command]
fn cmd_get_settings(database: State<'_, Database>, token: String) -> Result<std::collections::HashMap<String, serde_json::Value>, String> {
    users::validate_session(&database, &token)?;
    storage::get_settings(&database)
}

#[tauri::command]
fn cmd_save_settings(database: State<'_, Database>, token: String, settings: std::collections::HashMap<String, serde_json::Value>) -> Result<(), String> {
    require_role(&database, &token, &["admin", "lead_inspector"])?;
    storage::save_settings(&database, &settings)
}

// ════════════════════ MAINTENANCE / BACKUP ════════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupInfo {
    pub name: String,
    pub backup_type: String,  // "manual" | "auto" | "pre_migration" | "pre_restore"
    pub created_at: String,
    pub size_bytes: u64,
    pub has_audit: bool,
}

fn cleanup_old_backups(dir: &std::path::Path, max: usize) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "db").unwrap_or(false))
            .filter(|e| e.file_name().to_string_lossy().starts_with("inspections_"))
            .collect();
        files.sort_by_key(|e| e.file_name());
        while files.len() > max {
            let old = files.remove(0);
            let _ = std::fs::remove_file(old.path());
            // Supprimer aussi le fichier audit associé
            let audit = old.path().with_file_name(
                old.file_name().to_string_lossy().replace("inspections_", "audit_")
            );
            let _ = std::fs::remove_file(audit);
        }
    }
}

#[tauri::command]
fn cmd_backup_db(app_path: State<AppPath>, database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String) -> Result<String, String> {
    let user = require_role(&database, &token, &["admin"])?;
    let backup_dir = app_path.0.join("backups");
    std::fs::create_dir_all(&backup_dir).map_err(|e| e.to_string())?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let insp_bak = backup_dir.join(format!("inspections_{}.db", timestamp));
    let audit_bak = backup_dir.join(format!("audit_{}.db", timestamp));
    database.backup(&insp_bak)?;
    audit_database.backup(&audit_bak)?;
    audit_database.log_user_action(&user.id, &user.username,
        "BACKUP_DB", "system", &timestamp, "Sauvegarde manuelle");
    Ok(format!("inspections_{}.db", timestamp))
}

#[tauri::command]
fn cmd_list_backups(app_path: State<AppPath>, database: State<'_, Database>, token: String) -> Result<Vec<BackupInfo>, String> {
    require_role(&database, &token, &["admin"])?;
    let backup_dir = app_path.0.join("backups");
    let auto_dir   = backup_dir.join("auto");
    let mut results: Vec<BackupInfo> = Vec::new();

    let scan = |dir: &std::path::Path, btype: &str, list: &mut Vec<BackupInfo>| {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("inspections_") || !name.ends_with(".db") { continue; }
                let size = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
                let audit_name = name.replace("inspections_", "audit_");
                let has_audit  = dir.join(&audit_name).exists();
                // Date depuis le nom : inspections_20260314_143022.db
                let created_at = name
                    .trim_start_matches("inspections_")
                    .trim_end_matches(".db")
                    .to_string();
                let backup_type = if btype == "auto" { "auto" }
                    else if name.contains("pre_mig") { "pre_migration" }
                    else if name.contains("pre_restore") { "pre_restore" }
                    else { "manual" }.to_string();
                list.push(BackupInfo { name, backup_type, created_at, size_bytes: size, has_audit });
            }
        }
    };

    scan(&backup_dir, "manual", &mut results);
    scan(&auto_dir, "auto", &mut results);
    results.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(results)
}

#[tauri::command]
fn cmd_restore_db(app_path: State<AppPath>, database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, backup_name: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    let backup_dir = app_path.0.join("backups");
    let auto_dir   = backup_dir.join("auto");

    // Trouver le fichier dans manual ou auto
    let insp_src = [backup_dir.join(&backup_name), auto_dir.join(&backup_name)]
        .into_iter().find(|p| p.exists())
        .ok_or_else(|| format!("Fichier de sauvegarde '{}' introuvable", backup_name))?;

    // Backup de sécurité avant restauration (via VACUUM INTO = safe sur connexion ouverte)
    let pre_ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let _ = std::fs::create_dir_all(&backup_dir);
    database.backup(&backup_dir.join(format!("inspections_pre_restore_{}.db", pre_ts))).ok();
    audit_database.backup(&backup_dir.join(format!("audit_pre_restore_{}.db", pre_ts))).ok();

    // ── Restauration inspections via l'API backup SQLite (safe sur connexion ouverte) ──
    {
        let src_conn = rusqlite::Connection::open_with_flags(
            &insp_src,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
        ).map_err(|e| format!("Impossible d'ouvrir la sauvegarde : {}", e))?;

        let mut dst_conn = database.conn.lock().map_err(|e| e.to_string())?;

        let mut backup = rusqlite::backup::Backup::new(&src_conn, &mut *dst_conn)
            .map_err(|e| format!("Erreur init restauration : {}", e))?;
        backup.run_to_completion(256, std::time::Duration::from_millis(100), None)
            .map_err(|e| format!("Erreur restauration inspections : {}", e))?;
    }

    // ── Restauration audit (même méthode) ──
    let audit_name = backup_name.replace("inspections_", "audit_");
    let audit_src  = [backup_dir.join(&audit_name), auto_dir.join(&audit_name)]
        .into_iter().find(|p| p.exists());

    if let Some(src) = audit_src {
        let src_conn = rusqlite::Connection::open_with_flags(
            &src,
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
        ).map_err(|e| format!("Impossible d'ouvrir l'audit de sauvegarde : {}", e))?;

        let mut dst_conn = audit_database.conn.lock().map_err(|e| e.to_string())?;
        let mut backup = rusqlite::backup::Backup::new(&src_conn, &mut *dst_conn)
            .map_err(|e| format!("Erreur init restauration audit : {}", e))?;
        backup.run_to_completion(256, std::time::Duration::from_millis(100), None)
            .map_err(|e| format!("Erreur restauration audit : {}", e))?;
    }

    audit_database.log_user_action(&user.id, &user.username,
        "RESTORE_DB", "system", &backup_name,
        &format!("Restauré depuis '{}'. Backup sécurité : pre_restore_{}", backup_name, pre_ts));
    Ok(())
}

#[tauri::command]
fn cmd_delete_backup(app_path: State<AppPath>, database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, backup_name: String) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    let backup_dir = app_path.0.join("backups");
    let auto_dir   = backup_dir.join("auto");

    let insp_path = [backup_dir.join(&backup_name), auto_dir.join(&backup_name)]
        .into_iter().find(|p| p.exists())
        .ok_or_else(|| format!("Backup '{}' introuvable", backup_name))?;

    std::fs::remove_file(&insp_path).map_err(|e| format!("Erreur suppression : {}", e))?;
    // Supprimer aussi le fichier audit associé
    let audit_name = backup_name.replace("inspections_", "audit_");
    let audit_path = insp_path.with_file_name(&audit_name);
    let _ = std::fs::remove_file(audit_path);

    audit_database.log_user_action(&user.id, &user.username,
        "DELETE_BACKUP", "system", &backup_name, "Suppression manuelle");
    Ok(())
}

#[tauri::command]
fn cmd_configure_backup(app_path: State<AppPath>, database: State<'_, Database>, audit_database: State<AuditDatabase>, token: String, interval_hours: u64, max_auto_backups: usize) -> Result<(), String> {
    let user = require_role(&database, &token, &["admin"])?;
    if interval_hours < 1 || interval_hours > 168 {
        return Err("L'intervalle doit être entre 1 et 168 heures".to_string());
    }
    if max_auto_backups < 1 || max_auto_backups > 100 {
        return Err("Le nombre max de backups doit être entre 1 et 100".to_string());
    }
    let mut settings = storage::get_settings(&database)?;
    settings.insert("backup_interval_hours".to_string(),
        serde_json::Value::Number(interval_hours.into()));
    settings.insert("max_auto_backups".to_string(),
        serde_json::Value::Number(max_auto_backups.into()));
    storage::save_settings(&database, &settings)?;
    audit_database.log_user_action(&user.id, &user.username,
        "CONFIGURE_BACKUP", "system", "backup",
        &format!("interval={}h max_auto={}", interval_hours, max_auto_backups));
    Ok(())
}

// ════════════════════ CLOUD SYNC ════════════════════

#[tauri::command]
async fn cmd_check_connectivity(database: State<'_, Database>, cloud_sync_service: State<'_, cloud_sync::CloudSyncService>, token: String) -> Result<bool, String> {
    users::validate_session(&database, &token)?;
    Ok(cloud_sync_service.check_connectivity().await)
}

#[tauri::command]
async fn cmd_sync_to_cloud(database: State<'_, Database>, cloud_sync_service: State<'_, cloud_sync::CloudSyncService>, token: String) -> Result<(), String> {
    users::validate_session(&database, &token)?;
    cloud_sync_service.sync_to_cloud().await
}

#[tauri::command]
fn cmd_get_sync_status(database: State<'_, Database>, cloud_sync_service: State<'_, cloud_sync::CloudSyncService>, token: String) -> Result<cloud_sync::SyncStatus, String> {
    users::validate_session(&database, &token)?;
    Ok(cloud_sync_service.get_status())
}

// ════════════════════ OFFLINE MODE ════════════════════

#[tauri::command]
fn cmd_get_offline_state(database: State<'_, Database>, offline_manager: State<'_, offline_mode::OfflineManager>, token: String) -> Result<offline_mode::OfflineState, String> {
    users::validate_session(&database, &token)?;
    Ok(offline_manager.get_state())
}

#[tauri::command]
fn cmd_check_connectivity_status(database: State<'_, Database>, offline_manager: State<'_, offline_mode::OfflineManager>, token: String) -> Result<offline_mode::ConnectivityStatus, String> {
    users::validate_session(&database, &token)?;
    Ok(offline_manager.check_connectivity())
}

// ════════════════════ PDF REPORT ════════════════════

#[tauri::command]
fn cmd_generate_pdf_report(database: State<'_, Database>, token: String, inspection_id: String, output_path: Option<String>) -> Result<String, String> {
    users::validate_session(&database, &token)?;
    // Retrieve inspection data and responses
    let inspection = storage::get_inspection(&database, &inspection_id)?;
    let responses = storage::get_responses(&database, &inspection_id)?;
    // Build InspectionData struct for pdf_report (simplified)
    // Lire extra_meta directement depuis la DB (SavedInspection ne l'expose pas)
    let extra: serde_json::Value = {
        let conn = database.conn.lock().map_err(|e| e.to_string())?;
        let raw: Option<String> = conn.query_row(
            "SELECT extra_meta FROM inspections WHERE id = ?1",
            rusqlite::params![&inspection_id],
            |row| row.get(0),
        ).unwrap_or(None);
        raw.as_deref()
            .and_then(|s| serde_json::from_str(s).ok())
            .unwrap_or_else(|| serde_json::Value::Object(serde_json::Map::new()))
    };

    let department = extra["departement"].as_str().unwrap_or("").to_string();
    let commune    = extra["commune"].as_str().unwrap_or("").to_string();
    let lead_insp: String = extra["lead_inspector"].as_str()
        .map(|s| s.to_string())
        .or_else(|| inspection.inspectors.get(0).cloned())
        .unwrap_or_default();

    let data = pdf_report::InspectionData {
        inspection_id: inspection.id.clone(),
        establishment_name: inspection.establishment,
        establishment_type: inspection.inspection_type,
        inspection_date: inspection.date_inspection,
        inspector_name: lead_insp,
        department,
        commune,
        conformity_rate: calculate_conformity_rate(&responses),
        critical_findings: responses.iter().filter(|r| r.severity.as_deref() == Some("critique") && r.conforme == Some(false)).count() as u32,
        major_findings: responses.iter().filter(|r| r.severity.as_deref() == Some("majeur") && r.conforme == Some(false)).count() as u32,
        minor_findings: responses.iter().filter(|r| r.severity.as_deref() == Some("mineur") && r.conforme == Some(false)).count() as u32,
        sections: vec![],
        metadata: std::collections::HashMap::new(),
    };
    let generator = pdf_report::PdfReportGenerator::new(None);
    let path = output_path.unwrap_or_else(|| format!("./{}.pdf", inspection_id));
    generator.generate_inspection_report(&data, &path).map_err(|e| e.to_string())?;
    Ok(format!("PDF généré: {}", path))
}

fn calculate_conformity_rate(responses: &[storage::SavedResponse]) -> f64 {
    if responses.is_empty() { return 0.0; }
    let conforming = responses.iter().filter(|r| r.conforme == Some(true)).count();
    let total_evaluated = responses.iter().filter(|r| r.conforme.is_some()).count();
    if total_evaluated > 0 { conforming as f64 / total_evaluated as f64 } else { 0.0 }
}

// ════════════════════ ANALYTICS ════════════════════

#[tauri::command]
fn cmd_get_analytics_report(database: State<'_, Database>, token: String, filter: analytics::AnalyticsFilter) -> Result<analytics::AnalyticsReport, String> {
    users::validate_session(&database, &token)?;
    let service = analytics::AnalyticsService::new();
    Ok(service.generate_report(filter))
}

#[tauri::command]
fn cmd_export_analytics_csv(database: State<'_, Database>, token: String, filter: analytics::AnalyticsFilter) -> Result<String, String> {
    users::validate_session(&database, &token)?;
    let service = analytics::AnalyticsService::new();
    let report = service.generate_report(filter);
    Ok(service.export_to_csv(&report))
}

// ════════════════════ MAIN ════════════════════

fn main() {
    // Migration du chemin de données
    let old_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("abmed-inspections");
    let app_dir = dirs_next::data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("inspections-pharma");
    if old_dir.join("inspections.db").exists() && !app_dir.join("inspections.db").exists() {
        std::fs::create_dir_all(&app_dir).ok();
        std::fs::copy(old_dir.join("inspections.db"), app_dir.join("inspections.db")).ok();
        std::fs::copy(old_dir.join("audit.db"), app_dir.join("audit.db")).ok();
        eprintln!("Migration: données copiées de abmed-inspections vers inspections-pharma");
    }

    // Créer les deux bases de données
    let database = Database::new(app_dir.clone());
    let audit_database = AuditDatabase::new(app_dir.clone());
    let cloud_sync_service = cloud_sync::CloudSyncService::new(cloud_sync::CloudSyncConfig {
        api_url: "".to_string(),
        api_key: "".to_string(),
        enabled: false,
        auto_sync: false,
        sync_interval_secs: 300,
    });
    let offline_manager = offline_mode::OfflineManager::new(None);

    // Exécuter la migration si nécessaire
    if migration::should_migrate(&database) {
        // Sauvegarde de sécurité avant migration
        let pre_timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
        let backup_dir = app_dir.join("backups");
        let _ = std::fs::create_dir_all(&backup_dir);
        let _ = database.backup(&backup_dir.join(format!("inspections_pre_mig_{}.db", pre_timestamp)));
        let _ = audit_database.backup(&backup_dir.join(format!("audit_pre_mig_{}.db", pre_timestamp)));

        // Exporter en JSON signé avant migration
        if let Ok(json_data) = database.export_to_json() {
            let signature = sign_data(&json_data);
            let json_path = backup_dir.join(format!("inspections_pre_mig_{}.json", pre_timestamp));
            if let Ok(mut file) = std::fs::File::create(&json_path) {
                let _ = writeln!(file, "{}", json_data);
                let _ = writeln!(file, "// SIGNATURE: {}", signature);
            }
        }

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

    // Tâche de sauvegarde périodique (intervalle configurable, défaut 4h)
    let db_clone       = database.clone();
    let audit_db_clone = audit_database.clone();
    let app_dir_clone  = app_dir.clone();
    let db_for_cfg     = database.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            // Lire l'intervalle depuis les settings (défaut 4h)
            let interval_hours: u64 = storage::get_settings(&db_for_cfg)
                .ok()
                .and_then(|s| s.get("backup_interval_hours").and_then(|v| v.as_u64()))
                .unwrap_or(4);
            let max_auto: usize = storage::get_settings(&db_for_cfg)
                .ok()
                .and_then(|s| s.get("max_auto_backups").and_then(|v| v.as_u64()))
                .unwrap_or(10) as usize;

            tokio::time::sleep(std::time::Duration::from_secs(3600 * interval_hours)).await;

            let ts = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
            let auto_backup_dir = app_dir_clone.join("backups").join("auto");
            let _ = std::fs::create_dir_all(&auto_backup_dir);

            let _ = db_clone.backup(&auto_backup_dir.join(format!("inspections_{}.db", ts)));
            let _ = audit_db_clone.backup(&auto_backup_dir.join(format!("audit_{}.db", ts)));

            // Rétention : garder seulement les N derniers backups auto
            cleanup_old_backups(&auto_backup_dir, max_auto);

            audit_db_clone.log_action(None, None, "AUTO_BACKUP", Some("system"), None,
                Some(&format!("Sauvegarde auto réalisée à {} (rétention: {} max)", ts, max_auto)));
        }
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(AppPath(app_dir.clone()))
        .manage(database)
        .manage(audit_database)
        .manage(cloud_sync_service)
        .manage(offline_manager)
        .invoke_handler(tauri::generate_handler![
            // Grilles (ancien)
            list_grids, get_grid, get_sections,
            // Grilles admin (nouveau)
            cmd_list_grids_admin, cmd_create_grid, cmd_update_grid_meta, cmd_archive_grid, cmd_duplicate_grid,
            cmd_create_section, cmd_update_section, cmd_delete_section,
            cmd_create_criterion, cmd_update_criterion, cmd_delete_criterion,
            cmd_list_grid_versions, cmd_create_grid_version, cmd_get_grid_version, cmd_rollback_grid_version,
            cmd_compare_grid_versions, cmd_export_grid_json, cmd_import_grid_json,
            // Auth
            cmd_login, cmd_logout, cmd_validate_session,
            // Utilisateurs
            cmd_list_users, cmd_create_user, cmd_update_user,
            cmd_change_password, cmd_change_own_password, cmd_delete_user,
            // Inspections
            cmd_create_inspection, cmd_list_inspections, cmd_get_inspection,
            cmd_get_responses, cmd_save_response, cmd_update_inspection_meta,
            cmd_set_inspection_status, cmd_delete_inspection,
            // Audit
            cmd_query_audit, cmd_count_audit, cmd_export_audit_csv, cmd_export_audit_json,
            // Report snapshots
            cmd_list_report_snapshots, cmd_get_report_snapshot, cmd_create_manual_snapshot,
            // Planning
            cmd_list_planning, cmd_create_planning, cmd_update_planning, cmd_delete_planning,
            // Indisponibilites
            cmd_list_indisponibilites, cmd_create_indisponibilite, cmd_delete_indisponibilite,
            // Settings
            cmd_get_settings, cmd_save_settings,
            // Maintenance / Backup
            cmd_backup_db, cmd_list_backups, cmd_restore_db, cmd_delete_backup, cmd_configure_backup,
            // Cloud Sync
            cmd_check_connectivity, cmd_sync_to_cloud, cmd_get_sync_status,
            // Offline Mode
            cmd_get_offline_state, cmd_check_connectivity_status,
            // PDF Report
            cmd_generate_pdf_report,
            // Analytics
            cmd_get_analytics_report, cmd_export_analytics_csv,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur lors du lancement de l'application");
}
