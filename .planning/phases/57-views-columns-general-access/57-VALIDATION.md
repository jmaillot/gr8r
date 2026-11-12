---
phase: "57"
slug: "views-columns-general-access"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-12"
---

# Phase 57 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (`node --test test/*.test.mjs`), Playwright e2e |
| **Config file** | package.json test scripts (none dedicated) |
| **Quick run command** | `node --test test/views.test.mjs test/catalogue.test.mjs` |
| **Full suite command** | `npm test && npm run lint && node scripts/i18n-scan.mjs && npm run e2e` |
| **Estimated runtime** | ~60 s (unit), ~5 min (full incl. e2e) |

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run `npm test` (full unit suite + build gate)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | VIEW-01 | — | N/A | unit | `node --test test/views.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Planner fills the full map; Wave 0 creates any MISSING test scaffolds.)*

---

## Wave 0 Requirements

- [ ] `test/views.test.mjs` — stubs for VIEW-01/VIEW-02 (view state strip, per-user rows merge)
- [ ] `test/general-access.test.mjs` — stub for VIEW-03 (default visibility resolution)
- [ ] Existing suite: `npm test` covers build gates + i18n scan from Phase 56

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Column visibility choice survives sign-in on a second device | VIEW-01 | Cross-device | Sign in on device A, hide column; sign in on device B; verify column hidden |
| Named saved view applied + deleted from another device | VIEW-02 | Cross-device | Save view on A; apply then delete on B |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
