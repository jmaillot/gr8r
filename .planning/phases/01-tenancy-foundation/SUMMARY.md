# SUMMARY — Phase 1: Tenancy foundation

Status: **complete** (lint, format check and build green; verified by curl + browser UAT).

## What shipped

A workspace is now the tenant boundary. `workspaces` holds one row per workspace with a unique
`slug` and its own JSON document; `memberships` is the access table; every API call is scoped to
a slug and authorised against the caller's role in that workspace.

### Server (`server.js`)

- Schema: `workspaces.slug` (unique index `workspaces_slug_idx`), `workspaces.color`,
  `memberships.member_id`, `invites.workspace_id`. Added through `pragma table_info` guards so an
  existing database upgrades without a rebuild.
- `migrateTenancy()`: writes a `vacuum into` backup
  (`DATA_DIR/gr8r-premultitenant-<timestamp>.db`) before the first write, derives the slug from
  the old `data.ws.url` (falling back to the name), keeps the workspace colour, links member
  profiles to accounts via `userId` and `memberships.member_id`, moves invites onto their
  workspace, drops the demo `data.workspaces` array and nulls `data.me`. Idempotent.
- Helpers: `slugify`, `sanitizeSlug`, `uniqueSlug`, `wsBySlug`, `membershipsOf`, `membershipOf`,
  `requireWorkspace(req, res, slug, minRole)` (role rank `viewer < member < admin < owner`),
  `workspacePayload`, `userPayload`, `normalizeDoc`, `docForClient`, `docFromClient`.
- Endpoints: `GET/POST /api/workspaces`, `GET/PUT/PATCH /api/workspaces/:slug`,
  `POST /api/workspaces/:slug/invites`, `GET/POST /api/invites/:token[/accept]`. The old
  `/api/workspace` route is gone. `/api/config` adds `workspaceCreation`.
- Authorisation: unknown or unauthorised slug answers `404`; `viewer` cannot write; `member`
  cannot edit `data.members` or `data.plan`; `PATCH` (name/slug/colour) and invitations are
  `admin`+. `data.ws` is always derived from the row and `data.me` is per-account, so an old tab
  cannot clobber either.
- Accounts: `createUser()` only creates the account; `addMembership()` adds the document profile
  and the membership row. Bootstrap admin, invite accept and the CLI use it. `--add-user` takes an
  optional workspace slug.

### Client

- `src/core/api.js`: slug-scoped calls, `listWorkspaces`, `createWorkspace`, `loadWorkspace`,
  `patchWorkspace`, `createInvites` (scoped), `canCreateWorkspace`, `rolesIn`.
- `src/core/store.js`: `hydrateFromServer(slug)`, `flushPending()` before leaving a workspace,
  `me` from `api.memberId` (with a `userId` fallback), `workspaceList()`/`currentSlug()`/
  `roleLabel()`.
- `src/main.js`: boots on `/w/<slug>`, falls back to the first workspace,
  `history.replaceState` to the canonical URL, `applyDeepLink()` restores
  `project|task|file|member` links, and `S.ui.wantedSlug` survives a signed-out deep link.
- Switcher (sidebar popover + command palette) lists the real workspaces with the caller's role;
  `switchWs` flushes, loads and resets the route.
- Creation reuses the setup wizard (`A.onbFinish` creates the workspace through the API first,
  then the starter project inside it, then sends the invites); it is reachable only when the
  policy allows it.
- Settings: the workspace section is read-only for non-admins and the danger zone is hidden in
  server mode; the plan section is owner-only. Share links and the settings URL field use
  `/w/<slug>`.
- Onboarding shows the real `${api.host}/w/` prefix, and a new `no-workspace` screen explains an
  invite is needed when the policy forbids creating one.

## Verification

- `npm run lint`, `npm run format:check`, `npm run build` — green.
- Legacy database migrated in place (slug, colour, member ids, demo array removed, backup
  written) and a second boot changed nothing.
- Two accounts in two workspaces: neither receives the other's document; cross-workspace GET is
  `404`.
- `member` role: members/plan edits ignored, project writes accepted. `viewer`: `PUT 403`,
  `POST invites 403`.
- Browser UAT: sign-in lands on `/w/<slug>`, reload keeps it, switcher and palette agree,
  settings and members follow the role, signup wizard creates a real workspace, invite link
  renders "Join <workspace>" and joins the right one, deep links restore the project page.

## Deviations from PLAN.md

- **Creation UI**: instead of a small modal, "Create workspace" opens the existing setup wizard,
  which now creates the workspace through the API. Fewer new surfaces, same behaviour.
- **Demo switcher**: the fake `data.workspaces` array stays in the client seed so the
  browser-only demo (Vite dev without the server, static Vercel build) keeps working; the server
  strips it from every document it serves.
- **`A.delWorkspace`** is disabled with an info toast in server mode instead of deleting the
  workspace — deletion belongs to phase 2.
- **`/api/workspaces/:slug/invites`** arrived in this phase rather than phase 2, because a
  multi-workspace client cannot address the old unscoped `/api/invites`.

## Not in this phase

Private-project redaction (phase 3 — private projects are still a browser-side filter), member
removal and role changes, workspace rename/delete for members, real billing.
