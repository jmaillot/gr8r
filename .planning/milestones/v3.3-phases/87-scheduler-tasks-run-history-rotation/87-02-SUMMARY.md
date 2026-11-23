---
phase: 87-scheduler-tasks-run-history-rotation
plan: 02
subsystem: backup-scheduler
tags: [backup, scheduler, cron, run-history, overlap, catch-up]
requires: [phase-87-plan-01-ddl-cron-crud, phase-86-export-pipeline]
provides: [runBackupSchedulerPass-sweep, backup-runs-writer-seam, task-scoped-archive-naming, boot-stale-run-sweep, GET /api/backup/runs?taskId=]
affects: [87-03-failure-emails, 87-04-client-builder, 87-04-rotation]
tech-stack:
  added: [] # zero new dependencies (D-33-11 discipline held)
  patterns: [injectable-clock-sweep, setinterval-unref-discipline, synchronous-claim-as-atomicity-point, writer-seam-both-triggers, test-only-internal-pass-route]
key-files:
  created:
    - test/backup-scheduler.test.mjs
  modified:
    - server.js
    - export/backup.js
key-decisions:
  - "Overlap detection maps runExport's SYNCHRONOUS claim refusal (code backupRunInProgress) rather than a pre-claim getRunState() probe — the claim is the atomicity point (86-02 precedent); a refused fire inserts the skipped_overlap row and never starts a second export (D-06)"
  - "next_run_at is recomputed from NOW BEFORE the awaited fire — collapses missed windows into one firing (D-05 at-most-once catch-up, structural: no missed-window loop exists) and makes a concurrent pass or crash-mid-export unable to double-fire the same window"
  - "Persisted-run writer seam (setBackupRunWriter + awaited start/complete/fail emissions inside runExport) covers BOTH triggers from one seam — the manual POST path and scheduled fires share the same backup_runs row lifecycle, row id = the D-18 run id"
  - "History cap = 50 (D-14 'capped ~50' → 50, documented); taskId=manual query variant lists D-11 manual archives; frozen /api/backup/runs/current GET byte-untouched"
  - "Task 2 (tdd) semantics tests were written first and pinned already-GREEN behavior — the tracer shipped the full production fire-or-skip path, so no synthetic REDs were staged (documented honestly in the commit)"
requirements-completed: [BKBCK-03, BKBCK-04]
coverage:
  - deliverable: scheduler sweep runBackupSchedulerPass({ now }) — boot catch-up pass + 60s unref'd tick with try/catch AND promise .catch (D-08/T-87-04)
    verification: { kind: test, ref: "test/backup-scheduler.test.mjs — due task fires once; malformed-cron resilience test; interval discipline asserted structurally in server.js source", status: pass, human_judgment: false }
  - deliverable: at-most-once catch-up — 3 missed windows collapse into exactly one firing (D-05)
    verification: { kind: test, ref: "test/backup-scheduler.test.mjs 'next_run_at three windows in the past fires exactly ONCE'; structural grep: no while/for over missed cron windows", status: pass, human_judgment: false }
  - deliverable: overlap skip — skipped_overlap row, no second export, next_run_at still recomputed (D-06, 86-D-10)
    verification: { kind: test, ref: "test/backup-scheduler.test.mjs 'a sweep fire during an active run records skipped_overlap' (48MB blob holds the export open)", status: pass, human_judgment: false }
  - deliverable: disabled tasks never fire; re-enable recomputes from now (D-07)
    verification: { kind: test, ref: "test/backup-scheduler.test.mjs disabled-skip + re-enable tests (stale-past cache cannot surprise-fire)", status: pass, human_judgment: false }
  - deliverable: boot stale-run sweep — status='running' → 'interrupted' before the first tick
    verification: { kind: test, ref: "test/backup-scheduler.test.mjs reboot test (same dataDir, server1 → server2)", status: pass, human_judgment: false }
  - deliverable: persisted-run writer seam covering manual + scheduled triggers (BKBCK-04, 86-D-11)
    verification: { kind: test, ref: "tracer test (scheduled row succeeded, task-scoped filename/sidecar on disk) + manual POST test (trigger manual, task_id NULL, frozen 86-D-14 naming)", status: pass, human_judgment: false }
  - deliverable: task-scoped archive naming backup-task-<taskId>-<UTC ts>.tar.gz; manual naming unchanged
    verification: { kind: test, ref: "filename regex assertions in both tracer tests", status: pass, human_judgment: false }
  - deliverable: GET /api/backup/runs?taskId= — newest-first capped 50, both-role read gate, taskNotFound after the gate (T-86-06)
    verification: { kind: test, ref: "55-row cap test; RESTORE_USE-only holder 200 / non-holder keyed 403; manual query; frozen current GET still answers", status: pass, human_judgment: false }
  - deliverable: full-suite regression gate
    verification: { kind: test, ref: "npm test — 2137 pass / 0 fail (14 pre-existing env skips); T-45-08 pg-safe statement scan green after inlining the history SQL", status: pass, human_judgment: false }
estimate:
  tokens: 85000
actuals:
  tokens: 58000 # chars/4 over the realized diff (~232k chars across 3 files)
  tasks: 3
  commits: 3
  plan_head_before: 6c7b70c8c9be9e5f7fecb681eeb883cc5fa93129
plan_head_after: 9b574dc1
duration: 38m
completed: 2026-11-21
status: complete
---

# Phase 87 Plan 02: Scheduler Sweep + Run Writer + History Summary

The scheduler itself: a 60s unref'd sweep with injectable clock and structural at-most-once catch-up (next_run_at recomputed from NOW before the awaited fire), overlap refusals recorded as skipped_overlap rows through runExport's synchronous-claim atomicity point, a persisted-run writer seam inside runExport covering BOTH triggers, boot sweeps for stale `running` rows, task-scoped `backup-task-<taskId>-<ts>.tar.gz` naming, and the capped newest-first `GET /api/backup/runs?taskId=` history endpoint — 38m (22:19–22:57 UTC), 3 tasks, 3 commits, 3 files, test/backup-scheduler.test.mjs 12/12.

## What shipped

- **Sweep (server.js):** named async `runBackupSchedulerPass({ now })` — `enabled=1 and next_run_at <= now` select; per-task try/catch (T-87-04: one malformed task never starves others); a stored cron the evaluator cannot parse logs + clears next_run_at and fires nothing; next_run_at recomputed from NOW **before** the awaited fire (that recompute IS the D-05 catch-up — no missed-window loop exists anywhere, verified structurally); boot catch-up pass awaited, then 60_000 unref'd interval with try/catch AND promise `.catch` (verbatim setInterval discipline).
- **Writer seam (export/backup.js):** `setBackupRunWriter()` installed once at boot; `runExport(scope, { taskId, trigger })` emits awaited start/complete/fail events so every run — manual POST or scheduled fire — persists a `backup_runs` row (row id = D-18 run id; started_at/duration_ms/size_bytes/sha256/filename/error all recorded). Writer errors never affect the run. Task-scoped `archiveName` variant; manual names frozen per 86-D-14.
- **Boot sweeps:** `sweepStaleBackupRuns()` marks stale `status='running'` rows `interrupted` beside `sweepStaleBackupStaging`, before the first tick.
- **History endpoint:** `GET /api/backup/runs?taskId=<id>` (and `taskId=manual`) — newest first, LIMIT 50, projected to exactly the D-14 history-card fields; both operator roles read, non-holder keyed `backupManageRequired`; `taskNotFound` only after the gate (T-86-06); frozen `/api/backup/runs/current` GET untouched.
- **Tests:** test/backup-scheduler.test.mjs — 12 tests: tracer fire path, manual writer coverage, token-fail-closed route, overlap skip, catch-up-once, disabled skip, re-enable recompute, boot stale-row sweep (reboot harness), malformed-cron resilience, history cap/gates/manual query.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocker] History SQL composed via template interpolation broke the T-45-08 pg-safe statement scan**
- **Found during:** Task 3 — `db.all(\`${select} ...\`)` composition was flagged by test/db-adapter.test.mjs's pg-safety scanner (2 pg-unsafe statements).
- **Fix:** inlined the full SQL string in each branch (no shared template fragment).
- **Files:** server.js. **Commit:** 9b574dc1

**2. [Plan-sanctioned resequencing] Task 2 semantics pinned already-GREEN behavior**
- The tracer shipped the full production fire-or-skip path (production-quality, never a throwaway), so the Task-2 TDD matrix (overlap, catch-up, disabled, re-enable, boot sweep, malformed cron) passed without further production edits. Tests were still written first and are the pinning regression suite; documented honestly in commit 6f5862a9 — no synthetic REDs were staged.

## Verification

- `node --test test/backup-scheduler.test.mjs test/backup-tasks-api.test.mjs test/backup-cron.test.mjs` — 35/35 pass
- `node --test test/backup-routes.test.mjs test/backup-export.test.mjs test/db-adapter.test.mjs` — 49 pass / 0 fail (1 pre-existing env skip)
- `npm test` — 2151 tests, **2137 pass, 0 fail** (14 skipped, pre-existing env-gated)
- withDb: scheduled row carries trigger='scheduled', task_id, non-null started_at, sha256, task-scoped filename + sidecar on disk in DATA_DIR/backups; manual row carries task_id NULL + frozen naming

## Known Stubs

None — both trigger paths are fully wired to persisted rows; the history endpoint serves the seeded data; failure-email transitions and rotation are 87-03/87-04 scope (sequenced, not stubbed).

## Threat Flags

None — the shipped surface matches the plan's threat model: T-87-04 mitigated (named helper + .catch + .unref() + per-task try/catch, pinned by the malformed-cron test); T-87-05 mitigated (every run persisted with trigger/status/duration/size/sha256/error, overlap attempts visible as skipped_overlap, history served through a gated keyed-refusal endpoint); T-87-SC N/A (zero new npm dependencies). Persisted error strings surface only through the gated endpoint and are esc() duty on the client (87-04).

## Self-Check: PASSED

- Files exist: test/backup-scheduler.test.mjs ✓; server.js + export/backup.js modified ✓
- Commits exist: 7c5d18d6 (tracer), 6f5862a9 (semantics), 9b574dc1 (history) ✓ — measured 6c7b70c8..HEAD = 3
