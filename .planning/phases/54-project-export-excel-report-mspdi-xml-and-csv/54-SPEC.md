# Phase 54: Project export — Excel report, MSPDI XML and CSV — Specification

**Created:** 2026-11-09
**Ambiguity score:** 0.11 (gate: ≤ 0.20)
**Requirements:** 13 locked

## Goal

A member can turn a project's data into a shareable artifact — a formatted six-sheet Excel workbook with native charts and a Gantt carrying dependency arrows, a Microsoft Project MSPDI XML file that opens with real finish-to-start links, or a flat CSV on the static demo — scoped either to the view they are looking at or to the whole project.

## Background

There is **no user-facing export today**. `scripts/export-seed.mjs` is a dev-only seed dumper; nothing in `src/` or `server.js` produces a document for a user. Board, List and Timeline are three renderings of the same task document, so the phase builds **one export model and three writers**, never HTML scraping.

What exists and constrains the design:

- **Data model** — `src/core/store.js`: tasks carry `key/title/status/priority/assignee/start/due/labels/subtasks/deps/desc/estimate/created/updated/order/archived`; projects carry `start/due/status/lead/members/milestones/desc`. Dates are local `YYYY-MM-DD` strings (`src/core/utils.js` `iso`/`parse`), timestamps are epoch ms.
- **Progress** — `taskProg` (`store.js:419-423`) maps status to 0/5/45/80/100, or the subtask ratio when subtasks exist.
- **View scope** — `applyView(ts, viewOf(key))` (`src/shell/view-engine.js:122`) is pure and returns the filtered, sorted task array, so the client can hand the exact current-view ids to the server without re-implementing filters.
- **Timeline** — `src/views/timeline.js` draws bars from `start`/`due`, arrows from `deps`, and milestones from `p.milestones`; tasks without a `due` are omitted from the view.
- **Permissions** — writes and reads funnel through `requireWorkspace` (`server.js:3225`), `canSeeProject` (`server.js:800`), `memberCanReadProject` (`server.js:813`) and `docForClient` (`server.js:1649`). `redactDoc` already strips what a member may not see.
- **Static demo** — `api.enabled === false` on the Vercel build; there is no server to generate a file.
- **Localization** — `scripts/i18n-scan.mjs` runs as `prebuild` and fails the build on uncatalogued labels.
- **Dependencies** — `package.json` ships `pg` only; the project's stance is zero runtime dependency by default.
- **Library reality (verified in a sandbox this session)** — ExcelJS cannot write charts or shapes. `@office-kit/xlsx@0.26.1` (MIT, ESM, Node ≥22) writes real charts, worksheet shapes and `xdr:cxnSp` connectors; a generated workbook was opened in LibreOffice and rendered bars, a bar chart and an arrowhead correctly. Known sharp edges: no `xl/theme/theme1.xml`, `makeBarSeries` drops `spPr`, `makeTwoCellAnchor` is not exported, a connector needs an explicit `ln.fill`, text categories need `cacheKind: 'str'`, and a two-cell anchor needs `to.row = row + 1` for full-height bars.

## Requirements

1. **Export entry point**: The project page exposes one export entry point next to Share that opens a single export modal, visible only to the project lead and workspace admins/owners.
   - Current: no export control exists anywhere; `src/pages/project.js:73-80` hosts avatar stack, add-member, Share, settings and overflow.
   - Target: an icon-only `ibtn-sm` with a download icon immediately before the Share button (tooltip + `aria-label` from the catalogue), plus an “Export…” item in the project overflow menu (`src/overlays/context-menu.js`, `p.ctx === 'project'`); both open the same modal. Both controls render only when `canManageProject` is true on the client (`src/core/store.js:353`) — editors, commenters and viewers see neither.
   - Acceptance: for a lead/admin/owner, both controls render on every project tab and activating either opens the same modal; for an editor, commenter or viewer, neither control exists in the DOM; the header keeps exactly one entry point and Phase 54 does not reintroduce the controls PROJ-02 removes.

2. **Scope selection**: The modal exports either the current filtered view or all project tasks, and shows both counts.
   - Current: no scope concept exists outside `applyView`.
   - Target: `current view` sends the ids returned by `applyView(ts, viewOf(key))` for the active view key; `all tasks` sends no ids and the server selects every non-archived task of the project. Counts are rendered from the client's own task set.
   - Acceptance: with an active filter, the exported `Tasks` sheet contains exactly the ids `applyView` returns for that view key; with “all”, it contains every non-archived task; the modal's two counts equal those two array lengths.

3. **Include toggles**: Descriptions, comments and subtasks are opt-out by default; completed tasks are included and archived tasks excluded by default.
   - Current: no export options exist.
   - Target: five toggles — Descriptions (off), Comments (off), Subtasks (off), Completed tasks (on), Archived tasks (off) — applied identically by the xlsx, MSPDI and CSV writers.
   - Acceptance: a default export contains no description text, no comment body and no subtask rows; toggling each on adds exactly that content; a done task appears by default; an archived task does not appear unless its toggle is on.

4. **Workbook structure**: The Excel export is one workbook with six sheets.
   - Current: no workbook generation exists.
   - Target: `Summary`, `Tasks`, `Board`, `Timeline`, `Members`, `Milestones`, in that order, each with a frozen header row.
   - Acceptance: unzipping the `.xlsx` yields six worksheets in that order with matching `xl/workbook.xml` sheet names; each sheet's row 1 is a header row and its freeze pane is set.

5. **Native charts**: The workbook carries three data-linked charts.
   - Current: none.
   - Target: clustered column “Tasks by status” and “Tasks by priority” on `Summary`, and a bar chart “Open tasks per assignee” on `Members`; each series range points at its source sheet and carries a cached series so the chart renders without recalculation.
   - Acceptance: `xl/charts/chart1.xml` … `chart3.xml` exist, each contains a `c:barChart` with a `c:numRef`/`c:strRef` pair pointing at the source sheet, and each chart renders with visible bars when opened in LibreOffice.

6. **Timeline Gantt**: The `Timeline` sheet is a real Gantt over the full project span.
   - Current: the on-screen Timeline renders HTML bars; nothing exports.
   - Target: date axis from `min(task starts, project start)` to `max(task dues, project target, today)`, padded to whole weeks, with an **adaptive column width**: daily columns when the padded span is ≤ 90 days, weekly columns beyond (decision D-54-2); one rounded-rectangle bar per dated task coloured by status; a diamond per milestone; one elbow connector with an arrowhead per in-scope dependency; a visually marked `Today` column; the left task columns frozen; the workbook opens on this sheet with the viewport scrolled to the current week.
   - Acceptance: with daily columns, a fixture project with known dates produces bars whose first/last covered columns match the task's `start`/`due`; with weekly columns, each bar covers the week columns containing its `start` and `due` and a task entirely inside one week is one column wide; a `dep` between two dated tasks produces one `xdr:cxnSp` whose start and end anchors sit on the predecessor's finish column and the successor's start column; the Today column is highlighted and matches the export date; `freezePanes` is set on the left block; the active sheet is `Timeline` and `topLeftCell` is the current week.

7. **Board snapshot**: The `Board` sheet is a static status-lane snapshot.
   - Current: `src/views/board.js` renders lanes in the browser only.
   - Target: one block per status in `backlog → todo → progress → review → done` order, each with a header carrying the status name and task count, then its cards as rows with title, assignee, priority, due date and subtask progress.
   - Acceptance: lane order and per-lane task counts match `STATUSES` and the task set; an empty lane still renders its header with count 0.

8. **Microsoft Project export**: The `.xml` export is MSPDI that Microsoft Project opens without repair.
   - Current: no MS Project output exists.
   - Target: a `<Project>` document with a standard Mon–Fri calendar, one task per app task (`Text1` key, `Text2` status, `Text3` priority, `Text4` labels, `Text5` estimate), working-time start/finish, duration derived from `estimate` (1d = 8h) or from the date span, `PercentComplete` from `taskProg`, a `<PredecessorLink>` of type finish-to-start per `deps` entry, one resource per assignee with a matching assignment, and one zero-duration milestone task per `p.milestones` entry.
   - Acceptance: the file is well-formed XML with the MSPDI namespace; task count equals exported tasks + milestones; every `deps` entry yields one `PredecessorLink` whose `PredecessorUID` resolves to the right task; opening it in Microsoft Project shows no repair prompt (verified by a human on a Project-equipped machine, with the XML asserted mechanically in CI).

9. **CSV demo fallback**: Static mode offers CSV only and says what is missing.
   - Current: static mode has no export at all.
   - Target: when `api.enabled === false`, the modal offers CSV, generated client-side from the same export model, and shows a note that charts, dependency arrows and multi-sheet reports need the server build.
   - Acceptance: on the static build the format list contains only CSV, the note is rendered, and the downloaded file parses as UTF-8 CSV with one row per exported task plus a header.

10. **Permissions**: Export requires project-manage rights on top of the existing visibility funnel.
    - Current: `docForClient` + `redactDoc` gate every read; no export route exists to gate.
    - Target: the endpoint resolves the workspace through `requireWorkspace`, the project through `canSeeProject`/`memberCanReadProject` (404 parity for callers who cannot read), then requires `canManageProject` (`server.js:837`: lead, or workspace admin/owner) and returns 403 with a localized `exportForbidden` code otherwise; it builds the model only from the `docForClient`-shaped document — never from `ctx.ws.doc`.
    - Acceptance: a non-member requesting a private project's export receives the same status, body and headers as requesting the project read; a caller who can read but cannot manage receives 403 with the localized error and no file bytes; a member receiving a redacted document cannot obtain redacted fields through any export format; no export code path references `ctx.ws.doc` directly.

11. **Localization**: Every export string is catalogued in English and French.
    - Current: the catalogue has no export keys.
    - Target: new `export.*` keys for the modal, options, sheet names, column headers, notices and error messages, with French translations including plural forms for task counts.
    - Acceptance: `npm run build` passes the i18n gate with no missing or orphaned export key; the French build renders no English export string.

12. **Output safety**: Exported text is escaped for its format and never evaluated.
    - Current: no export output exists to escape.
    - Target: XML/MSPDI escapes `& < > " '`; xlsx writes strings as shared strings; CSV is UTF-8 with a BOM and any value starting with `=`, `+`, `-` or `@` is prefixed with `'`.
    - Acceptance: a task titled `=1+1` and one titled `A & <B>` round-trip as literal text in all three formats; no cell in the workbook has a formula data type unless the exporter wrote it.

13. **Performance and degradation**: Large projects stay responsive and degrade instead of failing.
    - Current: no baseline exists.
    - Target: a 500-task project with dependencies exports successfully; the server does not block other requests for more than two seconds during generation; when the Gantt would exceed the shape cap (initially 400 bars + connectors), the `Timeline` sheet keeps its table, adds a note row explaining the omission, and the rest of the workbook is unaffected.
    - Acceptance: a benchmark fixture of 500 tasks with 400 deps exports within the agreed wall-clock budget with the event loop responsive; a fixture above the cap produces a valid workbook with a table-only Timeline and the note row, never an error response.

## Boundaries

**In scope:**
- One export modal reached from the project header and the project overflow menu
- One shared, DOM-free export model consumed by all writers
- `xlsx` writer: six sheets, three native charts, Gantt bars, milestone diamonds, dependency connectors, Today column, frozen panes, print-friendly layout
- MSPDI XML writer: tasks, durations, links, resources, assignments, milestones, notes
- CSV writer for the static demo
- Server endpoint with the existing permission funnel, filename sanitizer and `no-store`
- Include toggles for descriptions, comments, subtasks, completed and archived tasks
- EN + FR catalogue entries and the i18n gate
- Unit tests for the model and both writers, a permissions test, and an XML-structure assertion test

**Out of scope:**
- True `.mpp` output — no open-source writer exists (MPXJ's own FAQ says so); MSPDI is the deliverable and the modal says so
- Excel macros (`.xlsm`) or any VBA — a macro could implement the “type a date and jump” cursor, but it is a security and signing burden and is not needed for the agreed scroll-to-today behaviour
- Editing exported files back into the app (import) — separate feature
- Attachments and file URLs in the export — the file route is permission-gated per file and a static URL list would leak beyond the project boundary
- Charts or arrows in CSV — the format cannot carry them, stated in the modal
- Exporting another workspace's project, or a cross-project portfolio export — the endpoint is project-scoped
- Interactive reflowing Gantt in Excel — connectors are drawn geometrically and are not glued to shapes (`stCxn`/`endCxn` are not modelled), so dragging a bar does not re-route its arrow
- Changing the on-screen Board/List/Timeline views — export is additive

## Constraints

- `@office-kit/xlsx` pinned to an exact version, imported only from server-side export modules — the client bundle must not grow by it
- Node ≥ 24 (the project's engine floor) and ESM only
- Works on the existing dual backend; export reads the rendered document, so it needs no schema change
- Dates stay local `YYYY-MM-DD`; MSPDI working hours use the workspace's local day, never UTC midnight
- No new server dependency other than the pinned xlsx writer
- `Cache-Control: no-store` and the existing `fileDisposition` sanitizer (`server.js:5860`) for the response
- The 500-task / two-second and 400-shape numbers are guardrails to calibrate in discuss-phase against a real fixture — they are targets, not measured constants

## Acceptance Criteria

- [ ] Both entry points open the same export modal for a lead/admin/owner; neither exists in the DOM for an editor, commenter or viewer; the header gains exactly one control
- [ ] “Current view” exports exactly the ids `applyView` returns for the active view key; “all tasks” exports every non-archived task
- [ ] Default export contains no description text, no comment body and no subtask rows; each toggle adds exactly its content
- [ ] The workbook contains `Summary`, `Tasks`, `Board`, `Timeline`, `Members`, `Milestones` in that order with frozen headers
- [ ] Three native charts exist as `xl/charts/chart1.xml`–`chart3.xml` and render with visible bars in LibreOffice
- [ ] Timeline bars start and end on the columns matching each task's `start` and `due` on the daily axis (≤ 90 days), and on the week columns containing them on the weekly axis; each in-scope dependency produces exactly one connector anchored predecessor-finish → successor-start
- [ ] The Today column matches the export date, the left block is frozen, and the file opens on `Timeline` scrolled to the current week
- [ ] Board lanes follow `backlog → todo → progress → review → done`; an empty lane still renders with count 0
- [ ] The MSPDI file is well-formed, namespaced, has task count = tasks + milestones, and every `deps` entry maps to a resolvable `PredecessorUID`
- [ ] Static mode offers CSV only and renders the “server build required” note
- [ ] A caller who cannot read the project gets the same 404 as a project read; a reader without manage rights gets 403 + localized toast; no redacted field appears in any format; no export path reads `ctx.ws.doc`
- [ ] `npm run build` passes the i18n gate; the French build shows no English export string
- [ ] `=1+1` and `A & <B>` survive as literal text in xlsx, MSPDI and CSV
- [ ] A 500-task fixture exports with the server responsive throughout; a fixture above the shape cap yields a valid workbook with a table-only Timeline and a note row
- [ ] The project's existing test, lint, format-check and privacy suites stay green

## Edge Coverage

**Coverage:** 18/32 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ⛔ dismissed | Structural UI requirement with no boundary/threshold axis; covered by its acceptance criterion |
| boundary | R2 | ✅ covered | Scope counts are exact array lengths; the boundary is 0 tasks — Export is disabled for that scope |
| adjacency | R2 | ⛔ dismissed | Two sets, not intervals; view == all is a legitimate duplicate, no merge semantics |
| empty | R2 | ✅ covered | Empty scope disables Export with a visible `0` count rather than producing an empty file |
| ordering | R2 | ✅ covered | `view` scope preserves the view's sort; `all` uses project manual order (`order`) |
| precision | R2 | ⛔ dismissed | No numeric computation in scope selection |
| unclassified | R3 | ⛔ dismissed | Boolean toggles; the edge axis is the toggle list itself, covered by acceptance criteria |
| unclassified | R4 | ⛔ dismissed | Fixed sheet list, no edge axis; order is asserted directly |
| boundary | R5 | ✅ covered | A chart renders when at least one category has a non-zero value; all-zero data omits that chart rather than drawing empty axes |
| precision | R5 | ⛔ dismissed | Counts are integers |
| adjacency | R6 | ✅ covered | `start == due` is a one-day bar; a predecessor finishing the day a successor starts draws a zero-length horizontal arrow into the next row |
| boundary | R6 | ✅ covered | The daily→weekly switch sits at a padded span of 90 days: 90 days stays daily, 91 days switches to weekly; both sides of the threshold have a fixture |
| empty | R6 | ✅ covered | No dated tasks → table and Today column remain, zero bars, no error |
| ordering | R6 | ✅ covered | Bars sorted by start then title; milestones by date; dependency arrows drawn after bars so they sit on top |
| adjacency | R7 | ⛔ dismissed | Status lanes are disjoint by construction |
| empty | R7 | ✅ covered | Empty lane renders its header with count 0 |
| ordering | R7 | ✅ covered | Lane order fixed to `backlog → todo → progress → review → done`; cards by `order` |
| unclassified | R8 | ⛔ dismissed | Format-conformance requirement; structure is asserted mechanically against the MSPDI namespace |
| unclassified | R9 | ⛔ dismissed | Boolean mode branch, no edge axis |
| concurrency | R10 | ✅ covered | Export is read-only and per-request; a generation failure returns JSON before any response header, so no partial file is ever streamed |
| boundary | R10 | ✅ covered | Two distinct gates in order: cannot read → 404 parity (no oracle); can read but cannot manage → 403 + localized code, no bytes. A lead and a workspace admin pass both |
| adjacency | R11 | ⛔ dismissed | No set-boundary semantics |
| empty | R11 | ✅ covered | No uncatalogued literal may exist; the build gate fails on a missing key |
| encoding | R11 | ✅ covered | French accented and non-Latin text round-trips through UTF-8 in xlsx shared strings and in the XML declaration |
| ordering | R11 | ⛔ dismissed | Message ordering is not observed by the user beyond the fixed modal layout |
| adjacency | R12 | ⛔ dismissed | No set-boundary semantics |
| empty | R12 | ✅ covered | An empty description writes an empty cell / omitted `Notes` element, never the string `undefined` |
| encoding | R12 | ✅ covered | CSV is UTF-8 with BOM; XML declares UTF-8; `& < > " '` escaped; RTL and emoji survive |
| ordering | R12 | ⛔ dismissed | Escaping is position-independent |
| boundary | R13 | ✅ covered | Shape cap at 400; one shape above the cap degrades to table-only Timeline, never an error |
| precision | R13 | ⛔ dismissed | No rounding contract beyond whole-day bar geometry |
| concurrency | R13 | ✅ covered | Event-loop responsiveness is the stated constraint; generation yields between sheets and does not hold a transaction |

*Note: `unclassified` rows are the probe's manual-review nudge (its shape classifier found no cue in the requirement prose), not a hard block.*

## Prohibitions (must-NOT)

**Coverage:** 6/6 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT export data from a project the caller cannot read, or create an existence oracle for a private project | R10 | resolved | test — 404-parity matrix extended in `test/` (same status, body and headers as the project read) |
| MUST NOT label MSPDI XML as `.mpp` or imply `.mpp` support in the UI | R1, R8, R9 | resolved | test — filename extension assertion + catalogue assertion that no `*export*` value contains `.mpp` |
| MUST NOT include descriptions, comments or subtasks unless the user opted in | R3 | resolved | test — model-level default-export assertion for all three writers |
| MUST NOT build the export from the raw stored document instead of the `docForClient`-shaped one | R10 | resolved | judgment — code review at verify time; a source assertion would be brittle |
| MUST NOT render or evaluate HTML from task descriptions (no script, no markup interpretation) | R12 | resolved | test — a description containing `<script>` and `<img onerror>` exports as inert plain text |
| MUST NOT add a client-bundle dependency for export | R1, R9 | resolved | test — assert no `@office-kit/xlsx` import resolves under `src/` |

*Canon referral: path traversal, prototype pollution and generic injection are owned by /gsd-secure-phase and eslint; not minted here.*

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                                                        |
|--------------------|-------|------|--------|--------------------------------------------------------------|
| Goal Clarity       | 0.95  | 0.75 | ✓      | Six sheets, three charts, Gantt with arrows, MSPDI, CSV      |
| Boundary Clarity   | 0.88  | 0.70 | ✓      | Explicit out-of-scope list incl. `.mpp`, macros, attachments |
| Constraint Clarity | 0.82  | 0.65 | ✓      | Pinned library, server-only, funnel, i18n gate               |
| Acceptance Criteria| 0.85  | 0.70 | ✓      | 15 pass/fail checks                                          |
| **Ambiguity**      | 0.11  | ≤0.20| ✓      |                                                              |

Calibration items for discuss-phase: the 500-task / 2-second budget and the 400-shape cap are guardrails, not measurements — the planner must fix them against a real fixture.

## Interview Log

| Round | Perspective      | Question summary                                             | Decision locked |
|-------|------------------|--------------------------------------------------------------|-----------------|
| 1     | Researcher       | What exists today for export?                                | Nothing user-facing; `export-seed.mjs` is dev-only |
| 2     | Researcher       | What can actually write charts and dependency arrows in 2026? | ExcelJS cannot; `@office-kit/xlsx` can — verified by rendering a generated workbook |
| 3     | Boundary Keeper  | Is a literal `.mpp` required?                                 | No — MSPDI XML is acceptable and is what ships |
| 3     | Boundary Keeper  | Which scopes?                                                 | Both current view and all project tasks |
| 3     | Boundary Keeper  | What is optional?                                             | Descriptions, comments, subtasks opt-in; done in, archived out |
| 4     | Failure Analyst  | What breaks a report?                                         | Missing theme colours, dropped series style, zero-height anchors, invisible connectors, unescaped text, formula injection |
| 4     | Failure Analyst  | What breaks trust?                                            | Exporting a private project to a non-member; calling XML “.mpp” |
| 5     | Seed Closer      | Where does the entry point live?                              | Icon button next to Share + the project overflow menu |
| 5     | Seed Closer      | How does the reader orient in a long timeline?                | Full project span, frozen task columns, marked Today column, opens scrolled to today |
| 6     | Seed Closer      | What about the static demo?                                   | CSV only, with an explicit note about what is missing |

---

## Post-spec amendments (discuss-phase, 2026-11-09)

Two requirements were amended by owner decision during `/gsd-discuss-phase 54` — not re-interviewed, recorded here so the verifier reads the shipped contract:

- **R1 / R10 — export is a manage action.** Only the project lead and workspace admins/owners (`canManageProject`) see the controls and may call the endpoint. Read-only editors, commenters and viewers get neither control and receive 403 + a localized error if they call the endpoint directly. 404 parity still applies to callers who cannot read the project at all.
- **R6 — adaptive Gantt axis.** Daily columns when the padded span is ≤ 90 days, weekly columns beyond. Accepted trade-off: on a long project bars snap to weeks rather than exact days; the acceptance criterion names both cases.

*Phase: 54-project-export-excel-report-mspdi-xml-and-csv*
*Spec created: 2026-11-09*
*Next step: /gsd-discuss-phase 54 — implementation decisions (already settled: office-kit, sheet layout) *