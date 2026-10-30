---
phase: "22"
slug: "operator-session-revocation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-29"
---

# Phase 22 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (node --test) + Playwright (Chromium) |
| **Config file** | e2e/playwright.config.mjs |
| **Quick run command** | `node --test test/operator-revoke.test.mjs` |
| **Full suite command** | `npm test && npx playwright test --config e2e/playwright.config.mjs` |
| **Estimated runtime** | ~30s quick / ~4min full |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/operator-revoke.test.mjs`
- **After every plan wave:** Run `npm test && npx playwright test --config e2e/playwright.config.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds (quick)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 22-01-01 | 01 | 1 | OPREV-01 | T-22-01 / T-22-02 | Operator-only gate; non-operator 403 | unit | `node --test test/operator-revoke.test.mjs` | ❌ W0 | ⬜ pending |
| 22-01-02 | 01 | 1 | OPREV-01 | — | All non-owner target sessions deleted; operator self-sessions survive | unit | `node --test test/operator-revoke.test.mjs` | ❌ W0 | ⬜ pending |
| 22-01-03 | 01 | 1 | OPREV-02 | T-22-03 | Owner immunity: revoke refused, regression-tested | unit | `node --test test/operator-revoke.test.mjs` | ❌ W0 | ⬜ pending |
| 22-02-01 | 02 | 2 | OPREV-01 | — | Revoked browser honest 401 teardown (signedOutElsewhere) | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/operator-revoke-cycle.spec.mjs` | ❌ W0 | ⬜ pending |
| 22-02-02 | 02 | 2 | OPREV-02 | — | Cross-feature lifecycle EN+FR, no v1.3 test weakened | e2e | `npx playwright test --config e2e/playwright.config.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/operator-revoke.test.mjs` — stubs for OPREV-01 / OPREV-02 (two-server pattern, run-unique `X-Forwarded-For`)
- [ ] `e2e/operator-revoke-cycle.spec.mjs` — parametric EN+FR lifecycle spec

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
