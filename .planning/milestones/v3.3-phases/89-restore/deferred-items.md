# Deferred Items — Phase 89

Out-of-scope discoveries logged during execution (never auto-fixed per the scope-boundary rule).

## 89-01 execution — item 1: debris directory

- Untracked directory `"[object Promise]/"` at the repo root (files/ + logos/ subdirs, dated 2026-11-21 — predates this session). Looked like debris from an earlier string-interpolation bug (origin: `export/backup.js:666` `String(doc.logo)` on object-shaped `doc.logo`, item 3 below). Not created by any plan; removal was a user cleanup decision.
  status: acknowledged

<!-- resolved 2026-11-23: the debris dir was removed during the v3.3 milestone cleanup. -->

## 89-01 execution — item 2: webhook-events failure

- `test/webhook-events.test.mjs` — "due task with subscribed hook yields exactly ONE due.reminder delivery" fails. Known since 78-01. Pre-existing, unrelated to backups/restore.
  status: acknowledged

## 89-01 execution — item 3: logo junk-name quirk

- `export/backup.js:666` — `String(doc.logo)` on an object-shaped `doc.logo` produces `"[object Promise]"`-style junk names for logo collection. Possibly the origin of item 1. Pre-existing writer quirk; touching it would change 86 behavior mid-restore-phase. Flag for a follow-up fix.
  status: acknowledged

## 89-03 (2026-11-22)

- [harness] WAL-visibility race: raw DatabaseSync access AFTER a run's `wal_checkpoint(truncate)` + `vacuum into` (export/backup.js:358-361) can lose visibility of server-connection writes (reproduced: post-run signup 201 but row invisible to a fresh handle; wal unlinked mid-test). Not a product bug — harness pattern is "keep withDb access pre-run" (comment in test/restore-preview.test.mjs). Candidate for a future test-harness plan.
- [housekeeping] Untracked `"[object Promise]/"` debris dir in repo root predates 89-03 — origin unknown, untouched.
  status: acknowledged

## 89-04 out-of-scope discoveries (2026-11-22)

- **[pre-existing] server.js doc-PUT module-level `db.run` inside tx (~line 9453):** a module-level db call inside a pg tx body lands OUTSIDE the transaction (db-adapter Pitfall 2). Not touched by this plan; flagged for a future hardening pass.
- **[pre-existing] Untracked `"[object Promise]/"` directory at repo root:** artifact of an old string-interpolation bug somewhere; not created by this plan, left alone.
- **[pre-existing] SQLite write-suction under an in-flight export pipeline:** a route write issued while the 86 export pipeline's tail work is still settling on the shared connection can be sucked into that transaction and lost (observed: an audit insert; dbg3c). The D-89-1 lock-held test pins its audit on a quiet system and documents this inline. Engine-wide property of the shared-connection discipline, out of scope for 89-04.
- **[pre-existing] Post-instance-export stale snapshot:** after an instance-scope export, the server connection can serve a pinned pre-release snapshot of `restore_lock` for an extended window (dbg7/dbg8: external release invisible to the server process). Pre-existing 86-pipeline anomaly; the lockaudit test restructures around it (quiet-system restart assertions). Worth a dedicated investigation in a future phase.
- **[pre-existing, date-drift] test/webhook-routes.test.mjs "GET list: ... health computed from deliveries":** fails because fixture timestamps drifted outside the health window relative to real now (same webhook family as the documented webhook-events pre-existing failure).
- **[pre-existing, load-flaky] test/backup-scheduler.test.mjs "skipped_overlap":** passes standalone (13/13); fails only under full `npm test` parallel load (timing). Same for `error-codes`/`french-typography` documented pre-existing failures.
- **[latent, same family] buildBackupAlertMessage try/catch i18n fallback:** tFor returns the KEY for a missing catalogue entry (never throws), so a try/catch EN fallback never fires. Harmless today (backup.alert.* keys landed in 87-04) — buildRestoreAlertMessage (89-04) uses the key-shaped-return detector instead; refactoring the backup builder is out of scope.
- **[handoff] plan 06 locale keys:** page.restore email keys (restore.alert.done.subject/body, restore.alert.failed.subject/body — 4 keys + greeting reuse) land ×5 locales there; EN literals render meanwhile (verified by test).
  status: acknowledged

## 89-05 out-of-scope discoveries (2026-11-23)

- **[pre-existing] test/error-codes.test.mjs "every error code the server emits has a non-empty err.<code> entry":** fails `en missing err.backupRestoreInProgress` — verified pre-existing by re-running at 89-04 close-out (eeb6bbed) AND at STATE.md state_head 7fdbe257 (pre-89-04-execution). The 89-04 keyed refusal vocabulary landed before its catalogue entries; plan 06's locale commit owns the ×5 err.* keys.
- **[pre-existing] test/french-typography.test.mjs:** same catalogue family, verified pre-existing at the same two commits.
- **[load-flake, pre-existing] test/backup-scheduler.test.mjs "skipped_overlap":** green solo (13/13, re-verified twice this session); fails only under `npm test` parallel load — unchanged from the 89-04 note.
- **[housekeeping] stray `node server.js` process** leaked by the stalled prior executor's test runs (running since 2026-11-22 ~23:29, cwd = repo). Random port, harmless to tests; a user kill is a cleanup decision.
- **[pre-existing, time-window] test/webhook-events.test.mjs "no double-fire" (orchestrator attribution, 2026-11-23 ~06:25Z):** the due.reminder funnel opens at 08:00 in the member's tz (fixture = UTC → 08:00Z) and the test pins the task due to the current UTC date, so the test cannot pass between 00:00Z and 08:00Z. Evidence: fails solo at 05:36Z and 06:00Z (actual 0 claims, expected 1); passed in the wave-3 post-merge evening run (21:00Z+, passing window); test file unchanged since before wave 3 and runReminderPass untouched by 89-04/89-05 diffs (their claim/dedup deltas are restore-alert email_outbox rows only). First VISIBLE now because this phase's overnight runs are the first to land in the dead window. Same environment-sensitive family as the backup-scheduler load-flake. Self-heals after 08:00Z (09:00 CET). Do not chase in wave-5 verification; count as pinned while the run clock is inside the window.
- **[fixed this session, for the record] test/restore-overwrite.test.mjs fixture bugs** the stalled session left uncommitted (node:sqlite array-params ×3, closeWorld wrong temp path, outbox MAIL_FROM missing) — fixed in ad867909/84d248ef, ledgered here only as the record of why Task 3's RED evidence was re-captured.
  status: acknowledged
