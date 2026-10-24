---
phase: "10"
slug: "browser-coverage-in-both-locales"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | @playwright/test (Chromium) + node:test for unit gates |
| **Config file** | `e2e/playwright.config.mjs` |
| **Quick run command** | `npm run e2e -- --grep "FlowName"` (single describe) |
| **Full suite command** | `npm run e2e` |
| **Estimated runtime** | ~60–120 seconds (browser suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run e2e -- --grep "<tasks' describe>"`
- **After every plan wave:** Run `npm run e2e`
- **Before `/gsd-verify-work`:** Full suite must be green (plus `npm test` for unit gates)
- **Max feedback latency:** 120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | UAT-09 | T-10-01 | N/A | e2e infra + tracer | `npm run build && npm run e2e -- e2e/locale.spec.mjs` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | UAT-06 (criterion-4) | T-10-02 | N/A | e2e | `npm run build && npm run e2e` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 2 | UAT-01 | T-10-04 | N/A | e2e | `npm run build && npm run e2e -- e2e/flows.spec.mjs --grep "onboarding"` | ❌ | ⬜ pending |
| 10-02-02 | 02 | 2 | UAT-02, UAT-03 | T-10-03 | N/A | e2e | `npm run build && npm run e2e -- e2e/flows.spec.mjs --grep "invite"` | ❌ | ⬜ pending |
| 10-02-03 | 02 | 2 | UAT-04 | T-10-04 | N/A | e2e | `npm run build && npm run e2e -- e2e/flows.spec.mjs --grep "share"` | ❌ | ⬜ pending |
| 10-03-01 | 03 | 3 | UAT-05, UAT-06 | T-10-06 | N/A | e2e | `npm run build && npm run e2e -- e2e/flows.spec.mjs --grep "switcher\|removal"` | ❌ | ⬜ pending |
| 10-03-02 | 03 | 3 | UAT-07, UAT-08 | T-10-05 | billing-free invariant pinned | e2e | `npm run build && npm run e2e` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `e2e/helpers/setup.mjs` — promoted `createAccount` fixture helper (D-06 in RESEARCH.md) — plan 10-01 task 1
- [x] Export `inviteToken()` from `e2e/helpers/setup.mjs` for the `/join` fixture — plan 10-01 task 1
- [x] `use: { locale: 'en-US' }` pin in `e2e/playwright.config.mjs` (UAT-09) — lands in Wave 1 (plan 10-01 task 1) so all existing specs stay English-pinned from the first commit

*Existing infrastructure covers the runner itself: `@playwright/test` + `npm run e2e` are installed and green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none — all phase behaviors have automated verification) | | | |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
