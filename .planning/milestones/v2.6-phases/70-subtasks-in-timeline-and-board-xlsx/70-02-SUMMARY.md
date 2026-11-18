---
phase: 70-subtasks-in-timeline-and-board-xlsx
plan: 02
subsystem: export
tags: [export, gap-closure, tdd, subtasks]
requires: [70-01]
provides: ["subtask due inheritance honoring a manually-set subtask due in ALL export channels (model-level)"]
affects: [xlsx, mspdi]
key-files:
  created: []
  modified: [src/export/model.js, test/export-model.test.mjs]
decisions:
  - "Owner rule 2026-11-17 (gap G-1): subtask due defaults to the parent task's due; a manually-set subtask due wins — supersedes the due clause of D-70-7 (2026-11-10 t.due-only contract)."
metrics:
  duration: ~15 min
  completed: 2026-11-17
status: complete
---

# Phase 70 Plan 02: G-1 Subtask Due Inheritance Gap Closure Summary

**One-liner:** one-line model fix (`due: s.due || t.due || ''`, exact mirror of the start inheritance on the previous line) + TDD pin rewrites so a manually-set subtask due wins in every export channel while due-less subtasks still inherit the top-level task due.

## What Shipped

- **src/export/model.js:227** — child-row emit changed from `due: t.due || ''` to `due: s.due || t.due || ''` (with an inline comment referencing G-1 / owner 2026-11-17). No other field touched; the id/statusId/order contract (D-55-5, D-70-1, CR-01) is byte-identical.
- **test/export-model.test.mjs**:
  - :99-104 comment + assertion message reworded to the superseded rule (inherited case kept green — fixture subtasks are due-less).
  - 69-01 test rewritten: keeps the four inherited assertions (MSP-13.1/.1.1/.1.2/.2 → `2026-03-20`) and adds a manual-override section (local doc, Sub A `due: '2026-03-12'` → own value wins; due-less Sub A.1/A.2/Sub B still inherit `2026-03-20`).
  - Two new tests: depth-0 override on the t_a9 shape (local doc; ALPHA-9.1 own due `2026-01-10`, sibling inherits `2026-01-14`) and the blank + undated-parent case (`due: ''` emitted → no gantt bar).
- Writers (gantt/xlsx/mspdi) consume `row.due` directly — zero writer changes needed.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `368e35f` | fix(70-02): subtask due inheritance honors the subtask's own due (G-1) |
| 2 | — | Gates-only verification, no file changes → nothing to commit |

## Test Counts

| Gate | Before | After | Gate |
|------|--------|-------|------|
| npm test | 1723 pass / 1736 total | **1725 pass / 1738 total** | grow-only ≥1723/1736 ✅ |
| export-model suite | 48 pass | 50 pass (2 new pins) | ✅ |
| model+gantt+xlsx targeted | — | 123 pass / 0 fail | ✅ |
| npm run lint | 15 errors | 15 errors | baseline ✅ |
| build entry chunk | 499.94 kB | 499.94 kB | ≤ 500000 ✅ |

## Frozen Files

`test/export-mspdi.test.mjs` and `test/export-csv.test.mjs`: **byte-identical** (`git diff --name-only` empty throughout, verified pre-fix, post-fix and post-commit). `package.json` / `package-lock.json` diff empty (zero new deps). The MSPDI child `<Finish>` pins survived because every fixture subtask carries no own due → `s.due || t.due` still resolves to `t.due` (Phase 69 "subtask end = parent end" criterion preserved).

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no stubs, placeholders or unwired data paths introduced.

## TDD Trail

RED confirmed before the fix: exactly the 2 new override tests failed (`2026-03-20` vs `2026-03-12`, `2026-01-14` vs `2026-01-10`) while all inherited-case pins stayed green; GREEN after the one-line model change.
