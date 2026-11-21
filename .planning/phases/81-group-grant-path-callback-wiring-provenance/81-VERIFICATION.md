---
phase: 81-group-grant-path-callback-wiring-provenance
verified: 2026-11-21T00:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files: ["server.js", "db-adapter.mjs", "groups.js", "test/groups-sso.test.mjs", ".planning/phases/81-group-grant-path-callback-wiring-provenance/81-01-PLAN.md", ".planning/phases/81-group-grant-path-callback-wiring-provenance/81-02-PLAN.md", ".planning/phases/81-group-grant-path-callback-wiring-provenance/81-01-SUMMARY.md", ".planning/phases/81-group-grant-path-callback-wiring-provenance/81-02-SUMMARY.md"]
covered_digest: "v2:sha256:78ae26b101eb1f6d14aa13bbed52af64f87e8b684c83bff586cbc54c36be7c8e"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "Group-driven removals / downgrades at login"
    addressed_in: "Phase 82"
    evidence: "Phase 82 SC1–SC3: removal-sync via provenance selection key, guard funnel, downgrade rules (NOTE: Phase 82 has since SHIPPED — downgrade cells and removal-sync are now live in server.js and verified green by test/groups-sso.test.mjs)"
  - truth: "Group mapping editor UI / dead-mapping console surface"
    addressed_in: "Phase 83"
    evidence: "Phase 83 SC3 + GV-03: dead mappings warning section in operator console"
---

# Phase 81: Group Grant Path — Callback Wiring + Provenance Verification Report

**Phase Goal:** At SSO login, mapped groups automatically grant workspace membership (highest-role precedence) and instance-operator rights — grants only, nothing removed by groups yet.
**Verified:** 2026-11-21
**Status:** passed (all 5 success criteria MET against the CURRENT tree)
**Re-verification:** Yes — stale-verification refresh (#4682): post-ship quick-task commits (super-access gate 6b4aa830, me() crash fix 18b75806, .env docs) landed after the 2026-11-20 verification; goal-backward verification re-run against current source.

## Goal Achievement

### Success Criteria Verdicts

| # | Success Criterion | Verdict | Evidence (current tree) |
|---|-------------------|---------|----------|
| 1 | Mapped user gains membership at login, highest-role-wins (D-82-1), upgrade-only re-assert incl. viewer | **MET** | Grant block server.js:~5371–5548; `resolve()`/`resolveGroupsClaim()` from groups.js (import :109); `ROLE_RANK_WITH_VIEWER` (server.js:5371, viewer:0) with `mappedRank > curRank` fall-through upgrade (:5469–5471, `mappedRank === curRank` → no-op, mappedRank < curRank → Phase 82 downgrade cell, group-provenance-only); grant write :5515 `addMembership(ws, row, mapped.role, [], 'group:' + mapped.groupGuid)` |
| 2 | Grant block strictly after DP-4 signup door, before DP-5 invite reconcile; domain-refused mapped user NOT provisioned | **MET** | DP-4 JIT gate (emailDomainRefusal → errorRedirect before any users/oidc_identities write) at :~5315; grant block runs after identity resolution and before DP-5 reconcile (:5551, guard now provenance-filtered per Phase 82: `provenance is null or not like 'group:%'`); e2e pin still exercised by test/groups-sso.test.mjs (22 tests, all pass) |
| 3 | `group:<guid>` provenance; `memberships.provenance` via adapterEnsureColumn; all writer sites stamped | **MET** | server.js:695 `adapterEnsureColumn('memberships','provenance','text')` + DDL mirror :414 and db-adapter.mjs; addMembership :4707 `(ws,user,role,teams=[],provenance=null)`; INSERT includes provenance, ON CONFLICT clause amended by Phase 82 D-82-7 (conditional: group provenance wins, invite 'provenance' never clobbers a group row — comment :4730–4738). Writer sites all stamped: group :5517/:5497, manual :7353/:7454, invite + direct inserts per prior verification |
| 4 | Operator-mapped group grants is_instance_admin at login, grant-only, re-grant after demotion, audit-logged like console promote in same tx | **MET** | server.js:~5525–5545: `operatorFlag && row.is_instance_admin !== 1` → `db.tx` with `update users set is_instance_admin=1` + `operator_promoted` audit row (actor=target=self, ip clientIp(req)) in the SAME tx. Never revokes (condition only grants). e2e: grant + exactly one audit row, demote→re-login re-grants, already-operator no-op (test/groups-sso.test.mjs green) |
| 5 | Unmapped users byte-identical (oidc-sso + domain-admission-sso untouched and green) | **MET** | Both suites run green in current tree: oidc-sso + domain-admission-sso = 65 pass / 0 fail (file contents unchanged since the Phase 81 pin — post-ship commits touched only super-access/me()/.env surfaces) |

### Post-Ship Change Impact Check (#4682)

| Commit | Touches | Impact on Phase 81 truths |
|--------|---------|---------------------------|
| 6ab89e63 + 6b4aa830 (super-access gate) | requireWorkspace / membershipsOf / /api/config / server.js gate :1013 | None — group grant block untouched; the gate only affects super-access entry paths |
| 18b75806 (me() crash fix + rename) | client src/pages, popovers, locales | None — client-only, grant path is server-side |
| 39d69094, c6514542, 73c3c6ab | .env.example, docs, local db | None |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` grant block | Callback corridor grant slice + operator tx | ✓ VERIFIED | :5371–5548, inside existing try (D-81-11 fail closed) |
| `server.js:695` migration | `adapterEnsureColumn` provenance | ✓ VERIFIED | dual-schema mirrors intact |
| `server.js:4707` addMembership | provenance param, on-conflict preserves group origin | ✓ VERIFIED | WIRED: called from grant, downgrade cells, manual/invite sites |
| `groups.js` resolve/resolveGroupsClaim | imported into server.js | ✓ VERIFIED | :109 import; consumed at :5359/:5366 |
| `test/groups-sso.test.mjs` | e2e suite for grant path | ✓ VERIFIED | 22 tests (15 at Phase 81 + Phase 82 removal-sync additions), all pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| server.js callback | groups.js resolve()/resolveGroupsClaim | import :109 + calls :5359/:5366 | WIRED | |
| grant block | addMembership | `'group:'+mapped.groupGuid` provenance :5517 | WIRED | correct key (`groupGuid`, not `guid`) |
| grant block | DP-5 guard | provenance-filtered count :5554 | WIRED | `provenance is null or not like 'group:%'` |
| operator grant | audit_log | same db.tx :5525–5545 | WIRED | mirrors console promote |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| groups-sso suite | `node --test test/groups-sso.test.mjs` | 22 pass / 0 fail | ✓ PASS |
| Regression suites | `node --test test/oidc-sso.test.mjs test/domain-admission-sso.test.mjs` | 65 pass / 0 fail | ✓ PASS |

### Probe Execution

None declared for this phase.

### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| GW-01 | ✓ SATISFIED (checkbox marked) | SC1 |
| GW-02 | ✓ SATISFIED (checkbox marked) | SC1 upgrade-only re-assert |
| GW-03 | ✓ SATISFIED (checkbox marked) | SC2 ordering + DP-4 e2e pin |
| GW-04 | ✓ SATISFIED (checkbox marked) | SC3 provenance column + stamps |
| GO-01 | ✓ SATISFIED (checkbox marked) | SC4 operator tx |
| GO-02 | ✓ SATISFIED (checkbox marked) | SC4 atomic audit row |

No orphaned requirements — REQUIREMENTS.md maps exactly GW-01..04 + GO-01..02 to Phase 81, all accounted for.

### Anti-Patterns Found

None. No TODO/FIXME/TBD/HACK/placeholder markers in server.js, groups.js, db-adapter.mjs, or test/groups-sso.test.mjs. No stubs.

### Human Verification Required

None — every behavior-dependent truth is exercised by the passing named e2e suites listed above.

### Gaps Summary

None. The post-ship quick-task commits do not intersect the group grant path; all five success criteria re-verified against the current tree with fresh behavioral evidence.

---

_Verified: 2026-11-21_
_Verifier: the agent (gsd-verifier)_
