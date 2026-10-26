---
phase: 14
review: 14-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "`refreshSessions()` swallows a 401 — the sessions surface never triggers the D-28 teardown on a dead session"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`createWorkspace` slug race surfaces an unhandled UNIQUE violation as a raw 500, not `slugTaken` 409"
  - id: IN-01
    severity: info
    disposition: open
    title: "`S.ui.sessionsLoaded` is written but never read — dead state flag"
  - id: IN-02
    severity: info
    disposition: open
    title: "Masked operator precedence in the last-seen ternary"
  - id: IN-03
    severity: info
    disposition: open
    title: "Hardcoded English \"then\" in the shortcuts rendering bypasses i18n"
  - id: IN-04
    severity: info
    disposition: open
    title: "`sessions.label` column has no producer or consumer"
  - id: IN-05
    severity: info
    disposition: open
    title: "Revocation failure fallback toast reads `err.sessionExpired` for non-401 failures"
open: 7
total: 7
recorded: 2026-10-26T18:55:43.028Z
---

# Phase 14: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
