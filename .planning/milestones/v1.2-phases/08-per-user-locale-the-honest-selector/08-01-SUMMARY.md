---
phase: 08-per-user-locale-the-honest-selector
plan: 01
subsystem: auth / i18n storage
tags: [locale, users-table, api, migration, prefs]
requires: []
provides:
  - users.locale nullable column (fresh SCHEMA + ensureColumn)
  - PATCH /api/auth/me (whitelisted en/fr, sameOrigin, own row only)
  - userPayload().locale (null until chosen)
affects: [08-02, 08-03]
tech-stack:
  added: []
  patterns: [ensureColumn additive migration, strip-at-merge for legacy doc keys]
key-files:
  created: [test/locale-account.test.mjs]
  modified: [server.js, src/core/store.js, src/core/theme.js, test/migration.test.mjs, test/i18n-locale.test.mjs, test/i18n-prefs.test.mjs]
decisions:
  - "users.locale stores the registry code ('en'/'fr'), NULL until chosen; never written at boot (D-01/D-02)"
  - "Legacy prefs.lang is stripped at both merge points (module-init localStorage + applyDoc) so docSnapshot() can never re-save it (LOC-04)"
status: complete
commits: 2
plan_head_before: a40e80deb18f539c1b89f070307b2da3e4315336
plan_head_after: 83ec3262ed24cf2875931f558243b6ea30ef665f
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
completed: 2026-10-23
---

# Phase 8 Plan 01: Account-owned locale (server half) Summary

The account now owns the interface language: a nullable `users.locale` column, a gated `PATCH /api/auth/me`, and removal of the language from the shared workspace document pipeline.

## What was built

1. **Task 1 (tracer, 63fbad9):** `locale text` added to the users SCHEMA and `ensureColumn(db,'users','locale','text')` in `openDb()` (no backup, no boot write). `userPayload()` returns `locale: user.locale ?? null`. New `PATCH /api/auth/me`: `requireUser` → `sameOrigin` (403) → `readJson` → whitelist `LOCALE_CODES = ['en','fr']` (400 `Unknown locale`) → prepared `update users set locale = ? where id = ?` → `userPayload(fresh row)`. Only `body.locale` is read. `test/locale-account.test.mjs` (8 tests, real server + SQLite) covers round-trip of both codes, 400 with unchanged row, extra-field ignoring, 401 signed out, 403 foreign Origin with unchanged row, byte-identical workspaces row (doc/revision/updated_at), two accounts in one workspace with different locales, null on fresh signup. `test/migration.test.mjs` `snapshot()` now includes `users (id, email, locale)`, so the second-boot deep-equal covers it (LOC-05).
2. **Task 2 (83ec326):** `DEFAULT_PREFS.lang` removed; `stripLegacyLang()` applied at the module-init merge and in `applyDoc()`. `LANG_TO_LOCALE` and the guarded `setLocale` switch deleted from `applyPrefs()` (and the now-unused i18n import). `test/i18n-locale.test.mjs` assertion inverted (map absent, no `setLocale`/`getLocale`, no legacy key read); the `prefValue('lang', …)` pass-through case removed from `test/i18n-prefs.test.mjs`.

## Verification

- `node --test test/locale-account.test.mjs test/migration.test.mjs` — 17/17 pass
- `node --test test/i18n-locale.test.mjs test/i18n-prefs.test.mjs` — 27/27 pass
- `npm test` — 370/370 pass; `npm run build` — OK (i18n scan gate passes)

## Deviations from Plan

None - plan executed exactly as written. (Test-harness note: bob joins the shared workspace via signup → invite → accept, since a signup creates no membership by itself.)

## Known Stubs

None. Note: until 08-02/08-03 land, `applyPrefs()` no longer applies any locale and the settings selector row still writes the removed `prefs.lang`; the interface therefore stays English in the interim. This is the planned intermediate state (locale application moves to explicit lifecycle moments in 08-02).

## Flagged assumptions (carried from the plan)

- LOC-04: the legacy field leaves `workspaces.doc` on the first ordinary save after the strip, not eagerly at boot.
- LOC-03: multi-device equivalence is proven via a second authenticated harness client.
- LOC-05: `ensureColumn` carries no backup/data-loss on `users`; the extended `snapshot()` is the mechanical guard.

## Threat Flags

None beyond the plan's threat model (T-8-01…T-8-04 mitigated and asserted by tests).

## Self-Check: PASSED

- FOUND: test/locale-account.test.mjs, commits 63fbad9 and 83ec326
