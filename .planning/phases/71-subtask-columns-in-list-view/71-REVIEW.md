---
phase: 71-subtask-columns-in-list-view
reviewed: 2026-11-17T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/features/subtask-popovers.js
  - src/components/task-list.js
  - src/styles/views/list.css
  - test/i18n-core-features.test.mjs
findings:
  critical: 1
  warning: 2
  info: 1
  total: 4
status: issues_found
---

# Phase 71: Code Review Report

**Reviewed:** 2026-11-17
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Phase 71 adds an opt-in `columns` mode to the shared subtask tree renderer, forwards the parent grid template onto `--cols` from `taskRow`, converts `.subrow` from flex to grid, and pins the behavior with 5 source-contract tests. The escaping posture is solid (T-71-01 verified clean), the board-card compact branch is provably byte-identical, `--cols` is composed only from the fixed `LCOLS` constants (T-71-02), no new keys were added (1944 gate holds), and the `task-list.js` delta is a single line (chunk gate respected). However, the flex→grid conversion kept the old `gap: 8px` while the parent grid uses `gap: 0`, which arithmetically breaks the column alignment that is the phase's stated goal (ADR-2).

## Critical Issues

### CR-01: `.subrow` grid keeps `gap: 8px` while the parent row/thead grid uses `gap: 0` — meta cells do not align under the parent tracks

**File:** `src/styles/views/list.css:137` (vs. the `.thead, .trow` rule at `src/styles/views/list.css:8-15`)

**Issue:** The whole point of Phase 71 (D-71-1, ADR-2, and the comment at list.css:131-133: "cells align under whatever tracks the parent shows on every call site") is that the subrow joins the parent's exact grid template. `.trow` and `.thead` set `gap: 0` (line 14), but the converted `.subrow` kept its legacy flex `gap: 8px` (line 137). With the same 9-track template, the subrow's grid consumes 8 × 8px = 64px of extra inter-track space that the parent does not have. The leading `18px`/`30px` tracks stay put (they sit before the first gap), but every track after the fr title track is shifted left relative to the parent: the status/assignee/priority/due/labels cells land ~56–64px off their parent columns and header cells. This defeats the phase's core deliverable for every row where the `minmax(220px, 1fr)` floor is not binding (the common case on wide list views).

**Fix:**
```css
.subrow {
  display: grid;
  grid-template-columns: var(--cols, ...);
  align-items: center;
  gap: 0; /* match .thead/.trow — identical track template must use identical gaps */
  ...
}
```
If spacing inside the head/title cell is wanted, keep `gap: 8px` on `.subrow > .subhead` (already present at line 154), not on the grid itself.

## Warnings

### WR-01: Keyboard focus indicator is invisible on the subtask status chip toggle

**File:** `src/styles/views/list.css:174-179`

**Issue:** In columns mode the `toggleSub` checkbox is the only focusable control in the status cell, and it is rendered as `position: absolute; width: 1px; height: 1px; opacity: 0`. No `:focus-visible` style is applied to the wrapping `.stchip`, so a keyboard user tabbing through the list gets no visible indication that the subtask toggle is focused (a WCAG 2.4.7 focus-visible failure). Also note `.stchip` has no `position: relative`, so the 1px checkbox positions against `.trow` (the nearest positioned ancestor) — harmless now, but fragile if the box is ever made visible.

**Fix:**
```css
.subrow .c-status .stchip { position: relative; }
.subrow .c-status .stchip:has(.check:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
  border-radius: var(--r-sm, 6px);
}
```

### WR-02: Tree indent padding shifts the entire grid — nested subtasks' meta cells misalign with depth-0 rows and the header

**File:** `src/features/subtask-popovers.js:45,80` + `src/styles/views/list.css:143`

**Issue:** `indent = \`--ind:${depth * 16}px;\`` is applied as inline `style` on the whole row div, and `.subrow` consumes it as `padding-left: calc(64px + var(--ind, 0px))` on the grid **container**. In the old flex layout that only indented content; in the grid layout it compresses/offsets the entire track sequence, so a depth-1 subtask's status/assignee/priority/due cells sit 16px right of a depth-0 subtask's cells and of the header cells. If the phase intends "every meta cell lands on the same track on every row" (ADR-2's claim), nested rows violate it. If hierarchical shifting of the meta cells is accepted, it should be pinned as an explicit decision — today the CSS comment and the renderer comment assert alignment "on every call site" without qualification.

**Fix:** Apply the indent only to the head item instead of the row container:
```css
.subrow { padding-left: 64px; }
.subrow { --ind-over: var(--ind, 0px); }
.subrow > .subhead { margin-left: var(--ind, 0px); } /* or padding-left on .subhead */
```
and stop emitting the inline `--ind` on the row's own `style` (or keep it and move the base `64px` onto `.subhead` as well) — the choice should be recorded in the phase notes.

## Info

### IN-01: CSS fallback track template hand-duplicates the `LCOLS` constants — silent drift risk (T-71-02 adjacency)

**File:** `src/styles/views/list.css:135`

**Issue:** `var(--cols, 18px 30px minmax(220px, 1fr) 126px 150px 108px 104px 168px 40px)` hard-copies the widths defined in `task-list.js:18-25` (`LCOLS`). The runtime `--cols` is always set by `taskRow` (task-list.js:83), so the fallback is near-dead code, but if an `LCOLS` width ever changes, the fallback drifts silently and no test guards it. T-71-02's spirit ("composed only from fixed LCOLS constants") is met at runtime, but not in this CSS literal.

**Fix:** Either delete the fallback (`var(--cols)` alone — the container always sets it) or add a comment pinning the literal to the default `opt.cols` set and note that any `LCOLS` width change must update it.

## Verified clean (no findings)

- **T-71-01 (escaping):** every dynamic string in the columns meta cells passes through `esc()`, `relDate`, or a pill/stack helper (`stPill`, `prPill`, `avStack`); the inherited-due tooltip uses `esc(t('page.subtask.inheritedDue'))` (subtask-popovers.js:77); the empty-assignees fallback is the catalogue key `t('common.unassigned')` (line 75).
- **ADR-1 / byte-identical popover:** the compact branch is untouched — `head` composes `${opt.columns ? '' : toggle}` and the row emits `${opt.columns ? `<div class="subhead">${head}</div>` : head}${meta}` with `meta = ''` when `columns` is unset (lines 59, 73-80); `subPop.subs` still calls `{ compact: true }` with no columns opt (line 94), and the test pins it (i18n-core-features.test.mjs:285-290).
- **D-71-7:** the four meta cells carry no `data-a` attributes (line 74-77; pinned at test line 248).
- **Drawer unaffected:** `drawer.js:122` calls the renderer without `rowClass: 'subrow'` (default `.subt`), so the flex→grid change cannot leak there.
- **Chunk gate:** `task-list.js` delta is exactly one line (83); no new dependencies; i18n keys unchanged (the columns mode reuses existing keys, so the 1944 gate holds).
- **Test quality:** the 5 new pins are source-template contract assertions with a documented rationale for why runtime import is impossible (Vite virtual module); each assertion is specific and non-trivial.

---

_Reviewed: 2026-11-17T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
