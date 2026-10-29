---
phase: 14-schema-session-ground-truth
plan: 05
subsystem: client-auth-teardown
tags: [auth, sessions, d-28, 401-intercept, teardown, zero-deps]
requires:
  - 14-02 (err.signedOutElsewhere EN+FR locale keys)
  - 14-04 (signOutRevoked() teardown, sessions API wiring)
provides:
  - registerAuthRevokedHandler(fn) named export in src/core/api.js
  - once-per-revocation latch in call() with re-arm inside applyUser()
  - module-scope teardown registration in src/actions/actions.js
  - test/auth-revoked.test.mjs client contract suite (6 tests)
affects:
  - Phase 15 (PASS-02/03 password change kills other sessions — inherits the teardown for free)
  - test/error-codes.test.mjs CLIENT_ONLY_ERR_CODES allowlist
  - locale catalogue baselines (1548 keys)
tech-stack:
  added: []
  patterns:
    - single-fetch-choke-point intercept (call() in api.js, no DOM globals — node-safe)
    - event-decoupling idiom extended: registered callback instead of import cycle (api.js never imports actions.js)
    - source-as-text assertions pinning cross-module wiring (house pattern from error-codes.test.mjs)
key-files:
  created:
    - test/auth-revoked.test.mjs
  modified:
    - src/core/api.js
    - src/actions/actions.js
    - src/main.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/sessions.test.mjs
    - test/error-codes.test.mjs
    - test/i18n-core-features.test.mjs
decisions:
  - "Global 401 intercept in call() (the single fetch choke point) over per-call-site teardown branches — D-28 reads 'a revoked browser's next request hits the 401 handler'; design decision recorded in the plan objective and resolved via the codebase's event-decoupling idiom (registered callback, no api.js→actions.js import cycle)"
  - "signInRequired is the sole mid-session discriminator — the only other 401 code the server emits is invalidCredentials (login-only, cannot occur mid-session)"
  - "Latch is mandatory, not defensive: A.signOut's own logout POST hits a 401 signInRequired while state.user is still set; the latch also absorbs a concurrent 401 inside a revoke action"
  - "Non-401 revoke-action fallback swaps the generic session-expired key for the catalogued err.serverUnreachable last-resort copy (house precedent at actions.js :900) — res.error is always truthy for JSON failures, so the fallback only fires for a garbage/non-JSON body"
  - "err.sessionExpired fully retired (allowlist entry + en/fr catalogue keys): the teardown's signedOutElsewhere copy is now the only mid-session 401 copy, covering natural expiry and revocation alike (indistinguishable server-side)"
metrics:
  duration: ~13 min
  completed: 2026-10-27T00:00:00Z
  tasks: 3
  files_changed: 9
status: complete
actuals:
  tokens: 2600
  tasks: 3
  commits: 4
plan_head_before: 2d1e0e987935682823111de167b08b7342004552
plan_head_after: 10bf492dc73b66dd9f24a4ca7d14c42330e734ae
commits: 4
estimate:
  tokens: 45000
  tasks: 3
---

# Phase 14 Plan 05: D-28 Client Teardown Wiring Summary

**One-liner:** Central mid-session 401 intercept in api.js call() funnels every revocation 401 (code signInRequired) through the single registered signOutRevoked teardown — honest signedOutElsewhere toast, full sign-out, login screen — with a once-per-revocation latch, boot-guard, and re-arm.

## What Was Built

- **src/core/api.js** — `registerAuthRevokedHandler(fn)` export; inside `call()`, after the response parses, an intercept fires the registered callback exactly once when ALL hold: status 401, payload code `signInRequired` (server.js:1170 requireUser code), `state.user` set (boot guard — a not-signed-in /api/auth/me 401 is normal, not a revocation), latch clear. `applyUser()` re-arms the latch on a successful re-auth. Plain function invocation, no DOM globals — api.js stays node-safe.
- **src/actions/actions.js** — additive named import (no cycle: api.js never imports actions.js) + one module-scope line `registerAuthRevokedHandler(signOutRevoked)` beside the unchanged definition. The two per-site 401 teardown calls inside A.revokeSession/A.revokeAll retired to bare early returns; their non-401 fallbacks swapped to `t('err.serverUnreachable')`.
- **src/main.js** — the projects:save-error 401 branch keeps the instant login-screen transition but defers the copy to the central teardown (contract comment added); the hydrate-401 branch documents that the honest toast arrives from the teardown — no longer a silent redirect. `refreshSessions()` untouched: its honesty is delivered centrally.
- **test/auth-revoked.test.mjs** (new) — 6 ordered node:test cases on the real api.js with stubbed fetch (house pattern from revision.test.mjs): boot guard, arm, fire-once, latch, re-arm, plus source-as-text pins on the registration and the intercept gating. TDD: committed RED (9c8eaed) before the implementation (fa4457c).
- **Truthful test surface** — sessions.test.mjs D-28 assertion message cites the proving client suite; error-codes.test.mjs signedOutElsewhere comment describes the central teardown registration; the orphaned sessionExpired allowlist entry deleted with its last three emitters; err.sessionExpired removed from both catalogues (baseline 1549 → 1548, recorded in the i18n-core-features test name).

## Tracer Feedback Gate

Task 1 is the tracer (proven slice: intercept + registration + contract suite). Auto mode inactive; `<verify>` is automated-only under end-of-phase human-verify mode → re-ran `node --test test/auth-revoked.test.mjs` end-to-end after commit: 6/6 pass. ⚡ Tracer verified — expanded to Tasks 2–3.

## Verification Results

| Gate | Result |
|------|--------|
| node --test test/auth-revoked.test.mjs | 6/6 pass |
| node --test test/sessions.test.mjs | 5/5 pass |
| node --test test/error-codes.test.mjs | 24/24 pass |
| node --test test/migration.test.mjs | 14/14 pass |
| node --test test/i18n-core-features.test.mjs | 14/14 pass (baseline updated) |
| node scripts/i18n-scan.mjs | 0 findings, exit 0 |
| npm test (full suite) | 461/462 — sole failure is the documented pre-existing test/i18n-prefs.test.mjs:243 (v1.3 ROADMAP rewrite, predates phase 14, logged in deferred-items.md and 14-VERIFICATION.md advisory) |
| grep -rln "sessionExpired" src/ test/ | no files |
| grep -cE '(return\|=) signOutRevoked\(\)' src/actions/actions.js | 0 (call sites gone; definition retained, registration points at it) |
| git diff package.json | empty (zero-deps core decision held; T-14-SC mitigation satisfied — nothing installed) |

## Deviations from Plan

**1. [Rule 3 - Blocking] i18n-core-features catalogue-count test broke on the key removal**
- **Found during:** Task 3
- **Issue:** Removing err.sessionExpired from both catalogues (a planned Task 3 action) tripped the catalogue-size assertion in test/i18n-core-features.test.mjs (1549 → 1548) — the plan listed the two catalogues as Task 3 files but not this test, which any catalogue edit necessarily moves.
- **Fix:** Updated the baseline to 1548 and recorded the retirement in the test's changelog name (the house convention this test already follows for every catalogue delta).
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 10bf492

Also: a first edit to test/error-codes.test.mjs accidentally removed four still-valid allowlist entries alongside the intended sessionExpired entry; caught and restored within the same task before commit (no committed trace).

No other deviations — plan executed as written. The pre-existing i18n-prefs failure is the verification report's documented advisory, not a deviation.

## Auth Gates

None.

## Known Stubs

None. Stub-pattern scan over all created/modified files: clean.

## Threat Flags

None — no new network endpoints, auth paths, file access patterns, or schema changes beyond the planned intercept (T-14-08 accepted as designed; T-14-SC mitigated: zero installs).

## Self-Check: PASSED

- test/auth-revoked.test.mjs exists ✓
- Commits 9c8eaed, fa4457c, 790a575, 10bf492 all in git log ✓
- plan_head_after matches working HEAD ✓
