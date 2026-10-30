---
phase: 22-operator-session-revocation
plan: 01
subsystem: auth-server
tags: [operator-revocation, privilege-gate, sqlite-migration, node-test]
requires: [sessions table, logSecurity helper, tooMany throttle, ensureColumn migration pattern]
provides: [users.is_instance_admin column, D-113 boot stamp, isInstanceAdmin gate, POST /api/auth/operator/users/:userId/revoke-sessions, sessions_revoked_by_operator verb, err.operatorOnly, err.ownerImmune, test/operator-revoke.test.mjs]
affects: [Phase 22 plan 02 (operator users-list route + settings card), plan 03 (e2e), verifier]
tech-stack:
  added: []
  patterns: [additive ensureColumn migration, boot stamp in bootstrap(), keep-current != delete, caller-keyed throttle, success-only security verb]
key-files:
  created: [test/operator-revoke.test.mjs]
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - D-112/D-113 implemented verbatim: additive is_instance_admin column + bootstrap() boot stamp gated on "no user currently flagged"
  - D-118 self-target ALLOWED (ownerImmune only for OTHER flagged owners) — resolves the plan's internal Task 1c vs Task 3b contradiction in favor of the CONTEXT decision and must_haves truth 2
  - 403 code for the gate refusal chosen as operatorOnly (CONTEXT "agent's discretion"); ownerImmune per D-119
  - workspace-owner fixture minted via direct memberships row — the API deliberately cannot grant owner roles
metrics:
  duration: 26m
  completed: 2026-10-29
  tasks: 3
  commits: 3
  plan_head_before: 0de6f38aefb1afa76d7f364852fed496aaf8b576
  plan_head_after: e9303b4d2d4c16519e5c41fab4ea6d3b68ce9fe5
actuals:
  tokens: 5647
  tasks: 3
  commits: 3
status: complete
---

# Phase 22 Plan 01: Operator Session Revocation — Server Foundation Summary

**One-liner:** `is_instance_admin` privilege flag (additive column + D-113 boot stamp), `isInstanceAdmin` gate, `POST /api/auth/operator/users/:userId/revoke-sessions` with the D-117 `{ revoked, remaining }` envelope, D-118 one-statement keep-current delete, D-119 owner immunity pre-lookup, D-116 5/15min caller-keyed throttle, and an 8-test node:test privilege-matrix + provisioning suite — full `npm test` green (563/563).

## What Was Built

1. **Schema (D-112):** `users.is_instance_admin integer not null default 0` in SCHEMA + byte-identical `ensureColumn` in `openDb()` (Pitfall P-B).
2. **Boot stamp (D-113/D-114):** `stampInstanceAdmin()` called from `bootstrap()` after `ensureAdmin` — flags the ADMIN_EMAIL-matching account (collate nocase) only when no user is currently flagged; idempotent, documented as the manual-reassignment escape hatch.
3. **Gate:** `isInstanceAdmin(user)` — reads the DB flag only; no env, no workspace role (D-112).
4. **Route (D-115–D-119):** guard order sameOrigin → requireUser → `tooMany('operator-revoke|'+operator.id, 5, 15min)` → gate (403 `operatorOnly`) → target lookup (404 `notFound`) → ownerImmune 403 BEFORE any session query (self-target exempt per D-118) → single `delete from sessions where user_id = ? and token_hash != ?` → live post-delete counts → success-only `logSecurity(target.id, 'sessions_revoked_by_operator')` → 200.
5. **Tests (`test/operator-revoke.test.mjs`, 8 green):** tracer e2e (revoke → 0 rows → 401 `signInRequired` on revoked cookie → exactly one security row), D-118 self-target (200, remaining=1, current cookie survives), D-119 owner immunity (another flagged owner refused pre-lookup, sessions untouched, no log), 404 unknown id, workspace-owner-without-flag 403 with intact target sessions, D-116 throttle band (403 refusals consume tries; 6th → 429), D-113 fresh-install flagging, D-113 pre-v1.4 boot stamp + idempotence across restarts.

## Deviations from Plan

**1. [Decision documented] Self-target resolves to 200, not 403 ownerImmune (plan Task 1c vs Task 3b conflict)**
- **Found during:** Task 1
- **Issue:** Task 1c specifies "operator revokes their own id → 403 ownerImmune" while Task 3b, must_haves truth 2 ("a self-target deletes only the operator's OTHER sessions"), D-118 ("A self-target is **allowed**"), and D-122 ("self-target revokes others only") specify success.
- **Fix:** Followed the CONTEXT decisions: ownerImmune fires for other flagged owners only (`target.is_instance_admin && target.id !== operator.id`); self-target returns 200 with the keep-current delete. Tracer test (c) implemented as the D-118 success case; D-119 regression covers a non-self flagged owner.
- **Files modified:** server.js, test/operator-revoke.test.mjs
- **Commit:** 9f53552

**2. [Rule 3 - Blocking] New error codes catalogued EN+FR; catalogue pin advanced**
- **Found during:** Task 3 (`npm test`)
- **Issue:** `operatorOnly`/`ownerImmune` codes broke the D-04 error-code contract test and the i18n catalogue-size pin (1549→1551 / 1582→1584 keys).
- **Fix:** Added `err.operatorOnly` and `err.ownerImmune` to both locales next to `err.adminOnly`; updated the pinned count and history note in `test/i18n-core-features.test.mjs`.
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Commit:** e9303b4

**3. [Fixture note] Workspace-owner-without-flag fixture uses a direct memberships row**
- The invite API deliberately maps 'owner' to 'member' (`inviteRole`), so the API cannot mint owner memberships. The fixture inserts a genuine `role='owner'` memberships row via withDb — the same independence-by-construction proof the plan's Pitfall 4 requires.

## Verification

- `node --test test/operator-revoke.test.mjs` — 8/8 pass
- `npm test` — 563/563 pass (no existing suite broken)
- `grep -c 'is_instance_admin' server.js` = 7 (≥3); ensureColumn def byte-identical to SCHEMA def
- Route block contains no ADMIN_EMAIL / addMembership / isAdminUser reference; ownerImmune check precedes any sessions query in source order
- Zero new npm dependencies

## Threat Model Compliance

| Threat | Mitigation status |
|--------|-------------------|
| T-22-01 (EoP) | DB-flag gate in-route; matrix test pins workspace-owner-without-flag rejection |
| T-22-02 (CSRF) | sameOrigin first guard, before any body read or throttle |
| T-22-03 (owner DoS/EoP) | ownerImmune 403 before any session lookup; regression-tested |
| T-22-04 (probing) | throttle increments on every call incl. 403 paths; band pinned by test |
| T-22-SC (deps) | no installs performed |

## Known Stubs

None.

## Self-Check: PASSED

- test/operator-revoke.test.mjs exists; server.js modified and committed
- Commits 9f53552, 171f046, e9303b4 present in git log
- `git rev-list --count 0de6f38a..HEAD` = 3
