---
phase: 48
review: 48-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "sw.js click-URL resolution does not enforce same-origin — the T-48-03 mitigation is ineffective as claimed"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Session prime never re-primes after an SPA workspace switch — unread backlog of the target workspace fires a toast/notification storm"
  - id: IN-01
    severity: info
    disposition: open
    title: "`Notification` constructor fallback drops tag, icon, and data.url — the fallback notification's click is inert"
  - id: IN-02
    severity: info
    disposition: open
    title: "Seen-set truncation (`slice(-200)`) can evict genuinely-unseen ids and re-notify them"
  - id: IN-03
    severity: info
    disposition: open
    title: "Fire-and-forget `notifyNewEvents()` without a `.catch` at the poll dispatch site"
open: 5
total: 5
recorded: 2026-11-07T13:31:58.568Z
---

# Phase 48: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
