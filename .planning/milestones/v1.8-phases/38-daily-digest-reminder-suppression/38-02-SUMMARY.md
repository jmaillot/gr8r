---
phase: 38-daily-digest-reminder-suppression
plan: 02
subsystem: notifications
tags: [digest, suppression, prefs, settings, i18n]
requires: [38-01]
provides: [reminder-email-suppression, email-digest-opt-in-default, d13-settings-copy]
affects: [server.js, src/core/notifPrefs.js, src/locales/en.json, src/locales/fr.json]
tech-stack:
  added: []
  patterns: [stored-prefs reader (getStoredNotifPrefs), email-only suppression gate after row claim]
key-files:
  created: []
  modified:
    - server.js
    - src/core/notifPrefs.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/digest.test.mjs
    - test/notif-prefs.test.mjs
    - test/migration.test.mjs
    - test/notif-hydration.test.mjs
    - test/local-prefs.test.mjs
    - test/i18n-pages.test.mjs
decisions:
  - "Suppression gate reads the STORED email_digest via getStoredNotifPrefs (strict === true), never the merged accessor — while the pre-38 default true survives, a merged read would suppress digest-OFF members' reminders (breaks due-reminders regression, D-08)"
  - "Checkpoint (Pitfall 1) resolved via the plan's documented default: D-14 literal ruling accepted — stored email_digest true = opted in, announced in release notes per user_setup"
  - "Client NOTIF_PREF_KEYS lists email_digest explicitly (defaults spread lost it when the default entry was deleted) — whitelist stays 16 keys both sides"
  - "38-01's digest stored-prefs reader collapsed onto getStoredNotifPrefs (one parse path for the opt-in)"
metrics:
  duration: ~35 min
  completed: 2026-11-04
actuals:
  tokens: 5700
  tasks: 3
  commits: 2
commits: 2
plan_head_before: c57ed4f168d4b151651495fada05d452047e090e
plan_head_after: b55325b9375f186790fbb9b1ba593b550caa482e
status: complete
---

# Phase 38 Plan 02: Reminder Suppression + Digest Opt-In Default Summary

**One-liner:** Digest users lose individual reminder emails at the fan-out (email-only — rows/push/mentions intact) while `email_digest` becomes a real undefined-falsy opt-in with D-13 replace-framing settings copy in EN+FR.

## What Was Built

- **Suppression gate (Task 1, eb24c37):** one new branch in `queueNotifEmails` after the `=== false` pref check — `prefKey === 'email_reminder' && getStoredNotifPrefs(...).email_digest === true` skips the email. Distinct from the existing check (D-11: digest wins over `email_reminder` true or false). Rows are appended + claimed in `runReminderPass` BEFORE the gate, so inbox/revision state is never lost (D-09/D-10).
- **Default inversion (Task 2, b55325b):** `email_digest: true` deleted from `NOTIF_PREF_DEFAULTS` (server.js) and the client mirror in `src/core/notifPrefs.js`; whitelists keep the key (16 keys both sides). 38-01's digest stored-prefs reader collapsed onto the new `getStoredNotifPrefs` helper. D-13 copy replaced in en.json/fr.json with the 09:00 digest replace-framing; `src/pages/settings.js` untouched (D-15 — undefined renders OFF naturally).
- **Test pins:** suppression matrix (rows + revision intact, zero reminder emails), D-11 true/false matrix, mention/assign emails unchanged via a real doc PUT (SC-3), digest-OFF member keeps Phase 37 reminders, and DIGEST-03 default-inversion pins (no row / false → no digest + reminders flow; true → digest).

## Checkpoint (Task 2 — Pitfall 1)

The `checkpoint:human-verify` was resolved by applying the plan's explicitly documented default: **D-14's literal ruling accepted** — a historically stored `email_digest: true` (echoed from the pre-38 default by any PUT since Phase 34) is treated as opted in; those users start receiving digests and stop receiving individual reminder emails at the first 09:00 after deploy. Announcement covered by the release-note task in the plan's `user_setup` (Phase 37 deploy-note precedent).

## Deviations from Plan

**1. [Rule 3 - Blocking] Suppression gate reads STORED prefs, not the merged accessor**
- **Found during:** Task 1
- **Issue:** The plan located the gate on `prefs.email_digest === true` (merged). While `NOTIF_PREF_DEFAULTS` still carries `email_digest: true` (deleted only in Task 2), the merged value is true for EVERY member — the gate would have suppressed reminders for digest-OFF users and broken `test/due-reminders.test.mjs` (required green UNCHANGED).
- **Fix:** Added `getStoredNotifPrefs` (extracted from `getUserNotifPrefs`'s parse logic — one parse path); the gate and the digest send path read the stored row (strict `=== true`, matching 38-01's decision recorded in STATE.md).
- **Files modified:** server.js
- **Commit:** eb24c37

**2. [Rule 3 - Blocking] Client whitelist kept email_digest explicitly**
- **Found during:** Task 2
- **Issue:** The client `NOTIF_PREF_KEYS` spreads `Object.keys(NOTIF_PREF_DEFAULTS)` — deleting the default entry silently dropped `email_digest` from the 16-key whitelist, so the sanitizer would strip the stored opt-in and the toggle could never persist.
- **Fix:** Added `'email_digest'` explicitly to the client keys list (mirrors the server's literal whitelist).
- **Files modified:** src/core/notifPrefs.js
- **Commit:** b55325b

**3. [Rule 3 - Blocking] Default-shape mirrors updated in four adjacent test files**
- **Found during:** Task 2 (`npm test` gate)
- **Issue:** `test/notif-prefs.test.mjs`, `test/migration.test.mjs`, `test/notif-hydration.test.mjs`, `test/local-prefs.test.mjs` and the `test/i18n-pages.test.mjs` settings oracle pinned the 12-key default layer / stale copy text.
- **Fix:** Mirrors updated to the 11-key default layer (+ explicit email_digest whitelist pin in local-prefs); oracle updated to the D-13 copy. FR copy uses the curly apostrophe (`aujourd’hui`) per the D-05 typography gate.
- **Commit:** b55325b

## Verification

- `node --test test/digest.test.mjs` — 10/10 green (5 pre-existing + 5 new pins)
- `node --test test/due-reminders.test.mjs test/notif-i18n.test.mjs` — 33/33 green, zero edits
- `node scripts/i18n-scan.mjs` — 0 literals / 0 unresolved (EN+FR parity)
- `npm test` — 941/941 green
- `src/pages/settings.js` unmodified (git diff empty)

## Self-Check: PASSED

- server.js, src/core/notifPrefs.js, src/locales/en.json, src/locales/fr.json, test/digest.test.mjs — all modified and committed (eb24c37, b55325b verified in git log)
