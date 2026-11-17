# Current Export Implementation Survey — Multi-Level Subtask Tree

**Scope:** v2.6 (Test 11). What each format emits TODAY for a 3-level tree (task → subtask → sub-subtask).
**Researched:** 2026-11-17
**Confidence:** HIGH (code read directly; line refs below)

## Files

| File | Role |
|------|------|
| `src/export/model.js` | Shared DOM-free export model (`buildExportModel`); rows are a DFS walk with `depth`, `parent`, per-level `key` (PARENT.1.2) |
| `export/mspdi.js` | Server-only MSPDI serializer (`buildMspdi`) |
| `export/xlsx.js` | Server-only workbook writer (`buildWorkbook`, @office-kit/xlsx) |
| `src/export/csv.js` | Dependency-free CSV writer (`toCsv`) — static build |
| `test/export-mspdi.test.mjs` | Already pins OutlineLevel between Type and Start; 65-05 test pins OutlineLevel=depth+1 and nested Summary flags |
| `test/export-model.test.mjs` | Pins DFS row order, per-level keys, nested parent ids and depth |
| `test/make-export-samples.mjs` | Sample generator (existing tooling) |

## Row contract from the model (3-level tree)

For task `T` with subtasks `S1` (children `S1a, S1b`) and `S2`:

- Row order: DFS — `T, S1, S1a, S1b, S2` (position, then arrayIndex; model.js:201–251).
- `depth`: task rows −1 semantics via absence; root subtask rows 0; S1a/S1b depth 1.
- `key`: `T`, `T.1`, `T.1.1`, `T.1.2`, `T.2`.
- `parent`: task id for depth 0; the parent SUBTASK's id for depth ≥ 1 (model.js:239–247).
- Dates per subtask row: `start = s.start || t.start || ''` — own start or the **top-level task's** start; `due = t.due` **always** (model.js:226–227). Comment claims "parent's" but the code uses the top-level task `t`, not the immediate parent subtask — for a 3-level tree, `S1a` inherits `T`'s due, not `S1`'s. Since parent rows never carry their own due in the data model, output is consistent, but the comment is imprecise (fact, not defect).
- Subtask rows: `progress` 0/100 from done; `estimate` ''; `deps` []; status todo/done only.

## MSPDI output (export/mspdi.js)

- **OutlineLevel** (mspdi.js:300): nested rows emit `<OutlineLevel>{depth+1}</OutlineLevel>` → S1=1, S1a=2, S1b=2, S2=1. Top-level task rows emit **nothing** (Project default 1). Placed between `Type` and `Start` (canonical order puts it after OutlineNumber/before Priority — see MSPDI-SPEC.md verification point).
- **Summary** (mspdi.js:214–219): positional adjacency — a row is Summary=1 iff the next row's depth is exactly one deeper. For the tree above: T, S1 are Summary=1; S1a/S1b/S2 = 0. Works at any depth. Dated rows are also manual (`<Manual>1</Manual>` + Manual* elements), so summary dates do NOT roll up.
- **Dates**: no-Z `YYYY-MM-DDThh:mm:ss`; start 08:00:00, finish 17:00:00; subtask rows inherit T's dates → all rows in the subtree carry identical Start/Finish. SNET constraint only when the row has its own start. Duration: dated span (working days × 480) beats estimate; undated rows get 0.
- **UID/ID**: sequential per row; only top-level rows enter the id→UID map (CR-01) and only top-level rows emit Assignments.
- Deps: one finish-to-start PredecessorLink per resolvable top-level dep; subtask rows have none.
- Milestones excluded; Resources/Assignments over top-level rows only.
- Document is positional, ordered template strings; CalendarUID 1 unconditional.

**Gap candidates vs. spec (facts to verify in Test 11, not fixes to pre-apply):**
1. OutlineLevel element ORDER inside Task deviates from the canonical example (verified OK at level 1 by human check; never verified at level 2+).
2. Nested rows carry no `WBS`/`OutlineNumber` — Project should recompute; confirm no repair prompt.
3. Summary=1 + Manual=1 combination: confirm Project renders bold summaries with the manual dates kept (owner rule: parent end = its due).
4. All subtree rows share identical Start/Finish — confirm Project accepts manual rows that don't nest under the summary's span.

## XLSX output (export/xlsx.js)

- Tasks sheet (writeTaskRow, xlsx.js:309–341): one row per model row, DFS order; hierarchy signal = **cell-style indent on the title, fixed at 1 level for EVERY child row** (`indentCell(..., 1)` when `r.parent` — xlsx.js:336). A depth-1 (3rd-level) row indents the same as a depth-0 row — **indentation does not scale with depth** (fact/gap for 3-level readability).
- Parent titles bold; child titles not. Dates are real Date cells (UTC midnight) under builtin short-date numFmtId 14; progress raw 0–100 under `0"%"`.
- Subtask rows inherit T's due (real date) and s.start||t.start as start.
- No outline-level column, no WBS column beyond `key` (which encodes `T.1.1`).
- MS Project cannot open .xlsx directly (see VERIFICATION.md) — hierarchy must survive via Excel paste-with-indentation; style-based indent DOES survive paste into Project? Not reliably: Project paste reads **leading tab/indent characters in text**, not Excel cell-style indents. Style indent is a visual convention for Excel readers, not a Project import channel (fact, MEDIUM-HIGH — community knowledge).

## CSV output (src/export/csv.js)

- Flat semicolon rows, UTF-8 BOM, CRLF; columns from model.columns (key, title, status, priority, assignees, start, due, progress, labels, estimate + opt-ins).
- **Hierarchy signal: none explicit.** Row order is DFS; the only hierarchy evidence is the dotted `key` (`T.1.1`) and adjacency. No outline-level column, no indent prefix.
- Formula-injection guard prefixes `'` to any value starting with `=+-@` — note this mutates negative-looking values (fact, already accepted in Phase 54).
- MS Project's CSV Import Wizard maps named columns to task fields; it does **not** read an outline/indent channel from CSV. Users reconstruct hierarchy manually or paste tab-indented text.

## Summary of gaps by format (3-level tree)

| Format | Hierarchy channel | 3-level ready? | Notes |
|--------|-------------------|----------------|-------|
| MSPDI | OutlineLevel + Summary + order | Structurally yes | Element-order deviation + nested-level import unverified — Test 11's core question |
| XLSX | Style indent (fixed 1 level) + bold parents + dotted key | Partial | Indent doesn't grow with depth; style indent not a Project import channel |
| CSV | Dotted key + row order only | Lossy | No outline column; Project CSV import is flat |
