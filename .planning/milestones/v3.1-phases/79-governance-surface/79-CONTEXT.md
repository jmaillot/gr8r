# Phase 79: Governance Surface - Context

**Gathered:** 2026-11-20
**Status:** Ready for planning

<domain>
## Phase Boundary

One owner-scoped governance page (slotted into the Phase 60 power-admin admin area)
listing ALL workspaces on the instance, with archive (soft, reversible) and empty-only
hard delete, per-member orphan disposition (reassign with target+role, or release),
and instance-operator promote/demote relocated here from the Phase 78 Settings console.
Non-operators get a 403 — no workspace-existence oracle.
</domain>

<decisions>
## Implementation Decisions

### Operator management placement (WSG-09)

- **D-01:** Promote/demote UI is RELOCATED into the governance page as a section — the
  governance page is the single surface. The Phase 78 `operatorCard` UI
  (src/pages/settings.js:253) is REMOVED from Settings entirely (no pointer remnant, no
  duplicate code paths). Backend endpoints from Phase 78 (`/api/auth/operator/users/*`)
  are reused unchanged.
  — **Reversibility:** costly — removing the Settings card changes a UI contract shipped
  in Phase 78; relocating back means re-adding the card and its wiring.
- This ratifies the roadmap's "linked or relocated" open question: **relocated**.

### Archive vs delete semantics (WSG-08)

- **D-02:** Archive = new `workspaces.archived` soft flag. Archived workspaces are hidden
  from normal listing/entry, slug access returns a keyed 'workspace archived' refusal,
  and the operator can unarchive from the governance page (reversible).
- **D-03:** Hard delete is allowed ONLY for empty/shadow workspaces (no projects/content).
  A workspace with real content must be archived instead — the endpoint refuses with a
  keyed error. This protects live data from being wiped via a governance view.
- **D-04:** All destructive actions (delete, archive, member release) use
  **type-to-confirm**: the operator types the workspace slug (or equivalent identifier)
  to confirm. Audit-logged via the audit-log table (server.js:418).

### Orphaned member disposition (WSG-08)

- **D-05:** Per-member choice: the operator sees the member list of the workspace being
  removed and decides each member individually — reassign to another workspace (with
  target + role picked in the same step) or release. No bulk-reassign.
- **D-06:** Block-until-resolved: the delete cannot execute while any member lacks a
  disposition ('release' counts as resolved). No member is ever stranded — matches SC#3.
- **D-07:** Archiving does NOT trigger the orphan flow — archived workspaces keep their
  member rows frozen (members simply can't enter). Orphan resolution is required only
  on hard delete.
- **D-08:** Reassignment control: dropdown of all workspaces (from the same operator
  listing) with name + member count; the operator assigns the member's role
  (owner/admin/member) in the same step.

### Listing endpoint & leak guard (WSG-07)

- **D-09:** Non-operators get **403 forbidden** from the listing endpoint (not an empty
  200). Consistent with the `operatorOnly` guard (server.js:6710); gates the caller,
  not workspace existence.
- **D-10:** New operator-gated route family: `GET /api/auth/operator/workspaces` plus
  action endpoints under it (archive/unarchive, delete, member reassign/release).
  Mirrors the Phase 78 console endpoint pattern (server.js:6703-6785). Do not extend
  the user-facing `/api/workspaces` family.
- **D-11:** Client: governance page lives as a slot in the Phase 60 power-admin admin
  area, rendered only when `/api/me` shows `isInstanceAdmin`; the endpoint enforces
  server-side regardless.

### the agent's Discretion

- Listing payload field details and pagination (5 fields named in WSG-07; planner picks
  shape — likely small instance, no pagination needed unless research says otherwise)
- Unarchive UX details (same page, one click + confirm)
- Exact refusal key names and locale phrasing (all 5 catalogues, same commit)
- Whether promote/demote section reuses operatorCard markup as a component moved into
  the page or is rewritten to fit the governance layout

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning artifacts
- .planning/ROADMAP.md — Phase 79 section (success criteria; SC#4's "linked or
  relocated" is now ratified as RELOCATED by D-01)
- .planning/REQUIREMENTS.md — WSG-07, WSG-08, WSG-09 (and WSG-06 context)
- .planning/PROJECT.md — v3.1 Current Milestone section (standing constraints)
- .planning/phases/78-creation-gate-instance-owner-identity/78-CONTEXT.md — operator
  identity, endpoint pattern, operatorCard location, last-operator refusal pattern

### Code — gate & endpoints
- server.js:4838 — isInstanceAdmin() (the operator gate primitive; D-112: DB flag only)
- server.js:6703-6785 — /api/auth/operator/users family (D-121 pattern; the route
  family D-10 extends for workspaces)
- server.js:6710 — operatorOnly 403 refusal (pattern for D-09)
- server.js:6882 — POST /api/workspaces (Phase 78 gate; listing stays separate)
- server.js:6887-6876 area — GET /api/workspaces (user-facing listing, untouched)

### Code — data & audit
- server.js:418 — audit-log table (all destructive actions must write here)
- Workspace schema in server.js — needs new `archived` column (D-02)

### Code — client
- src/pages/settings.js:253 — operatorCard() (UI to relocate, then remove from Settings)
- Phase 60 power-admin admin area (client slot for the governance page — locate exact
  file/section at research)

### Locales
- src/locales/*.json — 5 catalogues; every new refusal key lands in all 5 in the same
  commit as the endpoint that emits it

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- operatorCard UI (src/pages/settings.js:253) — markup/actions relocate into the
  governance page
- /api/auth/operator/users endpoints — promote/demote backend works as-is
- Audit-log table — destructive-action logging established
- Phase 78 await-access page — release disposition lands members there naturally
- operatorOnly 403 pattern — D-09 reuses it verbatim

### Established Patterns
- Keyed localized refusals, 5-catalogue parity in the same commit
- D-121 operator route family shape (guard once at the family level)
- Type-to-confirm is NEW — no existing pattern; build a small shared confirm component
  if one doesn't exist

### Integration Points
- New `workspaces.archived` column + slug-entry refusal in the workspace resolution path
- /api/me isInstanceAdmin (server.js:939) — client gating, no new payload plumbing
- Member reassignment writes existing membership rows; release drops membership (member
  then sees the await-access page if they have no other workspace)

</code_context>

<specifics>
## Specific Ideas

No specific external references — decisions above fully capture the owner's intent.

</specifics>

<deferred>
## Deferred Ideas

- Workspace settings editing (rename/slug) from the governance page — carried from
  Phase 78 deferred list; still out of scope here
- Bulk member operations across workspaces — future consideration
- Workspace content transfer/merge tooling — future milestone

</deferred>

---

*Phase: 79-Governance Surface*
*Context gathered: 2026-11-20*
