# Phase 65: Subtask Tree - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-15
**Phase:** 65-Subtask Tree
**Areas discussed:** Storage shape, Depth cap value, FTS subtask titles, Tree UI interaction

---

## Storage shape

| Option | Description | Selected |
|--------|-------------|----------|
| Flat + parentId (Recommended) | Keep t.subtasks[] as ordered child list; each subtask gets parentId; matches STATE.md lean | ✓ |
| Nested tree array | Recursive {children:[]} in the task doc; rewrites every subtasks[] consumer | |
| Separate tree table | Server-side structure; breaks the one-workspace-doc spine | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stable ids (Recommended) | Each subtask gets a stable uuid-style id for parentId references | ✓ |
| Index/name refs | Fragile — reorder/rename breaks the tree silently | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single ordered array (Recommended) | One ordered t.subtasks[] array; tree built by grouping on parentId | ✓ |
| Sibling order field | Explicit order number per node; more bookkeeping | |

| Option | Description | Selected |
|--------|-------------|----------|
| One array per task (Recommended) | Only tasks carry subtasks[]; descendants are entries in the same array | ✓ |
| Nested arrays again | Contradicts the flat+parentId ruling | |

**User's choice:** Flat + parentId, stable ids, single ordered array, one array per task
**Notes:** Confirms the STATE.md owner-ruling-pending flag (storage-shape conflict ruling resolved).

---

## Depth cap value

| Option | Description | Selected |
|--------|-------------|----------|
| 5 subtask levels (Recommended) | Task + 5 nested levels; matches PM-tool norms; MSPDI-safe | ✓ |
| 3 subtask levels | Tighter, but hits the ceiling fast | |
| 10 subtask levels | Max flexibility; UI/validation strain | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reject whole move (Recommended) | Overflow/cycle moves rejected wholesale with localized error | ✓ |
| Clamp + warn | Land at level 5, descendants clamped — silent drift | |

| Option | Description | Selected |
|--------|-------------|----------|
| Unlimited count (Recommended) | No per-node children limit; depth is the only structural rule | ✓ |
| Per-node count cap | Arbitrary limit users will ask to lift | |

**User's choice:** 5 levels, reject whole move, unlimited count
**Notes:** User asked "do you mean how many subtasks?" — depth vs count was clarified live: cap is nesting levels, count unlimited.

---

## FTS subtask titles

| Option | Description | Selected |
|--------|-------------|----------|
| Index titles (Recommended) | Subtask titles enter FTS5 + pg projection; parity suite extended | ✓ |
| Skip subtask titles | Zero parity-suite churn; subtask wording not searchable | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parent + hint (Recommended) | Result shows parent task + "via subtask: …" hint; opens task drawer | ✓ |
| Bare parent result | No indication which subtask matched | |

| Option | Description | Selected |
|--------|-------------|----------|
| Projection-follows-doc (Recommended) | Deleted subtask titles leave the index on next funnel write | ✓ |
| Keep deleted titles | Stale results, extra bookkeeping | |

**User's choice:** Index titles, parent + hint, projection-follows-doc
**Notes:** Resolves the second open owner ruling in STATE.md.

---

## Tree UI interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Popover actions (Recommended) | Promote/demote/re-parent in existing popover + drawer menu; deterministic | ✓ |
| Drag + buttons | Nicer feel; ambiguous one-level rule; chunk-gate + e2e cost | |
| Drag only | Fastest; hardest to enforce/test | |

| Option | Description | Selected |
|--------|-------------|----------|
| Session-only (Recommended) | Collapse state in-memory per session | ✓ |
| Persisted per user | Extra pref schema for marginal value | |

| Option | Description | Selected |
|--------|-------------|----------|
| Count badge (Recommended) | Open-subtask count on card; tap expands checklist popover | ✓ |
| Progress badge | Redundant with rollup | |
| Icon only | Least info | |

| Option | Description | Selected |
|--------|-------------|----------|
| Table-only tree (Recommended) | Timeline/calendar/exports flat; minimum viable consistency | |
| Timeline too | Timeline/Gantt also renders the tree | ✓ (user overrode recommendation) |

| Option | Description | Selected |
|--------|-------------|----------|
| Indented bars (Recommended) | Subtask bars under parent, collapsible; date-less inherit parent range | ✓ |
| In-bar markers | Compact but subtask dates invisible | |
| Flat timeline | Reverses previous answer | |

**User's choice:** Popover actions, session-only collapse, count badge, timeline indented bars (opted into the richer timeline scope over the recommended table-only)
**Notes:** The timeline choice expands SUB-04 surface work — flagged for planning.

---

## the agent's Discretion

- i18n error-message keys and wording (EN+FR)
- Tree-building helper naming, validation function shape, nested-aware `progressOf` refactor details
- FTS hint rendering details in search results

## Deferred Ideas

None — discussion stayed within phase scope.
