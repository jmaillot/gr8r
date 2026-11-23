# Phase 85: Roles Foundation - Context

**Gathered:** 2026-11-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Instance operations become delegable: an `instance_roles` table stores explicit
Backup Operator / Restore Operator grants, a server-side `hasInstanceRole`
funnel (capability-level API, Super-Admins implicit) gates everything, a new
Instance Roles tab on the operator /governance page lets Super Admins grant and
revoke roles (audit-funnel-logged), and a gated top-level Backup surface exists
as a real page with an empty state plus stub task endpoints. The
restore-authority ≠ archive-read-authority distinction is encoded NOW as named
capability constants (ARCHIVE_READ reserved, granted to no role) and pinned by
tests — before any restore endpoint (Phase 89) or download tiering (Phase 90)
exists. Requirements BKROLE-01..03. No backup task logic, scheduler, archive
format, or restore flow — those are Phases 86–89.

</domain>

<decisions>
## Implementation Decisions

### Role storage & vocabulary

- **D-01:** `instance_roles.role` is a CHECK-constrained enum: `CHECK (role in
  ('backup_operator','restore_operator'))`. Adding a role later = widen the
  CHECK via the existing rebuild-migration pattern (invites role-widening
  precedent, server.js:717). Not free-form slugs (typos become silent no-ops)
  and not a third role upfront (archive-read tiering is a Phase 90 design).
- **D-02:** One row per (user_id, role); a user can hold both roles as two
  rows; revoke deletes the row. — **Reversibility:** costly — the
  (user_id, role) unique shape and FK cascade become load-bearing for the
  funnel and audit joins across Phases 86-90.
- **D-03:** Row carries `id, user_id (unique per role), role, granted_by (user
  id), granted_at` — matching the Phase 80 group-mapping table conventions,
  with the dual-mirror SQLite/Postgres + pin test.
- **D-04:** `ON DELETE CASCADE` via the user_id FK (mirroring the group-mapping
  user reference) — rows vanish with the deleted account.
- **D-05:** Granting a role to a Super Admin (`is_instance_admin=1`) is refused
  with a keyed localized refusal — they hold everything implicitly and a row
  would wrongly make them appear in / demotable from the membership list.
- **D-06:** No self-guard: a Super Admin can grant/revoke anyone including
  themselves — roles never affect Super Admin authority, no demotion risk.
- **D-07:** Grant target pool = users in `GET /api/auth/operator/users` (D-121
  operator user list) only — no new user-enumeration surface.
- **D-08:** Duplicate grant (user already holds that role) returns a keyed
  refusal and the UI highlights the existing row; the other role is grantable
  (two rows).

### Capability model & hasInstanceRole funnel

- **D-09:** Capability-level API: `hasInstanceRole(userId, capability)` —
  callers never see raw role slugs; the funnel is the single server-side gate.
- **D-10:** Four capability constants: `BACKUP_MANAGE` (create/edit/delete/run
  tasks), `RESTORE_USE` (browse/preview/restore), `ARCHIVE_READ` (download
  archives — DEFINED but granted to NO role in Phase 85, explicitly reserved
  for Phase 90 download tiering), `INSTANCE_ROLES_MANAGE` (never in the map —
  Super-Admin short-circuit only).
- **D-11:** Initial role→capability map: `backup_operator ⇒ [BACKUP_MANAGE]`,
  `restore_operator ⇒ [RESTORE_USE]`. ARCHIVE_READ mapped to no role. —
  **Reversibility:** one-way — this map IS the restore-authority ≠
  archive-read-authority encoding the roadmap requires before any restore
  endpoint; granting ARCHIVE_READ later is a deliberate Phase 90 decision.
- **D-12:** Super-Admin short-circuit sits INSIDE the funnel: `isInstanceAdmin
  ⇒ true` for every capability BEFORE any table lookup — no row state can ever
  demote a Super Admin (roadmap criterion 3).
- **D-13:** The funnel lives in a new `roles.js` domain module alongside
  groups.js — pure logic exported and unit-tested independently of server.js
  (Phase 80 core split precedent).
- **D-14:** Direct DB query per call, no caching — cheap indexed lookup;
  revocation applies on next load (roadmap criterion 1).
- **D-15:** Role names surface via i18n labels only (existing 5-locale keyed
  vocabulary) — no DB role catalog.

### Routes & audit

- **D-16:** Single operator route family: `GET/POST
  /api/auth/operator/instance-roles` (list, grant), `DELETE
  /api/auth/operator/instance-roles/:id` (revoke) — Phase 83 D-05 guard order
  exactly: sameOrigin FIRST, then requireUser, operator-keyed throttle, the
  `is_instance_admin` gate BEFORE any target lookup (no existence oracle),
  then target fetch.
- **D-17:** Grant/revoke is Super-Admin-only; Backup/Restore Operators can
  never grant or revoke roles (roadmap criterion 2).
- **D-18:** Grants/revokes audit-logged through the existing audit funnel
  (audit row via the helper the Phase 80-82 mapping grant path used —
  BKROLE-03 names the funnel), not a bare logInfo.
- **D-19:** Stub backup endpoints behind the gates in this phase: `GET
  /api/backup/tasks` returns `[]` so the gate is exercised end-to-end and the
  BKROLE-02 refusal path (Restore Operator on task-edit endpoints, keyed
  localized refusal) has real endpoints to refuse from.

### Backup surface (UI)

- **D-20:** "Sees the Backup surface" = real page + empty state: gated
  top-level nav entry plus a real page whose empty state says backup isn't
  configured yet (task content arrives Phase 86/87). Surface, routes and role
  gates all exist now, making roadmap criterion 1 genuinely testable.
- **D-21:** Top-level nav entry (e.g. "Backup"), visible to Backup/Restore
  Operators and Super Admins; NOT nested inside Governance (governance is
  operator-only; Backup Operators are regular users).
- **D-22:** ONE shared surface: Restore Operator sees the same page; role
  differences appear as gated actions inside, not two nav entries.
- **D-23:** Client learns visibility via server payload flags derived from
  `hasInstanceRole` (e.g. `canBackup`, `canRestore`), alongside the existing
  `isInstanceAdmin` flag (server.js:1059 pattern) — no client-side role logic.
- **D-24:** The stub `GET /api/backup/tasks` response carries the capability
  flags alongside the empty list, so Phase 86/87 UI renders role-aware actions
  from the same contract.
- **D-25:** Revocation propagates on next load — flags recompute per payload
  load (matches criterion 1's "removes surfaces on their next load"). No live
  push.
- **D-26:** Non-holder deep-linking the Backup route gets 403 + keyed refusal
  (new keyed message, `err.operatorOnly`-style pattern), not a silent redirect.
- **D-27:** Placeholder page lives at `src/pages/backup.js` following
  governance.js patterns: render from payload flags, no auto-poll
  (low-frequency surface), chunk-gated if size demands (66-03 precedent).
- **D-28:** All new i18n keys land in all 5 locales now: nav label, page
  title, empty state, and every new keyed refusal (role-required 403, Restore
  Operator task-edit refusal, Super-Admin-grant refusal, duplicate-grant
  refusal).

### Instance Roles tab (governance UI)

- **D-29:** New "Instance Roles" tab/card on the operator `/governance` page
  (src/pages/governance.js), beside the existing workspace-governance and
  operator cards — the roadmap's "Instance > Governance" IS this page, the
  single consolidated operator-management surface (Phase 78/83 pattern).
- **D-30:** Tab shape = membership table (user, role badge, granted_by,
  granted_at, revoke action) + "Grant role" button opening a modal: user
  picker from the operator user list + role select — the Phase 84
  assignee-picker modal pattern (D-01/D-02: searchable, confirm-to-apply).
- **D-31:** Revoke uses the existing inline-confirm pattern (D-90
  inline-confirm used by govArchive/govDeleteAsk) + success toast; no separate
  dialog — revocation is low-stakes and reversible.
- **D-32:** The tab includes a compact recent-activity section listing recent
  grant/revoke audit rows (actor, target, role, action, time) — reusing the
  governance dead-mapping warning section pattern (Phase 83).
- **D-33:** granted_by renders as the granting user's display name (resolved
  server-side in the list join), falling back to the raw id if the account was
  deleted; granted_at in the app's standard relative-time formatting.
- **D-34:** Tab empty state: standard governance box pattern — "No instance
  roles granted yet" with the Grant button front and center.

### Tests

- **D-35:** Pin tests (dual-mirror convention): (a) Restore Operator ⇒
  CAP_RESTORE but NEVER CAP_ARCHIVE_READ; no capability-map entry leaks
  ARCHIVE_READ in Phase 85; (b) an `is_instance_admin` user with ZERO
  instance_roles rows holds every capability (implicit membership); no list
  response can contain an implicit entry.
- **D-36:** Full e2e set: grant → grantee sees surface and stub endpoints;
  revoke → gone on next load; Restore Operator refused on task-edit stubs with
  keyed message; Backup Operator cannot grant/revoke roles; non-holder
  deep-link 403.

### the agent's Discretion

- Exact capability flag names in the user payload (canBackup/canRestore are indicative)
- Exact wording of new i18n keys and refusal messages (keyed vocabulary applies)
- Visual treatment of the role badges and the grant modal chrome (mirrors assignee picker)
- Chunk-gating decision for src/pages/backup.js (66-03 size precedent)
- Exact audit funnel event naming for grants/revokes (consistency with Phase 80-82 events)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning docs
- `.planning/ROADMAP.md` §Phase 85 — Goal, success criteria 1-5, "Gaps for discuss-phase: none — v3.2 groups.js template copied verbatim (dual mirror + pin test + refusal funnel)", UI hint: yes; also Phase 86 (role gate on export routes) and Phase 90 (download tiering consumes the ARCHIVE_READ vocabulary)
- `.planning/REQUIREMENTS.md` §Roles & Governance (BKROLE-01..03) — the three requirements this phase implements
- `.planning/PROJECT.md` — v3.3 milestone context; role table sketch ("instance_roles extensible, Super Admins auto-membres, tab « Instance Roles » dans Instance > Governance")

### Prior-phase decisions that bind this phase
- `.planning/milestones/v3.2-phases/83-governance-workspace-rename-slug-edit/83-CONTEXT.md` — D-05 operator route guard order (sameOrigin → requireUser → throttle → gate before target lookup); D-10 (user-facing /api/workspaces never extended)
- `.planning/milestones/v3.2-phases/84-backlog-polish-ship/84-CONTEXT.md` — D-01/D-02 assignee-picker modal pattern (grant modal); D-06 flake policy (3 consecutive green runs)
- `.planning/milestones/v3.2-phases/80-group-mapping-core-parser-resolver-overage-detection/80-CONTEXT.md` — group-mapping table conventions, dual mirror + pin test, refusal funnel, pure-logic module split

### No external specs
No external specs/ADRs — requirements fully captured in decisions above and the referenced planning docs.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `groups.js` + its server.js wiring — the v3.2 template this phase copies verbatim per ROADMAP (dual mirror + pin test + refusal funnel)
- Operator user list `GET /api/auth/operator/users` (D-121) — grant target pool source
- `isInstanceAdmin` payload flag (server.js:1059) — the pattern the new canBackup/canRestore flags extend
- D-112 instance-operator privilege boundary (server.js:4972) — the Super-Admin gate the routes reuse
- governance.js page patterns: tab/card layout, D-90 inline-confirm, dead-mapping warning section (D-32's model), 403 operator-only fullstate
- Rebuild-migration pattern (server.js:717, invites role CHECK widening) — how the role enum widens later
- Audit funnel (Phase 80-82 mapping grant path helper) — BKROLE-03 logging mechanism
- Phase 84 assignee-picker modal (55-04 pattern) — grant modal chrome

### Established Patterns
- Keyed 5-locale refusals; locale gate discipline (all 5 locales per D-28)
- Dual-mirror SQLite/Postgres schema + pin test for every new table
- Pure-logic domain module (groups.js precedent) unit-tested independently of server.js
- Operator route family guard order (Phase 83 D-05)
- No auto-poll on low-frequency surfaces

### Integration Points
- server.js schema section (GROUP-MAPPING block ~line 637-650 shows the table-definition comment style)
- User payload build (~server.js:1059) — capability flags added there
- /governance page render (src/pages/governance.js:112 `operatorCard()` slot) — new tab/card
- Nav/shell — new top-level Backup entry, flag-gated
- Future consumers: Phase 86 export routes gate via BACKUP_MANAGE; Phase 87 task CRUD same; Phase 89 restore routes gate via RESTORE_USE; Phase 90 download tiering consumes ARCHIVE_READ

</code_context>

<specifics>
## Specific Ideas

- The roadmap explicitly designates the v3.2 groups.js template "copied verbatim (dual mirror + pin test + refusal funnel)" as the implementation pattern for this phase.
- ARCHIVE_READ must exist as a defined-but-ungranted constant so the "restore authority ≠ archive-read authority" vocabulary is encoded before any restore endpoint is written (roadmap SC5).
- Super Admins must never appear in or be demotable from the membership list — enforced structurally (refuse grants to them + funnel short-circuit before table lookup), not by filtering.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 85-Roles Foundation*
*Context gathered: 2026-11-21*
