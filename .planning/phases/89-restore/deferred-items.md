# Deferred Items — Phase 89

Out-of-scope discoveries logged during execution (never auto-fixed per the scope-boundary rule).

| # | Found during | Item | Why deferred |
|---|--------------|------|--------------|
| 1 | 89-01 execution | Untracked directory `"[object Promise]/"` at the repo root (files/ + logos/ subdirs, dated 2026-11-21 — predates this session). Looks like debris from an earlier string-interpolation bug. | Not created by this plan; removal is a user cleanup decision (never `git clean` from an agent). |
| 2 | 89-01 execution | `test/webhook-events.test.mjs` — "due task with subscribed hook yields exactly ONE due.reminder delivery" fails. Known since 78-01. | Pre-existing, unrelated to backups/restore. |
| 3 | 89-01 execution | `export/backup.js:666` — `String(doc.logo)` on an object-shaped `doc.logo` produces `"[object Promise]"`-style junk names for logo collection. Possibly the origin of item 1. | Pre-existing writer quirk; touching it would change 86 behavior mid-restore-phase. Flag for a follow-up fix. |

## 89-03 (2026-11-22)
- [harness] WAL-visibility race: raw DatabaseSync access AFTER a run's `wal_checkpoint(truncate)` + `vacuum into` (export/backup.js:358-361) can lose visibility of server-connection writes (reproduced: post-run signup 201 but row invisible to a fresh handle; wal unlinked mid-test). Not a product bug — harness pattern is "keep withDb access pre-run" (comment in test/restore-preview.test.mjs). Candidate for a future test-harness plan.
- [housekeeping] Untracked `"[object Promise]/"` debris dir in repo root predates 89-03 — origin unknown, untouched.
