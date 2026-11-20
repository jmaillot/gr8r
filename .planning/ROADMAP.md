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

- [x] **Phase 78: Creation Gate & Instance-Owner Identity** - Boolean `WORKSPACE_CREATION=true|false` (boot-refuse on invalid, unset=false), POST gate via isInstanceAdmin, boot log, /api/config, operator console promote/demote + last-operator guard, client create-button gating + "await access" auto-poll page *(complete — 78-01 server + 78-02 client; WSG-06/10/11 delivered)*
- [ ] **Phase 79: Governance Surface** - Operator-scoped all-workspaces listing + management page (delete/archive, member reassignment); operator promote/demote lives in the Phase 78 console, linked or relocated here

## Phase Details

### Phase 78: Creation Gate & Instance-Owner Identity

**Goal**: Workspace creation is decided by one explicit, boot-logged, operator-readable
gate (`WORKSPACE_CREATION=true|false`) — decoupled from `ALLOW_SIGNUP` — backed by a
persistent multi-operator instance identity (the `users.is_instance_admin` flag, manageable
in the operator console), and users without creation rights see an honest "await access"
experience instead of a creation surface.
**Depends on**: Nothing (first phase of v3.1; foundation for Phase 79)
**Requirements**: WSG-01, WSG-02, WSG-03, WSG-04, WSG-05, WSG-06, WSG-10, WSG-11
**Success Criteria** (what must be TRUE):
  1. `WORKSPACE_CREATION` is parsed boolean at boot — only the exact tokens `true`/`false`
     accepted; anything else (typo, empty, whitespace, other casing) **refuses to boot** with
     an error naming the variable and valid values; unset defaults to `false` (fail-closed);
     the resolved value + effective meaning is logged at boot alongside the D-11 door-matrix
     log, and `/api/config` exposes the boolean (no longer derived from `ALLOW_SIGNUP`).
     (D-78-1 — owner collapsed the roadmap's original tri-state.)
  2. `POST /api/workspaces` enforces the gate: any authenticated user when `true`; instance
     operators only (`isInstanceAdmin`, server.js:4838 — workspace roles never pass, D-112)
     when `false`. A refused user gets a keyed, localized refusal (never a generic error),
     and the old `ALLOW_SIGNUP`-derived coupling at server.js:6811 is gone — setting
     `ALLOW_SIGNUP=true` no longer grants workspace creation when the gate is closed, and
     `ALLOW_SIGNUP` still governs account signup exactly as before.
  3. In both modes the creator still becomes the workspace `owner` (server.js:4640 behavior
     unchanged); promoting members to workspace `admin` happens afterward through the
     existing member-management UI.
  4. Instance operators are multi-seat: `stampInstanceAdmin()` (server.js:3542) still seeds
     the first operator from `ADMIN_EMAIL` at boot; new operator-gated promote/demote
     endpoints (D-121 pattern) let an operator flag or unflag other users from the operator
     console (settings.js operatorCard); demoting the LAST remaining operator is refused with
     a keyed error (needOwner pattern, server.js:7121); the flag persists across restarts and
     `--add-user` does not auto-flag. Promote/demote actions are audit-logged. (D-78-2.)
  5. When creation is closed for the current user (gate `false`, user not an operator), the
     create-workspace surface (popover at popovers.js:262, `A.newWorkspace` action) is hidden
     — the create button follows `/api/config`'s gate value + `/api/me`'s `isInstanceAdmin` —
     and the post-signup flow lands on a standalone "await access" page stating they need to
     be invited to a workspace to get access: no creation form, no creation redirect, no app
     shell. The page auto-polls (15 s, visible-tab only via visibilitychange) and enters the
     app automatically once a membership or rights appear. Users WITH rights keep the existing
     flow unchanged.
  6. Every refusal key introduced by this phase exists in all 5 locale catalogues
     (en/fr/nl/de/es) in the same commit as the gate that emits it; the parity gate is green.
**Plans**: 2 plans
**UI hint**: yes

### Phase 79: Governance Surface

**Goal**: Instance owners see and manage every workspace on the instance from one
owner-scoped governance page — listing, deletion/archival of empty or shadow workspaces,
orphaned-member reassignment, and instance-owner promote/demote — with no existence leak to
non-owners and no env edit needed to change who holds instance-owner rights.
**Depends on**: Phase 78 (instance-operator identity must exist and be persisted; the resolved
gate and boot log define who reaches the page; `/api/config` carries the gate value)
**Requirements**: WSG-07, WSG-08, WSG-09
**Success Criteria** (what must be TRUE):
  1. An instance operator opening the governance page (slotted into the Phase 60 power-admin
     admin area) sees ALL workspaces on the instance — name, slug, member count, creator,
     created date — including workspaces they are not a member of (no shadow workspace
     escapes the list); the listing endpoint is operator-scoped and non-operators get an
     empty/forbidden payload — never a partial leak and never a workspace-existence oracle.
  2. From the same page, an instance operator can delete or archive an empty/shadow workspace
     they didn't create: the action requires an explicit confirmation, is audit-logged, and
     afterwards the workspace is gone (or archived) from the listing and unreachable via its
     slug.
  3. Orphaned members of a deleted/archived workspace can be reassigned (or released) by the
     instance operator through the same page — no member is left stranded without an honest,
     visible disposition.
  4. Operator promote/demote ships in Phase 78's console (WSG-06); the governance page links
     to it (or relocates it — shape ratified at discuss-phase 79). The change takes effect
     immediately, no server-side env edit or restart needed, and demoting the last instance
     operator is refused with a keyed error (same pattern as `needOwner`), localized in all 5
     catalogues.
  5. Destructive actions (delete/archive, member release) are all confirmation-gated and
     appear in the audit trail; every new refusal key ships in all 5 locale catalogues in the
     same commit as the endpoint that emits it.
**Plans**: 3/3 plans executed
Plans:
**Wave 1**
- [x] 79-01-PLAN.md — Server: archived column + migration, requireWorkspace refusal, operator /workspaces route family (list/archive/delete/reassign/release) + governance server suite (WSG-07, WSG-08)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 79-02-PLAN.md — Client: governance page, route registration, workspaces table, type-to-confirm + orphan disposition modal + client suite (WSG-07, WSG-08)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 79-03-PLAN.md — Relocate operatorCard into the governance Operators section; strip Settings remnants (D-01, costly) + WSG-09 pins (WSG-09)

**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 78 → 79

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 78. Creation Gate & Instance-Owner Identity | 2/2 | Complete | 2026-11-20 |
| 79. Governance Surface | 3/3 | In Progress|  |
