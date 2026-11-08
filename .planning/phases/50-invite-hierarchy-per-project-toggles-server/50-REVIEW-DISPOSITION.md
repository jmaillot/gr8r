---
phase: 50
review: 50-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "restoreTeamLinks deletes genuine p.members entries added after the Phase 49 sweep"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Accepting a project-scoped guest invite as an existing workspace member grants nothing"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Admin invite path silently discards the `project` parameter it accepts"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Reminder pass uses the retired two-term predicate — team-granted assignees get no reminders"
  - id: WR-04
    severity: warning
    disposition: open
    title: "DELETE project-member route mutates the document as a side effect (ensureMember in a removal path)"
  - id: IN-01
    severity: info
    disposition: open
    title: "restoreTeamLinks reads only the newest pre-sweep snapshot"
  - id: IN-02
    severity: info
    disposition: open
    title: "Stale comment above the new project-scoped insert"
  - id: IN-03
    severity: info
    disposition: open
    title: "Candidate scan can re-run on every boot with no marker written"
  - id: IN-04
    severity: info
    disposition: open
    title: "Doc `file:line` references drifted after the server.js refactor"
open: 9
total: 9
recorded: 2026-11-08T09:21:42.141Z
---

# Phase 50: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
