---
phase: 40-digest-subject-task-lines
reviewed: 2026-11-05
status: issues_found
open: 5
total: 5
---

# Phase 40 — Review Disposition

One row per finding from [40-REVIEW.md](./40-REVIEW.md). Disposition is `open` by default;
edit this file to record a decision (`fixed` / `skipped` / `deferred`) with a reason.

| Finding ID | Severity | Disposition | Reason | Source |
|------------|----------|-------------|--------|--------|
| WR-01 | warning | open | Untruncated Subject lines via `buildNotifMessage`/`buildInviteMessage` fast path (deliverability risk, no injection) | review 2026-11-05 |
| WR-02 | warning | open | `truncate()` can split a surrogate pair at the 64/80 boundary (cosmetic mojibake in Subject) | review 2026-11-05 |
| IN-01 | info | open | console.error debug artifact in hostile tracer test | review 2026-11-05 |
| IN-02 | info | open | `buildInviteMessage` body assembly idiom differs from sibling builders (pre-existing) | review 2026-11-05 |
| IN-03 | info | open | fakeSmtp/decode/waitFor harness duplicated across two test files | review 2026-11-05 |
