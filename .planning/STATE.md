# STATE

Last updated: 2026-10-21

## Position

- Milestone: **Multitenant (v1.1)**
- Phase: **1 — Tenancy foundation: complete** (uncommitted work merged into `main`)
- Next: **Phase 2 — Membership lifecycle**

## Where things stand

Phase 1 landed the tenancy boundary end to end: one workspace row per workspace with a unique
slug, a real `memberships` access table, slug-scoped API calls with server-side role
enforcement, `/w/:slug` routing, a real workspace switcher and API-backed workspace creation.
A single-workspace database migrates in place with an automatic pre-migration backup.

Known limitations carried forward:

- Private projects are filtered in the browser only (phase 3).
- Invitations are workspace-scoped in storage but the invite UI is unchanged, and there is no
  role change or member removal UI yet (phase 2).
- `A.delWorkspace` is disabled in server mode (phase 2 gets delete/leave properly).
- Plans remain display-only.

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
