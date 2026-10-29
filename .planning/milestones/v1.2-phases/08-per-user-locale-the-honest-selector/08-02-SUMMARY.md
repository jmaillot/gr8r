---
phase: 08-per-user-locale-the-honest-selector
plan: 02
subsystem: client boot / i18n lifecycle
tags: [locale, negotiation, boot-order, migration-seed, demo-storage]
requires: [08-01]
provides:
  - primeLocale (silent, no event) and negotiate (subtag clamp) in src/core/i18n.js
  - readStoredLocale/storeLocale over localStorage key 'projects.locale' (demo backend)
  - api.patchMe(patch) adopting the returned user
  - consumeLegacyLang() capture in store.js
  - init() boot order: negotiate+prime → api.me account apply → hydrate + guarded seed → first render
  - sign-out/sign-in locale lifecycle in actions.js
affects: [08-03]
tech-stack:
  added: []
  patterns: [silent prime vs announcing switch (shared activateLocale core), consume-once capture]
key-files:
  created: [test/locale-negotiate.test.mjs]
  modified: [src/core/i18n.js, src/core/api.js, src/core/store.js, src/main.js, src/actions/actions.js, test/i18n-core-features.test.mjs]
decisions:
  - "setLocale and primeLocale share one internal activateLocale core; only setLocale dispatches projects:locale (Pitfall 2)"
  - "Login/signup/invite-accept adopt the account locale (or negotiated if NULL) right after the auth call, before hydration and the render that follows; demo-mode sign-out keeps the stored demo choice"
  - "The migration seed runs only on a successful hydration and only calls api.patchMe({locale:'fr'})"
status: complete
commits: 2
plan_head_before: 5c960084c88b333edcced9be4f6dfc066be59722
plan_head_after: fcabcfedd71093c0eda7717b8f6837def5ec0167
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
completed: 2026-10-23
---

# Phase 8 Plan 02: Boot-time locale, lifecycle and migration seed Summary

The boot now speaks the right language before the first paint: negotiated browser language at the top of `init()`, the account locale after `api.me()`, and a guarded one-time seed that moves formerly-French workspace members to `users.locale='fr'` in the same boot.

## What was built

1. **Task 1 (21e9db6):** `i18n.js` gains `primeLocale` (silent: resolution + catalogue load + `documentElement.lang`, no dispatch), `negotiate` (subtag-prefix clamp, first supported wins, default `'en'`), and `storeLocale`/`readStoredLocale` over the dedicated `projects.locale` key (outside the `projects.v2` blob). `setLocale` was refactored onto a shared `activateLocale` core and still announces. `api.patchMe` PATCHes `/api/auth/me` and adopts the user payload.
2. **Task 2 (fcabcfe):** `init()` primes `negotiate()` before `api.init()`; demo mode primes the stored locale or the negotiated one; a non-NULL account locale replaces it after `api.me()`; `seedLegacyLocale()` runs after a successful hydration (NULL account locale + exact legacy label `'Français'` → `patchMe({locale:'fr'})` → silent prime). `store.js` captures the raw `doc.prefs.lang` before `applyDoc` strips it (`consumeLegacyLang`). `A.signOut` falls back to the negotiated value; `doLogin`/`doJoin`/`doSignup` adopt the account locale before hydration/render.

## Verification

- `node --test test/locale-negotiate.test.mjs test/i18n-locale.test.mjs` — 24/24 pass
- `npm test` — 385/385 pass; `npm run build` — OK

## Deviations from Plan

**1. [Rule 3 - Blocking] API call-site count assertion** — `test/i18n-core-features.test.mjs` pinned 20 `call('…'` sites in api.js; the new `patchMe` is the 21st. Updated to 21 with a comment. Commit fcabcfe.

Otherwise the plan was executed as written.

## Known Stubs

None. (The settings selector row still writes the removed `prefs.lang` until 08-03 rebuilds it — planned intermediate state.)

## Flagged assumptions (carried)

- LOC-06: Playwright `locale:'fr-FR'` controls `navigator.languages`; the no-flash proof is mechanical here (source-order + silent-prime contract) and end-to-end in 08-03.
- LOC-03: sign-in without a reload adopts the account locale because every auth path ends in a render.
- The seed runs on the boot path only; an account that first signs in (without reload) on an upgraded French workspace is seeded on its next boot.

## Threat Flags

None beyond the plan's threat model (T-8-05 accepted, T-8-06 mitigated: seed calls only the gated account PATCH with a hardcoded `'fr'`).

## Self-Check: PASSED

- FOUND: test/locale-negotiate.test.mjs; commits 21e9db6 and fcabcfe
