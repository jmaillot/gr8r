---
phase: 28-multi-team-membership
plan: 03
subsystem: invites
tags: [invites, multi-team, d-07, migration-backfill, invite-form]
requires: [28-01, 28-02]
provides:
  - invites.teams JSON array column + scalar invites.team backfill (same guarded migration, same backup)
  - invite POST accepting/validating body.teams (trim/dedup/whitelist/cap 25)
  - invite payloads (POST response + pending list) serializing teams[], scalar dropped
  - addMembership inserting one team_members row per invited team in its transaction
  - invite-form team multi-select + full-set resend; createInvites array payload
  - TEAM composite regression test
affects: [phase 29 (scoped permissions), phase 30 (OIDC identity join)]
tech-stack:
  added: []
  patterns: [mirrored-validation-shape, single-backup-two-mutations, scalar-tolerant-array-signature]
key-files:
  created: []
  modified:
    - server.js
    - src/core/api.js
    - src/actions/actions.js
    - src/overlays/modals.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/membership.test.mjs
    - test/migration.test.mjs
    - test/helpers/legacy-fixture.mjs
    - test/i18n-core-features.test.mjs
    - test/i18n-toast.test.mjs
    - test/i18n-shell.test.mjs
decisions:
  - "The invites scalar→array backfill shares migrateTeamMembership's once-guard, pre-backup and transaction — one snapshot covers both mutations; a boot where only invites need backfilling still backs up first"
  - "addMembership's 4th param became the team array with scalar tolerance only for its two no-team internal callers; memberships.team is no longer written on join (D-04 extends to the memberships scalar write path)"
  - "Invite POST tolerates an absent teams field (degrades to []) so the existing suite shape stays valid; a present non-array is 400 teamsRequired"
  - "The invite multi-select reuses the memberTeams-picker toggle-chip pattern (invTeamToggle / S.ui.inviteTeams) instead of a native multi-select"
metrics:
  duration: ~55 min
  completed: 2026-11-01
status: complete
actuals:
  tokens: 7350 # chars/4 over the realized diff (294+46 lines, 12 files)
  tasks: 3
  commits: 3
plan_head_before: 38ed60c
plan_head_after: bb37a19
---

# Phase 28 Plan 03: Multi-Team Invites End-to-End Summary

**One-liner:** invites now carry a full team set — `invites.teams` JSON column backfilled from
the scalar under the single guarded migration, POST validation mirroring the PUT teams route,
acceptance inserting one `team_members` row per team in the same transaction, and an invite-form
multi-select whose resend paths read the parsed set — closing the last scalar-team write path (D-07).

## What Was Built

### Task 1 — Server: column, backfill, POST validation, acceptance rows — commit 7aa088b
- `invites.teams text` in SCHEMA + byte-identical `ensureColumn(db, 'invites', 'teams', 'text')`.
- `migrateTeamMembership()` extended: `invitesEligible()` joins the guard; scalar `team`
  backfills to `JSON.stringify([team])` per row inside the same transaction, under the same
  single pre-migration backup (no second snapshot, D-04 — the scalar is never read again).
- Invite POST: `body.teams` validated exactly like PUT `members/:uid/teams` (trim + 40-char
  slice, Set-dedup, whitelist against doc `teams[]` → 400 `unknownTeam`, cap 25 →
  `tooManyTeams`, non-array → `teamsRequired`); absent field → `[]`. Insert binds
  `JSON.stringify(teams)`; the scalar column is never written.
- Payloads: `invitesOf` and the POST response rows emit parsed `teams: [...]` (plus `id`
  on POST rows for consistency with the list payload); scalar `team` is gone.
- Acceptance: `addMembership(ws, user, role, teams)` inserts one `team_members` row per team
  inside its existing `begin immediate` transaction; the invite-accept call site parses
  `invite.teams`. `memberships.team` is no longer written on join.
- Tests: multi-team invite (dedup in payload) → accept → exactly two authority rows + both
  rosters; teamless invite → zero rows; invalid sets → 400. Legacy fixture invite carries
  scalar team `eng`; migration.test pins `teams == ["eng"]` after first boot and byte-identity
  across the second boot (snapshot extended with invite team/teams).

### Task 2 — Client: multi-select + prefill — commit 85cf5ae
- Invite modal: single-team `<select>` replaced by a toggle-chip multi-select over
  `teamsList()` (`invTeamToggle`, same pattern as the member teams picker) with new
  `modal.inviteTeamsHint` EN+FR.
- `createInvites(emails, role, teams)` payload carries the array; `submitInvite`/`copyInviteLink`
  send `S.ui.inviteTeams`; `resendInvite` resends the member's full `memberTeams(m)` set;
  `resendPendingInvite` reads `row.teams`; onboarding passes `[]`. No `.team || null`
  fallbacks remain. Project-form prefill already read `memberTeams(me())` (Plan 02).
- Gate pins updated: catalogue 1625 keys, tree-wide data-a 456 / data-v 79.

### Task 3 — Sweep + composite gate — commit bb37a19
- Sweep greps clean: no `m.team ===` membership predicates, no `x.team =` writes, no
  `.team ||` scalar reads anywhere in src/ or server.js — the only remaining `.team ===`
  hits are the intentional legacy-scalar tolerance normalizers (store.js projTeams, server
  doc repair) and the migration backfill itself.
- TEAM composite test: multi-team invite → both rosters; admin PUT round-trip dedups and
  stays stable; concurrent doc PUT + membership PUT both survive; `@Alpha @Beta` mention
  targets the member exactly once through either team.
- Invariants: `package.json` dependencies unchanged (`{}`); full suite
  **663/663 green** under `--test-concurrency=2`; prettier clean; `npm run build` (incl.
  i18n-scan) green.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Invite modal markup lives in src/overlays/modals.js**
- **Found during:** Task 2
- **Issue:** the plan's file list omitted the modal template file; the multi-select UI
  cannot exist without editing it (same omission class as Plan 02's members.js).
- **Fix:** invite form converted in place; EN+FR hint added.
- **Files modified:** src/overlays/modals.js, src/locales/en.json, src/locales/fr.json
- **Commit:** 85cf5ae

**2. [Rule 3 - Blocking] Migration backfill test needed the legacy fixture**
- **Found during:** Task 1
- **Issue:** the scalar invites.team backfill can only be proven against a legacy database;
  the plan's file list named only membership.test.mjs.
- **Fix:** fixture invite now carries team `eng`; backfill + second-boot byte-identity
  asserted in migration.test.mjs (snapshot extended).
- **Files modified:** test/helpers/legacy-fixture.mjs, test/migration.test.mjs
- **Commit:** 7aa088b

**3. [Rule 2 - Missing critical functionality] POST response rows lacked `id`/`teams`**
- **Found during:** Task 1
- **Issue:** the POST response rows had no invite id, so clients could not correlate them
  with the pending list; teams were missing from the create response.
- **Fix:** POST rows carry `id` (token hash) and `teams`.
- **Commit:** 7aa088b

## Verification

- `node --test test/membership.test.mjs test/migration.test.mjs` — 51/51 green
- `node --test --test-concurrency=2 test/*.test.mjs` — **663/663 green**
- Sweep greps clean (see Task 3); `package.json` deps `{}` unchanged
- `prettier --check` clean on touched files; `npm run build` green

## Threat Model Disposition

- **T-28-07** (Tampering via body.teams): mitigated — trim/dedup/whitelist/cap 25 mirroring
  the PUT teams route; tests pin unknown id → 400, over-cap → 400, non-array → 400.
- **T-28-08** (EoP via acceptance): mitigated — acceptance stays inside the existing
  authenticated accept flow; rows come only from the stored, already-whitelisted
  `invites.teams` column, one per team, same transaction.
- **T-28-09** (scalar leak after cutover): accepted/mitigated — payloads serialize the parsed
  array only; test asserts `'team' in listed === false`.

No new trust surface beyond the plan's threat model.

## Known Stubs

None — no placeholder data paths were introduced.

## Self-Check: PASSED

- Commits 7aa088b, 85cf5ae, bb37a19 present (git log verified).
- `invites.teams` SCHEMA + ensureColumn, invitesEligible backfill, teams validation in the
  POST route, addMembership per-team inserts, `invTeamToggle` + multi-select modal,
  `createInvites` array payload — all grep-verified in source.
- Full suite 663/663 after the final commit.
