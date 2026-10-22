# Gr8r Studio — project context

*Last updated: 2026-10-22 after the v1.1 Multitenant milestone*

## What it is

A self-hosted project-management workspace: dashboard, inbox, my tasks, projects with
board / list / table / calendar / timeline / files views, members, teams, activity, settings.

- Frontend: plain ES modules + CSS, bundled by Vite. No UI framework, no runtime dependency.
- Backend: `server.js`, Node's built-in `node:sqlite`, opaque session cookies, scrypt passwords.
- Deploy: single Docker image behind Traefik (see `DEPLOY.md`), data in `/data/gr8r.db`.
- Seed/demo data in `src/data/seed.js`; the server seeds a new database from it unless
  `SEED_DATA=false`.
- **Multi-tenant since v1.1**: a workspace is a real tenant with its own URL, document and
  membership list. An account can belong to several workspaces with a role in each.

## Current state (v1.1 shipped)

- **A workspace is a row.** `workspaces(id, slug unique, name, color, doc, revision)` — one JSON
  document per workspace. `memberships(workspace_id, user_id, role)` is the single source of
  truth for access; `invites(workspace_id, …)` holds workspace-scoped invitations.
- **Every call is slug-scoped and authorised.** `requireWorkspace(req, res, slug, minRole)`
  resolves the slug, looks up the caller's membership and enforces `viewer < member < admin <
  owner`. An unknown or unauthorised slug answers `404`, so there is no existence oracle.
- **The document is redacted on read and merged on write.** `redactDoc()` removes a private
  project and every row that references it; `mergeClientDoc()` restores hidden rows from
  storage so a redacted document cannot delete or rewrite what it cannot see. Access fields
  (`private`, `members`, `perms`, `lead`) are restored unless the caller is an owner, an admin
  or the project lead.
- **Optimistic concurrency.** The row carries a `revision`; `PUT /api/workspaces/:slug` answers
  `409` on a mismatch. Every endpoint that edits the document reports the new revision, and the
  client adopts it.
- **The demo is honestly single-workspace.** The seed has no `data.workspaces` array; the demo
  list is derived from the current `ws` object, and the switcher, create path and palette
  command only exist in server mode.
- **Migration is in place and lossless.** `migrateTenancy()` writes a `vacuum into` backup
  before the first write, derives the slug from the old document, links members and invites,
  drops the demo array and retires `data.me`. A second boot is a byte-identical no-op.

## Decisions for the multitenant milestone (validated by the owner)

1. **Many workspaces per user.** An account can be a member of N workspaces with a different
   role in each; the sidebar switcher lists the account's real workspaces. — shipped
2. **Creation is flag-driven.** `ALLOW_SIGNUP=true` → any signed-in user may create a
   workspace; `ALLOW_SIGNUP=false` → only a user who is `owner`/`admin` of at least one
   workspace may create one; everyone else joins by invitation. — shipped
3. **Slug in the path.** `/w/:slug/...`, single domain, no wildcard DNS/TLS. The workspace
   URL shown in Settings became real. — shipped
4. **Strict isolation.** Roles are checked server-side per workspace, and private projects
   are redacted server-side — not merely hidden in the UI. — shipped
5. **Migrate in place.** The existing database became the first workspace: name, colour and
   slug derived from `data.ws`; accounts, roles and memberships preserved. — shipped

## Requirements

### Validated

- ✓ R1 — A workspace is a row in `workspaces` with a unique slug and its own document — v1.1
- ✓ R2 — An account can hold several memberships with a role per workspace — v1.1
- ✓ R3 — `/w/:slug` addresses a workspace; all share/invite links are workspace-scoped — v1.1
- ✓ R4 — Every API call is authorised against the caller's membership of that workspace — v1.1
- ✓ R5 — Private projects are never sent to non-members and cannot be modified by them — v1.1
- ✓ R6 — Existing installs migrate in place, without data loss, with a pre-migration backup — v1.1
- ✓ R7 — Creation is flag-driven (`ALLOW_SIGNUP`), invitations are workspace-scoped, and an
  existing account can accept an invite — v1.1
- ✓ R8 — Lint, format, build and the new server tests pass in CI — v1.1

### Active

Carried forward from the v1.1 audit (`.planning/milestones/v1.1-ROADMAP.md`):

- [ ] Harden the membership surface: `sameOrigin` on invite accept, no admin link-only
      invites, no `firstWorkspace()` fallback, no guest-profile spoof.
- [ ] Write the browser URL on navigation and handle `popstate`; delete the orphaned client
      exports (`api.listWorkspaces`, `api.invites`, `wsPath`, `appUrl`, `appHost`) and either
      wire or remove the two routes that have no caller.
- [ ] Close the substring-based recent-search leak and state the free-text limitation in the
      product docs.
- [ ] Cover the remaining UI flows in Chromium: the onboarding wizard, the invite modal, the
      `/join` page, the share modal, member removal, the workspace switcher and the plan change.
- [ ] Per-user settings isolation inside a workspace (`notifPrefs`, `tfa`, `sessions`,
      `invoices` are still shared fields in the document).

### Out of scope

- Real billing and plan enforcement (quotas, seats, storage, invoices). The plan stays a
  display value, but only an owner may change it.
- Subdomain tenancy, SSO/SAML, SCIM.
- File storage: files are metadata only today; no binary upload backend.

## Context

- Shipped v1.1 with 4 phases, 7 plans, 10 tasks and 52 commits, on Node 24.
- 18.8k lines of JavaScript, CSS and ESM across `src/`, `server.js`, `test/` and `e2e/`; one
  runtime dependency-free server, one dev dependency (`@playwright/test`).
- 48 `node:test` cases and 5 Chromium e2e tests, all against real `server.js` processes and
  real SQLite databases — no mocked HTTP, no mocked database.
- The milestone audit (`.planning/milestones/v1.1-MILESTONE-AUDIT.md`) closed one blocker:
  the phase-1 revision handshake was broken by the phase-2 document-mutating endpoints, so a
  role change locked the workspace out of writing. It is fixed and covered by server, client
  and browser tests.
- Known issues are tracked in `CHANGELOG.md` (limits) and `DEPLOY.md`.
