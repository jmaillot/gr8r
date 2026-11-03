---
phase: 34
review: 34-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "PUT `/api/me/notif-prefs` replaces the whole stored row — a partial body silently erases previously stored keys"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "`migrateUserNotifPrefs` guard can leave `data.notifPrefs` in the stored doc forever, contradicting the plan's \"field is gone from every doc\" truth"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "Tokenized matcher narrows SEARCH-01 protection for hidden names with no letter/number tokens"
  - id: IN-01
    severity: info
    disposition: fixed
    title: "`hydrateNotifPrefs` computes a dead local-mode wsId before its early return"
  - id: IN-02
    severity: info
    disposition: fixed
    title: "Duplicated 17-key whitelist / 13-key defaults between server and client modules"
  - id: IN-03
    severity: info
    disposition: fixed
    title: "Pre-existing observation (out of phase scope, noted for the record)"
open: 3
total: 6
recorded: 2026-11-03T17:55:00Z
---

# Phase 34: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | fixed | 34-REVIEW-FIX.md |
| WR-02 | warning | fixed | 34-REVIEW-FIX.md |
| WR-03 | warning | fixed | 34-REVIEW-FIX.md |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Re-running the gate keeps every row it can; a row the current review no longer reports is kept and flagged in its Source cell.
