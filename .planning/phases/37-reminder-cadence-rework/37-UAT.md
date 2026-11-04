---
status: diagnosed
phase: 37-reminder-cadence-rework
source: [37-VERIFICATION.md]
started: 2026-11-04T14:36:22Z
updated: 2026-11-04T17:05:00Z
---

## Current Test

[testing paused — 2 items outstanding]

## Tests

### 1. Live scheduling cadence end-to-end (real clock)
expected: On a running instance with a real workspace, set a task due today; wait for the 09:00 scheduled pass (or the boot catch-up). Confirm the assignee's inbox and email each receive exactly one "Due today" notification, then one "Past due" the next morning, and nothing on subsequent days. Exactly 2 notifications total per task per assignee across the task's lifetime (per due-date value).
result: blocked
blocked_by: other
reason: "I will add a new task, but I cannot verify today"

### 2. Settings page rendering of the new copy
expected: Open Settings → notifications in EN and FR; check the due-reminder toggle label/description, and that the inbox filter label shows "Due-day reminder" (shared-label collateral). EN "Due-day reminder" / "Get a reminder on the morning a task is due."; FR "Rappel le jour d’échéance" / "Recevez un rappel le matin de l’échéance d’une tâche."; toggle still functional.
result: issue
reported: "Rappels d’échéance / Un jour avant l’échéance d’une tâche. / Rappel le jour d’échéance / Recevez un rappel le matin de l’échéance d’une tâche. / Alertes de retard / Une seule alerte, le matin qui suit l’échéance d’une tâche. Due date reminders / One day before a task is due. / Due date reminders / A reminder the day before and the morning a task is due. / Overdue nudges / One nudge the morning after a task is overdue."
severity: major

## Summary

total: 2
passed: 0
issues: 1
pending: 0
skipped: 0
blocked: 1

## Gaps

- gap_id: G-37-2
  truth: "Settings shows exactly the new phase-37 toggle copy per language, with no stale pre-phase entries"
  status: failed
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
