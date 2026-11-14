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
| (to be filled by planner) | | | MOB-01 | — | N/A | e2e | mobile-viewport spec (`setViewportSize` + `toBeHidden()`) | ❌ W0 | ⬜ pending |
| (to be filled by planner) | | | MOB-02 | — | N/A | e2e | card-stack overflow spec (390×844, bounding boxes) | ❌ W0 | ⬜ pending |
| (to be filled by planner) | | | E2E-03 | — | N/A | e2e | full suite green run | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] new mobile-viewport e2e spec stub (following `french-overflow.spec.mjs` precedent)
- [ ] Existing infrastructure covers all other phase requirements

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
