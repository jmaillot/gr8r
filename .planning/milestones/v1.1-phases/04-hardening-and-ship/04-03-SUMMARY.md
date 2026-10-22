---
phase: 04-hardening-and-ship
plan: 03
subsystem: testing
tags: [playwright, chromium, e2e, tenancy, private-projects, github-actions, ci]

# Dependency graph
requires:
  - phase: 01-tenancy-foundation
    provides: /w/:slug routing, slug-scoped API, boot-time slug fallback
  - phase: 02-membership-lifecycle
    provides: invites/accept flows and role rules used by the fixtures
  - phase: 03-private-project-isolation
    provides: server-side redaction and the generic 404 for hidden projects
  - phase: 04-hardening-and-ship
    provides: plan 04-01 npm test entry point and isolated-server conventions
provides:
  - e2e/playwright.config.mjs — Chromium-only project, traces/screenshots on failure
  - e2e/server.mjs — temp DATA_DIR + server lifecycle for Playwright (127.0.0.1:4173)
  - e2e/helpers/setup.mjs — API-only fixtures, per-run ids and per-run client addresses
  - e2e/tenancy.spec.mjs — 4 browser tests (isolation, fallback, 404s, private project)
  - .github/workflows/ci.yml — required build job (npm test) + required Chromium e2e job
  - npm run e2e — local/CI entry point for the browser suite
affects: [04-04 release docs and Node 24 pin]

actuals:
  tokens: 5700
  tasks: 2
  commits: 2
  plan_head_before: 4aba446b294021a8869169b79f016dee44179818
  plan_head_after: e5817127754483bf5b9b2d93bd5a6a7862547401

tech-stack:
  added:
    - "@playwright/test 1.64.1 (devDependency; verified on npmjs.com as microsoft/playwright)"
  patterns:
    - "Fixtures through the API, assertions only through the browser with role/label/text selectors"
    - "The e2e server wrapper owns a mkdtemp DATA_DIR and removes it on SIGTERM"
    - "Per-run account suffixes and per-run X-Forwarded-For addresses keep per-IP throttles from accumulating"

key-files:
  created:
    - e2e/playwright.config.mjs
    - e2e/server.mjs
    - e2e/helpers/setup.mjs
    - e2e/tenancy.spec.mjs
  modified:
    - package.json
    - package-lock.json
    - .gitignore
    - eslint.config.js
    - .github/workflows/ci.yml

key-decisions:
  - "Playwright's webServer needs an explicit gracefulShutdown; without it the runner SIGKILLs the process group and the wrapper never removes its temp DATA_DIR"
  - "The suite prints a clear error instead of a confusing webServer timeout when dist/index.html is missing, because CI builds dist/ once and the suite never builds"
  - "Each fixture account presents a run-unique X-Forwarded-For address, so signup (5/hour/IP), invite-accept and login throttles never leak into a later local run"
  - "Carol signs up before the invite is issued, so the invite exercises the existing-account accept path (200) rather than account creation"
  - "The private-project test also signs in as the owner, so a passing 404 cannot come from a fixture that never created the project"

patterns-established:
  - "One browser context per account inside a test, closed in finally; no shared storage state"
  - "Negative assertions are paired with a positive anchor on the same page so an unrendered page cannot pass"

requirements-completed: [R3, R4, R5, R8]

coverage:
  - id: D1
    description: "Chromium runs against a server the suite starts itself, on a temp database, with no developer instance and no port 8080"
    requirement: R4
    verification:
      - kind: integration
        ref: "npm run e2e (4 tests; webServer boots e2e/server.mjs)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two workspaces owned by two accounts: each tenant opens its own project and cannot reach the other's project or workspace URL"
    requirement: R3
    verification:
      - kind: integration
        ref: "e2e/tenancy.spec.mjs#the owner signs in…, #tenant two sees Beta…"
        status: pass
    human_judgment: false
  - id: D3
    description: "A non-member of a private project sees no trace on home or the project list and reaches the generic 404 through the UI, while the owner still opens it"
    requirement: R5
    verification:
      - kind: integration
        ref: "e2e/tenancy.spec.mjs#a private project is invisible to a member…"
        status: pass
    human_judgment: false
  - id: D4
    description: "The suite leaves no server and no database behind, and repeated runs keep working"
    requirement: R4
    verification:
      - kind: integration
        ref: "two consecutive `npm run e2e` runs; /tmp/gr8r-e2e-* count is 0 after each"
        status: pass
    human_judgment: false
  - id: D5
    description: "CI runs lint, format, build and the Node suite, plus a separate Chromium job that installs with system deps and uploads traces only on failure"
    requirement: R8
    verification:
      - kind: automated
        ref: ".github/workflows/ci.yml parses; jobs = build, e2e; permissions contents:read"
        status: pass
    human_judgment: true
    note: "The workflow only runs for real on GitHub; the YAML shape and every command it calls were verified locally."

duration: 20min
completed: 2026-10-21
status: complete
---

# Phase 4 Plan 3: Playwright two-tenant UAT and CI wiring Summary

**A Chromium suite now boots its own throwaway server, creates two workspaces and three accounts through the API, and proves in the browser that neither tenant can see the other's document or project URL — plus that a private project leaves no trace for a plain member while its owner still opens it.**

## Performance

- **Duration:** ≈20 min
- **Started:** 2026-10-21T19:26Z
- **Completed:** 2026-10-21T19:47Z
- **Tasks:** 2
- **Files modified:** 9 (4 created, 5 modified)

## Accomplishments

- `e2e/server.mjs` is the only thing that boots a server for the browser suite: `mkdtemp` `DATA_DIR`,
  `127.0.0.1:4173`, `SEED_DATA=false`, `ALLOW_SIGNUP=true`, the bootstrap owner
  `e2e-owner@e2e.local` and workspace `Acme`. It refuses to start with a clear message when
  `dist/index.html` is missing, and removes the temp directory on `SIGTERM`/`SIGINT`, on its own
  exit and on child start failure.
- `e2e/helpers/setup.mjs` signs the owner in, signs tenant 2 up and creates `Beta <run>` for it,
  signs Carol up, invites her to `acme` as `member`, accepts the invite with her cookie, and adds
  `Acme Roadmap` (public), `Secret Roadmap` (private, owner only) and `Beta Roadmap` (public) with
  the current revision. Every id is per-run, and each account presents its own run-unique
  `X-Forwarded-For` address.
- `e2e/tenancy.spec.mjs` runs four tests in one worker, one fresh browser context per account:
  owner sees Acme and its public project; a foreign workspace slug rewrites to `/w/acme` and a
  foreign project key shows `Page not found`; tenant 2 sees Beta, falls back to Beta when asking
  for Acme and gets `Page not found` on Acme's project; Carol sees the public project but no trace
  of the private one on the home, the project list or the deep link, while the owner opens the
  same deep link and sees the heading.
- `.github/workflows/ci.yml` keeps its trigger model, adds `permissions: contents: read`, appends
  `npm test` to the build job, and adds a required `e2e` job (`timeout-minutes: 20`) that installs
  Chromium with system dependencies and uploads `test-results/` only on failure.
- Validated: `npm run build`, `npm run e2e` (4/4, twice in a row), `npm test` (40/40),
  `npm run lint`, `npm run format:check`, `npx prettier --check .github/workflows/ci.yml e2e`.
  No `/tmp/gr8r-e2e-*` directory survives a run.

## Task Commits

1. **Task 1: Playwright harness and two-tenant browser UAT** — `6be21a0` (feat)
2. **Task 2: Private-project visibility test and CI wiring** — `e581712` (test)

**Plan metadata:** this SUMMARY + STATE/ROADMAP (`docs(04-03)` commit).

## Files Created/Modified

- `e2e/server.mjs` — temp `DATA_DIR`, env, spawn, signal handling, cleanup.
- `e2e/playwright.config.mjs` — Chromium project, `test-results/` output, `retain-on-failure`
  traces, `webServer` with `gracefulShutdown`.
- `e2e/helpers/setup.mjs` — cookie client, `setupTenants()`, project builder, per-run ids/IPs.
- `e2e/tenancy.spec.mjs` — 4 browser tests, role/label/text selectors only.
- `package.json` / `package-lock.json` — `@playwright/test@^1.64.1`, `npm run e2e`.
- `.gitignore` — `test-results/`, `playwright-report/`, `blob-report/`.
- `eslint.config.js` — `e2e/**/*.mjs` joins the Node-globals group.
- `.github/workflows/ci.yml` — permissions, `npm test`, required Chromium e2e job.

## Decisions Made

- **`gracefulShutdown` is mandatory.** Playwright's default is no graceful shutdown: it SIGKILLs
  the process group, so the wrapper never ran its cleanup and left `gr8r-e2e-*` directories
  behind. Explicit `{ signal: 'SIGTERM', timeout: 5000 }` makes Playwright send SIGTERM to the
  group, which is exactly what the wrapper handles.
- **Throttle-proof fixtures.** The server throttles signup (5/hour/IP), invite accept (5/hour/IP)
  and login (10 per 15 min per IP+email). Both the API client and the browser contexts send a
  run-unique `X-Forwarded-For`, which the server already honours behind a proxy, so a second or
  third local run inside the same hour cannot inherit the previous run's budget.
- **Carol is created before the invite**, so the accept path is the "existing account" branch
  (`200`, session reused) instead of account creation — the same path a real invited colleague
  takes.
- **Negative assertions have positive anchors.** Every "no trace of Secret Roadmap" assertion is
  preceded by asserting the public project is visible on the same page, so a page that failed to
  render cannot satisfy the test. A mutation check (`isPrivate: false`) confirmed the assertion
  fails with two leaked occurrences when redaction is removed.
- **No build inside the suite.** CI builds `dist/` once; the wrapper fails fast with a readable
  message when the build is missing rather than letting Playwright time out.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `npm run lint` had no Node globals for `e2e/**/*.mjs`**
- **Found during:** Task 1, first lint run.
- **Issue:** the ESLint config only granted Node globals to `server.js`, `mailer.js`,
  `scripts/**/*.mjs` and `test/**/*.mjs`; every `e2e` file would have been reported with
  `no-undef` for `process` and `console`, failing the plan's own verification gates.
- **Fix:** added `e2e/**/*.mjs` to the existing Node-globals file group (same treatment as the
  phase-4 test tree).
- **Files modified:** `eslint.config.js`
- **Verification:** `npm run lint` is clean.
- **Committed in:** `6be21a0`

**2. [Rule 3 - Blocking] Playwright SIGKILLed the wrapper, so cleanup never ran**
- **Found during:** Task 1, first successful run — `/tmp/gr8r-e2e-*` directories were left behind
  even though the tests passed.
- **Issue:** `webServer` had no `gracefulShutdown`, so Playwright's launcher skips graceful close
  and kills the process group with SIGKILL. The wrapper's SIGTERM handler never ran, leaving the
  temporary database directory on disk and breaking the plan's "leaves no server or database
  behind" criterion.
- **Fix:** `gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 }` in the config, plus a
  SIGKILL fallback inside the wrapper if the child ignores SIGTERM.
- **Files modified:** `e2e/playwright.config.mjs`, `e2e/server.mjs`
- **Verification:** three consecutive runs end with zero `/tmp/gr8r-e2e-*` directories.
- **Committed in:** `6be21a0`

**3. [Rule 1 - Bug] `getByLabel('Password')` matched the show-password toggle**
- **Found during:** Task 1, first run (strict-mode violation: the input and the
  `aria-label="Show password"` button).
- **Fix:** `getByLabel('Password', { exact: true })`, which still is a label selector as D-07
  requires.
- **Files modified:** `e2e/tenancy.spec.mjs`
- **Verification:** all tests pass.
- **Committed in:** `6be21a0`

**4. [Rule 2 - Missing critical robustness] Per-IP throttles broke repeatability**
- **Found during:** Task 1, while reading `server.js` throttles against the plan's "repeatable
  locally" criterion.
- **Issue:** 2 signups per run against a 5/hour/IP limit makes the third local run fail with
  `429`, and the owner login would accumulate to 10 attempts per 15 minutes.
- **Fix:** each fixture account and each browser context presents a run-unique
  `X-Forwarded-For`; the server already honours that header (`clientIp`) and the suite runs
  behind no proxy, so no application behaviour changes and no throttle is disabled.
- **Files modified:** `e2e/helpers/setup.mjs`, `e2e/tenancy.spec.mjs`
- **Verification:** consecutive runs pass; `npm test` still 40/40.
- **Committed in:** `6be21a0`, `e581712`

---

**Total deviations:** 4 auto-fixed (3 Rule 3, 1 Rule 1, 1 Rule 2 — one wrapped into Task 2's commit)
**Impact on plan:** no product code changed. All four fixes are harness/config changes needed for
the plan's own verification gates and for the "no server left behind"/"repeatable" criteria.

## Threat Surface

- `T-04-06` / `T-04-SC` (mitigated): `@playwright/test@1.64.1` was resolved from the registry,
  its `repository.url` confirmed as `github.com/microsoft/playwright`, the range pinned `^1.64.1`
  and the regenerated `package-lock.json` committed. The browser comes only from
  `npx playwright install [--with-deps] chromium`, never from the repository.
- `T-04-07` (accepted): every fixture account is an `@e2e.local` address with a test-only
  password; the database lives in `mkdtemp` and is deleted on shutdown.
- `T-04-08` (mitigated): the owner-fixture powers exist only on the throwaway server the suite
  starts on `127.0.0.1:4173`; `reuseExistingServer` is false whenever `CI` is set.

No new threat flags. The CI job only receives `contents: read` and the artifact upload runs on
failure only, so a failing run cannot leak traces into a passed build.

## Known Stubs

None.

## Issues Encountered

- **`.nvmrc` still pins Node 22.** The e2e job reads `.nvmrc` as the plan requires, but `node:sqlite`
  needs Node 24 for `npm test`, so the GitHub workflow only goes green once plan 04-04 writes `24`
  into `.nvmrc` (D-04, already scoped there). Nothing in this plan depends on the value; local runs
  use Node 24.21.0 and `engines.node` already declares `>=24`.

## User Setup Required

None - no external service configuration required. Locally, Chromium is installed with
`npx playwright install chromium` (already present on this machine).

## Next Phase Readiness

- `npm run e2e` and `npm test` are both required by `.github/workflows/ci.yml`; the phase 4 gate
  has both suites wired, pending the Node 24 pin from 04-04.
- Plan 04-04 (release docs) can now describe the two CI jobs and the real test commands.
- No blockers or stubs.

## Self-Check: PASSED

`e2e/playwright.config.mjs`, `e2e/server.mjs`, `e2e/helpers/setup.mjs` and `e2e/tenancy.spec.mjs`
exist; `6be21a0` and `e581712` are in history; `npm run e2e` is 4/4 and `npm test` is 40/40 on the
final tree; no `/tmp/gr8r-e2e-*` directory remains.

---
*Phase: 04-hardening-and-ship*
*Completed: 2026-10-21*
