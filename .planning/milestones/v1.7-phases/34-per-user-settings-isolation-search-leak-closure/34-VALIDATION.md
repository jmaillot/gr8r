---
phase: "34"
slug: "per-user-settings-isolation-search-leak-closure"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-03"
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in runner, node v24.21.2 — zero new deps) |
| **Config file** | none — existing convention |
| **Quick run command** | `node --test test/scope.test.mjs test/privacy.test.mjs test/hardening.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/scope.test.mjs test/privacy.test.mjs test/hardening.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (seeded by planner) | 01 | 1 | SETTINGS-01 | — | Per-user notif pref rows via single accessor | unit/e2e | `node --test test/scope.test.mjs` | ✅ | ⬜ pending |
| (seeded by planner) | 01 | 1 | SETTINGS-02/03 | — | Additive migration, byte-identical second boot, invoices pinned out | migration pin | `node --test test/hardening.test.mjs` | ✅ | ⬜ pending |
| (seeded by planner) | 02 | 1 | SEARCH-01 | — | referencesHidden blocks includes() matching | unit | `node --test test/privacy.test.mjs` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No new test files required — existing `test/scope.test.mjs`, `test/privacy.test.mjs`, `test/hardening.test.mjs` cover the phase's suites (planner may add SEARCH-01 unit home if extractor route chosen)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | — | — |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
