---
status: investigating
trigger: "Stale EN push notification entry 'Due date reminders' / 'One day before a task is due.' still renders in Settings, EN-only; FR is clean (G-37-2)"
created: 2026-11-04
updated: 2026-11-04
---

## Current Focus
hypothesis: leftover EN i18n key / legacy notification type not removed in phase 37
test: grep for "One day before a task is due" and related keys
expecting: find EN-only key or legacy type in type list
next_action: locate i18n catalogs and notification type definitions

## Symptoms
expected: Settings shows exactly the new phase-37 toggle copy per language
actual: EN Push section shows stale "Due date reminders" / "One day before a task is due." plus new entries; FR clean
errors: none
reproduction: Settings → notifications, EN locale
started: after phase 37

## Evidence

## Eliminated

## Resolution
root_cause:
fix:
verification:
files_changed: []

## Evidence (findings)
- settings.js:384 renders legacy row `settings.notif.dueReminders`/`dueDesc` (toggle push_due) UNCONDITIONALLY in both locales, directly above the new due_reminder row (line 385).
- en.json:1254-1255 and fr.json:1254-1255 both still contain the plural pair (EN "Due date reminders"/"One day before a task is due.", FR "Rappels d'échéance"/"Un jour avant l'échéance d'une tâche.").
- 37-02-SUMMARY key-decision: plural push_due pair deliberately "left untouched" — decision conflicts with acceptance criterion of zero "day before" copy.
- Legacy row dates from phase 06-09 (1f262ea); singular pair from phase 27-2 (c8d207f). Phase 37 added nothing; it just failed to remove the legacy row.
- push_due still exists in server.js:1130,1152 and notifPrefs.js:25 defaults — legacy pref is live.
- FR user observation ("only new entries") is inconsistent with code: the row renders in FR too ("Rappels d'échéance"/"Un jour avant…"); likely overlooked or the FR copy read as plausible.

## Resolution
root_cause: Legacy push_due settings row (settings.notif.dueReminders/settings.notif.dueDesc) was never removed — settings.js:384 still renders it above the new due_reminder row, and both locale catalogs still carry the pair; 37-02 explicitly decided to leave it ("Pitfall 3 respected"), contradicting the phase's zero-stale-copy goal.
fix: Remove settings.js:384 row + delete settings.notif.dueReminders/dueDesc from en.json & fr.json + decide fate of push_due pref (server.js:1130,1152, notifPrefs.js:25) — likely remove toggle & pref or repurpose.
files_changed: []
