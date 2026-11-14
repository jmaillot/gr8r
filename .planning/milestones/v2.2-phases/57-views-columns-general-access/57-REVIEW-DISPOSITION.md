---
phase: 57-views-columns-general-access
reviewed: 2026-11-12
total: 8
open: 0
fixed: 8
skipped: 0
---

# Code Review Disposition — Phase 57

One row per finding. Dispositions: `open` (default), `fixed` (see REVIEW-FIX.md), `skipped` (won't fix — state the reason in Source).

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | View name interpolated through `t()` without HTML escaping (attribute/HTML injection) |
| WR-02 | warning | fixed | `hydrateViews` can install an empty view state object, bypassing `viewOf()` defaults |
| WR-03 | warning | fixed | Live view row has no blob size cap — inconsistent server guardrail |
| WR-04 | warning | fixed | On the pg backend, `migrateUserViews` can never run — legacy views silently discarded without rows |
| IN-01 | info | fixed | Unhandled promise rejection on the views-popover lazy import |
| IN-02 | info | fixed | View whitelist constants duplicated client/server with no drift pin |
| IN-03 | info | fixed | GET /api/me/views mutates storage (read path is also the migration path) |
| IN-04 | info | fixed | Mis-indented `await hydrateViews()` lines |
