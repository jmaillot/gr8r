---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
plan: 03
subsystem: project-export
tags: [export, xlsx, charts, i18n, model]
requires: [buildExportModel, export/xlsx.js six-sheet shell, @office-kit/xlsx 0.26.1, test/helpers/unzip.mjs, test/helpers/xml.mjs]
provides: [model summary/charts/board/members/milestones blocks, filled Summary/Board/Members/Milestones sheets, chart1-3.xml with cached series, 24 EN+FR export keys]
affects: [plan 04 (Timeline Gantt), plan 05 (MSPDI + samples), verify-work UAT]
tech-stack:
  added: []
  patterns: [model-null chart rule (all-zero data omits the chart), translated-title-as-single-source (block label AND chart title read model.charts.<key>.title), plain-string comparator for deterministic sorting, series spPr assigned after construction]
key-files:
  created: []
  modified: [src/export/model.js, export/xlsx.js, src/locales/en.json, src/locales/fr.json, test/fixtures/export-fixtures.mjs, test/export-model.test.mjs, test/export-xlsx.test.mjs]
key-decisions:
  - "Chart blocks are null when every count is zero — the writer decides chart presence on the model, so the zero fixture emits no chart part, no drawing and no source block"
  - "model.charts.<key>.title is the ONLY source of the chart title and the source-block label — export/ holds no display literal and an FR build renders a French title in both places"
  - "Sorting (assignee chart, member rows, board cards, milestones) uses a plain string comparator, never localeCompare — deterministic across hosts"
  - "Rows gained an `order` machine field so board cards sort by order then key without re-reading the document"
  - "Members source block sits at max(12, member rows + 3) so the block never collides with a long member list"
metrics:
  duration: 33 min
  completed: 2026-11-10
status: complete
actuals:
  tokens: 20500
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 30344a4
plan_head_after: 8e2c98b
---

# Phase 54 Plan 03: Summary/Board/Members/Milestones Sheets Summary

Model-driven workbook middle: the Summary sheet (meta, four KPI counts, two clustered column charts) plus the Board snapshot, the Members sheet with its bar chart, and the Milestones sheet — all five blocks derived in `src/export/model.js` from the exported top-level rows, with chart source-block caches byte-equal to the sheet cells and all-zero data omitting its chart entirely.

## Coverage

- **Task 1 (model blocks)** — 14 new model tests: meta order/kinds, KPI values equal row counts, status/priority tallies match manual counts and ignore child rows (subtasks on), assignee chart sorted open-desc then name-asc with Unassigned, all-zero blocks null, board lane order locked with empty lanes at count 0, member totals open+done, milestone states derived from the injected now (on-date = upcoming), every exporter label prefixed by the injected translator, user text untouched. `npm run i18n:scan` clean (0 missing / 0 dead / 0 placeholder-mismatch).
- **Task 2 (Summary + charts 1-2)** — 6 new workbook tests: chart1/chart2.xml exist with one barChart, one strRef, one numRef each, ranges pointing at `Summary!$A$20:$A$24` / `$A$27:$A$31`, non-empty caches equal to the block cells (T-54-11); meta rows 4-9 with dates as real serials under numFmtId 14 and progress at the raw 0-100 scale; KPI rows 11-14; A19 and chart1 title both read the model title — an FR build renders the French title with no English chart key anywhere in the package; the zero fixture emits no chart part, no drawing and no block while the workbook stays valid (six ordered frozen sheets); no `<f>` formula element on any sheet.
- **Task 3 (Board, Members, Milestones)** — 8 new workbook tests: lane rows in backlog→todo→progress→review→done order with model counts, empty-lane fixture still renders count 0 with no card rows, dated card carries a real date serial under numFmtId 14, board card progress stores the same number AND style index as its Tasks-sheet cell, member rows equal the model and the source block equals chart3's cache, chart3 is barDir bar clustered at F2 with spPr present (assigned after construction), milestones date-sorted with done/upcoming states, chart3 absent for the zero fixture with all six sheets frozen.

## Deviations from Plan

None — plan executed exactly as written. (The probe script referenced in `<read_first>` no longer exists at /tmp/opencode/xlsx-probe/r54/probe.mjs; the API was verified directly against node_modules/@office-kit/xlsx .d.ts files and the RESEARCH code example, which agree.)

## Issues Encountered

None. Three test-authoring mistakes during Task 2/3 were fixed before commit (namespaced-tag matcher, a date expectation that pinned the start date to both rows, a shared-string regex requiring self-closing tags) — no production code changed for them.

## Next Phase Readiness

- Plan 04 only adds Timeline geometry and the Today marker; charts 1-3 and all other sheets are complete and model-driven.
- The chart caches are proven equal to their source cells, so plan 04 cannot desynchronize them by accident.
- No blockers; all 90 tests across the six export/dependency suites green, lint clean on every touched file, i18n gate clean.

---
*Phase: 54-project-export-excel-report-mspdi-xml-and-csv*
*Completed: 2026-11-10*
