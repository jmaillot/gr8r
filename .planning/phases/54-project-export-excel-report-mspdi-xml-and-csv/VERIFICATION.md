---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
verified: 2026-11-11T21:35:08Z
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
covered_digest: "v2:sha256:b44afb3fe8334c3bd4009334f0008be53dd8e01c5b2a12b6092b50e6e6aa926b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 13/13
  gaps_closed: []
  gaps_remaining: []
  regressions: []
caveats: # owner-recorded UAT skips — external-software checks, not gaps in delivered code
  - "MSPDI opens in Microsoft Project without a repair prompt — owner skipped (no Project machine); XML structure mechanically asserted by the mspdi/route/client export tests. Open UAT entry recorded in deferred-items.md; owner-acknowledged as the standing human check."
  - "Charts render with visible bars in LibreOffice — structural chart1..3.xml asserted in tests; visual render is the second open UAT entry."
---

# Phase 54: Project export — Excel report, MSPDI XML and CSV — Verification Report

**Phase Goal:** A member can export a project's data — scoped to the current filtered view or the whole project — as a formatted Excel report with native charts and a Gantt carrying dependency arrows, as a Microsoft Project MSPDI XML file that opens with real task links, or as a flat CSV on the static demo.
**Verified:** 2026-11-11T21:35:08Z
**Status:** passed
**Re-verification:** Yes — after post-verification churn on covered files (f877317 lint cleanup: dead-var removal in `export/xlsx.js`, `TZ_BY_LABEL` import cleanup in `server.js`; cb20896 e2e spec updates; plus owner-feedback export fixes 2026-11-10: SNET constraints, dated-span Gantt bars, milestone removal from exports, CSV `;` separator, bold parents, subtask-date inheritance, and 55-x assignee/subtask model changes)

## Goal Achievement

The prior report's evidence was stale: covered source files changed after 2026-11-10T00:00:00Z. This re-verification re-confirmed every truth against the live tree. Key wiring re-checked by grep; the mechanical suite (now 187 export tests, up from 172) exercises the updated behavior including the post-verification owner fixes.

### Observable Truths

| # | Truth (SPEC R#) | Status | Evidence (re-checked on live tree) |
| --- | --- | --- | --- |
| 1 | One export entry point (header icon + overflow item) opens one modal, only when `canManageProject` (R1) | ✓ VERIFIED | `exportOpen`/`buildExportModel` present in `src/actions/actions.js` and `src/overlays/modals.js` (grep, 4 refs each); entry points unchanged by f877317/cb20896 |
| 2 | Scope: current view (exact `applyView` ids) or all tasks, with counts (R2) | ✓ VERIFIED | route scope validation and model slicing unchanged; covered by export-route + export-model tests in the 187-test run |
| 3 | Five include toggles applied identically by all three writers (R3) | ✓ VERIFIED | `EXP_OPTIONS` → `body.options` → `buildExportModel`; export-model suite green |
| 4 | Workbook = six sheets `Summary, Tasks, Board, Timeline, Members, Milestones` in order, frozen headers (R4) | ✓ VERIFIED | `SHEET_NAMES` + `initSheet` freeze intact in `export/xlsx.js` (f877317 removed only the dead `first` var at line ~174); xlsx suite asserts sheet order |
| 5 | Three native charts, data-linked with cached series (R5) | ✓ VERIFIED | chart1–3 structural assertions green in the xlsx suite |
| 6 | Timeline Gantt: adaptive axis (≤90d daily / weekly), bars by status, per-dep connector pred-finish → succ-start, Today column, frozen panes, opens on current week (R6) | ✓ VERIFIED | `src/export/gantt.js` unchanged by the lint commit; post-verification owner fix (dated spans win over estimates, a50d14d) is exercised by the suite |
| 7 | Board snapshot: lanes in `backlog→todo→progress→review→done`, counts, empty lane header (R7) | ✓ VERIFIED | board builder over `STATUSES`; suite green |
| 8 | MSPDI XML: namespaced `<Project>`, Text1–5 custom fields, durations, PercentComplete, PredecessorLink per dep, resources/assignments (R8) | ✓ VERIFIED (mechanical) | `export/mspdi.js` untouched by f877317; post-verification refinements (SNET pins f09cc70, dates on parents only 8f6733b, 55-05 assignee Resources/Assignments bed0a58) all covered by the 27-strong mspdi suite; every dep resolves, well-formed XML asserted |
| 9 | Static demo offers CSV only + "server build required" note (R9) | ✓ VERIFIED | `FORMATS = api.enabled ? [xlsx, mspdi, csv] : [['csv']]` in `modals.js` (now with per-format hint lines, 34fb023); client CSV path green |
| 10 | Permissions: funnel → 404 parity → `canManageProject` → 403 localized, model built only from `docForClient` doc, never `ctx.ws.doc` raw (R10) | ✓ VERIFIED | EXPORT-ROUTE block in `server.js` intact (f877317 touched only an unrelated log catch-block + tz import); 404-parity and 403-no-bytes tests green |
| 11 | All export strings catalogued EN + FR, i18n gate green (R11) | ✓ VERIFIED | `export.*` blocks present in both locale files; catalogue tests in the run |
| 12 | Output safety: XML escapes `& < > " '`; CSV UTF-8 BOM + formula-prefix `'` (now `;` separator per owner request, 9cdc1f1); xlsx shared strings (R12) | ✓ VERIFIED | escape/injection guards unchanged; export-prohibition suite (`=1+1`, `A & <B>`, `<script>` inert in all three formats) green |
| 13 | Perf & degradation: 500-task benchmark, event loop < 2s, shape cap 400 → table-only Timeline + note row, never an error (R13) | ✓ VERIFIED | `SHAPE_CAP = 400` inclusive boundary tests green; benchmark re-ran at 148ms event-loop hold |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `src/export/model.js` | Shared DOM-free export model | ✓ VERIFIED | consumed by route, writers, client; extended (not broken) by 55-x assignee/subtask fields |
| `src/export/csv.js` | CSV writer (UTF-8 BOM, injection guard, `;` separator) | ✓ VERIFIED | suite green on live tree |
| `export/xlsx.js` | Six-sheet workbook writer, 3 charts, Gantt | ✓ VERIFIED | dead-var removal (f877317) is the only change; still server-only import (`server.js:67`) |
| `export/mspdi.js` | MSPDI serializer | ✓ VERIFIED | wired at `server.js:68`; owner refinements covered by tests |
| `src/export/gantt.js` | Gantt geometry + SHAPE_CAP | ✓ VERIFIED | unchanged since initial verification |
| `/api/.../export` route | Gated POST endpoint, three formats | ✓ VERIFIED | exports intact, headers and format map unchanged |
| Export modal | CSV/Excel/Project XML + scope + toggles | ✓ VERIFIED | redesigned per owner request (a46ccc3) and covered by client tests |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| `src/pages/project.js` / `src/overlays/context-menu.js` | export modal | `data-a="exportOpen"` → `A.exportOpen` → `openModal({type:'export'})` | ✓ WIRED | bindings re-grepped live |
| `modals.js exportModal` | export model | `buildExportModel(D(), p.id, …)` | ✓ WIRED | live counts |
| `A.exportSubmit` | server route | POST `{format, scope, ids, options}` | ✓ WIRED | static fallback client CSV intact |
| `server.js export route` | writers | `buildWorkbook`/`buildMspdi` imports at server.js:67-68 + csv dispatch | ✓ WIRED | re-grepped live |
| `xlsx.js` | gantt geometry | imports `buildGantt`/caps from `src/export/gantt.js` | ✓ WIRED | unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| export route model | `doc` | `docForClient(...)` — redacted client-shaped doc | Yes | ✓ FLOWING |
| Tasks sheet rows | `model.rows` | project tasks filtered by scope/toggles | Yes | ✓ FLOWING |
| Charts | counts arrays | computed from the same model | Yes | ✓ FLOWING |
| Modal counts | `exportCount(p)` | live client doc | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Export suites (8 files) | `node --test test/export-{csv,model,mspdi,xlsx,gantt,route,prohibition,client}.test.mjs` | 187 pass / 0 fail (7.6s) | ✓ PASS |
| Lint gate | `npm run lint` | 0 errors | ✓ PASS |
| R13 boundary + benchmark | included in run above (exact-cap draw, cap+1 table-only, 500-task benchmark 148ms) | pass | ✓ PASS |

Full project gates reported by the orchestrator as green on this tree (npm test 1385/0, e2e 109/109); the export suites above were re-run independently in this verification.

### Probe Execution

None declared for this phase (no `probe-*.sh`; not a migration/tooling phase).

### Requirements Coverage

R1–R13 (54-SPEC.md, locked): all 13 SATISFIED. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| — | — | none found | — | `grep -E "TBD|FIXME|XXX|PLACEHOLDER|not yet implemented"` clean across covered export files; f877317 *removed* the only dead-var debt in `export/xlsx.js` |

### Recorded Caveats (Open UAT — not gaps in delivered code)

Unchanged from the initial verification and owner-acknowledged (the mechanical suite is the verification of record):

1. **MSPDI in Microsoft Project** — no repair prompt, links, custom fields, durations. XML structure mechanically asserted by `test/export-mspdi.test.mjs`; the human check (`node test/make-export-samples.mjs` then open in Project) stays open in deferred-items.md for the first Project-equipped machine. Notably, post-verification owner fixes (SNET constraints, dated spans, parent-only dates) came from real owner testing of generated files.
2. **Chart visual render in LibreOffice** — chart1–3.xml structure asserted; visible-bar rendering is the second open UAT entry.

### Human Verification Required

None new — the two open UAT entries above are tracked in deferred-items.md with the owner's recorded skip and are owner-acknowledged.

### Gaps Summary

None. Regressions: none — the covered-file churn since the initial verification was either behavior-neutral cleanup (f877317) or owner-requested refinements that the grown 187-test mechanical suite exercises. Digest refreshed via `gsd_run query verification.fingerprint` against the live tree.

---

_Verified: 2026-11-11T21:35:08Z_
_Verifier: the agent (gsd-verifier)_
