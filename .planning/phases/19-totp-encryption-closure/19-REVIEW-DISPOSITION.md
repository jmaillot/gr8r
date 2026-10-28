---
phase: 19
review: 19-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Migration never converges when a permanently-skipped row exists — a new plaintext backup file is written on EVERY boot"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`LIKE 'v1:%'` is case-insensitive in SQLite — `V1:`-prefixed rows are silently excluded from both migration and garbage logging"
  - id: IN-01
    severity: info
    disposition: open
    title: "`skippedGarbage` conflates two distinct conditions; the encrypt-null path logs nothing"
  - id: IN-02
    severity: info
    disposition: open
    title: "Dead expression in the D-81 copy test"
  - id: IN-03
    severity: info
    disposition: open
    title: "Pointless defensive check on `fs.tmpdir`"
  - id: IN-04
    severity: info
    disposition: open
    title: "Wrapper-body assertions keyed to a distant marker comment"
  - id: IN-05
    severity: info
    disposition: open
    title: "Behavioral verify test omits the stored-value-unchanged assertion"
  - id: IN-06
    severity: info
    disposition: open
    title: "Pre-migration backup contains plaintext TOTP secrets with umask-dependent permissions"
  - id: IN-07
    severity: info
    disposition: open
    title: "Grep proof is approximate by design — accepts known evasions"
open: 9
total: 9
recorded: 2026-10-28T14:41:48.513Z
---

# Phase 19: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
Re-running the gate keeps every row it can; a row the current review no longer reports is kept and flagged.
