# Phase 76 Discussion Log

**Date:** 2026-11-19
**Mode:** default (multiSelect gray-area selection, one question per area)

## Areas Presented
1. SSO refusal audit log
2. DP-5 single refused invite UX
3. Boot door-matrix log shape
4. Immunity contract test shape

**User selected:** all four.

## Decisions

| Area | Options presented | Decision |
|---|---|---|
| SSO refusal audit log | plain logInfo domain-only (rec) / new logSecurity verb / domain + full email | Plain `logInfo`, domain only — **D-09** |
| DP-5 single refused invite | silent filter (rec) / filter + point at invitations / surface refusal message | Silent filter — **D-10** |
| Boot door-matrix log | one combined matrix line (rec) / per-var lines + door map / extend D-06 lines | One combined matrix line — **D-11** |
| Immunity contract test shape | one matrix file with named immunity rows (rec) / per-door files / matrix + e2e OIDC | One matrix file, named rows — **D-12** |

## Notes
- Phase heavily pre-decided: door matrix owner-validated in SEED-261119-f3w; DP-4/DP-5
  integration points line-verified in research/ARCHITECTURE.md. No re-litigation.
- All four questions resolved with the research-recommended option in one turn each;
  no follow-ups needed.
- Scope: no deferred ideas; nothing proposed outside the phase boundary.

## Agent's Discretion Items
- D-11 log-line field naming; test file naming/placement; logInfo payload shape
  (structured object vs interpolated string, matching surrounding OIDC code).
