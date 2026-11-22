---
phase: 87-scheduler-tasks-run-history-rotation
verified: 2026-11-22T09:15:00Z
status: human_needed
score: 21/21 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
covered_files:
  - server.js
  - db-adapter.mjs
  - export/cron.js
  - export/backup.js
  - mailer.js
  - src/pages/backup.js
  - src/actions/actions.js
  - src/core/api.js
  - src/lib/timezones.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/es.json
  - src/locales/de.json
  - src/locales/nl.json
  - test/backup-cron.test.mjs
  - test/backup-tasks-api.test.mjs
  - test/backup-scheduler.test.mjs
  - test/backup-rotation.test.mjs
  - test/backup-history-client.test.mjs
  - test/email-outbox.test.mjs
covered_digest: "v2:sha256:0fed042c6ed5202dbd6055153134e6c6b236a96118b0d9f47a77e4c6cbc408c3"
advisory:
  - finding: "test/backup-scheduler.test.mjs overlap test ('a sweep fire during an active run records skipped_overlap…') flaked once under combined 6-file load (line 187, rows.length 0 !== 1); 5/5 stable solo and passed on combined re-run. Timing-sensitive polling loop, not a production-logic defect."
    category: other
    reason: "Single observed flake in a load-parallel run; the invariant it asserts (skip row on refused claim) is structurally guaranteed by the synchronous claim and passed deterministically in 6 of 7 runs. Worth watching, not blocking."
    evidence_status: "1 failure in 1 combined run; 5/5 solo passes + 1/1 combined re-run pass"
human_verification:
  - test: "In a live dev server (real clock, no test harness), create a backup task with cron '* * * * *', enable it, and wait ~90s; then check the task's run history card"
    expected: "A scheduled run appears in history (trigger 'scheduled'), the archive file + .sha256 sidecar exist in DATA_DIR/backups, and next_run_at advanced past the fire time"
    why_human: "All automated tests drive the scheduler via injected clock (runBackupSchedulerPass({now}) / test-only routes); the real 60s unref'd setInterval tick wired at server.js:10810 is never exercised live"
  - test: "Create a task with low retention (e.g. daily 2) and Run now 3+ times, then trigger a rotation pass; inspect history and the backups directory"
    expected: "Oldest archives deleted (sidecar first), history rows marked 'deleted', newest verified archive always still present, audit_log carries backup_rotation:expired entries"
    why_human: "End-to-end file+DB+UI lifecycle across export → rotation → history rendering is only covered piecewise by tests; visual confirmation of the history card and directory state needs eyes"
---

# Phase 87: Scheduler, Tasks, Run History, Rotation — Verification Report

**Phase Goal:** Backup tasks run themselves — operators configure multiple scheduled tasks, consult an honest run history, and GFS rotation never deletes the newest verified backup.
**Verified:** 2026-11-22T09:15:00Z
**Status:** human_needed (21/21 truths verified; 2 live-clock UAT items — no gaps)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (source plan) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | POST /api/backup/tasks stores raw 5-field cron (D-04) + computed next_run_at (87-01) | ✓ VERIFIED | `server.js:8260` route → validation via `export/cron.js` → raw string + next_run_at insert (`server.js:8328-8335`); CRUD tests in `test/backup-tasks-api.test.mjs` (green) |
| 2 | Tasks listable/updatable/deletable/enable-disable via API; refusals keyed + audited (87-01) | ✓ VERIFIED | Route family at `server.js:8243+`; keyed refusal tests + locale-catalogue parity test in `test/backup-tasks-api.test.mjs` (green) |
| 3 | Cron evaluator computes next matching local wall-clock time in task IANA tz, stdlib-only (87-01) | ✓ VERIFIED | `export/cron.js` (7983 bytes, zero new deps — `Intl`-based); `test/backup-cron.test.mjs` green incl. tz/DST cases |
| 4 | Retention columns default 7/4/12/5 (D-09) (87-01) | ✓ VERIFIED | `server.js:693` DDL defaults + insert path `:8328`; asserted in tasks-API tests |
| 5 | Enabled task with past next_run_at fires exactly once regardless of missed windows (D-05) (87-02) | ✓ VERIFIED | `runBackupSchedulerPass` `server.js:3360-3383` — next_run_at recomputed from NOW before the awaited fire (no missed-window loop); named test "three windows in the past fires exactly ONCE" green |
| 6 | Overlapping fire records skipped_overlap row, never starts a second export (D-06) (87-02) | ✓ VERIFIED | Synchronous claim is the atomicity point; skip-row insert `server.js:3386-3392`; named test green 6/7 runs (1 load-induced flake — see Advisory) |
| 7 | Disabled tasks never fire; re-enable recomputes next_run_at (D-07) (87-02) | ✓ VERIFIED | Sweep filters `enabled = 1` (`server.js:3363`); disabled-enable tests in scheduler suite green |
| 8 | Stale status='running' rows become 'interrupted' at boot (87-02) | ✓ VERIFIED | Boot sweep `server.js:3406`; test green |
| 9 | Manual and scheduled runs both produce persisted backup_runs rows (BKBCK-04) (87-02) | ✓ VERIFIED | Writer seam `setBackupRunWriter` (`server.js:3323-3349`) awaited inside `runExport` from ONE seam covering both triggers; test green |
| 10 | GET /api/backup/runs?taskId= — newest first, capped ~50 (87-02) | ✓ VERIFIED | Route `server.js:8600+` (frozen /current block untouched per :8593 comment); cap 50 asserted in scheduler suite |
| 11 | GFS rotation applies per task over exactly-one-bucket-labeled archives after verified success (D-10) (87-03) | ✓ VERIFIED | `runBackupRotationPass` `server.js:3552+` — per-task, bucket assignment from UTC calendar, only succeeded runs scanned; `test/backup-rotation.test.mjs` green |
| 12 | Newest verified backup excluded by explicit ID, never ordering (D-13) (87-03) | ✓ VERIFIED | `id <> ?` parameter in the delete-set query (`server.js:3588-3591`, T-87-07); floor guard tests green |
| 13 | Refuse-to-empty floor: pass that would delete everything performs zero deletes (D-13) (87-03) | ✓ VERIFIED | `deleteSet.length >= runsAsc.length` guard `server.js:3593-3597` (`floorHeld` counter); test green |
| 14 | Sidecar deleted first, then .tar.gz; rows marked deleted; audited rotation event per pass (D-12) (87-03) | ✓ VERIFIED | `server.js:3602-3623` — rmSync order, status='deleted' update after, audit_log insert with per-id bucket detail; test green |
| 15 | Manual archives (task_id NULL) never auto-deleted (D-11) (87-03) | ✓ VERIFIED | Task-id universe from `task_id is not null` (`server.js:3555`); every delete query scoped `task_id = ?` |
| 16 | Failure/recovery emails only on state transitions via last_notified_state, through email_outbox, in-locale (D-15/16/17) (87-03) | ✓ VERIFIED | `handleBackupTaskOutcome` `server.js:3412-3438` (guarded compare-and-update, NULL→ok silent); third outbox claim site asserted in `test/email-outbox.test.mjs` (green); mailer `buildBackupAlertMessage` + keys in all 5 locales (CR-01 fix `919d16bf` verified) |
| 17 | Builder form: 4 presets + Custom per-field dropdowns, never free-text cron (D-01); per-task tz combobox (D-03) (87-04) | ✓ VERIFIED | `src/pages/backup.js:211-248` builder serialization; tz combobox + shared rule relocated to `src/lib/timezones.js`; source-assertion tests green |
| 18 | Per-task history card: newest-first, status/trigger/duration/size/checksum, expandable error (D-14) (87-04) | ✓ VERIFIED | `historyCard` `src/pages/backup.js:153+`, keyed trigger/status labels `:126` |
| 19 | Every rendered payload field passes through esc() (Pitfall 7) (87-04) | ✓ VERIFIED | 29 esc() uses in `src/pages/backup.js` incl. duration/error paths; `test/backup-history-client.test.mjs` green |
| 20 | Run now per task; enable/disable toggle works from page (87-04) | ✓ VERIFIED | `A.backupTaskSave/Toggle/Delete/RunNow` in `src/actions/actions.js:4952-5017` wired to `src/core/api.js` methods (`:450-464`) |
| 21 | All new page + refusal strings exist in all 5 locales (i18n parity) (87-04) | ✓ VERIFIED | Locale-catalogue parity test green; `backup.alert.*` keys counted 4/4 in es/de/nl; `backup.` key family present in en/fr |

**Score:** 21/21 truths verified (0 present, behavior-unverified)

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| BKBCK-02 | 87-01, 87-04 | Multiple backup tasks: name/scope/destination, builder schedule with presets, GFS retention defaults 7/4/12/5, enable/disable, keyed 5-locale refusals | ✓ SATISFIED | Truths 1-4, 17, 20, 21 — CRUD API + builder form + locale parity, all test-backed |
| BKBCK-03 | 87-01, 87-02, 87-03 | Cron-scheduled tz-aware runs, at-most-once catch-up, no overlap, rotation only after verified success — newest verified never deleted | ✓ SATISFIED | Truths 3, 5-8, 11-15 — sweep + rotation semantics all behavior-tested |
| BKBCK-04 | 87-02, 87-03, 87-04 | Every run recorded (status/trigger/duration/size/error/checksum), Run now per task, failure emails on transitions to Super Admins + Backup Operators | ✓ SATISFIED | Truths 9, 10, 16, 18-20 — writer seam, history endpoint + card, transition-only outbox alerts |

No orphaned requirements: REQUIREMENTS.md maps exactly BKBCK-02/03/04 to Phase 87; all three are claimed by plans and evidenced. BKBCK-05 correctly deferred to Phase 88 (not this phase's scope).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `export/cron.js` | stdlib tz-aware cron evaluator | ✓ VERIFIED | 7983 bytes; consumed by POST/PUT validation + sweep |
| `backup_tasks` DDL | cron string, tz, enabled, retention 7/4/12/5, last_notified_state, next_run_at | ✓ VERIFIED | `server.js:699-715` |
| `backup_runs` DDL | task_id nullable (manual), status check incl. skipped_overlap/deleted, checksum/duration/size/error | ✓ VERIFIED | `server.js:726-741` |
| Scheduler sweep + boot sweeps | named helpers, unref'd interval, injectable clock | ✓ VERIFIED | `server.js:3360-3406`, boot call `:10810`, test-only pass routes `:5640/:5652` |
| GET /api/backup/runs?taskId= | history read, newest first, cap 50 | ✓ VERIFIED | `server.js:8600+` |
| Rotation pass | bucket math, ID-exclusion, floor, sidecar-first, audit | ✓ VERIFIED | `server.js:3552-3640` |
| Email transition hook + mailer | last_notified_state, outbox claim, buildBackupAlertMessage | ✓ VERIFIED | `server.js:3412-3445`, `mailer.js`, keys ×5 locales |
| Client task console | builder form, history card, actions, api methods | ✓ VERIFIED | `src/pages/backup.js`, `src/actions/actions.js`, `src/core/api.js` — all imported/used, render-only over server payloads |
| 5 test files (cron/tasks-api/scheduler/rotation/history-client) | Wave-0/behavior coverage | ✓ VERIFIED | All green; 63/63 in phase-file combined run |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| POST/PUT /api/backup/tasks | export/cron.js | validation → raw cron stored (D-04) | ✓ WIRED | `server.js:8260-8335` |
| backup_tasks/backup_runs DDL | pgSchemaVariant epoch registration | db-adapter.mjs | ✓ WIRED | db-adapter.mjs modified per 87-01; mirror-sync schema pattern |
| sweep → runExport → backup_runs row | run lifecycle | claim + writer seam | ✓ WIRED | `server.js:3360-3349` |
| claimRun refusal | skipped_overlap row | synchronous claim as atomicity point | ✓ WIRED | `server.js:3386-3392` |
| boot sweep | interrupted status | update where status='running' | ✓ WIRED | `server.js:3406` |
| verified succeeded run | rotation pass for that task_id | per-task call after finalize | ✓ WIRED | `server.js:3343` |
| run finalization | last_notified_state → email_outbox → delivery kick | transition-only claims | ✓ WIRED | `server.js:3412-3445`, outbox boundary tests |
| form builder | POST/PUT raw cron | preset+field serialization (D-04) | ✓ WIRED | `src/pages/backup.js:104-248` |
| history card | GET /api/backup/runs?taskId= | payload rendered verbatim with esc() | ✓ WIRED | `src/core/api.js:464`, `src/pages/backup.js:153+` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase test files (cron, tasks API, scheduler, rotation, history client, outbox) | `node --test test/backup-{cron,tasks-api,scheduler,rotation,history-client}.test.mjs test/email-outbox.test.mjs` | 63/63 pass (combined re-run; 1 load-induced flake first run, 5/5 solo stable) | ✓ PASS |
| Full suite | `npm test` | 2153 pass / 1 fail — the fail is the documented pre-existing `due.reminder` webhook flake (matches orchestrator HEAD baseline exactly; not phase damage) | ✓ PASS |

### Probe Execution

None declared — no `scripts/*/tests/probe-*.sh` for this phase and no probe requirement in PLAN/SUMMARY.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| server.js / export/* / src/pages/backup.js / src/actions/actions.js / src/core/api.js / mailer.js | — | TBD/FIXME/XXX scan | — | No unreferenced debt markers found |
| test/backup-scheduler.test.mjs | 155-175 | timing-sensitive polling loop in overlap test | ⚠️ Warning (test-only) | Flaked once under 6-file parallel load; 5/5 solo stable. See Advisory |

### Advisory (New Scope, Unevidenced)

| # | Finding | Category | Why Advisory |
| --- | --- | --- | --- |
| 1 | Overlap test in `test/backup-scheduler.test.mjs` flaked once under combined load (line 187: rows.length 0 !== 1); stable 5/5 solo and green on combined re-run | other | Test-synchronization timing, not a production-logic defect — the synchronous claim structurally guarantees the asserted invariant. Consider a deterministic hold-open seam if it recurs. |

### Human Verification Required

1. **Live-clock scheduled fire** — create a `* * * * *` task on a live dev server, wait ~90s, confirm a 'scheduled' history row + archive + sidecar + advanced next_run_at. All automated tests inject the clock; the real 60s interval tick (`server.js:10810`) is never exercised live.
2. **End-to-end rotation lifecycle** — low-retention task, 3+ Run now, rotation pass; confirm oldest deleted (sidecar first), history rows 'deleted', newest verified retained, audit entries present.

### Gaps Summary

None. All 21 merged must-have truths (4 plans) verified against actual code: artifacts exist, are substantive (no stubs), and are wired end-to-end with real data flow (DDL → routes → sweep/rotation → writer seam → outbox → client rendering with esc()). The documented pre-existing webhook flake reproduces exactly as described and is not phase damage. CR-01 is confirmed fixed (commit `919d16bf`; `backup.alert.*` keys resolve in all 5 locales through `buildBackupAlertMessage`). Note: REVIEW-DISPOSITION.md does not yet exist — warning/info dispositions live only in the review conversation; advisory only, not a phase goal item.

---

_Verified: 2026-11-22T09:15:00Z_
_Verifier: the agent (gsd-verifier)_
