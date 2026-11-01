---
phase: 27
review: 27-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Server reminder rows use `ts`; the client contract is `at` + `read` — blank timestamps, broken sort, permanent unread state"
  - id: CR-02
    severity: critical
    disposition: open
    title: "Inbox preview crashes (TypeError) when a reminder's task was deleted"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Internal reminder-pass token compared with `===`, not timing-safe"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Assignee-less tasks with a due date produce `to: null` notification rows and dead ledger claims"
  - id: IN-01
    severity: info
    disposition: open
    title: "Boot catch-up `runReminderPass()` runs without a try/catch"
  - id: IN-02
    severity: info
    disposition: open
    title: "Reminder email byline is a hardcoded English literal"
  - id: IN-03
    severity: info
    disposition: open
    title: "`reminders_sent` ledger grows without bound"
open: 7
total: 7
recorded: 2026-11-01T12:34:10.118Z
---

# Phase 27: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| CR-02 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
