---
phase: 49-visibility-model-collapse-grant-materialization
verified: 2026-11-08T08:15:00Z
status: passed
score: 12/12 must-haves verified
covered_files:
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-01-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-01-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-02-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-02-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-03-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-03-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-04-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-04-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-05-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-05-SUMMARY.md
  - docs/ProjectPermissions.md
  - docs/WorkspacePermissions.md
  - mailer.js
  - mcp.js
  - server.js
  - test/helpers/visibility-fixture.mjs
  - test/invite-revision.test.mjs
  - test/mcp.test.mjs
  - test/membership.test.mjs
  - test/privacy.test.mjs
  - test/scope.test.mjs
  - test/visibility-migration.test.mjs
covered_digest: "v2:sha256:0c99a3ad40f2d0bccddaa34fe86b01f5a3d964cd4b4f077adcac3d930be9d58b"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 11/12
  gaps_closed:
    - "The one-boot sweep materializes ALL old-predicate grants (SC1: team-derived access preserved through one reboot) — CR-01 closed by 49-05"
  gaps_remaining: []
  regressions: []
gaps: []
deferred: []
---

# Phase 49: Visibility model collapse & grant materialization — Verification Report

**Phase Goal:** Access decided solely by private flag + explicit `p.members`; team intersection and Phase-29 scope grants deleted from the predicate; one-boot migration materializes every existing access path; MCP mirror in lockstep; docs rewritten.
**Verified:** 2026-11-08T08:15:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (plan 49-05 closed CR-01 + WR-01/WR-02)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Old-predicate grants materialized into `p.members` after one boot (SC1) — **including the legacy scalar `p.team` shape (CR-01)** | ✓ VERIFIED | `sweepNeeded` now detects the scalar marker (`server.js:2224` `if (p.team !== undefined) return true;`); the tx converts scalar→teams[] with the retired 2eec642 semantics (string-filter, dedup merge with any existing array) BEFORE the `pTeams` read and grants loop (`server.js:2345-2350`), then `delete p.team`. Pinned end-to-end: `p_legacyteam` fixture cell (`test/helpers/visibility-fixture.mjs:127`, scalar `team: 'engA'`, no `teams` key) with pre-boot shape pins (test/visibility-migration.test.mjs:148-151), post-sweep set-equality `['m_admin','m_corrupt','m_team']` + key deletions + stays-private (191-199), fail-open ripple extension (238). **Run live this session: migration suite 6/6 pass.** |
| 2 | Scope columns NULL everywhere after sweep, schema untouched (D-49-1) | ✓ VERIFIED | Regression check: test/visibility-migration.test.mjs:152 green in this session's run; sweep clears both columns; WR-02 fallback (`server.js:2206` returns `scopeRowCount > 0` on unparseable doc) now closes the corrupt-doc hole |
| 3 | Second boot byte-identical, exactly one pre-visibility backup (SC5, D-49-6) | ✓ VERIFIED | "second boot is byte-identical and exactly ONE pre-visibility backup exists" green in live run; the formerly-scalar cell is now explicitly covered: no `team`/`teams` key after second boot (test/visibility-migration.test.mjs:256-261) — D-49-6 extends to scalar docs, no re-migration churn |
| 4 | Predicate collapsed: `canSeeProject` = `p.private===true ? p.members.includes(memberId) : true`; `memberCanReadProject` is a pure funnel over it; no team/scope term (SC2) | ✓ VERIFIED | Regression check: server.js:753-775 unchanged; WR-01 comment fix (server.js:1069) now states the actual no-ROLE_RANK-bypass behavior — comment-only, no semantic change |
| 5 | Membership removal hides the project on next read (VIS-02) | ✓ VERIFIED | Regression check: `hiddenFor` (server.js:790-804) funnels to `canSeeProject`; membership/invite suites green in full suite |
| 6 | Non-invitee gets byte-identical 404 through doc API, file serve, MCP doors (SC3, VIS-03) | ✓ VERIFIED | Regression check: 404 body-equality rows (test/privacy.test.mjs:451-548) green in full suite |
| 7 | Reminder pass, email mirror, digest, MCP mirror all gate through `memberCanReadProject` (SC4, MIG-03) | ✓ VERIFIED | Regression check: server.js:1077, 1247, 1354, 1468 + mcp.js:182-190; parity tests green in full suite |
| 8 | MCP mirror never imports server.js | ✓ VERIFIED | Regression check: mcp.js imports only node builtins |
| 9 | No scope machinery remains repo-wide (MIG-02, D-49-2) | ✓ VERIFIED | Regression check: repo hits only in retirement comments and the sweep's own old-predicate reader |
| 10 | Docs teach the collapsed model (docs/ProjectPermissions.md) | ✓ VERIFIED | Regression check: "Une seule règle décide de l'accès : `p.private` + `p.members`" intact |
| 11 | Phase 37/38 canaries unmodified | ✓ VERIFIED | `git log -- test/due-reminders.test.mjs test/digest.test.mjs`: no phase-49 commit touched them (last touches: 44-01 and earlier) |
| 12 | Full suite green on collapsed model | ✓ VERIFIED | `npm test` run live this session: 1090 tests — 1079 pass / 0 fail / 11 env-gated skips |

**Score:** 12/12 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/helpers/visibility-fixture.mjs` | Legacy fixture matrix incl. scalar-team cell | ✓ VERIFIED | `p_legacyteam` cell added (line 127): `{ private: true, members: ['m_admin'], lead: 'm_admin', team: 'engA' }` — scalar, no `teams` key; VISIBILITY_MODEL/MIRROR_MODEL extended |
| `test/visibility-migration.test.mjs` | Set-equality, byte-identity, scope-NULL sweep pins | ✓ VERIFIED | 6 tests, all green (run live this session) |
| `server.js` sweep | `materializeVisibilityGrants()` + `sweepNeeded()` incl. scalar marker | ✓ VERIFIED | Boot wiring at server.js:1990 (before request serving); scalar detection 2224; tx normalize 2345-2350; WR-02 fallback 2206 |
| `mcp.js` mirror | `canReadProject` = collapsed private+members+admin | ✓ VERIFIED | Unchanged from prior verification; parity green |
| `docs/ProjectPermissions.md` | Collapsed-model rewrite | ✓ VERIFIED | Unchanged from prior verification |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| boot sequence | materializeVisibilityGrants() | await in migration chain | ✓ WIRED | server.js:1990 |
| scalar `p.team` marker | sweep candidate list | sweepNeeded check at 2224 | ✓ WIRED | New in 49-05 (CR-01 closure) |
| scalar `p.team` → teams[] | grants loop input | tx normalize at 2345-2350, before pTeams read | ✓ WIRED | 2eec642 semantics, dedup merge |
| team_members rows | p.members entries | inverse join + grants loop | ✓ WIRED | Regression check, unchanged |
| hiddenFor | canSeeProject | single funnel | ✓ WIRED | Regression check, unchanged |
| reminder/mirror/digest consumers | memberCanReadProject | awaited funnel calls | ✓ WIRED | Regression check, unchanged |
| mcp.js canReadProject | same semantics as server | parity test | ✓ WIRED | Parity block green in full suite |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Set-equality + byte-identity migration suite (incl. scalar cell) | `node --test test/visibility-migration.test.mjs` | 6 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 1090 tests: 1079 pass, 0 fail, 11 skips | ✓ PASS |
| Scalar marker present exactly in sweep + tx | grep `p.team !== undefined` server.js | lines 2224, 2345 (normalizeProjects untouched) | ✓ PASS |
| Commits of 49-05 exist | git log | 39c9d3f, 96adf9e, b70225e, ab22527, 778fca4 | ✓ PASS |
| Canaries untouched | git log on test/due-reminders.test.mjs, test/digest.test.mjs | no phase-49 commits | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIG-01 | 49-01, 49-02, 49-04, 49-05 | Boot migration materializes every existing access path into explicit grants | ✓ SATISFIED | Sweep verified for teams[]/scope/p.access shapes (prior) AND the scalar `p.team` shape (49-05, end-to-end pinned + executed) |
| MIG-02 | 49-02, 49-03, 49-04 | Phase-29 scope columns and machinery ignored/deleted | ✓ SATISFIED | Columns cleared + dormant, zero live machinery symbols, scope.test.mjs rewritten |
| MIG-03 | 49-01, 49-03, 49-04 | Send-time consumers and MCP mirror gate through the same helper | ✓ SATISFIED | All four consumers + mirror verified through memberCanReadProject/canReadProject; parity green |
| VIS-02 | 49-03, 49-04 | Member sees non-private projects + explicit private memberships | ✓ SATISFIED | Collapsed predicate + hiddenFor funnel; membership/invite suites green |
| VIS-03 | 49-01, 49-03, 49-04 | Non-invitee gets byte-identical 404 through every door | ✓ SATISFIED | 404 body-equality matrix rows green |

No orphaned requirements: REQUIREMENTS.md maps exactly MIG-01..03, VIS-02, VIS-03 to Phase 49, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | None blocking | — | CR-01, WR-01, WR-02 fixed (49-REVIEW-DISPOSITION.md); WR-03 + IN-01/IN-02 remain open as recorded warnings/infos — non-blocking, do not contradict the goal |

No TBD/FIXME/XXX debt markers in any phase-touched file.

### Human Verification Required

None — every behavioral claim is exercised by executed tests (migration suite run live; full suite run live once this session).

### Gaps Summary

No gaps. The single prior gap (CR-01 — sweepNeeded missed the pre-Phase-32 scalar `p.team` marker, risking silent loss of team-derived grants for docs untouched since before Phase 32) was closed by plan 49-05: detection marker, tx-side scalar→teams[] conversion reproducing the retired 2eec642 semantics, a dedicated `p_legacyteam` fixture cell, and end-to-end pins covering pre-boot shape, post-sweep set-equality, and second-boot no-churn for formerly-scalar docs (D-49-6 extended). WR-01 (comment-only) and WR-02 (corrupt-doc scope clearing) were closed in the same pass. Full suite green; no regressions detected in the quick regression check of the 11 previously-verified truths.

Remaining open review items (WR-03, IN-01, IN-02) are recorded in 49-REVIEW-DISPOSITION.md and do not block the phase goal; they are candidates for a later triage pass.

---

_Verified: 2026-11-08T08:15:00Z_
_Verifier: the agent (gsd-verifier)_
