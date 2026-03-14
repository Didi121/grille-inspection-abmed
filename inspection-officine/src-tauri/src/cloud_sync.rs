//! Module de synchronisation cloud pour l'application d'inspection pharma
//! 
//! Ce module gère la synchronisation bidirectionnelle des données entre
//! l'application locale et un service cloud, avec prise en charge du mode offline.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::SystemTime;

/// Configuration de synchronisation cloud
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudSyncConfig {
    pub api_url: String,
    pub api_key: String,
    pub enabled: bool,
    pub auto_sync: bool,
    pub sync_interval_secs: u64,
}

/// Statut de synchronisation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub last_sync: Option<SystemTime>,
    pub is_online: bool,
    pub pending_changes: usize,
    pub sync_error: Option<String>,
}

/// Changement local à synchroniser
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalChange {
    pub id: String,
    pub entity_type: String,
    pub action: String, // create, update, delete
    pub data: serde_json::Value,
    pub timestamp: SystemTime,
}

/// Service de synchronisation cloud
pub struct CloudSyncService {
    config: CloudSyncConfig,
    status: Arc<Mutex<SyncStatus>>,
    pending_changes: Arc<Mutex<Vec<LocalChange>>>,
    http_client: reqwest::Client,
}

impl CloudSyncService {
    /// Crée un nouveau service de synchronisation
    pub fn new(config: CloudSyncConfig) -> Self {
        Self {
            config,
            status: Arc::new(Mutex::new(SyncStatus {
                last_sync: None,
                is_online: false,
                pending_changes: 0,
                sync_error: None,
            })),
            pending_changes: Arc::new(Mutex::new(Vec::new())),
            http_client: reqwest::Client::new(),
        }
    }

    /// Vérifie la connectivité avec le service cloud
    pub async fn check_connectivity(&self) -> bool {
        if !self.config.enabled {
            return false;
        }

        match self.http_client
            .get(&format!("{}/health", self.config.api_url))
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .send()
            .await
        {
            Ok(response) => response.status().is_success(),
            Err(_) => false,
        }
    }

    /// Enregistre un changement local pour synchronisation future
    pub fn queue_local_change(&self, change: LocalChange) {
        let mut changes = self.pending_changes.lock().unwrap();
        changes.push(change);
        
        let mut status = self.status.lock().unwrap();
        status.pending_changes = changes.len();
    }

    /// Synchronise les changements locaux vers le cloud
    pub async fn sync_to_cloud(&self) -> Result<(), String> {
        if !self.config.enabled {
            return Ok(());
        }

        // Récupérer les changements en attente
        let changes: Vec<LocalChange> = {
            let changes_lock = self.pending_changes.lock().unwrap();
            changes_lock.clone()
        };

        if changes.is_empty() {
            return Ok(());
        }

        // Envoyer les changements au cloud
        for change in changes {
            let result = self.send_change_to_cloud(change).await;
            if let Err(e) = result {
                let mut status = self.status.lock().unwrap();
                status.sync_error = Some(e.clone());
                return Err(e);
            }
        }

        // Effacer les changements synchronisés
        {
            let mut changes_lock = self.pending_changes.lock().unwrap();
            changes_lock.clear();
        }

        // Mettre à jour le statut
        {
            let mut status = self.status.lock().unwrap();
            status.last_sync = Some(SystemTime::now());
            status.pending_changes = 0;
            status.sync_error = None;
        }

        Ok(())
    }

    /// Envoie un changement unique au service cloud
    async fn send_change_to_cloud(&self, change: LocalChange) -> Result<(), String> {
        let url = format!("{}/sync/change", self.config.api_url);
        
        let response = self.http_client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .header("Content-Type", "application/json")
            .json(&change)
            .send()
            .await
            .map_err(|e| format!("Erreur réseau: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Erreur inconnue".to_string());
            return Err(format!("Erreur serveur: {}", error_text));
        }

        Ok(())
    }

    /// Récupère les changements distants depuis le cloud
    pub async fn fetch_remote_changes(&self) -> Result<Vec<serde_json::Value>, String> {
        if !self.config.enabled {
            return Ok(vec![]);
        }

        let url = format!("{}/sync/changes", self.config.api_url);
        
        let response = self.http_client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.config.api_key))
            .send()
            .await
            .map_err(|e| format!("Erreur réseau: {}", e))?;

        if !response.status().is_success() {
            let error_text = response.text().await.unwrap_or_else(|_| "Erreur inconnue".to_string());
            return Err(format!("Erreur serveur: {}", error_text));
        }

        let changes: Vec<serde_json::Value> = response
            .json()
            .await
            .map_err(|e| format!("Erreur parsing JSON: {}", e))?;

        Ok(changes)
    }

    /// Met à jour le statut de connectivité
    pub fn update_online_status(&self, is_online: bool) {
        let mut status = self.status.lock().unwrap();
        status.is_online = is_online;
    }

    /// Récupère le statut courant de synchronisation
    pub fn get_status(&self) -> SyncStatus {
        self.status.lock().unwrap().clone()
    }

    /// Démarre la synchronisation automatique (si activée)
    pub async fn start_auto_sync(&self) {
        if !self.config.auto_sync || !self.config.enabled {
            return;
        }

        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(self.config.sync_interval_secs)).await;
            
            if let Err(e) = self.sync_to_cloud().await {
                eprintln!("Erreur synchronisation auto: {}", e);
            }
        }
    }
}

/// Modèle d'inspection pour synchronisation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncInspection {
    pub id: String,
    pub grid_id: String,
    pub establishment: String,
    pub date_inspection: String,
    pub inspection_type: String,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
    pub meta: HashMap<String, serde_json::Value>,
}

/// Modèle de réponse pour synchronisation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResponse {
    pub inspection_id: String,
    pub criterion_id: u32,
    pub conforme: Option<bool>,
    pub observation: String,
    pub severity: Option<String>,
    pub factor: Option<String>,
    pub factor_justification: Option<String>,
    pub immediate_danger: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_creation() {
        let config = CloudSyncConfig {
            api_url: "https://api.example.com".to_string(),
            api_key: "secret-key".to_string(),
            enabled: true,
            auto_sync: true,
            sync_interval_secs: 300,
        };
        
        assert_eq!(config.api_url, "https://api.example.com");
        assert_eq!(config.api_key, "secret-key");
    }

    #[test]
    fn test_change_queueing() {
        let config = CloudSyncConfig {
            api_url: "https://api.example.com".to_string(),
            api_key: "secret-key".to_string(),
            enabled: true,
            auto_sync: false,
            sync_interval_secs: 300,
        };
        
        let service = CloudSyncService::new(config);
        
        let change = LocalChange {
            id: "test-1".to_string(),
            entity_type: "inspection".to_string(),
            action: "create".to_string(),
            data: serde_json::json!({"name": "Test"}),
            timestamp: SystemTime::now(),
        };
        
        service.queue_local_change(change);
        let status = service.get_status();
        assert_eq!(status.pending_changes, 1);
    }
}