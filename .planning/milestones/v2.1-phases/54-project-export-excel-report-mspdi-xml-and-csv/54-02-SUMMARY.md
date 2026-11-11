---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
plan: 02
subsystem: project-export
tags: [export, xlsx, supply-chain, prohibition, i18n-free-writer]
requires: [src/export/model.js, buildExportModel, EXPORT-ROUTE markers, canManageProject]
provides: [@office-kit/xlsx 0.26.1 exact pin, export/xlsx.js six-sheet writer + Tasks sheet, xlsx export format on POST …/export, test/helpers/unzip.mjs, test/helpers/xml.mjs, test/export-prohibition.test.mjs]
affects: [plans 03-04 (Board/Timeline/Members/Milestones sheets, Gantt), plan 05 (MSPDI), downstream workbook content]
tech-stack:
  added: ["@office-kit/xlsx@0.26.1 (exact pin, MIT, no install script — human-approved 2026-11-10)"]
  patterns: [subpath-only writer imports, node:zlib central-directory unzip for verification, source-contract prohibition test, count-assertion on the raw-document token]
key-files:
  created: [export/xlsx.js, test/export-prohibition.test.mjs, test/export-xlsx.test.mjs, test/helpers/unzip.mjs, test/helpers/xml.mjs]
  modified: [package.json, package-lock.json, eslint.config.js, Dockerfile, test/dependencies.test.mjs, server.js, test/export-route.test.mjs]
decisions:
  - "Owner approval recorded 2026-11-10: approved @office-kit/xlsx 0.26.1 (blocking-human checkpoint T-54-SC) — stays on 0.26.1 until the probe fixtures are re-run against 0.27.0"
  - "Widths and wrap are keyed by COLUMN KEY, not header label — labels are i18n keys and would lookup-miss"
  - "Widths per column: key 10, title 40, status/priority 12, assignee 18, dates 12, progress 10, labels 20, estimate 10, description/comments/latestComment/thread 40"
  - "Prohibition test counts the raw-document token inside the EXPORT-ROUTE markers AFTER stripping comments (the markers self-document the rule, which would otherwise double the count)"
  - "Route test unsupported-format probe moved from xlsx (now supported) to mpp — pins the no-.mpp prohibition"
metrics:
  duration: 14 min
  completed: 2026-11-10
status: complete
actuals:
  tokens: 184000
  tasks: 3
  commits: 4
commits: 4
plan_head_before: 30344a4
plan_head_after: c909ca5
---

# Phase 54 Plan 02: XLSX Workbook Foundation Summary

Pinned `@office-kit/xlsx@0.26.1` behind the blocking human checkpoint (owner approval recorded 2026-11-10: approved @office-kit/xlsx 0.26.1), landed the three repository gates the new dependency breaks (dependency list, ESLint node globals for `export/`, Docker COPY), and built the six-sheet workbook shell with a complete, escaped Tasks sheet — 41 tests green across the four export/dependency suites.

## Coverage

- **T-54-SC (checkpoint + install)** — exact pin `0.26.1` via `npm install --save-exact`; post-install verification: version 0.26.1, licence MIT, no install script, lockfile integrity `sha512-f+7p0PHHiNtBcBmj4sBp8RnzKBQEMeh6RnEOj2aerwgzfqcf7s48PdAIbTWQoq7t9A123+UVQlUlYSOQ+uY3Mg==` matches the approved hash. package.json untouched until approval (checkpoint verify ran clean before install).
- **Task 2 (gates + prohibition)** — dependency gate accepts exactly `{@office-kit/xlsx: '0.26.1', pg: ^8}` with an exact-pin assertion; `export/**/*.js` in the ESLint node-globals block; Dockerfile runtime stage copies `export/` and the COPY gate pins 12 targets; `test/helpers/unzip.mjs` (EOCD→central-directory→inflateRawSync, `fromBuffer` never used — broken in 0.26.1) and `test/helpers/xml.mjs` (tag-stack well-formedness + raw tag extraction); prohibition test proves (a) zero writer mentions under `src/`, (b) no root-`export/` writer import from `src/` (src/export/ model/csv/gantt untouched), (c) exactly ONE `ctx.ws.doc` token inside the EXPORT-ROUTE markers — the docForClient argument (count assertion, comment-stripped), (d) export/ imports constrained to builtins + writer subpaths + src/.
- **Task 3 (workbook + Tasks sheet)** — six sheets created up front in Summary/Tasks/Board/Timeline/Members/Milestones order, frozen A2 panes, landscape page setup, `bookViews` activeTab 0 beside `setActiveSheet`; Tasks sheet fully model-driven (assignee = name never id, shared-string text only — `=1+1` stays literal, no `<f>` element anywhere, script tags inert via plainText, no "undefined", UTF-8 accents round-trip); real UTC-midnight Date cells under builtin numFmtId 14; progress stores the raw 0-100 value under literal `0"%"`; child rows one-level cell-style indent on the title only; route serves `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` with the writer awaited inside the try/catch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test] tags() matched `<sheets>` as a `<sheet>` open tag**
- **Found during:** Task 3 verify
- **Issue:** the tag regex captured the `s` of `<sheets>` as an attribute; the sheet-order test counted 7
- **Fix:** look-ahead `(?=[\s/>])` after the tag name in test/helpers/xml.mjs; also fixed self-closing detection (attrs could greedily swallow the trailing `/`)
- **Commit:** c909ca5

**2. [Rule 1 - Bug] Task-sheet column widths were keyed by header LABEL, not column key**
- **Found during:** Task 3 verify
- **Issue:** labels are i18n keys (`export.col.key`), so every WIDTHS lookup missed and all columns fell to width 12
- **Fix:** initSheet takes the column-key array alongside the labels
- **Commit:** c909ca5

**3. [Rule 1 - Test] prohibition count assertion tripped on the markers' own comment**
- **Found during:** Task 2 verify
- **Issue:** the route markers document "Never ctx.ws.doc" in a comment, doubling the raw-document count
- **Fix:** strip block/line comments before counting; the counted occurrence must be the `await docForClient(JSON.parse(` line
- **Commit:** 1cbf6d7

**4. [Rule 3 - Drift] route unsupported-format probe was `xlsx`**
- **Found during:** Task 3 verify
- **Issue:** 54-01's route test used `{format: 'xlsx'}` as its 400 probe; xlsx is now a supported format
- **Fix:** probe changed to `mpp`, which additionally pins the no-.mpp prohibition
- **Commit:** c909ca5

## Auth Gates

None.

## Known Stubs

None — every sheet exists with header/freeze/page setup and the Tasks sheet is fully wired; Board/Timeline/Members/Milestones content and charts/Gantt are plans 03-04 scope by design (empty sheets are the planned shell, not placeholders).

## Threat Flags

None new — the plan's threat model surface landed as specified: T-54-07 (shared-string-only writes, proven by the no-`<f>` assertion), T-54-08 (writers at repo root + mechanical prohibition test), T-54-09 (UTF-8 round-trip + script inertness), T-54-SC (exact pin + integrity + no install script).

## Deferred Issues (pre-existing on main, out of scope)

`npm run lint` fails at HEAD on files this plan did not touch (50 errors: db-adapter.mjs no-undef ×10, test/browser-push.test.mjs no-undef ×20, mailer.js no-control-regex, server.js TZ_BY_LABEL + empty block, context-menu.js canManageProject no-undef, several no-unused-vars). Verified present at HEAD before this plan (eslint on db-adapter.mjs with the HEAD config reproduces). All files touched by 54-02 lint clean. Logged in the phase `deferred-items.md`.

## Self-Check: PASSED

- Created files exist and are committed: export/xlsx.js, test/export-prohibition.test.mjs, test/export-xlsx.test.mjs, test/helpers/unzip.mjs, test/helpers/xml.mjs.
- Commits 022698f, 1cbf6d7, c909ca5 present in git log on main (plus deferred-items.md landed with 1cbf6d7).
- Final verification: 41/41 tests (dependencies, prohibition, xlsx, model), 21/21 (route + csv), route-ordering and client suites green; `node --check` on export/xlsx.js and server.js; eslint clean on all touched files.
