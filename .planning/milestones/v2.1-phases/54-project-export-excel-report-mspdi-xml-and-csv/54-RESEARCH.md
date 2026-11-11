# Phase 54: Project export — Excel report, MSPDI XML and CSV — Research

**Researched:** 2026-11-09
**Domain:** Binary document generation (OOXML / `.xlsx`), Microsoft Project MSPDI XML, CSV; server-side streaming in a Node-24 ESM app; client-side permission-gated download
**Confidence:** HIGH on library mechanics and repo integration (both probed/read this session); MEDIUM on MSPDI namespace choice (Microsoft's own docs disagree — see Open Questions); HIGH on MSPDI element order and enums.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Who may export**
- **D-54-1:** Export requires **project-manage rights**: the project lead, or a workspace admin/owner. Reuse the existing rule on both sides — `canManageProject` (`src/core/store.js:353`, `server.js:837`) — rather than inventing a new permission. A reader without those rights is denied; the read funnel still runs first, so a caller who cannot see a private project still gets the 404-parity response, never a 403 that would confirm the project exists. — **Reversibility:** reversible — widening or narrowing the gate later is one predicate on two surfaces plus its tests.
- **D-54-2:** The export control is **hidden**, not disabled, for editors/commenters/viewers: neither the header icon nor the overflow item exists in the DOM. This follows the existing pattern of hiding actions a member cannot perform (e.g. member removal in `src/overlays/context-menu.js:62-78`).
- **D-54-3:** A direct endpoint call by a reader without manage rights returns **403 + a localized error code** (`exportForbidden`) and builds no file bytes. It is not a 404: the caller can already read the project, so 404 would be a lie, not a defence.
- **D-54-4:** MSPDI export is available to the same audience as the Excel export — no separate permission tier per format. All three formats share one gate.

**Timeline granularity**
- **D-54-5:** The Gantt axis is **adaptive**: daily columns when the padded span is ≤ 90 days, weekly columns above that threshold. The span is the padded full-project span already required by the SPEC, not the count of tasks. — **Reversibility:** costly — two geometry paths, their boundary fixture, and the acceptance criterion all encode the threshold; changing it later means re-testing bar, connector and Today-column placement on both axes.
- **D-54-6:** On the weekly axis a bar covers every week column that contains any day of its `start..due` range; a task entirely inside one week is exactly one column wide. A milestone diamond sits in the week column containing its date. A dependency connector runs predecessor-finish column → successor-start column on whichever axis is active.
- **D-54-7:** The **Today** marker follows the same axis: a highlighted day column on the daily axis, a highlighted week column containing today on the weekly axis. "Opens scrolled to the current week" is unchanged on both.

**Opt-in content shape**
- **D-54-8:** Comments, when opted in, are **columns on the `Tasks` sheet** — a comment count, the latest comment, and one wrapped `Thread` column holding the full conversation with author and date inline. Six sheets stay six; there is no `Comments` sheet.
- **D-54-9:** Subtasks, when opted in, are **indented child rows** under their parent, keyed `PARENT-KEY.n`, carrying their done state and no schedule bars. They remain filterable and sortable like any row.
- **D-54-10:** Child rows are **excluded from KPI counts and from all three charts** — those count top-level tasks only, so a task with five subtasks still counts once.
- **D-54-11:** Descriptions, when opted in, are a plain-text column on `Tasks` (HTML stripped, never rendered) and become the `Notes` element in MSPDI. The same toggle content reaches all three writers.

**Artifact language & dates**
- **D-54-12:** **English sheet names** (`Summary`, `Tasks`, `Board`, `Timeline`, `Members`, `Milestones`) — locked by the SPEC — with **column headers, status and priority labels localized to the UI language** through the existing catalogue. A French user gets a French report with stable English sheet names.
- **D-54-13:** Dates are written as **real Excel dates** (not strings) so sorting and date arithmetic work; the displayed format follows the reader's locale. MSPDI uses its own `YYYY-MM-DDThh:mm:ss` format as the schema requires.
- **D-54-14:** User-authored text — task titles, labels, comments, descriptions — is **never translated**; only exporter-authored labels are localized. MSPDI's schema element names stay English; only human-facing text follows the UI language.

**Summary sheet**
- **D-54-15:** `Summary` carries project meta (name, lead, status, start date, target date, progress), KPI counts (total, open, done, overdue), then the two charts. No "needs attention" list — the SPEC's two charts plus counts are the agreed surface; an attention block would duplicate the `Tasks` sheet.
- **D-54-16:** "Overdue" means `due < export date` and not done — the same predicate the app uses (`isOver`, `src/core/store.js:364`), computed on the export date rather than live.

### Agent's Discretion

Filename pattern (recommend `{project-slug}-{YYYY-MM-DD}.xlsx`), modal layout and option ordering, endpoint method/shape and streaming strategy, generation progress feedback, chart colours and axis titles, column widths and print setup, the wording of refusal/notice toasts, the internal shape of the export model and writer modules, and how the Weekly fixture is chosen.

One product call left to the planner by default: on Overview / Files / Activity the "current view" scope has no meaning — recommend disabling it (count shown as `—`) and preselecting "All tasks"; do not silently treat the last-used view as current.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description (from SPEC.md) | Research Support |
|----|-----------------------------|------------------|
| R1 | One export entry point next to Share (icon + overflow item), visible only to project lead / workspace admin / owner | §Architecture Pattern 4 (client entry points); header cluster verified at `src/pages/project.js:73-78`; `canManageProject` verified at `src/core/store.js:353` and `server.js:837` |
| R2 | Scope selection: current filtered view or all project tasks, with both counts | `applyView` is pure and returns the exact filtered/sorted array (`src/shell/view-engine.js:122`); client sends `ids`, server selects when absent |
| R3 | Five include toggles (descriptions off, comments off, subtasks off, completed on, archived off) applied identically by all three writers | §Pattern 1 — one `buildExportModel` normalizes options once; writers never re-decide inclusion |
| R4 | Six sheets `Summary, Tasks, Board, Timeline, Members, Milestones` in order, frozen header row on each | §Pattern 2; office-kit `addWorksheet` order + `setFreezePanes` proven in the probe (`activeSheetIndex 3`, six sheets) |
| R5 | Three native, data-linked charts with cached series | §Pattern 3; `addChartAt` + `makeBarChart` + `makeBarSeries` with `cacheKind:'str'` proven to emit `c:barChart` in `chart1.xml` |
| R6 | Timeline Gantt over the full span, adaptive daily/weekly axis, bars, milestone diamonds, one elbow connector per dep, Today column, frozen left block, opens scrolled to current week | §Pattern 5 + §Code Example 3; `makeShapeDrawingItem` two-cell anchors + `bentConnector3` with `tailEnd: triangle` proven to emit `xdr:cxnSp` |
| R7 | Board sheet as a static status-lane snapshot in `backlog → todo → progress → review → done` order, empty lane still renders | `STATUSES` order verified at `src/core/constants.js:9-41`; `ST` map at line 41 |
| R8 | MSPDI XML that Microsoft Project opens without repair | §Pattern 6 + §Code Example 4; element order, enums, `FieldID`s and calendar shape all verified against Microsoft Learn this session |
| R9 | CSV-only static fallback with a "server build required" note | `api.enabled` verified at `src/core/api.js:117-119`; CSV writer is dependency-free so it runs in the browser |
| R10 | Permissions: read funnel first (404 parity), then `canManageProject` (403 + `exportForbidden`), model built only from the `docForClient`-shaped document | §Pattern 7; `docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership)` is the exact existing call shape (`server.js:4683`) |
| R11 | Every export string catalogued in EN + FR; plural forms for counts | `scripts/i18n-scan.mjs` is `prebuild`; `tFor(code,key,vars)` verified at `src/core/i18n.js:194-205` |
| R12 | Format-appropriate escaping; `=1+1` and `A & <B>` stay literal; no unintended formula cells | §Pattern 8; CSV formula-prefix rule and BOM; XML escape table; xlsx shared strings |
| R13 | 500 tasks / 400 deps export without blocking the event loop > 2 s; shape cap degrades to a table-only Timeline with a note row, never an error | §Pattern 9 (cap + yield); `workbookToBuffer` is a single async call, so the yield points are between sheets |
</phase_requirements>

---

## Summary

This phase is **one data normalization plus three serializers**, and the cheapest way to get it wrong is to let each serializer interpret the project document itself. The repo already gives us the two things that kill most export features: a pure view filter (`applyView`) and one permission predicate mirrored on both sides (`canManageProject`). Neither needs to be re-invented; both need to be *called*, in the right order, from the right tier.

The Excel writer is the only genuine dependency risk. `@office-kit/xlsx@0.26.1` was driven end-to-end this session in `/tmp/opencode/xlsx-probe/r54/probe.mjs` and produces a six-sheet workbook with a native bar chart, two-cell-anchored bars, a `bentConnector3` dependency arrow with an arrowhead, frozen panes, a scrolled `topLeftCell` and landscape print setup. Its API surface is **subpath-only** (`@office-kit/xlsx/workbook`, `/worksheet`, `/styles`, `/drawing`, `/chart`, `/node`) with **no root export**, and it has four sharp edges that are cheaper to encode once in the writer than to rediscover per task (see §Common Pitfalls). Its reader (`fromBuffer`) is **broken in 0.26.1** and must never be used to verify output; a ~25-line `node:zlib` central-directory reader is the working verification path.

The MSPDI writer is dependency-free but schema-strict: Microsoft Project is order-sensitive inside `<Project>` and `<Task>`, custom fields are `<ExtendedAttribute><FieldID>` (there is no `<Text1>` element), the FieldIDs are non-sequential (Text1–Text5 = 188743731/4/7, 188743740, 188743743), and durations are `xsd:duration`. One genuine unresolved conflict exists in Microsoft's own documentation — the XSD declares `targetNamespace="http://schemas.microsoft.com/project/2007"` while every element reference example emits `xmlns="http://schemas.microsoft.com/project"`. Recommendation: emit the **short form without `/2007`**, assert structure mechanically in CI, and gate the "no repair prompt in Project" acceptance criterion behind a human checkpoint.

**Primary recommendation:** Normalize once into a DOM-free model under `src/export/`, keep the dependency-free CSV writer beside it (the browser needs it), put the two server-only writers outside `src/` so Vite can never pull `@office-kit/xlsx` into the bundle, and post JSON to a single `/api/workspaces/:slug/projects/:id/export` route that runs the existing funnel in the existing order.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Decide who may export | API / Backend | Browser (mirror for hide-vs-show) | The gate that produces bytes must be server-side; the client copy of `canManageProject` only decides whether the control exists in the DOM (D-54-2) |
| Read resolution + 404 parity | API / Backend | — | `requireWorkspace` → `docForClient`/`redactDoc` is the only place a hidden project can be made indistinguishable from a missing one |
| Normalize project → export model | Shared (DOM-free `src/export/model.js`) | — | Both the server writers and the static-build CSV writer must consume one shape; duplicating it in the browser is how the two outputs drift |
| View scoping (`current view`) | Browser / Client | — | `applyView` needs live UI state (`S`, view prefs); the server must never re-implement filters. Client sends ids |
| Whole-project scoping (`all tasks`) | API / Backend | Browser | Server selects every non-archived task from the redacted doc, so an id list can never widen the read boundary |
| `.xlsx` generation | API / Backend (server-only module outside `src/`) | — | `@office-kit/xlsx` must not enter the client bundle (SPEC prohibition) |
| MSPDI XML generation | API / Backend (server-only module outside `src/`) | — | Same route, same gate, no per-format tier (D-54-4) |
| CSV generation | Browser / Client (static build) | API / Backend (server build) | Same writer, two callers; the spec requires CSV in both modes |
| Permission refusal messaging | Browser / Client | API (emits `exportForbidden`) | Server returns a machine code; the client localizes via `tErr` — the existing error contract |
| Filename + response headers | API / Backend | — | `fileDisposition` (`server.js:5860`) and `Cache-Control: no-store` are server-owned |
| Event-loop responsiveness | API / Backend | — | Yield between sheets; the generation is one async call, not a stream |
| Localization of exporter-authored labels | Shared (catalogue) | — | Server resolves through `tFor`; client resolves through `t`; both read the same keys |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@office-kit/xlsx` | **0.26.1 (exact, no caret)** | Server-side `.xlsx` writer: worksheets, styles, frozen panes, tables, native charts, two-cell drawing anchors, connectors, page setup | Only maintained OSS writer that emits **real charts and real connector shapes**. Verified in a sandbox this session: a generated workbook opened in LibreOffice and rendered bars, a bar chart and an arrowhead correctly. MIT, ESM, `engines.node >= 22` |
| Node built-in `node:zlib` | Node 24 | Test-only: unzip the generated `.xlsx` so tests can assert `xl/workbook.xml`, `xl/charts/*.xml` and `xl/drawings/*.xml` | Zero-dependency verification; `fromBuffer` in the library is broken in 0.26.1 (see Pitfall 6) |
| Node built-in `crypto.randomUUID` | Node 24 | MSPDI `<GUID>` values | Schema wants a GUID; no library needed |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none)* | — | CSV writer | Hand-rolled: RFC-4180 quoting + UTF-8 BOM + formula-injection prefix. ~40 lines; a library would add a dependency for less control over R12 |
| *(none)* | — | MSPDI writer | Hand-rolled string serializer with an explicit escape table. The schema is small and the element order is the whole job |
| *(none)* | — | XML well-formedness assertion in tests | ~30-line stack-based tag balancer, or `saxes` **as a devDependency** (it is already in the xlsx tree, but do not rely on a transitive dep) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@office-kit/xlsx` | `exceljs` | **Cannot write charts or shapes.** Verified in this phase's sandbox; SPEC §Background records it. A workbook without charts or Gantt fails R5 and R6 outright |
| `@office-kit/xlsx` | `xlsx` (SheetJS community) | Community build does not write charts. Pro/paid build is out of scope for this repo's zero-dependency stance |
| `@office-kit/xlsx` | MPXJ / Java sidecar | MPXJ *reads* MSPDI; a JVM sidecar in a Node-24 ESM app is an operations burden with no upside. Also the SPEC's own .mpp note defers to MPXJ's FAQ |
| Hand-rolled MSPDI | an npm MSPDI package | No maintained, schema-faithful writer found; the format is ~200 lines of `escape()` + ordered template. A dependency here buys nothing and adds a slopsquat surface |
| `workbookToBuffer` in memory | stream to `res` | The response is JSON-or-bytes, and R13's degradation path needs the *whole* generation to succeed or fail before any header is written. In-memory buffer first, then `res.end(buf)` (SPEC edge coverage: "a generation failure returns JSON before any response header, so no partial file is ever streamed") |

**Installation:**

```bash
npm install --save-exact @office-kit/xlsx@0.26.1
```

`--save-exact` is mandatory: the SPEC pins the version, and `^0.26.1` would float to 0.27.x on the next `npm install`. Current registry state (verified this session): latest is **0.27.0** (published 2026-11-09); 0.26.1 was published 2026-11-08; the package was created 2026-07-05. Stay on 0.26.1 until the phase's probe fixtures have been re-run against a newer release.

**Version verification (run before writing the plan):**

```bash
npm view @office-kit/xlsx version          # -> 0.27.0 (latest); pin 0.26.1 explicitly
npm view @office-kit/xlsx@0.26.1 dist.integrity
# -> sha512-f+7p0PHHiNtBcBmj4sBp8RnzKBQEMeh6RnEOj2aerwgzfqcf7s48PdAIbTWQoq7t9A123+UVQlUlYSOQ+uY3Mg==
npm view @office-kit/xlsx@0.26.1 dependencies
# -> { fflate: '^0.8.3', saxes: '^6.0.0' }
```

## Package Legitimacy Audit

Run of the legitimacy seam this phase (`gsd-tools query package-legitimacy check --ecosystem npm @office-kit/xlsx`):

```json
[{ "name": "@office-kit/xlsx", "verdict": "SUS", "reasons": ["too-new"], "signals": { ... } }]
```

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@office-kit/xlsx` | npm | package created 2026-07-05 (~4 months); 0.26.1 published 2026-11-08 (1 day before research) | ~161k/week | `github.com/office-kit/xlsx` | **SUS** (`too-new`) | **Flagged** — planner MUST insert a `checkpoint:human-verify` task before `npm install`, and the install task must use the exact version + integrity hash above |

**Why the SUS verdict is not a blocker here.** The signals that matter are present and healthy: a real source repository, high download volume, MIT licence, no `postinstall` script, and two well-known transitive deps (`fflate`, `saxes`). What trips the seam is publish recency — the version was published the day before this research, and the *latest* bump (0.27.0) landed hours later. That is exactly the situation the checkpoint exists for: a human confirms the package identity, the pinned version and the tarball before it enters `package.json`.

**Packages removed due to SLOP verdict:** none.
**Packages flagged as suspicious:** `@office-kit/xlsx` — one `checkpoint:human-verify` task before install, plus a post-install assertion that `node_modules/@office-kit/xlsx/package.json` reports `version: "0.26.1"` and `license: "MIT"`.

> Every other API named in this document is a **Node built-in** (`node:zlib`, `node:crypto`, `node:fs`, `node:assert`) and needs no audit.

## Architecture Patterns

### System Architecture Diagram

```
┌─ Browser ─────────────────────────────────────────────────────────────────────┐
│  Project header (icon before Share)        Project overflow menu              │
│  src/pages/project.js:73-78               src/overlays/context-menu.js:35-51   │
│  └─ both render ONLY when canManageProject(p)  (store.js:353)                 │
│        │                                        │                             │
│        └──────────────► openModal({type:'export'})  ◄─────────────────────────┘
│                              │
│                    S.ui.exportDraft = { scope:'all'|'view',                    │
│                                        options:{desc,comments,subtasks,        │
│                                                 completed,archived},           │
│                                        format:'xlsx'|'mspdi'|'csv' }           │
│                              │
│              ┌───────────────┴────────────────┐
│              │ api.enabled === false (static) │
│              ▼                                ▼
│    format list = ['csv'] only        format list = ['xlsx','mspdi','csv']
│    scope 'view' → applyView(...) → ids        │
│    buildExportModel(doc, pid, opts, {translate:t, labelName})                │
│    toCsv(model) → Blob('text/csv;charset=utf-8')                             │
│    URL.createObjectURL → <a download> click → revoke                          │
│                                               │
│                          raw fetch POST (NOT api.call — it is JSON-only)      │
└───────────────────────────────────────────────┼───────────────────────────────┘
                                                │
┌─ Server (server.js dispatcher) ───────────────▼───────────────────────────────┐
│ POST /api/workspaces/:slug/projects/:id/export                                │
│   body: { format, scope:'view'|'all', ids?:string[], options:{...} }          │
│                                                                               │
│  1. requireWorkspace(req,res,slug,'viewer')   ──fail 404 workspaceNotFound──► │
│  2. sameOrigin(req)                           ──fail 403 crossOriginRejected► │
│  3. readJson(req) + shape validation          ──fail 400 exportInvalidRequest► │
│  4. doc = docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership)         │
│        └─ normalizeDoc → normalizeProjects → syncProfiles → redactDoc          │
│  5. project lookup INSIDE the redacted doc    ──fail 404 projectNotFound─────► │
│        (identical status/body/headers to a project read → no oracle)          │
│  6. canManageProject(p, ctx.membership.member_id, ctx.membership.role)         │
│                                               ──fail 403 exportForbidden────► │
│  7. buildExportModel(redactedSlice, id, opts, {translate:(k,v)=>tFor(locale,k,v)})│
│  8. xlsx writer  │  mspdi writer  │  csv writer   (server-only modules)        │
│  9. 200 + Content-Type + Content-Disposition: fileDisposition(name,false)      │
│         + Cache-Control: no-store + Content-Length + bytes                     │
└───────────────────────────────────────────────────────────────────────────────┘
```

Note the ordering property the SPEC calls out: steps 1–6 all happen **before** a single byte is generated, so every failure exits as JSON through `fail()` and no partial file can ever be streamed.

### Recommended Project Structure

```
src/export/
├── model.js       # DOM-free, dependency-free: buildExportModel(doc, projectId, opts, deps)
├── options.js     # DEFAULT_OPTIONS + toggle validation (may live inside model.js)
├── csv.js         # dependency-free: toCsv(model) → string with BOM
└── gantt.js       # pure geometry: axis(mode), columnOf(date), barColumns(task), todayColumn

export/            # server-only, OUTSIDE src/ → Vite never sees it
├── xlsx.js        # imports @office-kit/xlsx/{workbook,worksheet,styles,drawing,chart,node}
└── mspdi.js       # string serializer, no dependency

test/
├── export-model.test.mjs
├── export-csv.test.mjs
├── export-xlsx.test.mjs
├── export-mspdi.test.mjs
├── export-permissions.test.mjs
├── export-prohibition.test.mjs
└── fixtures/export-fixtures.mjs
```

**Why `export/` and not `src/export/writers/`:** the SPEC prohibition is mechanical — "assert no `@office-kit/xlsx` import resolves under `src/`". Putting the writers outside `src/` makes that assertion trivially true and makes an accidental client import a build-time failure rather than a bundle-size regression. `server.js` already imports from `./src/…` (line 59, 61, 62), so the reverse direction (`export/xlsx.js` importing `src/export/model.js`) is the same established pattern.

### Pattern 1: One model, injected translator and label resolver

**What:** a single pure function turns a `docForClient`-shaped slice plus options into a normalized, fully-resolved model. Writers never look at project documents and never decide inclusion.
**When to use:** always — this is the only place R3's five toggles and R2's scope are interpreted.

```js
// src/export/model.js  (no DOM, no deps — importable by browser AND server)
export const DEFAULT_OPTIONS = Object.freeze({
  descriptions: false, comments: false, subtasks: false, completed: true, archived: false,
});

/**
 * @param doc       a docForClient-shaped slice: { projects, tasks, comments, members }
 * @param projectId
 * @param opts      { ids?, scope, options }
 * @param deps      { translate(key, vars), labelName(id), now: Date }
 */
export function buildExportModel(doc, projectId, opts, deps) {
  const o = { ...DEFAULT_OPTIONS, ...(opts.options || {}) };
  const now = deps.now || new Date();
  const project = (doc.projects || []).find(p => p.id === projectId);
  if (!project) return null;                       // caller maps this to 404

  const byId = new Map((doc.tasks || []).filter(t => t.project === projectId).map(t => [t.id, t]));
  let top = [...byId.values()].filter(t => o.archived || !t.archived);
  if (!o.completed) top = top.filter(t => t.status !== 'done');

  // Scope: ids from applyView keep the view's sort; 'all' uses project manual order.
  let ordered;
  if (Array.isArray(opts.ids)) {
    const rank = new Map(opts.ids.map((id, i) => [id, i]));
    ordered = top.filter(t => rank.has(t.id))
      .sort((a, b) => rank.get(a.id) - rank.get(b.id));
  } else {
    ordered = top.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  // … rows, subtask expansion, comments join, KPI counts, chart blocks …
  return { project, rows, kpis, charts, labels: { /* resolved strings */ }, options: o, exportDate: now };
}
```

`translate` is injected, never imported: the browser passes the client `t`, the server passes `(k, v) => tFor(locale, k, v)`. That is what makes D-54-12 (`French report, English sheet names`) work without mutating the i18n singleton — which `tFor` exists specifically to avoid.

**Label ids:** `src/core/constants.js` defines `LABELS` with a lazy `name` getter that reads the *client* singleton (`t('task.label.<id>')` for every entry — verified for backend/research/content/bug/qa/growth). Do **not** call `LB[id].name` in a server writer; it would resolve against the server default locale. Instead inject `labelName`, and — if the server needs the key mapping — add one exported helper beside `LB` (e.g. `export const labelKey = id => 'task.label.' + id;`). One line, no behaviour change, no duplicated map.

### Pattern 2: Workbook assembly order

**What:** create all six sheets up front in the required order, then fill them; set `bookViews` explicitly; freeze row 1 on every sheet; page setup once at the end.
**When to use:** always (R4). Sheet *order* is the acceptance criterion, so never create sheets lazily.

```js
import { createWorkbook, addWorksheet, setActiveSheet, makeWorkbookView } from '@office-kit/xlsx/workbook';
import { setCell, setFreezePanes, setColumnWidth, makePageSetup } from '@office-kit/xlsx/worksheet';
import { formatAsHeader } from '@office-kit/xlsx/styles';
import { workbookToBuffer } from '@office-kit/xlsx/node';

const wb = createWorkbook();
const SHEETS = ['Summary', 'Tasks', 'Board', 'Timeline', 'Members', 'Milestones']; // English, fixed
const s = SHEETS.map(name => addWorksheet(wb, name));
```

**`setActiveSheet` alone is not enough.** Verified this session: `setActiveSheet(wb, 'Timeline')` sets `wb.activeSheetIndex = 3` but emits **no `<bookViews>`**, so Excel is free to open on the first tab. Add:

```js
wb.bookViews = [makeWorkbookView({ activeTab: wb.activeSheetIndex })];   // -> <workbookView activeTab="3"/>
```

The unzipped `bv.xlsx` from the probe shows exactly `<workbookView activeTab="3"/>`, which is the only thing that makes "opens on Timeline" true.

Freeze every sheet's header: `setFreezePanes(ws, 'A2')`; on Timeline use `setFreezePanes(ws, 'D2')` so the three task columns **and** row 1 stay pinned.

### Pattern 3: Native charts with cached series

**What:** each chart is a `c:barChart` over a real cell range on its own sheet, with a cached series so it renders before any recalculation.
**When to use:** the two `Summary` charts and the `Members` chart (R5).

```js
import { makeBarChart, makeBarSeries, makeChartSpace } from '@office-kit/xlsx/chart';
import { addChartAt, makeShapeProperties, makeSolidFill, makeColor, makeSrgbColor, makeLine } from '@office-kit/xlsx/drawing';

const series = makeBarSeries({
  idx: 0, order: 0,
  tx:  { kind: 'literal', value: 'Tasks' },
  cat: { ref: 'Summary!$A$2:$A$4', cacheKind: 'str', cache: ['done', 'todo', 'backlog'] },
  val: { ref: 'Summary!$B$2:$B$4', cache: [1, 0, 0] },
});
series.spPr = makeShapeProperties({                       // makeBarSeries DROPS spPr
  fill: makeSolidFill(makeColor(makeSrgbColor('4F46E5'))),
  ln:   makeLine({ fill: makeSolidFill(makeColor(makeSrgbColor('312E81'))) }),
});
addChartAt(s[0], 'D2',
  { space: makeChartSpace({ plotArea: { chart: makeBarChart({ barDir: 'col', grouping: 'clustered', series: [series] }) },
                            title: 'Tasks by status' }) },
  { widthPx: 520, heightPx: 300 });
```

Cached series are not cosmetic: without `cache`/`cacheKind` the chart opens blank in viewers that do not recalculate. `cacheKind: 'str'` is required for text categories — omit it and the categories come out numeric/blank.

**All-zero data:** the SPEC's edge coverage says omit the chart rather than draw empty axes. Decide this in the model (`charts.status = null` when every count is 0), not in the writer.

### Pattern 4: Client entry points, modal state, and blob download

**What:** one modal type, opened by two controls that both exist only under `canManageProject`; the download is a raw fetch + object URL, because `api.call` cannot carry a binary response.
**When to use:** R1, R2, R9.

Verified constraint — `src/core/api.js:59-100`:
```js
const text = await res.text();
if (text) { try { data = JSON.parse(text); } catch { /* non-JSON response */ } }
```
`call()` always drains the body as text and parses JSON. A `.xlsx` therefore becomes a corrupted string. Add a sibling on `api` (or a small `src/core/download.js`) that does:

```js
export async function download(path, body) {
  const res = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));       // errors are JSON
    return { ok: false, status: res.status, error: tErr(err.code, err, err.error) };
  }
  const blob = await res.blob();
  return { ok: true, blob, filename: filenameFrom(res.headers.get('content-disposition')) };
}

function filenameFrom(cd) {
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd || '');
  if (star) return decodeURIComponent(star[1]);
  const plain = /filename="([^"]+)"/i.exec(cd || '');
  return plain ? plain[1] : 'export';
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
```

Parse `filename*` first: `fileDisposition` emits both forms (`server.js:5860-5868`) and only the RFC 5987 form survives non-ASCII project names.

**Static mode:** `api.enabled === false` (`src/core/api.js:117-119`) → the modal renders only CSV, computes `ids` via `applyView(allTasks(), viewOf(key))`, runs the same model with the client `t`, and saves a `Blob` locally. The "server build required" note lives in an `export.notice.staticMode` catalogue key.

**Scope on non-view tabs:** on Overview / Files / Activity there is no active saved view — follow the Agent's Discretion note: disable "current view", render the count as `—`, preselect "All tasks".

### Pattern 5: Gantt geometry (adaptive axis)

**What:** one pure geometry module shared by the writer and its tests. Everything — bar columns, milestone column, Today column, connector anchors — derives from `columnOf(dateISO)`.
**When to use:** R6, always, including when there are zero dated tasks.

```js
// src/export/gantt.js
export const DAILY_LIMIT_DAYS = 90;

export function makeAxis({ paddedStart, paddedEnd, exportDate }) {
  const span = diffDays(paddedStart, paddedEnd) + 1;      // inclusive
  const mode = span <= DAILY_LIMIT_DAYS ? 'daily' : 'weekly';
  const width = mode === 'daily' ? span : Math.ceil(span / 7);
  const columnOf = iso => mode === 'daily'
    ? diffDays(paddedStart, iso)
    : Math.floor(diffDays(paddedStart, iso) / 7);
  return { mode, columns: width, columnOf, today: columnOf(exportDate) };
}
```

Rules the acceptance criteria pin down:

- span is the **padded full-project span** (`min(starts, project.start)` → `max(dues, project.due, today)`, padded to whole weeks), not the task count;
- the boundary is inclusive: **90 days stays daily, 91 switches to weekly** — write both fixtures;
- on the weekly axis a bar covers `columnOf(start) … columnOf(due)`; a task inside one week has width 1;
- `start == due` is a one-day bar (width 1 on both axes);
- the Today column uses the same `columnOf(exportDate)`;
- zero dated tasks: table + Today column + zero bars, no error.

Anchor conversion (0-based marker → sheet): the first date column is sheet column **4** (column D), so `markerCol = columnOf(date) + 3`.

### Pattern 6: MSPDI serializer — ordered templates, no DOM, no library

**What:** build the document as a string with an explicit escape function, emitting children in schema order. Order is not cosmetic: Project treats the sequence as positional.
**When to use:** R8, always.

```js
const escXml = s => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
```

Minimal, verified-shape skeleton (child order from Microsoft's `Project` and `Task` element pages):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <SaveVersion>12</SaveVersion>
  <GUID>{...}</GUID>
  <Name>ProjectName.xml</Name>
  <Title>…</Title>
  <CreationDate>2026-11-09T00:00:00</CreationDate>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>2026-11-02T08:00:00</StartDate>
  <FinishDate>2026-12-11T17:00:00</FinishDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <DefaultFinishTime>17:00:00</DefaultFinishTime>
  <MinutesPerDay>480</MinutesPerDay>
  <MinutesPerWeek>2400</MinutesPerWeek>
  <DaysPerMonth>20</DaysPerMonth>
  <DurationFormat>7</DurationFormat>
  <ExtendedAttributes>
    <ExtendedAttribute><FieldID>188743731</FieldID><FieldName>Text1</FieldName></ExtendedAttribute>
    <!-- Text2 188743734, Text3 188743737, Text4 188743740, Text5 188743743 -->
  </ExtendedAttributes>
  <Calendars>…</Calendars>
  <Tasks>
    <Task>
      <UID>1</UID>
      <ID>1</ID>
      <Name>…</Name>
      <Type>1</Type>
      <Start>2026-11-02T08:00:00</Start>
      <Finish>2026-11-03T17:00:00</Finish>
      <Duration>PT16H0M0S</Duration>
      <DurationFormat>7</DurationFormat>
      <Milestone>0</Milestone>
      <PercentComplete>45</PercentComplete>
      <PredecessorLink>
        <PredecessorUID>2</PredecessorUID>
        <Type>1</Type>
        <CrossProject>0</CrossProject>
        <LinkLag>0</LinkLag>
        <LagFormat>7</LagFormat>
      </PredecessorLink>
      <ExtendedAttribute><FieldID>188743731</FieldID><Value>PRJ-12</Value></ExtendedAttribute>
    </Task>
  </Tasks>
  <Resources>…</Resources>
  <Assignments>…</Assignments>
</Project>
```

Hard facts, each verified against Microsoft Learn this session (see §Sources):

- `<Project>` child order: `SaveVersion, …, ExtendedAttributes, Calendars, Tasks, Resources, Assignments`.
- `<Task>` child order: `UID, ID, Name, Type, …, Start, Finish, Duration, DurationFormat, …, Milestone, …, PercentComplete, …, PredecessorLink, …, ExtendedAttribute`.
- `<UID>` is the only **required** `<Task>` child; `<Task>` requires at least one task in `<Tasks>`, so an empty project must **omit** `<Tasks>` entirely (same for `Calendars`, `Resources`, `Assignments` — each collection requires ≥ 1 child).
- There is **no `<Text1>` element.** Custom fields are `<ExtendedAttribute><FieldID>…</FieldID><Value>…</Value></ExtendedAttribute>`.
- `FieldID` values are non-sequential: Text1 **188743731**, Text2 **188743734**, Text3 **188743737**, Text4 **188743740**, Text5 **188743743**.
- `PredecessorLink` order: `PredecessorUID, Type, CrossProject, CrossProjectName, LinkLag, LagFormat`.
- `PredecessorLink/Type`: 0 = FF, **1 = FS**, 2 = SF, 3 = SS.
- `Task/Type`: 0 = fixed units, 1 = fixed duration, 2 = fixed work. `Resource/Type`: 0 = material, 1 = work, 2 = cost.
- `DurationFormat` 7 = days; 21 and 53 = null.
- Dates are `YYYY-MM-DDThh:mm:ss` with **no** `Z` and no offset; durations are `xsd:duration` (`PT16H0M0S`).
- Milestone = `<Milestone>1</Milestone>`, `<Duration>PT0H0M0S</Duration>`, `Start === Finish`.
- Calendar: `<WeekDay><DayType>1..7</DayType><DayWorking>0|1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime>…</WorkingTimes></WeekDay>` with DayType **1 = Sunday … 7 = Saturday** (Microsoft's example: 1 and 7 non-working, 2–6 working 08:00–12:00 + 13:00–17:00).
- Assignment order starts `UID, GUID, TaskUID, ResourceUID, PercentWorkComplete, …, Finish, …, Start, …, Units, …, Work`.

**Duration derivation (SPEC R8: 1 d = 8 h).** `estimate` is stored as ASCII `^(\d+)([mhd])$` — the repo's own formatter contract (`src/core/i18n.js:508-519`). Add a tiny parser in the model: `m → n`, `h → 60n`, `d → 480n` minutes; fall back to `workingDaysInclusive(start, due) * 480` when `estimate` is absent, and to `PT0H0M0S` when neither exists.

### Pattern 7: The endpoint funnel (order is the security property)

**What:** reproduce the existing read chain exactly, then add the manage gate. Build the model from the **redacted** document only.
**When to use:** R10 — non-negotiable.

```js
// inside the /api/ dispatcher, before any generation
const exportMatch = pathname.match(/^\/api\/workspaces\/([a-z0-9-]{2,40})\/projects\/([A-Za-z0-9_-]{1,64})\/export$/);
if (exportMatch && method === 'POST') {
  const ctx = await requireWorkspace(req, res, exportMatch[1], 'viewer'); // 404 workspaceNotFound
  if (!ctx) return;
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');

  const body = await readJson(req);
  if (!EXPORT_FORMATS.includes(body?.format)) {
    return fail(res, 400, 'exportInvalidRequest', 'Provide a supported export format');
  }

  // The ONLY document this route may touch. Never ctx.ws.doc.
  const doc = await docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership);

  const project = (doc?.data?.projects || []).find(p => p.id === exportMatch[2]);
  if (!project) return fail(res, 404, 'projectNotFound', 'Project not found'); // 404 parity

  if (!canManageProject(project, ctx.membership.member_id, ctx.membership.role)) {
    return fail(res, 403, 'exportForbidden', 'You do not have permission to export this project');
  }
  // … generate, then headers + bytes
}
```

Two details that are easy to get wrong:

- `ctx.ws.doc` is a **JSON string**; every read parses it first. The existing call is `docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership)` (`server.js:4683`).
- `canManageProject`'s server signature is positional — `canManageProject(p, memberId, role)` (`server.js:837-840`) — not the client's `(p)` (`src/core/store.js:353-356`):
  ```js
  function canManageProject(p, memberId, role) {
    if (role === 'owner' || role === 'admin') return true;
    return !!memberId && p?.lead === memberId;
  }
  ```
  Note the **lower-case** role strings on the server vs the client's `Owner`/`Admin`.

**New error code:** `exportForbidden` (and `exportInvalidRequest` if you validate). Both must exist in `en.json` **and** `fr.json` as `err.exportForbidden` / `err.exportInvalidRequest`, because `test/error-codes.test.mjs` scrapes every `fail(res, <n>, '<code>'` literal out of `server.js` and asserts both catalogues (verified: lines 22-32 of that test).

### Pattern 8: Escaping per format

**What:** each writer escapes for its own format, once, at the boundary.
**When to use:** always (R12).

| Format | Rule |
|--------|------|
| xlsx | `setCell` writes strings into the shared-string table — no formula interpretation. **Never** build a cell value that begins with `=`; the writer must not use a formula cell type for user text. Verify by asserting `xl/worksheets/sheet*.xml` has no `<c … t="str"><f>` for user data |
| MSPDI | `& < > " '` → `&amp; &lt; &gt; &quot; &apos;`, applied to every `<Name>`, `<Notes>`, `<Value>`, label join |
| CSV | RFC-4180 quoting (`"` doubled, field quoted when it contains `, " \r \n`), UTF-8 **BOM** prefix (`\uFEFF`), and prefix `'` when the field starts with `= + - @` |

The CSV prefix is a data-safety measure, not cosmetics: `=1+1` would otherwise be a live formula when the file is opened in Excel/LibreOffice/Sheets.

### Pattern 9: Shape cap and event-loop yield

**What:** count the shapes before drawing; past the cap, keep the table and write a note row.
**When to use:** R13, always.

```js
const SHAPE_CAP = 400;                            // bars + connectors, not milestones
const shapes = model.gantt.bars.length + model.gantt.links.length;
if (shapes <= SHAPE_CAP) {
  // build DrawingItems, including milestone diamonds
} else {
  setCell(timelineWs, capNoteRow, 1, model.labels.timelineTruncated);  // catalogue key
  // table stays; no bars, no connectors; workbook remains valid
}
```

The cap covers **bars + connectors**; milestone diamonds are cheap but count them in the same budget if the planner prefers one number — state the choice in the plan so the fixture and the acceptance criterion agree.

For responsiveness: generation is a sequence of synchronous sheet builders plus one `await workbookToBuffer(wb)`. Yield between sheets with `await new Promise(r => setImmediate(r))` (Node) or `scheduler.yield()` where available. That gives other requests a turn without restructuring into a stream — and it preserves the "all bytes or a JSON error" property that the SPEC's concurrency edge requires.

### Anti-Patterns to Avoid

- **Scraping rendered HTML.** Board/List/Timeline are three renderings of one document; parsing them re-introduces every view bug into the file. Use the model.
- **Re-implementing view filters on the server.** Two implementations of `applyView` will drift. Send ids.
- **Reading `ctx.ws.doc` in the export path.** It bypasses `redactDoc` — the exact leak R10 forbids. Even a `JSON.parse(ctx.ws.doc)` for "just the project name" is the bug.
- **Using `fromBuffer` to verify your own output in tests.** Broken in 0.26.1 ("Cannot read properties of undefined (reading 'map')") even on a trivial workbook.
- **Trusting `setActiveSheet` to open the right tab.** It does not emit `<bookViews>`; add `wb.bookViews = [makeWorkbookView({ activeTab })]`.
- **Calling `ws.setFitToPage(...)` / `makeTwoCellAnchor`.** Neither is exported in 0.26.1. Use `ws.pageSetup = makePageSetup({ orientation:'landscape', fitToWidth:1, fitToHeight:0 })` and `makeShapeDrawingItem({ kind:'twoCell', … })`.
- **Rendering description HTML.** Descriptions are stripped to plain text (D-54-11); a `<script>` in a description must never be interpreted by any consumer.
- **Translating user text.** Only exporter-authored labels go through the catalogue (D-54-14). A task titled "Conception" stays "Conception" in an English report.
- **A `Comments` sheet.** D-54-8 keeps six sheets; comments are columns.
- **Counting subtask rows in KPIs or charts.** D-54-10 — top-level only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| OOXML packaging (zip, `[Content_Types].xml`, rels, shared strings, styles part) | A `.xlsx` writer | `@office-kit/xlsx` | ~2 000 lines of OPC plumbing; one wrong rel id and Excel reports a corrupt file |
| Charts | SVG or an image pasted into a sheet | `makeBarChart` + `makeBarSeries` + `addChartAt` | The SPEC requires `xl/charts/chart1.xml` with `c:barChart` and `c:numRef`/`c:strRef` — an image fails R5 mechanically |
| Connector shapes | A drawn polyline image | `makeShapeDrawingItem(..., { connector:true, spPr: makeShapeProperties({ geometry: makePresetGeometry('bentConnector3'), ln: makeLine({ tailEnd:{type:'triangle'} }) }) })` | Emits a real `<xdr:cxnSp>` with `<a:tailEnd type="triangle"/>`, which the acceptance criterion names |
| Frozen panes / scrolled viewport | Manual `sheetView` XML | `setFreezePanes(ws,'D2')`; `makeSheetView({ topLeftCell })` / `wb.bookViews = [makeWorkbookView({ activeTab })]` | The library models both; hand-editing `views[0]` is what the probe had to do and it is fragile |
| MSPDI element ordering | "XML is order-insensitive" assumptions, or a generic object→XML dump | Explicit ordered template strings | Project is positional; a reordered `<Task>` triggers the repair prompt. The order is fully documented (see §Sources) |
| A well-formedness check for the MSPDI test | A regex `assert(/^<Project/)` | ~30-line stack balancer, or `saxes` **as a devDependency** | A regex cannot catch an unclosed `<Task>`; Project can |
| CSV escaping | String concatenation | RFC-4180 quoting + BOM + `= + - @` prefix | Spreadsheet formula injection is a real, reachable attack surface here (user-controlled titles) |
| Unzipping the `.xlsx` in tests | `@office-kit/xlsx/node`'s `fromBuffer` | ~25-line `node:zlib` central-directory reader (§Code Example 2) | `fromBuffer` is broken in 0.26.1 |

**Key insight:** in this phase the *only* thing worth building by hand is the data model. Everything downstream of "bytes on the wire" is either a solved library problem or a 30-line, fully-specified format rule (CSV) — and both MSPDI and CSV are small enough that a dependency would cost more in supply-chain surface than it saves.

## Runtime State Inventory

Not applicable — this is a greenfield feature. No stored data, live-service config, OS-registered state, secret or build artifact embeds an export identifier. The one *runtime* interaction is read-only: the endpoint serializes an existing document and writes no state. Verified: no `export` route, table, or column exists in `server.js`, and `package.json` gains exactly one dependency.

## Common Pitfalls

### Pitfall 1: `@office-kit/xlsx` has no root export

**What goes wrong:** `import { createWorkbook } from '@office-kit/xlsx'` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
**Why it happens:** the package's `exports` map only defines subpaths — `./cell`, `./chart`, `./chartsheet`, `./drawing`, `./io`, `./node`, `./packaging`, `./schema`, `./streaming`, `./styles`, `./utils`, `./workbook`, `./worksheet`, `./xml`, `./zip`. There is no `"."` entry (verified from `node_modules/@office-kit/xlsx/package.json`).
**How to avoid:** import only from `/workbook`, `/worksheet`, `/styles`, `/drawing`, `/chart`, `/node`.
**Warning signs:** a bundler "module not found" that mentions the bare package name.

### Pitfall 2: a `Date` cell shows `46328` (or shifts a day)

**What goes wrong:** the cell renders the raw serial number, or a date lands one day early.
**Why it happens:** two separate behaviours. (a) Writing a `Date` produces a serial but **no number format** is applied automatically, so the cell displays a number. (b) `Date` values serialize using **UTC components** (`Date.UTC(getUTCFullYear…)` in `datetime-*.mjs:33`), so `new Date(2026, 10, 2)` in a UTC+X timezone becomes the previous day.
**How to avoid:** build dates as UTC midnight — `new Date(\`${iso}T00:00:00Z\`)` — and always pair the write with `setCellNumberFormat(wb, cell, 'yyyy-mm-dd')` (or `setCellAsDate(wb, cell)` which defaults to the same format).
**Warning signs:** a date column that sorts correctly but displays `46328`; a bar whose first covered column is one left of the expected.

### Pitfall 3: `setActiveSheet` does not make Excel open on that sheet

**What goes wrong:** the file opens on `Summary`, not `Timeline`, and "scrolls to the current week" never happens.
**Why it happens:** `setActiveSheet` sets `wb.activeSheetIndex` but emits **no `<bookViews>`**; without a `<workbookView activeTab="…">` the consumer is free to pick the first tab.
**How to avoid:** `wb.bookViews = [makeWorkbookView({ activeTab: wb.activeSheetIndex })];` and assert `<workbookView activeTab="3"/>` in the unzipped `xl/workbook.xml`. Scroll target: `makeSheetView({ topLeftCell })` on the Timeline sheet (the probe patched `views[0].pane.topLeftCell`; `makeSheetView`/`makeFreezePane` is the supported route).
**Warning signs:** `activeSheetIndex` is 3 in code but the opened workbook shows sheet 1.

### Pitfall 4: `makeBarSeries` silently drops `spPr`

**What goes wrong:** the chart renders with default theme colours; the brand palette is ignored.
**Why it happens:** the factory does not forward a `spPr` option. **How to avoid:** assign after construction — `series.spPr = makeShapeProperties({ fill: …, ln: … })`.
**Warning signs:** bars are blue/grey regardless of the colour you passed.

### Pitfall 5: text categories come out blank; two-cell bars are half-height

**What goes wrong:** (a) the chart's category axis shows `1, 2, 3` or nothing; (b) a Gantt bar occupies only the top half of its row.
**Why it happens:** (a) `CategoryRef` needs `cacheKind: 'str'` plus the `cache` array for string categories; (b) a two-cell anchor's `to.row` must be `row + 1` to reach the next row boundary.
**How to avoid:** `cat: { ref: 'Summary!$A$2:$A$4', cacheKind: 'str', cache: [...] }`; `to: marker(colOf(due) + 4, row0 + 1)`.
**Warning signs:** a chart with axes but no bars; bars floating in the top half of the row.

### Pitfall 6: `fromBuffer` is broken in 0.26.1

**What goes wrong:** the verification test throws `Cannot read properties of undefined (reading 'map')`.
**Why it happens:** the reader path in 0.26.1 fails even on a trivial workbook it just wrote. **How to avoid:** never use it to verify output; unzip with `node:zlib` (§Code Example 2). If a future version fixes it, that is a separate migration.
**Warning signs:** the error appears inside the library's `map` call, on a file that opens fine in LibreOffice.

### Pitfall 7: `makeTwoCellAnchor` / `setFitToPage` / `setPageOrientation` / `setPageMargins` are not exported

**What goes wrong:** the import is `undefined` and the call throws at generation time.
**Why it happens:** `drawing/index.d.ts` exports only `makeOneCellAnchor` (plus `addChartAt`/`addImageAt` helpers); page setup is a worksheet property, not a set of setters.
**How to avoid:** use `makeShapeDrawingItem({ kind: 'twoCell', … })`, and `ws.pageSetup = makePageSetup({ orientation: 'landscape', fitToWidth: 1, fitToHeight: 0 })`.
**Warning signs:** `TypeError: makeTwoCellAnchor is not a function`.

### Pitfall 8: MSPDI element order triggers the repair prompt

**What goes wrong:** Project offers to repair, or drops fields, or refuses the file.
**Why it happens:** the schema's `xsd:sequence` is enforced positionally. `<PercentComplete>` before `<Milestone>`, or `<Tasks>` before `<ExtendedAttributes>`, is invalid even though it "looks fine".
**How to avoid:** emit from ordered templates, never from an object spread. Keep `<ExtendedAttributes>` before `<Calendars>` before `<Tasks>` before `<Resources>` before `<Assignments>`, and inside `<Task>`: `UID, ID, Name, Type, Start, Finish, Duration, DurationFormat, Milestone, PercentComplete, PredecessorLink, ExtendedAttribute`.
**Warning signs:** Project's repair dialog; a task that loses its custom fields on import.

### Pitfall 9: writing `<Text1>` as an element

**What goes wrong:** the custom fields never appear in Project.
**Why it happens:** there is no `<Text1>` element in MSPDI. Custom values are `<ExtendedAttribute><FieldID>188743731</FieldID><Value>…</Value></ExtendedAttribute>`, and the FieldIDs are **not sequential** (Text1–5 = 188743731 / 734 / 737 / 740 / 743).
**How to avoid:** keep a single `FIELD_ID` constant map in `export/mspdi.js`; define the attributes once in the project-level `<ExtendedAttributes>` block.
**Warning signs:** values present in the XML, invisible in Project.

### Pitfall 10: the MSPDI namespace is ambiguous in Microsoft's own docs

**What goes wrong:** you pick one and a real Project install rejects the other.
**Why it happens:** the XSD page declares `targetNamespace="http://schemas.microsoft.com/project/2007"`, while the element-reference examples (including `<SaveVersion>`) emit `<Project xmlns="http://schemas.microsoft.com/project">`. Both are first-party pages.
**How to avoid:** emit the **short form** `xmlns="http://schemas.microsoft.com/project"` (it is what every reference example and MPXJ's reader use), assert the namespace string in the structure test, and put the "opens in Project without repair" criterion behind a human checkpoint. Record the choice in the plan so a later reader does not "fix" it.
**Warning signs:** Project 2007-family installs failing to see tasks; a namespace mismatch on the root.

### Pitfall 11: empty collections make an invalid document

**What goes wrong:** a project with no resources emits `<Resources></Resources>` and the file is rejected.
**Why it happens:** each of `Tasks`, `Calendars`, `Resources`, `Assignments` requires at least one child if present.
**How to avoid:** omit the whole collection element when it would be empty. Same rule for `<PredecessorLink>` (only emit when the link resolves) and `<ExtendedAttribute>` (only when the value is non-empty).
**Warning signs:** Project reports "unexpected end of file" or ignores the whole collection.

### Pitfall 12: `api.call` cannot carry a binary response

**What goes wrong:** the downloaded `.xlsx` is a few kilobytes of JSON-shaped garbage.
**Why it happens:** `call()` does `await res.text()` then `JSON.parse` (`src/core/api.js:59-100`). **How to avoid:** a dedicated `download()` using `res.blob()`, with a JSON fallback branch for `!res.ok` (§Pattern 4).
**Warning signs:** a file that opens as text; a `SyntaxError` swallowed by the `catch`.

### Pitfall 13: the wrong `canManageProject`

**What goes wrong:** the endpoint 403s a project lead, or grants a plain member.
**Why it happens:** the client predicate takes `(p)` and compares `role === 'Owner' | 'Admin'` (`src/core/store.js:353-356`); the server takes `(p, memberId, role)` and compares `role === 'owner' | 'admin'` (`server.js:837-840`). Casing and arity differ.
**How to avoid:** call the server one positionally with `ctx.membership.member_id` and `ctx.membership.role`. Test both role families and the lead.
**Warning signs:** a lead sees the button but gets 403; an admin passes but a lead does not.

### Pitfall 14: reading `ctx.ws.doc` in the export path

**What goes wrong:** a redacted field (a hidden project's data, a member-only field) leaks into a file.
**Why it happens:** `ctx.ws.doc` is the **raw** stored JSON string; only `docForClient` runs `normalizeDoc` → `normalizeProjects` → `syncProfiles` → `redactDoc`.
**How to avoid:** one `docForClient(...)` call, then everything from its return value. This is a judgment prohibition in the SPEC (verify-time code review), so leave a comment at the call site.
**Warning signs:** a `ctx.ws.doc` reference anywhere in the export module.

### Pitfall 15: CSV formula injection and a missing BOM

**What goes wrong:** `=1+1` executes on open; or French accents render as `Ã©`.
**Why it happens:** spreadsheets evaluate `= + - @` prefixes; and without a BOM some consumers guess the encoding.
**How to avoid:** prefix `'` before quoting, and prepend `\uFEFF`. Test with `=1+1`, `+33 6`, `-5`, `@handle`, `A & <B>` and `Conception — été`.
**Warning signs:** a cell that shows an error value instead of text.

### Pitfall 16: the i18n gate fails late

**What goes wrong:** `npm run build` fails on a literal or a missing key, after all the code is written.
**Why it happens:** `prebuild` runs `scripts/i18n-scan.mjs`, which scans `src/` for user-visible literals and asserts every `t('…')` key resolves with matching placeholders; `test/error-codes.test.mjs` separately asserts every `fail()` code has an `err.<code>` entry in **both** catalogues.
**How to avoid:** add all `export.*` and `err.exportForbidden` keys to `en.json` **and** `fr.json` in the same task that introduces them; keep all user-facing literals out of `src/export/*` (pass them through `translate`).
**Warning signs:** a build failure naming a key you just added; a French build rendering an English string.

### Pitfall 17: the client bundle grows by a server library

**What goes wrong:** the SPA bundle gains ~1 MB and the prohibition test fails.
**Why it happens:** one `import … from '../../export/xlsx.js'` in a client module, or the writer placed under `src/`.
**How to avoid:** writers live in `export/` (outside `src/`); the model and CSV writer in `src/export/` import nothing heavier than each other.
**Warning signs:** Vite reports a new large chunk; the prohibition test's `src/` scan finds a match.

## Code Examples

### 1. Gantt shapes: bars, diamonds, one connector per dependency

```js
// export/xlsx.js — patterns verified in /tmp/opencode/xlsx-probe/r54/probe.mjs
import { makeDrawing, makeShapeDrawingItem, makeShapeProperties, makePresetGeometry,
         makeSolidFill, makeColor, makeSrgbColor, makeLine } from '@office-kit/xlsx/drawing';

const marker = (col, row, rowOff = 0) => ({ col, colOff: 0, row, rowOff });

const items = [];
const STATUS_FILL = { backlog: '94A3B8', todo: '60A5FA', progress: 'F59E0B', review: 'A78BFA', done: '22C55E' };

for (const [i, bar] of model.gantt.bars.entries()) {
  const row0 = bar.row;                                   // 0-based sheet row
  items.push(makeShapeDrawingItem(
    { kind: 'twoCell', editAs: 'twoCell',
      from: marker(axis.columnOf(bar.start) + 3, row0),    // +3 → column D (first date col)
      to:   marker(axis.columnOf(bar.due)   + 4, row0 + 1) }, // +4 → boundary after the last col
    { name: `bar-${i}`, spPr: makeShapeProperties({
        geometry: makePresetGeometry('roundRect'),
        fill: makeSolidFill(makeColor(makeSrgbColor(STATUS_FILL[bar.status] || '94A3B8'))),
      }) },
  ));
}

for (const [i, m] of model.gantt.milestones.entries()) {
  items.push(makeShapeDrawingItem(
    { kind: 'twoCell', editAs: 'twoCell',
      from: marker(axis.columnOf(m.date) + 3, m.row),
      to:   marker(axis.columnOf(m.date) + 4, m.row + 1) },
    { name: `ms-${i}`, spPr: makeShapeProperties({
        geometry: makePresetGeometry('diamond'),
        fill: makeSolidFill(makeColor(makeSrgbColor('F59E0B'))),
      }) },
  ));
}

for (const [i, link] of model.gantt.links.entries()) {
  items.push(makeShapeDrawingItem(
    { kind: 'twoCell', editAs: 'oneCell',
      from: marker(axis.columnOf(link.predDue) + 4, link.predRow, 700000), // right edge of finish column
      to:   marker(axis.columnOf(link.succStart) + 3, link.succRow, 300000) }, // left edge of start column
    { connector: true, name: `link-${i}`, spPr: makeShapeProperties({
        geometry: makePresetGeometry('bentConnector3'),
        ln: makeLine({ w: 12700,
                       fill: makeSolidFill(makeColor(makeSrgbColor('475569'))),
                       tailEnd: { type: 'triangle', w: 'med', len: 'med' } }),
      }) },
  ));
}

timelineWs.drawing = makeDrawing(items);   // one assignment for the whole sheet
```

Order matters for legibility, and the SPEC's edge coverage says so: draw bars first, then milestones, then connectors — so arrows sit on top.

### 2. Test-only `.xlsx` reader (replaces the broken `fromBuffer`)

```js
// test/helpers/unzip.mjs
import { inflateRawSync } from 'node:zlib';

export function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip archive');

  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map();

  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(p + 10);
    const csize  = buf.readUInt32LE(p + 20);
    const nlen   = buf.readUInt16LE(p + 28);
    const elen   = buf.readUInt16LE(p + 30);
    const clen   = buf.readUInt16LE(p + 32);
    const lho    = buf.readUInt32LE(p + 42);
    const name   = buf.toString('utf8', p + 46, p + 46 + nlen);

    const lnlen  = buf.readUInt16LE(lho + 26);
    const lelen  = buf.readUInt16LE(lho + 28);
    const start  = lho + 30 + lnlen + lelen;
    const raw    = buf.subarray(start, start + csize);
    out.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nlen + elen + clen;
  }
  return out;   // Map<string, Buffer>
}
```

Proven this session against the probe's `out.xlsx`: it lists the six worksheets and finds `<c:barChart>` in `xl/charts/chart1.xml`.

### 3. CSV writer (browser + server, no dependency)

```js
// src/export/csv.js
const BOM = '\uFEFF';
const RISKY = /^[=+\-@]/;
const cell = v => {
  let s = v == null ? '' : String(v);
  if (RISKY.test(s)) s = "'" + s;                       // formula-injection guard (R12)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(model) {
  const head = model.headers.task;                      // already localized by translate()
  const body = model.rows.map(r => [r.key, r.title, r.statusLabel, r.assigneeName,
                                    r.start, r.due, r.progress]);
  return BOM + [head, ...body].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
```

### 4. Catalogue keys (both `en.json` and `fr.json`)

```json
{
  "export.title": "Export project",
  "export.subtitle": "Choose what to include. Sheets are always named in English.",
  "export.scope.view": "Current view",
  "export.scope.all": "All tasks",
  "export.scope.count": "{n} tasks",
  "export.option.descriptions": "Include descriptions",
  "export.option.comments": "Include comments",
  "export.option.subtasks": "Include subtasks",
  "export.option.completed": "Include completed tasks",
  "export.option.archived": "Include archived tasks",
  "export.format.xlsx": "Excel report (.xlsx)",
  "export.format.mspdi": "Microsoft Project XML (.xml)",
  "export.format.csv": "CSV (.csv)",
  "export.notice.mspdiNotMpp": "This is MSPDI XML, not .mpp.",
  "export.notice.staticMode": "Charts, dependency arrows and multi-sheet reports need the server build.",
  "export.col.key": "Key",
  "export.col.thread": "Thread",
  "export.timeline.truncated": "Too many bars to draw — showing the table only.",
  "err.exportForbidden": "You do not have permission to export this project"
}
```

Plural counts use the repo's existing plural mechanism (`tFor` resolves an object value through `resolvePlural` — `src/core/i18n.js:194-205`), so `export.scope.count` becomes `{ "one": "…", "other": "…" }` in both catalogues.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `exceljs` for `.xlsx` export | `@office-kit/xlsx` | 2026 (this phase's sandbox) | ExcelJS cannot write charts or shapes; the previous default made R5/R6 impossible |
| "print the page to PDF" as the shareable artifact | Native workbook with charts, Gantt and print setup | this phase | The artifact becomes sortable/filterable in Excel instead of a flat image |
| `.mpp` via a converter | MSPDI `.xml` | format-level, long-standing | No open-source `.mpp` writer exists; MSPDI is what Project itself uses for interchange |
| Streaming a generated file to the socket | Build fully in memory, then one `res.end(buf)` | this phase | A generation failure returns clean JSON before any header — the SPEC's concurrency edge |
| `@office-kit/xlsx`'s `fromBuffer` | `node:zlib` central-directory reader in tests | 0.26.1 | The reader is broken; verification must not depend on it |

**Deprecated / outdated in this context:**
- `makeTwoCellAnchor`, `setFitToPage`, `setPageOrientation`, `setPageMargins` — described in older examples, not exported in 0.26.1.
- `<Text1>`-style MSPDI elements — never existed; `ExtendedAttribute` + `FieldID` is the only form.
- A `Comments` sheet — rejected by D-54-8 in favour of columns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `xmlns="http://schemas.microsoft.com/project"` (no `/2007`) is what Project accepts | Pattern 6, Pitfall 10 | Project refuses the file or prompts repair; the structure test would still pass because it asserts our own choice |
| A2 | `<SaveVersion>12</SaveVersion>` (Project 2007) is read by Project 2016/2019/365 | Pattern 6 | A newer Project could require a higher `SaveVersion`; the human checkpoint catches it |
| A3 | `MinutesPerDay 480` + 1 d = 8 h is a faithful duration model for this product | Pattern 6 | Durations look wrong in Project relative to the app's `estimate` |
| A4 | The `estimate` ASCII grammar `^(\d+)([mhd])$` covers all real stored values | Pattern 6 | Unknown forms fall through to the date-span duration — degraded but not broken |
| A5 | 400 shapes and 2 s are guardrails to calibrate, not measured constants (SPEC says so explicitly) | Pattern 9 | The benchmark fixture may need different numbers; the *behaviour* (degrade, never error) is what matters |
| A6 | `@office-kit/xlsx@0.26.1` stays installable at the pinned integrity hash | Package audit | If yanked, the install task fails and the phase needs a re-probe against 0.27.x |
| A7 | Milestone diamonds do not need to count against the 400-shape cap | Pattern 9 | A milestone-heavy project could exceed the intended drawing cost; resolve by including them in the same budget if the fixture shows it matters |
| A8 | A weekly axis column count is `ceil(spanDays / 7)` from the padded start | Pattern 5 | If padding differs (e.g. padding to the containing month), the Today column and bar spans shift by one |

## Open Questions (RESOLVED)

All four were resolved during planning; the recommendation each one names is the option the plans adopt.

1. **MSPDI namespace: `/2007` or not? — RESOLVED: short form.**
   - What we know: the Project 2007 XSD page declares `targetNamespace="http://schemas.microsoft.com/project/2007"`; every element-reference example — including the `SaveVersion` example — emits `<Project xmlns="http://schemas.microsoft.com/project">`; MPXJ's schema annotation uses the short form.
   - What's unclear: which one a given Project build treats as canonical for import.
   - Recommendation: emit the **short form**, assert it in the structure test, and gate "opens without repair" behind a `checkpoint:human-verify` on a Project-equipped machine. Do not silently switch to `/2007` later without a re-check.
   - Resolved: 54-05-01 emits `http://schemas.microsoft.com/project` and asserts it; 54-05-03 is the human open check.

2. **Exact scroll target for "opens on Timeline at the current week". — RESOLVED: one column of context.**
   - What we know: `makeSheetView({ topLeftCell })` and `makeFreezePane` exist; `setFreezePanes(ws, 'D2')` freezes columns A–C.
   - What's unclear: whether `topLeftCell` should name the Today column itself or the first date column (so the frozen task block plus a week of context is visible).
   - Recommendation: `topLeftCell = \`${colLetter(4 + Math.max(0, axis.today - 1))}2\`` — one column of context before today, clamped at D.
   - Resolved: 54-04-02 implements exactly that formula and asserts the pane letter; a null Today (export date outside the padded span) falls back to D2.

3. **Where the chart source blocks live. — RESOLVED: a labelled block below the charts.**
   - What we know: `cat`/`val` refs must point at real cells on the same sheet.
   - What's unclear: whether the counts table doubles as the visual KPI block or lives in a separate region to the right of the charts.
   - Recommendation: one labelled block per sheet, placed below the charts (e.g. `Summary!A20:B25`, `Members!A12:B20`), so the visible top of the sheet stays presentational and the refs stay stable.
   - Resolved: 54-03-02 writes the status block at A20:B24 and the priority block at A27:B31; 54-03-03 writes the Members block from a computed row (at least 12). Each block's label is the model's translated chart title.

4. **Whether the server must offer `format=csv`. — RESOLVED: yes, it does.**
   - What we know: R9 only requires CSV on the static build; R2/R3 say all three writers share the model and options.
   - What's unclear: whether offering CSV server-side is desirable or scope creep.
   - Recommendation: offer it (same route, zero extra code path — `toCsv(model)`), because it keeps the format list consistent between modes and gives the E2E test a cheap third format.
   - Resolved: 54-01-01 registers csv in `EXPORT_FORMATS`; 54-05-02 renders xlsx, mspdi and csv on the server build.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | all server code | ✓ | v24.21.0 | — (engines `>=24`) |
| npm | installing the writer | ✓ | 11.19.0 | — |
| `@office-kit/xlsx` in the repo | xlsx writer | ✗ (not yet installed; the probe used `/tmp/opencode/xlsx-probe`) | — | install with `--save-exact @office-kit/xlsx@0.26.1` behind the checkpoint |
| LibreOffice (`soffice`) | manual render check of the generated workbook | ✓ | 26.2.6.3 (`/usr/bin/soffice`) | Python `openpyxl` read-only inspection; but only LibreOffice proves chart/connector rendering |
| Microsoft Project | R8's "no repair prompt" acceptance criterion | ✗ | — | none — **blocking for the human step**, not for the code: assert structure mechanically in CI and record the human verification as a separate UAT item |
| npm registry access | install | ✓ | — | vendored tarball at the pinned integrity hash |

**Missing dependencies with no fallback:** Microsoft Project on a Project-equipped machine — required for the final R8 acceptance. The plan must carry it as a `checkpoint:human-verify`, not as a blocking task.

**Missing dependencies with fallback:** `@office-kit/xlsx` is simply not installed yet; the install task (post-checkpoint) covers it.

## Validation Architecture

`workflow.nyquist_validation` is absent from `.planning/config.json`, so this section is enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | `node:test` (Node 24 built-in), `node:assert/strict` |
| Config file | none — the script is `"test": "node --test --test-concurrency=2 test/*.test.mjs"` in `package.json` |
| Quick run command | `node --test test/export-model.test.mjs test/export-csv.test.mjs test/export-gantt.test.mjs` |
| Full suite command | `npm test` |

Everything below runs without a database; the permission suite uses `test/helpers/server.mjs` (`startServer`, `login`, `client`, `ADMIN`, `ROOT`), which boots a real `server.js` on an ephemeral port with a temporary `DATA_DIR`.

### Phase Requirements → Test Map

| Req ID | Behaviour | Test Type | Automated Command | File Exists? |
|--------|-----------|-----------|-------------------|--------------|
| R1 | Both controls render for lead/admin/owner and are absent for editor/commenter/viewer | integration (DOM via existing surface tests) + source assertion | `node --test test/export-permissions.test.mjs` | ❌ Wave 0 |
| R2 | `view` scope exports exactly the `applyView` ids; `all` exports every non-archived task; counts match | unit | `node --test test/export-model.test.mjs` | ❌ Wave 0 |
| R3 | Defaults exclude desc/comments/subtasks, include completed, exclude archived; each toggle adds exactly its content | unit | `node --test test/export-model.test.mjs` | ❌ Wave 0 |
| R4 | Six sheets in order, header row 1, freeze pane per sheet | unit (unzip) | `node --test test/export-xlsx.test.mjs` | ❌ Wave 0 |
| R5 | `chart1..3.xml` exist, each has `c:barChart` with `c:numRef` + `c:strRef`, caches non-empty | unit (unzip) | `node --test test/export-xlsx.test.mjs` | ❌ Wave 0 |
| R6 | Daily and weekly barriers at 90/91 days; connector anchors on predecessor-finish → successor-start; Today column; `activeTab=3`; `topLeftCell`; freeze `D2` | unit (geometry) + unit (unzip) | `node --test test/export-gantt.test.mjs test/export-xlsx.test.mjs` | ❌ Wave 0 |
| R7 | Lane order `backlog→todo→progress→review→done`, counts per lane, empty lane header with 0 | unit | `node --test test/export-model.test.mjs` | ❌ Wave 0 |
| R8 | Well-formed, namespaced, task count = tasks + milestones, every dep resolves to a `PredecessorUID`, enums and FieldIDs exact | unit (XML) + manual (Project) | `node --test test/export-mspdi.test.mjs` | ❌ Wave 0 |
| R9 | Static mode lists CSV only and renders the notice; CSV parses as UTF-8 with one row per task + header | unit + integration | `node --test test/export-csv.test.mjs test/export-permissions.test.mjs` | ❌ Wave 0 |
| R10 | Cannot-read → 404 parity (status, body, headers); can-read-cannot-manage → 403 `exportForbidden`, zero bytes; no redacted field in any format; no `ctx.ws.doc` in export code | integration + source scan | `node --test test/export-permissions.test.mjs test/export-prohibition.test.mjs` | ❌ Wave 0 |
| R11 | `npm run build` passes the i18n gate; FR build has no English export string; every `export.*` key in both catalogues | build + unit | `npm run build` + `node --test test/catalogue.test.mjs` | ✅ (existing gate) |
| R12 | `=1+1` and `A & <B>` literal in all three formats; no unintended formula cell; CSV BOM | unit | `node --test test/export-csv.test.mjs test/export-mspdi.test.mjs test/export-xlsx.test.mjs` | ❌ Wave 0 |
| R13 | 500 tasks / 400 deps within budget with a responsive loop; > cap yields a valid workbook with a note row | benchmark + unit | `node --test test/export-xlsx.test.mjs` (benchmark fixture) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** the quick run — model + CSV + Gantt geometry (sub-second, no server spawn).
- **Per wave merge:** `npm test` (full suite, includes the permission matrix).
- **Phase gate:** `npm run build` (i18n) + `npm test` + `npm run lint` + `npm run format:check` green before `/gsd-verify-work`, plus the human Project check.

### Wave 0 Gaps

- [ ] `test/fixtures/export-fixtures.mjs` — a deterministic project: daily-axis span (≤ 90 days), weekly-axis span (≥ 91), a 90/91 boundary pair, `start == due`, a task with `deps`, a milestone, an empty lane, an archived task, a done task, a task with subtasks, a task titled `=1+1`, one titled `A & <B>`, a description containing `<script>` and `<img onerror>`
- [ ] `test/helpers/unzip.mjs` — the reader in §Code Example 2
- [ ] `test/helpers/xml.mjs` — ~30-line tag-balance well-formedness check (or add `saxes` as a devDependency)
- [ ] `test/export-model.test.mjs`, `test/export-csv.test.mjs`, `test/export-gantt.test.mjs`, `test/export-xlsx.test.mjs`, `test/export-mspdi.test.mjs`, `test/export-permissions.test.mjs`, `test/export-prohibition.test.mjs`
- [ ] Install: `npm install --save-exact @office-kit/xlsx@0.26.1` — **after** the legitimacy checkpoint

*(No existing export test infrastructure to reuse; every file above is new.)*

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json`, so this section applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V1 Architecture | yes | One funnel: read resolution before the manage gate, model built only from the redacted document |
| V2 Authentication | no | Inherited from `requireWorkspace` → `requireUser` |
| V3 Session Management | no | Inherited; the route adds nothing |
| V4 Access Control | **yes** | `requireWorkspace(slug,'viewer')` → project presence in the redacted doc (404 parity) → `canManageProject(p, member_id, role)` (403 `exportForbidden`); the client `canManageProject` only hides UI |
| V5 Input Validation | **yes** | Validate `format` against an allow-list; validate `ids` is an array of strings and intersect with the project's own tasks (never trust ids to widen scope); clamp option booleans |
| V6 Cryptography | no | Nothing secret is generated or stored. GUIDs are identifiers, not secrets (`crypto.randomUUID`) |
| V7 Error Handling & Logging | yes | All failures exit through `fail()` (JSON, no stack); never echo the caller's input into the message |
| V8 Data Protection | yes | `Cache-Control: no-store`; no export artifact persisted server-side; no file bytes on an error path |
| V11 Business Logic | yes | Shape cap and size guards prevent a denial-of-service through generation cost |
| V12 Files & Resources | yes | `fileDisposition` sanitizes the filename (CR/LF, quotes, control chars, non-ASCII fallback) |
| V13 API & Web Service | yes | `sameOrigin(req)` on the POST; JSON body; no query-string ids |
| V14 Configuration | no | No new configuration surface beyond the pinned dependency |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSV formula injection via a task title (`=1+1`, `+33…`, `@x`) | Tampering | Prefix `'` when a field starts with `= + - @`, then quote; test with the exact SPEC strings |
| XML injection via a title/description containing `</Name><Evil>` | Tampering | Escape `& < > " '` at the writer boundary, once, for every text node and attribute |
| HTML/script injection through descriptions | Tampering / XSS | Strip to plain text in the model (D-54-11); never render; assert `<script>`/`<img onerror>` export as inert text |
| Existence oracle on a private project | Information Disclosure | Resolve the project *inside* the redacted doc; return `projectNotFound` with the same status/body/headers as a read |
| Privilege escalation through a forged `ids` list | Elevation of Privilege | Intersect `ids` with the tasks of the already-resolved project; ids can only narrow, never widen |
| Cross-site request forgery on the export POST | Tampering | `sameOrigin(req)` before `readJson`, mirroring every other mutating route |
| Header injection through a project name | Tampering | `fileDisposition(name, false)` strips CR/LF/quotes/control chars and emits an ASCII fallback + RFC 5987 form |
| Resource exhaustion (10k tasks, 10k shapes) | Denial of Service | Shape cap (degrade, never error), option allow-lists, and a body-size bound from the existing `readJson` |
| Sensitive-data caching by a proxy/browser | Information Disclosure | `Cache-Control: no-store` on the byte response (same as `json()`) |
| Supply-chain compromise of the new dependency | Tampering | Exact pin + integrity hash + `checkpoint:human-verify` before install + a post-install version/licence assertion |

## Sources

### Primary (HIGH confidence)

**`@office-kit/xlsx@0.26.1`, local install + probes (`/tmp/opencode/xlsx-probe`)**
- `node_modules/@office-kit/xlsx/package.json` — version `0.26.1`, `license: MIT`, `engines.node: >=22.0.0`, deps `fflate ^0.8.3` + `saxes ^6.0.0`, subpath-only `exports` map (no `"."`).
- `dist/workbook/index.d.ts` — `createWorkbook`, `addWorksheet`, `setActiveSheet`, `makeWorkbookView`, `sheetNames`.
- `dist/workbook/workbook.d.ts:134-141` — `bookViews?: WorkbookView[]` with the `<bookViews>` comment.
- `dist/workbook/views.d.ts:1-29` — `WorkbookView.activeTab` and `makeWorkbookView`.
- `dist/worksheet/index.d.ts` — `setCell`, `setColumnWidth`, `setFreezePanes`, `addExcelTable`, `makePageSetup`, `makeSheetView`, `makeFreezePane`.
- `dist/styles/index.d.ts` + `dist/styles/cell-style.d.ts:47,261` — `setCellNumberFormat(wb, c, formatCode)`, `setCellAsDate(wb, c, format='yyyy-mm-dd')`, `formatAsHeader`.
- `dist/chart/index.d.ts` + `dist/chart/chart.d.ts:624-654` — `makeBarChart`, `makeBarSeries`, `makeChartSpace` signatures.
- `dist/drawing/index.d.ts` + `dist/drawing/drawing.d.ts:133,157` — `makeShapeDrawingItem(anchor, shape)`, `addChartAt(ws, at, chart, {widthPx,heightPx})`, `makeOneCellAnchor` (and the *absence* of `makeTwoCellAnchor`).
- `dist/node.d.ts` — `fromBuffer`, `toBuffer`, `workbookToBuffer`, `toFile`.
- `/tmp/opencode/xlsx-probe/r54/probe.mjs` — working end-to-end generation (six sheets, table, real dates, chart with string categories, two-cell bars, `bentConnector3` connector, `D2` freeze, `topLeftCell`, landscape `pageSetup`, `setActiveSheet`). Re-run this session: `activeSheetIndex 3`, six sheet names, 9578 bytes.
- Unzipped `out.xlsx` / `bv.xlsx` — `<c:barChart>` present; `<workbookView activeTab="3"/>` present only after `wb.bookViews` is set.

**Microsoft Project XML Data Interchange (MSPDI) reference — learn.microsoft.com, fetched this session**
- `…/project-element` — full `<Project>` child list and the required/optional table; confirms `ExtendedAttributes, Calendars, Tasks, Resources, Assignments` ordering.
- `…/xml-schema-for-the-project-element` — the `mspdi_pj12.xsd` excerpt, including `targetNamespace="http://schemas.microsoft.com/project/2007"`.
- `…/saveversion-element` — `<SaveVersion>12</SaveVersion>` = Project 2007; the example uses `<Project xmlns="http://schemas.microsoft.com/project">`.
- `…/task-element` — `<Task>` child order, `<UID>` required, and a full example task.
- `…/predecessorlink-element` — child order `PredecessorUID, Type, CrossProject, CrossProjectName, LinkLag, LagFormat`.
- `…/type-element-multiple-parents` — `PredecessorLink Type` 0=FF, 1=FS, 2=SF, 3=SS; `Task Type` 0/1/2; `Resource Type` 0/1/2.
- `…/fieldid-element` — FieldID corresponds to `PjCustomField`; the worked example pins 188743731 = `pjCustomTaskText1`.
- `…/weekday-element` — DayType 1..7, DayWorking, WorkingTimes example (08:00–12:00, 13:00–17:00; Sat/Sun non-working).
- `…/resource-element` — `<UID>` required; child order.
- `…/assignment-element` — `<UID>` required; child order.
- `learn.microsoft.com/office/vba/api/project.pjcustomfield` — `pjCustomTaskText1..5` = 188743731 / 188743734 / 188743737 / 188743740 / 188743743.

**Repository sources read this session**
- `src/core/store.js:345` `canSee`, `:353-356` `canManageProject`, `:359` `isOver`, `:419-424` `taskProg`.
- `src/core/constants.js:9-41` `STATUSES` (`backlog, todo, progress, review, done`), `:41` `ST`, `:95-138` `LABELS`/`LB`.
- `server.js:837-840` `canManageProject(p, memberId, role)`; `:5860-5868` `fileDisposition`; `:5872` `serveFileBinary`; `:3091-3098` `json`; `:3104-3106` `fail`; `:3225-3243` `requireWorkspace`; `:3329` `handleApi`; `:4675-4683` the doc GET and `docForClient(JSON.parse(ctx.ws.doc), ctx.ws, ctx.membership)`; `:1649-1661` `docForClient`; `:851-864` `hiddenFor`; `:6100-6152` route ordering.
- `src/core/api.js:59-100` `call()` (text + JSON only); `:117-119` `get enabled()`.
- `src/shell/view-engine.js:122-128` `applyView` (pure filter + `sortTasks`).
- `src/pages/project.js:68-80` header cluster (favourite, status, avatar stack, add-member, Share, settings, overflow).
- `src/overlays/context-menu.js:35-52` the `p.ctx === 'project'` menu.
- `src/overlays/modals.js:15-30` `openModal`, `:33-103` `modalHtml` switch, `:435` the existing `<a href download>` file download.
- `src/actions/actions.js:56-57` `export const A = {}` / `IN = {}`, `:78-94` new-task defaults (`deps`, `desc`, `estimate`, `order`, …), `:1712` `A.share`.
- `src/core/i18n.js:194-205` `tFor` (plural resolution), `:508-519` the `estimate` ASCII grammar `^(\d+)([mhd])$`.
- `scripts/i18n-scan.mjs` header — the `prebuild` gate and its two check families.
- `test/error-codes.test.mjs:22-33` — every `fail(res, <n>, '<code>'` literal must have `err.<code>` in **both** catalogues.
- `test/file-route-ordering.test.mjs`, `test/helpers/server.mjs` — the harness pattern for the permission suite.
- `package.json` — `type: module`, `engines.node >= 24`, test script, `pg` the only runtime dependency.
- `54-SPEC.md` §Background — the ExcelJS limitation and the six `@office-kit/xlsx` sharp edges recorded by this phase.

### Secondary (MEDIUM confidence)
- `54-CONTEXT.md` — the locked decisions and the sandbox report (rendered to PNG in LibreOffice) that this research builds on rather than re-litigates.

### Tertiary (LOW confidence)
- The "Project accepts `SaveVersion 12` in modern releases" belief (A2) — plausible and universally reported, but not verified against a live install in this session. This is precisely what the human checkpoint exists for.

**Not consulted, deliberately:** Context7 for `@office-kit/xlsx`. The package ships its own type declarations and the phase already has a working end-to-end probe; the declarations plus the probe are strictly more authoritative than a docs index for this API. `searxng` was likewise unnecessary — every format fact came from Microsoft's own reference pages.

## Metadata

**Confidence breakdown:**

- **Standard stack — HIGH.** Version, licence, engines, dependency tree, subpath exports, and every API used in the patterns were read from the installed package's declarations and exercised in a working probe this session.
- **Architecture — HIGH.** Every integration point was read in the repo with line numbers; the funnel order, the redaction call, the error-code contract and the i18n gate are all existing, tested behaviour. The one new structural decision (writers outside `src/`) is driven by an explicit SPEC prohibition.
- **MSPDI contract — MEDIUM-HIGH.** Element order, enums, FieldIDs, date/duration shapes and calendar structure come from first-party reference pages fetched this session. The namespace choice is the single genuinely unresolved item (two first-party pages disagree), which is why it is an explicit open question with a human checkpoint rather than a locked decision.
- **Pitfalls — HIGH.** Each of the six library sharp edges was observed in the probe or in the declarations; each MSPDI pitfall was observed in Microsoft's own element tables (ordering, required children, FieldID values).
- **Performance figures — LOW by design.** 500 tasks / 2 s / 400 shapes are the SPEC's guardrails; the research fixes the *mechanism* (cap + degrade + yield), not the constants.

**Research date:** 2026-11-09
**Valid until:** 2026-12-09 for the MSPDI contract and the repo integration (stable). **7 days** for `@office-kit/xlsx` — 0.27.0 shipped the same day as this research, so the pinned-version assumptions deserve a re-check before implementation starts.