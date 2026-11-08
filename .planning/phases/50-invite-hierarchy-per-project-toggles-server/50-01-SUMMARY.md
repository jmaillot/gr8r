---
phase: 50-invite-hierarchy-per-project-toggles-server
plan: 01
subsystem: visibility
tags: [visibility, teams, mcp, migration-retirement, authz]
requires: [Phase 49 collapsed visibility funnel, team_members authority rows]
provides: [D-50-5 live team-link term in server+mcp funnels, p.teams/p.allowInviteGuests mergeClientDoc pinning, sweep-free boot]
affects: [50-02 reverse-sweep migration, 50-03 route changes, 51 client surfaces]
tech-stack:
  added: []
  patterns: [single-visibility-predicate, live-predicate-resolution-no-cache, anti-tautology hand-derived fixture oracle]
key-files:
  created: [test/visibility-team.test.mjs]
  modified: [server.js, mcp.js, test/helpers/visibility-fixture.mjs, test/visibility-migration.test.mjs, test/mcp.test.mjs]
key-decisions:
  - "D-50-5 'live' = predicate reads current p.teams + current team_members on every evaluation, no cache — join/leave effect on the next request"
  - "Admin/owner doc-GET path stays access-list-gated (hiddenProjectIds without team term); mcp.js mirror keeps its ROLE_RANK bypass (documented drift preserved per RESEARCH OQ2)"
  - "Phase 49 sweep fully deleted (not gated off) — zero materializeVisibilityGrants/sweepNeeded symbols; scope columns dormant-on-disk, never read"
  - "normalizeProjects untouched: no teams:[] re-add (D-49-6 no-churn); the scalar p.team key is dead (nothing converts it)"
requirements-completed: [INV-03]
estimate: { tokens: 90000, raw_tokens: 60000, tasks: 3, confidence: med }
actuals:
  tokens: 58000
  tasks: 3
  commits: 1
plan_head_before: 6f278dd21f1732ef06a5caaca7c124c2df3283b5
plan_head_after: 4be4f6bd  # see git for full hash
commits: 1
duration: ~35 min
completed: 2026-11-08
status: complete
---

# Phase 50 Plan 01: Live team link as third visibility term Summary

The D-50-5 predicate — `public ∨ memberId ∈ p.members ∨ member's LIVE team ∈ p.teams` — is restored in server.js's funnel (canSeeProject / memberCanReadProject / hiddenFor) and mirrored in the same commit into mcp.js canReadProject, with the Phase 49 grant-materialization sweep fully retired so no boot path can ever delete p.teams.

## Accomplishments

- **Funnel team term (server.js):** new module-scope `teamsOfMember(wsId, memberId, membershipRow)` resolves member_id → memberships.user_id → live team_members rows; `canSeeProject(p, memberId, memberTeams)` intersects with p.teams; `memberCanReadProject` stays async and short-circuits (no DB query) when p has no teams; `hiddenFor` resolves the member's teams once per evaluation from the membership row it already holds. No memoization anywhere (D-50-3).
- **MCP mirror lockstep (mcp.js):** `canReadProject` gains the identical team term (team_members by ctx.membership.user_id), same commit as the server funnel — no over/under-permissive window. Admin/owner ROLE_RANK bypass preserved (documented drift).
- **Pinning (T-50-01):** mergeClientDoc's non-manager block now also pins `p.teams` and `p.allowInviteGuests` to the stored row — a stale client doc PUT can never delete a team link or flip the invite toggle.
- **Sweep retirement:** `materializeVisibilityGrants` and `sweepNeeded` deleted; the bootstrap call site removed (grep count = 0). The scope columns stay dormant-on-disk, read by nothing.
- **Fixture oracle (anti-tautology):** `p_teamboth` added (team-linked AND individually listed — the unless-clause cell); `p_publicgain` carries `teams:['engA']` (team-linked public, inert); VISIBILITY_MODEL / MIRROR_MODEL re-derived BY HAND for D-50-5; Phase 49 POST_SWEEP deltas and postSweepIds deleted.
- **Integration tests:** new test/visibility-team.test.mjs — team join grants on the next request; deleting the team_members row revokes with a byte-identical (modulo echoed id) not-found on the mirror door; individual p.members entry survives a team leave and restores access with no team link; second boot is a byte-identical no-op with p.teams intact; a non-manager PUT cannot mutate p.teams / p.allowInviteGuests.
- **Migration-test pins flipped to the retirement posture:** boot 1 clears nothing (dormant scope values pinned), p.teams / p.access / scalar p.team survive on disk, no grants materialized, ZERO pre-visibility backups after two boots, D-50-5 set-equality per actor.

## Coverage

- verification: { kind: tests, ref: "test/visibility-team.test.mjs#team join grants live access", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-team.test.mjs#leaving the team revokes ... byte-identical 404, unless individually listed", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-team.test.mjs#stale client doc PUT cannot delete p.teams or flip p.allowInviteGuests", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/visibility-migration.test.mjs#D-50-5 set-equality per actor", status: pass, human_judgment: false }
- verification: { kind: tests, ref: "test/mcp.test.mjs#parity: non-admin actors agree across BOTH engines on every team-link cell", status: pass, human_judgment: false }
- verification: { kind: command, ref: "grep -cE 'materializeVisibilityGrants|sweepNeeded' server.js → 0", status: pass, human_judgment: false }
- verification: { kind: command, ref: "npm test → 1095 tests, 0 fail (11 pre-existing skips)", status: pass, human_judgment: false }

## Deviations from Plan

**1. [Task-boundary] Task 2's two pins co-landed in Task 1's tracer commit**
- **Found during:** Task 1 (tracer)
- **Issue:** the tracer (fixture cells first, then funnel+mirror+pinning) naturally included the second-boot no-churn and stale-PUT pins in test/visibility-team.test.mjs, and the team-term parity cells were rewritten into test/mcp.test.mjs in the same pass.
- **Fix:** none needed — Task 2's `<verify>` re-run green on the committed state; no separate Task 2 commit exists (commit 4be4f6b covers Tasks 1+2).
- **Verification:** `node --test test/visibility-team.test.mjs` → 5 pass / 0 fail.
- **Commit:** 4be4f6b

**2. [Rule 1 - Test] visibility-migration "boot 1 writes nothing" byte-identity assertion softened**
- **Found during:** Task 1
- **Issue:** the planted m_corrupt doc profile is appended by the pre-existing backfillMemberships ensureMember pass at boot (untouched by this plan), so a whole-doc byte-equality against the fixture was too strong.
- **Fix:** pinned the visibility state instead (scope values, revision, and full second-boot doc byte-identity).
- **Files modified:** test/visibility-migration.test.mjs
- **Commit:** 4be4f6b

**Total deviations:** 2 (1 task-boundary, 1 test auto-fix). **Impact:** none on the plan's truths; all four must_haves verified.

**Task 3 produced no code changes** (residual-gate task): grep counts and full suite verified; no commit.

## Authentication Gates

None.

## Known Stubs

None.

## Self-Check: PASSED

- test/visibility-team.test.mjs exists on disk.
- Commit 4be4f6b present in git log.
- All plan `<verification>` commands re-run green (see Coverage).

## Next

Ready for 50-02 (reverse-sweep migration) — this plan's predicate change gates it.
