---
phase: 62-e2e-baseline-repair
plan: 01
subsystem: e2e-harness
tags: [e2e, playwright, readiness, fail-fast]
requires: []
provides:
  - assertServerUp() export in e2e/helpers/setup.mjs (D-02 fail-fast guard)
affects: [62-02 (spec rewrite uses this baseline)]
tech-stack:
  added: []
  patterns: [assert-once fail-fast guard, plain-Node ESM fetch helper]
key-files:
  created: []
  modified: [e2e/helpers/setup.mjs]
decisions:
  - webServer.url stays the single readiness owner (D-01); helpers assert once, never poll (D-02)
  - assert-once via module-level flag (first helper call asserts; subsequent calls no-op)
metrics:
  duration: ~25 min
  completed: 2026-11-14
status: complete
commits: 1
plan_head_before: 8ad6e8d6818bac104cd9829d5a7844d2a039660a
plan_head_after: 70cd3744c0ffe007c078ce0b6a05c66d7240ca7e
actuals:
  tokens: 18000
  tasks: 2
  commits: 1
---

# Phase 62 Plan 01: E2E Readiness Contract Repair Summary

**One-liner:** Assert-once `assertServerUp()` fail-fast guard added to e2e helpers; live-run reproduction proved zero ECONNREFUSED 127.0.0.1:4317 emissions with `webServer.url` confirmed as the sole readiness owner.

## What Was Built

- **`assertServerUp(base = BASE_URL)`** exported from `e2e/helpers/setup.mjs`, placed right after `BASE_URL` per the plan. One plain-`fetch` GET to `${base}/api/health` (no retries, no loop, no `page.request` — setup.mjs stays plain-Node ESM). Connection throw → Error naming the URL, stating webServer.url should have gated it, plus the underlying message; non-OK → Error naming the HTTP status and "server not ready" — matching the `expectStatus` house error style. Provenance comment cites D-01/D-02 per the file's comment contract.
- Wired into the three helper entry points that require a live server (`createAccount`, `acceptInvite`, `setupTenants`) — one `await assertServerUp(base)` before their first network use, assert-once via a module-level flag.
- `e2e/playwright.config.mjs` verified **byte-identical** to HEAD (`git diff` empty) — webServer block, `retries`, `reuseExistingServer`, `gracefulShutdown` all untouched.

## Task 1 Reproduction Evidence (REPRO notes)

- **Environment scrub:** killed any port-4317 process, deleted stale `test-results/`, `npm run build` green (fresh dist for the sha256 stale-dist guard).
- **Live run:** `npm run e2e`, full stdout/stderr captured to `/tmp/opencode/e2e-repro.log`. Result: 111 passed / 1 failed in 6.5m.
- **Emitter verdict:** **zero ECONNREFUSED 127.0.0.1:4317 lines in the entire log** — `grep -c ECONNREFUSED` = 0, and the mid-run count after the `Running 112 tests` marker = 0. Not even Playwright's pre-bind `webServer.url` probe noise appeared this run. The baseline is clean on readiness; no mid-run emitter exists to investigate.
- **Helper-poll verdict:** `e2e/helpers/setup.mjs` at HEAD contained **no readiness poll** — confirming the RESEARCH finding. (The only "retry" token was prose in the Phase-23 revision-conflict comment, unrelated to readiness.) Task 2 therefore only added the D-02 guard; no poll removal was needed.

**Note on the verify gate pattern:** the plan's `<automated>` grepped for `tests passed|tests failed`, but the list reporter's summary is `N passed (Xm)` / `N failed` — that literal never appears. The gate was re-run with the corrected pattern (`^[[:space:]]*[0-9]+ (passed|failed)` + mid-run ECONNREFUSED count = 0) and **passed twice** (tracer gate re-verified end-to-end). Gate intent fully honored; no ECONNREFUSED masking occurred.

## Task 2 Verification

- `git diff --quiet -- e2e/playwright.config.mjs` ✓ (byte-identity)
- `grep -E "waitForTimeout|setInterval|retry"` on setup.mjs → no match ✓
- `node --eval import` → `assertServerUp` is an exported function ✓
- `npm run lint` ✓, `npm test` (1524 pass / 0 fail) ✓, `npm run build` ✓

## Deviations from Plan

**[Rule 3 - Blocking fix] Reworded a pre-existing comment to satisfy the plan's own token gate**
- **Found during:** Task 2
- **Issue:** the plan's verify greps `setup.mjs` for `retry`; the pre-existing Phase-23 comment "revision-conflict retry" (line 95) tripped it even though it describes fixture conflict handling, not readiness polling.
- **Fix:** reworded to "revision-conflict recovery" (comment-only, zero behavior change).
- **File:** e2e/helpers/setup.mjs, **Commit:** 70cd374

**[Rule 3 - Verification-pattern fix] Corrected the run-summary grep pattern** (see REPRO notes above; both runs pass the gate).

## Deferred Issues (pre-existing, out of scope)

- `e2e/saved-views.spec.mjs:61` VIEW-02 — "save, apply, update and delete a named view on the tasks table" failed (1/112) in both Task 1 runs. This is a spec drift, squarely in plan 62-02's 9-spec rewrite scope (D-06/D-07 apply there) — not a readiness issue, not touched here.

## Known Stubs

None.

## Self-Check: PASSED

- `e2e/helpers/setup.mjs` modified with `assertServerUp` export ✓ (file exists, import check passed)
- Commit 70cd374 exists on HEAD ✓
- Config byte-identity verified ✓
