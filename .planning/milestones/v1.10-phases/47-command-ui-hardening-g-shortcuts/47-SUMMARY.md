---
phase: 47-command-ui-hardening-g-shortcuts
status: complete
retrospective: true
branch_delivery: fix/commands merged to main
merge_commit: 62b1826
uat_commit: 5fe7f67
completed: 2026-11-07
---

# Phase 47 SUMMARY — Command/UI hardening: fix/commands intake

> **Retrospective artifact.** Phase 47 was an intake phase for fixes produced in the `fix/commands` worktree; the work merged to main (62b1826) without the standard plan→execute artifact chain. This SUMMARY was written after the fact for the v1.10 milestone close, from git history and tests. Scope and success criteria are recorded in `.planning/ROADMAP.md` (archived at `milestones/v1.10-ROADMAP.md`).

## One-Liner

Two-letter G navigation shortcuts now work in the command palette, each fix carried with a regression test.

## What Was Built

- **G-shortcut combos in the palette** (62b1826):
  - `src/actions/keyboard.js` — shared `gPending` G-nav map (GO_MAP extracted); "G then \<key\>" combos work while the palette is open; "g" still types normally and is only reverted when the next key completes a combo, then the palette closes and navigates
  - `src/overlays/palette.js` — query-typing guard plus command-filter matching on initials across words ("gh" finds "Go to Home") via compacted + subsequence comparison on top of the plain substring match
- **Regression tests** — `test/i18n-actions-modules.test.mjs` updated to the new literal (9 top-level tests / 13 counted by `node --test`, all passing); `test/palette-filter.test.mjs` (added at gap closure, 2026-11-07) behaviorally pins the compact+subsequence filter contract — 7 tests

## Test Evidence

- `test/i18n-actions-modules.test.mjs` — 9 top-level tests / 13 counted by `node --test`, all passing (includes the anchor test for the GO_MAP literal)
- `test/palette-filter.test.mjs` — 7/7 behavioral tests on the palette filter helpers (compactQuery/isSubseq in core/utils.js, the exact comparison palette.js uses)
- G-then-key combo path (timing-dependent keydown state machine inside the keyboard handler, no headless harness): behavioral evidence is the recorded UAT at commit 5fe7f67 — G shortcuts exercised in the palette and confirmed working
- Full suite green on main at milestone close: 1126 tests, 1112 pass, 0 fail, 14 skipped (verified 2026-11-07)

## UAT

G-shortcuts UAT passed (commit 5fe7f67, "UAT passed for Phases 46 (MCP 5/5) and 47 (G shortcuts)").

## Requirements

- FIX-01 ✓ — two-letter G shortcuts in the command palette (shared `gPending` G-nav map, palette query-typing guard), regression test carried, full suite green, merged at 62b1826

## Commits

- 62b1826 — fix(palette): make two-letter G shortcuts work in the command menu

## Technical Debt / Notes

- None known at close.
