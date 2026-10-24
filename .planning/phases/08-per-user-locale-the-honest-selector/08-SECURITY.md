---
phase: "08"
slug: "per-user-locale-the-honest-selector"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-24"
---

# Phase 08 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → PATCH /api/auth/me | an unauthenticated or cross-origin request must not read or write account state | session cookie + `{locale}` body |
| PATCH body → users table | an unvalidated or over-scoped body must not persist arbitrary state | validated locale code |
| legacy docs/blobs → S.prefs | old persisted data must not resurrect a removed field into future saves | legacy `prefs.lang` label |
| browser → navigator.languages | negotiation is client-only state; never transmitted to the server | language preference list |
| env → server bootstrap | ADMIN_EMAIL / ADMIN_PASSWORD are untrusted operator input consumed by ensureAdmin at first boot | credentials |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-8-01 | Tampering | PATCH /api/auth/me (CSRF) | medium | mitigate | `sameOrigin(req)` 403 gate before body read (server.js:1268), mirroring every existing mutating route; asserted by test/locale-account.test.mjs | closed |
| T-8-02 | Tampering | PATCH body (mass assignment) | medium | mitigate | only `body.locale` is read; all other body fields ignored (server.js:1270-1271); test asserts extra fields are not persisted | closed |
| T-8-03 | Tampering | users.locale stored value | medium | mitigate | server-side whitelist `LOCALE_CODES = ['en','fr']` → 400 `unknownLocale` otherwise (server.js:77, 1272) | closed |
| T-8-04 | Elevation of Privilege | PATCH target row | low | mitigate | user id comes from `requireUser`'s session, never the body; UPDATE scoped `where id = user.id` (server.js:1273) | closed |
| T-8-05 | Information Disclosure | language negotiation | low | accept | `negotiate()` is purely client-side — `navigator.languages` is never transmitted to the server; the account PATCH carries only the chosen code | closed |
| T-8-06 | Tampering | migration seed | low | mitigate | seed fires only when account locale is NULL AND the exact legacy French label matches; it calls the already-gated PATCH endpoint with hardcoded `'fr'`; it never touches the workspace row (src/main.js:123-131) | closed |
| T-8-07 | Tampering | IN.langSel handler | low | mitigate | handler sends only `{locale: <registry code>}` to the already-gated endpoint; no document write path is reachable from it (src/actions/actions.js:2206-2217) | closed |
| T-8-08 | Denial of Service | e2e fixtures | low | mitigate | run-unique `X-Forwarded-For` and self-contained throwaway accounts per established e2e discipline (e2e/locale.spec.mjs:61, e2e/helpers/setup.mjs:49) | closed |
| T-08-01 | Repudiation / Misconfiguration | ensureAdmin fallback (server.js:819) | low | accept | `emailOk` stays strict for explicit values; the `admin@example.com` default is a non-routable placeholder per RFC 2606, not a credential; generated-password branch still prints a one-time secret. Residual: an operator who never sets ADMIN_EMAIL owns an account at a non-deliverable address | closed |
| T-8-SC | Tampering | npm installs (08-01) | high | mitigate | Package Legitimacy Audit: N/A — package.json untouched this phase; verified via `git diff` across the phase window | closed |
| T-8-SC | Tampering | npm installs (08-02) | high | mitigate | same — no dependencies added; package.json untouched | closed |
| T-8-SC | Tampering | npm installs (08-03) | high | mitigate | same — no dependencies added; package.json untouched | closed |
| T-08-SC | Tampering | npm installs (08-04) | high | mitigate | same — no dependencies added; package.json untouched | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-08-01 | T-8-05 | Language negotiation is client-only; `navigator.languages` never leaves the browser — nothing to mitigate, recorded for visibility | gsd-security verification run | 2026-10-24 |
| AR-08-02 | T-08-01 | Default admin `admin@example.com` is a non-routable RFC 2606 placeholder; operators who never set ADMIN_EMAIL own an account at an undeliverable address (same as before the fix, but bootable) | gsd-security verification run | 2026-10-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-24 | 13 | 13 | 0 | orchestrator (L1 grep-depth verification, ASVS level 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-24
