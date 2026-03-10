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
        "SELECT criterion_id, conforme, observation, updated_by, updated_at FROM responses WHERE inspection_id = ?1"
    ).map_err(|e| e.to_string())?;

    let resp = stmt.query_map(params![inspection_id], |row| {
        let conf_raw: Option<i32> = row.get(1)?;
        Ok(SavedResponse {
            criterion_id: row.get::<_,u32>(0)?,
            conforme: conf_raw.map(|v| v != 0),
            observation: row.get::<_,String>(2).unwrap_or_default(),
            updated_by: row.get(3)?,
            updated_at: row.get::<_,String>(4).unwrap_or_default(),
        })
    }).map_err(|e| e.to_string())?
    .filter_map(|r| r.ok())
    .collect();

    Ok(resp)
}

// ── Sauvegarder une réponse ──

pub fn save_response(db: &Database, inspection_id: &str, criterion_id: u32, conforme: Option<bool>, observation: &str, user_id: &str) -> Result<(), String> {
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    let conf_val: Option<i32> = conforme.map(|b| if b { 1 } else { 0 });

    conn.execute(
        "INSERT INTO responses (inspection_id, criterion_id, conforme, observation, updated_by)
         VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(inspection_id, criterion_id)
         DO UPDATE SET conforme=?3, observation=?4, updated_by=?5, updated_at=datetime('now','localtime')",
        params![inspection_id, criterion_id, conf_val, observation, user_id],
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
