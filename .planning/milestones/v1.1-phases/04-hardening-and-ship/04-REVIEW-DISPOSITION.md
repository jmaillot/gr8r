---
phase: 04-hardening-and-ship
review_path: .planning/phases/04-hardening-and-ship/04-REVIEW.md
fix_path: .planning/phases/04-hardening-and-ship/04-REVIEW-FIX.md
recorded: 2026-10-21T20:05:00Z
findings: 12
fixed: 12
open: 0
deferred: 0
rejected: 0
---

# Phase 04: Code Review Disposition

All 12 findings from `04-REVIEW.md` were fixed and committed before phase verification.
The per-finding record lives in `04-REVIEW-FIX.md`; this ledger tracks what happened to each.

| ID | Severity | Finding | Disposition | Commit |
|----|----------|---------|-------------|--------|
| CR-01 | Critical | `recentSearches` leaks private project names and can be overwritten by non-members | fixed | `2201ad6` |
| WR-01 | Warning | `data.savedViews[].filters` retained hidden project ids on read and write | fixed | `c51c659` |
| WR-02 | Warning | Malformed session cookie returned 500 instead of 401 | fixed | `d17e262` |
| WR-03 | Warning | Ambient `DB_PATH` could redirect test harnesses at a real database | fixed | `f52e8df` |
| WR-04 | Warning | Migration fixture used `projectId`, a key the app never reads | fixed | `b66d8fc` |
| WR-05 | Warning | e2e could reuse a Vite preview server on port 4173 | fixed | `c0a4390` |
| WR-06 | Warning | `WORKSPACE_SLUG`, `MAX_BODY_BYTES` not forwarded; `TRUST_PROXY` hard-coded in Compose | fixed | `167b9b5` |
| WR-07 | Warning | DEPLOY.md claimed there is no invite revoke UI | fixed | `961f471` |
| WR-08 | Warning | Image tag `1.0.0` vs release `1.1.0` broke the documented rollback | fixed | `ff25e79` |
| WR-09 | Warning | Palette and search crashed without `recentSearches` | fixed | `d232a16` |
| IN-01 | Info | Privacy needle list could not catch CR-01 or WR-01 | fixed | `2f00465` |
| IN-02 | Info | Palette suggestions hard-coded the demo `p1` project id | fixed | `69772ab` |

## Residual risk

CR-01's fix is an interim redaction: recent searches remain workspace-wide free text, so a
substring match is the isolation mechanism until they are stored per user. Documented as a known
limit in `CHANGELOG.md` and `DEPLOY.md`.
