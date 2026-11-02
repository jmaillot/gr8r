# Phase 30: Entra SSO (OIDC) - Context

**Gathered:** 2026-11-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A third sign-in path: Microsoft Entra via raw-OIDC authorization-code flow (PKCE,
JWKS RS256) hand-rolled over Node built-ins — zero new packages. Env-gated: when
unconfigured, no sign-in button renders and OIDC routes answer 404. SSO composes
honestly with 2FA (pending-2FA challenge still applies), sessions, and invitations.

</domain>

<decisions>
## Implementation Decisions

### Env configuration (D-SSO-ENV)
- **D-01:** Confidential client — `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`,
  `OIDC_CLIENT_SECRET`, plus PKCE on the authorization-code flow. Standard Entra
  app registration "Web" shape; the secret stays server-side only.
- **D-02:** Activation by explicit flag + complete var set: `OIDC_ENABLED=true` AND
  all three vars present AND non-empty. No implicit activation — partial config
  never half-enables SSO. Server ground truth is an internal `oidcEnabled` flag.
- **D-03:** `OIDC_SSO_ONLY=true` — when set (with SSO enabled), the password sign-in
  path is hidden and disabled (D-05/D-06 below).
- **D-04:** `OIDC_DEFAULT_ROLE=member|viewer` (SSO-04), default `member` — agent
  decided; role applies to JIT-provisioned accounts only.

### JIT provisioning & workspace landing (D-SSO-JIT)
- **D-05:** A first-login SSO user with no pending invitation gets a *bare account*
  and lands on the existing onboarding (create/join a workspace). No env-driven
  auto-join workspace — declined as unnecessary for this deployment.
- **D-06:** Pending invitations for the SSO user's email are reconciled at first
  login — surfaced or accepted, never silently stranded (SSO-07, per requirement).

### SSO-only mode (D-SSO-ONLY)
- **D-07:** When `OIDC_SSO_ONLY=true`: the client hides the password form, and the
  server makes `/api/auth/login` answer **404** — same no-oracle philosophy as the
  unconfigured OIDC routes. Not a 403 with a message.
- **D-08:** Existing accounts keep their `password_hash` intact in the database;
  the door is just closed while the flag is on. Removing the flag restores
  password sign-in — reversible, no data wipe. No local-password fallback
  (it would bypass SSO-06).

### UI placement (D-SSO-UI)
- **D-09:** The "Sign in with Microsoft" button renders on the login page and the
  invitation/join surfaces that already request a sign-in. Signup/onboarding pages
  unchanged — JIT creation happens through the SSO flow itself.
- **D-10:** Button visibility is driven by the server's `oidcEnabled` ground truth
  (SSO-02) — never a client-side env guess.

### the agent's Discretion
- Exact internal route naming (e.g. `/api/auth/oidc/start|callback`), state/nonce
  cookie mechanics, JWT/JWKS caching strategy, error pages on IdP failures,
  `OIDC_SCOPES` default (`openid profile email`), identity-table schema (flagged
  planner decision from Phase 28 — see Phase 28 RESEARCH Pitfall 5).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone & requirements
- `.planning/ROADMAP.md` §Phase 30 — goal, success criteria 1-5, build-order note
- `.planning/REQUIREMENTS.md` SSO-01..SSO-08 — locked requirement text (PKCE, env
  gating, verified-email linking, JIT role, 2FA composition, SSO-only, invitations,
  table-driven mock-IdP test suite)

### Prior-phase constraints
- `.planning/phases/28-multi-team-membership/28-RESEARCH.md` §Pitfall 5 — OIDC
  identity-column schema decision deferred to this phase's planning
- `.planning/phases/28-multi-team-membership/28-CONTEXT.md` — identity tables must
  join `users(id)` independently of `team_members`
- `.planning/phases/31-second-totp-factor/31-VERIFICATION.md` — 2FA composition
  surface this phase must not regress (login second step, challenge teardown)

### Cross-cutting invariants
- `.planning/REQUIREMENTS.md` (milestone invariants) — EN+FR catalogue parity,
  additive byte-identical migrations, green suite, zero new runtime deps

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server.js` login route (`/api/auth/login`, ~line 2582) — D-11 throttle band,
  same-origin guard, D-68 challenge-then-stop pattern for 2FA-enabled accounts:
  SSO callback must reuse the exact challenge issuance for SSO-05
- `server.js` pending-2FA login second step (`/api/auth/tfa/login`, ~line 3115) —
  SSO-authenticated identities must land here when TOTP is enrolled
- `server.js` invite/`logSecurity`/`tooMany`/`sameOrigin` helpers — session
  issuance and audit conventions to follow
- `mailer.js` env-gating pattern (`SMTP_HOST` present → enabled) — the doc
  convention for the new OIDC_* env block at the top of `server.js`

### Established Patterns
- Env-gated features hide client surfaces from server ground truth (`oidcEnabled`
  must behave like `mail: MAILER.enabled` already exposed at ~line 2557)
- Hand-rolled zero-dependency network code (mailer.js speaks raw SMTP) — the OIDC
  client (JWKS fetch, token exchange) follows the same discipline
- 404-no-oracle contract (phase 29) — unconfigured/unauthorized routes answer 404

### Integration Points
- `users` table — verified-email linking (SSO-03) selects on `users.email`
- `sessions` table — SSO sessions are regular session rows; revocation teardown
  (phase D-105/D-107 discipline) applies identically
- `src/pages/auth.js` + login page — button render site gated on `oidcEnabled`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 30-entra-sso-oidc*
*Context gathered: 2026-11-02*
