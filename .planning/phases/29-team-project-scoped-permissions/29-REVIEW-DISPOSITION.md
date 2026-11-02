---
phase: 29
review: 29-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "Resending a scoped invite silently strips its scope (access broadening)"
  - id: WR-01
    severity: warning
    disposition: open
    title: "`runReminderPass` reads `t.projectId` but tasks store `project` — the scheduler, and the SCOPE-04 guard riding it, never run"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The file-serve scope check runs on the un-normalized stored document — legacy scalar-`team` projects 404 inconsistently"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`copyInviteLink` compares a UI label against an API role — an admin link can be submitted with scope and rejected"
  - id: WR-04
    severity: warning
    disposition: open
    title: "An unparseable stored scope fails open to workspace-wide, silently"
  - id: IN-01
    severity: info
    disposition: open
    title: "Re-accepting an invite coalesces scope — a new invite's scope can never replace an old one"
  - id: IN-02
    severity: info
    disposition: open
    title: "`A.resendInvite` (member re-invite) omits scope by implicit reliance on the coalesce"
  - id: IN-03
    severity: info
    disposition: open
    title: "Scope-building logic is triplicated across the client"
open: 8
total: 8
recorded: 2026-11-02T10:14:12.481Z
---

# Phase 29: Code Review Disposition

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

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
