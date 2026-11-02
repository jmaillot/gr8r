---
phase: 28-multi-team-membership
verified: 2026-11-02T00:00:00Z
status: passed
score: 13/13 must-haves verified
covered_files:
  - .planning/phases/28-multi-team-membership/28-01-PLAN.md
  - .planning/phases/28-multi-team-membership/28-01-SUMMARY.md
  - .planning/phases/28-multi-team-membership/28-02-PLAN.md
  - .planning/phases/28-multi-team-membership/28-02-SUMMARY.md
  - .planning/phases/28-multi-team-membership/28-03-PLAN.md
  - .planning/phases/28-multi-team-membership/28-03-SUMMARY.md
  - .planning/phases/28-multi-team-membership/28-04-PLAN.md
  - .planning/phases/28-multi-team-membership/28-04-SUMMARY.md
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
covered_digest: "v2:sha256:32df36ef687fc26acc3528fc2bd7ed6393b88ec828f341be80a07801b23773c4"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 13/13
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 28: Multi-Team Membership Verification Report

**Phase Goal:** A member belongs to a real *set* of teams stored in authority rows, and every surface — rosters, autocomplete, assignment, @team mentions, project visibility — reads that set instead of a single scalar.
**Verified:** 2026-11-02 (fresh digest — re-verification after phases 29–31 modified server.js and related files)
**Status:** passed
**Re-verification:** Yes — post-later-phases freshness re-verification; prior conclusions discarded, everything re-checked against current code.

## Why re-verified

Phases 29 (scoped permissions), 30 (SSO) and 31 (multi-TOTP) each modified `server.js`, `src/core/api.js` and client files after the prior 2026-11-01 verification. The old digest was stale; this report re-establishes every truth against the current codebase.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (current code) |
|---|-------|--------|------------------------|
| 1 | Two `team_members` rows per dual-team member; both rosters via projected `teams[]` | ✓ VERIFIED | `server.js:227-234` schema; `teamsOfUser()` `server.js:1377`; `syncProfiles` projection `server.js:3885, 1474-1484`; tests `membership.test.mjs:345-389, 678-709` pass |
| 2 | Legacy migration: one row per scalar member, exactly one pre-migration backup, byte-identical second boot | ✓ VERIFIED | `migrateTeamMembership()` `server.js:1706-1747` (per-row `not exists` guard, D-07 invites backfill `:1744-1747`); `migration.test.mjs` 32/32 pass (backup-first + byte-identical assertions) |
| 3 | Teamless members get zero rows, no error | ✓ VERIFIED | eligibility predicate `server.js:1712-1717` (null team never eligible); covered by migration suite |
| 4 | Admin sets full team set via one API call; non-admins gated; no doc revision claim | ✓ VERIFIED | `PUT /api/workspaces/:ws/members/:uid/teams` `server.js:3994-4029` — admin gate (`requireWorkspace(..., 'admin')`), whitelist + dedup + cap, transaction, `member.teams = teamsOfUser(...)` read-back `:4025`; `'revision' in set.data === false` pinned `membership.test.mjs:383` |
| 5 | Membership change never writes the workspace doc | ✓ VERIFIED | route comments + code `server.js:3813-3815, 3994-4006` (edits only authority rows); TEAM-05 doc-PUT interleave test `membership.test.mjs:415-443` passes |
| 6 | Teams modal assigns multiple teams; roster counts read the set | ✓ VERIFIED | `actions.js:1980-2042` (`openMemberTeams` → `api.setMemberTeams`, no adoptRevision); `teams.js:31,70-100,121-155` roster/count/delete-purge via `memberTeams()`; modal `modals.js:67-98` |
| 7 | Member edit modal multi-select team picker (D-06) | ✓ VERIFIED | `modals.js:70-98` `memberTeams` case with multi-select + scope block (phase 29 extension preserved); strings catalogued EN+FR |
| 8 | @team mention fans out via teams[] predicate; dual-team member notified once (dedup) | ✓ VERIFIED | `emitMentions` `actions.js:143-151` — `targets` is a `Set`, predicate `memberTeams(m).includes(tid)`; dedup tests `membership.test.mjs:621-652, 729` pass |
| 9 | Assignment picker never offers a member whose team set does not intersect project `teams[]` (TEAM-04) | ✓ VERIFIED | `assignableInProject()` `store.js:430-432` wrapping `memberInProjectTeams` `:421`; wired in `popovers.js:142` (subassignee) and `:160` (assignee); ctx-assign renders same case; picker-level tests `membership.test.mjs:654-675` (7 assertions incl. fails_when) pass |
| 10 | Multi-team invites end-to-end (D-07): `invites.teams` JSON column, backfill, acceptance inserts one row per team | ✓ VERIFIED | `ensureColumn(db,'invites','teams','text')` `server.js:317-319`; scalar backfill `:1720,1744-1747`; invite POST validation/serialization; acceptance `JSON.parse(invite.teams)` `:2781` + insert `:2277`; invite-lifecycle tests pass (`membership.test.mjs:512, 678-709`) |
| 11 | Invite form multi-select + project-form prefill read teams[] set | ✓ VERIFIED | `actions.js:1963` `createInvites(..., memberTeams(m))`, `:1449` prefill `teams: memberTeams(me())`, `:1796` |
| 12 | Seed data uses teams arrays, no scalar writes | ✓ VERIFIED | `src/data/seed.js:11-95` — every member seeds `teams: [...]` |
| 13 | Full suite green | ✓ VERIFIED | `npm test` → **800 pass / 0 fail / 3 skipped** (51.5s); `membership.test.mjs` 24/24, `migration.test.mjs` 32/32 re-run standalone |

**Score:** 13/13 truths verified (0 present, behavior-unverified)

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| TEAM-01 | 28-01, 28-03 | Member belongs to several teams in same workspace | ✓ SATISFIED | truths 1, 3, 4, 10 |
| TEAM-02 | 28-01, 28-02, 28-03 | Every surface reads the real set | ✓ SATISFIED | truths 1, 6, 7, 11, 12 |
| TEAM-03 | 28-02 | @team mention fanout + dedup | ✓ SATISFIED | truth 8 |
| TEAM-04 | 28-02, 28-04 | Assignment restricted to team-intersecting members | ✓ SATISFIED | truth 9 |
| TEAM-05 | 28-01, 28-02 | Membership never lives in the client-mergeable doc | ✓ SATISFIED | truths 4, 5 |

No orphaned requirements: REQUIREMENTS.md maps exactly TEAM-01..05 to Phase 28; all claimed across the four plans.

### Post-Phase-29/30/31 Regression Check

- **Phase 29 (scope)**: added `setMemberScope` beside `setMemberTeams` (api.js:396+) and a scope block inside the member modal — the membership route, predicates and pickers are unchanged and still pass. No regression observed.
- **Phase 30 (SSO) / 31 (TOTP)**: modified auth/session paths in server.js; the `members/:uid/teams` route and `team_members` authority code are intact (verified above). Full suite 800/0/3 (3 skips are pre-existing env-gated tests, unchanged).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Membership + migration suites | `node test/membership.test.mjs && node test/migration.test.mjs` | 24 + 32 pass, 0 fail | ✓ PASS |
| Full workspace suite | `npm test` | 800 pass / 0 fail / 3 skipped | ✓ PASS |

### Anti-Patterns Found

None in phase-covered files. Pre-existing eslint debt outside phase scope is recorded in `deferred-items.md` (not this phase's blocker).

### Human Verification Required

None required beyond the suite evidence: all behavior-dependent truths (dedup, concurrency/TEAM-05, migration byte-identical, picker filtering) have wired passing tests.

### Gaps Summary

None. All 13 must-haves re-verified against the current codebase after phases 29–31; no regressions introduced by later phases.

---

_Verified: 2026-11-02_
_Verifier: the agent (gsd-verifier)_
