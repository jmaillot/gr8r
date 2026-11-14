---
phase: "64"
slug: "mobile-tasks-table-suite-green"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (e2e, single main project) |
| **Config file** | project vitest/playwright configs (see RESEARCH.md) |
| **Quick run command** | `npm run e2e -- e2e/<changed-spec>.spec.mjs --workers=1 --retries=0` |
| **Full suite command** | full e2e suite (111/111 target) + `npm run lint` + unit suite + chunk gate + i18n gate |
| **Estimated runtime** | ~minutes (see RESEARCH.md Test Architecture section) |

---

## Sampling Rate

- **After every task commit:** Run the affected e2e spec + `npm run lint` (quick triad: build + chunk + tests per RESEARCH.md)
- **After every plan wave:** Run the full e2e suite and confirm zero failures
- **Before `/gsd-verify-work`:** Full suite must be green (111/111)
- **Max feedback latency:** per-wave, full-suite green required

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 64-01 T1 | 01 | 1 | MOB-01 | — | N/A | e2e | `npm run e2e -- e2e/mobile-tasks-table.spec.mjs --workers=1 --retries=0` (band/boundary tests; spec is created by this task) | ✅ after T1 | ⬜ pending |
| 64-01 T2 | 01 | 1 | MOB-01 | — | N/A | e2e | `npm run e2e -- e2e/french-overflow.spec.mjs e2e/projects-table.spec.mjs e2e/saved-views.spec.mjs --workers=1 --retries=0` (unmodified specs) | ✅ | ⬜ pending |
| 64-02 T1 | 02 | 2 | MOB-02 | — | N/A | e2e | `npm run e2e -- e2e/mobile-tasks-table.spec.mjs --workers=1 --retries=0` (390×844 truncation tests; extends the 64-01 spec) | ✅ | ⬜ pending |
| 64-03 T1 | 03 | 3 | E2E-03 | T-64-04 | N/A | e2e | `npm run e2e` (full parallel close run; evidence → 64-CLOSE.md) | ✅ | ⬜ pending |
| 64-03 T2 | 03 | 3 | E2E-03 | T-64-05 | N/A | unit+gates | `npm test` + `npm run lint` + `npm run build` (prebuild i18n-scan, chunk gate) + `npm run build:en` (EN i18n gate) | ✅ | ⬜ pending |
| 64-03 T3 | 03 | 3 | E2E-03 | T-64-05 | N/A | e2e | `npm run e2e` (re-run after any D-16 fix; skipped if T1-T2 fully green) | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] new mobile-viewport e2e spec — covered by 64-01 Task 1 (creates `e2e/mobile-tasks-table.spec.mjs`, French-overflow precedent); no separate Wave 0 stub needed since the spec is the phase's own deliverable (research: "Wave 0 Gaps — None")
- [x] Existing infrastructure covers all other phase requirements

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (expected: none — all behaviors automated per CONTEXT.md e2e-first ruling) | | | |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < per-wave full-suite budget
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
