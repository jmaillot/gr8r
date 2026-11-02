---
phase: 28-multi-team-membership
review: 28-REVIEW.md
reviewed_at: 2026-11-01
total_findings: 9
severity_counts:
  critical: 0
  warning: 4
  info: 5
---

# Phase 28 — Review Disposition

One row per finding from 28-REVIEW.md. Default disposition is `open`; a finding is `triaged` only once explicitly acted on.

| # | Severity | Finding | Location | Disposition |
|---|----------|---------|----------|-------------|
| WR-01 | warning | Multi-member team PUT fan-out rolls back ALL members client-side on any single failure; already-succeeded PUTs stay durable in authority table → client/server divergence with no re-sync | src/actions/teams.js:96-109 | open |
| WR-02 | warning | Invite ACCEPTANCE inserts `team_members` rows without re-whitelisting team ids against current doc (creation validates, acceptance doesn't) → orphaned rows if team deleted between invite and accept | server.js:3402-3414 | open |
| WR-03 | warning | `A.delTeam` dereferences `team(el.dataset.id)` without the null guard sibling `editTeam` has | src/actions/teams.js:120-122 | open |
| WR-04 | warning | Undo after team deletion restores the definition but not purged memberships — Undo offer is a data-loss trap | deferred-items.md (documented) | open |
| IN-01 | info | Hardcoded English string in `submitTeam` | src/actions/teams.js | open |
| IN-02 | info | Trim inconsistency between the two "mirrored" team-id validators | server.js / teams.js | open |
| IN-03 | info | Pre-existing `myNotifs` eslint errors in actions.js | src/actions/actions.js | open |
| IN-04 | info | Order-sensitive no-change check in teams PUT fan-out | src/actions/teams.js | open |
| IN-05 | info | `invited`-status members remain assignable in pickers | src/core/store.js | open |

## Notes

- Code review gate is **advisory** — 0 critical findings, phase completion proceeds.
- WR-01/WR-02 are the highest-value candidates for a follow-up gap plan (client/server divergence and orphaned membership rows are correctness issues in the authority-table model).
- IN-03 is pre-existing, out of phase-28 scope.
