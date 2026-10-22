# Gr8r Studio — project context

*Last updated: 2026-10-22 after starting milestone v1.2*

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

## Current Milestone: v1.2 Localization

**Goal:** the interface stops lying about languages — the selector becomes real, the app speaks
French, every user has their own locale — and the full app journey is covered by a browser test.

**Target features:**
- A dependency-free i18n layer: `t()` + JSON catalogues per locale, plurals, locale-aware dates
  and numbers, English as the base language.
- The whole interface translated into French (~600–900 keys). The language selector only offers
  what actually exists (EN, FR).
- The locale becomes a per-user preference (new column + migration) instead of a workspace
  preference.
- The 8 untested UI flows covered by Chromium: the onboarding wizard, the invite modal, the
  `/join` page, the share modal, member removal, the workspace switcher, the plan change and
  project creation.
- A regression test that proves the interface is in French when the locale is `fr`, and that no
  English string leaks.

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
- **The interface is English-only in practice.** `Settings → Language` offers six languages
  (`src/pages/settings.js:176`) but `prefs.lang` is only a stored value: no string is
  translated, and the preference lives in the *shared* workspace document, so it would change
  the language for every member.

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

## Decisions for milestone v1.2 (validated by the owner)

1. **The i18n layer is hand-made.** No runtime dependency: `t()` plus JSON catalogues, the
   English source strings as the base catalogue. The app has no framework and no runtime
   dependency, and adding one for translations would break that.
2. **French is the second language, and it is complete.** The selector only lists what really
   exists — English and French. The four other languages (Deutsch, Español, Français, 日本語
   are currently listed) disappear from the selector until they are genuinely translated.
3. **The locale is per user.** A French speaker in an English workspace keeps their own
   language. That needs a per-account column and a migration; the migration machinery exists
   and is proven by `test/migration.test.mjs`.

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

From the v1.1 audit (`.planning/milestones/v1.1-MILESTONE-AUDIT.md`) and this milestone's scope:

- [ ] The language selector changes the interface: a real `t()` layer, JSON catalogues, French
      translated end to end, EN and FR the only offered languages.
- [ ] The locale is a per-user preference, stored on the account and returned by the server,
      with a migration for existing installs.
- [ ] The remaining UI flows are covered by Chromium: the onboarding wizard, the invite modal,
      the `/join` page, the share modal, member removal, the workspace switcher and the plan
      change.
- [ ] Harden the membership surface: `sameOrigin` on invite accept, no admin link-only
      invites, no `firstWorkspace()` fallback, no guest-profile spoof.
- [ ] Write the browser URL on navigation and handle `popstate`; delete the orphaned client
      exports (`api.listWorkspaces`, `api.invites`, `wsPath`, `appUrl`, `appHost`) and either
      wire or remove the two routes that have no caller.
- [ ] Close the substring-based recent-search leak and state the free-text limitation in the
      product docs.
- [ ] Per-user settings isolation inside a workspace (`notifPrefs`, `tfa`, `sessions`,
      `invoices` are still shared fields in the document).

### Out of scope

- Real billing and plan enforcement (quotas, seats, storage, invoices). The plan stays a
  display value, but only an owner may change it.
- Subdomain tenancy, SSO/SAML, SCIM.
- File storage: files are metadata only today; no binary upload backend.
- Translating the four remaining languages (Deutsch, Español, 日本語, English UK). The selector
  will not offer a language that is not translated.
- A translation-management UI or machine-translation pipeline: the catalogues are files in the
  repository, edited like code.

## Context

- Shipped v1.1 with 4 phases, 7 plans, 10 tasks and 54 commits, on Node 24.
- 18.8k lines of JavaScript, CSS and ESM across `src/`, `server.js`, `test/` and `e2e/`; one
  runtime dependency-free server, one dev dependency (`@playwright/test`).
- 50 `node:test` cases and 6 Chromium e2e tests, all against real `server.js` processes and
  real SQLite databases — no mocked HTTP, no mocked database.
- The milestone audit (`.planning/milestones/v1.1-MILESTONE-AUDIT.md`) closed three defects in
  one family — the workspace revision moved without the client being able to follow it — so a
  role change, an invite accepted elsewhere and a restart each locked the workspace out of
  writing. All three are fixed, released in 1.1.1 and covered by server, client and browser
  tests.
- The interface is built from hand-written HTML template strings, so translating it is a
  mechanical extraction of ~1 800 string occurrences across 37 files rather than a JSX sweep.
- Known issues are tracked in `CHANGELOG.md` (limits) and `DEPLOY.md`.

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state
