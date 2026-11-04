---
phase: 37
review: 37-REVIEW.md
titles: json
findings:
  - id: IN-01
    severity: info
    disposition: open
    title: "GET echoes historical `push_due` from stored rows as an inert extra key"
  - id: WR-01
    severity: warning
    disposition: open
    title: "`addDaysIso` is now dead code in server.js"
  - id: IN-02
    severity: info
    disposition: open
    title: "Key-mapping ternary at the producer duplicates the offset→camelCase mapping logic"
open: 3
total: 3
recorded: 2026-11-04T16:50:00.000Z
---

# Phase 37: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| IN-01 | info | open | - |
| WR-01 | warning | open | - (not in the current review) |
| IN-02 | info | open | - (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
