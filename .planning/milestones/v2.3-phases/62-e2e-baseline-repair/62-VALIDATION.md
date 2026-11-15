---
phase: "62"
slug: "e2e-baseline-repair"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 62 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test unit suite (1524 tests) + @playwright/test 1.64 e2e |
| **Config file** | `e2e/playwright.config.mjs` |
| **Quick run command** | `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs e2e/locale.spec.mjs` |
| **Full suite command** | `npm run e2e` (after `npm run build` — stale-dist guard is fail-closed) |
| **Estimated runtime** | ~60 s quick; ~5 min full suite |

---

## Sampling Rate

- **After every task commit:** Run targeted spec: `npx playwright test --config e2e/playwright.config.mjs <file>` + `npm run lint`
- **After every plan wave:** Run `npm test` + `npm run build` + full `npm run e2e`
- **Before `/gsd-verify-work`:** Full suite must be green (62-03 Task 2 gate)
- **Max feedback latency:** ~60 s per task; ~5 min per wave

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 62-01-01 | 01 | 1 | E2E-01 | T-62-01/T-62-02 | N/A (loopback probe; throwaway keys) | e2e (repro) | `npm run build && npm run e2e` + grep log for ECONNREFUSED | ✅ | ⬜ pending |
| 62-01-02 | 01 | 1 | E2E-01 | T-62-01 | assert-once fail-fast guard, no retry amplification | e2e/unit | `git diff e2e/playwright.config.mjs` empty + `node --eval` import check + `npm run lint` | ✅ | ⬜ pending |
| 62-02-01 | 02 | 2 | E2E-02 | T-62-04 | no weakened assertions; label-from-DOM | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs --grep "<spec>"` | ✅ | ⬜ pending |
| 62-02-02 | 02 | 2 | E2E-02 | T-62-03/T-62-04 | per-account isolation, run-unique clientIp | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs` (7/7) | ✅ | ⬜ pending |
| 62-03-01 | 03 | 3 | E2E-02 | T-62-04 | fallback assertions preserved | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/locale.spec.mjs` | ✅ | ⬜ pending |
| 62-03-02 | 03 | 3 | E2E-01, E2E-02 | T-62-05 | gate evidence verbatim | e2e/gates | `npm run build && npm test && npm run lint && npm run e2e` + grep log | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — no Wave 0 scaffolding (the e2e suite is itself the subject).

---

## Manual-Only Verifications

All phase behaviors have automated verification.

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
