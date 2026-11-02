---
phase: 30-entra-sso-oidc
plan: 02
subsystem: auth/sso
tags: [oidc, entra, sso, linking, jit, fail-closed, matrix]
requires: [30-01 OIDC spine (oidc.js factory, callback routes, oidc_identities unique index)]
provides:
  - pinned-tenant verified-email link policy in the OIDC callback (SSO-03)
  - guest-shape rejection (idp !== iss, acct === '1', tid mismatch) — never links
  - oidc_identities unique-index race backstop (concurrent first logins)
  - SSO-08 table-driven fail-closed matrix (13 rows) in test/oidc-sso.test.mjs
affects: [30-03 (invite reconciliation consumes OIDC.defaultRole), 30-04 (client button)]
tech-stack:
  added: []            # zero new dependencies (D-01, milestone invariant)
  patterns: [pinned-tenant member vouching (assumption A2), unique-index race backstop, per-row fresh-server matrix]
key-files:
  created: []
  modified: [server.js, test/oidc-sso.test.mjs]
decisions:
  - "Verified email = pinned-tenant member vouching: verified iss (already enforced) + tid === OIDC_TENANT_ID + non-guest shape + non-empty email; guests/mismatches fail closed when the email matches an existing account (users.email UNIQUE makes 'separate account' impossible there), separate JIT bare account otherwise"
  - "preferred_username is never consulted for linking — only the email claim, per the plan prohibition"
  - "Identity insert races resolve to the winning unique-index row (re-select) instead of failing the login"
  - "D-04 role clamp enforced at oidc.js readConfig (plan-01 built, now test-pinned); the D-05 bare account writes no membership row at JIT time, so the call-site role write itself arrives with 30-03"
metrics:
  duration: ~12 min
  completed: 2026-11-02
status: complete
commits: 3
plan_head_before: 908d754
plan_head_after: 50aff4f
actuals:
  tokens: 5539        # chars/4 over the realized code diff (22,156 diff chars)
  tasks: 3
  commits: 3
---

# Phase 30 Plan 02: Identity Link Policy + JIT Role Clamp + SSO-08 Matrix Summary

**One-liner:** Pinned-tenant verified-email linking (tid match + non-guest shape + email claim) with guest-shape rejection and a unique-index race backstop in the callback, JIT default-role clamp test-pinned at readConfig, and a 13-row table-driven SSO-08 matrix proving every tamper/claim vector fails closed with no session minted.

## What Was Built

- **`server.js`** — the callback identity-resolution chain now implements SSO-03: `canLink` requires `claims.tid === OIDC_TENANT_ID`, non-guest shape (`claims.idp` absent or equal to the pinned issuer, `claims.acct !== '1'`), and a non-empty email. Guests and foreign-tenant tokens NEVER link: they fail closed (`/login?sso=error`) when the email matches an existing account (users.email is UNIQUE collate nocase, so "separate account" is impossible there — the existing account is never signed into), or get a separate JIT bare account on a fresh email. The `oidc_identities` insert is wrapped so a unique-constraint race re-selects the winning row instead of failing the login. `preferred_username` appears only in the policy comment — never consulted.
- **`test/oidc-sso.test.mjs`** — grew from 8 to 39 tests:
  - SSO-03 rows: link success (email matched case/whitespace-insensitively to the existing row), 3 guest-no-link rows (`idp`, `acct`, `tid`), fresh-guest separate account, missing-email fail-closed, repeat-login idempotency (one identity row, same user).
  - SSO-04/D-04 rows: `createOidc().defaultRole` clamp unit rows (absent/empty/member/viewer/admin/owner/garbage/ADMIN → member except viewer), password sign-in against a JIT account → 401, two JIT accounts carry different random scrypt hashes.
  - SSO-08 matrix: 13 rows (alg none, HS256, unknown kid, foreign-key signature, wrong iss, wrong aud, expired, nonce mismatch, sub missing, email missing, state mismatch, state replay, wrong PKCE verifier) — each row asserts the generic error redirect, no session cookie, and zero new sessions rows. Mock IdP extended with alg/kid/signKey overrides and an exact-verifier demand at the token endpoint; each matrix row runs on a fresh server instance (fresh IP-throttle budget + isolated DB).
- **`oidc.js`** — unchanged this plan: `readConfig` already clamps `OIDC_DEFAULT_ROLE` to member|viewer (plan 01 pre-built); Task 2 test-pinned it.

## Verification

- `node --test test/oidc-sso.test.mjs` — 39/39 pass
- `node --test test/migration.test.mjs` — 32/32 pass
- `node --test --test-concurrency=2 test/*.test.mjs` — 793 pass / 0 fail / 3 pre-existing skips

## Deviations from Plan

Behavior executed as written. Two documented interpretation calls:

1. **[Interpretation] Guest tokens with an existing matching email fail closed rather than "separate new account"**: `users.email` is `UNIQUE collate nocase`, so a separate account with the same email is impossible; the plan explicitly offers "or fail closed" and requires "the existing account is never signed into" — fail-closed satisfies both. Guest tokens with a fresh email DO get a separate JIT account (test-pinned).
2. **[Interpretation] The D-04 call-site role clamp lives in `readConfig` (oidc.js), not at a JIT membership write**: the D-05 bare account writes NO membership/role row at JIT time (nothing to clamp), so the plan's "value passed toward any membership/role write" does not exist until 30-03's invite reconciliation — which must consume `OIDC.defaultRole` through the same clamp. The clamp is test-pinned here from both directions.

Also noted (Rule 1 auto-fix during Task 3): the matrix initially tripped the start route's IP throttle (10 starts/15 min) on a shared server — solved per-row with fresh server instances, no server.js weakening.

## Known Stubs

None — every surface built here is wired to real behavior.

## Threat Flags

None — no security surface beyond the plan's threat model was introduced. T-30-06 (link policy), T-30-07 (verification chain), T-30-08 (JIT role) are all mitigated and test-pinned; T-30-SC unchanged (zero new packages).

## Self-Check: PASSED

- `git log` verified: `936e244` (SSO-03 policy), `5428f9a` (SSO-04/D-04 pins), `50aff4f` (SSO-08 matrix).
- Suite green: 39/39 in-file, 793/793 full suite (3 pre-existing skips).
- `preferred_username` appears in server.js only inside the policy comment (grep-verified, no code use).
