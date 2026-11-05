---
status: diagnosed
phase: 37-reminder-cadence-rework
source: [37-01-SUMMARY.md, 37-02-SUMMARY.md, 37-03-SUMMARY.md]
started: 2026-11-04T14:36:22Z
updated: 2026-11-05T09:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass
source: automated
note: "Executed by the agent on a scratch copy of data/ (PORT=8124): fresh boot clean, pre-migration notif-prefs backup created, /api/health → {ok:true}, /api/config returns live config, clean SIGTERM shutdown (exit 0)."

### 2. Live scheduling cadence end-to-end (real clock)
expected: On a running instance with a real workspace, set a task due today; wait for the 09:00 scheduled pass (or the boot catch-up). Confirm the assignee's inbox and email each receive exactly one "Due today" notification, then one "Past due" the next morning, and nothing on subsequent days. Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value).
result: issue
reported: "i had the assignment email, but even after a restart and all push/email notifications on, i dont receive anything"
severity: major

### 3. Settings page rendering of the new copy (EN + FR)
expected: Open Settings → notifications in EN and FR. Push section shows only the new rows — EN "Due-day reminder" / "Get a reminder on the morning a task is due." and FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche." — with the legacy "Due date reminders" / "One day before a task is due." row GONE from both languages. Toggle still functional. (Re-test after G-37-2 gap closure; closes the previously reported stale-row issue.)
result: pass
source: automated

## Summary

total: 3
passed: 2
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-37-3
  truth: "Task due today triggers exactly one 'Due today' notification (inbox/push + email) to the assignee on the 09:00 pass or boot catch-up"
  status: failed
  reason: "User reported: i had the assignment email, but even after a restart and all push/email notifications on, i dont receive anything"
  severity: major
  test: 2
  root_cause: "Strict hour === 9 emission gate (server.js:1388) defeats the boot catch-up — runReminderPass() at boot (server.js:5324) and the 60s tick only emit during the 09:00 local hour, so a restart after 09:00 emits nothing. Phase 38's digest loop got hour >= 9 catch-up (server.js:1483); the reminder loop was left strict (comment server.js:1481). Tests inject 09:00 only (test/due-reminders.test.mjs:40,121), so the post-09:00 path is untested."
  artifacts:
    - path: "server.js"
      issue: "Line 1388: `if (hour === 9)` gate — only emission path for morning_of/past_due, inert outside 09:00-09:59 local"
    - path: "server.js"
      issue: "Lines 5319-5331: boot catch-up + 60s tick call runReminderPass() — inherit the hour gate, catch-up only works if booting during hour 9"
    - path: "server.js"
      issue: "Lines 1305-1310, 1411-1412: comments claim 'open window + absent dedup key IS the boot catch-up' — contradicted by the hour gate"
    - path: "test/due-reminders.test.mjs"
      issue: "Line 40 (at9), line 121 (REM-01 pins non-09:00 writes nothing): no test exercises a post-09:00 boot"
  missing:
    - "Change server.js:1388 to `hour >= 9` — the reminders_sent dedup ledger guarantees exactly-once per (ws, task, assignee, offset, due), so the wider window cannot double-send"
    - "Update stale comments (server.js:1305-1310, 1411-1412) to describe the catch-up window semantics"
    - "Update the REM-01 test (test/due-reminders.test.mjs:121) that pins non-09:00 runs write nothing"
    - "Add a regression test injecting a post-09:00 boot instant (e.g. T14:30:00Z) asserting exactly one late 'Due today' fires"
  debug_session: ".planning/debug/due-today-reminder-silent-after-restart.md"

- gap_id: G-37-2
  truth: "Settings shows exactly the new phase-37 toggle copy per language, with no stale pre-phase entries"
  status: resolved
  resolved_by: 37-03
  resolved_at: 2026-11-04
  reason: "User reported: EN copy reads 'Due date reminders' / 'A reminder the day before and the morning a task is due.' — does not match the phase spec; FR copy matches. Follow-up detail: in the EN Push section BOTH entries appear — new 'Due-day reminder' / 'Get a reminder on the morning a task is due.' AND stale 'Due date reminders' / 'One day before a task is due.' — duplicate/stale toggle not removed in EN; FR shows only the new entries. Email section is consistent in both languages ('Reminder emails' / 'E-mails de rappel')."
  severity: major
  test: 2
  artifacts:
    - path: "src/pages/settings.js"
      issue: "Line 384: stale push_due row (settings.notif.dueReminders/dueDesc) still rendered unconditionally in the notif-push case, above the new due_reminder row"
    - path: "src/locales/en.json"
      issue: "Lines 1254-1255: stale keys settings.notif.dueReminders ('Due date reminders') + settings.notif.dueDesc ('One day before a task is due.')"
    - path: "src/locales/fr.json"
      issue: "Lines 1254-1255: same stale keys in FR ('Rappels d'échéance' / 'Un jour avant l'échéance d'une tâche.') — stale row renders in BOTH locales, EN-only appearance was user oversight"
    - path: "src/core/notifPrefs.js"
      issue: "Line 25: legacy push_due pref still registered"
    - path: "server.js"
      issue: "Lines 1130, 1152: legacy push_due pref still allowed/defaulted"
  missing:
    - "Remove the push_due row (settings.js:384) from the notif-push case"
    - "Delete settings.notif.dueReminders + settings.notif.dueDesc from both en.json and fr.json atomically (i18n parity gate)"
    - "Decide push_due pref fate: remove from notifPrefs.js defaults and server.js allowed/defaults lists, or keep-and-ignore if historical rows reference it — plan must state which"
    - "Update catalogue-size i18n pins (test/i18n-core-features.test.mjs keys.length 1673 → 1671) and any settings-page oracle test"
    - "Rebuild dist (dist/assets/index-C_YYwZK-.js contains the stale string)"
  debug_session: ".planning/debug/stale-en-push-toggle.md"
