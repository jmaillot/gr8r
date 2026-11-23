---
phase: "87"
slug: "scheduler-tasks-run-history-rotation"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-21"
---

# Phase 87 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node --test` (node:test), `--test-concurrency=2` full suite |
| **Config file** | none needed (package.json `test` script) |
| **Quick run command** | `node --test test/backup-cron.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~180 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's touched test file(s) (quick command)
- **After every plan wave:** Run `node --test test/backup-*.test.mjs test/email-outbox.test.mjs test/instance-roles-api.test.mjs`, then full `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~180 seconds (full suite)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| (fill at plan time) | 01 | 1 | BKBCK-03 | — | N/A | unit (pure module) | `node --test test/backup-cron.test.mjs` | ❌ W0 | ⬜ pending |
| (fill at plan time) | 01 | 1 | BKBCK-02 | — | keyed 5-locale refusals + audit on task CRUD | unit + API | `node --test test/backup-tasks-api.test.mjs` | ❌ W0 | ⬜ pending |
| (fill at plan time) | 01/02 | 1 | BKBCK-03 | — | next_run_at persistence, at-most-once catch-up, skip-when-disabled, skipped_overlap, boot stale-row sweep | API + withDb | `node --test test/backup-scheduler.test.mjs` | ❌ W0 | ⬜ pending |
| (fill at plan time) | 01/02 | 1 | BKBCK-03 | — | GFS bucket assign, newest-verified ID exclusion, refuse-to-empty floor, sidecar+archive delete, audited events | API + fs + withDb | `node --test test/backup-rotation.test.mjs` | ❌ W0 | ⬜ pending |
| (fill at plan time) | 02 | 2 | BKBCK-04 | — | history rows (manual+scheduled), GET ≤50, Run now per task, failure-transition + recovery emails | API + outbox | `node --test test/backup-scheduler.test.mjs test/backup-rotation.test.mjs test/email-outbox.test.mjs` | partial ❌ W0 | ⬜ pending |
| (fill at plan time) | 02 | 2 | BKBCK-02/04 | — | client render-only wiring: task form + history card, esc() pins, 5-locale parity | source-assertion | `node --test test/backup-history-client.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Test precedents to copy:** `test/backup-routes.test.mjs` (startServer-per-case harness, `makeBackupOp`, withDb inspection — VERIFIED :1-48) and `test/settings-tz-combobox.test.mjs` (source-assertion style for client wiring — VERIFIED :1-28). Scheduler sweep should accept an injectable clock for catch-up tests.

---

## Wave 0 Requirements

- [ ] `test/backup-cron.test.mjs` — cron evaluator unit matrix (fields, steps, dom/dow OR, DST edge) for BKBCK-03
- [ ] `test/backup-tasks-api.test.mjs` — task CRUD + builder serialization + retention defaults + keyed refusals for BKBCK-02
- [ ] `test/backup-scheduler.test.mjs` — sweep/catch-up/overlap/stale-row-sweep for BKBCK-03
- [ ] `test/backup-rotation.test.mjs` — GFS assignment/exclusion/floor/audit for BKBCK-03
- [ ] `test/backup-history-client.test.mjs` — client source assertions for BKBCK-02/04
- No framework install needed — node:test is the project standard.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Failure email lands in real recipient inboxes | BKBCK-04 | SMTP transport is env-gated in tests | Configure SMTP env in a staging instance, force a task failure, confirm Super Admins + Backup Operators receive exactly one transition email; then recover and confirm the recovery email. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 180s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
