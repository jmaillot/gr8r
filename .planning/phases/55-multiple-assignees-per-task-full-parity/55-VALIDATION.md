---
phase: "55"
slug: "multiple-assignees-per-task-full-parity"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-10"
---

# Phase 55 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (106 test files) |
| **Config file** | none needed — glob `test/*.test.mjs` |
| **Quick run command** | `node --test test/export-model.test.mjs test/due-reminders.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30–60 seconds (full suite) |

i18n gate: `npm run i18n:scan` (prebuild — must report 0 dead / 0 stale keys after client changes).

---

## Sampling Rate

- **After every task commit:** Run quick run command + `npm run i18n:scan` when locales changed
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 55-01-T1 | 01 | 1 | assignees[] schema + doc migration | T-55-01 | subtask guard: out-of-scope member → 400 `assigneeOutOfScope` | unit | migration test file (Wave 0) | ❌ W0 | ⬜ pending |
| 55-02-T1 | 02 | 1 | guard fan-out to assignees[] (tasks + subtasks) | T-55-01 | multi-member array with one out-of-scope member → 400, subtask variant | unit | guard test file (Wave 0) | ❌ W0 | ⬜ pending |
| 55-03-T1 | 03 | 1 | reminder fan-out per assignee | — | 2 assignees, different TZs, prefs off for one → exactly 1 row each, per-member ledger keys | unit | reminders test file (Wave 0) | ❌ W0 | ⬜ pending |
| 55-04-T1 | 04 | 1 | exports carry all assignees | — | multi-assignee fixtures in export-model/csv/xlsx/mspdi | unit | export test files (existing + W0 additions) | ⚠️ partial W0 | ⬜ pending |
| 55-05-T1 | 05 | 1 | client surfaces + i18n | — | avatar stacks, picker, filters, My-Tasks membership | unit | client-surfaces / i18n suites (Wave 0) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*(Task IDs above are indicative — the planner's final wave/plan numbering binds.)*

---

## Wave 0 Requirements

- [ ] migration test: scalar legacy doc → normalized array (plan 55-01)
- [ ] guard test: multi-member array with one out-of-scope member → 400 `assigneeOutOfScope`, subtask variant (plan 55-02)
- [ ] reminders test: 2 assignees, different TZs, prefs off for one → exactly 1 row each, per-member ledger keys (plan 55-03)
- [ ] export model/writers: multi-assignee fixtures in export-model/csv/xlsx/mspdi tests (plan 55-04)
- [ ] client-surfaces / i18n suites for new keys (plan 55-05)

*Framework install: none needed — `node --test` is built in.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag task into assignee group replaces the array (A3 discretion) | UI parity | interaction semantics not unit-testable with current harness | drag a task onto a member group; confirm assignees = [that member] |
| Subtask assignee picker UX (A4 discretion) | UI parity | visual/interaction | open subtask drawer, multi-select assignees |
| Avatar stack rendering at all ~11 sites (A1) | UI parity | visual layout | visit board/list/table/timeline; confirm stacks + "+N" chip |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
