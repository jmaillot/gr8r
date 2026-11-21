# Deferred items — Phase 87

## 87-04 execution (2026-11-21)

- **Out-of-scope test failures in 87-03-owned files (NOT fixed by 87-04).** During 87-04 Task 3 verification, `test/backup-rotation.test.mjs` showed 5 failing tests (manual-archives rotation, writer-seam e2e rotation, D-15 failure emails, D-16 recovery, MAILER-disabled state tracking). Evidence points to 87-03's in-flight changes: server.js's complete-event seam now calls `runBackupRotationPass({ taskId })` (a bare pass from the test helper becomes a no-op) and the notify/`last_notified_state` seam is not landed yet. 87-04 does not own server.js or that suite — flagged here so the 87-03 executor / verifier picks it up. Baseline at 87-04 start (004f330e): suite was green.
