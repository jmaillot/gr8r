---
phase: 81-group-grant-path-callback-wiring-provenance
plan: 01
subsystem: sso-auth
tags: [sso, groups, memberships, provenance, dp5, migration]
requires: [groups.js resolver (Phase 80), memberships facade addMembership, mock-IdP harness]
provides: [memberships.provenance column, addMembership provenance param, provenance-filtered DP-5 guard, group grant callback slice, test/groups-sso.test.mjs]
affects: [Phase 82 removal-sync (provenance selection key), Plan 02 (upgrade-only, operator, audit)]
tech-stack:
  added: []
  patterns: [adapterEnsureColumn additive migration, dual-schema byte-identical mirrors, callback corridor grant block, provenance-filtered count-guard]
key-files:
  created: [test/groups-sso.test.mjs]
  modified: [server.js, db-adapter.mjs]
decisions:
  - Grant block sits between concurrency backstop and DP-5 comment, inside the existing try (D-81-11 fail closed)
  - Tracer calls addMembership unconditionally (first-grant only); upgrade-only pre-compare lands in Plan 02 per plan scope
  - '/api/me pin uses the real endpoint /api/auth/me (plan''s `/api/me` name drifted; same semantic — userPayload().workspaces)'
metrics:
  duration: ~50 min
  completed: 2026-11-20
status: complete
actuals:
  tokens: 97000
  tasks: 4
  commits: 4
plan_head_before: 0f8fe061
plan_head_after: 6ab9c2a8
---

# Phase 81 Plan 01: Callback Wiring + Provenance (Wave 1) Summary

Provenance column + end-to-end group-grant tracer: `memberships.provenance` migrated in both schema mirrors, `addMembership` grows the provenance param, all 7 legacy writers + the new group path stamp their origin, the DP-5 guard counts only non-group rows, and one mapped groups claim grants membership at SSO login with `group:<guid>` provenance — proven by a new 4-test e2e suite.

## What Shipped

- **Task 1 (1a5553d7):** `provenance text` in server.js SCHEMA memberships DDL + byte-identical db-adapter.mjs SQLITE_SCHEMA mirror; `adapterEnsureColumn('memberships','provenance','text')` with dated D-81-6 comment. Mirror test green; fresh-boot pragma probe confirms the column; second boot byte-identical.
- **Task 2 (2bab03d2):** Grant block at server.js:5245–5271 corridor — strictly after the oidc_identities concurrency backstop, before DP-5, inside the existing try. Imports `resolveGroupsClaim` + `resolve` from groups.js. Body per RESEARCH §7: claim resolve → overage logWarn (fixed message, D-81-10) → mappings load → resolve() → workspace-exists/archived skip+logWarn (D-81-8) → addMembership with `group:<guid>` + `logSecurity('sso_group_grant')`. Test A: mapped login → exactly one membership row, role from mapping, provenance `group:<guid>`, and the workspace appears in the session payload (D-81-9 — via `/api/auth/me`).
- **Task 3 (fc2cc685):** `addMembership(ws, user, role, teams = [], provenance = null)`; ON CONFLICT SET stays `role, member_id` only (D-81-7). Caller stamps: :3587/:4716/:9278 `manual`, :5303/:8521 `invite`, direct inserts :7041/:7142 `manual`. Full suite green (1988 pass pre-Task-4).
- **Task 4 (6ab9c2a8):** DP-5 guard rewritten at server.js:5280 to `provenance is null or provenance not like 'group:%'` (grep: exactly ONE guard site). Pins: Pin B (unmapped + pending invite → auto-accepts, provenance `invite`), Pin C (group-mapped + pending invite → reconciles, provenance stays `group:<guid>` — no clobber), edge pins (no groups key / empty array / zero mappings → zero writes, login proceeds).

## Deviations from Plan

1. **[Rule 3 - Blocking] addMembership provenance param pulled forward into Task 2.** The tracer's verify asserts provenance on the row, but the param was scheduled for Task 3 — the tracer cannot pass without it. Threaded early; Task 3 then completed the signature + caller stamps as planned.
2. **[Rule 1 - Bug] addMembership INSERT values arity.** Adding `provenance` to the column list without removing the `null` literal for the retired `scope` column bound provenance into `scope` (row yielded `scope:'group:undefined'`, provenance NULL). Fixed to `values (?,?,?,?,?,null,?)` — scope stays retired-NULL.
3. **[Rule 1 - Bug] grant.groupGuid vs grant.guid.** resolve() returns `{ workspaceId, role, groupGuid }`; initial code wrote `'group:' + grant.guid`. Caught by the tracer assertion.
4. **[Deviation - verify line numbers drifted]** Plan's stamp-verify cites pre-corridor line numbers (:3582, :4711, :5272, :8490, :9247, :7010, :7111); actuals are :3587, :4716, :5303, :8521, :9278, :7041, :7142 (corridor insertion shifted downstream lines). Stamps verified at actual sites (12-line window: the two invite calls span >8 lines of arg formatting).
5. **[Deviation - anchor drift, cosmetic]** Plan/context cite `/api/me`; the real endpoint is `/api/auth/me` (server.js:5451) returning `user.workspaces` via userPayload (:993). D-81-9 semantic unchanged; test pins the real route.
6. **[Deviation - test fixture idiom]** Direct `insert into invites` fails FK (created_by → users NOT NULL); invites are seeded through the real API by the harness owner (house DP-5 idiom, `ownerInvite` helper).

## Verify Results

- Task 1: mirror test green; pragma probe COLUMN_OK; second boot byte-identical.
- Task 2: `node --test test/groups-sso.test.mjs` — 4/4 pass (final state).
- Task 3: STAMPS_OK (7 sites) + full `npm test` rc=0 (1988 pass, 13 skips).
- Task 4: regression trio green (69/69 — groups-sso + domain-admission + oidc-sso).
- **Final gate: `npm test` rc=0 — 2004 tests, 1991 pass, 13 pg-skips (unchanged), 0 fail.**
- Guard-shape census: `select 1 from memberships where user_id` → exactly 1 site; ON CONFLICT SET untouched (grep 1 hit).

## Known Stubs

None. The tracer intentionally defers upgrade-only pre-compare, operator flag, and audit verbs to Plan 02 (plan scope, not stubs).

## Commits

- 1a5553d7: feat(81): memberships.provenance column — both schema mirrors + adapterEnsureColumn migration (D-81-6)
- 2bab03d2: feat(81): tracer grant slice — groups claim grants membership e2e with provenance group:<guid> (GW-01/GW-03)
- fc2cc685: feat(81): addMembership provenance param + stamp all 7 legacy writer sites (D-81-6/D-81-7)
- 6ab9c2a8: feat(81): provenance-filtered DP-5 guard + invite-reconcile and edge pins (D-81-1)

## Self-Check: PASSED

- test/groups-sso.test.mjs exists (4 tests).
- All 4 commit hashes present in git log.
- plan_head_before 0f8fe061 → plan_head_after 6ab9c2a8 = 4 commits (matches).
