# Requirements: Projects Studio v2.0 — Project-level Permissions & Invitations

**Defined:** 2026-11-07
**Core Value:** real auth, real multitenancy, real localization, real notifications — no decorative state (v2.0 focus: simple, predictable, project-decided access)

## v2.0 Requirements

Requirements for this milestone. Each maps to roadmap phases. Decisions M-01..M-08
validated by the owner 2026-11-07 (see PROJECT.md), plus migration rulings D2.0-1..4 below.

### Visibility & Permissions per Project

- [ ] **VIS-01**: User (owner/admin) can switch any project between private and public
  via a per-project toggle (replaces the current dropdown)
- [ ] **VIS-02**: A member sees exactly the non-private projects of the workspace plus
  the private projects they are explicitly invited to (individual or via team invite) —
  team-derived visibility (`project.teams ∩ member.teams ≠ ∅`) is replaced
- [ ] **VIS-03**: A private project is never sent to a non-invitee: redaction on read,
  merge protection on write, and byte-identical 404s on every side door are preserved
- [ ] **VIS-04**: Per-project "members may invite guests" toggle: members can invite a
  guest into a project only when the toggle is on (admins/owner always allowed);
  existing projects migrate with the toggle OFF (D2.0-1)

### Invitations & Hierarchy

- [ ] **INV-01**: Only an owner can name another owner — at invite time, at edit time,
  and at accept time (M-01 strict hierarchy)
- [ ] **INV-02**: Admin/owner can edit a member's role, project scope and status after
  the invite, with immediate effect (M-02)
- [ ] **INV-03**: Owner/admin can invite whole teams through a private project's share
  options; all current team members gain access (snapshot semantics — later team joiners
  gain nothing unless re-invited) (M-03)
- [ ] **INV-04**: One guest concept: the "Invité externe" toggle is removed; a guest can
  be invited to multiple projects (the "exactly one project" rule is retired, D2.0-3)

### Migration & Data

- [ ] **MIG-01**: Boot migration materializes every existing access path into explicit
  project invitations (teams ∩ members, Phase-29 scope grants converted to invites per
  D2.0-2) before deleting `project.teams`; per-member × per-project read-equivalence is
  proven before/after
- [ ] **MIG-02**: The Phase-29 scope columns (`memberships.scope`, `invites.scope`) and
  the D-03 grant inversion are retired — dormant on disk, ignored by code
- [ ] **MIG-03**: All send-time consumers (reminder pass, email mirror, digest) and the
  MCP server's mirrored predicate read the new model through the same
  `memberCanReadProject` helper, rewritten in lockstep, with a parity test

### Project Creation & Settings

- [ ] **CRT-01**: All members can create projects and automatically become members
  (lead) of them; a workspace setting can restrict creation to admins (M-07)
- [ ] **CRT-02**: The workspace Settings > Permissions page is removed; anything still
  relevant relocates (or dies with the model) — no orphaned routes or i18n keys

### Transparency & UX

- [ ] **TRN-01**: Admin/owner can open a transparency view showing exactly what a given
  member can see (public projects + private projects they can access) (M-08, D2.0-4)
- [ ] **UX-01**: Every user-facing string of the new surfaces is catalogued EN+FR and
  the i18n build gate passes (standing invariant)

## v3 Requirements (deferred)

- **TRN-02**: Members see their own (redacted) visibility view
- **TEAM-RESYNC**: A "re-sync team" affordance to grant access to members who joined a
  team after a project invite snapshot
- **NOTIF-TRIM**: Notification audit trim recommendations (rows still `proposed` in
  `docs/notification-audit.md`) — deferred, requires owner rulings

## Out of Scope

| Feature | Reason |
|---------|--------|
| Notification debt (audit trims, DEP0210, pre-existing lint) | Owner ruled: focus permissions only |
| Subdomain tenancy, SAML/SCIM | Unchanged from PROJECT.md out-of-scope |
| Real billing / quotas | Unchanged |
| Team visibility kept as a fallback model | Replaced deliberately — no dual model |
| Live-list team grants (auto-grant new team members) | Snapshot semantics chosen; re-sync deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| (pending roadmap) | | |

**Coverage:**
- v2.0 requirements: 12 total
- Mapped to phases: 0
- Unmapped: 12 ⚠️

---
*Requirements defined: 2026-11-07*
*Last updated: 2026-11-07 after initial definition*
