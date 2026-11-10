# Phase 50: Invite hierarchy & per-project toggles (server) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 50-Invite hierarchy & per-project toggles (server)
**Areas discussed:** M-02 'scope' & 'status' meaning, Team snapshot removal, Guest-invite toggle mechanics, One-guest model collapse

---

## M-02 'scope' & 'status' meaning

| Option | Description | Selected |
|--------|-------------|----------|
| Scope = p.members membership | INV-02 'project scope' editing = add/remove user from p.members; roles stay workspace-level | ✓ |
| Per-project roles | New per-project role concept | |
| Status = in/out of p.members | Removal revokes access next request; no suspended flag | ✓ |
| Explicit suspended flag | New per-project status field | |
| Workspace status only | Nothing new to build | |
| Verify existing route, pin with tests | Role edits via existing PATCH; pin immediate-effect | ✓ |
| Extend the route too | Add audit/notification extras | |
| Admins only edit non-admins | Stricter hierarchy: admin-on-admin edits need owner | ✓ |
| Admins edit everyone but owner-role | Literal INV-01 reading | |

**User's choice:** freeform "project scope should be members + team?" — clarified and confirmed as scope = p.members (team handled by the live team link, D-50-5).
**Notes:** User chose the stricter edit hierarchy beyond the literal requirement.

---

## Team snapshot removal

| Option | Description | Selected |
|--------|-------------|----------|
| Manual per-member removal | No batch operation; snapshot was one-time | |
| Team-based batch removal | Remove by team id (over-removal risk) | |
| Frozen snapshot (as pinned) | Keep M-03/INV-03 snapshot semantics | |
| Live team link (milestone change) | p.teams[] returns; join/leave propagates both ways | ✓ |
| Snapshot + manual re-sync | Hybrid | |
| Reverse-sweep migration | Convert Phase 49 materialized grants back to p.teams links | ✓ |
| No migration (stale grants stay) | Predicate = p.members ∨ team-overlap; stale entries persist | |

**User's choice:** freeform "if someone is added to a team, he must gain access to the project where the team is invited, same for removal" → after reflection, confirmed live team link (milestone change). Then "I want two types as members of a project (Team + individual members if needed)".
**Notes:** This supersedes M-03 snapshot wording and reverses D-49-5. REQUIREMENTS.md, ROADMAP.md and PROJECT.md updated in lockstep.

---

## Guest-invite toggle mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| New projects default OFF | Deny-by-default everywhere (consistent with D2.0-1) | ✓ |
| New projects default ON | Friendly default | |
| Workspace default | Inherited default + per-project override | |
| Admin/owner only; blocks new invites only | Existing guests untouched; stale invites fail closed | ✓ |
| Also evict existing guests | Heavy lock-down semantic | |
| Lead may flip too | Project lead can toggle | |
| Team invites bypass toggle | Full roster including guests, regardless of toggle | ✓ |
| Toggle gates team guests too | Stricter consistency | |

**User's choice:** all recommended options.
**Notes:** none.

---

## One-guest model collapse

| Option | Description | Selected |
|--------|-------------|----------|
| Guest = viewer, no special cases | Delete all special-casing | |
| Keep a special guest shape | Some server-side distinctness remains | ✓ (as behavior) |
| Special via behavior only | Restrictions via viewer-role checks, not data model | ✓ |
| Normalize guest→viewer in migration | 'guest' role rows normalized in boot sweep | ✓ |
| Keep stored 'guest' role value | No normalization sweep | |

**User's choice:** guest specialness via behavior only; data model collapses to 'viewer' with normalization in this phase's migration.
**Notes:** User initially picked "keep a special guest shape", then clarified it means behavioral restrictions only.

---

## Agent's Discretion

- Hierarchy refusal shapes (status codes, error keys), API route shapes for scope editing/team linking
- Reverse-sweep provenance reconstruction (activity log vs live-intersection diff)
- `mergeClientDoc` pinning details, activity-log entries, 404-matrix fixture extensions

## Deferred Ideas

- Team-roster UX, share-modal copy and toggle UI — Phase 51
