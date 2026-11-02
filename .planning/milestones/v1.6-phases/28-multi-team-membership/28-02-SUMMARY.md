---
phase: 28-multi-team-membership
plan: 02
subsystem: client-membership
tags: [teams, mentions, assignment-intersection, seed, regression-tests]
requires: [28-01]
provides:
  - memberTeams(m)/memberInProjectTeams(m,p) shared client accessors (src/core/store.js)
  - Teams modal per-member multiselect over api.setMemberTeams + delete purge
  - Member edit-teams modal (D-06) on the member context menu
  - emitMentions fan-out over the teams[] set (TEAM-03 dedup)
  - Scalar-team sweep across actions.js + members page
  - TEAM-03/04/05 behavioral tests + aligned seeds
affects: [28-03, phase 29 (reads the same team set client-side)]
tech-stack:
  added: []
  patterns: [scalar→array tolerant accessor, optimistic-write-with-server-authority, revisionless membership calls]
key-files:
  created: []
  modified:
    - src/actions/teams.js
    - src/actions/actions.js
    - src/core/store.js
    - src/data/seed.js
    - src/features/teams.js
    - src/pages/members.js
    - src/overlays/modals.js
    - src/overlays/context-menu.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/membership.test.mjs
    - test/i18n-overlays.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-core-features.test.mjs
    - test/error-codes.test.mjs
decisions:
  - "D-06 realized as a member-context-menu Edit-teams modal (the codebase has no member edit modal; role edits live in a context popover) — same data, same API, person-centric mirror of the teams modal"
  - "Demo (api-disabled) mode writes member.teams arrays locally; server mode treats the API as the sole authority with optimistic revert on failure"
  - "refreshMembers projects row.teams (never the retired scalar) into doc profiles"
  - "delTeam purges authority rows BEFORE the doc team removal; undo restores the doc but not the purge (same irreversibility class as role changes — deferred-items.md)"
metrics:
  duration: ~75 min
  completed: 2026-11-01
status: complete
actuals:
  tokens: 10600 # chars/4 over the realized diff (42414 bytes)
  tasks: 3
  commits: 3
plan_head_before: e9281909f71936a928a4556a471b04d90154e2fb
plan_head_after: 27ff08f
---

# Phase 28 Plan 02: Client Membership Surfaces Summary

**One-liner:** every client roster/mention/picker surface now reads the projected `teams[]`
set through one shared `memberTeams()` accessor — teams modal multiselect and member
Edit-teams modal write via the revisionless `setMemberTeams` API (doc-membership writes
deleted client-side), @team fan-out and assignment intersection run on the set, seeds align,
and TEAM-03/04/05 regressions pin the behavior.

## What Was Built

### Task 1 — Teams modal over the API — commit 57aab80
- `memberTeams(m)` in store.js mirrors `projTeams` tolerance exactly; `memberInProjectTeams(m, p)`
  feeds the TEAM-04 intersection.
- Teams modal roster read/count predicate on `memberTeams`; the toggle UI stays, membership
  becomes additive (a member keeps their other teams).
- `submitTeam` fires one `api.setMemberTeams(userId, next)` per changed member; optimistic
  local write inside the existing `mutate` envelope, reverted on API failure; team
  definitions (id/name/color) keep the doc write (D-02).
- `delTeam` purges `team_members` rows via setMemberTeams before the doc team is removed
  (T-28-05) — no orphaned rows.
- The modal's "other team" chip renders the full team set; `err.changeTeam` added EN+FR.

### Task 2 — Member teams picker + scalar sweep — commit 1eb8dd4
- Member context menu gains **Edit teams**: a multi-select picker modal reusing the modal
  shell and existing team strings (D-06); submit calls `setMemberTeams` with no revision
  adoption (hybrid revision contract).
- `emitMentions` predicate: `memberTeams(m).includes(tid)` — Set targeting untouched (TEAM-03).
- Scalar sweep: project prefill (1425), `addInvitedMember` (scalar→`teams: [team]`),
  resendInvite (first team of set), `refreshMembers` (projects `row.teams`), onboarding
  project + invitee seeds; empty array is the teamless state (D-03).
- **[Rule 3]** `src/pages/members.js` (not in the plan's file list) still read scalar
  `m.team` in 4 sites — roster cell, teams grid, team page, member page header. Converted
  to `memberTeams` reads; without this the members page showed "No team" for everyone.

### Task 3 — Seeds + behavioral tests — commit 27ff08f
- Seed members carry `teams: [...]` arrays; zero scalar member team fields remain (D-04).
- TEAM-03 (unit): member in two mentioned teams → exactly one notification row + one target;
  teamless member excluded.
- TEAM-04 (unit): intersection include/exclude with legacy-scalar tolerance.
- TEAM-05 (HTTP): interleaved doc PUT and setMemberTeams on two client-shaped requests —
  both effects survive, authority row intact.
- Gate pins updated: context-menu pair table, tree-wide data-a/v counts (455/78),
  catalogue 1624 keys, `err.changeTeam` client-side allowlist.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] members page still read the scalar team**
- **Found during:** Task 2 (tree-wide `.team` grep)
- **Issue:** `src/pages/members.js` had four scalar `m.team` reads absent from the plan's
  file list; the sweep would have left the members page rendering "No team" and empty
  team rosters.
- **Fix:** converted to `memberTeams` predicates/display.
- **Commit:** 1eb8dd4

**2. [Rule 2 - Missing critical functionality] demo-mode membership writes**
- **Found during:** Task 1
- **Issue:** `api.setMemberTeams` is a no-op when `api.enabled` is false, so the demo
  (local) mode would have lost all membership editing.
- **Fix:** the local branch writes `m.teams` arrays directly (the new shape, never scalar);
  server mode treats the API as the sole authority.
- **Commit:** 57aab80, 1eb8dd4

**3. [D-06 shape decision] member edit modal doesn't exist — context menu instead**
- The plan said "existing member edit modal"; the codebase edits roles through a member
  context popover. The team picker ships as an Edit-teams modal opened from the same
  context menu — same data, same API, next to the role action.

## Verification

- `node --test test/membership.test.mjs` — 20/20 green (17 existing + 3 new behavior groups named TEAM-03/04/05)
- `node --test test/membership.test.mjs test/migration.test.mjs` — 43/43 green
- `node --test --test-concurrency=2 test/*.test.mjs` — **658/658 green**
- Source assertions: no `x.team =` / `t.members` writes in teams.js; no `m.team === tid`
  predicate, `.team || null` or `me().team` reads in actions.js; `grep -rn "\.team\s*="` in
  src/actions + store.js only hits the store's scalar-tolerance accessor and an onboarding
  default-tab key / pending-invite server row.
- `prettier --check` and `eslint` clean on all touched files (one pre-existing `myNotifs`
  no-undef in actions.js logged to deferred-items); `npm run build` (incl. i18n-scan) green.

## Threat Model Disposition

- **T-28-04** (client doc writes resurrecting membership): mitigated — all `x.team =` /
  `t.members` writes removed from teams.js/actions.js; acceptance greps pass.
- **T-28-05** (orphaned team_members rows on team delete): mitigated — delete path purges
  via setMemberTeams before the doc write.

## Known Stubs

None.

## Self-Check: PASSED

- Commits 57aab80, 1eb8dd4, 27ff08f present (git log verified).
- `memberTeams`/`memberInProjectTeams` in store.js, Edit-teams modal case in modals.js,
  `editMemberTeams` in context-menu.js — all grep-verified in source.
- Full suite 658/658 after the final commit.
