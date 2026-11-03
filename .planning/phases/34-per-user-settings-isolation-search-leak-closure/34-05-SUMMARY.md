---
phase: 34-per-user-settings-isolation-search-leak-closure
plan: 05
subsystem: notif-prefs
tags: [gap-closure, G-34-4, api-mode, hydration, tdd]
requires: [api.getNotifPrefs (src/core/api.js:257), PUT adoption at actions.js:2695, D-27-5 defaults shape]
provides: [mergeNotifPrefs pure helper, hydrateNotifPrefs wired at every API-mode workspace entry]
affects: [emitMentions gating (actions.js:148) now correct session-wide in API mode]
tech-stack:
  added: []
  patterns: [canonical-server merge mirroring the PUT adoption, fire-and-await hydration after hydrateFromServer success]
key-files:
  created: [test/notif-hydration.test.mjs]
  modified: [src/core/notifPrefs.js, src/actions/actions.js]
decisions:
  - "Server row is canonical in the GET merge (same semantics as the PUT adoption at actions.js:2695)"
  - "hydrateNotifPrefs resolves the workspace id exactly as IN.npToggle does and no-ops in local mode (D-08 untouched)"
  - "Hydration is fire-and-awaited at each of the 5 hydrateFromServer success paths; no new store field or event"
metrics:
  duration: ~25min
  completed: 2026-11-03
status: complete
plan_head_before: 3116272
plan_head_after: 353f156
commits: 3
actuals:
  tokens: 1500
  tasks: 2
  commits: 3
---

# Phase 34 Plan 05: API-mode notif-prefs hydration (G-34-4) Summary

**One-liner:** GET-on-open hydration of stored notification prefs via a pure mergeNotifPrefs helper, wired at all five API-mode workspace-entry paths so an unchecked pref survives F5.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1a | RED: pin mergeNotifPrefs semantics | cf72c1d | test/notif-hydration.test.mjs |
| 1b | GREEN: implement mergeNotifPrefs | f88ec88 | src/core/notifPrefs.js |
| 2 | Wire hydrateNotifPrefs at every API-mode entry | 353f156 | src/actions/actions.js |

## What Was Built

- **`mergeNotifPrefs(clientPrefs, serverPrefs)`** (src/core/notifPrefs.js): pure — defaults → sanitized client → sanitized server; reuses the module's 17-key whitelist/boolean-only sanitize so a tampered GET response cannot inject keys or non-booleans (T-34-11); inputs never mutated; flat output only (D-01).
- **`hydrateNotifPrefs()`** (src/actions/actions.js): no-ops when `!api.enabled` (local mode's synchronous localStorage hydration untouched, no GET issued); on ok adopts canonically into `S.notifPrefs` (store-only, D-01); 401 dispatches the same `projects:save-error` CustomEvent as IN.npToggle (session-expired path); any other non-ok result is silent and non-blocking (T-34-12) — workspace entry never fails on a pref read.
- **Wired at all 5 hydrateFromServer success paths**: openWorkspace, post-login (join + primary), signup, email-invite accept — fire-and-awaited so the store carries the stored row before the next render.
- **test/notif-hydration.test.mjs**: 5 node:test pins mirroring local-prefs.test.mjs style — D-27-5 defaults shape, stored-row-wins + whitelist drop, the F5 shape (empty client, server canonical), canonical-server + non-boolean rejection, immutability + D-01 no-carrier.

## TDD Gate Compliance

- RED confirmed before implementation: `node --test test/notif-hydration.test.mjs` failed with `mergeNotifPrefs is not a function`; RED commit cf72c1d contains test-only changes.
- GREEN: helper implemented; same command plus test/local-prefs.test.mjs → 12 pass, 0 fail.

## Verification

- `node --test test/notif-hydration.test.mjs test/local-prefs.test.mjs test/notif-prefs.test.mjs` — green.
- Grep gate: comment-filtered `getNotifPrefs` count in src/actions/actions.js = 1 (real code call).
- Full suite `npm test`: 875 pass / 1 fail — the 1 failure is the **pre-existing** Dockerfile COPY-targets allowlist test in test/dependencies.test.mjs, reproduced at the plan's base commit (3116272). Out of scope per the scope boundary; logged in deferred-items.md.

## Deviations from Plan

**1. [Rule 1 - Typo, self-caught] EMAIL_RE accidentally corrupted during edit**
- **Found during:** Task 2
- **Issue:** an edit to insert the hydration helper briefly rewrote EMAIL_RE to `/^\S+@\S+@\S+\.\S+$/`
- **Fix:** restored `/^\S+@\S+\.\S+$/` in the same session; final committed file matches the original regex (verified in commit 353f156)
- **Files modified:** src/actions/actions.js
- **Commit:** 353f156

**2. [Absorbed] Pre-existing comment reword near IN.npToggle in src/actions/actions.js**, per orchestrator note — carried in commit 353f156.

Otherwise: plan executed as written.

## Deferred Issues

See deferred-items.md: the pre-existing `test/dependencies.test.mjs` Dockerfile-allowlist failure (repo-root `src/` not in the expected top-level list). Not introduced by this plan.

## Known Stubs

None.

## Self-Check: PASSED

- Files exist: src/core/notifPrefs.js, test/notif-hydration.test.mjs, src/actions/actions.js — FOUND
- Commits exist: cf72c1d, f88ec88, 353f156 — FOUND (`git log`)
- `git rev-list --count 3116272..HEAD` = 3, matches `commits: 3`
