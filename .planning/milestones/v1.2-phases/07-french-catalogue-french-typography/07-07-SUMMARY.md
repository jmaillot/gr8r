---
phase: 07-french-catalogue-french-typography
plan: 07
subsystem: i18n-e2e-proof
tags: [i18n, french, e2e, playwright, overflow, verification, read-through]
requires:
  - "07-06: fr.json at 1,449 keys with 100% en→fr parity (the strings this spec renders)"
  - "07-01: the D-01 locale wiring (applyPrefs mapping, setLocale, gr8r:locale) the spec exercises"
  - "07-02/07-03: the post-billing routes and the stored-vocabulary conversions the spec proves"
provides:
  - "e2e/french-overflow.spec.mjs — six Chromium tests: the D-15 overflow + fixed-chrome proof at 1280×800 and 390×844, the in-place French switch with a settle (no render loop) check, the modal footer/primary-button proof, and the I18N-07 stored-id-vs-rendered-label proof"
  - "A hermetic French e2e workspace (own account + workspace via the shared helper) so the language switch cannot leak into the English-pinned suite"
  - "The D-16 read-through hand-off: .planning/phases/07-french-catalogue-french-typography/07-READ-THROUGH.md awaiting the user's sign-off"
  - "The filled 07-VALIDATION.md: each roadmap success criterion mapped to the automated command that proved it"
affects:
  - "phase 8: the locale persistence work replaces the throwaway mapping this spec exercises"
  - "phase 10: widens browser coverage from this spec's 16 product routes to all flows in both locales"
  - "phase 11: the typography rules this spec spot-checks in the browser get the prebuild gate"
tech-stack:
  added: []
  patterns:
    - "settle-proof-by-mutation-observer: zero #app mutations over 1.5 s proves no render loop, where identical-DOM snapshots alone cannot distinguish a loop from stillness"
    - "hermetic-locale-spec: a language-switching browser spec must own its workspace, because spec files share one server per run and may run concurrently across workers"
key-files:
  created:
    - e2e/french-overflow.spec.mjs
    - .planning/phases/07-french-catalogue-french-typography/07-READ-THROUGH.md
  modified:
    - src/core/i18n.js
    - e2e/helpers/setup.mjs
    - .planning/phases/07-french-catalogue-french-typography/07-VALIDATION.md
decisions:
  - "Route selection: the spec enumerates the 16 user-facing product routes of ROUTE_IDS, excluding 'member'/'team' (param-dependent detail pages) and 'system'/'states' (design-system showcase pages behind the help popover, not product surfaces) — phase 10 widens coverage"
  - "The spec proves persistence through a fresh boot in French rather than asserting the preference-saved toast: at pick time t() resolves before the async catalogue load, so that one transient toast renders in English for ~1.5 s"
  - "The overflow proof asserts document scrollWidth vs clientWidth and fixed-chrome bounding boxes as two separate checks (D-15/07-RESEARCH), and treats the mobile off-canvas sidebar (transform-parked) as hidden, not clipped"
metrics:
  duration: ~15 min
  completed: 2026-10-23
  tasks: 2
status: complete
actuals:
  tokens: 6900
  tasks: 2
  commits: 2
plan_head_before: da88be2fe7befa0904920d89f0fee39d670c0c3e
plan_head_after: 0d8caea162409047b07925739285c7d8a7eab49e
---

# Phase 7 Plan 7: Browser proof, full verification and the read-through hand-off Summary

The French interface is now proven in a real browser: six Chromium tests switch the selector
to Français through the real settings path, re-render in place without a reload, settle with
zero mutations, and walk 16 product routes at 1280×800 and 390×844 with no horizontal document
overflow and no clipped fixed chrome — while a stored status id renders « À faire » over the
English `todo` in the DOM. The full phase chain is green (362 unit tests, the prebuild gate,
12/12 e2e), and the D-16 read-through is in the user's hands.

## Completed Tasks

1. **Task 1 — the French overflow + rendering spec (D-15).** `e2e/french-overflow.spec.mjs`
   (6 tests, all green): ① the selector switch through settings → Langue → Français — asserts
   `documentElement.lang = 'fr'`, the French shell renders, a window flag survives (no reload),
   a MutationObserver counts zero `#app` mutations over 1.5 s and two DOM snapshots 500 ms apart
   are identical (loop safety), and a fresh boot after the debounced push comes up French;
   ②③ the 16 product routes at both viewports, with document-overflow (`scrollWidth` ≤
   `clientWidth`) and fixed-chrome clipping (`.topbar` always, `.side` when not off-canvas)
   asserted separately; ④⑤ the new-task modal renders its footer and primary button unbroken at
   both viewports; ⑥ the I18N-07 proof: `section[data-drop-col="todo"]` keeps the English stored
   id while the column header and the My-Tasks status pill render « À faire ». Two authoring
   discoveries: a created project's deep-link key is the uppercase initials code (`PRO`), and
   the first 'New project' click must be scoped — the sidebar carries a same-named button.
   Commit **770bd74**.

2. **Task 2 — phase verification and the read-through hand-off.** The full chain green:
   `npm test` 362/362 (including the D-07 completeness and D-05 typography gates), `npm run
   build` clean (the prebuild gate over the empty allow-list), `npm run e2e` 12/12 with both
   spec files running concurrently across workers. `07-VALIDATION.md` filled: per-task
   verification map for all seven plans and the roadmap's four success criteria each mapped to
   its proving command (`nyquist_compliant: true`). `07-READ-THROUGH.md` created for the user:
   how to run the app in French, the routes to review, the register notes (vous, sentence case,
   no middle dot), the typography spot-checks, a wording-fixes table and a sign-off block —
   deliberately not signed by the agent. Commit **0d8caea**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The gr8r:locale announcement never reached its listener in a browser**
- **Found during:** Task 1 (the spec's first run — the switch set `<html lang="fr">` while the
  interface stayed English)
- **Issue:** `src/core/i18n.js` dispatched `gr8r:locale` on `document` with the CustomEvent
  default `bubbles: false`; `src/main.js` listens on `window` (bare `addEventListener`). A
  non-bubbling event dispatched on the document never reaches a window listener, so the
  catalogue loaded but no re-render followed: the switch updated the language attribute while
  every string stayed in the old language. The unit tests could not see it — one listens on the
  document directly (where the target phase fires) and the other only regexes main.js's source.
  This is exactly the class of wiring bug the D-15 browser proof exists to catch.
- **Fix:** the announcement now dispatches with `bubbles: true`, so document- and window-level
  listeners both receive it. The pinned tests (type + detail assertions) are unaffected
  (i18n.test.mjs 25/25, i18n-locale.test.mjs green).
- **Files modified:** src/core/i18n.js
- **Commit:** 770bd74

**2. [Rule 3 - Blocking] The French spec's language switch would break the English-pinned suite**
- **Found during:** Task 1→2 handoff (preparing the full `npm run e2e`)
- **Issue:** the spec originally signed into the shared `acme` fixture workspace and flipped its
  stored `prefs.lang` to Français. Spec files share one server per run and may run concurrently
  across workers (`french-overflow` sorts before `tenancy`), so acme would boot French under the
  tenancy spec's English assertions ('Page not found', role menus, toasts) — a guaranteed
  cross-suite failure.
- **Fix:** the spec now provisions its own account and workspace through the shared helper
  (`apiClient` exported from `e2e/helpers/setup.mjs` — the same boot path setupTenants uses),
  so the French preference lives in a throwaway French workspace and cannot leak. Proven by the
  full run: 12/12 with both files interleaved across workers.
- **Files modified:** e2e/helpers/setup.mjs, e2e/french-overflow.spec.mjs
- **Commit:** 770bd74

### Checkpoint pending (D-16 — the plan's human gate)

Task 2's `<human-check>` is the user's read-through. The agent ran every automated step (the
full chain, the validation checklist, the hand-off file) and stopped there per D-16: the notes
file is committed with instructions, unsigned. The phase closes when the user performs the
read-through and any wording fixes are applied.

## Verification

- `npm run e2e -- --grep french-overflow` — 6/6 green (in isolation and inside the full suite).
- `npm test` — 362/362.
- `npm run build` — green (the prebuild i18n-scan gate over the empty allow-list).
- `npm run e2e` — 12/12 (both specs, concurrent workers, one shared server).
- 07-VALIDATION.md filled; 07-READ-THROUGH.md committed for the user.

## Known issues (not stubs)

- **The preference-saved toast renders in English for ~1.5 s during the switch.** At pick time
  `IN.prefSel` calls `toast(t('toast.prefSaved'))` while `setLocale('fr')`'s catalogue import is
  still in flight, so `t()` falls back to English ('Preferences saved') before the event-driven
  French re-render lands. Transient, cosmetic, and only observable in the 1.5 s window around
  the switch; phase 8 replaces this wiring (the mapping, the selector and the toast path) —
  recorded in the broken-windows ledger rather than patched here.

## Known Stubs

None — no stubs, placeholders or TODOs were introduced. The four raw-English splices deferred
in `deferred-items.md` by plan 07-05 remain open there (they need new en keys; unchanged).

## Threat surface

No new surface: a read-only browser spec and an event-property fix. The spec asserts visible
text (through esc() at call sites), never injects; the e2e server is a throwaway local fixture
server. No new endpoints, auth paths or schema changes.

## Self-Check: PASSED

- `e2e/french-overflow.spec.mjs` — FOUND (6/6 green).
- `e2e/helpers/setup.mjs` — apiClient exported — FOUND.
- `src/core/i18n.js` — bubbles: true — FOUND.
- `07-READ-THROUGH.md`, `07-VALIDATION.md` — FOUND.
- Commit 770bd74 (Task 1) — FOUND. Commit 0d8caea (Task 2) — FOUND. The plan's
  docs commit (this SUMMARY + STATE/ROADMAP/REQUIREMENTS + the WINDOWS ledger)
  follows immediately and is the third.
- Commits measured from the plan ledger (`da88be2..0d8caea`): 2 task commits.
