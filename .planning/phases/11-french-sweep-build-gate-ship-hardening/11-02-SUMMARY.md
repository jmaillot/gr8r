---
phase: 11-french-sweep-build-gate-ship-hardening
plan: 02
subsystem: build-gate-contract-tests
tags: [i18n, contract-tests, zero-dependency, uat-10]
requires: [phase-10 i18n-scan build gate, package.json, Dockerfile]
provides: [empty-allow-list pin (D-07/D-09), live-tree exit-0 pin (D-07), zero-runtime-dependency pin (D-12)]
affects: [test/i18n-scan.test.mjs, test/dependencies.test.mjs]
tech-stack:
  added: []
  patterns: [node:test contract pin tests, JSON-import-with-type form, runtime-stage-scoped Dockerfile assertions]
key-files:
  created:
    - test/dependencies.test.mjs
  modified:
    - test/i18n-scan.test.mjs
decisions:
  - live-tree exit-0 asserted via the exported main() called in-process with an absolute root (cwd-independent), not execFileSync
  - Dockerfile assertions scoped to the runtime stage by splitting the file at the `FROM … AS runtime` marker; the entrypoint-script COPY is an explicitly commented exception to the four app targets
metrics:
  duration: ~15 min
  completed: 2026-10-24
status: complete
actuals:
  tokens: 2600
  tasks: 2
  commits: 2
commits: 2
plan_head_before: d53b0c22c8026bc412207f4cf8f718faaaef1734
plan_head_after: 543b910
---

# Phase 11 Plan 02: Build-Gate and Zero-Dependency Pins Summary

**One-liner:** Two node:test contract pins now make the phase's already-true properties regression-proof — the i18n allow-list must stay exactly `[]` with the scan exiting 0 on the live tree, and package.json must carry no `dependencies` key with the Dockerfile runtime stage staying bare node + su-exec + four app COPY targets.

## What Was Built

- **Task 1 (`573dff7`):** Two tests appended to `test/i18n-scan.test.mjs` under a phase-11 banner naming D-07/D-09: (A) the allow-list fixture deep-equals `[]` — any entry fails the suite; (B) the exported `main()` from `scripts/i18n-scan.mjs` called in-process with an absolute src root returns 0 on the live tree. The scanner itself and the fixture are untouched (D-07: the prebuild hook remains the fail-the-build mechanism).
- **Task 2 (`543b910`):** New `test/dependencies.test.mjs` in the same contract-suite style: (A) `!('dependencies' in pkg)` with the `with { type: 'json' }` import; (B) the Dockerfile runtime stage — scoped from the `FROM … AS runtime` marker onward — must be `node:24-alpine`, must have `apk add --no-cache su-exec` as its only apk invocation (line continuations normalized), and its COPY targets must be exactly server.js, mailer.js, seed.json and dist (the `/usr/local/bin/docker-entrypoint.sh` COPY excepted with a comment).

## Deviations from Plan

**1. [Rule 1 - Bug] Runtime-stage matchers needed normalization and one named exception**
- **Found during:** Task 2
- **Issue:** the first assertion draft tripped on the real Dockerfile's own shape: the `apk add` line ends in a `\` continuation, COPY targets carry `./` prefixes, and the legitimate entrypoint COPY surfaced as a fifth target.
- **Fix:** strip trailing `\` from apk matches, normalize `./` prefixes, and filter the entrypoint-script COPY with an explicit comment naming it infrastructure rather than app payload.
- **Files modified:** test/dependencies.test.mjs
- **Commit:** 543b910

No other deviations — the scanner, the fixture, package.json and the Dockerfile are untouched.

## Verification

- `node --test test/i18n-scan.test.mjs` — 25 pass / 0 fail (23 pre-existing untouched + 2 new pins).
- `node --test test/dependencies.test.mjs` — 2 pass / 0 fail.
- `npm test` full suite — 435 pass / 0 fail.
- Negative sanity: adding an entry to the fixture made the allow-list pin fail (restored to exactly `[]`); mutating package.json (added `dependencies`) and the Dockerfile (rogue `curl`) in a scratch copy made both Task 2 tests fail.
- `git diff scripts/i18n-scan.mjs` empty — scanner untouched per D-07/D-08.

## Known Stubs

None.

## Self-Check: PASSED

- test/i18n-scan.test.mjs and test/dependencies.test.mjs exist (verified by the green runs).
- Commits 573dff7 and 543b910 exist with the `test(11-02):` scope.
