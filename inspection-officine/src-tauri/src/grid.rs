use serde::{Deserialize, Serialize};

// ── Modèle générique de grille ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GridInfo {
    pub id: String,
    pub name: String,
    pub code: String,         // ex: "IP-F-0018"
    pub version: String,
    pub description: String,
    pub icon: String,         // emoji
    pub color: String,        // hex accent color
    pub sections: Vec<Section>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Section {
    pub id: u32,
    pub title: String,
    pub items: Vec<Criterion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Criterion {
    pub id: u32,
    pub reference: String,
    pub description: String,
    pub pre_opening: bool,
}

// ── Helper pour construire les critères ──

pub struct CriterionBuilder {
    counter: u32,
}

impl CriterionBuilder {
    pub fn new() -> Self {
        Self { counter: 0 }
    }

    pub fn next(&mut self, reference: &str, description: &str, pre_opening: bool) -> Criterion {
        self.counter += 1;
        Criterion {
            id: self.counter,
            reference: reference.to_string(),
            description: description.to_string(),
            pre_opening,
        }
    }

    /// Shortcut: not pre-opening
    pub fn item(&mut self, reference: &str, description: &str) -> Criterion {
        self.next(reference, description, false)
    }

    /// Shortcut: pre-opening item (►)
    pub fn pre(&mut self, reference: &str, description: &str) -> Criterion {
        self.next(reference, description, true)
    }
}
