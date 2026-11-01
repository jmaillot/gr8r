---
phase: 31
review: [31-REVIEW.md]
severity: critical
findings:
  critical: 1
  warning: 3
  info: 3
  total: 7
status: issues_found
generated: 2026-11-01T20:40:00Z
---

# Phase 31 Review Disposition

One row per finding from 31-REVIEW.md. Default disposition is `open`.
To triage by hand, set the Decision cell to `fixed`, `skipped`, or `deferred` and add a reason in Source.

| Finding | Severity | Decision | Title | Source |
|---------|----------|----------|-------|--------|
| CR-01 | critical | open | Legacy enroll/enable routes bypass the existing-factor step-up and now stack additional factors (TOTP2-05 regression) | |
| WR-01 | warning | open | TOCTOU on `factorCount` — concurrent removals can strand a user at 0 factors with 2FA enabled | |
| WR-02 | warning | open | Factor-list GET is throttled at 5/15 min but the client fetches it on every settings-tab visit — 429 silently empties the list | |
| WR-03 | warning | open | `factors/enable` double-submit race inserts duplicate factor rows | |
| IN-01 | info | open | Staged-entry key fallback silently verifies an unrelated pending secret | |
| IN-02 | info | open | Hardcoded 30-second period in the client last-used rendering | |
| IN-03 | info | open | Client-side 6-digit pre-validation missing on two of the three new code fields | |

open: 7 of 7
