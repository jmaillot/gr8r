---
phase: 52-transparency-view-milestone-verification-sweep
review: 52-REVIEW.md
generated: 2026-11-08T19:45:00Z
severity:
  critical: 0
  warning: 3
  info: 2
  total: 5
status:
  open: 2
  fixed: 3
  skipped: 0
---

# Phase 52 — Review Finding Dispositions

One row per finding from `52-REVIEW.md`. Hand-edit the Disposition column to
triage a finding (`open` / `fixed` / `skipped` / `deferred`), with a reason in
the Source cell for anything not `fixed`.

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | Error-path fetch result adopted without the stale-guard re-check (actions.js:2425) |
| WR-02 | warning | fixed | Early return on missing `userId` leaves the panel stuck in the loading state (actions.js:2420) |
| WR-03 | warning | fixed | Stale expansion survives navigation — panel re-shows cached data on return (members.js:71 + render.js:go()) |
| IN-01 | info | open | Unreachable `?? 'member'` fallback masks a funnel/label divergence (server.js) |
| IN-02 | info | open | Duplicate reason-code list on the client |

## Notes

- Advisory ledger — never blocks execution. Defaults to `open` for every
  finding; Fix pass 1: WR-01..03 fixed by gsd-code-fixer (commits 480c063, e1f92a8, a2d5731) — see 52-REVIEW-FIX.md. IN-01/IN-02 remain open (out of --fix scope).
- To apply fixes automatically: `/gsd-code-review 52 --fix`
