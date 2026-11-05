---
phase: 36-server-notification-i18n
plan: 01
subsystem: i18n
tags: [i18n, server-notifications, catalogues, tdd]
requires:
  - src/core/i18n.js (singleton-bound t() from v1.2 Localization)
  - src/locales/en.json, src/locales/fr.json (flat notif.* namespace)
provides:
  - tFor(locale, key, vars) — pure, locale-parameterized lookup core exported from src/core/i18n.js
  - notif.reminder.* server keys in EN+FR catalogues
  - notif.email.* server keys in EN+FR catalogues
affects:
  - 36-02 (server.js reminder snippets render through tFor)
  - 36-03 (mailer.js email frame renders through tFor)
  - 36-04 (key-parity gate builds on the en/fr alignment landed here)
tech-stack:
  added: []
  patterns: [locale-threaded-plural, clamp-to-base-locale, intl-failure-degradation]
key-files:
  created: [test/i18n-tfor.test.mjs]
  modified: [src/core/i18n.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - "Key names camelCase (notif.reminder.dayBefore/morningOf/pastDue) — the plan's underscore names fail the catalogue KEY_SHAPE gate (/^[a-z][a-z0-9]*(\\.[a-z][a-zA-Z0-9]*|\\.[0-9]+)+$/)"
  - "EN body.sentence quotes the title with typographic “ ” — the catalogue markup lint bans straight double quotes in values"
  - "Catalogue-size oracle advanced 1659 → 1674 (+15 server keys) in test/i18n-core-features.test.mjs"
metrics:
  duration: ~5m
  completed: 2026-11-04
  tasks: 2
status: complete
estimate:
  tokens: 60000
  tasks: 2
actuals:
  tokens: 6000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: d1c0978a3bfdea7e45b20fa8a90fda9330dee71d
plan_head_after: e529ebd
requirements: [I18N-02]
---

# Phase 36 Plan 01: Shared tFor core + server notif.* keys Summary

**One-liner:** Locale-parameterized `tFor()` translation core with t() delegation, Intl-failure degradation and locale clamping, plus 15 `notif.reminder.*` / `notif.email.*` server keys landed in identical EN+FR flat catalogues.

## What Was Built

**Task 1 (tracer, TDD):** RED-first test/i18n-tfor.test.mjs (6 tests) pinning the contract, then the refactor of src/core/i18n.js: the lookup core moved into exported `tFor(code, key, vars)` — clamps unknown/malformed/null locales to the base locale (mirroring activateLocale), threads the requested locale through `resolvePlural` → `rulesFor(target)` (the singleton read removed), and wraps the plural-category selection so an `Intl.PluralRules` failure degrades to the one/other pair instead of propagating (SC-5, T-36-04 mitigation). `t(key, vars)` is now a one-line delegate: `tFor(locale, key, vars)` — zero call-site churn. tFor is pure (no singleton mutation), so parallel server sends cannot race.

**Task 2:** 15 flat keys added to BOTH catalogues under the notif.* namespace — `notif.reminder.dayBefore/morningOf/pastDue` (the three reminderSnippet branches, dayBefore gate-covered though its producer goes inert in Phase 37) and `notif.email.*` (byReminders, greeting, verb.mention/assign/comment/update verbatim from the mailer.js verbs table + a distinct verb.reminder, subject.reminder, body.sentence/openTask/button/footer). FR values follow the D-05 typography contract (U+2019 apostrophes, U+00A0 before ':', U+00A0-padded guillemets). The 8 existing client notif.* keys are byte-unchanged; en/fr key sets identical.

## Deviations from Plan

**[Rule 3 - Blocking] Renamed the reminder keys to camelCase**
- **Found during:** Task 2 verify
- **Issue:** The plan's `notif.reminder.day_before` / `morning_of` / `past_due` fail the catalogue gate's `KEY_SHAPE` regex (test/catalogue.test.mjs:30 — segments after the first must be `[a-z][a-zA-Z0-9]*`, underscores rejected). The plan itself marks key names "per planner discretion".
- **Fix:** `dayBefore` / `morningOf` / `pastDue`. Later plans referencing `notif.reminder.*` must use these names.
- **Files modified:** src/locales/en.json, src/locales/fr.json
- **Commit:** e529ebd

**[Rule 3 - Blocking] EN body.sentence uses typographic quotes**
- **Found during:** Task 2 verify
- **Issue:** The catalogue markup lint rejects straight double quotes in values.
- **Fix:** `{actor} {verb} “{title}” on {workspace}.` (U+201C/U+201D, matching act.extra.quoted).
- **Files modified:** src/locales/en.json
- **Commit:** e529ebd

**[Rule 3 - Blocking] Catalogue-size oracle updated**
- **Found during:** Task 2 verify
- **Issue:** test/i18n-core-features.test.mjs pins the catalogue size at 1659; the 15 new keys moved it to 1674.
- **Fix:** Oracle advanced to 1674 with a dated comment.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** e529ebd

## Verification

- `node --test test/i18n-tfor.test.mjs` — 6/6 green (RED confirmed before the refactor: tFor did not exist)
- `node --test test/i18n-core-features.test.mjs test/i18n-plural.test.mjs test/catalogue.test.mjs test/french-typography.test.mjs` — 59/59 green (no regression)
- `node -e` parity check — "parity ok, notif keys: 23"
- Full chained verify (all 5 suites): 65/65 green

## Notes

- The mailer.js verbs table (lines 403-409) reads "assigned you to" — the FR verb.assign follows the existing client key's convention ("vous a assignée") since the email body composes `{actor} {verb} “{title}”`.
- Zero packages installed (T-36-SC zero-dependency invariant held).

## Self-Check: PASSED

- test/i18n-tfor.test.mjs exists; src/core/i18n.js exports tFor
- Commits 0f1f367 and e529ebd exist on main
