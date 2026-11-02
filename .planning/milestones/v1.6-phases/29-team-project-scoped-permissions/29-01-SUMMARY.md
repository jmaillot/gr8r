---
phase: 29-team-project-scoped-permissions
plan: 01
subsystem: server
tags: [scope, permissions, migration, tdd, redaction]
status: complete
requires: [team_members authority rows (Phase 28), hiddenProjectIds/redactDoc/mergeClientDoc funnel]
provides:
  - memberships.scope + invites.scope JSON columns (null = workspace-wide, D-02)
  - projectScope()/inScopeProject() scope predicate (single point of truth for the phase)
  - hiddenFor() — one scope-aware funnel consumed by redactDoc AND mergeClientDoc
  - PUT /api/workspaces/:slug/members/:uid/scope — admin-gated, whitelist-validated, no revision claim (D-12)
affects: [29-02 route sweep, 29-03 notifications, 29-04 invites]
tech-stack:
  added: []
  patterns: [ensureColumn additive migration, authority-row membership edits, byte-identical boot pin, RED→GREEN TDD]
key-files:
  created: [test/scope.test.mjs]
  modified: [server.js, test/migration.test.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
key-decisions:
  - "hiddenFor() composes private-hidden ∪ out-of-scope disjunctively — never `canSeeProject && inScope` — so the D-03 scope-grants-access inversion (Plan 02's private-project guest) can ride the same function"
  - "Empty scope ({teams:[],projects:[]}) is stored as null = workspace-wide (D-01), and projectScope() returns null for admin+ roles regardless of stored JSON (D-04 server-side)"
  - "redactDoc signature changed from (doc, memberId) to (doc, membership) — the only call site (docForClient) already held the membership"
  - "Admin+ scope targets are rejected outright (400 scopeNotAllowed), not silently nulled — honesty over magic (research open question 3)"
  - "Promotion to admin/owner nulls memberships.scope inside the PATCH role transaction (no window where an admin carries a scope)"
requirements-completed: [SCOPE-01]
duration: 11 min
completed: 2026-11-02T08:53:12Z
estimate:
  tokens: 120000
actuals:
  tokens: 6500
  tasks: 3
  commits: 5
plan_head_before: 34c432126f472c6c9ce21c4cce584f0b98ac1ea9
plan_head_after: d31e395fb319b1146d6e52b20c11ed1c45cabafe
commits: 5
coverage:
  - deliverable: "Scope columns on memberships and invites (D-02)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#the scope columns exist on memberships and invites", status: pass }, { kind: tests, ref: "test/migration.test.mjs#the scope columns land on memberships and invites and survive the reboot unchanged", status: pass }]
    human_judgment: false
  - deliverable: "Scope set via API → scoped member's doc GET omits out-of-scope projects and dependents (read side)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#a scoped member's doc GET omits out-of-scope projects and every dependent list", status: pass }]
    human_judgment: false
  - deliverable: "Scoped doc PUT cannot resurrect out-of-scope rows (write side, T-29-04)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#a scoped doc PUT cannot resurrect out-of-scope rows", status: pass }]
    human_judgment: false
  - deliverable: "D-04: admin/owner always workspace-wide — scope writes rejected, stored JSON ignored, promotion clears scope transactionally"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#a scope write to an admin or owner target is rejected (D-04)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#stored scope JSON can never blind an admin (D-04, server-side predicate)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#promoting a scoped member to admin clears the scope in the same transaction (D-04)", status: pass }]
    human_judgment: false
  - deliverable: "Full validation: whitelist vs doc, caps 25, trim/slice/dedup, scope-explicit 400 (T-29-01)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#scope ids are whitelisted against the workspace document (T-29-01)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#scope caps mirror the teams cap (25 per list)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#scope lists are trimmed, sliced and deduped like the teams route", status: pass }]
    human_judgment: false
  - deliverable: "Scope route carries no revision claim; doc byte-unchanged (D-12)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#the admin can set a project scope on a member and it lands in the authority row", status: pass }, { kind: tests, ref: "test/scope.test.mjs#the workspace document is byte-unchanged by a scope write", status: pass }]
    human_judgment: false
  - deliverable: "Two-browser admin-vs-scoped-member visual check of the tracer path (human-check on task 1)"
    human_judgment: true
    rationale: "Tracer's human-check asks for a live two-browser walkthrough of the filtered board; deferred to /gsd-verify-work per end-of-phase verify mode. The automated tracer slice covers the same server-side contract."
---

# Phase 29 Plan 01: Scope Substrate Summary

**One-liner:** Membership/invite JSON scope columns + the shared `projectScope`/`hiddenFor` predicate funneled into both `redactDoc` and `mergeClientDoc`, with an admin-gated whitelist-validated scope route — proven end-to-end by a tracer slice (set → read filters → write reserved).

## Accomplishments

- **Migration (D-02):** `ensureColumn(db, 'memberships', 'scope', 'text')` and `ensureColumn(db, 'invites', 'scope', 'text')` — additive-only, no backfill (null = workspace-wide), pinned byte-identical across boots in `test/migration.test.mjs`.
- **Predicate:** `projectScope(membership)` (defensive JSON parse; empty scope = workspace-wide; D-04 — admin+ roles always read null) and `inScopeProject(p, scope)` (explicit projects ∪ scoped teams' projects) beside `canSeeProject`.
- **Single funnel:** `hiddenFor(doc, membership)` = private-hidden ∪ out-of-scope, consumed by **both** `redactDoc` and `mergeClientDoc` — 9 dependent lists filter automatically; no second pipeline. Composed disjunctively so Plan 02's D-03 grant inversion can ride the same function.
- **Scope route (D-12):** `PUT /api/workspaces/:slug/members/:uid/scope` — `requireWorkspace('admin')` → `sameOrigin` → `readJson` → `notAMember` 404 → D-04 `scopeNotAllowed` 400 → full validation (trim + 40-char slice, Set-dedup, cap 25, whitelist vs doc) → transaction writes only `memberships.scope` → responds `{ member }` with **no `revision` claim**; doc byte-untouched. D-05: `memberPayload` never projects scope.
- **D-04 promotion:** member PATCH to admin/owner nulls `memberships.scope` inside the same transaction.
- **Tests:** new `test/scope.test.mjs` (15 tests: tracer slice + validation matrix), migration pin extended; full suite 697/697 green.

## TDD Gate Compliance

- **Task 2 (tdd=true):** RED commit `6c89327` — 4 behavior tests failing against the task-1 minimal route (intentional RED, `node --test` exit non-zero, fail counts > 0). GREEN commit `106e9da` — all 15 pass. REFACTOR: no commit (no post-GREEN change needed).
- Tasks 1 (tracer) and 3 are not behavior-adding under the RED gate; task 1 committed implementation+tracer together per tracer protocol.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] Catalogued the five new scope error codes in EN+FR**
- **Found during:** plan-level verification (full-suite wave gate)
- **Issue:** `test/error-codes.test.mjs` enforces a non-empty `err.<code>` entry in both locale catalogues for every code the server emits; `scopeNotAllowed`, `scopeRequired`, `projectsRequired`, `tooManyProjects`, `unknownProject` were missing (milestone invariant: EN+FR catalogue at write time).
- **Fix:** added the five keys to `src/locales/en.json` and `src/locales/fr.json`; bumped the i18n catalogue-size pin 1638 → 1643.
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Commit:** d31e395

**2. [Rule 1 - Test bug] Fixed wrong baseline in RED test preconditions**
- **Found during:** Task 2 GREEN run
- **Issue:** two validation tests asserted a stored-scope baseline that a preceding null-clear test had already wiped (test-order bug in the new tests, not the implementation).
- **Fix:** establish a known scope at the start of the whitelist test; aligned the caps test's baseline assertion.
- **Files modified:** test/scope.test.mjs (GREEN commit 106e9da)

**Total deviations:** 2 auto-fixed (1 Rule 2, 1 Rule 1). **Impact:** none on plan scope — the catalogue fix is required by an existing milestone gate; the test fix touches only the new suite.

## Verification Results

- `node --test test/scope.test.mjs` — 15/15 pass
- `node --test test/migration.test.mjs` — 31/31 pass (run twice: idempotent)
- `node --test --test-concurrency=2 test/*.test.mjs` — **697/697 pass, 0 fail, 0 skipped**

## Issues Encountered

None beyond the documented deviations.

## Next Phase Readiness

Ready for 29-02 (route sweep / D-03 grant inversion): the predicate (`projectScope`/`inScopeProject`) and the single funnel (`hiddenFor`) are the consumption points; the disjunctive composition leaves room for the scope-opens-private-projects truth table without touching call sites again.

## Self-Check: PASSED

- `test/scope.test.mjs` exists on disk ✓
- All 5 commits found in `git log` (85b276e, 6c89327, 106e9da, 01ed308, d31e395) ✓
- All plan-level `<verification>` commands re-run green (697/697) ✓
