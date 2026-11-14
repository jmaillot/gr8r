---
phase: 58-full-text-search
plan: 04
subsystem: ui
tags: [command-palette, search, fts5, debounce, regression-test]

# Dependency graph
requires:
  - phase: 58-03
    provides: the palette hybrid-merge render path (serverOnlyTasks mapping, pl.serverQ merge hook) and search-server client (createDebouncedSearch, searchTasksServer)
provides:
  - cmd mode (Ctrl-K default) dispatches the debounced /search fetch; server-only tasks merge into the same tasks group with no duplicates
  - regression test pinning the cmd/search/ws/demo dispatch matrix and the mid-flight stale discard
affects: [58-UAT, verify-work, future palette search-scope work]

# Actuals (#2632)
actuals:
  tokens: 1600        # chars/4 over the realized diff (~6.4k chars across 2 files)
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns: ["fetch()-keyed node --test harness for palette dispatch: real modules as shipped (i18n-search precedent), network stubbed at globalThis.fetch, store state driven directly"]

key-files:
  created: [test/palette-dispatch.test.mjs]
  modified: [src/overlays/palette.js]

key-decisions:
  - "Guard relaxation blocks only ws mode (`pl.mode === 'ws'` early-return) instead of allow-listing modes — future palette modes keep hybrid merge by default (D-01's no-mode-restriction promise)"

patterns-established:
  - "Palette dispatch matrix test: cmd dispatches, search dispatches, ws never, demo never, stale (pl.q !== q) discarded"

requirements-completed: [SEARCH-01]

coverage:
  - id: D1
    description: "Ctrl-K palette's default cmd mode fires the debounced server search after ~250 ms and merges server-only tasks into the same tasks group (G-58-2 closed)"
    requirement: SEARCH-01
    verification:
      - kind: unit
        ref: "test/palette-dispatch.test.mjs#cmd mode dispatches the debounced server search and merges the server-only task"
        status: pass
      - kind: e2e
        ref: "npx playwright test e2e/flows.spec.mjs e2e/french-overflow.spec.mjs (46 passed against a fresh npm run build)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Search/ws/demo mode behavior unchanged: search still dispatches, ws never dispatches, demo gate and stale-discard byte-identical"
    requirement: SEARCH-01
    verification:
      - kind: unit
        ref: "test/palette-dispatch.test.mjs (search/ws/demo/stale matrix — 5/5 pass)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Live UAT check: type in the Ctrl-K palette (cmd mode) with the server running and see server-only tasks merge within ~250 ms"
    requirement: SEARCH-01
    verification: []
    human_judgment: true
    rationale: "Perceived merge latency and no-flicker rendering in a real browser session is the D-01 promise's human-visible half; the unit suite proves dispatch and state, not perceived UX."

# Metrics
duration: 22min
completed: 2026-11-13
status: complete
plan_head_before: 68405a0
plan_head_after: 6f87399
commits: 2
---

# Phase 58 Plan 04: Cmd-Mode Palette Server Search (G-58-2) Summary

**One-line guard fix releases the Ctrl-K palette's hybrid server merge into cmd mode, with a 5-case dispatch-matrix regression test locking the behavior (TDD RED→GREEN)**

## Performance

- **Duration:** 22 min
- **Started:** 2026-11-13T09:05:00Z
- **Completed:** 2026-11-13T09:27:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `dispatchServerSearch` (src/overlays/palette.js:78) now blocks only ws mode; cmd and search modes both dispatch the 250 ms debounced /search fetch — G-58-2 closed, D-01's mode-independent hybrid merge delivered
- Regression test `test/palette-dispatch.test.mjs` pins the full matrix: cmd dispatches, search dispatches, ws never, demo/empty-query gate short-circuits, and a mid-flight `pl.q !== q` switch drops the stale response
- Debounce, AbortController, `S.ui.palette !== pl` identity check, and the `palServerSearch` demo gate are byte-identical — the fix is exactly one line plus its inline comment

## Task Commits

1. **Task 1 (RED): regression test for cmd-mode dispatch** - `f71e6e3` (test)
2. **Task 1 (GREEN): guard relaxation** - `6f87399` (feat)
3. **Task 2: build + e2e/endpoint verification** - no commit (verification-only task, `files: []`; dist is gitignored)

**TDD evidence:** RED validated via `gsd_run check tdd-red-evidence` → `RED_EVIDENCE_OK` (target test failed 0 !== 1 on the old guard; the other 4 matrix cases passed, isolating the RED to the planned behavior).

## Files Created/Modified
- `src/overlays/palette.js` - guard relaxed to `pl.mode === 'ws'` early-return (one line + comment)
- `test/palette-dispatch.test.mjs` - new: the dispatch-matrix regression suite (real modules as shipped, network stubbed at fetch)

## Decisions Made
- Block-only-ws guard shape instead of a cmd+search allow-list: keeps D-01's "no mode restriction" promise true for future palette modes and is the minimal diff the plan mandated
- Task 2's endpoint confirmation ran `test/search-fts.test.mjs` (13/13 — the live-route suite writing through the doc-PUT funnel and reading through GET /search) instead of a manual background-server curl; equivalent, automated, and already the phase's route-of-record

## Deviations from Plan

None - plan executed exactly as written. (One process note: the RED evidence checker required TAP output (`--test-reporter=tap`), not the spec reporter, to parse the failing-test name.)

## Issues Encountered
- The first GREEN run surfaced `window is not defined` from `theme.js effectiveDark()` when render() painted after the cmd-mode merge — a test-harness gap, not app code; the harness now stubs `window`/`matchMedia` and a universal inert element so render() can paint harmlessly in node (assertions read store state only)

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- G-58-2 resolved: cmd-mode dispatch is locked by test; the UAT live check (Test 2 scenario: Ctrl-K cmd mode, type, watch server-only tasks merge) remains the human gate for the phase
- Full suite green: 1458 pass / 0 fail / 12 pre-existing skips; lint clean; `npm run build` + palette-touching e2e (flows 46/46 incl. french-overflow) green against fresh dist

---
*Phase: 58-full-text-search*
*Completed: 2026-11-13*
