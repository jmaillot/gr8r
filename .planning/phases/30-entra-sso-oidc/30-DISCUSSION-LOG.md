# Phase 30: Entra SSO (OIDC) - Discussion Log

**Date:** 2026-11-02
**Mode:** default (interactive)

## Areas Discussed

### Env configuration
- Client type: **Secret + PKCE** (confidential client; recommended chosen)
- Activation: **Flag + vars** (`OIDC_ENABLED` + complete var set; recommended)
- Extra vars: **OIDC_SSO_ONLY** chosen; `OIDC_DEFAULT_ROLE` and `OIDC_SCOPES` left
  to agent discretion (default role: member; scopes: openid profile email)

### JIT provisioning
- First-login landing: **Compte nu + onboarding** (bare account → onboarding;
  invitations reconciled per SSO-07). Env-driven auto-join workspace declined.

### SSO-only mode
- Password door: **Caché + 404** (form hidden client-side, `/api/auth/login` 404)
- Existing accounts: **Hash gardé, porte fermée** (password_hash preserved,
  reversible; no local-password fallback)

### UI placement
- Button location: **Login + invitation** surfaces only; signup/onboarding
  unchanged; visibility from server `oidcEnabled` ground truth

## Deferred Ideas
- None — discussion stayed within phase scope.

## Agent Discretion
- Route naming, state/nonce cookie mechanics, JWKS caching, IdP error pages,
  scopes default, identity-table schema (planner decision per Phase 28 RESEARCH
  Pitfall 5)

---

*Phase: 30-entra-sso-oidc*
