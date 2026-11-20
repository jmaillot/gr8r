---
phase: 81-group-grant-path-callback-wiring-provenance
verified: 2026-11-20T00:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files: [server.js, db-adapter.mjs, groups.js, test/groups-sso.test.mjs, .planning/phases/81-group-grant-path-callback-wiring-provenance/81-01-PLAN.md, .planning/phases/81-group-grant-path-callback-wiring-provenance/81-02-PLAN.md]
covered_digest: "unavailable — gsd_run CLI not found in this session; file set listed in covered_files"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Group-driven removals / downgrades at login"
    addressed_in: "Phase 82"
    evidence: "Phase 82 SC1–SC3: removal-sync via provenance selection key, guard funnel, downgrade rules"
  - truth: "Group mapping editor UI / dead-mapping console surface"
    addressed_in: "Phase 83"
    evidence: "Phase 83 SC3 + GV-03: dead mappings warning section in operator console"
---

# Phase 81: Group Grant Path — Callback Wiring + Provenance Verification Report

**Phase Goal:** At SSO login, mapped groups automatically grant workspace membership (highest-role precedence) and instance-operator rights — grants only, nothing removed by groups yet.
**Verified:** 2026-11-20
**Status:** passed (all 5 success criteria MET)
**Re-verification:** No — initial verification

## Goal Achievement

### Success Criteria Verdicts

| # | Success Criterion | Verdict | Evidence |
|---|-------------------|---------|----------|
| 1 | Mapped user gains membership at login, highest-role-wins (D-82-1), upgrade-only re-assert incl. viewer | **MET** | Grant block server.js:5246–5311; `resolve()` from groups.js assigns grants per mapping; `ROLE_RANK_WITH_VIEWER` (server.js:5264, viewer:0) gates every write behind `RANK[mapped] > RANK[existing]` (:5278) — same-role/lower = zero writes; groups.js `ROLE_RANK` untouched (no viewer token). e2e: 15 tests in test/groups-sso.test.mjs (viewer→member upgrade w/ origin preserved, same-role no-op, order-stable highest-role-wins across GUID orders) |
| 2 | Grant block strictly after DP-4 signup door, before DP-5 invite reconcile; domain-refused mapped user NOT provisioned | **MET** | DP-4 JIT gate at server.js:5204–5215 (emailDomainRefusal → refuse before users/oidc_identities write); grant block at :5246 (comment "strictly after DP-4/DP-5 identity resolution and BEFORE DP-5"); DP-5 reconcile begins :5311. e2e pin: mapped group + blocked domain → `/login?sso=error`, zero users/oidc_identities/membership rows |
| 3 | `group:<guid>` provenance; `memberships.provenance` via adapterEnsureColumn; all 8 writer sites stamped; legacy NULL | **MET** | server.js:668 `adapterEnsureColumn('memberships','provenance','text')` + DDL mirror at :387 and db-adapter.mjs SQLITE_SCHEMA. addMembership :4637 signature `(ws,user,role,teams=[],provenance=null)`; INSERT includes provenance, ON CONFLICT SET stays `role, member_id` only (:4660). Stamps: group :5279 `'group:'+grant.groupGuid`; manual :3587/:4716/:9315; invite :5349/:8569; direct inserts :7077/:7178 `'manual'` — all 8 sites stamped; legacy rows untouched (column additive migration) |
| 4 | Operator-mapped group grants is_instance_admin at login, grant-only, re-grant after demotion, audit-logged like console promote in same tx | **MET** | server.js:5288–5305: `operatorFlag && row.is_instance_admin !== 1` → `db.tx` with `update users set is_instance_admin=1` + `audit_log` `operator_promoted` row (actor=target=self, ip clientIp(req)) in the SAME tx (mirrors console promote :6922 shape). Never revokes (condition only grants). e2e: grant+exactly one audit row, demote→re-login re-grants with fresh audit row (D-82-3), already-operator no-op |
| 5 | Unmapped users byte-identical (oidc-sso + domain-admission-sso untouched and green) | **MET** | `git diff 0f8fe061..HEAD -- test/oidc-sso.test.mjs test/domain-admission-sso.test.mjs` = empty (untouched). Both green in full suite. Byte-identical regression pin: mapped-shape claim with no mapping match → `/`, sso_login verb, zero group verbs |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` grant block | Callback corridor grant slice + operator tx | ✓ VERIFIED | :5246–5311, inside existing try (D-81-11 fail closed) |
| `server.js:668` migration | `adapterEnsureColumn` provenance | ✓ VERIFIED | dated D-81-6 comment; dual-schema mirrors |
| `server.js:4637` addMembership | provenance param, on-conflict preserves origin | ✓ VERIFIED | WIRED: called from 8 sites |
| `groups.js` resolve/resolveGroupsClaim | imported into server.js | ✓ VERIFIED | :106 import; consumed at :5252/:5259 |
| `test/groups-sso.test.mjs` | e2e suite for grant path | ✓ VERIFIED | 15 tests, all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server.js callback | groups.js resolve()/resolveGroupsClaim | import :106 + calls :5252/:5259 | WIRED | |
| grant block | addMembership | `'group:'+grant.groupGuid` provenance :5279 | WIRED | correct key (`groupGuid`, not `guid` — bug fixed in 2bab03d2) |
| grant block | DP-5 guard | provenance-filtered count :5315 | WIRED | single guard site, `provenance is null or not like 'group:%'` |
| operator grant | audit_log | same db.tx :5299–5303 | WIRED | mirrors console promote |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| groups suites | `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` | 36 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 2015 tests, 2002 pass, 0 fail, 13 skips (pg-skips, unchanged baseline) — matches SUMMARY claim | ✓ PASS |
| Regression suites untouched | `git diff 0f8fe061..HEAD -- test/oidc-sso.test.mjs test/domain-admission-sso.test.mjs` | empty | ✓ PASS |

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GW-01 | ✓ SATISFIED (checkbox marked) | SC1 |
| GW-02 | ✓ SATISFIED (checkbox marked) | SC1 upgrade-only re-assert |
| GW-03 | ✓ SATISFIED (checkbox marked) | SC2 ordering + DP-4 e2e pin |
| GW-04 | ✓ SATISFIED (checkbox marked) | SC3 provenance column + 8 stamps |
| GO-01 | ✓ SATISFIED (checkbox marked) | SC4 operator tx |
| GO-02 | ✓ SATISFIED (checkbox marked) | SC4 atomic audit row |

### Anti-Patterns Found

None. No TODO/FIXME/TBD/HACK/placeholder markers in server.js, db-adapter.mjs, or test/groups-sso.test.mjs. No stubs.

### Undocumented Deviations from D-81-1..11

None found. All locked decisions traceable in code comments:
- D-81-2/3/5: upgrade-only pre-compare + changes-only verbs (:5270–5286)
- D-81-4: operator tx mirrors console promote (:5288–5305)
- D-81-6: column migration + stamps (documented)
- D-81-7: ON CONFLICT preserves provenance (:4660)
- D-81-8: dead/archived skip+logWarn (:5272–5275)
- D-81-10: fixed overage logWarn, no data leakage (:5252–5256)
- D-81-11: inside existing try, throw → sso=error, e2e fail-closed pin

Documented SUMMARY deviations are cosmetic (line drift, `/api/me`→`/api/auth/me`, test fixture idioms) and match the code as verified.

### Deferred Items

- Removal-sync, downgrades, guard funnel → Phase 82 (SC1–SC3; provenance column is Phase 82's declared dependency)
- Dead-mapping console UI, rename/slug → Phase 83

### Human Verification Required

None — every behavior-dependent invariant (upgrade-only transition, demote→re-grant, DP-4 refusal ordering, fail-closed throw→retry) is exercised by a passing e2e test in test/groups-sso.test.mjs.

## Gaps Summary

None. All 5 success criteria are MET with codebase + passing-test evidence. REQUIREMENTS.md updated: GW-01..04, GO-01..02 marked complete. Full suite green (2002 pass / 0 fail / 13 pg-skips).

---

_Verified: 2026-11-20_
_Verifier: the agent (gsd-verifier)_
