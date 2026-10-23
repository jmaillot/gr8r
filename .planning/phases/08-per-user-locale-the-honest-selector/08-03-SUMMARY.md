---
phase: 08-per-user-locale-the-honest-selector
plan: 03
subsystem: settings selector / e2e proof
tags: [locale, selector, settings, e2e, loc-01, loc-02]
requires: [08-01, 08-02]
provides:
  - langSel select (registry-derived, dedicated data-in key) in Settings → Language
  - IN.langSel handler (setLocale → background api.patchMe / storeLocale)
  - toast.localeSaveFailed (en + fr)
  - e2e/locale.spec.mjs browser proof
affects: []
tech-stack:
  added: []
  patterns: [instant optimistic switch + background account write, registry as single source of truth for selector options]
key-files:
  created: [e2e/locale.spec.mjs]
  modified: [src/pages/settings.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, test/i18n-pages.test.mjs, test/i18n-core-features.test.mjs, e2e/french-overflow.spec.mjs, e2e/helpers/setup.mjs]
decisions:
  - "The row's selected value is getLocale() — which equals the account locale when set, the negotiated/demo-stored value otherwise (D-14) — so after a failed PATCH the row still shows the language the user is actually seeing"
  - "A 401 on the background PATCH re-dispatches gr8r:save-error {status:401}, reusing the existing session-expired listener in main.js"
  - "Save-failure toast uses kind 'err' (circle-alert icon): the toast component has no separate warning kind"
status: complete
commits: 2
plan_head_before: 9c6e803a704e09bbd16d3b77f2039d4190811b0d
plan_head_after: f1af97b2ea30e05bcd91d546e777e05f2dc2c1ed
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
completed: 2026-10-23
---

# Phase 8 Plan 03: The honest selector Summary

The Language row now offers exactly English and Français (from the registry), switches the interface instantly via `setLocale()` and persists in the background to the account (server) or `gr8r.locale` (demo) — the document pipeline is never touched; a new browser spec proves negotiation, no-flash boot, the no-reload switch, persistence and two members seeing their own languages.

## What was built

1. **Task 1 (7e8c02e):** `settings.js` exports `langSel(v)` — options from `availableLocales()`, `data-in="langSel"` (never `prefSel`/`setPref`); the six-label array is gone. `actions.js` `IN.langSel`: `await setLocale(code)` (the `gr8r:locale` event re-renders), then demo → `storeLocale(code)`; server → `api.patchMe({locale})`; non-401 failure → `toast.localeSaveFailed`; 401 → `gr8r:save-error` with status 401. No `S.prefs`/`save()`. Catalogues gained `toast.localeSaveFailed` (fr uses U+00A0 before the colon and a curly apostrophe). Tests: the six-label assertion replaced; added registry-derived options, registry ↔ catalogue-files agreement, handler write-path (T-8-07) and a src/-wide phantom-label sweep (excluding `src/locales/`). `i18n-core-features` catalogue size 1481 → 1482.
2. **Task 2 (f1af97b):** `e2e/locale.spec.mjs` (4 tests): fr-FR unauthenticated first paint in French with a pre-script MutationObserver proving no English ever painted and no shell; an en-US browser with a French account boots French with no English flash on reload; the selector switch (two options, negotiated value selected, `window.__survived` sentinel, zero-mutation loop check, PATCH 200, reload keeps French, sign-out → English, sign-in → French); Alice (account fr, browser en-US) and Bob (account en, browser fr-FR) in one workspace see their own languages. `french-overflow.spec.mjs` follows the new two-option listbox and awaits the account PATCH instead of the debounced doc push; `apiClient` gained `patch`.

## Verification

- `node --test test/i18n-pages.test.mjs test/i18n-locale.test.mjs` — pass; `npm run build` — OK; phantom-label grep over `src` (excluding locales) = 0
- `npm test` — 389/389 pass
- `npm run e2e -- --grep locale` — 4/4 pass; `npm run e2e` — 18/18 pass

## Deviations from Plan

**1. [Rule 3 - Blocking] Catalogue size pin** — `test/i18n-core-features.test.mjs` pinned 1481 keys; the single planned new key makes 1482. Updated (commit 7e8c02e).

**2. [Rule 1 - Bug] e2e selector shape** — the app's enhanced selects render a button/listbox, not a native control; the specs drive `button[Language]` + `option` instead of `selectOption`. The one `french-overflow` test whose title contained "locale" was renamed ("…from the catalogue at render time…") so `--grep locale` selects only the new spec and does not run order-dependent French tests in isolation.

**3. Selected-value source** — plan text says "account locale else negotiated"; implemented via `getLocale()`, which is equal in all normal states and stays truthful after a failed PATCH (D-16).

## Known Stubs

None.

## Flagged assumptions (carried)

- LOC-01: "no reload" is proven only by the e2e sentinel pattern; there is no unit-level proof.
- LOC-02: a label built dynamically at runtime would evade the agreement test and the src/ sweep (judged unlikely).

## Threat Flags

None beyond the plan's threat model (T-8-07 asserted by a source test; T-8-08 mitigated by run-unique IPs and throwaway accounts).

## Self-Check: PASSED

- FOUND: e2e/locale.spec.mjs; commits 7e8c02e and f1af97b
