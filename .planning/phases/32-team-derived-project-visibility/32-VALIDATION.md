---
phase: "32"
slug: "team-derived-project-visibility"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-02"
---

# Phase 32 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` + `node:assert` (built-in, zero deps) |
| **Config file** | none — plain `.mjs` files in `test/` |
| **Quick run command** | `node --test test/scope.test.mjs` (~1.6s) |
| **Full suite command** | `npm test` (803-test baseline) |
| **Estimated runtime** | ~2s quick / ~1min full |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/scope.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 32-01-01 | 01 | 1 | VIS-01 | T-32-01 / — | team-intersect opens private team-linked project; off-team member 404 no-oracle | integration (MATRIX cells) | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 32-01-02 | 01 | 1 | VIS-02 | T-32-02 | scope grant still opens private out-of-team project (D-03); admin exemption survives | regression | `node --test test/scope.test.mjs` | ✅ + ❌ new admin cell | ⬜ pending |
| 32-01-03 | 01 | 1 | VIS-03 | — | guest sees exactly one granted project; team derivation never widens guest reach | integration | `node --test test/scope.test.mjs` | ✅ Phase-29 pins must stay green | ⬜ pending |
| 32-0X-XX | — | — | VIS-04 | T-32-03 | reminder pass + email mirror skip team-hidden projects (shared helper) | integration (MATRIX reminder + fanout cells) | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 32-0X-XX | — | — | VIS-05 | T-32-02 | 404 byte-identical no-oracle across families incl. file-serve side door; empty-teams workspace-wide (JIT fixture) | integration (MATRIX file cross-check) | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 32-0X-XX | — | — | D-06 | — | JIT zero-team account: empty-teams predicate first branch | integration fixture | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |
| 32-0X-XX | — | — | D-08 | — | file side door agrees with doc read (test pin on existing normalizeProjects call) | integration (file family cell) | `node --test test/scope.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky — Task IDs are finalized by the planner; requirement→test mapping above is binding.*

---

## Wave 0 Requirements

- [ ] `test/scope.test.mjs` — extend MATRIX with team-intersect cells (VIS-01, VIS-04, VIS-05, D-06, D-08, new admin cell)
- [ ] Shared fixtures: JIT-shaped zero-team account, team-linked private project, off-team member
- [ ] Framework install: none needed — `node:test` is built-in (zero-deps invariant holds)

---

## Manual-Only Verifications

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
