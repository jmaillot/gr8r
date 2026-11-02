---
phase: 30
review: 30-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "`MASTER_KEY_PREVIOUS` is never forwarded to the container — the documented key-rotation procedure silently breaks, locking out every 2FA user"
  - id: WR-01
    severity: warning
    disposition: open
    title: "D-12 Dockerfile/allow-list mismatch re-verified on disk — the dependencies suite is still red"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`.env.example` ships `TRUST_PROXY=false`, defeating docker-compose's Traefik-specific `true` default — cookies lack `Secure` on the bundled deployment"
  - id: WR-03
    severity: warning
    disposition: open
    title: "OIDC integration tests run ~9 start-route attempts against one shared server — one test away from the 10-per-15-min throttle"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Email-match lookup in the OIDC callback omits `collate nocase`, inconsistent with the schema and the rest of the auth family"
  - id: IN-01
    severity: info
    disposition: open
    title: "Leftover debug diagnostic in the happy-path test"
  - id: IN-02
    severity: info
    disposition: open
    title: "SSO invite auto-accept clearing is not transactional with the membership insert"
  - id: IN-03
    severity: info
    disposition: open
    title: "SSO-only does not close `/api/auth/signup`, and DEPLOY.md does not say so (not in the current review)"
  - id: IN-04
    severity: info
    disposition: open
    title: "Password form flashes before `/api/config` resolves under SSO-only (not in the current review)"
  - id: IN-05
    severity: info
    disposition: open
    title: "`/api/auth/oidc/start` accepts requests with no `Origin` header, allowing cross-site top-level navigation (login CSRF) (not in the current review)"
  - id: IN-07
    severity: info
    disposition: open
    title: "Returning identities are locked out if the IdP stops sending the `email` claim (not in the current review)"
  - id: IN-08
    severity: info
    disposition: open
    title: "The mock IdP never validates the PKCE challenge binding, so the suite never proves verifier↔challenge correspondence (not in the current review)"
  - id: IN-09
    severity: info
    disposition: open
    title: "Debug `console.log` left in the happy-path test (not in the current review)"
  - id: IN-10
    severity: info
    disposition: open
    title: "`socialBtns()` renders inert Google/Apple SSO buttons on the signup surface independent of server ground truth (not in the current review)"
  - id: IN-06
    severity: info
    disposition: open
    title: "(not in the current review)"
open: 15
total: 15
recorded: 2026-11-02T17:55:00.000Z
---

# Phase 30: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | current review |
| WR-01 | warning | open | current review |
| WR-02 | warning | open | current review |
| WR-03 | warning | open | current review |
| WR-04 | warning | open | current review |
| IN-01 | info | open | current review |
| IN-02 | info | open | current review |
| IN-03 | info | open | - (not in the current review) |
| IN-04 | info | open | - (not in the current review) |
| IN-05 | info | open | - (not in the current review) |
| IN-07 | info | open | - (not in the current review) |
| IN-08 | info | open | - (not in the current review) |
| IN-09 | info | open | - (not in the current review) |
| IN-10 | info | open | - (not in the current review) |
| IN-06 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`. Re-running the gate keeps every row it can; a row the current review no longer reports is kept and flagged.
