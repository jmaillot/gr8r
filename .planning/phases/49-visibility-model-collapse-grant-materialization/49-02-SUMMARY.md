---
phase: 49
plan: 02
subsystem: boot-migration
tags: [visibility, migration, grants, sweep, sqlite]
requires:
  - 49-01 legacy-dual-predicate oracle + visibility fixture
provides:
  - materializeVisibilityGrants() one-boot sweep (server.js)
  - boot wiring (call precedes request serving)
  - POST_SWEEP_SERVER_DELTA / POST_SWEEP_MIRROR_DELTA dated deltas + postSweepIds helper
affects:
  - 49-03 collapsed predicate (consumes swept data shape)
tech-stack:
  added: []
  patterns: [guarded-additive boot migration (migrateTenancy template), D-11 single-tx per workspace]
key-files:
  created: []
  modified:
    - server.js
    - test/visibility-migration.test.mjs
    - test/helpers/visibility-fixture.mjs
    - test/mcp.test.mjs
decisions:
  - dissolve clears p.lead when the dissolved member was the lead (normalizeProjects :925 would resurrect it on every served copy)
  - sweepNeeded fires only on NON-EMPTY p.teams arrays (empty `teams:[]` is the post-normalization status quo and inert)
  - team grants flow only to workspace-wide members; scope-reach grants materialize incl. the D-03 inversion; out-of-scope entries dissolved
metrics:
  duration: ~50 min (resumed session)
  completed: 2026-11-07
status: complete
actuals:
  tokens: 10000   # chars/4 over the realized diff (40023 chars)
  tasks: 3
  commits: 3
plan_head_before: 43464c601a052c8c136bd6c1cbb3d9ce18d27712
plan_head_after: 9f137f6b94fdb38a40f3aebd191dc77866e45fef
---

# Phase 49 Plan 02: Boot-Time Grant Materialization Sweep Summary

One-boot sweep (`materializeVisibilityGrants()`) converts every old-predicate access path — team intersections, Phase-29 scope grants (incl. the D-03 inversion), legacy `p.access:'private'` — into explicit `p.members` entries, then clears the dormant scope columns inside the same per-workspace transaction, wired into boot before any request is served.

## What Was Built

- **Task 1 (e720022):** `materializeVisibilityGrants()` + `sweepNeeded()` marker (server.js, after migrateTenancy). Guarded-additive: marker scan → pre-migration `vacuum into` backup (no backup = no mutation, T-49-03) → one `db.tx` per candidate workspace: re-read doc, derive per-member old-predicate scope state (fail-open on corrupt scope JSON, T-49-04), materialize grants onto `p.members`, normalize legacy dual representation (`p.access:'private'` → `private:true`, D-49-4), delete `p.teams` from every project (D-49-5), raw doc write + `update memberships/invites set scope = null` atomically (D-49-1). Owner pinned onto private projects a grant un-empties (D-49-7); private-empty shape never un-sealed (D-49-8); no normalizeProjects call, no revision churn. A6 pg fallback documented (sqliteOnly no-ops on pg — no file backup on the pg lane).
- **Task 2 (bd10655):** `await materializeVisibilityGrants()` in bootstrap() after migrateTotpReWrap, before ensureAdmin — the sweep precedes every request (ARCHITECTURE Pitfall 1).
- **Task 3 (9f137f6):** `test/visibility-migration.test.mjs` rewritten — 6 pins: pre-boot legacy shapes on disk, scope columns NULL post-sweep, exact materialized grant set + no `p.teams`/`p.access`, per-actor set-equality vs oracle + dated delta, planted corrupt-scope fail-open cell (`not-json{}` → workspace-wide + team grant), second-boot byte-identity with exactly ONE backup (D-49-6). Fixture helper gained dated additive deltas (`POST_SWEEP_SERVER_DELTA`, `POST_SWEEP_MIRROR_DELTA`, `postSweepIds`); the 49-01 oracles (`VISIBILITY_MODEL`, `MIRROR_MODEL`) are byte-untouched. mcp.test.mjs parity/divergence pins flipped to oracle + delta (the sweep changed the data they read — the plan's D-49-1 flip, done here with dated comments pointing at Plan 03).

## Deviations from Plan

**1. [Rule 1 - Bug] Dissolve must also clear a scoped project lead**
- **Found during:** Task 3 (set-equality pin failed)
- **Issue:** Dissolving an out-of-scope access-list entry left `p.lead` pointing at the dissolved member; `normalizeProjects` (:925) re-adds `p.lead` to `p.members` on every served copy, silently resurrecting the dissolved entry on read (m_scoped kept seeing p_scopeddeny, owner didn't).
- **Fix:** sweep clears `p.lead` when the lead was among the dissolved entries; the private-empty shape then matches the pre-existing sealed-project behavior (owner injected on the SERVED copy only). Documented in code + fixture delta comments.
- **Files modified:** server.js, test/helpers/visibility-fixture.mjs
- **Commit:** 9f137f6

**2. [Rule 1 - Bug] sweepNeeded fired on empty `teams:[]` arrays**
- **Found during:** Task 3 (migration.test.mjs second-boot byte-identity failed on the legacy fixture)
- **Issue:** Boot-time doc normalization leaves `teams:[]` on every project; the sweep marker treated any `teams` key as pre-sweep, so every boot after the first re-swept and churned the doc (broke D-49-6).
- **Fix:** marker requires a NON-EMPTY `p.teams` array (empty arrays grant nothing and are the post-normalization status quo).
- **Files modified:** server.js
- **Commit:** 9f137f6

## Verification

- `node --test test/visibility-migration.test.mjs` → 6/6 pass
- `node --test test/migration.test.mjs` → 37/37 pass
- `node --test test/mcp.test.mjs` → 32/32 pass
- full `npm test` → 1135 pass / 0 fail / 17 skipped (14 pre-existing + 3 sanctioned new-model skips in privacy.test.mjs; Plan 03 owns un-skipping them — untouched here)

## Requirements Coverage

- **MIG-01** — boot migration materializes every access path into explicit `p.members` entries: covered (sweep + boot wiring + set-equality pin).
- **MIG-02** — scope columns cleared and dormant: covered (same-transaction clears + NULL-everywhere pin; columns still created by ensureColumns :432-433, untouched per plan).

## Commits

- e720022 feat(49-02): add materializeVisibilityGrants sweep function
- bd10655 feat(49-02): wire materializeVisibilityGrants into boot before request serving
- 9f137f6 test(49-02): pin post-sweep visibility; dissolve removes scoped leads; flip mcp parity pins

## Known Stubs

None. (The 17 skips are pre-existing/sanctioned, tracked for Plan 03.)

## Notes for Plan 03

- Post-sweep interim visibility deltas are pinned in `test/helpers/visibility-fixture.mjs` — replace both deltas with the collapsed-model oracle pins and un-skip the 3 privacy.test.mjs new-model tests there.
- mcp.test.mjs parity tests now assert oracle + dated delta; the scope-term divergence test is the narrowed residue (dissolved entry hidden on both engines) — collapse flips these to full parity.
- A later doc write re-adds `teams:[]` to projects via normalizeProjects (:922); the sweep marker ignores empty arrays so this never re-triggers the sweep.

## Self-Check: PASSED

- Commits e720022, bd10655, 9f137f6 verified via `git log 43464c6..HEAD`.
- All four modified files present in the working tree at commit time; full suite green post-commit.
