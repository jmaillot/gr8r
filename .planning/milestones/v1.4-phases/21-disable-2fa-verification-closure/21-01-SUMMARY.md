---
phase: 21-disable-2fa-verification-closure
plan: 01
subsystem: auth/tfa
tags: [auth, 2fa, security, sqlite, node-test]
requires: [tfa-disable-route, logSecurity, requireTotpSecret, login_challenges]
provides: [strict-disable-gate, challenge-teardown, revoke-others-on-disable, tfa_disabled-verb, test/tfa-disable.test.mjs]
affects: [e2e/tfa-disable-cycle.spec.mjs (plan 02)]
tech-stack:
  added: []
  patterns: [D-85 strict-input gate, revoke-others-in-transaction, after-commit security verb, withDb DB fixtures]
key-files:
  created:
    - test/tfa-disable.test.mjs
  modified:
    - server.js
    - test/tfa-enrollment.test.mjs
decisions:
  - D-101 strict 6-digit-only gate; the D-57 recovery-code branch deleted entirely
  - D-103 challenge teardown keyed on user_id only, inside the disable transaction
  - D-105 revoke-others keyed on cookie-derived tokenHash computed before the transaction
  - D-107 logSecurity('tfa_disabled') after commit, before the response (success-only)
metrics:
  duration: 14m
  completed: 2026-10-29
status: complete
actuals:
  tokens: 31000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 0ad6c92689060741929706ae058c81b279f78c09
plan_head_after: 0030a2a0e37ecba3399b3a5c91d32cdb66d6c7d6
---

# Phase 21 Plan 01: Disable Route Tightening + Server Suite Summary

**One-liner:** Strict 6-digit-only disable gate (recovery-code branch deleted) with one-transaction challenge teardown + revoke-others session policy + after-commit `tfa_disabled` verb, proven by an 8-test node:test server suite.

## What Was Built

### Task 1 — Route tightening (tracer) — commit 5f9afbe

- `server.js` POST `/api/auth/tfa/disable`: the D-57 recovery-code else-branch is gone. A single
  strict gate (`!/^\d{6}$/.test(code)` → 400 `codeRejected`) replaces both the permissive `!code`
  check and the branch, mirroring the regen route's D-85 pattern verbatim. Guard order and the
  `tfa-disable|uid 5/15min` throttle are byte-identical to shipped (D-108).
- Inside the existing single transaction: the two shipped teardown statements plus
  `delete from login_challenges where user_id = ?` (D-103) and
  `delete from sessions where user_id = ? and token_hash != ?` (D-105), with `tokenHash`
  computed from the caller's own cookie before the transaction (password-change precedent).
- `logSecurity(user.id, 'tfa_disabled')` sits between the committed 'ok' and the 200 response (D-107).
- `test/tfa-disable.test.mjs` created (tracer slice): happy path + the D-102 headline regression.

### Task 2 — Suite expansion — commit 0030a2a

Six more behaviors in `test/tfa-disable.test.mjs` (8 tests total, two isolated server instances
to respect the 5-signups/hour IP budget):

1. D-103/D-104 — pending challenge torn down; the token answers 401 `challengeExpired` on
   `/api/auth/tfa/login` (ghost state dead).
2. D-105 — a second session is revoked (401 on `/api/auth/sessions`) while the caller stays 200.
3. Pitfall 5 — another user's challenge survives and still completes a real 2FA login
   (user-scoped delete proof; proved via B's own live code, since a non-2FA user's challenge is
   killed by the login route itself).
4. D-107 — exactly one `tfa_disabled` security_log row on success; zero on wrong-password failure.
5. D-108 — wrong passwords consume tries; 6th attempt 429 `tooManyAttempts`; 2FA still on.
6. D-108/T-21-06 — corrupted envelope 503 `masterKeyMissing` with zero mutation.

## Deviations from Plan

**1. [Rule 3 - Blocking] The plan's literal `grep -c recovery_codes` structural check is over-broad.**
- **Found during:** Task 1 verify
- **Issue:** The grep counts *any* `recovery_codes` reference in the route body, but the D-59
  teardown `delete from recovery_codes where user_id = ?` — required by SC-2 (one-transaction
  wipe of recovery codes) and asserted by the happy-path test — is itself such a reference. The
  literal check returns 1 and can never return 0 while SC-2 holds.
- **Fix:** Kept the mandated teardown delete; verified the actual D-101 invariant instead — zero
  recovery-code *lookup/verify* references (`recoveryHash`, `normalizeRecoveryCode`,
  `select … recovery_codes`) in the route body, which returns 0. Documented in the route comment.
- **Files:** server.js (comment only)

**2. [Rule 1 - Bug] Superseded D-57 test in the sibling enrollment suite.**
- **Found during:** Task 2 (`npm test` regression run)
- **Issue:** `test/tfa-enrollment.test.mjs:229` "D-57: a printed recovery code disables 2FA in any
  normalization" asserted the old 200 dual-shape contract that D-101 deliberately deletes (failed
  400 !== 200 — the intended new behavior).
- **Fix:** Rewrote it as "D-101/D-102 (supersedes D-57)": recovery code → 400 `codeRejected`,
  2FA still enabled, all 10 codes intact. No other sibling test asserted the removed branch.
- **Files modified:** test/tfa-enrollment.test.mjs — commit 0030a2a

**3. TDD RED phase not applicable for Task 2.** The behaviors under test were implemented by
Task 1 (tracer-first plan shape), so the Task 2 tests passed on first run. No RED commit exists;
`workflow.tdd_mode` is not enabled in config, so no gate blocks. Noted for the record.

## Verification

- `node --test test/tfa-disable.test.mjs` — 8/8 pass
- `npm test` — 555/555 pass (no regressions; the one intentional contract flip is deviation 2)
- D-101 structural invariant: 0 recovery-code lookup/verify references in the disable route body
- ESLint clean on all touched files

## Threat Model Check

All six mitigated threats (T-21-01…06) verified by tests: no recovery path (D-102 test), ghost
challenges dead (D-104), revoke-others scoped by cookie hash with cross-user survival proof
(D-105 + Pitfall 5), success-only audit row (D-107), throttle band (D-108), fail-closed 503
(T-21-06). No new network/auth/file surface beyond the plan's threat model.

## Known Stubs

None — every route behavior is wired and tested; e2e coverage is Plan 02's scope (D-110 server
level complete here).

## Self-Check: PASSED

- test/tfa-disable.test.mjs exists ✓
- Commits 5f9afbe, 0030a2a present in git log ✓
