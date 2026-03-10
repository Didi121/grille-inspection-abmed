// ══════════════════════════════════════════════════════
// REGISTRE DES GRILLES
//
// Pour ajouter une nouvelle grille :
//   1. Créer un fichier  grids/mon_nom.rs
//   2. Implémenter  pub fn build() -> GridInfo { ... }
//   3. Ajouter ici :  pub mod mon_nom;
//   4. L'ajouter dans  all() ci-dessous
// ══════════════════════════════════════════════════════

pub mod officine;
pub mod grossiste;
// pub mod pui;           // <- décommenter quand prêt
// pub mod bpf;           // <- décommenter quand prêt
// pub mod up_plantes;    // <- décommenter quand prêt

use crate::grid::GridInfo;

/// Retourne toutes les grilles disponibles
pub fn all() -> Vec<GridInfo> {
    vec![
        officine::build(),
        grossiste::build(),
        // pui::build(),
        // bpf::build(),
        // up_plantes::build(),
    ]
}

/// Cherche une grille par son id
pub fn find(id: &str) -> Option<GridInfo> {
    all().into_iter().find(|g| g.id == id)
}
