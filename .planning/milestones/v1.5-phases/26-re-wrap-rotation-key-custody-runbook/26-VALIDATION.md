---
phase: "26"
slug: "re-wrap-rotation-key-custody-runbook"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-01"
---

# Phase 26 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in) |
| **Config file** | none — project scripts in package.json |
| **Quick run command** | `node --test test/migration.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/migration.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | KEY-03 | T-26-01 / — | Stale rows re-wrapped to current key, never left plaintext | unit | `node --test test/migration.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Tasks are seeded when plans are created; the planner fills the full map per task.

---

## Wave 0 Requirements

- [ ] `test/migration.test.mjs` — extended with re-wrap rotation cases (planted v1 + stale-v2 envelopes)
- [ ] Existing fixtures cover planted-envelope round-trips

*Existing infrastructure largely covers phase requirements; extend with planted stale-envelope fixtures.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Operator rotation runbook end-to-end | KEY-03 / KEY-04 | Requires real process restart with rotated env var on a deployment | Follow `.planning/phases/26-.../runbook` steps: set MASTER_KEY, reboot, confirm no 2FA re-enrollment needed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
