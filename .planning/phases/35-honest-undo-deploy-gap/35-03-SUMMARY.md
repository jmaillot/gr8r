---
phase: 35-honest-undo-deploy-gap
plan: 03
subsystem: undo-sync
tags: [undo, store, mutex, gap-closure, wr-01, wr-02]
status: complete
requires: ["35-01", "35-02"]
provides:
  - pushNow() holds the shared pushing mutex (WR-02 closed)
  - undo onAction early-returns on a failed doc push (WR-01 closed)
affects: [src/core/store.js, src/actions/teams.js]
key-files:
  created: []
  modified:
    - src/core/store.js
    - src/actions/teams.js
    - test/undo-membership.test.mjs
decisions:
  - "Mutex release via try/finally around pushNow()'s PUT (localStorage snapshot write sits before the take — mutex held no later than immediately before the wire call, per plan)."
  - "WR-01 gate is unconditional (fires even with an empty affected roster); post-loop combined check preserved verbatim for D-02 partial-failure honesty."
  - "Both regression pins are source-scan style (IN-02 browser-closure harness limits), each re-asserting D-06 invariants from the same slice."
metrics:
  duration: ~6 min
  completed: 2026-11-03
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 444922d7420a381c9f26d154cc65a0275c5fde56
plan_head_after: 616d92a91da44f5b6febb356af0abb26bf881b14
---

# Phase 35 Plan 03: Honest Undo Gap Closure Summary

Closed both verification gaps: pushNow() now serializes its PUT behind the shared pushing mutex (no false-positive 409 conflict-lock mid-undo), and the undo onAction stops before any authority PUT when the doc push failed (no 400 unknownTeam cascade).

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | WR-02 — pushNow() takes the pushing mutex around its PUT | 519b25f | src/core/store.js, test/undo-membership.test.mjs |
| 2 | WR-01 — undo onAction early-returns when the doc push failed | 616d92a | src/actions/teams.js, test/undo-membership.test.mjs |

## What Was Done

**Task 1 (WR-02 / Gap 2):** `pushNow()` in `src/core/store.js` now sets `pushing = true` immediately before its `api.putWorkspace(docSnapshot())` call and releases it in a `finally`. The wait loop (`while (pushing)`), both `clearTimeout` calls, the localStorage snapshot write, the 409/401/403 `S.ui.conflict` handling, and the `{ ok: false, status: 0 }` guard return are unchanged; `push()` is byte-identical to its pre-task form. A `save()` scheduled during the undo's in-flight doc push now defers into `pushQueued` like any other overlap. New source-scan pin: take-before-PUT, release-in-finally, wait loop, both clearTimeouts, and `push()`'s own take of the same shared mutex.

**Task 2 (WR-01 / Gap 1):** the undo `onAction` in `src/actions/teams.js` now early-returns with the existing `err.changeTeam` toast when `pushed.ok === false`, lexically between `const pushed = await pushNow();` and the `Promise.all(affected.map(...))` setMemberTeams block — zero authority PUTs can fire after a failed doc push. The gate is unconditional (empty affected roster included); the post-loop combined check (`pushed.ok === false || results.some(r => !r?.ok)`), the additive union shape (D-03/D-04), the unguarded `restore(snap)` order, and the `if (!api.enabled) return;` gate (D-06) are untouched. New source-scan pin asserts gate ordering, `err.changeTeam` in the gate, the D-06 invariants from the same slice, and the preserved post-loop check.

## Verification Results

- `node --test test/undo-membership.test.mjs` — 7 pass / 0 fail (5 existing + 2 new pins)
- `npm test` — 896 pass / 0 fail / 3 skips (baseline grew 894 → 896, no regressions)
- Source inspection confirms both must-have truths: shared mutex take/release in pushNow(); gate precedes the Promise.all block in onAction.

## Deviations from Plan

None — plan executed exactly as written.

## Assumption Delta

Per the plan's assumption_delta_decision: the single "optional" signal (compose `MASTER_KEY_PREVIOUS` `:-` form) was delivered and verified by 35-02; no promote-vs-add-alongside decision arises from this gap scope. No action.

## Self-Check: PASSED

- src/core/store.js modified with mutex take/finally release — commit 519b25f verified in git log.
- src/actions/teams.js modified with the early-return gate — commit 616d92a verified in git log.
- test/undo-membership.test.mjs grew 5 → 7 tests, all passing.
