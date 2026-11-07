---
phase: 49-visibility-model-collapse-grant-materialization
verified: 2026-11-07T12:00:00Z
status: gaps_found
score: 11/12 must-haves verified
covered_files:
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-01-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-01-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-02-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-02-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-03-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-03-SUMMARY.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-04-PLAN.md
  - .planning/phases/49-visibility-model-collapse-grant-materialization/49-04-SUMMARY.md
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
covered_digest: "v2:sha256:8551993a8d2c245b815e4a01272dbc524dc471ed02d7c0ceb637e8f122452804"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The one-boot sweep materializes ALL old-predicate grants (SC1: team-derived access preserved through one reboot)"
    status: partial
    reason: "CR-01 (critical, open in 49-REVIEW-DISPOSITION.md): sweepNeeded() detects p.teams arrays and p.access but NOT the pre-Phase-32 scalar p.team marker, and Phase 49 retired the scalar→teams[] migration that used to live in normalizeProjects. A workspace doc untouched since before Phase 32 (never served by a ≥32 server) keeps its scalar p.team on disk; the sweep does not fire on it, no pre-visibility backup is taken, and after the boot its team-derived grants are silently lost. Independently confirmed: old code at 2eec642:server.js:918-920 held the scalar migration; new normalizeProjects (server.js:809-840) retired it; sweepNeeded (server.js:2194-2216) has no scalar check; the 13-cell fixture matrix (test/helpers/visibility-fixture.mjs) uses only the post-32 teams[] shape, so no fixture covers this cell. Narrow reach (requires a workspace inactive since pre-Phase-32) but it directly contradicts the goal's 'materializes ALL old-predicate grants'."
    artifacts:
      - path: server.js
        issue: "sweepNeeded (server.js:2194-2216) misses the legacy scalar p.team marker; tx body (server.js:2325) reads only p.teams"
      - path: test/helpers/visibility-fixture.mjs
        issue: "No scalar-p.team legacy cell in the 13-cell matrix — the loss path is untested"
    missing:
      - "Add `if (p.team !== undefined) return true;` to sweepNeeded and a scalar→teams[] normalize inside the sweep tx (or re-add the migration to normalizeProjects with a dated comment) so pre-32 docs fire the sweep and keep their grants"
      - "Add a scalar-p.team fixture cell to visibility-fixture.mjs pinning set-equality for that shape"
deferred: []
---

# Phase 49: Visibility model collapse & grant materialization — Verification Report

**Phase Goal:** Access decided solely by private flag + explicit `p.members`; team intersection and Phase-29 scope grants deleted from the predicate; one-boot migration materializes every existing access path; MCP mirror in lockstep; docs rewritten.
**Verified:** 2026-11-07T12:00:00Z
**Status:** gaps_found (1 gap — CR-01 sweep-miss; all five ROADMAP success criteria otherwise verified with executed tests)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Old-predicate grants materialized into `p.members` after one boot (SC1) | ✗ PARTIAL | Set-equality + byte-identity suite green (6/6, run live), BUT the legacy scalar `p.team` shape is not detected by `sweepNeeded` — CR-01, see Gaps Summary |
| 2 | Scope columns NULL everywhere after sweep, schema untouched (D-49-1) | ✓ VERIFIED | test/visibility-migration.test.mjs:152 green; ensureColumns retained; sweep clears both columns (server.js:2287+) |
| 3 | Second boot byte-identical, exactly one pre-visibility backup (SC5, D-49-6) | ✓ VERIFIED | test/visibility-migration.test.mjs:230 green (run live) |
| 4 | Predicate collapsed: `canSeeProject` = `p.private===true ? p.members.includes(memberId) : true`; `memberCanReadProject` is a pure funnel over it; no team/scope term (SC2) | ✓ VERIFIED | server.js:753-775 read directly; grep confirms zero live `projectScope/inScopeProject/scopeGrants/teamIntersects` symbols (hits are retirement comments only) |
| 5 | Membership removal hides the project on next read (VIS-02) | ✓ VERIFIED | `hiddenFor` (server.js:790-804) funnels to `canSeeProject` live per read; test/scope.test.mjs rewritten to collapsed truth table, green in full suite |
| 6 | Non-invitee gets byte-identical 404 through doc API, file serve, MCP doors (SC3, VIS-03) | ✓ VERIFIED | 404 body-equality rows test/privacy.test.mjs:451-548 (`hidden.body === ghost.body` assertions) green in full suite |
| 7 | Reminder pass, email mirror, digest, MCP mirror all gate through `memberCanReadProject` (SC4, MIG-03) | ✓ VERIFIED | server.js:1077, 1247, 1354, 1468 all call the collapsed funnel; mcp.js:182-190 `canReadProject` rewritten with identical semantics; parity tests test/mcp.test.mjs:605-753 green |
| 8 | MCP mirror never imports server.js | ✓ VERIFIED | mcp.js imports only node builtins |
| 9 | No scope machinery remains repo-wide (MIG-02, D-49-2) | ✓ VERIFIED | Repo grep: hits only in retirement comments (server.js), the sweep's own old-predicate reader (expected), and doc/comment text in mailer.js:695 + fixture helper |
| 10 | Docs teach the collapsed model (docs/ProjectPermissions.md) | ✓ VERIFIED | docs/ProjectPermissions.md:61-68 — "Une seule règle décide de l'accès : `p.private` + `p.members`", old paths described as suppressed; file/line refs match real code |
| 11 | Phase 37/38 canaries unmodified | ✓ VERIFIED | `git log --grep 49-0` on test/due-reminders.test.mjs + test/digest.test.mjs: no phase-49 commit touched them; last touches predate the phase |
| 12 | Full suite green on collapsed model | ✓ VERIFIED | `npm test` run live: 1090 tests — 1079 pass / 0 fail / 11 env-gated skips |

**Score:** 11/12 truths verified (truth 1 partial → gap)

**Note:** Full suite was executed once in this verification (66s, 0 fail) — the claim in the orchestrator context matches observed output exactly.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/helpers/visibility-fixture.mjs` | 13-cell actor × project legacy fixture builder | ✓ VERIFIED | Present, 7 actors × 13 projects incl. teamshare, scopeteam, sealed, publicgain cells (missing scalar-team cell — see gap) |
| `test/visibility-migration.test.mjs` | Set-equality, byte-identity, scope-NULL sweep pins | ✓ VERIFIED | 6 tests, all green (run live) |
| `server.js` sweep | `materializeVisibilityGrants()` + `sweepNeeded()` wired before request serving | ✓ VERIFIED | Boot calls `await materializeVisibilityGrants()` at server.js:1988 inside migration sequence, before `ensureAdmin`; guarded/transactional/backup logic present at 2194-2380 |
| `mcp.js` mirror | `canReadProject` = collapsed private+members+admin | ✓ VERIFIED | mcp.js:182-190, semantics match server predicate, no server.js import |
| `docs/ProjectPermissions.md` | Collapsed-model rewrite | ✓ VERIFIED | See truth 10 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| boot sequence | materializeVisibilityGrants() | await in migration chain | ✓ WIRED | server.js:1988, before any request served |
| team_members rows | p.members entries | inverse join via userToMember map | ✓ WIRED | server.js:2273-2277 + grants loop 2336-2345 |
| hiddenFor | canSeeProject | single funnel | ✓ WIRED | server.js:790-804 |
| reminder/mirror/digest consumers | memberCanReadProject | awaited funnel calls | ✓ WIRED | server.js:1077, 1247, 1354, 1468 |
| mcp.js canReadProject | same semantics as server | parity test | ✓ WIRED | test/mcp.test.mjs parity block green |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Set-equality + byte-identity migration suite | `node --test test/visibility-migration.test.mjs` | 6 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 1090 tests: 1079 pass, 0 fail, 11 skips | ✓ PASS |
| No TODO/FIXME in touched files | grep -E "TODO\|FIXME\|XXX" (9 files) | zero hits | ✓ PASS |
| No new runtime dependencies | package.json dependencies | `{"pg":"^8.23.1"}` (pre-existing) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| MIG-01 | 49-01, 49-02, 49-04 | Boot migration materializes every existing access path into explicit grants | ⚠️ PARTIAL | Sweep verified for team[]/scope/p.access shapes (tests green); scalar `p.team` legacy shape missed (CR-01 gap) |
| MIG-02 | 49-02, 49-03, 49-04 | Phase-29 scope columns and machinery ignored/deleted | ✓ SATISFIED | Columns cleared + dormant, zero live machinery symbols, scope.test.mjs rewritten |
| MIG-03 | 49-01, 49-03, 49-04 | Send-time consumers and MCP mirror gate through the same helper | ✓ SATISFIED | All four consumers + mirror verified through memberCanReadProject/canReadProject; parity green |
| VIS-02 | 49-03, 49-04 | Member sees non-private projects + explicit private memberships | ✓ SATISFIED | Collapsed predicate + hiddenFor funnel; membership/invite suites green |
| VIS-03 | 49-01, 49-03, 49-04 | Non-invitee gets byte-identical 404 through every door | ✓ SATISFIED | 404 body-equality matrix rows (privacy.test.mjs:451-548) green |

No orphaned requirements: REQUIREMENTS.md maps exactly MIG-01..03, VIS-02, VIS-03 to Phase 49, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 2194-2216 | sweepNeeded misses legacy scalar `p.team` marker (CR-01) | 🛑 Blocker (review-critical, open) | Team-derived grants silently lost for pre-Phase-32 docs; no backup taken |
| server.js | 2201 | sweepNeeded short-circuits on unreadable doc, drops scope-row check (WR-02) | ⚠️ Warning | Corrupt-doc workspaces never get scope columns cleared |
| server.js | ~1077 | Assignee guard blocks admin/owner assignees on private projects (WR-01) | ⚠️ Warning | Behavior change justified by a factually wrong comment |
| server.js | doc PUT | Dangling project id rejects entire doc PUT for every assignee (WR-03) | ⚠️ Warning | Availability regression, recorded open |

No TBD/FIXME/XXX debt markers in any phase-touched file.

### Human Verification Required

None — all behavioral claims were exercised by executed tests (full suite + targeted suites).

### Gaps Summary

One gap blocks a clean pass: **CR-01 (critical, open in 49-REVIEW-DISPOSITION.md)** — the sweep's detection function does not recognize the pre-Phase-32 scalar `p.team` project marker, and Phase 49 simultaneously retired the normalizeProjects migration that used to convert it. The result: a workspace document untouched since before Phase 32 fires no sweep, takes no backup, and loses its team-derived grants on first post-49 read. I independently confirmed each element of the finding (old code at `2eec642:server.js:918-920`; new normalizeProjects at server.js:809-840; sweepNeeded at server.js:2194-2216; fixture matrix lacks a scalar-team cell). Reach is narrow — any doc served by a ≥Phase-32 server is already migrated — but the phase goal says "materializes **all** old-predicate grants," and this is one legacy path it does not.

The fix is small (one sweepNeeded marker + one tx-body normalize or fixture cell), so this is repairable in a focused gap plan rather than a rework.

**This gap has a cheap, well-scoped fix. If the maintainer judges pre-Phase-32 docs unreachable in this deployment, an override accepting the deviation is defensible**:

```yaml
overrides:
  - must_have: "The one-boot sweep materializes ALL old-predicate grants (SC1: team-derived access preserved through one reboot)"
    reason: "Scalar p.team docs require a workspace untouched since pre-Phase-32; normalizeProjects migrated every served doc between Phase 32 and 48"
    accepted_by: "{name}"
    accepted_at: "{ISO timestamp}"
```

Warnings WR-01/WR-02/WR-03 and infos IN-01/IN-02 are recorded open in 49-REVIEW-DISPOSITION.md and do not block the goal; they should be triaged in the same pass.

---

_Verified: 2026-11-07T12:00:00Z_
_Verifier: the agent (gsd-verifier)_
