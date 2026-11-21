---
phase: 80-group-mapping-core-parser-resolver-overage-detection
plan: 01
subsystem: auth
tags: [entra-id, groups, oidc-claims, overage, sqlite, schema-mirror, guid-canonicalization]

# Dependency graph
requires:
  - phase: 45-database-facade
    provides: db-adapter.mjs SQLITE_SCHEMA mirror + mirror test (test/db-adapter.test.mjs)
  - phase: 75-domain-admission
    provides: domains.js pure-parser / keyed-refusal-funnel precedent, house canonicalization shape
provides:
  - groups.js — server-only pure module: GUID canonicalization, GUID/role keyed refusal funnel, four-outcome resolveGroupsClaim (overage/missing/shape/groups), D-82-1 highest-role-wins resolve() with operatorFlag tri-state
  - group_mappings table in BOTH schema mirrors (server.js SCHEMA + db-adapter.mjs SQLITE_SCHEMA): non-cascading workspace ref (D-82-6), locked 3-token role CHECK, kind column (workspace|operator), (group_guid, workspace_id) unique index
  - test/groups-core.test.mjs — pure unit suite pinning the Phase-81 resolver contract with zero server boot
affects: [phase-81-callback-wiring, phase-82-removal-sync, phase-83-governance-ui]

# Actuals (#2632)
actuals:
  tokens: 101500   # chars/4 over the realized diff (403 insertions / 3 deletions, 5 files)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Four-outcome fail-closed claim detector: overage/missing/shape → { state: 'unmapped', reason } — never [] (removal-sync trap)"
    - "Dedicated operator mapping row kind ('operator') in the same table resolves to operatorFlag true|null — no Phase-81 config migration"
    - "Dual-schema additive DDL: write server.js SCHEMA and db-adapter.mjs SQLITE_SCHEMA together, mirror test enforces"

key-files:
  created:
    - groups.js
    - test/groups-core.test.mjs
  modified:
    - server.js
    - db-adapter.mjs
    - test/db-adapter.test.mjs

key-decisions:
  - "kind column (default 'workspace', CHECK in ('workspace','operator')) added to group_mappings in Task 1 — implements RESEARCH Open Q 2's dedicated operator-mapping row kind so Phase 81 never migrates config"
  - "Non-array groups claim stays fail-closed (unmapped/shape) — single-string tolerance from STACK.md NOT adopted (A5 default)"
  - "operatorFlag is true|null tri-state (never false): matched operator row → true, no match → null"

patterns-established:
  - "Canonicalize-both-sides resolve: claim GUIDs and mapping rows canonicalize before Set matching, so paste variants cannot fork keys"
  - "Keyed refusal funnel reuse: guidRefusal/roleTokenRefusal return the house null|{code,message} shape the 80-02 save API consumes"

requirements-completed: [GM-02, GM-03]

coverage:
  - id: D1
    description: "resolveGroupsClaim resolves the four claim shapes to distinct outcomes (overage pair, overage pointer alone, missing claim, genuinely-empty groups:[]) — overage/missing NEVER yield []"
    requirement: GM-02
    verification:
      - kind: unit
        ref: "test/groups-core.test.mjs#fixture 1: _claim_names alone → unmapped/overage (never [])"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#fixture 2: _claim_names + _claim_sources (full overage pair) → unmapped/overage"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#fixture 3: missing groups claim → unmapped/missing (never [])"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#fixture 4: groups: [] → genuinely-empty groups (DISTINCT from unmapped)"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#hasgroups: true → unmapped/overage"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#non-array groups (string) → unmapped/shape (fail-closed, A5)"
        status: pass
    human_judgment: false
  - id: D2
    description: "GUID paste variants ({braced}, uppercase, no-hyphen) canonicalize to one lowercase-hyphenated key; garbage refuses via the keyed funnel"
    requirement: GM-03
    verification:
      - kind: unit
        ref: "test/groups-core.test.mjs#GUID paste variants collapse to one lowercase-hyphenated key"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#non-hex garbage refuses (empty canonical form, keyed refusal)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Role tokens: strict 3-token allow-list owner|admin|member (no aliases, no viewer widening) via roleTokenRefusal AND the table CHECK"
    requirement: GM-03
    verification:
      - kind: unit
        ref: "test/groups-core.test.mjs#roleTokenRefusal: 3-token allow-list, strict lowercase, no aliases"
        status: pass
      - kind: unit
        ref: "test/db-adapter.test.mjs#group_mappings DDL: insert round-trip, 3-token role CHECK, unique (guid, workspace) pair"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-82-1 highest-role-wins resolver over stored mappings → { grants: [{workspaceId, role, groupGuid}], operatorFlag: true|null }, never throws on any input"
    requirement: GM-02
    verification:
      - kind: unit
        ref: "test/groups-core.test.mjs#resolve: two mappings to one workspace with roles member+admin → single grant, role admin (D-82-1)"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#resolve: member/admin/owner on one workspace → owner wins"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#resolve: operator mapping row matched → operatorFlag true; unmatched → null"
        status: pass
      - kind: unit
        ref: "test/groups-core.test.mjs#resolve: never throws on any input"
        status: pass
    human_judgment: false
  - id: D5
    description: "group_mappings table exists in BOTH schema mirrors with a non-cascading workspace reference, unique (group_guid, workspace_id) index, and boots on a fresh in-memory DB"
    requirement: GM-03
    verification:
      - kind: unit
        ref: "test/groups-core.test.mjs#group_mappings DDL present in BOTH server.js SCHEMA and db-adapter.mjs SQLITE_SCHEMA"
        status: pass
      - kind: unit
        ref: "test/db-adapter.test.mjs#SQLITE_SCHEMA mirror stays identical to server.js SCHEMA modulo comments/whitespace"
        status: pass
      - kind: unit
        ref: "test/db-adapter.test.mjs#runSchema executes the SQLite SCHEMA verbatim through the facade (fresh DB gets 16 tables)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Inert core: full existing suite stays green with the new module and table in place (no behavior change)"
    verification:
      - kind: integration
        ref: "command: npm test — 1992 tests, 0 fail, 13 skipped (pg-gated)"
        status: pass
    human_judgment: false

# Metrics
duration: 8min
completed: 2026-11-20
status: complete
---

# Phase 80 Plan 01: Group Mapping Core Summary

**Inert groups.js core (GUID canonicalization, keyed refusal funnel, four-outcome overage detector, D-82-1 highest-role-wins resolver with operator-flag tri-state) plus the group_mappings table in both schema mirrors, pinned by a pure zero-boot unit suite**

## Performance

- **Duration:** 8 min
- **Started:** 2026-11-20T10:22:00Z (execution ~10:24:16Z)
- **Completed:** 2026-11-20T10:31:58Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- `groups.js` (NEW, server-only, pure): `GUID_SHAPE`, `canonicalizeGuid` (brace/uppercase/no-hyphen variants collapse), `guidRefusal`/`roleTokenRefusal` keyed refusal funnel, `resolveGroupsClaim` four-outcome fail-closed detector, and `resolve()` implementing D-82-1 with the Phase-81 `{ grants, operatorFlag }` contract
- `group_mappings` table added verbatim to `server.js` SCHEMA and `db-adapter.mjs` SQLITE_SCHEMA: workspace reference deliberately NOT cascading (D-82-6 dead-mapping survival), locked 3-token role CHECK, `kind` column for the dedicated operator-mapping row, `(group_guid, workspace_id)` unique index
- `test/groups-core.test.mjs`: all four claim-shape fixtures + canonicalization + role tokens + resolver pinned, importing groups.js with zero server boot; adapter mirror test extended to 16 tables with an in-memory DDL proof (CHECK + unique index + insert round-trip)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end thin slice — table + module + one resolving test** - `e568d33e` (feat)
2. **Task 2: Full groups-core unit suite — four fixtures, canonicalization, highest-role-wins resolver** - `67fdc6e1` (test)
3. **Task 3: Mirror-test table list + fresh-boot table creation proof** - `848a13e2` (test)

## Files Created/Modified
- `groups.js` - NEW server-only pure module: validators, four-outcome overage detector, D-82-1 resolver
- `test/groups-core.test.mjs` - NEW pure unit suite (21 tests, no server boot)
- `server.js` - group_mappings DDL appended to `const SCHEMA`
- `db-adapter.mjs` - group_mappings DDL mirrored into SQLITE_SCHEMA
- `test/db-adapter.test.mjs` - TABLES list 15→16, in-memory DDL proof test

## Decisions Made
- Added a `kind` column (`'workspace'|'operator'`, default `'workspace'`) to group_mappings: RESEARCH Open Question 2's dedicated operator-mapping row kind requires schema support, and adding it in Task 1 (instead of post-hoc) keeps the dual mirror identical and spares Phase 81 any config migration
- Non-array `groups` claim (e.g. single string) resolves to unmapped/shape — fail-closed A5 default; single-string tolerance NOT adopted
- `operatorFlag` is `true | null` (never `false`): a matched `kind:'operator'` row → `true`; no match → `null` (tri-state the callback reads)

## Deviations from Plan

### Auto-fixed Issues

**1. [Plan-internal conflict] `kind` column added to the Task-1 verbatim DDL**
- **Found during:** Task 1 (schema) / Task 2 (resolver action)
- **Issue:** Task 1's verbatim DDL omits any operator representation, but Task 2's action mandates "a dedicated operator mapping row kind in the same table" (RESEARCH Open Q 2) — the two tasks conflict, and the dual mirror must stay byte-identical
- **Fix:** Added `kind text not null default 'workspace' check (kind in ('workspace','operator'))` to the DDL in BOTH mirrors at Task 1, with an in-place comment
- **Files modified:** server.js, db-adapter.mjs
- **Verification:** mirror test green; in-memory DDL test proves the CHECK and insert round-trip
- **Committed in:** e568d33e (Task 1 commit)

**2. [TDD cycle collapse] resolve() implemented in the tracer slice, not Task 2**
- **Found during:** Task 2 (RED phase)
- **Issue:** The plan instructs "Add the resolver to the module in this task, not the tracer", but Task 1's vertical slice (production-quality throughout) already shipped `resolve()` — the RED test suite therefore passed immediately (tdd.md: "test passes → feature exists — investigate"), so no RED/GREEN commit pair could exist
- **Fix:** Kept the test-first commit (`test(80-01)`), verified the full resolver behavior suite green, documented instead of artificially reverting/re-adding implementation
- **Files modified:** test/groups-core.test.mjs
- **Verification:** node --test test/groups-core.test.mjs — 21/21 pass
- **Committed in:** 67fdc6e1 (Task 2 commit)

---

**Total deviations:** 2 (1 plan-internal conflict resolved in favor of the Task-2 mandate, 1 TDD-cycle collapse)
**Impact on plan:** No scope creep — both deviations narrow to exactly the behaviors the plan's own Task 2 / must_haves demand. The contract Phase 81 consumes is unchanged.

## Issues Encountered
- Backticks inside the new SQL comments broke both SCHEMA template literals (mirror test red + SyntaxError on import) — caught by the mirror test, fixed within Task 1 by de-backticking the comments

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Ready for 80-02 (save API): `guidRefusal`/`roleTokenRefusal` return the house `null|{code,message}` funnel the save route consumes; the table + unique index are live on next boot
- Phase 81 can pass `verifyIdToken()` claims straight into `resolveGroupsClaim`/`resolve` — contract fixed and pinned, no migration needed
- The `test/dependencies.test.mjs` COPY-target array update is deferred to the plan that makes server.js actually import groups.js (80-02 or 81), per that test's runtime-import trigger

---
*Phase: 80-group-mapping-core-parser-resolver-overage-detection*
*Completed: 2026-11-20*
