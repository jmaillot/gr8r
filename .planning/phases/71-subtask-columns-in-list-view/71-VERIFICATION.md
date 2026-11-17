---
phase: 71-subtask-columns-in-list-view
verified: 2026-11-17T12:00:00Z
status: gaps_found
score: 6/7 must-haves verified
covered_files:
  - .planning/phases/71-subtask-columns-in-list-view/71-01-PLAN.md
  - .planning/phases/71-subtask-columns-in-list-view/71-01-SUMMARY.md
  - .planning/phases/71-subtask-columns-in-list-view/71-CONTEXT.md
  - .planning/phases/71-subtask-columns-in-list-view/71-REVIEW.md
  - .planning/phases/71-subtask-columns-in-list-view/71-VALIDATION.md
  - src/features/subtask-popovers.js
  - src/components/task-list.js
  - src/styles/views/list.css
  - test/i18n-core-features.test.mjs
covered_digest: "v2:sha256:51a17f9d7ae6ae7e7166c949402da443b0b4995b3e68005750faa5dc1308126e"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "Subtask rows in List view show Status, Assignees, Priority, Due cells aligned under the parent row's grid columns (D-71-1, mechanism A: actual tpl forwarded via --cols)"
    status: failed
    reason: "Grid conversion is arithmetically misaligned. CR-01: .subrow (list.css:137) keeps the legacy flex gap: 8px on the converted grid while the parent .thead/.trow grids use gap: 0 (list.css:8-15) — with the same 9-track template the subrow consumes 8×8px = 64px of extra inter-track space, shifting every meta cell after the fr title track ~56–64px off the parent/header columns. WR-02 compounds it: --ind is applied as padding-left on the grid CONTAINER (list.css:143), compressing/offsetting the whole track sequence for nested rows, so depth≥1 subrows misalign with depth-0 rows and the header. The renderer/tasks-list/CSS plumbing is correct (actual tpl forwarded, .subhead spans 1/4); the alignment the phase exists to deliver does not hold."
    artifacts:
      - path: "src/styles/views/list.css"
        issue: "line 137: .subrow gap: 8px must be gap: 0 to match .thead/.trow; line 143: padding-left: calc(64px + var(--ind)) on the grid container shifts the whole track sequence for nested rows — indent should ride the .subhead item instead"
    missing:
      - "Set .subrow { gap: 0 } (keep inner spacing on .subrow > .subhead, already present)"
      - "Move the tree indent off the grid container (e.g. .subrow { padding-left: 64px } + .subrow > .subhead { margin-left: var(--ind, 0px) } or equivalent) and record the choice"
      - "Pin the alignment contract with a test or accept as manual UAT per 71-VALIDATION.md 'Manual-Only Verifications' row"
---

# Phase 71: Subtask columns in List view — Verification Report

**Phase Goal:** Subtask rows in the List view display 4 metadata columns (Status, Assignees, Priority, Due) aligned to the parent grid, via an opt-in `columns` opt on the shared renderer, without regressing the board card popover.
**Verified:** 2026-11-17
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Subtask rows show the 4 meta cells aligned under the parent row's grid columns (D-71-1) | ✗ FAILED | All plumbing present and correct — `task-list.js:87` forwards `style="--cols:${tpl}"` (actual tpl, ADR-2), `.subrow` is `display:grid; grid-template-columns: var(--cols, …)` (list.css:135), `.subhead` spans `grid-column: 1 / 4` (list.css:154). BUT `list.css:137` keeps `gap: 8px` while `.thead/.trow` (list.css:8-15) use `gap: 0` — 8×8px = 64px of extra inter-track space shifts every cell after the fr title track ~56–64px off the parent columns (review CR-01, confirmed in source). WR-02: `padding-left: calc(64px + var(--ind))` on the grid container (list.css:143) shifts the entire track sequence for nested rows. Alignment — the phase's stated deliverable — does not hold. |
| 2 | Status chip toggles done via existing `data-a="toggleSub" data-id data-sid` contract (D-71-2) | ✓ VERIFIED | `subtask-popovers.js` columns branch: `<label class="stchip">${toggle}${stPill(s.done ? 'done' : 'todo')}</label>`; the toggle input keeps the exact attrs verbatim; delegated handler `A.toggleSub` wired at `src/actions/actions.js:1103` (pre-existing, unchanged). Pin at test/i18n-core-features.test.mjs:254-263. |
| 3 | Assignees cell shows the subtask's OWN assignees, unassigned fallback (D-71-3) | ✓ VERIFIED | `avStack(s.assignees, 3, 'sm')` / faint `t('common.unassigned')` in the columns branch (subtask-popovers.js:75); pinned at test:266. |
| 4 | Priority cell = PARENT's pill dimmed via `.inh`, zero new i18n keys (D-71-4) | ✓ VERIFIED | `prPill(task0.priority)` inside `<div class="c-meta c-priority inh">`; `.inh` dim rule in list.css:180; pin asserts no `s.priority` read (test:269-273); i18n catalogue gate at test:218 still pins 1944 keys (19 tests in the file pass). |
| 5 | Due cell = `s.due \|\| task0.due` with inheritedDue tooltip when inherited and `.over` when overdue && !s.done (D-71-5) | ✓ VERIFIED | Non-compact expression reused verbatim in the c-due cell (data-tip `esc(t('page.subtask.inheritedDue'))` when `!s.due`, `.over` when `diffD(parse(due), TODAY) < 0 && !s.done`); pinned at test:276+. |
| 6 | Board card popover output unchanged — compact, no columns, zero c-meta markup (D-71-6 regression pin) | ✓ VERIFIED | `subPop.subs` still calls `{ compact: true }` with no columns opt (subtask-popovers.js:94); regression pin at test:285-289 asserts no `columns` leakage and no `c-meta` in the board template. |
| 7 | Assignees/Priority/Due cells are non-clickable display divs with no `data-a="pop"` (D-71-7) | ✓ VERIFIED | The four meta cells carry no data-a attributes (columns branch; pinned at test:248 `!columnsBranch.includes('data-a')`). |

**Score:** 6/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/features/subtask-popovers.js` | columns opt + 4 meta cells + stPill/prPill imports | ✓ VERIFIED | All present; esc() on every dynamic string (review verified clean, T-71-01) |
| `src/components/task-list.js` | line-83 edit: `--cols:${tpl}` + `columns: true` | ✓ VERIFIED | Single-line delta confirmed (line 87 in the .subrows div) |
| `src/styles/views/list.css` | grid template, head span 1/4, `.inh`, done-strike scope | ⚠️ PARTIAL | All rules present, but `gap: 8px` on the grid container defeats the alignment contract (see Truth 1) |
| `test/i18n-core-features.test.mjs` | 5 renderer pins | ✓ VERIFIED | 19/19 pass in the file (ran `node --test test/i18n-core-features.test.mjs`: 19 pass, 0 fail) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| task-list.js:87 tpl | .subrow → .subrow grid-template-columns | `style="--cols:${tpl}"` / `var(--cols, …)` | ✓ WIRED | Actual tpl forwarded (ADR-2); custom-cols call sites align by construction |
| subtask-popovers.js toggleSub input | delegated action handler | `A.toggleSub` (actions.js:1103) | ✓ WIRED | Pre-existing contract unchanged; attrs byte-identical |
| subPop.subs compact:true call site | unchanged compact output | no columns opt | ✓ WIRED | Regression pinned (test:285-289) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-71 renderer pins pass | `node --test test/i18n-core-features.test.mjs` | 19 pass / 0 fail | ✓ PASS |
| Delegated toggleSub handler exists | grep `A.toggleSub` src/actions/actions.js | line 1103 | ✓ PASS |

Note: the 5 pins are source-template contract assertions (Vite virtual module prevents runtime import — documented deviation in 71-01-SUMMARY). Grid alignment is asserted nowhere and is in fact broken (Truth 1); 71-VALIDATION.md already marks visual alignment as manual-only.

### Requirements Coverage

REQ-71-* IDs do not appear in `.planning/REQUIREMENTS.md` (ROADMAP.md states "Requirements: TBD — coverage derived from D-71-1…D-71-7"). Coverage was assessed against the 7 CONTEXT decisions, all of which map to verified code + pins except D-71-1 (failed — Truth 1). No orphaned requirements: REQUIREMENTS.md contains no phase-71 entries at all; recommend back-filling the REQ-71 IDs in REQUIREMENTS.md or recording the derive-from-decisions ruling.

| Decision | Source | Status | Evidence |
| -------- | ------ | ------ | -------- |
| D-71-1 columns aligned | 71-CONTEXT.md | ✗ BLOCKED | CR-01 gap:8px + WR-02 indent-on-container (Truth 1) |
| D-71-2 status chip editable | 71-CONTEXT.md | ✓ SATISFIED | columns branch + A.toggleSub wiring + pin |
| D-71-3 own assignees | 71-CONTEXT.md | ✓ SATISFIED | avStack(s.assignees…) + unassigned pin |
| D-71-4 inherited priority | 71-CONTEXT.md | ✓ SATISFIED | prPill(task0.priority) + .inh + pin |
| D-71-5 due inheritance | 71-CONTEXT.md | ✓ SATISFIED | verbatim expression + tooltip/.over pin |
| D-71-6 shared renderer opt-in | 71-CONTEXT.md | ✓ SATISFIED | opt.columns branch; board consumer untouched + pin |
| D-71-7 interaction contract | 71-CONTEXT.md | ✓ SATISFIED | no data-a on meta cells + pin |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/styles/views/list.css | 137 | legacy flex `gap: 8px` kept on converted grid (parent uses gap: 0) | 🛑 Blocker (CR-01, open in disposition ledger) | Column alignment — the phase goal — arithmetically broken |
| src/styles/views/list.css | 143 | `--ind` padding on grid container shifts whole track sequence | ⚠️ Warning (WR-02, open) | Nested subrow meta cells misalign with depth-0 rows and header |
| src/styles/views/list.css | 174-179 | visually-hidden checkbox, no :focus-visible on .stchip | ⚠️ Warning (WR-01, open) | WCAG 2.4.7 keyboard focus indicator lost |
| src/styles/views/list.css | 135 | CSS fallback hand-duplicates LCOLS constants | ℹ️ Info (IN-01, open) | Silent drift risk |

All 4 review findings remain `open` in 71-REVIEW-DISPOSITION.md; CR-01 is a direct gap against the phase goal and is NOT deferred — no later phase in the milestone covers it.

### Human Verification Required

None beyond what the fix round will need — after CR-01/WR-02 are fixed, visual alignment (71-VALIDATION.md Manual-Only row: subrow cells land under parent columns at nesting depth ≥ 2) should be checked by the user in a running List view.

### Gaps Summary

The phase's plumbing is done well: the opt-in `columns` branch, actual-tpl forwarding, status chip, inheritance rules, board-popover regression pin, i18n/chunk/lint gates are all real and pinned. But the one thing the phase exists to deliver — cells **aligned** under the parent grid columns — does not hold: the converted `.subrow` grid kept `gap: 8px` against the parent's `gap: 0` (CR-01, ~56–64px drift on every meta cell after the title track), and the tree indent rides as `padding-left` on the grid container (WR-02), compounding misalignment for nested rows. One focused CSS fix round closes both.

---

_Verified: 2026-11-17_
_Verifier: the agent (gsd-verifier)_
