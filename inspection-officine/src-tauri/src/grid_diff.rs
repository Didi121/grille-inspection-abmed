use crate::grid::{GridInfo, Section, Criterion};
use serde::{Deserialize, Serialize};

/// Rapport de comparaison entre deux grilles
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffReport {
    pub added_sections: Vec<SectionDiff>,
    pub removed_sections: Vec<SectionDiff>,
    pub modified_sections: Vec<SectionDiff>,
    pub added_criteria: Vec<CriterionDiff>,
    pub removed_criteria: Vec<CriterionDiff>,
    pub modified_criteria: Vec<CriterionDiff>,
}

/// Diff de section
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SectionDiff {
    pub id: u32,
    pub title: String,
    pub old_title: Option<String>,
}

/// Diff de critère
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CriterionDiff {
    pub id: u32,
    pub reference: String,
    pub description: String,
    pub old_reference: Option<String>,
    pub old_description: Option<String>,
    pub pre_opening: bool,
    pub old_pre_opening: Option<bool>,
}

/// Compare deux grilles et retourne les différences
pub fn compare_grids(grid1: &GridInfo, grid2: &GridInfo) -> DiffReport {
    let mut diff = DiffReport {
        added_sections: Vec::new(),
        removed_sections: Vec::new(),
        modified_sections: Vec::new(),
        added_criteria: Vec::new(),
        removed_criteria: Vec::new(),
        modified_criteria: Vec::new(),
    };

    // Comparer les sections
    let sections1_map: std::collections::HashMap<u32, &Section> = grid1.sections
        .iter()
        .map(|s| (s.id, s))
        .collect();

    let sections2_map: std::collections::HashMap<u32, &Section> = grid2.sections
        .iter()
        .map(|s| (s.id, s))
        .collect();

    // Sections supprimées
    for (id, section) in &sections1_map {
        if !sections2_map.contains_key(id) {
            diff.removed_sections.push(SectionDiff {
                id: *id,
                title: section.title.clone(),
                old_title: None,
            });
        }
    }

    // Sections ajoutées
    for (id, section) in &sections2_map {
        if !sections1_map.contains_key(id) {
            diff.added_sections.push(SectionDiff {
                id: *id,
                title: section.title.clone(),
                old_title: None,
            });
        }
    }

    // Sections modifiées
    for (id, section1) in &sections1_map {
        if let Some(section2) = sections2_map.get(id) {
            if section1.title != section2.title {
                diff.modified_sections.push(SectionDiff {
                    id: *id,
                    title: section2.title.clone(),
                    old_title: Some(section1.title.clone()),
                });
            }
        }
    }

    // Comparer les critères
    let criteria1: Vec<(u32, u32, &Criterion)> = grid1.sections
        .iter()
        .flat_map(|s| s.items.iter().map(move |c| (s.id, c.id, c)))
        .collect();

    let criteria2: Vec<(u32, u32, &Criterion)> = grid2.sections
        .iter()
        .flat_map(|s| s.items.iter().map(move |c| (s.id, c.id, c)))
        .collect();

    let criteria1_map: std::collections::HashMap<u32, &Criterion> = criteria1
        .iter()
        .map(|(_, _, c)| (c.id, *c))
        .collect();

    let criteria2_map: std::collections::HashMap<u32, &Criterion> = criteria2
        .iter()
        .map(|(_, _, c)| (c.id, *c))
        .collect();

    // Critères supprimés
    for (_, _, criterion) in &criteria1 {
        if !criteria2_map.contains_key(&criterion.id) {
            diff.removed_criteria.push(CriterionDiff {
                id: criterion.id,
                reference: criterion.reference.clone(),
                description: criterion.description.clone(),
                old_reference: None,
                old_description: None,
                pre_opening: criterion.pre_opening,
                old_pre_opening: None,
            });
        }
    }

    // Critères ajoutés
    for (_, _, criterion) in &criteria2 {
        if !criteria1_map.contains_key(&criterion.id) {
            diff.added_criteria.push(CriterionDiff {
                id: criterion.id,
                reference: criterion.reference.clone(),
                description: criterion.description.clone(),
                old_reference: None,
                old_description: None,
                pre_opening: criterion.pre_opening,
                old_pre_opening: None,
            });
        }
    }

    // Critères modifiés
    for (id, criterion1) in &criteria1_map {
        if let Some(criterion2) = criteria2_map.get(id) {
            let mut modified = false;
            let mut old_ref = None;
            let mut old_desc = None;
            let mut old_pre = None;

            if criterion1.reference != criterion2.reference {
                old_ref = Some(criterion1.reference.clone());
                modified = true;
            }
            if criterion1.description != criterion2.description {
                old_desc = Some(criterion1.description.clone());
                modified = true;
            }
            if criterion1.pre_opening != criterion2.pre_opening {
                old_pre = Some(criterion1.pre_opening);
                modified = true;
            }

            if modified {
                diff.modified_criteria.push(CriterionDiff {
                    id: *id,
                    reference: criterion2.reference.clone(),
                    description: criterion2.description.clone(),
                    old_reference: old_ref,
                    old_description: old_desc,
                    pre_opening: criterion2.pre_opening,
                    old_pre_opening: old_pre,
                });
            }
        }
    }

    diff
}

/// Génère un rapport HTML coloré des différences
pub fn generate_diff_html(diff: &DiffReport) -> String {
    let mut html = String::from(
        "<style>
            .diff-section { margin: 20px 0; }
            .diff-added { background-color: #dcfce7; padding: 8px; border-left: 4px solid #22c55e; }
            .diff-removed { background-color: #fee2e2; padding: 8px; border-left: 4px solid #ef4444; }
            .diff-modified { background-color: #fef3c7; padding: 8px; border-left: 4px solid #f59e0b; }
            .diff-field { margin: 4px 0; font-size: 12px; }
            .old-value { color: #dc2626; text-decoration: line-through; }
            .new-value { color: #16a34a; font-weight: bold; }
        </style>\n"
    );

    // Sections ajoutées
    if !diff.added_sections.is_empty() {
        html.push_str("<div class='diff-section'><h3>✅ Sections ajoutées</h3>\n");
        for section in &diff.added_sections {
            html.push_str(&format!(
                "<div class='diff-added'><strong>[{}]</strong> {}</div>\n",
                section.id, section.title
            ));
        }
        html.push_str("</div>\n");
    }

    // Sections supprimées
    if !diff.removed_sections.is_empty() {
        html.push_str("<div class='diff-section'><h3>❌ Sections supprimées</h3>\n");
        for section in &diff.removed_sections {
            html.push_str(&format!(
                "<div class='diff-removed'><strong>[{}]</strong> {}</div>\n",
                section.id, section.title
            ));
        }
        html.push_str("</div>\n");
    }

    // Sections modifiées
    if !diff.modified_sections.is_empty() {
        html.push_str("<div class='diff-section'><h3>📝 Sections modifiées</h3>\n");
        for section in &diff.modified_sections {
            html.push_str(&format!(
                "<div class='diff-modified'><strong>[{}]</strong> ",
                section.id
            ));
            if let Some(old) = &section.old_title {
                html.push_str(&format!(
                    "<span class='old-value'>{}</span> → ",
                    old
                ));
            }
            html.push_str(&format!(
                "<span class='new-value'>{}</span></div>\n",
                section.title
            ));
        }
        html.push_str("</div>\n");
    }

    // Critères ajoutés
    if !diff.added_criteria.is_empty() {
        html.push_str("<div class='diff-section'><h3>✅ Critères ajoutés</h3>\n");
        for criterion in &diff.added_criteria {
            html.push_str(&format!(
                "<div class='diff-added'>\
                    <div class='diff-field'><strong>[{}]</strong> {}</div>\
                    <div class='diff-field'>{}</div>\
                </div>\n",
                criterion.id, criterion.reference, criterion.description
            ));
        }
        html.push_str("</div>\n");
    }

    // Critères supprimés
    if !diff.removed_criteria.is_empty() {
        html.push_str("<div class='diff-section'><h3>❌ Critères supprimés</h3>\n");
        for criterion in &diff.removed_criteria {
            html.push_str(&format!(
                "<div class='diff-removed'>\
                    <div class='diff-field'><strong>[{}]</strong> {}</div>\
                    <div class='diff-field'>{}</div>\
                </div>\n",
                criterion.id, criterion.reference, criterion.description
            ));
        }
        html.push_str("</div>\n");
    }

    // Critères modifiés
    if !diff.modified_criteria.is_empty() {
        html.push_str("<div class='diff-section'><h3>📝 Critères modifiés</h3>\n");
        for criterion in &diff.modified_criteria {
            html.push_str(&format!(
                "<div class='diff-modified'><strong>[{}]</strong><br/>",
                criterion.id
            ));

            if let Some(old) = &criterion.old_reference {
                html.push_str(&format!(
                    "<div class='diff-field'>Référence: <span class='old-value'>{}</span> → <span class='new-value'>{}</span></div>",
                    old, criterion.reference
                ));
            }

            if let Some(old) = &criterion.old_description {
                html.push_str(&format!(
                    "<div class='diff-field'>Description: <span class='old-value'>{}</span> → <span class='new-value'>{}</span></div>",
                    old, criterion.description
                ));
            }

            if let Some(old) = criterion.old_pre_opening {
                html.push_str(&format!(
                    "<div class='diff-field'>Pré-ouverture: <span class='old-value'>{}</span> → <span class='new-value'>{}</span></div>",
                    old, criterion.pre_opening
                ));
            }

            html.push_str("</div>\n");
        }
        html.push_str("</div>\n");
    }

    if diff.added_sections.is_empty()
        && diff.removed_sections.is_empty()
        && diff.modified_sections.is_empty()
        && diff.added_criteria.is_empty()
        && diff.removed_criteria.is_empty()
        && diff.modified_criteria.is_empty()
    {
        html.push_str("<p style='color: #666;'>Aucune différence détectée</p>\n");
    }

    html
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compare_grids() {
        // Tests unitaires pour la comparaison
    }
}
