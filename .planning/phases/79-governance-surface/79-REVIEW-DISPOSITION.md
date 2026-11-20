---
phase: 79-governance-surface
generated: 2026-11-20T07:57:45Z
review_status: issues_found
total: 7
open: 7
fixed: 0
skipped: 0
severity:
  critical: 2
  warning: 2
  info: 3
---

# Code Review Disposition — Phase 79

One row per finding from 79-REVIEW.md. Edit the Disposition column by hand to
triage (`open` | `fixed` | `skipped` | `deferred`); a reason in the Source cell
is preserved across runs.

| Finding | Severity | Disposition | Source |
|---|---|---|---|
| CR-01: GET /api/auth/operator/workspaces/:id/members is never implemented — the orphan modal can never resolve | critical | open | |
| CR-02: Stored XSS — orphan modal title interpolates a raw workspace name into modal HTML | critical | open | |
| WR-01: err.memberAlreadyMember toast renders with an unresolved {name} placeholder | warning | open | |
| WR-02: Governance reassign accepts an ARCHIVED destination workspace — members land somewhere they can never enter | warning | open | |
| IN-01: Dead client code — A.govReleaseAsk, api.operatorWsReassign, api.operatorWsRelease have no call sites | info | open | |
| IN-02: Stale comment in settings.js still points at the relocated operator card | info | open | |
| IN-03: Workspace search input reuses member-search a11y labels | info | open | |
