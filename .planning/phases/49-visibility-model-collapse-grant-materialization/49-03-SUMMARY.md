---
phase: 49
plan: 03
subsystem: visibility
tags: [visibility, migration, scope-retirement, mcp, tests]
requires: [49-01 visibility fixture/oracles, 49-02 materializeVisibilityGrants sweep]
provides: [collapsed visibility predicate (private ∨ access list), retired scope surfaces, collapsed MCP mirror, rewritten test suites]
affects: [client surfaces (Phase 51), i18n err.* catalogue pruning]
tech-stack:
  added: []
  patterns: [single-funnel predicate, dated block comments (D-49-1..8), sweep-materialized oracles]
key-files:
  created: []
  modified:
    - server.js
    - mcp.js
    - test/scope.test.mjs
    - test/privacy.test.mjs
    - test/mcp.test.mjs
    - test/oidc-sso.test.mjs
    - test/error-codes.test.mjs
decisions:
  - D-49-1: hiddenFor collapses to private-hidden; scope term retired
  - D-49-2: team term deleted from server and mirror predicates
  - D-49-3: assignee write-guard rides memberCanReadProject ('Assignee cannot read the task project')
  - D-49-4: projectIsPrivate honors only the boolean private flag
  - D-49-5: scope route/writers retired; columns dormant-on-disk as sweep input
  - mcp mirror KEEPS the ROLE_RANK admin bypass (documented divergence residue, pinned in parity tests)
metrics:
  duration: ~75m
  completed: 2026-11-07
status: complete
plan_head_before: f7df83a63a37c1fe070d99b8160e4c41229988c3
plan_head_after: 5f7c8c8
commits: 3
actuals:
  tokens: 61000
  tasks: 3
  commits: 3
---

# Phase 49 Plan 03: Visibility Model Collapse Summary

**One-liner:** Collapsed visibility to boolean-private ∨ access list across server + MCP mirror, retired every scope writer (route, invites, addMembership, promotion), and rewrote the suites to the collapsed model — 1079 pass / 0 fail with canaries unmodified.

## What Was Built

- **server.js** — `projectIsPrivate` honors only `p.private === true` (D-49-4); `teamIntersects`, `projectScope`/`CORRUPT_SCOPE_WARNED`, `inScopeProject`, `scopeGrants` deleted; `memberCanReadProject` collapses to the access-list check; `hiddenFor` reduces to private-hidden with the admin exemption kept (D-49-1); `normalizeProjects` drops the `p.team`→`teams[]` migration (D-49-6 byte-identity marker preserved); `mergeClientDoc` assignee guard rides `memberCanReadProject` (D-49-3); send-time consumers (email mirror, reminder pass, digest loop) drop the scope prefix and keep one gate; scope writers retired — PUT `members/:uid/scope` deleted, invites never validate/store/echo scope, `addMembership` writes NULL scope, promotion no longer clears the column (D-49-5). The schema columns remain, documented as sweep input only.
- **mcp.js** — `canReadProject` rewritten in place (no server.js import): boolean private ∨ access list, team_members query deleted, ROLE_RANK admin bypass KEPT per PATTERNS lockstep decision (residue pinned in parity tests).
- **test/scope.test.mjs** — wholesale rewrite (1247→~490 lines): retired route 404, invite scope NULL + acceptance NULL, collapsed funnel cells (doc GET, resurrection guard, assignee guard 400 `assigneeOutOfScope` with the new message, file-serve byte-identical 404, send-time SMTP gating), team-term retirement, activity/recent-search scrubbing, SEARCH-01 tokenized redaction, client emit pre-filter kept for Phase 51.
- **test/privacy.test.mjs** — the 3 sanctioned NEW-MODEL skips un-skipped (team-derived → hidden, public gain pinned, VIS-02 removal-flip cell added); legacy `access:'private'` cells re-pinned to the documented collapse behavior (reads as public; write path normalizes it away).
- **test/mcp.test.mjs** — parity comments flipped to the collapsed model; the post-sweep oracle pins (`VISIBILITY_MODEL`/`MIRROR_MODEL` + sweep deltas) are exactly the collapsed-model expectations, so the pins survive unchanged with the admin-bypass residue documented as the remaining divergence.
- **Collateral fixes (Rule 3):** `test/oidc-sso.test.mjs` (SSO auto-accept now asserts NULL membership scope), `test/error-codes.test.mjs` (six retired scope codes allowlisted as client-side-only until Phase 51).

## Verification

- `npm test`: **1090 tests, 1079 pass, 0 fail, 11 skipped** (all pre-existing; baseline was 14 pre-existing + 3 sanctioned — the 3 are now un-skipped and green).
- Canaries `test/due-reminders.test.mjs` + `test/digest.test.mjs` pass **unmodified** (39/39).
- `grep -nE "projectScope|inScopeProject|scopeGrants|teamIntersects|scopeByMember" server.js` → only sweep-era historical comments remain (intentionally untouched).
- visibility-migration + migration suites pass unchanged (sweep untouched).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Send-time consumer edits folded into the Task 1 commit**
- **Found during:** Task 1
- **Issue:** Task 1 deleted `projectScope`/`inScopeProject` while the reminder/digest/email-mirror call sites (Task 2 scope) still referenced them → ReferenceError at runtime, REM-05 canary red. Committing Task 1 alone would have shipped a broken commit.
- **Fix:** The mechanical "delete scope prefix, keep helper" consumer edits moved into the Task 1 commit; Task 2 then carried the scope-writer/mirror changes.
- **Files modified:** server.js (same file, both commits)
- **Commit:** 1b6cebf (consumers), 5474078 (writers)

**2. [Rule 3 - Blocking] Collateral test fixes outside the plan's file list**
- **Found during:** Task 3 (full `npm test`)
- **Issue:** `test/oidc-sso.test.mjs` pinned the old invite-scope→membership write; `test/error-codes.test.mjs` reverse-parity flagged `err.scopeNotAllowed` (+5 sibling scope codes) as emitted nowhere after the route deletion.
- **Fix:** oidc-sso asserts NULL scope; error-codes allowlists the six codes as client-side-only with a dated Phase 51 note.
- **Files modified:** test/oidc-sso.test.mjs, test/error-codes.test.mjs
- **Commit:** 5f7c8c8

**3. [Rule 1 - Bug-fix in tests] scope.test.mjs rework details**
- **Found during:** Task 3
- **Issue:** GET `/invites` projects no `url` (token must be captured from the POST response); the `p_sarah` redaction fixture needed a non-empty access list (private-empty projects are served via the owner-injection path); recent-search expectations changed because the hidden collision was scope-derived.
- **Fix:** Captured `scopedInviteUrl` at creation; gave the fixture project a lead; expectations re-derived from the collapsed model.
- **Commit:** 5f7c8c8

## Auth Gates

None.

## Known Stubs

None. Note for the verifier: the client store's `memberScopeEligible` (src/core/store.js) and the client i18n entries for the six retired scope codes are intentionally untouched — Phase 51 owns client surfaces.

## Self-Check: PASSED
- server.js, mcp.js modified ✓ (commits 1b6cebf, 5474078)
- 5 test files rewritten/fixed ✓ (commit 5f7c8c8)
- Full suite green ✓ (1079 pass / 0 fail / 11 skipped)
