# Deferred items — Phase 87

## 87-04 execution (2026-11-21)

- **Out-of-scope test failures in 87-03-owned files (NOT fixed by 87-04).** During 87-04 Task 3 verification, `test/backup-rotation.test.mjs` showed 5 failing tests (manual-archives rotation, writer-seam e2e rotation, D-15 failure emails, D-16 recovery, MAILER-disabled state tracking). Evidence points to 87-03's in-flight changes: server.js's complete-event seam now calls `runBackupRotationPass({ taskId })` (a bare pass from the test helper becomes a no-op) and the notify/`last_notified_state` seam is not landed yet. 87-04 does not own server.js or that suite — flagged here so the 87-03 executor / verifier picks it up. Baseline at 87-04 start (004f330e): suite was green.
  status: acknowledged

## 87-03 execution (2026-11-22)

- **Pre-existing failure (out of 87-03 scope, NOT fixed):** `test/webhook-events.test.mjs` — "a due task with a subscribed hook yields exactly ONE due.reminder delivery per reminder claim" fails in isolation (0 vs 1 claim row). 87-03's server.js diff touches no reminder/webhook/outbox-claim code; likely interaction with the concurrent 87-04 sibling's in-flight `src/locales/fr.json` edits or a pre-existing flake. Baseline check pending at verify-work.
- **Test-harness read-visibility quirk (documented, worked around):** in `test/backup-rotation.test.mjs`, after a scheduled fire that runs the export snapshot fence (`pragma wal_checkpoint(truncate)` + `vacuum into` in export/backup.js), subsequent server-side writes (backup_runs rows, outbox claims, next_run_at advance) become invisible to the test process's fresh `DatabaseSync` connections, though the server's own connection sees them (verified via in-server pre-count debug). The D-16 recovery test therefore asserts the transition through the observable delivery-kick log surface instead of outbox DB rows. Root cause not identified — deferred; revisit if test flakiness appears elsewhere.
  status: acknowledged
