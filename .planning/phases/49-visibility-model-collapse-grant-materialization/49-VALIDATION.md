---
phase: "49"
slug: "visibility-model-collapse-grant-materialization"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-07"
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in test runner) |
| **Config file** | package.json (`"test"` script) |
| **Quick run command** | `node --test test/visibility.test.mjs test/migration.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/visibility.test.mjs test/migration.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | MIG-01 | T-49-SC | one-boot migration preserves per-member visibility sets | fixture/integration | `node --test test/migration.test.mjs` | ✅ | ⬜ pending |
| 49-01-02 | 01 | 1 | MIG-02 | T-49-SC | second boot byte-identical no-op | fixture/integration | `node --test test/migration.test.mjs` | ✅ | ⬜ pending |
| 49-01-03 | 01 | 1 | MIG-03 | T-49-SC | scope-column writes dead post-sweep | unit | `node --test test/migration.test.mjs` | ✅ | ⬜ pending |
| 49-02-01 | 02 | 2 | VIS-02 | T-49-SC | private project 404 through every door (doc API, file serve, MCP) | integration | `node --test test/visibility.test.mjs` | ❌ W0 | ⬜ pending |
| 49-02-02 | 02 | 2 | VIS-03 | T-49-SC | send-time consumers agree with UI predicate via memberCanReadProject (parity test) | unit/integration | `node --test test/visibility.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/visibility.test.mjs` — stubs for VIS-02 / VIS-03 (404-matrix actor × project shapes, parity test scaffold)
- [ ] Shared fixtures for per-member × per-project set-equality (team-derived, scope-derived, guest/private shapes, empty-members private project) — extend existing migration.test.mjs fixture helpers or add `test/helpers/visibility-fixtures.mjs`

*Existing migration.test.mjs provides the guarded-migration fixture template; Wave 0 extends rather than installs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real pg second-boot no-op (production pg instance) | MIG-02 | Dev suite covers SQLite; pg parity needs a deployed instance | Boot twice against staging pg, diff normalized project docs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
