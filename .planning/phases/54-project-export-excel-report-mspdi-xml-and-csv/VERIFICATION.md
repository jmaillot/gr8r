---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
verified: 2026-11-10T00:00:00Z
status: passed
score: 13/13 must-haves verified
covered_files:
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-01-PLAN.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-01-SUMMARY.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-02-PLAN.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-02-SUMMARY.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-03-PLAN.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-03-SUMMARY.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-04-PLAN.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-04-SUMMARY.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-05-PLAN.md"
  - ".planning/phases/54-project-export-excel-report-mspdi-xml-and-csv/54-05-SUMMARY.md"
  - "export/mspdi.js"
  - "export/xlsx.js"
  - "server.js"
  - "src/actions/actions.js"
  - "src/core/download.js"
  - "src/export/csv.js"
  - "src/export/gantt.js"
  - "src/export/model.js"
  - "src/locales/en.json"
  - "src/locales/fr.json"
  - "src/overlays/context-menu.js"
  - "src/overlays/modals.js"
  - "src/pages/project.js"
covered_digest: "v2:sha256:a60279b3b2edaba46ef3abb1d909604a7f92914fc63daadf9093d21acb58cb88"
behavior_unverified: 0
overrides_applied: 0
caveats: # owner-recorded UAT skips — external-software checks, not gaps in delivered code
  - "MSPDI opens in Microsoft Project without a repair prompt — owner skipped (no Project machine); XML structure mechanically asserted (27/27 mspdi/route/client tests). Open UAT entry recorded in deferred-items.md."
  - "Charts render with visible bars in LibreOffice — structural chart1..3.xml asserted in tests; visual render is the second open UAT entry."
---

# Phase 54: Project export — Excel report, MSPDI XML and CSV — Verification Report

**Phase Goal:** A member can export a project's data — scoped to the current filtered view or the whole project — as a formatted Excel report with native charts and a Gantt carrying dependency arrows, as a Microsoft Project MSPDI XML file that opens with real task links, or as a flat CSV on the static demo.
**Verified:** 2026-11-10
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth (SPEC R#) | Status | Evidence |
| --- | --- | --- | --- |
| 1 | One export entry point (header icon + overflow item) opens one modal, only when `canManageProject` (R1) | ✓ VERIFIED | `src/pages/project.js:74` gated `ibtn-sm` download button; `src/overlays/context-menu.js:43-45` gated `exportOpen` item; both `data-a="exportOpen"` → `src/actions/actions.js:1768` `openModal({ type: 'export', id })`; client gate `src/core/store.js:353` `canManageProject` |
| 2 | Scope: current view (exact `applyView` ids) or all tasks, with counts (R2) | ✓ VERIFIED | `exportViewIds`/`exportCount` in `src/actions/actions.js` (~1777-1797) reuse `applyView`; server validates `scope` view/all and slices ids (max 5000); `export.scope.count` hint rendered (`modals.js:410`); Export disabled at count 0 (`modals.js:414` disabled attr) |
| 3 | Five include toggles applied identically by all three writers (R3) | ✓ VERIFIED | `EXP_OPTIONS` (`modals.js:376`) → `body.options` → `buildExportModel` options; default-off desc/comments/subtasks, done-in, archived-out asserted in `test/export-model.test.mjs` |
| 4 | Workbook = six sheets `Summary, Tasks, Board, Timeline, Members, Milestones` in order, frozen headers (R4) | ✓ VERIFIED | `SHEET_NAMES` fixed array, all created up front (`export/xlsx.js:49,378-389`); `initSheet` sets header + freeze; structural tests unzip and assert order |
| 5 | Three native charts, data-linked with cached series (R5) | ✓ VERIFIED | `addBarChart` with `makeBarChart`/`makeBarSeries` + str cache (`export/xlsx.js:336-362`); tests assert chart1–3 `c:barChart` with numRef/strRef, and chart absent on all-zero fixture (R5 boundary) |
| 6 | Timeline Gantt: adaptive axis (≤90d daily / weekly), bars by status, milestone diamonds, per-dep connector pred-finish → succ-start, Today column, frozen panes, opens on current week (R6) | ✓ VERIFIED | `src/export/gantt.js` (`DAILY_LIMIT_DAYS=90`, geometry, links); xlsx tests assert daily/weekly bar columns, exactly one `xdr:cxnSp` per dep with anchors on pred-finish/succ-start, Today fill, `xSplit 3` freeze, topLeftCell one column before today, 90/91-day boundary fixtures |
| 7 | Board snapshot: lanes in `backlog→todo→progress→review→done`, counts, empty lane header (R7) | ✓ VERIFIED | Board sheet builder over `STATUSES` (`src/core/constants.js:9`); test asserts lane order, per-lane counts, empty-lane header |
| 8 | MSPDI XML: namespaced `<Project>`, Text1–5 custom fields, durations, PercentComplete, PredecessorLink per dep, resources/assignments, milestone tasks (R8) | ✓ VERIFIED (mechanical) | `export/mspdi.js`: `escapeXml`, FieldID map (`Text1..Text5`, lines 110-118), `<PredecessorLink><PredecessorUID>…<Type>1</Type>` (line 217), UID resolution incl. milestones (lines 177-183); `test/export-mspdi.test.mjs` asserts well-formed XML, task count = tasks + milestones, every dep resolves |
| 9 | Static demo offers CSV only + "server build required" note (R9) | ✓ VERIFIED | `FORMATS = api.enabled ? [xlsx, mspdi, csv] : [['csv']]` (`modals.js:399`); `export.notice.staticMode` rendered when `!api.enabled` (`modals.js:412`); static path builds CSV client-side from the same model/writer (`actions.js` `A.exportSubmit`) |
| 10 | Permissions: funnel → 404 parity → `canManageProject` → 403 localized, model built only from `docForClient` doc, never `ctx.ws.doc` raw (R10) | ✓ VERIFIED | `server.js:5218-5295` (EXPORT-ROUTE block): `requireWorkspace` → `sameOrigin` → format/scope validation → `docForClient` (only doc read, comment at line ~5250) → project lookup → 404 → `canManageProject` (server.js:844) → 403 `exportForbidden`; `test/export-route.test.mjs` covers the 404-parity matrix and 403-no-bytes |
| 11 | All export strings catalogued EN + FR, i18n gate green (R11) | ✓ VERIFIED | `src/locales/en.json` / `fr.json` carry the `export.*` block (en.json:787+); `test/export-client.test.mjs` + catalogue tests pass; deferred-items.md records prebuild/format/build green |
| 12 | Output safety: XML escapes `& < > " '`; CSV UTF-8 BOM + formula-prefix `'`; xlsx shared strings (R12) | ✓ VERIFIED | `escapeXml` (`export/mspdi.js:42`), CSV injection guard in `src/export/csv.js`, `test/export-prohibition.test.mjs` asserts `=1+1` / `A & <B>` / `<script>` round-trip inert in all three formats |
| 13 | Perf & degradation: 500-task benchmark, event loop < 2s, shape cap 400 → table-only Timeline + note row, never an error (R13) | ✓ VERIFIED | `SHAPE_CAP = 400` (`src/export/gantt.js:27`), `truncated = bars + links > cap` (lines 186-190, inclusive-at-cap); xlsx tests: above-cap yields no drawing + note row, at-cap (400) still draws; 500-task benchmark test builds a valid zip with event loop under two seconds (117ms measured) |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

All behavior-dependent truths (scope→row set, toggles→content, connector geometry, cap degradation, permission funnel) are exercised by the export test suites, which were executed during this verification — not just present.

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/export/model.js` | Shared DOM-free export model | ✓ VERIFIED | 403 lines; consumed by server route, both writers and the client modal counts |
| `src/export/csv.js` | CSV writer (UTF-8 BOM, injection guard) | ✓ VERIFIED | substantive + used by server route and static client path |
| `export/xlsx.js` | Six-sheet workbook writer, 3 charts, Gantt | ✓ VERIFIED | 560 lines, server-only import (`server.js:67`); **no** `@office-kit/xlsx` import anywhere under `src/` (grep clean — R1/R9 prohibition holds) |
| `export/mspdi.js` | MSPDI serializer | ✓ VERIFIED | 309 lines, pure string builder, wired at `server.js:68` |
| `src/export/gantt.js` | Gantt geometry + SHAPE_CAP | ✓ VERIFIED | exported `DAILY_LIMIT_DAYS`, `SHAPE_CAP`, consumed by xlsx.js |
| `/api/.../export` route | Gated POST endpoint, three formats | ✓ VERIFIED | `server.js:5218+`, format map static, disposition sanitizer + `no-store` + `nosniff` headers |
| Export modal | CSV/Excel/Project XML + scope + toggles | ✓ VERIFIED | `src/overlays/modals.js` `exportModal` (lines 374-414), wired from two entry points |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/pages/project.js` / `src/overlays/context-menu.js` | export modal | `data-a="exportOpen"` → `A.exportOpen` → `openModal({type:'export'})` | ✓ WIRED | both controls gated by `canManageProject(p)` |
| `modals.js exportModal` | export model | `buildExportModel(D(), p.id, …)` for live counts | ✓ WIRED | same model the server uses |
| `A.exportSubmit` | server route | POST with `{format, scope, ids, options}` | ✓ WIRED | static mode falls back to client CSV via `saveBlob` |
| `server.js export route` | `buildExportModel` / writers | `entry.write(model)` from static `EXPORT_FORMATS` map | ✓ WIRED | csv/xlsx/mspdi each dispatch to their writer |
| `xlsx.js` | gantt geometry | imports `buildGantt`/caps from `src/export/gantt.js` | ✓ WIRED | shape cap and axis decisions flow into the Timeline sheet |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| export route model | `doc` | `docForClient(JSON.parse(ctx.ws.doc), …)` — the redacted client-shaped doc | Yes | ✓ FLOWING |
| Tasks sheet rows | `model.rows` | project tasks filtered by scope/toggles | Yes | ✓ FLOWING |
| Charts | counts arrays | computed from the same model block written into the sheet | Yes | ✓ FLOWING |
| Modal counts | `exportCount(p)` | live client doc via `buildExportModel` | Yes | ✓ FLOWING |

No static fallback, mock or hardcoded data feeds any exported value.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Export suites (8 files) | `node --test test/export-{csv,model,mspdi,xlsx,gantt,route,prohibition,client}.test.mjs` | 172 pass / 0 fail (7.3s) | ✓ PASS |
| Gantt/R13 suite (single re-run) | `node --test test/export-gantt.test.mjs` | 23 pass | ✓ PASS |
| Route permission/404/403 tests | included in export-route run above | pass | ✓ PASS |
| Prohibition tests (`.mpp` label, no client dep, opt-in defaults, inert HTML) | included in export-prohibition run above | pass | ✓ PASS |

### Probe Execution

None declared for this phase (no `probe-*.sh` in PLAN/SUMMARY; not a migration/tooling phase). The phase's executable checks are the `test/export-*` suites, run above.

### Requirements Coverage

R1–R13 (54-SPEC.md, locked): all 13 SATISFIED — see Observable Truths table (1:1 mapping). No orphaned requirements: the SPEC lists exactly the 13 requirements the five plans cover.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | none found in phase-touched files | — | `grep -E "TBD|FIXME|XXX|PLACEHOLDER|not yet implemented"` clean across `src/export/`, `export/`, modals, actions, server export block |

### Recorded Caveats (Open UAT — not gaps in delivered code)

Per the phase's deferred-items.md and the orchestrator's instruction, two external-software checks remain OPEN as UAT entries with an explicit owner skip ("no Project machine", 2026-11-10):

1. **MSPDI in Microsoft Project** — no repair prompt, links, custom fields, durations. The XML structure is mechanically asserted (namespace, task count, resolvable PredecessorUIDs) by `test/export-mspdi.test.mjs`. The human check (`node test/make-export-samples.mjs` then open in Project) stays open for the first Project-equipped machine.
2. **Chart visual render in LibreOffice** — chart1–3.xml structure (barChart, numRef/strRef, cached series) is asserted; visible-bar rendering is the second open UAT entry.

These are inherent human/external-software checks already logged in `.planning/phases/54-…/deferred-items.md`; they do not fail any delivered-code truth.

### Human Verification Required

None new — the two open UAT entries above are already tracked in deferred-items.md with the owner's recorded skip.

### Gaps Summary

None. The goal is achieved in the delivered code: one export model feeds three wired writers, the route gates by permission and format with a static extension map, the modal offers all three formats (CSV-only on static) with scope and toggles in EN+FR, and the R13 shape cap degrades to a table-only Timeline instead of failing. 172/172 export tests pass on the live tree.

---

_Verified: 2026-11-10_
_Verifier: the agent (gsd-verifier)_
