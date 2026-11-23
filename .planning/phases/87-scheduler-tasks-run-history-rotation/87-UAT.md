---
status: passed
phase: 87-scheduler-tasks-run-history-rotation
source: [87-VERIFICATION.md]
started: 2026-11-22T05:05:00Z
updated: 2026-11-22T09:20:00Z
audit_acknowledged:
  milestone: v3.3
  at: 2026-11-23
  gap_snapshot: "passed::scenarios=0"
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
result: PASS (2026-11-22) — human-verified on the Docker deployment (archives
  on the separate host mount); scheduled row + archive + sidecar confirmed.

### 2. End-to-end rotation lifecycle (file + DB + UI)

expected: |
  Configure a task with low retention (e.g. hourly keep 2), trigger 3+ runs
  (Run now or scheduled), then trigger a rotation pass. Expect: oldest archives
  deleted from disk (sidecar .sha256 deleted BEFORE the archive), their history
  rows marked 'deleted', the newest verified archive retained, and
  backup_rotation:expired audit entries recorded. Manual Run-now archives
  (task_id NULL) are never touched.
result: PASS (2026-11-22) — human-verified on the Docker deployment: keep-per-day
  set to 2 via the builder, 3+ runs fired, oldest archives deleted sidecar-first,
  history rows flipped to 'deleted', newest retained, manual archives untouched.

## Summary

total: 2
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

## UAT findings log (2026-11-22, round 2)

Defects found by the human UAT pass and fixed same-day (commit f80b0cad):

1. **New task → "Something went wrong"** — `settings.js` re-exported
   `tzPreselect` (`export { tzPreselect } from ...`) without a local import;
   the form render called an undefined identifier → render boundary. Reproduced
   headless, fixed with a local binding.
2. **Run now (instance) does nothing** — action read `S.ui.backupScope` raw and
   returned on null while the card rendered the instance default via fallback →
   untouched default select never fired. Guard mirrored from the render.
3. **Run now (workspace) refused** — preselected single-option select never
   fired its input handler → id null → scopeNotFound (fixed in bad4bb54).
4. **Archive names** — workspace/project/task archives now carry a slugified
   friendly name (`backup-workspace-projects-studio-<ts>.tar.gz`); resolved
   AFTER claimRun so the D-10 claim race window stays intact (8 failures when
   placed before the claim — re-run order matters, pinned by the suite).
5. **Run progress spacing** — proper `panel-h` header (title + stage badge).

Instance and workspace Run-now verified end-to-end in a real browser
(Playwright against a live server): archives + sidecars produced.

## Round-2 retest (2026-11-22) — human verified: all 4 PASS

New-task form renders ✓ | Run-now instance default fires ✓ | friendly
archive filenames ✓ | Run progress panel spacing ✓. Ready for Test 1.
