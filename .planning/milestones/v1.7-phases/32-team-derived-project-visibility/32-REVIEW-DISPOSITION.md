---
phase: 32
review: 32-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Admin/owner exemption missing from the send-time surfaces — admins silently lose reminders and emails for private projects"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Reminder pass team term can never positively fire — remindable()'s access-list gate blocks team-only reach first"
  - id: IN-01
    severity: info
    disposition: open
    title: "memberCanReadProject's \"keep flowing\" semantics for underivable projects ride a hidden quirk of canSeeProject"
  - id: IN-02
    severity: info
    disposition: open
    title: "Test coverage gaps — no admin-recipient send-time cell, and the positive reminder team path is structurally untestable"
open: 4
total: 4
recorded: 2026-11-02T00:00:00Z
---

# Phase 32: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
