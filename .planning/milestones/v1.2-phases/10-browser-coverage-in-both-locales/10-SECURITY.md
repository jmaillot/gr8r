---
phase: "10"
slug: "browser-coverage-in-both-locales"
status: verified
threats_open: 0
asvs_level: 1
created: "2026-10-24"
---

# Phase 10 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| test harness → e2e server | fixtures authenticate against a throwaway server (`mkdtemp` DATA_DIR, `SEED_DATA=false`, `ALLOW_SIGNUP=true`) — never a real database | synthetic credentials only |
| browser context → app UI | visibility claims are read from the rendered DOM of the throwaway server, never from API responses | rendered test DOM |
| test assertions → product behavior | the billing-free proof guards a shipped decision: any reappearance of plan/billing surfaces must fail the suite | none (negative assertions) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-10-01 | Information disclosure | e2e fixture accounts | low | mitigate | All fixture accounts are throwaway on the throwaway e2e server (`e2e/server.mjs` — `mkdtemp` DATA_DIR, `SEED_DATA=false`); no real credentials or data introduced | closed |
| T-10-02 | DoS | shared-server throttles | low | mitigate | Run-unique `clientIp(run, tag)` per account (`e2e/helpers/setup.mjs:32`) so the 5/hour/IP signup and invite-accept throttles never cross accounts or runs; wrapper sets `TRUST_PROXY=true` (commit 35798bb) so the per-IP scheme works | closed |
| T-10-03 | Information disclosure | invite tokens in test fixtures | low | mitigate | Tokens belong to throwaway accounts on the throwaway server; used/asserted only within the test run (`e2e/helpers/setup.mjs:87,155,191`), never logged beyond Playwright traces | closed |
| T-10-04 | DoS | throttles across the growing matrix | medium | mitigate | Every account gets a run-unique `clientIp(run, tag)` — tag unique per account, not per flow; the /join visitor context carries its own forwarded-for header | closed |
| T-10-05 | Tampering | billing-free invariant (UAT-07 proof) | medium | mitigate | `e2e/flows.spec.mjs:551` pins the absence of plan/billing UI and the `/plan` 404 in both locales — a future revert of the phase-7 removal (commit 45e3c42) fails the suite | closed |
| T-10-SC | Tampering | npm installs | high | mitigate | No package installs in this phase (RESEARCH.md Package Legitimacy Audit: none); any future install must first pass the package-legitimacy gate at a blocking human checkpoint | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-24 | 6 | 6 | 0 | GLM (orchestrator, L1 grep verification) |

Verification evidence (L1 grep depth, ASVS level 1 — sufficient since `threats_open: 0` and register authored at plan time):
- T-10-01/03: `e2e/server.mjs` — `mkdtempSync`, `SEED_DATA: 'false'`, `ALLOW_SIGNUP: 'true'`, DB_PATH forced to throwaway dir.
- T-10-02/04: `e2e/helpers/setup.mjs` `clientIp(run, tag)` exported and used per-account in `createAccount` and flow clients; `TRUST_PROXY: 'true'` in wrapper.
- T-10-05: `e2e/flows.spec.mjs` UAT-07 describe asserts no plan/billing group and `/plan` 404 in en and fr.
- T-10-SC: phase diffs contain no dependency changes to `package.json` from this phase's work.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-24
