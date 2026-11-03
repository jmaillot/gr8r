---
phase: "35"
slug: "honest-undo-deploy-gap"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-03"
---

# Phase 35 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test (built-in `node --test`) |
| **Config file** | package.json (`npm test`) |
| **Quick run command** | `node --test test/undo-membership.test.mjs` (per new test file; harness precedent: `node --test test/membership.test.mjs`) |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10–30 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's targeted test file (see Per-Task Verification Map)
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 35-01-01 | 01 | 1 | UNDO-01 | T-35-01 / — | Undo restores only the deleted team's membership rows (union replay, no clobber) | unit/integration | `node --test test/undo-membership.test.mjs` | ❌ W0 | ⬜ pending |
| 35-01-02 | 01 | 1 | UNDO-02 | — | Newer independent team changes to other teams survive undo replay | unit/integration | `node --test test/undo-membership.test.mjs` | ❌ W0 | ⬜ pending |
| 35-02-01 | 02 | 1 | DEPLOY-01 | T-35-03 / T-35-05 | compose forwards `MASTER_KEY_PREVIOUS` via `:-` optional form; boots with and without the var | config test | `node --test test/compose-config.test.mjs` | ❌ W0 | ⬜ pending |
| 35-02-02 | 02 | 1 | DEPLOY-01 | T-35-04 | DEPLOY.md §14 compose rotation walkthrough present (env-only key discipline) | docs grep + regression | `grep -c 'MASTER_KEY_PREVIOUS' DEPLOY.md && node --test test/compose-config.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs are provisional until the planner finalizes the plan structure — planner updates this map if tasks split or merge.)*

---

## Wave 0 Requirements

- [ ] `test/undo-membership.test.mjs` — stubs for UNDO-01 / UNDO-02 (admin-path harness precedents in `test/membership.test.mjs`)
- [ ] `test/compose-config.test.mjs` — stubs for DEPLOY-01 (docker compose config, three required vars set both cases)
- [ ] Framework: none needed — node:test built in

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Roster honesty after undo in a live client (rosters, mention autocompletes, team-derived visibility) | UNDO-01 | Rendered client behavior; automated tests cover the data path | After running undo in a dev workspace, verify team roster and @mention autocomplete show the restored members |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
