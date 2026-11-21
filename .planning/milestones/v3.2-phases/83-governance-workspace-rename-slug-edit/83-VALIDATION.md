---
phase: "83"
slug: "governance-workspace-rename-slug-edit"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-20"
---

# Phase 83 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (node --test) |
| **Config file** | none — built-in runner |
| **Quick run command** | `node --test test/governance-rename.test.mjs test/governance.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/governance-rename.test.mjs test/governance.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 83-01-01 | 01 | 1 | GV-01 | T-83-01 | Operator-scoped rename endpoints; no existence leak | e2e | `node --test test/governance-rename.test.mjs` | ❌ W0 | ⬜ pending |
| 83-01-02 | 01 | 1 | GV-02 | T-83-02 | Slug change 404s old slug, no redirect; confirm required | e2e | `node --test test/governance-rename.test.mjs` | ❌ W0 | ⬜ pending |
| 83-02-01 | 02 | 1 | GV-03 | T-83-03 | Dead-mapping visibility (console + boot log), D-82-6 | e2e | `node --test test/governance-rename.test.mjs` | ❌ W0 | ⬜ pending |
| 83-02-02 | 02 | 1 | GV-01 | T-83-04 | 5-locale keyed refusals (en/fr/nl/de/es) | unit | `node --test test/governance-rename.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/governance-rename.test.mjs` — stubs for GV-01..03, mirroring `test/governance.test.mjs` harness (startServer/withDb/ADMIN from `test/helpers/server.mjs`)

*Framework install: not needed — node:test is built in.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Governance page renders rename UI + dead-mapping warning card | GV-01, GV-03 | Visual/DOM rendering not covered by node:test e2e | Open /governance as operator, edit name/slug, observe warning card with dead mappings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
