---
phase: 09-server-messages-activity-history
review: 09-REVIEW.md
status: issues_found
recorded: 2026-10-24
counts:
  critical: 3
  warning: 9
  info: 4
  total: 16
open: 16
resolved: 0
---

# Review Disposition — Phase 09

One row per finding from `09-REVIEW.md` (standard depth, 61 files). Every row defaults to
`open` — nothing was auto-fixed or dismissed during the phase execution run.

| Finding | Severity | Disposition | Note |
|---------|----------|-------------|------|
| CR-01 | critical | open | Thrown `httpError` calls never carry a code; six `err.*` keys dead; French users see raw English on 409/413/signup conflicts |
| CR-02 | critical | open | Interpolation params never transported; `tErr('alreadyMember', undefined, …)` renders literal `{email}`/`{name}` |
| CR-03 | critical | open | Legacy English activity prose divulged verbatim instead of suppressed; suppression pin test is `skip`ped |
| WR-01 | warning | open | `createdProject` verb escapes the Projects filter (legacy rows show, new ones don't) |
| WR-02 | warning | open | `assignedTo` extra renders literal `{value}` when the member is removed |
| WR-03 | warning | open | `TRUST_PROXY` defaults true — login throttle/Secure-cookie spoofable on direct exposure |
| WR-04 | warning | open | Invite URLs host-header poisoned when `APP_URL` unset |
| WR-05 | warning | open | `readJson` destroys the socket before the 413 response is delivered |
| WR-06 | warning | open | `createUser` TOCTOU — signup race yields a code-less 500 |
| WR-07 | warning | open | Login/signup skip `sameOrigin` — login CSRF |
| WR-08 | warning | open | `MOD` keyboard hint resolved at import time — stale labels after live locale switch |
| WR-09 | warning | open | Only legacy-suppression pin is a skipped test |
| IN-01 | info | open | Parity test is one-directional and shape-blind |
| IN-02 | info | open | `esc` duplicated across modules |
| IN-03 | info | open | `err.emailSendFailed` rides a bespoke transport |
| IN-04 | info | open | Client-side `uid()` collision risk |

Suggested fix sequencing (from reviewer): CR-02 changes payload shape — land it together
with CR-01's throw-site codes, then extend the parity test with reverse extraction and an
end-to-end params assertion.
