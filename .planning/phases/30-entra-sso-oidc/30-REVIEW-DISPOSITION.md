---
phase: 30
review: 30-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`guestShape` misclassifies federated internal members as guests, blocking legitimate email linking"
  - id: WR-02
    severity: warning
    disposition: open
    title: "JIT account creation and invite auto-accept trust the `email` claim without `email_verified`"
  - id: IN-01
    severity: info
    disposition: open
    title: "`OIDC_ISSUER_OVERRIDE` is usable in production with no guard"
  - id: IN-02
    severity: info
    disposition: open
    title: "`verifyIdToken` accepts no clock skew and ignores `nbf`"
  - id: IN-03
    severity: info
    disposition: open
    title: "SSO-only does not close `/api/auth/signup`, and DEPLOY.md does not say so"
  - id: IN-04
    severity: info
    disposition: open
    title: "Password form flashes before `/api/config` resolves under SSO-only"
  - id: IN-05
    severity: info
    disposition: open
    title: "`/api/auth/oidc/start` accepts requests with no `Origin` header, allowing cross-site top-level navigation (login CSRF)"
  - id: IN-07
    severity: info
    disposition: open
    title: "Returning identities are locked out if the IdP stops sending the `email` claim"
  - id: IN-08
    severity: info
    disposition: open
    title: "The mock IdP never validates the PKCE challenge binding, so the suite never proves verifier↔challenge correspondence"
  - id: IN-09
    severity: info
    disposition: open
    title: "Debug `console.log` left in the happy-path test"
  - id: IN-10
    severity: info
    disposition: open
    title: "`socialBtns()` renders inert Google/Apple SSO buttons on the signup surface independent of server ground truth"
  - id: IN-06
    severity: info
    disposition: open
open: 12
total: 12
recorded: 2026-11-02T15:35:25.797Z
---

# Phase 30: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |
| IN-10 | info | open | - |
| IN-06 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`. Re-running the gate keeps every row it can; a row the current review no longer reports is kept and flagged.