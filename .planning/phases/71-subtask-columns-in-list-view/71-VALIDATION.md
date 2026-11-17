---
phase: "71"
slug: "subtask-columns-in-list-view"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-17"
---

# Phase 71 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | node:test suite (`test/*.test.mjs`), e2e Playwright suite |
| **Config file** | package.json scripts (`npm test`) |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm test` + e2e suite + `npm run build` (chunk gate) + `npm run lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run full suite + `npm run build` (chunk ≤500000 bytes) + `npm run lint` (exactly 15 baseline)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 71-01-01 | 01 | 1 | (TBD) | T-71-01 / — | XSS-safe markup via existing esc() helpers in meta cells | unit (renderer) | `npm test` | ✅ extend existing | ⬜ pending |
| 71-01-02 | 01 | 1 | (TBD) | — | N/A | unit (toggleSub contract pin) | `npm test` | ✅ extend existing | ⬜ pending |
| 71-01-03 | 01 | 1 | (TBD) | — | N/A | unit (priority inheritance) | `npm test` | ✅ extend existing | ⬜ pending |
| 71-01-04 | 01 | 1 | (TBD) | — | N/A | unit (inherited-due tooltip + .over) | `npm test` | ✅ extend existing | ⬜ pending |
| 71-01-05 | 01 | 1 | (TBD) | — | N/A | unit (board-popover regression pin) | `npm test` | ✅ extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New unit pins (renderer/columns, toggleSub contract, priority inheritance, inherited-due tooltip, board regression) — extend existing renderer test file; grow-only from 1726 pass / 1739 total
- Existing infrastructure covers framework needs — no install required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Visual column alignment of subrow meta cells under parent grid columns | D-71-1 | Pixel/grid alignment not assertable via DOM markup alone | Open List view with a task having subtasks; verify subrow Status/Assignees/Priority/Due cells land in the same columns as the parent row |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
