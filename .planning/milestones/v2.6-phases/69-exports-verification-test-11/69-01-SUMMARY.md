---
phase: 69-exports-verification-test-11
plan: 01
subsystem: export-tests
tags: [export, mspdi, xlsx, csv, fixtures, 3-level-hierarchy]
requires: []
provides:
  - "3-level export fixture branch (t_x13) in the Phase 54 fixture chain"
  - "3-level DFS/serialization assertions across model, MSPDI, xlsx and CSV suites"
affects: []
tech-stack:
  added: []
  patterns:
    - "add-only test growth on existing suites (NFR-03 grow-only)"
    - "positional serialized-XML walks (Summary adjacency re-derivation)"
key-files:
  created: []
  modified:
    - test/fixtures/export-fixtures.mjs
    - test/export-model.test.mjs
    - test/export-mspdi.test.mjs
    - test/export-xlsx.test.mjs
    - test/export-csv.test.mjs
decisions:
  - "Model row contract pinned to ACTUAL behavior: depth-0 rows keep the task id (CR-01), nested-row parent references the depth-0 task id — plan's 'per-level parent ids' sketch corrected against model.js/65-05 precedent"
  - "Summary re-derivation walk uses writer-depth semantics (absent OutlineLevel = -1), not the research sketch's 'default 1' — the faithful generalization of export/mspdi.js:214-219"
  - "xlsx indent pinned AS-IS (depth-blind fixed-1); CSV pinned flat (no outline column) — no writer enrichment per scope guards"
metrics:
  duration: ~25 min
  completed: 2026-11-17
status: complete
actuals:
  tokens: 38000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 8fb44e699e5ac8baf5e873ad98af80c44ff13165
plan_head_after: 624e8af
---

# Phase 69 Plan 01: Exports 3-level structural pre-screen Summary

One rich 3-level fixture branch (t_x13 with nested s13a/s13a1/s13a2/s13b) now flows fixture → buildExportModel → all three writers, with add-only assertions on DFS order, dotted keys, OutlineLevel depth mapping, positional Summary adjacency, escaping and the pinned indent/flat shapes.

## What Was Built

- **Fixture (Task 1):** `makeMspdiDoc()` extended with `t_x13 'Deep tree task'` carrying a flat nested `subtasks` array (`{ id, parentId, position, title, done }` shape verified against model.js) — dates, partial completion, desc note; existing probes (t_x7/t_x10/t_x11) untouched so escaping is re-exercised on 3-level output (V5/T-69-01).
- **Model assertions (Task 1):** DFS row order/keys/depth/parent/ids after t_x13; top-level-due inheritance ('2026-03-20' on every descendant); CR-01 row id contract.
- **MSPDI assertions (Task 2):** serialized XML only — OutlineLevel 1/2 per nested level, none on the top row; Type→OutlineLevel→Start positional pin (D-69-4, D-69-9 as-is); generalizing Summary adjacency walk with no-upward-skip fence; DFS order; Notes escaping.
- **xlsx assertions (Task 3):** Tasks-sheet DFS order, dotted keys in the key column, PINNED depth-blind fixed-1 title indent (no depth channel — deferred per scope guards). Verified via unzip helper, never the broken @office-kit reader.
- **CSV assertions (Task 3):** flat DFS rows, dotted keys, no outline column (flat by design).

## Tasks Delivered

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | 3-level fixture tree + model DFS assertions (tracer) | 03d838c |
| 2 | MSPDI serialized-XML 3-level assertions | d0682bc |
| 3 | xlsx + CSV 3-level assertions | 624e8af |

## Verification

- `node --test test/export-{model,mspdi,xlsx,csv}.test.mjs` — all green (84 / 40 / 37 / 18 tests respectively).
- `npm test` — 1726 tests, 1713 pass, 0 fail (13 pre-existing skips; grow-only above the 1705+ baseline).
- `npm run lint` — 15 errors (exact baseline, NFR-02).
- `npm run build` — entry chunk 499940 ≤ 500000 bytes (NFR-02).
- `grep -v '^#' test/export-mspdi.test.mjs | grep -c OutlineLevel` — 23 > 0 (3-level XML assertions are code, not comments).
- Zero new dependencies (NFR-01); zero new files (D-69-3); no writer/src changes (pre-screen only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan's expected model row contract mismatched the actual model**
- **Found during:** Task 1
- **Issue:** The plan asserted nested-row `parent` = the immediate subtask id ('s13a') and depth-0 subtask rows carrying their own subtask ids ('s13b'). The actual model (src/export/model.js emit walk, matching the pinned 65-05 test contract) sets `parent` to the parent ROW's id — which for children of a depth-0 row is the TASK id — and depth-0 rows keep the task id per CR-01.
- **Fix:** Assertions pinned to the actual, already-shipped contract (parent 't_x13' throughout, ids 't_x13' at depth 0 / subtask ids deeper). No source change.
- **Files modified:** test/export-model.test.mjs
- **Commit:** 03d838c

**2. [Rule 1 - Bug] Research Pattern 2's Summary walk sketch used the wrong level semantics**
- **Found during:** Task 2
- **Issue:** The sketch said "OutlineLevel default 1 when absent" for the adjacency walk. The writer (export/mspdi.js:214-219) computes Summary on MODEL depth where a top-level row is -1 and children serialize OutlineLevel = depth+1, so top-level rows with children (t_x3) are Summary 1 even though their first child serializes OutlineLevel 1 — the sketch's mapping predicted Summary 0 there.
- **Fix:** The walk maps absent OutlineLevel → depth -1 and OutlineLevel n → depth n-1, reproducing the writer's arithmetic exactly; deviation documented in a code comment. No source change.
- **Files modified:** test/export-mspdi.test.mjs
- **Commit:** d0682bc

## Self-Check: PASSED

- Files exist: all 5 modified test/fixture files verified via git log/diff of the three commits.
- Commits exist: 03d838c, d0682bc, 624e8af on main; measured 3 commits over ledger base 8fb44e6.
- Suites re-run green after each task; full `npm test` green at the end.
