# Requirements: Milestone v3.4 — UX Polish & Backup Console Refinement

**Defined:** 2026-11-23 — from owner fix list + ratified rulings (GFS naming, digest aggregation, cross-workspace pickers-only) + research SUMMARY.md (4 dimensions, HIGH confidence).

**Core Value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening before features. v3.4 refines existing operational surfaces; zero new dependencies.

## v3.4 Requirements

### Instance Roles (Governance)

- [ ] **ROLE-01**: The Super Admins & Roles section is a role-tabbed view (Super Admin / Backup Operator / Restore Operator tabs) and is renamed "Instance Roles"
- [ ] **ROLE-02**: A user holding multiple roles appears once per tab with stacked grant entries (role block, granted date, granted by) aligned to shared columns
- [ ] **ROLE-03**: The user picker in the Instance Roles tab and in the Grant dialog is selectable like the Teams > Edit team picker, and the Grant dialog search works

### Backup Console (tasks + runs)

- [ ] **BKUI-01**: The task list reads as a real table (no blocks-in-blocks) with humanized schedule ("Every Monday at 00:00"), populated Next run, and a Last run column with status (success/warning/error)
- [ ] **BKUI-02**: Editing a scheduled task pre-fills its current values (cron included) with the "Edit backup task" header above the block
- [ ] **BKUI-03**: Task retention editing offers all four GFS scales (day/week/month/year)
- [ ] **BKUI-04**: A unified run history across all tasks renders with real columns and filters (task, trigger, status); viewers only see runs they are authorized to see (instance-scope via hasInstanceRole, workspace/project-scope via live membership)

### Backup Naming

- [ ] **BKNAME-01**: Archive filenames AND run labels carry `<instance-name>-<scope>-<slug>-<gfs>-<date>` with workspace/project names resolved (never raw ids); manual runs carry no GFS marker
- [ ] **BKNAME-02**: The GFS category is computed by one pure function shared with rotation, stored on the run row (additive column, dual-engine DDL) — archives are never renamed after creation

### Cross-workspace visibility

- [x] **XWS-01**: Super Admin, Backup Operator and Restore Operator see all workspaces in the Backup & Restore scope pickers only; `workspacesForUser` and app navigation are byte-unchanged

### Settings

- [ ] **SET-01**: My Access shows the project icon (not the tick icon), or a column layout for a better overview
- [ ] **SET-02**: API Keys offers a clear button removing revoked keys only (audit trail preserved)
- [ ] **SET-03**: The Settings > General > Workspace URL displays on a single line
- [x] **SET-04**: The Invite Member > Edit Teams team picker is selectable like the Teams > Edit team picker

### Notifications

- [ ] **NOTIF-01**: The daily digest sends one email per user per day across all workspaces (workspace-grouped sections inside); root cause of the 4× duplicate documented, with a pinned multi-workspace regression test

## Future Requirements (deferred)

- SMB/FTP backup destinations (v2 destination family)
- Backup format v2
- Backlog items not in the owner's v3.4 list

## Out of Scope (explicit exclusions)

- **No general cron DSL** — the 5-field cron subset and builder presets stay as-is (custom crons keep an honest raw-expression display)
- **No retention for manual archives** — shipped invariant (task_id NULL); only a hint is added
- **No silent auto-purge of revoked keys** — purge is an explicit user action
- **No operator visibility outside Backup/Restore pickers** — navigation, workspace switcher and project lists unchanged
- **No archive format change** — "gr8r backup v1" (D-86) stays frozen; naming is metadata/filename only
- **No re-run-from-history write paths**

## Traceability

Phase → Requirement mapping is filled by the roadmap (gsd-roadmapper).

| Requirement | Phase | Status |
|-------------|-------|--------|
| NOTIF-01 | Phase 91 | Pending |
| BKNAME-01 | Phase 92 | Pending |
| BKNAME-02 | Phase 92 | Pending |
| ROLE-01 | Phase 93 | Pending |
| ROLE-02 | Phase 93 | Pending |
| ROLE-03 | Phase 93 | Pending |
| BKUI-01 | Phase 94 | Pending |
| BKUI-02 | Phase 94 | Pending |
| BKUI-03 | Phase 94 | Pending |
| BKUI-04 | Phase 94 | Pending |
| XWS-01 | Phase 95 | Complete |
| SET-01 | Phase 95 | Pending |
| SET-02 | Phase 95 | Pending |
| SET-03 | Phase 95 | Pending |
| SET-04 | Phase 95 | Complete |
