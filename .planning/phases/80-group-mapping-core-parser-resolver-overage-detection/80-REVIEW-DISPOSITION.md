---
phase: 80
review: 80-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Duplicate pre-check race resolves to a generic 500 instead of the keyed 400"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Async listen callback has no rejection handler — a boot DB error kills the process outside `main().catch`"
  - id: IN-01
    severity: info
    disposition: open
    title: "Save route has no throttle while sibling mutation doors do"
  - id: IN-02
    severity: info
    disposition: open
    title: "Equal-role ties in `resolve()` are row-order dependent"
open: 4
total: 4
recorded: 2026-11-20T12:10:00Z
---

# Phase 80: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently.
