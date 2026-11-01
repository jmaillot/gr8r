# Stack Research — v1.6 Team Access & Federation

**Domain:** Self-hosted PM workspace — new capabilities: multi-team membership, team/project-scoped permissions, Microsoft Entra OIDC SSO, second TOTP factor
**Researched:** 2026-11-01
**Confidence:** HIGH (Entra endpoints/parameters verified via Context7 `/websites/learn_microsoft_en-us_entra_identity-platform`; node:crypto JWK/verify verified via `/websites/nodejs_latest-v24_x_api`; schema recommendations grounded in PROJECT.md current state)

## Headline Answer

**Zero new packages — including dev dependencies.** All four features are buildable with what the project already runs (Node ≥ 24 built-ins, `node:sqlite`, vendored code). npm has nothing to add here; the work is implementation, not acquisition.

| Feature | Stack addition |
|---|---|
| Multi-team membership | `node:sqlite` schema change only |
| Team/project-scoped permissions | Pure logic in `server.js` (`requireWorkspace` extension) |
| Entra OIDC SSO | ~300–400 lines of vendored OIDC code using `node:crypto` + global `fetch` |
| Second TOTP factor | `node:sqlite` schema change + existing `v2:` envelope infra |

## Recommended Stack

### Core Technologies (unchanged — versions current as of research date)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | ≥ 24 (project currently on 24.x) | Runtime | Native `fetch` (undici, no dep), `Buffer.from(..., 'base64url')`, `crypto.createPublicKey({key: jwk, format: 'jwk'})`, `crypto.verify('RSA-SHA256', …)` — everything OIDC signature validation needs |
| node:sqlite | built-in | All schema changes below | Existing migration machinery is proven (`migrateTenancy`, `migrateTotpReWrap` precedent) |
| node:crypto | built-in | PKCE, state/nonce, JWT signature validation, TOTP | Already proven for TOTP (HMAC-SHA1) and AES-GCM envelopes |
| global `fetch` | built-in (undici) | Discovery + JWKS + token endpoint calls | Use this, **not** `node:http` — outbound HTTPS with redirects, timeouts (AbortSignal.timeout) and connection pooling are already handled. `node:http` is only needed for the *inbound* callback route, which `server.js` already owns |
| Vendored code | per-file MIT | Nothing new needed | The only vendored file today is the QR encoder; the second-TOTP feature reuses it as-is. OIDC should be *written*, not vendored — no small enough clean-room source exists |

### Schema Additions (node:sqlite)

**1. Multi-team membership.** The `teams[]` array in the workspace JSON document remains the source of team identity (names, colors, ordering). Team membership becomes a real table — do **not** encode it in the JSON document:

```sql
CREATE TABLE team_memberships (
  team_id    TEXT NOT NULL,   -- team id from the workspace doc's teams[]
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id),
  user_id    INTEGER NOT NULL REFERENCES users(id),
  role       TEXT NOT NULL DEFAULT 'member',  -- reserve for future team-lead tier
  PRIMARY KEY (team_id, user_id)
);
```

Why a table and not the document: `requireWorkspace` already authorizes against SQL rows (`memberships`) per request — server-side team-permission checks must be one indexed lookup, not a document parse; the document is client-mergeable (`mergeClientDoc`) and must never be the authority for access (the same principle that moved auth state out of the document in v1.3). Migration: seed `team_memberships` from each user's existing single `memberships.team` value (the v1.4 "member team" column), keeping that column readable during transition, then drop it. Follow the established pattern: transactional, preceded by `vacuum into` backup, byte-identical second boot.

**2. Team/project-scoped permissions.** No new table — extend existing ones:

```sql
ALTER TABLE memberships ADD COLUMN scope TEXT NOT NULL DEFAULT 'workspace';
-- scope = 'workspace' (full role) | 'team' | 'project'
ALTER TABLE memberships ADD COLUMN scope_team_id TEXT;      -- set when scope='team'
ALTER TABLE memberships ADD COLUMN scope_project_id TEXT;   -- set when scope='project'
ALTER TABLE invites ADD COLUMN scope TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE invites ADD COLUMN scope_team_id TEXT;
ALTER TABLE invites ADD COLUMN scope_project_id TEXT;
```

Enforcement point: `requireWorkspace(req, res, slug, minRole)` gains an optional context arg (`{teamId?, projectId?}`) and resolves effective role = workspace role intersected with scope. Scoped users keep `role='member'` (or `'viewer'`) but the scope columns clamp it outside their team/project. Rule of thumb to encode in tests: a scope can only *restrict* a membership role, never elevate it; `admin`/`owner` ignore scope.

**3. Second TOTP factor.** Replace the `two_fa_*` columns with a factors table (or keep the primary column as factor #1 and add the table for #2 — see Alternatives). Recommended shape:

```sql
CREATE TABLE totp_factors (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  label        TEXT NOT NULL DEFAULT '',      -- user-named, e.g. "Phone", "Tablet"
  secret_enc   TEXT NOT NULL,                 -- existing v2:<key-id>:<iv>:<tag>:<ct> envelope, unchanged format
  confirmed_at INTEGER,                       -- NULL until verify-before-enable passes (pending enrollment)
  last_counter INTEGER NOT NULL DEFAULT 0,    -- per-factor replay guard (existing TOTP counter logic, per row)
  created_at   INTEGER NOT NULL
);
```

The keyring work in v1.5 pays off exactly here: `v2:` envelopes and `requireTotpSecret()` need **zero changes** — the second factor is just another row with its own envelope. Login flow change: a user with ≥1 confirmed factor enters *any* factor's code; verify loops confirmed factors with each factor's own replay guard (per-factor counter, never shared). Disable-2FA teardown (the Phase 21 one-transaction contract) extends to delete all factor rows + recovery codes + pending challenges in the same transaction. Recovery codes stay a single per-user set, untouched.

**4. OIDC SSO.** Two small tables plus env config:

```sql
CREATE TABLE sso_identities (
  provider   TEXT NOT NULL DEFAULT 'entra',
  issuer     TEXT NOT NULL,          -- https://login.microsoftonline.com/{tenant}/v2.0
  subject    TEXT NOT NULL,          -- id_token `oid` claim (stable, tenant-scoped)
  user_id    INTEGER NOT NULL REFERENCES users(id),
  email      TEXT,                   -- mirror of preferred_username/claim at link time
  PRIMARY KEY (provider, issuer, subject)
);
CREATE TABLE oidc_states (
  state_hash TEXT PRIMARY KEY,       -- sha256(state), single-use, like the existing login_challenges pattern
  nonce_hash TEXT NOT NULL,
  verifier_hash TEXT NOT NULL,       -- sha256(verifier); plaintext verifier kept only until callback
  next_path  TEXT,
  created_at INTEGER NOT NULL        -- TTL ~10 min, purge like login_challenges
);
```

Env config (all required before the SSO UI renders — the env-gated visibility requirement):

```
ENTRA_TENANT_ID, ENTRA_CLIENT_ID, ENTRA_CLIENT_SECRET (optional if PKCE-only public-ish flow, but keep secret: confidential client), APP_URL (exists)
```

### The Raw OIDC Surface (what gets written, not installed)

Verified against Microsoft Entra docs (Context7, `/websites/learn_microsoft_en-us_entra_identity-platform`, v2-oauth2-auth-code-flow):

1. **Discovery** — `GET https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` via `fetch`. Cache the document in memory (TTL ~1h); read `authorization_endpoint`, `token_endpoint`, `jwks_uri`, `issuer`. **Do not hardcode endpoints** — the issuer check later depends on the discovered issuer string (Entra's issuer *does* carry a trailing `/v2.0`, e.g. `https://login.microsoftonline.com/{tid}/v2.0`; compare exact string).

2. **Authorization redirect** (inbound route already in `server.js`) — build the authorize URL with: `response_type=code`, `client_id`, `redirect_uri` (must *exactly* match an app-registration redirect URI), `response_mode=query`, `scope=openid profile email` (no Graph scopes needed — you only read the id_token), `state` (256-bit random, `crypto.randomBytes(32).toString('base64url')`), `nonce`, `code_challenge` + `code_challenge_method=S256`, `prompt=select_account`. Store sha256 hashes of state/nonce/verifier in `oidc_states` with a 10-minute TTL (mirrors the `login_challenges` single-use pattern).

3. **PKCE** — verifier = 32 random bytes → base64url (43 chars); challenge = `createHash('sha256').update(verifier).digest('base64url')`. `Buffer` base64url support is native; no base64url shim needed.

4. **Token exchange** — `fetch(token_endpoint, { method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({ client_id, client_secret, grant_type: 'authorization_code', code, redirect_uri, code_verifier }) })`. You only consume `id_token` from the response; the access token can be discarded (no Graph API calls in scope).

5. **JWKS validation (the security-critical part)**:
   - Fetch `jwks_uri` (cache ~1h; on unknown `kid`, refetch once).
   - Base64url-decode the JWT header/payload with `Buffer.from(part, 'base64url')`.
   - Match `kid` in the JWKS; build the key with `crypto.createPublicKey({ key: jwk, format: 'jwk' })` (verified: Node accepts JWK objects directly).
   - Verify signature: `crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), keyObject, sig)` — or `createVerify('RSA-SHA256')`. Entra signs with RS256/RS384; support both, reject `none` and everything else explicitly.
   - Claim checks, each of which must fail the login individually: `iss` exactly equals the discovered issuer; `aud` equals `ENTRA_CLIENT_ID` (array or string); `exp > now` with small leeway (≤60s); `nonce` hash matches the stored one, state consumed exactly once (delete row in the same transaction as session creation); `iat` sane (optional). Email (`preferred_username` / `email` claim) is used only for account linking via `sso_identities`.

6. **Account linking policy** (decision to surface to the owner): SSO sign-in links to an existing account only when the email matches an existing verified user — never auto-provisions unless explicitly chosen; a pending-2FA user completing SSO still must satisfy the TOTP challenge (SSO proves identity, 2FA stays the second door — recommend SSO does *not* bypass 2FA).

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| @playwright/test (existing) | e2e for SSO + 2FA flows | Real Entra can't run in CI; test against a local mock IdP (a ~50-line `node:http` server issuing unsigned-then-signed JWTs with a test RSA key) — this also gives replay/`kid`-swap/negative-claim tests for the validator. Playwright can't intercept the outbound token POST, so the mock IdP is the right seam |
| node:test (existing) | unit tests for PKCE/claims/schema | Clock-injectable `Date.now` for `exp` tests, same pattern as `runReminderPass()` |

## Installation

```bash
# Nothing. Zero runtime dependencies held.
# Optional dev tooling only if the team wants lint coverage of the new module:
npm install -D eslint-plugin-... # not required — existing lint config suffices
```

## Alternatives Considered

| Recommended | Alternative | When the Alternative Would Win |
|---|---|---|
| Hand-written OIDC on built-ins (~400 lines) | `openid-client` (npm, 0-dep-ish but a runtime dep) | Only if the constraint were lifted; it handles rotation/edge cases, but is precisely the dependency the project forbids |
| `team_memberships` table | JSON `teams[].members[]` in the workspace doc | Never for authorization (document is client-mergeable; no indexed lookup); acceptable only as a display mirror |
| One `totp_factors` table replacing `two_fa_*` columns | Keep primary column, add single secondary column (`two_fa_secret_2`) | Column approach is a smaller migration but bakes in "two forever" — a third factor, per-factor labels, or future factors (passkeys) would need another migration; the table is the same effort now |
| `memberships` scope columns | Separate `scoped_memberships` table | Columns win: the membership row already exists and `requireWorkspace` already reads it; a parallel table would fork the membership-resolution logic |
| Mock IdP for tests | Live Entra dev tenant in CI | A dev tenant is flaky and network-dependent; keep a manual UAT pass against the real tenant (like the QR device UAT in v1.3) |
| `global fetch` for outbound OIDC calls | `node:http`/`node:https` | Only if a proxy/TLS-policy requirement appears; fetch handles redirects, timeouts (`AbortSignal.timeout()`), and pooling |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| MSAL Node (`@azure/msal-node`) or `openid-client` | Runtime dependencies — violates the hard constraint | Hand-written authorization-code + PKCE flow above |
| `jsonwebtoken` / `jose` for id_token validation | Same reason; also `jose` drags a large webcrypto surface for one RS256 verify | `crypto.verify` + `createPublicKey({format:'jwk'})` |
| Decoding the JWT without verifying the signature (or trusting the token endpoint's `id_token` claims as JSON without validation) | Classic OIDC vuln; the token endpoint response is *not* automatically trustworthy for linking | Full JWKS signature verification before any claim is trusted |
| Storing team membership in the workspace JSON document | The document is client-mergeable and redacted; access authority must live in SQL rows (the v1.3 principle) | `team_memberships` table |
| Sharing one replay counter across TOTP factors | Two factors would invalidate each other's codes | Per-factor `last_counter` |
| Letting SSO bypass the TOTP challenge | Defeats the "second door" the milestone exists to add | SSO → identity proof, then normal pending-2FA challenge |
| Entra `common` tenant endpoint | Allows any Microsoft tenant to sign in — wrong for a self-hosted single-org install | `ENTRA_TENANT_ID` (specific tenant GUID) in all URLs |

## Stack Patterns by Variant

**If the owner wants passwordless Entra-first sign-in later:** the `sso_identities` + `oidc_states` schema already supports it; only the linking policy and login-page ordering change.

**If a third TOTP factor or passkeys ever arrive:** `totp_factors` generalizes; passkeys would need a sibling `webauthn_credentials` table, not a schema rethink.

**If team-lead roles are wanted later:** `team_memberships.role` is already in the schema; today it stays `DEFAULT 'member'` and is never read — cheap to reserve.

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| `crypto.createPublicKey` JWK format | Node ≥ 15.12 | Project on 24.x — fine |
| `Buffer.from(x, 'base64url')` | Node ≥ 15.7 | Fine |
| `crypto.verify('RSA-SHA256', …)` one-call form | Node ≥ 15 | Fine |
| Global `fetch` / `AbortSignal.timeout` | Node ≥ 18 / ≥ 17.3 | Fine on 24.x |
| Entra v2.0 endpoints (`login.microsoftonline.com/{tid}/v2.0`) | current | Verified via Context7, learn.microsoft.com |

## Sources

- Context7 `/websites/learn_microsoft_en-us_entra_identity-platform` — authorization code flow endpoints, PKCE parameters, token request body (HIGH, official docs)
- Context7 `/websites/nodejs_latest-v24_x_api` — `createPublicKey` JWK support, `verify` API (HIGH, official docs)
- `node:crypto` TOTP replay-guard and `v2:` envelope patterns — project's own v1.4/v1.5 implementation (ground truth, PROJECT.md)
- JWKS caching/kid-rotation and claim-validation checklist — standard OIDC practice (MEDIUM, well-established; verified against the Entra doc structure above)

---
*Stack research for: Projects Studio v1.6 Team Access & Federation*
*Researched: 2026-11-01*
