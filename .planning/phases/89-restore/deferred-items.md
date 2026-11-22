# Deferred Items — Phase 89

Out-of-scope discoveries logged during execution (never auto-fixed per the scope-boundary rule).

| # | Found during | Item | Why deferred |
|---|--------------|------|--------------|
| 1 | 89-01 execution | Untracked directory `"[object Promise]/"` at the repo root (files/ + logos/ subdirs, dated 2026-11-21 — predates this session). Looks like debris from an earlier string-interpolation bug. | Not created by this plan; removal is a user cleanup decision (never `git clean` from an agent). |
| 2 | 89-01 execution | `test/webhook-events.test.mjs` — "due task with subscribed hook yields exactly ONE due.reminder delivery" fails. Known since 78-01. | Pre-existing, unrelated to backups/restore. |
| 3 | 89-01 execution | `export/backup.js:666` — `String(doc.logo)` on an object-shaped `doc.logo` produces `"[object Promise]"`-style junk names for logo collection. Possibly the origin of item 1. | Pre-existing writer quirk; touching it would change 86 behavior mid-restore-phase. Flag for a follow-up fix. |
