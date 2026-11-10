# Phase 54: Project export — Excel report, MSPDI XML and CSV - Context

**Gathered:** 2026-11-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn a project's data into three shareable artifacts from the project page — a six-sheet `.xlsx`
report (native charts, Gantt with dependency arrows), a Microsoft Project MSPDI `.xml`, and a
flat `.csv` on the static demo — scoped either to the active view or to the whole project.

This phase builds **one DOM-free export model and three writers**. It does not add an import
path, does not change the on-screen Board/List/Timeline views, and does not add a second
permission model: export is gated by the existing read funnel plus the existing
`canManageProject` rule.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**13 requirements are locked.** See `54-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `54-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- One export modal reached from the project header and the project overflow menu
- One shared, DOM-free export model consumed by all writers
- `xlsx` writer: six sheets, three native charts, Gantt bars, milestone diamonds, dependency connectors, Today column, frozen panes, print-friendly layout
- MSPDI XML writer: tasks, durations, links, resources, assignments, milestones, notes
- CSV writer for the static demo
- Server endpoint with the existing permission funnel, filename sanitizer and `no-store`
- Include toggles for descriptions, comments, subtasks, completed and archived tasks
- EN + FR catalogue entries and the i18n gate
- Unit tests for the model and both writers, a permissions test, and an XML-structure assertion test

**Out of scope (from SPEC.md):**
- True `.mpp` output — no open-source writer exists; MSPDI is the deliverable and the modal says so
- Excel macros (`.xlsm`) or any VBA
- Editing exported files back into the app (import)
- Attachments and file URLs in the export
- Charts or arrows in CSV
- Exporting another workspace's project, or a cross-project portfolio export
- Interactive reflowing Gantt in Excel (connectors are geometric, not glued)
- Changing the on-screen Board/List/Timeline views

**Owner-approved amendments made during this discussion (already applied to SPEC.md):**
- R1/R10 — export is a **manage action** (lead / workspace admin / owner), not an every-reader action.
- R6 — the Gantt axis is **adaptive** (daily ≤ 90 days, weekly beyond).

</spec_lock>

<decisions>
## Implementation Decisions

### Who may export
- **D-54-1:** Export requires **project-manage rights**: the project lead, or a workspace admin/owner. Reuse the existing rule on both sides — `canManageProject` (`src/core/store.js:353`, `server.js:837`) — rather than inventing a new permission. A reader without those rights is denied; the read funnel still runs first, so a caller who cannot see a private project still gets the 404-parity response, never a 403 that would confirm the project exists. — **Reversibility:** reversible — widening or narrowing the gate later is one predicate on two surfaces plus its tests.
- **D-54-2:** The export control is **hidden**, not disabled, for editors/commenters/viewers: neither the header icon nor the overflow item exists in the DOM. This follows the existing pattern of hiding actions a member cannot perform (e.g. member removal in `src/overlays/context-menu.js:62-78`).
- **D-54-3:** A direct endpoint call by a reader without manage rights returns **403 + a localized error code** (`exportForbidden`) and builds no file bytes. It is not a 404: the caller can already read the project, so 404 would be a lie, not a defence.
- **D-54-4:** MSPDI export is available to the same audience as the Excel export — no separate permission tier per format. All three formats share one gate.

### Timeline granularity
- **D-54-5:** The Gantt axis is **adaptive**: daily columns when the padded span is ≤ 90 days, weekly columns above that threshold. The span is the padded full-project span already required by the SPEC, not the count of tasks. — **Reversibility:** costly — two geometry paths, their boundary fixture, and the acceptance criterion all encode the threshold; changing it later means re-testing bar, connector and Today-column placement on both axes.
- **D-54-6:** On the weekly axis a bar covers every week column that contains any day of its `start..due` range; a task entirely inside one week is exactly one column wide. A milestone diamond sits in the week column containing its date. A dependency connector runs predecessor-finish column → successor-start column on whichever axis is active.
- **D-54-7:** The **Today** marker follows the same axis: a highlighted day column on the daily axis, a highlighted week column containing today on the weekly axis. "Opens scrolled to the current week" is unchanged on both.

### Opt-in content shape
- **D-54-8:** Comments, when opted in, are **columns on the `Tasks` sheet** — a comment count, the latest comment, and one wrapped `Thread` column holding the full conversation with author and date inline. Six sheets stay six; there is no `Comments` sheet.
- **D-54-9:** Subtasks, when opted in, are **indented child rows** under their parent, keyed `PARENT-KEY.n`, carrying their done state and no schedule bars. They remain filterable and sortable like any row.
- **D-54-10:** Child rows are **excluded from KPI counts and from all three charts** — those count top-level tasks only, so a task with five subtasks still counts once.
- **D-54-11:** Descriptions, when opted in, are a plain-text column on `Tasks` (HTML stripped, never rendered) and become the `Notes` element in MSPDI. The same toggle content reaches all three writers.

### Artifact language & dates
- **D-54-12:** **English sheet names** (`Summary`, `Tasks`, `Board`, `Timeline`, `Members`, `Milestones`) — locked by the SPEC — with **column headers, status and priority labels localized to the UI language** through the existing catalogue. A French user gets a French report with stable English sheet names.
- **D-54-13:** Dates are written as **real Excel dates** (not strings) so sorting and date arithmetic work; the displayed format follows the reader's locale. MSPDI uses its own `YYYY-MM-DDThh:mm:ss` format as the schema requires.
- **D-54-14:** User-authored text — task titles, labels, comments, descriptions — is **never translated**; only exporter-authored labels are localized. MSPDI's schema element names stay English; only human-facing text follows the UI language.

### Summary sheet
- **D-54-15:** `Summary` carries project meta (name, lead, status, start date, target date, progress), KPI counts (total, open, done, overdue), then the two charts. No "needs attention" list — the SPEC's two charts plus counts are the agreed surface; an attention block would duplicate the `Tasks` sheet.
- **D-54-16:** "Overdue" means `due < export date` and not done — the same predicate the app uses (`isOver`, `src/core/store.js:364`), computed on the export date rather than live.

### Agent's Discretion
Filename pattern (recommend `{project-slug}-{YYYY-MM-DD}.xlsx`), modal layout and option ordering, endpoint method/shape and streaming strategy, generation progress feedback, chart colours and axis titles, column widths and print setup, the wording of refusal/notice toasts, the internal shape of the export model and writer modules, and how the Weekly fixture is chosen.

One product call left to the planner by default: on Overview / Files / Activity the "current view" scope has no meaning — recommend disabling it (count shown as `—`) and preselecting "All tasks"; do not silently treat the last-used view as current.

### Folded Todos
None — `todo.match-phase 54` returned no matches.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase contract
- `.planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-SPEC.md` — locked requirements, boundaries, acceptance criteria, edge coverage, and the two owner-approved amendments. **MUST read before planning.**
- `.planning/ROADMAP.md` §Phase 54 — goal and dependency (Phase 52, no in-milestone dependency).

### Access model
- `.planning/phases/51-client-surfaces-permissions-page-removal-project-creation/51-CONTEXT.md` — D-51-17 defines the per-project lead and `canManage` gating; the export gate reuses it.
- `.planning/phases/50-invite-hierarchy-per-project-toggles-server/50-CONTEXT.md` — D-50-5 live team→project links; the funnel export must not bypass.
- `docs/ProjectPermissions.md` — shipped v2.0 access model.
- `.planning/phases/49-visibility-model-collapse-grant-materialization/49-CONTEXT.md` — the one funnel and the 404-parity convention.

### Format references
- `54-SPEC.md` §Background — verified `@office-kit/xlsx@0.26.1` capabilities and its six sharp edges.
- MSPDI schema — the XML namespace and element names are Microsoft's; no local copy exists, so the writer must cite the schema version it targets.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/store.js:353` `canManageProject` and `server.js:837` `canManageProject` — the client and server halves of the export gate; reuse verbatim.
- `src/shell/view-engine.js:122` `applyView` — pure; produces the exact current-view task array, so the client can send ids without re-implementing filters.
- `src/core/store.js:419` `taskProg` — percent complete for MSPDI and the Tasks sheet.
- `server.js:5860` `fileDisposition` — the existing filename sanitizer; reuse for `Content-Disposition`.
- `src/core/api.js` `api.enabled` — the static/server branch for CSV-only mode.
- `scripts/i18n-scan.mjs` — the prebuild gate every new export key must satisfy.

### Established Patterns
- Server routes live in one dispatcher in `server.js`; project routes are matched by regex around `server.js:5026` and go through `requireWorkspace(slug, 'viewer')` then the project funnel.
- Client downloads today are plain `<a href download>` links (`src/overlays/modals.js:435`); a generated blob needs a different path, but the `download` attribute convention should be kept.
- Modals are rendered from `src/overlays/modals.js` and opened through the action layer; the export modal joins that flow rather than introducing a new overlay system.
- Status lane order and labels come from `src/core/constants.js` (`STATUSES`/`ST`), not from ad-hoc strings.
- Server code is ESM, Node ≥ 24, no build step; the xlsx dependency must stay server-side only (SPEC prohibition).

### Integration Points
- `src/pages/project.js:73-80` — header cluster (avatar stack, add-member, Share, settings, overflow); the new icon button goes immediately before Share and only when `canManageProject`.
- `src/overlays/context-menu.js:35-51` — `p.ctx === 'project'` menu; add the "Export…" item under the same guard.
- `src/views/timeline.js` — the on-screen bar/dep/milestone logic to mirror in the Gantt sheet.
- `src/views/board.js` — lane order and card fields for the `Board` sheet.
- `server.js:3225` `requireWorkspace`, `server.js:800` `canSeeProject`, `server.js:813` `memberCanReadProject`, `server.js:1649` `docForClient` — the exact call chain the endpoint must follow.
- `src/locales/en.json`, `src/locales/fr.json` — all new `export.*` keys.

</code_context>

<specifics>
## Specific Ideas

- Entry point: icon-only `ibtn-sm` with a download icon **immediately before** the Share button, plus "Export…" in the project overflow menu; both open the same modal.
- The Gantt is the whole project, not the current filter — full span, frozen task columns, marked Today, workbook opens on `Timeline` scrolled to the current week.
- Demo mode says plainly what is missing rather than showing dead format options.
- Library evidence from this session: `@office-kit/xlsx@0.26.1` was driven end-to-end in `/tmp/opencode/xlsx-probe` (tables, conditional formatting, number formats, native bar chart, two-cell-anchored bars, `bentConnector3` arrows with arrowheads), and the output was opened in LibreOffice and rendered to PNG. The six sharp edges are listed in SPEC.md §Background; the planner should carry them into the implementation plan rather than rediscovering them.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 54-project-export-excel-report-mspdi-xml-and-csv*
*Context gathered: 2026-11-09*