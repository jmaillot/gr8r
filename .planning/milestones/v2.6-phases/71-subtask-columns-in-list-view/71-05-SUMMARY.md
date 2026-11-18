---
phase: 71
plan: 05
subsystem: list-view-subtasks
tags: [css-alignment, e2e, gap-closure, G-71-4]
requires: [71-04]
provides: [G-71-4 closure — all four subrow meta cells carry the .pillbtn content contract]
affects: [subtask-popovers renderer columns mode, list.css subrow styles, subtask-align e2e spec]
tech-stack:
  added: []
  patterns: [pill-contract wrapper (.stpill mirroring .stchip), grow-only e2e assertions]
key-files:
  created: []
  modified:
    - src/features/subtask-popovers.js
    - src/styles/views/list.css
    - e2e/subtask-align.spec.mjs
decisions:
  - ".stpill (single shared class) chosen over per-cell wrappers — mirrors .stchip's padding/height/radius exactly, alignment not restyle (no bg/hover), D-71-7 preserved (no data-a/pop on the wrapper)"
  - "My Tasks e2e assertion restricted to priority/due — the my-tasks call site forwards project→status→priority→due and has no assignee column to measure"
metrics:
  duration: ~11min
  completed: 2026-11-18
  status: complete
  actuals:
    tokens: 16000
    tasks: 2
    commits: 2
plan_head_before: a07076f
plan_head_after: fc163d0
commits: 2
estimate:
  tokens: 20000
  tasks: 2
---

# Phase 71 Plan 05: Gap closure — assignee/priority/due content offset (G-71-4, cosmetic) Summary

**One-liner:** Wrapped the subrow assignee/priority/due cell content in a `.stpill` element carrying the parent `.pillbtn` padding/height/radius contract, and pinned the inner-content alignment metric for all three cells in the e2e spec on both call sites.

## What Was Done

### Task 1: Pill-contract wrapper (G-71-4)
- `src/features/subtask-popovers.js` columns mode: assignee (avStack / faint "Unassigned"), priority (prPill) and due (.due span, including the empty-due case) cell content wrapped in `<span class="stpill">`. Status `.stchip` untouched (G-71-3 already correct). No data-a/pop on the wrapper — D-71-7 intact (unit pin stays green).
- `src/styles/views/list.css`: added `.subrow .c-meta .stpill` — `display:inline-flex; align-items:center; gap:6px; height:var(--h-sm); padding:0 7px; border-radius:var(--r-sm)` — mirroring `.stchip` exactly. Alignment, not restyle: no background/hover. Phase-71 comment notes G-71-4.

### Task 2: Grow-only e2e + standing gates
- `e2e/subtask-align.spec.mjs`: added `stpillInnerLeftX` (measures the `.stpill` content-box edge — first child's left, or the wrapper's own content edge when the due wrapper is empty; identical math either way) and `stpillDiag` (computed padding/height dump on diff > 1, same DIAG convention). Three new tests:
  1. List view — assignee/priority/due inner content vs parent `.pillbtn` content-box edge (±1px)
  2. My Tasks — priority/due only (see decision below)
  3. Depth-2 grandchild priority cell (G-71-3 test shape)
- Zero existing assertion lines removed; `test(` count 6 → 9.

## Gate Results

| Gate | Result |
|------|--------|
| `npm run build` then `npm run e2e -- subtask-align` | 9/9 passed (incl. 6 pre-existing G-71-1/2/3 tests byte-unchanged) |
| `npm test` | 1737 pass / 0 fail / 13 pre-existing skips — baseline held (grow-only) |
| `npm run lint` | exactly 16 problems (pre-existing baseline per 71-04 deviation 1) |
| Chunk gate | 499,995 / 500,000 bytes (≤ budget) |
| i18n | catalogue unchanged (no new keys, no task-list.js edits, no new deps) |

## Deviations from Plan

**1. [Rule 3 - Blocking fix] My Tasks assertion restricted to priority/due cells**
- **Found during:** Task 2 (first e2e run failed the my-tasks test)
- **Issue:** The plan's task text said to assert all three cells on My Tasks, but the my-tasks call site (`src/pages/my-tasks.js`) forwards `cols: ['project','status','priority','due']` — there is NO assignee column on the parent row, so the parent pill to measure against does not exist there.
- **Fix:** `assertStpillAligned` takes a cols list; the my-tasks test passes `['c-priority', 'c-due']` with an explanatory comment. List view still covers all three cells.
- **Files modified:** e2e/subtask-align.spec.mjs
- **Commit:** fc163d0

**2. [Environment, not a deviation] e2e server-contention flakes:** two runs failed with "e2e server not ready" before any assertion ran — the known lingering-`server.js` contention flake documented in Phase 68. Cleared the stale process; `npm run e2e -- subtask-align` then passed 9/9. No assertion was weakened.

## Authentication Gates

None.

## Human Check (cosmetic, post-execution)

Open a running List view and My Tasks with an expanded subtask: subrow assignee/priority/due content should now sit at the same horizontal offset as the parent's pill content (the ~7px left drift the user reported is closed). This is the UAT vision check the e2e pins numerically.

## Self-Check: PASSED

- bdd73d5 — feat(71-05): .stpill wrapper + list.css contract ✓ (in git log)
- fc163d0 — test(71-05): grow-only e2e pins ✓ (in git log)
- All three modified files exist and are committed; working tree clean except pre-existing ROADMAP.md modification outside this plan's scope.
