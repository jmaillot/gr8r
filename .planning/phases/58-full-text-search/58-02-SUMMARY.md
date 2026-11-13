---
phase: 58-full-text-search
plan: 02
subsystem: server-search
tags: [fts, postgres, tsvector, parity, dual-backend]
requires: [58-01 FTS seam (ensureSearchIndex/syncTaskFts/searchTasks/ftsSweep), search-terms.mjs foldForSearch/searchTerms, db-adapter tx scope, POSTGRES_TEST_URL opt-in convention]
provides: [task_search_projection pg table (folded + tsvector + GIN), dialect-complete pg branches of all four FTS seam functions, DBA parity suite rows (SQLite always, pg opt-in)]
affects: [58-03 (client merge — route now returns real results on pg), boot sweep on pg deployments]
tech-stack:
  added: []           # zero new deps — pg tsvector/GIN is native to the existing pg dep (D-12, no extensions)
  patterns: [adapter dialect-branch (D-09), tx-scope threading (Pitfall 2), shared-sweep-marker (fts_meta on both backends), opt-in pg test gate (pg-matrix D-08 idiom)]
key-files:
  created: []
  modified: [db-adapter.mjs, test/db-adapter.test.mjs]
key-decisions:
  - "fts_meta is the SHARED sweep marker on both backends — one ftsSweep logic, pg creates it in ensureSearchIndex"
  - "pg upsert stores folded plain text + projection built with to_tsvector('simple', excluded.folded) on conflict — single source of folded truth per row"
  - "pg ftsSweep rebuild is plain delete+insert runs (boot context, single process) — no explicit tx, per plan"
  - "copy-sqlite-to-pg.mjs compatibility NOT required — boot sweep heals a copied-but-empty projection table (RESEARCH A2)"
requirements-completed: [SEARCH-03, SEARCH-04]
duration: 9 min
completed: 2026-11-13
commits: 2
plan_head_before: ffeb9988b8f633594620f5463ed4b8b7dac0883d
plan_head_after: 3db5c0f
actuals:
  tokens: 52000
  tasks: 2
  commits: 2
status: complete
---

# Phase 58 Plan 02: pg Parity for the FTS Seam Summary

**One-liner:** Dialect-complete FTS on pg — `task_search_projection` (JS-folded plain text + `to_tsvector('simple')` + GIN) maintained by the same in-tx `syncTaskFts` path, implicit-AND prefix `to_tsquery` search with ts_rank + task_id tiebreak, boot-sweep healing — proven byte-for-byte behavior-identical to SQLite by the DBA parity suite ("elodie" finds "Élodie" on both backends), with zero extension dependencies (D-12).

## Accomplishments

- `ensureSearchIndex()` pg branch: `task_search_projection (workspace_id, task_id, project_id, folded, projection tsvector, PK(workspace_id, task_id))` + GIN index + shared `fts_meta` marker — all idempotent (`if not exists`), statement-per-run discipline.
- `syncTaskFts()` now dialect-complete: one shared diff loop, per-dialect row writes — pg goes through the passed TX SCOPE into `task_search_projection` via `on conflict (workspace_id, task_id) do update` (Pitfall 2 honored: no module-level pgRun inside tx bodies). No-op when no task id/title/desc/project changed.
- `searchTasks()` pg branch: implicit-AND `to_tsquery('simple', 'tok:* & tok2:*')` over the GIN index, `ts_rank desc, task_id` ordering (deterministic ties), parameterized only; terms arrive pre-sanitized `[a-z0-9]` (T-58-04 — joiner vocabulary `:*/&` built adapter-side exclusively).
- `ftsSweep()` pg branch: same marker+count staleness check; rebuild = plain delete + upsert runs (boot context, no tx scope); heals a copied-but-empty projection table.
- **Rule 1 bug found and fixed:** `toPgSql`'s `? → $n` counter was declared per-literal-part, so any `?` placed AFTER a quoted literal renumbered back to `$1` → pg bind-count mismatch (08P01). Counter hoisted to statement scope; regression test pins it. This is a latent facade bug that predates and would have outlived this phase.
- DBA parity suite rows in `test/db-adapter.test.mjs`: one scenario driver (accent match both query sides, prefix `elo`, implicit AND positive/negative, update re-index, delete unindex, direct-corruption sweep heal + healthy no-op, deterministic tie ordering) run on SQLite unconditionally and on pg via the POSTGRES_TEST_URL opt-in gate (pg-matrix D-08 idiom — skipped, exit 0, when unset).

## Task Results

| Task | Type | Commit | Result |
|------|------|--------|--------|
| 1 pg branch — projection table + dialect-complete sync/query/sweep | auto | 1b54ca3 | All acceptance criteria pass; parity behaviors verified live against a real pg 17 container (127.0.0.1:5433) before test-writing |
| 2 DBA parity suite rows | tdd | 3db5c0f | 29/29 db-adapter tests pass with POSTGRES_TEST_URL set (both parity rows green); 40 pass / 1 skip (pg row) without it; full suite 1445 pass / 0 fail; lint clean |

TDD note: Task 1's implementation was committed first per plan order, so the Task 2 RED phase was not observable as failing tests — instead the RED equivalent was performed during Task 1 development: a live pg probe script exercised every parity behavior against the pre-fix seam and drove the Pitfall-2-compliant scope threading and the toPgSql counter fix before anything was committed.

## Coverage

- kind: tests, ref: tests/db-adapter.test.mjs#FTS parity on SQLite (SEARCH-03/04), status: pass, human_judgment: false
- kind: tests, ref: tests/db-adapter.test.mjs#FTS parity on pg (SEARCH-03/04, D-12 folded projection) — run live against real pg 17 with POSTGRES_TEST_URL, status: pass, human_judgment: false
- kind: tests, ref: tests/db-adapter.test.mjs#toPgSql ? AFTER quoted literal continues $n (regression pin), status: pass, human_judgment: false
- kind: tests, ref: tests/search-fts.test.mjs#full suite (regression guard), status: pass, human_judgment: false
- kind: tests, ref: npm test → 1445 pass / 0 fail, status: pass, human_judgment: false
- kind: tests, ref: npm run lint → exit 0, status: pass, human_judgment: false
- human_judgment: true, rationale: pg ts_rank ordering quality vs SQLite bm25 (RESEARCH A4) is only asserted as "both rows returned, task_id-tiebreak deterministic" — exact ranking equivalence between engines is not provable by test and was accepted by the plan

## Deviations from Plan

**1. [Rule 1 - Bug] toPgSql `? → $n` counter reset after quoted literals**
- **Found during:** Task 1 (live pg probe: `bind message supplies 5 parameters, but prepared statement "" requires 4`)
- **Issue:** The counter lived inside the per-part `parts.map` callback; a `?` in a part following a single-quoted literal renumbered from `$1`, colliding with earlier placeholders → pg bind-count mismatch on any statement mixing literals and trailing placeholders.
- **Fix:** hoisted `let n = 0` to statement scope in `toPgSql`; regression test added.
- **Files modified:** db-adapter.mjs, test/db-adapter.test.mjs
- **Verification:** probe script passes end-to-end; regression test green.
- **Commit:** 1b54ca3 (fix), 3db5c0f (pin)

**Total deviations:** 1 auto-fixed (correctness, pre-existing facade bug surfaced by the new pg statements). **Impact:** strictly broadens toPgSql correctness; no plan truth affected.

## Authentication Gates

None.

## Known Stubs

None. (The pg parity rows skip when POSTGRES_TEST_URL is unset — that is the suite's established opt-in convention, not a stub; the runbook comment in the test names the docker one-liner.)

## Threat Flags

None — implemented surface matches the plan's threat model: T-58-04 (same searchTerms whitelist as SQLite, only `[a-z0-9]` tokens + adapter-built `&`/`:*` joiners, parameterized throughout, parity tests pin the vocabulary), T-58-05 accepted (per-task-diff upserts only), T-58-SC (no installs).

## Verification

- `POSTGRES_TEST_URL=… node --test test/db-adapter.test.mjs` → 29 pass / 0 fail (pg parity row live)
- `node --test test/db-adapter.test.mjs test/search-fts.test.mjs` → 40 pass / 0 fail / 1 skip (pg row, env unset)
- `npm test` → 1445 pass / 0 fail; `npm run lint` → exit 0
- `grep -ci "unaccent|pg_trgm" db-adapter.mjs` → 0 (D-12 backstop)
- syncTaskFts pg branch: every write goes through `scope.run`/`scope.get` — no module-level pgRun inside tx bodies (Pitfall 2, visually verified + probe)

## Self-Check: PASSED

- db-adapter.mjs and test/db-adapter.test.mjs modified on disk, commits 1b54ca3 and 3db5c0f present in git log
- All acceptance criteria re-run green (including the grep==0 backstop and the scope-only pg writes)
- Both parity rows pass against live pg 17.29 (docker pg-matrix container per the suite runbook)
