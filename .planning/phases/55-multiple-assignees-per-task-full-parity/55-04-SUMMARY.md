---
phase: 55
plan: 04
subsystem: assignee-picker-client
tags: [assignees, picker-modal, chip-pattern, cap, notifications, i18n]
requires: [55-01 canonical assignees[] server shape, 55-03 array-taking assignableInProject predicate]
provides: [assignee picker search modal (S.ui.assigneePick draft), client cap-5 guard with hint, diff-based removed-assignee notification (notif.assignRemoved), pop-free assignee entry points]
affects: [55-06 (subtask assignees render — picker already writes s.assignees), 55-07 (avatar stacks replace remaining single-avatar renders)]
tech-stack:
  added: []
  patterns: [invite-modal chip pattern (draft in S.ui, data-in search binding), array-replace writes (D-55-3), diff-based notify (D-55-13), belt-and-braces client cap (T-55-11)]
key-files:
  created: []
  modified:
    - src/overlays/modals.js
    - src/overlays/popovers.js
    - src/actions/actions.js
    - src/core/constants.js
    - src/pages/inbox.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs
    - test/i18n-overlays.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - pop replacement via A.pop interception (d.pop 'assignee'/'subassignee' → the picker modal) — the placement buttons in board/table/task-list/drawer/subtasks keep their data-pop attributes untouched, per the plan's "buttons themselves untouched" clause
  - subtask subassignee pop also routes to the picker (subtask mode writes the canonical s.assignees array, D-55-5); the A.popPick scalar subassignee branch was removed as dead code
  - removed-assignee rows file under the inbox Assignments category (inCat mapping in inbox.js) so the D-55-13 mirror notification is discoverable
metrics:
  duration: ~55 min
  completed: 2026-11-10
status: complete
plan_head_before: 9b22dd2fa956d100f0c0ac465c1d6e0f2872a391
plan_head_after: d21e80d
commits: 1
actuals:
  tokens: 11500
  tasks: 1
  commits: 1
---

# Phase 55 Plan 04: Assignee picker modal + diff notifications Summary

**One-liner:** The single-assignee pop is replaced everywhere by a chip-pattern search modal (draft in `S.ui.assigneePick`, data-in-bound search, `assignableInProject` candidate filter, cap-5 block with EN+FR hint), the confirm applies the whole draft as one array write, and removed assignees now get the `notif.assignRemoved` notification while untouched members are never pinged.

## What Shipped

- **Task 1 (d21e80d, tracer)** — `assigneePickModal` in modals.js (invite-chip pattern): draft rides `S.ui.assigneePick = { taskId, subtaskIndex, draft, q }` so a full re-render never wipes the selection (STATE.md pitfall 4); the search input is `data-in="assigneePickQ"` bound with its value restored from state each render; candidates filter through 55-03's array-taking `assignableInProject` (members already in the draft always offered — D-55-9 client layer); at `ASSIGNEE_CAP` (5, new constant in constants.js) further adds are blocked with the `page.field.assigneeCap` hint (D-55-7, T-55-11 UX belt). `A.pop` intercepts `data-pop="assignee"` and `data-pop="subassignee"` → the modal (board cell, table cell, drawer field, form chip, subtask pill, ctx-menu Assign); `A.assigneePickOpen/Toggle/Apply` + `IN.assigneePickQ`; Apply writes the whole array via `updateTask` (task), `S.ui.form.assignees` (`__form`), or a subtask mutate with per-member assigned/unassigned activity verbs. `applyPatch` assignees branch now also notifies removed members (`type: 'assignRemoved'`, memberScopeEligible pre-filtered — D-55-13); inbox.js files those rows under the Assignments category. Pop cases `'assignee'`/`'subassignee'` and the dead scalar `A.popPick` subassignee branch removed; orphaned `a11y.assignSubtask` key swept. Task-form chip label renders the draft array (first name + `+N`) instead of the dead scalar. New keys EN+FR: `page.field.assigneeCap`, `modal.assigneeSearch`, `modal.assigneeNoMatches`, `notif.assignRemoved` (−1 `a11y.assignSubtask`).

## Test Results

- `npm test` — **1382 tests, 1371 pass, 0 fail**
- `npm run i18n:scan` — 0 literals, 0 pending, 0 stale, **0 dead**
- `npx eslint` on all touched files — clean
- `node --check` on all touched sources — pass
- `grep 'data-pop="assignee"' src/overlays/popovers.js` — empty (exit 1)

## must_haves Status

- Picker modal opens from board cell, table cell, drawer field (and form chip, ctx menu); `data-pop="assignee"` gone from popovers.js — ✅
- Candidates = `assignableInProject(m, proj, draft)` only; draft members always offered — ✅ (55-03 predicate consumed, not re-derived)
- 6th add blocked with visible hint; hint keys exist EN+FR — ✅ (`page.field.assigneeCap`)
- Modal selection survives a full re-render — ✅ (draft in `S.ui.assigneePick`, input value from state)
- Diff-based notifications: added → `assign`, removed → `assignRemoved`, untouched never pinged — ✅ (applyPatch)
- i18n:scan 0 dead / 0 stale; lint clean on touched files; full suite green — ✅

## Deviations from Plan

- **[Plan-driven test updates] i18n count/action pins** — `test/i18n-core-features.test.mjs` (catalogue 1817→1820), `test/i18n-overlays.test.mjs` (removed `a11y.assignSubtask` oracle row), `test/i18n-shell.test.mjs` + `test/i18n-toast.test.mjs` (data-a 483→487, data-v 80→82). No behavior assertions changed.
- **[Rule 2 — small] src/pages/inbox.js** (not in files_modified): `assignRemoved` rows map into the Assignments category filter — without it the new notification is invisible outside "All", defeating D-55-13's discoverability.
- **[Scope note] `npm run lint` (full tree) fails with 54 pre-existing errors in 19 files unrelated to this plan** (db-adapter.mjs, server.js, test/*, e2e/*, export/xlsx.js, mailer.js…). Verified pre-existing via stash-isolation; all files touched by this plan lint clean individually. Logged to deferred-items.md; not fixed (scope boundary).
- **[Render-site exception, carried] the form chip, board/table/drawer/subtask buttons still render the first-assignee avatar from the (now-empty) scalar reads** — display-only, owned by 55-07 (task surfaces) and 55-06 (subtask drawer); the picker writes canonical arrays meanwhile.

## Known Stubs

None introduced by this plan. (The remaining single-avatar render reads above are pre-existing deferrals owned by 55-06/55-07.)

## Threat Flags

None — no new trust boundaries; the client cap is the UX half of T-55-11 with the server (55-01) as authority; candidate filtering implements T-55-07's mitigation.

## Self-Check: PASSED

- All plan files touched and committed (d21e80d on HEAD); suite 0 fail; i18n scan 0/0; grep empty.
