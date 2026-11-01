---
phase: 27-due-date-reminder-scheduler
plan: 02
subsystem: client-prefs-inbox
tags: [reminders, notifPrefs, settings, inbox, i18n]
requires: [runReminderPass, notifPrefs, queueNotifEmails, tog-srow-settings-pattern]
provides: [reminder prefs defaults ON (bootstrap + normalize-on-read), 3 Settings toggles, inbox chips for due_reminder/past_due, notif.dueReminder/notif.pastDue catalogue keys EN+FR]
affects: []
tech-stack:
  added: []            # no new npm dependencies — package.json unchanged
  patterns: [normalize-on-read prefs merge, camelCase catalogue keys for snake_case row types]
key-files:
  created: []
  modified: [server.js, src/pages/settings.js, src/pages/inbox.js, src/locales/en.json, src/locales/fr.json, test/due-reminders.test.mjs, test/i18n-core-features.test.mjs]
decisions:
  - "Catalogue keys are camelCase (notif.dueReminder/notif.pastDue) even though row types are snake_case — the catalogue rule test enforces flat dotted camelCase keys; notifText maps type→key explicitly"
  - "Legacy-doc default-ON is enforced twice: `!== false` gates in the scheduler (27-01) and a normalizeDoc on-read merge that only overrides ABSENT keys — existing workspaces are never rewritten"
  - "due_reminder/past_due toggles placed in the notif-push settings group, email_reminder in notif-email; all ride the existing tog('…','np') save path"
metrics:
  duration: ~25 min
  completed: 2026-11-01
status: complete
plan_head_before: 5494f32
plan_head_after: 03785d6
commits: 2
actuals:
  tokens: 52000   # chars/4 over the ~450-line diff + test iteration
  tasks: 2
  commits: 2
---

# Phase 27 Plan 02: Client Prefs & Inbox Surface Summary

**One-liner:** Three notifPrefs reminder toggles (email_reminder/due_reminder/past_due, all ON by default for new and legacy workspaces via bootstrap defaults + a normalize-on-read merge) rendered through the existing Settings tog/np save path, plus inbox filter chips and guarded system-actor rendering for the two reminder types with complete EN+FR catalogue entries (8 new keys).

## What Was Built

- **server.js:** emptyDoc notifPrefs seeds `email_reminder/due_reminder/past_due: true`; normalizeDoc merges the three defaults on read so docs predating phase 27 read all-ON (absent keys only — an explicit `false` always wins).
- **src/pages/settings.js:** `email_reminder` row in the notif-email group; `due_reminder`/`past_due` rows in the notif-push group — exact existing `srow/tog('…','np')` pattern, no new save machinery.
- **src/pages/inbox.js:** literal filter chips `due_reminder`/`past_due` (D-27-4, not merged into mention/assign); `notifText` guards reminder rows BEFORE the generic `!n.by` branch (which would have rendered "is due today" for every reminder) and never fabricates a member by-line for the `by:null` system actor (T-27-07); per-type icons (clock / triangle-alert).
- **Locales (EN+FR):** `settings.notif.emailReminder/Desc`, `dueReminder/Desc`, `pastDue/Desc`, `notif.dueReminder`, `notif.pastDue` — matching catalogue tone and `{…}` interpolation style.
- **Tests:** 2 new due-reminders tests (bootstrap seeds all three ON; legacy doc reads all-ON through docForClient AND still reminds through the real pass) → 15/15; i18n pinned-count test updated 1610→1618.

## Deviations from Plan

- **[Rule 3 — blocking] Catalogue keys renamed to camelCase.** The plan specified `notif.due_reminder`/`notif.past_due`, but the catalogue rule test (`test/catalogue.test.mjs`) rejects non-camelCase keys. Keys are `notif.dueReminder`/`notif.pastDue`; `notifText` maps the snake_case row type to the key explicitly.
- **[Rule 1 — bug caught in verify] Reminder rows hit the generic `!n.by` branch of notifText** — every reminder would have rendered "is due today" instead of its type copy. Guarded before that branch.
- **[Rule 1 — pre-existing, in-scope file] Unused `D` import in inbox.js** flagged by eslint; removed.

## Known Tradeoffs (not bugs)

- Reminder copy keeps the day-before vs morning-of distinction in the server-built snippet ("Due tomorrow/today: <title>"); the row fragment ("is coming due") stays generic.
- 'Reminders'/'Rappels' email byline remains the inlined server literal from 27-01 (not a catalogue key) — the notif-email-link source-extraction tests evaluate that line standalone.

## Verification

- `node --test test/due-reminders.test.mjs` → 15/15 green after each task
- `npm test` → 648/648 green
- `npx eslint server.js src/pages/inbox.js src/pages/settings.js test/due-reminders.test.mjs` → clean
- `grep '"notif.dueReminder"|"notif.pastDue"' src/locales/{en,fr}.json` → 2 hits per file
- `package.json` / `package-lock.json` unchanged

## Self-Check: PASSED

- Files exist: server.js, src/pages/settings.js, src/pages/inbox.js, src/locales/en.json, src/locales/fr.json, test/due-reminders.test.mjs ✓
- Commits exist: c8d207f, 03785d6 ✓ (measured: 2 commits from plan_head_before 5494f32)
