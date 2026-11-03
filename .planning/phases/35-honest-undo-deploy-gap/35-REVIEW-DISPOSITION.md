---
phase: 35
review: 35-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "pushNow() wait loop is unbounded polling with no failure exit or user feedback"
  - id: WR-02
    severity: warning
    disposition: open
    title: "the undo gate uses `pushed.ok === false`, which misses an ok-less result shape"
  - id: WR-03
    severity: warning
    disposition: open
    title: "source-scan pins slice to end-of-file, over-scoping their assertions"
  - id: IN-01
    severity: info
    disposition: open
    title: "pushQueued set during pushNow()'s PUT is not drained by pushNow()"
  - id: IN-02
    severity: info
    disposition: open
    title: "the union replay also re-adds pre-delete rows for other teams, overriding mid-window removals"
  - id: IN-03
    severity: info
    disposition: open
    title: "before-map captured unconditionally in local mode where it is unused"
open: 6
total: 6
recorded: 2026-11-03T00:00:00Z
---

# Phase 35: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
