---
phase: 30-entra-sso-oidc
reviewed: 2026-11-02T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - DEPLOY.md
  - oidc.js
  - server.js
  - src/core/api.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/main.js
  - src/pages/auth.js
  - test/helpers/server.mjs
  - test/i18n-core-features.test.mjs
  - test/i18n-pages.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/migration.test.mjs
  - test/oidc-sso.test.mjs
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Reviewed the Entra SSO surface end-to-end: the hand-rolled OIDC client (`oidc.js`), the start/callback routes and SSO-only gating in `server.js`, the client-side gating in `src/pages/auth.js` / `src/core/api.js` / `src/main.js`, locales, DEPLOY.md, and the test suites. `node --test test/oidc-sso.test.mjs` was executed: 51/51 pass.

The security core is solid. PKCE S256 uses a properly sized verifier (`oidc.js:74-78`), `verifyIdToken` has a correct fail-closed chain (shape → alg → kid → signature → iss → aud → exp → nonce) with timing-safe nonce comparison, the state compare is a timing-safe hash equality over a server-pinned value (`server.js:2677`), flow state lives in a server-side map keyed by an opaque cookie with delete-on-use replay protection (`server.js:2668-2673`), every failure funnels to one generic redirect (no open-redirect, no oracle), JIT accounts get a random unusable password hash (`server.js:2722`), and the 2FA challenge-then-stop branch is correctly reproduced for SSO logins (`server.js:2809-2819`). Disabled/partial config answers bare 404s and the client only ever renders the SSO button from `/api/config` ground truth (`api.js:24-25,175-176`, `auth.js:40-43`).

No blockers. Two warnings concern the linking policy's `idp`/`acct` heuristics and the absence of an `email_verified` requirement on the JIT/invite-reconciliation path. Everything else is hardening polish.

## Critical Issues

None found.

## Warnings

### WR-01: `guestShape` misclassifies federated internal members as guests, blocking legitimate email linking

**File:** `server.js:2708-2711`
**Issue:** The guest heuristic treats any non-empty `idp` claim that differs from the OIDC issuer string as a guest. In Entra, internal members of a *federated* domain commonly carry `idp: "https://sts.windows.net/<tid>/"` (or similar), which never equals `https://login.microsoftonline.com/<tid>/v2.0`. Those members get `canLink = false`: if their email matches an existing account, sign-in fails closed with a generic error (`server.js:2715`). No security impact (the failure direction is closed), but it is a silent availability bug that will surface exactly for federated tenants and be nearly impossible to diagnose from the user-visible generic error.
**Fix:** Scope the guest test to known MSA/guest identity-provider shapes rather than issuer inequality, e.g.:

```js
const guestShape =
  (typeof claims.idp === 'string' && /^(live\.com|.*guest|urn:facebook|urn:google)/i.test(claims.idp)) ||
  String(claims.acct ?? '') === '1';
```

…or drop the `idp` test entirely and rely on `tid === OIDC_TENANT_ID && acct !== '1'`, which is the documented pinned-tenant policy. Add a test case for a federated member token (`idp: 'https://sts.windows.net/t-1/'`).

### WR-02: JIT account creation and invite auto-accept trust the `email` claim without `email_verified`

**File:** `server.js:2695-2724`, `server.js:2751-2797`
**Issue:** Any authenticated identity that passes the flow (including non-linkable guests, since `canLink` is false but JIT still runs) mints a bare account named after `claims.email` with no `email_verified` check. Concretely: a tenant guest whose `email` claim is attacker-chosen (guests can set an external address) gets an account under that address; combined with SSO-07 invite auto-accept (`server.js:2755-2790`), a pending invitation addressed to that email is silently consumed by the guest — the invite meant for the real mailbox owner. The impact is bounded (the attacker must already authenticate against the pinned tenant, and existing emails fail closed), but an unverified email claim is not an adequate identity for either account naming or invite auto-acceptance.
**Fix:** Require `claims.email_verified === true` before the JIT-create branch and before the SSO-07 invite auto-accept (pinned-tenant member vouching per the SSO-03 policy should still suffice for linking, but guests must not):

```js
const emailVerified = claims.email_verified === true;
if (!subject || !emailOk(email)) return errorRedirect();
if (!row && !canLink && !emailVerified) return errorRedirect();
// and inside SSO-07: only auto-accept when canLink || emailVerified
```

## Info

### IN-01: `OIDC_ISSUER_OVERRIDE` is usable in production with no guard

**File:** `oidc.js:27,57`
**Issue:** Documented as TEST-ONLY but nothing prevents it being set in a production `.env`, redirecting discovery, token and JWKS fetches to an arbitrary base URL. Env-controlled, so equal-trust to `OIDC_CLIENT_SECRET`, but a misconfiguration there yields a silent full-token-issuance surface.
**Fix:** At minimum, refuse the override unless `NODE_ENV !== 'production'` (or gate on a second test flag); log a boot warning when set.

### IN-02: `verifyIdToken` accepts no clock skew and ignores `nbf`

**File:** `oidc.js:123`
**Issue:** `claims.exp <= now` rejects tokens the instant server/IdP clocks diverge by even a second; `nbf` is never checked. Entra tokens are typically issued seconds in the past, so tight clocks on the app host can cause intermittent login failures.
**Fix:** Add a small leeway (e.g. 60s) and a `nbf` check: `if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return { ok:false, reason:'nbf' }`.

### IN-03: SSO-only does not close `/api/auth/signup`

**File:** `server.js:3685-3689`, `src/pages/auth.js:64`
**Issue:** With `OIDC_SSO_ONLY=true` and `ALLOW_SIGNUP=true`, self-service password accounts can still be created (server keeps the door open by design; the login page also still renders the "Sign up" link at `auth.js:64`). This is a documented, tested decision ("signup remains governed by ALLOW_SIGNUP, no new behavior" in `oidc-sso.test.mjs`), but the created accounts' password sign-in door is 404, so the account is only usable via its minted session. If `ALLOW_SIGNUP` is expected to be false in every SSO-only deployment this is moot — worth stating explicitly in DEPLOY.md's SSO-only paragraph.
**Fix:** Either 404 `/api/auth/signup` under `OIDC.ssoOnly` as well, or document in DEPLOY.md §SSO-only that `ALLOW_SIGNUP` must be false for a coherent posture.

### IN-04: Password form flashes before `/api/config` resolves under SSO-only

**File:** `src/core/api.js:25`, `src/pages/auth.js:52-57`
**Issue:** `oidcSsoOnly` defaults to `false`, so the login page renders the full password form until the config request lands, then removes it — a visible flash that also invites a doomed submit. The `auth.js:35-39` comment ("the false defaults keep it hidden") is true for the SSO button but the *opposite* holds for the password form. A stale cached config has the same effect.
**Fix:** Render the auth card after the config resolves, or hide the password form while `api.configLoaded` is false in the OIDC-enabled case.

### IN-05: `/api/auth/oidc/start` accepts requests with no `Origin` header, allowing cross-site top-level navigation (login CSRF)

**File:** `server.js:2631`, `server.js:2390-2395`
**Issue:** `sameOrigin` returns true when `Origin` is absent, so a cross-site top-level GET (which sends no `Origin` in most browsers) can start an OIDC flow in the victim's browser and set the flow cookie. Impact is minimal: completing it still requires authenticating at the real IdP in that browser, and `prompt=select_account` further blunts forced-login CSRF. Noting for completeness.
**Fix (optional):** Bind the flow entry to `clientIp(req)` (or a UA hash) at start and re-check at callback.

### IN-06: `OIDC.defaultRole` is computed but never consumed

**File:** `oidc.js:67`, `server.js:135`
**Issue:** `readConfig` clamps `OIDC_DEFAULT_ROLE` and the disabled object exposes `defaultRole: null`, but neither the JIT-create path nor any route reads `OIDC.defaultRole` — JIT accounts are created with no membership (D-05), relying entirely on SSO-07 invite reconciliation. The comment at `oidc.js:65-66` says it is "consumed by plan 30-02's provisioning", which never materialized. Dead config surface; operators setting `OIDC_DEFAULT_ROLE` will assume it does something.
**Fix:** Either wire it into the SSO-07 fallback (when no invite exists and the account lands in a workspace) or remove it from config and DEPLOY.md, and fix the comment.

---

_Reviewed: 2026-11-02_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
