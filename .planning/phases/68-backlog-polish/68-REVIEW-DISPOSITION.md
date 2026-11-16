# Phase 68: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01: email_outbox claims do not ride the caller's tx on pg (Phase 38 invariant SQLite-only) | critical | open | 68-REVIEW.md |
| WR-01: `queued++` counts INSERT OR IGNORE collisions | warning | open | 68-REVIEW.md |
| WR-02: wall-clock assertion makes e2e outbox test timing-flaky | warning | open | 68-REVIEW.md |
| IN-01: test-route token comparison not constant-time | info | open | 68-REVIEW.md |
| IN-02: dead-rows-purge comment does not match purge implementation | info | open | 68-REVIEW.md |
| IN-03: CSS band parser breaks on comments containing braces | info | open | 68-REVIEW.md |
