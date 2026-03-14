//! Module de gestion du mode hors-ligne pour l'application d'inspection pharma
//! 
//! Ce module gère la détection de connectivité, la mise en file d'attente des changements,
//! et la synchronisation lorsque la connectivité est rétablie.

use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::SystemTime;
use std::collections::HashMap;

/// Statut de connectivité
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ConnectivityStatus {
    Online,
    Offline,
    Connecting,
}

/// Configuration du mode hors-ligne
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineConfig {
    pub allow_offline_work: bool,
    pub auto_sync_on_reconnect: bool,
    pub max_offline_duration_hours: u32,
    pub warn_before_offline_limit: bool,
}

impl Default for OfflineConfig {
    fn default() -> Self {
        Self {
            allow_offline_work: true,
            auto_sync_on_reconnect: true,
            max_offline_duration_hours: 72, // 3 jours
            warn_before_offline_limit: true,
        }
    }
}

/// État du mode hors-ligne
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OfflineState {
    pub status: ConnectivityStatus,
    pub offline_since: Option<SystemTime>,
    pub pending_sync_operations: u32,
    pub last_sync_attempt: Option<SystemTime>,
    pub sync_errors: Vec<String>,
}

/// Changement à synchroniser
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PendingOperation {
    pub id: String,
    pub operation_type: OperationType,
    pub entity_id: String,
    pub data: serde_json::Value,
    pub timestamp: SystemTime,
    pub retry_count: u32,
}

/// Type d'opération
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum OperationType {
    CreateInspection,
    UpdateInspection,
    DeleteInspection,
    SaveResponse,
    UpdatePlanning,
    CreatePlanning,
    DeletePlanning,
}

/// Gestionnaire de mode hors-ligne
pub struct OfflineManager {
    config: OfflineConfig,
    state: Arc<Mutex<OfflineState>>,
    pending_operations: Arc<Mutex<Vec<PendingOperation>>>,
    network_checker: NetworkChecker,
}

/// Vérificateur de réseau (trait pour faciliter les tests)
pub trait NetworkCheckerTrait {
    fn is_online(&self) -> bool;
}

/// Implémentation par défaut du vérificateur de réseau
pub struct NetworkChecker;

impl NetworkCheckerTrait for NetworkChecker {
    fn is_online(&self) -> bool {
        // Dans une vraie implémentation, on ferait un ping vers un serveur
        // Pour l'instant, nous simulons la connectivité
        true
    }
}

impl OfflineManager {
    /// Crée un nouveau gestionnaire de mode hors-ligne
    pub fn new(config: Option<OfflineConfig>) -> Self {
        let config = config.unwrap_or_default();
        
        Self {
            config,
            state: Arc::new(Mutex::new(OfflineState {
                status: ConnectivityStatus::Online,
                offline_since: None,
                pending_sync_operations: 0,
                last_sync_attempt: None,
                sync_errors: Vec::new(),
            })),
            pending_operations: Arc::new(Mutex::new(Vec::new())),
            network_checker: NetworkChecker,
        }
    }

    /// Vérifie la connectivité et met à jour l'état
    pub fn check_connectivity(&self) -> ConnectivityStatus {
        let is_online = self.network_checker.is_online();
        let mut state = self.state.lock().unwrap();
        
        match (&state.status, is_online) {
            (ConnectivityStatus::Online, false) => {
                // Passage en mode hors-ligne
                state.status = ConnectivityStatus::Offline;
                state.offline_since = Some(SystemTime::now());
                log::info!("Passage en mode hors-ligne");
            }
            (ConnectivityStatus::Offline, true) => {
                // Retour en ligne
                state.status = ConnectivityStatus::Online;
                state.offline_since = None;
                log::info!("Retour en ligne");
                
                // Si auto-sync activé, lancer la synchronisation
                if self.config.auto_sync_on_reconnect {
                    // Cette partie serait implémentée dans une vraie application
                    log::info!("Démarrage de la synchronisation automatique");
                }
            }
            (ConnectivityStatus::Connecting, online_status) => {
                state.status = if online_status {
                    ConnectivityStatus::Online
                } else {
                    ConnectivityStatus::Offline
                };
            }
            _ => {} // Pas de changement d'état
        }
        
        state.status.clone()
    }

    /// Ajoute une opération en attente de synchronisation
    pub fn queue_operation(&self, operation: PendingOperation) -> Result<(), String> {
        if !self.config.allow_offline_work && matches!(self.get_state().status, ConnectivityStatus::Offline) {
            return Err("Travail hors-ligne non autorisé dans la configuration".to_string());
        }

        let mut operations = self.pending_operations.lock().unwrap();
        operations.push(operation);
        
        let mut state = self.state.lock().unwrap();
        state.pending_sync_operations = operations.len() as u32;
        
        Ok(())
    }

    /// Tente de synchroniser les opérations en attente
    pub fn attempt_sync(&self) -> Result<u32, String> {
        if !matches!(self.check_connectivity(), ConnectivityStatus::Online) {
            return Err("Pas de connectivité réseau".to_string());
        }

        let operations: Vec<PendingOperation> = {
            let ops = self.pending_operations.lock().unwrap();
            ops.clone()
        };

        if operations.is_empty() {
            return Ok(0);
        }

        let mut successful_syncs = 0;
        let mut failed_operations = Vec::new();

        // Essayer de synchroniser chaque opération
        for mut operation in operations {
            match self.sync_single_operation(&operation) {
                Ok(_) => {
                    successful_syncs += 1;
                    // Retirer l'opération de la file d'attente
                    self.remove_operation(&operation.id);
                }
                Err(e) => {
                    operation.retry_count += 1;
                    if operation.retry_count < 3 {
                        // Réessayer plus tard
                        failed_operations.push(operation);
                    } else {
                        // Erreur permanente
                        let mut state = self.state.lock().unwrap();
                        state.sync_errors.push(format!(
                            "Échec synchro {:?} ({}): {}",
                            operation.operation_type, operation.entity_id, e
                        ));
                    }
                }
            }
        }

        // Mettre à jour la liste des opérations avec celles qui ont échoué
        {
            let mut ops = self.pending_operations.lock().unwrap();
            *ops = failed_operations;
        }

        // Mettre à jour l'état
        {
            let mut state = self.state.lock().unwrap();
            state.last_sync_attempt = Some(SystemTime::now());
            state.pending_sync_operations = self.pending_operations.lock().unwrap().len() as u32;
        }

        Ok(successful_syncs)
    }

    /// Synchronise une opération unique
    fn sync_single_operation(&self, operation: &PendingOperation) -> Result<(), String> {
        // Dans une vraie implémentation, cela ferait appel à l'API
        // Pour l'instant, nous simulons le succès
        match &operation.operation_type {
            OperationType::CreateInspection => {
                log::debug!("Synchronisation création inspection: {}", operation.entity_id);
                // Simulation d'appel API
                Ok(())
            }
            OperationType::SaveResponse => {
                log::debug!("Synchronisation réponse: {}", operation.entity_id);
                // Simulation d'appel API
                Ok(())
            }
            _ => {
                log::debug!("Synchronisation opération: {:?}", operation.operation_type);
                // Simulation d'appel API
                Ok(())
            }
        }
    }

    /// Retire une opération de la file d'attente
    fn remove_operation(&self, operation_id: &str) {
        let mut operations = self.pending_operations.lock().unwrap();
        operations.retain(|op| op.id != operation_id);
    }

    /// Obtient l'état courant du mode hors-ligne
    pub fn get_state(&self) -> OfflineState {
        self.state.lock().unwrap().clone()
    }

    /// Obtient les opérations en attente
    pub fn get_pending_operations(&self) -> Vec<PendingOperation> {
        self.pending_operations.lock().unwrap().clone()
    }

    /// Vérifie si la durée maximale hors-ligne est dépassée
    pub fn check_offline_duration(&self) -> Option<std::time::Duration> {
        let state = self.state.lock().unwrap();
        if let Some(offline_since) = state.offline_since {
            if let Ok(duration) = SystemTime::now().duration_since(offline_since) {
                return Some(duration);
            }
        }
        None
    }

    /// Met à jour la configuration du mode hors-ligne
    pub fn update_config(&mut self, new_config: OfflineConfig) {
        self.config = new_config;
    }

    /// Efface les erreurs de synchronisation
    pub fn clear_sync_errors(&self) {
        let mut state = self.state.lock().unwrap();
        state.sync_errors.clear();
    }

    /// Exporte les données en attente de synchronisation
    pub fn export_pending_data(&self) -> Result<String, String> {
        let operations = self.get_pending_operations();
        serde_json::to_string_pretty(&operations)
            .map_err(|e| format!("Erreur export JSON: {}", e))
    }

    /// Importe des données pour synchronisation
    pub fn import_pending_data(&self, json_data: &str) -> Result<(), String> {
        let operations: Vec<PendingOperation> = serde_json::from_str(json_data)
            .map_err(|e| format!("Erreur parsing JSON: {}", e))?;
        
        let mut ops = self.pending_operations.lock().unwrap();
        ops.extend(operations);
        
        let mut state = self.state.lock().unwrap();
        state.pending_sync_operations = ops.len() as u32;
        
        Ok(())
    }
}

/// Extension de l'API de base pour supporter le mode hors-ligne
pub trait OfflineAwareApi {
    /// Sauvegarde une réponse en mode hors-ligne si nécessaire
    fn save_response_offline_aware(
        &self,
        inspection_id: &str,
        criterion_id: u32,
        conforme: Option<bool>,
        observation: &str,
        offline_manager: &OfflineManager,
    ) -> Result<(), String>;
    
    /// Crée une inspection en mode hors-ligne si nécessaire
    fn create_inspection_offline_aware(
        &self,
        request: serde_json::Value,
        offline_manager: &OfflineManager,
    ) -> Result<String, String>;
}

impl OfflineAwareApi for super::db::Database {
    fn save_response_offline_aware(
        &self,
        inspection_id: &str,
        criterion_id: u32,
        conforme: Option<bool>,
        observation: &str,
        offline_manager: &OfflineManager,
    ) -> Result<(), String> {
        // Dans une vraie implémentation, cela tenterait d'enregistrer dans la base de données
        // Et en cas d'échec (mode hors-ligne), cela l'ajouterait à la file d'attente
        
        // Simulation du comportement
        if matches!(offline_manager.get_state().status, ConnectivityStatus::Offline) {
            let operation = PendingOperation {
                id: format!("resp-{}-{}", inspection_id, criterion_id),
                operation_type: OperationType::SaveResponse,
                entity_id: format!("{}-{}", inspection_id, criterion_id),
                data: serde_json::json!({
                    "inspection_id": inspection_id,
                    "criterion_id": criterion_id,
                    "conforme": conforme,
                    "observation": observation
                }),
                timestamp: SystemTime::now(),
                retry_count: 0,
            };
            
            offline_manager.queue_operation(operation)?;
            Ok(())
        } else {
            // Tentative d'enregistrement direct
            // Dans une vraie implémentation, cela appellerait la base de données
            Ok(())
        }
    }
    
    fn create_inspection_offline_aware(
        &self,
        request: serde_json::Value,
        offline_manager: &OfflineManager,
    ) -> Result<String, String> {
        // Générer un ID temporaire si en mode hors-ligne
        if matches!(offline_manager.get_state().status, ConnectivityStatus::Offline) {
            let temp_id = format!("temp-{}", uuid::Uuid::new_v4());
            
            let operation = PendingOperation {
                id: temp_id.clone(),
                operation_type: OperationType::CreateInspection,
                entity_id: temp_id.clone(),
                data: request,
                timestamp: SystemTime::now(),
                retry_count: 0,
            };
            
            offline_manager.queue_operation(operation)?;
            Ok(temp_id)
        } else {
            // Dans une vraie implémentation, cela créerait l'inspection via l'API
            Ok("real-id".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    // Mock du vérificateur de réseau pour les tests
    pub struct MockNetworkChecker {
        is_online: bool,
    }

    impl NetworkCheckerTrait for MockNetworkChecker {
        fn is_online(&self) -> bool {
            self.is_online
        }
    }

    #[test]
    fn test_offline_manager_creation() {
        let manager = OfflineManager::new(None);
        assert!(manager.config.allow_offline_work);
    }

    #[test]
    fn test_connectivity_check() {
        let manager = OfflineManager::new(None);
        let status = manager.check_connectivity();
        assert!(matches!(status, ConnectivityStatus::Online));
    }

    #[test]
    fn test_queue_operation() {
        let manager = OfflineManager::new(None);
        let operation = PendingOperation {
            id: "test-1".to_string(),
            operation_type: OperationType::CreateInspection,
            entity_id: "entity-1".to_string(),
            data: serde_json::json!({}),
            timestamp: SystemTime::now(),
            retry_count: 0,
        };

        assert!(manager.queue_operation(operation).is_ok());
        assert_eq!(manager.get_pending_operations().len(), 1);
    }

    #[test]
    fn test_config_update() {
        let mut manager = OfflineManager::new(None);
        let new_config = OfflineConfig {
            allow_offline_work: false,
            auto_sync_on_reconnect: false,
            max_offline_duration_hours: 24,
            warn_before_offline_limit: false,
        };

        manager.update_config(new_config.clone());
        assert_eq!(manager.config.max_offline_duration_hours, 24);
    }
}