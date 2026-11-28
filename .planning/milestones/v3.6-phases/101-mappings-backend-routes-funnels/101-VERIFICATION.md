---
phase: 101-mappings-backend-routes-funnels
verified: 2026-11-27T00:00:00Z
status: passed
score: 12/12 must-haves verified (7 plan truths + 5 roadmap SCs; SC posture mappings documented below)
behavior_unverified: 0
re_verification:
  previous_status: none
---

# Phase 101: Mappings Backend — Routes & Funnels Verification Report

**Phase Goal:** Operators can list and delete Entra group→workspace mappings through server routes that are funnel-clean, audited, and dialect-parity safe — before any UI exists to bypass them.
**Verified:** 2026-11-27
**Status:** ✅ VERIFIED

## Success Criteria (Roadmap — goal-backward)

| # | Criterion | Verdict | Evidence |
|---|-----------|---------|----------|
| SC-1 | Operator GET list with group_guid, label, role, kind, server-resolved workspace name (never bare id), timestamps; uniform non-oracle posture | ✓ TRUE | server.js GET `:9035` — LEFT JOIN workspaces (`workspaceName`/`workspaceSlug` null for dead rows, Pitfall 4 comment), flat camelCase rows with createdAt/updatedAt, `created_at desc`. Posture realized per documented checker ruling: 403 `operatorOnly` for authenticated non-operators (gate before any lookup) + 404 `notFound` only for operator unknown-id DELETE (D-01). Pinned by tests: 401/403×2 gates, uniform-404 case. |
| SC-2 | Operator DELETE audited (`group_mapping_deleted`), generic 404 unknown ids, never writes memberships/team_members | ✓ TRUE | server.js `:9081` DELETE — id-match route, throttle-before-gate, `db.tx` with exactly 2 statements (delete + 12-col audit row, GUID+wsid+label in message cols, operator attribution). Test pins "EXACTLY one group_mapping_deleted audit row, memberships + team_members byte-identical" (R-3). |
| SC-3 | GUID paste variants collapse via `canonicalizeGuid`/`guidRefusal`; viewer refuses at save; (guid, ws) duplicate → keyed `groupMappingDuplicate` in BOTH dialects, never raw 500 | ✓ TRUE | Existing POST funnel untouched (groups-config-api e2e: braced-paste duplicate → 400 `groupMappingDuplicate` at :113-117; viewer refusal loop pinned). New backstop: `isUniqueViolation` (db-adapter.mjs:93 — pg `23505`/message, SQLite regex) wraps POST insert, unit-tested against both dialect shapes; static pg assertions in db-adapter.test.mjs (D-14: live SQLite proof via existing e2e, pg asserted statically). |
| SC-4 | List flags archived/deleted workspace rows inline + mismatch signals derivable | ✓ TRUE (per D-05/R-1 documented narrowing) | `dead`/`deadReason` (`workspace-archived`\|`workspace-deleted`\|null) + `liveMembers` via exact-equality correlated count (`provenance = 'group:' \|\| gm.group_guid`, never prefix LIKE — Pitfall 3 adjacency test). Mismatch clause narrowed to `liveMembers === 0` (pinned: live mapping with zero provenance rows → `dead:false, liveMembers:0`); no audit scan / Graph lookup per R-1. |
| SC-5 | New refusal keys ×5 locales same commit | ✓ TRUE | Zero new keys — backstop reuses existing `groupMappingDuplicate` verbatim. `git diff ad403313..HEAD -- src/locales/` = 0 lines. Trivially satisfied. |

## Requirements & Rulings

| Req | Verdict | Evidence |
|-----|---------|----------|
| MAP-01 | ✓ | GET route as above. D-02 (documented planner decision) overrides the throttle wording: GET unthrottled, DELETE throttled-before-gate. |
| MAP-02 | ✓ | DELETE route as above. |
| MAP-03 | ✓ | Funnel untouched; duplicate backstop added. |
| MAP-04 | ✓ | Structured hints in GET (D-06 flat fields; D-07 dead-mappings card route coexists untouched). |
| R-1 No Graph | ✓ | No Graph calls anywhere in diff; mismatch narrowed to derivable `liveMembers===0`. |
| R-3 Lazy revocation | ✓ | DELETE tx = 2 statements; byte-gate test passes. |
| D-01..D-14 | ✓ all honored | D-01 uniform 404 (tested), D-02 split (tested), D-03 colocated, D-04 isInstanceAdmin only, D-05/D-06 hints, D-07 dead-mappings route untouched (route code byte-identical; only a new comment line added), D-08 opaque id (no canonicalization on DELETE), D-09/D-10/D-11 audit shape (tested: exactly one row, correct columns), D-12 no PATCH (diff has no PATCH), D-13 boot logWarn untouched (diff touches no logWarn), D-14 classifier unit + static pg + live SQLite e2e. |

## Standing Gates

| Gate | Result |
|------|--------|
| Zero new npm deps | ✓ `git diff ad403313..HEAD -- package.json package-lock.json` = 0 lines |
| No schema change | ✓ diff touches only server.js, db-adapter.mjs, 2 test files, planning docs |
| Zero src/locales/ diffs | ✓ 0 lines |
| Baseline 2672+12=2684, exactly 2 pre-existing failures | ✓ `npm test` → 2684 tests, 2651 pass, **2 fail: "every French catalogue value passes the D-05 typography rules" + "GET list: no secret field anywhere; health computed from deliveries" — the documented pre-existing pair**, nothing else |

## Test Evidence (run by verifier, not trusted from SUMMARY)

- `node --test --test-concurrency=2 test/group-mappings-api.test.mjs test/db-adapter.test.mjs` → **45 tests, 44 pass, 0 fail, 1 env-gated pg skip**. Includes: ordering/canonical GUID, archived+missing hints, exact-equality liveMembers adjacency, throttle-before-gate 429 on 6th attempt, uniform 404, R-3 byte-identical member tables, WR-83-03 trail non-match pin, classifier unit, static pg parity.
- Related suites spot-run: `groups-config-api` + `groups-core` + `instance-roles-api` → 45/45 pass. Dead-mappings route + boot warn untouched (D-07/D-13).

## Real-Test Check (the one honest question)

**Yes — the suite is genuine e2e, not static-only.** `test/group-mappings-api.test.mjs` uses `startServer`/`login` helpers (test/helpers/server.mjs) and asserts against a **live HTTP server via `fetch`** (`${server.base}/api/governance/group-mappings`), including GET list, DELETE, 401/403/429/404 ladders, and DB byte-diff assertions. GET list + DELETE are exercised end-to-end. Duplicate refusal is exercised e2e via the pre-check path (groups-config-api :113-117, live server, braced paste → keyed 400); the *constraint-violation backstop* itself (isUniqueViolation path) is unit-tested by design per D-14 — no forced-constraint e2e hack was required by the locked decision. Acceptable per D-14.

## Notes (non-blocking)

1. SC-1 "uniform 404 posture" and SC-4 "mismatch clause" are realized via the documented checker-corrected mappings (403-non-operator + 404-unknown-id; `liveMembers===0`). Both are rational, R-1-consistent readings and are pinned by tests — recorded, not counted as gaps.
2. D-02 overrides MAP-01's GET-throttle wording — documented planner decision, implemented verbatim.
3. Phase 102 UI is the consumer; server intentionally returns raw label (esc() happens at render, T-83-07).

## Verdict: VERIFIED

All 5 roadmap success criteria TRUE in the codebase; all 4 requirements and 14 locked decisions honored; phase's own evidence reproduced live by the verifier; all standing gates green; membership byte-gate holds; real e2e exercises GET + DELETE against a live server.
