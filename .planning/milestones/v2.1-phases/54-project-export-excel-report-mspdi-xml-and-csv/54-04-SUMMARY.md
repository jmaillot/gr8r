---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
plan: 04
subsystem: export
tags: [xlsx, gantt, timeline, shapes, i18n, responsiveness]
requires: [54-01, 54-02, 54-03]
provides:
  - src/export/gantt.js (pure adaptive-axis Gantt geometry: padToWeek, makeAxis, buildGantt, SHAPE_CAP)
  - Timeline sheet with bars, milestone diamonds, dependency connectors, Today column, freeze D2, activeTab 3
  - cooperative generation (yieldToLoop) across all six sheet builders
affects: [54-05 (MSPDI consumes the same model rows), export modal surfaces]
tech-stack:
  added: []
  patterns:
    - UTC epoch-day arithmetic for all column geometry (timezone-proof)
    - named clamp helper for connector anchor columns (linkAnchorCols)
    - row basis contract: table index i -> sheet row i+2, drawing markers i+1/i+2
    - shape-cap degradation: bars+links > 400 -> table + note, no drawing part
key-files:
  created:
    - src/export/gantt.js
    - test/export-gantt.test.mjs
  modified:
    - src/export/model.js (headers.timeline, labels.timelineTruncated/milestoneDone)
    - export/xlsx.js (fillTimeline, yieldToLoop, activeTab Timeline)
    - src/locales/en.json, src/locales/fr.json (export.timeline.truncated)
    - test/fixtures/export-fixtures.mjs (7 gantt fixtures)
    - test/export-xlsx.test.mjs (Timeline suite, sheetValues self-closing fix, activeTab 3)
    - test/i18n-core-features.test.mjs (catalogue pin 1791 -> 1792)
decisions:
  - makeAxis additionally returns startISO/endISO so the writer can derive one real date per header column (the plan's export list did not include them; column arithmetic alone cannot build date headers)
  - Milestone diamonds dated outside the bar-derived padded span are skipped (table row kept) — the span intentionally never includes milestone dates, so an out-of-range date has no column to sit on
  - The plan's "padded spans of exactly 90 and 91 days" is unreachable through padToWeek (Monday/Sunday padding yields multiples of 7); the boundary fixtures pad to 35/91 days and the exact 90/91 switch is asserted on makeAxis with synthetic padded spans
  - buildGantt reads deps from the raw model row (matched by bar taskId) so successor deps resolve against the unsorted table, not the sorted bar order
metrics:
  duration: ~2h
  completed: 2026-11-10
  commits: 5
actuals:
  tokens: 323500
  tasks: 3
  commits: 5
status: complete
plan_head_before: 0010570a28209d9adcefdc4d18ce5bdda41f9d11
plan_head_after: 04b92070b6d1eaf7d57c6c11a7a9457739abd7a9
---

# Phase 54 Plan 04: Timeline Gantt Sheet Summary

Pure UTC Gantt geometry module (adaptive daily/weekly axis, bars, milestones, dependency links, inclusive 400-shape cap) driving a real Timeline sheet — date header per axis column, status-coloured bars, clamped connectors, marked Today column, frozen task block, workbook opening on Timeline — plus cooperative generation with a 500-task benchmark.

## What Was Built

- **src/export/gantt.js** (zero imports, browser+Node safe): `DAILY_LIMIT_DAYS=90`, `SHAPE_CAP=400`, UTC `toDay/fromDay/dayDiff`, `padToWeek` (Monday/Sunday), `makeAxis` (daily <= 90 padded days, weekly above; `columnOf` throws outside the padded range instead of clamping; `today` null outside the range — never negative), `columnLetter`, and `buildGantt` returning `{axis, bars, milestones, links, truncated}` with the ROW BASIS contract (table index i -> sheet row i+2, drawing markers i+1/i+2), bars sorted start→title→key, milestones continuing the row indexes after the bars, one raw-date link per resolvable dependency (equal-day pairs kept; archived/foreign/child deps dropped), cap inclusive at 400 over bars+links only.
- **Timeline sheet in export/xlsx.js**: task block A-C, one real date header per axis column (dd daily, builtin short-date weekly, width 4.5, row height 28), one row per bar then milestone (MS key, milestone done label), roundRect bars in the fixed status palette, F59E0B diamonds, bentConnector3 links (w 12700, triangle tail, editAs oneCell) emitted last so they draw on top, connector columns resolved through the named `linkAnchorCols` clamp (equal-day pair → zero-length horizontal connector stepping down a row; never leftward), machine ids bar-N/ms-N/link-N, Today column FEF3C7 + header FDE68A from `axis.today` (omitted entirely when null), freeze D2, pane topLeftCell one column before today clamped at D2, workbook activates Timeline (activeTab 3) via reassigned `bookViews`.
- **Cap degradation (R13/T-54-13)**: above 400 shapes the sheet writes no drawing part at all (an empty drawing part would break the zero-data workbook) and the truncation note lands in column A two rows past the last table row.
- **Responsiveness (T-54-14)**: `yieldToLoop` (setImmediate) awaited after every sheet builder and every 200 rows of the Tasks and Board loops; fully in memory, one buffer, no stream/worker/dependency.
- **Model + i18n**: `headers.timeline` and `labels.timelineTruncated`/`milestoneDone` resolved through the injected translator with literals in src/export/model.js (dead-key gate surface); `export.timeline.truncated` added to both catalogues; catalogue pin 1791 → 1792.

## Verification

- `node --test --test-concurrency=2 test/export-gantt.test.mjs test/export-xlsx.test.mjs` — 61 tests pass (23 geometry + 38 workbook incl. Timeline suite and benchmark), 0 fail.
- `node --check src/export/gantt.js export/xlsx.js src/export/model.js` — exits 0.
- ESLint on every touched file — clean. `npm run lint` still exits non-zero on 51 pre-existing errors in unrelated files (db-adapter.mjs, server.js, mailer.js, e2e, older suites — the 54-02 deferred baseline), none of them touched by this plan.
- `npm run i18n:scan` — 0 missing/dead/unresolved; catalogue pin test green at 1792.

## Deviations from Plan

**1. [Rule 3 - Blocking fix] makeAxis also returns `startISO`/`endISO`**
- **Found during:** Task 2
- **Issue:** the writer must put a real date into every header column, but the plan's makeAxis contract exposed only mode/spanDays/columns/columnOf/today — the padded origin was unreachable.
- **Fix:** makeAxis returns the padded span ISOs too (pure addition, no behaviour change). Commit 04b9207.
- **Files modified:** src/export/gantt.js

**2. [Rule 1 - Bug fix in shared test helper] sheetValues misparsed self-closing cells**
- **Found during:** Task 2
- **Issue:** the existing `sheetValues` helper matched `<c ... />` styled-empty cells against the following cell's content, corrupting the value map (Today-column cells start on every Timeline row).
- **Fix:** the regex now handles self-closing cells as valueless; existing assertions unchanged.
- **Files modified:** test/export-xlsx.test.mjs (same commit as Task 2)

**3. [Plan arithmetic] "padded spans exactly 90 and 91 days"**
- **Found during:** Task 1
- **Issue:** padToWeek rounds to Monday/Sunday, so a padded span is always a multiple of 7 — exactly 90 is unreachable through fixtures.
- **Fix:** boundary fixtures pad to 35 (daily) and 91 (weekly, first span above the limit) days; the exact 90/91 mode switch is asserted directly on makeAxis with synthetic padded spans of 90 and 91 days, which is the test the plan's list actually describes ("axis mode and columns at padded spans 90 and 91").
- **Files modified:** test/fixtures/export-fixtures.mjs, test/export-gantt.test.mjs

**4. [Rule 2 - Missing critical handling] milestone dates outside the padded span**
- **Found during:** Task 2 (the existing makeMilestoneDoc fixture crashed the build)
- **Issue:** the span deliberately never includes milestone dates, so a milestone dated beyond the last bar/project due/export date has no column — columnOf would throw.
- **Fix:** the writer skips diamonds whose date lies outside `startISO..endISO`; their table rows stay (matching the Milestones sheet).
- **Files modified:** export/xlsx.js

**5. [Plan correction] empty drawing part**
- **Found during:** Task 2: an empty `ws.drawing` would emit a drawing part for zero-data workbooks, breaking the R5 "no drawing part" test; `ws.drawing` is only assigned when items exist.

## Commits

- bd577a2 feat(54-04): pure Gantt geometry module with adaptive axis, bars, milestones and links
- 58f27ed feat(54-04): the Timeline sheet — Gantt table, date header, shapes, Today column, freeze and viewport
- cff6338 feat(54-04): cooperative generation — yieldToLoop between sheets, the 500-task benchmark and the exact-cap draw
- 04b9207 fix(54-04): expose the padded span on the axis (startISO/endISO)

## Threat Model Dispositions Applied

- T-54-13: SHAPE_CAP checked in buildGantt before any item is built; 400 draws, 401 degrades (both tested).
- T-54-14: yields measured — benchmark max event-loop delay well under 2000ms, wall clock under 30000ms.
- T-54-15: buildGantt reads model.rows only; the archived-predecessor fixture asserts no connector and no bar.
- T-54-16: shape names are machine ids (asserted against a strict pattern); anchor columns come from the pure axis.
- T-54-SC: nothing installed.

## Self-Check: PASSED

- src/export/gantt.js, test/export-gantt.test.mjs exist; model/locales/fixtures/xlsx modifications in HEAD.
- All four commit hashes found in git log; measured commits 0010570..04b9207 = 5.

No known stubs; no new threat surface outside the plan's register.
