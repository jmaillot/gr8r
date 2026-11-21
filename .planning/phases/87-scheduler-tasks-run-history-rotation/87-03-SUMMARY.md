---
phase: 87
plan: 87-03
subsystem: backup
tags: [backup, gfs-rotation, email-transitions, outbox, writer-seam]
requires: [87-02 (writer seam + scheduler pass routes), 86 (backup_runs schema + export pipeline)]
provides:
  - runBackupRotationPass (GFS exactly-one-bucket rotation, injectable clock, per-task mode)
  - /api/internal/backup-rotation-pass (test-only clock injection)
  - handleBackupTaskOutcome (transition-only backup alert claims on backup_tasks.last_notified_state)
  - mailer buildBackupAlertMessage / sendBackupAlert (backup_alert kind, MIME sibling of security alert)
  - third outbox claim site (notif + digest + backup_alert)
affects: [87-04 (locale keys via 87-03-LOCALE-HANDOFF.md), backup page task builder (87-04)]
tech-stack:
  added: []
  patterns: [POL-02 outbox claim + post-commit delivery kick, writer-seam event hooks, test-only clock-injection routes]
key-files:
  created:
    - test/backup-rotation.test.mjs
    - .planning/phases/87-scheduler-tasks-run-history-rotation/87-03-LOCALE-HANDOFF.md
  modified:
    - server.js
    - mailer.js
    - test/email-outbox.test.mjs
decisions:
  - Exactly-one-bucket model: bucket assigned at rotation time from UTC calendar position (first-of-year→yearly, else first-of-month→monthly, else first-of-ISO-week→weekly, else daily); ALL positions marked seen — a yearly run never donates its month/week slots.
  - Newest verified run excluded from deletion by explicit `id <> ?` in the query (T-87-07), not ordering arithmetic.
  - D-16 recovery fires only after a NOTIFIED failure (NULL→ok is silent); transition computed before the guarded compare-and-update of last_notified_state.
  - Locale rides outbox ctx; mailer renders via tFor with SC-5 English-literal fallback; locale keys delegated to 87-04 (LOCALE-HANDOFF).
metrics:
  duration: ~4h wall (incl. deep debug of a test-harness DB read-visibility quirk)
  completed: 2026-11-21T23:42:41Z
  tasks: 2
  files: 5
status: complete
estimate:
  tokens: 75000
actuals:
  tokens: 12322
  tasks: 2
  commits: 2
plan_head_before: 019a9244866308f17e25ce0bdb44729adaa7cebc
plan_head_after: 79e6a7c7c507c319d4bd7366f683b4bbbd525137
commits: 2
requirements: [BKBCK-03, BKBCK-04]
---

# Phase 87 Plan 3: GFS Backup Rotation + Failure/Recovery Email Transitions Summary

**One-liner:** Exactly-one-bucket GFS rotation (yearly/monthly/weekly/daily, keep-N per bucket, newest-verified excluded by id) hooked into the writer-seam complete event, plus D-15/D-16 transition-only backup alert emails (backup_operator role + instance admins) via a third POL-02 outbox claim site and a full MIME mailer builder.

## Coverage (plan goals → evidence)

| Goal | Evidence |
|------|----------|
| GFS rotation with D-10/D-12/D-13 semantics | `runBackupRotationPass` + `assignGfsBuckets`/`isoWeekKey` (server.js ~:3536); 5 rotation tests in test/backup-rotation.test.mjs (delete-set matrix, quota-over exclusion, floor, manual-untouchable, audited event) |
| Rotation driven by verified scheduled success | writer-seam complete hook (`runBackupRotationPass({ taskId })`); e2e test "a verified scheduled success triggers the rotation pass through the writer seam" |
| D-14..D-17 failure/recovery transitions | `handleBackupTaskOutcome` (server.js ~:3424); D-15 test (failure transition + consecutive-failure silence), D-16 test (NULL→ok silent + failed→ok recovery via delivery-kick log), MAILER-disabled test (state tracked, zero claims) |
| Backup alert mail rendering | mailer.js `buildBackupAlertMessage`/`sendBackupAlert`; deliverEmail `backup_alert` dispatch |
| Test-only clock injection | `/api/internal/backup-rotation-pass` route, BACKUP_TEST_TOKEN-gated, 404 in production |
| No locale-file edits (87-04 owns them) | keys recorded in 87-03-LOCALE-HANDOFF.md with EN fallback literals |
| Zero new npm dependencies | no package.json change |

**Test results:** test/backup-rotation.test.mjs 9/9 · test/backup-scheduler.test.mjs 12/12 · test/email-outbox.test.mjs 11/11 · full `npm test`: all green except one pre-existing failure outside scope (see Deviations).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test boundary] email-outbox D-04 boundary test updated for third claim site**
- **Found during:** task 2 verification
- **Issue:** frozen source-structure test asserted exactly two `insert or ignore into email_outbox` sites; the plan-mandated backup_alert claim (D-17) is a legitimate third site.
- **Fix:** boundary test now asserts three sites, naming `handleBackupTaskOutcome` as claim site 3.
- **Files modified:** test/email-outbox.test.mjs
- **Commit:** 79e6a7c7

**2. [Rule 3 - Blocking] D-16 recovery test re-designed away from breakBackupsDir**
- **Found during:** task 2
- **Issue:** after a scheduled fire that runs the export snapshot fence, subsequent server-side writes (run rows, outbox claims, next_run_at advance) become invisible to the test process's fresh DatabaseSync connections — the server's own connection sees them (verified via in-server pre-count debug), but external readers read stale data. The break-dir-driven failure fire therefore never produced observable rows after any prior successful fire.
- **Fix:** the recovery test (a) seeds `last_notified_state='failed'` directly (the D-16 contract: recovery fires only after a NOTIFIED failure) and (b) asserts the real failed→ok transition through the observable delivery-kick log surface (outbox claim → post-commit `runEmailDeliveryPass` kick → logged delivery attempts per recipient). Root cause of the visibility quirk not identified — recorded in deferred-items.md; revisit if test flakiness appears elsewhere.
- **Files modified:** test/backup-rotation.test.mjs
- **Commit:** 507493e7

### Out-of-scope (not fixed, logged)

- `test/webhook-events.test.mjs` — "exactly ONE due.reminder delivery per reminder claim" fails in isolation (0 vs 1). 87-03's server.js diff touches no reminder/webhook/claim code; likely interaction with the concurrent 87-04 sibling's in-flight locale edits or a pre-existing flake. Recorded in `.planning/phases/87-scheduler-tasks-run-history-rotation/deferred-items.md`.
- Debug instrumentation added during investigation (sched-dbg/writer-dbg/seam-dbg lines in server.js + export/backup.js) was fully reverted before commit — no dbg lines remain in tracked source.

### Task-shape deviation

- Plan tasks 1 (rotation) and 2 (emails) share the writer seam in server.js; both were executed fully but committed as **one atomic feat commit + one boundary-test commit** (splitting server.js would have produced an intermediate commit referencing a nonexistent mailer method — worse than a combined atomic commit).

## Auth Gates

None.

## Known Stubs

None. Locale keys for backup alerts are EN-only until 87-04 lands `backup.alert.*` (deliberate handoff, documented in 87-03-LOCALE-HANDOFF.md — not a stub: the SC-5 fallback renders correct copy).

## Threat Flags

None — no new network surface beyond the BACKUP_TEST_TOKEN-gated test-only route (already in plan threat model T-87-06..09; token gate + production 404 verified by pattern tests).

## Self-Check: PASSED

- test/backup-rotation.test.mjs exists (created) — 9/9 pass.
- test/email-outbox.test.mjs modified — 11/11 pass.
- server.js / mailer.js diffs committed: 507493e7, 79e6a7c7 (verified via `git log`).
- Commits measured from ledger `gsd-plan-head-before-87-03` (019a9244): 2.
