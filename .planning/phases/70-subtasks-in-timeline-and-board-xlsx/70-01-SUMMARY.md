---
phase: 70-subtasks-in-timeline-and-board-xlsx
plan: 01
subsystem: export-xlsx
tags: [xlsx, export, subtasks, gantt, board]
requires: [Phase 65/69 child-row model contract, D-70-1..D-70-7]
provides: [subtask rows in Timeline sheet (DFS bars + real-depth indent + per-bar status), subtask cards in Board lanes, child-inclusive SHAPE_CAP accounting]
affects: [XLSX export consumers]
tech-stack:
  added: []
  patterns: [parent-grouped DFS via per-parent lexicographic dotted-key sort, per-bar status payload, parent-only link map]
key-files:
  created: []
  modified:
    - src/export/model.js
    - src/export/gantt.js
    - export/xlsx.js
    - test/export-model.test.mjs
    - test/export-gantt.test.mjs
    - test/export-xlsx.test.mjs
decisions:
  - "Child bars grouped by depth-0 ancestor KEY (first dotted segment) — no id-keyed maps anywhere (CR-01); orphan child bars defensively appended in key order"
  - "statusLabelById deleted; status rides the bar (bar.status, the row's already-translated label — D-54-12)"
  - "indentCell level > 1 verified directly against @office-kit/xlsx/dist (alignment.indent 0..255, no clamping) — assumption A2 resolved, no fix needed"
  - "makeChartDoc confirmed subtask-free (A4 resolved); Board R7 test auto-adapts, child-card assertions carried by new pins"
metrics:
  duration: ~35 min
  completed: 2026-11-17
status: complete
actuals:
  tokens: 52000
  tasks: 4
  commits: 3
plan_head_before: 48e14b5
plan_head_after: 1d5cc96
commits: 3
---

# Phase 70 Plan 01: Subtasks in Timeline and Board XLSX Summary

**One-liner:** Lifted the three subtask exclusions — Board lanes gain flat dotted-key child cards (counts = parents + children), Timeline gains parent-grouped DFS child bars with real-depth indent (depth+1) and per-bar status (statusLabelById retired), SHAPE_CAP 400 stays strict child-inclusive; CSV/MSPDI/Tasks-sheet/route untouched.

## What Shipped

- **Task 1 — model.js:** child rows carry `order: t.order ?? 0`; board lanes build from ALL rows (flat child cards in their own status lane per D-70-2, dotted-key cards, order-then-key sort). topRows consumers (kpis/charts/members) untouched.
- **Task 2 — gantt.js:** T-54-15 `!r.parent` filter lifted; bars parent-grouped DFS (existing parent sort kept, subtree spliced per parent in lexicographic dotted-key order, rows reassigned gapless after the splice); bars carry `status`/`depth` (-1 parents)/`indentLevels` (depth+1); `barByTaskId` from parent bars only + deps lookup skips child rows (CR-01); SHAPE_CAP child-inclusive with zero code change.
- **Task 3 — export/xlsx.js:** statusLabelById deleted, per-bar `bar.status` written; Timeline table mirrors the writeTaskRow pattern (indentCell(depth+1) on child titles, bold unindented parents, A/C unstyled). Board sheet: zero code changes (pass-through verified by pins). Tasks sheet untouched (fixed-1 pin survives; comment reworded).
- **Task 4 — gates:** all standing gates green (below).

## Commits

- 411863b feat(70-01): board lanes include child cards; child rows carry order (D-70-1, D-70-2)
- 7f187d0 feat(70-01): parent-grouped DFS bars with per-bar status/depth/indentLevels; parent-only link map (D-70-5..7)
- 3ee2dfb feat(70-01): Timeline per-bar status + real-depth indent + parent bold; Board pass-through pins (D-70-3..5)

## Test Counts

- Before: 1713 pass / 1726 total (Phase 69 baseline); export trio 111 tests.
- After: **1722 pass / 1735 total** (grow-only: +9 tests, 0 failures, 13 skipped unchanged). Export trio now 120.
- New pins: 4 gantt (DFS order, per-bar fields, subtask-dep drop + parent anchor, cap with children), 5 xlsx (WR-01 rewrite, real-depth indent incl. level 2, child bar anchors, Board child cards, empty-lane-below-child-cards), 2 model (extended board lanes pin + D-70-1/D-70-2 card pin with kpi/chart/member regression guard).

## Standing Gates (Task 4 verify: GATES-OK)

- `npm test` — 1722 pass / 1735 total (≥ 1713/1726 grow-only)
- `npm run lint` — exactly 15 errors (baseline)
- `npm run build` — entry chunk 499.94 kB ≤ 500000
- `git diff test/export-mspdi.test.mjs test/export-csv.test.mjs package.json package-lock.json` — empty (frozen files + zero new deps)
- A3 confirmed: MSPDI suite green unmodified.

## Deviations from Plan

None — plan executed exactly as written. Notes:
- ROADMAP Phase 70 placeholders were already filled by the planner (Goal/Requirements/Plans complete at .planning/ROADMAP.md:62-70); Task 4 step 7 was a no-op and produced no commit.
- Assumption A2 verified before implementation: `indentCell(wb, c, levels)` writes `alignment.indent` for levels 0..255 (node_modules/@office-kit/xlsx/dist/cell-style-CYBtFNC4.mjs:3825) — arbitrary depth supported, no fix needed.
- Test-fix truthing: makeMspdiDoc tasks keep the default `'todo'` status (no per-task override), and t_x13's Sub A.2 is depth 1 (child of Sub A); assertions were written to the actual fixture contracts.

## Known Stubs

None.

## Self-Check: PASSED

- All 3 commits found in `git log`; all 6 modified files present in the working tree; export trio + full suite green at write time.
