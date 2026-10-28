---
phase: 18
review: 18-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Raw-English error string bypasses the i18n catalogue"
  - id: WR-02
    severity: warning
    disposition: open
    title: "submitTfaCode collapses every failure mode into `false`"
  - id: WR-03
    severity: warning
    disposition: open
    title: "bodyOf end-boundary regex omits top-level assignments — fragile extraction"
  - id: IN-01
    severity: info
    disposition: open
    title: "WR-01 pin asserts presence and order, not path placement"
  - id: IN-02
    severity: info
    disposition: open
    title: "shell.css scoping fix silently un-hides other `.sub` consumers"
  - id: IN-03
    severity: info
    disposition: open
    title: "maskEmail test helper duplicates the server contract by reimplementation"
  - id: IN-04
    severity: info
    disposition: open
    title: "Auth-bearing doc keys enumerated by hand instead of derived from the strip list"
open: 7
total: 7
recorded: 2026-10-28T09:29:32.385Z
---

# Phase 18: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
