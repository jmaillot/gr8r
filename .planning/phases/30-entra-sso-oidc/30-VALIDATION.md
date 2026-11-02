---
phase: "30"
slug: "entra-sso-oidc"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (Node v24.21.0), suites in `test/*.test.mjs` |
| **Config file** | none — script-driven (`"test": "node --test --test-concurrency=2 test/*.test.mjs"`) |
| **Quick run command** | `node --test test/oidc-sso.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~seconds per file (harness spawns real `server.js` on ephemeral port) |

Harness: `test/helpers/server.mjs` boots `server.js` with temp `DATA_DIR` + per-test env overrides. The SSO suite runs against a **mock Entra IdP** — a `node:http` server in the test file serving a static discovery doc, JWKS (test-generated RSA key), and a table-driven token endpoint.

---

## Sampling Rate

- **After every task commit:** Run `node --test test/oidc-sso.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | SSO-01 | T-30-* | auth-code + PKCE happy path | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-02 | 01 | 1 | SSO-02 | — | unconfigured → 404 routes, no button | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-03 | 01 | 1 | SSO-03 | T-30-* | link by pinned-tenant verified email; guests never link | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-04 | 01 | 1 | SSO-04 | — | JIT account with env default role | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-05 | 01 | 1 | SSO-05 | T-30-* | SSO → pending-2FA challenge; revocation teardown | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-06 | 01 | 1 | SSO-06 | — | SSO-only: password path hidden/disabled | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-07 | 01 | 1 | SSO-07 | — | pending invite reconciled at first SSO login | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| 30-01-08 | 01 | 1 | SSO-08 | T-30-* | fail-closed matrix (tamper/kid/iss/aud/exp/state/nonce/PKCE) | integration | `node --test test/oidc-sso.test.mjs` | ❌ W0 | ⬜ pending |
| — | — | — | migration | — | additive migration byte-identical second boot | migration | `node --test test/migration.test.mjs` | ✅ | ⬜ pending |
| — | — | — | — | — | zero new dependencies | unit | `node --test test/dependencies.test.mjs` | ✅ | ⬜ pending |
| — | — | — | i18n | — | EN+FR catalogue for new strings/verbs | unit | `npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are provisional — the planner assigns real task IDs; the requirement→command mapping is the contract.)*

---

## Wave 0 Requirements

- [ ] `test/oidc-sso.test.mjs` — new SSO suite with mock IdP, table-driven fail-closed matrix stubs (SSO-01…SSO-08)
- [ ] Mock IdP: `node:http` server serving discovery doc, JWKS, token endpoint
- [ ] Test-only IdP base-URL override knob (planner decision — test infra, not production config)
- [ ] Extend `test/migration.test.mjs` for the additive identity-table migration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real-tenant Entra smoke test | SSO-01 | mock IdP cannot prove real-tenant wiring | Configure real Entra app registration + env vars; sign in once against the real tenant in a staging boot |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
