---
phase: 49
review: 49-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Sweep misses the legacy scalar `p.team` marker — team-derived grants silently lost for pre-Phase-32 documents, no backup taken"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Assignee write-guard blocks admin/owner assignees on private projects — behavior change justified by a factually wrong comment"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`sweepNeeded` short-circuits on an unreadable doc and drops the scope-row check — corrupt-document workspaces never get their scope columns cleared"
  - id: WR-03
    severity: warning
    disposition: open
    title: "A task referencing a dangling `project` id now rejects the entire doc PUT for every assignee"
  - id: IN-01
    severity: info
    disposition: open
    title: "Sweep summary log overstates what happened when every transaction early-returned"
  - id: IN-02
    severity: info
    disposition: open
    title: "`memberCanReadProject` retains its unused `wsId` parameter"
open: 6
total: 6
recorded: 2026-11-07T00:00:00Z
---

# Phase 49: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | open | - |
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
