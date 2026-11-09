---
phase: 53-member-project-experience
plan: 01
subsystem: permissions
tags: [permissions, teams, doc-sync, mergeClientDoc, visibility, mcp, i18n]

requires:
  - phase: 50-live-team-links
    provides: canSeeProject / memberCanReadProject boolean funnel, p.teams live links, VISIBILITY_MODEL oracle fixture
provides:
  - projectPermFor(p, memberId, memberTeams, role) — the ONE content-write perm gate (server.js)
  - p.perms['team:'+teamId] storage namespace inside the existing p.perms map (zero migrations, zero new deps)
  - Server-side per-team gating of every content write (tasks/comments/files, create/edit/move/delete) with keyed projectPermDenied refusals riding the 200 doc-PUT response
  - normalizeProjects team-key sweep (dangling team ids + non-PERMS values deleted in place)
  - T-53-01 pin regression: stale non-manager PUT cannot wipe/downgrade stored team-perm keys
  - Extended VISIBILITY_MODEL/MIRROR_MODEL team-perm actor cells + client canSee parity fixture + mcp mirror agreement rows
  - docs/ProjectPermissions.md §5bis per-team permissions (FR), WorkspacePermissions.md cross-link
affects: [53-02-invite-modal, 53-03-project-settings-modal (per-team perm dropdowns need 53-01), 53-04, 53-05]

tech-stack:
  added: []
  patterns: [doc-PUT funnel per-item keyed refusals (D-51-15 shape), merge reserved-sets hold-back, hand-derived visibility oracle cells, client-mirror parity fixture against served docs]

key-files:
  created: [test/perm.test.mjs]
  modified: [server.js, mcp.js, test/helpers/visibility-fixture.mjs, test/mcp.test.mjs, test/transparency.test.mjs, test/visibility-migration.test.mjs, docs/ProjectPermissions.md, docs/WorkspacePermissions.md]

key-decisions:
  - "Content-write gate lives inside mergeClientDoc (the doc-PUT funnel) — tasks/comments/files have no REST routes; per-item keyed projectPermDenied refusals ride the 200 response (D-51-15 shape), denied rows held via merge reserved-sets so stored rows survive byte-identical"
  - "projectPermFor defaults: members/guests on the access list or a linked team get the per-person default tier ('Can edit'/'Can comment', mirroring shareModal); a public-project non-member ranks 'Can view' (see ≠ write)"
  - "File REST upload carries no project binding (metadata rides the doc channel), so the doc funnel is the file gate — no separate route guard needed"
  - "Fixture doc left untouched for the dangling-team cell: the actor's dead team_members row alone proves visibility invariance (perm-key sweep pinned in perm.test.mjs row 5) — avoids perturbing second-boot byte-identity suites"

requirements-completed: [PSET-02, PSET-03]

coverage:
  - id: D1
    description: "Admin stores p.perms['team:'+teamId] via the normal doc-PUT path — no migration, no top-level field"
    requirement: PSET-02
    verification:
      - kind: integration
        ref: "test/perm.test.mjs#row 1"
        status: pass
    human_judgment: false
  - id: D2
    description: "View-only team member refused content writes server-side with keyed projectPermDenied; Can-edit member and lead succeed"
    requirement: PSET-03
    verification:
      - kind: integration
        ref: "test/perm.test.mjs#rows 2-4, 6-7"
        status: pass
    human_judgment: false
  - id: D3
    description: "normalizeProjects sweeps dangling team: keys and non-PERMS values; pin regression (stale/omitted perms in non-manager PUT byte-identical)"
    requirement: PSET-02
    verification:
      - kind: integration
        ref: "test/perm.test.mjs#rows 5, 8-9"
        status: pass
    human_judgment: false
  - id: D4
    description: "Funnel/mirror lockstep: extended oracle cells, mcp canReadProject agreement, client canSee parity fixture for every actor × project cell"
    requirement: PSET-02
    verification:
      - kind: integration
        ref: "test/mcp.test.mjs#53-01 parity rows + client parity fixture"
        status: pass
    human_judgment: false
  - id: D5
    description: "Docs match the shipped model (per-team perms section, D-01/D-02/D-03, stale récap row corrected)"
    requirement: PSET-02
    verification:
      - kind: other
        ref: "grep '§5bis' docs/ProjectPermissions.md + i18n:scan 0 dead"
        status: pass
    human_judgment: true
    rationale: "Documentation adequacy (completeness/wording for a human reader) is a judgment call; no test asserts doc quality"

metrics:
  duration: 34 min
  completed: 2026-11-09
  status: complete
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
  plan_head_before: aedd30c
  plan_head_after: 8324d45
commits: 3
---

# Phase 53 Plan 01: Per-team perms, server model Summary

**Per-team permission levels stored as `p.perms['team:'+teamId]` keys, enforced server-side through the doc-PUT funnel by `projectPermFor` on every content write, with the visibility oracle + client/MCP mirrors proven in lockstep.**

## Performance

- **Duration:** 34 min (10:29 → 11:03 UTC)
- **Tasks:** 3/3
- **Files modified:** 10 (1 created)

## Accomplishments
- `projectPermFor(p, memberId, memberTeams, role)` in server.js returns the effective PROJECT_PERMS tier: owner/admin or lead ⇒ Full access; best of direct + live team tiers; defaults mirror shareModal; public non-member ⇒ 'Can view' (see ≠ write)
- Every content write (task/comment/file create, edit, move, delete) gated server-side on the STORED doc inside `mergeClientDoc`, with keyed `projectPermDenied` refusals riding the 200 response and denied rows held byte-identical via merge reserved-sets
- normalizeProjects sweeps dangling/non-PERMS team keys in place; T-53-01 pin regression proves a stale non-manager PUT cannot wipe or downgrade stored team keys
- VISIBILITY_MODEL/MIRROR_MODEL extended with three D-03 team-perm actor cells; client `canSee` parity fixture (real store import behind DOM shim) + mcp mirror agreement rows pin the three-engine lockstep
- docs/ProjectPermissions.md §5bis + WorkspacePermissions.md cross-link; stale "perms not enforced" récap row corrected

## Task Commits

1. **Task 1: End-to-end per-team perm tracer** - `7984765` (feat)
2. **Task 2: All content writes + normalize sweep + pin regression** - `9591f48` (feat)
3. **Task 3: Mirror lockstep — oracle cells, client parity fixture, docs** - `8324d45` (feat)

## Files Created/Modified
- `server.js` — PROJECT_PERMS + projectPermFor; mergeClientDoc content-write gate; normalizeProjects team-key sweep; refusal log names the code
- `test/perm.test.mjs` — 9-row suite (tracer rows, comment/file gating, normalize sweep, pin regression)
- `test/helpers/visibility-fixture.mjs` — 3 team-perm actors + model rows (D-03 comments)
- `test/mcp.test.mjs` — team-perm parity rows + client canSee parity fixture
- `test/transparency.test.mjs`, `test/visibility-migration.test.mjs` — email maps for new actors
- `mcp.js` — mirror comment header refreshed (no behavior change)
- `docs/ProjectPermissions.md`, `docs/WorkspacePermissions.md` — §5bis + cross-link

## Decisions Made
See key-decisions; notably the gate lives in the doc-PUT funnel (mergeClientDoc) because tasks/comments/files have no REST routes — this is the codebase mapping of the plan's "write routes", using the established D-51-15 scoped-refusal channel.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Mapping] Plan's "write routes" are the doc-PUT funnel, not REST routes**
- **Found during:** Task 1
- **Issue:** Tasks/comments/files are mutated through `PUT /api/workspaces/:slug` (mergeClientDoc); no per-object REST routes exist.
- **Fix:** Implemented the gate inside mergeClientDoc with per-item keyed refusals (D-51-15 shape) + reserved-set hold-back; file REST upload needs no guard (no project binding — metadata rides the doc channel).
- **Files modified:** server.js
- **Verification:** test/perm.test.mjs rows 2-9
- **Commit:** 7984765 / 9591f48

**2. [Rule 1 - Bug] docFromClient refusal log mislabeled all refusals as "project create refused (permCreate)"**
- **Found during:** Task 1
- **Fix:** Log now names `r.code` (projectCreateForbidden and projectPermDenied share the channel).
- **Commit:** 7984765

**3. [Rule 2 - Missing actor maps] Adding fixture actors broke two sibling suites**
- **Found during:** Task 3
- **Issue:** transparency.test.mjs and visibility-migration.test.mjs iterate VIS_ACTORS with their own email maps — the new actors had no entries (login 400).
- **Fix:** Extended both emailOf maps; both suites green.
- **Commit:** 8324d45

**Total deviations:** 3 auto-fixed (2 mapping/log fixes, 1 test-infrastructure). **Impact:** none on the shipped model — the funnel mapping is the only faithful implementation of the plan's intent.

## Issues Encountered
- `test/totp-rewrap.test.mjs` fails suite-wide: ENOENT `DEPLOY.md` — a parallel session split DEPLOY.md into docs/ (commit 5e4d954) while this plan ran; the test still reads the old path. Pre-existing/parallel-work, out of scope (logged in deferred-items.md).
- Two upload/logo unlink tests flaked once under full-suite parallel load; re-run green (not reproduced).

## Verification
- `node --test test/perm.test.mjs` — 9/9 pass
- `node --test test/mcp.test.mjs` — 34/34 pass
- `npm test` — 1141 pass, 1 fail (pre-existing DEPLOY.md ENOENT from the parallel docs split), 11 skipped
- `npm run i18n:scan` — 0 dead / 0 stale
- `grep -n "p.teamPerms" server.js mcp.js src/core/store.js` — zero matches
- `git diff src/core/store.js` — empty (canSee body untouched per D-03)

## Self-Check: PASSED

- test/perm.test.mjs, test/helpers/visibility-fixture.mjs, mcp.js, docs/ProjectPermissions.md, docs/WorkspacePermissions.md exist on disk — verified via the test runs and git log above.
- Commits 7984765, 9591f48, 8324d45 present in `git log`.
- All task acceptance criteria re-run: projectPermFor single definition (1 match), zero p.teamPerms matches, ≥6 projectPermFor call sites beyond the definition, canManageProject body untouched, PATCH/members/teams routes untouched.
