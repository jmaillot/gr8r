---
phase: 17-login-second-factor-flow
plan: 01
subsystem: auth-server
tags: [2fa, totp, login, throttle, security, tfa-05]
requires: [login_challenges DDL (phase 14), totp.js verify/burn primitives (phase 16), recovery_codes (phase 16)]
provides: [POST /api/auth/tfa/login, pending2fa login branch, projects_tfa_challenge cookie, maskEmail(), login_challenges sweeper, D-13 generic lockout copy, err.invalidTfaCode/err.challengeExpired locale keys, test/tfa-login.test.mjs (9 tests), loginTfa() test helper]
affects: [17-02 (client 2FA screen consumes pending2fa/maskedEmail/recoveryRemaining), phase 18 e2e (consumes the 401-matrix)]
tech-stack:
  added: []
  patterns: [sameOrigin → throttle → readJson → increment-before-verify transaction, appendCookie for dual Set-Cookie responses, conditional UPDATE-burn (used_at is null) inside the mint transaction]
key-files:
  created: [test/tfa-login.test.mjs]
  modified: [server.js, test/helpers/server.mjs, test/tfa-enrollment.test.mjs, test/error-codes.test.mjs, test/i18n-core-features.test.mjs, test/dependencies.test.mjs, src/locales/en.json, src/locales/fr.json]
decisions:
  - Challenge cookie projects_tfa_challenge is separate from the session cookie; requireUser()/currentUser() untouched (structural anonymity, D-71 matrix proves it)
  - Verify route derives the throttle email from the challenge row's user, never a body-carried email
  - One generic invalidTfaCode for wrong-TOTP and dead-recovery shapes (D-65); challengeExpired on death/expiry with the cookie cleared
  - Burn + challenge-delete + session mint are one transaction; recoveryRemaining computed inside it
  - Verify success clears both throttle budgets in ONE attempts.delete site (pending branch never clears; D-03 carry-over)
metrics:
  duration: ~1h55m
  completed: 2026-10-27
status: complete
actuals:
  tokens: 87000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 6b1447dbf777918268c25e7412d460f38461666b
plan_head_after: 48b4eaa
---

# Phase 17 Plan 01: Login Second-Factor Flow (server) Summary

**One-liner:** password-correct logins on 2FA accounts now stop at an inert 5-minute challenge (`pending2fa` + separate `projects_tfa_challenge` cookie); only a live TOTP or a burn-once recovery code on the new `POST /api/auth/tfa/login` mints the session — atomically, inside one shared throttle budget, with generic lockout copy.

## What Was Built

- **Login branch (D-68):** correct password on a `two_fa_enabled` account inserts a `login_challenges` row, sets only the challenge cookie (`Max-Age=300`, HttpOnly, SameSite=Lax, Secure-aware), returns `200 { pending2fa: true, maskedEmail }` — no session, no user payload, no throttle reset.
- **Verify route (D-69):** `POST /api/auth/tfa/login` — sameOrigin first, `2fa-login|ip|email` throttle (5/15min, email from the challenge row), then one transaction: challenge liveness → attempts increment BEFORE verification (D-67 anti-race) → 3-attempt death (D-66) → dual-shape code (D-64): TOTP with D-04 matched-step persist, or race-safe conditional recovery burn with in-transaction `recoveryRemaining` — then challenge delete + session mint + `last_login_at` in the same unit.
- **Error contract (D-65):** `invalidTfaCode` for both failure shapes; `challengeExpired` 401 with the cookie cleared on death/expiry/missing; empty codes 400 before any state is consumed.
- **Lifecycle (D-66):** boot + hourly sweeper for expired `login_challenges` rows; logout clears any pending challenge row + cookie (D-61).
- **D-13:** the login 429 now carries `tooManyAttempts` with generic copy; "Try again in 15 minutes." is gone from server.js (grep = 0).
- **Budget carry-over (D-03/Pitfall 18):** `attempts.delete` exists at exactly two success sites — non-2FA login and verify success; the pending branch never clears.
- **Tests:** `test/tfa-login.test.mjs` (9 tests, real server + real SQLite, no mocks) covering pending shape, TOTP verify, replay, wrong/empty codes, recovery burn-once + remaining count, 3-wrong death, expiry, carry-over, and the full D-71 401 matrix incl. logout-from-pending.

## Deviations from Plan

**1. [Rule 3 - Blocking] Phase 16 enrollment suite + i18n catalogue adapted to the new login contract**
- **Found during:** Task 3 full-suite run
- **Issue:** `login()` no longer mints sessions for 2FA-enabled users (the intended TFA-05 change); 5 enrollment tests got 401 instead of 403/200, and the error-code catalogue tests flagged uncatalogued `invalidTfaCode`/`challengeExpired` and orphaned `tooManyLoginAttempts`.
- **Fix:** cookie-jar client + `loginTfa()` helper; tracked secrets + `signIn2fa()` with D-04 baseline reset; locale keys added/removed EN+FR; catalogue-count and WR-03 pins updated.
- **Commit:** 46c418e

**2. [Rule 1 - Bug] Stale Dockerfile COPY pin (pre-existing red)**
- **Found during:** Task 3 `npm test`
- **Issue:** `7668ece` added `totp.js` to the runtime image without updating `dependencies.test.mjs`'s four-target pin — `npm test` was red before this plan started.
- **Fix:** pin updated to the five actual targets.
- **Commit:** 46c418e

**3. [Deviation - assertion shape] D-71 matrix endpoints assert the routes' pinned contracts**
- Invite accept with a challenge cookie answers **409 `accountExistsSignIn`** (not 401): the invite flow legitimately serves anonymous account creation; the structural claim is proven by the *absence of any session mint* (no `projects_session` Set-Cookie, challenge row untouched).
- `/w/:slug/file/:id` asserts the JSON 401 via a fetch-style `Sec-Fetch-Dest` (anonymous *document* navigations 302-redirect to `/login` by pinned T-12-13 design).
- `grep -c "attempts.delete" server.js` is **3**, not 2: the two success-clear sites plus `tooMany()`'s pre-existing map-eviction line (line 1297), which is not a success-clear.

## Auth Gates

None — no external services touched.

## Known Stubs

None.

## Verification

- `node --test test/tfa-login.test.mjs` → 9 pass / 0 fail
- `npm test` → **520 pass / 0 fail**
- `grep -c "Try again in 15 minutes" server.js` → 0
- `grep -n "attempts.delete" server.js` → tooMany eviction + non-2FA login success + verify success only

## Self-Check: PASSED

- test/tfa-login.test.mjs exists; commits f8de979, 46c418e, 48b4eaa present on main.
