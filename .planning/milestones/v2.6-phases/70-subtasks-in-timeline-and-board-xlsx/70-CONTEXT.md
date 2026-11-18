# Phase 70: Subtasks in Timeline and Board XLSX - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Make subtask rows appear in the XLSX workbook's Timeline sheet (Gantt) and Board sheet when the export option `subtasks` is active — mirroring how they already appear in the Tasks sheet (Phase 65/69) and the MSPDI export. No MSPDI/CSV changes, no server/route changes, no new i18n labels: the server already passes `subtasks` to both writers, the data already exists in `model.rows`.

**In scope:** Timeline child bars + table rows (indented), Board child cards in lanes, `buildGantt` hierarchy ordering, SHAPE_CAP accounting, tests.
**Out of scope:** MSPDI/CSV writers, dependency links between subtasks (child rows carry `deps: []` by model contract), subtask milestones, new export options, UI changes to the export modal.

</domain>

<decisions>
## Implementation Decisions

### Board lanes composition
- **D-70-1:** Subtasks are FLAT CARDS in the lanes — each subtask becomes its own card in the lane of its status (`done`/`todo` per the current model contract, owner choice 2026-11-17), carrying its dotted key (`ALPHA-9.1`) and its own fields. Lane counts include parents + children. The model change lives in `buildExportModel`'s board section (`model.board.lanes[].cards` gains child-row cards); the Board writer loop needs no structural change beyond what the model provides. Distinguish cards by dotted `key`, NEVER by row id (depth-0 child rows share the parent task's id — CR-01 landmine).
- **D-70-2:** Subtask status in lanes AND Timeline stays the current model contract: `done ? 'done' : 'todo'` (owner choice). A done subtask of an in-progress task shows in the done lane. No hybrid, no parent-status inheritance.

### Timeline rendering
- **D-70-3:** Child table rows indent by REAL DEPTH (`depth + 1` levels via `indentCell`, no bold) — NOT the pinned fixed-1 indent. This intentionally updates the 69-01 pin (`test/export-xlsx.test.mjs:906`, "NOT enriched"): the enrichment is now the phase's purpose. Parent rows stay bold, unindented.
- **D-70-4:** Child bars are visually IDENTICAL to parent bars (status-coloured, same shape/size) — no distinct height/outline. Extra drawing variants are out of scope.
- **D-70-5:** The Timeline status column must stop relying on `statusLabelById` (top-level-only map, WR-01 pin at `test/export-xlsx.test.mjs:861`): the status comes per-bar from `buildGantt` (bars already carry `statusId`); the pin is updated to the new per-bar contract. The WR-01 landmine (child rows sharing the parent's id overwriting the label) is retired by this change, not preserved.

### Shape budget
- **D-70-6:** SHAPE_CAP stays 400 STRICT, child bars included in the count. Beyond the cap the sheet degrades to table + truncation note exactly as today (R13 unchanged in behavior, changed in accounting). Tests pinning cap boundaries (`test/export-xlsx.test.mjs:793/807/848`, `test/export-gantt.test.mjs:232`) are adjusted to the new counting.

### Bar ordering
- **D-70-7:** Bars are written PARENT-GROUPED: parents keep the existing sort (start, then title, then key); children follow their parent in DFS order (dotted-key order) immediately after it, at every depth. The table rows and drawing rows stay index-aligned (gapless `row` indexes, ROW BASIS contract in `gantt.js`). The child bars' own dates come from the model's inherited start/due (top-level task's due per the model contract pinned at `test/export-model.test.mjs:620`).

### the agent's Discretion
- Exact composite-sort implementation in `buildGantt` (pre-order walk vs comparator) — planner/researcher picks, subject to D-70-7's observable contract.
- Whether `buildGantt` filters undated children the same way as undated parents (a child without inherited dates cannot draw) — follow the existing dated-row rule.
- Internal shape of `model.board.lanes[].cards` extension (flat merge vs per-card children array) — observable contract is D-70-1's flat cards in status lanes.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Export architecture
- `src/export/model.js` — row contract (child rows: `parent`/`depth`/dotted `key`, dates inheritance lines 226-227, statusId line 240), board lanes build (lines 370-389, topRows only today), `DEFAULT_OPTIONS.subtasks: false`
- `src/export/gantt.js` — ROW BASIS contract (lines 14-19), child-row exclusion at line 120 (T-54-15, to be lifted), SHAPE_CAP line 27 + line 190, bar sort lines 157-159
- `export/xlsx.js` — `fillTimeline` lines 149-268 (statusLabelById line 198, WR-01 comment 196-197), Board writing lines 474-498, `writeTaskRow` indent/bold pattern lines 309-341
- `export/mspdi.js` — reference only: the MSPDI subtask emission proven in Phase 69 (Test 11) — child rows Manual=0 Type=0, WBS trio; NOT modified by this phase

### Test pins that WILL change (update, don't preserve)
- `test/export-xlsx.test.mjs:906` — 69-01 fixed-1 indent pin ("NOT enriched") → real-depth indent per D-70-3
- `test/export-xlsx.test.mjs:861` — WR-01 status-column pin → per-bar status per D-70-5
- `test/export-xlsx.test.mjs:450/478` — Board lane counts / empty-lane adjacency → children included per D-70-1
- `test/export-xlsx.test.mjs:793/807/848`, `test/export-gantt.test.mjs:232` — SHAPE_CAP boundaries → new counting per D-70-6
- `test/export-model.test.mjs:620` — child due inheritance from TOP-LEVEL task (unchanged, but bars derive from it)

### Phase 69 provenance
- `.planning/phases/69-exports-verification-test-11/69-CONTEXT.md` — D-69 decisions, incl. D-69-3 (assertions in existing suites) and the deferred idea this phase implements
- `.planning/phases/69-exports-verification-test-11/69-VERIFICATION.md` — the owner's subtask date expectations (subtask end = parent end) that Timeline bars must reproduce
- `test/fixtures/export-fixtures.mjs` — the 3-level fixture tree (t_a13) reused for assertions; `test/make-export-samples.mjs` self-check contract

</canonical_refs>

<specifics>
## Specifics

- The xlsx export currently runs with `subtasks:true` whenever the request opts in (`server.js:7391-7398` passes `body.options` straight through) — no route work.
- CR-01 landmine (depth-0 child rows share the parent task's `id`) applies to any id-keyed map: Board cards and Timeline bars must key off dotted `key` or the bar object itself.
- Board empty-lane adjacency (a lane label sits directly below an empty lane's label) must survive: child cards added to a lane shift the following lane rows down.
</specifics>
