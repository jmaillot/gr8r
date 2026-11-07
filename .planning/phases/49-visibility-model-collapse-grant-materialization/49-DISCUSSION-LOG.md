# Phase 49: Visibility model collapse & grant materialization - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-07
**Phase:** 49 - Visibility model collapse & grant materialization
**Areas discussed:** Scope-column disposition (D2.0-2), p.private boolean vs enum, p.teams[] fate after sweep, D-03 legacy grant conversion

---

## Scope-column disposition (D2.0-2)

**Q1: What happens to the stored scope data (memberships.scope, invites.scope) during the boot sweep?**

| Option | Description | Selected |
|--------|-------------|----------|
| Convert-and-clear | Sweep materializes scope-derived access into p.members, then sets the columns to NULL. Schema untouched. ARCHITECTURE.md's recommendation. | ✓ |
| Leave columns untouched | Sweep writes p.members but leaves the JSON in the columns. Literally "dormant on disk" — simplest sweep, stale data lingers. | |
| Drop the columns | Cleanest end state, but violates the additive-migration convention and the byte-identical-second-boot pattern. | |

**User's choice:** Convert-and-clear
**Notes:** —

**Q2: Confirm the ruling — after the one boot no code path may ever read or honor a scope column again; MIG-02's proof is the set-equality fixture, not column retention?**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — clear implies conversion | Old visibility is exactly reproducible at sweep time; no read of the old scope is ever needed after that boot. | ✓ |
| Keep a re-derivation path | Convert grants AND keep a way to re-derive (backup/audit field). Adds a new artifact for no proven need. | |

**User's choice:** Yes — clear implies conversion
**Notes:** "Dormant on disk, ignored by code" refined to "cleared on disk, ignored by code" (D-49-1/D-49-2).

---

## p.private boolean vs enum

**Q1: Which stored representation for the visibility field does the Phase 49 sweep target?**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep boolean | p.private stays boolean; projectIsPrivate, normalizeProjects, redactDoc, mergeClientDoc and the MCP mirror keep their exact shape. Smallest diff. | ✓ |
| Migrate to enum | p.visibility: 'public'\|'private'; leaves room for a future 'unlisted'; costs a rewrite of every visibility surface in the deepest-migration phase. | |
| Boolean + deferred note | Keep the boolean now; note a possible enum later. | |

**User's choice:** Keep boolean
**Notes:** —

**Q2: Does the sweep retire the legacy p.access === 'private' fallback (pre-v1.1 shape)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Normalize legacy in sweep | Sweep normalizes legacy p.access docs to the boolean; removes dual-representation dead code. Behavior identical either way. | ✓ |
| Keep the fallback | projectIsPrivate keeps honoring both forever; two representations live on. | |

**User's choice:** Normalize legacy in sweep
**Notes:** —

---

## p.teams[] fate after sweep

**Q1: What happens to p.teams on project documents during the sweep?**

| Option | Description | Selected |
|--------|-------------|----------|
| Delete everywhere | Sweep deletes p.teams from every project doc. Clean end state; p.teams absence IS the second-boot no-op marker. History lives in the activity log. ARCHITECTURE.md's recommendation. | ✓ |
| Keep inert/display-only | Sweep keeps p.teams but no code reads it; preserves display possibilities; needs a different second-boot marker. | |
| Delete + backfill history | Delete p.teams but copy team-share history into activity log entries first. More sweep complexity. | |

**User's choice:** Delete everywhere
**Notes:** —

**Q2: How strictly is the second-boot byte-identity pinned?**

| Option | Description | Selected |
|--------|-------------|----------|
| Marker + boot check | Delete-on-sweep marker PLUS a small boot check (or test pin) asserting a fully-swept workspace is untouched byte-for-byte. | ✓ |
| Marker only | Rely on the delete-on-sweep marker alone, tested via migration fixtures. | |

**User's choice:** Marker + boot check
**Notes:** —

---

## D-03 legacy grant conversion

**Q1: How does the sweep treat members whose ONLY access to a private project was a Phase-29 scope grant (D-03 inversion)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Materialize all grants | Every (member, project) pair visible under the OLD predicate — scope-grant-only and team-intersection pairs alike — gets an explicit p.members entry. Roles untouched. Nobody loses access. | ✓ |
| Team pairs only | Only team-intersection pairs materialized; scope-grant pairs fall away. Breaks success criterion 1. | |

**User's choice:** Materialize all grants
**Notes:** —

**Q2: Does the sweep explicitly preserve the sealed shape of empty-members private projects (normalizeProjects de-sealing edge)?**

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve sealed shape | Sweep cooperates with normalizeProjects so materialization never un-seals an empty-members private project. | ✓ |
| Fixture-driven, no special case | Let normalizeProjects behave as today; fixtures catch any un-sealing drift as test failures. | |

**User's choice:** Preserve sealed shape
**Notes:** —

---

## the agent's Discretion

- Call-site census, fixture matrix design, sweep ordering mechanics
- MCP mirror shape (keep mirror function vs inline the now-sync predicate)
- seed.js fixture cleanup

## Deferred Ideas

None — discussion stayed within phase scope.
