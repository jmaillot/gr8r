---
phase: 51
review: 51-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: open
    title: "permCreate toggle renders for ALL roles with inverted checked-state semantics (label says the opposite of what checked means)"
  - id: WR-01
    severity: warning
    disposition: open
    title: "Share-modal handlers revert and error-toast in local (no-API) mode — `pushNow()` unconditionally returns `{ok:false, status:0}` there"
  - id: WR-02
    severity: warning
    disposition: open
    title: "Create-restriction gate covers only 1 of 7 `A.newProject` entry points"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`A.submitProject` reports success when the push failed for any non-refusal reason"
  - id: IN-01
    severity: info
    disposition: open
    title: "Stale file:line citation in ProjectPermissions.md"
  - id: IN-02
    severity: info
    disposition: open
    title: "permCreate toggle's accessible label is the raw key, not localized copy"
open: 6
total: 6
recorded: 2026-11-08T12:55:04.296Z
---

# Phase 51: Code Review Disposition

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
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
