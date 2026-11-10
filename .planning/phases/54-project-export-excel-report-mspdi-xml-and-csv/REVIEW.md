---
phase: 54-project-export-excel-report-mspdi-xml-and-csv
reviewed: 2026-11-10T00:00:00Z
depth: deep
files_reviewed: 20
files_reviewed_list:
  - export/xlsx.js
  - export/mspdi.js
  - src/export/model.js
  - src/export/csv.js
  - src/export/gantt.js
  - src/core/download.js
  - server.js (export route + EXPORT_FORMATS only, lines 5210-5291, 6195-6204)
  - src/overlays/modals.js (export modal only, lines 383-415)
  - src/actions/actions.js (export actions only, lines 1749-1823)
  - src/pages/project.js (export entry only, line 74)
  - src/overlays/context-menu.js (export entry only, lines 43-45)
  - test/export-model.test.mjs
  - test/export-csv.test.mjs
  - test/export-xlsx.test.mjs
  - test/export-mspdi.test.mjs
  - test/export-gantt.test.mjs
  - test/export-route.test.mjs
  - test/export-client.test.mjs
  - test/helpers/unzip.mjs
  - test/helpers/xml.mjs
  - test/make-export-samples.mjs
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 54: Code Review Report

**Reviewed:** 2026-11-10
**Depth:** deep (cross-file, with runtime verification of suspected bugs against the real fixtures)
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The export slice is overall well-built: the permission funnel on the route is ordered correctly (workspace → sameOrigin → format/scope validation → docForClient redaction → 404 parity → canManageProject → generation), extension/MIME come only from the server-side `EXPORT_FORMATS` map, `ids` is clamped to 5000, `normalizeOptions` reads only the five known keys, XML escaping is ampersand-first and verified by tests, CSV neutralises formula injection, and the R13 shape cap is inclusive with a tested degradation path. No permission, injection, or path-traversal defect was found.

However, one **confirmed data-corruption bug** exists in the MSPDI writer whenever the Subtasks toggle is on: child rows share the parent's `id`, and the UID-resolution map is keyed by that id, so assignments and dependencies silently bind to the wrong Task. Two warnings (a Timeline status-label collision of the same root cause, and an MSPDI element-order inconsistency) and three info items complete the report.

Accepted items per the orchestrator (exact `@office-kit/xlsx` pin, open UAT entries, pre-existing server.js lint errors) are not re-reported.

## Critical Issues

### CR-01: MSPDI UID map is corrupted by subtask child rows — assignments and dependency links bind to the wrong task

**File:** `export/mspdi.js:179-185` (map construction), consumed at `:212-219` (PredecessorLink) and `:274` (Assignment TaskUID)

**Issue:** `buildExportModel` emits one row per top-level task **plus one row per subtask child row** when the Subtasks toggle is on, and every child row carries the **parent's `id`** (`src/export/model.js:193`). `buildMspdi` builds its UID resolution map over ALL rows keyed by `r.id`:

```js
rows.forEach((r, i) => {
  if (r && r.id) uidOf.set(r.id, i + 1);   // child rows OVERWRITE the parent's uid
});
```

Because child rows are pushed after their parent, the last child's UID wins. Every subsequent `uidOf.get(row.id)` therefore resolves a parent task to a **child-row UID**, producing two concrete corruptions in the emitted XML:

1. **Assignments** — an assigned parent task gets `<TaskUID>` pointing at one of its child rows instead of itself.
2. **Dependency links** — a `deps` entry referencing a task that has subtasks resolves to a child row's UID, so the finish-to-start link lands on the wrong task in Microsoft Project.

**Runtime-verified** against `test/fixtures/export-fixtures.mjs` (`makeMspdiDoc` with `subtasks: true`, and with `t_x3` given an assignee and a dep): the assignment for "Subtasked task" (Task UID 3) is emitted as `<TaskUID>5</TaskUID>` — that is "Child two" — with the parent's progress value (50) attached to the child row's task. With the fixture's own dep on `t_x3`, links targeting it would resolve to UID 5 for the same reason.

The existing suite never exercises `subtasks: true` on the MSPDI path (`test/export-mspdi.test.mjs` builds all models with default options), so tests pass while the shipped output is wrong whenever the toggle — a first-class modal option — is used.

**Fix:** key the map by a per-row unique identity and index only top-level rows, e.g.:

```js
const uidOf = new Map();
rows.forEach((r, i) => {
  if (r && r.id && !r.parent) uidOf.set(r.id, i + 1); // top-level tasks only
});
```

Then in the assignment loop skip child rows (`if (row.parent) continue;` — they have no `assigneeId`, which already guards them) so `uidOf.get(row.id)` can only be called for top-level rows. Add a regression test that builds a model with `subtasks: true` plus a parent task carrying both an assignee and an inbound/outbound `deps` entry, and asserts the assignment's `TaskUID` and every `PredecessorUID` resolve to the parent task's UID.

## Warnings

### WR-01: Timeline status column uses an id-keyed map that child rows overwrite

**File:** `export/xlsx.js:168` (`fillTimeline`)

**Issue:** `const statusLabelById = new Map(model.rows.map(r => [r.id, r.status]));` — same root cause as CR-01: subtask child rows share the parent's `id` and come later in `model.rows`, so the last child's status label overwrites the parent's. The Timeline table's column C then displays the wrong status for any task whose subtask-completion state differs from its own status (e.g. a `progress` task whose subtasks are all done renders "Done" while its bar is drawn with the `progress` fill from `bar.statusId`). The bar colour is correct; only the table text lies — a visible inconsistency in the same sheet row.

**Fix:** derive the label from the bar's own machine status instead of the overwrite-prone map:

```js
const statusLabelById = id => {
  const row = model.rows.find(r => r.id === id && !r.parent);
  return row ? row.status : '';
};
```

or have `buildGantt` carry the display status on each bar (it already carries `statusId`).

### WR-02: MSPDI Assignment emits `<Finish>` before `<Start>`, contradicting the writer's own positional-schema rule

**File:** `export/mspdi.js:279`

**Issue:** The module header states the document is positional and that "one reordered child triggers Project's repair prompt" (Pitfall 8), and the Task writer follows the schema order Start → Finish (`:235`). The Assignment template however writes `<Finish>…</Finish><Start>…</Start>` — reversed relative to the Start-before-Finish order used everywhere else in MSPDI documents and in this file. The mechanical order test (`test/export-mspdi.test.mjs:313`) only pins `UID/TaskUID/ResourceUID` at the head of the assignment, so this inversion is unasserted, and the human MS Project checkpoint (an accepted open UAT item) is the only thing that would catch a repair prompt.

**Fix:** emit Start before Finish in the Assignment template:

```js
`<Assignment><UID>${aUid}</UID><TaskUID>${taskUid}</TaskUID><ResourceUID>${resourceUid}</ResourceUID><PercentWorkComplete>${pct}</PercentWorkComplete><Start>${formatDateTime(startISO, '08:00:00')}</Start><Finish>${formatDateTime(finishISO, '17:00:00')}</Finish><Units>1</Units><Work>${isoDuration(minutes)}</Work></Assignment>`
```

and extend the order assertion to cover `<Start>`/`<Finish>` inside an assignment. Verify against the open MS Project UAT either way.

## Info

### IN-01: `colLetter` implemented twice

**File:** `export/xlsx.js:291-299` and `src/export/gantt.js:94-103`

**Issue:** Two identical A..Z/AA.. column-letter helpers; xlsx.js duplicates the one gantt.js already exports (and xlsx.js imports `buildGantt` from that same module).

**Fix:** import `columnLetter` from `../src/export/gantt.js` in `export/xlsx.js` and delete the private copy.

### IN-02: ExtendedAttribute FieldIDs hardcoded twice in mspdi.js

**File:** `export/mspdi.js:222-226` vs `:112-118` (`FIELD_IDS`)

**Issue:** The per-task attribute block repeats the five FieldID string literals (`'188743731'`…) inline while `FIELD_IDS` — the declared single source the suite pins — holds the same values paired with names. A drift between the two copies would pass the `FIELD_IDS`-based test while corrupting output.

**Fix:** map over `FIELD_IDS` in row order (key, status, priority, labels, estimate): `FIELD_IDS.map(([name, id], i) => extendedAttribute(id, [row.key, row.status, row.priority, row.labels, row.estimate][i]))`.

### IN-03: Dead constant in the MSPDI task loop

**File:** `export/mspdi.js:203`

**Issue:** `const isMilestone = false; /* model.rows carries tasks and child rows only */` is always false and only feeds the `Milestone>${isMilestone ? 1 : 0}` ternary; a reader must trace both to learn nothing varies.

**Fix:** write `<Milestone>0</Milestone>` literally and delete the constant (or delete the conditional), keeping the explanatory comment.

## Verified-clean areas (focus areas from the brief)

- **Permission gating:** `server.js:5219-5249` — `requireWorkspace('viewer')` → `sameOrigin` → format/scope 400s → the single `docForClient(JSON.parse(ctx.ws.doc), …)` read (the only raw-doc reference, inside the route markers) → redacted-project find with `projectNotFound` 404 (test asserts byte-identical bodies for hidden vs nonexistent) → `canManageProject` 403 with no headers. No `ctx.ws.doc` read beyond the sanctioned redaction call; foreign ids cannot pass the scope filter (`test/export-route.test.mjs:138-150`).
- **Redaction:** the model is built exclusively from `doc.data`; a member cannot obtain redacted fields through any format because the input document never carries them.
- **XML/CSV escaping:** `escapeXml` ampersand-first with all five entities (mspdi.js:42-49); xlsx strings only via `setCell` shared strings with a no-formula assertion across all six sheets; CSV `RISKY = /^[=+\-@]/` apostrophe prefix + RFC-4180 quoting, BOM included.
- **ZIP handling:** no paths are taken from user input; the test helper (`test/helpers/unzip.mjs`) walks the central directory with zlib and is test-only.
- **R13 shape cap:** inclusive at 400 (bars + connectors, diamonds excluded), degradation writes the localized note row and a table-only Timeline, no error response (`gantt.js:190`, `xlsx.js:238-242`, tests at 772-838). 500-task benchmark yields via `setImmediate` between sheets and every 200 rows.

---

_Reviewed: 2026-11-10T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
