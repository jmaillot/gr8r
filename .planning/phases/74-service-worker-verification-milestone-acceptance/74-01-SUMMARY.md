---
phase: 74-service-worker-verification-milestone-acceptance
plan: 01
subsystem: pwa
tags: [pwa, service-worker, contract-test]
requires: [PWA-01, PUSH-01]
provides: [test/sw-contract.test.mjs — automated SW contract pins (D-01, D-04)]
affects: []
tech-stack:
  added: []
  patterns: [source-as-text contract test, sha256 content-hash pin, expression-count call-site pin]
key-files:
  created:
    - test/sw-contract.test.mjs
  modified: []
decisions:
  - "sha256 pin fixed to the Phase 48/59 contract value; drift is STOP-and-justify, never a pin update"
  - "Call-site pin counts the exact expression navigator.serviceWorker.register, never the registerSw wrapper name (Pitfall 1)"
  - "api.enabled gate pinned structurally: inside the registerSw export, before the register call"
metrics:
  duration: ~15 min
  completed: 2026-11-19
status: complete
estimate:
  tokens: 35000
  raw_tokens: 24000
  tasks: 2
  confidence: med
actuals:
  tokens: 9300
  tasks: 2
  commits: 2
commits: 2
plan_head_before: b43453b5db6462a022a368923419c5d8f4c58237
plan_head_after: 9fb0ab93
---

# Phase 74 Plan 01: SW Contract Test Summary

**One-liner:** Automated sw-contract test proves `public/sw.js` is byte-identical to the Phase 48/59 contract (sha256 pin) and locks the single `navigator.serviceWorker.register` call site, `/sw.js` literal, `api.enabled` gate, both boot paths, and manifest↔SW scope agreement — zero production code changes.

## What Was Built

`test/sw-contract.test.mjs` (172 lines, 9 tests / 4 suites), mirroring `test/manifest-contract.test.mjs` style (`node:test` + `node:assert/strict`, `source()` helper, no src imports, zero dependencies beyond `node:crypto`):

- **Hash pin (D-01, T-74-01):** sha256 of `public/sw.js` === `7a700dd8…cc5b8d`; drift message instructs STOP-and-justify, never pin-update.
- **Handler line pins:** `self.addEventListener('notificationclick', (e) => {` and `self.addEventListener('push', (e) => {` as quoted substrings.
- **Manifest↔SW scope agreement (D-01):** `scope`, `start_url`, `id` all `'/'`, `display` `'standalone'` — agreeing with the SW at `/sw.js` root scope.
- **Server no-cache cross-check (light touch):** `path.basename(file) === 'sw.js'` branch present in `server.js` (full contract stays owned by `manifest-contract.test.mjs`).
- **Registration pins (D-04, T-74-02):** exactly 1 `navigator.serviceWorker.register` call site across all `src/**` + `public/*.js` (expression count, immune to the `registerSw` wrapper name in `src/main.js`); the `navigator.serviceWorker.register('/sw.js')` literal; the `!api.enabled` gate inside the `registerSw` export before the register call; both boot paths (`addEventListener('load', registerSw)` and `registerSw(); // 59-UAT fix` in `enterApp`).

## Tasks Delivered

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | D-01 pins: hash, handler lines, scope agreement, no-cache cross-check | 68e6aa4a | test/sw-contract.test.mjs |
| 2 | D-04 registration pins + full-suite regression | 9fb0ab93 | test/sw-contract.test.mjs |

## Verification

- `node --test test/sw-contract.test.mjs` — 9 pass / 0 fail.
- `npm test` — 1807 tests, **1793 pass / 1 fail** (pre-existing `webhook-events.test.mjs` failure; fail count well below the 13-failure accepted baseline in STATE.md — no new failures). sw-contract tests included in the suite run.
- `git diff --stat` vs plan start: only `test/sw-contract.test.mjs` created. `public/sw.js`, `server.js`, `src/main.js`, `src/core/push.js`, `test/browser-push.test.mjs`, `test/manifest-contract.test.mjs` all untouched.
- Tracer feedback gate: Task 1's `<verify>` is automated-only → re-ran end-to-end, passed, expanded to Task 2.

## Deviations from Plan

**1. [Process] Task 1 initially included the D-04 assertions**
- **Issue:** Both task blocks' assertions were authored in a single Write, which would have made Task 1's commit carry Task 2's content.
- **Fix:** Trimmed the file to D-01-only, re-verified (5 tests), amended Task 1's commit, then re-appended the D-04 block and committed it separately as Task 2. Both commits are now atomically scoped to their task.
- **Files modified:** test/sw-contract.test.mjs
- **Commits:** 68e6aa4a (amended), 9fb0ab93

No other deviations — plan executed as written. No auth gates. No stubs introduced (the test file contains no placeholders; all pins assert real repo content). No new threat surface (tests only; T-74-01/T-74-02 mitigations implemented as specified; T-74-SC N/A — zero packages installed).

## Self-Check: PASSED

- test/sw-contract.test.mjs exists ✅
- Commits 68e6aa4a and 9fb0ab93 present on main ✅
- `git rev-list --count b43453b5..HEAD` = 2 ✅
