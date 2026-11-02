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
  info: 8
  total: 10
status: issues_found
---

# Phase 30: Code Review Report (re-review after gap-closure 30-05)

**Reviewed:** 2026-11-02
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Re-review of the full phase-30 scope (union of 30-01..30-05 SUMMARY key-files) after the
gap-closure plan 30-05 removed the parsed-but-never-consumed `OIDC_DEFAULT_ROLE` /
`defaultRole` surface end-to-end. Verified independently: `grep -rn 'OIDC_DEFAULT_ROLE\|defaultRole'
oidc.js server.js DEPLOY.md test/ src/` returns zero matches; `readConfig` (oidc.js:50-65)
now returns exactly tenantId/clientId/clientSecret/issuer/scopes/ssoOnly; the server.js
callback provisioning path and DEPLOY.md's activation-rule paragraph are otherwise intact.
The prior review's IN-06 (`OIDC.defaultRole` computed but never consumed) is therefore
**resolved** and does not appear below. `node --test test/oidc-sso.test.mjs` was executed
during this review: **43/43 pass** (the 8 clamp rows removed by 30-05, as the summary states).

The security core remains solid on re-read: PKCE S256 with a properly sized verifier
(oidc.js:69-73), the fail-closed `verifyIdToken` chain (shape → alg → kid → signature → iss
→ aud → exp → nonce, oidc.js:88-124) with a timing-safe nonce compare, delete-on-use flow
state keyed by an opaque cookie (server.js:2667-2676), one generic no-oracle error redirect
for every failure branch (server.js:2656-2663, 2841-2845), random scrypt JIT password hashes
(server.js:2721), the SSO-only bare-404 gate placed before sameOrigin (server.js:2848-2855),
and the verbatim D-68 challenge-then-stop branch before any session mint (server.js:2808-2818).
No blockers. Both prior warnings remain open; the info tier carries the surviving prior
items plus three new findings from this pass.

## Critical Issues

None found.

## Warnings

### WR-01: `guestShape` misclassifies federated internal members as guests, blocking legitimate email linking

**File:** `server.js:2707-2710`
**Issue:** The guest heuristic treats any non-empty `idp` claim that differs from the OIDC issuer string as a guest. In Entra, internal members of a *federated* domain commonly carry `idp: "https://sts.windows.net/<tid>/"` (or similar), which never equals `https://login.microsoftonline.com/<tid>/v2.0`. Those members get `canLink = false`: if their email matches an existing account, sign-in fails closed with a generic error (`server.js:2714`). No security impact (the failure direction is closed), but it is a silent availability bug that will surface exactly for federated tenants and be nearly impossible to diagnose from the user-visible generic error.
**Fix:** Scope the guest test to known MSA/guest identity-provider shapes rather than issuer inequality, e.g.:

```js
const guestShape =
  (typeof claims.idp === 'string' && /^(live\.com|.*guest|urn:facebook|urn:google)/i.test(claims.idp)) ||
  String(claims.acct ?? '') === '1';
```

…or drop the `idp` test entirely and rely on `tid === OIDC.config.tenantId && acct !== '1'`, which is the documented pinned-tenant policy. Add a test case for a federated member token (`idp: 'https://sts.windows.net/t-1/'`).

### WR-02: JIT account creation and invite auto-accept trust the `email` claim without `email_verified`

**File:** `server.js:2694-2723`, `server.js:2750-2789`
**Issue:** Any authenticated identity that passes the flow (including non-linkable guests, since `canLink` is false but JIT still runs at `server.js:2721`) mints a bare account named after `claims.email` with no `email_verified` check. Concretely: a tenant guest whose `email` claim is attacker-chosen (guests can set an external address) gets an account under that address; combined with SSO-07 invite auto-accept (`server.js:2754-2789`, gated only on zero memberships + email match), a pending invitation addressed to that email is silently consumed by the guest — the invite meant for the real mailbox owner. The impact is bounded (the attacker must already authenticate against the pinned tenant, and existing emails fail closed at `server.js:2714`), but an unverified email claim is not an adequate identity for either account naming or invite auto-acceptance.
**Fix:** Require `claims.email_verified === true` before the JIT-create branch and before the SSO-07 invite auto-accept (pinned-tenant member vouching per the SSO-03 policy should still suffice for linking, but guests must not):

```js
const emailVerified = claims.email_verified === true;
if (!subject || !emailOk(email)) return errorRedirect();
if (!row && !canLink && !emailVerified) return errorRedirect();
// and inside SSO-07: only auto-accept when canLink || emailVerified
```

## Info

### IN-01: `OIDC_ISSUER_OVERRIDE` is usable in production with no guard

**File:** `oidc.js:25-26,56`
**Issue:** Documented as TEST-ONLY but nothing prevents it being set in a production `.env`, redirecting discovery, token and JWKS fetches to an arbitrary base URL. Env-controlled, so equal-trust to `OIDC_CLIENT_SECRET`, but a misconfiguration there yields a silent full-token-issuance surface. (Still present after 30-05; the removal touched only the DEFAULT_ROLE lines.)
**Fix:** At minimum, refuse the override unless `NODE_ENV !== 'production'` (or gate on a second test flag); log a boot warning when set.

### IN-02: `verifyIdToken` accepts no clock skew and ignores `nbf`

**File:** `oidc.js:118`
**Issue:** `claims.exp <= now` rejects tokens the instant server/IdP clocks diverge by even a second; `nbf` is never checked. Entra tokens are typically issued seconds in the past, so tight clocks on the app host can cause intermittent login failures.
**Fix:** Add a small leeway (e.g. 60s) and a `nbf` check: `if (typeof claims.nbf === 'number' && claims.nbf > now + 60) return { ok:false, reason:'nbf' }`.

### IN-03: SSO-only does not close `/api/auth/signup`, and DEPLOY.md does not say so

**File:** `server.js:2848-2855`, `src/pages/auth.js:64`, `DEPLOY.md:251-255`
**Issue:** With `OIDC_SSO_ONLY=true` and `ALLOW_SIGNUP=true`, self-service password accounts can still be created (the signup door stays open by design; the login page also still renders the "Sign up" link at `auth.js:64` even under SSO-only). The created accounts' password sign-in door is 404, so the account is only usable via its minted session. The SSO-only paragraph in DEPLOY.md (251-255) does not mention this, so an operator cannot discover it.
**Fix:** Either 404 `/api/auth/signup` under `OIDC.ssoOnly` as well, or document in DEPLOY.md §SSO-only that `ALLOW_SIGNUP` must be false for a coherent posture.

### IN-04: Password form flashes before `/api/config` resolves under SSO-only

**File:** `src/core/api.js:24-25`, `src/pages/auth.js:52-63`
**Issue:** `oidcSsoOnly` defaults to `false`, so the login page renders the full password form until the config request lands, then removes it — a visible flash that also invites a doomed submit. The `auth.js:35-39` comment ("the false defaults keep it hidden") is true for the SSO button but the *opposite* holds for the password form. A stale cached config has the same effect.
**Fix:** Render the auth card after the config resolves, or hide the password form while config has not loaded in the OIDC-enabled case.

### IN-05: `/api/auth/oidc/start` accepts requests with no `Origin` header, allowing cross-site top-level navigation (login CSRF)

**File:** `server.js:2630`, `server.js:2389-2394`
**Issue:** `sameOrigin` returns true when `Origin` is absent, so a cross-site top-level GET (which sends no `Origin` in most browsers) can start an OIDC flow in the victim's browser and set the flow cookie. Impact is minimal: completing it still requires authenticating at the real IdP in that browser, and `prompt=select_account` further blunts forced-login CSRF. Noting for completeness.
**Fix (optional):** Bind the flow entry to `clientIp(req)` (or a UA hash) at start and re-check at callback.

### IN-07: Returning identities are locked out if the IdP stops sending the `email` claim

**File:** `server.js:2693-2695`
**Issue:** The `!subject || !emailOk(email)` fail-closed check runs before identity lookup, so an *existing* `(issuer, subject)` identity row (a fully established returning user) is redirected to the generic error if the email claim disappears — e.g. an operator narrows `OIDC_SCOPES` (removing `email`), or the tenant changes claim issuance. The identity row alone is sufficient to resolve the user; the email is only needed for first-time linking/JIT.
**Fix:** Only require a well-formed email when `!row` (no identity yet); for a returning identity, resolve and sign in from the row and skip the email-shaped gate.

### IN-08: The mock IdP never validates the PKCE challenge binding, so the suite never proves verifier↔challenge correspondence

**File:** `test/oidc-sso.test.mjs:83-89`
**Issue:** The mock token endpoint accepts any code_verifier of length ≥ 43 (`(form.get('code_verifier') || '').length >= 43`); it never recomputes S256(verifier) against the `code_challenge` sent on the authorize URL. The "wrong PKCE verifier" matrix row works only because `demandVerifier` forces a mismatch. Consequently the suite cannot detect a regression where `exchangeCode` sent a *valid-format but wrong* verifier (e.g. a fresh verifier instead of `flow.verifier`) — the exact bug class PKCE exists to stop.
**Fix:** In `startMockIdp`, capture the authorize URL's `code_challenge` per flow (the test already reads it in `runFlow`) and assert `base64url(sha256(verifier)) === captured.challenge` in the token endpoint, rejecting otherwise.

### IN-09: Debug `console.log` left in the happy-path test

**File:** `test/oidc-sso.test.mjs:193`
**Issue:** `if (callback.location !== "/") console.log("SERVER OUT:", server.output());` — a leftover debugging print that dumps server output to the test runner on any failure. Harmless on green runs, noisy on red ones, and it papers over the real assertion diagnostics.
**Fix:** Delete the line; `node:test` failure output plus the assertion message already carry the signal.

### IN-10: `socialBtns()` renders inert Google/Apple SSO buttons on the signup surface independent of server ground truth

**File:** `src/pages/auth.js:106`, `src/pages/auth.js:29-32`
**Issue:** The signup branch renders `socialBtns()` (Google/Apple/Microsoft as `data-a="socialAuth"` buttons) whenever `api.enabled` is false. Unlike the Microsoft SSO button — which 30-04 correctly gated strictly on `api.oidcEnabled` per D-10 — these remain static decorative buttons. If `socialAuth` is a prototype-only action this is pre-existing behavior, but it now sits in direct visual contrast to the newly-config-gated `ssoBtn()` on the same surface and can mislead users into thinking Google/Apple SSO exists.
**Fix:** Either remove `socialBtns()` from the signup branch, or gate it on the same server-ground-truth config flags as `ssoBtn()` (and wire `data-a="socialAuth"` to the OIDC start route or drop the action).

---

_Reviewed: 2026-11-02_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
