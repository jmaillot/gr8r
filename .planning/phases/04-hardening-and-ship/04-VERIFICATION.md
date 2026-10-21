---
phase: 04-hardening-and-ship
verified: 2026-10-21T20:08:46Z
status: human_needed
score: 16/17 must-haves verified
covered_files:
  - .env.example
  - .github/workflows/ci.yml
  - .gitignore
  - .nvmrc
  - .planning/ROADMAP.md
  - .planning/STATE.md
  - .planning/phases/04-hardening-and-ship/04-01-PLAN.md
  - .planning/phases/04-hardening-and-ship/04-01-SUMMARY.md
  - .planning/phases/04-hardening-and-ship/04-02-PLAN.md
  - .planning/phases/04-hardening-and-ship/04-02-SUMMARY.md
  - .planning/phases/04-hardening-and-ship/04-03-PLAN.md
  - .planning/phases/04-hardening-and-ship/04-03-SUMMARY.md
  - .planning/phases/04-hardening-and-ship/04-04-PLAN.md
  - .planning/phases/04-hardening-and-ship/04-04-SUMMARY.md
  - .planning/phases/04-hardening-and-ship/04-CONTEXT.md
  - .planning/phases/04-hardening-and-ship/04-DISCUSSION-LOG.md
  - .planning/phases/04-hardening-and-ship/04-REVIEW-DISPOSITION.md
  - .planning/phases/04-hardening-and-ship/04-REVIEW-FIX.md
  - .planning/phases/04-hardening-and-ship/04-REVIEW.md
  - .prettierignore
  - CHANGELOG.md
  - DEPLOY.md
  - README.md
  - docker-compose.yml
  - e2e/helpers/setup.mjs
  - e2e/playwright.config.mjs
  - e2e/server.mjs
  - e2e/tenancy.spec.mjs
  - eslint.config.js
  - package-lock.json
  - package.json
  - server.js
  - src/actions/actions.js
  - src/core/store.js
  - src/data/seed.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - src/pages/search.js
  - test/demo-workspace.test.mjs
  - test/harness.test.mjs
  - test/helpers/legacy-fixture.mjs
  - test/helpers/server.mjs
  - test/membership.test.mjs
  - test/migration.test.mjs
  - test/privacy.test.mjs
  - test/tenancy.test.mjs
covered_digest: "v2:sha256:292c986cce34e5a7bcec7e303646cfe61155bfe3415cde6a885430a24e95a23d"
behavior_unverified: 1
overrides_applied: 0
behavior_unverified_items:
  - truth: "CI runs the Node suite and the browser suite, installs Chromium with system dependencies, and uploads traces/screenshots only on failure."
    test: "Push the branch / open the pull request and confirm both the `build` and `e2e` jobs in GitHub Actions go green."
    expected: "`build` runs lint, format check, build and npm test on Node 24 from .nvmrc; `e2e` builds, installs Chromium with --with-deps, runs npm run e2e, and uploads test-results/ only when the job fails."
    why_human: "GitHub Actions execution is an external service. The workflow file and every command it invokes were verified and run locally, but no CI run log exists in the repository, so the actual execution cannot be proven from the codebase."
human_verification:
  - test: "Push the branch / open the pull request and watch the first CI run."
    expected: "Both the `build` and `e2e` jobs pass on Node 24; the e2e job installs Chromium with system dependencies and uploads Playwright artifacts only on failure."
    why_human: "GitHub Actions is an external service; the repository contains the workflow definition but no evidence of an actual run."
---

# Phase 04: Hardening and ship Verification Report

**Phase Goal:** mergeable, documented, tested, deployable — a `node:test` suite, CI wiring, a migration proof on a legacy database copy, a Playwright two-tenant UAT, docs (README, DEPLOY, .env.example), removal of the demo workspace switch, and 1.1.0 release notes.
**Verified:** 2026-10-21T20:08:46Z
**Status:** human_needed
**Re-verification:** No — initial verification (no previous VERIFICATION.md exists)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm test` boots real `server.js` processes on ephemeral loopback ports with temporary `DATA_DIR`s and exits 0 without a prebuilt `dist` or a running developer server. | ✓ VERIFIED | `test/helpers/server.mjs:43-89` spawns `process.execPath server.js` with `freePort()`/`mkdtemp`, `DB_PATH` pinned inside the temp dir, and polls `/api/config`. `npm test` → 44/44 pass. `STATIC_DIR=/tmp/opencode/empty-dist node --test test/tenancy.test.mjs` → 10/10 pass with no build. No `gr8r-*` temp dirs left behind. |
| 2 | Two accounts in two workspaces never receive each other's document; cross-workspace reads and writes answer 404. | ✓ VERIFIED | `test/tenancy.test.mjs:52-84,111-125`: independent documents, cross-tenant GET/PUT/PATCH all 404. |
| 3 | Role rules over HTTP: viewer writes 403, member workspace edits 403, membership removal/leave/owner guards behave as shipped. | ✓ VERIFIED | `test/tenancy.test.mjs:127-181` (viewer 403, member PATCH 403, stale 409); `test/membership.test.mjs` (13 tests: admin/owner guards, last-owner 409, removal cleanup, leave `nextSlug`, delete cascade). |
| 4 | The phase 3 privacy matrix still proves read redaction, write merge and access-field protection with its full check count, via `npm run test:privacy`. | ✓ VERIFIED | `npm run test:privacy` → 10/10 pass; 70 `assert.*` call sites in `test/privacy.test.mjs` over the original fixture ids (`p_pub`, `p_sec`, `p_cust`, `p_ownerblind`, `p_promo`, `p_legacy`), including read leak scans, write merge/injection, access-field tampering and lead promotion. |
| 5 | Account creation stays flag-driven: `ALLOW_SIGNUP=false` closes signup and workspace creation while workspace-scoped invites still onboard existing accounts. | ✓ VERIFIED | `test/membership.test.mjs:100-126` boots a second server with `ALLOW_SIGNUP=false`, asserts `signup:false`, `workspaceCreation:'admins'`, 403 on signup/creation and a successful workspace invite accept. |
| 6 | A pre-tenancy database migrates on first boot: timestamped backup before rewrite, derived slug/name/colour, linked memberships, scoped invites, demo array removed, `data.me` retired. | ✓ VERIFIED | `test/migration.test.mjs:52-145` against `test/helpers/legacy-fixture.mjs` (legacy tables without `slug`/`color`/`member_id`/`workspace_id`); all 8 migration tests pass. |
| 7 | The backup is a genuine pre-rewrite snapshot: tenancy columns present but empty, original document with demo array and `data.me` intact. | ✓ VERIFIED | `test/migration.test.mjs:62-81` opens the `gr8r-premultitenant-*.db` backup and asserts null `slug`/`color`, zero non-null `member_id`/`workspace_id`, `doc.data.workspaces` = `w1,w2`, `data.me = m_alice`. |
| 8 | A second boot against the same migrated database changes nothing: no second backup, no slug/doc/member_id/revision drift. | ✓ VERIFIED | `test/migration.test.mjs:164-183` snapshots backup list, workspace row (including raw doc, revision, updated_at), membership ids and invite scope across a real reboot; deep-equal passes. |
| 9 | The migrated owner can still sign in and read the workspace; preserved project/task rows are intact. | ✓ VERIFIED | `test/migration.test.mjs:125-145`: Alice logs in with the legacy scrypt password, `/api/auth/me` lists `legacy-studio` as owner, `p_keep`/`t_keep` resolve through the client key path. |
| 10 | A Chromium Playwright suite runs against a fresh built app and a temporary database, with no developer server, port 8080 or local browser cache. | ✓ VERIFIED | `npm run e2e` → 4/4 pass in 8.6 s; `e2e/server.mjs:14-38` uses `mkdtemp`, `DB_PATH` inside it, port 4317; `e2e/playwright.config.mjs` starts it via `webServer` with `reuseExistingServer` off; zero `/tmp/gr8r-e2e-*` left. |
| 11 | Two genuinely separate workspaces and two accounts prove each tenant sees only its own document and deep links cannot reach the other tenant's project. | ✓ VERIFIED | `e2e/tenancy.spec.mjs:32-76`: owner on Acme, tenant2 on Beta created through the API; foreign slug rewrites to the caller's workspace and foreign project key renders `Page not found` in both directions. |
| 12 | A signed-in workspace member who is not on a private project sees no trace of it and reaches the generic 404 through the UI. | ✓ VERIFIED | `e2e/tenancy.spec.mjs:78-110`: Carol sees the public project and no `Secret Roadmap` on home or project list, gets `Page not found` on the deep link, while the owner opens the same link and sees the heading. |
| 13 | CI runs the Node suite and the browser suite, installs Chromium with system dependencies, and uploads traces/screenshots only on failure. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `.github/workflows/ci.yml:8-44` defines `permissions: contents: read`, a `build` job (npm ci, lint, format check, build, npm test) and a 20-minute `e2e` job (`npm run build`, `npx playwright install --with-deps chromium`, `npm run e2e`, `upload-artifact` with `if: failure()`). Every command was run locally and passes, but no GitHub Actions run log exists in the repo — execution is external. |
| 14 | Demo mode has exactly one workspace: no demo array, no local switch handler, no create entry, no switch command in the palette, and onboarding never appends a second workspace. | ✓ VERIFIED | `src/data/seed.js` no longer returns `workspaces`; `src/core/store.js:258-264` builds one entry from `D().ws`; `src/actions/actions.js:1977-1996` demo no-ops and info toast, `2750-2756` renames `D().ws`; `popovers.js:240-252` demo static header only; `palette.js:58,66-67` drops `c-ws` and returns no ws group without an API. `test/demo-workspace.test.mjs` (2 tests) guards the seed and one-entry list. |
| 15 | Server mode keeps its real workspace switcher, workspace creation and settings unchanged. | ✓ VERIFIED | `src/core/store.js:259-261` still maps `api.workspaces`; `popovers.js:243-249` renders the real list + create entry when `api.enabled`; `palette.js` keeps the switch command in server mode; `actions.js` retains the `api.enabled` branches for switch/create/rename/onboarding. |
| 16 | README, DEPLOY, `.env.example` and CHANGELOG describe the shipped 1.1.0 behaviour, the complete environment surface including `TRUST_PROXY` and `MAX_BODY_BYTES`, the test commands and the CI jobs. | ✓ VERIFIED | `README.md:13,80-98,126` (Node 24, `npm test`/`test:privacy`/`e2e`, both CI jobs, one local demo workspace, no fake switcher); `DEPLOY.md:155-168,326-368,640-655,670-678`; `.env.example:81-85`; `CHANGELOG.md:9-72` with Added/Changed/Security/Upgrade/Known limits. |
| 17 | Node 24 is the declared runtime everywhere: `.nvmrc`, `engines`, README and Docker agree; `package.json` and `package-lock.json` both say 1.1.0. | ✓ VERIFIED | `.nvmrc` = `24`; `package.json` version 1.1.0, `engines.node >=24`; lockfile root version 1.1.0 and engine `>=24`; `Dockerfile` builds/runs on `node:24-alpine`; `README.md:13`. |

**Score:** 16/17 truths verified (1 present, behavior-unverified — see Human Verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/helpers/server.mjs` | Shared spawn/cookie/DB harness | ✓ VERIFIED | 156 lines; free port, mkdtemp, cookie client, login/signup, `withDb`, `inviteToken`; only spawn site for Node suites. |
| `test/tenancy.test.mjs` | Phase 1 contract (10 tests) | ✓ VERIFIED | 10/10, cross-tenant 404, role 403, stale 409, 401. |
| `test/membership.test.mjs` | Phase 2 lifecycle (13 tests) | ✓ VERIFIED | 13/13 incl. closed-signup server. |
| `test/privacy.test.mjs` | Ported 70-check privacy matrix | ✓ VERIFIED | 10 tests, 70 `assert.*` sites, CR-01 recent-search coverage included. |
| `test/harness.test.mjs` | Ambient `DB_PATH` isolation guard | ✓ VERIFIED | 1 test; harness pins `DB_PATH` inside its temp dir (WR-03). |
| `test/helpers/legacy-fixture.mjs` | Exact pre-tenancy schema + rows | ✓ VERIFIED | Creates `users/sessions/workspaces/memberships/invites` without tenancy columns; scrypt hash helper. |
| `test/migration.test.mjs` | Backup-first, correctness, idempotency (8 tests) | ✓ VERIFIED | 8/8 pass. |
| `test/demo-workspace.test.mjs` | Single-workspace regression guard | ✓ VERIFIED | 2/2; asserts no seed array and one derived entry. |
| `e2e/playwright.config.mjs` | Chromium project, traces on failure, webServer | ✓ VERIFIED | 1 Chromium project, `test-results`, `trace: retain-on-failure`, graceful shutdown. |
| `e2e/server.mjs` | Temp DATA_DIR + server lifecycle | ✓ VERIFIED | mkdtemp, port 4317, SIGTERM cleanup, dist precheck. |
| `e2e/helpers/setup.mjs` | API-only fixtures, per-run ids | ✓ VERIFIED | Owner/Acme, tenant2/Beta, Carol invite/accept, public/private/public projects. |
| `e2e/tenancy.spec.mjs` | Two-tenant + private-project UAT | ✓ VERIFIED | 4 browser tests, role/label/text selectors only. |
| `.github/workflows/ci.yml` | Build + Chromium e2e jobs | ✓ VERIFIED (definition) | See truth 13 — execution needs one human CI run. |
| `CHANGELOG.md` | Keep a Changelog 1.1.0 | ✓ VERIFIED | `## [1.1.0] - 2026-10-21` with Added/Changed/Security/Upgrade/Known limits. |
| `README.md`, `DEPLOY.md`, `.env.example` | Release docs and env surface | ✓ VERIFIED | Node 24, test commands, CI jobs, `TRUST_PROXY`/`MAX_BODY_BYTES`, upgrade/rollback. |
| `package.json`, `package-lock.json`, `.nvmrc` | 1.1.0 + Node 24 | ✓ VERIFIED | All three agree. |
| `server.js` | CR-01 recent-search redaction + invite backfill | ✓ VERIFIED | `redactDoc`/`mergeRecentSearches` drop/preserve hidden-project terms; `backfillInvites()` called by `migrateTenancy()`. |
| `scripts/verify-private-projects.mjs` | Deleted; logic ported | ✓ VERIFIED | Absent, no references anywhere outside planning history. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test/*.test.mjs` | `test/helpers/server.mjs` | import of `startServer`/`client`/`login`/`withDb` | WIRED | Every suite imports the shared harness; no duplicated spawn code. |
| `test/helpers/server.mjs` | `server.js` | `spawn(process.execPath, ['server.js'])` | WIRED | Real processes, ephemeral ports, temp `DATA_DIR`, captured output. |
| `test/migration.test.mjs` | `test/helpers/legacy-fixture.mjs` | `createLegacyDb(dataDir)` then `startServer({ dataDir })` | WIRED | Same directory rebooted; caller-owned dir survives `stop()`. |
| `e2e/playwright.config.mjs` | `e2e/server.mjs` | `webServer.command` + `/api/health`, graceful SIGTERM | WIRED | Fresh server and DB per run. |
| `e2e/tenancy.spec.mjs` | `e2e/helpers/setup.mjs` | `setupTenants(BASE_URL)` in `beforeAll` | WIRED | API fixtures, browser-only assertions. |
| `src/core/store.js` `workspaceList()` | `D().ws` (demo) / `api.workspaces` (server) | branch on `api.enabled` | WIRED | Exactly one demo entry; server list unchanged. |
| `.github/workflows/ci.yml` | npm scripts | `npm test`, `npm run e2e`, `npx playwright install` | WIRED | Commands exist in `package.json` and pass locally. |
| `server.js` `migrateTenancy()` | `backfillInvites()` | direct call before `backfillMemberships()` | WIRED | Legacy invites now scoped; asserted by the migration test. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/core/store.js` demo `workspaceList()` | workspace entry | `D().ws` hydrated from localStorage / seed | Yes — name/slug/colour come from the live document | ✓ FLOWING |
| `src/core/store.js` server `workspaceList()` | workspace array | `api.workspaces` fetched at boot | Yes — real memberships | ✓ FLOWING |
| `server.js` `redactDoc` | `recentSearches` | stored document filtered by hidden project names/keys | Yes — hidden terms removed, survives write merge | ✓ FLOWING |
| `e2e/tenancy.spec.mjs` UI assertions | rendered projects/members | API fixtures written to the throwaway DB, served by the real server | Yes — positive anchor + 404/absence checks | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Node server suite | `npm test` | 44 tests, 44 pass, 0 fail (Node v24.21.0) | ✓ PASS |
| Phase 3 privacy gate alias | `npm run test:privacy` | 10 tests, 10 pass | ✓ PASS |
| Node suite without a built `dist` | `STATIC_DIR=/tmp/opencode/empty-dist node --test test/tenancy.test.mjs` | 10/10 pass | ✓ PASS |
| Browser two-tenant + private-project UAT | `npm run e2e` | 4/4 pass in 8.6 s; zero temp dirs left | ✓ PASS |
| Production build | `npm run build` | Vite build OK, 57 modules | ✓ PASS |
| Lint | `npm run lint` | clean exit | ✓ PASS |
| Format gate | `npm run format:check` | “All matched files use Prettier code style!” | ✓ PASS |

### Probe Execution

No probe scripts were declared by this phase and none exist under `scripts/*/tests/probe-*.sh`; the migration proof is exercised by `test/migration.test.mjs` above. **SKIPPED (no probes).**

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| R1 | 04-01 | Workspace row with unique slug and its own document | ✓ SATISFIED | `test/tenancy.test.mjs:39-109`; slug uniqueness 409. |
| R2 | 04-01 | Account can hold several memberships with a role per workspace | ✓ SATISFIED | `test/membership.test.mjs` lifecycle matrix; `/api/auth/me` lists roles. |
| R3 | 04-03 | `/w/:slug` addresses a workspace; share/invite links workspace-scoped | ✓ SATISFIED | `e2e/tenancy.spec.mjs` URL/fallback tests; invite accept tests in membership suite. |
| R4 | 04-01, 04-03 | Every API call authorised against the caller's membership | ✓ SATISFIED | Cross-tenant 404 / role 403 in tenancy + membership; browser isolation in e2e. |
| R5 | 04-01, 04-03 | Private projects never sent to non-members and cannot be modified by them | ✓ SATISFIED | 70-assertion privacy matrix (read redaction, write merge, saved-view scrubbing, recent searches) + e2e private-project test. |
| R6 | 04-02 | Existing installs migrate in place, without data loss, with a pre-migration backup | ✓ SATISFIED | `test/migration.test.mjs` first-boot backup, preserved rows, idempotent second boot. |
| R7 | 04-01, 04-04 | Creation flag-driven, workspace-scoped invites, existing account can accept | ✓ SATISFIED | `ALLOW_SIGNUP=false` test; existing-account accept (409 needsSignIn then success); demo cleanup. |
| R8 | 04-01, 04-02, 04-03, 04-04 | Lint, format, build and server tests pass in CI | ✓ SATISFIED locally | `npm run lint`, `format:check`, `build`, `npm test`, `npm run e2e` all pass; CI definition wires them (see truth 13). |

No orphaned requirements: all eight roadmap requirement IDs are claimed by at least one plan and verified above.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No `TODO`/`FIXME`/`TBD`/`XXX`/placeholder markers in any phase-modified source, test, e2e, docs or CI file | — | None |
| `server.js` | 365-399 | Recent-search redaction is substring-based, not per-user storage | ℹ️ Info | Disclosed as a known limit in `CHANGELOG.md:68-72` and `DEPLOY.md:376-380`; regression-tested. Review CR-01 fix is present and covered. |

### Review-Fix Status (pre-verification gate)

`04-REVIEW.md` raised 12 findings; `04-REVIEW-DISPOSITION.md` records all 12 fixed. Spot-checked the release-critical ones:

- **CR-01** — `redactDoc` drops recent-search terms naming hidden projects and `mergeRecentSearches` preserves stored history on write (`server.js:365-399,422,521-528`); covered by `test/privacy.test.mjs:190,244,253,270-284`. Limitation documented in CHANGELOG/DEPLOY (not a gap).
- **WR-01** — `scrubProjectFilters` applied on read and write (`server.js:338-347,419-420,518-520,542-544`), tested in `privacy.test.mjs:249,254-267`.
- **WR-03** — harness and e2e wrapper pin `DB_PATH` inside their temp dirs (`test/helpers/server.mjs:52`, `e2e/server.mjs:27`), guarded by `test/harness.test.mjs`.
- **WR-05** — e2e moved off Vite preview port 4173 to 4317, reuse opt-in only (`e2e/playwright.config.mjs`, `e2e/server.mjs`, `e2e/helpers/setup.mjs`).
- **WR-06/WR-08** — Compose forwards `WORKSPACE_SLUG`, `MAX_BODY_BYTES`, `TRUST_PROXY` and uses `gr8r-studio:1.1.0`, matching DEPLOY's rollback procedure.
- **WR-09** — `normalizeDoc` defaults `savedViews`/`recentSearches` (`server.js:262-266`), with client fallbacks.
- **IN-02** — palette suggestions derive from the current document (`src/overlays/palette.js:124-135`).

### Human Verification Required

#### 1. First real CI run

**Test:** Push the branch / open the pull request on GitHub.
**Expected:** The `build` job (npm ci → lint → format check → build → npm test) and the `e2e` job (npm ci → build → `npx playwright install --with-deps chromium` → `npm run e2e`) both pass on Node 24 from `.nvmrc`; Playwright artifacts upload only if the e2e job fails.
**Why human:** GitHub Actions is an external service. The workflow definition and every command it calls were verified locally, but the repository contains no CI run log, so actual execution cannot be proven from the codebase.

### Gaps Summary

No gaps. Every deliverable named in the phase goal exists and works: the `node:test` harness and four server suites (44/44), the legacy-database migration proof with backup and idempotency (8/8), the Chromium two-tenant and private-project UAT (4/4), CI wiring for both suites, release docs (README, DEPLOY, `.env.example`, CHANGELOG), removal of the demo workspace switch, and a consistent 1.1.0 / Node 24 release. The only open item is human confirmation that the CI workflow executes successfully on GitHub — a `human_needed` item, not a code gap. The CR-01 privacy fix is present and regression-tested; its substring-based interim nature is disclosed in CHANGELOG and DEPLOY as a known limit.

---

_Verified: 2026-10-21T20:08:46Z_
_Verifier: the agent (gsd-verifier)_
