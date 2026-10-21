# STATE

Last updated: 2026-10-21

## Position

- Milestone: **Multitenant (v1.1)**
- Phase: **2 — Membership lifecycle: complete**
- Next: **Phase 3 — Private project isolation**

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

Known limitations carried forward:

- Private projects are filtered in the browser only (phase 3).
- Plans remain display-only labels; nothing is billed or limited.
- Invite email delivery still requires `SMTP_HOST`; links are copied by hand otherwise.

## Verification commands used

```sh
npm run lint && npm run format:check && npm run build
node server.js            # with DATA_DIR pointing at a copy of a real database
```

## Useful environment

- Fresh install: `WORKSPACE_SLUG` names the first workspace's URL; it is ignored afterwards.
- Creation policy follows `ALLOW_SIGNUP` (`true` = any signed-in user, `false` = owner/admin of an
  existing workspace).
- Rollback: restore `DATA_DIR/gr8r-premultitenant-*.db` over `gr8r.db` and redeploy the previous
  image.
