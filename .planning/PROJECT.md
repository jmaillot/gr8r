# Gr8r Studio — project context

## What it is

A self-hosted project-management workspace: dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity, settings.

- Frontend: plain ES modules + CSS, bundled by Vite. No UI framework, no runtime dependency.
- Backend: `server.js`, Node's built-in `node:sqlite`, opaque session cookies, scrypt passwords.
- Deploy: single Docker image behind Traefik (see `DEPLOY.md`), data in `/data/gr8r.db`.
- Seed/demo data in `src/data/seed.js`; the server seeds a new database from it unless
  `SEED_DATA=false`.

## Architecture facts that matter for tenancy

- **One workspace per installation.** `server.js` hardcodes `WS_ID = 'ws_default'` and
  `ensureWorkspace()` creates exactly one row. There is no API to create another.
- **The workspace is one JSON document.** `workspaces.doc` holds `data` (members, projects,
  tasks, comments, activity, notifs, files, events, savedViews…) plus UI `prefs` and `views`.
  The client loads it whole and saves it whole through `PUT /api/workspace`, guarded by a
  revision counter (409 on conflict).
- **Membership is per account.** `memberships(workspace_id, user_id, role)` exists with a
  composite primary key, but every account is inserted against `WS_ID`. Roles are
  `owner | admin | member | viewer`.
- **The UI's "workspaces" are fake.** `data.workspaces` is a demo array inside the shared
  document; switching rewrites `data.ws` (name, url, colour). Nothing is scoped.
- **Roles are only partly enforced.** The API blocks `viewer` writes and non-admin invites;
  everything else (roles, settings, membership) is UI-only.
- **`data.me` is shared.** It lives in the document, so it is one value for every user. The
  server already returns `users.member_id` to let `applyDoc` fix it locally
  (`src/core/store.js:178`), but the column is single-valued per account.
- **Private projects are UI-only.** `p.private` + `p.members` are filtered in `canSee()`;
  the data is still in the document sent to every member.
- **Plans are cosmetic.** `data.plan` drives pricing copy; no limit is enforced anywhere.
- **Routing is in-memory.** App routes live in `S.ui.route`; only `/join/:token` is parsed
  from `location.pathname`. The server already has an SPA fallback for extension-less paths.

## Decisions for the multitenant milestone (validated by the owner)

1. **Many workspaces per user.** An account can be a member of N workspaces with a different
   role in each; the sidebar switcher becomes real.
2. **Creation is flag-driven.** `ALLOW_SIGNUP=true` → any signed-in user may create a
   workspace (and a new signup lands in the workspace-creation flow). `ALLOW_SIGNUP=false` →
   only a user who is `owner`/`admin` of at least one workspace may create one; everyone else
   joins by invitation.
3. **Slug in the path.** `/w/:slug/...`, single domain, no wildcard DNS/TLS. The workspace
   URL shown in Settings becomes real.
4. **Strict isolation.** Roles are checked server-side per workspace, and private projects
   are redacted server-side — not merely hidden in the UI.
5. **Migrate in place.** The existing database becomes the first workspace: name, colour and
   slug derived from `data.ws`; accounts, roles and memberships preserved.

## Out of scope for this milestone

- Real billing and plan enforcement (quotas, seats, storage, invoices). The plan stays a
  display value, but only an owner may change it.
- Subdomain tenancy, SSO/SAML, SCIM.
- Per-user settings isolation inside a workspace (`notifPrefs`, `tfa`, `sessions`,
  `invoices` are still shared fields in the document). Tracked as a follow-up.
- File storage: files are metadata only today; no binary upload backend.
