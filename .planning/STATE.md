---
gsd_state_version: "1.0"
milestone: v1.1
status: executing
stopped_at: Phase 4 plan 04-03 complete (Playwright two-tenant UAT and CI wiring)
last_updated: "2026-10-21T19:50:00.000Z"
state_head: e5817127754483bf5b9b2d93bd5a6a7862547401
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 7
  completed_plans: 6
---

# STATE

Last updated: 2026-10-21

## Position

- Milestone: **Multitenant (v1.1)**
- Phase: **4 — Hardening and ship: in progress** (plan 3 of 4 complete)
- Next: **Phase 4, plan 04-04 — demo single-workspace cleanup, release docs, 1.1.0, Node 24**

## Where things stand

Phase 1 landed the tenancy boundary end to end: one workspace row per workspace with a unique
slug, a real `memberships` access table, slug-scoped API calls with server-side role
enforcement, `/w/:slug` routing, a real workspace switcher and API-backed workspace creation.
A single-workspace database migrates in place with an automatic pre-migration backup.

Phase 2 made the membership table the single source of truth for access. Roles and status are
overlaid on the workspace document at read time and ignored on write for account profiles.
Owners and admins manage members through dedicated endpoints; removal and leave clean up tasks,
subtasks, projects and teams in the same transaction. Address invites for existing accounts,
pending invite listing/revocation, owner-only plan changes, and workspace delete/leave are
implemented. The members page and settings read and write through the API; demo mode keeps its
local behaviour.

Phase 3 moved private-project isolation to the server. The served document omits private
projects and every row that references them, including saved view state and project filters.
Writes are merged with stored rows by id, so a redacted document cannot delete or rewrite a
project it cannot see, and access fields are restored unless the caller is an owner, an admin
or the project lead. The last member of a private project cannot leave or be removed until
someone else is promoted or the project is made workspace-wide.

Phase 4 plan 1 replaced the standalone privacy script with a `node:test` suite. One shared
`test/helpers/server.mjs` harness spawns real `server.js` processes on ephemeral loopback ports
with `mkdtemp` `DATA_DIR`s, and three suites cover phases 1–3 (32 tests): tenancy, membership
lifecycle and the ported 70-check privacy matrix. `npm test` is the entry point;
`npm run test:privacy` remains the phase 3 release alias. `.planning` and `.gsd` are now
prettier-ignored so tooling-written planning artifacts stop failing `format:check`.

Phase 4 plan 2 proves the in-place migration automatically. `test/helpers/legacy-fixture.mjs`
builds the exact pre-tenancy schema and rows (no `workspaces.slug`/`color`, no
`memberships.member_id`, no `invites.workspace_id`, demo switcher and `data.me` present), and
`test/migration.test.mjs` boots the real server against it: exactly one backup is written before
any rewrite, the workspace derives `legacy-studio` / `Legacy Studio` / `#3D8E5F`, both members are
linked, the invite is scoped, `data.workspaces` is dropped, `data.me` is retired, and
`p_keep`/`t_keep` survive. A second boot is byte-identical and creates no backup. The suite
exposed one real gap: `migrateTenancy()` never scoped legacy invites, now fixed by
`backfillInvites()`. `npm test` is 40 tests.

Phase 4 plan 3 puts the contract in a real browser and in CI. `e2e/server.mjs` boots its own
server on `127.0.0.1:4173` with a `mkdtemp` `DATA_DIR` and removes it on SIGTERM;
`e2e/helpers/setup.mjs` creates two workspaces and three accounts through the API; and
`e2e/tenancy.spec.mjs` (4 Chromium tests) proves document isolation in both directions, the
foreign-slug fallback, cross-tenant project 404s, and that a plain member sees no trace of a
private project while its owner still opens it. CI keeps the lint/format/build job, adds
`npm test`, and gains a required Chromium e2e job that installs with system dependencies and
uploads traces only on failure.

Known limitations carried forward:

- Plans remain display-only labels; nothing is billed or limited.
- Invite email delivery still requires `SMTP_HOST`; links are copied by hand otherwise.
- `.nvmrc` still pins Node 22 until plan 04-04 bumps it to 24; the e2e and Node suites need 24.

## Decisions

- Each test file owns one server and one temporary database; the harness deletes only directories
  it created, so a migration test can reboot on a supplied `dataDir`.
- The privacy matrix keeps its exact phase 3 fixture and checks rather than being rewritten around
  the new harness.
- Server tests never mock SQLite or HTTP.
- The migration test asserts the backup before any rewritten row and compares a byte-for-byte
  snapshot across a reboot, including `updated_at` and the raw document string.
- Legacy invites are scoped by `migrateTenancy()`; an unscoped legacy invite is a migration bug,
  not an accepted state.
- Playwright's `webServer` needs an explicit `gracefulShutdown`; otherwise it SIGKILLs the process
  group and the e2e server wrapper cannot remove its temporary database.
- Browser fixtures present a run-unique `X-Forwarded-For` so per-IP throttles never make a second
  local e2e run fail.
- E2E assertions stay in the browser with role/label/text selectors; the API client only creates
  fixtures.

## Verification commands used

```sh
npm test                # tenancy, membership, privacy and migration suites (real servers)
npm run test:privacy    # phase 3 privacy matrix alias
npm run build && npm run e2e   # Chromium UAT against a throwaway server
npm run lint && npm run format:check && npm run build
node server.js          # with DATA_DIR pointing at a copy of a real database
```

## Useful environment

- Fresh install: `WORKSPACE_SLUG` names the first workspace's URL; it is ignored afterwards.
- Creation policy follows `ALLOW_SIGNUP` (`true` = any signed-in user, `false` = owner/admin of an
  existing workspace).
- Rollback: restore `DATA_DIR/gr8r-premultitenant-*.db` over `gr8r.db` and redeploy the previous
  image.

## Session

**Last session:** 2026-10-21T19:50:00.000Z
**Stopped at:** Phase 4 plan 04-03 complete (Playwright two-tenant UAT and CI wiring)
**Resume file:** .planning/phases/04-hardening-and-ship/04-04-PLAN.md
