---
gsd_state_version: "1.0"
milestone: v3.3
milestone_name: Instance Operations — Backup, Restore & Roles
current_phase: 90
current_plan: Not started
status: completed
stopped_at: Phase 90 complete — all phases complete
last_updated: "2026-11-23T19:12:12.037Z"
last_activity: 2026-11-23
last_activity_desc: Phase 90 complete
state_head: 25396df54ad71125bba31ae80c6b1774a54d70a0
progress:
  total_phases: 6
  completed_phases: 5
  total_plans: 21
  completed_plans: 21
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-11-23)

**Core value:** Self-hosted, zero-dependency, multi-tenant project-management workspace — hardening
before features.
**Current focus:** Milestone v3.3 complete — all phases (85–90) done; ready for `/gsd-complete-milestone`

## Current Position

Phase: 90
Current Plan: Not started
Total Plans in Phase: 6
Status: All phases complete
Last activity: 2026-11-23 — Phase 90 complete

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
| 89 | 6 | - | - |
| 90 | 4 | - | - |

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
| Phase 89 P06 | 92 min | 3 tasks | 14 files |
| Phase 90 P01 | ~35 min | 2 tasks | 12 files |
| Phase 90 P02 | 49min | 3 tasks | 17 files |
| Phase 90 P90-03 | 49m | 3 tasks | 18 files |
| Phase 90 P04 | 49m | 3 tasks | 5 files |

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
- [Phase 89]: 89-06: restore client is render-only payload chrome — overwrite gates on canBackup payload flag, DR on isInstanceAdmin auth flag, closed RESTORE_REFUSAL_TOASTS map 1:1 onto x5 keys, ONE shared poll timer for both surfaces
- [Phase 89]: 89-06: DR phrase is a named machine constant (DR_CONFIRM_PHRASE, scanner-clean); preview drawer renders from the page layer with shared drawer classes — drawer.js untouched
- [Phase 90]: 90-01: console keys split across commits per emitting markup — superRosterEmpty* landed with task 1 (its empty branch renders there), the 7 search keys with task 2; keys never precede or lag markup (plan executor's call)
- [Phase 90]: 90-01: 3 orphaned keys removed (settings.operator.title/lead, page.governance.noMatchesOpBody) — i18n-scan dead-key gate; removed x5 same commit as the orphaning markup; net catalogue +9
- [Phase 90]: 90-01: tree-wide data-a/data-v pins bumped 610→613 / 93→94 (i18n-shell + i18n-toast) — govSuperSeg/govSuperMore markup + operatorPromote's second occurrence; D-12 same-commit pin procedure
- [Phase 90]: 90-02: history payload projects location/uploaded/checksum but NOT raw scope JSON — the pre-existing D-14 projection contract wins over the plan's additive scope field (zero client consumers; tier enforced server-side)
- [Phase 90]: 90-02: download route streams via awaited pipeline + rm-finally (house pipe-and-forget rejected — it would race the staged-temp removal); checksum mismatch is a 200 RESULT persisted server-side, never a refusal
- [Phase 90]: D-90-16 refined delivered as bucket position (kept: {position}/{keep} {scale}), never a date — recomputed per request from CURRENT policy, never stored
- [Phase 90]: Rotation projection is a strict dry-run: keep-N walk copied from runBackupRotationPass, stops after candidates — no unlink/status write/audit (D-90-12/13)
- [Phase 90]: D-90-18 verified with corrected US facts: the US ambiguous hour is 01:xx (02:00 EDT -> 01:00 EST) — a US 02:30 cron occurs once; earlier-of-two pinned non-vacuously via 01:30 probes
- [Phase 90]: Full-cycle e2e rides the INSTANCE scope (Rule 3): the DR route refuses non-instance archives (restoreTargetMismatch) — the only scope completing the DR leg
- [Phase 90]: DR staged S3 temp drops POST-commit: it must survive the D-89-30 in-tx re-hash (sha256File(archivePath)) — a post-extract drop fails that re-hash with ENOENT
- [Phase 90]: restore-list invalidation keys on run IDENTITY (startedAt compare), not stage transition — a stage-only compare misses both small-instance shapes (run finishing inside the trigger POST; run N+1 finishing while run N was already the terminal prevStage) (90-UAT fix fb356ee9)
- [Phase 90]: projection detail lists scroll in place (max-height+overflow-y on the expanded container) — 33+ candidates at full height pushed the page (90-UAT fix cf1ba1b5)
- [Phase 90]: trunc+title discipline is owner-mandated on console rows — truncation without title= was fixed, not waived (90-UAT item 3, 69b6b95c)

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
| acknowledged debt | v3.3 close: 86-02 locale-flake resolution note (closed, record only) | acknowledged | v3.3 close | v3.3 |
| acknowledged debt | v3.3 close: 87-04/87-03 out-of-scope test-failure notes (backup-rotation suite, webhook-events family) | acknowledged | v3.3 close | v3.3 |
| acknowledged debt | v3.3 close: 89-03 WAL-visibility harness quirk + housekeeping (debris dir since removed) | acknowledged | v3.3 close | v3.3 |
| acknowledged debt | v3.3 close: 89-04 out-of-scope discoveries (doc-PUT tx pitfall, write-suction, stale snapshot, webhook-routes date-drift, backup-scheduler load-flake, tFor latent fallback, plan-06 locale handoff) | acknowledged | v3.3 close | v3.3 |
| acknowledged debt | v3.3 close: 89-05 out-of-scope discoveries (error-codes/french-typography pre-existing, time-window webhook-events flake, restore-overwrite fixture fixes for the record) | acknowledged | v3.3 close | v3.3 |
| acknowledged debt | v3.3 close: 89-01 debris dir (removed at cleanup), webhook-events, logo junk-name quirk (export/backup.js:666) | acknowledged | v3.3 close | v3.3 |
| acknowledged debt | v3.3 close: 90-01 pre-existing failures french-typography + webhook-routes (byte-identical at phase-start tree) | acknowledged | v3.3 close | v3.3 |

## Session Continuity

Last session: 2026-11-23T19:15:00Z
Stopped at: Phase 90 complete (UAT 7/7, verification 42/42) — milestone v3.3 ready for /gsd-complete-milestone
Resume file: None

## Operator Next Steps

- Milestone v3.3 is 100% complete — run /gsd-complete-milestone v3.3 to archive and prepare the next milestone
