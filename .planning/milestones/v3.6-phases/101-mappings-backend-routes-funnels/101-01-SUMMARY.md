---
phase: 101-mappings-backend-routes-funnels
plan: 01
subsystem: governance-api
tags: [group-mappings, operator-api, audit, dialect-parity, throttle]
requires: [Phase 80 POST sibling, group_mappings DDL, tooMany, db.tx, groups.js funnels]
provides: [GET /api/governance/group-mappings, DELETE /api/governance/group-mappings/:id, isUniqueViolation(db-adapter.mjs)]
affects: [Phase 102 mappings UI (consumes GET rows + dead-mappings route), i18n (none — zero new keys)]
tech-stack:
  added: []
  patterns: [guard-ladder copy (sameOrigin → requireUser → gate/throttle), same-tx audit insert, correlated scalar subquery with || concatenation, dialect-parity error classifier]
key-files:
  created:
    - test/group-mappings-api.test.mjs
  modified:
    - server.js
    - db-adapter.mjs
    - test/db-adapter.test.mjs
decisions:
  - D-02 overrides MAP-01: GET unthrottled, DELETE throttled-before-gate
  - isUniqueViolation classifier lives in db-adapter.mjs (dialect-parity home, unit-testable import) — plan allowed "near the route or exported"; exported chosen
  - workspaceSlug included in GET payload (one column, Phase 102 linking)
  - SC-4 mismatch clause narrowed to liveMembers === 0 per D-05/R-1
metrics:
  duration: ~40 min
  completed: 2026-11-27
status: complete
commits: 3
plan_head_before: ad403313c097fa32d1b4fc72455b5a7c02b4920c
plan_head_after: 3734e3d0
actuals:
  tokens: 61000
  tasks: 3
  commits: 3
---

# Phase 101 Plan 01: Mappings Backend — Routes & Funnels Summary

GET+DELETE operator routes on `/api/governance/group-mappings` with same-tx `group_mapping_deleted` audit, structured dead/liveMembers hints, and a dialect-parity duplicate backstop — full suite green with the 2 documented pre-existing failures unchanged.

## What Was Built

- **GET `/api/governance/group-mappings`** (server.js, adjacent to the POST sibling): D-02 no-throttle read route, guard ladder sameOrigin → requireUser → `isInstanceAdmin` before any lookup. Single query: LEFT JOIN workspaces (server-resolved `workspaceName`/`workspaceSlug`, null for dead rows) + correlated count `provenance = 'group:' || gm.group_guid` (exact equality — never a prefix LIKE). Flat camelCase rows with `dead`/`deadReason` (`workspace-deleted` | `workspace-archived` | null) / `liveMembers`, `created_at desc` ordering. No audit_log scan (D-05).
- **DELETE `/api/governance/group-mappings/:id`**: guard order copied from instance-roles POST — sameOrigin → requireUser → `tooMany('group-mapping-delete|<op-id>', 5, 15min)` **before** the gate (403s consume a try) → gate. Unknown id = uniform generic `404 notFound` (D-01, no oracle). `db.tx` contains exactly two statements: delete + 12-column `group_mapping_deleted` audit row (GUID + workspace id + label in the message columns, operator attribution, `logSecurity` + `logInfo` after commit). memberships/team_members never touched (R-3 lazy revocation).
- **Duplicate backstop (MAP-03/D-14)**: `isUniqueViolation(err)` exported from db-adapter.mjs — pg `code === '23505'` OR message `duplicate key value violates unique constraint` (A1 widening) OR SQLite `/UNIQUE constraint failed/`. POST insert wrapped; duplicate → keyed `groupMappingDuplicate` (existing key verbatim — zero new locale keys); everything else rethrows.
- **Tests**: T1–T8 matrix — 11 cases in `test/group-mappings-api.test.mjs` (gates 401/403×2, success + ordering + canonical GUID, archived/missing hints, exact-equality liveMembers adjacency, throttle-before-gate 429, D-01 uniform 404, R-3 byte-identical member tables, WR-83-03 trail non-match pin, classifier unit) + 1 static pg-parity case in `test/db-adapter.test.mjs` (pgSchemaVariant carries `group_mappings_pair`; toPgSql of GET/DELETE/pre-check/insert placeholder-complete, no on-conflict drift).

## Deviations from Plan

**1. [Planner decision — documented] D-02 overrides MAP-01's GET-throttle wording.** The plan's decisions_note already ruled this; implemented verbatim: GET carries NO throttle (instance-roles/dead-mappings read precedent); DELETE's operator-keyed throttle sits before the gate and consumes a try on every 403.

**2. [Planner decision — documented] Backstop test mechanics (T7):** unit classifier in db-adapter.mjs (imported by the test — the plan permitted "exported from the server module or a tiny inline helper"; a db-adapter export is the dialect-parity home and importable) + the existing e2e braced-paste duplicate regression in `groups-config-api.test.mjs` (:113-117) stays green as D-14's live-SQLite proof. No forced-constraint e2e hack.

**3. [Planner decision — documented] `workspaceSlug` kept** in the GET payload (null for dead rows, same as `workspaceName`) — one column, Phase 102 needs it for workspace linking.

**4. [Scope note] T3 hint tests executed in Task 1** (not a separate slice): the plan's Task 1 lists "T1 + T2" but must_haves truth #1 and SC-1 require dead/deadReason hint coverage, which is inherently GET-route work — archived/missing-workspace hint tests and the two-guid liveMembers adjacency (Pitfall 3) landed in the Task 1 commit. No behavior change.

**5. [Classifier placement] `isUniqueViolation` lives in db-adapter.mjs, not "defined near the route"** — server.js is the HTTP layer and not unit-importable; the adapter is the dialect-parity module and already exports `toPgSql`/`pgSchemaVariant`. Documented above; no locked decision touched.

## SC-4 / SC-1 Posture Mapping (checker-corrected)

- **SC-4 mismatch clause (D-05/R-1 narrowing):** "label/GUID mismatches from stored provenance where derivable" is realized as the derivable signal `liveMembers === 0` — a live mapping whose `group:<guid>` provenance has zero membership rows. Pinned by the Task 1 test asserting `dead:false, liveMembers:0` for a mapping with no matching provenance row, and by the exact-equality adjacency test. No audit_log scan, no Graph label fetch (R-1).
- **SC-1 "non-operator uniform 404 posture":** realized as the family's uniform non-oracle posture — `403 operatorOnly` for authenticated non-operators on GET/DELETE (D-04/MAP-01 family precedent, gate before any lookup), `404 notFound` only for unknown-id DELETE by the operator (D-01), and the same generic 404 with zero vs one mapping rows present (no existence oracle either way). Do not fail SC-1 literally against a "404 for non-operators" reading.

## Verification Results

- `node --test test/group-mappings-api.test.mjs test/db-adapter.test.mjs test/groups-config-api.test.mjs` → 53 pass / 0 fail (1 env-gated pg skip).
- Full `npm test` → **2684 tests, 2651 pass, exactly 2 failures = the documented pre-existing baseline** (D-05 fr-typography, D-06 webhook-routes). One `restore-overwrite` 89-05 case flaked once in the first full run and passed in isolation and in the second full run — flaky timing, not a regression. Baseline was 2672 tests; +12 = the 12 new phase tests. Zero removals.
- `git diff --name-only 2374cff4 -- src/locales/` → 0 files (SC-5: zero new i18n keys).
- `git diff 2374cff4 -- package.json package-lock.json` → empty (zero new npm deps; T-101-SC gate auto-satisfied).
- No schema change; `test/groups-config-api.test.mjs` and `test/groups-core.test.mjs` untouched and green (dead-mappings route + boot logWarn byte-identical — D-07/D-13).

## Threat Model Compliance

| Threat | Mitigation landed |
|---|---|
| T-101-01 existence oracle | uniform 404 unknown-id (D-01) + gate-before-lookup; tested with-zero-and-with-rows |
| T-101-02 spray/DoS | throttle-before-gate, 6th attempt 429 tested; sameOrigin-first |
| T-101-03 audit tampering | delete + audit in ONE db.tx; exactly two statements (R-3) |
| T-101-04 injection | all queries parameterized; label/GUID only in audit message columns |
| T-101-05 dead-row disclosure | workspaceName/Slug null for missing workspaces; structured dead flags |
| T-101-SC npm | zero new dependencies — diff-verified |

## Known Stubs

None — every route is fully wired; no placeholders, no TODOs.

## Commits

- `4d0c5dd1` feat(101-01): GET /api/governance/group-mappings — operator list route with server-resolved names + dead/liveMembers hints
- `598cd6c2` feat(101-01): DELETE /api/governance/group-mappings/:id — throttle-before-gate, same-tx audit, lazy revocation
- `3734e3d0` feat(101-01): dialect-parity duplicate backstop + static pg assertions (MAP-03, D-14)

## Self-Check: PASSED

- test/group-mappings-api.test.mjs exists, 11 cases, all passing.
- test/db-adapter.test.mjs extended, T8 static case passing.
- All three commit hashes present in `git log`.
- Full-suite baseline confirmed unchanged (2 pre-existing failures identical).
