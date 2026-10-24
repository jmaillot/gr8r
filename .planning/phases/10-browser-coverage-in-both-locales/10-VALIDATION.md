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
| 10-01-01 | 01 | 0 | UAT-01..09 | — | N/A | e2e infra | `npm run e2e -- --list` | ❌ W0 | ⬜ pending |
| (planner fills remaining rows from PLAN.md tasks) | | | | | | | | | |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/helpers.mjs` — promoted `createAccount` fixture helper (D-06 in RESEARCH.md)
- [ ] Export `inviteToken()` from `e2e/setup.mjs` for the `/join` fixture
- [ ] `use: { locale: 'en-US' }` pin in `e2e/playwright.config.mjs` (UAT-09) — lands in Wave 0 so all existing specs stay English-pinned from the first commit

*Existing infrastructure covers the runner itself: `@playwright/test` + `npm run e2e` are installed and green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (planner fills from PLAN.md human verify steps, if any) | | | |

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
