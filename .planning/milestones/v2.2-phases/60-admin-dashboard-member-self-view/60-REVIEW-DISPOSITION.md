---
phase: 60-admin-dashboard-member-self-view
severity: warning
open: 4
fixed: 3
skipped: 0
---

# Code Review Disposition — Phase 60

One row per finding from 60-REVIEW.md. Default disposition is `open`; edit by hand to record
`deferred`/`skipped` (with a reason). Re-running review or `--fix` reconciles `fixed` rows.

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | fixed by 60-03 (commit 290bb36) — window claimed up-front, `!dashErr` kick guard; re-review 2026-11-13 confirms closed |
| WR-01 | warning | fixed | fixed by 60-03 (commit 290bb36) — `if (!timer) startPoll()` on every entry; re-review 2026-11-13 confirms closed |
| WR-02 | warning | fixed | fixed by 60-03 (commit cc75a38) — whitelist hoisted above doc parse; re-review 2026-11-13 confirms closed |
| WR-03 | warning | open | re-review 2026-11-13 — `in WINDOW_MS` prototype-chain bypass (`?activityWindow=constructor`); fix with `Object.hasOwn` |
| IN-04 | info | open | re-review 2026-11-13 — `lastRequestedWindow` write-only dead state |
| IN-05 | info | open | re-review 2026-11-13 — status-0 failure shows stale panels, no reachable retry until poll (deliberate per tests) |
| IN-01 | info | open | carried from review 2026-11-13 (members.js unescaped visReason fallback) — not in current review scope |
| IN-02 | info | open | carried from review 2026-11-13 (sticky my-access cache) — not in current review scope |
| IN-03 | info | open | carried from review 2026-11-13 (UTC e2e fixtures) — not in current review scope |

open: 6 of 9 (fixed: 3)
