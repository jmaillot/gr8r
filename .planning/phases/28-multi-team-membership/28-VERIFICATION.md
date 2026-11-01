---
phase: 28-multi-team-membership
verified: 2026-11-01T00:00:00Z
status: gaps_found
score: 12/13 must-haves verified
covered_files:
  - .planning/phases/28-multi-team-membership/28-01-PLAN.md
  - .planning/phases/28-multi-team-membership/28-01-SUMMARY.md
  - .planning/phases/28-multi-team-membership/28-02-PLAN.md
  - .planning/phases/28-multi-team-membership/28-02-SUMMARY.md
  - .planning/phases/28-multi-team-membership/28-03-PLAN.md
  - .planning/phases/28-multi-team-membership/28-03-SUMMARY.md
  - server.js
  - src/core/api.js
  - src/core/store.js
  - src/actions/teams.js
  - src/actions/actions.js
  - src/data/seed.js
  - src/overlays/popovers.js
  - src/overlays/modals.js
  - src/overlays/drawer.js
  - src/pages/members.js
  - test/membership.test.mjs
  - test/migration.test.mjs
covered_digest: "v2:09be1d9eddc07a8b0569d0d93482c0b38267db6c72521c4dd07fa8c50b130013"
behavior_unverified: 0
overrides_applied: 0
gaps:
  - truth: "The task-assignment picker never offers a member whose team set does not intersect the project's teams[] (TEAM-04, roadmap SC 3)"
    status: failed
    reason: "The shared accessor memberInProjectTeams(m,p) exists (src/core/store.js:421) and passes its unit test, but is ORPHANED — no assignment surface imports or calls it. The assignee picker (src/overlays/popovers.js, case 'assignee') lists every active member with status !== 'deactivated' and no team-intersection filter; the same unfiltered list feeds 'subassignee' and the context-menu assign flow (A.ctxAssign → ctxTo('assignee')). No server-side guard compensates. 28-02-SUMMARY claims 'memberInProjectTeams feeds the TEAM-04 intersection' — the codebase contradicts this."
    artifacts:
      - path: src/core/store.js
        issue: "memberInProjectTeams exported but never imported by any UI module (verified by grep across src/)"
      - path: src/overlays/popovers.js
        issue: "case 'assignee' (and 'subassignee') renders D().members filtered only on status, no memberInProjectTeams / memberTeams ∩ projTeams predicate"
    missing:
      - "Filter the assignee (and subassignee) picker options through memberInProjectTeams(m, taskProject) so out-of-set members are never offered"
      - "Extend the TEAM-04 test beyond the unit accessor to pin the picker-level filter (e.g. the picker's option-building predicate)"
---

# Phase 28: Multi-Team Membership Verification Report

**Phase Goal:** A member belongs to a real *set* of teams stored in authority rows, and every surface — rosters, autocomplete, assignment, @team mentions, project visibility — reads that set instead of a single scalar.
**Verified:** 2026-11-01
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Merged from ROADMAP Success Criteria (5) and PLAN must_haves (deduplicated against SCs).

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A member added to two teams has two `team_members` rows and appears in both rosters via projected `teams[]` (SC 1, TEAM-01/02) | ✓ VERIFIED | `server.js:170-177` table+index; `teamsByUser`/`teamsOfUser` (1134-1150); projection in `syncProfiles` (3024) and `memberProfile` teamMap (1223); composite test membership.test.mjs:665+ passes |
| 2 | Legacy scalar DB migrates additively: one row per scalar-team member, exactly one pre-migration backup, second boot byte-identical (SC 5) | ✓ VERIFIED | `migrateTeamMembership` server.js:1447-1490 with eligible-guard; migration.test.mjs:133, 148, 439 all pass |
| 3 | Teamless members get zero rows, no error | ✓ VERIFIED | Backfill guarded by `team is not null` + not-exists subquery (1453, 1481); test asserts teamless member untouched |
| 4 | Admin can set full team set via one API call; non-admins rejected; route never writes the doc / claims a revision (TEAM-05 precondition) | ✓ VERIFIED | `PUT /members/:uid/teams` server.js:3118-3157 (`requireWorkspace(...,'admin')`, Set-dedup, whitelist, cap 25, authority-only transaction); test membership.test.mjs:383 asserts `'revision' in set.data === false` |
| 5 | @team mention fans out to every member; member in two simultaneously mentioned teams notified exactly once (SC 2, TEAM-03) | ✓ VERIFIED | `emitMentions` src/actions/actions.js:146 `memberTeams(m).includes(tid)` into a `Set`; tests at 621, 640, 716 pass |
| 6 | Task-assignment picker never offers a member whose team set does not intersect the project's teams[] (SC 3, TEAM-04) | ✗ FAILED | Accessor `memberInProjectTeams` (store.js:421) is orphaned — the assignee/subassignee pickers (src/overlays/popovers.js) list all active members unfiltered. See Gaps. |
| 7 | Concurrent doc PUT cannot clobber a membership change (SC 4, TEAM-05) | ✓ VERIFIED | Client writes membership only via `api.setMemberTeams` (teams.js:100, 139); server strips doc rosters on read (server.js:523, 1220-1230); interleaving regression tests at membership.test.mjs:443, 698 pass |
| 8 | Teams modal assigns via per-member multiselect through the API; roster counts read teams[] | ✓ VERIFIED | src/actions/teams.js:98-100 fires one `api.setMemberTeams` per changed member; count predicate `memberTeams(x).includes(t.id)` (teams.js:31, 121) |
| 9 | Member edit modal offers multi-select team picker (D-06), EN+FR strings | ✓ VERIFIED | modals.js:71 Edit-teams modal, actions.js:1899/1907 toggle state, actions.js:1887 submits via `api.createInvites`/setMemberTeams path; `err.changeTeam` catalogued |
| 10 | Multi-team invites end-to-end (D-07): form multi-select, `invites.teams` column, acceptance inserts one row per team in same transaction | ✓ VERIFIED | Column via SCHEMA+ensureColumn (server.js:262); POST validation mirrors PUT route (3228-3260); `addMembership` inserts per team inside existing transaction (1944-1951); acceptance parses `invites.teams` (3412); invite UI `invTeamToggle` + prefill `memberTeams(me())` (actions.js:1429) |
| 11 | Scalar `invites.team` backfilled in the Plan 01 migration pass; nothing reads the scalar afterward | ✓ VERIFIED | Backfill server.js:1485-1490 (same pass, same once-guard); remaining scalar reads are tolerance-only accessors (store.js:405/414) or backfill eligibility queries |
| 12 | Full suite green, zero new runtime dependencies | ✓ VERIFIED | `npm test`: 663 pass / 0 fail (34s), including membership + migration suites |
| 13 | Seed data uses teams arrays, not scalar | ✓ VERIFIED | src/data/seed.js emits `teams: [...]` per member |

**Score:** 12/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` team_members table + index | authority rows | ✓ VERIFIED | lines 170-177 |
| `server.js` migrateTeamMembership() | guarded backfill | ✓ VERIFIED | line 1447 |
| `server.js` teamsOfUser/teamsByUser | join-table read helper | ✓ VERIFIED | lines 1134-1150 |
| `server.js` PUT /members/:uid/teams | admin-gated edit route | ✓ VERIFIED | line 3118 |
| server teams[] projection | memberProfile/memberPayload/syncProfiles | ✓ VERIFIED | lines 1220-1230, 3024 |
| src/core/api.js setMemberTeams | API wrapper | ✓ VERIFIED | line 348 |
| src/core/store.js memberTeams(m) | tolerant accessor | ✓ VERIFIED | line 411 |
| src/actions/teams.js multiselect handlers | API-backed membership edits | ✓ VERIFIED | lines 85-139 |
| src/actions/actions.js member picker + emitMentions predicate | teams[]-based | ✓ VERIFIED | lines 146, 1899-1907 |
| src/data/seed.js teams arrays | scalar replaced | ✓ VERIFIED | all members |
| src/core/store.js memberInProjectTeams(m,p) | TEAM-04 intersection | ⚠️ ORPHANED | exported, unit-tested, never used by any picker |
| test/membership.test.mjs | authority/dedup/intersection/regression | ✓ VERIFIED | 23 tests pass |
| test/migration.test.mjs | backfill + byte-identical boot | ✓ VERIFIED | 31 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| api.setMemberTeams (src/core/api.js:348) | PUT route (server.js:3118) | fetch | ✓ WIRED | teams.js:100/139 call it; route edits authority rows only |
| teamsByUser/teamsOfUser | teams[] projection | syncProfiles | ✓ WIRED | server.js:1223, 3024, 3157 |
| memberTeams(m) | emitMentions predicate | Set dedup | ✓ WIRED | actions.js:146 |
| memberTeams(m) | teams.js roster read/count/purge | — | ✓ WIRED | teams.js:31, 85, 98, 121, 135 |
| memberTeams(m) | assignment-picker intersection | memberInProjectTeams | ✗ NOT_WIRED | accessor never imported by any picker UI |
| invite POST | invites.teams → team_members rows | same transaction | ✓ WIRED | server.js:3278, 3412, 1944-1951 |
| migrateTeamMembership | invites scalar→array backfill | same pass/once-guard | ✓ WIRED | server.js:1461, 1485-1490 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Membership + migration suites | `node --test test/membership.test.mjs test/migration.test.mjs` | 52 pass / 0 fail | ✓ PASS |
| Full suite | `npm test` | 663 pass / 0 fail | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| TEAM-01 | 28-01, 28-03 | Member belongs to several teams; authority rows; additive migration | ✓ SATISFIED | truths 1, 2, 3, 10 |
| TEAM-02 | 28-02, 28-03 | Every surface reads the real set | ✓ SATISFIED (picker caveat) | truths 8, 9, 10 |
| TEAM-03 | 28-02 | @team mentions fan out; dedup | ✓ SATISFIED | truth 5 |
| TEAM-04 | 28-02 | Assignment restricted to team-set intersection | ✗ BLOCKED | truth 6 — accessor orphaned, picker unfiltered |
| TEAM-05 | 28-01, 28-02 | Membership never in client-mergeable doc | ✓ SATISFIED | truths 4, 7 |

All five requirement IDs declared in plans are accounted for; no orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/core/store.js | 421 | Exported function never used in production code | 🛑 Blocker (as gap root) | TEAM-04 picker filter missing |
| src/overlays/popovers.js | 154-166 | Picker builds options from all active members | 🛑 Blocker (as gap root) | Out-of-set members offered for assignment |
| src/overlays/drawer.js | 131 | `m.team` literal flag (false) for member rows in mention list | ℹ️ Info | UI category flag, not a scalar-membership read |
| src/core/store.js | 405, 414 | Scalar `.team` reads | ℹ️ Info | Intentional legacy tolerance in projTeams/memberTeams accessors |

No TBD/FIXME/XXX debt markers in phase-touched files.

### Human Verification Required

None beyond the gap above — remaining truths are pinned by passing behavioral tests.

### Gaps Summary

One gap blocks the phase goal. The **assignment picker (TEAM-04)** does not filter by team intersection: `memberInProjectTeams(m, p)` was built and unit-tested but never wired into any assignment surface — the assignee popover, subassignee popover, and context-menu assign flow all offer every active member regardless of the project's `teams[]`. The 28-02 SUMMARY claims the accessor "feeds the TEAM-04 intersection"; grep across `src/` shows zero production call sites. This was exactly the failure mode the phase set out to eliminate: the set accessor exists, but a surface still does not read it.

Not deferred: no later milestone phase covers assignment-intersection wiring (Phase 29 is scope-based permissions, a different mechanism).

**Fix shape:** filter picker options through `memberInProjectTeams(m, proj(t))` (decide behavior for projects with empty `teams[]` — likely "everyone" or "no one", matching D-decisions), and extend the TEAM-04 test to pin the picker-level predicate.

---

_Verified: 2026-11-01_
_Verifier: the agent (gsd-verifier)_
