# Procédure de Sauvegarde et Restauration - Grille Inspection ABMed

Ce document décrit les mécanismes de sauvegarde des données et les étapes de restauration en cas de sinistre.

## 1. Mécanismes de Sauvegarde

### 1.1 Sauvegarde Automatique (Périodique)
L'application effectue une sauvegarde automatique de la base de données toutes les 4 heures lorsque l'application est ouverte.
Les fichiers sont stockés dans le dossier :
`%APPDATA%/inspections-pharma/backups/auto/` (Windows)
ou `~/Library/Application Support/inspections-pharma/backups/auto/` (macOS)
ou `~/.local/share/inspections-pharma/backups/auto/` (Linux)

Format des fichiers :
- `inspections_auto_YYYYMMDD_HHMMSS.db` : Données d'inspections, utilisateurs et grilles.
- `audit_auto_YYYYMMDD_HHMMSS.db` : Journal d'audit complet.

### 1.2 Sauvegarde Avant Migration
Avant chaque migration de structure de données importante, une sauvegarde de sécurité est créée dans :
`backups/inspections_pre_mig_YYYYMMDD_HHMMSS.db`

### 1.3 Sauvegarde Manuelle
Un administrateur peut déclencher une sauvegarde manuelle depuis l'interface de maintenance.
Celle-ci crée des fichiers `inspections_YYYYMMDD_HHMMSS.db` dans le dossier `backups`.

## 2. Procédure de Restauration

### 2.1 En cas de corruption de la base actuelle
1. Fermer l'application **Inspections Pharma**.
2. Localiser le dossier de données (voir 1.1).
3. Renommer les fichiers corrompus (ex: `inspections.db` -> `inspections.db.corrupt`).
4. Choisir la sauvegarde la plus récente dans le dossier `backups/auto/`.
5. Copier ce fichier à la racine du dossier de données et le renommer en `inspections.db`.
6. Faire de même pour `audit.db` si nécessaire.
7. Relancer l'application.

### 2.2 En cas de réinstallation totale
1. Installer l'application sur le nouveau poste.
2. Lancer l'application une première fois puis la fermer.
3. Remplacer les fichiers `.db` créés par défaut par vos fichiers de sauvegarde renommés en `inspections.db` et `audit.db`.
4. Relancer l'application.

## 3. Recommandations de Sécurité
- Il est fortement conseillé de copier périodiquement le contenu du dossier `backups` sur un support externe ou un serveur de fichiers sécurisé.
- Les sauvegardes ne sont pas chiffrées au repos (format SQLite standard). Assurez-vous que le disque dur utilise un chiffrement de type BitLocker ou FileVault.
