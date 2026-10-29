---
phase: 09-server-messages-activity-history
plan: 07
subsystem: ui
tags: [i18n, locale-switch, escaping, crypto, client-ids]

# Dependency graph
requires:
  - phase: 08-per-user-locale
    provides: the live locale switch (setLocale + projects:locale re-render) that the frozen-at-import keyboard hint betrayed (WR-08); t() and the catalogue contract the getter reads at call time
provides:
  - modKey() — a lazy getter exporting the keyboard-hint modifier, evaluated at every render, so a hot locale switch also flips the Ctrl hint
  - a single escaping table — esc in core/utils.js is the named re-export of i18n.js's escHtml; the duplicate map is deleted, importer paths unchanged
  - crypto-backed uid() — 12 base36 characters of crypto.getRandomValues entropy, prefix preserved, Math.random gone from the id path
affects: [10-browser-coverage, 11-french-sweep, any future locale added to the registry]

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
actuals:
  tokens: 6555        # chars/4 over the realized diff (26221 chars across the two task commits)
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Lazy catalogue getter: a UI label that reads the locale is an arrow function called at render, never a module-load constant (same discipline as the corrected LCOLS getters)"
    - "Render-time sentinel substitution: a static machine table (SHORTCUTS) carries a 'MOD' sentinel the renderer swaps for modKey() so the table stays module-level and the label still evaluates per render"

key-files:
  created: []
  modified:
    - src/core/utils.js
    - src/core/i18n.js
    - src/overlays/drawer.js
    - src/overlays/palette.js
    - src/pages/inbox.js
    - src/overlays/popovers.js
    - src/overlays/modals.js
    - src/shell/layout.js
    - scripts/i18n-scan.mjs
    - test/i18n-locale.test.mjs
    - test/i18n-dates.test.mjs
    - test/i18n-overlays.test.mjs
    - test/i18n-prefs.test.mjs

key-decisions:
  - "modKey() validated at mechanism level: the behavioral test doctored the French catalogue (common.ctrl = '⌃') because today's EN and FR values coincide ('Ctrl') — the proof of evaluation-at-call needs a differing value, not a differing render"
  - "modals.js SHORTCUTS keeps its static kbd arrays and carries a 'MOD' sentinel the renderer substitutes at render — the table stays a module-level constant and the test-pinned array shape survives"
  - "The i18n scan gained Ctrl/Cmd/Mod/MOD in KEYBOARD_KEYS — the kbd sentinel is a machine identifier by position, not display text"

patterns-established:
  - "Lazy catalogue getter: any UI label sourced from the locale must be a getter called at render (modKey() in core/utils.js)"
  - "One escaping table: client escaping lives only in i18n.js's escHtml; core/utils.js re-exports it as esc and consumers never changed their import path"

requirements-completed: [LOC-01]

coverage:
  - id: D1
    description: "The keyboard-hint modifier is a lazy getter evaluated at render — a hot locale switch flips the hint (WR-08), proven by the doctored-catalogue behavioral test"
    requirement: LOC-01
    verification:
      - kind: unit
        ref: "test/i18n-locale.test.mjs#modKey() follows the active locale — it reads the catalogue at call time (LOC-01)"
        status: pass
      - kind: unit
        ref: "test/i18n-locale.test.mjs#utils.js exports modKey as a function and the module-load constant is gone (WR-08)"
        status: pass
      - kind: other
        ref: "npm run build (i18n scan + bundler, no orphaned MOD import)"
        status: pass
    human_judgment: false
  - id: D2
    description: "One escaping table: esc in core/utils.js re-exports escHtml from i18n.js, identical output on hostile input, importers unchanged (IN-02)"
    requirement: LOC-01
    verification:
      - kind: unit
        ref: "test/i18n-locale.test.mjs#esc in core/utils.js is the escHtml re-export — one escaping table (IN-02)"
        status: pass
      - kind: unit
        ref: "test/i18n-prefs.test.mjs#resolving the preference never writes — the import boundary still names only the leaf layer"
        status: pass
    human_judgment: false
  - id: D3
    description: "uid() derives 12 base36 characters from crypto.getRandomValues with the prefix kept; 200 calls produce 200 distinct values; Math.random is gone (IN-04 / T-09-12)"
    requirement: LOC-01
    verification:
      - kind: unit
        ref: "test/i18n-locale.test.mjs#uid() draws from crypto.getRandomValues: prefixed, distinct over 200 calls, no Math.random"
        status: pass
      - kind: other
        ref: "npm test — full 425-test suite green"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-10-24
status: complete
---

# Phase 9 Plan 7: Client polish closures (WR-08, IN-02, IN-04) Summary

**The keyboard-hint modifier became a lazy getter evaluated at render, the duplicated escaping table collapsed into the escHtml re-export, and uid() moved to crypto.getRandomValues with 200-call uniqueness pinned by a test.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-10-24T13:09Z
- **Completed:** 2026-10-24T13:16Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- WR-08 closed: `MOD` (a module-load constant) is replaced by `modKey()`, an arrow getter that reads `t('common.ctrl')` at call time — a live locale switch now also flips the keyboard hint; the misleading comment claiming the constant re-evaluated was rewritten
- IN-02 closed: `esc` in core/utils.js is `export { escHtml as esc } from './i18n.js'` — one escaping table in the client, zero importer-path changes, i18n.js comment updated to declare it the single source
- IN-04 closed: `uid()` derives its random half from `crypto.getRandomValues` (6 bytes → 12 deterministic base36 characters), the prefix survives, and the test pins 200 distinct prefixed calls
- All three closures verified mechanically: 13 tests in test/i18n-locale.test.mjs green, `npm run build` (scan + bundler) green, full `npm test` suite 425/425 green

## Task Commits

Each task was committed atomically:

1. **Task 1: the keyboard hint becomes a lazy getter (WR-08)** - `c88b115` (feat)
2. **Task 2: one escaping table; crypto uid (IN-02 + IN-04)** - `2ea5438` (feat)

## Files Created/Modified
- `src/core/utils.js` — modKey() getter, esc re-export, crypto uid
- `src/core/i18n.js` — escHtml comment declares it the single escaping source
- `src/overlays/drawer.js`, `src/overlays/palette.js`, `src/pages/inbox.js` — plan-named consumer sites call modKey() at render
- `src/overlays/popovers.js`, `src/overlays/modals.js`, `src/shell/layout.js` — additional consumer sites the plan's context note missed (see deviations)
- `scripts/i18n-scan.mjs` — the kbd sentinel family (Ctrl/Cmd/Mod/MOD) joins KEYBOARD_KEYS
- `test/i18n-locale.test.mjs` — modKey source + behavioral tests, uid uniqueness, esc equivalence
- `test/i18n-dates.test.mjs`, `test/i18n-overlays.test.mjs`, `test/i18n-prefs.test.mjs` — assertions re-pinned to the new shapes

## Decisions Made
- The behavioral proof of evaluation-at-call doctors the French catalogue (`registerCatalogue('fr', { ...fr, 'common.ctrl': '⌃' })`) instead of relying on an EN/FR difference: today both catalogues carry "Ctrl", so only a differing registered value can prove the getter re-reads at call time
- modals.js's static SHORTCUTS table carries the string sentinel `'MOD'` and its renderer substitutes `modKey()` per render — this keeps the table a module-level constant (its documented "machine key sequences" contract) while still evaluating the label at render
- The i18n scan classifies the sentinel as machine by adding the modifier names to KEYBOARD_KEYS (position rule: keyboard-key sequences are never prose)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three more consumer files import the old symbol**
- **Found during:** Task 1 (step 3 of the action: "verify no other site imports the old symbol")
- **Issue:** The plan's context note claimed modals.js "does not import the symbol" and listed only drawer/palette/inbox as real sites — but `src/overlays/popovers.js`, `src/overlays/modals.js` and `src/shell/layout.js` all import and use `MOD`. Removing the export would have failed the build.
- **Fix:** All three migrated: popovers/layout call `modKey()` inline; modals uses the render-time `'MOD'` sentinel substitution for its static SHORTCUTS arrays plus a direct `modKey()` call in the task-form footer
- **Files modified:** src/overlays/popovers.js, src/overlays/modals.js, src/shell/layout.js
- **Verification:** `npm run build` green; no `\bMOD\b` identifier import remains in src/; grep -c "modKey()" shows 1 call in each of the plan's three named files plus the three extra ones
- **Committed in:** c88b115

**2. [Rule 1 - Bug] Test assertions pinned to the old shapes**
- **Found during:** Task 1 and Task 2 verification
- **Issue:** test/i18n-dates.test.mjs pinned `'MOD'` in the utils exports list; test/i18n-overlays.test.mjs pinned the literal `[MOD, 'Shift', 'L']` array; test/i18n-prefs.test.mjs pinned utils.js's import specifier list to exactly `['./i18n.js']`, which the esc re-export duplicates (same leaf module, second specifier)
- **Fix:** Re-pinned to the new shapes ('modKey' in the exports list, `['MOD', 'Shift', 'L']` sentinel, deduplicated specifier set with a comment explaining why uniqueness, not count, is the boundary being tested)
- **Files modified:** test/i18n-dates.test.mjs, test/i18n-overlays.test.mjs, test/i18n-prefs.test.mjs
- **Verification:** the three suites plus the whole `npm test` run green
- **Committed in:** c88b115 / 2ea5438

**3. [Rule 1 - Bug] The i18n scan flagged the new 'MOD' sentinel as a display label**
- **Found during:** Task 1 (`npm run build` — 4 violations)
- **Issue:** Turning the `MOD` identifier into the `'MOD'` string literal moved the occurrence from an unreportable position into a capitalised-display-label position; the scan reported src/overlays/modals.js:251/264/265
- **Fix:** Added the keyboard-modifier names (Ctrl, Cmd, Mod, MOD) to the scan's KEYBOARD_KEYS machine set — positionally justified: those strings only occur inside kbd sequences
- **Files modified:** scripts/i18n-scan.mjs
- **Verification:** `node scripts/i18n-scan.mjs` reports 0 violations; test/i18n-scan.test.mjs green
- **Committed in:** c88b115

**4. [Rule 1 - Bug] Own comment tripped the Math.random assertion**
- **Found during:** Task 2
- **Issue:** The new uid() comment read "No Math.random." — matching the test's `doesNotMatch(/Math\.random/)` against the file source
- **Fix:** Comment reworded ("The old PRNG path is gone")
- **Files modified:** src/core/utils.js
- **Verification:** test green
- **Committed in:** 2ea5438

---

**Total deviations:** 4 auto-fixed (3 Rule 1, 1 Rule 3)
**Impact on plan:** All fixes were necessary to make the planned end state build and hold; none changed the plan's goal or scope.

## Issues Encountered
- Pre-existing lint errors in two unrelated test files (test/locale-negotiate.test.mjs: `document` no-undef ×2; test/server-boot.test.mjs: no-regex-spaces) — out of scope per the boundary rule; left untouched and recorded in deferred-items.md

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The last client surface frozen at import is gone — the hot locale switch (LOC-01, phase 8 contract) now flips every interface string, including the keyboard hints
- The escaping and id-entropy polish closes the review findings; wave-2 plans (09-02's i18n.js edit) touch disjoint regions of i18n.js
- No blockers for the remaining phase 09 plans

---
*Phase: 09-server-messages-activity-history*
*Completed: 2026-10-24*

## Self-Check: PASSED

- src/core/utils.js on disk: FOUND
- Commit c88b115 (Task 1): FOUND
- Commit 2ea5438 (Task 2): FOUND
- Plan-level verification re-run: node --test test/i18n-locale.test.mjs (13 pass), npm run build green, npm test 425/425 green, grep: no Math.random in utils.js, no `export const MOD`, no second escaping table, no orphaned import of the old symbol
