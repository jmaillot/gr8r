---
phase: "85"
slug: "roles-foundation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 85 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Per project test infra (see RESEARCH.md / CLAUDE.md — the gr8r test setup used by prior phases) |
| **Config file** | none — Wave 0 confirms |
| **Quick run command** | Per prior-phase verify commands (planner: copy from proven prior plans) |
| **Full suite command** | Per prior-phase verify commands |
| **Estimated runtime** | ~30 seconds |

*The planner MUST fill the exact commands from the nearest prior phase's proven `<automated>` verify commands before execution.*

---

## Sampling Rate

- **After every task commit:** Run quick run command
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 85-01-01 | 01 | 1 | BKROLE-01 | T-85-* | role grant/revoke gated + audited | unit/integration | (planner fills) | ❌ W0 | ⬜ pending |
| 85-01-02 | 01 | 1 | BKROLE-02 | T-85-* | keyed localized refusal for restore on task-edit | integration | (planner fills) | ❌ W0 | ⬜ pending |
| 85-01-03 | 01 | 1 | BKROLE-03 | T-85-* | Super-Admin implicit membership, not demotable | unit/integration | (planner fills) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Pin-test stubs for BKROLE-01..03 (existence oracle + refusal funnel checks per the v3.2 groups.js template discipline)
- [ ] Shared fixtures (test user without roles; Super Admin; grant/revoke helper)
- [ ] Framework install — if no framework detected

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Grantee sees exactly the surfaces their role entitles them to, surfaces removed on next load after revoke | BKROLE-01 | Visual/navigation behavior in browser | Grant role → log in as grantee → confirm Backup surface visible; revoke → reload → confirm gone |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
