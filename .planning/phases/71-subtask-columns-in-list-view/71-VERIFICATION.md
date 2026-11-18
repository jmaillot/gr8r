---
phase: 71-subtask-columns-in-list-view
verified: 2026-11-18T10:30:00Z
status: human_needed
score: 10/10 must-haves verified
covered_files:
  - .planning/phases/71-subtask-columns-in-list-view/71-01-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-01-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-03-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-03-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-04-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-04-SUMMARY.md
  - src/features/subtask-popovers.js
  - src/components/task-list.js
  - src/styles/views/list.css
  - src/pages/my-tasks.js
  - test/i18n-core-features.test.mjs
  - e2e/subtask-align.spec.mjs
covered_digest: "v2:sha256:294a58dffa7f647a2021ce151a3713ddc5c2a92b2799af6d4b71e2ad0cc9ad09"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 8/8
  gaps_closed:
    - "G-71-3 truth A: the subrow status chip's visible content starts at the parent pill's content x-position — .subrow .c-status .stchip now carries the .pillbtn contract (padding: 0 7px; height: var(--h-sm); border-radius: var(--r-sm); list.css:194-202, commit 02fb2dc)"
    - "G-71-3 truth B: e2e alignment spec measures the chip's INNER content left edge vs the parent pill's content-box edge — 3 new tests in e2e/subtask-align.spec.mjs via chipInnerLeftX (first in-flow child; .check is position:absolute and excluded), 3 → 6 tests, commit 3fedacb"
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
human_verification:
  - test: "Open the List view with a task that has subtasks (nested depth ≥ 2, some done/overdue, mixed assignees), column headers visible. Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges, the parent task's cells (px offset), and — new after 71-04 — the status chip's visible content against the parent's status pill content. Repeat on the My Tasks view (cols: project→status→priority→due). Tab through a status chip to see the focus ring."
    expected: "Meta cells AND the chip's inner content sit exactly under the parent header columns at every nesting depth on BOTH call sites, at the same px offset as parent content; inherited priority dimmed; overdue && !done due red; visible focus ring on the chip."
    why_human: "Pixel-level visual confirmation in a running app is the user's standing UAT recheck (71-UAT.md test 1). The e2e pins now cover the chip-content metric programmatically, but final visual acceptance of G-71-3 was reported by the user against a live view."
---

# Phase 71: Subtask columns in List view — Verification Report (Re-verification after G-71-3 closure)

**Phase Goal:** Subtask rows in the List view display Status (done/todo chip), Assignees, Priority (inherited from parent) and Due (s.due || parent due, inherited tooltip) aligned to the parent column grid.
**Verified:** 2026-11-18T10:30:00Z
**Status:** human_needed (1 cosmetic standing visual UAT item)
**Re-verification:** Yes — plans 71-02/71-03/71-04 closed gaps G-71-1, G-71-2, G-71-3. This run re-verified all must-haves against current code AND re-ran the behavioral gates itself (fresh `npm run build` → e2e, full unit suite, lint) rather than trusting SUMMARY claims.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Subtask rows show meta cells aligned under the parent row's grid columns, one cell per forwarded parent column in the parent's own order (D-71-1, CR-01/WR-02 closed by 71-02) | ✓ VERIFIED | `task-list.js:83` forwards `columns: cols` + `style="--cols:${tpl}"`; renderer (`subtask-popovers.js:80-89`) maps `opt.columns` in order emitting `c-status`/`c-assignee`/`c-priority`/`c-due` + empty `.c-meta` placeholder for unmodeled columns — cell count/order always match parent's `cols.map` cells. My Tasks call site (`my-tasks.js:59`, `cols:['project','status','priority','due']`, `complete:true`). `.subrow` (list.css:130-153): `display:grid; grid-template-columns: var(--cols, …)`, `gap: 0`, indent rides `.subhead` via `var(--ind)` (WR-02 intact), `.subhead` spans `grid-column: 1 / 4`. Behaviorally pinned by e2e tests 1-3 (pixel-exact alignment incl. depth-2). |
| 2 | Status chip toggles done via the `data-a="toggleSub" data-id data-sid` contract (D-71-2); visible keyboard focus indicator on `.stchip` (WR-01) | ✓ VERIFIED | Columns branch emits `<label class="stchip">${toggle}${stPill(...)}</label>`; `:focus-within` ring at list.css:212-215. |
| 3 | Assignees cell shows the subtask's OWN assignees, unassigned fallback (D-71-3) | ✓ VERIFIED | `avStack(s.assignees, 3, 'sm')` / faint `t('common.unassigned')` in c-assignee (subtask-popovers.js:84). |
| 4 | Priority cell = PARENT's pill dimmed via `.inh`, zero new i18n keys (D-71-4) | ✓ VERIFIED | `prPill(task0.priority)` in `<div class="c-meta c-priority inh">` (:85); `.subrow .c-priority.inh { opacity: 0.55 }` (list.css:218-220). |
| 5 | Due cell = `s.due \|\| task0.due`, inheritedDue tooltip when inherited, `.over` when overdue && !s.done (D-71-5) | ✓ VERIFIED | Non-compact expression reused verbatim in c-due (:86). |
| 6 | Board card popover output unchanged — compact, no columns, zero c-meta markup (D-71-6 regression pin) | ✓ VERIFIED | `subPop.subs = p => … subTreeChecklistHtml(st, { compact: true })` with no columns opt; pins pass (unit suite 1737/0). |
| 7 | Assignees/Priority/Due cells are non-clickable display divs with no `data-a="pop"` (D-71-7) | ✓ VERIFIED | c-meta divs carry no data-a attributes; pin asserts `!columnsBranch.includes('data-a')`. |
| 8 | Subtask meta cells sit at the same horizontal px offset as the parent task's cells under each column header (G-71-1, closed by 71-03) | ✓ VERIFIED | Anchored grep `^[[:space:]]*padding: 0 8px;$` on current list.css returns exactly :28 (`.thead > div`), :55 (`.trow > div`), :160 (`.subrow > .c-meta`); the :110 `.grp` decoy (`padding: 0 8px 0 22px`) correctly excluded. Contract comment at list.css:156. Pinned by e2e tests 1-3. |
| 9 | The subrow status chip's visible content starts at the parent pill's content x-position — `.stchip` carries the `.pillbtn` padding/height/radius contract (G-71-3, closed by 71-04) | ✓ VERIFIED | list.css:194-202: `.subrow .c-status .stchip { display:inline-flex; align-items:center; gap:6px; height: var(--h-sm); padding: 0 7px; border-radius: var(--r-sm); cursor:pointer }` — matches `.pillbtn` contract (components.css `padding: 0 7px; height: var(--h-sm)`); background/hover intentionally not copied (documented decision). Behaviorally pinned by e2e tests 4-6 (inner content ≤1px vs parent pill content on List, My Tasks, depth-2 — all pass against a FRESH build). |
| 10 | The e2e alignment spec measures the chip's INNER content left edge vs the parent pill's content-box edge — the metric blind spot is closed (G-71-3) | ✓ VERIFIED | `e2e/subtask-align.spec.mjs` now has 6 tests (`grep -c '^test('` = 6, grow-only 3 → 6, zero existing assertions modified); `chipInnerLeftX` helper (:166) measures the first in-flow `.stchip` child (`.check` is position:absolute, out of flow, excluded); used at :203/:228/:257. |

**Score:** 10/10 truths verified (0 present, behavior-unverified)

### Requirement Coverage Note

`REQUIREMENTS.md` carries **no REQ-71 entries** (grep count 0) — as instructed, coverage is accounted for from PLAN frontmatter + the design decisions D-71-1…D-71-7 in the phase directory, not REQUIREMENTS.md rows. **Unregistered IDs explicitly noted:** REQ-71-COLUMNS (declared by 71-01, 71-02, 71-03, 71-04), REQ-71-STATUS, REQ-71-ASSIGNEES, REQ-71-PRIORITY, REQ-71-DUE, REQ-71-RENDERER, REQ-71-INTERACT (declared by 71-01) — all satisfied via truths 1-10 above.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/features/subtask-popovers.js` | columns opt consumed; one meta cell per forwarded column; stPill/prPill | ✓ VERIFIED | Lines 80-89 map `opt.columns` with per-column cells + empty placeholder; board branch untouched (compact). |
| `src/components/task-list.js` | `--cols:${tpl}` + `columns: cols` forwarding | ✓ VERIFIED | Line 83 confirms both. |
| `src/styles/views/list.css` | grid template w/ fallback, head span 1/4, `.inh`, gap:0, indent-on-item, focus ring, `.c-meta` 8px padding, `.stchip` pill contract | ✓ VERIFIED | All rules present incl. the G-71-3 chip contract (:194-202). |
| `test/i18n-core-features.test.mjs` | renderer + alignment + padding pins, grow-only | ✓ VERIFIED | Passes within full suite (1737/0). |
| `src/pages/my-tasks.js` | My Tasks call site with reordered cols | ✓ VERIFIED | Line 59: `cols: ['project','status','priority','due']`, `complete: true`. |
| `e2e/subtask-align.spec.mjs` | inner-chip-content metric + alignment assertions, grow-only 3→6 | ✓ VERIFIED | 6 tests; chipInnerLeftX helper; ran green this verification. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| task-list.js:83 cols array | renderer per-column cells | `columns: cols` → `opt.columns.map(...)` | ✓ WIRED | Cell count/order match parent's cell emission. |
| task-list.js:83 tpl | .subrow grid-template-columns | `style="--cols:${tpl}"` / `var(--cols, …)` | ✓ WIRED | Fallback cross-referenced to LCOLS (IN-01). |
| my-tasks.js:59 cols | subrow cell placement on My Tasks | same cols array through listHtml → taskRow | ✓ WIRED | Placeholder keeps status/priority/due on parent tracks. |
| `.pillbtn` contract (components.css) | `.subrow .c-status .stchip` | padding/height/radius copied (G-71-3) | ✓ WIRED | list.css:194-202; e2e tests 4-6 verify the rendered metric ≤1px. |
| `.stchip:focus-within` | visible focus ring | hidden checkbox focus surfaces on chip | ✓ WIRED | list.css:212-215 (WR-01). |
| renderer `--ind:${depth*16}px` | `.subhead` margin-left | inline style → var(--ind) | ✓ WIRED | WR-02 mechanism intact. |
| `.thead/.trow` `padding: 0 8px` | `.subrow > .c-meta` horizontal padding | identical 8px inset on both grids (G-71-1) | ✓ WIRED | list.css:28/:55/:160 anchored match; :110 decoy excluded. |

### Behavioral Spot-Checks (run by this verifier, not trusted from SUMMARYs)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Fresh build before e2e (stale-dist gotcha) | `npm run build` | built in 1.55s; entry chunk 500.00 kB (within ≤500000 chunk gate) | ✓ PASS |
| e2e alignment spec incl. 3 new G-71-3 inner-chip-content tests | `npm run e2e -- subtask-align` | **6 passed (9.4s)** — tests at :61/:90/:130 (cell alignment) and :187/:211/:236 (chip inner content vs pill content, List / My Tasks / depth-2) | ✓ PASS |
| Full unit suite | `npm test` | **1737 pass / 0 fail**, 13 pre-existing skips (grow-only baseline respected, no shrink) | ✓ PASS |
| Lint baseline | `npm run lint` | exactly 16 errors — pre-existing baseline per 71-04 deviation 1 (plan's "15" was stale; delta is webhook-ssrf.js:84, not phase files) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase — the e2e alignment spec (run above) is the phase's behavioral probe. SKIPPED (none exist).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REQ-71-COLUMNS | 71-01, 71-02, 71-03, 71-04 | 4 meta columns + chip content aligned under parent grid at same px offset | ✓ SATISFIED | Truths 1, 8, 9 |
| REQ-71-STATUS | 71-01 | editable done/todo chip via toggleSub | ✓ SATISFIED | Truth 2 |
| REQ-71-ASSIGNEES | 71-01 | own s.assignees via avStack, read-only | ✓ SATISFIED | Truth 3 |
| REQ-71-PRIORITY | 71-01 | inherited parent priority, dimmed | ✓ SATISFIED | Truth 4 |
| REQ-71-DUE | 71-01 | s.due \|\| task0.due, inheritedDue tooltip, .over | ✓ SATISFIED | Truth 5 |
| REQ-71-RENDERER | 71-01 | opt-in `columns` opt, compact untouched | ✓ SATISFIED | Truth 6 |
| REQ-71-INTERACT | 71-01 | only status interactive; no inline popovers | ✓ SATISFIED | Truth 7 |

**Note:** none of the REQ-71-* IDs are registered in `.planning/REQUIREMENTS.md`; all accounted for from PLAN frontmatter per orchestrator instruction (phase traces to design decisions D-71-1…D-71-7).

### Anti-Patterns Found

None in covered files. Phase-71 CSS rules carry documented rationale comments referencing D-71-1/D-71-2/D-71-4/G-71-1/WR-01/WR-02 — no debt markers, no placeholders. Open review finding LOW-01 (`.subrow > .c-meta` omits `min-width:0`/`gap:6px`/`white-space:nowrap` hardening) remains dispositioned `open` as cosmetic future polish — informational, not a blocker.

### Human Verification Required

### 1. Visual grid + chip-content alignment + focus ring (standing UAT recheck)

**Test:** Open the List view with a task that has subtasks (nested depth ≥ 2, some done/overdue, mixed assignees). Compare each subrow's Status / Assignees / Priority / Due cells against the header column edges, the parent task's cells, and the status chip's visible content against the parent's status pill content. Repeat on My Tasks. Tab through a status chip for the focus ring.
**Expected:** Meta cells and chip inner content sit exactly under parent header columns at every nesting depth on both call sites, at the same px offset as parent content; inherited priority dimmed; overdue due red; visible focus ring.
**Why human:** Final visual acceptance of the cosmetic fixes (G-71-1/G-71-3) was reported by the user against a live view; e2e pins now cover the metric programmatically, but the standing 71-UAT.md test 1 recheck remains the user's call.

### Gaps Summary

None. All three gap-closure rounds (G-71-1 padding, G-71-2 grid/indent, G-71-3 chip pill contract) are closed in current code and behaviorally pinned: e2e 6/6 green against a fresh build (run by this verifier), unit suite 1737/0, lint at its pre-existing baseline. Status is `human_needed` solely for the standing cosmetic visual UAT recheck; no automated gaps remain.

---

_Verified: 2026-11-18T10:30:00Z_
_Verifier: the agent (gsd-verifier)_
