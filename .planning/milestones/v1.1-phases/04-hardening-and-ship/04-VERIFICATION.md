---
phase: 04-hardening-and-ship
verified: 2026-10-22T10:20:00Z
status: passed
score: 20/20 must-haves verified
covered_files:
  - .env.example
  - .github/workflows/ci.yml
  - .gitignore
  - .nvmrc
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
  - .planning/phases/04-hardening-and-ship/04-UAT.md
  - .prettierignore
  - CHANGELOG.md
  - DEPLOY.md
  - Dockerfile
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
  - src/core/api.js
  - src/core/store.js
  - src/data/seed.js
  - src/overlays/palette.js
  - src/overlays/popovers.js
  - src/pages/search.js
  - test/demo-workspace.test.mjs
  - test/harness.test.mjs
  - test/helpers/legacy-fixture.mjs
  - test/helpers/server.mjs
  - test/invite-revision.test.mjs
  - test/membership.test.mjs
  - test/migration.test.mjs
  - test/privacy.test.mjs
  - test/revision.test.mjs
  - test/tenancy.test.mjs
covered_digest: "v2:sha256:fe03bf4d694968a6c5c5de607d07bdd0e80348da03f78f7690b274ac177afb60"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 19/19
  previous_verified: 2026-10-22T10:29:00Z
  reason: "The tree changed after the previous report was written: the restart fix (7b4f20f) and its second regression test. The previous digest was stale, and the previous report's single human-verification item — the CI run covering HEAD — was still open. Every truth was re-derived from the current code, every gate was re-run locally, and the CI run was observed directly."
  gaps_closed:
    - "Human verification item 1 — the CI run covering HEAD. Observed directly: GitHub Actions run 39746021129 (push to main, head SHA 7b4f20f) concluded 'success'; the build job succeeded in 17s (npm ci, lint, format:check, build, npm test) and the e2e job succeeded in 48s (npm ci, build, playwright install --with-deps chromium, npm run e2e); the upload-artifact step was skipped because the run was green."
    - "Warning W-01 — the boot-time backfill moved the workspace revision on restart, so a tab open across a restart lost its next write. Closed by 7b4f20f: backfillMemberships() now writes `update workspaces set doc = ?, updated_at = ?` with no revision bump (server.js:905-908). The repair still persists (the legacy profile links and the demo switcher are still written); only the revision is left alone. Proven by the new test 'a restart does not move the revision' and by an independent probe over three consecutive restarts."
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "CHANGELOG.md and DEPLOY.md do not name the third fix (a restart no longer moves the workspace revision); the 1.1.1 notes still list only the role/plan fix and the invite-accept fix."
    category: other
    reason: "No shipped statement became false: the 1.1.1 notes say 'a join no longer disturbs anybody's pending edit', which is now strictly true, and DEPLOY.md's 'restart as usual' upgrade step is safe because of the fix. The omission is a completeness gap in the release notes, not an inaccuracy, so it does not fail the phase's documentation must-have. Adding a third bullet under CHANGELOG.md '## [1.1.1]' and one clause to DEPLOY.md:328-333 would close it."
    evidence_status: "none provided"
  - finding: ".planning/v1.1-MILESTONE-AUDIT.md still records phase 04 as 'passed — 17/17 must-haves' and lists W-01 as the invite-accept defect only."
    category: other
    reason: "Planning-root document, inert for the implementation. It is stale on the score (now 20/20) and does not mention the restart variant that was found and closed after the audit was written. This verification is the report the audit consumes, so the audit should be refreshed to match."
    evidence_status: "none provided"
---

# Phase 04: Hardening and ship Verification Report (final re-verification)

**Phase Goal:** mergeable, documented, tested, deployable — a `node:test` suite, CI wiring, a migration
proof on a legacy database copy, a Playwright two-tenant UAT, docs (README, DEPLOY, `.env.example`),
removal of the demo workspace switch, and release notes.
**Verified:** 2026-10-22T10:20:00Z
**Status:** passed
**Verified tree:** `HEAD = 7b4f20f` ("fix(04): stop a restart from moving the workspace revision"),
pushed to `origin/main`. The working tree is clean for every source file — only `.planning/` planning
documents are modified or untracked.
**Re-verification:** Yes — after the restart fix (`7b4f20f`) landed after the previous report
(`2026-10-22T10:29:00Z`, `human_needed`, 19/19). The previous digest was stale and its single
human-verification item (the CI run covering HEAD) was still open. This report re-derives every
truth from the current code, re-runs every gate locally, and observes the CI run directly.

## What changed since the previous report

| Change | Commit | Verification impact |
|--------|--------|---------------------|
| `server.js`: `backfillMemberships()` writes the repaired document with `update workspaces set doc = ?, updated_at = ?` — the `revision = revision + 1` is gone (`server.js:905-908`) | `7b4f20f` | New truth 20; Warning W-01 closed. The backfill still repairs the legacy profile links and drops the demo switcher from the stored document; only the revision is left alone, because a restart is not an edit. |
| `test/invite-revision.test.mjs`: a second test, "a restart does not move the revision" — reboots the real server on the same `DATA_DIR` and asserts the revision did not move, that a write crossing the restart is accepted (200) and that the roster is still complete | `7b4f20f` | Truth 20, server half |

Only 2 files differ from the previously verified tree: `server.js` and `test/invite-revision.test.mjs`.
The other 19 truths were re-checked as a regression pass (existence + behaviour), because `server.js`
is shared by every suite.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `npm test` boots real `server.js` processes on ephemeral loopback ports with temporary `DATA_DIR`s and exits 0 without a prebuilt `dist` or a running developer server. | ✓ VERIFIED | `test/helpers/server.mjs:43-89` spawns `process.execPath server.js` with `freePort()`/`mkdtemp`, pins `DB_PATH` inside the temp dir (`:52`), polls `/api/config`; `test/harness.test.mjs` guards the pin. Re-run at `7b4f20f`: `npm test` → **50/50 pass** (49 before the restart test). `STATIC_DIR=/tmp/opencode/empty-dist node --test test/tenancy.test.mjs` → 10/10 with no build. No new `/tmp/gr8r-*` directory left by the run. |
| 2 | Two accounts in two workspaces never receive each other's document; cross-workspace reads and writes answer 404. | ✓ VERIFIED | `test/tenancy.test.mjs:52-84,111-125` — independent documents, cross-tenant GET/PUT/PATCH all 404 (suite green, 10/10). |
| 3 | Role rules over HTTP: viewer writes 403, member workspace edits 403, membership removal/leave/owner guards behave as shipped. | ✓ VERIFIED | `test/tenancy.test.mjs:127-181` (viewer 403, member PATCH 403, stale 409); `test/membership.test.mjs` — 14/14 (admin/owner guards, last-owner 409, removal cleanup, leave `nextSlug`, delete cascade). |
| 4 | The phase 3 privacy matrix still proves read redaction, write merge and access-field protection with its full check count, via `npm run test:privacy`. | ✓ VERIFIED | `npm run test:privacy` → **10/10 pass**; `test/privacy.test.mjs` holds **70** `assert.*` call sites over the original fixture ids (`p_pub`, `p_sec`, `p_cust`, `p_ownerblind`, `p_promo`, `p_legacy`). The `syncProfiles`/`docFromClient` change touches the same merge path — the matrix is unchanged and green. |
| 5 | Account creation stays flag-driven: `ALLOW_SIGNUP=false` closes signup and workspace creation while workspace-scoped invites still onboard existing accounts. | ✓ VERIFIED | `test/membership.test.mjs` — "ALLOW_SIGNUP=false closes signup and creation but invites still onboard" green: `signup:false`, `workspaceCreation:'admins'`, 403 on signup/creation, invite accept succeeds. Server side: `server.js:56`, `:1185`, `:1188`, `:1235`, `:1276`. |
| 6 | A pre-tenancy database migrates on first boot: timestamped backup before rewrite, derived slug/name/colour, linked memberships, scoped invites, demo array removed, `data.me` retired. | ✓ VERIFIED | `test/migration.test.mjs:52-145` against `test/helpers/legacy-fixture.mjs`; 8/8 migration tests green. `backfillMemberships()` now calls `ensureMember(..., ws.id)` (`server.js:897`), which resolves the member id from the membership row — the migration test's "both member profiles and memberships are linked" and "a second boot is a no-op" assertions both still pass. |
| 7 | The backup is a genuine pre-rewrite snapshot: tenancy columns present but empty, original document with demo array and `data.me` intact. | ✓ VERIFIED | `test/migration.test.mjs:62-81` opens `gr8r-premultitenant-*.db` and asserts null `slug`/`color`, zero non-null `member_id`/`workspace_id`, `doc.data.workspaces` = `w1,w2`, `data.me = m_alice`. Backup written by `server.js:848-853` (`vacuum into`). |
| 8 | A second boot against the same migrated database changes nothing: no second backup, no slug/doc/member_id/revision drift. | ✓ VERIFIED | `test/migration.test.mjs:164-183` — `backups().length` stays 1, workspace row/revision/member ids/invite scope deep-equal across a real reboot. Independently confirmed by the probe in truth 20 (three consecutive restarts, revision pinned at 1). |
| 9 | The migrated owner can still sign in and read the workspace; preserved project/task rows are intact. | ✓ VERIFIED | `test/migration.test.mjs:125-145` — Alice signs in with the legacy scrypt password, `/api/auth/me` lists `legacy-studio` as owner, `p_keep`/`t_keep` resolve. |
| 10 | A Chromium Playwright suite runs against a fresh built app and a temporary database, with no developer server, port 8080 or local browser cache. | ✓ VERIFIED | `npm run e2e` → **6/6 pass** (9.2 s) at `7b4f20f`; `e2e/server.mjs:14-38` uses `mkdtemp`, `DB_PATH` pinned inside it, port 4317; `e2e/playwright.config.mjs` starts it via `webServer` with `reuseExistingServer` off unless `E2E_REUSE_SERVER=true`; `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`; `dist/index.html` precheck at `e2e/server.mjs:23-27`. |
| 11 | Two genuinely separate workspaces and two accounts prove each tenant sees only its own document and deep links cannot reach the other tenant's project. | ✓ VERIFIED | `e2e/tenancy.spec.mjs:32-76` — owner on Acme, tenant2 on Beta created through the API; foreign slug rewrites to the caller's workspace, foreign project key renders `Page not found` in both directions. |
| 12 | A signed-in workspace member who is not on a private project sees no trace of it and reaches the generic 404 through the UI. | ✓ VERIFIED | `e2e/tenancy.spec.mjs:78-110` — Carol sees the public project and no `Secret Roadmap` on home or project list, gets `Page not found` on the deep link; the owner opens the same link and sees the heading. |
| 13 | CI runs the Node suite and the browser suite, installs Chromium with system dependencies, and uploads traces/screenshots only on failure. | ✓ VERIFIED | Definition: `.github/workflows/ci.yml` — workflow-level `permissions: contents: read`; `build` job (npm ci, lint, format:check, build, npm test); `e2e` job with `timeout-minutes: 20` (npm ci, build, `npx playwright install --with-deps chromium`, `npm run e2e`, `upload-artifact` with `if: failure()`, `retention-days: 7`). **Green run on HEAD**: run **39746021129**, head SHA `7b4f20f`, conclusion `success`; `build` succeeded in 17 s, `e2e` succeeded in 48 s, the upload-artifact step was **skipped** on the green run. |
| 14 | Demo mode has exactly one workspace: no demo array, no local switch handler, no create entry, no switch command in the palette, and onboarding never appends a second workspace. | ✓ VERIFIED | `src/data/seed.js` contains no `workspaces` key (grep: no hit); `src/core/store.js:258-264` builds one entry from `D().ws`; `src/actions/actions.js:1981` returns immediately when `!api.enabled`; `:1996` toasts "The local demo has a single workspace."; `:2752-2755` renames `D().ws` in the demo onboarding branch instead of appending; `src/overlays/popovers.js:243-250` renders a static demo header; `src/overlays/palette.js:58` drops `c-ws` when the API is disabled. `test/demo-workspace.test.mjs` (2/2) green. |
| 15 | Server mode keeps its real workspace switcher, workspace creation and settings unchanged. | ✓ VERIFIED | `src/core/store.js:259-261` still maps `api.workspaces`; `popovers.js:243-249` renders the real list + "Create workspace" entry when `api.enabled`; `palette.js:58` keeps the switch command in server mode; `actions.js:1981` (switch) and `:1996` (create) keep their `api.enabled` branches; `actions.js:2736-2744` creates and then loads the new workspace. |
| 16 | README, DEPLOY, `.env.example` and CHANGELOG describe the shipped behaviour, the complete environment surface including `TRUST_PROXY` and `MAX_BODY_BYTES`, the test commands and the CI jobs. | ✓ VERIFIED | `README.md:13` (Node.js 24), `:80-82` (both CI jobs, artifacts only on failure), `:88-90` (`npm test`, `npm run test:privacy`, `npm run build && npx playwright install chromium && npm run e2e`); `DEPLOY.md:328-333` (upgrading to 1.1.1 — naming the role/plan fix and the invite-accept fix), `:339+` (upgrading to 1.1.0, backup/rollback), `:353` (the migration is idempotent across restarts), `:654-669` (test commands and the two CI jobs); `.env.example:34` (`ALLOW_SIGNUP`), `:81` (`TRUST_PROXY`), `:85` (`MAX_BODY_BYTES`); `CHANGELOG.md:8-31` (1.1.1 with the role/plan fix **and** the invite-accept fix, plus the regression coverage) and `:33+` (1.1.0 with Added/Changed/Security/Upgrade/Known limits). The release notes do not name the third fix (a restart no longer moves the revision) — recorded as an advisory, not as a must-have failure: no shipped statement is inaccurate. |
| 17 | Node 24 is the declared runtime everywhere: `.nvmrc`, `engines`, README and Docker agree; `package.json` and `package-lock.json` state the same version. | ✓ VERIFIED (version is 1.1.1) | `.nvmrc` = `24`; `package.json` `version: 1.1.1`, `engines.node >=24`; `package-lock.json` root `version` and `packages[""].version` both `1.1.1`, engine `>=24`; `Dockerfile:2,12` on `node:24-alpine`; `docker-compose.yml:4` pins `gr8r-studio:1.1.1`; `README.md:13`; `DEPLOY.md` uses the `1.1.1` image tag. The literal "1.1.0" of the original truth is superseded by the legitimate 1.1.1 patch release — the invariant it expresses (manifest ≡ lockfile ≡ docs) holds. |
| 18 | A server-side document change (member role, member removal, plan change) reports the new revision, and the client adopts it, so the next write is accepted instead of being rejected with 409. | ✓ VERIFIED (regression pass) | Server: `server.js` `wsRevision()` + the three endpoints (DELETE member, PATCH member, POST plan) return the post-update revision — untouched by `7b4f20f`. Client: `src/core/api.js:71` `adoptRevision()`, applied by `setMember` (`:209`), `removeMember` (`:216`) and `setPlan` (`:235`). Tests: `test/membership.test.mjs` (role → revision moves → `PUT` with it returns 200), `test/revision.test.mjs` (3/3), `e2e/tenancy.spec.mjs:112-145` — all green at `7b4f20f`. |
| 19 | Accepting an invite does not move the workspace revision, so the inviter's open session keeps writing; the roster is complete for the inviter and for the joiner, and a stale client document cannot drop a member. | ✓ VERIFIED | Server: `addMembership()` (`server.js:955-973`) inserts **only** the membership row — the `update workspaces set doc = …, revision = revision + 1` line is gone. `memberIdFor()` (`:929-935`) takes the id from the membership row; `ensureMember()` (`:937-953`) uses it. `syncProfiles()` (`:656-683`) adds the profile of any member that has none, so the roster is complete on read. `docFromClient()` (`:579-583`) re-adds the stored profiles an incoming document omits, so a stale document cannot drop a member. Tests: `test/invite-revision.test.mjs` — "accepting an invite does not move the revision and keeps the roster complete": revision 1 → accept 200 → revision still 1 → the inviter's `PUT` with that revision → 200 → the roster contains the new member → the served document carries the profile with `role: 'Member'`, `status: 'active'` and the account's `userId` → the joiner sees the same roster and the same `memberId`. Browser: `e2e/tenancy.spec.mjs:147-170` "an invite accepted elsewhere does not lock the workspace out of writing" — the owner signs in, an account joins from another session (`e2e/helpers/setup.mjs` `acceptInvite()`), the owner creates "Joined Elsewhere" **without reloading**, then reloads and finds it still there (proving the server stored it). Green. |
| 20 | **NEW** A server restart does not move the workspace revision: the boot-time backfill still repairs the legacy profile links and drops the demo switcher from the stored document, but the repair is written without a revision bump, so a tab open across the restart keeps its next write. | ✓ VERIFIED | Server: `backfillMemberships()` (`server.js:886-908`) still repairs the profiles and the demo switcher and still writes the document — but with `update workspaces set doc = ?, updated_at = ? where id = ?` (`:908`), no `revision = revision + 1`. Test: `test/invite-revision.test.mjs:83-105` "a restart does not move the revision" — the server is stopped and rebooted on the same `DATA_DIR` (the test owns the directory, `fs.mkdtempSync` at `:23`), the revision is unchanged, a `PUT` carrying the pre-restart revision answers **200**, and the roster still lists the member. Independent probe (`/tmp/opencode/probe-backfill-restart2.mjs`, real server, real SQLite, no mocks): after an accept the revision is 1 and the stored document's `data.members` is empty; **restart #1** → revision still **1** and the stored document now carries both profiles (the backfill persisted its repair) → **restart #2** → revision still 1 → **restart #3** → revision still 1 → a write carrying the pre-restart revision is **accepted (200)** → a legacy-shaped document (demo array `['w1','w2']` + `data.me`) injected directly into the database is repaired on the next boot (demo switcher removed) **without** moving the revision. |

**Score:** 20/20 truths verified (0 present-but-behavior-unverified).

### Requirement Coverage (roadmap R1–R8)

This project has no `REQUIREMENTS.md`; the milestone requirements live in `.planning/ROADMAP.md` as R1–R8.
Phase 4 owns R3, R4, R5, R6, R7 and R8; R1 and R2 are owned by phases 1–2 and are re-checked only
where the `server.js` change could have reached them.

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| R3 | `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped. | ✓ VERIFIED | Browser: `e2e/tenancy.spec.mjs:32-76` — `/w/<slug>` navigation, a foreign slug falls back to the caller's own workspace, a foreign project deep link → `Page not found`. Server: `test/tenancy.test.mjs` slug validation/uniqueness (409 + suggestion); workspace-scoped invite routes (`server.js:1485`, `:1582`) and workspace-scoped acceptance (`server.js:1599` resolves `invite.workspace_id`); share links are `/w/<slug>` (`src/actions/actions.js:511`) and invite links `/join/<token>` (`server.js:1536`) where the token is bound to the workspace row. |
| R4 | Every API call is authorised against the caller's membership of that workspace. | ✓ VERIFIED | Cross-tenant 404 and role 403 in `test/tenancy.test.mjs`; the membership matrix in `test/membership.test.mjs` (an admin cannot manage an admin/owner, only an owner grants ownership, only an owner changes the plan, last-owner 409). Server-side gate `requireWorkspace()` on every workspace route (11 call sites, `server.js:1296-1584`, plus the definition at `:1116`) — untouched by `7b4f20f`. Browser isolation in `e2e/tenancy.spec.mjs`. The write round trip is closed again: neither an invite accept (truth 19) nor a restart (truth 20) moves the revision out from under an open session. |
| R5 | Private projects are never sent to non-members and cannot be modified by them. | ✓ VERIFIED | 70-assertion privacy matrix (`test/privacy.test.mjs`, `npm run test:privacy` → 10/10): read redaction + leak scan, write merge, access-field tampering, project-lead access, saved-view/filters/recent-search scrubbing. Browser proof: `e2e/tenancy.spec.mjs:78-110`. `syncProfiles` runs **before** `redactDoc` (`server.js:551-556`) and only touches `data.members`, never project rows — the matrix is unchanged and green. |
| R6 | Existing installs migrate in place, without data loss, with a pre-migration backup. | ✓ VERIFIED | `test/migration.test.mjs` (8/8): exactly one `gr8r-premultitenant-*.db` written before the rewrite and logged (`server.js:848-853`); the backup is a genuine pre-rewrite snapshot; slug/name/colour derived; memberships and invite scoped; `p_keep`/`t_keep` preserved; the legacy owner still signs in; a second boot is a no-op. `backfillMemberships()` keeps the migration link working after the `ensureMember()` signature change (`server.js:897` passes `ws.id`, so `memberIdFor()` resolves the row's id instead of minting a new one). The `7b4f20f` change only removes the revision bump from the backfill's write — the migration's own path (`migrateTenancy()`, `server.js:835-873`) is unchanged, so the backup guarantee is untouched. Documented for operators in `DEPLOY.md:339+`. |
| R7 | Creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an existing account can accept an invite. | ✓ VERIFIED | `test/membership.test.mjs`: `ALLOW_SIGNUP=false` → `signup:false`, `workspaceCreation:'admins'`, 403 on signup and creation while workspace invites still onboard; an invite for an existing account answers 409 `needsSignIn` then succeeds once signed in; a second invite for a member is 409; revoke/expire answer 404/410. Workspace creation honours the same flag (`server.js:1188`, `:1276`; `src/actions/actions.js:1996-2003`). The accept path itself: `server.js:1606-1668` — token-scoped, single-use for address invites, membership row inserted, and the revision left alone (truths 19 and 20). |
| R8 | Lint, format, build and the new server tests pass in CI. | ✓ VERIFIED | Local at `7b4f20f`: `npm run lint` clean, `npm run format:check` → "All matched files use Prettier code style!", `npm run build` → 57 modules, `npm test` → **50/50**, `npm run test:privacy` → 10/10, `npm run e2e` → **6/6**. CI: `.github/workflows/ci.yml` runs exactly those commands. **Run 39746021129** (push to `main`, head SHA `7b4f20f`) — conclusion `success`: job `build` → `success` (17 s: npm ci, lint, format:check, build, npm test), job `e2e` → `success` (48 s: npm ci, build, `npx playwright install --with-deps chromium`, npm run e2e), `upload-artifact` **skipped** on the green run. Observed directly via `gh run watch 39746021129 --exit-status` (exit 0). |

No orphaned requirements: R1 and R2 are covered by phases 1–2; R3–R8 all have both server-suite and
browser-suite coverage in this phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `test/helpers/server.mjs` | Shared spawn/cookie/DB harness | ✓ VERIFIED | 156 lines; free port, `mkdtemp`, cookie client, login/signup, `withDb`, `inviteToken`; the only spawn site for the Node suites. |
| `test/tenancy.test.mjs` | Phase 1 contract | ✓ VERIFIED | 10/10 — cross-tenant 404, role 403, stale 409, 401. |
| `test/membership.test.mjs` | Phase 2 lifecycle | ✓ VERIFIED | 14/14, including the revision test and the closed-signup server. |
| `test/privacy.test.mjs` | Ported 70-check privacy matrix | ✓ VERIFIED | 10 tests, 70 `assert.*` sites. |
| `test/revision.test.mjs` | Client-side revision handshake | ✓ VERIFIED | 3/3: role change adopts 8, plan change adopts 10, a refused change invents no revision. |
| `test/invite-revision.test.mjs` | Invite-accept + restart revision/roster suite | ✓ VERIFIED | **2 tests**: "accepting an invite does not move the revision and keeps the roster complete" and "a restart does not move the revision" (`:83-105`). Own server on a caller-owned `DATA_DIR` so it survives the reboot, because the accept throttle allows 5 accepts per IP per hour and the membership suite already spends them (`:1-8`). |
| `test/harness.test.mjs` | Ambient `DB_PATH` isolation guard | ✓ VERIFIED | 1 test — the harness pins `DB_PATH` inside its temp dir. |
| `test/helpers/legacy-fixture.mjs` | Exact pre-tenancy schema + rows | ✓ VERIFIED | Legacy tables without tenancy columns; scrypt hash helper. |
| `test/migration.test.mjs` | Backup-first, correctness, idempotency | ✓ VERIFIED | 8/8. |
| `test/demo-workspace.test.mjs` | Single-workspace regression guard | ✓ VERIFIED | 2/2. |
| `e2e/playwright.config.mjs` | Chromium project, traces on failure, webServer | ✓ VERIFIED | 1 Chromium project, `test-results`, `trace: retain-on-failure`, `screenshot: only-on-failure`, graceful SIGTERM shutdown, `reuseExistingServer` off by default. |
| `e2e/server.mjs` | Temp DATA_DIR + server lifecycle | ✓ VERIFIED | `mkdtemp`, port 4317, `DB_PATH` pinned, SIGTERM cleanup, `dist` precheck. |
| `e2e/helpers/setup.mjs` | API-only fixtures, per-run ids | ✓ VERIFIED | Owner/Acme, tenant2/Beta, Carol invite/accept, public/private projects, **plus `acceptInvite()`** (`:122`) for a join that happens in another session. |
| `e2e/tenancy.spec.mjs` | Two-tenant + private-project + revision + invite UAT | ✓ VERIFIED | 6 browser tests, role/label/text selectors only. |
| `.github/workflows/ci.yml` | Build + Chromium e2e jobs | ✓ VERIFIED | v7 actions; artifacts uploaded only on failure; **green on HEAD** (run 39746021129). |
| `CHANGELOG.md` | Keep a Changelog, 1.1.0 + 1.1.1 | ✓ VERIFIED | `## [1.1.1] - 2026-10-22` (both documented fixes + the regression coverage) and `## [1.1.0] - 2026-10-21`. The third fix (restart) is not named — advisory, not a failure. |
| `README.md`, `DEPLOY.md`, `.env.example` | Release docs and env surface | ✓ VERIFIED | Node 24, test commands, CI jobs, `TRUST_PROXY`/`MAX_BODY_BYTES`, upgrade to 1.1.1 and to 1.1.0, rollback. |
| `package.json`, `package-lock.json`, `.nvmrc`, `Dockerfile`, `docker-compose.yml` | 1.1.1 + Node 24 | ✓ VERIFIED | All agree. |
| `server.js` | Redaction, invite backfill, revision reporting, membership-row-only join, revision-free boot backfill | ✓ VERIFIED | `redactDoc`/`mergeRecentSearches`; `backfillInvites()`; `wsRevision()` + the three revision-reporting endpoints; `addMembership()` writes only the membership row; `memberProfile()`/`memberIdFor()`; `syncProfiles()` repairs the roster on read; `docFromClient()` re-adds omitted stored profiles; `backfillMemberships()` (`:905-908`) writes its repair **without** moving the revision. |
| `src/core/api.js` | Client-side revision adoption | ✓ VERIFIED | `adoptRevision()` (`:71`) wired into `setMember` (`:209`), `removeMember` (`:216`), `setPlan` (`:235`); `acceptInvite()` (`:263`) needs no revision. |
| `scripts/verify-private-projects.mjs` | Deleted; logic ported | ✓ VERIFIED | Absent; `scripts/` holds only `export-seed.mjs`; no references outside planning history. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `test/*.test.mjs` | `test/helpers/server.mjs` | import of `startServer`/`client`/`login`/`withDb` | WIRED | Every suite imports the shared harness; no duplicated spawn code. |
| `test/helpers/server.mjs` | `server.js` | `spawn(process.execPath, ['server.js'])` | WIRED | Real processes, ephemeral ports, temp `DATA_DIR`, captured output. |
| `test/migration.test.mjs` | `test/helpers/legacy-fixture.mjs` | `createLegacyDb(dataDir)` then `startServer({ dataDir })` | WIRED | Same directory rebooted; the caller-owned dir survives `stop()`. |
| `test/revision.test.mjs` | `src/core/api.js` | dynamic import of the real client module | WIRED | The client half is exercised against the shipped module, not a copy. |
| `test/invite-revision.test.mjs` | `server.js` invite-accept route | `POST /api/invites/:token/accept` on a real server | WIRED | No mock: the harness spawns the real process and the assertions read the served document and the roster endpoint. |
| `test/invite-revision.test.mjs` | `server.js` boot path | `startServer({ dataDir })` → `bootstrap()` → `migrateTenancy()` → `backfillMemberships()` | WIRED | The restart half reboots the real process on the same database file; the assertion reads the revision the server reports after the reboot. |
| `e2e/playwright.config.mjs` | `e2e/server.mjs` | `webServer.command` + `/api/health`, graceful SIGTERM | WIRED | Fresh server and DB per run. |
| `e2e/tenancy.spec.mjs` | `e2e/helpers/setup.mjs` | `setupTenants(BASE_URL)` in `beforeAll`, `acceptInvite(BASE_URL, …)` in the test | WIRED | API fixtures, browser-only assertions; the join deliberately happens on another IP/session (`clientIp(run, 'late')`). |
| `server.js` `addMembership()` | `memberships` table | one insert, no document write | WIRED | The membership row is the source of truth; `syncProfiles()` mirrors it into the document on read. |
| `server.js` `memberIdFor()` | `memberships.member_id` | `select member_id … where workspace_id = ? and user_id = ?` | WIRED | A repaired profile carries the id the row recorded — asserted by `test/invite-revision.test.mjs` (`mine.memberId === profile.id`). |
| `server.js` `syncProfiles()` | `docForClient()` | `syncProfiles(out, ws.id)` before `redactDoc` | WIRED | The roster is complete on every read, for the inviter and the joiner. |
| `server.js` `backfillMemberships()` | `workspaces.doc` (no `revision`) | `update workspaces set doc = ?, updated_at = ? where id = ?` | WIRED | The repair is still persisted; the revision is untouched (`server.js:908`). Verified by the probe: three consecutive restarts leave the revision at 1 while the stored document gains the repaired profiles. |
| `src/core/api.js` `adoptRevision()` | `server.js` `wsRevision()` | the `revision` field of the member/plan responses | WIRED | Verified end to end (`test/membership.test.mjs`, `e2e/tenancy.spec.mjs:112`). |
| `src/core/store.js` `workspaceList()` | `D().ws` (demo) / `api.workspaces` (server) | branch on `api.enabled` | WIRED | Exactly one demo entry; the server list is unchanged. |
| `.github/workflows/ci.yml` | npm scripts | `npm test`, `npm run e2e`, `npx playwright install` | WIRED | The commands exist in `package.json` and pass locally; run 39746021129 is green on `7b4f20f`. |
| `server.js` `migrateTenancy()` | `backfillInvites()` / `backfillMemberships()` | direct calls at `server.js:872-873` | WIRED | Legacy invites are scoped and legacy profiles are linked — asserted by the migration test. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/core/store.js` demo `workspaceList()` | workspace entry | `D().ws` hydrated from localStorage / seed | Yes — name/slug/colour come from the live document | ✓ FLOWING |
| `src/core/store.js` server `workspaceList()` | workspace array | `api.workspaces` fetched at boot | Yes — real memberships | ✓ FLOWING |
| `server.js` `redactDoc` | `recentSearches` | stored document filtered by hidden project names/keys | Yes — hidden terms removed, survives the write merge | ✓ FLOWING |
| `server.js` `wsRevision()` → `src/core/api.js` `adoptRevision()` | `revision` | the `workspaces.revision` column after the transaction | Yes — read from the live row, not a constant | ✓ FLOWING |
| `server.js` `syncProfiles()` → served `data.members` | roster | the `memberships` table joined to `users` | Yes — the join row is the source of truth, not a client document | ✓ FLOWING |
| `server.js` `memberIdFor()` | `member_id` | the `memberships` row | Yes — read from the live row; never a client-supplied id | ✓ FLOWING |
| `server.js` `backfillMemberships()` → stored `workspaces.doc` | repaired document | the stored document + the `memberships` table | Yes — the repair is persisted on disk (probe: the stored `data.members` gains both profiles after one boot) and the revision column is left alone | ✓ FLOWING |
| `e2e/tenancy.spec.mjs` UI assertions | rendered projects/members | API fixtures written to the throwaway DB, served by the real server | Yes — positive anchor + 404/absence checks, plus a reload that proves the server stored the project | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full Node server suite (current HEAD) | `npm test` | **50 tests, 50 pass, 0 fail** (49 before the restart test) | ✓ PASS |
| Phase 3 privacy gate alias | `npm run test:privacy` | 10 tests, 10 pass, 70 `assert.*` sites | ✓ PASS |
| Node suite without a built `dist` | `STATIC_DIR=/tmp/opencode/empty-dist node --test test/tenancy.test.mjs` | 10/10 pass | ✓ PASS |
| Browser two-tenant + private-project + revision + invite UAT | `npm run e2e` | **6/6 pass** (9.2 s) | ✓ PASS |
| Production build | `npm run build` | Vite build OK, 57 modules | ✓ PASS |
| Lint | `npm run lint` | clean exit | ✓ PASS |
| Format gate | `npm run format:check` | "All matched files use Prettier code style!" | ✓ PASS |
| Invite-accept, server half | `npm test` → "accepting an invite does not move the revision and keeps the roster complete" | pass | ✓ PASS |
| Invite-accept, browser half | `npm run e2e` → "an invite accepted elsewhere does not lock the workspace out of writing" | pass | ✓ PASS |
| Restart half, server | `npm test` → "a restart does not move the revision" | pass | ✓ PASS |
| Restart, live probe (real server, real SQLite, no mocks) | `node /tmp/opencode/probe-backfill-restart2.mjs` | accept 200 → revision 1 → restart #1 → revision **still 1** and the stored document gains both profiles → restart #2 → still 1 → restart #3 → still 1 → a write holding revision 1 → **200** → a legacy-shaped document (demo array + `data.me`) is repaired on the next boot **without** moving the revision | ✓ PASS |
| Temp-directory hygiene | `ls -d /tmp/gr8r-*` after `npm test` + `npm run e2e` | only the pre-existing `/tmp/gr8r-test-XLsIB2` (created 09:38, before this session) — the harnesses clean up after themselves | ✓ PASS |
| **CI — GitHub Actions on HEAD** | `gh run watch 39746021129 --exit-status` | **exit 0**; run conclusion `success`; job `build` → `success` (17 s); job `e2e` → `success` (48 s); `upload-artifact` skipped | ✓ PASS |

### Probe Execution

No probe scripts were declared by this phase and none exist under `scripts/*/tests/probe-*.sh`; the
migration proof is exercised by `test/migration.test.mjs`. **SKIPPED (no probes).** The two probes
above are ad-hoc verification scripts under `/tmp/opencode/`, outside the repository, and do not
modify any source file.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `server.js`, `test/*.mjs`, `e2e/*.mjs`, `.github/workflows/ci.yml`, `src/core/store.js`, `src/actions/actions.js`, `src/overlays/*.js`, `src/data/seed.js` | — | No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers in any phase-modified file (re-scanned on the 2 files changed since the previous report) | — | None |
| `server.js` | 365-399 | Recent-search redaction is substring-based, not per-user storage | ℹ️ Info | Disclosed as a known limit in `CHANGELOG.md` and `DEPLOY.md`; regression-tested. |
| `README.md` | 88 | The test-suite list reads "tenancy, membership, privacy, migration" and does not name the revision, invite-revision, harness or demo suites | ℹ️ Info | Illustrative list, not an inventory; `npm test` discovers all eight `test/*.test.mjs` files. No code change implied. |

### Warnings / Advisories

**W-01 (CLOSED) — the boot-time backfill no longer moves the workspace revision.** The previous
report recorded this as an evidenced warning: `backfillMemberships()` wrote the repaired document
with `revision = revision + 1`, so a restart after an invite acceptance moved the revision once and
re-opened the same write-lockout for a tab open across the restart. `7b4f20f` removes the bump
(`server.js:908`) while keeping the repair itself. The independent probe confirms both halves: the
stored document still gains the repaired profiles (and the demo switcher is still dropped from a
legacy-shaped document), and the revision stays at 1 across three consecutive restarts.

Two advisory items remain, both **outside** the phase's must-haves and neither blocking (recorded in
the `advisory:` frontmatter):

1. **`CHANGELOG.md` / `DEPLOY.md` do not name the third fix.** The 1.1.1 notes still list only the
   role/plan fix and the invite-accept fix. No shipped statement became false — the 1.1.1 note says
   "a join no longer disturbs anybody's pending edit", which is now strictly true, and the
   "pull, rebuild and restart as usual" upgrade step (`DEPLOY.md:328-333`) is safe because of the
   fix. A third bullet under `## [1.1.1]` and one clause in `DEPLOY.md` would close the gap.
2. **`.planning/v1.1-MILESTONE-AUDIT.md` is stale on the score and on W-01.** It records phase 04 as
   "passed — 17/17 must-haves" (now 20/20) and describes W-01 as the invite-accept defect only, not
   the restart variant that was found and closed after the audit was written. Planning-root document,
   inert for the implementation; it is the report this verification feeds and should be refreshed.

### Advisory (new scope, unevidenced)

| # | Finding | Category | Why Advisory |
|---|---------|----------|--------------|
| 1 | `/tmp/gr8r-test-XLsIB2` — a harness-owned temp directory left on disk, created 2026-10-22 09:38:38, i.e. **before** this verification started. The harness removes owned directories in `stop()` (`test/helpers/server.mjs:86`); every run performed during this verification (`npm test` ×2, `npm run test:privacy`, `npm run e2e` ×2 and the two probes) left no new directory. | other | Pre-existing artefact of an interrupted run outside this session's control; no code change implied. |
| 2 | The working tree carries untracked `.planning/` documents (`RETROSPECTIVE.md`, `milestones/`, `v1.1-MILESTONE-AUDIT.md`) and a modified `.planning/PROJECT.md`. | other | Planning-root documents are inert for the implementation; they are excluded from the digest per the re-verification convention. |
| 3 | `POST /api/invites/:token/accept` still has no `sameOrigin()` check, unlike every other workspace-mutating route (`server.js:1272-1583`). | security | Pre-existing milestone tech debt, already recorded as W-2 in `.planning/v1.1-MILESTONE-AUDIT.md`; the route's credential is the single-use invite token, not the session. Not introduced by this phase and not a phase-4 must-have. |

### Human Verification Required

**None.** The previous report's single human-verification item — the first CI run covering HEAD —
has been observed directly and is green: GitHub Actions run **39746021129** (push to `main`, head
SHA `7b4f20f`) concluded `success`, with the `build` job succeeded in 17 s (npm ci → lint →
format:check → build → npm test) and the `e2e` job succeeded in 48 s (npm ci → build →
`npx playwright install --with-deps chromium` → npm run e2e); the upload-artifact step was skipped
because the run was green. No other item needs a human: everything else is covered by an automated
server suite, an automated Chromium suite, or a deterministic probe.

## Gaps Summary

No gaps against the phase goal. Every deliverable named in the goal exists and works against the
current tree: the shared `node:test` harness and eight server suites (**50/50**), the
legacy-database migration proof with a genuine pre-migration backup and second-boot idempotency
(**8/8**), the Chromium two-tenant / private-project / role-change / invite-accept UAT (**6/6**), CI
wiring for both suites on the v7 Node-24 actions **green on HEAD** (run 39746021129), release docs
(README, DEPLOY, `.env.example`, CHANGELOG 1.1.0 + 1.1.1), the removal of the demo workspace
switch, and a consistent 1.1.1 / Node 24 release.

The previous report's two open items are both closed: the CI run is observed green, and warning W-01
(restart moving the revision) is fixed by `7b4f20f` and proven by the new test plus an independent
probe over three restarts.

Two advisory items remain, neither of which affects the phase goal or any roadmap requirement: the
release notes do not name the third fix, and the milestone audit's phase-04 score and W-01 entry are
stale.

---

_Verified: 2026-10-22T10:20:00Z_
_Verifier: the agent (gsd-verifier)_
