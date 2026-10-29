# PLAN — Phase 1: Tenancy foundation

Reference: `SPEC.md` in this directory. Execute tasks in order; each task ends with its own
verification and one atomic commit.

## T1 — Schema and in-place migration

Files: `server.js`

- Add `workspaces.slug`, `workspaces.color`, `memberships.member_id`, `invites.workspace_id`
  through idempotent `pragma table_info` guards; create `workspaces_slug_idx`.
- Add `slugify()`, `uniqueSlug()`, `sanitizeSlug()` next to the workspace helpers.
- Add `migrateTenancy()` called from `bootstrap()` before `ensureAdmin()`:
  backup (`vacuum into`), derive slug/name/colour, backfill member ids and `userId`, drop
  `data.workspaces`, null `data.me`, backfill invite workspace ids, bump the revision once.
- Keep `users.member_id` untouched for rollback; stop reading it.
- `ensureWorkspace()` writes slug/colour for a fresh install, using `WORKSPACE_SLUG` or
  `slugify(WORKSPACE_NAME)`.

Verify: on a copy of a real DB, boot once and inspect `pragma table_info`, `select id, slug,
name, color from workspaces`, `select workspace_id, member_id from memberships`, and the
document JSON. Boot twice and confirm nothing changes the second time.

## T2 — Tenancy helpers and workspace-scoped API

Files: `server.js`

- Helpers: `wsBySlug()`, `membershipsOf(userId)`, `membershipOf(wsId, userId)`,
  `requireMembership(req, res, slug, minRole)` with role ranking
  `viewer < member < admin < owner`, `workspacePayload(ws, membership)`,
  `docForResponse(ws, doc)`, `docFromRequest(ws, membership, incoming)`.
- Endpoints per the SPEC table: list, create, get, put, patch. Remove the old
  `/api/workspace` GET/PUT routes (client ships in the same image).
- Auth payloads (`me`, login, signup) return `workspaces`.
- `/api/config` returns `workspaceCreation`.
- `createUser()` no longer inserts a membership; add `addMembership(wsId, userId, role)`
  that creates the document profile and stores `member_id`. Update bootstrap admin, signup,
  invite accept (`--add-user` CLI included).
- Enforce write guards on `data.me`, `data.workspaces`, `data.ws`, `data.members`, `data.plan`
  according to role.

Verify: `curl` matrix — owner/admin/member/viewer against GET/PUT/PATCH, cross-workspace
attempts returning 404, slug collision 409, creation policy with each `ALLOW_SIGNUP` value.

## T3 — API client and store

Files: `src/core/api.js`, `src/core/store.js`

- Replace `workspace()` / `putWorkspace()` with slug-scoped calls; add `listWorkspaces`,
  `createWorkspace`, `loadWorkspace`, `patchWorkspace`.
- Track `workspaces`, `workspace` (current), `memberId`; reset `revision` on switch.
- `applyDoc` reads `api.memberId`; remove the `data.me` round-trip from `docSnapshot` if the
  server ignores it anyway (keep it harmless).
- Export `flushPending()` from the store for switching.

Verify: build passes; boot with the server shows the correct `me` per account.

## T4 — Boot and `/w/:slug` routing

Files: `src/main.js`, `src/shell/render.js` (only if route helpers need a slug hook)

- Parse the slug from `location.pathname`; resolve it against `api.user.workspaces`.
- Unknown/unauthorised → first workspace + `history.replaceState`; zero workspaces →
  chooser screen.
- Load the document for the slug; keep `/join/:token` behaviour.
- Make sure an in-app refresh on `/w/:slug` boots into that workspace.
- `go()` stays hash-free; deep links remain informational except the slug.

Verify: direct load of `/w/<slug>`, refresh, unknown slug, signed-out then login, join link.

## T5 — Switcher, creation, settings and share links

Files: `src/overlays/popovers.js`, `src/overlays/palette.js`, `src/actions/actions.js`,
`src/pages/settings.js`, `src/pages/auth.js`, `src/data/seed.js` (remove the demo array)

- Sidebar and palette list real workspaces; current slug checked; hidden when there is one.
- `switchWs`: flush → load → pushState → reset route to home.
- `newWorkspace`: small modal (name, slug preview, validation, 409 handling) → create → switch.
  Entry point visible only when `api.workspaceCreation` allows it.
- `onbFinish`: create the workspace via API first, then the starter project inside the loaded
  document; onboarding step 1 shows the real URL prefix.
- `saveWorkspace`: `PATCH` name/slug/colour; slug change confirmed (links break).
- Share links: `${api.url}/w/${slug}/${path}`.
- Settings URL field prefix `${api.host}/w/`.
- Delete the fake `data.workspaces` from seed/empty documents when they no longer render.

Verify: browser run — create a second workspace, switch, refresh, check every copy-link
surface, rename in Settings, confirm the sidebar and palette stay in sync.

## T6 — Docs and environment

Files: `.env.example`, `DEPLOY.md`, `README.md`

- Document `WORKSPACE_SLUG`, the creation policy tied to `ALLOW_SIGNUP`, `/w/:slug`, the
  migration backup, and how to roll back (restore the backup file, previous image).
- Note the remaining phase-2/3 limitations so operators are not surprised (invites still
  workspace-bound but shared by email flow, private projects UI-only until phase 3).

Verify: `format:check`.

## T7 — Verification and commits

- `npm run lint`, `npm run format:check`, `npm run build`.
- Manual acceptance list from `SPEC.md`, on a copy of a seeded database and on a fresh volume.
- Two-account UAT in Playwright: isolation, viewer read-only, member PATCH 403, switch/refresh.
- Commit per task (T1…T6), conventional messages in the repo's existing style.

## Risks and mitigations

| Risk                                                      | Mitigation                                                                                                   |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Migration corrupts a live document                        | Automatic `vacuum into` backup before any write; migration is idempotent; verify on a copy first.            |
| A stale client with the old bundle calls `/api/workspace` | Old route removed; the container serves the new bundle from the same image. A cached tab recovers on reload. |
| Member edits to `members`/`plan` silently dropped         | Phase 1 only; phase 2 moves them to explicit endpoints with clear 403s.                                      |
| Slug change breaks shared links                           | Confirmation copy in Settings; phase 2 adds the warning + optional redirect table.                           |
| `me` still written by an old tab                          | Server always drops incoming `data.me`; read path rewrites it per account.                                   |
| Document-level merge surprises in phase 3                 | Out of scope here; phase 3 gets its own spec and a test matrix.                                              |

## Rollback

1. Stop the container.
2. Restore the pre-migration backup (`projects-premultitenant-*.db`) over `projects.db`.
3. Redeploy the previous image tag.
   The additive columns are ignored by the old code, so a restore is only needed if the document
   migration must be undone.
