---
phase: 09-server-messages-activity-history
plan: 05
subsystem: activity-feed
tags: [activity, i18n, seed, filters, gap-closure]
requires: [09-03 machine verbs + actCategory classifier + structured extras]
provides: [legacy-extra suppression policy, seed without English prose, createdProject in projects filter, orphaned assignedTo fallback]
affects: [src/components/task-list.js, src/data/seed.js, src/actions/actions.js, test/activity-verbs.test.mjs]
tech-stack:
  added: []
  patterns: [drop-at-render policy, documented equivalence exceptions]
key-files:
  created: []
  modified:
    - src/components/task-list.js
    - src/data/seed.js
    - src/actions/actions.js
    - test/activity-verbs.test.mjs
decisions:
  - Legacy string extras render '' (dropped, never divulged) — the seed conversion makes every demo row structured so nothing visible is lost
  - createdProject restored into ACT_CATEGORIES.projects as a documented equivalence exception (WR-01); D-06 status quirks untouched
  - assignedTo falls back to '' both at render (e.value ?? '') and at write (mem(v)?.name ?? '')
metrics:
  duration: ~15 min
  completed: 2026-10-24
status: complete
actuals:
  tokens: 45000
  tasks: 2
  commits: 2
---

# Phase 09 Plan 05: Legacy prose suppression & filter restore Summary

**One-liner:** actExtraHtml drops legacy string extras instead of leaking them, the demo seed carries 4 structured extras, and the Projects filter selects project creation from both vocabularies.

## What was built

- **CR-03 + WR-09 (Task 1):** `actExtraHtml` string branch now returns `''` (comment rewritten to document the drop-rather-than-leak policy). The four prose extras in `seed.js` are converted to the structured form the live writers produce: `statusMoved` (todo→review) for t3 and t24, `prioritySet` (urgent) for t9, `assignedTo` for t8. Seed verbs stay legacy fragments (ACT-02). The suppression pin test is unskipped and a new test proves the converted seed extras render translated through the catalogue. Grep confirms zero `skip:` in the file.
- **WR-01 + WR-02 (Task 2):** `createdProject` added to `ACT_CATEGORIES.projects`; comment rewritten to explain the deliberate restore (case-sensitive `includes('project')` was an accident). `EXTRA_VARS.assignedTo` resolves `value: e.value ?? ''`; the subtask write site uses `mem(v)?.name ?? ''`. The equivalence test now documents the `createdProject` exception with rationale; a new test proves an orphaned `assignedTo` never renders the `{value}` literal.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Seed assignedTo value corrected to the real assignee**
- **Found during:** Task 1
- **Issue:** The plan literal said `value: 'Sarah Chen'` for the t8 assignment, but t8's real seed assignee is `m4` = Emma Wilson. The plan's own must-have ("la forme structurée que l'action vivante écrirait pour le même événement … aux ids réels du seed") wins over the literal.
- **Fix:** `{ kind: 'assignedTo', value: 'Emma Wilson' }`.
- **Files modified:** src/data/seed.js
- **Commit:** 235523c

## Verification

- `node --test test/activity-verbs.test.mjs` — 10 pass, 0 skipped
- `npm test` — 421 pass, 0 fail
- `npm run build` — i18n scan 0 literals/0 pending, bundle green
- Task-1 verify arithmetic confirmed: exactly 4 structured extras in seed.js

## Self-Check: PASSED

- Commits 235523c and ff3ae40 verified in `git log`
- All 4 modified files present in the diff of the two commits