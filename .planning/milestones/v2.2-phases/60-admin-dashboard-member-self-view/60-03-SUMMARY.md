---
phase: 60-admin-dashboard-member-self-view
plan: 03
subsystem: dashboard-client-and-server
tags: [gap-closure, tdd, dashboard, poll-lifecycle, input-validation]
requires: ["60-01 dashboard route + client page", "60-02 e2e coverage"]
provides: ["CR-01 fix: bounded fetch kick on window-switch failure", "WR-01 fix: poll restart on route re-entry", "WR-02 fix: activityWindow whitelist before doc parse", "dashboard-client-loader test harness"]
affects: ["60-VERIFICATION.md re-run"]
tech-stack:
  added: []
  patterns: ["node:module register() resolve-hook loader with data-URL stubs", "node:test mock.timers for interval lifecycle"]
key-files:
  created:
    - test/helpers/dashboard-client-loader.mjs
    - test/dashboard-client.test.mjs
  modified:
    - src/pages/dashboard.js
    - server.js
    - test/dashboard.test.mjs
decisions:
  - "lastRequestedWindow claimed up-front in fill(); error-state recovery rides the existing dashRetry action, never an automatic re-kick"
  - "Poll entry is `if (!timer) startPoll()` — independent of loading state; teardown clears it on exit so repeated entries cannot stack intervals"
  - "Whitelist validation hoisted above JSON.parse (pure code-motion); ordering pinned both behaviorally (corrupt-doc probe) and by source-order assertion"
metrics:
  duration: ~35 min
  completed: 2026-11-13
status: complete
plan_head_before: 84a8528
plan_head_after: HEAD
commits: 5
actuals:
  tokens: 24000
  tasks: 3
  commits: 5
---

# Phase 60 Plan 03: Gap Closure (CR-01, WR-01, WR-02) Summary

**One-liner:** Test-first closure of all three Phase 60 verification gaps — bounded fetch kick (CR-01), poll re-entry restart (WR-01), and whitelist-before-parse ordering (WR-02) — each pinned by a regression test that failed on the pre-fix behavior.

## What Was Done

### Task 1 — CR-01 + WR-01 (client, test-first)
- **RED commit `7ca2397`:** new `test/helpers/dashboard-client-loader.mjs` (resolve-hook loader in the `virtual-icons-loader.mjs` style; data-URL stubs for store/api/render/utils/i18n/theme/ui-helpers/task-list, real `src/pages/dashboard.js` under test — a theme.js stub was needed because real icons.js → theme.js → utils.js hit the stubbed utils; Rule 3) and `test/dashboard-client.test.mjs` with 4 tests, **all 4 failing against pre-fix code**.
- **GREEN commit `290bb36`:** `src/pages/dashboard.js` — module-level `lastRequestedWindow` claimed in `fill()` before the fetch; kick guard `(loading || S.ui.dashDataWindow !== w) && !S.ui.dashErr`; poll entry `if (!timer) startPoll()`. Panels, fullstates, deep links untouched.

### Task 2 — WR-02 (server, test-first)
- **RED commit `299197e`:** corrupt-doc probe (stored doc → `{not json`, invalid window must still answer exact 400 `badActivityWindow`, doc restored in `finally`) + source-order assertion (`badActivityWindow` index < `JSON.parse(ctx.ws.doc)` index inside the route block). Both failing pre-fix.
- **GREEN commit `cc75a38`:** `server.js` — pure code-motion of windowParam/WINDOW_MS/badActivityWindow check to immediately above the doc parse; route comment now states an ordering that is true in code.

### Task 3 — Full sweep
- **Docs commit (this SUMMARY).** Sweep: `node --test test/dashboard.test.mjs test/self-visibility.test.mjs test/dashboard-client.test.mjs test/i18n-pages.test.mjs test/build-chunk-size.test.mjs` → **55 pass / 0 fail** (21 pre-existing server + 8 self-visibility + 4 client + i18n/chunk gates).

## Gaps Closed → Pinning Tests

| Gap | Fix | Regression test |
|-----|-----|-----------------|
| CR-01 (critical) | `lastRequestedWindow` claim + `!S.ui.dashErr` kick guard | `window-switch fetch failure stops the fetch kick after one attempt` (6 renders → exactly 1 api.dashboard call) |
| WR-01 | `if (!timer) startPoll()` | `route exit clears the poll timer and re-entry restarts it with cached data` (mock-timer 30 s tick fires a fresh call) + `repeated entry/exit cycles never stack poll intervals` |
| WR-02 | Whitelist hoisted above doc parse | `invariant: invalid activityWindow fails keyed 400 BEFORE any doc work (T-60-03)` (corrupt-doc probe) + source-order test |

## Human UAT Marking

VERIFICATION.md human-verification item 1 (poll re-entry) is now covered by the WR-01 mock-timer tests, and item 2 (window-switch failure) by the CR-01 test. Residual human UAT shrinks to a single e2e sanity pass on `/w/:slug/dashboard`.

## Review Disposition

60-REVIEW.md findings: **CR-01, WR-01, WR-02 fixed** (code + regression tests). IN-01 (members.js visReason interpolation), IN-02 (my-access staleness), IN-03 (e2e UTC fixture dates) remain open as accepted Info items — untouched, out of gap scope.

## Deviations from Plan

**[Rule 3 - Blocking] Stubbed `src/core/theme.js` in the client loader**
- **Found during:** Task 1 RED — real icons.js imports theme.js, which imports `setDateFormat` from the stubbed utils.js → import crash.
- **Fix:** added a two-line theme.js data-URL stub (`effectiveDark`, `setDateFormat`) to the loader.
- **Commit:** 7ca2397.

Also: the top-level `mock.timers` API in Node 24 exposes `reset()` (not `restore()`) and does not accept `clearInterval` in `apis` — tests use `reset()` and `apis: ['setInterval']`.

No other deviations — plan executed as written.

## Flagged Assumptions (unresolved probe edges, carried to next verification round)

- DASH-02: equal load counts → server sort tie order (insertion); Array.prototype.sort stability assumed (ES2019+); empty/absent panels render emptyBody (covered by 60-02 e2e).
- DASH-01/03/04, TRN-01: no explicit edge probe derivable; 21 server tests + e2e stand as coverage — flagged for human review.
- TRN-02: UTF-16 code-unit byte equality for needle scans; empty projects[] self-view renders an empty list.

## Self-Check: PASSED

- test/helpers/dashboard-client-loader.mjs, test/dashboard-client.test.mjs exist; src/pages/dashboard.js carries `lastRequestedWindow` (line 36), `!S.ui.dashErr` guard (101), `if (!timer) startPoll()` (105).
- Commits 7ca2397, 290bb36, 299197e, cc75a38 present; sweep 55/0.
