---
phase: "29"
slug: "team-project-scoped-permissions"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 29 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), concurrency 2 |
| **Config file** | none (glob in package.json `test` script) |
| **Quick run command** | `node --test test/scope.test.mjs test/membership.test.mjs test/migration.test.mjs` |
| **Full suite command** | `node --test --test-concurrency=2 test/*.test.mjs` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/scope.test.mjs` (or the touched test file)
- **After every plan wave:** Run `node --test --test-concurrency=2 test/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 29-01-01 | 01 | 1 | SCOPE-01 | — | Scope CRUD via API; D-04 forced-null on admin; workspace-wide default | integration | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 29-01-02 | 01 | 1 | (migration) | — | Scope column additive, byte-identical second boot | integration | `node --test test/migration.test.mjs` | ✅ extend | ⬜ pending |
| 29-02-01 | 02 | 2 | SCOPE-02 | T-29-* | Read redaction + write reservation for out-of-scope; D-03 grant truth table | integration | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 29-02-02 | 02 | 2 | SCOPE-03 | T-29-* | 404-matrix per family; unknown==out-of-scope byte-identical | integration | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 29-03-01 | 03 | 3 | SCOPE-04 | T-29-* | Assign/mention/reminder targeting skips out-of-scope members | unit + integration | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 29-03-02 | 03 | 3 | SCOPE-05 | T-29-* | Invite carries scope; acceptance lands it | integration | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 29-03-03 | 03 | 3 | SCOPE-06 | T-29-* | Guest sees exactly one project; private-project guest grant | integration | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs are provisional — the planner's final task numbering governs.)*

---

## Wave 0 Requirements

- [ ] `test/scope.test.mjs` — the 404-matrix harness + scope-predicate unit tests (SCOPE-01..06)
- [ ] Fixture: workspace with 2 public + 2 private projects, 2 teams, one scoped viewer, one guest, one admin — reuse `test/helpers/server.mjs` (`login`, `startServer`, `withDb`) and `test/helpers/legacy-fixture.mjs` patterns
- [ ] Extension to `test/migration.test.mjs` for the scope column pin

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none expected) | — | — | — |

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
