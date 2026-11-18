---
phase: 71-subtask-columns-in-list-view
verified: 2026-11-18T11:05:00Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/71-subtask-columns-in-list-view/71-01-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-01-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-02-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-03-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-03-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-04-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-04-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-05-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-05-SUMMARY.md
  - src/features/subtask-popovers.js
  - src/components/task-list.js
  - src/styles/views/list.css
  - src/pages/my-tasks.js
  - test/i18n-core-features.test.mjs
  - e2e/subtask-align.spec.mjs

covered_digest: "v2:sha256:adebcdc340044932ebfac888fc5121f3145500cd0d7c2e1573d3939a5a43dd4a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 10/10
  gaps_closed:
    - "G-71-4 truth A: subrow assignee/priority/due cells' visible content carries the .pillbtn padding contract — wrapped in a single .stpill element (subtask-popovers.js:84-86), rule .subrow .c-meta .stpill { display:inline-flex; align-items:center; gap:6px; height:var(--h-sm); padding:0 7px; border-radius:var(--r-sm) } at list.css:222-229, mirroring .stchip exactly (commits bdd73d5, fc163d0)"
    - "G-71-4 truth B: e2e alignment spec measures the inner content left edge of the assignee/priority/due cells against the parent .pillbtn content-box edge on both call sites — 3 new tests (6 → 9, grow-only, zero existing assertions modified), stpillInnerLeftX/stpillDiag helpers at e2e/subtask-align.spec.mjs:276/:289"
  gaps_remaining: []
  regressions: []
behavior_unverified_items: []
human_verification:
  - test: "Open the List view with a task that has subtasks (nested depth ≥ 2, some done/overdue, mixed assignees), column headers visible. Compare each subrow's Status / Assignees / Priority / Due cells — and now ALL FOUR cells' visible inner content — against the header column edges, the parent task's pill content (px offset), on the List view and on My Tasks (project→status→priority→due). Tab through a status chip to see the focus ring."
    expected: "All four meta cells AND their inner content (status chip, assignee, priority, due) sit exactly under the parent header columns / at the parent pill's content x-position at every nesting depth on BOTH call sites; inherited priority dimmed; overdue && !done due red; visible focus ring on the chip."
    why_human: "Pixel-level visual confirmation in a running app is the user's standing UAT recheck (71-UAT.md test 1). The e2e pins now cover the inner-content metric for all four cells programmatically, but final visual acceptance of the cosmetic gap closures (G-71-1…G-71-4) was reported by the user against a live view."
---

# Phase 71: Subtask columns in List view — Verification Report (Re-verification after G-71-4 closure)

**Phase Goal:** Subtask rows in the List view display Status (done/todo chip), Assignees, Priority (inherited from parent) and Due (s.due || parent due, inherited tooltip) aligned to the parent column grid.
**Verified:** 2026-11-18T11:05:00Z
**Status:** human_needed (1 cosmetic standing visual UAT item — now covering all four cells' inner content)
**Re-verification:** Yes — plan 71-05 closed the user-reported gap G-71-4 (assignee/priority/due content offset). This run re-verified all 12 must-haves against current code AND re-ran the behavioral gates itself (fresh `npm run build` → e2e, full unit suite, lint) rather than trusting SUMMARY claims.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Subtask rows show meta cells aligned under the parent row's grid columns, one cell per forwarded parent column in the parent's own order (D-71-1) | ✓ VERIFIED | `task-list.js:83` forwards `columns: cols` + `style="--cols:${tpl}"`; renderer (`subtask-popovers.js:80-89`) maps `opt.columns` in order emitting `c-status`/`c-assignee`/`c-priority`/`c-due` + empty `.c-meta` placeholder — cell count/order always match parent's `cols.map` cells. My Tasks call site (`my-tasks.js:59`, `cols:['project','status','priority','due']`, `complete:true`). `.subrow` grid: `grid-template-columns: var(--cols, …)`, `gap: 0`, indent rides `.subhead` via `var(--ind)`, `.subhead` spans `grid-column: 1 / 4`. Pinned by e2e tests 1-3. |
| 2 | Status chip toggles done via the `data-a="toggleSub" data-id data-sid` contract (D-71-2); visible keyboard focus indicator on `.stchip` (WR-01) | ✓ VERIFIED | `<label class="stchip">${toggle}${stPill(...)}</label>`; `:focus-within` ring at list.css:211-214. |
| 3 | Assignees cell shows the subtask's OWN assignees, unassigned fallback (D-71-3) | ✓ VERIFIED | `avStack(s.assignees, 3, 'sm')` / faint `t('common.unassigned')` inside the `.stpill` wrapper in c-assignee (subtask-popovers.js:84). |
| 4 | Priority cell = PARENT's pill dimmed via `.inh`, zero new i18n keys (D-71-4) | ✓ VERIFIED | `prPill(task0.priority)` in `<div class="c-meta c-priority inh"><span class="stpill">…` (:85); `.subrow .c-priority.inh { opacity: 0.55 }` (list.css:231-234). |
| 5 | Due cell = `s.due \|\| task0.due`, inheritedDue tooltip when inherited, `.over` when overdue && !s.done (D-71-5) | ✓ VERIFIED | Non-compact expression reused verbatim inside the `.stpill` wrapper in c-due (:86). |
| 6 | Board card popover output unchanged — compact, no columns, zero c-meta markup (D-71-6 regression pin) | ✓ VERIFIED | `subPop.subs = p => … subTreeChecklistHtml(st, { compact: true })` with no columns opt; unit pins pass (suite 1737/0). |
| 7 | Assignees/Priority/Due cells are non-clickable display content with no `data-a="pop"` (D-71-7) | ✓ VERIFIED | The new `.stpill` wrapper carries no data-a/pop attributes (read directly at subtask-popovers.js:84-86); existing unit pin `!columnsBranch.includes('data-a')` stays green. |
| 8 | Subtask meta cells sit at the same horizontal px offset as the parent task's cells under each column header (G-71-1, closed by 71-03) | ✓ VERIFIED | Anchored `padding: 0 8px` on `.thead > div` (:28), `.trow > div` (:55), `.subrow > .c-meta` (:160); `.grp` decoy excluded. Pinned by e2e tests 1-3. |
| 9 | The subrow status chip's visible content starts at the parent pill's content x-position — `.stchip` carries the `.pillbtn` padding/height/radius contract (G-71-3, closed by 71-04) | ✓ VERIFIED | list.css:194-202 matches the `.pillbtn` contract; pinned by e2e tests 4-6 (all green against a FRESH build this run). |
| 10 | The e2e spec measures the chip's INNER content left edge vs the parent pill's content-box edge (G-71-3) | ✓ VERIFIED | `chipInnerLeftX` at e2e/subtask-align.spec.mjs:166, used at :203/:228/:257; 9 tests total, grow-only intact. |
| 11 | The subrow assignee/priority/due cells' visible content starts at the same horizontal px offset as the parent task's pill content — cell content carries the `.pillbtn` padding contract via a single `.stpill` wrapper (G-71-4, closed by 71-05) | ✓ VERIFIED | subtask-popovers.js:84-86 wrap avStack/unassigned-fallback, prPill and the due span in `<span class="stpill">`; list.css:222-229 `.subrow .c-meta .stpill { display:inline-flex; align-items:center; gap:6px; height:var(--h-sm); padding:0 7px; border-radius:var(--r-sm) }` — mirrors `.stchip` exactly, no background/hover (alignment not restyle), documented comment naming G-71-4. Commits bdd73d5 + fc163d0 confirmed in git log. Behaviorally pinned by e2e tests 7-9 (green against a FRESH build this run). |
| 12 | The e2e alignment spec measures the inner content left edge of the assignee/priority/due cells against the parent `.pillbtn` content-box edge on both call sites (G-71-4) | ✓ VERIFIED | `stpillInnerLeftX` (:276) + `stpillDiag` DIAG convention (:289); 3 new tests: List view all three cells (:314), My Tasks priority/due only (:332 — correct restriction: the my-tasks call site has no assignee column, deviation 1 documented in 71-05-SUMMARY), depth-2 priority (:353). Test count 6 → 9 (`grep -c '^test('` = 9), zero existing assertions removed. |

**Score:** 12/12 truths verified (0 present, behavior-unverified)

### Requirement Coverage Note

`REQUIREMENTS.md` carries **no REQ-71 entries** — as instructed, coverage is accounted for from PLAN frontmatter + the design decisions D-71-1…D-71-7 in the phase directory, not REQUIREMENTS.md rows. **Unregistered IDs explicitly noted:** REQ-71-COLUMNS (declared by 71-01…71-05), REQ-71-STATUS, REQ-71-ASSIGNEES, REQ-71-PRIORITY, REQ-71-DUE, REQ-71-RENDERER, REQ-71-INTERACT (declared by 71-01) — all satisfied via truths 1-12 above.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/features/subtask-popovers.js` | columns opt consumed; one meta cell per forwarded column; stPill/prPill; assignee/priority/due wrapped in `.stpill` | ✓ VERIFIED | Lines 80-89 map `opt.columns` with per-column cells; :84-86 wrap the three cells in `.stpill`; status untouched; board branch compact. |
| `src/components/task-list.js` | `--cols:${tpl}` + `columns: cols` forwarding | ✓ VERIFIED | Line 83 confirms both. |
| `src/styles/views/list.css` | grid template w/ fallback, head span 1/4, `.inh`, gap:0, indent-on-item, focus ring, `.c-meta` 8px padding, `.stchip` pill contract, `.stpill` pill contract | ✓ VERIFIED | All rules present incl. `.stpill` (:222-229) with G-71-4 rationale comment. |
| `test/i18n-core-features.test.mjs` | renderer + alignment + padding pins, grow-only | ✓ VERIFIED | Passes within full suite (1737/0). |
| `src/pages/my-tasks.js` | My Tasks call site with reordered cols | ✓ VERIFIED | Line 59: `cols: ['project','status','priority','due']`, `complete: true`. |
| `e2e/subtask-align.spec.mjs` | inner-chip-content + inner-stpill-content metrics, grow-only 3→9 | ✓ VERIFIED | 9 tests; chipInnerLeftX + stpillInnerLeftX + stpillDiag; ran green this verification. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| task-list.js:83 cols array | renderer per-column cells | `columns: cols` → `opt.columns.map(...)` | ✓ WIRED | Cell count/order match parent's cell emission. |
| task-list.js:83 tpl | .subrow grid-template-columns | `style="--cols:${tpl}"` / `var(--cols, …)` | ✓ WIRED | Fallback cross-referenced to LCOLS (IN-01). |
| my-tasks.js:59 cols | subrow cell placement on My Tasks | same cols array through listHtml → taskRow | ✓ WIRED | Placeholder keeps status/priority/due on parent tracks. |
| `.pillbtn` contract (components.css) | `.subrow .c-status .stchip` | padding/height/radius copied (G-71-3) | ✓ WIRED | list.css:194-202; e2e tests 4-6 verify ≤1px. |
| `.pillbtn` contract (components.css) | `.subrow .c-meta .stpill` | identical padding/height/radius (G-71-4) | ✓ WIRED | list.css:222-229; e2e tests 7-9 verify the rendered metric ≤1px on List + My Tasks + depth-2. |
| `.stchip:focus-within` | visible focus ring | hidden checkbox focus surfaces on chip | ✓ WIRED | list.css:211-214 (WR-01). |
| renderer `--ind:${depth*16}px` | `.subhead` margin-left | inline style → var(--ind) | ✓ WIRED | WR-02 mechanism intact. |
| `.thead/.trow` `padding: 0 8px` | `.subrow > .c-meta` horizontal padding | identical 8px inset on both grids (G-71-1) | ✓ WIRED | list.css:28/:55/:160. |

### Behavioral Spot-Checks (run by this verifier, not trusted from SUMMARYs)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Fresh build before e2e (stale-dist gotcha) | `npm run build` | built in 1.53s; entry chunk 500.00 kB (within ≤500000 chunk gate) | ✓ PASS |
| e2e alignment spec incl. 3 new G-71-4 inner-stpill-content tests | `npm run e2e -- subtask-align` | **9 passed (9.5s)** — tests at :61/:90/:130 (cell alignment), :187/:211/:236 (chip inner content), :314/:332/:353 (assignee/priority/due inner content vs parent pill content — List / My Tasks / depth-2) | ✓ PASS |
| Full unit suite | `npm test` | **1737 pass / 0 fail**, 13 pre-existing skips (grow-only baseline respected, no shrink) | ✓ PASS |
| Lint baseline | `npm run lint` | exactly 16 errors — pre-existing baseline per 71-04 deviation 1 (webhook-ssrf.js:84 `process` no-undef, not phase files) | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` probes declared or conventional for this phase — the e2e alignment spec (run above) is the phase's behavioral probe. SKIPPED (none exist).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| REQ-71-COLUMNS | 71-01, 71-02, 71-03, 71-04, 71-05 | 4 meta columns + ALL cells' visible content aligned under parent grid at same px offset | ✓ SATISFIED | Truths 1, 8, 9, 11, 12 |
| REQ-71-STATUS | 71-01 | editable done/todo chip via toggleSub | ✓ SATISFIED | Truth 2 |
| REQ-71-ASSIGNEES | 71-01 | own s.assignees via avStack, read-only | ✓ SATISFIED | Truth 3 |
| REQ-71-PRIORITY | 71-01 | inherited parent priority, dimmed | ✓ SATISFIED | Truth 4 |
| REQ-71-DUE | 71-01 | s.due \|\| task0.due, inheritedDue tooltip, .over | ✓ SATISFIED | Truth 5 |
| REQ-71-RENDERER | 71-01 | opt-in `columns` opt, compact untouched | ✓ SATISFIED | Truth 6 |
| REQ-71-INTERACT | 71-01 | only status interactive; no inline popovers | ✓ SATISFIED | Truth 7 |

**Note:** none of the REQ-71-* IDs are registered in `.planning/REQUIREMENTS.md`; all accounted for from PLAN frontmatter per orchestrator instruction (phase traces to design decisions D-71-1…D-71-7).

### Anti-Patterns Found

None in covered files. Phase-71 CSS rules carry documented rationale comments referencing D-71-1/D-71-2/D-71-4/G-71-1/G-71-3/G-71-4/WR-01/WR-02 — no debt markers, no placeholders. The 71-05-SUMMARY deviation (My Tasks assertion restricted to priority/due) is verified correct: `my-tasks.js` forwards no assignee column, so there is no parent pill to measure against there. Open review finding LOW-01 (`.subrow > .c-meta` hardening: `min-width:0`/`gap:6px`/`white-space:nowrap`) remains dispositioned `open` as cosmetic future polish — informational, not a blocker.

### Human Verification Required

### 1. Visual grid + all-four-cells inner-content alignment + focus ring (standing UAT recheck)

**Test:** Open the List view with a task that has subtasks (nested depth ≥ 2, some done/overdue, mixed assignees). Compare each subrow's Status / Assignees / Priority / Due cells — and ALL FOUR cells' visible inner content — against the header column edges, the parent task's pill content, on List view and on My Tasks. Tab through a status chip for the focus ring.
**Expected:** Meta cells and their inner content sit exactly under parent header columns / at the parent pill's content x-position at every nesting depth on both call sites; inherited priority dimmed; overdue due red; visible focus ring.
**Why human:** Final visual acceptance of the cosmetic fixes (G-71-1…G-71-4) was reported by the user against a live view; the e2e pins now cover the inner-content metric for all four cells programmatically, but the standing 71-UAT.md test 1 recheck remains the user's call.

### Gaps Summary

None. All four gap-closure rounds (G-71-1 padding, G-71-2 grid/indent, G-71-3 chip pill contract, G-71-4 assignee/priority/due pill contract) are closed in current code and behaviorally pinned: e2e 9/9 green against a fresh build (run by this verifier), unit suite 1737/0, lint at its pre-existing baseline of exactly 16. Status is `human_needed` solely for the standing cosmetic visual UAT recheck — now widened to cover all four meta cells' inner content per G-71-4; no automated gaps remain.

---

_Verified: 2026-11-18T11:05:00Z_
_Verifier: the agent (gsd-verifier)_
