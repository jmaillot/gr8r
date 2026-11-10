---
phase: "50"
slug: "invite-hierarchy-per-project-toggles-server"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-08"
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in Node test runner) |
| **Config file** | package.json (`npm test`) |
| **Quick run command** | `node --test --test-concurrency=2 test/invite-revision.test.mjs test/visibility-migration.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test --test-concurrency=2 test/invite-revision.test.mjs test/visibility-migration.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 50-01-01 | 01 | 1 | INV-01 | T-50-01 / — | Only an owner can grant the owner role (invite create, role edit, invite accept) | unit/integration | `node --test test/hierarchy.test.mjs` | ❌ W0 | ⬜ pending |
| 50-01-02 | 01 | 1 | INV-02 | T-50-02 / — | Role/scope/status edits enforced on next request without re-login | unit/integration | `node --test test/membership.test.mjs` | ✅ | ⬜ pending |
| 50-01-03 | 01 | 1 | VIS-04 | T-50-03 / — | Member guest invite refused when per-project toggle off; admin/owner succeeds | unit/integration | `node --test test/invite-toggle.test.mjs` | ❌ W0 | ⬜ pending |
| 50-01-04 | 01 | 1 | INV-03 | T-50-04 / — | Multi-project guest membership accepted; "exactly one project" refusal gone | unit/integration | `node --test test/scope.test.mjs` | ✅ | ⬜ pending |
| 50-02-01 | 02 | 2 | INV-03 (D-50-5) | T-50-05 / — | Live team links: join gains access, leave loses it; sweep retirement does not erase team grants | unit/integration | `node --test test/visibility-migration.test.mjs test/visibility-team.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Wave-0 test files marked ❌ W0 are stubs to be created by Wave 0 of execution; command names follow the planner's final plan output and may be adjusted when PLAN.md files are written.)*

---

## Wave 0 Requirements

- [ ] `test/hierarchy.test.mjs` — stubs for INV-01 (three hierarchy refusal points)
- [ ] `test/invite-toggle.test.mjs` — stubs for VIS-04 (per-project guest-invite toggle)
- [ ] `test/visibility-team.test.mjs` — stubs for D-50-5 (live team link grant/revocation)

*Existing infrastructure (node:test, existing suites in `test/`) covers the shared fixture needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reverse-sweep provenance recovery from pre-sweep backup | INV-03 (D-50-5) | Recovery path depends on human checkpoint decision (backup-based vs conservative fallback) | 1. Trigger sweep on a copy of `data/` 2. Restore backup 3. Verify team-derived grants re-materialize |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
