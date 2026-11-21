# Milestone v3.3 Requirements — Instance Operations: Backup, Restore & Roles

*Defined 2026-11-21 from research SUMMARY.md + owner decisions (seeds: backup-restore-operators, super-admin-console-role-first-listing).*

## Goal

Delegate instance operations to Backup/Restore Operator roles — scheduled multi-scope backups with GFS rotation, safe selective restore — and finish the Super Admin console.

## Owner-Ratified Decisions (2026-11-21 intake)

- **D-33-1:** ONE logical export format — tar+gzip archive ("gr8r backup v1"), manifest as entry 0, per-table NDJSON, sha256 3-level; identical code path SQLite/Postgres (Postgres is v1).
- **D-33-2:** Restore semantics — import-as-new (`-restored`) is the default; overwrite optional with type-to-confirm + automatic pre-restore snapshot.
- **D-33-3:** Destinations v1 — local mapped volume + S3-compatible (hand-rolled SigV4 client: AWS/MinIO/Backblaze B2). SMB/FTP deferred to v2.
- **D-33-4:** Extensible `instance_roles` table (not boolean columns); Super Admins are implicit members of every role.
- **D-33-5:** ONE "Instance Roles" tab in Instance > Governance (next to Super Admin Console), extensible to future roles.
- **D-33-6:** GFS rotation per task, per-scale counts, community defaults 7/4/12/5, configurable.
- **D-33-7:** Backup Operator = full task management (create/edit/delete/Run now). Restore Operator = browse/preview/restore only, no task editing.
- **D-33-8:** Failure notification is transition-based (state change → email via email_outbox to Super Admins + Backup Operators); no per-run success emails.
- **D-33-9:** Schedule via builder + presets in the UI (never free-text cron input); stored as 5-field cron subset.
- **D-33-10:** Restore authority is scoped by LIVE rights, never archive contents; operational tables (users, instance_roles, sessions, backup_tasks) are never selectively restored by default; archive download tiered above run rights.
- **D-33-11:** Zero new npm dependencies — S3 client, cron math, tar/gzip all hand-rolled on Node stdlib.
- **D-33-12:** Anti-features ratified out of scope: incremental/dedup backups, backup encryption at rest, per-item restore UI, dry-run restore, success emails, multiple destinations per task, SMB/FTP (v2), live-restore browse.

## Requirements

### Roles & Governance (BKROLE)
- [ ] **BKROLE-01**: Operator can grant or revoke the Backup Operator and Restore Operator roles to any user from the Instance Roles tab in Instance > Governance; granted users see the Backup/Restore surfaces, revoked users lose them; Super Admins always retain both roles implicitly.
- [ ] **BKROLE-02**: A Backup Operator can create, edit, delete and manually run backup tasks (full CRUD); a Restore Operator can browse, preview and restore backups but cannot edit tasks.
- [ ] **BKROLE-03**: Every role grant/revoke and every backup/restore/rotation action is audit-logged through the existing audit funnel.

### Backup (BKBCK)
- [ ] **BKBCK-01**: A Backup Operator can export a single project, a single workspace, or the full instance as a logical archive (DB rows + the scope's uploaded files, versioned manifest, per-table/per-file/whole-archive sha256), consistently on both SQLite and Postgres, with manifest self-verification failing the run on mismatch.
- [ ] **BKBCK-02**: A Backup Operator can configure multiple backup tasks — each with name, scope, destination (local volume v1), builder-based schedule with presets, GFS rotation retention per scale (default 7/4/12/5), and enable/disable — saved with keyed 5-locale refusals on invalid input.
- [ ] **BKBCK-03**: Scheduled tasks run automatically on their cron schedule (5-field subset, timezone-aware), with at-most-once catch-up after restart, no overlapping runs of the same task, and GFS rotation applied only after a verified successful run (newest verified backup never deleted).
- [ ] **BKBCK-04**: Every run (manual or scheduled) is recorded in a history the Backup Operator can consult — status, trigger, duration, size, error, checksum — with a Run now action per task, and failure emails sent on failure-state transitions to Super Admins and Backup Operators.
- [ ] **BKBCK-05**: A task destination can be an S3-compatible endpoint (AWS S3, MinIO, Backblaze B2) configured via boot-frozen env credentials, with uploads streamed (memory-bounded) and the stored checksum verifiable after upload.

### Restore (BKRST)
- [ ] **BKRST-01**: A Restore Operator can list available backups across destinations and preview a backup's contents (scopes, tables, file counts, checksum) from the manifest without downloading or unpacking it.
- [ ] **BKRST-02**: A Restore Operator can restore a workspace or project from a backup as a new workspace/project with a `-restored` suffix (full ID remap, containing only the restoring operator as member), with the whole restore in one transaction.
- [ ] **BKRST-03**: A Backup Operator or Super Admin can overwrite an existing workspace/project from a backup — gated by type-to-confirm, preceded by an automatic pre-restore snapshot, executed in a single transaction; operational tables (users, roles, sessions, tasks) are never overwritten by selective restore.
- [ ] **BKRST-04**: A Super Admin can restore a full instance from an instance-scope backup (disaster-recovery path) — Super-Admin-only, type-to-confirm, with global session revocation and a security contract (threats_open: 0) covering privilege-escalation-via-restore.

### Backlog (SACON)
- [ ] **SACON-01**: The Super Admin console lists Super Admins by default; typing searches all users by name and email, non-admin matches render as promote candidates with a result cap (show-more control), and a successful promotion shows a keyed success toast, removes the candidate from results, and adds them to the roster without a page reload.

## Future Requirements (deferred)

- SMB and FTP/FTPS destinations (D-33-3, v2)
- Backup encryption at rest (D-33-12)
- Incremental/dedup backups, multiple destinations per task (D-33-12)
- Test-restore verification (restore into a sandbox to validate a backup)
- Scheduled restore prod→staging

## Out of Scope

- Per-item restore inside a project (D-33-12) — workspace/project/instance granularity only
- Free-text cron input (D-33-9) — builder + presets only
- Success notification emails (D-33-12)
- Dry-run restore (manifest preview covers the trust need)
- Cross-instance import (not requested; restore assumes same major schema)

## Traceability

*Filled by roadmap: requirement → phase mapping.*

| Req | Phase | Status |
|-----|-------|--------|
| (pending roadmap) | | |
