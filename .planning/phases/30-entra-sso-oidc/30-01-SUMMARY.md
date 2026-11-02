---
phase: 30-entra-sso-oidc
plan: 01
subsystem: auth/sso
tags: [oidc, entra, sso, pkce, jwks, sessions, migration]
requires: []
provides:
  - oidc.js createOidc(env) factory (D-01 confidential client + PKCE, D-02 fail-closed config)
  - GET /api/auth/oidc/start + /api/auth/oidc/callback routes (404-no-oracle when disabled)
  - oidc_identities table (unique issuer+subject) in SCHEMA
  - oidcEnabled / oidcSsoOnly in /api/config
  - test/oidc-sso.test.mjs mock-Entra IdP suite + env-gating matrix
affects: [30-02 (link policy + JIT refine), 30-03 (invite reconciliation), 30-04 (client button consumes oidcEnabled)]
tech-stack:
  added: []            # zero new dependencies — node:crypto + global fetch only
  patterns: [env-gated factory (mailer.js shape), 404-no-oracle, hashed-at-rest flow state, verbatim session mint]
key-files:
  created: [oidc.js, test/oidc-sso.test.mjs]
  modified: [server.js, test/helpers/server.mjs, test/migration.test.mjs]
decisions:
  - "Flow state (state/nonce/verifier) lives in a server-side in-memory Map keyed by an opaque short-TTL cookie; raw values never ride a cookie; state compared via timingSafeEqual over sha256 digests; delete-on-use consumes the entry (replay test-pinned)"
  - "Nonce + PKCE verifier stored raw in the same server-side Map (the token exchange and id_token check need them verbatim); hashing applies to what leaves the process — the cookie — per the plan's prohibition text"
  - "logSecurity('sso_login') fires only when a user row is resolved; pre-identity failure branches skip it because security_log.user_id is a NOT NULL FK and security_log is intentionally actor-bound"
  - "2FA challenge composition (SSO-05) intentionally NOT in this plan — it lands in 30-02 per the plan's objective; a 2FA-enabled account linking by email here mints a session directly"
metrics:
  duration: ~35 min
  completed: 2026-11-02
status: complete
commits: 2
plan_head_before: f26a04b61ca3f5f57ae5a82a58ea2fb0887670ad
plan_head_after: dbd26e1
actuals:
  tokens: 9090        # chars/4 over the realized diff (36,362 diff chars)
  tasks: 2
  commits: 2
---

# Phase 30 Plan 01: Entra SSO OIDC Spine Summary

**One-liner:** Hand-rolled Entra OIDC authorization-code flow (confidential client + PKCE S256, RS256 id_token via JWKS) over node:crypto only — two no-oracle routes in server.js with the verbatim login session-mint, an additive oidc_identities table, oidcEnabled ground truth in /api/config, and a mock-IdP integration suite proving the whole path plus the D-02 env-gating matrix.

## What Was Built

- **`oidc.js`** (repo root, Vite rule): `createOidc(env)` following the mailer.js factory shape — D-02 fail-closed `readConfig` (flag AND all three vars, else inert disabled client), `buildAuthUrl` (full authorize shape incl. `code_challenge_method=S256`, `prompt=select_account`), `exchangeCode` (secret in body, `AbortSignal.timeout(10_000)`), `getJwks` (discovery-once with issuer validation, one unknown-kid refetch then fail closed), `verifyIdToken` (Pattern 1: shape → alg → kid → signature → iss → aud → exp → nonce, timing-safe nonce compare).
- **`server.js`**: OIDC_* env block rows; `const OIDC = createOidc()`; additive `oidc_identities` table with unique `(issuer, subject)` index (race-safety anchor for 30-02 linking); `/api/config` gains `oidcEnabled`/`oidcSsoOnly` (D-10); both routes gated `!OIDC.enabled → 404 notFound`. Start: IP throttle, fresh state/nonce/PKCE, hashed flow state in a server-side Map keyed by a ~10-min HttpOnly SameSite=Lax cookie. Callback: delete-on-use flow entry, timing-safe state compare, token exchange, id_token verify with one kid-refetch retry, identity resolution (identity row → email link → JIT bare account with random scrypt hash, Pitfall 5), VERBATIM session-mint insert, `sso_login` security verb, 302 to `/`. Every failure branch → one generic 302 `/login?sso=error`, no cause leakage; no redirect parameter from the request is ever honored.
- **`test/oidc-sso.test.mjs`**: in-file mock Entra IdP (`node:http`: discovery, JWKS from a test RSA keypair, table-driven token endpoint) + real `server.js` booted via the test-only `OIDC_ISSUER_OVERRIDE`. Happy path asserts every authorize param, the session/identity/JIT-account rows, the `sso_login` log, bare-account-no-membership (D-05), and callback replay → `/login?sso=error` with no second session. Plus a 6-row table-driven env-gating matrix (unconfigured, flag-only, missing tenant, empty secret, empty tenant, flag-off-with-vars) each asserting generic `notFound` + `oidcEnabled:false`.
- **`test/helpers/server.mjs`**: cookie jar allowlists `projects_oidc_flow`.
- **`test/migration.test.mjs`**: `oidc_identities` added to the pre-boot snapshot list; exact-column pin matching the SCHEMA declaration; second-boot byte-identical DDL + zero-row proof.

## Verification

- `node --test test/oidc-sso.test.mjs` — 8/8 pass
- `node --test test/migration.test.mjs` — 32/32 pass
- `node --test test/dependencies.test.mjs` — pass (no `dependencies` key added)
- `node --test --test-concurrency=2 test/*.test.mjs` — 762 pass / 0 fail (3 skips pre-existing, not from this plan)

## Deviations from Plan

None in behavior — plan executed as written. Two documented interpretation calls (both within the plan's discretion surface):

1. **[Interpretation] Raw nonce/verifier live in the server-side flow Map** (not hashed): the token exchange and the id_token nonce check need them verbatim; the plan's "stored hashed at rest" prohibition targets cookies/persistent stores — the cookie carries only an opaque random key, and nothing persists beyond process memory (10-min TTL + delete-on-use). State is stored and compared hashed.
2. **[Interpretation] `logSecurity` on failure branches only when a user is resolved**: `security_log.user_id` is `NOT NULL REFERENCES users(id)` and FK enforcement is on; pre-identity failures (bad state, failed exchange, failed verify) have no user row and cannot log without inventing a sentinel. Success logs `sso_login`; 30-02's richer logging can revisit.

Also noted: the mock IdP binds the authorize-time nonce from the authorize URL parameters the test captured (a real Entra binds it server-side at the authorize step — the test skips that hop), which keeps the nonce-claim check honest end-to-end.

## Known Stubs

None — every surface built here is wired to real behavior.

## Threat Flags

None — no security surface beyond the plan's threat model was introduced.

## Self-Check: PASSED

- `oidc.js`, `test/oidc-sso.test.mjs` exist; commits `a4a9224`, `dbd26e1` verified in `git log`.
- `createOidc` import + factory confirmed in server.js; `oidcEnabled: OIDC.enabled` in `/api/config`; verbatim sessions insert present in the callback; unique `(issuer, subject)` index in SCHEMA.
