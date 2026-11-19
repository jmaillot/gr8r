# Milestone v3.1 Requirements: Workspace Governance

**Goal:** Instance operators control who can create workspaces and can see and manage every
workspace on the instance — no shadow workspaces.

**Source:** owner conversation 2026-11-19 (post-v3.0 close).

## Standing Constraints (carried from v3.0, not re-litigated)

- Zero new dependencies
- New refusal keys land in all 5 locale catalogues (en/fr/nl/de/es) in the same commit as the
  first emitting gate
- Keyed refusal codes with per-locale catalogue strings; English message is the fallback
- Owner-scoped endpoints must not leak workspace existence to non-owners
- Boot logs the resolved configuration (D-11 style) so an operator can read the effective state

## Requirements

### Workspace creation gate (WSG)

- [ ] **WSG-01**: `WORKSPACE_CREATION` env parsed tri-state at boot: `open` (any authenticated
  user may create a workspace), `admins` (instance admins only), `owners` (instance owners
  only). Default when unset: `admins` (fail-closed relative to today's `open`). Empty/whitespace
  string = invalid, boot refuses to start or falls back to `admins` with a loud log — ratify
  exact semantics at discuss-phase. Invalid values never silently behave as `open`.
- [ ] **WSG-02**: `POST /api/workspaces` enforces the gate: `open` = any user; `admins` =
  instance admins; `owners` = instance owners only. Rejected users get a keyed, localized
  refusal (never a generic error). The `ALLOW_SIGNUP`-derived implicit coupling
  (server.js:6811) is replaced — `ALLOW_SIGNUP` keeps governing **account** signup only.
- [ ] **WSG-03**: The resolved mode is exposed via `/api/config` (`workspaceCreation`:
  `open|admins|owners`) and logged at boot alongside the existing door-matrix log so an
  operator can read the effective state from the log.
- [ ] **WSG-04**: The creator still becomes the workspace `owner` in every allowed mode;
  promoting members to workspace `admin` happens afterward via the existing member-management
  UI (optional, not enforced at creation).

### Instance owner identity (WSG)

- [ ] **WSG-05**: Instance owners are seeded from bootstrap admins (the first admin created at
  DB bootstrap + accounts created via `--add-user`). The identity persists in the database
  (no re-derivation drift) and survives restarts.
- [ ] **WSG-06**: Instance owners can promote/demote other instance owners from the management
  UI — no server-side env edit needed to change who holds instance-owner rights. Demoting the
  last instance owner is refused (keyed error, same pattern as `needOwner`).

### Workspace management page (WSG)

- [ ] **WSG-07**: A new owner-scoped page lists ALL workspaces on the instance — name, slug,
  member count, creator, created date — with workspace-existence invisible to non-owners
  (the listing endpoint is owner-scoped; non-owners get an empty/forbidden payload, never a
  partial leak).
- [ ] **WSG-08**: From the same page, instance owners can manage workspaces they didn't
  create: delete or archive empty/shadow workspaces and reassign (or release) orphaned
  members. Destructive actions require confirmation and are audit-logged.
- [ ] **WSG-09**: The page includes instance-owner management (WSG-06) — one governance
  surface, owner-scoped.

### Client behavior (WSG)

- [ ] **WSG-10**: When workspace creation is closed for the current user (mode `admins`/`owners`
  and the user lacks the role), the create-workspace surface is hidden and the post-signup
  flow lands on an **"await access" page stating they need to be invited to a workspace to get
  access** — no creation form, no creation redirect. Users WITH rights keep the existing flow.
- [ ] **WSG-11**: Every user-facing refusal added by this milestone is keyed and present in all
  5 locale catalogues (en/fr/nl/de/es) in the same commit as the gate that emits it.

## Out of Scope (this milestone)

- Workspace settings editing (name/slug rename by instance owners) — deferred unless trivial
  once WSG-07/08 exist; ratify at discuss-phase
- Per-workspace creation quotas or approval workflows
- Changes to the domain admission doors (v3.0) — orthogonal, untouched

## Future Requirements

- Workspace settings editing from the governance page
- Approval queue: users request a workspace, owner approves
