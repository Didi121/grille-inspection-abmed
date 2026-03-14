use rusqlite::params;
use serde::{Deserialize, Serialize};
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedInspection {
    pub id: String,
    pub grid_id: String,
    pub status: String,
    pub date_inspection: String,
    pub establishment: String,
    pub inspection_type: String,
    pub inspectors: Vec<String>,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub validated_by: Option<String>,
    pub validated_by_name: Option<String>,
    pub validated_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub progress: InspectionProgress,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectionProgress {
    pub total: u32,
    pub answered: u32,
    pub conforme: u32,
    pub non_conforme: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedResponse {
    pub criterion_id: u32,
    pub conforme: Option<bool>,
    pub observation: String,
    pub updated_by: Option<String>,
    pub updated_at: String,
    pub severity: Option<String>,
    pub factor: Option<String>,
    pub factor_justification: Option<String>,
    pub immediate_danger: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateInspectionRequest {
    pub grid_id: String,
    pub date_inspection: String,
    pub establishment: String,
    pub inspection_type: String,
    pub inspectors: Vec<String>,
}

// ── Créer ──

pub fn create_inspection(db: &Database, req: &CreateInspectionRequest, user_id: &str) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let inspectors_json = serde_json::to_string(&req.inspectors).unwrap_or_default();

    conn.execute(
        "INSERT INTO inspections (id, grid_id, status, date_inspection, establishment, inspection_type, inspectors, created_by)
         VALUES (?1,?2,'draft',?3,?4,?5,?6,?7)",
        params![id, req.grid_id, req.date_inspection, req.establishment, req.inspection_type, inspectors_json, user_id],
    ).map_err(|e| format!("Erreur création inspection : {}", e))?;

    Ok(id)
}

// ── Lister ──

pub fn list_inspections(db: &Database, user_id: Option<&str>, status: Option<&str>) -> Result<Vec<SavedInspection>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    let mut sql = String::from(
        "SELECT i.id, i.grid_id, i.status, i.date_inspection, i.establishment, i.inspection_type,
                i.inspectors, i.created_by, uc.full_name, i.validated_by, uv.full_name,
                i.validated_at, i.created_at, i.updated_at
         FROM inspections i
         LEFT JOIN users uc ON i.created_by = uc.id
         LEFT JOIN users uv ON i.validated_by = uv.id
         WHERE 1=1"
    );
    let mut bind_values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(uid) = user_id {
        sql.push_str(&format!(" AND i.created_by = ?{}", idx));
        bind_values.push(Box::new(uid.to_string())); idx += 1;
    }
    if let Some(st) = status {
        sql.push_str(&format!(" AND i.status = ?{}", idx));
        bind_values.push(Box::new(st.to_string())); // idx += 1;
    }
    sql.push_str(" ORDER BY i.updated_at DESC");

    let refs: Vec<&dyn rusqlite::types::ToSql> = bind_values.iter().map(|b| b.as_ref()).collect();
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let inspections = stmt.query_map(refs.as_slice(), |row| {
        let insp_id: String = row.get(0)?;
        let inspectors_str: String = row.get::<_,String>(6).unwrap_or_default();
        let inspectors: Vec<String> = serde_json::from_str(&inspectors_str).unwrap_or_default();

        Ok(SavedInspection {
            id: insp_id,
            grid_id: row.get(1)?,
            status: row.get(2)?,
            date_inspection: row.get::<_,String>(3).unwrap_or_default(),
            establishment: row.get::<_,String>(4).unwrap_or_default(),
            inspection_type: row.get::<_,String>(5).unwrap_or_default(),
            inspectors,
            created_by: row.get(7)?,
            created_by_name: row.get(8)?,
            validated_by: row.get(9)?,
            validated_by_name: row.get(10)?,
            validated_at: row.get(11)?,
            created_at: row.get(12)?,
            updated_at: row.get(13)?,
            progress: InspectionProgress { total: 0, answered: 0, conforme: 0, non_conforme: 0 },
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect::<Vec<_>>();

    // Ajouter la progression pour chaque inspection
    let mut result = Vec::new();
    for mut insp in inspections {
        let progress = get_progress(&conn, &insp.id);
        insp.progress = progress;
        result.push(insp);
    }

    Ok(result)
}

fn get_progress(conn: &rusqlite::Connection, inspection_id: &str) -> InspectionProgress {
    let answered: u32 = conn.query_row(
        "SELECT COUNT(*) FROM responses WHERE inspection_id = ?1 AND conforme IS NOT NULL",
        params![inspection_id], |r| r.get(0)
    ).unwrap_or(0);
    let conforme: u32 = conn.query_row(
        "SELECT COUNT(*) FROM responses WHERE inspection_id = ?1 AND conforme = 1",
        params![inspection_id], |r| r.get(0)
    ).unwrap_or(0);
    let non_conforme: u32 = conn.query_row(
        "SELECT COUNT(*) FROM responses WHERE inspection_id = ?1 AND conforme = 0",
        params![inspection_id], |r| r.get(0)
    ).unwrap_or(0);
    let total: u32 = conn.query_row(
        "SELECT COUNT(*) FROM responses WHERE inspection_id = ?1",
        params![inspection_id], |r| r.get(0)
    ).unwrap_or(0);
    InspectionProgress { total: total.max(answered), answered, conforme, non_conforme }
}

// ── Charger réponses ──

pub fn get_responses(db: &Database, inspection_id: &str) -> Result<Vec<SavedResponse>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT criterion_id, conforme, observation, updated_by, updated_at, severity, factor, factor_justification, immediate_danger FROM responses WHERE inspection_id = ?1"
    ).map_err(|e| e.to_string())?;

    let resp = stmt.query_map(params![inspection_id], |row| {
        let conf_raw: Option<i32> = row.get(1)?;
        Ok(SavedResponse {
            criterion_id: row.get::<_,u32>(0)?,
            conforme: conf_raw.map(|v| v != 0),
            observation: row.get::<_,String>(2).unwrap_or_default(),
            updated_by: row.get(3)?,
            updated_at: row.get::<_,String>(4).unwrap_or_default(),
            severity: row.get(5)?,
            factor: row.get(6)?,
            factor_justification: row.get(7)?,
            immediate_danger: row.get::<_,bool>(8).unwrap_or(false),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(resp)
}

// ── Sauvegarder une réponse ──

pub fn save_response(
    db: &Database, inspection_id: &str, criterion_id: u32,
    conforme: Option<bool>, observation: &str, user_id: &str,
    severity: Option<&str>, factor: Option<&str>,
    factor_justification: Option<&str>, immediate_danger: bool,
) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let conf_val: Option<i32> = conforme.map(|b| if b { 1 } else { 0 });

    conn.execute(
        "INSERT INTO responses (inspection_id, criterion_id, conforme, observation, updated_by, severity, factor, factor_justification, immediate_danger)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(inspection_id, criterion_id)
         DO UPDATE SET conforme=?3, observation=?4, updated_by=?5, severity=?6, factor=?7, factor_justification=?8, immediate_danger=?9, updated_at=datetime('now','localtime')",
        params![inspection_id, criterion_id, conf_val, observation, user_id, severity, factor, factor_justification, immediate_danger],
    ).map_err(|e| e.to_string())?;

    // Mettre à jour le statut de l'inspection
    conn.execute(
        "UPDATE inspections SET status = CASE WHEN status = 'draft' THEN 'in_progress' ELSE status END,
         updated_at = datetime('now','localtime') WHERE id = ?1",
        params![inspection_id],
    ).ok();

    Ok(())
}

// ── Mettre à jour le meta ──

pub fn update_inspection_meta(db: &Database, inspection_id: &str, req: &CreateInspectionRequest) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let inspectors_json = serde_json::to_string(&req.inspectors).unwrap_or_default();
    conn.execute(
        "UPDATE inspections SET date_inspection=?1, establishment=?2, inspection_type=?3,
         inspectors=?4, updated_at=datetime('now','localtime') WHERE id=?5",
        params![req.date_inspection, req.establishment, req.inspection_type, inspectors_json, inspection_id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Changer le statut ──

pub fn set_status(db: &Database, inspection_id: &str, status: &str, user_id: Option<&str>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;

    // Valider la transition de statut
    let current_status: String = conn.query_row(
        "SELECT status FROM inspections WHERE id = ?1",
        params![inspection_id],
        |row| row.get(0),
    ).map_err(|_| "Inspection non trouvée".to_string())?;

    let valid = matches!(
        (current_status.as_str(), status),
        ("draft", "in_progress") | ("draft", "archived") |
        ("in_progress", "completed") | ("in_progress", "draft") |
        ("completed", "validated") | ("completed", "in_progress") |
        ("validated", "archived")
    );
    if !valid {
        return Err(format!("Transition de statut invalide : {} → {}", current_status, status));
    }

    if status == "validated" {
        conn.execute(
            "UPDATE inspections SET status=?1, validated_by=?2, validated_at=datetime('now','localtime'),
             updated_at=datetime('now','localtime') WHERE id=?3",
            params![status, user_id, inspection_id],
        ).map_err(|e| e.to_string())?;
    } else {
        conn.execute(
            "UPDATE inspections SET status=?1, updated_at=datetime('now','localtime') WHERE id=?2",
            params![status, inspection_id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Supprimer ──

pub fn delete_inspection(db: &Database, inspection_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM inspections WHERE id = ?1", params![inspection_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Obtenir une seule inspection ──

pub fn get_inspection(db: &Database, inspection_id: &str) -> Result<SavedInspection, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut insp = conn.query_row(
        "SELECT i.id, i.grid_id, i.status, i.date_inspection, i.establishment, i.inspection_type,
                i.inspectors, i.created_by, uc.full_name, i.validated_by, uv.full_name,
                i.validated_at, i.created_at, i.updated_at
         FROM inspections i
         LEFT JOIN users uc ON i.created_by = uc.id
         LEFT JOIN users uv ON i.validated_by = uv.id
         WHERE i.id = ?1",
        params![inspection_id],
        |row| {
            let inspectors_str: String = row.get::<_,String>(6).unwrap_or_default();
            let inspectors: Vec<String> = serde_json::from_str(&inspectors_str).unwrap_or_default();
            Ok(SavedInspection {
                id: row.get(0)?, grid_id: row.get(1)?, status: row.get(2)?,
                date_inspection: row.get::<_,String>(3).unwrap_or_default(),
                establishment: row.get::<_,String>(4).unwrap_or_default(),
                inspection_type: row.get::<_,String>(5).unwrap_or_default(),
                inspectors, created_by: row.get(7)?, created_by_name: row.get(8)?,
                validated_by: row.get(9)?, validated_by_name: row.get(10)?,
                validated_at: row.get(11)?, created_at: row.get(12)?, updated_at: row.get(13)?,
                progress: InspectionProgress { total: 0, answered: 0, conforme: 0, non_conforme: 0 },
            })
        }
    ).map_err(|_| "Inspection non trouvée".to_string())?;

    insp.progress = get_progress(&conn, &insp.id);
    Ok(insp)
}

// ═══════════════════ REPORT SNAPSHOTS ═══════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReportSnapshot {
    pub id: String,
    pub inspection_id: String,
    pub version: u32,
    pub status: String,
    pub responses: serde_json::Value,
    pub meta: serde_json::Value,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub created_at: String,
}

pub fn list_report_snapshots(db: &Database, inspection_id: &str) -> Result<Vec<ReportSnapshot>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, inspection_id, version, status, responses_json, meta_json, created_by, created_by_name, created_at
         FROM report_snapshots WHERE inspection_id = ?1 ORDER BY version DESC"
    ).map_err(|e| e.to_string())?;

    let snapshots = stmt.query_map(params![inspection_id], |row| {
        let resps_str: String = row.get::<_,String>(4).unwrap_or_default();
        let meta_str: String = row.get::<_,String>(5).unwrap_or_default();
        Ok(ReportSnapshot {
            id: row.get(0)?,
            inspection_id: row.get(1)?,
            version: row.get(2)?,
            status: row.get(3)?,
            responses: serde_json::from_str(&resps_str).unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
            meta: serde_json::from_str(&meta_str).unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
            created_by: row.get(6)?,
            created_by_name: row.get(7)?,
            created_at: row.get::<_,String>(8).unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(snapshots)
}

pub fn get_report_snapshot(db: &Database, snapshot_id: &str) -> Result<Option<ReportSnapshot>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let result = conn.query_row(
        "SELECT id, inspection_id, version, status, responses_json, meta_json, created_by, created_by_name, created_at
         FROM report_snapshots WHERE id = ?1",
        params![snapshot_id],
        |row| {
            let resps_str: String = row.get::<_,String>(4).unwrap_or_default();
            let meta_str: String = row.get::<_,String>(5).unwrap_or_default();
            Ok(ReportSnapshot {
                id: row.get(0)?,
                inspection_id: row.get(1)?,
                version: row.get(2)?,
                status: row.get(3)?,
                responses: serde_json::from_str(&resps_str).unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
                meta: serde_json::from_str(&meta_str).unwrap_or(serde_json::Value::Object(serde_json::Map::new())),
                created_by: row.get(6)?,
                created_by_name: row.get(7)?,
                created_at: row.get::<_,String>(8).unwrap_or_default(),
            })
        }
    );
    match result {
        Ok(s) => Ok(Some(s)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn create_report_snapshot(db: &Database, inspection_id: &str, status: &str, responses_json: &str, meta_json: &str, user_id: Option<&str>, user_name: Option<&str>) -> Result<u32, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let version: u32 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) + 1 FROM report_snapshots WHERE inspection_id = ?1",
        params![inspection_id], |r| r.get(0)
    ).unwrap_or(1);
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO report_snapshots (id, inspection_id, version, status, responses_json, meta_json, created_by, created_by_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![id, inspection_id, version, status, responses_json, meta_json, user_id, user_name],
    ).map_err(|e| format!("Erreur snapshot: {}", e))?;
    Ok(version)
}

// ═══════════════════ PLANNING ═══════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlanningEntry {
    pub id: String,
    pub date_debut: Option<String>,
    pub date_fin: Option<String>,
    pub establishment: Option<String>,
    pub inspection_type: Option<String>,
    pub departement: Option<String>,
    pub commune: Option<String>,
    pub priorite: Option<String>,
    pub inspectors: Vec<String>,
    pub notes: Option<String>,
    pub status: String,
    pub created_by: Option<String>,
    pub created_by_name: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreatePlanningRequest {
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub establishment: String,
    pub inspection_type: Option<String>,
    pub departement: Option<String>,
    pub commune: Option<String>,
    pub priorite: Option<String>,
    pub inspectors: Vec<String>,
    pub notes: Option<String>,
}

pub fn list_planning(db: &Database) -> Result<Vec<PlanningEntry>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, date_debut, date_fin, establishment, inspection_type, departement, commune, priorite, inspectors, notes, status, created_by, created_by_name, created_at
         FROM planning ORDER BY date_debut"
    ).map_err(|e| e.to_string())?;

    let entries = stmt.query_map([], |row| {
        let insp_str: String = row.get::<_,String>(8).unwrap_or_default();
        let inspectors: Vec<String> = serde_json::from_str(&insp_str).unwrap_or_default();
        Ok(PlanningEntry {
            id: row.get(0)?,
            date_debut: row.get(1)?,
            date_fin: row.get(2)?,
            establishment: row.get(3)?,
            inspection_type: row.get(4)?,
            departement: row.get(5)?,
            commune: row.get(6)?,
            priorite: row.get(7)?,
            inspectors,
            notes: row.get(9)?,
            status: row.get::<_,String>(10).unwrap_or_else(|_| "planifie".into()),
            created_by: row.get(11)?,
            created_by_name: row.get(12)?,
            created_at: row.get::<_,String>(13).unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(entries)
}

pub fn create_planning(db: &Database, req: &CreatePlanningRequest, user_id: &str, user_name: &str) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    let inspectors_json = serde_json::to_string(&req.inspectors).unwrap_or_default();
    conn.execute(
        "INSERT INTO planning (id, date_debut, date_fin, establishment, inspection_type, departement, commune, priorite, inspectors, notes, status, created_by, created_by_name)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'planifie',?11,?12)",
        params![id, req.date_debut, req.date_fin, req.establishment, req.inspection_type, req.departement, req.commune, req.priorite, inspectors_json, req.notes, user_id, user_name],
    ).map_err(|e| format!("Erreur planning: {}", e))?;
    Ok(id)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatePlanningRequest {
    pub status: Option<String>,
}

pub fn update_planning(db: &Database, planning_id: &str, req: &UpdatePlanningRequest) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    if let Some(ref status) = req.status {
        conn.execute(
            "UPDATE planning SET status = ?1, updated_at = datetime('now','localtime') WHERE id = ?2",
            params![status, planning_id],
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn delete_planning(db: &Database, planning_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM planning WHERE id = ?1", params![planning_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ═══════════════════ INDISPONIBILITES ═══════════════════

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Indisponibilite {
    pub id: String,
    pub inspecteur: String,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub motif: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateIndispoRequest {
    pub inspecteur: String,
    pub date_debut: String,
    pub date_fin: Option<String>,
    pub motif: Option<String>,
}

pub fn list_indisponibilites(db: &Database) -> Result<Vec<Indisponibilite>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, inspecteur, date_debut, date_fin, motif, created_at FROM indisponibilites ORDER BY date_debut"
    ).map_err(|e| e.to_string())?;
    let entries = stmt.query_map([], |row| {
        Ok(Indisponibilite {
            id: row.get(0)?,
            inspecteur: row.get(1)?,
            date_debut: row.get(2)?,
            date_fin: row.get(3)?,
            motif: row.get(4)?,
            created_at: row.get::<_,String>(5).unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();
    Ok(entries)
}

pub fn create_indisponibilite(db: &Database, req: &CreateIndispoRequest) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO indisponibilites (id, inspecteur, date_debut, date_fin, motif)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, req.inspecteur, req.date_debut, req.date_fin, req.motif],
    ).map_err(|e| format!("Erreur indispo: {}", e))?;
    Ok(id)
}

pub fn delete_indisponibilite(db: &Database, indispo_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM indisponibilites WHERE id = ?1", params![indispo_id]).map_err(|e| e.to_string())?;
    Ok(())
}

// ═══════════════════ SETTINGS ═══════════════════

pub fn get_settings(db: &Database) -> Result<std::collections::HashMap<String, serde_json::Value>, String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT key, value FROM app_settings").map_err(|e| e.to_string())?;
    let mut settings = std::collections::HashMap::new();
    let rows = stmt.query_map([], |row| {
        let key: String = row.get(0)?;
        let val: String = row.get(1)?;
        Ok((key, val))
    }).map_err(|e| e.to_string())?;
    for row in rows.flatten() {
        let parsed: serde_json::Value = serde_json::from_str(&row.1).unwrap_or(serde_json::Value::String(row.1.clone()));
        settings.insert(row.0, parsed);
    }
    Ok(settings)
}

pub fn save_settings(db: &Database, settings: &std::collections::HashMap<String, serde_json::Value>) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    for (key, value) in settings {
        let val_str = match value {
            serde_json::Value::String(s) => s.clone(),
            serde_json::Value::Number(n) => n.to_string(),
            other => serde_json::to_string(other).unwrap_or_default(),
        };
        conn.execute(
            "INSERT INTO app_settings (key, value) VALUES (?1, ?2)
             ON CONFLICT(key) DO UPDATE SET value = ?2",
            params![key, val_str],
        ).map_err(|e| format!("Erreur settings: {}", e))?;
    }
    Ok(())
}

// ═══════════════════ TESTS UNITAIRES ═══════════════════

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use rusqlite::Connection;
    use std::sync::{Mutex, Arc};

    fn create_test_db() -> Database {
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
            CREATE TABLE inspections (
                id TEXT PRIMARY KEY, grid_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'draft'
                    CHECK(status IN ('draft','in_progress','completed','validated','archived')),
                date_inspection TEXT, establishment TEXT, inspection_type TEXT,
                inspectors TEXT, created_by TEXT REFERENCES users(id),
                validated_by TEXT REFERENCES users(id), validated_at TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
            );
            CREATE TABLE responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                inspection_id TEXT NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
                criterion_id INTEGER NOT NULL, conforme INTEGER,
                observation TEXT DEFAULT '',
                updated_by TEXT REFERENCES users(id),
                updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                severity TEXT DEFAULT NULL,
                factor TEXT DEFAULT NULL,
                factor_justification TEXT DEFAULT NULL,
                immediate_danger INTEGER DEFAULT 0,
                UNIQUE(inspection_id, criterion_id)
            );
        ").unwrap();

        // Créer un utilisateur de test
        conn.execute(
            "INSERT INTO users (id, username, full_name, role, password_hash) VALUES ('u1','tester','Test User','inspector','hash')",
            [],
        ).unwrap();

        Database { conn: Arc::new(Mutex::new(conn)) }
    }

    fn insert_inspection(db: &Database, id: &str, status: &str) {
        let conn = db.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO inspections (id, grid_id, status, created_by) VALUES (?1, 'grid1', ?2, 'u1')",
            params![id, status],
        ).unwrap();
    }

    // ── Tests de création ──

    #[test]
    fn test_create_inspection() {
        let db = create_test_db();
        let req = CreateInspectionRequest {
            grid_id: "grid1".into(),
            date_inspection: "2026-03-10".into(),
            establishment: "Pharmacie Test".into(),
            inspection_type: "routine".into(),
            inspectors: vec!["Dr. A".into(), "Dr. B".into()],
        };
        let id = create_inspection(&db, &req, "u1");
        assert!(id.is_ok());
    }

    // ── Tests de transitions de statut ──

    #[test]
    fn test_status_draft_to_in_progress() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        assert!(set_status(&db, "i1", "in_progress", None).is_ok());
    }

    #[test]
    fn test_status_draft_to_archived() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        assert!(set_status(&db, "i1", "archived", None).is_ok());
    }

    #[test]
    fn test_status_in_progress_to_completed() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "in_progress");
        assert!(set_status(&db, "i1", "completed", None).is_ok());
    }

    #[test]
    fn test_status_in_progress_to_draft() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "in_progress");
        assert!(set_status(&db, "i1", "draft", None).is_ok());
    }

    #[test]
    fn test_status_completed_to_validated() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "completed");
        assert!(set_status(&db, "i1", "validated", Some("u1")).is_ok());
    }

    #[test]
    fn test_status_completed_to_in_progress() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "completed");
        assert!(set_status(&db, "i1", "in_progress", None).is_ok());
    }

    #[test]
    fn test_status_validated_to_archived() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "validated");
        assert!(set_status(&db, "i1", "archived", None).is_ok());
    }

    // ── Transitions invalides ──

    #[test]
    fn test_status_draft_to_completed_invalid() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        let err = set_status(&db, "i1", "completed", None);
        assert!(err.is_err());
        assert!(err.unwrap_err().contains("invalide"));
    }

    #[test]
    fn test_status_draft_to_validated_invalid() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        assert!(set_status(&db, "i1", "validated", None).is_err());
    }

    #[test]
    fn test_status_archived_to_anything_invalid() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "archived");
        assert!(set_status(&db, "i1", "draft", None).is_err());
        assert!(set_status(&db, "i1", "in_progress", None).is_err());
        assert!(set_status(&db, "i1", "completed", None).is_err());
    }

    #[test]
    fn test_status_validated_to_draft_invalid() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "validated");
        assert!(set_status(&db, "i1", "draft", None).is_err());
    }

    // ── Tests réponses ──

    #[test]
    fn test_save_and_get_response() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        assert!(save_response(&db, "i1", 1, Some(true), "RAS", "u1", None, None, None, false).is_ok());
        assert!(save_response(&db, "i1", 2, Some(false), "NC observé", "u1", Some("majeur"), None, None, false).is_ok());
        let resp = get_responses(&db, "i1").unwrap();
        assert_eq!(resp.len(), 2);
    }

    #[test]
    fn test_save_response_upsert() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        save_response(&db, "i1", 1, Some(true), "OK", "u1", None, None, None, false).unwrap();
        save_response(&db, "i1", 1, Some(false), "Corrigé", "u1", Some("mineur"), Some("attenuant"), None, false).unwrap();
        let resp = get_responses(&db, "i1").unwrap();
        assert_eq!(resp.len(), 1);
        assert_eq!(resp[0].conforme, Some(false));
        assert_eq!(resp[0].observation, "Corrigé");
        assert_eq!(resp[0].severity.as_deref(), Some("mineur"));
        assert_eq!(resp[0].factor.as_deref(), Some("attenuant"));
    }

    #[test]
    fn test_save_response_risk_fields() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        save_response(&db, "i1", 1, Some(false), "Critique", "u1",
            Some("critique"), Some("aggravant"), Some("Récidive"), true).unwrap();
        let resp = get_responses(&db, "i1").unwrap();
        assert_eq!(resp[0].severity.as_deref(), Some("critique"));
        assert_eq!(resp[0].factor.as_deref(), Some("aggravant"));
        assert_eq!(resp[0].factor_justification.as_deref(), Some("Récidive"));
        assert!(resp[0].immediate_danger);
    }

    #[test]
    fn test_save_response_changes_status_to_in_progress() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        save_response(&db, "i1", 1, Some(true), "", "u1", None, None, None, false).unwrap();
        let conn = db.conn.lock().unwrap();
        let status: String = conn.query_row(
            "SELECT status FROM inspections WHERE id = 'i1'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(status, "in_progress");
    }

    // ── Tests suppression ──

    #[test]
    fn test_delete_inspection() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        assert!(delete_inspection(&db, "i1").is_ok());
        let conn = db.conn.lock().unwrap();
        let count: i32 = conn.query_row(
            "SELECT COUNT(*) FROM inspections WHERE id = 'i1'", [], |r| r.get(0)
        ).unwrap();
        assert_eq!(count, 0);
    }

    // ── Tests listing ──

    #[test]
    fn test_list_inspections() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        insert_inspection(&db, "i2", "in_progress");
        let all = list_inspections(&db, None, None).unwrap();
        assert_eq!(all.len(), 2);
    }

    #[test]
    fn test_list_inspections_filter_status() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        insert_inspection(&db, "i2", "in_progress");
        let drafts = list_inspections(&db, None, Some("draft")).unwrap();
        assert_eq!(drafts.len(), 1);
        assert_eq!(drafts[0].status, "draft");
    }

    // ── Test progression ──

    #[test]
    fn test_progress_calculation() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        save_response(&db, "i1", 1, Some(true), "", "u1", None, None, None, false).unwrap();
        save_response(&db, "i1", 2, Some(false), "NC", "u1", Some("majeur"), None, None, false).unwrap();
        save_response(&db, "i1", 3, None, "", "u1", None, None, None, false).unwrap();

        let conn = db.conn.lock().unwrap();
        let progress = get_progress(&conn, "i1");
        assert_eq!(progress.total, 3);
        assert_eq!(progress.answered, 2);
        assert_eq!(progress.conforme, 1);
        assert_eq!(progress.non_conforme, 1);
    }

    #[test]
    fn test_nonexistent_inspection_status() {
        let db = create_test_db();
        assert!(set_status(&db, "nonexistent", "in_progress", None).is_err());
    }

    // ── Tests supplémentaires pour couverture ──

    #[test]
    fn test_list_inspections_filter_by_status() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        insert_inspection(&db, "i2", "draft");
        insert_inspection(&db, "i3", "in_progress");
        insert_inspection(&db, "i4", "completed");

        let drafts = list_inspections(&db, None, Some("draft")).unwrap();
        assert_eq!(drafts.len(), 2);
        assert!(drafts.iter().all(|i| i.status == "draft"));

        let in_progress = list_inspections(&db, None, Some("in_progress")).unwrap();
        assert_eq!(in_progress.len(), 1);
        assert_eq!(in_progress[0].status, "in_progress");

        let completed = list_inspections(&db, None, Some("completed")).unwrap();
        assert_eq!(completed.len(), 1);
        assert_eq!(completed[0].status, "completed");

        let validated = list_inspections(&db, None, Some("validated")).unwrap();
        assert_eq!(validated.len(), 0);
    }

    #[test]
    fn test_get_responses_empty() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");
        let resp = get_responses(&db, "i1").unwrap();
        assert!(resp.is_empty());
    }

    #[test]
    fn test_save_response_update() {
        let db = create_test_db();
        insert_inspection(&db, "i1", "draft");

        // First save: conforme with no severity
        save_response(&db, "i1", 10, Some(true), "Initial observation", "u1", None, None, None, false).unwrap();
        let resp = get_responses(&db, "i1").unwrap();
        assert_eq!(resp.len(), 1);
        assert_eq!(resp[0].conforme, Some(true));
        assert_eq!(resp[0].observation, "Initial observation");
        assert_eq!(resp[0].severity, None);
        assert!(!resp[0].immediate_danger);

        // Second save (update): non-conforme with severity and immediate danger
        save_response(&db, "i1", 10, Some(false), "Updated observation", "u1",
            Some("critique"), Some("aggravant"), Some("Justification"), true).unwrap();
        let resp = get_responses(&db, "i1").unwrap();
        assert_eq!(resp.len(), 1);
        assert_eq!(resp[0].conforme, Some(false));
        assert_eq!(resp[0].observation, "Updated observation");
        assert_eq!(resp[0].severity.as_deref(), Some("critique"));
        assert_eq!(resp[0].factor.as_deref(), Some("aggravant"));
        assert_eq!(resp[0].factor_justification.as_deref(), Some("Justification"));
        assert!(resp[0].immediate_danger);
    }
}
