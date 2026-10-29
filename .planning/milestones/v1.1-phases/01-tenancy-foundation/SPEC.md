# Phase 1 — Tenancy foundation

Status: **draft, awaiting validation**

## Goal

Make a workspace a real tenant. One workspace row owns one document; an account can hold one
membership per workspace; every document request is scoped and authorised by slug; the client
addresses workspaces with `/w/:slug` and the switcher lists real workspaces.

## Non-goals (later phases)

- Invitations scoped to a workspace and accept-by-existing-account → phase 2.
- Role/member management endpoints and the members-page rewrite → phase 2.
- Workspace delete/leave, rename/slug change UI → phase 2.
- Private-project redaction and merge → phase 3.
- Automated tests/CI/docs → phase 4 (phase 1 is verified manually).

## Data model

### Schema changes (additive, idempotent)

```sql
alter table workspaces  add column slug text;      -- unique, not null by convention
alter table workspaces  add column color text;     -- workspace icon colour, was doc.data.ws.c
alter table memberships add column member_id text; -- id of this user's profile in the doc
alter table invites     add column workspace_id text;
create unique index if not exists workspaces_slug_idx on workspaces(slug);
```

`users.member_id` stays for phase 1 as a rollback aid but is no longer read. `invites.workspace_id`
is backfilled to the default workspace; `memberships.member_id` is backfilled from
`users.member_id`, then from `doc.data.members` matched by email, then by creating a profile.

### Workspace document contract

The document keeps its shape, with these server-enforced rules:

- `data.ws` is **derived from columns** on read: `{ name, url: slug, c: color, brand: true }`.
  Incoming `data.ws` is ignored on write.
- `data.workspaces` (the fake switcher array) is **removed** by the migration and never returned.
- `data.me` is **per-user**: cleared on read; the client sets it from the membership's
  `memberId`. Incoming `data.me` is ignored on write.
- `data.members[].userId` links a profile to an account. The migration backfills it by email;
  profiles without a matching membership are dropped from the served document.
- `data.plan` is owner-writable only (display-only until real billing).
- `doc.prefs` / `doc.views` remain workspace-level shared state (not per-user) for now.

### Migration of an existing install

1. Write a pre-migration backup next to the database
   (`projects-premultitenant-<iso>.db`) and log the path.
2. Add columns/index if missing (`pragma table_info` guards).
3. For the single existing row:
   - `slug` ← sanitised `doc.data.ws.url`, else `slugify(doc.data.ws.name)`, else `workspace`;
     deduplicated against existing rows.
   - `name` ← `doc.data.ws.name` when present, else the existing column.
   - `color` ← `doc.data.ws.c`, else `#1D1C1A`.
4. Backfill `memberships.member_id` and `data.members[].userId` (see above).
5. Rewrite the document: drop `data.workspaces`, set `data.me = null`, keep everything else.
   No `data.projects`/`tasks`/… is touched.
6. Backfill `invites.workspace_id`.

Idempotent: a second boot finds columns, slugs and member ids already set and changes nothing.

## API

All routes below require a session unless stated. Unauthorised workspace access returns **404**
(not 403) so slugs cannot be probed.

| Method | Route                   | Who            | Body / result                                                         |
| ------ | ----------------------- | -------------- | --------------------------------------------------------------------- |
| GET    | `/api/config`           | public         | adds `workspaceCreation: 'open' \| 'admins'`                          |
| GET    | `/api/auth/me`          | public         | `{ user: { id, email, name, workspaces: [ws] } \| null }`             |
| POST   | `/api/auth/login`       | public         | same user shape, `workspaces` included                                |
| POST   | `/api/auth/signup`      | `ALLOW_SIGNUP` | creates the **account only**, returns zero or more workspaces         |
| GET    | `/api/workspaces`       | session        | `{ workspaces: [ws] }`                                                |
| POST   | `/api/workspaces`       | see policy     | `{ name, slug? }` → `201 { workspace: ws }`                           |
| GET    | `/api/workspaces/:slug` | any member     | `{ id, name, slug, color, role, memberId, revision, updatedAt, doc }` |
| PUT    | `/api/workspaces/:slug` | member+        | `{ revision, doc }` → `{ revision, updatedAt }`; `viewer` → 403       |
| PATCH  | `/api/workspaces/:slug` | admin+         | `{ name?, slug?, color? }` → `{ workspace: ws }`                      |

`ws = { id, name, slug, color, role, memberId }`.

Creation policy:

- `ALLOW_SIGNUP=true` → any signed-in user.
- `ALLOW_SIGNUP=false` → only a user who is `owner` or `admin` of at least one workspace.
- The creator becomes `owner`; a member profile is created in the new document.

Document write guards (phase 1, before dedicated endpoints exist):

- `role = member` → stored `data.members`, `data.ws` and `data.plan` win over the incoming
  values; content collections are accepted.
- `role = admin` → may edit `data.members`; `data.plan` is preserved (owner-only).
- `role = owner` → may edit `data.members` and `data.plan`.
- Always ignored: `data.me`, `data.workspaces`, `data.ws` (column-derived).

Slug rules: lowercase `[a-z0-9]`, single hyphens, 2–40 chars, no leading/trailing hyphen.
Reserved: `api`, `w`, `join`, `assets`, `static`, `health`, `login`, `signup`, `onboarding`,
`settings`, `favicon.ico`. Collision → `409` with a suggested available slug.

## Client

- `src/core/api.js`
  - `api.user.workspaces`, `api.workspace` (current), `api.memberId`.
  - methods: `listWorkspaces()`, `createWorkspace(name, slug)`, `loadWorkspace(slug)`,
    `putWorkspace(slug, doc)`, `patchWorkspace(slug, patch)`.
  - `api.revision` belongs to the currently loaded workspace; it resets on switch.
- `src/core/store.js`
  - `applyDoc` uses the current workspace's `memberId` (not `api.user.memberId`).
  - export `flushPending()` so a switch waits for the last save.
  - remove `data.workspaces` reads.
- `src/main.js`
  - parse `^/w/([a-z0-9-]+)`; unknown slug → first workspace, else workspace chooser.
  - signed out → login; after login continue into the requested slug.
  - `/join/:token` unchanged in phase 1.
  - zero workspaces → "Create a workspace" screen when creation is allowed, otherwise
    "Ask an admin for an invitation".
- `src/overlays/popovers.js`, `src/overlays/palette.js`
  - render `api.user.workspaces`; check mark on the current slug.
- `src/actions/actions.js`
  - `switchWs` → flush, `loadWorkspace`, `history.pushState`, `go('home')`.
  - `newWorkspace` → modal (name + slug preview) → `POST` → switch.
  - `onbFinish` → create the workspace through the API, then the project inside it.
  - `saveWorkspace` → `PATCH`; share links become `${api.url}/w/${slug}/${path}`.
- `src/pages/settings.js`, `src/pages/auth.js`
  - URL prefix `${api.host}/w/`; onboarding availability message reflects the real slug rules.

## Edge cases

- `api.enabled === false` (Vite dev without the server, static hosting): unchanged local demo
  mode; no switcher entries, no crashes.
- A user with a valid session but zero memberships sees the chooser, never an empty document.
- Switching while a save is pending flushes first; a 409 conflict keeps the user on the
  current workspace and shows the existing conflict toast.
- `WORKSPACE_NAME` still seeds a fresh install; a new `WORKSPACE_SLUG` env sets its slug.
- `/w/<slug>` and `/w/<slug>/anything` both serve `index.html` through the existing SPA fallback.
- The `--add-user` CLI takes an optional workspace slug (defaults to the first) and creates the
  membership, profile and `member_id`.

## Acceptance criteria

1. Copy of the production database boots, logs a backup path, keeps every project/task/user,
   and the old document becomes workspace #1 with a slug.
2. After migration, `data.workspaces` is gone, `data.me` is null on read, and two different
   accounts get their own `me`.
3. Admin creates "Acme" (`/w/acme`); `GET` on the two slugs returns two unrelated documents.
4. An account that is only a member of Acme gets `404` on the default workspace's
   `GET` and `PUT`, and `/w/default` does not render Acme data.
5. A `viewer` can read but `PUT` returns 403; a `member` gets 403 on `PATCH` of the workspace.
6. Switching workspaces in the UI loads the right document, updates the URL to `/w/<slug>`,
   and survives a refresh.
7. Copied task/project links contain `/w/<slug>/...`.
8. Two accounts editing the same workspace still sync through the revision counter (409 on
   stale writes), exactly as today.
9. `npm run lint`, `npm run format:check` and `npm run build` pass.
