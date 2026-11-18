---
phase: 70-subtasks-in-timeline-and-board-xlsx
verified: 2026-11-17T12:00:00Z
status: passed
score: goal-backward, all D-70 criteria traced in live code; gaps G-1/G-2/G-3 closed and owner re-tested PASS
note: >
  Frontmatter added at milestone close (v2.6): the report existed since 2026-11-17
  but lacked machine-readable status. Evidence cross-checked by
  .planning/v2.6-MILESTONE-AUDIT.md (status: passed, gates re-run during audit).
---

# Phase 70 Verification: Subtasks in Timeline and Board XLSX

**Verified:** 2026-11-17 (goal-backward, live codebase)
**Verdict: VERIFIED**

## Goal

Subtask rows appear in the XLSX Timeline (indented, parent-grouped DFS bars, per-bar status) and Board (flat cards in status lanes) per D-70-1..D-70-7, with zero changes to CSV/MSPDI, the Tasks sheet, or the server route.

## Per-Criterion Findings

### 1. src/export/model.js — VERIFIED

- **Child rows carry `order`:** model.js:250 — `order: t.order ?? 0` in the child-row emit, with the D-70-1 comment block (lines 246-249).
- **Board lanes built from ALL rows:** model.js:379-389 — `rows.filter(r => r.statusId === id).sort((a,b) => ((a.order ?? 0) - (b.order ?? 0)) || plainCmp(String(a.key), String(b.key)))`. Cards are keyed by dotted `key` (line 385), never by row id; explicit CR-01 comment (373-381).
- **topRows-only consumers intact:** kpis/charts/members untouched — the regression-guard test exists (test/export-model.test.mjs, kpi/chart/member child-free guard) and the full model suite passes.

### 2. src/export/gantt.js — VERIFIED

- **T-54-15 filter lifted:** gantt.js:118-122 — `const all = model.rows;` with explanatory comment.
- **Per-bar fields:** gantt.js:136-146 — every dated bar carries `status: r.status`, `statusId`, `depth: r.depth ?? -1`, `indentLevels: (r.depth ?? -1) + 1` (depth+1 per D-70-3).
- **Parent-grouped DFS:** gantt.js:168-196 — parent bars sorted by existing `barCmp` (start, title, key); child bars grouped by depth-0 ancestor key (first dotted segment), each group sorted `plainCmp(key)` (lexicographic dotted-key = DFS order per A1), spliced after the parent; orphan child bars defensively appended in key order; `bars.forEach((b, i) => { b.row = i; })` — gapless ROW BASIS reassigned AFTER the splice.
- **Parent-only link map:** gantt.js:210 — `barByTaskId = new Map(bars.filter(b => b.indentLevels === 0)...)`; deps lookup skips child rows (gantt.js:213 — `&& !r.parent`).
- **SHAPE_CAP child-inclusive:** gantt.js:226 — `truncated = bars.length + links.length > SHAPE_CAP` — no change needed since `bars` now includes children (D-70-6, zero-code-change accounting, commented at 220-225).

### 3. export/xlsx.js — VERIFIED

- **statusLabelById removed:** grep finds zero occurrences of `statusLabelById` in export/xlsx.js; retirement documented at lines 196-203 (WR-01 landmine retired, not preserved).
- **Per-bar status:** line 206 — `setCell(ws, tableRow, 3, bar.status || '')`.
- **Real-depth indent + bold parents:** lines 209-215 — `if (bar.indentLevels > 0) indentCell(wb, getCell(ws, tableRow, 2), bar.indentLevels); else setBold(wb, getCell(ws, tableRow, 2), true);` — title cell only, A (key) and C (status) unstyled.
- **Tasks sheet unchanged:** line 348 — writeTaskRow still `indentCell(wb, getCell(ws, row, col), 1)` (fixed-1); the 69-01 comment block was reworded only (planned).
- **Board pass-through:** the Board loop remains a pure `model.board.lanes` consumer — zero code changes; flow verified by pins (criterion 4).

### 4. Tests — VERIFIED

- **WR-01 rewritten:** test/export-xlsx.test.mjs:861 — "WR-01 (rewritten, D-70-5): the Timeline status column reads the PER-BAR status — the id-keyed label map is retired".
- **69-01 Tasks-sheet pin preserved:** test/export-xlsx.test.mjs:1024 — "69-01: the 3-level tree renders on the Tasks sheet in DFS order with dotted keys and the pinned fixed-1 indent" — assertions intact (DFS order, dotted keys, fixed-1 indent); only the comment block notes Phase 70 enrichment of the Timeline.
- **Board pins updated/new:** :952 "Board child cards flow through the sheet — dotted-key rows in the right lane, counts include children"; :972 empty-lane-below-child-cards adjacency pin.
- **Real-depth indent pin:** :893 "Timeline child rows indent by REAL DEPTH (depth+1) under their parent in DFS order; parents bold, A/C unstyled".
- **Gantt pins:** test/export-gantt.test.mjs:268 (parent-grouped DFS, gapless rows, D-70-7/A1), :285 (per-bar status/depth/indentLevels), :309 (dep into subtask → no link; parent dep anchors parent bar rows — CR-01), :321 (399+1 draws, 400+1 truncates — D-70-6). Cap pins :232/:242 retained for subtask-free fixtures.

### 5. Gates (run by verifier) — VERIFIED

| Gate | Command | Result | Expected | Status |
|---|---|---|---|---|
| Full suite | `npm test` | **1722 pass / 1735 total**, 0 fail, 13 skipped | 1722/1735 | ✓ PASS |
| Lint | `npm run lint` | 15 errors, 0 warnings | exactly 15 errors | ✓ PASS |
| Frozen files | `git diff --name-only test/export-mspdi.test.mjs test/export-csv.test.mjs package.json package-lock.json` | empty | empty | ✓ PASS |

### 6. Commits — VERIFIED

All four commits exist in `git log` in dependency-consistent order:

- `411863b` feat(70-01): board lanes include child cards; child rows carry order (D-70-1, D-70-2)
- `7f187d0` feat(70-01): parent-grouped DFS bars with per-bar status/depth/indentLevels; parent-only link map (D-70-5..7)
- `3ee2dfb` feat(70-01): Timeline per-bar status + real-depth indent + parent bold; Board pass-through pins (D-70-3..5)
- `6a16178` docs(70-01): complete subtasks-in-timeline-and-board-xlsx plan (summary)

Ordering matches the implementation sequence (model → gantt → writer → docs); messages match the shipped scope. Working tree has only untracked planning/scratch files — no uncommitted phase code.

## Decision Compliance (D-70-1..D-70-7)

| Decision | Evidence | Status |
|---|---|---|
| D-70-1 flat child cards, dotted keys, counts = parents+children | model.js:379-389; xlsx test :952 | ✓ |
| D-70-2 own-status lane (done/todo) | model.js:381 (`r.statusId === id`); test :972 | ✓ |
| D-70-3 real-depth indent (depth+1), bold parents | gantt.js indentLevels; xlsx.js:214-215; test :893 | ✓ |
| D-70-4 child bars identical to parents at inherited dates | gantt.js dated map (same shape path); test :72 (xlsx D-70-4 pin) | ✓ |
| D-70-5 per-bar status, statusLabelById deleted | xlsx.js:206; grep: symbol gone; WR-01 rewrite at :861 | ✓ |
| D-70-6 SHAPE_CAP 400 strict, child-inclusive | gantt.js:226; test :321 | ✓ |
| D-70-7 parent-grouped DFS, gapless ROW BASIS | gantt.js:168-196; test :268 | ✓ |

## Gaps

None. All must-haves verified in live code with passing behavioral pins; all standing gates green; frozen files untouched; no new dependencies (package.json/package-lock.json diff empty).

**VERIFICATION COMPLETE — VERIFIED**
