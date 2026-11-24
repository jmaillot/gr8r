---
phase: 92
plan: 92
subsystem: backup
tags: [gfs, backup-runs, naming, cron-descriptor, history-api, scopes]
requires: [Phase 87 backup tasks/rotation, Phase 90 missing_blob_count, export/cron.js]
provides: [export/gfs.js single GFS definition, backup_runs.gfs_bucket column + backfill, five-segment archive naming, describeCron + task.schedule, GET /api/backup/runs?all=1, GET /api/backup/scopes]
affects: [Phase 94 backup history UI, restore surface, rotation]
tech-stack:
  added: []
  patterns: [provider seam (setBackupGfsBucketProvider), shared pure module relocation (export/cron.js discipline)]
key-files:
  created: [export/gfs.js, test/backup-scopes.test.mjs, test/fixtures/backup-runs-legacy-golden.json]
  modified: [server.js, db-adapter.mjs, export/backup.js, export/cron.js, test/backup-routes.test.mjs, test/backup-rotation.test.mjs, test/db-adapter.test.mjs, test/migration.test.mjs, test/backup-export.test.mjs, test/backup-scheduler.test.mjs, test/gfs-kept-until.test.mjs]
decisions:
  - D-02 gate: owner APPROVED the boot-time idempotent `where gfs_bucket is null` backfill over succeeded backup_runs rows (decision recorded 2026-11-24)
  - GR8R_INSTANCE_NAME env var chosen as the instance-name source (D-03) — no settings table exists; env is the zero-DDL mechanism, slugified hostname fallback
  - GFS marker in archive naming resolved via a provider seam consulted once per run after the start-event row insert (provider failure degrades to no marker)
  - collision suffix now starts at -2 (D-01) inserted before .tar.gz; the sha256 sidecar is written from the FINAL uniquified name
  - ?all=1 unknown filter values narrow to EMPTY (fail-closed); invisible workspace/project rows are dropped, never error'd
metrics:
  duration: ~25min
  completed: 2026-11-24T00:02:17Z
status: complete
commits: 7
plan_head_before: 29169143811be946530922cebe341fc65b436128
plan_head_after: c300a146
estimate: ~50k tokens
actuals:
  tokens: ~68000
  tasks: 8
  commits: 7
---

# Phase 92 Plan 92: Server Payload Contracts Summary

**One-liner:** single pure GFS module (export/gfs.js) + stored `gfs_bucket` with owner-approved idempotent boot backfill, five-segment server-resolved archive naming with GFS markers, describeCron→task.schedule, fail-closed `?all=1` cross-task history and the minimal `/api/backup/scopes` payload — the full server contract Phase 94 renders without deriving anything.

## Tasks Completed

| # | Task | Commit | Key files |
|---|------|--------|-----------|
| 1 | Wave-0 guards (golden legacy snapshot, scopes scaffold, pinned GFS dates) | 7663f1a6 | test/backup-routes.test.mjs, test/backup-scopes.test.mjs, test/gfs-kept-until.test.mjs, fixtures |
| 2 | export/gfs.js extraction + gfs_bucket storage end-to-end (tracer) | a59a6def | export/gfs.js, server.js, db-adapter.mjs, rotation/db-adapter tests |
| 3 | Checkpoint: backfill gate | — | **Owner APPROVED 2026-11-24** |
| 4 | gfs_bucket boot backfill sweep (post-gate) | 8c8a00a2 | server.js, test/migration.test.mjs (reboot-seed-reboot idempotency) |
| 5 | Archive naming: instance name, GFS marker, collision suffix, runLabel | c8be59b9 | export/backup.js, server.js, export/scheduler/routes test pins |
| 6 | describeCron structured descriptor + task.schedule (TDD) | 9d04a055 | export/cron.js, server.js, test/backup-cron.test.mjs |
| 7 | GET /api/backup/runs?all=1 unified history variant | f36aca06 | server.js, test/backup-routes.test.mjs |
| 8 | Operator-gated GET /api/backup/scopes | c300a146 | server.js, test/backup-scopes.test.mjs |

## Verification

- Full backup battery: `node --test test/backup-*.test.mjs test/gfs-kept-until.test.mjs test/db-adapter.test.mjs test/migration.test.mjs test/dst-cron-boundaries.test.mjs` → **262 pass / 0 fail / 9 skipped** (pg-matrix + GOLDEN_CAPTURE gates).
- Golden legacy snapshot test (D-05 byte-identity gate on frozen GET /api/backup/runs) green through every task.
- `workspacesForUser` untouched — only referenced in a comment; golden guard clean.
- Single GFS definition: `grep -c "function isoWeekKey\|function assignGfsBuckets" server.js export/gfs.js` → 0 / 2.
- Tracer gate (after T2): full `<verify>` re-run end-to-end, pass.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3] Dropped `startedAtMs` declaration during the T5 provider reposition**
- **Found during:** Task 5 (full-suite run)
- **Issue:** moving the GFS provider call after the start-event emission dropped the `const startedAtMs = currentRun.startedAt;` declaration → ReferenceError killed every export fire (caught by the backup-tasks-api suite).
- **Fix:** declaration restored before the start emission.
- **Commit:** c8be59b9

**2. [Rule 1] Collision uniquifier started at -1, D-01 mandates -2**
- **Found during:** Task 5 tests; loop rewritten (baseName computed once, suffix before .tar.gz).
- **Commit:** c8be59b9

**3. [Rule 1] Legacy guard accidentally narrowed in the ?all=1 branch edit**
- **Found during:** Task 7 self-review; the shared 403 guard is restored verbatim (no `all` condition).
- **Commit:** f36aca06

### Notes (not deviations)
- The frozen-route filename pins and the scheduler/manual naming pins were UPDATED (not reverted) per the plan's filename-format change mandate (D-01/BKNAME-01).
- `scopeLabel` exported from export/backup.js so the ?all=1 variant resolves run labels from the same source (plan listed this under Task 7 files).

## Auth Gates

None.

## Known Stubs

None — no placeholder values, all data sources wired (backfill covers historical NULLs; NULL fallback stays as defense-in-depth).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: read-surface | server.js | `/api/backup/runs?all=1` is a new cross-task read surface — mitigated in-scope: same 401/403 chain, strict filter vocabulary, per-run fail-closed scope visibility, limit capped at 200 |
| threat_flag: read-surface | server.js | `/api/backup/scopes` leaks workspace id/name/slug to backup/restore roles — gated, minimal payload, archived excluded |

## Self-Check: PASSED

- All key files exist (verified via test runs and git stat).
- All 7 commit hashes present in `git log` (7663f1a6, a59a6def, 8c8a00a2, c8be59b9, 9d04a055, f36aca06, c300a146).
