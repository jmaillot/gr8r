# Phase 70: Subtasks in Timeline and Board XLSX - Research

**Researched:** 2026-11-17
**Domain:** XLSX export model/Gantt geometry/writer — subtask rows in Timeline + Board sheets
**Confidence:** HIGH (all claims read directly from source this session; no external packages involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-70-1..D-70-7, verbatim from 70-CONTEXT.md — research HOW, never whether)
- **D-70-1:** Subtasks are FLAT CARDS in the lanes — each subtask becomes its own card in the lane of its status (`done`/`todo` per the current model contract), carrying its dotted key (`ALPHA-9.1`) and its own fields. Lane counts include parents + children. The model change lives in `buildExportModel`'s board section (`model.board.lanes[].cards` gains child-row cards); the Board writer loop needs no structural change beyond what the model provides. Distinguish cards by dotted `key`, NEVER by row id (depth-0 child rows share the parent task's id — CR-01 landmine).
- **D-70-2:** Subtask status in lanes AND Timeline stays the current model contract: `done ? 'done' : 'todo'`. No hybrid, no parent-status inheritance.
- **D-70-3:** Child table rows indent by REAL DEPTH (`depth + 1` levels via `indentCell`, no bold) — NOT the pinned fixed-1 indent. This intentionally updates the 69-01 pin (`test/export-xlsx.test.mjs:906`). Parent rows stay bold, unindented.
- **D-70-4:** Child bars are visually IDENTICAL to parent bars (status-coloured, same shape/size).
- **D-70-5:** The Timeline status column must stop relying on `statusLabelById` (top-level-only map): the status comes per-bar from `buildGantt` (bars already carry `statusId`); the WR-01 pin is updated to the new per-bar contract. The WR-01 landmine is retired, not preserved.
- **D-70-6:** SHAPE_CAP stays 400 STRICT, child bars included in the count. Beyond the cap the sheet degrades to table + truncation note exactly as today.
- **D-70-7:** Bars are written PARENT-GROUPED: parents keep the existing sort (start, then title, then key); children follow their parent in DFS order (dotted-key order) immediately after it, at every depth. Table rows and drawing rows stay index-aligned (gapless `row` indexes, ROW BASIS contract).

### the agent's Discretion (from CONTEXT.md)
- Exact composite-sort implementation in `buildGantt` (pre-order walk vs comparator).
- Whether `buildGantt` filters undated children the same way as undated parents — follow the existing dated-row rule.
- Internal shape of `model.board.lanes[].cards` extension (flat merge vs per-card children array).

### Deferred Ideas (OUT OF SCOPE)
- MSPDI/CSV writers (CSV stays flat by design — `src/export/csv.js:13-31` iterates `model.rows` verbatim, no `parent` filtering, so the model change cannot affect it).
- Dependency links between subtasks (child rows carry `deps: []` by model contract).
- Subtask milestones, new export options, UI changes to the export modal.
</user_constraints>

## Summary

The model already emits child rows (Phase 65/69 DFS contract: dotted `key`, `parent`, `depth`, inherited dates, `done/todo` statusId) into `model.rows`, and the server already passes `body.options` — including `subtasks` — straight to `buildExportModel` (`server.js:7391-7398`) and `buildWorkbook` (`server.js:7377`). Three downstream surfaces deliberately exclude those child rows today: `buildGantt` filters `!r.parent` (`src/export/gantt.js:120`), the Timeline's `statusLabelById` map is built from top-level rows only (`export/xlsx.js:198`), and board lanes are built from `topRows` (`src/export/model.js:371`). Phase 70 lifts all three exclusions, adds a parent-grouped DFS bar order, real-depth indentation on the Timeline table, and per-bar status labels.

**Primary recommendation:** One plan, five tasks: (1) model — board lanes include child cards + child rows gain `order`; (2) gantt — parent-grouped DFS bars with `status`/`depth`/`indentLevels` carried per bar, link map keyed to parent bars; (3) writer — Timeline table/status/indent + Board pass-through; (4) test pin updates; (5) new pins (child bars, cap accounting with children, board child cards, empty-lane adjacency with children). Splitting model+gantt from writer+tests buys nothing: the writer change is ~15 lines and the test updates are inseparable from the observable contract.

<phase_requirements>
## Phase Requirements

ROADMAP Phase 70 has `Requirements: TBD` (.planning/ROADMAP.md:62-67); REQUIREMENTS.md carries REQ-EXP-01/02/03 + NFR-01/02/03 from Phase 69 (.planning/REQUIREMENTS.md:13,31,45,54-58). The standing gates apply: zero new deps (NFR-01), chunk ≤500000 bytes (NFR-02), regression safety for existing 2-level trees (NFR-03). This phase's own acceptance is defined by D-70-1..D-70-7.

| ID | Description | Research Support |
|----|-------------|------------------|
| D-70-1 | Board child cards | model.js:370-388 change + child `order` (§2.1) |
| D-70-2 | done/todo lane/status contract | already in model.js:221,240 — reused verbatim |
| D-70-3 | Real-depth indent | xlsx.js:336 pattern, `indentCell` levels from bar.depth (§4.1) |
| D-70-5 | Per-bar status | gantt bars carry `status` label (§3.2), xlsx.js:198 retired |
| D-70-6 | Cap 400 incl. children | gantt.js:190 unchanged in code; fixtures extended (§5) |
| D-70-7 | Parent-grouped DFS bars | pre-order walk design (§3.1) |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Child cards in lanes | `src/export/model.js` (buildExportModel) | — | Model owns composition (D-70-1: "the model change lives in buildExportModel's board section") |
| Parent-grouped DFS bars + per-bar status + cap accounting | `src/export/gantt.js` (buildGantt) | — | Geometry module owns row indexing and shape budget |
| Timeline indent + status column | `export/xlsx.js` (fillTimeline) | — | Writer owns cell styling (indentCell/setBold) |
| Board sheet rendering | `export/xlsx.js` (Board loop, 474-498) | — | Pass-through once the model emits child cards — no structural change |
| i18n | existing `translate` pipeline | — | D-70-2 reuses `task.status.done/todo`; no new keys |

## Standard Stack

No new packages. Everything uses existing modules: `@office-kit/xlsx/styles` (`indentCell`, `setBold` — `export/xlsx.js:36-39`), `buildGantt` (`export/xlsx.js:46`). **Package Legitimacy Audit: N/A — zero installs.**

## Architecture Patterns

```
buildExportModel (model.js)
  ├─ rows[]: parents + child rows (DFS, dotted keys)      [unchanged shape, +order on child rows]
  ├─ topRows: !r.parent                                    [kpis/charts/members — STAYS child-free, pinned]
  ├─ board.lanes[].cards: from rows (parents + children)   [CHANGED — D-70-1]
  └─ headers.timeline/labels.months                        [unchanged]
        │
        ▼
buildGantt (gantt.js)
  ├─ bars: parent-grouped DFS, each {taskId?, key, title, statusId, status, depth, indentLevels, start, due, row}
  ├─ links: parent deps only, barByTaskId from parent bars
  └─ truncated: bars + links > 400 (children counted — D-70-6)
        │
        ▼
fillTimeline (xlsx.js)          Board loop (xlsx.js)
  ├─ table: bar.key/title/status  ├─ lane rows (label+count)
  ├─ indentCell(bar.indentLevels) ├─ card rows C..H — unchanged code,
  ├─ bar shapes at bar.row        │  new data flows through
  └─ Today/freeze/viewport        └─ empty-lane adjacency preserved
```

## 1. Current-state facts (all verified by reading source this session)

### 1.1 Child-row contract — `src/export/model.js`
- Emission gate: `if (options.subtasks && Array.isArray(t.subtasks))` — **model.js:201**. Child rows exist in `model.rows` ONLY when opted in.
- Recursive `emit(parentId, parentKey, parentRowId, depth)` — **model.js:202-250**: kids gathered by `parentId` group, sorted `(position, arrayIndex)` (line 208), DFS.
- Child row fields — **model.js:218-246**:
  - `key`: `${parentKey}.${k + 1}` (line 217) — dotted, unique per row, per level (`PARENT.1.2`).
  - `parent`: parent ROW's id (task id for depth-0 roots, parent subtask id for nested) — line 244.
  - `depth`: 0 for root subtask rows — line 245. Top-level task rows have NO `depth` field (undefined).
  - `id`: **depth-0 rows reuse the task's `t.id`; nested rows use `s.id ?? ${t.id}${key}`** — line 239. Pinned at test/export-model.test.mjs:630-638 ('depth-0 rows keep the CR-01 contract'). **This is the CR-01 landmine: any id-keyed map over rows collides.**
  - `statusId`: `done ? 'done' : 'todo'` — line 240; `status` label same rule — line 221 (D-70-2 contract, already in place).
  - **Dates — model.js:226-227**: `start: s.start || t.start || ''` (own start, falls back to top-level task start), `due: t.due || ''` — **always the TOP-LEVEL task's due**, never the immediate parent's or the subtask's own. Pinned at test/export-model.test.mjs:620-626 (all of `MSP-13.1`, `.1.1`, `.1.2`, `.2` carry `2026-03-20`) and :102-103.
  - `progress`: `done ? 100 : 0` — line 228. `deps: []` — line 242. `priorityId: 'none'` — line 241.
  - **No `order` field on child rows** (lines 218-246) — relevant to Board card sorting (§2.1).
- `topRows = rows.filter(r => !r.parent)` — **model.js:254**. KPIs (298-302, 450), charts (311-334), members (394-408) all derive from `topRows` — **pinned child-free** at test/export-model.test.mjs:167-169 (kpis) and :363-375 (charts). **These must NOT change.**

### 1.2 Board lanes — `src/export/model.js:370-389`
- `STATUS_IDS.map(id => ...)` — five lanes, locked order (line 370; `STATUS_IDS` line 32).
- Cards: `topRows.filter(r => r.statusId === id).sort((a,b) => ((a.order ?? 0) - (b.order ?? 0)) || plainCmp(String(a.key), String(b.key)))` — **lines 371-373**.
- Card shape: `{ key, title, assigneeName, priorityLabel, due, progress }` — lines 374-381. Lane: `{ id, label: translate('task.status.' + id), count: cards.length, cards }` — lines 382-388. An empty lane exists with count 0.
- Sort pin: 'board lanes are exactly the five ids in order, counts match, cards sort by order' — test/export-model.test.mjs:414-424; empty lane — :426-438.

### 1.3 buildGantt — `src/export/gantt.js`
- **ROW BASIS contract — gantt.js:14-19**: `row` on a bar/milestone is the 0-based TABLE index in drawing order; the writer writes the entry at sheet row `row + 2` and anchors drawings at marker rows `row + 1`/`row + 2`. The writer's table loop (xlsx.js:199-205) starts at `tableRow = 3` and consumes bars in `gantt.bars` order — **the two must stay gapless and index-aligned**.
- **Child exclusion — gantt.js:120**: `const top = model.rows.filter(r => !r.parent);` (T-54-15 comment at 117-119: "the Gantt must not re-add a row"). This is the line to lift.
- Dated rule — gantt.js:125-134: `dated = top.filter(r => r.due)`; bar start = `r.start && r.start <= r.due ? r.start : r.due`. **Undated children**: the model guarantees non-blank dates ONLY when the top-level task itself is dated (inheritance from `t`); a task with no `due` yields child rows with `due: ''` (model.js:227) → they fail `filter(r => r.due)` and draw no bar, exactly like an undated parent. **The existing dated-row rule already handles undated children correctly — no extra filter needed.**
- Bar sort — gantt.js:157-159: `[...dated].sort((a,b) => plainCmp(a.start, b.start) || plainCmp(a.title, b.title) || plainCmp(a.key, b.key)).map((b, i) => ({ ...b, row: i }))`.
- Milestones — gantt.js:164-167: rows continue after `bars.length` (gapless across the two arrays). **Milestones are excluded from the XLSX writer** (owner 2026-11-10, xlsx.js:50-51) — no Timeline diamonds; the milestone row indexes only matter for MSPDI, which reads `model.rows` directly, not buildGantt. **Untouched by this phase.**
- Links — gantt.js:175-184: `barByTaskId = new Map(bars.map(b => [b.taskId, b]))`; deps read via `model.rows.find(r => r.id === succ.taskId)?.deps` (line 178). **⚠ With child bars present, depth-0 child rows share the task's id, so (a) `barByTaskId` would be overwritten by child bars and (b) the deps lookup could hit a child row. Child rows carry `deps: []` and depth-0 child ids equal the parent's, so links would silently resolve to the WRONG bar row. Must be redesigned (§3.3).**
- SHAPE_CAP — gantt.js:27 (`export const SHAPE_CAP = 400`), applied at **line 190**: `truncated = bars.length + links.length > SHAPE_CAP` (inclusive at 400, 401 degrades). Milestone diamonds outside the budget (comment 186-189).

### 1.4 Writer — `export/xlsx.js` (repository ROOT, not under src/)
- `fillTimeline` — xlsx.js:149-268. Key lines:
  - `buildGantt(model)` — line 150.
  - Task-block header A..C from `model.headers.timeline` — line 157 (= `['key','title','status']` translated, model.js:430).
  - **`statusLabelById` — xlsx.js:198**: `new Map(model.rows.filter(r => !r.parent).map(r => [r.id, r.status]))`; WR-01 comment at 196-197 explains the top-level-only restriction. Status cell written at line 203: `statusLabelById.get(bar.taskId) || ''`. **D-70-5 retires this map.**
  - Table loop — xlsx.js:199-205: `tableRow = 3`; writes `bar.key` (A), `bar.title` (B), status (C) per bar; increments per bar. Note: today's loop writes NO styling on the Timeline table (no bold, no indent).
  - Shapes — xlsx.js:210-242: bars at `twoCell(..., bar.row + 2, ..., bar.row + 3, ...)` (line 215); connectors after (226-239); drawing only when `items.length` (240-242).
  - Truncation — xlsx.js:243-247: note at `lastTable + 2` (= 2 headers + N bars + 2).
  - Today column 253-258; freeze D3 + viewport 264-267 (`lastTable` bounds the Today fill range, line 255 — grows automatically with more table rows).
- Board loop — xlsx.js:474-498: per lane, lane row = A label (bold, line 479) + B count (480); then per card: C key, D title, E assigneeName, F priorityLabel, G due (date, `SHORT_DATE_CODE` 488-491), H progress (`LITERAL_PERCENT_CODE` 492-493). **Pure `model.board.lanes` consumer — once the model emits child cards, this loop needs ZERO changes.** Empty lane = label row only, next lane label directly below (pinned test/export-xlsx.test.mjs:492).
- `writeTaskRow` — xlsx.js:309-341 (Tasks sheet, reference pattern for indent): child rows `indentCell(wb, getCell(ws,row,col), 1)` keyed on `r.parent` (line 336); top-level titles `setBold(..., true)` (line 337). The 69-01 pin (test:906) freezes this as depth-blind fixed-1 — D-70-3 deliberately enriches the TIMELINE only; **the Tasks sheet indent must stay fixed-1** (no decision to change it; leave writeTaskRow untouched to keep NFR-03 regression safety).
- Five sheets locked order — xlsx.js:52 (`SHEET_NAMES`), 386-389.

### 1.5 Route / entry points (no work needed)
- `POST .../export` — server.js:7363+; `options: body.options` passed verbatim (7391-7398); `xlsx.write = model => buildWorkbook(model)` (7377). XLSX already runs with `subtasks:true` when the request opts in.
- Client modal toggles `S.ui.expOptions` (actions.js:1968 init to DEFAULT_OPTIONS; 2015 spread into the request).

## 2. Model change design (D-70-1) — `src/export/model.js`

### 2.1 Board cards from child rows
Replace `topRows` with all rows in the board section (lines 370-388), keeping the exact same per-lane shape:

```js
// model.js ~371: was .filter over topRows
const cards = rows
  .filter(r => r.statusId === id)
  .sort((a, b) => ((a.order ?? 0) - (b.order ?? 0)) || plainCmp(String(a.key), String(b.key)))
  .map(r => ({ key: r.key, title: r.title, assigneeName: r.assigneeName, priorityLabel: r.priority, due: r.due, progress: r.progress }));
```

**Required supporting change — child rows must carry `order`** (they lack it today, model.js:218-246): add `order: t.order ?? 0` to the child-row object (the parent task's order — the same value the parent row carries, model.js:171). Without it, every child sorts as `order ?? 0` = 0 and lands before all parents in a lane, breaking the "children follow their parent" reading. With the parent's order, the tiebreak `plainCmp(key)` gives `'ALPHA-9' < 'ALPHA-9.1'` (plain string comparison, model.js:271) → parent, then children in dotted-key (DFS) order. **Verify**: `'ALPHA-9' < 'ALPHA-9.1'` is true in plain codepoint comparison (prefix is smaller), and `'ALPHA-9.1' < 'ALPHA-9.2'`, `'ALPHA-9.1' < 'ALPHA-9.1.1'` likewise — dotted-key sort IS DFS order for children sharing a parent, and the `order`-first clause keeps different parents apart exactly as today. This is additive: the pinned model tests deep-equal only `[key, title, parent, depth, id]` (test/export-model.test.mjs:151-157) and `statusId`-based assertions, so a new field breaks nothing.

**Cards carry their own lane by `statusId`** — a done child of an in-progress parent lands in the `done` lane (D-70-2; fixture `t_a9` in test/fixtures/export-fixtures.mjs:164-193: 'Child one' done=true → done lane, 'Child two' done=false → todo lane while the parent sits in progress).

**Never key anything off `row.id`** — depth-0 child ids equal the task id (model.js:239). The card object has no id; lanes distinguish cards by dotted `key` (D-70-1).

### 2.2 What must NOT change (pinned)
- `topRows` definition and its consumers: kpis (model.js:450), summary.meta/kpis (288-303), charts tallies (311-366), openByMember (328-334), members (394-408) — pinned child-free at test/export-model.test.mjs:167/:363/:440-452.
- `headers.board` / `headers.timeline` — no new columns (model.js:425-431); the Board writer's C..H card columns already cover everything a child card needs.
- CSV (`src/export/csv.js:26-30` reads `model.rows` flat) and MSPDI (`export/mspdi.js` reads `model.rows`) — unaffected by adding `order` to child rows (MSPDI uses depth/parent/key, pinned by test/export-mspdi.test.mjs; adding a field is invisible to it).

## 3. Gantt change design (D-70-7, D-70-5, D-70-6) — `src/export/gantt.js`

### 3.1 Parent-grouped DFS bars (recommended: pre-order walk, not a flat comparator)
Replace gantt.js:120 (`const top = model.rows.filter(r => !r.parent);`) and the flat sort at 157-159 with:

1. Keep the `dated` mapping but over **all** rows (drop the `!r.parent` filter — child rows only exist when `options.subtasks` was on, so no guard needed; the filter at line 120 is the only exclusion).
2. Build the parent bars exactly as today (start, title, key sort — lines 157-158), each with `row: i`.
3. **Pre-order expansion**: walk the sorted parent bars; after each parent, splice in its descendants in dotted-key DFS order. Implementation (discretion area — recommended shape):

```js
// rows grouped by parent ROW id; depth-0 children have parent === task id
const kidsOf = new Map(); // parentId -> dated child bars, sorted by dotted key
for (const r of model.rows) {
  if (!r.parent || !r.due) continue;
  // ... same start/due normalization as dated parents (gantt.js:132)
}
// DFS: parent bar, then for each of its children (sorted by key), the child
// followed by ITS children (dotted-key order = DFS for a shared parent).
```

Because dotted keys are lexicographically DFS-ordered within a parent group (`P < P.1 < P.1.1 < P.1.2 < P.2`), a per-parent flat key sort reproduces DFS at every depth **without recursion** — simpler and matches D-70-7's observable contract. Collect children per top-level task id (group children by their depth-0 ancestor or by walking `parent` links), sort each group's bars by `plainCmp(key)`, and emit: parent, then its whole grouped subtree, then the next parent. Reassign `row` indexes 0..n-1 in emission order (gapless — ROW BASIS, gantt.js:14-19).

4. **Each bar carries** (extension of the `dated` map at gantt.js:127-134): `statusId` (already there, line 131), **`status: r.status`** (the row's translated label — model.js:154/221) for D-70-5, **`depth: r.depth ?? -1`** and **`indentLevels: (r.depth ?? -1) + 1`** (parents 0, root children 1, nested 2 — D-70-3's "depth + 1"). Parent rows have no `depth` field (undefined → -1 → 0 levels). Add `key`-based identity — bars are already keyed (`r.key || ''`, line 129); dotted keys are unique per row (model.js:217), so **key, never `taskId`, identifies a bar** once children exist.

### 3.2 Per-bar status (D-70-5)
Bars already carry `statusId` (gantt.js:131). Add `status: r.status` (the row's already-translated label from model.js:154/221) to the `dated` map so the writer needs no translation pipeline and no id-keyed lookup. `fillTimeline` then writes `bar.status` directly (§4.1) — the WR-01 landmine (id collision overwriting the label) is structurally retired.

### 3.3 Links must keep resolving to PARENT bars — the real trap
- gantt.js:175: `barByTaskId = new Map(bars.map(b => [b.taskId, b]))` — with child bars whose `taskId` equals the parent's (depth-0 children reuse `t.id`, model.js:239), **later child bars overwrite the parent's entry** and every connector into that task would anchor on the wrong row.
- gantt.js:178: `model.rows.find(r => r.id === succ.taskId)?.deps` — the first row with that id is the parent row (parents precede children in `model.rows`, model.js:184/218), so deps lookup happens to work today, but it is fragile.
- **Fix**: build `barByTaskId` from **parent bars only** (`bars.filter(b => b.indentLevels === 0)`), and look up deps via `model.rows.find(r => r.id === succ.taskId && !r.parent)?.deps || []`. Only parent bars can be link endpoints anyway: child rows carry `deps: []` (model.js:242) so a child successor generates no links, and a dep targeting a subtask id never resolves (out-of-scope dep → dropped, existing rule gantt.js:174-180). Link `predRow`/`succRow` values then always reference parent bar rows — valid because parents keep their own table rows in the new order.

### 3.4 Cap accounting (D-70-6)
Line 190 (`bars.length + links.length > SHAPE_CAP`) needs NO code change — `bars` now includes child bars, so children are counted automatically. Milestone diamonds stay outside the budget (they are excluded from the XLSX anyway, xlsx.js:50-51). The existing cap fixtures (`makeCapDoc`, `makeExactCapDoc`, `makeBenchmarkDoc` — test/fixtures/export-fixtures.mjs:624-711) build tasks with **no subtasks** and `ganttModel` (test/export-xlsx.test.mjs:604) passes no options → `subtasks:false` → their counts are unchanged. **New pins must pass `options: { subtasks: true }` with a subtasked fixture to lock the child-inclusive counting** (e.g. 399 parents + 1 child bar = 400 draws; 400 + 1 = 401 degrades).

### 3.5 Milestones
`milestones` rows (gantt.js:164-167) continue after `bars.length` — automatically gapless in the new order. Irrelevant to the XLSX (no diamonds) but keeps the MSPDI-independent contract intact; no change.

## 4. Writer change design — `export/xlsx.js`

### 4.1 fillTimeline (D-70-3, D-70-5)
1. **Delete `statusLabelById`** (xlsx.js:196-198) and write the status per bar: `setCell(ws, tableRow, 3, bar.status || '')` — label rides the bar (§3.2). Update the WR-01 comment.
2. **Table row styling** (xlsx.js:200-205 loop) — mirror the `writeTaskRow` pattern (309-341):
   - Child bar rows (`bar.indentLevels > 0`): `indentCell(wb, getCell(ws, tableRow, 2), bar.indentLevels)` on the TITLE cell — real depth, no bold (D-70-3).
   - Parent rows: `setBold(wb, getCell(ws, tableRow, 2), true)` (matches Tasks-sheet parent styling; D-70-3 "Parent rows stay bold, unindented").
   - Column A (`bar.key`) and C (status) stay unstyled — same as the Tasks sheet (indent/bold only ever touch title, xlsx.js:336-337).
   - `indentCell` accepts a level argument (used with literal `1` at xlsx.js:336); passing `bar.indentLevels` writes depth+1 levels for depth ≥ 0.
3. **Everything else is order-agnostic and needs no change**: shapes anchor on `bar.row` (215), the truncation note sits after `lastTable` (246), the Today fill spans `1..lastTable` (255), freeze/viewport unchanged. The loop already consumes bars in `gantt.bars` order — the new parent-grouped order flows through.

### 4.2 Board sheet
**Zero code changes** (D-70-1: "the Board writer loop needs no structural change"). Child cards flow through the existing xlsx.js:477-497 loop once the model emits them. Observable effects: `lane.count` includes children (model.js:385 — `cards.length`), child card rows shift subsequent lane labels down, empty-lane adjacency holds whenever the lane has no cards (child or parent).

### 4.3 Tasks sheet
Untouched. `writeTaskRow` keeps the pinned fixed-1 indent (xlsx.js:336) — the 69-01 pin at test:906 is updated only in its EXPECTED indent values for the **Timeline** assertions... correction: test:906 asserts the **Tasks** sheet (`sheet2.xml`) — those assertions keep passing unchanged (Tasks still fixed-1). D-70-3's pin update lands as **new Timeline assertions** plus the WR-01 rewrite; the Tasks-sheet 69-01 test survives as-is (its "NOT enriched" comment should be reworded to point at the Timeline being enriched in Phase 70, but its assertions are unchanged).

## 5. Test pins — exact list with old expectation → new expectation

### test/export-xlsx.test.mjs
| Line | Test | Current pin | Phase 70 disposition |
|------|------|-------------|----------------------|
| 861-875 | 'WR-01: the Timeline status column keeps the top-level row status — child rows never overwrite it (54-05 review)' | statusLabelById (top-level-only) reads parent status | **REWRITE (D-70-5)**: the same fixture (t_a9 + dates, subtasks:true) now asserts the status cell shows the per-bar status — for the parent bar, the PARENT row's status; add child-bar table rows asserting each child's own `done`/`todo` status and indented title. The old "child rows never overwrite it" rationale is retired. |
| 906-931 | '69-01: the 3-level tree renders on the Tasks sheet… pinned fixed-1 indent' | Tasks sheet (sheet2) indent=1 for every child row | **SURVIVES unchanged** (Tasks sheet untouched — §4.3). Reword only the comment block (892-898) that says "NOT enriched": the Timeline is now enriched, Tasks stays fixed-1. |
| 450-476 | 'Board lane rows appear in the locked order with the model counts, cards carry their fields (R7)' | uses `makeChartDoc` via `modelOf` (line 451) — check whether that fixture has subtasks; counts read from `model.board.lanes` so they auto-adapt | **VERIFY + extend**: add assertions that child cards (dotted keys) appear as their own rows under the right lane and that lane B counts equal parents+children. If `makeChartDoc` has no subtasks, add a subtasked-board fixture test. |
| 478-496 | 'the empty-lane fixture still shows its label with count 0 (R7 empty)' | `makeEmptyLaneDoc` has `subtasks: []` everywhere (fixtures:~535-620) → unchanged | **KEEP**; add a sibling case: an empty lane BELOW a lane that gained child cards still shows its label with count 0 and the next lane directly below (context Specifics bullet 3). |
| 118-145 | 'child rows carry a one-level cell-style indent… (D-54-9)' | Tasks sheet indent contract | KEEP (Tasks untouched). |
| 149-164 | 'parent task titles are bold; child titles are not' | Tasks sheet | KEEP (Tasks untouched). |
| 793-805 | 'above the shape cap…' | makeCapDoc(201,200)=401, no subtasks | KEEP numerically; the note-row arithmetic (line 798: `noteRow = 2 + 201 + 2`) holds because no child bars exist in that fixture. |
| 807-814 | 'exactly at the shape cap the sheet still draws' | 201+199=400 | KEEP. |
| 822-846 | 500-task benchmark | 900 shapes, note at A504 | KEEP (fixture subtask-free; benchmark model passes no options). |
| 848-859 | 'the exact-cap fixture draws all 400 shapes' | 380 bars + 20 links | KEEP. |
| 651-690, 692-699, 701-742, 744-767, 769-791 | Timeline geometry/shape/connector tests | ganttModel fixtures without subtasks | KEEP — bars for subtask-free docs sort exactly as today. |
| NEW | — | — | Add: (a) Timeline table shows child rows under their parent in DFS order with real-depth indent (1 / 2) via indentCell and bold parents; (b) child bars draw at their inherited dates and count toward SHAPE_CAP (399 parent+1 child = 400 draws; 401 degrades); (c) Board child cards per D-70-1 with lane counts including children. |

### test/export-gantt.test.mjs
| Line | Test | Disposition |
|------|------|-------------|
| 156-161 | 'bars sort by start then title, and the first bar is table index 0' | KEEP (subtask-free fixture; parents keep the sort). |
| 163-170 | 'milestones continue the table index after the bars' | KEEP (gapless continuation holds with children). |
| 190-197 | 'a dependency on an archived task produces no link (T-54-15)' | KEEP — add a companion: a dep into a subtask id produces no link, and a dep between parents still resolves to the PARENT bar row when child bars exist (§3.3 regression pin). |
| 232-240 | 'the shape cap is inclusive at 400 and truncates at 401 (R13)' | KEEP; add child-inclusive variants per §3.4. |
| NEW | — | Parent-grouped DFS ordering pin: sorted parents, each followed immediately by its dotted-key-ordered subtree at every depth, gapless `row` indexes; per-bar `status`/`indentLevels` present. |

### test/export-model.test.mjs
| Line | Test | Disposition |
|------|------|-------------|
| 107-165 | 65-05 nested DFS rows | KEEP (deep-equal on [key,title,parent,depth,id] — new `order` field invisible). |
| 167-169 | 'child rows are excluded from kpis (D-54-10)' | KEEP — must stay green. |
| 318-338 | 'completed false plus subtasks true never emits a child of a filtered-out parent' | KEEP. |
| 363-375 | 'status and priority charts tally exported top rows and ignore child rows (D-54-10)' | KEEP — must stay green. |
| 414-424 | 'board lanes are exactly the five ids in order, counts match, cards sort by order' | **UPDATES**: with a subtasked fixture the lane counts now include children; the sort contract ("order then key") holds only after child rows gain `order` (§2.1) — assert child cards follow their parent card by dotted-key order. |
| 426-438 | 'an empty lane still renders: count 0 and an empty cards array (R7 empty)' | KEEP (fixture subtask-free). |
| 620-626 | 'nested rows inherit the TOP-LEVEL task due' | KEEP — this is the dates source for child bars (D-70-7 note). |
| 552-560 | 'subtask rows carry their OWN assignees arrays (D-55-5)' | KEEP — child Board cards show the child's own assignees. |
| NEW | — | Board model pin: child cards in status lanes, flat, dotted keys, counts = parents + children; kpis/charts/members still child-free on the same model (regression guard). |

### Must NOT change (verified safe)
- `test/export-csv.test.mjs` — CSV iterates `model.rows` flat (src/export/csv.js:26-30); adding `order` to child rows changes nothing in the CSV body.
- `test/export-mspdi.test.mjs` — MSPDI reads `model.rows` (depth/parent/key fields unchanged); the only id-based Assignment filtering (`test/export-mspdi.test.mjs:440`) keys off the parent task UID from top-level rows — unaffected. Note MSPDI does NOT consume `model.board` or `buildGantt`.
- `test/export-route.test.mjs`, `test/export-prohibition.test.mjs` — route and src↔export boundary untouched.
- `test/make-export-samples.mjs` self-check — CSV/MSPDI shapes unchanged.

## 6. Don't Hand-Roll

| Problem | Use | Why |
|---------|-----|-----|
| Cell indent styling | `indentCell` (@office-kit/xlsx/styles, xlsx.js:37) | Real OOXML indent attribute; the 69-01 pin proves it serializes correctly |
| Parent emphasis | `setBold` (xlsx.js:37) | Same |
| DFS order of dotted keys | plain string comparison (`plainCmp`, gantt.js:107) | `P < P.1 < P.1.1 < P.2` in codepoint order — no tree walk needed for the per-parent group |
| Status labels | the model row's `status` (translated) | Never re-translate in export/ (D-54-12: export/ holds no display literal) |

**Key insight:** the entire feature is *removal of three exclusions* plus *ordering and styling* — the data (rows with dates/status/assignees) has existed in `model.rows` since Phase 65 and the writers are already order-driven.

## 7. Common Pitfalls

1. **id collision (CR-01)** — depth-0 child rows share the task's `id` (model.js:239). Any `Map` keyed by `r.id` over full rows (statusLabelById today, `barByTaskId` at gantt.js:175) collides. Key bars/cards by dotted `key`; build link maps from parent bars only (§3.3).
2. **deps lookup hitting a child row** — gantt.js:178 `model.rows.find(r => r.id === succ.taskId)` must add `&& !r.parent` once child rows exist (defensive; parents currently precede children so it works by accident — pin it).
3. **Lane sort regression** — child rows lack `order`; without adding `order: t.order ?? 0` (§2.1) children sort to the top of every lane, breaking 'cards sort by order' (test/export-model.test.mjs:414).
4. **Empty-lane adjacency** — test/export-xlsx.test.mjs:492 asserts the next lane label sits directly below an empty lane. Child cards in OTHER lanes shift lane rows; the assertion must still hold for lanes with zero cards. Keep the writer's "label row only when cards empty" behavior (it already is).
5. **Cap fixture arithmetic** — the note-row position tests hardcode `2 + N bars + 2` (test/export-xlsx.test.mjs:798, :844). Any new cap test with children must recompute: table rows = 2 headers + parent bars + child bars. Existing tests stay green only because their fixtures are subtask-free AND `ganttModel` passes no options (test/export-xlsx.test.mjs:604).
6. **ROW BASIS misalignment** — if bars are re-ordered but the writer consumed `model.rows` order (it doesn't — it consumes `gantt.bars`, xlsx.js:200), drawings would detach from table rows. The `row` index must be reassigned AFTER the DFS splice (gapless 0..n-1, gantt.js:159 pattern), and milestones continue from the new `bars.length` (gantt.js:167).
7. **Undated children with a dated own-start** — a child with `s.start` set but undated parent yields `due: ''` → no bar (dated filter, gantt.js:126). Correct per the dated-row rule (discretion item resolved: no special casing).
8. **Timeline table styling scope** — indent/bold must touch ONLY column B (title) as on the Tasks sheet (xlsx.js:336-337); styling column A or C would diverge from the established pattern and from D-70-3's wording.
9. **`status` field name on bars** — bars carry machine `statusId` today; adding the label as `status` mirrors the row field names (model.js:154) — do not invent a third name.

## 8. Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `plainCmp` dotted-key sort reproduces DFS order within a parent group for arbitrary depth/segment counts | §3.1 | Wrong child order inside a group — observable, test-pinnable |
| A2 | `indentCell(wb, cell, n)` accepts arbitrary level `n` (observed only with 1) | §4.1 | Deeper indents clamp/fail — verify against @office-kit/xlsx styles API in the plan's first task |
| A3 | Adding `order` to child rows breaks no MSPDI assertion (writer reads depth/parent/key, not order) | §2.2 | MSPDI suite failure — cheap to catch on first run |
| A4 | `makeChartDoc` contains no subtasks (Board R7 test auto-adapts) | §5 | Test :450 lane-count assertions shift — verify when writing the plan |

All other claims carry file:line citations read this session.

## 9. Suggested Plan Split

**Recommendation: ONE plan**, tasks ordered:

1. **Model: child rows gain `order`; board lanes include child cards** (model.js:218-246 add field; 370-388 swap `topRows`→`rows`) + model tests (board pins, kpi/chart regression guard).
2. **Gantt: lift T-54-15 filter, parent-grouped DFS bars with `status`/`depth`/`indentLevels`, parent-only link map, cap accounting** (gantt.js:120, 127-134, 157-159, 175-184) + gantt tests (ordering pin, link-to-parent pin, cap-with-children).
3. **Writer: fillTimeline per-bar status + real-depth indent + parent bold; Board pass-through verification** (xlsx.js:196-205) + WR-01 rewrite, Timeline indent/DFS pins, Board child-card pins, empty-lane-with-children pin.
4. **Full-suite gate**: `node --test test/export-*.test.mjs` then `npm test`; standing gates (chunk size, lint 15 baseline, zero deps).

**Why not two plans:** the writer change (§4) is ~10 lines and meaningless without the model/gantt contract; the test updates span all three files and encode ONE observable contract (D-70-1..7). A split would force the first plan to ship dead code (model emits cards no one renders differently) and duplicate fixture work. A single plan keeps every commit green: task 1 alone changes Board output + model tests; tasks 2-3 change Timeline; each is independently verifiable.

## Validation Architecture

| Property | Value |
|----------|-------|
| Framework | node:test (existing suites) |
| Quick run command | `node --test test/export-model.test.mjs test/export-gantt.test.mjs test/export-xlsx.test.mjs` |
| Full suite command | `npm test` (1713+ pass baseline, 69-VERIFICATION.md:55) |

| Req | Behavior | Test Type | Command | File Exists? |
|-----|----------|-----------|---------|--------------|
| D-70-1 | Board child cards + counts | unit | `node --test test/export-model.test.mjs test/export-xlsx.test.mjs` | ❌ Wave 0 (new pins) |
| D-70-3/5 | Timeline indent + per-bar status | unit | `node --test test/export-xlsx.test.mjs` | ❌ Wave 0 |
| D-70-6 | Cap incl. children | unit | `node --test test/export-gantt.test.mjs test/export-xlsx.test.mjs` | ❌ Wave 0 |
| D-70-7 | Parent-grouped DFS bars | unit | `node --test test/export-gantt.test.mjs` | ❌ Wave 0 |
| NFR-03 | Regression: existing 2-level trees unchanged | existing suite | `node --test test/export-{csv,mspdi,model,xlsx}.test.mjs` | ✅ |

## Sources

### Primary (HIGH confidence — all read this session)
- `src/export/model.js` — rows/board/headers/labels (cited per line above)
- `src/export/gantt.js` — ROW BASIS, exclusion, sort, links, cap
- `export/xlsx.js` — fillTimeline, Board loop, writeTaskRow
- `server.js:7363-7404` — export route
- `test/export-{xlsx,gantt,model}.test.mjs`, `test/fixtures/export-fixtures.mjs`, `test/export-csv.test.mjs`
- `.planning/phases/70-*/70-CONTEXT.md`, `70-DISCUSSION-LOG.md`, `.planning/phases/69-*/69-{CONTEXT,VERIFICATION}.md`

## RESEARCH COMPLETE

**Confidence:** HIGH — every design point is grounded in file:line evidence read this session; the only unverified item is A2 (`indentCell` with level > 1), checkable in the first implementation task.
