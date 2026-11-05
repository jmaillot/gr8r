---
status: resolved
trigger: "assignment email received, but no due-today reminder (inbox/push/email) even after restart with all notification prefs on"
created: 2026-11-05T00:00:00Z
updated: 2026-11-05T10:25:00Z
resolution: "Confirmed: strict hour === 9 gate defeated boot catch-up. Fixed by gap-closure plan 37-04 (emission gate widened to hour >= 9 + REM-06 regression pin). UAT test 2 re-passed on live instance 2026-11-05 — human confirmed the 'Due today' notification after a post-09:00 restart."
---

## Current Focus

hypothesis: The reminder loop's strict `hour === 9` gate (server.js:1388) means the boot catch-up pass (server.js:5324) emits nothing when the server restarts outside the 09:00–09:59 local hour. The "open window + absent dedup key IS the boot catch-up" design (server.js:1305-1306, 1411-1412) is defeated by the hour gate; Phase 38 fixed the digest loop to `hour >= 9` (server.js:1483) but deliberately left the reminder loop strict (comment server.js:1481).
test: Read runReminderPass + boot path + tests; confirm all tests inject 09:00 (at9) so restart-outside-hour-9 is untested.
expecting: No reminder row, no email, no log when pass runs at hour !== 9 — matches "I don't receive anything".
next_action: Return diagnosis (find_root_cause_only).

## Symptoms

expected: exactly one "Due today" inbox/push + email to assignee on 09:00 pass OR boot catch-up
actual: nothing at all after restart following 09:00; assignment email (separate path) works
errors: none observed
reproduction: task due today; restart server after 10:00 local; no reminder
started: since Phase 37 cadence (hour gate is older, phase 27)

## Evidence

- server.js:1388 `if (hour === 9)` — reminders only emitted during the 09:00 local hour.
- server.js:5319-5331 — boot calls runReminderPass() once + 60s tick; both inert outside hour 9 for reminders.
- server.js:1483 — digest loop uses `hour >= 9` (late-delivery catch-up); reminder loop does not.
- test/due-reminders.test.mjs:40 `at9` — every test injects exactly 09:00, so the restart-after-09:00 path is untested.
- Email chain (queueNotifEmails, server.js:1237-1247) only runs for emitted notifs — gated upstream by the hour gate.

## Resolution
root_cause: Strict `hour === 9` emission gate (server.js:1388) defeats the boot catch-up — runReminderPass() at boot (server.js:5324) and the 60s tick (server.js:5325-5331) only emit when workspace-local hour is exactly 9, so a restart after 09:00 emits nothing: no inbox row, no push, no email, no log. Phase 38's digest loop was given `hour >= 9` catch-up (server.js:1483) but the reminder loop was deliberately left strict (comment server.js:1481). Tests inject 09:00 exclusively (test/due-reminders.test.mjs:40,121) so the post-09:00 restart path is untested.
fix: Change server.js:1388 to `hour >= 9` (the reminders_sent dedup ledger already guarantees exactly-once per (ws, task, assignee, offset, due)); update stale comments (1305-1310, 1411-1412) and the REM-01 test pinning non-09:00 writes nothing; add a regression test with a post-09:00 boot instant asserting exactly one late "Due today".
verification: pending gap-closure execution
files_changed: []
