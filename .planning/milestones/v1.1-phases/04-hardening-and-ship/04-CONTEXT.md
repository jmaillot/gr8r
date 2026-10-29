# Phase 4: Hardening and ship - Context

**Gathered:** 2026-10-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the multitenant milestone mergeable, tested, documented and deployable: a `node:test`
suite for the three shipped phases, CI that runs it, a Playwright two-tenant UAT, an automated
migration proof against a legacy database fixture, removal of the demo-only workspace switcher,
and a 1.1.0 release with notes. No new tenancy capabilities, no billing, no file storage.

</domain>

<decisions>
## Implementation Decisions

### Test suite
- **D-01:** Cover all three shipped phases with `node:test`: tenancy foundation, membership
  lifecycle and private-project isolation. The existing 70-check privacy matrix is the seed,
  not the whole suite. `npm test` runs the suite; `npm run test:privacy` stays as a
  compatibility alias so the phase 3 verification command keeps working.
- **D-02:** Tests spawn a real `server.js` on a free loopback port with a temporary `DATA_DIR`
  and exercise the HTTP API with cookie-bearing clients. Reuse the patterns already proven in
  `scripts/verify-private-projects.mjs`; extract the spawn/login/client helpers instead of
  copying them per file.
- **D-03:** Tests are independent: each file gets its own database and server lifecycle, and
  cleans up its temporary directory. No test depends on a developer database, on port 8080, or
  on a prebuilt `dist/`. Tests must not touch an unrelated running server.
- **D-04:** CI runs `npm test` in addition to lint, format check and build. Node 24 is the
  supported runtime everywhere: update `.nvmrc` to 24, keep `engines.node` at `>=24`, and make
  the README agree. The Dockerfile already uses `node:24-alpine`.

### Two-tenant UAT
- **D-05:** Add Playwright Test with Chromium only under `e2e/`. The suite creates two
  workspaces and two accounts through the API, signs in as each in the browser, and proves that
  each tenant sees only its own workspace document. It also signs a non-member into the first
  workspace and proves that a private project is invisible and unreachable through the UI.
- **D-06:** E2E runs in CI against a fresh server and temporary database: build once, install
  Chromium with system dependencies, start the server, then run the browser suite. Traces and
  screenshots are uploaded only on failure; the job is not allowed to depend on a developer's
  local browser or database.
- **D-07:** API setup is allowed in Playwright (`request` context) for workspaces, invites and
  private-project fixtures; assertions about visibility, 404s and read-only controls happen in
  the browser. Tests use role/label selectors, not CSS implementation details, and must be
  runnable repeatedly against a fresh database.

### Demo workspace switch
- **D-08:** The browser-only demo keeps exactly one workspace. Remove `data.workspaces` from the
  seed and remove the demo branch of `switchWs`, the "Create workspace" entry and the fake
  switcher from the demo UI. `workspaceList()` returns the current demo workspace only; the
  onboarding flow no longer appends a second demo workspace.
- **D-09:** Server mode keeps the real workspace switcher, creation and settings unchanged.
  Demo mode must not imply that multiple workspaces exist or can be created offline.

### Migration proof and release
- **D-10:** Add an automated legacy-migration test. It builds a pre-tenancy SQLite fixture
  (workspace row without slug/colour, memberships without `member_id`, invites without
  `workspace_id`, `data.workspaces` and `data.me` still in the document), starts the server
  against a copy, and asserts: a timestamped backup exists, the workspace got a slug/name/colour,
  memberships are linked, `data.workspaces` is gone, `data.me` is retired, and a second start is
  idempotent (no second migration, no data loss).
- **D-11:** Release as `1.1.0`: bump `package.json` and `package-lock.json`, add `CHANGELOG.md`
  with the multitenant milestone, private projects, migration instructions, security notes and
  known limits. Update `README.md`, `DEPLOY.md` and `.env.example` so they describe the shipped
  behaviour and the complete environment surface (including `TRUST_PROXY` and
  `MAX_BODY_BYTES`).
- **D-12:** Documentation changes are part of the release commit: remove the README's "fake
  switcher" claim, describe the real test commands and CI jobs, and point upgrades at the
  pre-migration backup and rollback procedure already documented in `DEPLOY.md`.

### Agent's Discretion
- Exact test-file split (`test/tenancy.test.mjs`, `test/membership.test.mjs`,
  `test/privacy.test.mjs`, `test/migration.test.mjs` or a smaller equivalent), helper naming,
  and whether the privacy matrix keeps its standalone script wrapper.
- Playwright project layout and whether e2e shares a CI job with the Node suite or runs in a
  separate job, provided both are required and deterministic.
- CHANGELOG wording, section ordering and whether a GitHub release is created after the push.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product and scope
- `.planning/PROJECT.md` — tenancy model, validated decisions, explicit out-of-scope list.
- `.planning/ROADMAP.md` — phase 4 scope and milestone requirements R1–R8.
- `.planning/STATE.md` — completed phases and known limitations.

### Prior phase records
- `.planning/phases/01-tenancy-foundation/SPEC.md` — tenancy contract, including removal of
  `data.workspaces`.
- `.planning/phases/01-tenancy-foundation/SUMMARY.md` — migration and demo-switcher deviations.
- `.planning/phases/02-membership-lifecycle/SUMMARY.md` — membership endpoints and role rules.
- `.planning/phases/03-private-project-isolation/SUMMARY.md` — redaction/merge contract and the
  70-check privacy matrix.

### Implementation and verification
- `server.js` — `migrateTenancy()`, schema, auth, workspace/member/privacy endpoints.
- `scripts/verify-private-projects.mjs` — existing isolated-server test harness to reuse.
- `.github/workflows/ci.yml` — current lint/format/build job to extend.
- `.nvmrc`, `Dockerfile`, `package.json` — Node 24 alignment and scripts.
- `src/core/store.js`, `src/actions/actions.js`, `src/overlays/popovers.js`, `src/data/seed.js`
  — demo workspace list and switcher removal.
- `README.md`, `DEPLOY.md`, `.env.example` — user-facing release documentation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scripts/verify-private-projects.mjs`: free-port server spawn, cookie client, legacy/private
  fixtures, 70 assertions. Extract its helpers for `node:test`.
- `server.js` CLI: `--backup`, `--add-user`, `--set-password`; `migrateTenancy()` already writes
  the pre-migration backup, so the migration test can assert real behaviour rather than a mock.
- `.github/workflows/ci.yml`: checkout + setup-node with `.nvmrc` + `npm ci`; add test steps
  without changing the trigger model.

### Established Patterns
- Every server test uses a temporary `DATA_DIR`, an ephemeral port, and `fetch` with captured
  `projects_session` cookies. No test mocks SQLite or the HTTP layer.
- Workspace routes are `/api/workspaces/:slug/...`; cross-tenant access is expected to answer
  `404`, not `403`.
- Private project redaction is server-side; browser checks assert absence, not hidden CSS.
- Client demo mode is selected by `api.enabled === false`; server mode must keep current
  behaviour.

### Integration Points
- New `test/` files and `e2e/` suite connect to `server.js`; Playwright needs built `dist/` and
  a temporary database.
- `popovers.js` `case 'ws'` and `store.js` `workspaceList()` are the demo-switcher removal seams;
  `actions.js` also has demo branches in `switchWs` and onboarding.
- `README.md` "Continuous integration" and "Workspaces" sections, `DEPLOY.md` "Upgrading an
  existing install", and `.env.example` need release edits.

</code_context>

<specifics>
## Specific Ideas

- Keep the phase 3 privacy command working: `npm run test:privacy` is documented and used as a
  release gate.
- The migration test should prove the backup before asserting the rewritten document; a
  migration that loses the backup is a failure even if the new rows look correct.
- The e2e UAT must use two genuinely separate workspaces, not two browser contexts against the
  same workspace.
- Release notes should be honest about what is still display-only (plans) and optional (SMTP).

</specifics>

<deferred>
## Deferred Ideas

- Real billing/plan enforcement, per-user settings isolation, and file storage remain out of
  scope for v1.1.
- A GitHub release/tag is optional and can follow the merge; it is not a phase deliverable.

</deferred>

---

*Phase: 4-Hardening and ship*
*Context gathered: 2026-10-21*
