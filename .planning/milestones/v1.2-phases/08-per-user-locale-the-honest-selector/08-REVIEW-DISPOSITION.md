---
phase: 08
review: 08-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Language switch fires twice per selection \u2014 duplicate renders and duplicate PATCH writes; the documented \"only when it differs\" guard does not exist"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`activateLocale` mutates the locale singleton before the catalogue loads; a failed chunk load leaves a half-switched state with an unhandled rejection"
  - id: WR-03
    severity: warning
    disposition: open
    title: "`LOCALE_CODES` on the server is a hand-duplicated copy of the client registry \u2014 drift silently degrades the selector"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Clearing a repeat or estimate logs an activity row with no extra, although the catalogue keys and resolvers for \"(none)\"/\"off\" exist and are now unreachable"
  - id: IN-01
    severity: info
    disposition: open
    title: "Triple-duplicated comment block above the activity classifier"
  - id: IN-02
    severity: info
    disposition: open
    title: "Structured extras echo the raw catalogue key when a stored machine id is unknown"
  - id: IN-03
    severity: info
    disposition: open
    title: "`PATCH /api/auth/me` is unthrottled"
open: 7
total: 7
recorded: 2026-10-24T13:41:52Z
---

# Phase 08: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
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
