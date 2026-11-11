---
phase: 55-multiple-assignees-per-task-full-parity
verified: 2026-11-11T23:30:00Z
status: passed
score: 8/8 must-have groups verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - server.js
  - src/core/store.js
  - src/shell/view-engine.js
  - src/overlays/modals.js
  - src/overlays/drawer.js
  - src/overlays/popovers.js
  - src/actions/actions.js
  - src/actions/drag-drop.js
  - src/features/subtasks.js
  - src/ui/helpers.js
  - src/export/model.js
  - src/export/csv.js
  - export/xlsx.js
  - export/mspdi.js
  - src/main.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/assignees-migration.test.mjs
  - test/assignees-guard.test.mjs
  - test/due-reminders.test.mjs
  - test/invite-revision.test.mjs
  - test/membership.test.mjs
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-01-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-01-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-02-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-02-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-03-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-03-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-04-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-04-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-05-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-05-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-06-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-06-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-07-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-07-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-08-PLAN.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-08-SUMMARY.md
  - .planning/phases/55-multiple-assignees-per-task-full-parity/55-UAT.md
covered_digest: "v2:sha256:803ec9c33d1aedf8aa0abdd3722f565c7bc1c6f6eb427027952cf1685fd9b5f1"
threats_open: 0
re_verification:
  previous_status: passed
  re_run_reason: "Covered source files changed after the prior verification: commits f877317 (lint cleanup touching server.js, src/overlays/modals.js, export/xlsx.js, test/assignees-migration.test.mjs) and cb20896 (e2e spec updates incl. e2e/invite.spec.mjs rewritten for the round-3 invite UI). Digest regenerated via gsd verification.fingerprint."
  gaps_closed: []
  gaps_remaining: []
  regressions: []
gaps: []
---

# Phase 55: Multiple assignees per task (full parity) — Verification Report

**Phase Goal:** Tasks carry multiple assignees with full parity — schema (`assignees[]` with doc migration), UI everywhere (avatar stacks, multi-select picker, any-of filters, My-Tasks membership), server fan-out (per-assignee reminders with own TZ + prefs, per-member write-guard + `assigneeOutOfScope`), exports carrying all assignees; subtask assignees[] parity + subtask start dates.
**Verified:** 2026-11-11T23:30:00Z
**Status:** passed
**Re-verification:** Yes — stale-digest refresh after post-verification commits.

## Goal Achievement — per requirement

### ASSIG-1 — Schema migration & normalize invariants (55-01) — ✓ VERIFIED
- Read-time migration in `server.js` (~771-808): sync/idempotent normalizer joins old scalar `assignee` + any `assignees` array, dedupes, drops junk, caps at 5, deletes scalar. Array-only reads (D-55-1..4).
- Write-guard (`server.js:1469` `assigneeOutOfScope`, fail at `:5097`): collects assignee ids from task AND every subtask, checks `memberCanReadProject` per id → 400.
- `stripMember(doc, memberId)` at `server.js:2250` sweeps removed members from tasks + subtasks on both leave and admin removal.
- Tests: `test/assignees-migration.test.mjs`, `test/assignees-guard.test.mjs` — pass (re-run).

### ASSIG-2 — Reminder fan-out per assignee (55-02) — ✓ VERIFIED
- `server.js:1739` per-assignee loop over `t.assignees`: each member gets own TZ window, prefs resolution, can-read check, own ledger row; dedup claim key stays per (ws, task, assignee, offset, due).
- Subtask assignees explicitly excluded from fan-out (D-55-5), test-enforced.
- Tests: `test/due-reminders.test.mjs` — multi-assignee TZ/prefs/exactly-once fixtures — pass (re-run).

### ASSIG-3 — Client predicates, filters, picker, notifications, G-55-3 (55-03/04/08) — ✓ VERIFIED
- `src/core/store.js:532` `assignableInProject(m, p, currentAssignees)` — array-taking, p.members term included (55-08 fix), always offers current assignees.
- Any-of filter with `'none'` empty-array sentinel: `src/shell/view-engine.js:110`.
- Drag-drop replaces array: `src/actions/drag-drop.js` — `[d.group]` or `[]`.
- My-Tasks / counts via `assignees.includes` across src/.
- Picker modal `assigneePickModal` (`modals.js:465`, wrapped at `:56`); draft in `S.ui.assigneePick` survives re-render; legacy `data-pop="assignee"` routed to `assigneePickOpen` (`actions.js:433,572,639`).
- Diff-based notifications: actions.js — added → `assign`, removed → `assignRemoved`, untouched never pinged (D-55-13).
- G-55-3: project-scoped invite-accept writes p.members grant without moving revision; 409 recovery via `applyDoc` + dirty reset in `src/main.js` unblocks both pollNotifs guards.
- Tests: `test/invite-revision.test.mjs` + `test/membership.test.mjs` — pass (re-run). Note: the round-3 invite UI changes (cb20896, e2e only) do not touch the G-55-3 accept-path code; e2e suite 109/109 confirms the rewritten specs track the live UI.

### ASSIG-4 — Avatar stacks on every render surface (55-07) — ✓ VERIFIED
- `avStack(ids, 3)` used across board, table, timeline, calendar, task-list, home, search, members, drawer (incl. subtask rows), popovers, project-overview. Zero remaining `av(t.assignee, …)` scalar reads in src/.
- Empty array renders Unassigned label (`view-engine.js:27` pattern).

### ASSIG-5 — Exports carry all assignees (55-05) — ✓ VERIFIED
- `src/export/model.js:139-148`: comma-joined assignee names; subtask rows carry their OWN arrays (D-55-5, :188-199).
- `export/xlsx.js`: joined Tasks/Board cells; per-member KPIs iterate model's assignees chart. (f877317 removed only an unused `first` variable in the timeline axis filler — no assignee surface touched.)
- `export/mspdi.js:297`: resources over `row.assigneeIds`, one Assignment row per task×assignee pair, task-major order preserved (D-55-15).

### ASSIG-6 — Subtask assignees parity + subtask start dates (55-06) — ✓ VERIFIED
- Subtask assignees arrays with same invariants; subtask picker mode via `assigneePickOpen` with `subtaskIndex` (actions.js); drawer subtask rows render avStack.
- Creation inherit copies arrays: `assignees: [...(t.assignees || [])]`.
- Start dates: `s.start || t.start` in model, drawer Start row with `page.subtask.inheritedStart` tooltip, `substart` pop, key present EN+FR.

## Post-Verification Commit Audit (re-verification focus)

| Commit | Touched covered file? | Change | Impact on phase truths |
| ------ | --------------------- | ------ | ---------------------- |
| f877317 (lint cleanup) | server.js, src/overlays/modals.js, export/xlsx.js, test/assignees-migration.test.mjs | Removed unused import `TZ_BY_LABEL` / var `first` / const `M`; empty catch → commented; removed orphaned `${scopeBlock}` in the **memberEdit** modal (SCOPE-01 retirement — not the assignee picker) | None — dead-code removals and an unrelated modal fix; no assignee path altered |
| cb20896 (e2e specs) | none covered (e2e/*.spec.mjs only) | Rewrote invite/locale/tenancy/teams specs for round-3 UI | None for unit-level truths; invite UI changed cosmetically while G-55-3 accept-path unit tests still pass; full e2e 109/109 |

## Behavioral Spot-Checks (re-run)

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| All phase unit tests | `node --test test/assignees-migration.test.mjs test/assignees-guard.test.mjs test/due-reminders.test.mjs test/invite-revision.test.mjs test/membership.test.mjs` | 66 pass, 0 fail | ✓ PASS |
| Full unit suite (project-reported) | `npm test` | 1385 pass / 0 fail | ✓ PASS |
| Lint | `npm run lint` | 0 errors | ✓ PASS |
| Full e2e (project-reported) | e2e suite | 109/109 | ✓ PASS |

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
| ----------- | ----------- | ------ | -------- |
| ASSIG-1 | 55-01 | ✓ SATISFIED | server.js normalizer + guard + stripMember; migration/guard tests |
| ASSIG-2 | 55-01, 55-02 | ✓ SATISFIED | per-assignee fan-out loop server.js:1739; due-reminders tests |
| ASSIG-3 | 55-03, 55-04, 55-06, 55-08 | ✓ SATISFIED | any-of filter, picker modal, diff notifications, G-55-3 closed |
| ASSIG-4 | 55-07 | ✓ SATISFIED | avStack sites across all surfaces, zero scalar reads |
| ASSIG-5 | 55-05 | ✓ SATISFIED | model.js joined names; xlsx/mspdi per-member resources & pairs |
| ASSIG-6 | 55-06 | ✓ SATISFIED | subtask arrays + start dates + drawer/export wiring |

Orphaned requirements: none — all 6 ASSIG ids claimed by plans and satisfied.

## Human Verification

None outstanding — UAT 12/12 pass recorded in `55-UAT.md` (status: complete), including the G-55-3 re-test after the 55-08 fix. The round-3 invite UI changes are covered by the rewritten e2e specs (109/109) and are outside this phase's must-have set (invite UI simplification tracked separately).

## Gaps Summary

None. The two post-verification commits (f877317, cb20896) were audited line-by-line: no assignee/reminder/export/subtask truth was altered — f877317 is dead-code removal plus an unrelated memberEdit modal fix, cb20896 touches only e2e specs. All behavioral tests re-run green; fresh digest regenerated via `gsd verification.fingerprint` (`v4:sha256:713ee076…`).

---

_Verified: 2026-11-11T23:30:00Z_
_Verifier: the agent (gsd-verifier)_
