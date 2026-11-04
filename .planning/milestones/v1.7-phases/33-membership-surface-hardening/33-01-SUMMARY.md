---
phase: 33-membership-surface-hardening
plan: 01
subsystem: server-api
tags: [hardening, csrf, security, invites, proxy-headers]
requires: [sameOrigin() guard, WR-07 test pattern, test/helpers/server.mjs harness]
provides: [sameOrigin guard on POST /api/invites/:token/accept, firstForwardedValue() shared helper, silent {name,email,password} accept whitelist, test/hardening.test.mjs pin suite]
affects: [test/hardening.test.mjs (new), server.js accept route + header readers]
tech-stack:
  added: []
  patterns: [Pitfall-22 guard order, D-07 first-value helper, D-06 silent whitelist]
key-files:
  created: [test/hardening.test.mjs]
  modified: [server.js]
decisions:
  - "Guard inserted verbatim after the acceptMatch line, before tooMany() — nothing else in the route head moved"
  - "firstForwardedValue(req, header) returns '' on absent headers so every caller's truthiness gate is unchanged"
  - "D-06 silent whitelist kept: unknown body keys are discarded by construction, never 400'd (pinned by spoof-outcome test)"
  - "Spoof pin asserts granted values via memberships + team_members authority reads (teams live there, not on memberships.teams)"
metrics:
  duration: ~25 min
  completed: 2026-11-03
status: complete
actuals:
  tokens: 46000
  tasks: 3
  commits: 3
plan_head_before: 83ec6a861b7138b36a35a1d0ee30b62966505d31
plan_head_after: f789541
commits: 3
---

# Phase 33 Plan 01: Accept-Route Guard, Header Discipline, Body Whitelist Summary

**One-liner:** sameOrigin guard ordered FIRST on the invite-accept route (HARD-01/D-08), a shared `firstForwardedValue()` helper closing the multi-value x-forwarded-host gap (HARD-05/D-07), and a structural silent `{name,email,password}` whitelist with spoof pins (HARD-04/D-06) — 7 new tests, full 824-test suite green.

## What Was Built

### Task 1 — sameOrigin guard first on the accept route (HARD-01, D-08)
- `server.js`: inserted `if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', ...)` immediately after the accept-route match, BEFORE the `invite|ip` throttle and body read — verbatim house Pitfall-22 pattern from tfa/login.
- `test/hardening.test.mjs`: hostile-Origin POST → 403 byte-identical `{code:'crossOriginRejected', error:'Cross-origin request rejected'}` with exactly those two keys; six hostile probes then a legit Origin-less accept still succeeds (guard consumed no budget); positive control that the harness client passes the guard.

### Task 2 — shared firstForwardedValue() helper (HARD-05, D-07)
- One helper consumed by `proto()`, `clientIp()` and `sameOrigin()`; proto/clientIp behavior byte-identical (same first-value split, TRUST_PROXY gating, fallbacks).
- `sameOrigin()` now splits `x-forwarded-host` on commas — `'a.com, evil.com'` behaves as `'a.com'`; the second value is never consulted. `publicBase()` left as-is (already splits; not in D-07's consumer list).
- Pins run under `TRUST_PROXY: 'true'` (Pitfall 7) on dedicated servers.

### Task 3 — silent {name,email,password} whitelist (HARD-04, D-06)
- Accept route now destructures exactly `{ name, email, password }` from `body || {}` with the same trim/toLowerCase/String coercions. No 400 on unknown keys (D-06 prohibition honored). Role/teams/scope still come only from the invite row (SCOPE-05, untouched).
- Spoof pin: a body smuggling `role/teams/scope/isAdmin` produces a granted membership identical (role, teams authority rows, scope) to a clean-payload accept. Empty-body `{}` pin: reaches the existing `nameRequired` 400, no crash.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | b8c70db | feat(33-01): sameOrigin guard first on invite-accept route (HARD-01) |
| 2 | 84894c9 | feat(33-01): unify first-value proxy-header discipline (HARD-05) |
| 3 | f789541 | feat(33-01): silent {name,email,password} whitelist on accept (HARD-04) |

## Deviations from Plan

**1. [Rule 3 - Blocking] Spoof-pin assertion columns adjusted to the real schema**
- **Found during:** Task 3
- **Issue:** the plan suggested "direct DatabaseSync reads on the memberships row" including teams; `memberships` has no `teams` column — team grants live as authority rows in `team_members` (TEAM-01), keyed `team_id`.
- **Fix:** the grant reader joins `memberships` (role, scope) with `team_members` (team list) per user; the pin also asserts the smuggled teams array never landed anywhere.
- **Files modified:** test/hardening.test.mjs
- **Commit:** f789541

Otherwise the plan executed exactly as written. No architectural deviations, no auth gates, no new error codes, no i18n strings added.

## Verification

- `node --test test/hardening.test.mjs` — 7/7 pass.
- `npm test` full suite — 824 tests, 821 pass, 3 skipped (pre-existing skips), 0 fail. Baseline not regressed.

## Known Stubs

None.

## Threat Surface Scan

No new network endpoints, auth paths, file-access or schema surfaces beyond the plan's threat model (T-33-01/02/03 mitigations all landed and pinned; T-33-SC: zero package installs).
