# Roadmap: Projects Studio

## Milestone v3.4 — UX Polish & Backup Console Refinement

**Started:** 2026-11-23 · **Previous:** v3.3 (Phases 85–90, shipped 2026-11-23)
**Constraints (standing):** zero new dependencies; i18n ×5 locales (en/fr/nl/de/es) in the same commit as the emitting code; dual-engine DDL lockstep (SQLite + Postgres, same commit); audit funnel for every mutation; shared-connection tx discipline; EN+FR/NL/DE/ES i18n gate; standing test suites green.

## Phases

- [x] **Phase 91: Digest Dedup — One Digest Per User Per Day** - Root-cause and fix the 4× daily digest duplication with per-user outbox coalescing and a pinned regression test
- [x] **Phase 92: Server Payload Contracts** - Roles aggregation, cron humanization descriptor, name resolution, GFS naming + gfs_bucket, unified runs route, backupScopeWorkspaces endpoint
- [x] **Phase 93: Governance UX — Instance Roles** - Role-tabbed roster, cumulative badges, rename to "Instance Roles", working selectable pickers
- [x] **Phase 94: Backup Console UX** - Real task table, pre-filled editor, GFS retention scales, unified run history with filters and honest authorization
- [ ] **Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore** - My Access view, revoked-key purge, one-line Workspace URL, Edit-Teams picker, operator cross-workspace scope pickers, project-archive overwrite restore (BKRST-05)

## Phase Details

### Phase 91: Digest Dedup — One Digest Per User Per Day

**Goal**: A digest-enrolled user in multiple workspaces receives exactly one digest email per day, with sections grouped per workspace — instead of one email per workspace (observed 4× duplicate).
**Depends on**: Nothing (first phase — standalone correctness fix, parallel-safe with all others)
**Requirements**: NOTIF-01
**Success Criteria** (what must be TRUE):
  1. A user enrolled in N workspaces receives exactly ONE digest email per local day, with per-workspace sections inside (empty sections never claim and never render).
  2. The reported 4× duplicate is pinned as a failing regression test FIRST, then green after the fix — the per-workspace WHAT-to-send semantic claim stays honest; only the transport layer coalesces (per-user outbox row per user/day inside the same tx).
  3. Restart and MAILER-disabled paths never double-send the aggregated digest; the email renders in the USER's locale (×5 locale keys for new section headers/footer in the same commit).
  4. Per-workspace digest history (reminders_sent claim) remains byte-compatible for non-aggregated consumers — no reshaping of the per-workspace semantic claim.

**Plans**: 1 plan
Plans:
- [x] 91-PLAN.md — pinned red regression test (4-ws → 1 email), per-user outbox coalescing, digest-aggregated templating, global unsubscribe (0x02)

### Phase 92: Server Payload Contracts

**Goal**: The server serves every read-shape the client phases render — roles aggregation, cron descriptor, resolved names, GFS-marked archive naming with stored bucket, unified runs, and the operator scope listing — with the client still deriving nothing.
**Depends on**: Nothing (parallel with Phase 91; consumed by Phases 93–95)
**Requirements**: BKNAME-01, BKNAME-02
**Success Criteria** (what must be TRUE):
  1. Archive filenames AND run labels carry `<instance-name>-<scope>-<slug>-<gfs>-<date>` with workspace/project names resolved server-side (never raw ids); manual runs carry NO GFS marker; archives are never renamed after creation (collision suffix + sha256 sidecar written from the FINAL uniquified filename).
  2. The GFS category is computed by ONE pure function shared between naming and rotation, stored on the run row at creation in an additive `gfs_bucket` column mirrored on SQLite AND Postgres in the same commit; rotation reads the stored value, never re-derives.
  3. `describeCron` (server-side, in export/cron.js) produces a structured descriptor from `parseCron` output only; the client stays cron-eval-free and localizes labels via `t()` (×5 locales same commit); honest raw-expression fallback outside the 5-field subset.
  4. A unified runs route variant (e.g. `?all=1` + filter params) serves all-task run history leaving the frozen per-task GET and `/api/backup/runs/current` untouched.
  5. An operator-gated `backupScopeWorkspaces` endpoint lists all workspaces for Backup/Restore pickers without touching `workspacesForUser` (byte-unchanged).

**Plans**: 1 plan (complete — verified 2026-11-24, 7/7)
Plans:
- [x] 92-PLAN.md — GFS module extraction + gfs_bucket (dual-engine, backfill approved), archive naming, describeCron, ?all=1 unified runs, /api/backup/scopes

### Phase 93: Governance UX — Instance Roles

**Goal**: Operators manage instance roles through a role-tabbed "Instance Roles" view where one row per user shows cumulative grants and the Grant dialog picker actually works.
**Depends on**: Phase 92 (roles aggregation payload)
**Requirements**: ROLE-01, ROLE-02, ROLE-03
**Success Criteria** (what must be TRUE):
  1. The section is renamed "Instance Roles" (×5 locale catalogues same commit, e2e assertion) and offers Super Admin / Backup Operator / Restore Operator tabs; a user holding multiple roles appears once per tab with stacked grant entries (role block, granted date, granted by) on shared columns.
  2. The user picker in the Instance Roles tab and in the Grant dialog is selectable like the Teams > Edit-team picker, and Grant-dialog search finds users it previously missed.
  3. Grant/revoke ride the existing audited endpoints only (re-skin); implicit Super-Admin membership stays visible with a badge, and last-Super-Admin revoke stays disabled with a ×5-locale reason.
  4. Zero new mutation endpoints; the audit funnel records grants/revokes exactly as before.

**UI hint**: yes
**Plans**: 1 plan
Plans:
- [x] 93-01-PLAN.md — Wave-0 static pins + 3-tab seg/roster-as-SA-tab/rolesCard dissolution (D-01,D-04) → per-tab User/Grants/Actions columns (D-02) → selectable pickers + dialog search render() fix (D-03) → full gates; i18n ×5 in every emitting commit

### Phase 94: Backup Console UX

**Goal**: The backup task console reads as an honest table — humanized schedules, real Next/Last run columns, all four GFS retention scales editable, and a unified cross-task run history with filters that leaks nothing.
**Depends on**: Phase 92 (cron descriptor, names, gfs_bucket, unified runs route)
**Requirements**: BKUI-01, BKUI-02, BKUI-03, BKUI-04
**Success Criteria** (what must be TRUE):
  1. The task list renders as a real table (no blocks-in-blocks) with humanized schedule ("Every Monday at 00:00"), populated Next run, and a Last run column with success/warning/error status.
  2. Editing a task pre-fills its current values including the current cron (builder seeds from the server descriptor, never client parsing), with the "Edit backup task" header above the block.
  3. Retention editing offers all four GFS scales (day/week/month/year) and the humanized label never disagrees with the scheduler (existing DST matrix extended to labels, ×5 locales).
  4. A unified run history across all tasks renders with real columns and task/trigger/status filters; viewers see only runs they are authorized to see (server-side per-run scope check, fail-closed drop; Restore-Op e2e pin with zero workspace names visible).
  5. Workspace/project names appear instead of raw ids; Run now shows the "manual archives are under no retention" hint (task_id NULL invariant untouched).

**UI hint**: yes
**Plans**: TBD
- [x] 94-PLAN.md

### Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore

**Goal**: Settings surfaces are polished (My Access view, honest key purge, one-line URL, working Teams picker), operators see all workspaces in the Backup/Restore scope pickers only, and project-restore archives can be restored as NEW or as OVERWRITE of an existing project.
**Depends on**: Phase 92 (backupScopeWorkspaces endpoint); settings items independent; project overwrite extends the 89-05 engine
**Requirements**: XWS-01, SET-01, SET-02, SET-03, SET-04, BKRST-05
**Success Criteria** (what must be TRUE):
  1. My Access shows project icons (not the tick icon) or a column layout for a better overview.
  2. API Keys offers an explicit user-triggered button removing revoked keys only — audit trail preserved (append-only), never a silent auto-purge.
  3. Settings > General > Workspace URL displays on a single line.
  4. Invite Member > Edit Teams uses the selectable team picker (same contract as Teams > Edit team).
  5. Super Admin / Backup Op / Restore Op see ALL workspaces in the Backup & Restore scope pickers only; `workspacesForUser` is byte-unchanged (grep gate + switcher-vs-picker differential e2e — navigation and workspace switcher unchanged for everyone).
  6. BKRST-05 (owner ruling 2026-11-24): a PROJECT archive restores either as NEW (current) or as OVERWRITE of an existing project — the overwrite extends the 89-05 guarded unit (pre-restore snapshot, confirm-phrase against the target project's CURRENT name, scope-kind match, ids verbatim) to project containment: target project's rows replaced inside a single tx, workspace_id remapped to the target workspace, name/slug collision handling keyed, favorites/comments/activity referencing the replaced project kept honest. The drawer offers both CTAs for project archives; every refusal keyed ×5.

**UI hint**: yes
**Plans**: TBD

## Progress

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 91. Digest Dedup | 0/? | Not started | - |
| 92. Server Payload Contracts | 0/? | Not started | - |
| 93. Governance UX — Instance Roles | 0/? | Not started | - |
| 94. Backup Console UX | 1/1 | Complete | 2026-11-24 |
| 95. Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore | 0/? | Not started | - |
