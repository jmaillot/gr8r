---
phase: 26
review: 26-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Case-sensitivity mismatch silently strands an uppercased V2: envelope (server.js:1241 vs :321)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Rollback silently undone if MASTER_KEY_PREVIOUS is kept after restore (DEPLOY.md)"
  - id: IN-01
    severity: info
    disposition: open
    title: "Backup filename collision between the two sibling passes within the same millisecond (server.js:1322, :1476)"
  - id: IN-02
    severity: info
    disposition: open
    title: "Empty-plaintext success criterion inconsistency between re-wrap and requireTotpSecret (server.js:1496)"
  - id: IN-03
    severity: info
    disposition: open
    title: "Dead v1 branch in the D-K12 nudge (server.js:1456)"
open: 5
total: 5
recorded: 2026-11-01T00:00:00Z
---

# Phase 26: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently.
