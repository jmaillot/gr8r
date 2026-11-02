---
phase: "30"
slug: "entra-sso-oidc"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-02"
---

# Phase 30 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser ↔ Projects Studio | Untrusted client traffic via Traefik reverse proxy; all OIDC endpoints are server-rendered POST/GET on the same origin | Session cookies, OIDC flow cookies (opaque flowKey), form credentials |
| Projects Studio ↔ Microsoft Entra (IdP) | Server-side outbound HTTPS (discovery, JWKS, token exchange); the IdP is the identity authority | Authorization codes, PKCE verifier, id_token (RS256-signed JWT) |
| Entra token ↔ local identity | Claims from the validated id_token drive account linking / JIT / invite reconciliation — gated on `email_verified === true` (T-30-17) | iss/aud/exp/nonce/email/email_verified/tid claims |
| Container ↔ host env | Deployment configuration (docker-compose environment whitelist) | OIDC_*, SMTP_*, MASTER_KEY vars |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-30-01 | Spoofing | /api/auth/oidc/callback state check | high | mitigate | Fresh `crypto.randomBytes` state per start, `sha256` state hash at rest, `timingSafeHex` compare, delete-on-use consume (server.js:2633-2645, 2667-2675) | closed |
| T-30-02 | Spoofing | authorization code interception | high | mitigate | PKCE S256 verifier sent only on the server-side token POST (oidc.js:69-73, 211-225) | closed |
| T-30-03 | Spoofing | id_token injection | high | mitigate | Timing-safe nonce compare with length pre-check before claims are used (oidc.js:120-122) | closed |
| T-30-04 | DoS | discovery/JWKS/token fetches | medium | mitigate | `AbortSignal.timeout(10_000)` on every outbound fetch via `fetchJson`; fail closed to generic error redirect (oidc.js:126-130; server.js:2857-2861) | closed |
| T-30-05 | Information disclosure | unconfigured OIDC routes + partial config | medium | mitigate | 404-no-oracle on both routes, identical generic `notFound` body; readConfig null on any missing var (server.js:2629, 2665; oidc.js:47-55) | closed |
| T-30-SC | Tampering | npm installs | high | mitigate | Zero new packages — no `dependencies` key in package.json; oidc.js imports `node:crypto` only; pinned by test/dependencies.test.mjs | closed |
| T-30-06 | Spoofing/Elevation | email-claim linking | critical | mitigate | Pinned-tenant member vouching: iss pin + tid===tenant + guest-shape rejection; unverified-email tokens fail closed per T-30-17 (server.js:2714-2723) | closed |
| T-30-07 | Tampering | token verification chain | critical | mitigate | Hard `alg==='RS256'` gate, JWKS kid lookup + one refetch then fail, signature over exact `${h}.${p}` bytes, timing-safe claim compares (oidc.js:100-118; server.js:2683-2690) | closed |
| T-30-08 | Elevation | JIT role assignment | high | mitigate | JIT creates bare accounts via 3-arg `createUser(email, name, randomHash)` — no role parameter; D-05 superseded OIDC_DEFAULT_ROLE (grep zero matches) | closed |
| T-30-09 | Spoofing | 2FA bypass via SSO callback | critical | mitigate | Challenge-then-stop branch inserts login_challenges and returns BEFORE the session mint; no session rows pre-TOTP (server.js:2812-2833) | closed |
| T-30-10 | Spoofing | callback replay | medium | mitigate | Flow entry delete-on-use; replay finds no flow; expired-entry check (server.js:2667-2675) | closed |
| T-30-11 | Elevation | invite reconciliation | medium | mitigate | `addMembership` with the invite's stored role verbatim; `expires_at > now()` filter; single-invite auto-accept only, multi → `/#invitations` surface (server.js:2775-2807) | closed |
| T-30-12 | Information disclosure | /api/auth/login under SSO-only | high | mitigate | 404 `notFound` gate on /api/auth/login only; tfa/logout/me carry no ssoOnly gate (server.js:2868) | closed |
| T-30-13 | Information disclosure | unconfigured SSO button | low | mitigate | Button renders only under `api.oidcEnabled` from /api/config; no `OIDC_` env read in src/ (src/pages/auth.js:40-42,63,80) | closed |
| T-30-14 | Information disclosure | callback error surface | medium | mitigate | Single fixed `/login?sso=error` marker for all causes; one generic `ssoError` client string (src/main.js:296-297) | closed |
| T-30-15 | Tampering | DEPLOY.md / .env operator contract | medium | mitigate | OIDC_DEFAULT_ROLE removed from DEPLOY.md and env-doc blocks in the same commit as the code removal; grep gate zero matches | closed |
| T-30-16 | Repudiation | JIT/invite audit trail | low | accept | No provisioning change; `sso_invite_accepted` still logged with invite.role (server.js:2801) | closed |
| T-30-17 | Spoofing | server.js oidc callback identity resolution | high | mitigate | `claims.email_verified === true` (strict, fail closed) required before linking/JIT/invite reconciliation — G-30-1 (server.js:2719-2729; pinned by test/oidc-sso.test.mjs negative fixtures) | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-30-1 | T-30-16 | JIT/invite audit trail — removal of role-substitution changes no provisioning behavior; invite acceptance still logs `sso_invite_accepted` with the invite's stored role. Nothing new to audit. | operator (30-05-PLAN) | 2026-11-02 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-02 | 17 (16 mitigate + 1 accept, + T-30-SC supply-chain row per plan) | 17 | 0 | gsd-security-auditor (ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-02
