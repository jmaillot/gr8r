---
phase: 71-subtask-columns-in-list-view
plan: 02
subsystem: ui-list-view
tags: [gap-closure, grid-alignment, a11y-focus, css-contract-pins]
requires:
  - 71-01 subrow grid plumbing (verified, untouched)
provides:
  - subrow grid aligned with parent rows (gap: 0) — D-71-1 closed
  - tree indent on the grid item, not the container (WR-02 closed)
  - .stchip keyboard focus ring (WR-01 closed, WCAG 2.4.7)
  - LCOLS keep-in-sync drift note on the --cols fallback (IN-01 mitigated)
affects: []
tech-stack:
  added: []
  patterns: [indent-on-grid-item, focus-within ring on visually-hidden checkbox]
key-files:
  created: []
  modified:
    - src/styles/views/list.css
    - test/i18n-core-features.test.mjs
    - .planning/phases/71-subtask-columns-in-list-view/71-REVIEW-DISPOSITION.md
decisions:
  - "Indent mechanism: fixed 64px base stays on the container; --ind rides .subrow > .subhead as margin-left — an inline padding-left would REPLACE the base, and indenting the container shifts the whole track sequence (WR-02)"
  - "IN-01 dispositioned mitigated-by-documentation: fallback template kept (unstyled-row guard) with a keep-in-sync comment naming LCOLS as the single source of truth"
  - "Focus indicator uses :focus-within on the chip label, not :focus-visible on the 1px/opacity:0 input — the reliable selector when the input is visually hidden"
metrics:
  duration: ~35 min
  completed: 2026-11-17
status: complete
commits: 3
plan_head_before: 6c250f5f1c2a5eb9ef8e4edc0c57700a83c72dd2
plan_head_after: 6403a1819e1942ca7d0c48c9eb5d09e6901c2ab
actuals:
  tokens: 18000
  tasks: 2
  commits: 3
---

# Phase 71 Plan 02: Gap closure — subrow alignment + open review warnings Summary

Subrow grids now share the parent rows' zero inter-track gap with the tree indent riding the head item, closing the phase's one failed truth (D-71-1), plus a keyboard focus ring on the status chip and an LCOLS drift note.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | CR-01 gap:0 + WR-02 indent-on-item + WR-01 focus ring + IN-01 drift note | 38810b1 | src/styles/views/list.css |
| 2 | 4 alignment-contract source pins + standing gates | 9e3c57f | test/i18n-core-features.test.mjs |
| — | Review disposition ledger updated (3 fixed, 1 mitigated) | 6403a18 | 71-REVIEW-DISPOSITION.md |

## What Was Built

- **`src/styles/views/list.css`**: `.subrow` `gap: 8px → 0` matching `.thead`/`.trow` (CR-01); tree indent moved off the grid container — fixed `padding-left: 64px` base, `--ind` rides `.subrow > .subhead` as `margin-left: var(--ind, 0px)` so the 4 meta cells stay pinned to tracks 4–7 at any depth (WR-02); `.stchip:focus-within` outline `2px solid var(--accent)` restores the keyboard focus indicator lost to the visually-hidden checkbox (WR-01, WCAG 2.4.7); the `--cols` fallback comment now names `LCOLS` in `src/components/task-list.js` as the sync source (IN-01).
- **`test/i18n-core-features.test.mjs`**: 4 new source-contract pins (same approach as the 71-01 pins — Vite virtual modules block runtime import): subrow gap contract, indent-on-item placement, focus-ring rule, LCOLS sync-note presence. All 19 existing 71-01 pins and the board-popover regression pin untouched and passing.
- **`71-REVIEW-DISPOSITION.md`**: CR-01/WR-01/WR-02 → `fixed`, IN-01 → `mitigated` (mitigated-by-documentation), sources referencing the 71-02 mechanisms.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] IN-01 pin sliced the wrong `grid-template-columns` occurrence**
- **Found during:** Task 2
- **Issue:** `LIST_CSS.indexOf('grid-template-columns')` matched `.thead`'s rule (line 11), before `.subrow` — the slice was empty and the pin failed on first run.
- **Fix:** Used `lastIndexOf` so the slice stays inside the `.subrow` block.
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 9e3c57f

**2. [Rule 3 - Blocking] Plan's `grep -c "gap: 8px"` baseline was 3, actual file has 4 legitimate occurrences**
- **Found during:** Task 1 verify
- **Issue:** The verify asserted exactly 3 `gap: 8px` occurrences (.grp, .subhead, .addrow) but `.trow .ttl` (list.css:75) also legitimately carries one.
- **Fix:** Kept the real invariant — the `.subrow` block no longer contains `gap: 8px` (grep count stays 4, all outside `.subrow`); documented here instead of touching the out-of-scope `.ttl` rule.
- **Files modified:** none (verify-baseline correction only)

## Gate Results

- `npm test`: **1735 pass / 1748 total**, 0 fail (grow-only from 1731/1744 — +4 pins)
- `npm run lint`: **exactly 15** pre-existing problems, none new
- Chunk gate: green via npm test (no source chunks changed)
- i18n catalogue gate: untouched at 1944 keys; `node --test test/i18n-core-features.test.mjs` 23/23 pass
- Zero new dependencies; no renderer or task-list edits (71-01 plumbing untouched)

## Known Stubs

None.

## Verification Notes

- Manual/visual check from 71-VALIDATION.md (subrow cells under parent columns at nesting depth ≥ 2 in a running List view) remains for phase UAT — the CSS contract is now pinned by test, so only the visual confirmation is manual.
- Board card popover output unchanged (regression pin passing) — verified 71-01 plumbing not re-touched.

## Self-Check: PASSED

- Commits 38810b1, 9e3c57f, 6403a18 exist on main above the ledger base 6c250f5
- SUMMARY measured: 3 commits via `git rev-list --count 6c250f5..HEAD`
