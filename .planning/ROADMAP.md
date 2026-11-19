# Roadmap: Projects Studio (gr8r)

## Milestones

- ✅ **v3.0 Access Control & Hardening** - Phases 75-77 (shipped 2026-11-19) → [milestones/v3.0-ROADMAP.md](milestones/v3.0-ROADMAP.md)
- 🚧 **v3.1 Workspace Governance** - Phases 78-79

## v3.1 — Workspace Governance

**Milestone Goal:** Instance operators control who can create workspaces and can see and
manage every workspace on the instance — no shadow workspaces.

**Standing constraints & decisions (not re-litigated):** zero new dependencies; tri-state
env parse mirroring the Phase 75/76 pattern (boot-frozen consts, `null` = unset, boot log);
keyed refusals with 5-locale catalogues (en/fr/nl/de/es) landing in the same commit as the
first emitting gate; owner-scoped endpoints must not leak workspace existence to non-owners
(unknown/unauthorised = empty/forbidden payload, never a partial leak); destructive actions
confirmed + audit-logged; demoting the last instance owner is refused (keyed, same pattern
as `needOwner`).

**Codebase facts (verified at planning):** `POST /api/workspaces` gate at server.js:6807-6832
currently couples to `ALLOW_SIGNUP` (`if (!ALLOW_SIGNUP && !(await hasAdminRole(user.id)))`) —
WSG-02 replaces this coupling; `ALLOW_SIGNUP` keeps governing account signup only.
`hasAdminRole` (server.js:948) = any owner/admin membership in ANY workspace.
`createWorkspace` (server.js:4640) makes creator `owner`. `/api/config`
(server.js:5015-5025) already exposes `workspaceCreation` derived from `ALLOW_SIGNUP` —
replaced by the resolved tri-state mode. `GET /api/workspaces` (server.js:6801) returns only
the caller's memberships — no all-workspaces listing exists yet. Bootstrap admin creation at
server.js:3496; `--add-user` CLI also creates accounts (WSG-05 seeding sources). Phase 60
built the power-admin four-panel dashboard — the governance page slots into that admin area
(shape verified at discuss-phase). Client surfaces: `src/actions/actions.js:3201`
(`A.newWorkspace`), `src/overlays/popovers.js:262` (create-workspace popover); `/api/config`
already reaches the client.

**Ratify at discuss-phase:** exact semantics for invalid `WORKSPACE_CREATION` values
(boot-refuse vs fallback-to-`admins`-with-loud-log); whether workspace settings editing
(name/slug rename by instance owners) rides along as trivial once the governance page exists.

## Phases

**Phase Numbering:**
- Integer phases (78, 79): planned milestone work (continuous numbering from v3.0's Phase 77)
- Decimal phases (78.1, …): urgent insertions (marked INSERTED)

- [ ] **Phase 78: Creation Gate & Instance-Owner Identity** - Tri-state `WORKSPACE_CREATION` env, POST gate replacing the ALLOW_SIGNUP coupling, boot log, /api/config, client create-button gating + "await access" page
- [ ] **Phase 79: Governance Surface** - Owner-scoped all-workspaces listing + management page (delete/archive, member reassignment) with instance-owner promote/demote

## Phase Details

### Phase 78: Creation Gate & Instance-Owner Identity

**Goal**: Workspace creation is decided by one explicit, boot-logged, operator-readable
gate (`WORKSPACE_CREATION=open|admins|owners`) — decoupled from `ALLOW_SIGNUP` — backed by
a persistent instance-owner identity seeded from bootstrap admins, and users without
creation rights see an honest "await access" experience instead of a creation surface.
**Depends on**: Nothing (first phase of v3.1; foundation for Phase 79)
**Requirements**: WSG-01, WSG-02, WSG-03, WSG-04, WSG-05, WSG-10, WSG-11
**Success Criteria** (what must be TRUE):
  1. `WORKSPACE_CREATION` is parsed tri-state at boot — `open`/`admins`/`owners` with
     `admins` as the unset default; an invalid value never silently behaves as `open`
     (the discuss-phase-ratified semantics apply, loudly logged either way); an operator can
     read the resolved mode at boot alongside the D-11 door-matrix log, and `/api/config`
     exposes the resolved `workspaceCreation` value (no longer derived from `ALLOW_SIGNUP`).
  2. `POST /api/workspaces` enforces the resolved mode: any authenticated user in `open`;
     instance admins in `admins`; instance owners only in `owners`. A refused user gets a
     keyed, localized refusal (never a generic error), and the old
     `ALLOW_SIGNUP`-derived coupling at server.js:6807 is gone — setting `ALLOW_SIGNUP=true`
     no longer grants workspace creation in `admins`/`owners` mode, and `ALLOW_SIGNUP`
     still governs account signup exactly as before.
  3. In every allowed mode, the creator still becomes the workspace `owner` (server.js:4640
     behavior unchanged); promoting members to workspace `admin` happens afterward through
     the existing member-management UI.
  4. Instance owners are seeded from bootstrap admins — the first admin created at DB
     bootstrap (server.js:3496) and accounts created via `--add-user` — persisted in the
     database (no re-derivation drift), and the identity survives a server restart intact.
  5. When creation is closed for the current user (mode `admins`/`owners`, user lacks the
     role), the create-workspace surface (popover at popovers.js:262, `A.newWorkspace`
     action) is hidden — the create button follows `/api/config`'s `workspaceCreation` +
     the user's instance role — and the post-signup flow lands on an "await access" page
     stating they need to be invited to a workspace to get access: no creation form, no
     creation redirect. Users WITH rights keep the existing flow unchanged.
  6. Every refusal key introduced by this phase exists in all 5 locale catalogues
     (en/fr/nl/de/es) in the same commit as the gate that emits it; the parity gate is green.
**Plans**: TBD
**UI hint**: yes

### Phase 79: Governance Surface

**Goal**: Instance owners see and manage every workspace on the instance from one
owner-scoped governance page — listing, deletion/archival of empty or shadow workspaces,
orphaned-member reassignment, and instance-owner promote/demote — with no existence leak to
non-owners and no env edit needed to change who holds instance-owner rights.
**Depends on**: Phase 78 (instance-owner identity must exist and be persisted; the resolved
gate and boot log define who reaches the page; `/api/config` carries the mode)
**Requirements**: WSG-06, WSG-07, WSG-08, WSG-09
**Success Criteria** (what must be TRUE):
  1. An instance owner opening the governance page (slotted into the Phase 60 power-admin
     admin area) sees ALL workspaces on the instance — name, slug, member count, creator,
     created date — including workspaces they are not a member of (no shadow workspace
     escapes the list); the listing endpoint is owner-scoped and non-owners get an
     empty/forbidden payload — never a partial leak and never a workspace-existence oracle.
  2. From the same page, an instance owner can delete or archive an empty/shadow workspace
     they didn't create: the action requires an explicit confirmation, is audit-logged, and
     afterwards the workspace is gone (or archived) from the listing and unreachable via its
     slug.
  3. Orphaned members of a deleted/archived workspace can be reassigned (or released) by the
     instance owner through the same page — no member is left stranded without an honest,
     visible disposition.
  4. Instance owners can promote and demote other instance owners from the governance page
     (WSG-06's management UI): the change takes effect immediately, no server-side env edit
     or restart needed, and demoting the last instance owner is refused with a keyed error
     (same pattern as `needOwner`), localized in all 5 catalogues.
  5. Destructive actions (delete/archive, member release, owner demotion where permitted)
     are all confirmation-gated and appear in the audit trail; every new refusal key ships
     in all 5 locale catalogues in the same commit as the endpoint that emits it.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 78 → 79

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 78. Creation Gate & Instance-Owner Identity | 0/? | Not started | - |
| 79. Governance Surface | 0/? | Not started | - |
