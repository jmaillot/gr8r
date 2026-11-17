---
phase: 71-subtask-columns-in-list-view
plan: 01
subsystem: ui-list-view
tags: [subtasks, list-view, renderer, grid-alignment, i18n-gates]
requires:
  - subTreeChecklistHtml shared renderer (65-03 lazy chunk)
  - taskRow/LCOLS grid template (task-list.js)
provides:
  - opt-in `columns: true` opt on subTreeChecklistHtml emitting 4 display meta cells
  - `.subrows` `--cols` grid forwarding (mechanism A, ADR-2)
  - done/todo status chip via stPill wrapping the toggleSub input (D-71-2)
  - `.inh` dim modifier for inherited priority; scoped done-strike CSS
affects: []
tech-stack:
  added: []
  patterns: [opt-in renderer branch, CSS custom-property grid template forwarding, label-wrapped checkbox chip]
key-files:
  created: []
  modified:
    - src/features/subtask-popovers.js
    - src/components/task-list.js
    - src/styles/views/list.css
    - test/i18n-core-features.test.mjs
decisions:
  - "ADR-1: opt-in `columns` opt leaves compact/board-popover output byte-identical (regression pinned)"
  - "ADR-2: taskRow forwards the ACTUAL tpl onto --cols — custom-cols call sites (tasks.js, my-tasks.js) align by construction"
  - "ADR-3: columns-mode toggleSub checkbox moves INTO the c-status cell inside a <label> wrapping the stPill chip — same delegated contract, no new wiring"
  - "ADR-5: columns-mode head wrapped in a single .subhead grid item spanning grid-column 1/4 (board compact output untouched — wrapper is columns-mode-only)"
metrics:
  duration: ~55 min
  completed: 2026-11-17
status: complete
commits: 3
plan_head_before: 4c0b5aaae1a69f209ad4a4fc04e86d9d37248266
plan_head_after: a9a813faea5ed5760e92532fa66fd9d08beac2af
actuals:
  tokens: 16000
  tasks: 3
  commits: 3
---

# Phase 71 Plan 01: Subtask meta columns in List view Summary

Opt-in `columns` branch on the shared subtask renderer emits Status/Assignees/Priority/Due cells aligned under the parent's grid template, with the board card popover byte-identical (pinned).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Tracer: 4 meta cells + `--cols` forwarding + grid CSS | d632d49 | subtask-popovers.js, task-list.js, list.css |
| 2 | Status chip (stPill + label-wrapped toggleSub) + `.inh` dim + done-strike scope | e4fd7ee | subtask-popovers.js, list.css |
| 3 | 5 renderer contract pins | a9a813f | test/i18n-core-features.test.mjs |

## What Was Built

- **Renderer** (`src/features/subtask-popovers.js`): `subTreeChecklistHtml` gained an opt-in `opt.columns` branch appending 4 `c-meta` display divs after the head — c-status (done/todo chip: the existing `toggleSub` checkbox inside a `<label class="stchip">` with `stPill(s.done ? 'done' : 'todo')`), c-assignee (own `s.assignees` via avStack, `common.unassigned` faint fallback), c-priority (`prPill(task0.priority)` with `.inh`), c-due (existing non-compact expression reused verbatim: inherited `page.subtask.inheritedDue` data-tip when `!s.due`, `.over` when past due and `!s.done`). In columns mode the toggle input moves into the status cell and the head is wrapped in a `.subhead` div. Board consumer `subPop.subs` untouched.
- **List consumer** (`src/components/task-list.js`): one-line edit — `.subrows` gains `style="--cols:${tpl}"` and the opt gains `columns: true` (CORE chunk delta confined to line 83).
- **CSS** (`src/styles/views/list.css`): `.subrow` flex→grid on `var(--cols, …default template)`, `min-height:32px`; `.subhead` spans `grid-column: 1 / 4` with inner flex + title ellipsis; `.stchip` visually subsumes the checkbox so the whole chip toggles; `.c-priority.inh` dims to opacity 0.55 (the inheritance signal — no i18n key added); `.subrow.done .c-meta span { text-decoration: none }` scopes the strike-through bleed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Comment literals broke two standing scanners**
- **Found during:** Tasks 1 and 2
- **Issue:** Comments containing the literal strings `data-a="pop"` / `data-a="toggleSub"` bumped the tree-wide `data-a` site count (i18n-shell/i18n-toast pins expect exactly 558), and an editor artifact left an unbalanced block comment that broke the Vite build.
- **Fix:** Reworded comments to avoid the literal attribute patterns; repaired the comment terminator.
- **Files modified:** src/features/subtask-popovers.js
- **Commit:** d632d49 / e4fd7ee

**2. [Rule 3 - Blocking] Test pins use source-template contracts instead of rendered output**
- **Found during:** Task 3
- **Issue:** `subtask-popovers.js` reaches a Vite virtual module through its import chain — bare Node cannot import it, so direct "output contains" assertions are impossible in `test/*.test.mjs`.
- **Fix:** The 5 pins assert the renderer's emitted template contracts on the source (the interpolated expressions are static, so each pin holds for every render) — the same approach the i18n-format suite documents for this constraint.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** a9a813f

## Gate Results

- `npm test`: **1731 pass / 1744 total**, 0 fail (grow-only from 1726/1739 — +5 pins)
- `npm run lint`: **15** pre-existing problems, none new (baseline exactly 15)
- Chunk gate (`test/build-chunk-size.test.mjs`, runs inside npm test): green — every emitted .js chunk ≤ 500000 bytes; task-list.js delta is the single line-83 edit
- i18n catalogue gate: untouched at **1944 keys**; zero new keys, en.json/fr.json unchanged
- Zero new dependencies (package.json unchanged)

## Tracer Feedback Gate

After Task 1, the `<automated>` verify (`npm test`) was re-run end-to-end: green at 1726 pass / 1739 total (baseline). Tracer verified — expanded per plan.

## Known Stubs

None — all 7 D-71 decisions implemented; no placeholder content shipped (the Task-1 status placeholder was replaced by the full chip in Task 2).

## Verification Notes

- Manual/visual check from 71-VALIDATION.md (subrow cells aligning under parent tracks at nesting depth ≥ 2, `--ind` indent under grid) is left to phase UAT — CSS keeps the `padding-left: calc(64px + var(--ind, 0px))` indent rule intact and the `.subhead` wrapper spans the three leading tracks.
- `my-tasks.js` (no assignee column): cells flow into adjacent tracks per D-71-6 ("each consumer decides grid alignment") — accepted in 71-RESEARCH §2.5.

## Self-Check: PASSED

- All 4 files modified and committed: verified via `git log --oneline -4`
- Commits d632d49, e4fd7ee, a9a813f exist on main above the ledger base 4c0b5aa
- SUMMARY measured: 3 commits via `git rev-list --count 4c0b5aa..HEAD`
