---
phase: 35-honest-undo-deploy-gap
plan: 01
subsystem: teams-undo
tags: [undo, membership, teams, client-replay]
requires: [28-02 delTeam authority purge, 32 team_members live reads]
provides: [awaitable pushNow() doc-push primitive, honest delTeam undo (doc push → union replay)]
affects: [src/actions/teams.js, src/core/store.js, membership authority rows]
tech-stack:
  added: []
  patterns: [capture-before-purge closure, awaited doc-push sequencing, full-set-replace union replay]
key-files:
  created:
    - test/undo-membership.test.mjs
  modified:
    - src/actions/teams.js
    - src/core/store.js
decisions:
  - pushNow() waits out an in-flight debounced push instead of queueing (~20-line honest primitive, per plan)
  - undo union folds the captured before-map set into the Set union (semantically a subset of the post-restore set; keeps the captured map load-bearing per D-01/D-03)
metrics:
  duration: ~25 min
  completed: 2026-11-03
status: complete
estimate:
  tokens: 55000
  tasks: 2
actuals:
  tokens: 42000
  tasks: 2
  commits: 2
plan_head_before: "5c604d7708b7a44295c9ab74276ee5e9e69f6e9d"
plan_head_after: "4085992"
---

# Phase 35 Plan 01: Honest Undo — Authority Replay Summary

**One-liner:** delTeam's toast undo now awaits one doc push (new exported `pushNow()` in store.js) then replays each affected member's union team set through `api.setMemberTeams`, re-creating purged `team_members` rows without erasing newer changes.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | End-to-end honest undo — capture, restore, awaited doc push, union replay | cf342e6 | src/actions/teams.js, src/core/store.js, test/undo-membership.test.mjs |
| 2 | UNDO-02 no-clobber + stale-before-map + empty-roster + D-06 local-mode pins | 4085992 | test/undo-membership.test.mjs |

## What Was Built

- **src/core/store.js** — new named export `pushNow()`: same guards as `push()` (`!api.enabled || !api.user || S.ui.conflict` → `{ok:false, status:0}`), waits out an in-flight debounced push, clears `_saveT`/`_pushT`, writes the localStorage snapshot, then `await api.putWorkspace(docSnapshot())`, resolving with the server result. Sets `S.ui.conflict` on 409/401/403 like `push()` does. `save()`/`flushNow()`/`push()` untouched.
- **src/actions/teams.js** — `A.delTeam`'s `run` closure now captures the before-map (`new Map(D().members.map(x => [x.id, memberTeams(x)]))`) ABOVE the `api.enabled` purge block, with the id-shape comment (keys `x.id`, undo PUT uses `x.userId`). The toast's `onAction` is async: `restore(snap)` unconditionally first (local mode stops there — D-06), then in API mode `await pushNow()` BEFORE any authority PUT (premature PUT 400s unknownTeam), then one union PUT per affected member `Array.from(new Set([...(before.get(x.id) || []), ...memberTeams(live), tm.id]))` via `Promise.all`; `pushed.ok === false` or any failed PUT → `err.changeTeam` toast, no rollback/retry (D-02). Zero new i18n keys (toast.undo/toast.deleted/err.changeTeam reused); zero server.js changes; zero new routes.
- **test/undo-membership.test.mjs** — 5 tests, own-server per test (one invite-accept each):
  1. UNDO-01 tracer: purge → doc-definition removal → premature union PUT 400 unknownTeam → doc PUT restore (awaited) → union PUT → withDb rows `['team_a','team_b']` + roster projection.
  2. UNDO-02/D-03: newer team_c survives — rows exactly `['team_a','team_c']`.
  3. D-04: full-set replace would clobber (`['team_a']` only) vs union shape keeps `['team_a','team_c']`.
  4. Empty-roster flagged assumption: memberless team undo restores the definition, zero rows, zero PUTs.
  5. D-06 source pin: `restore(snap)` is the unguarded first statement; exactly one `setMemberTeams` call site, lexically after `if (!api.enabled) return;`.

## Verification

- `node --test test/undo-membership.test.mjs` — 5 pass, 0 fail
- `npm test` — 894 tests, 890 pass, 0 fail (1 skipped pre-existing), above the 803 baseline
- Zero server.js / routes / i18n changes (grep-verified)

## Deviations from Plan

**1. [Rule 1 - Adjust] Union includes the captured before-map set explicitly**
- **Found during:** Task 1
- **Issue:** the plan's union expression (`memberTeams(x) ∪ tm.id`) left the captured `before` map unused in code, tripping no-unused-vars; D-01/D-03 name the before-map as the capture of record.
- **Fix:** union = `before.get(x.id) ∪ memberTeams(live) ∪ tm.id` — semantically identical (the captured set is a subset of the post-restore doc's set).
- **Files modified:** src/actions/teams.js
- **Commit:** cf342e6

## Out-of-Scope Observations (not fixed, not introduced here)

- `npm run lint` fails on a pre-existing `no-unused-vars` in `test/notif-prefs.test.mjs:306` — unrelated to this plan, untouched.
- `npm test` summary reports 1 skipped test (pre-existing, e.g. docker-gated compose coverage).

## Auth Gates

None.

## Known Stubs

None — no placeholder data paths, all flows wired to the real API route.

## Threat Flags

None — the union replay rides the existing admin-gated, whitelist-validated `PUT /members/:uid/teams` route (T-35-01 mitigation intact: only ever ADDS `tm.id`, pinned by tests 2–3).

## Self-Check: PASSED

- src/actions/teams.js, src/core/store.js modified and committed (cf342e6)
- test/undo-membership.test.mjs created and committed (cf342e6, 4085992)
- Both commits present in `git log`
