# Phase 29: Team/Project-Scoped Permissions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-02
**Phase:** 29-Team/Project-Scoped Permissions
**Areas discussed:** Scope storage & shape, Workspace-level surfaces, Scope management UX, Guest collaborator model

---

## Scope storage & shape

### Q1 — Shape of a membership scope
| Option | Description | Selected |
|--------|-------------|----------|
| Single kind per membership | Workspace-wide OR teams[] OR projects[] | |
| Mixed teams[] + projects[] | Union reach; empty = workspace-wide | ✓ |
| You decide | Defer to researcher/planner | |

**User's choice:** Mixed teams[] + projects[]
**Notes:** None (D-01)

### Q2 — Physical storage
| Option | Description | Selected |
|--------|-------------|----------|
| JSON column on memberships | Null or {teams:[],projects:[]}; invites.teams precedent | ✓ |
| Separate scope table | One row per scoped target | |
| You decide | Defer to researcher | |

**User's choice:** JSON column on memberships
**Notes:** None (D-02)

### Q3 — Interaction with private projects
| Option | Description | Selected |
|--------|-------------|----------|
| Intersect (restrict-only) | Scope never opens private projects | |
| Scope grants access | Explicit scope makes a private project visible | ✓ |
| You decide | Defer to researcher | |

**User's choice:** Scope grants access
**Notes:** Scope is the authoritative grant for scoped members (D-03)

### Q4 — Which roles can be scoped
| Option | Description | Selected |
|--------|-------------|----------|
| Sub-admin roles only | viewer/member only; admin/owner always workspace-wide | ✓ |
| Any role can be scoped | Admins keep powers inside scope only | |
| You decide | Defer to researcher/planner | |

**User's choice:** Sub-admin roles only
**Notes:** None (D-04)

---

## Workspace-level surfaces

### Q1 — Members list for scoped members
| Option | Description | Selected |
|--------|-------------|----------|
| Full roster visible | Needed for @mentions/assignment context; no scope details shown | ✓ |
| Roster filtered to scope | Breaks mention targeting outside scope | |

**User's choice:** Full roster visible
**Notes:** None (D-05)

### Q2 — Activity feed & cross-project search
| Option | Description | Selected |
|--------|-------------|----------|
| Filter like private projects | redactDoc-style server-side filtering | ✓ |
| Hide activity & search | Feature removal for scoped members | |

**User's choice:** Filter like private projects
**Notes:** None (D-06)

### Q3 — Notifications enforcement
| Option | Description | Selected |
|--------|-------------|----------|
| Block at send only | SCOPE-04 predicate at recipient resolution; pre-scope notifs stay | ✓ |
| Block send + filter list | Also filter list on every read | |

**User's choice:** Block at send only
**Notes:** None (D-07)

### Q4 — Overall workspace UI
| Option | Description | Selected |
|--------|-------------|----------|
| Same UI, filtered content | No scoped mode; 404 for strays | ✓ |
| Distinct guest experience | Simplified shell / direct-to-project landing | |

**User's choice:** Same UI, filtered content
**Notes:** None (D-08)

---

## Scope management UX

### Q1 — Where scope is set/changed
| Option | Description | Selected |
|--------|-------------|----------|
| Invite form + member modal | Set at invite, editable later | ✓ |
| Invite-time only | Change reach = re-invite | |
| You decide | Defer to planner | |

**User's choice:** Invite form + member modal
**Notes:** None (D-09)

### Q2 — How scope is expressed
| Option | Description | Selected |
|--------|-------------|----------|
| Pick by name, store ids | Existing multi-selects; renames propagate | ✓ |
| You decide | Defer to planner | |

**User's choice:** Pick by name, store ids
**Notes:** None (D-10)

### Q3 — Self-view of scope
| Option | Description | Selected |
|--------|-------------|----------|
| Passive indicator | Badge: "Limited to: …" | |
| No indicator | Filtered content only | ✓ |
| You decide | Defer to UI planner | |

**User's choice:** No indicator
**Notes:** None (D-11)

### Q4 — Scope change mechanics
| Option | Description | Selected |
|--------|-------------|----------|
| API route, immediate | Phase 28 authority-route pattern; doc untouched | ✓ |
| You decide | Defer to planner | |

**User's choice:** API route, immediate
**Notes:** None (D-12)

---

## Guest collaborator model

### Q1 — Modeling SCOPE-06
| Option | Description | Selected |
|--------|-------------|----------|
| Viewer role + project scope | No new ROLE_RANK entry; guest = viewer + scope | ✓ |
| New guest role | Rank below viewer; touches role gating everywhere | |

**User's choice:** Viewer role + project scope
**Notes:** None (D-13)

### Q2 — Guest capabilities inside their project
| Option | Description | Selected |
|--------|-------------|----------|
| Inherit viewer semantics | No guest carve-outs | ✓ |
| Limited writes in scope | Collaboration exception in role ladder | |

**User's choice:** Inherit viewer semantics
**Notes:** None (D-14)

### Q3 — Post-acceptance landing
| Option | Description | Selected |
|--------|-------------|----------|
| Standard entry, filtered | Consistent with D-08 | ✓ |
| Land in project | Skip empty dashboard | |

**User's choice:** Standard entry, filtered
**Notes:** None (D-15)

---

## the agent's Discretion

- Route-sweep mechanics: endpoint-family grouping, 404-matrix test structure, scope-predicate helper signature
- JSON scope column name and validation shape (invites.teams as style precedent)
- Doc write-path guard for scoped members (mergeClientDoc)
- Whether invite-form scope UI reuses member-modal pickers verbatim or a lighter variant

## Deferred Ideas

- Per-team/per-project permission levels (elevation) — out of scope by SCOPE-01; carried from Phase 28
- Distinct guest landing experience / "scoped mode" UI — rejected (D-08, D-15); revisit only on feedback
