---
phase: 55
plan: 05
subsystem: exports
tags: [export-model, xlsx, csv, mspdi, multi-assignee]
requires: [55-01 canonical assignees[], Phase 54 export model/writers, D-54-10 count-once, CR-01 UID rules]
provides: [multi-assignee export model (assigneeIds + joined cell values), joined Assignees Tasks/Board columns, per-member KPI/Members counts, MSPDI resource+assignment pairs, model.memberNames map]
affects: [55-06 (subtask start dates D-55-18), export consumers]
tech-stack:
  added: []
  patterns: [machine-array + display-joined split in model rows, writers-never-re-read-the-doc (memberNames map)]
key-files:
  created: []
  modified:
    - src/export/model.js
    - export/xlsx.js
    - export/mspdi.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/export-model.test.mjs
    - test/export-csv.test.mjs
    - test/export-xlsx.test.mjs
    - test/export-mspdi.test.mjs
    - test/fixtures/export-fixtures.mjs
decisions:
  - Model rows: `assigneeIds` is the machine ids array; `assignees`/`assigneeName` hold the comma-joined names — the generic CSV/XLSX column reader reads row[column.key], so the display string must live on the column key. The plan's separate `assigneeNames` field was folded into `assigneeName` (identical value) rather than duplicating.
  - MSPDI resource names resolve through a new model-level `memberNames` map (model still DOM-free, zero imports; writers never re-read the document).
  - Compat scalars (`assigneeId`) existed only between Task 1 and Task 2 commits to keep the MSPDI suite green at the tracer gate; removed in Task 2.
metrics:
  duration: ~55 min
  completed: 2026-11-10
status: complete
plan_head_before: 7026b58e1800acbac8ca4b4afce0e76d09ba4228
plan_head_after: bed0a58
commits: 2
actuals:
  tokens: 11000
  tasks: 2
  commits: 2
---

# Phase 55 Plan 05: Exports carry every assignee Summary

**One-liner:** The export model carries the full `assigneeIds` array per task/subtask row with comma-joined name cells (one row per task everywhere), per-member KPI/Members counts count a shared task once per member, and MSPDI emits one Resource per member plus one Assignment row per task×assignee pair in task-major order.

## What Shipped

- **Task 1 (8e03edf, tracer)** — `src/export/model.js`: rows carry `assigneeIds` (machine array), `assignees`/`assigneeName` (joined names, `export.unassigned` when empty); subtask rows carry their own arrays (D-55-5), no hardcoded Unassigned. Tasks sheet column key `assignee` → `assignees` (en "Assignees" / fr "Assignés"), Board cell carries the full joined list (D-55-17), XLSX width 18 → 30. Members sheet + open chart iterate `assigneeIds` — a shared task counts once per member (D-55-16, extending D-54-10). Fixtures migrated to arrays; multi-assignee tests (a)–(d) added. Model stays DOM-free, zero imports.
- **Task 2 (bed0a58)** — `export/mspdi.js`: Resources collected over ALL `assigneeIds` (distinct per member, first-appearance order); Assignments emit one pair per task×assignee, task-major; child rows never shadow the parent UID (CR-01 pair level); empty-assignee rows emit nothing. Model exposes `memberNames`; the compat `assigneeId` scalars dropped. Tests (a)–(c) plus a pair-level CR-01 test.

## Deviations from Plan

- **[Rule 3 — sequencing] `export/mspdi.js` fixture arrays touched in Task 1's commit.** Fixtures move to arrays "in the same commit" per the plan; the MSPDI suite therefore ran against array fixtures at the tracer gate, so rows carried temporary first-assignee compat scalars (`assigneeId`) until Task 2 removed them. Both commits independently green.
- **[Design] `assignees` is the joined display string, `assigneeIds` the ids array** (plan sketched `assignees` as the ids array + `assigneeNames` joined). The CSV and XLSX Tasks writers read cells generically via `row[column.key]`, so the column key must resolve to the display string; the plan's `assigneeNames` was folded into the existing `assigneeName`. All writers consume `assigneeIds` exactly as the plan's actions specify.
- **[Scope boundary] Out-of-scope failures NOT fixed, logged to `deferred-items.md`:** the parallel session's uncommitted probe literal in `src/views/table.js` is the sole cause of the 4 i18n-scan test failures and the `npm run i18n:scan` "1 unlisted" verdict (proven by stashing it: 0 violations). Full-suite runs also flaked `creator-watcher`/`scope`/`activity-verbs` cells under concurrency with the parallel session's in-flight client migration; all pass standalone. Two pre-existing lint errors (`export/xlsx.js:174` unused `first`, `test/export-xlsx.test.mjs` unused import) predate this plan.

## Test Results

- `node --test test/export-model.test.mjs test/export-csv.test.mjs test/export-xlsx.test.mjs` — 92/92 pass
- `node --test test/export-mspdi.test.mjs` — 36/36 pass
- All 8 export suites — **187/187 pass**
- `node --check` model.js / xlsx.js / mspdi.js — pass
- `npm run i18n:scan` — **0 dead / 0 stale** (1 "unlisted" from the parallel session's `table.js` probe literal — out of scope, see deferred-items)
- `npm test` (full suite) — 1364 tests, 1356 pass, 8 fail, **all 8 out-of-scope** (parallel-session WIP; every failing file passes standalone)
- `npx eslint` over this plan's files — clean (repo-wide lint has pre-existing errors in files this plan did not author)

## must_haves Status

- XLSX/CSV one joined Assignees column, one row per task — ✅ (model test (a), CSV name-not-id, xlsx Tasks sheet 92/92)
- MSPDI one Resource per member, one Assignment per task×assignee, task-major, no child shadowing — ✅ (mspdi tests (a)(b)(c) + pair-level CR-01)
- Members sheet / KPIs count per member (shared task once per member) — ✅ (test (b) + chart per-member test)
- Board cell full joined list; Unassigned label when empty — ✅ (test (c) via `card.assigneeName`, joined in (a))

## Known Stubs

None.

## Self-Check: PASSED

- Commits 8e03edf, bed0a58 on HEAD; deferred-items.md and this SUMMARY present.
