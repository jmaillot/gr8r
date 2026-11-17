---
phase: 70
plan: 03
subsystem: export
tags: [xlsx, board, gap-closure, tdd]
requires: [70-01, 70-02]
provides: [board-start-column]
affects: [export-xlsx]
tech-stack:
  added: []
  patterns: [utcDate + SHORT_DATE_CODE skip-when-empty date cell, same as due]
key-files:
  created: []
  modified:
    - src/export/model.js
    - export/xlsx.js
    - test/export-model.test.mjs
    - test/export-xlsx.test.mjs
decisions:
  - "Board start cell reuses the exact due-cell writer pattern (utcDate + SHORT_DATE_CODE, skipped when empty) — one column earlier, no new serialization path (T-70-04 mitigated)."
  - "initSheet keys array for Board also gains 'start' so header/filter metadata matches headers.board."
metrics:
  duration: "~25 min"
  completed: 2026-11-17
status: complete
actuals:
  tokens: 2415
  tasks: 2
  commits: 2
---

# Phase 70 Plan 03: Board start column (G-3) Summary

Board cards on the xlsx Board sheet now carry their start date as a real short-date cell in column G — parents and child cards alike — with due shifted to H and progress to I.

## What Was Done

- **TDD RED first** (commit 6f118f6): rewrote the Board pins — headers.board deepEqual gained `T:export.col.start` before `T:export.col.due` (test/export-model.test.mjs:519); the dated-due pin moved G→H, the progress pin H→I (test/export-xlsx.test.mjs); NEW pin asserts a dated card's start serial appears in column G of sheet3.xml under numFmtId 14; the lane/card-fields test gained a G start serial check. RED confirmed: 4 failing pins (93/97).
- **GREEN** (commit bb51726): src/export/model.js — headers.board gains 'start' before 'due' (:440), card projection gains `start: r.start` after priorityLabel. Child cards inherit the parent start via the existing `s.start || t.start || ''` at model.js:226 — zero new logic. export/xlsx.js — Board card block writes start via the exact due pattern (utcDate + SHORT_DATE_CODE, skipped when empty) in column 7, due renumbered to 8, progress to 9; lane rows (cols 1-2) untouched; initSheet keys array updated to match.
- **Gates (Task 2)**: targeted channels (model/xlsx/gantt) 124/124; `npm test` 1726 pass / 1739 total (grow-only over 70-02's 1725/1738 — +1 new start pin); `npm run lint` exactly 15 errors; entry chunk 499.94 kB (≤500000); `git diff package.json package-lock.json` empty; test/export-mspdi.test.mjs and test/export-csv.test.mjs byte-identical; scope audit shows the diff confined to model.js, export/xlsx.js and the two test files — gantt.js/mspdi.js/csv.js untouched (G-1 368e35f and G-2 c63017a fixes preserved).

## Deviations from Plan

- [Rule 3 - Blocking] The exporter-authored-string walker test (test/export-model.test.mjs:534) would have failed on the new ISO `start` field on board cards; extended the existing ISO-date skip from `k === 'date'` to `k === 'date' || k === 'start'`. One line, same contract as dates.
- [Rule 3 - Blocking] The plan's read_first omitted the Board `initSheet` keys array (export/xlsx.js:415), which must mirror headers.board; added 'start' there too.

## Commits

- 6f118f6: test(70-03): RED — Board start-column pins (G-3) rewritten before the fix
- bb51726: fix(70-03): Board cards gain a start date column (G-3)

## Test Counts

- test/export-model.test.mjs + test/export-xlsx.test.mjs: 97/97 pass (was 93/97 RED)
- Targeted (model, xlsx, gantt): 124/124
- Full suite: 1726 pass / 1739 total / 0 fail / 13 skipped (baseline 1725/1738 — grow-only respected)
- Lint: 15 errors (baseline); build chunk 499.94 kB; zero dependency changes

## Known Stubs

None — no stubs, placeholders, or skipped tests introduced.
