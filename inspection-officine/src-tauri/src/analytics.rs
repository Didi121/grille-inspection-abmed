//! Module d'analyse et de statistiques pour l'application d'inspection pharma
//! 
//! Ce module fournit des fonctionnalités d'agrégation, de calcul et de visualisation
//! des données d'inspection pour générer des rapports statistiques avancés.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use chrono::{NaiveDate, Duration};

/// Période de filtrage pour les statistiques
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PeriodFilter {
    Today,
    Week,
    Month,
    Quarter,
    Year,
    Custom { start: String, end: String }, // Format: YYYY-MM-DD
}

/// Filtres pour les statistiques
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsFilter {
    pub period: PeriodFilter,
    pub department: Option<String>,
    pub commune: Option<String>,
    pub grid_type: Option<String>,
    pub inspection_type: Option<String>,
    pub inspector: Option<String>,
    pub conformity_status: Option<String>, // conforme, non_conforme, partial
}

/// Statistiques globales
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalStats {
    pub total_inspections: u32,
    pub completed_inspections: u32,
    pub in_progress_inspections: u32,
    pub overall_conformity_rate: f64,
    pub critical_non_conformities: u32,
    pub major_non_conformities: u32,
    pub minor_non_conformities: u32,
}

/// Statistiques par type d'établissement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EstablishmentTypeStats {
    pub establishment_type: String,
    pub total_inspections: u32,
    pub conformity_rate: f64,
    pub avg_severity_score: f64,
    pub critical_findings: u32,
}

/// Statistiques par département
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DepartmentStats {
    pub department: String,
    pub total_inspections: u32,
    pub conformity_rate: f64,
    pub critical_findings: u32,
    pub completion_rate: f64,
}

/// Statistiques par inspecteur
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InspectorStats {
    pub inspector_name: String,
    pub total_inspections: u32,
    pub avg_completion_time_days: f64,
    pub conformity_rate: f64,
    pub critical_findings: u32,
}

/// Données pour les graphiques temporels
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TimeSeriesData {
    pub date: String, // Format: YYYY-MM-DD
    pub inspections_count: u32,
    pub conformity_rate: f64,
    pub critical_findings: u32,
}

/// Rapport statistique complet
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsReport {
    pub generated_at: String, // Format: YYYY-MM-DD HH:MM:SS
    pub global_stats: GlobalStats,
    pub by_establishment_type: Vec<EstablishmentTypeStats>,
    pub by_department: Vec<DepartmentStats>,
    pub by_inspector: Vec<InspectorStats>,
    pub time_series: Vec<TimeSeriesData>,
    pub top_critical_findings: Vec<CriticalFinding>,
    pub compliance_trends: Vec<TrendPoint>,
}

/// Point de tendance
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrendPoint {
    pub period: String,
    pub value: f64,
    pub trend: String, // "up", "down", "stable"
}

/// Finding critique
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriticalFinding {
    pub criterion_reference: String,
    pub description: String,
    pub count: u32,
    pub severity: String,
}

/// Service d'analyse statistique
pub struct AnalyticsService {
    // Pourrait contenir des connexions DB ou autres dépendances
}

impl AnalyticsService {
    pub fn new() -> Self {
        Self {}
    }

    /// Calcule les statistiques globales selon les filtres donnés
    pub fn calculate_global_stats(&self, filter: &AnalyticsFilter) -> GlobalStats {
        // Simulation de calcul - dans une vraie implémentation,
        // cela viendrait de la base de données
        
        let total = match &filter.period {
            PeriodFilter::Today => 12,
            PeriodFilter::Week => 45,
            PeriodFilter::Month => 180,
            PeriodFilter::Quarter => 540,
            PeriodFilter::Year => 2160,
            PeriodFilter::Custom { .. } => 100,
        };

        GlobalStats {
            total_inspections: total,
            completed_inspections: (total as f64 * 0.85) as u32,
            in_progress_inspections: (total as f64 * 0.10) as u32,
            overall_conformity_rate: 0.78,
            critical_non_conformities: (total as f64 * 0.15) as u32,
            major_non_conformities: (total as f64 * 0.25) as u32,
            minor_non_conformities: (total as f64 * 0.35) as u32,
        }
    }

    /// Calcule les statistiques par type d'établissement
    pub fn calculate_establishment_stats(&self, _filter: &AnalyticsFilter) -> Vec<EstablishmentTypeStats> {
        vec![
            EstablishmentTypeStats {
                establishment_type: "Officine".to_string(),
                total_inspections: 120,
                conformity_rate: 0.82,
                avg_severity_score: 2.1,
                critical_findings: 18,
            },
            EstablishmentTypeStats {
                establishment_type: "Grossiste".to_string(),
                total_inspections: 85,
                conformity_rate: 0.75,
                avg_severity_score: 2.4,
                critical_findings: 22,
            },
            EstablishmentTypeStats {
                establishment_type: "Hôpital".to_string(),
                total_inspections: 45,
                conformity_rate: 0.68,
                avg_severity_score: 2.8,
                critical_findings: 31,
            },
        ]
    }

    /// Calcule les statistiques par département
    pub fn calculate_department_stats(&self, _filter: &AnalyticsFilter) -> Vec<DepartmentStats> {
        vec![
            DepartmentStats {
                department: "Atlantique".to_string(),
                total_inspections: 65,
                conformity_rate: 0.85,
                critical_findings: 12,
                completion_rate: 0.92,
            },
            DepartmentStats {
                department: "Littoral".to_string(),
                total_inspections: 58,
                conformity_rate: 0.78,
                critical_findings: 15,
                completion_rate: 0.88,
            },
            DepartmentStats {
                department: "Mono".to_string(),
                total_inspections: 42,
                conformity_rate: 0.72,
                critical_findings: 18,
                completion_rate: 0.82,
            },
            DepartmentStats {
                department: "Ouémé".to_string(),
                total_inspections: 38,
                conformity_rate: 0.76,
                critical_findings: 14,
                completion_rate: 0.85,
            },
        ]
    }

    /// Calcule les statistiques par inspecteur
    pub fn calculate_inspector_stats(&self, _filter: &AnalyticsFilter) -> Vec<InspectorStats> {
        vec![
            InspectorStats {
                inspector_name: "Dr. Adjimon".to_string(),
                total_inspections: 45,
                avg_completion_time_days: 3.2,
                conformity_rate: 0.81,
                critical_findings: 8,
            },
            InspectorStats {
                inspector_name: "Dr. Houngbo".to_string(),
                total_inspections: 38,
                avg_completion_time_days: 2.8,
                conformity_rate: 0.76,
                critical_findings: 12,
            },
            InspectorStats {
                inspector_name: "Dr. Soglo".to_string(),
                total_inspections: 32,
                avg_completion_time_days: 3.5,
                conformity_rate: 0.79,
                critical_findings: 10,
            },
        ]
    }

    /// Génère les données temporelles pour les graphiques
    pub fn generate_time_series(&self, days: u32) -> Vec<TimeSeriesData> {
        let mut series = Vec::new();
        let today = chrono::Utc::now().naive_utc().date();
        
        for i in 0..days {
            let date = today - Duration::days((days - i - 1) as i64);
            // Simuler des données variées
            let base_count = 3 + (i % 7) as u32;
            let conformity = 0.7 + ((i as f64 * 0.01) % 0.1) - 0.05;
            let critical = (2 + (i % 5)) as u32;
            
            series.push(TimeSeriesData {
                date: date.format("%Y-%m-%d").to_string(),
                inspections_count: base_count,
                conformity_rate: conformity,
                critical_findings: critical,
            });
        }
        
        series
    }

    /// Identifie les findings critiques les plus fréquents
    pub fn get_top_critical_findings(&self, _limit: u32) -> Vec<CriticalFinding> {
        vec![
            CriticalFinding {
                criterion_reference: "BPDisp 7.14".to_string(),
                description: "Le pharmacien n'assure pas intégralement l'acte de dispensation".to_string(),
                count: 24,
                severity: "critique".to_string(),
            },
            CriticalFinding {
                criterion_reference: "BPDisp 4.7".to_string(),
                description: "Stockage inapproprié des produits dangereux".to_string(),
                count: 19,
                severity: "critique".to_string(),
            },
            CriticalFinding {
                criterion_reference: "BPDisp 2.4".to_string(),
                description: "Personnel non inscrit à l'Ordre des pharmaciens".to_string(),
                count: 16,
                severity: "critique".to_string(),
            },
            CriticalFinding {
                criterion_reference: "BPDisp 3.4".to_string(),
                description: "Ordonnancier mal tenu ou incomplet".to_string(),
                count: 14,
                severity: "majeur".to_string(),
            },
        ]
    }

    /// Calcule les tendances de conformité
    pub fn calculate_compliance_trends(&self) -> Vec<TrendPoint> {
        vec![
            TrendPoint {
                period: "Janvier".to_string(),
                value: 0.72,
                trend: "stable".to_string(),
            },
            TrendPoint {
                period: "Février".to_string(),
                value: 0.75,
                trend: "up".to_string(),
            },
            TrendPoint {
                period: "Mars".to_string(),
                value: 0.78,
                trend: "up".to_string(),
            },
            TrendPoint {
                period: "Avril".to_string(),
                value: 0.76,
                trend: "down".to_string(),
            },
            TrendPoint {
                period: "Mai".to_string(),
                value: 0.81,
                trend: "up".to_string(),
            },
        ]
    }

    /// Génère un rapport statistique complet
    pub fn generate_report(&self, filter: AnalyticsFilter) -> AnalyticsReport {
        AnalyticsReport {
            generated_at: chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
            global_stats: self.calculate_global_stats(&filter),
            by_establishment_type: self.calculate_establishment_stats(&filter),
            by_department: self.calculate_department_stats(&filter),
            by_inspector: self.calculate_inspector_stats(&filter),
            time_series: self.generate_time_series(30),
            top_critical_findings: self.get_top_critical_findings(10),
            compliance_trends: self.calculate_compliance_trends(),
        }
    }

    /// Exporte les données en CSV
    pub fn export_to_csv(&self, report: &AnalyticsReport) -> String {
        let mut csv = String::new();
        
        // Entête
        csv.push_str("Statistiques d'Inspection Pharma - Généré le ");
        csv.push_str(&report.generated_at);
        csv.push('\n');
        csv.push('\n');
        
        // Stats globales
        csv.push_str("Statistiques Globales\n");
        csv.push_str("Total Inspections,Complétées,En cours,Taux Conformité,Critiques,Majeures,Minimes\n");
        csv.push_str(&format!(
            "{},{},{},{:.2}%,{},{},{}\n",
            report.global_stats.total_inspections,
            report.global_stats.completed_inspections,
            report.global_stats.in_progress_inspections,
            report.global_stats.overall_conformity_rate * 100.0,
            report.global_stats.critical_non_conformities,
            report.global_stats.major_non_conformities,
            report.global_stats.minor_non_conformities
        ));
        csv.push('\n');
        
        // Par type d'établissement
        csv.push_str("Par Type d'Établissement\n");
        csv.push_str("Type,Total,Taux Conformité,Moyenne Sévérité,Critiques\n");
        for stat in &report.by_establishment_type {
            csv.push_str(&format!(
                "{},{},{:.2}%,{:.1},{}\n",
                stat.establishment_type,
                stat.total_inspections,
                stat.conformity_rate * 100.0,
                stat.avg_severity_score,
                stat.critical_findings
            ));
        }
        csv.push('\n');
        
        csv
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_analytics_service_creation() {
        let service = AnalyticsService::new();
        assert!(true); // Just test that it can be created
    }

    #[test]
    fn test_global_stats_calculation() {
        let service = AnalyticsService::new();
        let filter = AnalyticsFilter {
            period: PeriodFilter::Month,
            department: None,
            commune: None,
            grid_type: None,
            inspection_type: None,
            inspector: None,
            conformity_status: None,
        };
        
        let stats = service.calculate_global_stats(&filter);
        assert!(stats.total_inspections > 0);
        assert!(stats.overall_conformity_rate >= 0.0 && stats.overall_conformity_rate <= 1.0);
    }

    #[test]
    fn test_time_series_generation() {
        let service = AnalyticsService::new();
        let series = service.generate_time_series(7);
        assert_eq!(series.len(), 7);
    }
}