---
phase: 30-entra-sso-oidc
verified: 2026-11-02T18:10:00Z
status: human_needed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/30-entra-sso-oidc/30-01-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-02-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-03-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-04-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-05-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-06-PLAN.md
  - .planning/phases/30-entra-sso-oidc/30-01-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-02-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-03-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-04-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-05-SUMMARY.md
  - .planning/phases/30-entra-sso-oidc/30-06-SUMMARY.md
  - oidc.js
  - server.js
  - test/oidc-sso.test.mjs
  - test/migration.test.mjs
  - src/pages/auth.js
  - src/main.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/fr.json
  - DEPLOY.md
  - package.json
covered_digest: "v2:sha256:0cb9d485a55c57b03a400103b7b9b054783f6ae36e48de8c87addd2a8e1a06d0"
behavior_unverified: 0
overrides_applied: 1
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-30-1 (30-06): SSO identity resolution now requires claims.email_verified === true before linking, JIT provisioning, or invite reconciliation — the A2 tenant-vouching approximation is replaced by the literal claim, fail closed (server.js:2719-2729; negative tests email_verified:false / absent)"
    - "Prior human item #1 (A2 policy acceptance, WR-02) is superseded: the operator decision was implemented as G-30-1 rather than left as a policy question"
  gaps_remaining: []
  regressions: []
overrides:
  - must_have: "A first-time identity with no email match is JIT-provisioned with role from OIDC_DEFAULT_ROLE (SSO-04, D-04)"
    reason: "Superseded by D-05's locked bare-account model — a JIT account has no workspace; the only role-bearing paths are invite reconciliation (invite.role, SSO-07) and onboarding workspace creation (owner). OIDC_DEFAULT_ROLE removed from the env surface in 30-05; grep gate zero matches across oidc.js/server.js/DEPLOY.md/test/src. Recorded on 30-02-PLAN.md."
    accepted_by: "operator (GSD gap-closure 30-05)"
    accepted_at: "2026-11-02T00:00:00Z"
advisory:
  - finding: "CR-01 (30-REVIEW): MASTER_KEY_PREVIOUS is not forwarded through the compose environment — an operator key rotation relying on it silently loses access to old encrypted data"
    category: other
    reason: "Pre-existing infra/compose concern outside the phase's SSO requirements; does not affect any SSO truth. Surface to the operator; not actionable within Phase 30."
    evidence_status: "codebase observation; no compose forwarding of MASTER_KEY_PREVIOUS found"
human_verification:
  - test: "Real-tenant smoke test — configure OIDC_ENABLED + OIDC_TENANT_ID/OIDC_CLIENT_ID/OIDC_CLIENT_SECRET against a real Entra app registration and complete a sign-in with a tenant member whose email is verified."
    expected: "Redirect to Microsoft, consent/select-account prompt, back to a session at /; the Microsoft button appears only when /api/config says oidcEnabled."
    why_human: "Requires real Microsoft credentials; the mock IdP cannot prove the live tenant wiring, discovery doc, or real JWKS."
  - test: "Real-tenant negative check — sign in with an account whose token carries email_verified !== true (e.g. a guest/MSA where applicable)."
    expected: "Lands on /login?sso=error with the generic ssoError banner; no users/oidc_identities row created, no session."
    why_human: "Real claim shapes from Microsoft differ from fixtures; the fail-closed branch's behavior against genuine tokens needs an operator observation."
---

# Phase 30: Entra SSO (OIDC) Verification Report

**Phase Goal:** Entra SSO (OIDC) — milestone v1.6 Team Access & Federation
**Verified:** 2026-11-02T18:10:00Z
**Status:** human_needed
**Re-verification:** Yes — full re-verification. server.js changed after the prior verification (commit 6a910eb, G-30-1 gap closure 30-06), so the old digest is stale; every truth re-verified from the codebase, not from SUMMARY claims or the old report.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | OIDC start returns 302 to pinned-tenant authorize URL with client_id/response_type/redirect_uri/scope/state/nonce/PKCE-S256 (SSO-01, D-01) | ✓ VERIFIED | server.js:2628-2653; oidc.js `buildAuthUrl`; passing test rows (gating + flow matrix) |
| 2 | Callback exchanges code (verifier + client_secret), verifies RS256 id_token via JWKS against pinned iss/aud/exp/nonce, mints an ordinary sessions row (SSO-01) | ✓ VERIFIED | server.js:2678-2690, 2833-2851; oidc.js `verifyIdToken` fail-closed reason chain; 46-test suite green incl. happy path + replay |
| 3 | Unconfigured OIDC → both routes 404 notFound, `/api/config` oidcEnabled:false, no button (SSO-02, D-02/D-10) | ✓ VERIFIED | server.js:2629/2665 404 gates; 2620-2621 config fields; src/pages/auth.js:41-63 client gating on `api.oidcEnabled`; partial-config test rows pass |
| 4 | state/nonce/verifier fresh per start, hashed at rest, timing-safe compare, consumed on first use — replay yields no second session | ✓ VERIFIED | server.js:2641-2676 (OIDC_FLOWS Map, delete-on-use, timingSafeHex); replay test row passes |
| 5 | Identity resolution: link to existing users row only under pinned-tenant + non-guest shape AND `email_verified === true`; guest/mismatch never links; JIT bare account only with verified email; already-linked (issuer,subject) re-authenticates without re-check (SSO-03, G-30-1) | ✓ VERIFIED | server.js:2714-2753 — `canLink = isPinnedTenant && !guestShape; verifiedEmail = claims.email_verified === true`; both gates fold into the link/JIT branch (2723, 2726-2729); negative test rows for email_verified:false and absent pass |
| 6 | Repeated SSO logins with same (issuer, subject) resolve to the same user row; unique index makes concurrent first logins race-safe (SSO-03) | ✓ VERIFIED | server.js:2720, 2746-2752 UNIQUE backstop; migration schema oidc_identities_subject unique index (175-184); idempotency test rows pass |
| 7 | SSO never bypasses 2FA: two_fa_enabled accounts get the verbatim challenge-then-stop branch (challenge row + cookie, NO session) and /api/auth/tfa/login completes with zero route changes (SSO-05) | ✓ VERIFIED | server.js:2821-2831 (same login_challenges insert / setChallengeCookie / CHALLENGE_TTL_MS as password path 2888-2896); 2FA test rows incl. revocation-401 and replay rows pass |
| 8 | SSO-only mode: /api/auth/login answers bare 404 notFound (never 403-with-message), tfa/logout/me stay functional, reversible with password_hash intact (SSO-06, D-07/D-08) | ✓ VERIFIED | server.js:2868 gate before sameOrigin; client form hiding src/pages/auth.js:52-63; SSO-06 test rows incl. reversibility pass |
| 9 | Fail-closed validation matrix: alg/none, HS256, wrong kid, bad signature, tampered payload, expired, wrong iss/aud, reused nonce, replayed state, wrong verifier, missing sub/email — every row fails closed (SSO-08) | ✓ VERIFIED | oidc.js verifyIdToken reason chain; matrix rows in test/oidc-sso.test.mjs — all 46 tests pass |

**Score:** 9/9 truths verified (0 present, behavior-unverified) — every truth is pinned by the passing integration suite (`test/oidc-sso.test.mjs`, 46 pass / 0 fail) which runs the real `server.js` against a mock IdP.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `oidc.js` | node:crypto-only Entra client: createOidc, buildAuthUrl, exchangeCode, verifyIdToken, getJwks, pkcePair | ✓ VERIFIED | 229 lines, imports only `node:crypto`; substantive, imported+used by server.js:56 |
| `server.js` OIDC routes + schema + config | /start, /callback, oidc_identities table, oidcEnabled/oidcSsoOnly, sso_login verb | ✓ VERIFIED | routes at 2628/2656; table at 175-183; config at 2620-2621; sso_login at 2851 |
| `test/oidc-sso.test.mjs` | mock IdP integration suite incl. G-30-1 strict fixtures + SSO-08 matrix | ✓ VERIFIED | 893 lines, 46 tests, all pass with email_verified fixtures (line 49-52: claim absent by default = the failure mode) |
| `test/migration.test.mjs` | oidc_identities additive migration + second-boot idempotency | ✓ VERIFIED | passes in full suite |
| `src/pages/auth.js` | Microsoft button gated on api.oidcEnabled; ssoOnly form hiding | ✓ VERIFIED | lines 41-63/80; wired via src/core/api.js config and src/main.js:294-297 ssoError banner |
| locales | page.auth.continueMicrosoft + page.auth.ssoError EN+FR | ✓ VERIFIED | en.json/fr.json lines 832/883 |
| `DEPLOY.md` | OIDC env block + email_verified operator docs | ✓ VERIFIED | OIDC block present; email_verified policy + operator note at 264-268 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| oidc.js createOidc | server.js OIDC factory | import './oidc.js' | ✓ WIRED | server.js:56, instantiated :134 |
| /api/config | client button visibility | api.oidcEnabled / api.oidcSsoOnly | ✓ WIRED | auth.js:41-63 |
| callback error redirect | /login?sso=error → ssoError banner | main.js:294-297 | ✓ WIRED | single generic string, no-oracle |
| OIDC callback | login_challenges + /api/auth/tfa/login | verbatim D-68 branch | ✓ WIRED | zero tfa-route changes (tfa-login suite green) |
| JIT creation | invites reconciliation | addMembership + invite-clearing | ✓ WIRED | server.js:2755-2809, invite.role honored |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| /api/config | oidcEnabled/oidcSsoOnly | OIDC factory readConfig(process.env) | yes | ✓ FLOWING |
| Session | row (user) | oidc_identities/users DB queries | yes | ✓ FLOWING |
| Button/error banner | api state | /api/config fetch + callback redirect marker | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full SSO suite | `node --test test/oidc-sso.test.mjs` | 46 pass / 0 fail / 0 skipped | ✓ PASS |
| Full regression sweep | `npm test` | 803 tests: 800 pass, 0 fail, 3 pre-existing intentional skips | ✓ PASS |
| Orphaned-symbol grep (30-05 gate) | `grep -rn 'OIDC_DEFAULT_ROLE\|defaultRole' oidc.js server.js DEPLOY.md test/ src/` | zero matches (exit 1) | ✓ PASS |
| Debt markers | grep TODO/FIXME/XXX/TBD on oidc.js, test file | zero matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| SSO-01 | 30-01 | Raw-OIDC Entra auth-code flow with PKCE, RS256 JWKS, zero packages | ✓ SATISFIED | oidc.js; happy-path + PKCE/nonce/replay tests |
| SSO-02 | 30-01 | Env-gated, honestly hidden; oidcEnabled server ground truth | ✓ SATISFIED | 404 gates; /api/config; client gating |
| SSO-03 | 30-02, 30-06 | Link by verified email only — no linking on unverified claims | ✓ SATISFIED | G-30-1 strict `email_verified === true` claim gate (server.js:2719-2729); negative tests; already-linked identities still re-authenticate |
| SSO-04 | 30-02, 30-05 | JIT provisioning | ✓ SATISFIED (override) | Closed by REMOVAL of OIDC_DEFAULT_ROLE per D-05 (recorded override on 30-02-PLAN.md); bare-account JIT, random scrypt hash, never owner/admin |
| SSO-05 | 30-03 | No 2FA bypass; teardown identical | ✓ SATISFIED | verbatim challenge-then-stop; revocation 401 test |
| SSO-06 | 30-04 | SSO-only door; password path closed with 404-no-oracle | ✓ SATISFIED | 404 gate; form hiding; reversibility test |
| SSO-07 | 30-03 | Invitations reconciled, never stranded | ✓ SATISFIED | auto-accept single / surface multiple / expired ignored; test rows |
| SSO-08 | 30-02 | Fail-closed token-validation matrix | ✓ SATISFIED | full matrix green |

All 8 requirement IDs are mapped to Phase 30 in REQUIREMENTS.md (lines 135-142) and claimed across plans 01-06. No orphaned requirements. WR-02 (30-06 claim) is satisfied by the same G-30-1 gate as SSO-03.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found in phase-modified files | — | No TBD/FIXME/XXX/placeholder markers; no console.log-only handlers; no static fallbacks on rendered data |

WR-01 (guestShape `idp !== issuer` can misclassify federated internal members) remains a deliberate fail-closed availability-only trade-off — it never grants access, only denies it; now partially mitigated by the email_verified gate and documented for the real-tenant human check.

### Advisory (Operator, Out of Phase Scope)

- **CR-01 (30-REVIEW):** `MASTER_KEY_PREVIOUS` is not forwarded through the compose environment — a key rotation would lose access to old encrypted data. Pre-existing infra concern; unrelated to SSO. Surface to the operator, not a Phase 30 gap.

### Human Verification Required

### 1. Real-tenant smoke test
**Test:** Configure OIDC_ENABLED + the three vars against a real Entra app registration; complete a sign-in with a verified tenant member.
**Expected:** Microsoft redirect, back to a session; button appears only when configured.
**Why human:** Requires real Microsoft credentials; mock IdP cannot prove live tenant wiring.

### 2. Real-tenant fail-closed negative check (G-30-1)
**Test:** Sign in with an account whose token carries `email_verified !== true` (guest/MSA where applicable).
**Expected:** /login?sso=error with the generic ssoError banner; no users/oidc_identities row, no session.
**Why human:** Real claim shapes differ from fixtures; the strict gate's behavior against genuine tokens needs operator observation.

### Gaps Summary

None. The G-30-1 gap closure (30-06) is verified in code: the callback consults `claims.email_verified === true` (server.js:2719) before any linking, JIT provisioning, or — transitively — invite reconciliation, with fail-closed `/login?sso=error` on both the false and absent cases, an established-identity carve-out for repeat logins, negative test coverage, and DEPLOY.md operator documentation. The previous verification's A2 policy question is superseded by the implemented strict claim. The phase goal — env-gated raw-OIDC Entra sign-in over Node built-ins, honest hiding, honest 2FA composition, invite reconciliation, SSO-only mode, strict verified-email linking — is implemented, wired, and pinned by a fully green suite. What remains is real-tenant human verification, not code work.

---

_Verified: 2026-11-02T18:10:00Z_
_Verifier: the agent (gsd-verifier)_
