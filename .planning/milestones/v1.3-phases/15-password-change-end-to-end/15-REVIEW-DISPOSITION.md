---
phase: 15-password-change-end-to-end
source: 15-REVIEW.md
recorded: 2026-10-27
counts:
  critical: 0
  warning: 2
  info: 6
  total: 8
---

# Phase 15 — Review Disposition Ledger

Advisory record of what happened to each finding. Default state is `open` until triaged.

| Finding | Severity | Title | Disposition |
|---------|----------|-------|-------------|
| WR-01 | warning | Enter-key bypasses `is-loading` guard — double PATCH | open |
| WR-02 | warning | Stale-response race: error/success applied to navigated-away UI | open |
| IN-01 | info | Session token not rotated on password change (ASVS V3.3.3) | open (deliberate per D-37 — decisions log) |
| IN-02 | info | Duplicated strength regex + near-duplicate locale keys | open |
| IN-03 | info | In-memory per-process lockout budget | open (consistent with accepted login-throttle design) |
| IN-04 | info | `S.ui.pwNew` leaks into auth forms' password inputs | open |
| IN-05 | info | `passwordRequired` mapped to current-password field | open |
| IN-06 | info | Throttle burns budget on repeatable 400s (D-41 design) | open (no fix required; moot if WR-01 fixed) |

No critical findings. Warnings WR-01/WR-02 are client-side UX robustness issues, not security
vulnerabilities — the server route held up under adversarial reading. Candidates for gap-closure
planning via `/gsd-plan-phase 15 --gaps` or backlog; advisory only, phase gates are not blocked.
