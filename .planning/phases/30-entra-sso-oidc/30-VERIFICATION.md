---
phase: 30-entra-sso-oidc
verified: 2026-11-02T17:05:00Z
status: human_needed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/30-entra-sso-oidc/30-01-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-02-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-03-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-04-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-05-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-01-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-02-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-03-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-04-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-05-SUMMARY.md
  - oidc.js
  - server.js
  - test/oidc-sso.test.mjs
  - test/migration.test.mjs
  - src/pages/auth.js
  - src/core/api.js
  - src/main.js
  - src/locales/en.json
  - src/locales/fr.json
  - DEPLOY.md
  - package.json
covered_digest: "v2:sha256:6af7ea5177a6df021a00a2b3d54a16812193aed7e7f343d97c7e019a38ff424b"
behavior_unverified: 0
overrides_applied: 1
overrides:
  - must_have: "A first-time SSO identity with no email match is JIT-provisioned with role from OIDC_DEFAULT_ROLE (SSO-04, D-04)"
    reason: "Superseded by D-05's locked bare-account model — a JIT account has no workspace, and the only role-bearing paths are invite reconciliation (invite.role, SSO-07) and onboarding workspace creation (owner). OIDC_DEFAULT_ROLE was removed from the env surface in 30-05 (route 2 per D-05); the unconsumable-no-op env var is gone rather than wired. Recorded on 30-02-PLAN.md as 'OVERRIDE (gap closure 30-05)'."
    accepted_by: "developer (via 30-05 gap-closure plan sanction)"
    accepted_at: "2026-11-02T16:25:58Z"
re_verification:
  previous_status: gaps_found
  previous_score: 8/9
  gaps_closed:
    - "JIT provisioning with role from OIDC_DEFAULT_ROLE — closed by REMOVAL: grep for OIDC_DEFAULT_ROLE|defaultRole over oidc.js, server.js, DEPLOY.md, test/, src/ returns zero matches; readConfig returns exactly {tenantId, clientId, clientSecret, issuer, scopes, ssoOnly}; override recorded on 30-02-PLAN.md"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
advisory: []
behavior_unverified_items: []
coincidental_reliance_items: []

# Requirements coverage: SSO-01..SSO-08 all satisfied — SSO-04 closed by removal (override).
# Carried advisory (from 30-REVIEW.md, none blocking; code untouched by 30-05):
#   WR-01 (warning): guestShape heuristic (idp !== issuer) misclassifies federated internal
#     members as guests — sign-in fails closed (availability bug, not security). server.js:2708-2711.
#   WR-02 (warning): email_verified claim is not checked before JIT/invite-accept; documented
#     assumption A2 policy substitutes pinned-tenant member vouching. Human confirmation pending.
---

# Phase 30: Entra SSO (OIDC) Verification Report

**Phase Goal:** When env-configured, users can sign in with Microsoft Entra via a raw-OIDC authorization-code flow (PKCE, JWKS RS256) over Node built-ins — no sign-in button and no routes when unconfigured. SSO composes honestly with 2FA and existing account contracts.
**Verified:** 2026-11-02T17:05:00Z
**Status:** human_needed (all truths verified; 2 items require human/real-tenant confirmation)
**Re-verification:** Yes — after gap closure (plan 30-05)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Env-gated OIDC start route: 302 to pinned-tenant authorize URL with PKCE S256, state, nonce; 404 + `oidcEnabled:false` when unconfigured; partial config never half-enables (SSO-01/SSO-02, D-01/D-02) | ✓ VERIFIED | oidc.js:51-70,196-212; server.js:2620-2655; tests at test/oidc-sso.test.mjs (regression-checked this run — suite green) |
| 2 | Callback exchanges code (verifier + client_secret), verifies RS256 via JWKS against pinned iss/aud/exp/nonce, mints an ordinary sessions row verbatim (SSO-01) | ✓ VERIFIED | oidc.js:93-129,218-232; server.js:2657-2843; happy-path test green this run |
| 3 | Pinned-tenant verified-email linking; guests/foreign-tenant tokens never link — separate account or fail closed; race-safe unique index on (issuer,subject) (SSO-03) | ✓ VERIFIED | server.js:2702-2745; idempotency + race tests green this run |
| 4 | JIT provisioning with role from OIDC_DEFAULT_ROLE (SSO-04, D-04) | ✓ VERIFIED (override) | Closed by REMOVAL per D-05 route 2: `grep -rn 'OIDC_DEFAULT_ROLE\|defaultRole' oidc.js server.js DEPLOY.md test/ src/` → zero matches (grep exit 1); oidc.js readConfig returns exactly tenantId/clientId/clientSecret/issuer/scopes/ssoOnly; commits 73dd793 + fc80b60; override recorded on 30-02-PLAN.md (not a silent drop). Provisioning path byte-identical: 73dd793 touches only the env-doc line in server.js |
| 5 | SSO-08 matrix: 13 table-driven fail-closed rows, no session on any failure (SSO-08) | ✓ VERIFIED | test/oidc-sso.test.mjs — executed this run: 43 pass / 0 fail |
| 6 | TOTP-enrolled SSO user gets verbatim challenge-then-stop (NO session); teardown/401 identical; replay mints nothing; parallel logins per-attempt (SSO-05) | ✓ VERIFIED | server.js:2809-2824; challenge/parallel/verbatim tests green this run |
| 7 | Invite reconciliation at JIT: single invite auto-accepts via verbatim addMembership; multiple surfaced; expired ignored; repeat login idempotent (SSO-07, D-06) | ✓ VERIFIED | server.js:2748-2801; invite tests green this run |
| 8 | SSO-only: /api/auth/login answers bare 404 (never 403); tfa/login+logout+me keep working; reversible; client hides password form / shows Microsoft button from /api/config ground truth; single ssoError string (SSO-06, D-07/D-08/D-09/D-10) | ✓ VERIFIED | server.js:2849-2856; src/pages/auth.js; src/core/api.js; locales en/fr; SSO-only tests green this run |
| 9 | oidc_identities additive table, byte-identical across boots | ✓ VERIFIED | server.js:176-185; test/migration.test.mjs included in full sweep this run |

**Score:** 9/9 truths verified (1 via recorded override; 0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `oidc.js` | Hand-rolled OIDC client, node built-ins only, no defaultRole | ✓ VERIFIED | 229 lines post-removal; imports only `node:crypto` + global fetch; readConfig keys exactly {tenantId, clientId, clientSecret, issuer, scopes, ssoOnly} — read directly this run |
| OIDC routes in `server.js` | start + callback, 404 gates | ✓ VERIFIED | 73dd793 removed only the env-doc line — callback provisioning path untouched |
| `oidc_identities` table + unique index | additive SCHEMA | ✓ VERIFIED | migration test green in full sweep |
| `/api/config` oidcEnabled + oidcSsoOnly | server ground truth | ✓ VERIFIED | unchanged; client gating green |
| `src/pages/auth.js` button + form hiding | D-09/D-10 | ✓ VERIFIED | no defaultRole references in src/ (grep gate) |
| locales `page.auth.ssoError` + labels | en + fr | ✓ VERIFIED | unchanged |
| `DEPLOY.md` OIDC block | env + app-registration docs, no OIDC_DEFAULT_ROLE | ✓ VERIFIED | dotenv sample line + clamp sentence deleted (73dd793: −3 lines) |
| `test/oidc-sso.test.mjs` | mock-IdP integration suite | ✓ VERIFIED | 43 tests after clamp-row removal, all green this run |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| oidc.js createOidc() | server.js routes + /api/config | `const OIDC = createOidc()` | ✓ WIRED | enabled/ssoOnly/config consumed; no defaultRole symbol downstream (grep gate) |
| /api/config ground truth | client gating | api.js state → auth.js render | ✓ WIRED | unchanged |
| callback | session-mint recipe | verbatim sessions insert | ✓ WIRED | unchanged by 30-05 |
| callback | 2FA challenge branch | login_challenges + setChallengeCookie | ✓ WIRED | unchanged; tests green |
| JIT creation | invite reconciliation | invites-by-email → addMembership via invite.role | ✓ WIRED | unchanged; per-invite role beats global default (SSO-07 semantics) |
| ~~JIT creation~~ ~~role ladder member\|viewer~~ | ~~OIDC.defaultRole~~ | — | ✓ REMOVED (was NOT WIRED) | gap closed by removal per D-05 route 2 — no orphaned symbol remains |
| callback errors | page.auth.ssoError banner | `/login?sso=error` marker | ✓ WIRED | unchanged |

### Data-Flow Trace (Level 4)

No dynamic rendering artifacts introduced by the gap closure (pure removal). Client gating values (oidcEnabled, oidcSsoOnly) still flow from /api/config ground truth → api.js → auth.js — verified unchanged.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Removal grep gate | `grep -rn 'OIDC_DEFAULT_ROLE\|defaultRole' oidc.js server.js DEPLOY.md test/ src/` | zero matches (exit 1) | ✓ PASS |
| Phase test suite | `node --test test/oidc-sso.test.mjs` | 43 pass / 0 fail / 0 skipped (~9s) | ✓ PASS |
| Full regression sweep | `node --test --test-concurrency=2 test/*.test.mjs` | 797 pass / 0 fail / 3 skipped (~47s) | ✓ PASS |
| Zero new dependencies | package.json grep | only `devDependencies` key | ✓ PASS |
| Override recorded | `grep -n 'OVERRIDE (gap closure 30-05)' .planning/phases/30-entra-sso-oidc/30-02-PLAN.md` | found at line 25, adjacent to SSO-04 truth, citing D-05 | ✓ PASS |
| Commits exist | `git show --stat 73dd793 fc80b60` | both present with expected file scopes | ✓ PASS |

The 3 skipped tests are pre-existing intentional placeholder rows in `test/scope.test.mjs` (404-matrix unknown-probe rows), a file unchanged by 30-05 — out of scope, not a regression.

### Probe Execution

None declared — no probe scripts in any PLAN/SUMMARY; the test suites are the executable checks (run above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SSO-01 | 30-01 | Raw-OIDC auth-code flow with PKCE, RS256 JWKS, zero packages | ✓ SATISFIED | oidc.js; happy-path test |
| SSO-02 | 30-01 | Env-gated, honest hiding, oidcEnabled ground truth | ✓ SATISFIED | 404 gates; config; client gating |
| SSO-03 | 30-02 | Link by verified email only; no unverified-claim linking | ✓ SATISFIED | pinned-tenant member vouching policy (assumption A2 — see warnings); tests |
| SSO-04 | 30-02, 30-05 | JIT provisioning + default role | ✓ SATISFIED (override) | Closed by REMOVAL per D-05 route 2 — the unconsumable env var is gone from code, docs, and tests; override recorded on 30-02-PLAN.md; bare-account JIT + invite.role semantics intact |
| SSO-05 | 30-03 | No 2FA bypass; teardown identical | ✓ SATISFIED | challenge-then-stop verbatim; tests |
| SSO-06 | 30-04 | SSO-only door; password path hidden/disabled | ✓ SATISFIED | 404 gate; form hiding; reversibility test |
| SSO-07 | 30-03 | Invitations reconciled, never stranded | ✓ SATISFIED | auto-accept single / surface multiple; tests |
| SSO-08 | 30-02 | Table-driven fail-closed validation matrix | ✓ SATISFIED | 13-row matrix, suite green |

All 8 requirement IDs from the tasking are accounted for in the REQUIREMENTS.md phase map (SSO-01..08 → Phase 30) and claimed across plans 01–05. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| server.js | 2708-2711 | WR-01: guestShape `idp !== issuer` misclassifies federated internal members | ⚠️ Warning | Availability only — fails closed; carried advisory (untouched by 30-05) |
| server.js | 2702-2745 | WR-02: email_verified claim not checked before JIT/invite-accept | ⚠️ Warning | Deliberate A2 policy; review judged acceptable — human confirmation pending against real tenant |

No TBD/FIXME/XXX/placeholder markers in any phase-modified file. The previous orphaned-config warning (OIDC.defaultRole) is RESOLVED — the symbol no longer exists.

### Human Verification Required

### 1. Confirm the A2 "verified email" policy against a real Entra tenant (WR-02)
**Test:** In a real tenant, sign in with an account whose token carries `email_verified: false` (e.g. an MSA/guest where applicable) and with a federated internal member (WR-01) — observe linking/JIT behavior.
**Expected:** Per current code, non-guest pinned-tenant tokens link on the email claim regardless of email_verified; federated members fail closed. Confirm this matches the operator's intent.
**Why human:** Policy acceptance cannot be decided from code; requires a real tenant and a risk call.

### 2. Real-tenant smoke test (deferred per plan user_setup)
**Test:** Configure OIDC_ENABLED + the three vars against a real Entra app registration; complete a sign-in.
**Expected:** Redirect to Microsoft, back to a session; button appears only when configured.
**Why human:** Requires real Microsoft credentials; the mock IdP cannot prove the live tenant wiring.

### Gaps Summary

None. The single prior gap (SSO-04: `OIDC_DEFAULT_ROLE` parsed but never consumed) is closed by REMOVAL per D-05 route 2 — the env var and `defaultRole` symbol no longer exist anywhere in tracked source, docs, or tests (grep gate: zero matches), `readConfig` returns exactly the six consumed keys, the provisioning path is byte-identical (bare-account JIT per D-05, invite reconciliation via `invite.role` per SSO-07), and the required override is recorded on 30-02-PLAN.md citing D-05 rather than a silent drop. Full regression sweep green (797 pass / 3 pre-existing intentional skips). The phase goal — env-gated raw-OIDC Entra sign-in over Node built-ins, honest hiding when unconfigured, honest 2FA composition, invite reconciliation, SSO-only mode — is implemented, wired, and pinned by the passing suite. What remains is operator-side human verification (A2 policy acceptance and real-tenant smoke test), not code work.

---

_Verified: 2026-11-02T17:05:00Z_
_Verifier: the agent (gsd-verifier)_
