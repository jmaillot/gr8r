---
phase: 25
review: 25-REVIEW.md
titles: json
findings:
  - id: "WR-01"
    severity: "warning"
    disposition: "fixed"
    title: "SQLite LIKE prefilter is ASCII case-insensitive but isEnvelopeVersion is case-sensitive — a V2:-prefixed row is silently skipped by both D-K7 counting and the migration"
  - id: "WR-02"
    severity: "warning"
    disposition: "fixed"
    title: "v1 row sealed with a rotated-away key never converges — every boot writes a new preenvelope backup and re-runs the transaction (unbounded accumulation until Phase 26 re-wrap)"
  - id: "IN-01"
    severity: "info"
    disposition: "open"
    title: "v1 decrypt tolerates trailing junk parts; v2 is strict (pre-existing asymmetry)"
  - id: "IN-02"
    severity: "info"
    disposition: "open"
    title: "encryptTotpSecret silently treats any non-'v2' version argument as v1"
  - id: "IN-03"
    severity: "info"
    disposition: "open"
    title: "Dead fs.tmpdir !== undefined ternaries in three tests"
  - id: "IN-04"
    severity: "info"
    disposition: "open"
    title: "split(':', 1)[0] idiom"
  - id: "IN-05"
    severity: "info"
    disposition: "open"
    title: "Negligible local timing difference between unknown-id and tampered-tag paths (no response oracle)"
open: 5
total: 7
recorded: 2026-10-31T19:30:00Z
---

# Phase 25: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 25-REVIEW-FIX.md |
| WR-02 | warning | fixed | 25-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
