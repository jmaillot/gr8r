# Roadmap: Projects Studio

## Milestones

🚧 **v3.2 Entra Group Mapping & Governance Backlog** — in progress

## v3.2 — Entra Group Mapping & Governance Backlog

**Goal:** Let Entra ID groups drive gr8r workspace membership and operator rights at SSO login (claims-first, snapshot-at-login, zero new dependencies), and finish the deferred governance/backlog work.

**Standing constraints:** zero new dependencies (no Graph SDK — claims-first); 5-locale keyed refusals land in the same commit as the first emitting gate; owner-scoped endpoints must not leak existence; destructive actions confirmed + audit-logged; boot-frozen env consts with strict-token parse; unmapped users behave byte-identically to today.

## Phases

- [x] **Phase 80: Group Mapping Core — Parser, Resolver, Overage Detection** - Inert `groups.js` module: tri-state env parse of mapping config, GUID-keyed validation, overage detector (2026-11-20)
- [ ] **Phase 81: Group Grant Path — Callback Wiring + Provenance** - Groups grant workspace membership and operator rights at SSO login (grants only, no removals)
- [ ] **Phase 82: Removal Sync + Guards + Audit** - Removed-from-group users lose only group-derived grants at login, through the shared guard funnel
- [ ] **Phase 83: Governance — Workspace Rename & Slug Edit** - Operator edits workspace name/slug from /governance, with dead-mapping warnings
- [ ] **Phase 84: Backlog Polish & Ship** - Token-chip pickers, e2e debt, mobile follow-ups, DEPLOY.md, version bump

## Phase Details

### Phase 80: Group Mapping Core — Parser, Resolver, Overage Detection

**Goal**: The mapping configuration and claim-ingestion primitives exist as a fully-tested, inert server module — nothing about login behavior changes yet
**Depends on**: Nothing (first phase)
**Requirements**: GM-01, GM-02, GM-03
**Success Criteria** (what must be TRUE):
  1. Group mapping config lives in the DB: mappings (group Object ID → workspace ID → role) are stored via a validated save path (malformed GUID / unknown workspace / invalid role token = keyed refusal, nothing invalid stored); the boot log warns about mappings that became dead
  2. The server reads the `groups` claim from the ID token; an `_claim_names` overage pointer is detected and resolved as UNMAPPED (never as an empty group list), proven by claim-object fixture tests on `resolveGroupsClaim` (the decoded-claims object `verifyIdToken()` hands over — full token integration lands in Phase 81)
  3. Malformed GUIDs or unknown workspace IDs in the mapping config are refused or warned as dead mappings at boot; display labels are never used as match keys
  4. With no mapping env set, the server boots and behaves byte-identically to today (all existing suites green, no behavior change)

**Plans**: 2/2 plans executed

Plans:
- [x] 80-01-PLAN.md — groups.js core (validators, four-outcome overage detector, D-82-1 resolver) + dual-schema group_mappings table with fixture tests
- [x] 80-02-PLAN.md — operator-gated save API with keyed 5-locale refusals + boot dead-mapping warning + Dockerfile/dependency-test updates

### Phase 81: Group Grant Path — Callback Wiring + Provenance

**Goal**: At SSO login, mapped groups automatically grant workspace membership (with highest-role precedence) and instance-operator rights — grants only; nothing is ever removed by groups yet
**Depends on**: Phase 80
**Requirements**: GW-01, GW-02, GW-03, GW-04, GO-01, GO-02
**Success Criteria** (what must be TRUE):
  1. A user whose Entra groups map to a workspace gains membership automatically at SSO login (JIT-provisioned or existing account) with role = highest mapped role (D-82-1); a mapped role re-asserts over an existing invite/manual grant at each login (D-82-2)
  2. Group mapping runs strictly after the DP-4 signup door and before DP-5 invite reconciliation — a mapped user on a domain-refused email is NOT provisioned (e2e: mapped group + blocked domain refused)
  3. Group-created membership rows carry provenance `group:<guid>` (new `memberships.provenance` column via `adapterEnsureColumn`); invite/manual rows carry their own provenance and group logic never touches them
  4. A member of the operator-mapped group gains `is_instance_admin` at login (grant-only, never revoked mid-milestone; demoted-then-mapped users are re-granted at next login per D-82-3), and every group-derived operator grant is audit-logged like a console promote
  5. With groups present but the user unmapped, login behavior is byte-identical to pre-milestone (regression gate)

**Plans**: TBD

### Phase 82: Removal Sync + Guards + Audit

**Goal**: Lost group membership at login removes only group-derived access, safely — owners, last operators and manual grants are protected, and every group-driven delta is audit-logged
**Depends on**: Phase 81 (needs the `memberships.provenance` column)
**Requirements**: GS-01, GS-02, GS-03, GS-04
**Success Criteria** (what must be TRUE):
  1. A user no longer in any group mapping a workspace loses only their group-derived (`group:<guid>`) membership at next login; invite/manual grants are untouched
  2. Removal of a workspace owner or the last operator is refused by the shared count-before-write guard funnel, logged loudly, audit-recorded, and the login still succeeds (skip-and-audit)
  3. Group-driven role downgrades apply only when the mapped role drops below the current grant AND the current grant is group-derived; manual/invite roles are never downgraded
  4. Every group-driven change (grant, role change, removal, skip) is audit-logged with the group GUID and reason
  5. With an `_claim_names` overage at login, the user proceeds as unmapped: no grants AND no removals, login succeeds, warning logged (D-82-4)

**Plans**: TBD

### Phase 83: Governance — Workspace Rename & Slug Edit

**Goal**: Operators can rename a workspace and edit its slug from the /governance page, with honest link death and dead-mapping visibility
**Depends on**: Nothing (fully parallel with Phases 80–82; only the i18n key gate is shared)
**Requirements**: GV-01, GV-02, GV-03
**Success Criteria** (what must be TRUE):
  1. An operator can edit a workspace's name and slug from the /governance page; invalid shapes and slug collisions are refused server-side with keyed error messages in all 5 locales
  2. After a slug change, the old slug answers 404 with no redirect (D-82-5); the slug-change action requires an explicit confirm (destructive-action rule)
  3. The operator console shows a warning section listing dead mappings (deleted group GUIDs, unknown workspace IDs) per D-82-6, with the same condition surfaced in the boot log
  4. Non-operators cannot reach or use the rename endpoints (owner/operator scoping, no existence leak)

**Plans**: TBD
**UI hint**: yes

### Phase 84: Backlog Polish & Ship

**Goal**: The deferred backlog is cleared and the milestone ships — searchable pickers, green e2e debt, mobile follow-ups, operator docs, version bump
**Depends on**: Phases 80–83 (ship gate)
**Requirements**: BP-01, BP-02, BP-03
**Success Criteria** (what must be TRUE):
  1. Member/team selection inputs use searchable token-chip pickers
  2. The 56-02 e2e spec failures are fixed — the full e2e suite runs green without waivers
  3. Phase 57 mobile layout follow-ups are delivered and pinned by e2e at mobile viewport
  4. DEPLOY.md documents the Entra-side prerequisites (ApplicationGroup claim config, optional overage fallback recipe, dead-mapping runbook, old-slug policy) and package.json is bumped to 3.2.0

**Plans**: TBD

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 80. Group Mapping Core | 1/2 | In Progress|  |
| 81. Group Grant Path | 0/? | Not started | - |
| 82. Removal Sync + Guards | 0/? | Not started | - |
| 83. Governance Rename/Slug | 0/? | Not started | - |
| 84. Backlog Polish & Ship | 0/? | Not started | - |
