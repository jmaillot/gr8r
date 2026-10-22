---
phase: 04-hardening-and-ship
plan: 01
subsystem: testing
tags: [node:test, node:sqlite, server.js, http-api, tenancy, membership, private-projects, ci]

# Dependency graph
requires:
  - phase: 01-tenancy-foundation
    provides: slug-scoped workspace API, memberships table, requireWorkspace role guard
  - phase: 02-membership-lifecycle
    provides: members/leave/invites/plan/delete endpoints and role rules
  - phase: 03-private-project-isolation
    provides: redactDoc/mergeClientDoc contract and the 70-check privacy matrix
provides:
  - test/helpers/server.mjs — reusable isolated-server harness (free port, mkdtemp DATA_DIR, cookie client, login/signup, DB handle)
  - test/tenancy.test.mjs — phase 1 contract over HTTP (10 tests)
  - test/membership.test.mjs — phase 2 lifecycle over HTTP (13 tests)
  - test/privacy.test.mjs — phase 3 matrix under node:test (9 tests, 70 ported checks)
  - npm test — single entry point for the server suite
  - npm run test:privacy — working compatibility alias for the phase 3 release gate
affects: [04-02 migration test, 04-03 CI + Playwright, 04-04 release docs]

actuals:
  tokens: 18000
  tasks: 3
  commits: 6
plan_head_before: b63145f86274977b5e60e9821685783a5059938e
plan_head_after: cd80fd0596c660e678d07cc0c91ac8f415c51af5

tech-stack:
  added: []  # node:test, node:sqlite and fetch are built into Node 24; no new dependency
  patterns:
    - "One harness module spawns every server: tests never copy spawn/cookie code"
    - "Each test file owns one server, one mkdtemp DATA_DIR, and stops both in after()"
    - "Test assertions run against the real HTTP API; SQLite is never mocked"

key-files:
  created:
    - test/helpers/server.mjs
    - test/tenancy.test.mjs
    - test/membership.test.mjs
    - test/privacy.test.mjs
  modified:
    - package.json
    - eslint.config.js
    - .prettierignore
  deleted:
    - scripts/verify-private-projects.mjs

key-decisions:
  - "Harness owns its temp DATA_DIR and deletes it on stop; a caller-supplied dataDir survives so migration tests can reboot on the same database"
  - "Tests use only loopback ephemeral ports, SEED_DATA=false and an empty workspace, so documents are deterministic"
  - "The privacy matrix keeps its exact fixture ids and all 70 phase 3 checks, now as node:test assertions grouped per behaviour"
  - "GSD-managed planning artifacts are prettier-ignored instead of reformatted, so tooling-written STATE/ROADMAP files stop breaking format:check"

patterns-established:
  - "Suite shape: before() boots a server and seeds accounts; ordered test() blocks assert one behaviour group; after() stops the server"
  - "Write fixtures always structuredClone a served document and send the current revision"
  - "Negative assertions use served-payload leak scans (JSON.stringify().includes) for redacted ids and titles"

requirements-completed: [R1, R2, R4, R5, R7, R8]

coverage:
  - id: D1
    description: "A shared harness boots real isolated servers, and npm test runs the discovered suites"
    requirement: R8
    verification:
      - kind: integration
        ref: "npm test (32 tests across test/tenancy.test.mjs, test/membership.test.mjs, test/privacy.test.mjs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Phase 1 tenancy contract: slug-scoped documents, derived data.ws, cross-tenant 404s, viewer 403, member roster/plan protection, stale revisions"
    requirement: R1
    verification:
      - kind: integration
        ref: "node --test test/tenancy.test.mjs (10 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Phase 2 membership lifecycle: invites, accept flows, role guards, removal cleanup, leave/nextSlug, delete cascade, ALLOW_SIGNUP flag"
    requirement: R2
    verification:
      - kind: integration
        ref: "node --test test/membership.test.mjs (13 tests)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Phase 3 private-project matrix: read redaction, write merge, access-field protection and membership edge cases"
    requirement: R5
    verification:
      - kind: integration
        ref: "npm run test:privacy (9 tests, 70 ported checks)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Lint, format check and build stay green with the new test tree"
    requirement: R8
    verification:
      - kind: automated
        ref: "npm run lint && npm run format:check && npm run build"
        status: pass
    human_judgment: false
  - id: D6
    description: "Cross-tenant isolation and workspace-scoped invites still hold when signup and creation are closed (R7 flag policy)"
    requirement: R7
    verification:
      - kind: integration
        ref: "test/membership.test.mjs#ALLOW_SIGNUP=false closes signup and creation but invites still onboard"
        status: pass
    human_judgment: false

duration: 30min
completed: 2026-10-21
status: complete
---

# Phase 4 Plan 1: Test harness and server suites Summary

**The three shipped phases are now covered by 32 `node:test` cases that boot real `server.js` processes on ephemeral loopback ports, so `npm test` proves tenancy, membership and private-project isolation without mocks, port 8080 or a prebuilt `dist/`.**

## Performance

- **Duration:** ≈30 min (wall clock, including required reading)
- **Started:** 2026-10-21T19:00Z (approx.)
- **Completed:** 2026-10-21T19:20Z (approx.)
- **Tasks:** 3
- **Files modified:** 8 (4 created, 3 modified, 1 deleted)

## Accomplishments

- `test/helpers/server.mjs` is the only place that spawns a server: free port, `mkdtemp` `DATA_DIR`,
  captured stdout/stderr, a cookie client that keeps `gr8r_session`, `login`/`signup`, `withDb`
  and `inviteToken`. Every suite imports it instead of copying spawn or cookie code.
- `test/tenancy.test.mjs` (10 tests) pins the phase 1 contract: bootstrap owner and workspace list,
  real workspace creation, unrelated documents, `data.ws` derived from the row, the demo
  `data.workspaces` array dropped and `data.me` nulled on read, cross-tenant 404 on GET/PUT/PATCH,
  viewer 403, member `PATCH` 403 plus roster/plan/`data.ws`/`data.me` tamper protection, slug
  validation with a `409` suggestion, stale revision `409`, and `401` for signed-out callers.
- `test/membership.test.mjs` (13 tests) replays the phase 2 lifecycle over HTTP, including a second
  server booted with `ALLOW_SIGNUP=false` that proves signup and creation are closed while a
  workspace invite still onboards an account, and a plain member is still refused creation.
- `test/privacy.test.mjs` (9 tests) ports the phase 3 matrix with the same fixture ids and all 70
  checks; `npm run test:privacy` remains the release gate and the standalone script is gone.
- `npm test` runs `test/*.test.mjs` with `--test-concurrency=2`; every suite stops its server and
  leaves no `gr8r-test-*` directory behind.

## Task Commits

Each task was committed atomically:

1. **Task 1: Isolated server harness and tenancy end-to-end suite** - `ca4c052` (feat)
2. **Task 2: Membership lifecycle suite** - `943d87c` (test)
3. **Task 3: Port the 70-check privacy matrix and keep the alias** - `0a766cb` (test)

Supporting commits:

- `b11bf4d` (chore) — prettier-ignore for GSD-managed planning artifacts
- `cd80fd0` (test) — documents the invite-accept throttle budget in the membership suite

**Plan metadata:** this SUMMARY + STATE/ROADMAP (`docs(04-01)` commit, `3c0dd95`) — six plan
commits measured from `b63145f`.

## Files Created/Modified

- `test/helpers/server.mjs` — `ROOT`, `freePort`, `startServer`, `client`, `login`, `signup`,
  `withDb`, `inviteToken`; the single spawn/cookie implementation for every suite.
- `test/tenancy.test.mjs` — phase 1 contract (10 tests).
- `test/membership.test.mjs` — phase 2 lifecycle (13 tests), including the closed-signup server.
- `test/privacy.test.mjs` — phase 3 matrix (9 tests, 70 ported checks, 73 runtime assertions).
- `package.json` — adds `test`, repoints `test:privacy` at the new file.
- `eslint.config.js` — Node globals for `test/**/*.mjs` (added to the existing Node file group).
- `.prettierignore` — `.planning` and `.gsd` excluded (see deviations).
- `scripts/verify-private-projects.mjs` — deleted; its helpers and checks live in `test/`.

## Decisions Made

- **Harness owns its `DATA_DIR`** (`mkdtemp`) and removes it on `stop()`, but a caller-supplied
  `dataDir` is left intact — plan 04-02 needs to reboot on the same database to prove migration
  idempotency.
- **`SEED_DATA=false` everywhere** so documents start empty and assertions do not depend on the
  demo seed.
- **One server per file, ordered `test()` blocks** rather than nested suites: the server is
  stateful, and the plan's ordering (fixture → redaction → merge → removal) is the behaviour
  chain being proven.
- **Leak scans kept as `JSON.stringify(...).includes(id)`** for the privacy matrix: cheap,
  byte-level proof that a redacted id or title never ships.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run format:check` failed before any code change**
- **Found during:** Task 1 verification.
- **Issue:** Prettier reported 9 committed `.planning/**` markdown files plus the untracked `.gsd/`
  runtime directory. `.planning` files were already unformatted at `HEAD`, so the plan's stated
  gate could not pass for any phase-4 plan — and CI runs `format:check` on every push.
- **Fix:** `.planning` and `.gsd` are now prettier-ignored (GSD writes those files with its own
  formatting; reformatting them would churn artifacts that other plans are about to read).
  No source file is affected: `prettier --check .` is green.
- **Files modified:** `.prettierignore`
- **Verification:** `npm run format:check` → "All matched files use Prettier code style!"
- **Committed in:** `b11bf4d`

**2. [Rule 2 - Missing critical documentation] Invite-accept throttle budget**
- **Found during:** Task 2.
- **Issue:** `server.js` allows five invite accepts per IP per hour; the membership suite spends
  exactly five attempts, so a future sixth accept would fail with `429` for a non-obvious reason.
- **Fix:** documented the budget in the suite header so the constraint is visible where it bites.
- **Files modified:** `test/membership.test.mjs`
- **Verification:** `npm test` re-run green.
- **Committed in:** `cd80fd0`

---

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 Rule 2)
**Impact on plan:** No scope creep in product code. The `.prettierignore` change is required for
this plan's own verification gate and for CI; the throttle note is a comment only.

## Coverage Notes

- The phase 2 "demote or remove the last owner" branch cannot be reached over HTTP: the actor must
  be an owner (to manage another owner), which makes `ownerCount(exclude target) >= 1`, an admin is
  refused earlier with `403`, and self-targeting is a `409` pointing at leave. The reachable guard —
  `POST /leave` as the last owner → `409` — is covered. The unreachable branches stay as
  defence-in-depth in `server.js`.
- The privacy port runs 73 runtime assertions: the 70 phase 3 checks plus sign-in/signup/setup
  assertions, and the leak scan expands to ten runtime assertions over the same id list.

## Issues Encountered

None — the suites passed on their first full run after formatting.

## Threat Surface

- `test/helpers/server.mjs` spawns with an argument array and no shell (`T-04-01` mitigated);
  every env value is a test constant or an explicit per-call override.
- The harness always supplies its own `mkdtemp` directory unless a test passes one explicitly
  (`T-04-02` mitigated): no test reads the repository `data/`, and none binds 8080.
- `--test-concurrency=2` bounds simultaneous servers, each on an ephemeral port with its own
  database (`T-04-03` accepted as planned).
- No package was installed or upgraded (`T-04-SC`): `package.json` only gained scripts.

No new threat flags.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `npm test` and `npm run test:privacy` are the entry points plan 04-02 (migration test) and
  04-03 (CI + Playwright) build on; the harness already supports rebooting on a supplied
  `dataDir`, which the migration test needs.
- `npm run lint`, `npm run format:check` and `npm run build` are green, so CI stays green once
  04-03 wires the test step in.
- No blockers or stubs.

## Self-Check: PASSED

All four test files and this summary exist on disk; all five plan commits are in history
(`b11bf4d`, `ca4c052`, `943d87c`, `0a766cb`, `cd80fd0`); `scripts/verify-private-projects.mjs`
is deleted.

---
*Phase: 04-hardening-and-ship*
*Completed: 2026-10-21*

