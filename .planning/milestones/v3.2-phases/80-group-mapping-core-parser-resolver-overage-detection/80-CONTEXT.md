---
phase: 80-group-mapping-core-parser-resolver-overage-detection
discussed: 2026-11-20
status: decided
---

# Phase 80 Context: Group Mapping Core — Parser, Resolver, Overage Detection

<domain>
The mapping configuration and claim-ingestion primitives exist as a fully-tested server
core — DB-backed mapping config (validated at save), a groups.js module with parse/validate
plus a full resolver API, and `_claim_names` overage detection. Nothing about login behavior
changes yet; no UI in this phase (the mapping editor rides Phase 83's governance page).
</domain>

<spec_lock>
None — no SPEC.md for this phase.
</spec_lock>

<decisions>

## Config lives IN-APP, not env (supersedes roadmap GM-01 wording)

- **Owner decision (this discussion): group mapping config is DB-backed with an operator
  UI on /governance — env vars are dropped** for mapping config. The ROADMAP GM-01 env
  triple wording (`ENTRA_GROUP_MAP`) is superseded: Phase 80 builds the DB table + save-time
  validation; the editor UI lands in Phase 83 (GV-03's dead-mapping section is part of it).
- **Role tokens: exactly the app's workspace role names** — `owner|admin|member`, strict
  lowercase, no aliases. Invalid token = refusal (at save).
- **Group keys are Entra group Object IDs (GUID shape); workspace keys are workspace IDs.**
  Slugs and display names are display-only labels, never match keys (research + rename-able).

## Validation: refuse at save, warn at boot

- The save API validates GUID shape + workspace existence + role token; invalid mapping =
  keyed 400 refusal, nothing invalid is ever stored.
- Boot (and the operator console) warn about mappings that BECAME dead since save
  (workspace deleted, group gone). Boot does not refuse on dead mappings — D-82-6:
  dead mappings surface as a console warning section (Phase 83 renders it; Phase 80
  provides the detection).
- Existing env-parse precedents (D-78-1 strict tokens, Phase 75 tri-state) apply to any
  REMAINING env surface only — there is no mapping env var anymore.

## groups.js module API (full resolver)

- Server-only module (never bundled by Vite — same rule as oidc.js/totp.js).
- Exports, at minimum: mapping validation helpers (GUID shape, role token, workspace
  existence check hook), and a resolver: `resolve(groupsClaim) → { grants:
  [{workspaceId, role, groupGuid}], operatorFlag: boolean|null }` implementing
  D-82-1 (highest role wins) over all stored mappings.
- Inert by design: nothing in the login callback consumes it until Phase 81.

## Overage detection (D-82-4)

- `groups` claim absent or `_claim_names.groups` present ⇒ UNMAPPED — never an empty list
  (removal-sync trap from PITFALLS.md: an overage pointer misread as empty would strip
  power users in Phase 82).
- Fixture tests pin ALL FOUR shapes, each resolving to a distinct documented outcome:
  1. `_claim_names` present alone
  2. `_claim_names` + `_claim_sources` (full overage pair)
  3. missing `groups` claim entirely
  4. empty `groups` array (this one IS "no groups" — distinct from overage)

## Standing constraints (carried)

- Zero new dependencies; 5-locale keyed refusals land in the same commit as the first
  emitting gate (save-API refusals here; UI strings in Phase 83).
- With no mappings stored, the server boots and behaves byte-identically to today
  (all existing suites green, no behavior change).
</decisions>

<deferred>
- Graph overage fallback (`getMemberObjects`) — documented recipe in research/STACK.md;
  only if ApplicationGroup mode proves insufficient (Future Requirements).
- Mapping editor UI — Phase 83 (GV-01..03).
</deferred>

<canonical_refs>
- .planning/research/STACK.md — Entra claim config, overage mechanics, GUID keys
- .planning/research/ARCHITECTURE.md — groups.js placement, callback ordering (81)
- .planning/research/PITFALLS.md — overage-as-empty trap, dead mappings, key stability
- .planning/REQUIREMENTS.md — D-82-1..6 owner rulings
- oidc.js — hand-rolled client whose `claims` object feeds the resolver (Phase 81)
</canonical_refs>
