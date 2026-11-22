---
status: testing
phase: 87-scheduler-tasks-run-history-rotation
source: [87-VERIFICATION.md]
started: 2026-11-22T05:05:00Z
updated: 2026-11-22T05:05:00Z
---

## Current Test

number: 1
name: Live-clock scheduled fire (real 60s tick, no injected clock)
expected: |
  Create a backup task with cron `* * * * *` (every minute) on a live dev server.
  Within ~90 seconds: a 'scheduled' run row appears in the task's history card,
  an archive + .sha256 sidecar exist in DATA_DIR/backups (task-scoped filename
  backup-task-<id>-<ts>.tar.gz), and next_run_at has advanced to the next minute.
awaiting: user response

## Tests

### 1. Live-clock scheduled fire (real 60s tick, no injected clock)
expected: |
  Create a backup task with cron `* * * * *` on a live dev server.
  Within ~90 seconds: a 'scheduled' history row, archive + .sha256 sidecar in
  DATA_DIR/backups (task-scoped filename), next_run_at advanced.
result: [pending]

### 2. End-to-end rotation lifecycle (file + DB + UI)
expected: |
  Configure a task with low retention (e.g. hourly keep 2), trigger 3+ runs
  (Run now or scheduled), then trigger a rotation pass. Expect: oldest archives
  deleted from disk (sidecar .sha256 deleted BEFORE the archive), their history
  rows marked 'deleted', the newest verified archive retained, and
  backup_rotation:expired audit entries recorded. Manual Run-now archives
  (task_id NULL) are never touched.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
