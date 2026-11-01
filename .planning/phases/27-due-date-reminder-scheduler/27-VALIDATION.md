---
phase: "27"
slug: "due-date-reminder-scheduler"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-11-01"
---

# Phase 27 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `node:test` (real server + SQLite harness — test/audit-log.test.mjs pattern) |
| **Config file** | none — package.json `test` script |
| **Quick run command** | `node --test test/due-reminders.test.mjs` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `node --test test/due-reminders.test.mjs`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~35 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 27-01-01 | 01 | 1 | REM-01 | T-27-01 | Idle tick writes nothing (revision unchanged); boot catch-up fires missed window once | unit (clock-injectable pass) | `node --test test/due-reminders.test.mjs` | ❌ W0 | ⬜ pending |
| 27-01-02 | 01 | 1 | REM-02 | T-27-02 | day-before & morning-of rows per assignee at 09:00 workspace-local; prefs default ON | unit | `node --test test/due-reminders.test.mjs` | ❌ W0 | ⬜ pending |
| 27-01-03 | 01 | 1 | REM-03 | T-27-03 | Two ticks / simulated restart → exactly one row per (task, assignee, offset, due date); due-date change re-arms | unit | `node --test test/due-reminders.test.mjs` | ❌ W0 | ⬜ pending |
| 27-0X-XX | 0X | X | REM-04 | T-27-04 | done/archived task & archived project → no rows; overdue → exactly one past_due | unit | `node --test test/due-reminders.test.mjs` | ❌ W0 | ⬜ pending |
| 27-0X-XX | 0X | X | REM-05 | T-27-05 | email_reminder=false → no email; true → deep-link URL (APP_URL + /w/:slug/task/:key) in email body | unit | `node --test test/due-reminders.test.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `test/due-reminders.test.mjs` — stubs covering REM-01..REM-05; must expose `runReminderPass({ now, ... })` (or injectable clock) so 09:00-local and DST cases are testable without sleeping
- [ ] Clock injection design: keep the `(tz, Date) → local date parts` helper pure and test it directly for DST dates (e.g. 2026-03-08 US spring-forward, 2026-11-01 fall-back)

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reminder email actually arrives in a real inbox via SMTP | REM-05 | SMTP delivery is environment-dependent; unit tests assert the email is queued/built with correct body | Configure SMTP + APP_URL, set a task due tomorrow, verify both reminder emails arrive with working deep links |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 35s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
