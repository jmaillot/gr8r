---
phase: 58-full-text-search
reviewed: 2026-11-13T00:00:00Z
status: findings
severity:
  critical: 1
  warning: 1
  info: 4
total: 6
---

# 58-REVIEW-DISPOSITION

Ledger of per-finding dispositions for phase 58 code review (`58-REVIEW.md`, standard depth, 16 files).
Default disposition is `open`; edit by hand to record `deferred`/`skipped` with a reason in the Source column.

| Finding | Title | Disposition | Severity | Source |
|---|---|---|---|---|
| CR-01 | D-07 in-transaction FTS sync is not atomic on pg — doc write escapes the tx (Pitfall 2), and count-only sweep cannot heal the resulting drift | open | critical | code-review 2026-11-13 |
| WR-01 | Palette server merge silently drops results for queries with surrounding whitespace (trimmed-vs-raw mismatch) | open | warning | code-review 2026-11-13 |
| IN-01 | Server search payload entries are not shape-validated client-side | open | info | code-review 2026-11-13 |
| IN-02 | `createDebouncedSearch` can produce an unhandled promise rejection if `run` throws | open | info | code-review 2026-11-13 |
| IN-03 | Misleading "Contentless-safe" comment on a contentful FTS5 table | open | info | code-review 2026-11-13 |
| IN-04 | Route over-fetch can starve visible hits when private hits dominate the top-60 | open | info | code-review 2026-11-13 |

Open: 6 of 6.
