---
phase: 22
review: 22-REVIEW.md
titles: json
findings:
open: 3
total: 4
recorded: 2026-10-29T15:10:00.000Z
---

# Phase 22: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 5a80b21 — warn at boot when stampInstanceAdmin() UPDATE matches no ADMIN_EMAIL user (22-REVIEW-FIX.md, iteration 1) |
| IN-01 | info | open | out of --fix scope (critical_warning); recorded:2026-10-29 |
| IN-02 | info | open | out of --fix scope (critical_warning); recorded:2026-10-29 |
| IN-03 | info | open | out of --fix scope (critical_warning); recorded:2026-10-29 |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently.

Note: hand-reconciled 2026-10-29. The embedded disposition parser matches only `## Critical Issues` / `## Warnings` / `## Info` section headings; this phase's 22-REVIEW.md uses `## Major Issues` / `## Minor Issues`, so the scripted run recorded an empty ledger (0 of 0) and this file was restored from the prior 4-row ledger (b5dab49) plus the 22-REVIEW-FIX.md outcome (WR-01 fixed at 5a80b21).
