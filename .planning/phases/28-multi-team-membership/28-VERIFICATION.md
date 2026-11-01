---
phase: 28-multi-team-membership
verified: 2026-11-01T18:55:27Z
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
covered_digest: "v2:sha256:f142cd36a68963d487b60355622d037202bee4eba3c09da93b32c1708494620a"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 12/13
  gaps_closed:
    - "The task-assignment picker never offers a member whose team set does not intersect the project's teams[] (TEAM-04, roadmap SC 3)"
  gaps_remaining: []
  regressions: []
---

# Phase 28: Multi-Team Membership Verification Report

**Phase Goal:** A member belongs to a real *set* of teams stored in authority rows, and every surface — rosters, autocomplete, assignment, @team mentions, project visibility — reads that set instead of a single scalar.
**Verified:** 2026-11-01T18:55:27Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 28-04)

## Goal Achievement

### Re-Verification of the Prior Gap (Truth 6 / TEAM-04)

Prior 28-VERIFICATION.md flagged: accessor `memberInProjectTeams` was exported but **orphaned** — the assignee/subassignee pickers listed all active members unfiltered. Plan 28-04 (gap_closure) claims the fix. Verified against actual code, not the SUMMARY:

| Check | Evidence | Result |
|---|---|---|
| Picker predicate exported | `src/core/store.js:430` — `assignableInProject(m, p, currentAssigneeId)`: unscoped project (empty `projTeams(p)`) → true; `m?.id === currentAssigneeId` → true; else `memberInProjectTeams(m, p)` | ✓ present, wraps the previously-orphaned accessor |
| Assignee picker wired | `src/overlays/popovers.js:160` — `.filter(m => m.status !== 'deactivated' && assignableInProject(m, proj(t?.project), t?.assignee))` | ✓ WIRED |
| Subassignee picker wired | `src/overlays/popovers.js:142` — `assignableInProject(m, proj(tk.project), sb.assignee)` | ✓ WIRED |
| Context-menu assign flow | `src/actions/actions.js:524` — `A.ctxAssign = ctxTo('assignee')` sets `S.ui.pop = { type: 'assignee' }`; renders the same filtered case | ✓ inherits filter |
| Picker-level test pinned | `test/membership.test.mjs:665-675` — 7 assertions: intersect / out-of-set (fails_when) / current-assignee-kept / teamless-excluded / unscoped-all / legacy-scalar / null-member | ✓ present |
| `bulk-assignee` unfiltered — intentional | `popovers.js:408-411` inline comment documents cross-project multi-selection rationale (T-28-10 scope) | ✓ documented, not a regression of the gap |
| Full suite | `npm test` → **664 pass / 0 fail / 0 skipped** (34.7s) | ✓ GREEN |

**Gap closed.** `memberInProjectTeams` is no longer orphaned; every UI assignment surface routes through `assignableInProject`.

### Observable Truths (regression + full table)

Merged from ROADMAP Success Criteria (5) and PLAN must_haves. Previously-verified truths re-checked at existence + sanity level; truth 6 re-verified at full 3-level depth.

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A member added to two teams has two `team_members` rows and appears in both rosters via projected `teams[]` (SC 1, TEAM-01/02) | ✓ VERIFIED (regression) | `server.js` team_members table+index (27 refs); `teamsByUser`/`teamsOfUser`; projection in syncProfiles; membership tests pass in suite |
| 2 | Legacy scalar DB migrates additively: one row per scalar-team member, exactly one pre-migration backup, second boot byte-identical (SC 5) | ✓ VERIFIED (regression) | `migrateTeamMembership` + `invitesEligible` guard (server.js:1461); migration.test.mjs passes |
| 3 | Teamless members get zero rows, no error | ✓ VERIFIED (regression) | Backfill guarded `team is not null` + not-exists; test asserts teamless member untouched |
| 4 | Admin can set full team set via one API call; non-admins rejected; route never writes the doc / claims a revision (TEAM-05 precondition) | ✓ VERIFIED (regression) | `PUT /members/:uid/teams` server.js:3084+ admin-gated, authority-only; membership.test.mjs asserts no `revision` in response |
| 5 | @team mention fans out to every member; member in two simultaneously mentioned teams notified exactly once (SC 2, TEAM-03) | ✓ VERIFIED (regression) | `emitMentions` src/actions/actions.js:138-146 uses `memberTeams(m).includes(tid)` into a `Set`; tests pass |
| 6 | Task-assignment picker never offers a member whose team set does not intersect the project's teams[] (SC 3, TEAM-04) | ✓ VERIFIED | **Gap closed by 28-04** — see re-verification table above |
| 7 | Concurrent doc PUT cannot clobber a membership change (SC 4, TEAM-05) | ✓ VERIFIED (regression) | Client writes only via `api.setMemberTeams` (teams.js:100, 139); server strips doc rosters; interleaving regression tests pass |
| 8 | Teams modal assigns via per-member multiselect through the API; roster counts read teams[] | ✓ VERIFIED (regression) | src/actions/teams.js:100 one `setMemberTeams` per changed member; count predicate `memberTeams(x).includes(t.id)` |
| 9 | Member edit modal offers multi-select team picker (D-06), EN+FR strings | ✓ VERIFIED (regression) | modals.js Edit-teams modal; actions.js toggle/submit; `err.changeTeam` catalogued |
| 10 | Multi-team invites end-to-end (D-07): form multi-select, `invites.teams` column, acceptance inserts one row per team in same transaction | ✓ VERIFIED (regression) | `ensureColumn(db,'invites','teams','text')` server.js:262; invite UI `invTeamToggle`; acceptance parses `invites.teams` |
| 11 | Scalar `invites.team` backfilled in the Plan 01 migration pass; nothing reads the scalar afterward | ✓ VERIFIED (regression) | `invitesEligible` at server.js:1461; remaining scalar reads are tolerance-only accessors |
| 12 | Full suite green, zero new runtime dependencies | ✓ VERIFIED | `npm test`: **664 pass / 0 fail / 0 skipped** (34.7s) — rerun in this verification |
| 13 | Seed data uses teams arrays, not scalar | ✓ VERIFIED (regression) | src/data/seed.js emits `teams: [...]` per member |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` team_members table + index | authority rows | ✓ VERIFIED | regression check |
| `server.js` migrateTeamMembership() | guarded backfill incl. invites scalar | ✓ VERIFIED | regression check |
| `server.js` PUT /members/:uid/teams | admin-gated edit route | ✓ VERIFIED | server.js:3084 |
| `src/core/store.js` memberInProjectTeams | intersection accessor | ✓ VERIFIED | line 421 |
| `src/core/store.js` assignableInProject | picker-level predicate (new, 28-04) | ✓ VERIFIED | line 430, substantive + JSDoc |
| `src/overlays/popovers.js` | filtered picker option sources | ✓ VERIFIED | lines 142, 160 |
| `src/actions/teams.js` | per-member API writes | ✓ VERIFIED | lines 100, 139 |
| `test/membership.test.mjs` | TEAM-01..05 coverage incl. picker predicate | ✓ VERIFIED | test block at 665-675 |
| `test/migration.test.mjs` | migration pinning | ✓ VERIFIED | passes in suite |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| popovers.js case 'assignee'/'subassignee' | store.js memberInProjectTeams | assignableInProject filter | ✓ WIRED | verified in source |
| actions.js ctxTo('assignee') | popovers.js case 'assignee' | S.ui.pop type | ✓ WIRED | same rendered case |
| teams.js modal | server.js PUT /members/:uid/teams | api.setMemberTeams | ✓ WIRED | regression |
| actions.js emitMentions | memberTeams authority rows | memberTeams(m).includes(tid) | ✓ WIRED | regression |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite green | `npm test` | 664 pass / 0 fail / 0 skipped | ✓ PASS |

### Probe Execution

No project probes declared (no `scripts/*/tests/probe-*.sh` convention in this repo) — SKIPPED.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TEAM-01 | 28-01 | Multi-team membership in authority rows, additive migration + backup + byte-identical second boot, role ladder unchanged | ✓ SATISFIED | Truths 1-3; migration tests pass |
| TEAM-02 | 28-01/02/03 | Every surface reads the real set: rosters, autocomplete, project visibility | ✓ SATISFIED | Truths 1, 8, 9, 13 |
| TEAM-03 | 28-02 | @team mention fan-out with dedup across overlapping teams | ✓ SATISFIED | Truth 5 |
| TEAM-04 | 28-02 + **28-04 gap closure** | Assignment restricted to team-intersecting members; picker offers no one who cannot see the project | ✓ SATISFIED | Truth 6 — closed this round |
| TEAM-05 | 28-03 | Membership never in the client-mergeable doc; concurrency regression test | ✓ SATISFIED | Truths 4, 7 |

All five phase requirement IDs accounted for; REQUIREMENTS.md traceability maps exactly TEAM-01..05 → Phase 28. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| src/overlays/popovers.js | 408-411 | unfiltered member list in `bulk-assignee` | ℹ️ Info | Intentional + documented inline (cross-project bulk selection); outside truth-6 scope |

No TBD/FIXME/XXX debt markers in phase-modified files.

### Human Verification Required

None. All truths have codebase + behavioral-test evidence; the picker filter is pinned by the named TEAM-04 predicate test block (membership.test.mjs:665) exercised in the passing suite.

### Gaps Summary

None. The single prior gap (TEAM-04 orphaned accessor) was closed by Plan 28-04 exactly as planned: the `assignableInProject` predicate wraps `memberInProjectTeams`, both assignment pickers and the context-menu flow filter through it, and the picker-level behavior is pinned by 7 named test assertions. Full suite green at 664/0.

---

_Verified: 2026-11-01T18:55:27Z_
_Verifier: the agent (gsd-verifier)_
