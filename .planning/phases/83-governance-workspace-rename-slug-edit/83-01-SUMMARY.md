---
phase: 83-governance-workspace-rename-slug-edit
plan: 01
subsystem: server-governance
tags: [operator-routes, slug-validation, dead-mappings, audit-trail, no-redirect]
requires:
  - Phase 79 operator workspace governance family (guard order template)
  - sanitizeSlug/uniqueSlug/wsBySlug slug helpers (~server.js:941–960)
  - Phase 82 encoded guard trail (group_<delta>:group:<guid>:<reason>)
provides:
  - POST /api/auth/operator/workspaces/:id/rename
  - GET /api/auth/operator/dead-mappings
  - api.operatorWsRename(id, {name, slug})
  - api.operatorDeadMappings()
affects:
  - 83-02 (UI renders against these contracts)
tech-stack:
  added: []
  patterns:
    - Phase 79 guard order (sameOrigin → requireUser → throttle → operator gate → target lookup)
    - Wave 0 TDD (RED test commit precedes implementation commit)
key-files:
  created:
    - test/governance-rename.test.mjs
  modified:
    - server.js
    - src/core/api.js
    - test/i18n-core-features.test.mjs
decisions:
  - Archived workspaces are renameable — fetch by id, never requireWorkspace (planner decision per CONTEXT discretion)
  - Slug examples like 'UPPER-case!' in the plan sanitize to a valid slug via slugify (D-04 verbatim reuse); tests use genuinely-invalid inputs ('x', '!!!')
  - Dead-mappings trail bound fixed at 100 rows, created_at desc
metrics:
  duration: ~35 min
  completed: 2026-11-20
  commits: 5
  plan_head_before: cc6a3233~1
  plan_head_after: b1dcae5a
status: complete
actuals:
  tokens: 61000
  tasks: 3
  commits: 5
---

# Phase 83 Plan 01: Workspace Rename & Slug Edit — Server Half Summary

**One-liner:** Operator rename route (Phase 79 guard order, slug rules reused verbatim, no existence oracle) + on-read dead-mappings route (orphans + encoded guard trail) with their api.js client methods, proven by a 17-case Wave 0 node:test suite.

## What Was Built

1. **Wave 0 suite** `test/governance-rename.test.mjs` (17 tests) — RED-committed first (`cc6a3233`), all failing against the absent routes, then green after Tasks 1–2.
2. **Rename route** `POST /api/auth/operator/workspaces/:id/rename` (commit `db28183a`): sameOrigin FIRST → requireUser → `op-ws-rename|<operator.id>` throttle (5/15 min) → isInstanceAdmin gate BEFORE target lookup → fetch by id (archived rows renameable). D-04 slug rules verbatim: trim+slice(0,60) name → workspaceNameRequired; sanitizeSlug → invalidSlug (explicit literal); self-collision excluded (`next !== ws.slug`); collision → 409 slugTaken with `uniqueSlug(next, ws.id)` suggestion. D-06: logInfo `(governance)` line with old→new slug + operator email, NO audit_log row.
3. **Dead-mappings route** `GET /api/auth/operator/dead-mappings` (commit `0138c71f`): sameOrigin → requireUser → isInstanceAdmin; NO throttle (GET read precedent, commented). Query A = boot orphan predicate on-read (exact JS Set membership), raw `group_guid/workspace_id/kind/label`; Query B = `audit_log where action like 'group_%:group:%' order by created_at desc limit 100`, returned untransformed (first-colon split is client concern per D-08). D-09: derived on read, zero schema change.
4. **api.js client methods** `operatorWsRename` + `operatorDeadMappings` in the operator block, phase-refs comments per convention.
5. **D-15 pin** tightened (commit `dd0e7f96`): old-slug response asserted with NO `location` header key at all + keyed `workspaceNotFound` body; new-slug 200 control. `/w/:slug` was probed and is NOT a slug resolver (SPA fallback, no redirect) — out of D-15 scope.
6. **api.js call-site count pin** 56→58 (commit `b1dcae5a`) — same-commit pin convention for the two new `call()` sites.

## Verification (all commands run, all outcomes confirmed)

- `node --test test/governance-rename.test.mjs` (RED): **fail 17 / pass 0** — confirmed route-absent failure ✅
- Same command (GREEN): **pass 17 / fail 0** ✅
- `node --test test/governance-rename.test.mjs test/governance.test.mjs`: **pass 34 / fail 0** (Phase 79 family unregressed) ✅
- `npm test` (full suite): **tests 2039, pass 2026, fail 0, skipped 13** ✅ (one run failed first at the stale 56 count pin; fixed in `b1dcae5a`, re-run green)
- Acceptance greps: `op-ws-rename` ≥1 ✅; `dead-mappings` ≥1 ✅; `group_%:group:%` + limit 100 in route ✅; `operatorWsRename`/`operatorDeadMappings` exported ✅; `requireWorkspace` absent from the rename block ✅; no new error-code vocabulary (all literals from the D-04 reused set) ✅

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Plan precision] Slug examples 'UPPER-case!' / 41-char slug are actually VALID under sanitizeSlug**
- **Found during:** Task 1 GREEN
- **Issue:** The plan's behavior list expects 400 invalidSlug for 'UPPER-case!', but `sanitizeSlug` slugifies first (NFKD, lowercase, strip non-alnum), producing 'upper-case' — the same behavior as workspace creation (D-04 mandates verbatim reuse, so folding IS the contract).
- **Fix:** Tests use genuinely-invalid inputs ('x' too short, '!!!' sanitizes to empty); case-folding acceptance is implicitly pinned by the self-collision test.
- **Files modified:** test/governance-rename.test.mjs
- **Commit:** db28183a

**2. [Rule 1 - Pin maintenance] test/i18n-core-features.test.mjs call-site count 56→58**
- **Found during:** full-suite verification
- **Fix:** bumped the pin with the historical +2 annotation (established convention).
- **Commit:** b1dcae5a

**3. [Sequencing note] Task 1's file-level verify could not be green at Task 1 commit** — the Wave 0 RED file pre-contains Task 2's dead-mappings cases (D-13: one suite). Task 1 commit left those 6 cases red by design; green reached at Task 2 commit. Order and commits follow the TDD gate (test commit cc6a3233 precedes implementation commit db28183a).

## Auth Gates

None.

## Known Stubs

None — no placeholder data paths; both routes are fully wired.

## Threat Model Compliance

- T-83-01 ✅ operator gate before lookup; real+fake id identical 403 pinned
- T-83-02 ✅ raw values returned; no rendering added this plan (escaping in 83-02)
- T-83-03 ✅ sameOrigin-first pinned by cross-origin test
- T-83-04 ✅ reserved-slug refusal pinned ('api', 'login')
- T-83-05 ✅ operator-keyed tooMany 5/15min

## Self-Check: PASSED

- test/governance-rename.test.mjs — FOUND
- Commits cc6a3233, db28183a, 0138c71f, dd0e7f96, b1dcae5a — all FOUND in git log
