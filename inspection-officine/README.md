# 🏥 ABMed Inspections — Multi-Grilles

Application d'inspection pharmaceutique multi-grilles pour l'ABMed (Agence Béninoise du Médicament).

**Stack** : Tauri 2 (Rust backend) + HTML/CSS/JS frontend

---

## Grilles disponibles

| Grille | Code | Critères | Sections |
|--------|------|----------|----------|
| 💊 Inspection Officine | IP-F-0018 | 104 | 13 |
| 🏭 Grossiste-Répartiteur | IP-FO-0002 | 95 | 18 |

---

## Ajouter une nouvelle grille (3 étapes)

### 1. Créer le fichier `src-tauri/src/grids/ma_grille.rs`

```rust
use crate::grid::{CriterionBuilder, GridInfo, Section};

pub fn build() -> GridInfo {
    let mut b = CriterionBuilder::new();

    GridInfo {
        id: "ma_grille".into(),
        name: "Inspection Ma Grille".into(),
        code: "IP-FO-XXXX".into(),
        version: "1".into(),
        description: "Description de ma grille".into(),
        icon: "🔬".into(),           // emoji affiché sur la carte
        color: "#8b5cf6".into(),      // couleur d'accent hex
        sections: vec![
            Section { id: 1, title: "Ma section".into(), items: vec![
                b.pre("REF 1.01", "Critère pré-ouverture"),    // ► pré-ouverture
                b.item("REF 1.02", "Critère normal"),           // critère standard
            ]},
            // ... autres sections
        ],
    }
}
```

### 2. Enregistrer dans `src-tauri/src/grids/mod.rs`

```rust
pub mod officine;
pub mod grossiste;
pub mod ma_grille;      // ← ajouter cette ligne

pub fn all() -> Vec<GridInfo> {
    vec![
        officine::build(),
        grossiste::build(),
        ma_grille::build(),  // ← ajouter cette ligne
    ]
}
```

### 3. (Optionnel) Ajouter le fallback JS dans `src/index.html`

Dans la fonction `buildAllGridsJS()`, ajouter l'objet JS correspondant pour le mode navigateur.

**C'est tout !** La nouvelle grille apparaîtra automatiquement sur l'écran d'accueil.

---

## Architecture

```
inspection-officine/
├── src/
│   └── index.html                # Frontend complet (multi-grilles)
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/
│       ├── main.rs               # Commandes Tauri, état
│       ├── grid.rs               # Modèle générique (GridInfo, Section, Criterion)
│       └── grids/
│           ├── mod.rs            # 🔑 REGISTRE — ajouter vos grilles ici
│           ├── officine.rs       # 💊 Officine (104 critères)
│           └── grossiste.rs      # 🏭 Grossiste-Répartiteur (95 critères)
```

### API Rust → Frontend

| Commande | Description |
|----------|-------------|
| `list_grids` | Liste toutes les grilles (id, nom, stats) |
| `get_grid` | Récupère une grille complète par id |
| `set_response` | Enregistre une réponse |
| `generate_report` | Génère le rapport avec écarts |

---

## Installation & Utilisation

```bash
npm install
npm run dev          # développement
npm run build        # production
```

**Aperçu navigateur** : ouvrir `src/index.html` directement (fallback JS intégré).

**Raccourcis** : `← →` naviguer · `O` conforme · `N` non conforme

---

## Sécurité

Cette application utilise plusieurs couches de sécurité :

### 🔐 Chiffrement des bases de données
Les bases de données SQLite sont chiffrées avec SQLCipher :
- `inspections.db` : données d'inspection
- `audit.db` : journaux d'audit

Les clés de chiffrement peuvent être configurées via :
- `SQLCIPHER_KEY` : clé pour la base principale
- `SQLCIPHER_AUDIT_KEY` : clé pour la base d'audit

### 🛡️ Chiffrement en mode navigateur
En mode fallback (navigateur), les données localStorage sont chiffrées :
- AES-GCM 256 bits
- Clés générées aléatoirement à chaque session

### ⚠️ Avertissement développement
Le mode navigateur ne doit être utilisé qu'à des fins de développement et ne convient pas pour la production.

---

*ABMed — Réf : IP-PC-0001 · Confidentiel*
