---
gsd_state_version: "1.0"
milestone: v3.3
milestone_name: Instance Operations — Backup, Restore & Roles
current_phase: 89
current_phase_name: restore
current_plan: 6
status: executing
stopped_at: Completed 89-05-PLAN.md
last_updated: "2026-11-23T06:10:31.624Z"
last_activity: 2026-11-22
last_activity_desc: Phase 89 execution started
state_head: 84d248efb1fbfb111b6af7c97aeaac45bf1eaa6a
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 17
  completed_plans: 16
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-21)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Phase 89 — restore

## Current Position

Phase: 89 (restore) — EXECUTING
Current Plan: 6
Total Plans in Phase: 6
Status: Ready to execute
Last activity: 2026-11-22 — 89-04 complete (import-as-new engine + trigger routes + outcome emails)

## Milestone v3.3 Phase Map

| Phase | Name | Requirements | Depends on |
|-------|------|--------------|------------|
| 85 | Roles Foundation | BKROLE-01..03 | Nothing |
| 86 | Export Core ("gr8r backup v1") | BKBCK-01 | 85 |
| 87 | Scheduler, Tasks, Run History & Rotation | BKBCK-02..04 | 86 |
| 88 | S3 Destination | BKBCK-05 | 86 |
| 89 | Restore | BKRST-01..04 | 85, 86, 88 |
| 90 | Polish & Verification Sweep | SACON-01 | 85–89 |

Owner-ratified decisions D-33-1..12 live in REQUIREMENTS.md and bind all phases — do not reopen.

Standing constraints for v3.3:

- Zero new npm dependencies (D-33-11) — S3 client, cron math, tar/gzip all hand-rolled on Node stdlib
- 5-locale keyed refusals land in the same commit as the first emitting gate (en/fr/nl/de/es)
- Restore authority is scoped by LIVE rights, never archive contents (D-33-10); download tiered above run rights
- One destination per task (D-33-12 anti-features ratified)
- Continuous phase numbering: v3.3 starts at Phase 85 (v3.2 ended at 84)
- 89-04: keyed refusal classes persist verbatim into restore_runs.error as `<code>: <message>` (D-89-33 consumer contract)
- 89-04: D-89-28 restore outcome emails claim through the outbox transition gate — compare-in-UPDATE on the run row's terminal write + dedup key `restore-alert:<runId>:<email>`; EN fallback fires on tFor's key-shaped return (tFor never throws for missing keys) pending plan 06 locale keys

Research flags carried into planning (do not resolve at roadmap level):

- Phase 86: ustar size math; file-id→workspace/project mapping verification; tmp hygiene sweep
- Phase 87: GFS namespace semantics (per-task vs shared — recommend per-task)
- Phase 88: MinIO/B2 provider quirks re-check against pinned MinIO version
- Phase 89: overwrite-restore concurrency model; row-shaped tables restore scope; MCP mirror in/out

## Performance Metrics

**Velocity:**
- Total plans completed (v3.3): 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 85 | 2 | - | - |
| 86 | 2 | - | - |
| 87 | 0 | - | - |
| 88 | 3 | - | - |
| 89 | 0 | - | - |
| 90 | 0 | - | - |

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 86 P86-01 | 22 min | 3 tasks | 4 files |
| Phase 86 P02 | ~50m | 3 tasks | 15 files |
| Phase 87 P87-01 | 30m | 4 tasks | 12 files |
| Phase 87 P87-02 | 38m | 3 tasks | 3 files |
| Phase 87 P4 | 49m | 3 tasks | 15 files |
| Phase 87 P87-03 | 4h | 2 tasks | 5 files |
| Phase 87 P87-03 | 4h | 2 tasks | 5 files |
| Phase 89 P01 | 31min | 3 tasks | 3 files |
| Phase 89 P02 | 13min | 3 tasks | 5 files |
| Phase 89 P03 | 26m | 3 tasks | 6 files |
| Phase 89 P04 | 77m | 3 tasks | 6 files |
| Phase 89 P05 | 41min | 3 tasks | 9 files |

## Accumulated Context

### Decisions

Owner-ratified 2026-11-21 (REQUIREMENTS.md D-33-1..12, binding):

- D-33-1 tar+gzip "gr8r backup v1", manifest entry 0, per-table NDJSON, sha256 3-level, one code path SQLite/Postgres
- D-33-2 import-as-new (-restored) default; overwrite optional with type-to-confirm + pre-restore snapshot
- D-33-3 local + S3-compatible destinations v1; SMB/FTP v2
- D-33-4 extensible instance_roles table; Super Admins implicit members
- D-33-5 one "Instance Roles" tab in Instance > Governance
- D-33-6 GFS per task, per-scale counts, defaults 7/4/12/5
- D-33-7 Backup Operator = full task CRUD; Restore Operator = browse/preview/restore only
- D-33-8 transition-based failure email via email_outbox (no success emails)
- D-33-9 builder + presets in UI, stored as 5-field cron subset (no free-text cron)
- D-33-10 restore authority by live rights; operational tables never selectively restored
- D-33-11 zero new npm dependencies
- D-33-12 anti-features out of scope: incremental/dedup, encryption at rest, per-item restore UI, dry-run, success emails, multi-destination tasks, SMB/FTP, live-restore browse

Cross-phase decisions that freeze in Phase 86: archive format, manifest schema + entity addressability, data-vs-operational table classification, checksum canonical statement (sha256 of final destination bytes, computed once at export).
- [Phase 86]: gr8r backup v1 export pipeline frozen: manifest formatVersion 1 entry 0, 22 classification-tagged tables, flat files/<id> archive paths, whole-archive sha256 in status payload + .sha256 sidecar (86-01) — Freezes the archive format consumed by Phases 87/88/89; ratified plan-time decisions (ship-all tables, flat paths, checksum canonical statement)
- [Phase 86]: db-adapter pgPoolRef() added as the sanctioned read-only pool seam for the export fence; blob copies run after fence release (Pitfall 4) — pg fence needs a checked-out client without exposing the pool; snapshot xmin must never span filesystem streaming
- [Phase 86]: 86-02: route refuses via getRunState() then relies on runExport's synchronous claim (before first await) as the atomicity point; claim-race pinned by test
- [Phase 86]: 86-02: project-scope existence read from the workspace doc data.projects (same source as the 86-01 collector), fail-closed
- [Phase 87]: D-04 one-way raw 5-field cron storage ratified by owner (87-01 checkpoint, 2026-11-21); next_run_at is a persisted cache, never re-parsed at tick
- [Phase 87]: Backup task identity: backup_runs.task_id NULL = manual Run-now archive outside rotation (D-11); default task tz Europe/Paris via resolveTz(null) — users has no tz column
- [Phase 87]: 87-01 keyed-refusal collisions resolved: scope refusal is backupInvalidScope (perms key untouched), name refusal reuses generic taskNameRequired, dead backupNotConfigured removed x5
- [Phase 87]: 87-02 overlap detection maps runExport's synchronous claim refusal (code backupRunInProgress) — the claim is the atomicity point; refused fire records skipped_overlap and never starts a second export
- [Phase 87]: 87-02 next_run_at recomputes from NOW BEFORE the awaited fire — structural at-most-once catch-up (D-05), concurrent passes/crashes cannot double-fire a window
- [Phase 87]: 87-02 persisted-run writer seam (setBackupRunWriter) covers both triggers from one seam — manual POST and scheduled fires share the backup_runs lifecycle; history cap = 50 (D-14)
- [Phase 87]: tzPreselect lives in src/lib/timezones.js (settings.js re-exports) — entry-resident actions.js needs the shared rule without an entry→settings edge (87-04, chunk gate)
- [Phase 87]: Backup task edit mode never re-sends an untouched schedule (cronDirty flag); per-task Run now reuses POST /api/backup/runs with the task scope (87-04)
- [Phase 87]: 87-03: GFS rotation uses exactly-one-bucket assignment (UTC calendar position, oldest-first, all positions marked seen); newest verified run excluded by explicit id<>?
- [Phase 87]: 87-03: backup alerts are transition-only via third outbox claim site (backup-alert:<runId>:<email> dedup); locale keys delegated to 87-04 via 87-03-LOCALE-HANDOFF.md (SC-5 EN fallback meanwhile)
- [Phase 87]: 87-03: GFS rotation uses exactly-one-bucket assignment (UTC calendar position, oldest-first, all positions marked seen); newest verified run excluded by explicit id<>?
- [Phase 87]: 87-03: backup alerts are transition-only via third outbox claim site (backup-alert:<runId>:<email> dedup); locale keys delegated to 87-04 via 87-03-LOCALE-HANDOFF.md (SC-5 EN fallback meanwhile)
- [Phase 89]: 89-01: restore gate = exported gateEntryName() at extraction decision time; readArchiveEntries stays a pure preview enumerator (instance-scope names enumerate, restore never writes them)
- [Phase 89]: 89-01: keyed refusal vocabulary (restoreArchive*/restoreEntryRejected/restoreShaMismatch/restoreContainmentViolated/restoreArchiveIncomplete) documented in export/restore.js module header for plans 03/04 fail() mapping
- [Phase 89]: Restore persistence substrate landed: restore_runs/restore_lock on both engines with boot sweeps
- [Phase 89]: plans 03-06 build on the CAS lock + writer seam; stale-run sweep follows the 87 idiom (all running rows, no threshold)
- [Phase 89]: 89-02: skipped_overlap reason rides backup_runs.error column; refusal code is exactly backupRestoreInProgress (plan 04/06 vocabulary)
- [Phase 89]: 89-03: list+preview badges derive from run-row truth (backup_runs.uploaded + fs), never live S3 probing
- [Phase 89]: 89-03: preview throttle 10/15min operator-keyed sits BEFORE the capability gate, consuming a try on refusal (D-89-22/OQ5)
- [Phase 89]: 89-03: streamVerifyArchive gates entries during the walk with extraction's posture (escape fatal, shape-miss skip-and-record)
- [Phase 89]: restoreOverwriteUnit consumes releaseLock — failWith funnel + success-path release (D-89-32); the route always claims before firing, the unit owns releasing — Route success cell failed 'the lock released' — the unit ignored opts.releaseLock entirely, leaking every route-triggered overwrite claim
- [Phase 89]: D-89-28 enforced: handleRestoreRunOutcome skips trigger='instance' runs — the post-commit global session revocation is DR's notification — The skip existed only as a comment; the DR no-claims test passed solely because its fixture left MAILER disabled
- [Phase 89]: Overwrite route validates confirmName against the target's exact CURRENT live name (D-89-27) BEFORE archive resolution; CAP.BACKUP_MANAGE gate keyed backupManageRequired (no new refusal code) — A refused phrase is a near-zero-read trigger with zero state change; the client confirmModal is chrome, never the boundary
- [Phase 89]: 89-05 TDD evidence committed (tdd/red-89-05-task1..3.json); Task 3 RED re-captured after the prior executor stalled on crashing fixtures (RED_EVIDENCE_OK) — Never commit RED evidence whose failures do not match the actual failing cells — the prior fixture crashed (Unknown named parameter '0') instead of failing intentionally

### Pending Todos

None yet.

### Blockers/Concerns

- Phase 86 is the one genuinely new engineering surface (archive format, snapshot fence) — plan-phase with research recommended
- Phase 89 is the highest-risk phase (restore atomicity, id remap, privilege escalation) — security contract (Phase 30 pattern, threats_open: 0) required
- v3.2 carried-forward debt: Nyquist VALIDATION.md missing for 80/81/82/84; webhook-events pre-existing test failure

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| pre-existing failure | webhook-events.test.mjs "due task with subscribed hook yields exactly ONE due.reminder delivery" fails (0≠1 claim row) — reproduced on the pre-78 tree (5b4aae51 server.js); unrelated to the creation gate | open | 78-01 | v3.1 |

## Session Continuity

Last session: 2026-11-23T06:10:19.511Z
Stopped at: Completed 89-05-PLAN.md
Resume file: None

## Operator Next Steps

- Review .planning/ROADMAP.md, then run /gsd-plan-phase 85
