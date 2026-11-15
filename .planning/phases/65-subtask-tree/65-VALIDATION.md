---
phase: "65"
slug: "subtask-tree"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-15"
---

# Phase 65 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node built-in test runner (`node:test`) — per existing project test setup; planner confirms against `package.json` test script |
| **Config file** | planner to confirm from repo (`package.json` test script / test glob) |
| **Quick run command** | `npm test` (scoped to the new tree test files once they exist) |
| **Full suite command** | `npm test` (full suite incl. FTS parity suite) |
| **Estimated runtime** | planner to confirm from current suite timing |

---

## Sampling Rate

- **After every task commit:** Run quick suite (tree/rollup/validation unit tests)
- **After every plan wave:** Run full suite (incl. SQLite+pg FTS parity tests, export round-trips, MCP writeDoc parity)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (planner fills) | — | — | SUB-01..04 | — | depth-cap/cycle rejection at the server funnel | unit/integration | planner fills per task | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Tree helpers test file — tree building, depth cap (5), cycle detection, rollup progress without double-count (SUB-01..03)
- [ ] mergeClientDoc normalization test — `parentId` + subtask id survive the funnel (removal sweeps do not strip them)
- [ ] FTS projection test — subtask titles indexed, SQLite+pg symmetric (follow existing parity skip convention if pg env unavailable)
- [ ] Export tests — MSPDI OutlineLevel depth, xlsx/CSV rows, MCP writeDoc round-trip with `parentId` parity
- [ ] Parent auto-complete cascade test — completing parent completes open descendants

*Planner should map these stubs to the concrete test paths used by the existing suite.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Collapse carets / indent rendering in list/table views | SUB-01 | Visual layout | Expand/collapse in each view at depth 3+ |
| Board card child-count badge + popover checklist | SUB-01 | Visual layout | Badge count matches open subtasks; tap opens checklist |
| Timeline indented subtask bars, date inheritance | SUB-01 | Visual layout | Subtask without dates renders under parent range |
| Localized error messages (EN+FR) for depth-cap/cycle rejection | SUB-02 | Copy review | Trigger rejection; check both locales |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
