---
phase: 71-subtask-columns-in-list-view
reviewed: 2026-11-17T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/styles/views/list.css
  - test/i18n-core-features.test.mjs
findings:
  critical: 1
  warning: 1
  info: 2
  total: 4
status: issues_found
---

# Phase 71: Code Review Report

**Reviewed:** 2026-11-17
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Reviewed the phase 71 CSS (list subrow grid alignment) and the contract test suite at standard depth, cross-referencing both against the actual renderer (`src/features/subtask-popovers.js`) and the parent row renderer (`src/components/task-list.js`), plus every `listHtml` call site.

The core columns mechanism works for the Tasks/Project list views (parent cols start `['status','assignee','priority','due',…]`, matching the renderer's hardcoded cell order). However, one live call site passes a different column order and the subtask meta cells silently land on the wrong tracks there. The CSS fallback template is also stale against both real call sites. The test file is largely sound (it correctly pins escaping, the toggle contract, and grid alignment), but contains a name/assertion mismatch and a self-contradictory comment that will mislead future maintainers.

## Critical Issues

### CR-01: Subtask meta cells misalign with parent columns on the My Tasks list view

**File:** `src/features/subtask-popovers.js:73-78` (consumed via `src/styles/views/list.css:130-163` and `test/i18n-core-features.test.mjs:244-252`)
**Issue:** The columns branch hardcodes the four meta cells in the order `status → assignee → priority → due`, but the parent track order comes from `listHtml`'s `cols` option, which varies per call site. `src/pages/my-tasks.js:59` calls:

```js
listHtml(groups, key, { cols: ['project', 'status', 'priority', 'due'], complete: true, ... })
```

so the parent template is `18px 30px minmax(220px,1fr) 160px 126px 108px 104px 40px` (project, status, priority, due). The `.subhead` spans tracks 1/4 correctly, but the emitted cells then land as:

- `c-status` (done/todo pill) on the **project** track
- `c-assignee` on the **status** track
- `c-priority` on the **priority** track (accidentally correct)
- `c-due` on the **due** track (accidentally correct)

Users on My Tasks see the status chip under the "Project" header and assignee avatars under the "Status" header. The phase test (line 251) only pins `rowClass: 'subrow', columns: true` and the `--cols` forwarding — it never pins cell order against track order, so this regression is invisible to the suite. The Tasks page (`tasks.js:28`) and Project page (`project.js:113`) happen to align only because their first four cols are `status, assignee, priority, due`; any future column reorder re-triggers the bug silently.

**Fix:** Either (a) emit the meta cells in parent-column order by passing the `cols` array through to the renderer and mapping cells per column:

```js
// task-list.js:83
treeChecklist.fn(t, { compact: true, rowClass: 'subrow', columns: cols })
// subtask-popovers.js columns branch
const meta = opt.columns
  ? opt.columns.map(c => CELL_SUB[c] ? `<div class="c-meta c-${c}">${CELL_SUB[c](s, task0)}</div>` : '').join('')
  : '';
```

or (b) minimally, reject/misalign-proof by reordering the hardcoded cells to match the dominant call sites and adding a test pin asserting the cell class sequence equals the first four entries of every `listHtml` call site's `cols` array.

## Warnings

### WR-01: CSS fallback grid template is stale — matches no live call site

**File:** `src/styles/views/list.css:138`
**Issue:** The fallback `grid-template-columns: var(--cols, 18px 30px minmax(220px, 1fr) 126px 150px 108px 104px 168px 40px)` bakes in the order status/assignee/priority/due/labels (126/150/108/104/168px). Neither real `listHtml` call site uses that sequence: `tasks.js:28` uses `['status','assignee','priority','due','project']` (project = 160px, not 168px) and `my-tasks.js:59` uses `['project','status','priority','due']`. Any future call site that renders `.subrow` without `--cols` inherits a template that is wrong in both widths and order — worse than having no fallback, because the comment (lines 135-137) presents it as a correct default. Note also the test at `test/i18n-core-features.test.mjs:319-322` only checks that the comment *mentions* LCOLS, not that the widths actually match `LCOLS`.

**Fix:** Either keep the fallback but generate/verify it from `LCOLS` (e.g. a build-time check test comparing the CSS literal to `LCOLS` defaults), or drop the fallback to a simpler sane default (title track + 1fr) so misalignment is loud rather than subtly wrong:

```css
grid-template-columns: var(--cols, 18px 30px minmax(220px, 1fr));
```

## Info

### IN-01: Test name contradicts its assertion (174 vs 175)

**File:** `test/i18n-core-features.test.mjs:225-229`
**Issue:** The test is named `the icon baseline holds at 174 names` but asserts `assert.equal(names.length, 175, ...)`. The trailing comment on line 228 also contains duplicated, self-contradictory history fragments (`+1: gauge … prior: +1: gauge …`) from copy-paste accretion. Future maintainers reading the test name will "fix" the assertion down to 174 and break CI.

**Fix:** Rename the test to `the icon baseline holds at 175 names` and clean the duplicated comment history.

### IN-02: Strike-through suppression relies on class-order specificity, and caret icons in the subhead get struck on done subrows

**File:** `src/styles/views/list.css:202-208`
**Issue:** `.subrow.done .c-meta span { text-decoration: none; }` (line 202) is declared *before* the broader `.subrow.done span { text-decoration: line-through; }` (line 205) and only wins because of higher specificity — a re-order or specificity refactor silently re-enables strike-through on pill text and avatars, exactly the bleed RESEARCH 2.6 scoped out. Additionally, spans inside `.subhead` (caret `<span class="ibtn">`, the 22px spacer) sit outside `.c-meta`, so on a done subrow their icon spans get `line-through` (cosmetic no-op for SVG, but it hits the `<span style="width:22px">` spacer's text-decoration inheritance chain).

**Fix:** Invert the declaration order (generic rule first, suppression last) and extend the suppression to `.subrow.done .subhead span`, or scope the strike rule to `.subrow.done .subhead .s` (the title only).

---

_Reviewed: 2026-11-17_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
