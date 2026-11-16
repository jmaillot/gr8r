---
phase: 68
plan: 03
subsystem: views (mobile card render) + responsive css + e2e
tags: [pol-01, mcard, hidden-view-state, cols-popover, mobile-e2e]
requires: [TCOLS (table.js:12-26), v.hidden view state (VIEW_BLOB_KEYS server.js:1762), toggleCol2 action, mobile-tasks-table.spec.mjs conventions]
provides: [hidden[]-driven .mcard render (priority/due/estimate/progress), cols popover usable ≤900px, e2e/mobile-card-hidden.spec.mjs]
affects: [68-04 (full e2e non-regression gate)]
tech-stack:
  added: []
  patterns: [render-time hidden[] filter keyed on TCOLS ids, context-viewport e2e at 390×844/899px]
key-files:
  created:
    - e2e/mobile-card-hidden.spec.mjs
  modified:
    - src/styles/responsive.css
    - src/views/table.js
    - e2e/mobile-tasks-table.spec.mjs
decisions:
  - D-02 applied verbatim: the [data-pop='cols'] display:none rule deleted from the ≤900px band; Phase 64 comment extended, not replaced
  - D-01 exemption implemented structurally: the .mch row (status/title/key) and the assignee stack/name are outside every hidden[] gate — impossible to hide by construction
  - Card field ids verified against TCOLS at read time (A1): priority/due/estimate/progress — all match the assumed ids; no mapping mismatch
  - A3 verified before editing: mobile-tasks-table.spec.mjs:146 asserted the popover toBeHidden at 899px; inverted to toBeVisible with a D-02 comment (the one deliberate contract change; no assertion weakened)
metrics:
  duration: ~35min
  completed: 2026-11-16
status: complete
actuals:
  tokens: 35000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 9825223
plan_head_after: 66d7911
---

# Phase 68 Plan 03: Mobile Card × hidden[] (POL-01) Summary

**One-liner:** The mobile card stack (.mcard, ≤900px) now renders priority/due/estimate/progress as a pure function of the existing hidden[] view state — driven by the re-enabled cols popover — with status/title/key/assignees structurally exempt (minimum identity), proven by a dedicated 390×844 e2e.

## What Was Done

- **Task 1 (tracer, commit 6da42b3):** Deleted the `[data-pop='cols'] { display: none !important; }` rule from the ≤900px band of responsive.css (D-02), appending one comment line to the Phase 64 block (68-01's `.page.flush .toolbar` rule untouched). In tableHtml's `.mcard` render, gated the priority pill on `v.hidden.includes('priority')` (render-time filter, Pattern 2); `.mch` row and assignees left unconditional (D-01). New `e2e/mobile-card-hidden.spec.mjs`: 390×844 context-viewport spec proving the popover opens, the priority toggle hides/shows the card field, and minimum identity survives.
- **Task 2 (commit 4790996):** Extended the spec with the full toggle matrix — due/estimate/progress each hidden and re-shown via the popover, plus a no-equivalent (labels) toggle asserting the card is unchanged and error-free (D-03); D-01 minimum identity asserted after every combination.
- **Task 3 (commit 66d7911):** A3 verify-first: grep confirmed `mobile-tasks-table.spec.mjs:146` asserted the popover `toBeHidden()` at 899px. Inverted to `toBeVisible()` with the D-02 rationale in the comment and header — the deliberate contract change, not a weakening. All other assertions untouched. Both mobile specs green (5 passed).

## Assumption Verification

- **A1:** TCOLS ids read directly (table.js:12-26): `priority`, `due`, `estimate`, `progress` — exactly the assumed ids; the progress card field maps to TCOLS `progress`. No mismatch to record.
- **A3:** Confirmed — the existing spec did assert popover hiddenness at 899px (line 146); updated in Task 3 as planned.

## Deviations from Plan

- **[Task-1 slice overshoot, Rule 3-adjacent]:** the plan scoped Task 1's code change to the priority field only (due/estimate/progress in Task 2); the edit gated all four fields at once. Task 2's tdd="true" RED phase was therefore unobservable — its tests were written against already-green code and prove the matrix rather than drive the implementation. No behavioral gap: the filter is a pure render-time read of `v.hidden`, uniform across fields.
- **[Environment, Rule 3]:** the first e2e run failed on a stale `dist/` build (the e2e server serves the built app and refuse-stale is fail-closed); fixed by `npm run build` — no code change, noted because it masked the CSS fix during initial verification.

## Known Stubs

None.

## Threat Flags

None — client-side render-time filtering over the existing persisted view state; no new endpoints, state, or trust boundaries (T-68-06 unchanged: hidden[] crosses the server only through the existing VIEW_BLOB_KEYS contract).

## Verification

- `npx playwright test --config e2e/playwright.config.mjs e2e/mobile-card-hidden.spec.mjs e2e/mobile-tasks-table.spec.mjs` → 5 passed / 0 failed (at 390×844 and 899px)
- Full `npm run e2e` regression is Plan 68-04's gate, per plan verification.

## Self-Check: PASSED

Commits 6da42b3 / 4790996 / 66d7911 verified in git log; e2e/mobile-card-hidden.spec.mjs exists; measured commits 9825223..66d7911 = 3.
