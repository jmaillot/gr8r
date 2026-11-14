---
phase: "63"
slug: "view-02-de-flake"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-14"
---

# Phase 63 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (unit) + @playwright/test 1.64.1 (e2e) |
| **Config file** | `e2e/playwright.config.mjs` |
| **Quick run command** | `npm run e2e -- e2e/saved-views.spec.mjs --workers=1 --retries=0` |
| **Full suite command** | `npm run e2e` (D-02 gate); `npm test` (unit) |
| **Estimated runtime** | ~30 seconds (quick run); ~2–4 minutes (full suite + 10× repeat) |

---

## Sampling Rate

- **After every task commit:** Run `npm run e2e -- e2e/saved-views.spec.mjs --workers=1 --retries=0`
- **After every plan wave:** Run `npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 --trace on`
- **Before `/gsd-verify-work`:** Full suite must be green (D-01 10× + D-02 full suite + `npm test` + lint)
- **Max feedback latency:** 300 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 63-01-01 | 01 | 1 | FLAKY-01 | — | N/A | triage artifact | `npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 --trace on` | ❌ W0 (`63-TRIAGE.md`) | ⬜ pending |
| 63-02-01 | 02 | 2 | FLAKY-02 | — | N/A | e2e | `npm run e2e -- e2e/saved-views.spec.mjs --workers=1 --retries=0` | ✅ spec exists | ⬜ pending |
| 63-03-01 | 03 | 3 | FLAKY-02 | — | N/A | e2e | `npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0` | ✅ spec exists | ⬜ pending |
| 63-04-01 | 04 | 4 | FLAKY-01, FLAKY-02 | — | N/A | gate | `npm run e2e && npm test && npm run lint` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are provisional; planner's final plan/task numbering takes precedence.)*

---

## Wave 0 Requirements

- [ ] `.planning/phases/63-view-02-de-flake/63-TRIAGE.md` skeleton (hypothesis × evidence table)

*No code infrastructure gaps — spec, helpers, and config all exist.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| — | — | All phase behaviors have automated verification. | — |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 300s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
