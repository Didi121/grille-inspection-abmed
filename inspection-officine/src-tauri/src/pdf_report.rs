//! Module de génération de rapports PDF pour l'application d'inspection pharma
//! 
//! Ce module utilise printpdf pour générer des rapports d'inspection au format PDF
//! avec mise en page professionnelle, charts, et conformité aux standards documentaires.

use printpdf::*;
use std::fs::File;
use std::io::BufWriter;
use std::collections::HashMap;

/// Données d'inspection pour le rapport
#[derive(Debug, Clone)]
pub struct InspectionData {
    pub inspection_id: String,
    pub establishment_name: String,
    pub establishment_type: String,
    pub inspection_date: String,
    pub inspector_name: String,
    pub department: String,
    pub commune: String,
    pub conformity_rate: f64,
    pub critical_findings: u32,
    pub major_findings: u32,
    pub minor_findings: u32,
    pub sections: Vec<SectionData>,
    pub metadata: HashMap<String, String>,
}

/// Données d'une section d'inspection
#[derive(Debug, Clone)]
pub struct SectionData {
    pub section_id: u32,
    pub section_title: String,
    pub total_criteria: u32,
    pub conforming_criteria: u32,
    pub non_conforming_criteria: u32,
    pub not_applicable_criteria: u32,
    pub findings: Vec<FindingData>,
}

/// Donnée d'un finding individuel
#[derive(Debug, Clone)]
pub struct FindingData {
    pub criterion_reference: String,
    pub criterion_description: String,
    pub is_conforming: Option<bool>,
    pub observation: String,
    pub severity: Option<String>,
    pub immediate_danger: bool,
}

/// Configuration du style du rapport
pub struct ReportStyle {
    pub primary_color: (f32, f32, f32), // RGB 0-1
    pub secondary_color: (f32, f32, f32),
    pub font_family: &'static str,
    pub header_font_size: f32,
    pub title_font_size: f32,
    pub subtitle_font_size: f32,
    pub body_font_size: f32,
    pub footer_font_size: f32,
}

impl Default for ReportStyle {
    fn default() -> Self {
        Self {
            primary_color: (0.2, 0.4, 0.8), // Bleu ABMed
            secondary_color: (0.1, 0.3, 0.6),
            font_family: "Helvetica",
            header_font_size: 16.0,
            title_font_size: 14.0,
            subtitle_font_size: 12.0,
            body_font_size: 10.0,
            footer_font_size: 8.0,
        }
    }
}

/// Générateur de rapports PDF
pub struct PdfReportGenerator {
    style: ReportStyle,
}

impl PdfReportGenerator {
    pub fn new(style: Option<ReportStyle>) -> Self {
        Self {
            style: style.unwrap_or_default(),
        }
    }

    /// Génère un rapport d'inspection complet en PDF
    pub fn generate_inspection_report(
        &self,
        data: &InspectionData,
        output_path: &str,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Créer le document PDF
        let (doc, page1, layer1) = PdfDocument::new(
            format!("Rapport d'inspection - {}", data.establishment_name),
            Mm(210.0),
            Mm(297.0),
            "Page 1".to_owned(),
        );

        // Créer une couche pour le contenu
        let current_layer = doc.get_page(page1).get_layer(layer1);

        // Ajouter l'en-tête
        self.add_header(&current_layer, data)?;

        // Ajouter la couverture
        self.add_cover_page(&current_layer, data)?;

        // Ajouter le sommaire
        self.add_table_of_contents(&current_layer, data)?;

        // Ajouter les statistiques générales
        self.add_general_statistics(&current_layer, data)?;

        // Ajouter les détails par section
        self.add_section_details(&current_layer, data)?;

        // Ajouter les annexes
        self.add_appendices(&current_layer, data)?;

        // Ajouter le pied de page
        self.add_footer(&current_layer, data)?;

        // Sauvegarder le document
        doc.save(&mut BufWriter::new(File::create(output_path)?))?;

        Ok(())
    }

    /// Ajoute l'en-tête du document
    fn add_header(
        &self,
        layer: &PdfLayerReference,
        data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Logo (simulation - dans une vraie implémentation, on chargerait une image)
        layer.use_text(
            "🏥",
            self.style.header_font_size,
            Mm(20.0),
            Mm(280.0),
            &self.create_font()?,
        );

        // Titre principal
        layer.use_text(
            "AGENCE BÉNINOISE DU MÉDICAMENT",
            self.style.subtitle_font_size,
            Mm(40.0),
            Mm(280.0),
            &self.create_font()?,
        );

        layer.use_text(
            "RAPPORT D'INSPECTION PHARMACEUTIQUE",
            self.style.title_font_size,
            Mm(40.0),
            Mm(270.0),
            &self.create_font()?,
        );

        // Ligne de séparation
        /*
        layer.add_line(
            (Mm(20.0), Mm(265.0)).into(),
            (Mm(190.0), Mm(265.0)).into(),
        );
        */

        Ok(())
    }

    /// Ajoute la page de couverture
    fn add_cover_page(
        &self,
        layer: &PdfLayerReference,
        data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Informations principales
        let y_start = Mm(240.0);
        self.add_text_block(
            layer,
            "ÉTABLISSEMENT INSPECTÉ",
            data.establishment_name.as_str(),
            Mm(40.0),
            y_start,
        )?;

        self.add_text_block(
            layer,
            "TYPE D'ÉTABLISSEMENT",
            data.establishment_type.as_str(),
            Mm(40.0),
            y_start - Mm(15.0),
        )?;

        self.add_text_block(
            layer,
            "DATE D'INSPECTION",
            data.inspection_date.as_str(),
            Mm(40.0),
            y_start - Mm(30.0),
        )?;

        self.add_text_block(
            layer,
            "INSPECTEUR",
            data.inspector_name.as_str(),
            Mm(40.0),
            y_start - Mm(45.0),
        )?;

        // Résumé des résultats
        layer.use_text(
            "RÉSUMÉ DES RÉSULTATS",
            self.style.title_font_size,
            Mm(40.0),
            y_start - Mm(65.0),
            &self.create_font()?,
        );

        self.add_result_box(
            layer,
            "Taux de conformité",
            &format!("{:.1}%", data.conformity_rate * 100.0),
            Mm(40.0),
            y_start - Mm(80.0),
        )?;

        self.add_result_box(
            layer,
            "Findings critiques",
            &data.critical_findings.to_string(),
            Mm(80.0),
            y_start - Mm(80.0),
        )?;

        self.add_result_box(
            layer,
            "Findings majeurs",
            &data.major_findings.to_string(),
            Mm(120.0),
            y_start - Mm(80.0),
        )?;

        self.add_result_box(
            layer,
            "Findings mineurs",
            &data.minor_findings.to_string(),
            Mm(160.0),
            y_start - Mm(80.0),
        )?;

        Ok(())
    }

    /// Ajoute le sommaire
    fn add_table_of_contents(
        &self,
        layer: &PdfLayerReference,
        _data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        layer.use_text(
            "SOMMAIRE",
            self.style.title_font_size,
            Mm(20.0),
            Mm(190.0),
            &self.create_font()?,
        );

        let toc_items = vec![
            ("1. Informations générales", Mm(180.0)),
            ("2. Statistiques générales", Mm(170.0)),
            ("3. Résultats par section", Mm(160.0)),
            ("4. Findings détaillés", Mm(150.0)),
            ("5. Recommandations", Mm(140.0)),
            ("6. Annexes", Mm(130.0)),
        ];

        let mut y_pos = Mm(180.0);
        for (title, _) in toc_items {
            layer.use_text(
                title,
                self.style.body_font_size,
                Mm(30.0),
                y_pos,
                &self.create_font()?,
            );
            y_pos -= Mm(8.0);
        }

        Ok(())
    }

    /// Ajoute les statistiques générales
    fn add_general_statistics(
        &self,
        layer: &PdfLayerReference,
        data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        layer.use_text(
            "STATISTIQUES GÉNÉRALES",
            self.style.title_font_size,
            Mm(20.0),
            Mm(110.0),
            &self.create_font()?,
        );

        // Calculer le nombre total de critères
        let total_criteria: u32 = data.sections.iter().map(|s| s.total_criteria).sum();
        let conforming_criteria: u32 = data.sections.iter().map(|s| s.conforming_criteria).sum();
        let non_conforming_criteria: u32 = data.sections.iter().map(|s| s.non_conforming_criteria).sum();

        let stats = vec![
            ("Total critères évalués", total_criteria.to_string()),
            ("Critères conformes", conforming_criteria.to_string()),
            ("Critères non-conformes", non_conforming_criteria.to_string()),
            ("Taux de conformité", format!("{:.1}%", data.conformity_rate * 100.0)),
            ("Département", data.department.clone()),
            ("Commune", data.commune.clone()),
        ];

        let mut y_pos = Mm(100.0);
        for (label, value) in stats {
            self.add_text_block(layer, label, &value, Mm(30.0), y_pos)?;
            y_pos -= Mm(10.0);
        }

        Ok(())
    }

    /// Ajoute les détails par section
    fn add_section_details(
        &self,
        layer: &PdfLayerReference,
        data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        layer.use_text(
            "DÉTAILS PAR SECTION",
            self.style.title_font_size,
            Mm(20.0),
            Mm(40.0),
            &self.create_font()?,
        );

        let mut y_pos = Mm(30.0);
        for section in &data.sections {
            if y_pos < Mm(20.0) {
                // Ajouter une nouvelle page si nécessaire (simplifié ici)
                break;
            }

            // Titre de la section
            layer.use_text(
                &format!("{}. {}", section.section_id, section.section_title),
                self.style.subtitle_font_size,
                Mm(25.0),
                y_pos,
                &self.create_font()?,
            );
            y_pos -= Mm(7.0);

            // Statistiques de la section
            let section_stats = vec![
                ("Total critères", section.total_criteria.to_string()),
                ("Conformes", section.conforming_criteria.to_string()),
                ("Non-conformes", section.non_conforming_criteria.to_string()),
                ("Non applicables", section.not_applicable_criteria.to_string()),
            ];

            let mut x_pos = Mm(30.0);
            for (label, value) in section_stats {
                layer.use_text(
                    &format!("{}: {}", label, value),
                    self.style.body_font_size - 1.0,
                    x_pos,
                    y_pos,
                    &self.create_font()?,
                );
                x_pos += Mm(35.0);
            }
            y_pos -= Mm(10.0);

            // Findings de la section
            if !section.findings.is_empty() {
                layer.use_text(
                    "Findings:",
                    self.style.body_font_size,
                    Mm(35.0),
                    y_pos,
                    &self.create_font()?,
                );
                y_pos -= Mm(5.0);

                for finding in &section.findings {
                    if y_pos < Mm(20.0) {
                        break;
                    }

                    let status = match finding.is_conforming {
                        Some(true) => "✓ Conforme",
                        Some(false) => "✕ Non-conforme",
                        None => "○ Non évalué",
                    };

                    layer.use_text(
                        &format!("- [{}] {}", status, finding.criterion_description),
                        self.style.body_font_size - 1.0,
                        Mm(40.0),
                        y_pos,
                        &self.create_font()?,
                    );
                    y_pos -= Mm(4.0);

                    if !finding.observation.is_empty() {
                        layer.use_text(
                            &format!("  Observation: {}", finding.observation),
                            self.style.body_font_size - 2.0,
                            Mm(45.0),
                            y_pos,
                            &self.create_font()?,
                        );
                        y_pos -= Mm(4.0);
                    }
                }
                y_pos -= Mm(5.0);
            }
        }

        Ok(())
    }

    /// Ajoute les annexes
    fn add_appendices(
        &self,
        layer: &PdfLayerReference,
        _data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        layer.use_text(
            "ANNEXES",
            self.style.title_font_size,
            Mm(20.0),
            Mm(200.0),
            &self.create_font()?,
        );

        let annexes = vec![
            "Annexe A: Grille d'inspection utilisée",
            "Annexe B: Photos de l'inspection",
            "Annexe C: Documents vérifiés",
            "Annexe D: Équipe d'inspection",
        ];

        let mut y_pos = Mm(190.0);
        for annex in annexes {
            layer.use_text(
                annex,
                self.style.body_font_size,
                Mm(30.0),
                y_pos,
                &self.create_font()?,
            );
            y_pos -= Mm(6.0);
        }

        Ok(())
    }

    /// Ajoute le pied de page
    fn add_footer(
        &self,
        layer: &PdfLayerReference,
        data: &InspectionData,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Ligne de séparation
        /*
        layer.add_line(
            (Mm(20.0), Mm(15.0)).into(),
            (Mm(190.0), Mm(15.0)).into(),
        );
        */

        // Informations du pied de page
        layer.use_text(
            format!("ID inspection: {}", data.inspection_id).as_str(),
            self.style.footer_font_size,
            Mm(20.0),
            Mm(10.0),
            &self.create_font()?,
        );

        layer.use_text(
            format!("Généré le: {}", chrono::Utc::now().format("%d/%m/%Y")),
            self.style.footer_font_size,
            Mm(150.0),
            Mm(10.0),
            &self.create_font()?,
        );

        layer.use_text(
            "Page 1",
            self.style.footer_font_size,
            Mm(180.0),
            Mm(10.0),
            &self.create_font()?,
        );

        Ok(())
    }

    /// Crée une police pour le document
    fn create_font(&self) -> Result<IndirectFontRef, Box<dyn std::error::Error>> {
        // Dans une vraie implémentation, on utiliserait une police incorporée
        // Pour cet exemple, nous simulons la création d'une police
        Ok(IndirectFontRef::new("Helvetica"))
    }

    /// Ajoute un bloc de texte avec titre et valeur
    fn add_text_block(
        &self,
        layer: &PdfLayerReference,
        title: &str,
        value: &str,
        x: Mm,
        y: Mm,
    ) -> Result<(), Box<dyn std::error::Error>> {
        layer.use_text(
            title,
            self.style.body_font_size,
            x,
            y,
            &self.create_font()?,
        );
        layer.use_text(
            value,
            self.style.body_font_size,
            x + Mm(50.0),
            y,
            &self.create_font()?,
        );
        Ok(())
    }

    /// Ajoute une boîte de résultat
    fn add_result_box(
        &self,
        layer: &PdfLayerReference,
        title: &str,
        value: &str,
        x: Mm,
        y: Mm,
    ) -> Result<(), Box<dyn std::error::Error>> {
        // Cadre
        // layer.add_rect(x, y - Mm(10.0), Mm(35.0), Mm(15.0));

        // Titre
        layer.use_text(
            title,
            self.style.body_font_size - 1.0,
            x + Mm(2.0),
            y - Mm(3.0),
            &self.create_font()?,
        );

        // Valeur
        layer.use_text(
            value,
            self.style.body_font_size + 2.0,
            x + Mm(2.0),
            y - Mm(8.0),
            &self.create_font()?,
        );

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pdf_generator_creation() {
        let generator = PdfReportGenerator::new(None);
        assert_eq!(generator.style.font_family, "Helvetica");
    }

    #[test]
    fn test_style_customization() {
        let custom_style = ReportStyle {
            primary_color: (0.8, 0.2, 0.2),
            secondary_color: (0.6, 0.1, 0.1),
            font_family: "Times-Roman",
            header_font_size: 18.0,
            title_font_size: 16.0,
            subtitle_font_size: 14.0,
            body_font_size: 12.0,
            footer_font_size: 9.0,
        };

        let generator = PdfReportGenerator::new(Some(custom_style));
        assert_eq!(generator.style.font_family, "Times-Roman");
        assert_eq!(generator.style.header_font_size, 18.0);
    }

    #[test]
    fn test_sample_data_creation() {
        let data = InspectionData {
            inspection_id: "INS-2026-001".to_string(),
            establishment_name: "Pharmacie Centrale".to_string(),
            establishment_type: "Officine".to_string(),
            inspection_date: "15/03/2026".to_string(),
            inspector_name: "Dr. Adjimon K.".to_string(),
            department: "Atlantique".to_string(),
            commune: "Cotonou".to_string(),
            conformity_rate: 0.85,
            critical_findings: 2,
            major_findings: 5,
            minor_findings: 12,
            sections: vec![],
            metadata: HashMap::new(),
        };

        assert_eq!(data.establishment_name, "Pharmacie Centrale");
        assert_eq!(data.conformity_rate, 0.85);
    }
}