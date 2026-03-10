use crate::grid::{CriterionBuilder, GridInfo, Section};

pub fn build() -> GridInfo {
    let mut b = CriterionBuilder::new();

    GridInfo {
        id: "grossiste".into(),
        name: "Inspection Grossiste-Répartiteur".into(),
        code: "IP-FO-0002".into(),
        version: "1".into(),
        description: "Grille d'inspection des établissements de grossiste-répartiteur selon les BPD/UEMOA".into(),
        icon: "🏭".into(),
        color: "#3b82f6".into(),
        sections: vec![
            // ── 1. ORGANISATION ET GESTION ──
            Section { id: 1, title: "Organisation et gestion".into(), items: vec![
                b.pre("BPD/I UEMOA 1.01 ; Loi 2021-03 Art 56", "L'établissement est-il dûment autorisé ? Dispose-t-il d'un pharmacien responsable de l'ensemble des opérations de distribution ?"),
                b.pre("BPD/I UEMOA 1.02", "Organigramme défini ? Responsabilités, autorité et relations clairement représentées ?"),
                b.pre("BPD/I UEMOA 1.03", "Un pharmacien nommé pour chaque site de distribution ? Responsable de la mise en œuvre du système qualité ?"),
                b.item("BPD/I UEMOA 1.04", "Le pharmacien et le personnel clé ont-ils l'autorité et les ressources pour maintenir le système d'assurance qualité ?"),
                b.item("BPD/I UEMOA 1.05, 1.06", "Absence de conflits d'intérêts, de pressions commerciales ou financières affectant la qualité ?"),
                b.item("BPD/I UEMOA 1.07", "Responsabilités individuelles clairement définies et consignées dans des descriptions de fonction écrites ?"),
                b.item("BPD/I UEMOA 1.08", "Activités sous-traitées précisées dans des cahiers des charges ou contrats écrits ? Audits réguliers ?"),
                b.item("BPD/I UEMOA 1.09", "Procédures de sécurisation existantes pour le personnel, les biens, l'environnement et l'intégrité des produits ?"),
            ]},

            // ── 2. GESTION DE LA QUALITÉ ──
            Section { id: 2, title: "Gestion de la qualité".into(), items: vec![
                b.pre("BPD/I UEMOA 1.10, 1.11", "Système d'assurance qualité en place intégrant les principes des BPD ? Schéma qualité incluant structure, procédures, procédés et moyens ?"),
                b.pre("BPD/I UEMOA 1.13", "Toutes les parties engagées dans la distribution partagent-elles la responsabilité qualité et sécurité des produits ?"),
                b.item("BPD/I UEMOA 1.14", "Commerce électronique : procédures et systèmes d'enregistrement appropriés pour la traçabilité ?"),
                b.pre("BPD/I UEMOA 1.15", "Procédures approuvées pour l'approvisionnement et la libération des livraisons ? Fournisseurs et distributeurs approuvés ?"),
                b.pre("BPD/I UEMOA 1.16", "Procédures écrites et systèmes d'enregistrement garantissant la traçabilité des produits distribués ?"),
                b.pre("BPD/I UEMOA 1.18", "Procédures approuvées pour toutes les opérations : approvisionnement, réception, stockage, préparation commandes, emballage, expédition, suivi ?"),
            ]},

            // ── 3. PERSONNEL ──
            Section { id: 3, title: "Personnel".into(), items: vec![
                b.pre("BPD/I UEMOA 1.19", "Tout le personnel engagé dans la distribution formé aux exigences des BPD ?"),
                b.pre("BPD/I UEMOA 1.20", "Personnel clé possédant compétence et expérience appropriées à ses responsabilités ?"),
                b.pre("BPD/I UEMOA 1.21", "Nombre suffisant de personnes compétentes à tous les stades de la distribution ?"),
                b.item("BPD/I UEMOA 1.22", "Qualification et expérience du personnel conformes aux réglementations nationales ?"),
                b.pre("BPD/I UEMOA 1.23", "Formation initiale et continue adaptée aux tâches ? Programme de formation écrit ? Formation évaluée ?"),
                b.item("BPD/I UEMOA 1.24", "Toutes les formations enregistrées, y compris instructions au personnel temporaire et journaliers ?"),
                b.item("BPD/I UEMOA 1.25", "Formation spécifique pour le personnel manipulant des produits dangereux (stupéfiants, produits très actifs, radioactifs) ?"),
                b.item("BPD/I UEMOA 1.26", "Port de vêtements de travail ou protecteurs adaptés ?"),
                b.item("BPD/I UEMOA 1.27", "Procédures d'hygiène du personnel adaptées aux activités (santé, hygiène, habillage) ?"),
                b.item("BPD/I UEMOA 1.28", "Procédures et conditions de travail (y compris sous-traitants, intérimaires) pour minimiser le risque de détention non autorisée ?"),
                b.item("BPD/I UEMOA 1.29", "Règles et procédures disciplinaires pour prévenir et gérer les détournements de produits ?"),
                b.item("Décret 2024-1301 ; Loi 2021-03", "Pharmacien responsable avec au moins 5 ans d'expérience en officine ou 2 ans en distribution en gros ?"),
                b.item("Loi 2021-03", "Nombre de pharmaciens adjoints conforme à la réglementation (1 par tranche de 50 employés) ?"),
            ]},

            // ── 4. DOCUMENTATION ──
            Section { id: 4, title: "Documentation".into(), items: vec![
                b.pre("BPD/I UEMOA 1.30", "Instructions écrites et enregistrements disponibles pour toutes les activités de distribution (expédition à réception) ?"),
                b.pre("BPD/I UEMOA 1.31", "Documents rédigés, approuvés, signés et datés par une personne autorisée ? Modifications préalablement approuvées ?"),
                b.item("BPD/I UEMOA 1.32", "Titre, nature et sujet clairement énoncés ? Contenu clair et non ambigu ? Conservation ordonnée et consultation aisée ?"),
                b.item("BPD/I UEMOA 1.33", "Documents revus régulièrement et mis à jour ?"),
                b.pre("BPD/I UEMOA 1.34", "Tous les enregistrements relatifs à la distribution sont accessibles pendant une période définie conforme à la réglementation ?"),
                b.item("BPD/I UEMOA 1.35", "Enregistrements informatisés protégés par des procédures de sauvegarde ? Données vérifiables pendant la période d'archivage ?"),
                b.item("BPD/I UEMOA 1.36, 1.37", "Système informatisé validé ? Protection contre accès non autorisé ? Procédure de gestion des pannes et arrêts ?"),
            ]},

            // ── 5. RÉCLAMATIONS ──
            Section { id: 5, title: "Réclamations".into(), items: vec![
                b.item("BPD/I UEMOA 1.38", "Procédure écrite pour la gestion des réclamations ? Distinction entre réclamations qualité et distribution ?"),
                b.item("BPD/I UEMOA 1.39", "Toutes les réclamations enregistrées et examinées de manière approfondie ?"),
                b.item("BPD/I UEMOA 1.40, 1.41", "Personne autorisée responsable du traitement ? Implication du pharmacien si nécessaire ?"),
                b.item("BPD/I UEMOA 1.42", "Réclamations et mesures prises enregistrées et référencées ? Révision régulière ?"),
            ]},

            // ── 6. RAPPELS ──
            Section { id: 6, title: "Rappels de produits".into(), items: vec![
                b.item("BPD/I UEMOA 1.43", "Système de rappel pour les produits reconnus ou soupçonnés comme défectueux ?"),
                b.item("BPD/I UEMOA 1.44", "Opérations de rappel effectuables à tout moment et immédiatement ?"),
                b.item("BPD/I UEMOA 1.45, 1.46", "Le pharmacien évalue-t-il le risque ? Information immédiate des autorités compétentes en cas d'intention de rappel ?"),
                b.item("BPD/I UEMOA 1.47", "Système de distribution permettant de connaître facilement l'identité et l'adresse des destinataires ? Traçabilité complète ?"),
                b.item("BPD/I UEMOA 1.48", "Produits rappelés séparés physiquement et stockés en zone sécurisée ? Statut clairement identifié ?"),
            ]},

            // ── 7. ACTIVITÉS SOUS-TRAITÉES ──
            Section { id: 7, title: "Activités sous-traitées".into(), items: vec![
                b.item("BPD/I UEMOA 1.49", "Contrat écrit entre le donneur d'ordre et le sous-traitant, définissant clairement les obligations de chaque partie ?"),
                b.item("BPD/I UEMOA 1.50", "Le sous-traitant est-il autorisé et ne sous-traite pas à une tierce partie sans accord préalable ?"),
                b.item("BPD/I UEMOA 1.51, 1.52", "Audits réguliers des sous-traitants ? Résultats documentés ?"),
            ]},

            // ── 8. AUTO-INSPECTIONS ET AUDITS ──
            Section { id: 8, title: "Auto-inspections et audits".into(), items: vec![
                b.item("BPD/I UEMOA 1.53", "Auto-inspections réalisées régulièrement pour vérifier l'application et le respect des BPD ?"),
                b.item("BPD/I UEMOA 1.54", "Programme d'auto-inspection couvrant tous les aspects des BPD, les règles d'hygiène et la réglementation ?"),
                b.item("BPD/I UEMOA 1.55", "Auto-inspections enregistrées ? Rapport incluant constatations, évaluations, conclusions et actions correctives ?"),
                b.item("BPD/I UEMOA 1.56", "Actions correctives mises en œuvre de manière effective et dans les délais prévus ?"),
            ]},

            // ── 9. LOCAUX ──
            Section { id: 9, title: "Locaux".into(), items: vec![
                b.pre("BPD/I UEMOA 2.01", "Locaux suffisamment vastes et bien entretenus pour le stockage dans des conditions n'affectant pas la qualité ?"),
                b.pre("BPD/I UEMOA 2.02", "Zones de stockage conçues et équipées pour respecter les différentes conditions de stockage ?"),
                b.pre("BPD/I UEMOA 2.03", "Programme de lutte contre les nuisibles (insectes, rongeurs, oiseaux) ?"),
                b.pre("BPD/I UEMOA 2.04", "Précautions contre l'entrée de personnes non autorisées dans les zones de stockage ?"),
                b.pre("BPD/I UEMOA 2.05", "Disposition logique des locaux : réception, quarantaine, stockage, préparation commandes, emballage, contrôle, expédition ?"),
                b.pre("BPD/I UEMOA 2.06", "Capacité suffisante pour le stockage ordonné des différentes catégories (vrac, finis, quarantaine, libérés, refusés, retournés, rappelés) ?"),
            ]},

            // ── 10. LOCAUX DE RÉCEPTION ──
            Section { id: 10, title: "Locaux de réception".into(), items: vec![
                b.pre("BPD/I UEMOA 2.07", "Quais protégés des intempéries ? Aires de réception permettant le nettoyage des colis ?"),
                b.pre("BPD/I UEMOA 2.08", "Zone de quarantaine clairement délimitée ? Accès restreint au personnel autorisé ?"),
                b.pre("BPD/I UEMOA 2.09", "Produits refusés identifiés et maintenus sous quarantaine ? Stockage séparé des produits périmés, retournés ou rappelés ?"),
            ]},

            // ── 11. ZONES DE STOCKAGE ──
            Section { id: 11, title: "Zones et conditions de stockage".into(), items: vec![
                b.pre("BPD/I UEMOA 2.10", "Capacité suffisante et stockage ordonné et logique ? Rotation des stocks (FEFO/FIFO) ?"),
                b.pre("BPD/I UEMOA 2.11", "Conditions de propreté et d'entretien (pas d'accumulation de déchets, pas de nuisibles) ?"),
                b.pre("BPD/I UEMOA 2.12", "Installations adéquates pour les produits nécessitant des conditions particulières (température, humidité) ?"),
                b.pre("BPD/I UEMOA 2.13", "Température, hygiène et luminosité des zones de stockage surveillées ? Instruments de surveillance étalonnés ?"),
                b.item("BPD/I UEMOA 2.14", "Cartographie de température (mapping) effectuée dans les zones de stockage ?"),
                b.pre("BPD/I UEMOA 2.15", "Stockage des stupéfiants et produits dangereux conforme à la réglementation (zone sécurisée, accès limité) ?"),
                b.item("BPD/I UEMOA 2.16", "Produits radioactifs, inflammables, gaz sous pression : zones dédiées conformes ?"),
            ]},

            // ── 12. VÉHICULES ET MATÉRIELS ──
            Section { id: 12, title: "Véhicules et matériels".into(), items: vec![
                b.item("BPD/I UEMOA 2.17", "Matériels et véhicules adaptés pour protéger les produits contre les agressions extérieures (température, lumière, humidité, contamination) ?"),
                b.item("BPD/I UEMOA 2.18", "Programme d'entretien et de qualification des véhicules et matériels ? Enregistrements des interventions ?"),
                b.item("BPD/I UEMOA 2.19", "Équipements de surveillance de la température et de l'humidité dans les véhicules, si nécessaire ? Étalonnés à intervalles définis ?"),
            ]},

            // ── 13. APPROVISIONNEMENT ──
            Section { id: 13, title: "Approvisionnement".into(), items: vec![
                b.pre("BPD/I UEMOA 3.01", "Produits approvisionnés uniquement auprès d'entités dûment autorisées ?"),
                b.pre("BPD/I UEMOA 3.02", "Enregistrements des commandes et livraisons disponibles et conservés ?"),
                b.item("BPD/I UEMOA 3.03, 3.04", "Vérifications à la réception : intégrité des emballages, concordance avec le bon de commande, conditions de transport, étiquetage ?"),
                b.item("Loi 97-025 art 68", "Commandes de stupéfiants avec carnet à souches (conserver 10 ans) ?"),
            ]},

            // ── 14. OPÉRATIONS DE STOCKAGE ──
            Section { id: 14, title: "Opérations de stockage".into(), items: vec![
                b.item("BPD/I UEMOA 3.05, 3.06", "Produits stockés en fonction de leur statut (quarantaine, libéré, refusé) ? Zones identifiées ?"),
                b.item("BPD/I UEMOA 3.07, 3.08", "Conditions de stockage conformes aux AMM ? Produits thermosensibles dans des enceintes qualifiées ?"),
                b.item("BPD/I UEMOA 3.09", "Produits à accès restreint (stupéfiants, substances psychotropes) dans des zones sécurisées ?"),
                b.item("BPD/I UEMOA 3.10", "Système de rotation des stocks mis en place (FEFO/FIFO) ?"),
                b.item("BPD/I UEMOA 3.11, 3.12", "Vérification systématique des péremptions ? Produits périmés séparés et détruits ?"),
                b.item("BPD/I UEMOA 3.13", "Inventaires réguliers ? Écarts investigués et documentés ?"),
                b.item("BPD/I UEMOA 3.14", "Inventaires complets réalisés au moins une fois par trimestre ?"),
            ]},

            // ── 15. PRÉPARATION DES COMMANDES ──
            Section { id: 15, title: "Préparation des commandes".into(), items: vec![
                b.item("BPD/I UEMOA 3.15", "Procédure écrite pour la préparation des commandes ? Contrôle des quantités et des produits avant expédition ?"),
                b.item("BPD/I UEMOA 3.16", "Documents d'accompagnement joints aux livraisons (nom du produit, forme, dosage, quantité, numéro de lot, péremption) ?"),
                b.item("BPD/I UEMOA 3.17", "Enregistrements conservés permettant de retrouver l'identité de l'acheteur et du produit ?"),
                b.item("BPD/I UEMOA 3.18", "Vente uniquement aux entités autorisées (officines, PUI, autres grossistes autorisés) ?"),
            ]},

            // ── 16. EXPÉDITION, TRANSPORT ET LIVRAISON ──
            Section { id: 16, title: "Expédition, transport et livraison".into(), items: vec![
                b.item("BPD/I UEMOA 4.01", "Conditions d'emballage et de transport garantissant l'intégrité et la qualité des produits ?"),
                b.item("BPD/I UEMOA 4.02, 4.03", "Expédition conforme aux principes FEFO ? Étiquetage clair des colis avec informations de stockage ?"),
                b.item("BPD/I UEMOA 4.04 à 4.08", "Chaîne du froid maintenue pour les produits thermosensibles ? Enregistrements de température pendant le transport ?"),
                b.item("BPD/I UEMOA 4.09, 4.10", "Précautions pour empêcher le vol ou le détournement ? Conteneurs scellés si nécessaire ?"),
                b.item("BPD/I UEMOA 4.11 à 4.14", "Véhicules de transport adaptés ? Nettoyés et entretenus ? Produits alimentaires ou chimiques non transportés simultanément ?"),
                b.item("BPD/I UEMOA 4.15, 4.16", "Calendriers de livraison et itinéraires réalistes ? Volumes commandés compatibles avec les capacités de stockage ?"),
                b.item("BPD/I UEMOA 4.17, 4.18", "Vérification et enregistrement de l'état des colis à la livraison ? Respect des conditions de transport (température, humidité) ?"),
            ]},

            // ── 17. PRODUITS REFUSÉS, RETOURNÉS ET RAPPELÉS ──
            Section { id: 17, title: "Produits refusés, retournés et rappelés".into(), items: vec![
                b.item("BPD/I UEMOA 5.01", "Produits refusés clairement identifiés et stockés séparément pour empêcher leur distribution ?"),
                b.item("BPD/I UEMOA 5.02", "Enregistrements des retours incluant : nom du produit, forme, dosage, lot, quantité, motif, date ?"),
                b.item("BPD/I UEMOA 5.03", "Procédure pour la destruction des produits non utilisables (périmés, défectueux) ? Traçabilité des destructions ?"),
                b.item("BPD/I UEMOA 5.04, 5.05", "Produits retournés placés en quarantaine et évalués avant toute redistribution ? Conditions de stockage et de transport vérifiées ?"),
                b.item("BPD/I UEMOA 5.06", "Produits falsifiés suspectés immédiatement isolés et signalés aux autorités compétentes ?"),
            ]},

            // ── 18. CONTREFAÇON ET PSQIF ──
            Section { id: 18, title: "Lutte contre la contrefaçon / PSQIF".into(), items: vec![
                b.item("BPD/I UEMOA 6.01 à 6.03", "Système de prévention et de détection des produits de qualité inférieure et falsifiés (PSQIF) ?"),
                b.item("BPD/I UEMOA 6.04", "Procédures de vérification de l'authenticité des produits reçus ?"),
                b.item("BPD/I UEMOA 6.05", "Personnel formé à la détection des produits falsifiés ? Circuit d'alerte défini ?"),
                b.item("Loi 2021-03 Art 23, 24", "Notification des cas suspectés aux autorités compétentes (ABMed) ?"),
            ]},
        ],
    }
}
