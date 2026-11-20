---
phase: 79-governance-surface
generated: 2026-11-20T08:40:00Z
review_status: issues_found
total: 8
open: 0
fixed: 8
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
| CR-01: GET /api/auth/operator/workspaces/:id/members is never implemented — the orphan modal can never resolve | critical | fixed | fix(79): a0e61849 |
| CR-02: Stored XSS — orphan modal title interpolates a raw workspace name into modal HTML | critical | fixed | fix(79): ee9c9397 |
| WR-01: err.memberAlreadyMember toast renders with an unresolved {name} placeholder | warning | fixed | fix(79): 7706e4a0 |
| WR-02: Governance reassign accepts an ARCHIVED destination workspace — members land somewhere they can never enter | warning | fixed | fix(79): 53278ea3 |
| IN-01: Dead client code — A.govReleaseAsk, api.operatorWsReassign, api.operatorWsRelease have no call sites | info | fixed | fix(79): 6bf55c6d |
| IN-02: Stale comment in settings.js still points at the relocated operator card | info | fixed | fix(79): 14674145 |
| IN-03: Workspace search input reuses member-search a11y labels | info | fixed | fix(79): c1f02722 |
| IN-04: Orphan modal offers reassign with zero destination workspaces — generic 404 toast instead of keyed refusal (pre-existing UX nit, server refuses safely) | info | fixed | fix(79): c0b1de50, 61cf9f71 |
