---
phase: "77"
slug: "maintenance-debt"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-19"
---

# Phase 77 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (Node v24.21.0) + @playwright/test ^1.65.1 |
| **Config file** | none for node:test (glob `test/*.test.mjs`); `e2e/playwright.config.mjs` |
| **Quick run command** | `npm test` (per-file: `node --test test/pwa-banner.test.mjs`) |
| **Full suite command** | `npm test` + `npm run lint` + `npm run e2e` (e2e requires fresh `npm run build` first) |
| **Estimated runtime** | ~120 s (npm test); e2e ~60–90 s after build |

---

## Sampling Rate

- **After every task commit:** Run `npm test` (D-77-18: full suite after each commit-group)
- **After every plan wave:** Run `npm test` + `npm run lint`
- **Before `/gsd-verify-work`:** Full suite must be green; `npm run lint` exits 0 (SC1)
- **Max feedback latency:** ~120 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 77-01-* | 01 | 1 | MAINT-01 | — | N/A (lint cleanup) | gate | `npm run lint` | ✅ (gate itself) | ⬜ pending |
| 77-01-* | 01 | 1 | MAINT-01 | — | deletions didn't break behavior | regression | `npm test` | ✅ existing suite | ⬜ pending |
| 77-02-* | 02 | 1 | MAINT-03 | — | N/A (advisory fixes) | unit | `node --test test/pwa-banner.test.mjs` | ✅ (pins added) | ⬜ pending |
| 77-02-* | 02 | 1 | MAINT-03 | — | N/A (test hardening) | unit | `node --test test/sw-contract.test.mjs` | ✅ (pins added) | ⬜ pending |
| 77-03-* | 03 | 1 | MAINT-02 | — | N/A (locale rendering) | e2e | `npm run e2e -- --grep locale-refusal` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `e2e/locale-refusal.spec.mjs` (exact name at executor discretion) — covers MAINT-02
- [ ] No framework install needed — both runners exist
- [ ] Wave-0 dry run: `ALLOW_SIGNUP_DOMAINS=e2e.local npm run e2e` to confirm no sibling-spec breakage (all fixture emails are `@e2e.local` [VERIFIED: 77-RESEARCH.md])

---

## Manual-Only Verifications

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120 s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
