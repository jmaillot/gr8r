---
phase: 28-multi-team-membership
plan: 04
subsystem: assignment-pickers
tags: [teams, membership, picker-filter, gap-closure, TEAM-04]
requires: ["28-03"]
provides: ["assignableInProject picker predicate"]
affects: [src/core/store.js, src/overlays/popovers.js, test/membership.test.mjs]
tech-stack:
  added: []
  patterns: ["picker-level predicate exported from store, consumed by popover option sources"]
key-files:
  created: []
  modified:
    - src/core/store.js
    - src/overlays/popovers.js
    - test/membership.test.mjs
decisions:
  - "Empty teams[] = unscoped project: every active member stays assignable (mirrors canSee semantics)"
  - "Currently-assigned out-of-set member stays visible in picker (never silently hide existing state)"
  - "bulk-assignee popover intentionally unfiltered (cross-project multi-selection) — documented inline"
metrics:
  duration: ~12 min
  completed: 2026-11-01
status: complete
commits: 2
plan_head_before: 278f26f
plan_head_after: 1a6ce0d
actuals:
  tokens: 9000
  tasks: 2
  commits: 2
---

# Phase 28 Plan 04: TEAM-04 Picker Filter Gap Closure Summary

**One-liner:** Wired `memberInProjectTeams` into assignment surfaces via new `assignableInProject(m, p, currentAssigneeId)` predicate — assignee, subassignee, and ctx-menu pickers now exclude out-of-set members while keeping the current assignee visible.

## What Was Built

- **`assignableInProject(m, p, currentAssigneeId)`** (src/core/store.js, beside `memberInProjectTeams`): returns true for unscoped projects (empty `teams[]`), true for the current assignee, otherwise `memberInProjectTeams(m, p)`. JSDoc notes the unscoped semantics.
- **Picker wiring** (src/overlays/popovers.js): `case 'assignee'` filters `.filter(m => m.status !== 'deactivated' && assignableInProject(m, proj(t?.project), t?.assignee))`; `case 'subassignee'` uses `proj(tk.project)` / `sb.assignee`. Context-menu assign flow (`ctxTo('assignee')`) renders the same case, so it inherits the filter with no separate change. `case 'bulk-assignee'` left unfiltered with an inline comment (cross-project multi-selection).
- **Tests**: new picker-predicate test block in the extended TEAM-04 section covering intersect / out-of-set (fails_when) / current-assignee-kept / teamless / unscoped / legacy-scalar / null-member cases. Executed RED→GREEN.

## Tasks Completed

| Task | Commit | Files |
| ---- | ------ | ----- |
| 1: Picker predicate + tests (TDD RED→GREEN) | a6a03fb | src/core/store.js, test/membership.test.mjs |
| 2: Wire predicate into picker cases | 1a6ce0d | src/overlays/popovers.js |

## Verification

- `node --test test/membership.test.mjs`: 24 pass, 0 fail (was 23 pass / 1 fail at RED)
- `npm test`: 664 pass, 0 fail
- `grep -c assignableInProject src/overlays/popovers.js` → 3 (import + 2 usages)

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Notes

- T-28-10 (mitigate): all three UI assignment surfaces now filter through `assignableInProject`; residual client-bypass risk accepted per the plan's trust model (authenticated doc-merge path with `canSee` checks).
- T-28-11 (accept): unscoped-project semantics retained, documented in source and SUMMARY.

## Self-Check: PASSED

- Commits a6a03fb, 1a6ce0d verified in `git log`.
- Suite green at 664 pass / 0 fail.
