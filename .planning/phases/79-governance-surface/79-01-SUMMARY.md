---
phase: 79-governance-surface
plan: 01
subsystem: api
tags: [workspaces, operator, governance, audit-log, sqlite-migration, soft-archive, i18n]

# Dependency graph
requires:
  - phase: 78-creation-gate-instance-owner-identity
    provides: isInstanceAdmin operator gate, /api/auth/operator/users route-family shape, operatorOnly 403 pattern, test harness BASE_ENV operator stamping
provides:
  - workspaces.archived soft flag (SCHEMA + SQLITE_SCHEMA mirror + adapterEnsureColumn migration)
  - requireWorkspace archived-entry funnel (keyed 403 workspaceArchived) + membershipsOf/firstWorkspace archived filters
  - operator-gated /api/auth/operator/workspaces route family (listing, archive/unarchive, empty-only delete with orphan dispositions, member reassign/release)
  - 6 new err keys in all 5 locale catalogues (workspaceArchived, workspaceNotEmpty, dispositionRequired, memberAlreadyMember, invalidRole, invalidBody)
  - test/governance.test.mjs — 14-test WSG-07/WSG-08 gate-matrix suite incl. audit-rollback pin and pre-column migration fixture
affects: [79-02 (client governance page consumes the route family + listing payload), pg adapter parity, audit-log consumers]

# Actuals (#2632)
actuals:
  tokens: 170000
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Governance routes fetch rows by id via db.get — NEVER requireWorkspace (unarchive must stay possible; no non-member 404)"
    - "Operator route family guard order verbatim: sameOrigin → requireUser → isInstanceAdmin → throttle(operator.id) → target lookup (no existence oracle)"
    - "Delete dispositions validated server-side against membersOf regardless of client state; role whitelist excludes viewer"

key-files:
  created:
    - test/governance.test.mjs
  modified:
    - server.js
    - db-adapter.mjs
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/nl.json
    - src/locales/de.json
    - src/locales/es.json
    - test/static-db-audit.test.mjs
    - test/i18n-core-features.test.mjs

key-decisions:
  - "Creator derived from the owner-membership LEFT JOIN — no created_by column added (Pitfall 1, honest null when the owner membership is gone)"
  - "Archived refusal lives only in requireWorkspace; wsBySlug untouched to preserve slug-collision semantics (archived ws keeps occupying its slug)"
  - "memberAlreadyMember is a keyed 409 refusal (not a silent upsert) per Pitfall 6"
  - "Audit vocabulary: workspace_archived/unarchived/deleted + member_reassigned/member_released, every row inside the mutation db.tx; delete snapshot echoes the slug and the disposition summary"
  - "collate-nocase pin raised 7→8 for the operator listing ORDER BY (deliberate new site, same collation family as membershipsOf)"

patterns-established:
  - "Operator workspace route family shape for future instance-scoped surfaces"
  - "Empty-only delete: raw-doc content check FIRST (workspaceNotEmpty), disposition completeness SECOND (dispositionRequired) — two distinct refusals (Pitfall 5)"

requirements-completed: [WSG-07, WSG-08]

coverage:
  - id: D1
    description: "Operator GET /api/auth/operator/workspaces lists ALL workspaces with name/slug/memberCount/creator/createdAt/archived, incl. non-member workspaces; creator null when the owner membership is gone"
    requirement: WSG-07
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#operator GET /api/auth/operator/workspaces lists ALL workspaces incl. one the operator holds no membership in"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#creator is null when the owner membership is gone"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-operators get EXACT 403 operatorOnly from every /api/auth/operator/workspaces* route — never 404 or empty 200, no workspace-existence oracle (unknown ids yield the same refusal)"
    requirement: WSG-07
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#non-operator GET listing → EXACT 403 operatorOnly"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#non-operator POST archive with an UNKNOWN workspace id gets the SAME 403 operatorOnly"
        status: pass
    human_judgment: false
  - id: D3
    description: "Archive/unarchive: member slug entry 403 workspaceArchived via requireWorkspace, archived ws hidden from member listing and boot fallback, unarchive restores both"
    requirement: WSG-08
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#archive hides the workspace from the member listing and refuses slug entry with 403 workspaceArchived; unarchive restores both"
        status: pass
    human_judgment: false
  - id: D4
    description: "Empty-only hard delete: raw-doc content check refuses 409 workspaceNotEmpty; missing dispositions refuse 409 dispositionRequired; full dispositions execute — memberships moved/dropped, workspace/memberships/invites gone, audit rows for the delete AND each disposition"
    requirement: WSG-08
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#delete a workspace whose raw doc carries a project → 409 workspaceNotEmpty, workspace intact"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#delete a workspace with 1 member and no disposition sent → 409 dispositionRequired, membership intact"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#delete with full dispositions → 200; memberships moved/dropped; workspace, memberships and invites gone; audit rows for delete AND dispositions"
        status: pass
    human_judgment: false
  - id: D5
    description: "Standalone member reassign (target+role upsert, memberAlreadyMember keyed refusal) and release (membership dropped, empty list = await-access state)"
    requirement: WSG-08
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#standalone release: member with no other workspace ends with an empty workspace list"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#standalone reassign to a target where the member already holds a membership → 409 memberAlreadyMember, no mutation"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#standalone reassign upserts the target membership with the chosen role and audits member_reassigned"
        status: pass
    human_judgment: false
  - id: D6
    description: "Audit-in-same-tx: exactly one audit row per archive/unarchive; forced audit failure rolls the mutation back (AUD-01/D-R3)"
    requirement: WSG-08
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#archive/unarchive each append exactly ONE audit_log row with the operator-workspace verb vocabulary"
        status: pass
      - kind: unit
        ref: "test/governance.test.mjs#forced audit failure rolls the archive mutation back (AUD-01 db.tx discipline)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Migration: a pre-column DB boots, gains workspaces.archived default 0 via adapterEnsureColumn, no backfill errors; flag exposed as boolean in the listing"
    requirement: WSG-08
    verification:
      - kind: unit
        ref: "test/governance.test.mjs#a pre-column DB (workspaces without archived) boots and gains workspaces.archived default 0"
        status: pass
    human_judgment: false
  - id: D8
    description: "Refusal-key locale parity: 6 new err keys present in all 5 catalogues (en/fr/nl/de/es) in the same commit as the emitting gates"
    requirement: WSG-08
    verification:
      - kind: unit
        ref: "node --test test/catalogue.test.mjs (27/27 pass)"
        status: pass
      - kind: unit
        ref: "node --test test/error-codes.test.mjs (server-emitted codes ↔ catalogue parity)"
        status: pass
    human_judgment: false

# Metrics
duration: 31 min
completed: 2026-11-20
status: complete
---

# Phase 79 Plan 01: Governance Surface server foundation Summary

**Soft-archive flag + operator-gated /api/auth/operator/workspaces route family (listing, archive/unarchive, empty-only delete with orphan dispositions, member reassign/release) behind the requireWorkspace archived funnel, proven by a 14-test RED→GREEN suite**

## Performance

- **Duration:** 31 min
- **Started:** 2026-11-20T07:41:19Z
- **Completed:** 2026-11-20T08:12:27Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- `workspaces.archived` soft flag shipped schema → SQLITE_SCHEMA mirror → `adapterEnsureColumn` migration (byte-identical def, pre-column-DB fixture test)
- Archived refusal enforced at the single entry funnel (`requireWorkspace`, keyed 403 `workspaceArchived`) plus `membershipsOf`/`firstWorkspace` hiding; `wsBySlug` untouched (slug-collision semantics preserved)
- Full operator route family with the Phase 78 guard order verbatim (sameOrigin first, operator gate before any target lookup — no existence oracle), throttles keyed on `operator.id`, empty-only delete on the RAW doc, server-side disposition re-check, role whitelist excluding viewer, keyed `memberAlreadyMember` 409
- Every mutation + its audit row share one `db.tx` (rollback pinned by the forced-failure test); owner-scoped DELETE left untouched with the asymmetry documented in a route comment
- 6 refusal keys in all 5 locale catalogues, same commit as the emitting gates

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 — failing server suite (RED)** - `369e2335` (test)
2. **Task 2: Schema column, archived funnel gate, operator route family (GREEN)** - `532adf5c` (feat)
3. **Task 3: Full-suite regression pass + audit-atomicity pin** - `f6f82225` (test)

**Plan metadata:** committed with the SUMMARY (docs: complete plan)

## Files Created/Modified
- `server.js` — archived column (SCHEMA + migration), requireWorkspace funnel gate, membershipsOf/firstWorkspace filters, 6-route operator workspaces family, owner-DELETE asymmetry comment
- `db-adapter.mjs` — SQLITE_SCHEMA mirror gains `archived integer not null default 0`
- `src/locales/{en,fr,nl,de,es}.json` — err.workspaceArchived/workspaceNotEmpty/dispositionRequired/memberAlreadyMember/invalidRole/invalidBody
- `test/governance.test.mjs` — NEW 14-test WSG-07/WSG-08 suite (gate matrix, archive/delete/orphan semantics, audit atomicity, migration fixture)
- `test/static-db-audit.test.mjs` — collate-nocase pin 7→8 (deliberate operator-listing ORDER BY site)
- `test/i18n-core-features.test.mjs` — EN catalogue count pin 1958→1964

## Decisions Made
- Creator derived from the owner-membership LEFT JOIN; no `created_by` column (historical rows can't be backfilled truthfully)
- `memberAlreadyMember` is a keyed refusal, not a silent upsert (Pitfall 6)
- Delete content check reads the RAW stored doc (`data.projects` / nested `tasks`); corrupt doc treated as empty
- Governance routes never ride `requireWorkspace` — rows fetched by `db.get` so unarchive stays possible (Pitfall 3)
- Standalone reassign removes the source membership row (a reassign is a move, matching the delete-path semantics)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] SQLITE_SCHEMA mirror in db-adapter.mjs updated**
- **Found during:** Task 2 (full-suite run)
- **Issue:** test/db-adapter.test.mjs pins the adapter's SQLITE_SCHEMA byte-identical to server.js SCHEMA modulo comments — the new column broke the pin
- **Fix:** added `archived integer not null default 0` to the mirror (same byte-identical discipline)
- **Files modified:** db-adapter.mjs
- **Verification:** db-adapter + migration suites green
- **Committed in:** 532adf5c

**2. [Rule 1 - Bug] Emission-parity + catalogue-count pins updated for the new err keys**
- **Found during:** Task 3 (full-suite run)
- **Issue:** the plan's 4 locale keys left `invalidRole`/`invalidBody` (also emitted by the routes) uncatalogued → error-codes.test.mjs red; the frozen EN catalogue count pin (1958) also red
- **Fix:** added err.invalidRole/err.invalidBody to all 5 catalogues (same parity discipline as the planned 4 keys) and raised the count pin 1958→1964 with the phase-79 note
- **Files modified:** src/locales/*.json (5), test/i18n-core-features.test.mjs
- **Verification:** error-codes + catalogue suites green
- **Committed in:** f6f82225

**3. [Rule 1 - Bug] collate-nocase pin 7→8**
- **Found during:** Task 3 (full-suite run)
- **Issue:** the operator listing's `order by w.created_at, w.name collate nocase` (research-prescribed shape) tripped the frozen D-10 no-NEW-nocase pin
- **Fix:** raised the pinned count to 8 with a comment naming the deliberate Phase 79 site (same collation family as membershipsOf)
- **Files modified:** test/static-db-audit.test.mjs
- **Verification:** static-db-audit suite green
- **Committed in:** f6f82225

**4. [Rule 1 - Bug] Test-side fixture fixes in the Wave 0 suite**
- **Found during:** Tasks 1-2
- **Issue:** session-payload route is `/api/auth/me` (payload `{user.workspaces}`), not `/api/me`; one invite fixture minted by the wrong workspace's owner
- **Fix:** corrected the three `/api/me` fetches to `/api/auth/me` + `data.user.workspaces`; target-workspace invite minted by its own owner
- **Files modified:** test/governance.test.mjs
- **Verification:** governance suite 14/14 green
- **Committed in:** 532adf5c / f6f82225

---

**Total deviations:** 4 auto-fixed (2 blocking, 2 bug — all test/pin-companions of the planned surface)
**Impact on plan:** All fixes necessary for the standing suite pins; no scope creep — the shipped server surface matches the plan exactly.

## Issues Encountered
None beyond the documented deviations.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The server control surface (D-11: "the server 403 is the control") is complete and pinned by tests — plan 02 can build the governance client page against `GET /api/auth/operator/workspaces` payload `{workspaces:[{id,slug,name,archived,createdAt,memberCount,creator:{name,email}|null}]}` and the action routes (archive/unarchive/delete with `dispositions:[{userId,type:'reassign',targetWorkspaceId,role}|{userId,type:'release'}]`, members/:userId/reassign with `{targetWorkspaceId,role}`, members/:userId/release)
- OperatorCard relocation (WSG-09, D-01) still pending in plan 02 — the Phase 78 endpoints are reused unchanged
- Full suite green except the STATE.md-documented webhook-events pre-existing failure; lint clean

---
*Phase: 79-governance-surface*
*Completed: 2026-11-20*
