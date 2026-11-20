---
phase: 82-removal-sync-guards-audit
verified: 2026-11-20T13:48:26Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - server.js
  - test/groups-sso.test.mjs
  - .planning/phases/82-removal-sync-guards-audit/82-01-PLAN.md
  - .planning/phases/82-removal-sync-guards-audit/82-01-SUMMARY.md
  - .planning/phases/82-removal-sync-guards-audit/82-02-PLAN.md
  - .planning/phases/82-removal-sync-guards-audit/82-02-SUMMARY.md
covered_digest: "v2:manual-sha256:server.js=3e4ff0aa8a479c1befd75c64bf4ff52ef865e14ef0053f3aab308ecae9a36fcc;test/groups-sso.test.mjs=f58093495e85b7af87a861ab9a0ee52d6076cb30f4ca54907412723089a5dbdf"
behavior_unverified: 0
overrides_applied: 0
gaps: []
---

# Phase 82: Removal Sync + Guards + Audit — Verification Report

**Phase Goal:** Lost group membership at login removes only group-derived access, safely — owners, last operators and manual grants are protected, and every group-driven delta is audit-logged
**Verified:** 2026-11-20T13:48:26Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Removed-from-group users lose ONLY group-derived (`group:<guid>`) rows at next login; invite/manual rows untouched (SC1, GS-01) | ✓ VERIFIED | server.js:5314 selects rows with `provenance like 'group:%'`; delete cell (server.js:5322–5353) skips non-group provenance (`continue` at :5326), GUID parsed server-side from `provenance.slice('group:')`; e2e "lost-claim login removes ONLY the group:<guid> row — manual rows immune (GS-01)" passes |
| 2 | Sole-owner removal/refusal routes through shared count-before-write guard funnel — loud logWarn, guard-refused audit row, row intact, login succeeds (SC2, GS-02) | ✓ VERIFIED | `guardRefuse` funnel (server.js:5302–5312) called by delete cell (:5336) AND owner-downgrade arm (:5395); `ownerCount(wsId, row.id) === 0` count-before-write, refusal is `continue` never throw; e2e "sole-owner removal refused" and "sole-owner downgrade refused" both pass |
| 3 | Group-driven downgrades apply ONLY when mapped < current AND current grant is group-derived; manual/invite never downgraded (SC3, GS-03) | ✓ VERIFIED | downgrade cell (server.js:5383–5413): `mappedRank < curRank` + `provenance startsWith('group:')` else immune skip; owner-downgrade guard arm mirrors PATCH template; e2e "mapped-lower downgrades a group-derived row... identical manual row immune (GS-03)" passes with side-by-side immunity proof |
| 4 | Every group-driven delta (grant, upgrade, downgrade, removal, skip, refusal) audit-logged as encoded `group_<delta>:group:<guid>:<reason>`; logSecurity keeps only sso_login/sso_invite_accepted heartbeats (SC4, GS-04) | ✓ VERIFIED | Encoded rows at server.js:5310 (guard-refused), :5350 (lost-claim), :5369 (dead/archived skip), :5406 (mapped-lower), :5427 (granted/upgraded); grep shows zero `sso_group%` logSecurity calls remain (heartbeats at :5500/:5564 only); e2e pins migrated and passing |
| 5 | Overage login proceeds as unmapped — no grants AND no removals (SC5/D-82-4); unmapped login byte-identical (D-82-10) | ✓ VERIFIED | Whole reconcile lives inside the `mapped` else-branch (server.js:5276); overage only logs the fixed warn (:5269); e2e "overage login removes nothing and grants nothing — group row survives (SC5)" and "byte-identical gate" (zero writes, zero group_% rows, zero security_log beyond sso_login) pass |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` reconcile block ~5255–5450 | delete path + guard funnel + downgrade cells + encoded audit rows inside the mapped else-branch | ✓ VERIFIED | Read in full — substantive (no stubs), wired into the SSO callback corridor before DP-5 invite reconcile |
| `server.js:4662` conditional on-conflict clause | `provenance = case when excluded.provenance like 'group:%' ...` | ✓ VERIFIED | Confirmed at server.js:4671 |
| `test/groups-sso.test.mjs` reconcile test block | GS-01/GS-02/GS-03/SC5/D-82-10 e2e + migrated pins | ✓ VERIFIED | All 43 tests in groups-sso + groups-core pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| Delete cell | member-DELETE route tx shape | memberships + team_members + stripMember in one db.tx, audit row in SAME tx | ✓ WIRED | server.js:5339–5353 mirrors route shape; AUD-01 holds |
| Guard funnel | ownerCount | `ownerCount(wsId, row.id)` before any write tx | ✓ WIRED | server.js:3409, called at :5336 and :5395 |
| Downgrade write | addMembership conditional clause | D-82-7 re-stamps driving group provenance | ✓ WIRED | addMembership called at :5399; clause at :4671 |
| Encoded actions | /api/audit-log | unfiltered pass-through | ✓ WIRED | Verb filter matches only fixed D-T1 verbs; e2e asserts rows readable |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Groups suites | `node --test test/groups-sso.test.mjs test/groups-core.test.mjs` | 43 pass, 0 fail | ✓ PASS |
| Full suite | `npm test` | 2022 tests: 2009 pass, 0 fail, 13 skipped (pre-existing skips), 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| GS-01 | 82-01 | Lose only group-derived membership; invite/manual immune | ✓ SATISFIED | Truth 1 + passing e2e |
| GS-02 | 82-01 | Shared guard funnel, count-before-write, login succeeds | ✓ SATISFIED | Truth 2 + two passing guard e2e tests |
| GS-03 | 82-02 | Downgrades only for group-derived rows | ✓ SATISFIED | Truth 3 + side-by-side immunity e2e |
| GS-04 | 82-02 | All group-driven changes audit-logged with GUID + reason | ✓ SATISFIED | Truth 4 + migrated pins |

All four requirement IDs from ROADMAP are claimed across the two plans and verified. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None (no TBD/FIXME/XXX/HACK markers in touched files) | — | — |

### Human Verification Required

None — all truths are behavior-dependent and each is exercised by a passing e2e test in the node:test harness (full server boot, real DB, real login flows).

## Gaps Summary

None. All five ROADMAP success criteria are observably true in the codebase and proven by the test suite. SUMMARY claims were independently confirmed against server.js source and test assertions, not taken at face value.

---

_Verified: 2026-11-20T13:48:26Z_
_Verifier: the agent (gsd-verifier)_
