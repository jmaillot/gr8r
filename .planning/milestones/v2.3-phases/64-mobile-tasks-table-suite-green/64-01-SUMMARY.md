---
phase: 64-mobile-tasks-table-suite-green
plan: 01
subsystem: ui
tags: [css, responsive, mobile, playwright, e2e]

requires:
  - phase: 55-mobile-card-stack
    provides: the .only-m .panel card stack in src/views/table.js (55-07 A1 pattern)
  - phase: 63-view-02-de-flake
    provides: stable green e2e baseline and VIEW-02 determinism instrument
provides:
  - Generic pure-CSS Columns-button hide at ≤900px ([data-pop="cols"], responsive.css 900px tier)
  - 641–900px band shows the card stack and hides the desktop table (.only-m/.hide-m overrides, D-04 Option B)
  - Dedicated mobile spec e2e/mobile-tasks-table.spec.mjs with the 899px boundary test and desktop-unchanged proof
affects: [64-02 (card polish), 64-03 (suite close), any future view adding a Columns button]

actuals:
  tokens: 26000
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Generic attribute-selector CSS hide scoped to an existing media tier (no JS render fork)"
    - "Context `viewport` option for per-test mobile viewports on the main Playwright project"

key-files:
  created:
    - e2e/mobile-tasks-table.spec.mjs
  modified:
    - src/styles/responsive.css

key-decisions:
  - "Band alignment implemented as responsive.css 900px-tier overrides (.only-m block, .hide-m none !important) per PATTERNS.md recommendation — base.css 640px flip left untouched"
  - "Tasks-table view-mode tab clicked by data attributes (data-a=setViewMode data-v=table), not accessible name — its text label is .hide-m by design and is invisible at the boundary viewport"

patterns-established:
  - "Mobile viewport testing via browser.newContext({ viewport }) — no second Playwright project (SC-2)"
  - "Boundary e2e pins breakpoint behavior at width 899 with desktop-unchanged counter-proof at 1280×720"

requirements-completed: [MOB-01]

coverage:
  - id: D1
    description: "Columns button hidden at any viewport ≤900px by one generic pure-CSS rule; button still in DOM (no JS fork)"
    requirement: MOB-01
    verification:
      - kind: e2e
        ref: "e2e/mobile-tasks-table.spec.mjs#at 899px the Columns button is hidden, the card stack shows, and the desktop table is hidden"
        status: pass
    human_judgment: false
  - id: D2
    description: "641–900px band shows the card stack and hides the desktop table (D-04 Option B band alignment)"
    requirement: MOB-01
    verification:
      - kind: e2e
        ref: "e2e/mobile-tasks-table.spec.mjs#at 899px the Columns button is hidden, the card stack shows, and the desktop table is hidden"
        status: pass
    human_judgment: false
  - id: D3
    description: "Desktop (1280×720) behavior byte-identical — Columns button visible as today; desktop + saved-view specs pass unmodified"
    requirement: MOB-01
    verification:
      - kind: e2e
        ref: "e2e/mobile-tasks-table.spec.mjs#at 1280×720 the Columns button is visible (desktop unchanged)"
        status: pass
      - kind: e2e
        ref: "npm run e2e -- e2e/french-overflow.spec.mjs e2e/projects-table.spec.mjs e2e/saved-views.spec.mjs --workers=1 --retries=0 (15 passed)"
        status: pass
    human_judgment: false

duration: 12min
completed: 2026-11-14
status: complete
---

# Phase 64 Plan 01: Mobile CSS Contract + Boundary E2E Summary

**Generic pure-CSS Columns-button hide at ≤900px with the 641–900px band flipped to the card stack, boundary pinned by the first tests of the new dedicated mobile spec (MOB-01, D-01..D-04)**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-14T16:58:00Z
- **Completed:** 2026-11-14T17:10:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Three terse rules in responsive.css's existing 900px tier: `[data-pop='cols'] { display: none !important; }` (generic — every view with a Columns button, D-03), `.only-m { display: block; }` and `.hide-m { display: none !important; }` (band alignment, D-04 Option B) — button still renders in the DOM (D-02), saved-view blobs untouched
- New `e2e/mobile-tasks-table.spec.mjs`: 899×844 boundary test (Columns hidden, first card visible, desktop table hidden) + 1280×720 desktop-unchanged test; context-`viewport` pattern, main config only, retries=0 — 2 passed
- Regression sweep: 15 passed across french-overflow, projects-table, saved-views with ZERO file modifications; no spec combines viewport ≤900px with a Columns interaction

## Task Commits

Each task was committed atomically:

1. **Task 1: Mobile CSS contract + boundary e2e — one vertical slice** - `a7749b5` (fix)
2. **Task 2: Regression sweep** - verification-only, no commit (no file changes needed; sweep confirmed zero conflicts)

**Plan metadata:** `docs(64-01): complete plan` (see final commit)

## Files Created/Modified
- `src/styles/responsive.css` - 900px tier gains the generic Columns hide + `.only-m`/`.hide-m` band overrides (~200 B, chunk gate 498.24 kB < 500 kB)
- `e2e/mobile-tasks-table.spec.mjs` - dedicated mobile spec: fixture account+workspace+task via real API, 899px boundary + desktop-unchanged tests

## Decisions Made
- Band alignment as responsive.css overrides rather than editing base.css's 640px flip (per plan/PATTERNS.md; base.css rule now a harmless no-op under the override)
- View-mode tab selected via `button[data-a="setViewMode"][data-v="table"]` instead of the accessible name: the tab's text label is `.hide-m` and is invisible at the boundary viewport, so a role-name locator can never resolve there (found during Task 1, fixed within the task's own files — not a plan deviation)

## Deviations from Plan

None - plan executed exactly as written (the locator fix above stayed inside Task 1's declared file).

## Issues Encountered
- First run failed with a stale `dist/` — the e2e server serves the built bundle, so `npm run build` is required before `npm run e2e`; rerun after rebuild was green. Chunk gate verified: `index-*.js` 498.24 kB (T-64-02 mitigation, no threshold edits)
- Server-side "login failed" WARN lines appear even for accounts whose sign-in ultimately succeeded (noise from the first failed POST before retry); all tests passed with retries=0, so no flake introduced

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MOB-01 contract live; 64-02 (card-stack polish, MOB-02) can build on the proven 899px card-stack rendering and the same context-viewport spec conventions
- `npm run build` before `npm run e2e` remains a hard prerequisite (dist-stamp guard)

---
*Phase: 64-mobile-tasks-table-suite-green*
*Completed: 2026-11-14*

## Self-Check: PASSED
- src/styles/responsive.css, e2e/mobile-tasks-table.spec.mjs, 64-01-SUMMARY.md exist on disk
- Task commit a7749b5 present in git log
