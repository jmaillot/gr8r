---
phase: "54"
slug: "project-export-excel-report-mspdi-xml-and-csv"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
status: draft
nyquist_compliant: true
wave_0_complete: true
created: "2026-11-09"
updated: "2026-11-09"
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Regenerated against the five-plan set (54-01 … 54-05) after the plan-checker review.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node ≥ 24), `node --test --test-concurrency=2 test/*.test.mjs` |
| **Config file** | none — the suite is plain ESM test files under `test/` |
| **Quick run command** | `node --test --test-concurrency=2 test/export-model.test.mjs test/export-csv.test.mjs test/export-gantt.test.mjs` |
| **Writer run command** | `node --test --test-concurrency=2 test/export-xlsx.test.mjs test/export-mspdi.test.mjs` |
| **Full suite command** | `npm test` (plus `npm run i18n:scan`, `npm run lint`, `npm run format:check`, `npm run build`) |
| **Estimated runtime** | ~90–150 s full suite; ~5–15 s targeted export files |

---

## Sampling Rate

- **After every task commit:** Run the quick or writer command for the files the task touched
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** `npm test` + `npm run i18n:scan` + `npm run lint` + `npm run format:check` + `npm run build` green
- **Max feedback latency:** 60 seconds for the targeted files

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | R1, R2, R3, R9, R10, R11, R12 | T-54-01, T-54-02, T-54-03 | Cannot-read caller gets 404 parity; reader-without-manage gets 403 with zero bytes; CSV has a BOM and neutralises `= + - @`; assignee cells show names not ids | unit + integration | `node --test --test-concurrency=2 test/export-model.test.mjs test/export-csv.test.mjs test/export-route.test.mjs` | ❌ W0 (created by this task) | ⬜ pending |
| 54-01-02 | 01 | 1 | R1, R9 | T-54-04 | Controls render only for a manager; `filename*` parsed before `filename`; a binary body is never parsed as text | unit (source assertions) | `node --test --test-concurrency=2 test/export-client.test.mjs` | ❌ W0 (created by this task) | ⬜ pending |
| 54-01-03 | 01 | 1 | R2, R3, R9 | T-54-06 | Scope ids intersect the project's own tasks; each toggle adds exactly its content; the static path never calls the network | unit | `node --test --test-concurrency=2 test/export-model.test.mjs test/export-csv.test.mjs test/export-client.test.mjs` | ❌ W0 (extends this plan's files) | ⬜ pending |
| 54-02-01 | 02 | 2 | R4, R12 | T-54-SC | Package identity, exact version and integrity are approved before any install | manual checkpoint | `! grep -q "@office-kit/xlsx" package.json && ! grep -q "@office-kit/xlsx" package-lock.json` | ✅ (files exist) | ⬜ pending |
| 54-02-02 | 02 | 2 | R4, R10, R12 | T-54-08, T-54-05 | No module under `src/` reaches the writer; the export route holds exactly one raw-document reference and it is the `docForClient` argument | unit (unzip-free source scan) | `node --test --test-concurrency=2 test/dependencies.test.mjs test/export-prohibition.test.mjs` | ❌ W0 (created by this task) | ⬜ pending |
| 54-02-03 | 02 | 2 | R4, R12 | T-54-07, T-54-09 | Six ordered sheets with frozen headers; user text is a shared string, never a formula; child rows indented; dates are real dates in the reader's locale | unit (unzip + XML) | `node --test --test-concurrency=2 test/export-xlsx.test.mjs test/export-model.test.mjs` | ❌ W0 (created by this task) | ⬜ pending |
| 54-03-01 | 03 | 3 | R4, R5, R7, R11 | T-54-11 | Chart, lane, member and milestone counts equal the exported top-level rows; every chart block carries its translated title | unit | `node --test --test-concurrency=2 test/export-model.test.mjs` + `npm run i18n:scan` | ✅ (extends plan 01 file) | ⬜ pending |
| 54-03-02 | 03 | 3 | R5, R11 | T-54-11 | Chart caches equal the source-block cells; chart title and block label come from the model in EN and FR | unit (unzip + XML) | `node --test --test-concurrency=2 test/export-xlsx.test.mjs test/export-model.test.mjs` | ✅ (extends plan 02 file) | ⬜ pending |
| 54-03-03 | 03 | 3 | R5, R7, R11 | T-54-10 | Members and Board derive only from the exported rows; chart 3 cache matches its computed source block; one progress scale across sheets | unit (unzip + XML) | `node --test --test-concurrency=2 test/export-xlsx.test.mjs test/export-model.test.mjs` | ✅ (extends plan 02 file) | ⬜ pending |
| 54-04-01 | 04 | 4 | R6, R13 | T-54-15 | Daily/weekly switch exact at 90/91 padded days; `columnOf` is the single column source; Today is null outside the span; cap inclusive at 400 | unit (geometry) | `node --test --test-concurrency=2 test/export-gantt.test.mjs` | ❌ W0 (created by this task) | ⬜ pending |
| 54-04-02 | 04 | 4 | R6 | T-54-13, T-54-16 | Bars and connectors anchor on `columnOf`; no task title reaches a shape name; no Today fill for an out-of-span export date | unit (unzip + XML) | `node --test --test-concurrency=2 test/export-xlsx.test.mjs test/export-gantt.test.mjs` | ✅ (extends plan 02 file) | ⬜ pending |
| 54-04-03 | 04 | 4 | R13 | T-54-14 | 500-task/400-dep fixture yields a valid buffer with a maximum event-loop delay under two seconds; 401 shapes degrade to the note row | benchmark | `node --test --test-concurrency=2 test/export-xlsx.test.mjs` | ✅ (extends plan 02 file) | ⬜ pending |
| 54-05-01 | 05 | 5 | R8, R12 | T-54-17, T-54-18 | Well-formed ordered MSPDI; five entities escaped; Notes only when opted in; durations from the estimate grammar at 480 min/day | unit (XML) | `node --test --test-concurrency=2 test/export-mspdi.test.mjs` | ❌ W0 (created by this task) | ⬜ pending |
| 54-05-02 | 05 | 5 | R8, R9, R11, R12 | T-54-20 | Extension and media type come from the static map; an unsupported or path-shaped format is rejected before generation; every format key exists in EN and FR | unit + build gate | `node --test --test-concurrency=2 test/export-route.test.mjs test/export-client.test.mjs` + `npm run build` | ✅ (extends plan 01 files) | ⬜ pending |
| 54-05-03 | 05 | 5 | R8 | T-54-18 | Microsoft Project opens the generated file without a repair prompt | manual (human checkpoint) | `test -s test-results/export-samples/project-en.xml && test -s test-results/export-samples/project-en.xlsx && node --test --test-concurrency=2 test/export-mspdi.test.mjs` | ✅ (samples written by 54-05-02) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Every Wave 0 file is created by a task in this plan set; none is a free-standing prerequisite.

- [x] `test/fixtures/export-fixtures.mjs` — deterministic project factories (daily, weekly, 90/91 boundary, future-only, empty lane, zero-chart, zero-dated, dependency, cap, benchmark, MSPDI) — 54-01-01, extended by 54-02-03, 54-03-01, 54-04-01/03, 54-05-01
- [x] `test/export-model.test.mjs` — scope, toggles, progress parity with `taskProg`, overdue, comments/subtasks, summary/charts/board/members/milestones — 54-01-01, extended by 54-01-03 and 54-03-01
- [x] `test/export-csv.test.mjs` — BOM, header, RFC 4180 quoting, formula neutralisation, encoding — 54-01-01
- [x] `test/export-route.test.mjs` — 404 parity, 403 for readers without manage rights, headers, filename sanitiser, `no-store`, format allow-list — 54-01-01, extended by 54-05-02
- [x] `test/export-client.test.mjs` — both entry points, modal, format list per mode, catalogue parity — 54-01-02, extended by 54-01-03 and 54-05-02
- [x] `test/helpers/unzip.mjs` and `test/helpers/xml.mjs` — zip reader (`node:zlib`) and tag-balance check — 54-02-02
- [x] `test/export-prohibition.test.mjs` — no `src/` module reaches the writer; one raw-document reference — 54-02-02
- [x] `test/export-xlsx.test.mjs` — six sheets, escaping, indent, charts, Gantt shapes, cap, benchmark — 54-02-03, extended by 54-03-02/03 and 54-04-02/03
- [x] `test/export-gantt.test.mjs` — padded axis, 90/91 boundary, bar widths, links, cap — 54-04-01
- [x] `test/export-mspdi.test.mjs` — well-formedness, order, links, field ids, durations, escaping — 54-05-01
- [x] `test/make-export-samples.mjs` — sample generator for the human checks — 54-05-02

*Existing `node:test` infrastructure (including `test/catalogue.test.mjs`, `test/error-codes.test.mjs`, `test/dependencies.test.mjs`) covers the runner and the cross-cutting gates; the files above are the new ones.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Microsoft Project opens the MSPDI export with no repair prompt | R8 | Requires a Project-equipped Windows machine; CI can only assert XML structure | Run `node test/make-export-samples.mjs`, open `test-results/export-samples/project-en.xml` in Project, confirm no repair dialog, count tasks and milestones, check the finish-to-start link and the five custom field values, and confirm accented text survived |
| The workbook renders bars, charts and arrowheads in Excel | R5, R6 | Excel's renderer is the acceptance surface; LibreOffice is a proxy | Open the `.xlsx` on Excel desktop (or LibreOffice), confirm three charts, visible Gantt bars and connector arrowheads |
| Workbook opens on `Timeline` scrolled to the current week | R6 | Sheet activation and scroll position are viewer behaviours | Open the file, confirm the active tab is `Timeline` and the leftmost visible date column is the current week |
| The French report shows no English export string | R11 | Requires reading the rendered artifact | Run the sample script's FR output, open `project-fr.xlsx`, confirm sheet names stay English while every header, chart title and status label is French |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending `/gsd-validate-phase 54`