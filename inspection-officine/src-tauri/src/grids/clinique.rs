//! Grille d'inspection pour les cliniques privées
//!
//! Cette grille suit les normes applicables aux cliniques privées,
//! en mettant l'accent sur la gestion, la qualité des soins et la sécurité.

use crate::grid::{CriterionBuilder, GridInfo, Section};

pub fn build() -> GridInfo {
    let mut b = CriterionBuilder::new();

    GridInfo {
        id: "clinique".into(),
        name: "Inspection Clinique Privée".into(),
        code: "IP-C-0001".into(),
        version: "1".into(),
        description: "Grille d'inspection des cliniques privées selon les référentiels sanitaires".into(),
        icon: "⚕️".into(),
        color: "#0ea5e9".into(), // bleu ciel pour clinique
        sections: vec![
            Section { 
                id: 1, 
                title: "Autorisations et structure".into(), 
                items: vec![
                    b.pre("Loi 2021-03 Art 46", "Autorisation d'ouverture et d'exploitation"),
                    b.item("Décret établissements privés", "Conformité à l'acte d'autorisation"),
                    b.item("", "Respect des conditions d'autorisation"),
                    b.item("", "Déclaration d'activité auprès de l'ABMed"),
                    b.item("", "Assurances responsabilité civile"),
                    b.item("", "Convention avec organismes de santé"),
                    b.item("", "Tenue d'un registre d'établissement"),
                ]
            },
            Section { 
                id: 2, 
                title: "Direction et gouvernance".into(), 
                items: vec![
                    b.pre("Normes ISO 9001", "Management de la qualité"),
                    b.item("", "Organigramme fonctionnel"),
                    b.item("", "Rôles et responsabilités définis"),
                    b.item("", "Politique qualité et sécurité"),
                    b.item("", "Procédures de reporting"),
                    b.item("", "Gestion des plaintes et réclamations"),
                    b.item("", "Amélioration continue"),
                ]
            },
            Section { 
                id: 3, 
                title: "Ressources humaines".into(), 
                items: vec![
                    b.pre("Décret 1296 Art 21", "Qualification du personnel médical"),
                    b.item("Décret 1296 Art 22", "Ratio personnel/structure"),
                    b.item("Décret 1296 Art 23", "Formation continue obligatoire"),
                    b.item("", "Fiches de poste et descriptions"),
                    b.item("", "Évaluation de performance"),
                    b.item("", "Dossier individuel du personnel"),
                    b.item("", "Conditions de travail et santé au travail"),
                ]
            },
            Section { 
                id: 4, 
                title: "Sécurité des patients".into(), 
                items: vec![
                    b.pre("OMS Patient Safety", "Programme sécurité des patients"),
                    b.item("", "Identification des risques"),
                    b.item("", "Procédures urgences et hémodialyse"),
                    b.item("", "Prévention infections associées aux soins"),
                    b.item("", "Gestion des incidents et accidents"),
                    b.item("", "Hygiène et antisepsie"),
                    b.item("", "Sécurité des dispositifs médicaux"),
                ]
            },
            Section { 
                id: 5, 
                title: "Qualité des soins ambulatoires".into(), 
                items: vec![
                    b.pre("Recommandations HAS", "Protocoles soins ambulatoires"),
                    b.item("", "Suivi patients à risque"),
                    b.item("", "Programmes de dépistage"),
                    b.item("", "Vaccination et prophylaxie"),
                    b.item("", "Santé reproductive"),
                    b.item("", "Consultations spécialisées"),
                    b.item("", "Orientation vers hôpitaux si nécessaire"),
                ]
            },
            Section { 
                id: 6, 
                title: "Bloc et salle de soins".into(), 
                items: vec![
                    b.pre("Normes NF X31-027", "Installation et équipement"),
                    b.item("", "Qualification du personnel technique"),
                    b.item("", "Procédures d'asepsie"),
                    b.item("", "Gestion instruments et stérilisation"),
                    b.item("", "Maintenance des équipements"),
                    b.item("", "Prévention infections liées aux soins"),
                    b.item("", "Registre interventions"),
                ]
            },
            Section { 
                id: 7, 
                title: "Laboratoire de biologie".into(), 
                items: vec![
                    b.pre("Normes ISO 15189", "Accréditation et bonnes pratiques"),
                    b.item("", "Validation méthodes analytiques"),
                    b.item("", "Traçabilité des analyses"),
                    b.item("", "Participations aux essais de précision"),
                    b.item("", "Conservation échantillons"),
                    b.item("", "Qualité résultats rapportés"),
                    b.item("", "Communication résultats"),
                ]
            },
            Section { 
                id: 8, 
                title: "Radiologie et imagerie".into(), 
                items: vec![
                    b.pre("Normes IRSN", "Protection radiologique"),
                    b.item("", "Qualification du personnel"),
                    b.item("", "Maintenance et contrôle qualité"),
                    b.item("", "Protection patients"),
                    b.item("", "Gestion déchets radiologiques"),
                    b.item("", "Archivage images"),
                    b.item("", "Sécurité patients et personnel"),
                ]
            },
            Section { 
                id: 9, 
                title: "Pharmacie clinique".into(), 
                items: vec![
                    b.pre("Décret 1296 Art 30", "Organisation service"),
                    b.item("Décret 1296 Art 31", "Stockage médicaments"),
                    b.item("Décret 1296 Art 32", "Dispensation contrôlée"),
                    b.item("", "Vigilance et pharmacovigilance"),
                    b.item("", "Préparation magistrales"),
                    b.item("", "Stock de médicaments essentiels"),
                    b.item("", "Stock rupture produits"),
                ]
            },
            Section { 
                id: 10, 
                title: "Hémodialyse".into(), 
                items: vec![
                    b.pre("Recommandations SFNDT", "Installation unité dialyse"),
                    b.item("", "Qualification personnel"),
                    b.item("", "Maintenance machines"),
                    b.item("", "Qualité de l'eau de dialyse"),
                    b.item("", "Prévention infections"),
                    b.item("", "Surveillance patients"),
                    b.item("", "Gestion urgences"),
                ]
            },
            Section { 
                id: 11, 
                title: "Hygiène et environnement".into(), 
                items: vec![
                    b.pre("Normes WHO WASH", "Approvisionnement en eau"),
                    b.item("", "Traitement eaux usées"),
                    b.item("", "Gestion des déchets médicaux"),
                    b.item("", "Nettoyage et désinfection"),
                    b.item("", "Aération et ventilation"),
                    b.item("", "Confort thermique lumineux"),
                    b.item("", "Accessibilité PMR"),
                ]
            },
            Section { 
                id: 12, 
                title: "Système d'information".into(), 
                items: vec![
                    b.pre("Normes HL7/FHIR", "Système d'information médicale"),
                    b.item("", "Dossier patient informatisé"),
                    b.item("", "Confidentialité données"),
                    b.item("", "Transmission inter-services"),
                    b.item("", "Archivage documents"),
                    b.item("", "Sécurité informatique"),
                    b.item("", "Continuité activité"),
                ]
            },
            Section { 
                id: 13, 
                title: "Auto-contrôle et audit".into(), 
                items: vec![
                    b.pre("Normes EFQM", "Processus d'amélioration continue"),
                    b.item("", "Audit interne régulier"),
                    b.item("", "Analyse indicateurs qualité"),
                    b.item("", "Plans action correctifs"),
                    b.item("", "Satisfaction patients"),
                    b.item("", "Suivi actions corrective"),
                    b.item("", "Certification qualité"),
                ]
            },
        ],
    }
}