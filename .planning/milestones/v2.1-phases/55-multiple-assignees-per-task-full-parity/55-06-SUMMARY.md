---
phase: 55
plan: 06
subsystem: subtasks
tags: [subtask-assignees, subtask-start-dates, picker-parity, export-model, i18n]
requires: [55-01 server normalize covers subtask assignees[], 55-03 array-based membership + assignableInProject, 55-04 S.ui.assigneePick modal (subtaskIndex mode), D-55-18 subtask start inheritance]
provides: [array-based subtask assignee renders (detail pill avStack + drawer rows), subtask `start` schema field with substart date pop (EN+FR inheritedStart), export model subtask rows `s.start || t.start`, promotion inherits subtask start]
affects: [55-07 (drawer.js:105 subtask-row avatar conversion already done here — that site is avStack), MS Project child-row dates]
tech-stack:
  added: []
  patterns: [mirror-the-due-pattern (substart clones subdue everywhere), avStack for subtask rows, catalog-counter tests moved with every key/attribute addition]
key-files:
  created: []
  modified:
    - src/features/subtasks.js
    - src/actions/subtasks.js
    - src/actions/actions.js
    - src/overlays/drawer.js
    - src/overlays/popovers.js
    - src/export/model.js
    - src/components/task-list.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/activity-verbs.test.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - Start-row label reuses the existing `page.sort.start` key ("Start date") — the task drawer's Start row already uses it; no new `page.field.start` key (research A2's conditional resolved in the cheap direction).
  - Subtask start-date activity gets its own verb `setASubtaskStartDateOn` (EN+FR) mirroring `setASubtaskDueDateOn`, rather than reusing the task-level `changedStartDateOf` which would lose the subtask context.
  - drawer.js:105 subtask-row avatar moved to `avStack(s.assignees, 3)` now (Task 1's "drawer subtask rows move to the array") — this pre-empts one site of 55-07's list; remaining t.assignee single-avatar renders stay 55-07's scope.
metrics:
  duration: ~35 min
  completed: 2026-11-10
status: complete
plan_head_before: d21e80d
plan_head_after: 44c8951
commits: 2
actuals:
  tokens: 18000
  tasks: 2
  commits: 2
---

# Phase 55 Plan 06: Subtask assignees[] parity + subtask start dates Summary

**One-liner:** Subtasks render and write `assignees[]` through the shared picker modal (avStack rows, first-name +N label, scalar reads gone), and subtask `start` dates work end-to-end — detail-view Start row, `substart` date pop with inherited tips EN+FR, promotion inherit, and export model rows writing `s.start || t.start` for MS Project.

## What Shipped

- **Task 1 (af99ce2, tracer)** — Subtask detail pill (features/subtasks.js) renders the `s.assignees` array: avStack(max 3) + first-name `+N` label (mirrors the task-form chip convention), empty pill keeps the Unassigned label; the button still opens Plan 55-04's picker via `data-pop="subassignee"` → `subtaskIndex` mode with the same `assignableInProject` predicate. Drawer subtask list rows (drawer.js:105) render `avStack(s.assignees, 3)`. No reminder fan-out added (D-55-5 exclusion — server already excludes subtask assignees). Creation inherit (`assignees: s.assignees?.length ? [...s.assignees] : [...(t.assignees || [])]`) was already landed by 55-03 (9b22dd2) — verified, not duplicated.
- **Task 2 (44c8951)** — Subtask start end-to-end: detail view gains a Start row (`s.start || t.start` relDate + `page.subtask.inheritedStart` title when inheriting); date pop `data-field="substart"` gets the sibling branch in `A.popPick` beside `subdue` (writes `s.start`, logs the new `setASubtaskStartDateOn` verb); popovers.js current-value + date-pop value resolution handle `substart`; drawer subtask rows show a start chip mirroring the inherited-due chip (calendar-arrow-up, inherited tip); `promoteSub` inherits `start: s.start || t.start`; export model subtask rows write `s.start || t.start || ''` (extending 55-05's model — no fork), so child rows stop falling through to the project start in MS Project.

## Deviations from Plan

- **[Scope already covered] my-tasks.js / members.js needed no changes.** Plan listed them for "remaining subtask assignee reads" — grep confirms zero scalar `s.assignee` reads there (55-03's sweep covered membership; the `data-assignee` newTask prefill already builds `assignees: [id]`). Files verified, not edited.
- **[Rule 2 — standing gates] Test-counter updates not in the plan's file list:** `test/activity-verbs.test.mjs` (+1 MACHINE_VERB), `test/i18n-core-features.test.mjs` (catalogue 1820 → 1822, EN-counted), `test/i18n-shell.test.mjs` + `test/i18n-toast.test.mjs` (data-a sites 487 → 488, the Start-row pill). `src/components/task-list.js` gained the `VERB_KEYS` entries for the new verb. All required by the repo's standing i18n/activity gates.
- **[Key-shape note] `page.field.start` does not exist; used the existing `page.sort.start`.** The task drawer's Start row (drawer.js) already labels with `page.sort.start`, so the subtask Start row mirrors it — one fewer key, same visible copy.
- **[Stale refs, verified live]** Plan's line refs were pre-55-03/04/05: creation-inherit code at src/actions/subtasks.js:67 was already array-based; the `subdue` handler lives at src/actions/actions.js:457 (not 432); locales at `src/locales/*.json` (not `locales/`). All refs re-verified against HEAD before editing.

## Test Results

- `node --check` on all touched sources — pass
- `grep -rn "s\.assignee[^s]" src/features/subtasks.js src/actions/subtasks.js` — empty (exit 1)
- `npm run i18n:scan` — **0 literals, 0 pending, 0 unlisted, 0 stale, 0 dead**
- `npx eslint` over this plan's touched files — clean (repo-wide `npm run lint` reports 54 errors, all pre-existing in files this plan did not author; same standing state 55-05 documented)
- `npm test` — **1382 tests, 1371 pass, 0 fail** (11 skipped, standing)

## must_haves Status

- Subtasks carry `assignees[]` with the full shape and the same picker modal in subtask mode — ✅ (renders read the array; writes go through 55-04's `S.ui.assigneePick` subtaskIndex mode with `assignableInProject`)
- Creation inherit copies the parent array (or prior subtask array) — ✅ (already in place from 55-03: `assignees: s.assignees?.length ? [...s.assignees] : [...(t.assignees || [])]`; verified)
- No reminder fan-out for subtask assignees — ✅ (none added; server exclusion per 55-02 untouched)
- Subtask start dates: `s.start || t.start` in the export model, Start row in the subtask drawer, `substart` pop, `page.subtask.inheritedStart` EN+FR — ✅ (all four landed; i18n scan 0/0)

## Known Stubs

None.

## Self-Check: PASSED

- Commits af99ce2, 44c8951 on HEAD (44c8951 is plan_head_after); this SUMMARY present.
