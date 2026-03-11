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

#[cfg(test)]
mod tests {
    use super::compare_grids;
    use crate::grid::{GridInfo, Section, Criterion};

    #[test]
    fn test_compare_grids_identical() {
        let grid = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "1.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![Section {
                id: 1, title: "S1".into(),
                items: vec![Criterion { id: 1, reference: "R1".into(), description: "D1".into(), pre_opening: false }],
            }],
        };
        let diff = compare_grids(&grid, &grid);
        assert!(diff.added_sections.is_empty());
        assert!(diff.removed_sections.is_empty());
        assert!(diff.modified_criteria.is_empty());
    }

    #[test]
    fn test_compare_grids_added_section() {
        let grid1 = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "1.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![Section {
                id: 1, title: "S1".into(),
                items: vec![Criterion { id: 1, reference: "R1".into(), description: "D1".into(), pre_opening: false }],
            }],
        };
        let grid2 = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "2.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![
                Section {
                    id: 1, title: "S1".into(),
                    items: vec![Criterion { id: 1, reference: "R1".into(), description: "D1".into(), pre_opening: false }],
                },
                Section {
                    id: 2, title: "S2 Nouvelle".into(),
                    items: vec![Criterion { id: 10, reference: "R10".into(), description: "D10".into(), pre_opening: true }],
                },
            ],
        };
        let diff = compare_grids(&grid1, &grid2);
        assert_eq!(diff.added_sections.len(), 1);
        assert_eq!(diff.added_sections[0].id, 2);
        assert_eq!(diff.added_sections[0].title, "S2 Nouvelle");
        assert!(diff.removed_sections.is_empty());
        assert!(diff.modified_sections.is_empty());
        // The criterion in the new section should also be added
        assert_eq!(diff.added_criteria.len(), 1);
        assert_eq!(diff.added_criteria[0].id, 10);
    }

    #[test]
    fn test_compare_grids_modified_criterion() {
        let grid1 = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "1.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![Section {
                id: 1, title: "S1".into(),
                items: vec![Criterion { id: 1, reference: "R1".into(), description: "Old description".into(), pre_opening: false }],
            }],
        };
        let grid2 = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "2.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![Section {
                id: 1, title: "S1".into(),
                items: vec![Criterion { id: 1, reference: "R1".into(), description: "New description".into(), pre_opening: false }],
            }],
        };
        let diff = compare_grids(&grid1, &grid2);
        assert!(diff.added_sections.is_empty());
        assert!(diff.removed_sections.is_empty());
        assert!(diff.added_criteria.is_empty());
        assert!(diff.removed_criteria.is_empty());
        assert_eq!(diff.modified_criteria.len(), 1);
        assert_eq!(diff.modified_criteria[0].id, 1);
        assert_eq!(diff.modified_criteria[0].description, "New description");
        assert_eq!(diff.modified_criteria[0].old_description.as_deref(), Some("Old description"));
        // Reference didn't change, so old_reference should be None
        assert_eq!(diff.modified_criteria[0].old_reference, None);
    }

    #[test]
    fn test_compare_grids_removed_criterion() {
        let grid1 = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "1.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![Section {
                id: 1, title: "S1".into(),
                items: vec![
                    Criterion { id: 1, reference: "R1".into(), description: "D1".into(), pre_opening: false },
                    Criterion { id: 2, reference: "R2".into(), description: "D2".into(), pre_opening: true },
                ],
            }],
        };
        let grid2 = GridInfo {
            id: "g1".into(), name: "Test".into(), code: "T".into(),
            version: "2.0".into(), description: "".into(), icon: "".into(), color: "".into(),
            sections: vec![Section {
                id: 1, title: "S1".into(),
                items: vec![
                    Criterion { id: 1, reference: "R1".into(), description: "D1".into(), pre_opening: false },
                ],
            }],
        };
        let diff = compare_grids(&grid1, &grid2);
        assert!(diff.added_sections.is_empty());
        assert!(diff.removed_sections.is_empty());
        assert!(diff.added_criteria.is_empty());
        assert_eq!(diff.removed_criteria.len(), 1);
        assert_eq!(diff.removed_criteria[0].id, 2);
        assert_eq!(diff.removed_criteria[0].reference, "R2");
        assert_eq!(diff.removed_criteria[0].description, "D2");
        assert!(diff.modified_criteria.is_empty());
    }
}
