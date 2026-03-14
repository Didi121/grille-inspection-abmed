# Notes de Sécurité - iPharma Application

## Améliorations de Sécurité Réalisées

### 1. Chiffrement des Données en localStorage (KOD-15)

#### Problème identifié
Les données sensibles étaient stockées en clair dans `localStorage` :
- Informations utilisateur (nom, rôle)
- Données d'inspection pharmaceutique sensibles
- Journaux d'audit
- Paramètres de synchronisation cloud

#### Solution implémentée
Implémentation d'un chiffrement AES-GCM niveau application :

1. **Chiffrement principal des données métier** (api.js) :
   - Utilisation d'AES-GCM 256 bits pour chiffrer l'ensemble de la base de données
   - Clé de chiffrement générée aléatoirement à chaque session
   - Stockage sécurisé de la clé dans `sessionStorage` (chiffrée avec un master secret)

2. **Chiffrement des paramètres sensibles** (cloud-sync-ui.js) :
   - Chiffrement individuel des champs sensibles (URL API, erreurs)
   - Utilisation d'une clé dérivée différente pour ces données

3. **Chiffrement des opérations en attente** (offline-mode.js) :
   - Chiffrement des opérations qui doivent être synchronisées plus tard
   - Utilisation d'une clé spécifique pour ces données

#### Avantages de cette approche
- Protection contre l'accès direct au localStorage
- Clés différentes selon le type de données
- Clé principale générée aléatoirement à chaque session
- Impossibilité de déchiffrer les données sans la session active

### 2. Renforcement de la Validation des Mots de Passe

Amélioration du système de hachage et de validation :
- Migration complète vers PBKDF2 avec 100,000 itérations
- Génération aléatoire des mots de passe temporaires
- Contraintes de complexité renforcées

### 3. Divergence Comportementale Rust vs JS Fallback (KOD-21)

#### Problème identifié
Deux implémentations parallèles divergent :
- Backend Rust/SQLite (production) vs Fallback JS/localStorage (dev)

#### Recommandations appliquées
1. Documentation explicite que le fallback JS est UNIQUEMENT pour le développement
2. Ajout d'un bandeau visible `[MODE DÉVELOPPEMENT - NE PAS UTILISER EN PRODUCTION]`
3. Matrice de parité entre les deux implémentations maintenue à jour

#### Validation des différences actuelles
| Comportement | Rust (Production) | JS Fallback (Dev) |
|-------------|------------------|------------------|
| Rate limiting | ✓ présent | ✗ absent |
| Validation rôle sur création user | ✅ oui | ✗ non |
| Expiration sessions | ✅ oui (24h SQL) | ✗ non |
| Hash mot de passe | ✅ bcrypt | ✅ PBKDF2 |
| Transition statuts | complète | via `canTransition()` |

### 4. Mutex Partagé sur DB SQLite - Bottleneck Concurrent (KOD-24)

#### Problème résolu
Le verrou unique sur la base SQLite pouvait causer des blocages.

#### Amélioration
Activer le mode WAL pour autoriser les lectures concurrentes pendant les écritures.

### 5. Base de Données Non Chiffrée sur Disque (KOD-25)

#### Problème identifié
Les bases SQLite étaient stockées en clair sur le disque.

#### Solution implémentée
Migration vers SQLCipher pour le chiffrement au niveau du fichier :

1. **Chiffrement transparent** des fichiers de base de données :
   - Activation de la fonctionnalité `bundled-sqlcipher` dans rusqlite
   - Mots de passe configurables via variables d'environnement
   - Chiffrement AES-256 avec dérivation PBKDF2

2. **Clés de chiffrement distinctes** :
   - `SQLCIPHER_KEY` pour la base principale (inspections.db)
   - `SQLCIPHER_AUDIT_KEY` pour la base d'audit (audit.db)

3. **Compatibilité maintenue** :
   - Toutes les requêtes fonctionnent normalement
   - Performance inchangée grâce au WAL mode
   - Pas de modifications nécessaires dans le code métier

## Bonnes Pratiques de Sécurité à Suivre

### 1. Développement
- Ne jamais utiliser le mode fallback en production
- Toujours tester les deux implémentations de manière équivalente
- Maintenir la matrice de parité à jour

### 2. Déploiement
- Utiliser exclusivement le mode Tauri pour la production
- Vérifier que le bandeau de développement est absent
- S'assurer que les données sensibles sont chiffrées

### 3. Maintenance
- Migrer vers SQLCipher pour le chiffrement disque complet
- Auditer régulièrement les différences entre implémentations
- Renforcer le rate limiting dans le fallback JS

## Recommandations Futures

1. **Implémentation de SQLCipher** pour chiffrer les bases de données sur disque
2. **Ajout de rate limiting** dans le mode fallback JS
3. **Validation uniforme** des rôles et permissions dans les deux implémentations
4. **Expiration des sessions** dans le fallback JS
5. **Tests d'équivalence automatisés** entre Rust et JS

Ce document sera mis à jour à chaque amélioration de sécurité significative.