---
gsd_state_version: "1.0"
milestone: v1.1
status: executing
stopped_at: Phase 4 plan 04-01 complete (test harness and server suites)
last_updated: "2026-10-21T19:20:00.000Z"
state_head: cd80fd0596c660e678d07cc0c91ac8f415c51af5
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 7
  completed_plans: 4
---

# STATE

Last updated: 2026-10-21

## Position

- Milestone: **Multitenant (v1.1)**
- Phase: **4 — Hardening and ship: in progress** (plan 1 of 4 complete)
- Next: **Phase 4, plan 04-02 — legacy migration fixture and idempotency test**

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

Known limitations carried forward:

- Plans remain display-only labels; nothing is billed or limited.
- Invite email delivery still requires `SMTP_HOST`; links are copied by hand otherwise.
## Decisions

- Each test file owns one server and one temporary database; the harness deletes only directories
  it created, so a migration test can reboot on a supplied `dataDir`.
- The privacy matrix keeps its exact phase 3 fixture and checks rather than being rewritten around
  the new harness.
- Server tests never mock SQLite or HTTP.

## Verification commands used

```sh
npm test                # tenancy, membership and privacy suites (real servers)
npm run test:privacy    # phase 3 privacy matrix alias
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

**Last session:** 2026-10-21T19:20:00.000Z
**Stopped at:** Phase 4 plan 04-01 complete (test harness and server suites)
**Resume file:** .planning/phases/04-hardening-and-ship/04-02-PLAN.md
