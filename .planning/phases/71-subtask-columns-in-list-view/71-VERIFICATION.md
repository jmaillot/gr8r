---
phase: 71-subtask-columns-in-list-view
verified: 2026-11-17T19:35:00Z
status: human_needed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/71-subtask-columns-in-list-view/71-01-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-01-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-CONTEXT.md
  - .planning/phases/71-subtask-columns-in-list-view/71-REVIEW-FIX.md
  - src/features/subtask-popovers.js
  - src/components/task-list.js
  - src/styles/views/list.css
  - src/pages/my-tasks.js
  - test/i18n-core-features.test.mjs
covered_digest: "v2:sha256:fd28e1c5b97444b5d47b4166fa85f930f8773e6754af94cb70efa77930b56001"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed: []
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
human_verification:
  - test: "Open the List view with a task that has subtasks (some nested depth ≥ 1, some done/overdue, mixed assignees), columns headers visible. Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges; tab through a status chip to see the focus ring. Repeat on the My Tasks view (cols: project→status→priority→due, complete: true) — the CR-01 fix specifically reordered cells for this call site."
    expected: "The meta cells sit exactly under the parent header columns at every nesting depth on BOTH call sites; inherited priority is dimmed; overdue && !done due is red; keyboard focus shows a visible ring on the chip."
    why_human: "Pixel-level grid alignment and focus-ring visibility are visual properties; the runtime is a Vite virtual module so no DOM-level test can exercise the rendered layout — 71-VALIDATION.md explicitly marks visual alignment manual-only."
---

# Phase 71: Subtask columns in List view — Verification Report

**Phase Goal:** Subtask rows in the List view display Status (done/todo chip), Assignees, Priority (inherited from parent) and Due (s.due || parent due, inherited tooltip) aligned to the parent column grid.
**Verified:** 2026-11-17
**Status:** human_needed
**Re-verification:** Yes — after the code-review `--fix` run (commits 85b27e7 CR-01 + 0ce52dc WR-01) touched covered source post-verification; this report regenerates the covered digest and re-verifies the CR-01 fix did not break column alignment semantics.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Subtask rows show the meta cells aligned under the parent row's grid columns (D-71-1) — post-CR-01: one cell per forwarded parent column, in the parent's own order | ✓ VERIFIED | `task-list.js:83` forwards `columns: cols` (the call-site array) alongside `--cols:${tpl}`; `tpl` (task-list.js:87) places one track per `cols` entry after the 3 leading tracks (18px/30px/fr). Parent cells at :80 map `cols` in order → tracks 4..N; the renderer (subtask-popovers.js:80-89) maps `opt.columns` in the same order, emitting `c-status`/`c-assignee`/`c-priority`/`c-due` for modeled columns and an empty `<div class="c-meta"></div>` placeholder for unmodeled ones (project, labels) — so cell count and order always match the parent's cell sequence. My Tasks call site (my-tasks.js:59, `cols: ['project','status','priority','due']`) → placeholder+status+priority+due land on tracks 4-7, exactly where the parent's project/status/priority/due cells sit. `.subrow` (list.css) keeps `gap: 0`, `grid-template-columns: var(--cols, 18px 30px minmax(220px,1fr))` (minimal loud fallback, WR-01 fix 0ce52dc), indent on the `.subhead` grid item (`margin-left: var(--ind, 0px)`), `.subhead` spans `grid-column: 1 / 4`. Alignment holds by construction for any call site. |
| 2 | Status chip toggles done via the `data-a="toggleSub" data-id data-sid` contract (D-71-2) | ✓ VERIFIED | Regression check: columns branch still emits `<label class="stchip">${toggle}${stPill(...)}` (subtask-popovers.js:83); `A.toggleSub` handler unchanged. WR-01 focus-ring rule `.subrow .c-status .stchip:focus-within { outline: 2px solid var(--accent) }` present (list.css:192-195). |
| 3 | Assignees cell shows the subtask's OWN assignees, unassigned fallback (D-71-3) | ✓ VERIFIED | Regression check: `avStack(s.assignees, 3, 'sm')` / faint `t('common.unassigned')` in the c-assignee cell (subtask-popovers.js:84). |
| 4 | Priority cell = PARENT's pill dimmed via `.inh`, zero new i18n keys (D-71-4) | ✓ VERIFIED | Regression check: `prPill(task0.priority)` inside `<div class="c-meta c-priority inh">` (subtask-popovers.js:85); `.inh` dim rule intact; i18n catalogue gate (1944 keys) passing. |
| 5 | Due cell = `s.due \|\| task0.due` with inheritedDue tooltip when inherited and `.over` when overdue && !s.done (D-71-5) | ✓ VERIFIED | Regression check: non-compact expression reused verbatim in the c-due cell (subtask-popovers.js:86). |
| 6 | Board card popover output unchanged — compact, no columns, zero c-meta markup (D-71-6 regression pin) | ✓ VERIFIED | Regression check: `subPop.subs` still calls `{ compact: true }` with no columns opt (subtask-popovers.js:104-107); regression pins pass (`subPop.subs = p =>` slice contains no 'columns' / 'c-meta'). |
| 7 | Assignees/Priority/Due cells are non-clickable display divs with no `data-a="pop"` (D-71-7) | ✓ VERIFIED | Regression check: the four c-meta divs carry no data-a attributes; pin asserts `!columnsBranch.includes('data-a')`. |

**Score:** 7/7 truths verified (0 present, behavior-unverified)

### Requirement coverage note

REQUIREMENTS.md carries no REQ-71 entries — coverage is derived from the D-71-1…D-71-7 decisions in the plan/discussion log (all seven verified above; D-71-1 additionally re-verified for alignment semantics under the CR-01 per-call-site ordering fix).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/features/subtask-popovers.js` | columns opt consumed as a cols array; one meta cell per forwarded column; stPill/prPill imports | ✓ VERIFIED | Lines 80-89 map `opt.columns` with per-column cells + empty placeholder; board branch untouched. |
| `src/components/task-list.js` | `--cols:${tpl}` + `columns: cols` forwarding on the .subrows div | ✓ VERIFIED | Line 83 confirms both; call-site cols arrays (default + my-tasks) flow into both the parent cells and the renderer. |
| `src/styles/views/list.css` | grid template (minimal loud fallback), head span 1/4, `.inh`, gap:0, indent-on-item, focus ring | ✓ VERIFIED | All rules present; fallback comment documents the minimal-default rationale and LCOLS sync source (0ce52dc). |
| `test/i18n-core-features.test.mjs` | renderer pins + alignment pins incl. `columns: cols` forwarding + placeholder pins | ✓ VERIFIED | 24/24 pass in the file (`node --test`: 24 pass, 0 fail). |
| `src/pages/my-tasks.js` | My Tasks call site with reordered cols | ✓ VERIFIED | Line 59: `cols: ['project','status','priority','due']`, `complete: true` — the second alignment call site CR-01 targeted. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| task-list.js:83 cols array | renderer per-column cells | `columns: cols` → `opt.columns.map(...)` | ✓ WIRED | Cell count/order always match the parent's own `cols.map` cell emission (task-list.js:80). |
| task-list.js:83 tpl | .subrow grid-template-columns | `style="--cols:${tpl}"` / `var(--cols, …)` | ✓ WIRED | Actual tpl forwarded (ADR-2); minimal loud fallback (0ce52dc). |
| my-tasks.js:59 cols | subrow cell placement on My Tasks | same cols array forwarded through listHtml → taskRow | ✓ WIRED | Placeholder for 'project' keeps status/priority/due on the parent's tracks 5-7. |
| subtask-popovers.js toggleSub input | delegated action handler | `A.toggleSub` (actions.js) | ✓ WIRED | Pre-existing contract unchanged. |
| subPop.subs compact:true call site | unchanged compact output | no columns opt | ✓ WIRED | Regression pinned. |
| renderer `--ind:${depth*16}px` | `.subhead` margin-left | inline style → var(--ind) | ✓ WIRED | Indent rides the grid item (WR-02 mechanism). |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-71 pins (incl. cols-forwarding + placeholder pins) pass | `node --test test/i18n-core-features.test.mjs` | 24 pass / 0 fail | ✓ PASS |
| Full suite after fix commits | `npm test` | 1749 tests, 1736 pass, 0 fail, 13 skipped | ✓ PASS |
| Lint baseline | `npm run lint` | exactly 15 errors (pre-existing baseline), 0 warnings | ✓ PASS |
| Commit 85b27e7 scope (CR-01) | `git show --stat 85b27e7` | 3 files (renderer, task-list, test), 37+/12- | ✓ PASS |
| Commit 0ce52dc scope (WR-01) | `git show --stat 0ce52dc` | list.css only, 7+/5- | ✓ PASS |

Note: the pins are source-template/source-CSS contract assertions (Vite virtual module prevents runtime import — documented deviation in 71-01-SUMMARY). Pixel-level alignment is routed to human verification below, consistent with 71-VALIDATION.md "Manual-Only Verifications".

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| D-71-1 | 71-01-PLAN / 71-02-PLAN | Subrow meta cells aligned under parent grid columns | ✓ SATISFIED | Truth 1 (re-verified under the CR-01 per-call-site ordering fix; both call sites check out) |
| D-71-2 | 71-01-PLAN | Status chip via toggleSub contract | ✓ SATISFIED | Truth 2 |
| D-71-3 | 71-01-PLAN | Own assignees + unassigned fallback | ✓ SATISFIED | Truth 3 |
| D-71-4 | 71-01-PLAN | Parent priority pill dimmed, zero new i18n keys | ✓ SATISFIED | Truth 4 |
| D-71-5 | 71-01-PLAN | Inherited due + tooltip + overdue styling | ✓ SATISFIED | Truth 5 |
| D-71-6 | 71-01-PLAN | Board popover regression pin | ✓ SATISFIED | Truth 6 |
| D-71-7 | 71-01-PLAN | Meta cells non-clickable, no data-a | ✓ SATISFIED | Truth 7 |

(REQUIREMENTS.md has no REQ-71 entries — all seven requirement IDs live in plan frontmatter as D-71-* decisions and are accounted for.)

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | No TBD/FIXME/XXX/stub patterns in phase files. Info: the 71-02-PLAN acceptance gate `grep -c "gap: 8px" == 3` is now 4 — the 4th occurrence is `.trow .ttl` (list.css:75), an inner flex gap inside the title cell, not a subrow track gap; `.subrow` itself has `gap: 0` and no `gap: 8px`. The plan's count was stale, not the CSS. |

### Human Verification Required

### 1. Visual grid alignment + focus ring, on BOTH call sites (Manual-Only per 71-VALIDATION.md)

**Test:** List view (Tasks/Project cols: status→assignee→priority→due) and My Tasks view (cols: project→status→priority→due, complete: true) with subtasks at multiple depths; compare subrow meta cells to header columns; tab through a status chip.
**Expected:** Cells land exactly under parent header columns at every depth on both views; inherited priority dimmed; overdue due red; visible keyboard focus ring on the chip.
**Why human:** Rendered pixel alignment and focus visibility can't be asserted by the source-contract pins — the CR-01 fix is a behavioral reordering whose live-DOM correctness only a human (or a browser test the runtime shape doesn't allow) can confirm.

### Gaps Summary

None. The CR-01 fix (85b27e7) changed the meta-cell derivation from a hardcoded status→assignee→priority→due sequence to a per-forwarded-column map in the parent's own order; the alignment-by-construction argument still holds (cell count and order always match the parent's own `cols.map` emission on the same `--cols` template), and both live call sites (default + My Tasks) were re-traced. The WR-01 fallback change (0ce52dc) keeps `--cols` as the primary mechanism. All regression checks pass; full suite 1736/1749 green, lint at the 15-error baseline. One manual UAT item remains (visual alignment/focus ring on both call sites), consistent with the phase's own validation plan.

---

_Verified: 2026-11-17T19:35:00Z_
_Verifier: the agent (gsd-verifier)_
