---
phase: 81-group-grant-path-callback-wiring-provenance
plan: 02
subsystem: sso-auth
tags: [sso, groups, upgrade-only, operator, audit, dp4, fail-closed]
requires: [Plan 01 substrate (provenance column, grant corridor, DP-5 filter), groups.js resolve(), db.tx, audit_log]
provides: [upgrade-only re-assert with viewer rank, operator self-grant tx + atomic audit, changes-only security verbs, overage/dead-ws/DP-4/throw e2e pins]
affects: [Phase 82 removal-sync + downgrades]
tech-stack:
  added: []
  patterns: [callback-local ROLE_RANK_WITH_VIEWER, rank pre-compare before addMembership on-conflict, operator tx mirroring console promote (AUD-01), changes-only logSecurity verbs, SQLite-trigger fault injection for fail-closed pin]
key-files:
  created: []
  modified: [server.js, test/groups-sso.test.mjs]
decisions:
  - Viewer row fixtures seeded directly with invite provenance — viewer invites are guests needing a project (invite-API gate); origin preservation is a conflict-clause property independent of row creation
  - D-81-11 fault mechanism = SQLite trigger raising ABORT on group-provenance inserts to a fixture workspace, dropped between attempts so the healthy retry is clean
  - lastOperator count guard deliberately NOT duplicated in the grant path — a grant only increases the operator count (documented in code comment)
metrics:
  duration: ~35 min
  completed: 2026-11-20
status: complete
actuals:
  tokens: 86000
  tasks: 3
  commits: 3
plan_head_before: 3d7a8c62
plan_head_after: 43af11a6
---

# Phase 81 Plan 02: Callback Wiring + Provenance (Wave 2) Summary

The grant block reaches full Phase 81 contract: upgrade-only re-assert with a callback-local viewer rank (same-role = zero writes anywhere, lower never overwrites), the operator self-grant flag flip atomically paired with its `operator_promoted` audit row in one `db.tx`, changes-only `sso_group_grant`/`sso_group_role_change` verbs, and e2e pins for overage, dead/archived targets, the DP-4 door, the byte-identical unmapped path, and fail-closed throw → retry — full suite 2002 pass / 0 fail.

## What Shipped

- **Task 1 (a5e8e8d7):** Rank pre-compare in the grant loop — `ROLE_RANK_WITH_VIEWER` callback-local const ({owner:3, admin:2, member:1, viewer:0}); existing row read before any `addMembership` call; grant applied ONLY when `RANK[mapped] > RANK[existing]` (addMembership's on-conflict is an unconditional write — never called for a no-op). Verbs: upgrade → `sso_group_role_change`, fresh insert → `sso_group_grant`, skip → nothing. groups.js `ROLE_RANK` untouched (grep: no viewer token). Tests: viewer→member upgrade with provenance origin preserved, same-role re-login = zero rows/logs (sso_login still fires), owner + mapped member untouched, edge probes (two workspaces, highest-role-wins order-stable across claim GUID orders, zero team_members writes).
- **Task 2 (a8f767c3):** Operator block after the grant loop — `operatorFlag && row.is_instance_admin !== 1` → `db.tx` mirroring console promote :6879–6898 exactly: `update users set is_instance_admin = 1` + `audit_log` row (action `operator_promoted`, actor = target = granted user, ip from `clientIp(req)`) in the SAME tx (AUD-01). Tests: grant + exactly one audit row (self-grant, ip set, no membership from operator-kind mapping), re-login no-op, demote → login re-grants with fresh audit row (D-82-3), already-operator zero writes.
- **Task 3 (43af11a6):** Behavior was already in place from Plan 01 (overage fixed logWarn; dead/archived skip+logWarn) — Task 3 added the pins: overage emits the exact fixed string with no GUID/claim-key/email/count leakage and zero writes; archived (`update workspaces set archived = 1`) and missing-workspace mappings skip with the fixed line while the live grant still applies; DP-4 e2e pin (mapped group + blocked domain → `/login?sso=error`, no users/oidc_identities/membership rows); byte-identical regression pin (mapped-shape claim, no mapping match → `/`, sso_login verb, zero group verbs); D-81-11 throw pin via SQLite trigger aborting the group-provenance insert → `/login?sso=error` with no session cookie and no partial row, then trigger dropped → healthy retry succeeds.

## Deviations from Plan

1. **[Deviation - fixture idiom] Viewer-row test seeded directly instead of via invite.** The plan's suggested fixture (invite role 'viewer' auto-accepted) is blocked by the invite API's guest gate (`inviteGuestProjectRequired` — a viewer invite needs a project). The row is inserted directly with provenance `'invite'` after an unmapped JIT login; the property under test (conflict-update preserves creation origin) is unaffected. Documented in the test comment.
2. **[Deviation - test-only] Task 3 shipped tests only.** Plan 01 already implemented the overage logWarn and dead/archived skip with the exact contract shapes (server.js:5253–5264); Task 3's server.js action items reduced to verification + the leak-proof pins, per the plan's own fallback ("If Plan 01 already emitted this line, verify shape + add the leak-proof pin instead").

## Verify Results

- Task 1: `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` — 29/29 pass.
- Task 2: `node --test test/groups-sso.test.mjs` — 10/10 pass.
- Task 3 (full regression gate): **`npm test` rc=0 — 2015 tests, 2002 pass, 0 fail, 13 pg-skips** (baseline 2004/1991/13; +11 net new tests). test/oidc-sso.test.mjs and test/domain-admission-sso.test.mjs untouched and green (byte-identical gate).
- grep verification: `sso_group_grant` (2), `sso_group_role_change` (2), `operator_promoted` (2), overage fixed string (1) all present in server.js; groups.js ROLE_RANK has no viewer token (2 hits are docstring only); addMembership ON CONFLICT SET stays `role, member_id` only.

## Known Stubs

None.

## Commits

- a5e8e8d7: feat(81-02): upgrade-only re-assert with viewer rank + changes-only verbs (D-81-2/D-81-3/D-81-5)
- a8f767c3: feat(81-02): operator self-grant in tx + atomic audit row, changes-only re-login (GO-01/GO-02/D-81-4)
- 43af11a6: test(81-02): overage/dead-ws/DP-4/regression/throw pins — full suite green 2002 pass (D-81-10/D-81-8/GW-03/D-81-11)

## Self-Check: PASSED

- server.js grant block carries pre-compare + operator tx (verified by greps + suite).
- test/groups-sso.test.mjs exists with 15 tests, all pass.
- All 3 commit hashes present in git log; plan_head_before 3d7a8c62 → plan_head_after 43af11a6 = 3 commits (matches).
