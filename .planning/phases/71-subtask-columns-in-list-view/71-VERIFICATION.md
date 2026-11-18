---
phase: 71-subtask-columns-in-list-view
verified: 2026-11-18T06:25:23Z
status: human_needed
score: 8/8 must-haves verified
covered_files:
  - .planning/phases/71-subtask-columns-in-list-view/71-01-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-01-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-03-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-03-SUMMARY.md
  - src/features/subtask-popovers.js
  - src/components/task-list.js
  - src/styles/views/list.css
  - src/pages/my-tasks.js
  - test/i18n-core-features.test.mjs
covered_digest: "v4:sha256:e50f681a5f973d1e55a1ff6809f192c1099466d8d981eeb281f620dddf1100b4"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 7/7
  gaps_closed:
    - "Subtask meta cells sit at the same horizontal px offset as the parent task's cells under each column header (G-71-1) — .subrow > .c-meta now carries `padding: 0 8px` (list.css:158), verified in current code after plan 71-03 (commits fc1f88c/a182b00)"
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
human_verification:
  - test: "Open the List view with a task that has subtasks (some nested depth ≥ 1, some done/overdue, mixed assignees), column headers visible. Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges AND the horizontal px offset of the parent task's cells under each header (G-71-1 recheck). Repeat on the My Tasks view (cols: project→status→priority→due). Tab through a status chip to see the focus ring."
    expected: "Meta cells sit exactly under the parent header columns at every nesting depth on BOTH call sites, and at the same horizontal px offset as the parent cells (the G-71-1 fix); inherited priority dimmed; overdue && !done due red; visible focus ring on the chip."
    why_human: "Pixel-level grid alignment and within-cell px offset are visual properties; the runtime is a Vite virtual module so no DOM-level test can exercise the rendered layout — 71-VALIDATION.md marks visual alignment manual-only. This is the user's standing UAT recheck (71-UAT.md test 1)."
---

# Phase 71: Subtask columns in List view — Verification Report (Re-verification)

**Phase Goal:** Subtask columns in List view — subtask rows render in grid columns aligned under parent column headers, including meta cells at the same horizontal px offset (gap closure G-71-1 per D-71-1).
**Verified:** 2026-11-18T06:25:23Z
**Status:** human_needed (1 standing visual UAT item — the G-71-1 px-offset recheck)
**Re-verification:** Yes — prior VERIFICATION.md was stale because plan 71-03 (commits fc1f88c/a182b00) changed covered source (`src/styles/views/list.css`, `test/i18n-core-features.test.mjs`) after the last verify run. All must-haves re-checked against current code.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Subtask rows show meta cells aligned under the parent row's grid columns, one cell per forwarded parent column in the parent's own order (D-71-1) | ✓ VERIFIED | `task-list.js:83` forwards `columns: cols` + `style="--cols:${tpl}"`; renderer (`subtask-popovers.js:80-89`) maps `opt.columns` in order, emitting `c-status`/`c-assignee`/`c-priority`/`c-due` and an empty `.c-meta` placeholder for unmodeled columns — cell count/order always match the parent's own `cols.map` cells. My Tasks call site (`my-tasks.js:59`, `cols:['project','status','priority','due']`, `complete:true`) → placeholder+status+priority+due land on the parent's tracks. `.subrow` (list.css:130-153): `display:grid; grid-template-columns: var(--cols, 18px 30px minmax(220px, 1fr)); gap: 0`, `padding-left: 64px` fixed (indent rides `.subhead` via `var(--ind)` — WR-02 fix intact), `.subhead` spans `grid-column: 1 / 4`. |
| 2 | Status chip toggles done via the `data-a="toggleSub" data-id data-sid` contract (D-71-2) | ✓ VERIFIED | Columns branch emits `<label class="stchip">${toggle}${stPill(...)}</label>` (subtask-popovers.js:83 region); focus-within ring at list.css:201 (WR-01 intact). |
| 3 | Assignees cell shows the subtask's OWN assignees, unassigned fallback (D-71-3) | ✓ VERIFIED | `avStack(s.assignees, 3, 'sm')` / faint `t('common.unassigned')` in c-assignee (subtask-popovers.js:84). |
| 4 | Priority cell = PARENT's pill dimmed via `.inh`, zero new i18n keys (D-71-4) | ✓ VERIFIED | `prPill(task0.priority)` in `<div class="c-meta c-priority inh">` (:85); i18n catalogue gate passing (1944 keys — 25/25 in test file). |
| 5 | Due cell = `s.due \|\| task0.due`, inheritedDue tooltip when inherited, `.over` when overdue && !s.done (D-71-5) | ✓ VERIFIED | Non-compact expression reused verbatim in c-due (:86). |
| 6 | Board card popover output unchanged — compact, no columns, zero c-meta markup (D-71-6 regression pin) | ✓ VERIFIED | `subPop.subs = p => ... subTreeChecklistHtml(st, { compact: true })` with no columns opt (subtask-popovers.js:~104); pins pass in the 25/25 file run. |
| 7 | Assignees/Priority/Due cells are non-clickable display divs with no `data-a="pop"` (D-71-7) | ✓ VERIFIED | c-meta divs carry no data-a attributes; pin asserts `!columnsBranch.includes('data-a')`; 25/25 pass. |
| 8 | Subtask meta cells sit at the same horizontal px offset as the parent task's cells under each column header (G-71-1, per D-71-1) — the gap-closure truth added by plan 71-03 | ✓ VERIFIED | Anchored grep `^[[:space:]]*padding: 0 8px;$` on current `src/styles/views/list.css` returns exactly 3 lines: :28 (`.thead > div`), :55 (`.trow > div`), :158 (`.subrow > .c-meta`); the :110 `.grp` decoy (`padding: 0 8px 0 22px`) correctly excluded. list.css:149-156 comment documents the G-71-1 contract; the rule applies `display:flex; align-items:center` matching the `.trow > div` convention. Section-6 source-contract pins grow-only extended; 25/25 pass. |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Requirement Coverage Note

`REQUIREMENTS.md` carries **no REQ-71 entries** (grep exit 1) — REQ-71-COLUMNS and REQ-71-STATUS…REQ-71-INTERACT are unregistered. Coverage is accounted for from PLAN frontmatter (`71-01-PLAN.md` declares all seven; `71-02-PLAN.md` and `71-03-PLAN.md` re-declare REQ-71-COLUMNS for gap closure). All seven D-71-1…D-71-7 decision truths plus the G-71-1 px-offset truth are verified above. **Unregistered IDs explicitly noted:** REQ-71-COLUMNS (unregistered in REQUIREMENTS.md — verified from PLAN must_haves instead), REQ-71-STATUS, REQ-71-ASSIGNEES, REQ-71-PRIORITY, REQ-71-DUE, REQ-71-RENDERER, REQ-71-INTERACT (same status).

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/features/subtask-popovers.js` | columns opt consumed; one meta cell per forwarded column; stPill/prPill | ✓ VERIFIED | Lines 80-89 map `opt.columns` with per-column cells + empty placeholder; board branch untouched. |
| `src/components/task-list.js` | `--cols:${tpl}` + `columns: cols` forwarding | ✓ VERIFIED | Line 83 confirms both. |
| `src/styles/views/list.css` | grid template w/ fallback, head span 1/4, `.inh`, gap:0, indent-on-item, focus ring, `.c-meta` 8px padding | ✓ VERIFIED | All rules present including the G-71-1 padding contract (:157-161). |
| `test/i18n-core-features.test.mjs` | renderer + alignment + padding pins, grow-only | ✓ VERIFIED | 25/25 pass (`node --test`). |
| `src/pages/my-tasks.js` | My Tasks call site with reordered cols | ✓ VERIFIED | Line 59: `cols: ['project','status','priority','due']`, `complete: true`. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| task-list.js:83 cols array | renderer per-column cells | `columns: cols` → `opt.columns.map(...)` | ✓ WIRED | Cell count/order match parent's cell emission. |
| task-list.js:83 tpl | .subrow grid-template-columns | `style="--cols:${tpl}"` / `var(--cols, …)` | ✓ WIRED | Minimal loud fallback documented (IN-01). |
| my-tasks.js:59 cols | subrow cell placement on My Tasks | same cols array through listHtml → taskRow | ✓ WIRED | Placeholder keeps status/priority/due on parent tracks. |
| subtask-popovers.js toggleSub input | delegated action handler | `A.toggleSub` (unchanged contract) | ✓ WIRED | Regression pinned. |
| subPop.subs compact:true call site | unchanged compact output | no columns opt | ✓ WIRED | Regression pinned. |
| renderer `--ind:${depth*16}px` | `.subhead` margin-left | inline style → var(--ind) | ✓ WIRED | WR-02 mechanism intact (list.css:140-153). |
| `.thead/.trow` `padding: 0 8px` | `.subrow > .c-meta` horizontal padding | identical 8px inset on both grids (G-71-1) | ✓ WIRED | list.css:28/:55/:158 anchored match; :110 decoy excluded. |

### Automated Checks Run (this re-verification)

| Check | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| Anchored padding contract (G-71-1) | `grep -nE '^[[:space:]]*padding: 0 8px;$' src/styles/views/list.css` | exactly :28, :55, :158; :110 decoy excluded | ✓ PASS |
| Renderer + consumer wiring | grep of task-list.js:83 / subtask-popovers.js:80-89 / my-tasks.js:59 | all forwarding + cell mapping present | ✓ PASS |
| i18n/core-features pins (incl. G-71-1 pin) | `node --test test/i18n-core-features.test.mjs` | 25 pass / 0 fail | ✓ PASS |
| Lint baseline | `npm run lint` | exactly 15 errors (pre-existing baseline) | ✓ PASS |
| Full suite | `npm test` | 1736 pass / 1 fail / 1750 total | ✓ PASS (1 pre-existing env failure) |
| Pre-existing failure classification | `test/webhook-events.test.mjs:294` assertion | due.reminder double-fire — D-27-1 reminder window opens 08:00 UTC; clock-injection proof passes 21/21. Predates phase 71, environmental clock-window, **NOT a phase-71 regression** | ℹ️ INFO (pre-existing/environmental) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REQ-71-COLUMNS | 71-01, 71-02, 71-03 | 4 meta columns aligned under parent grid, same px offset | ✓ SATISFIED | Truths 1 + 8 |
| REQ-71-STATUS | 71-01 | editable done/todo chip via toggleSub | ✓ SATISFIED | Truth 2 |
| REQ-71-ASSIGNEES | 71-01 | own s.assignees via avStack, read-only | ✓ SATISFIED | Truth 3 |
| REQ-71-PRIORITY | 71-01 | inherited parent priority, dimmed | ✓ SATISFIED | Truth 4 |
| REQ-71-DUE | 71-01 | s.due \|\| task0.due, inheritedDue tooltip, .over | ✓ SATISFIED | Truth 5 |
| REQ-71-RENDERER | 71-01 | opt-in `columns` opt, compact untouched | ✓ SATISFIED | Truth 6 |
| REQ-71-INTERACT | 71-01 | only status interactive; no inline popovers | ✓ SATISFIED | Truth 7 |

**Note:** none of the REQ-71-* IDs are registered in `.planning/REQUIREMENTS.md` (phase predates/did not register them); all accounted for from PLAN frontmatter per orchestrator instruction.

### Anti-Patterns Found

None in covered files. Phase-71 CSS rules carry documented rationale comments referencing D-71-1/G-71-1/WR-01/WR-02 — no debt markers, no placeholders.

### Human Verification Required

### 1. Visual grid alignment + px-offset alignment + focus ring (standing UAT recheck — G-71-1)

**Test:** Open the List view with a task that has subtasks (nested depth ≥ 1, some done/overdue, mixed assignees). Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges AND against the horizontal px offset of the parent task's cells (G-71-1 recheck). Repeat on My Tasks. Tab through a status chip for the focus ring.
**Expected:** Meta cells sit exactly under parent header columns at every nesting depth on both call sites, at the same horizontal px offset as the parent cells; inherited priority dimmed; overdue due red; visible focus ring.
**Why human:** Pixel-level alignment is visual; Vite virtual module prevents DOM-level automated layout testing (71-VALIDATION.md marks it manual-only). This is the user's 71-UAT.md test 1, carried as the standing human recheck after the G-71-1 fix.

### Gaps Summary

None. G-71-1 (the only prior gap, cosmetic) is closed in current code and pinned by tests: `.subrow > .c-meta` now carries the same `padding: 0 8px` as `.thead > div` / `.trow > div` (anchored grep :28/:55/:158, decoy :110 excluded). Status is `human_needed` solely for the standing visual UAT recheck; no automated gaps remain.

---

_Verified: 2026-11-18T06:25:23Z_
_Verifier: the agent (gsd-verifier)_
