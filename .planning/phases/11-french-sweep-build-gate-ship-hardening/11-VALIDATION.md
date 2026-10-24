---
phase: "11"
slug: "french-sweep-build-gate-ship-hardening"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-24"
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Playwright (e2e) + Node test runner (`node --test`) |
| **Config file** | `playwright.config.*` (existing), `package.json` scripts |
| **Quick run command** | `npm run build && npm run e2e` |
| **Full suite command** | `npm run build && npm run e2e` |
| **Estimated runtime** | ~60–120 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run build && npm run e2e`
- **After every plan wave:** Run full e2e suite (both locales)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~120 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 1 | UAT-10 | — | N/A | e2e | `npm run build && npm run e2e -- e2e/french-overflow.spec.mjs` | ✅ | ⬜ pending |
| 11-01-02 | 01 | 1 | UAT-10 | — | N/A | e2e + parity | `npm run build && npm run e2e -- e2e/french-overflow.spec.mjs && node scripts/fr-parity.mjs` | ✅ | ⬜ pending |
| 11-02-01 | 02 | 1 | UAT-10 | — | N/A | unit | `node --test test/i18n-scan.test.mjs` | ✅ | ⬜ pending |
| 11-02-02 | 02 | 1 | UAT-10 | — | N/A | unit | `node --test test/dependencies.test.mjs` | ✅ | ⬜ pending |
| 11-03-01 | 03 | 1 | UAT-10 | — | N/A | CI job shape | `node -e "…ci.yml token check…"` (see 11-03 Task 1) | ✅ | ⬜ pending |
| 11-03-02 | 03 | 1 | UAT-10 | — | N/A | e2e (demo) | `npm run build && npx playwright test --config e2e/demo.playwright.config.mjs` | ❌ W0 | ⬜ pending |
| 11-04-01 | 04 | 2 | UAT-10 | — | N/A | source assert | `grep -c "Internationalization" README.md && grep -c "design-system" README.md` | ✅ | ⬜ pending |
| 11-04-02 | 04 | 2 | UAT-10 | — | N/A | source assert | `grep -c "docker-build" DEPLOY.md` + package.json/lock diff-empty check | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Reconciled against the final PLAN.md task breakdown, 2026-10-24.)*

---

## Wave 0 Requirements

- [ ] `e2e/` sweep spec file — covers UAT-10 criterion 1 (21-route French sweep + coverage assertion)
- [ ] `test/i18n-scan.test.mjs` — extend with D-09 pin tests (criterion 2)
- [ ] Docker image test — criterion 3 (fr chunk in bundle + image, demo mode French, no runtime deps)

*Existing test infrastructure covers the framework; only the new sweep spec and pin tests are Wave 0 additions.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Documentation accuracy (criterion 4) | UAT-10 | Prose review, not automatable | Read README/release notes; confirm translated/not-translated statement matches reality |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
