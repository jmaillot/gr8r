---
status: testing
phase: 37-reminder-cadence-rework
source: [37-01-SUMMARY.md, 37-02-SUMMARY.md, 37-03-SUMMARY.md]
started: 2026-11-04T14:36:22Z
updated: 2026-11-04T17:35:00Z
---

## Current Test

[testing paused — 1 item outstanding]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass
source: automated
note: "Executed by the agent on a scratch copy of data/ (PORT=8124): fresh boot clean, pre-migration notif-prefs backup created, /api/health → {ok:true}, /api/config returns live config, clean SIGTERM shutdown (exit 0)."

### 2. Live scheduling cadence end-to-end (real clock)
expected: On a running instance with a real workspace, set a task due today; wait for the 09:00 scheduled pass (or the boot catch-up). Confirm the assignee's inbox and email each receive exactly one "Due today" notification, then one "Past due" the next morning, and nothing on subsequent days. Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value).
result: blocked
blocked_by: other
reason: "I will add a new task, but I cannot verify today"

### 3. Settings page rendering of the new copy (EN + FR)
expected: Open Settings → notifications in EN and FR. Push section shows only the new rows — EN "Due-day reminder" / "Get a reminder on the morning a task is due." and FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche." — with the legacy "Due date reminders" / "One day before a task is due." row GONE from both languages. Toggle still functional. (Re-test after G-37-2 gap closure; closes the previously reported stale-row issue.)
result: pass
source: automated

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 0
blocked: 1

## Gaps

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
