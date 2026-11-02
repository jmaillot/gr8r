# Phase 30: Entra SSO (OIDC) - Research

**Researched:** 2026-11-02
**Domain:** Hand-rolled OIDC authorization-code flow (PKCE + JWKS RS256) over Node built-ins, composing with the existing session/2FA/invite contracts in `server.js`
**Confidence:** HIGH (codebase) / HIGH (Entra flow mechanics, doc-cited) / MEDIUM (Entra email-claim semantics — flagged decision below)

## User Constraints (from CONTEXT.md)

### Locked Decisions

### Env configuration (D-SSO-ENV)
- **D-01:** Confidential client — `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, plus PKCE on the authorization-code flow. Standard Entra app registration "Web" shape; the secret stays server-side only.
- **D-02:** Activation by explicit flag + complete var set: `OIDC_ENABLED=true` AND all three vars present AND non-empty. No implicit activation — partial config never half-enables SSO. Server ground truth is an internal `oidcEnabled` flag.
- **D-03:** `OIDC_SSO_ONLY=true` — when set (with SSO enabled), the password sign-in path is hidden and disabled (D-05/D-06 below).
- **D-04:** `OIDC_DEFAULT_ROLE=member|viewer` (SSO-04), default `member` — agent decided; role applies to JIT-provisioned accounts only.

### JIT provisioning & workspace landing (D-SSO-JIT)
- **D-05:** A first-login SSO user with no pending invitation gets a *bare account* and lands on the existing onboarding (create/join a workspace). No env-driven auto-join workspace.
- **D-06:** Pending invitations for the SSO user's email are reconciled at first login — surfaced or accepted, never silently stranded (SSO-07).

### SSO-only mode (D-SSO-ONLY)
- **D-07:** When `OIDC_SSO_ONLY=true`: the client hides the password form, and the server makes `/api/auth/login` answer **404** — same no-oracle philosophy as the unconfigured OIDC routes. Not a 403 with a message.
- **D-08:** Existing accounts keep their `password_hash` intact; the door is just closed while the flag is on. No local-password fallback.

### UI placement (D-SSO-UI)
- **D-09:** The "Sign in with Microsoft" button renders on the login page and the invitation/join surfaces that already request a sign-in. Signup/onboarding pages unchanged.
- **D-10:** Button visibility is driven by the server's `oidcEnabled` ground truth — never a client-side env guess.

### the agent's Discretion
- Exact internal route naming (e.g. `/api/auth/oidc/start|callback`), state/nonce cookie mechanics, JWT/JWKS caching strategy, error pages on IdP failures, `OIDC_SCOPES` default (`openid profile email`), identity-table schema (flagged planner decision from Phase 28).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SSO-01 | OIDC auth-code flow with PKCE, hand-rolled over Node built-ins (`node:crypto`, `fetch`, JWKS RS256, pinned tenant issuer) — zero new packages | Node 24.21 `node:crypto` JWK import + RS256 verify + `timingSafeEqual` probe-verified; Entra endpoints doc-cited; mailer.js raw-SMTP is the established in-repo precedent |
| SSO-02 | Env-gated and honestly hidden: 404 routes when unconfigured, `oidcEnabled` server ground truth | `/api/config` pattern at server.js:2571-2580 (verbatim quote below) is the exact convention to extend |
| SSO-03 | Link by verified email only; mismatched identities create separate account | Entra email-claim semantics researched — major pitfall; pinned-tenant policy recommended (Pitfall 1) |
| SSO-04 | JIT provisioning with env-configurable default role, shaped as invited members | `createUser` at server.js:2247-2272; membership role ladder verified verbatim at server.js:175 |
| SSO-05 | SSO does not bypass 2FA — pending-2FA challenge after SSO auth; session teardown identical | The D-68 challenge-then-stop pattern (server.js:2598-2611, quoted) is reusable verbatim from the SSO callback; Phase 31's `verifyTotpAgainstFactors` path at server.js:3115-3215 needs zero changes |
| SSO-06 | Env flag makes IdP the only door — password path hidden/disabled | D-07 404-no-oracle shape mirrors Phase 29's contract and the `REMINDER_TEST_TOKEN` route-404 pattern (server.js:2562-2569) |
| SSO-07 | Pending invitations reconciled at first login — never silently stranded | `invites` schema (server.js:194-207) and the accept-invite flow (server.js:4030-4120, quoted) define the reconciliation surface |
| SSO-08 | Table-driven mock-IdP test suite — tampered tokens, wrong kid, bad claims all fail closed | `test/helpers/server.mjs` spawns real server.js with per-test env; mock IdP is a sibling `node:http` server in the test file |

<user_constraints>
## User Constraints (from CONTEXT.md)

Locked decisions D-01..D-10 are reproduced verbatim in the section above; the planner MUST honor them. Discretion areas (route naming, cookie mechanics, JWKS caching, IdP error pages, `OIDC_SCOPES` default, identity-table schema) are resolved with recommendations below. Deferred ideas: none.
</user_constraints>

## Summary

Phase 30 adds a third sign-in path: Microsoft Entra via the OIDC authorization-code flow, hand-rolled over Node built-ins with zero new packages (pinned by `test/dependencies.test.mjs`, which fails if `package.json` gains a `dependencies` key — `[VERIFIED: test/dependencies.test.mjs:20-26]`). Every crypto primitive needed exists in `node:crypto` on this machine's Node v24.21.0: JWK key import, RSA-SHA256 verify, timing-safe compare, CSPRNG, UUID — probe-verified this session. The repo already contains the zero-dependency network precedent (`mailer.js` speaks raw SMTP over `node:net`/`node:tls`), so a small `oidc.js` module (discovery fetch, PKCE, token exchange, JWKS cache, id_token verification) fits the house style. The DB change is one additive table; per Phase 28's settled schema note, an identity table joins `users(id)` independently of `team_members` (`[VERIFIED: server.js:179-185]` — the comment literally settles the Phase 30 identity-column decision).

The hard parts are not crypto — they are composition and honesty. The SSO callback must reuse the existing D-68 challenge-then-stop 2FA issuance verbatim (an SSO-authenticated identity is exactly as untrusted as a password for a TOTP-enrolled account), reuse the session-mint recipe verbatim (same `sessions` insert columns, same `logSecurity` verbs), and reconcile pending invitations for the SSO user's email at first login without silently stranding them. The second hard part is SSO-03: Entra's `email` claim is documented as "isn't guaranteed to be correct and is mutable over time" and `email_verified` is generally absent for managed users — so "verified email only" must be interpreted through the pinned-tenant lens (tenant-member emails are directory-controlled) with an explicit `tid` pin check, and guests/external accounts must not link. This is the one decision I recommend the planner surface to the user as a checkpoint.

**Primary recommendation:** New `oidc.js` (flow + verification module) + one additive `oidc_identities` table + two routes (`/api/auth/oidc/start`, `/api/auth/oidc/callback`) + `oidcEnabled` in `/api/config` + login 404 under SSO-only + one table-driven mock-IdP test file. Reuse the login route's session-mint and challenge-issuance recipes verbatim; never invent a parallel session path.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| OIDC flow orchestration (start/callback, state, nonce, PKCE) | API/Backend (`server.js` + `oidc.js`) | — | Secrets and code exchange are server-only by D-01 |
| Token verification (signature, iss/aud/exp/nonce, kid) | API/Backend (`oidc.js`) | — | JWKS + crypto must not touch the client |
| `oidcEnabled` ground truth | API/Backend (`/api/config`) | Browser (reads config) | D-10 — client renders strictly from server config, like `mail: MAILER.enabled` |
| Sign-in button visibility & SSO-only form hiding | Browser (`src/pages/auth.js`) | API/Backend (config) | Server decides what exists; client only renders |
| Identity linking / JIT provisioning | API/Backend (`server.js`) | Database (new table) | Email lookup on `users`, additive identity rows |
| 2FA composition after SSO auth | API/Backend (`server.js`) | — | Reuses `login_challenges` + `/api/auth/tfa/login` unchanged |
| Invite reconciliation | API/Backend (`server.js`) | Database (`invites`) | Reads pending invites by email at first SSO login |
| Mock IdP test suite | Test (`test/*.test.mjs`) | — | `node:test` + local `node:http` IdP, table-driven |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | Node v24.21.0 (installed) | PKCE verifier gen, SHA-256, JWK→KeyObject import, `crypto.verify('RSA-SHA256', …)`, `timingSafeEqual`, `randomBytes`/`randomUUID` | The only crypto; probe-verified this session `[VERIFIED: node 24.21.0 local probe — JWK import + RSA-SHA256 verify = true]` |
| `node:https` / global `fetch` | Node built-in | Discovery + JWKS fetch + token POST | `fetch` is global since Node 18; mailer.js precedent for raw built-in networking `[VERIFIED: mailer.js:1-33]` |
| `node:sqlite` (`DatabaseSync`) | Node built-in | New `oidc_identities` table | Already the DB layer (`server.js` SCHEMA, node:sqlite) |
| `node:test` + `test/helpers/server.mjs` | in-repo | Table-driven SSO-08 suite against a mock IdP | Existing harness spawns real `server.js` with per-test env overrides `[VERIFIED: test/helpers/server.mjs:1-58]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `node:http` | built-in | The mock Entra IdP inside the test file (serves discovery/JWKS/token endpoint) | SSO-08 only |

**No new packages. Nothing to install. `Package Legitimacy Audit` is trivially clean: zero registry packages proposed.**

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled OIDC client | `openid-client` (npm) | **Forbidden by milestone invariant** (zero new runtime deps, pinned by test). Not considered. |
| Discovery document fetch | Hardcode `login.microsoftonline.com/{tenant}/v2.0` endpoints | Discovery fetch is one GET and self-documents; either is fine — agent discretion. Recommend fetching discovery once at boot with a small cache; fall back to hardcoded shapes is unnecessary complexity. |

## Package Legitimacy Audit

No external packages are proposed by this phase — the milestone invariant (zero new runtime dependencies, `[VERIFIED: test/dependencies.test.mjs:20-26]`) and D-01 forbid them. All functionality comes from Node v24.21.0 built-ins, verified present on this machine:

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none — Node built-ins only) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Browser                       server.js (+ oidc.js)                     Microsoft Entra
   │                                │                                        │
   │ GET /login                     │                                        │
   │◄─ renders button iff           │                                        │
   │   /api/config → oidcEnabled    │                                        │
   │                                │                                        │
   │ click "Sign in with Microsoft" │                                        │
   ├─ GET /api/auth/oidc/start ────►│ oidcEnabled? no → 404                  │
   │                                │ gen PKCE verifier/challenge,           │
   │                                │ state, nonce; stash hashed             │
   │                                │ (state,nonce,verifier) in short-TTL    │
   │                                │ cookie or DB row                       │
   │◄─ 302 ─────────────────────────┤                                        │
   ├─ user authenticates at Entra ─────────────────────────────────────────►│
   │◄─ 302 ?code&state ─────────────────────────────────────────────────────┤
   │                                │                                        │
   ├─ GET /api/auth/oidc/callback ─►│ 1. state matches (timing-safe)         │
   │                                │ 2. POST token endpoint                ─┤► code+verifier+secret
   │                                │ 3. id_token: split, header.kid,       ◄┤─ id_token
   │                                │    verify RS256 via JWKS (cached;      │
   │                                │    one refetch on unknown kid)         │
   │                                │ 4. claims: iss==pinned tenant issuer,  │
   │                                │    aud==client_id, exp/nbf, nonce      │
   │                                │ 5. resolve identity:                   │
   │                                │    oidc_identities(iss,sub) → user     │
   │                                │    else users.email (link policy)      │
   │                                │    else JIT-create + reconcile invites │
   │                                │ 6. two_fa_enabled?                     │
   │                                │    ├ yes → login_challenges row +      │
   │                                │    │   challenge cookie → client shows │
   │                                │    │   pending-2FA → /api/auth/tfa/    │
   │                                │    │   login (UNCHANGED route)         │
   │                                │    └ no → mint sessions row + cookie   │
   │                                │       (verbatim login-route recipe)    │
   │◄─ 302 / (or /#tfa) ────────────┤                                        │
```

Decision points: `oidcEnabled` gate (404), SSO-only gate (login → 404), verified-email link policy (link vs separate account), 2FA branch (challenge vs session), invite reconciliation (accept/surface).

### Recommended Project Structure
```
oidc.js                      # flow + verification module (like totp.js / mailer.js at repo root)
server.js                    # routes: /api/auth/oidc/start, /api/auth/oidc/callback; /api/config gains oidcEnabled;
                             # /api/auth/login gains the SSO-only 404 gate; OIDC_* env block at top (mailer convention)
src/pages/auth.js            # Microsoft button on login + join surfaces, gated on api config
src/locales/en.json|fr.json  # any new strings (catalogue gate)
test/oidc-sso.test.mjs       # SSO-08 table-driven suite + mock IdP
test/migration.test.mjs      # additive schema pinning for oidc_identities
```

### Pattern 1: JWT RS256 verification over node:crypto (no library)

**What:** Verify an Entra id_token without any JWT package: base64url-split, JWK import, `crypto.verify`.
**When to use:** The entire SSO-01 token-validation path.
**Example:**

```js
// Source: probe-verified on Node v24.21.0 this session; mechanics per
// [CITED: learn.microsoft.com/en-us/entra/identity-platform/access-tokens]
import crypto from 'node:crypto';

const b64uJson = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));

export function verifyIdToken(idToken, jwkByKey, { issuer, audience, nonce, now }) {
  const parts = idToken.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'shape' };
  const [h, p, s] = parts;
  const header = b64uJson(h), claims = b64uJson(p);
  if (header.alg !== 'RS256') return { ok: false, reason: 'alg' };   // fail closed on alg confusion
  const jwk = jwkByKey.get(header.kid);                              // unknown kid → caller refetches JWKS once, then fails
  if (!jwk) return { ok: false, reason: 'kid' };
  const key = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const sig = Buffer.from(s, 'base64url');
  const okSig = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), key, sig);
  if (!okSig) return { ok: false, reason: 'signature' };
  // Every remaining check is a timing-safe comparison over the claim bytes:
  if (claims.iss !== issuer) return { ok: false, reason: 'iss' };
  if (claims.aud !== audience) return { ok: false, reason: 'aud' };
  if (typeof claims.exp !== 'number' || claims.exp <= now) return { ok: false, reason: 'exp' };
  if (nonce && claims.nonce !== nonce) return { ok: false, reason: 'nonce' };
  return { ok: true, claims };
}
```

Timing-safe note: for short claim comparisons, `crypto.timingSafeEqual` on `Buffer.from(String(a))` / `String(b)` with a length pre-check is the house pattern; a plain `!==` on an attacker-influenced nonce is the one place to upgrade.

### Pattern 2: PKCE S256 pair (43–128 unreserved chars)

```js
// Source: [CITED: learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow]
// RFC 7636 verifier: 43-128 chars from ALPHA/DIGIT/"-._~"
const verifier = crypto.randomBytes(48).toString('base64url');           // 64 chars, alphabet-safe
const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
```

Send `code_challenge` + `code_challenge_method=S256` on `/authorize`; send `code_verifier` (+ `client_id`, `client_secret`, `redirect_uri`, `grant_type=authorization_code`, `code`) on the token POST.

### Pattern 3: The verbatim session/challenge recipes (composition discipline)

The SSO callback must issue identities using the exact same recipes as the password login route. These are the canonical sources (quoted verbatim so the executor copies them, not paraphrases):

**Session mint** — `[VERIFIED: server.js:2613-2629]`:
```js
    attempts.delete(`${clientIp(req)}|${email}`);
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    const ua = String(req.headers['user-agent'] || '');
    const ip = clientIp(req);
    db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)').run(
      sha256(token),
      row.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
      ip,
      ua,
      t, // a just-created session was seen at creation (D-25 need not apply to new rows)
    );
    db.prepare('update users set last_login_at = ? where id = ?').run(t, row.id);
    setSessionCookie(req, res, token);
    return json(res, 200, { user: userPayload(row) });
```

**Challenge-then-stop (D-68)** — `[VERIFIED: server.js:2598-2611]`:
```js
    /* D-68: a 2FA-enabled account gets NO identity from the password alone.
       Issue the short-lived challenge (row + its own cookie) and stop. This
       branch MUST NOT touch the throttle attempts map — the password→code
       steps share ONE budget (D-03/Pitfall 18: no success-clear between steps). */
    if (row.two_fa_enabled) {
      const challengeToken = crypto.randomBytes(32).toString('base64url');
      db.prepare('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)').run(
        sha256(challengeToken),
        row.id,
        now() + CHALLENGE_TTL_MS,
      );
      setChallengeCookie(req, res, challengeToken);
      return json(res, 200, { pending2fa: true, maskedEmail: maskEmail(row.email) });
    }
```

An SSO-authenticated user with `two_fa_enabled` gets exactly this branch — the challenge is user-scoped, so the pending-2FA route (`/api/auth/tfa/login`, server.js:3115-3215) needs **zero changes** for SSO-05.

**Session row shape** — `[VERIFIED: server.js:144-153]`:
```js
  create table if not exists sessions (
    token_hash text primary key,
    user_id    text not null references users(id) on delete cascade,
    created_at integer not null,
    expires_at integer not null,
    label      text,
    ip         text,
    last_seen_at integer,
    user_agent text
  );
```
Because SSO sessions are ordinary `sessions` rows, revocation/401 teardown (Phase D-105/D-107 discipline) applies with no new code.

**Membership role ladder** (for D-04 `OIDC_DEFAULT_ROLE=member|viewer`) — `[VERIFIED: server.js:175]`:
```js
    role         text not null check (role in ('owner','admin','member','viewer')),
```
And invite roles are `('admin','member','viewer')` — `[VERIFIED: server.js:197]` — so both `member` and `viewer` are valid JIT/invite-shaped roles.

**Ground-truth config exposure** — `[VERIFIED: server.js:2571-2580]`:
```js
  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, {
      app: 'projects',
      signup: ALLOW_SIGNUP,
      mail: MAILER.enabled,
      url: appBase(req),
      workspaceCreation: ALLOW_SIGNUP ? 'open' : 'admins',
      maxUploadMb: MAX_UPLOAD_MB,
    });
  }
```
Add `oidcEnabled` (and, if the client needs it, `oidcSsoOnly` to hide the password form — D-07 says the client hides it, and the client cannot infer that from `oidcEnabled` alone) beside `mail: MAILER.enabled`. The client already reads `/api/config` into `src/core/api.js` state (`state.enabled = !!(r.ok && r.data?.app === 'projects')`, `[VERIFIED: src/core/api.js:156-158]`).

**Invite acceptance surface** (the reconciliation contract SSO-07 must compose with) — `[VERIFIED: server.js:4030-4047]`:
```js
  const acceptMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})\/accept$/);
  if (acceptMatch && method === 'POST') {
    ...
    const account = invite.email ? db.prepare('select * from users where email = ?').get(invite.email) : null;
    let user = session && (!invite.email || session.email === invite.email) ? session : null;
    if (!user && account) {
      return fail(res, 409, 'accountExistsSignIn', 'An account with this email already exists. Sign in to accept the invite.', { needsSignIn: true });
    }
```
And acceptance joins the workspace via `addMembership(ws, user, invite.role, teams, scope)` — `[VERIFIED: server.js:4068-4097]` — then clears all pending invites for the email. SSO-07 has two honest shapes: (a) auto-accept any pending unexpired invite matching the SSO user's email during JIT provisioning (same `addMembership` + invite-clearing writes, same transaction), or (b) surface a "you were invited to workspace X" landing. Recommendation: (a) auto-accept at JIT creation — it reuses the acceptance code path, needs no new UI, and "never silently stranded" is satisfied structurally; only if multi-invite ambiguity appears, surface instead.

**Account creation** — `[VERIFIED: server.js:2247-2260]`:
```js
function createUser(email, name, password) {
  const clean = email.trim().toLowerCase();
  if (!emailOk(clean)) throw httpError(400, 'Enter a valid email address', 'enterValidEmail');
  if (String(password).length < 10) throw httpError(400, 'Use at least 10 characters', 'passwordTooShort');
  if (db.prepare('select 1 from users where email = ?').get(clean)) throw httpError(409, 'An account with that email already exists', 'accountExists');
  ...
```
Note `users.password_hash` is `not null` — `[VERIFIED: server.js:118]` (`password_hash text not null`). JIT-provisioned SSO-only accounts need a random unusable value (e.g. `crypto.randomBytes` hashed like `DUMMY_HASH` at server.js:334) — do NOT relax the column.

### Anti-Patterns to Avoid
- **Linking on any id_token email without the tenant pin:** Entra's email claim is user-mutable and tenant-external for guests. Pin `iss`/`tid` and gate linking on tenant-membership signals (Pitfall 1).
- **Parallel session/challenge code in the OIDC callback:** copy the recipes verbatim (Pattern 3); a hand-rolled variant drifts from revocation, teardown, and throttle contracts.
- **Storing raw `state`/`nonce`/`verifier` in cookies:** store the cookie value's SHA-256 (house style hashes tokens at rest everywhere — `sha256(token)` in every insert above) and compare timing-safe; or put the triple in a short-TTL DB row keyed by cookie hash.
- **Authorization-response open redirect:** the callback route is a fixed server path; never honor a `redirect_uri`/`next` query parameter coming back from the IdP.
- **Refusing to fetch JWKS on unknown kid:** key rotation will rotate the cache out from under you. One refetch on unknown kid, then fail closed (Pitfall 6).

## Don't Hand-Roll

The milestone *mandates* hand-rolling the OIDC client, so "don't hand-roll" inverts here — these are the boundaries of what must NOT be hand-rolled beyond the pinned scope:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT/JWS framework features (JWE, other algs, kid-less chains) | A generic JWT library-in-miniature | The ~40-line RS256 id_token verifier (Pattern 1) scoped to exactly SSO-08's checklist | Scope creep is the failure mode; extra surface = extra fail-open risk |
| Refresh-token / token-lifetime management | Access/refresh token storage and renewal | Consume only the id_token at callback; store nothing of the IdP's tokens | The app's own sessions already own lifetime; IdP tokens are one-shot proof |
| Groups→roles mapping | Claim-driven authorization | Deferred by REQUIREMENTS.md ("Out of Scope") | Needs a real tenant design |
| SCIM / de-provisioning | Any provisioning API | REQUIREMENTS.md: "de-provision = disable the user in Entra, login then fails" | Explicitly out of scope |
| A second 2FA code path for SSO | OIDC-specific TOTP verification | The existing `/api/auth/tfa/login` unchanged | Challenge rows are user-scoped; composition is free |
| SMTP-like protocol reimplementations inside oidc.js | Duplicating mailer.js internals | A separate `oidc.js` module alongside mailer.js | House pattern: one module per protocol |

**Key insight:** the phase's discipline is *narrowness*. The verifier implements the SSO-08 checklist and nothing else; everything downstream of "this id_token is valid for this user" is existing code reused verbatim.

## Runtime State Inventory

Schema-migration phase (additive table), not a rename. Category audit:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None existing (no OIDC state anywhere today — no `oidc` matches in schema or code). New `oidc_identities` rows land additively. | Additive `create table if not exists` + `ensureColumn`-style boot migration; pin in `test/migration.test.mjs` |
| Live service config | None in git; the Entra app registration itself (redirect URI, client secret) is created manually in the Azure portal by the operator — document it in DEPLOY.md/README env block | Docs only |
| OS-registered state | None — verified by schema/code audit (no service registrations in repo) | None |
| Secrets/env vars | New `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_ENABLED`, `OIDC_SSO_ONLY`, `OIDC_DEFAULT_ROLE`, optional `OIDC_SCOPES` — all new names, no renames | Add to the env comment block at top of `server.js` (mailer.js convention, `[VERIFIED: mailer.js:1-33]`) |
| Build artifacts | None — single Node process, no compiled artifacts affected | None |

## Common Pitfalls

### Pitfall 1: Entra `email` semantics vs. SSO-03 "verified email only" (the big one)
**What goes wrong:** SSO-03 says link on verified email only. But Entra id_tokens for managed (in-tenant) users generally do **not** carry `email_verified: true` — Microsoft's docs describe the `email` claim as "isn't guaranteed to be correct and is mutable over time — never use it for authorization" and note it is "included by default if the user is a guest in the tenant" and for managed users "must be requested through this optional claim or, on v2.0 only, with the OpenID scope" `[CITED: learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference]`. A literal `email_verified === true` gate would break linking for the primary case; no gate at all is the account-takeover class REQUIREMENTS.md explicitly excludes ("Auto-linking SSO identities on username or custom claims — verified email only, else account takeover class" `[VERIFIED: REQUIREMENTS.md:114-115]`).
**Why it happens:** "Verified" in Entra means "vouched for by the pinned tenant", not an OIDC-standard claim flag.
**How to avoid:** Adopt a written link policy: because the issuer is **pinned to one tenant** (REQUIREMENTS.md SSO-01 "pinned tenant issuer"), treat the email as tenant-verified only when ALL hold: `iss === https://login.microsoftonline.com/{OIDC_TENANT_ID}/v2.0`, `tid === OIDC_TENANT_ID`, and the account is a tenant member (reject guest shapes — `idp` claim differing from `iss`, or `acct === '1'`). Otherwise: create a separate account or fail the link. `preferred_username` is documented mutable — never link on it `[CITED: learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference]`.
**Warning signs:** Tests with a mock IdP must include a *guest-shaped token* case (different `idp`/`tid`) proving no linking. If the suite has no such row, the policy isn't implemented.
**Planner note:** this policy interpretation deserves a `checkpoint:human-verify`-style confirmation with the user before locking PLAN.md — it is the one place "honest composition" could be read two ways.

### Pitfall 2: Algorithm/claim confusion in hand-rolled JWT verification
**What goes wrong:** Accepting `alg: none` or HS256, verifying signature over the wrong bytes, comparing claims with short-circuit leaks.
**How to avoid:** Hard-require `header.alg === 'RS256'` before anything else; verify over exactly `header.payload` ASCII bytes; every claim check after the signature; timing-safe compares. SSO-08's table must include rows: `alg:none`, HS256-signed, signature from a different key (wrong kid), tampered payload byte, expired, wrong iss, wrong aud, reused nonce, replayed state, wrong PKCE verifier — all must fail closed.
**Warning signs:** Any `||` fallback or optional-chaining in the verify function that could let a missing claim pass.

### Pitfall 3: JWKS cache staleness at rotation
**What goes wrong:** Entra rotates signing keys; a cached JWKS no longer contains the token's `kid` and every login 500s.
**How to avoid:** Cache JWKS with a TTL (e.g. 1–24h) AND trigger exactly one refetch when `kid` is unknown, then fail closed on the second miss. `[CITED: learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover]` documents exactly this lookup→refresh→retry→fail flow.
**Warning signs:** Only-keyed-cache without the unknown-kid refetch.

### Pitfall 4: PKCE/state/nonce storage leaks and replays
**What goes wrong:** Fixed or predictable `state` → CSRF into the callback; reused authorization `code` (Entra codes are single-use) → replay; nonce not bound → token injection.
**How to avoid:** `state` and `nonce` are fresh `crypto.randomBytes` per start; the callback consumes them (delete-on-use); store hashed (Pitfall note in Anti-Patterns); `nonce` is only checked on the id_token from the token endpoint (not the implicit flow — this app has none). Set the transient cookie `HttpOnly; SameSite=Lax; Secure` (in prod) with a short TTL.
**Warning signs:** Any test that replays a callback twice and gets two sessions.

### Pitfall 5: JIT accounts and the `password_hash NOT NULL` + login-after-disable seams
**What goes wrong:** (a) JIT insert fails on `users.password_hash text not null` (`[VERIFIED: server.js:118]`). (b) An SSO-only JIT account later signs in via password with garbage hash — fails closed anyway (good), but the SCIM note in REQUIREMENTS says de-provision = "disable the user in Entra, login then fails" — the app must reject *tokens* whose identity no longer authenticates, which at minimum means: never auto-create from an unverified token and always re-verify fully at every callback.
**How to avoid:** Insert a random scrypt hash (never a known constant) for JIT accounts. Full verification on every callback — no "subject matches last time, skip crypto" shortcut.

### Pitfall 6: SSO-only 404 must cover the whole password family consistently
**What goes wrong:** Hiding `/api/auth/login` but leaving password-revealing surfaces live (forgot-password, challenge second step, signup) creates oracles or broken flows.
**How to avoid:** D-07 scope is the login route; but check family coherence in tests: under `OIDC_SSO_ONLY=true`, `/api/auth/login` → 404; keep `/api/auth/tfa/login` working (SSO users still need it), keep logout/me working. Signup is separately governed by `ALLOW_SIGNUP`. Decide and pin each in the test matrix.
**Warning signs:** A 403 on login (violates D-07's no-oracle rule — it must be 404).

### Pitfall 7: Fetch without timeouts in the token exchange
**What goes wrong:** `fetch` to login.microsoftonline.com hangs the request handler (mailer.js sets `SMTP_TIMEOUT_MS` 15s for the same reason, `[VERIFIED: mailer.js:22-23]`).
**How to avoid:** `AbortSignal.timeout(10_000)` (or equivalent) on the discovery, JWKS, and token-exchange fetches; fail closed to a redirect with a generic error page (agent-discretion surface).

### Pitfall 8: Forgetting the i18n + error-code catalogues
**What goes wrong:** The build gates (`i18n-scan`, `catalogue`, `error-codes` tests) fail because new UI strings (button label, IdP-error page) or new `fail()` codes aren't catalogued EN+FR.
**How to avoid:** Any new user-visible string goes into both `src/locales/en.json` and `fr.json`; new `fail(res, …, code, …)` codes get catalogue entries; run `npm test` gates before committing (existing invariant: full suite green).

### Pitfall 9: Cookie/redirect interactions with the SPA hash router
**What goes wrong:** The callback redirects into the SPA; the SPA's route/`next`-carry logic (there is a `next-carry.test.mjs`) may interact with the `#tfa` pending-2FA screen — an SSO user mid-challenge who refreshes must still land on the 2FA screen, and a session-vs-challenge cookie mixup can log the wrong state.
**How to avoid:** Follow the existing login flow's client behavior exactly: `pending2fa` response shape (`[VERIFIED: server.js:2610]` — `{ pending2fa: true, maskedEmail: maskEmail(row.email) }`) is what `src/pages/auth.js` expects (`s === 'tfaLogin'` branch at line ~103). The OIDC callback (a browser navigation, not an XHR) should redirect to a URL fragment that produces the same client state.

## Code Examples

See Pattern 1 (JWT verify), Pattern 2 (PKCE), Pattern 3 (verbatim session/challenge recipes). One more — the authorization URL shape:

```js
// Source: [CITED: learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow]
// {tenant} is OIDC_TENANT_ID; response_mode=query so the code arrives as query params.
const authUrl = new URL(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`);
authUrl.search = new URLSearchParams({
  client_id: clientId,
  response_type: 'code',
  redirect_uri: redirectUri,            // must exactly match the app registration
  response_mode: 'query',
  scope: 'openid profile email',        // OIDC_SCOPES default
  state,
  nonce,
  code_challenge: challenge,
  code_challenge_method: 'S256',
  prompt: 'select_account',             // agent discretion; avoids silent wrong-account picks
}).toString();
```

Token exchange (confidential client — secret in the POST body):

```js
// Source: [CITED: learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow#request-an-access-token]
const tokenRes = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,   // D-01 confidential client
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }),
  signal: AbortSignal.timeout(10_000),
});
```

**Issuer pinning:** the v2.0 issuer is `https://login.microsoftonline.com/{tenant-id}/v2.0` — `[CITED: learn.microsoft.com/en-us/entra/identity-platform/id-token-claims-reference]` ("If the token was issued by the v2.0 endpoint, the URI ends in `/v2.0`"). The JWKS endpoint follows the same shape: `https://login.microsoftonline.com/{tenant}/discovery/v2.0/keys` — `[CITED: learn.microsoft.com/en-us/entra/identity-platform/access-tokens]` (jwks_uri example quoted in the doc). Recommended: fetch `https://login.microsoftonline.com/{tenant}/v2.0/.well-known/openid-configuration` once, validate `issuer` matches the pinned value, use its `jwks_uri` + `token_endpoint` — or hardcode both (agent discretion per CONTEXT).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| v1.0 Entra endpoint (`/oauth2/authorize`, implicit) | v2.0 endpoint + auth-code + PKCE | Long-standing current | All URLs use `/oauth2/v2.0/`; PKCE "recommended for all application types, both public and confidential clients" `[CITED: v2-oauth2-auth-code-flow]` |
| MSAL library integration | Raw flow (this phase's constraint) | Project decision | Fine for one IdP, one flow; do not grow it toward a general client |
| `email_verified`-based linking | Pinned-tenant email vouching | — | Pitfall 1 policy |

**Deprecated/outdated:**
- Implicit flow (`response_type=id_token`) — never used here.
- `plain` PKCE method — spec-allowed but always send `S256`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `email_verified` is generally absent/false for Entra managed-user id_tokens, so literal claim-gating breaks linking | Pitfall 1 | Planner locks a literal gate → no existing account ever links (SSO-03 fails in practice) |
| A2 | Tenant-member email vouching (pinned iss + tid match + non-guest shape) is an acceptable reading of "verified email" for SSO-03 | Pitfall 1 | Wrong policy could either over-link (guests) or under-link; user should confirm the guest-shape rejection |
| A3 | Entra authorization codes are single-use and may not be replayed | Pitfall 4 | A replay-accepting implementation passes tests but is unsafe (low risk — standard OAuth behavior) |
| A4 | `prompt=select_account` is desirable UX | Code Examples | Minor UX-only |
| A5 | AbortSignal.timeout works on Node 24 global fetch | Pitfall 7 | Falls back to manual AbortController if unavailable (trivial) |

## Open Questions

1. **Link policy for tenant-member emails (Pitfall 1) — confirm with user.**
   - What we know: SSO-03 + REQUIREMENTS exclusions forbid linking on unverified/mutable claims; Entra doesn't emit `email_verified` for managed users.
   - What's unclear: whether "tenant-member email inside the pinned tenant = verified" is the intended reading, and whether guest-shaped tokens should hard-fail or JIT-create separately.
   - Recommendation: confirm at planning; implement pinned-tenant policy + guest rejection; encode both directions in the mock-IdP table.

2. **Auto-accept vs. surface for SSO-07 invites.**
   - What we know: acceptance machinery is reusable (`addMembership` + invite clearing, server.js:4068-4097).
   - What's unclear: auto-accept on JIT vs. surfacing a choice when multiple pending invites exist for the email.
   - Recommendation: auto-accept (single workspace or accept-all is unlikely in practice); surface only if >1 pending workspace invite exists.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything | ✓ | v24.21.0 | — |
| node:crypto (JWK import, RSA-SHA256 verify, timingSafeEqual) | SSO-01/SSO-08 | ✓ | probe-verified this session | — |
| node:sqlite | schema | ✓ | (existing suites use it) | — |
| Outbound HTTPS to login.microsoftonline.com | Real flow at runtime | n/a (runtime) | — | Mock IdP in tests needs none |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (Node v24.21.0), suites in `test/*.test.mjs` |
| Config file | none — script-driven: `"test": "node --test --test-concurrency=2 test/*.test.mjs"` `[VERIFIED: package.json:18]` |
| Quick run command | `node --test test/oidc-sso.test.mjs` |
| Full suite command | `npm test` |

Harness: `test/helpers/server.mjs` spawns a real `server.js` on an ephemeral port with a temp `DATA_DIR` and per-test env overrides — the SSO suite boots the app server with `OIDC_*` env pointing at a **mock IdP**: a `node:http` server created inside the test file that serves a static discovery doc, JWKS (test-generated RSA key), and a token endpoint that mints tokens from a table row. Since the discovery URL is not env-configurable in the locked decisions, the planner should either (a) make the IdP base URL an internal constant overridable for tests (e.g. `OIDC_ISSUER`/authority-derived URL honors an env override used only by tests, in the mailer `SMTP_REJECT_UNAUTHORIZED=false`-for-tests tradition), or (b) route `login.microsoftonline.com` — (a) is the realistic option and needs one env knob; flag it as a planner decision within the agent-discretion surface (it is test infrastructure, not production config).

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SSO-01 | Full auth-code + PKCE happy path against mock IdP | integration | `node --test test/oidc-sso.test.mjs` | ❌ Wave 0 |
| SSO-02 | Unconfigured: no button (config), routes 404 | integration | same | ❌ Wave 0 |
| SSO-03 | Link by pinned-tenant verified email; guest/no-link cases create separate accounts | integration (table rows) | same | ❌ Wave 0 |
| SSO-04 | JIT account with default role from env | integration | same | ❌ Wave 0 |
| SSO-05 | TOTP-enrolled account → pending-2FA after SSO; revocation applies | integration | same | ❌ Wave 0 |
| SSO-06 | SSO-only: login 404, config hides form | integration | same | ❌ Wave 0 |
| SSO-07 | Pending invite reconciled at first SSO login | integration | same | ❌ Wave 0 |
| SSO-08 | Table-driven fail-closed matrix (tampered/kid/iss/aud/exp/state/nonce/PKCE) | integration (table-driven) | same | ❌ Wave 0 |
| — | Additive migration byte-identical second boot | migration | `node --test test/migration.test.mjs` | ✅ exists (extend) |
| — | Zero new dependencies | unit | `node --test test/dependencies.test.mjs` | ✅ exists |
| — | EN+FR catalogue for new strings/verbs | unit | `npm test` gates (i18n-scan, catalogue, error-codes) | ✅ exist |

### Sampling Rate
- **Per task commit:** `node --test test/oidc-sso.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/oidc-sso.test.mjs` — mock IdP + table-driven matrix covering SSO-01..SSO-08
- [ ] Mock-IdP base-URL override knob (planner decision, see note above)
- [ ] `test/migration.test.mjs` — extend with `oidc_identities` snapshot pinning

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | OIDC flow to Entra; password path unchanged; JIT accounts get unusable random password_hash |
| V3 Session Management | yes | Sessions are existing `sessions` rows — hashed tokens, revocation teardown identical |
| V4 Access Control | yes | JIT role from D-04 only (`member|viewer`); never auto-elevated |
| V5 Input Validation | yes | Timing-safe claim comparisons; strict alg allowlist; redirect_uri fixed server-side; body parsing only on POST JSON routes |
| V6 Cryptography | yes | RS256 verify via `node:crypto`; SHA-256 for token hashing at rest; PKCE S256; never hand-roll primitives beyond the verifier glue |
| V7 Error Handling/Logging | yes | `logSecurity` verbs for SSO events (follow existing verbs, e.g. new `sso_login`); generic fail-closed codes, no oracles |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| CSRF on callback | Spoofing | Random `state`, hashed storage, timing-safe compare, single-use consume |
| Authorization-code interception | Spoofing | PKCE S256 — stolen code useless without verifier |
| Token injection (id_token from elsewhere) | Spoofing | `nonce` binding validated at callback |
| Account takeover via mutable email claims | Spoofing/Elevation | Pitfall 1 pinned-tenant link policy; guests never link |
| alg confusion / key substitution | Tampering | `alg === 'RS256'` hard gate; JWKS lookup by `kid` + one-refetch-then-fail |
| SSO-only oracle bypass | Information disclosure | D-07: login → 404, no 403-with-message |
| Existence oracle on unconfigured OIDC | Information disclosure | 404-no-oracle on all OIDC routes when `oidcEnabled` false |
| Replay of callback | Spoofing | State/nonce/code consumed on first use; second use fails |

## Sources

### Primary (HIGH confidence)
- Codebase reads this session: `server.js` (schema 110-239, helpers 2348-2540, login 2540-2660, tfa-login 3100-3219, signup 3411-3448, invites 4030-4122), `mailer.js` (1-60), `src/pages/auth.js` (1-130), `src/core/api.js` (config consumption), `test/helpers/server.mjs`, `test/dependencies.test.mjs`, `package.json`
- Local Node probe: `node:crypto` JWK import + RS256 verify + `timingSafeEqual` on v24.21.0
- `[CITED: learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow]` — authorize/token parameters, PKCE recommendation, state
- `[CITED: learn.microsoft.com/en-us/entra/identity-platform/access-tokens]` — JWKS `jwks_uri` shape, per-key issuer validation pseudo-code
- `[CITED: learn.microsoft.com/en-us/entra/identity-platform/signing-key-rollover]` — kid lookup → refresh → retry → fail flow
- `[CITED: learn.microsoft.com/en-us/entra/identity-platform/optional-claims-reference]` and `[CITED: .../id-token-claims-reference]` — email/preferred_username mutability, guest defaults, iss v2.0 shape

### Secondary (MEDIUM confidence)
- Phase 28/31 planning artifacts (`28-RESEARCH.md` Pitfall 5, `31-VERIFICATION.md`) — internal, consistent with code

### Tertiary (LOW confidence)
- None — no websearch-only claims

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all built-ins, probe-verified on the target machine
- Architecture: HIGH — composition points read verbatim from server.js this session
- Pitfalls: MEDIUM-HIGH — Pitfall 1 rests on doc-cited Entra semantics with one policy interpretation flagged as an assumption (A1/A2)

**Research date:** 2026-11-02
**Valid until:** 2026-12-02 (Entra endpoints are stable; mock-IdP design is self-contained)
