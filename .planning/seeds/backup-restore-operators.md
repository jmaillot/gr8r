---
title: Backup & Restore Operators — scheduled backups, delegated restore roles
created: 2026-11-21
source: user (FR, session 2026-11-21 — post-v3.2 closeout)
area: instance-ops
type: feature-pair
status: implemented (v3.3 phases 92/93 — backup/restore operator roles, delegated governance surface)
---

# Feature pair: Backup Operator + Restore Operator

Two intertwined features requested together. Captured as one seed because they
share the role model, the governance surface and the artifact format.

## Feature A — Backup Operator (Instances > Backup)

> Je veux construire une nouvelle feature pour les Backup Operator (chaque
> Super Admin est automatiquement membre, mais je veux pouvoir déléguer ce
> rôle) dans Instances > Backup. Un Backup Operator peut :
>
> - Programmer le backup d'un workspace, un projet ou l'instance complète
>   (schedule cron)
> - Configurer **plusieurs** tâches de backup
> - Le schedule propose une **rotation** (jours/semaines/mois/années)
> - Destinations : **local** (volume docker mappé) / **SMB** / **FTP** / **S3**…
> - L'attribution du droit Backup Operator se fait dans Instance >
>   Governance (peut-être une tab à côté de Super Admin Console)

## Feature B — Restore Operator (Instances > Restore)

> Un Restore Operator (même modèle de délégation, Super Admin auto-membre)
> peut :
>
> - Restaurer un backup depuis les backups **disponibles** (sélectionnables)
> - Restaurer une **instance complète**, un **workspace complet** ou un
>   **projet** en particulier (sélectionnable)
> - Attribution du droit dans Instance > Governance (tab, même remarque)

## Current state (verified in code, 2026-11-21)

- **SQLite** : `node server.js --backup [file]` existe déjà (snapshot
  consistant, CLI only). Pas de backup Postgres in-app ; docs/POSTGRES.md
  documente un `pg_dump` manuel hors app.
- **Rôles** : un seul flag serveur `users.is_instance_admin` (D-112,
  multi-seat). Les rôles Backup/Restore Operator exigent un NOUVEAU modèle
  (2 colonnes ? table `instance_roles` ? — décision D-113 à venir).
- **Attachements** : les uploads vivent dans `DATA_DIR` (MAX_UPLOAD_MB) — un
  backup « complet » doit couvrir DB **+ fichiers**, pas la DB seule.
- **Scheduler existant** : setInterval-based sweeps (sessions, challenges) +
  reminders/digest à heure workspace-locale. Pas de cron parser in-app.
- **Contrainte permanente** : zéro nouvelle dépendance npm (claims-first,
  ratifié depuis v3.0) — SMB/FTP/S3 clients et cron parsing devront être
  hand-rolled ou requalifiés comme exceptions owner-ratifiées.
- **Super-Admin console** : `settings.operator.*` (phase 78), tabs
  governance existantes — la tab Backup/Restore roles s'insère à côté.

## Open questions pour l'owner (à trancher avant planification)

### 1. Granularité backup vs format
Un backup **instance** peut être un dump binaire fidèle (SQLite file/pg_dump
custom). Mais un backup **workspace** ou **projet** exige un export *logique*
sélectionnable (rows + uploads du scope) — format différent, restauration
différente. Options :
  - (a) un seul format « export logique » pour les 3 scopes (instance = tout)
  - (b) dump natif pour instance, export logique pour workspace/projet
  - Q : lesquels sont vraiment nécessaires en v1 ?

### 2. Restore : écraser ou créer à côté ?
Restaurer un workspace existant = overwrite (destructif) ou importer comme
nouveau workspace « -restored » ? Le overwrite doit-il exiger un
type-to-confirm + snapshot pré-restore automatique ? (règle v3.2 : actions
destructives confirmées + audit-logged).

### 3. Destinations & secrets
- Local (volume) : chemin configurable, mounts docker documentés.
- SMB/FTP/S3 : où vivent les credentials ? (env vars boot-frozen vs chiffrés
  en DB avec MASTER_KEY). Chaque protocole client hand-rolled sans deps —
  coût significatif. Q : S3 seul en v1 ? (S3 couvre Backblaze/MinIO/AWS).
- Chiffrement des backups au repos (enveloppe MASTER_KEY) ?

### 4. Postgres parity
`pg_dump`/`pg_restore` sont des binaires externes (pas des deps npm mais des
prérequis conteneur). Le support Postgres est-il v1 (Dockerfile + spawn) ou
v2 (SQLite d'abord) ?

### 5. Rotation
Sémantique GFS (grandfather-father-son) simple : N fichiers par échelle
(jours/semaines/mois/années) avec rétention configurable par tâche ? Q :
valeurs par défaut et plafond.

### 6. Runs, échecs et notifications
- Historique d'exécution par tâche (status, taille, durée, erreur) ?
- Notification d'échec via le SMTP existant (à qui : opérateurs ?) ?
- « Run now » manuel + possibilité d'annuler un run en cours ?
- Un run pendant une activité write : verrou/cohérence (SQLite : API backup
  online ; Postgres : pg_dump consistant) — acceptable tel quel ?

### 7. Rôles
- Deux nouveaux flags (`is_backup_operator`, `is_restore_operator`) ou une
  table de roles d'instance extensible (prépare d'autres rôles futurs) ?
- Un Backup Operator peut-il aussi être Restore Operator séparément ?
- Les deux roles voient-ils les configurations de l'autre (lecture seule) ?
- Guard : qui peut créer/modifier les tâches de backup — Backup Operator
  seul, ou seulement les Super Admins ?

### 8. Surface Governance
Une tab unique « Instance Roles » (Backup + Restore + futur) à côté de
Super Admin Console, ou deux tabs séparées ? (la première prépare
l'extensibilité).

### 9. Divers à cadrer
- Test-restauration / vérification d'intégrité (checksum par backup) ?
- Limite de taille / progress reporting pour les gros volumes ?
- Restaurer depuis une autre instance (import cross-instance) ?
- i18n : toutes les nouvelles clés 5 locales same-commit (règle D-12).
- Audit log : chaque run/restore événement audité (funnel v3.2).

## Routing

Feature pair — prochain milestone (`/gsd-new-milestone`), probablement
2 phases (une par feature) + un phase core commun (roles d'instance +
gouvernance tab). À discuter avec l'owner AVANT discuss-phase : questions
1–7 ci-dessus.
