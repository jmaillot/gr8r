---
phase: 89
plan: 04
subsystem: backup-restore
tags: [backup, restore, import-as-new, tdd, bkrst-02, email-outbox]
requires:
  - 89-01 (archive reader + keyed refusal classes + manifest contract)
  - 89-02 (restore lock + staging + entry gate + restore_runs schema)
  - 89-03 (streamVerifyArchive + preview posture)
  - 88-01 (downloadToStaged + s3BackupKey seams)
  - 87-03 (email_outbox transition gate + runEmailDeliveryPass idiom)
provides:
  - POST /api/backup/restore (import-as-new trigger, guard chain verbatim, audited)
  - GET /api/backup/restore/current + GET /api/backup/restore/runs (poll + capped history)
  - export/restore.js planRemap() (pure, throws keyed restoreRemapIncomplete)
  - export/restore.js restoreImportAsNew() (one tx per restore unit, D-89-30 pre-commit totality)
  - export/restore.js runRestore() (fetching → validating → restoring → verifying → done|failed through the writer seam)
  - handleRestoreRunOutcome() — 4th email_outbox claim site (restore_alert, D-89-28)
  - mailer.js buildRestoreAlertMessage + sendRestoreAlert (EN fallback pending plan 06)
affects: [89-05 (UI restore surface), 89-05/06 (locale keys), DR plan 05 (deliberately gate-skipped)]
tech-stack:
  added: []
  patterns: [plan-then-execute-remap, one-tx-per-restore-unit, compare-in-update-transition-gate, key-shaped-i18n-fallback, fire-and-forget-run-id]
key-files:
  created:
    - test/restore-import.test.mjs
    - test/restore-routes.test.mjs
  modified:
    - export/restore.js
    - server.js
    - mailer.js
    - test/email-outbox.test.mjs
decisions:
  - "D-89-33: keyed refusal classes persist verbatim into restore_runs.error as '<code>: <message>' — the D-89-33 consumer contract"
  - planRemap is pure and throws keyed restoreRemapIncomplete; restoreImportAsNew is resolve-by-design (result carries { ok } never throws to the route)
  - "runRestore fetching stage: local archive restored in place; uploaded=1 rides the 88-01 downloadToStaged seam (D-89-16); staged tmpPath unlinked in finally with releaseLock (D-89-3/D-89-32)"
  - "D-89-23 targeting: project archives require targetWorkspaceId + LIVE membership validated BEFORE the lock claim — the lock row is never touched by a refused trigger; refusal class restoreNoWorkspace"
  - D-89-28 transition gate lives in the writer seam's terminal writes ('and status = running' compare-in-UPDATE) — a replayed terminal event changes zero rows and claims nothing; dedup key restore-alert:<runId>:<email> is the second exactly-once layer
  - buildRestoreAlertMessage detects tFor's key-shaped return (tFor never throws for missing keys) — EN literals render while restore.alert.* keys pend plan 06
metrics:
  duration: 77m
  completed: 2026-11-22T21:18:00Z
  tasks: 3
  files: 6
status: complete
actuals:
  tokens: 30756
  tasks: 3
  commits: 6
commits: 6
plan_head_before: 4a3ab32a43d628164ef4e364930ee89231af46f4
plan_head_after: 511e3249258fb7f99e314f8778cec6fa7cde5031
---

# Phase 89 Plan 04: Restore Execute — Import-as-New Engine + Trigger Routes Summary

**One-liner:** BKRST-02 import-as-new restore engine — pure planRemap with totality-validated full-ID remap, one-transaction restoreImportAsNew with a frozen `{ skipped: [{table, rows}], memberships: {skipped, inserted} }` skip report, POST /api/backup/restore trigger + poll/history routes behind the verbatim backup guard chain, and D-89-28 outcome emails riding the outbox transition gate with EN fallback pending plan 06.

## What Was Built

1. **planRemap + restoreImportAsNew engine** (Task 1 tracer, commits `e2336365` RED / `3b4e6ddf` GREEN): `planRemap(manifest, archiveRows, liveContext)` is pure — builds the fresh id map (P4: user ids NEVER remapped), remaps the doc fragment through whitelisted shapes, validates every user-bearing row against live users (dangling → skip + report), and throws keyed `restoreRemapIncomplete` BEFORE any insert on any unmapped reference. `restoreImportAsNew` executes the plan: one transaction per restore unit (Pattern 2), the D-89-30 totality re-check runs pre-commit inside the tx (any gap → full rollback → compensating blob unlinks), operator-only membership (D-89-9, provenance 'restore'), blobs re-addressed flat (86 A6), FTS sync inside the tx, D-89-13 `-restored` / `-restored-2` name auto-counter mirroring the uniqueSlug loop. Skip report: operational-classified manifest tables + invites counted per `{ table, rows }`, memberships/teamMembers folded into `{ skipped, inserted }` — reported, never inserted.
2. **runRestore + trigger/poll routes** (Task 2, commits `8eee44f5`+`cf757b08` RED / `d9a48484` GREEN): `runRestore` walks the D-89-29 stage pipeline through the writer seam — fetching (local archive in place; uploaded=1 via downloadToStaged, D-89-16), validating/restoring/verifying delegated to restoreImportAsNew — and the `finally` ALWAYS releases the restore lock + unlinks a downloaded staged archive. POST /api/backup/restore: guard chain verbatim from the backup funnel — sameOrigin → requireUser → `tooMany(restorerun|id, 5, 15min)` → RESTORE_USE gate before body probing (D-89-21, audited) → runId regex → backup_runs row must be succeeded with sha256+filename (else 404 `restoreArchiveMissing`, audited) → scope workspace|project → D-89-23 live-membership targeting pre-claim (400 `restoreNoWorkspace`, audited) → concurrency slot (frozen getRunState stage list OR restoreLockHeld → 409 `backupRestoreInProgress` + audited, the D-89-1 restore-side half) → claimRestoreLock (lost claim = same 409) → start row → fire-and-forget `runRestore(...).catch(logWarn)` → audited `restore_started:import_new` → 200 `{ runId }` (D-89-2). GET current: newest running row or `{ idle: true }`. GET runs: capped 50 newest-first (D-14). Boot installs `setRestoreRunEmitter → emitRestoreRunEvent` beside the backup writer install.
3. **Skip-report hardening + outcome emails** (Task 3, commit `511e3249`): project scope now enumerates operational tables from the manifest and reports the source workspace's never-restored roster rows honestly (a splice inserts no membership and says so). D-89-28: the writer seam's terminal writes carry an `and status = 'running'` compare-in-UPDATE guard (the last_notified_state atomicity); a REAL transition drives `handleRestoreRunOutcome` — the 4th email_outbox claim site, one claim per recipient (Backup Operators ∪ Super Admins), dedup key `restore-alert:<runId>:<email>`, kind `restore_alert`, MAILER.enabled gate, `runEmailDeliveryPass().catch(...)` POST-commit (never awaited). `buildRestoreAlertMessage` (buildBackupAlertMessage twin) renders EN literals while `restore.alert.*` keys pend plan 06 — the fallback fires on tFor's key-shaped return because tFor never throws for missing keys (latent same-family flaw in the backup builder documented to deferred-items; harmless since 87-04 landed its keys).

## Verification

- `node --test test/restore-import.test.mjs` 7/7 (tracer round-trip, remap totality negatives, dangling-user skips, project splice + skip report, frozen summary shape, negative insert sweep per operational table)
- `node --test test/restore-routes.test.mjs` 18/18 (trigger+poll E2E, D-89-13 counter chain, D-89-1 export-active + lock-held 409s + quiet-system audited lock-held refusal, 403/429 gates, D-89-23 targeting matrix, D-89-33 crafted-traversal run failure, stage CHECK, history cap)
- `node --test test/email-outbox.test.mjs` 14/14 (done/failed claims per recipient, replayed-terminal exactly-once via the writer-seam probe, injected-pass EN delivery, EN copy render, D-04 boundary at exactly 4 claim sites)
- Regression: 98/98 across restore-security, restore-preview, backup-routes, backup-export, restore-import, restore-routes, email-outbox
- `npm test`: 2263/2287 — the 4 failures are all pre-existing/out-of-scope (documented below)

## Deviations from Plan

**[Rule 2 — Missing critical functionality] tFor key-shaped-return EN fallback**
- **Found during:** Task 3
- **Issue:** the plan's "EN fallback inline" assumed the builder's try/catch fires on missing catalogue keys; tFor actually returns the KEY string for missing entries (never throws), so a try/catch fallback never fires — emails would have rendered raw i18n keys until plan 06.
- **Fix:** key-shaped-return detector (`v === key ? null : v`) drives the EN literals; catalogue copy takes over automatically when plan 06 lands the keys.
- **Files modified:** mailer.js
- **Commit:** 511e3249

**[Rule 1 — Test bugs fixed during verification]**
- Fixture slug `acme` collided with the server-boot-seeded default workspace (`ws_default`) → fixtures renamed `acme-fixture`.
- The crafted-archive test initially used a shape-miss entry (skips, never fatal); D-89-33's fatal family is path-escape — re-crafted with a `../evil.txt` member via python tarfile (GNU tar strips `..`).
- Crafted manifest initially lacked the frozen `createdAt` field → `restoreManifestCorrupt` instead of the intended entry-gate failure.
- The lock-held audit assertion raced the export pipeline's tail on the shared connection (write-suction); the audit pin moved to a quiet-system test and the anomaly is documented in deferred-items.

## Pre-existing / Out of Scope (logged to deferred-items.md)

- SQLite write-suction + post-instance-export stale snapshot on the shared connection (86-pipeline engine property).
- webhook-routes "GET list" failure = date drift (fixture timestamps outside the health window); backup-scheduler "skipped_overlap" fails only under npm-test parallel load (passes standalone 13/13); error-codes + french-typography documented pre-existing.
- Untracked `"[object Promise]/"` directory at repo root — left alone.
- server.js doc-PUT module-level `db.run` inside tx (~9453) — pre-existing Pitfall 2 violation, untouched.

## Handoff Notes

- **Plan 06 (locale):** land `restore.alert.done.subject`, `restore.alert.done.body`, `restore.alert.failed.subject`, `restore.alert.failed.body` ×5 locales (fr/es/de/nl + en base); greeting + footer reuse `notif.email.*`. EN literals render meanwhile (verified by test). Standing 5-locale parity constraint honored by that commit.
- **Plan 05 (DR):** deliberately skips the D-89-28 gate — the re-login wall is its notification.
- **Plan 05 (UI):** poll `GET /api/backup/restore/current` (stage vocabulary fetching/validating/restoring/verifying/done/failed) and `GET /api/backup/restore/runs`; trigger via POST with `{ runId, targetWorkspaceId? }`; every refusal class is keyed (D-89-33 vocabulary).

## Self-Check: PASSED

- All 4 task commits + 2 RED commits verified present (`git log 4a3ab32a..511e3249`).
- Files on disk: export/restore.js (planRemap/restoreImportAsNew/runRestore), server.js routes + hook, mailer.js builder, 2 new + 1 extended test files — all present.
- Test evidence: 7/7 + 18/18 + 14/14 + 98/98 regression runs recorded above.
- Post-close-out re-verification: 39/39 across restore-import + restore-routes + email-outbox at `f647c8ed`.
