---
phase: "75"
slug: "domain-admission-core"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 75 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (bundled, Node 24) + existing helpers/server.mjs harness |
| **Config file** | none needed — house pattern `test/*.test.mjs`, run via `node --test` |
| **Quick run command** | `node --test test/domain-admission.test.mjs` |
| **Full suite command** | `npm test` (all `test/*.test.mjs`, concurrency 2) |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/domain-admission.test.mjs` + `npm run lint`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | 01 | 1 | DOM-01 | T-75-NN | out-of-list email refused at signup; unset = fail-open | integration (harness, env matrix) | `node --test test/domain-admission.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | DOM-02 | T-75-NN | invite create per-email refusal; unset inherits signup list; explicit stands alone; '' → deny-all; MCP door wired | integration | `node --test test/domain-admission.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | DOM-03 | T-75-NN | invite-only domain accepts; self-signup refused (one door, one rule) | integration | `node --test test/domain-admission.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | DOM-04 | T-75-NN | tightened list → pending invite refused at accept, non-consuming, fail-closed | integration (reboot-same-DB harness pattern) | `node --test test/domain-admission.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | DOM-07 | T-75-NN | canonicalization funnel: NFKC, ＠, trailing dot, case, exact Set membership (no endsWith), subdomains not admitted | table-driven unit/integration | `node --test test/domain-admission.test.mjs` | ❌ W0 | ⬜ pending |
| (planner fills) | 01 | 1 | i18n | — | new refusal keys in all 5 catalogues + placeholder parity + err-codes extraction | unit | `npm test` (error-codes + i18n-core-features + catalogue suites) | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/domain-admission.test.mjs` — covers DOM-01..04, DOM-07 (created as first task; the funnel lands with its tests)
- [ ] No framework install needed — node:test + existing harness suffice

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Boot log prints resolved door matrix | DOM-01/02 | human-readable output formatting | start server with `ALLOW_SIGNUP_DOMAINS=a.com`, check stdout line |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
