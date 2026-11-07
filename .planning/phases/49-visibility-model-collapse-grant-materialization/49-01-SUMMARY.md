---
phase: 49-visibility-model-collapse-grant-materialization
plan: 01
subsystem: test-harness
tags: [visibility, migration-harness, mcp-parity, 404-matrix, anti-tautology]
requires:
  - server.js old visibility predicate (projectIsPrivate/canSeeProject/hiddenFor/projectScope)
  - mcp.js canReadProject mirror
provides:
  - test/helpers/visibility-fixture.mjs (createVisibilityFixtureDb + VISIBILITY_MODEL + MIRROR_MODEL oracle)
  - test/visibility-migration.test.mjs (set-equality + byte-identity harness)
  - mcp.test.mjs parity block
  - privacy.test.mjs 404 body-equality rows + sanctioned new-model skip block
affects: [Plan 49-02 (sweep flips D-49-1 expectations), Plan 49-03 (predicate collapse un-skips new-model cells, flips divergence assertions)]
tech-stack:
  added: []
  patterns: [hand-derived oracle fixture (anti-tautology), node:test multi-server harness, raw-body equality 404 matrix]
key-files:
  created:
    - test/helpers/visibility-fixture.mjs
    - test/visibility-migration.test.mjs
  modified:
    - test/mcp.test.mjs
    - test/privacy.test.mjs
decisions:
  - VISIBILITY_MODEL is hand-derived from RESEARCH §Fixtures with admin/owner rows corrected by a one-time probe of the old-model server (private projects are access-list-gated for everyone; normalizeProjects injects the doc owner into private-empty projects on the served copy) — the RESEARCH row "admin/owner ROLE_RANK bypass → visible untouched" is wrong for the doc-GET surface
  - MIRROR_MODEL exported alongside VISIBILITY_MODEL pins the old mcp.js canReadProject semantics (admin bypass, no scope term); parity deepEqual is asserted on the actor shapes where the two predicates coincide today (m_plain, m_team) and the divergences are asserted explicitly with dated comments instead of being hidden
  - Privacy 404 rows use the p_ownerblind cell, not p_sec — the suite's earlier lead-manages-access test flips p_sec workspace-wide mid-suite
metrics:
  duration: ~2h (single executor session, 2026-11-07)
  completed: 2026-11-07
status: complete
actuals:
  tokens: 9400   # 937 insertions ≈ 37.5k chars / 4, diff-only scale vs estimate.raw_tokens 25000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 7fe37e328a4e7b5350d487534e95e34a83d5241b
plan_head_after: 46894d883bea7d77f25dfb6fbb57bbd1aba0edc7
requirements: [MIG-01, MIG-03, VIS-03]
---

# Phase 49 Plan 01: Visibility test scaffolding (pre-collapse) Summary

**One-liner:** 13-cell visibility fixture with a hand-derived (probed, anti-tautology) oracle, a green-today set-equality + byte-identity migration harness, a server↔MCP parity harness across every actor shape, and model-neutral 404 body-equality rows — all green against the unchanged old-model server, giving Plans 02/03 an independent verification oracle.

## What Was Built

- **test/helpers/visibility-fixture.mjs** — `createVisibilityFixtureDb(dataDir)` builds the full actor × project matrix on SQLite (current-schema DDL, deterministic ids, memberships/invites scope JSON, team_members rows, one invites row carrying scope). Exports `VISIBILITY_MODEL` (doc-GET oracle), `MIRROR_MODEL` (old mcp.js mirror oracle), `VIS_SCOPED_ACTORS`, `VIS_WS`, passwords/ids.
- **test/visibility-migration.test.mjs** — three pins: (1) per-actor doc-GET visibility deepEqual `VISIBILITY_MODEL`; (2) scope columns non-NULL pre-sweep with dated D-49-1 comment (Plan 02 flips); (3) second-boot byte-identity snapshot with zero `projects-pre-visibility-` backups (Plan 02 pins 1).
- **mcp.test.mjs parity block** — second server + fixture; every keyed actor through both engines; parity deepEqual for m_plain/m_team; `MIRROR_MODEL` deepEqual for all; documented-divergence assertions (scope term, admin bypass) with dated comments; m_doconly proof (404 doc, 403 key); hidden-task cells via get_task/list_tasks/whoami/get_project.
- **privacy.test.mjs** — 404 body-equality rows (file serve raw-string equality; get_task error-shape equality with id normalization; list_tasks/list_projects/search_tasks needle-free) against the still-private `p_ownerblind` cell, plus the phase's only sanctioned skip block naming the Phase 49 swap with the three new-model cells.

## Coverage block (must-have truths)

| Truth | Where pinned |
|---|---|
| 13-cell matrix expressible via one builder on SQLite | visibility-fixture.mjs + fixture-DB test in visibility-migration.test.mjs |
| Old-predicate visibility computable from the model table alone | VISIBILITY_MODEL / MIRROR_MODEL (grep-verified: zero code references to memberCanReadProject/canReadProject — comments only) |
| Non-invitee × private project byte-identical 404/absence through doc GET, file serve, MCP read/list doors | privacy.test.mjs 404 body-equality block |
| Server predicate and MCP mirror agree per actor shape | mcp.test.mjs parity block (coinciding shapes deepEqual; divergences asserted and dated) |

## Verification

- `node --test --test-concurrency=2 test/visibility-migration.test.mjs` → 4 pass, 0 fail
- `node --test --test-concurrency=2 test/mcp.test.mjs` → 32 pass, 0 fail
- `node --test --test-concurrency=2 test/privacy.test.mjs` → 13 pass, 3 skipped (sanctioned block only)
- Full `npm test` → 1150 tests: 1133 pass, 0 fail, 17 skipped (14 pre-existing + 3 new sanctioned)
- `git ls-files` shows all four paths tracked; `git diff package.json` empty (zero new deps, T-49-SC)
- mcp.js has no server.js import (pre-existing invariant intact)

## Deviations from Plan

**1. [Plan/Research correction — admin/owner model-table row]** The RESEARCH §Fixtures row "admin / owner — ROLE_RANK bypass — visible, untouched" is wrong for the doc-GET surface: a one-time probe of the old-model server (2026-11-07, scratch script, since deleted) proved private projects are access-list-gated for EVERYONE (admin sees only on-list privates + publics; private-empty projects serve to the doc owner alone via normalizeProjects' ownerId injection, server.js:929-936). The ROLE_RANK bypass at server.js:882 only skips the scope/team funnel; hiddenProjectIds (server.js:894) remains access-list-gated. `VISIBILITY_MODEL` encodes the probe-corrected semantics per row, with the correction documented in the fixture module header. No production code was changed.
- **Found during:** Task 1 fixture design
- **Files:** test/helpers/visibility-fixture.mjs (oracle rows + header comment)

**2. [Plan constraint reconciliation — parity cannot be deepEqual for every actor today]** Plan Task 3a asserts "server-set === mirror-set per actor … green today". The old mirror (mcp.js:180-189) has no scope term and an admin ROLE_RANK bypass, so for scoped actors and admin/owner the sets legitimately diverge today (this drift predates Phase 49). Implemented instead: parity deepEqual on the shapes where the predicates coincide (m_plain, m_team — green under both models), `MIRROR_MODEL` deepEqual for every keyed actor, and explicit documented-divergence assertions with dated comments that Plan 03 flips to parity after the sweep + collapse.
- **Found during:** Task 3a
- **Files:** test/mcp.test.mjs (parity block)

**3. [Rule 3 — privacy fixture cell relocation]** The plan pointed the 404 rows at the non-invitee × private cell; the natural `p_sec` cell is flipped workspace-wide by the suite's own earlier lead-manages-access test, and Bob is removed from the workspace mid-suite. Rows re-anchored to `p_ownerblind` (still private, Bob off-list) with Bob re-joined; a hidden file record `f_ob` is planted by the row itself.
- **Found during:** Task 3b
- **Files:** test/privacy.test.mjs

## Threat surface scan

None — test-only change; no new endpoints, auth paths, or trust-boundary surfaces. T-49-01 mitigated (independent oracle; grep proves no production-predicate calls in expectation code). T-49-SC mitigated (package.json diff empty).

## Known Stubs

None. The three skipped tests in privacy.test.mjs are the plan-mandated new-model cells (Plan 03 un-skips them), not stubs.

## Self-Check: PASSED

- Files exist: test/helpers/visibility-fixture.mjs, test/visibility-migration.test.mjs (tracked); mcp.test.mjs / privacy.test.mjs modified and tracked.
- Commits exist: 3055ad0 (fixture), db9c508 (migration harness), 46894d8 (parity + 404 rows) — all reachable from HEAD 46894d8.
- Full suite green (1133 pass / 0 fail) before SUMMARY.
