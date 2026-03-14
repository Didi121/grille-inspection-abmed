//! Grille d'inspection pour les hôpitaux
//!
//! Cette grille suit les normes et référentiels applicables aux hôpitaux,
//! incluant les aspects de gestion, qualité, sécurité des patients, etc.

use crate::grid::{CriterionBuilder, GridInfo, Section};

pub fn build() -> GridInfo {
    let mut b = CriterionBuilder::new();

    GridInfo {
        id: "hopital".into(),
        name: "Inspection Hôpital".into(),
        code: "IP-H-0001".into(),
        version: "1".into(),
        description: "Grille d'inspection des hôpitaux selon les référentiels nationaux et internationaux".into(),
        icon: "🏥".into(),
        color: "#ef4444".into(), // rouge pour hôpital
        sections: vec![
            Section { 
                id: 1, 
                title: "Structure et organisation".into(), 
                items: vec![
                    b.pre("Loi 2021-03 Art 46", "Autorisation d'ouverture et fonctionnement"),
                    b.item("Décret 1296 Art 15", "Organigramme de l'établissement"),
                    b.item("Décret 1296 Art 16", "Direction médicale et pharmaceutique"),
                    b.item("Décret 1296 Art 17", "Service de surveillance sanitaire"),
                    b.item("", "Plan de développement institutionnel"),
                    b.item("", "Budget et comptabilité"),
                    b.pre("Normes ISO 9001", "Système de management de la qualité"),
                ]
            },
            Section { 
                id: 2, 
                title: "Ressources humaines".into(), 
                items: vec![
                    b.pre("Décret 1296 Art 21", "Qualifications des professionnels"),
                    b.item("Décret 1296 Art 22", "Nombre de personnel par service"),
                    b.item("Décret 1296 Art 23", "Formation continue du personnel"),
                    b.item("", "Programme de formation annuel"),
                    b.item("", "Evaluation de performance"),
                    b.item("", "Conditions de travail et sécurité"),
                    b.item("", "Gestion des absences et turnover"),
                ]
            },
            Section { 
                id: 3, 
                title: "Sécurité des patients".into(), 
                items: vec![
                    b.pre("OMS Patient Safety", "Programme de sécurité des patients"),
                    b.item("", "Signalement et analyse des incidents"),
                    b.item("", "Procédures de transfert des patients"),
                    b.item("", "Prévention des infections nosocomiales"),
                    b.item("", "Gestion des risques et accidents"),
                    b.item("", "Hygiène des mains et environnement"),
                    b.item("", "Sécurité des dispositifs médicaux"),
                ]
            },
            Section { 
                id: 4, 
                title: "Qualité des soins".into(), 
                items: vec![
                    b.pre("Normes ISO 15189", "Laboratoires de biologie médicale"),
                    b.item("", "Protocoles de soins standardisés"),
                    b.item("", "Audit clinique interne"),
                    b.item("", "Indicateurs de qualité des soins"),
                    b.item("", "Gestion de la douleur"),
                    b.item("", "Soins palliatifs"),
                    b.item("", "Droit des patients et information"),
                ]
            },
            Section { 
                id: 5, 
                title: "Médecine d'urgence".into(), 
                items: vec![
                    b.pre("Décret Urgences", "Organisation du service d'urgence"),
                    b.item("", "Moyens humains et matériels"),
                    b.item("", "Temps d'accueil et de prise en charge"),
                    b.item("", "Classification des patients (triage)"),
                    b.item("", "Protocoles d'urgence"),
                    b.item("", "Communication inter-services"),
                    b.item("", "Recommandations SAMU"),
                ]
            },
            Section { 
                id: 6, 
                title: "Bloc opératoire".into(), 
                items: vec![
                    b.pre("Normes NF X31-027", "Installation et équipement"),
                    b.item("", "Qualification du personnel"),
                    b.item("", "Procédures d'asepsie"),
                    b.item("", "Gestion des instruments et stérilisation"),
                    b.item("", "Maintenance des équipements"),
                    b.item("", "Prévention des infections du site opératoire"),
                    b.item("", "Archivage des dossiers d'intervention"),
                ]
            },
            Section { 
                id: 7, 
                title: "Pharmacie hospitalière".into(), 
                items: vec![
                    b.pre("Décret 1296 Art 30", "Organisation du service de pharmacie"),
                    b.item("Décret 1296 Art 31", "Stockage des médicaments"),
                    b.item("Décret 1296 Art 32", "Distribution et dispensation"),
                    b.item("", "Vigilance et pharmaco-épidémiologie"),
                    b.item("", "Comité de pharmacovigilance"),
                    b.item("", "Préparation magistrale et stérile"),
                    b.item("", "Contrôle qualité laboratoire"),
                ]
            },
            Section { 
                id: 8, 
                title: "Maternité".into(), 
                items: vec![
                    b.pre("Recommandations HAS", "Organisation et équipement"),
                    b.item("", "Conditions d'admission et d'accouchement"),
                    b.item("", "Surveillance de la femme enceinte"),
                    b.item("", "Suivi de la grossesse à risque"),
                    b.item("", "Prise en charge du nouveau-né"),
                    b.item("", "Prophylaxie et vaccination"),
                    b.item("", "Accompagnement post-partum"),
                ]
            },
            Section { 
                id: 9, 
                title: "Réanimation et soins intensifs".into(), 
                items: vec![
                    b.pre("Recommandations SFAR", "Equipement et moyens"),
                    b.item("", "Qualification du personnel"),
                    b.item("", "Protocoles thérapeutiques"),
                    b.item("", "Surveillance hémodynamique"),
                    b.item("", "Ventilation mécanique"),
                    b.item("", "Nutrition en réanimation"),
                    b.item("", "Prévention des complications"),
                ]
            },
            Section { 
                id: 10, 
                title: "Radiologie et imagerie médicale".into(), 
                items: vec![
                    b.pre("Normes IRSN", "Protection radiologique"),
                    b.item("", "Qualification du personnel"),
                    b.item("", "Maintenance et contrôle qualité"),
                    b.item("", "Protection des patients"),
                    b.item("", "Gestion des déchets radiologiques"),
                    b.item("", "Archivage des images"),
                    b.item("", "Sécurité des patients et personnel"),
                ]
            },
            Section { 
                id: 11, 
                title: "Hygiène et assainissement".into(), 
                items: vec![
                    b.pre("Normes WHO WASH", "Approvisionnement en eau"),
                    b.item("", "Traitement des eaux usées"),
                    b.item("", "Gestion des déchets"),
                    b.item("", "Nettoyage et désinfection"),
                    b.item("", "Lutte contre les vecteurs"),
                    b.item("", "Contrôle des nuisances"),
                    b.item("", "Maintenance bâtiment"),
                ]
            },
            Section { 
                id: 12, 
                title: "Transmission d'information".into(), 
                items: vec![
                    b.pre("Normes HL7/FHIR", "Système d'information médicale"),
                    b.item("", "Dossier patient informatisé"),
                    b.item("", "Confidentialité et sécurité des données"),
                    b.item("", "Transmission inter-services"),
                    b.item("", "Archivage des documents"),
                    b.item("", "Sécurité informatique"),
                    b.item("", "Continuité d'activité informatique"),
                ]
            },
            Section { 
                id: 13, 
                title: "Auto-évaluation et amélioration continue".into(), 
                items: vec![
                    b.pre("Normes EFQM", "Processus d'amélioration continue"),
                    b.item("", "Auto-audit interne"),
                    b.item("", "Analyse des indicateurs"),
                    b.item("", "Plans d'action correctifs"),
                    b.item("", "Satisfaction des patients"),
                    b.item("", "Suivi des actions d'amélioration"),
                    b.item("", "Certification qualité"),
                ]
            },
        ],
    }
}