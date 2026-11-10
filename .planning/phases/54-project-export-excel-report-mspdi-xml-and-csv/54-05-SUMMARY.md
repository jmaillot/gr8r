---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
plan: 05
subsystem: export
tags: [mspdi, xml, microsoft-project, export, i18n, escaping]
requires: [54-01, 54-02, 54-04]
provides:
  - export/mspdi.js (ordered MSPDI serializer: buildMspdi, escapeXml, parseEstimate, isoDuration, workingDaysInclusive, formatDateTime)
  - route entry mspdi in EXPORT_FORMATS (ext xml, XML media type, static map)
  - modal format list xlsx/mspdi/csv on server build, csv only on static build; export.notice.mspdi
  - test/make-export-samples.mjs (EN+FR xlsx/xml samples under test-results/export-samples)
affects: [project-export verification, any future import features]
tech-stack:
  added: []
  patterns:
    - ordered template-string emission (positional XML child order, never object spread)
    - static format map as the only source of extension/media type
    - recorded R3 exception: comments have no MSPDI element, asserted as byte-identical no-op
key-files:
  created:
    - export/mspdi.js
    - test/export-mspdi.test.mjs
    - test/make-export-samples.mjs
  modified:
    - server.js (mspdi route entry)
    - src/overlays/modals.js (format list + mspdi notice)
    - src/actions/actions.js (default format per mode)
    - src/locales/en.json, src/locales/fr.json (export.format.mspdi, export.notice.mspdi)
    - test/fixtures/export-fixtures.mjs (mspdi fixtures)
    - test/export-route.test.mjs, test/export-client.test.mjs
    - test/i18n-core-features.test.mjs (catalogue pin 1792 -> 1794)
decisions:
  - "Comments are not mapped onto any Project field (recorded R3 exception, D-54-8); the toggle is asserted to change no MSPDI byte."
  - "Human Project check recorded as open UAT after owner skip verdict; mechanical suite is the verification of record."
requirements-completed: [R8, R9, R11, R12]
coverage:
  - id: D1
    description: "Ordered, escaped MSPDI serializer with exact Text1-Text5 FieldIDs, estimate/working-day durations and resolvable finish-to-start links"
    requirement: R8
    verification:
      - kind: unit
        ref: "test/export-mspdi.test.mjs (27 tests: order, links, field ids, durations, escaping, empty project, comments no-op)"
        status: pass
      - kind: integration
        ref: "test/export-route.test.mjs#mspdi route (media type, .xml filename, no-store, 403 reader, 400 bad format)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Modal offers Excel + Microsoft Project XML + CSV on server build, CSV only on static build; EN+FR catalogue complete; no native-.mpp claim"
    requirement: R9
    verification:
      - kind: unit
        ref: "test/export-client.test.mjs (format list per mode, notice gating, catalogue key sets, no-.mpp assertion)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Generated MSPDI opens in Microsoft Project without a repair prompt (tasks, milestones, link, five custom fields, day durations, accented text)"
    requirement: R8
    verification: []
    human_judgment: true
    rationale: "Requires Microsoft Project, not available in this environment — owner skip verdict 'skipped: no Project machine' (2026-11-10); recorded as OPEN UAT in deferred-items.md"
  - id: D4
    description: "Generated workbook opened once in LibreOffice/Excel: six sheets, three charts, Gantt bars, one arrow render"
    requirement: R9
    verification: []
    human_judgment: true
    rationale: "Visual chart/bar rendering cannot be proven mechanically; stays open in the same UAT entry as D3"
metrics:
  duration: "~3 sessions (waves 1-5); this continuation ~15 min"
  completed: 2026-11-10
  status: complete
  actuals:
    tokens: 45000
    tasks: 3
    commits: 2
plan_head_before: b9dd06e
plan_head_after: f4455d6
commits: 2
---

# Phase 54 Plan 05: MSPDI serializer and format wiring Summary

**Ordered MSPDI XML serializer (exact schema order, five Text field IDs, estimate-grammar durations, resolvable finish-to-start links) wired into the route and modal with EN+FR catalogue; Microsoft Project open check left open as UAT per owner skip verdict.**

## Performance

- **Duration:** across waves; continuation close-out 2026-11-10
- **Tasks:** 3 (2 executed, 1 checkpoint skipped by owner)
- **Files modified:** 12
- **Commits:** 2

## Accomplishments

- `export/mspdi.js`: buildMspdi + helpers emitting positional schema order (SaveVersion, ExtendedAttributes, Calendars, Tasks, Resources, Assignments), five-exact-FieldID custom fields, 480-min/day durations with working-day fallback and milestone zero, five-entity escaping, timezone-free dates.
- Route serves `format: mspdi` as `.xml` with XML media type from the static map; modal lists xlsx/mspdi/csv on the server build and csv only on static; no label claims native Project binary support.
- `test/make-export-samples.mjs` writes EN+FR xlsx and xml samples under gitignored `test-results/export-samples/` for the human check.

## Task Commits

1. **Task 1: MSPDI serializer — ordered templates, escaping and durations** - `555d429` (feat)
2. **Task 2: Format wiring — server entry, modal format list, catalogue and samples** - `f4455d6` (feat)
3. **Task 3: Open the generated MSPDI in Microsoft Project without a repair prompt** — checkpoint skipped by owner, see below.

## Verification (record of record)

- `node --test test/export-mspdi.test.mjs` — 27/27 pass
- Route + client suites green; full suite 1340 pass / 0 fail
- lint, format:check, build (prebuild i18n gate) — green

## Deviations from Plan

None — plan executed as written; Task 3 followed its own resume-signal path ("skipped: no Project machine" → keep open for UAT, no code changes).

## OPEN UAT (deferred-items.md)

Owner verdict **"skipped: no Project machine"** (2026-11-10) — recorded verbatim in `deferred-items.md` as an OPEN UAT entry with the full checklist:

1. Open `project-en.xml` in Microsoft Project: no repair prompt; tasks + both milestones; finish-to-start link; five custom fields populated; day durations; accented text intact.
2. Open `project-en.xlsx` in LibreOffice/Excel: six sheets, three charts, Gantt bars, one arrow.

A repair prompt or dropped field must be reported verbatim to the planner, not patched here. D3/D4 remain `human_judgment: true` in the coverage block so verify-work routes them to a human.

## Issues Encountered

None new. Pre-existing server.js lint errors remain out of scope (see deferred-items.md wave-2 notes).

## Next Phase Readiness

- All three writers (csv, xlsx, mspdi) consume the same export model and honour the same toggles, with the recorded R3 comments exception.
- Phase 54 is structurally complete pending the open Project-machine UAT before ship.

---
*Phase: 54-project-export-excel-report-mspdi-xml-and-csv*
*Completed: 2026-11-10*
