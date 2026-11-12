---
phase: 57-views-columns-general-access
reviewed: 2026-11-12
total: 8
open: 8
fixed: 0
skipped: 0
---

# Code Review Disposition — Phase 57

One row per finding. Dispositions: `open` (default), `fixed` (see REVIEW-FIX.md), `skipped` (won't fix — state the reason in Source).

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | View name interpolated through `t()` without HTML escaping (attribute/HTML injection) |
| WR-02 | warning | open | `hydrateViews` can install an empty view state object, bypassing `viewOf()` defaults |
| WR-03 | warning | open | Live view row has no blob size cap — inconsistent server guardrail |
| WR-04 | warning | open | On the pg backend, `migrateUserViews` can never run — legacy views silently discarded without rows |
| IN-01 | info | open | Unhandled promise rejection on the views-popover lazy import |
| IN-02 | info | open | View whitelist constants duplicated client/server with no drift pin |
| IN-03 | info | open | GET /api/me/views mutates storage (read path is also the migration path) |
| IN-04 | info | open | Mis-indented `await hydrateViews()` lines |
