---
phase: "28"
slug: "multi-team-membership"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-01"
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in), concurrency 2 |
| **Config file** | none (glob in package.json `test` script) |
| **Quick run command** | `node --test test/membership.test.mjs test/migration.test.mjs` |
| **Full suite command** | `node --test --test-concurrency=2 test/*.test.mjs` |
| **Estimated runtime** | ~seconds (in-process node:test, no external deps) |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/membership.test.mjs test/migration.test.mjs` (or the touched test file)
- **After every plan wave:** Run `node --test --test-concurrency=2 test/*.test.mjs`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (assigned by planner) | — | 1 | TEAM-01 | — | Additive migration: pre-migration backup, byte-identical second boot | integration | `node --test test/migration.test.mjs` | ✅ extend existing | ⬜ pending |
| (assigned by planner) | — | — | TEAM-02 | — | Rosters/autocompletes read team *set*; member on two teams appears on both | integration/unit | `node --test test/membership.test.mjs` | ✅ extend existing | ⬜ pending |
| (assigned by planner) | — | — | TEAM-03 | — | @team fan-out notifies each member once even when in two mentioned teams | unit | `node --test test/membership.test.mjs` | ✅ extend existing | ⬜ pending |
| (assigned by planner) | — | — | TEAM-04 | — | Assignment picker excludes members with no team intersecting project `teams[]` | unit | `node --test test/membership.test.mjs` | ❌ Wave 0 (new assertions) | ⬜ pending |
| (assigned by planner) | — | — | TEAM-05 | — | Membership change survives concurrent doc write from second session | integration | `node --test test/membership.test.mjs` | ❌ Wave 0 (new test, harness in `test/helpers/server.mjs` with `login`, `startServer`, `withDb`) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/team-membership.test.mjs` (or extensions to `membership.test.mjs`) — covers TEAM-02..05
- [ ] Fixture: pre-migration DB with two members sharing a scalar team + one teamless member
- [ ] `test/migration.test.mjs` — pinned byte-identical second-boot assertion (extend existing)

*Otherwise covered: `test/helpers/legacy-fixture.mjs` already builds legacy DBs for migration tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none known at seed time) | — | — | — |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < ~10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
