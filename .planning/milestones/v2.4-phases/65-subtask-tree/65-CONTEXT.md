# Phase 65: Subtask Tree - Context

**Gathered:** 2026-11-15
**Status:** Ready for planning
**Revised:** 2026-11-15 — D-01/D-03 storage shape amended after execution halt at the 65-01 Task-0 checkpoint (owner flagged structure, irreversibility, sibling-order and concreteness concerns; re-decided in this session's amendment discussion)

<domain>
## Phase Boundary

A task's subtasks form a real multi-level tree (max 5 subtask levels) that users can navigate, restructure (promote/demote/re-parent one level at a time), and that every existing surface renders consistently: list/table views (indent + collapse carets), board view (child-count badge), timeline (indented bars), FTS projection, MSPDI/xlsx/CSV exports, and MCP writeDoc round-trip. Completing a parent auto-completes open descendants; parent progress is a computed rollup. No new write path — everything flows through the existing `mergeClientDoc` funnel.

</domain>

<decisions>
## Implementation Decisions

### Storage shape
- **D-01:** Flat `t.subtasks[]` array per task, each subtask a stable-id object with an explicit `parentId` (`null` = child of the task, otherwise the parent subtask's id — the task itself is the implicit level-0 root and never appears in `parentId`). Only tasks carry a `subtasks[]` array; all descendants are entries in that single array. — **Reversibility:** one-way — the shape is written into every stored workspace doc and mirrored across mergeClientDoc whitelist, FTS projection, exports, and MCP; switching to a nested model or a keyed map later would need a doc migration and touches every consumer.
- **D-01a:** Root subtasks use `parentId: null` (owner-confirmed). Task ids never appear inside `subtasks[]` entries.
- **D-02:** Each subtask object carries a stable id (uuid-style); `parentId` references the parent subtask's id, `null` for roots. Re-parenting and cycle checks rely on stable identity.
- **D-03:** Sibling order = explicit `position` integer field on each subtask (amended from array-order after execution halt — owner wanted moves to touch one node, not rewrite siblings). Tree rendering and export ordering sort by `position` within each `parentId` group; the array's storage order is irrelevant. Ties/missing position are normalized to array order by the funnel on write.
- Note: `parentId`, subtask `id` and `position` MUST join the `mergeClientDoc` normalize whitelist or they are silently stripped (existing removal-sweep precedent at `server.js:2579` for subtask assignees).
- Note (irreversibility rationale, owner-confirmed at the halt checkpoint): the one-way risk was accepted *within* the flat family — flat-array→keyed-map remains a purely mechanical migration with no semantic change; the genuinely one-way boundary is flat-vs-nested, and nested was rejected (recursive sweeps, chunk-gate risk).

### Depth cap and validation
- **D-04:** Maximum 5 subtask nesting levels under a task (task = level 0). Unlimited children per node — depth is the only structural limit.
- **D-05:** A promote/demote/re-parent that would push any node past level 5 (or create a cycle) is rejected wholesale by the server at the funnel with a localized error — no partial state, no clamping.

### FTS subtask titles
- **D-06:** Subtask titles ARE indexed in the FTS projection (`task_search_projection` + FTS5, SQLite+pg byte-identical parity suite extended) — resolves the open owner ruling in STATE.md.
- **D-07:** A search hit from a subtask title shows the parent task with a subtask-hint (e.g. "via subtask: …"); clicking opens the task drawer — no deep-link into subtasks.
- **D-08:** Projection follows the doc: deleting a subtask removes its title from the index on the task's next funnel write; no separate sweep.

### Tree UI interaction
- **D-09:** Restructuring is via popover/drawer-context-menu actions (promote / demote / re-parent) — no drag-and-drop. Deterministic, enforces the one-level-at-a-time rule of SUB-02, keeps the ~2 kB chunk headroom.
- **D-10:** Collapse/expand state is session-only component state — not persisted per user.
- **D-11:** Board card shows a count badge of open subtasks; tapping expands the checklist in the existing card popover pattern. No nested kanban (SUB-01).
- **D-12:** Table/list views get the full indent + collapse caret tree; timeline/Gantt also renders subtask bars indented under the parent, collapsible — subtasks without dates inherit the parent's date range.

### Cascade semantics (rulings pinned 2026-11-15, after research)
- **D-13:** Reopening a completed parent leaves its descendants done — no re-cascade to open. Matches undo-minimalism; the user re-opens children individually if wanted. (Owner-confirmed; resolves the reopen-cascade open sub-question flagged in research.)
- **D-14:** Cascade completion is symmetric at every level: completing a subtask that is itself a parent auto-completes its open children, exactly like top-level task completion (owner-confirmed).

### the agent's Discretion
- Exact error-message keys and i18n wording (EN+FR same commit, per standing constraint).
- Internal naming of tree-building helpers, validation function shape, and how the rollup `progressOf` is refactored to avoid double-counting nested progress.
- Details of the FTS hint rendering in search results.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project spine & rulings
- `.planning/PROJECT.md` — one-workspace-doc spine, v2.1/v2.2 precedents (D-53-1 normalize-sink pattern, subtask assignee sweeps)
- `.planning/REQUIREMENTS.md` §Subtask Tree (SUB) — SUB-01..04 requirement text
- `.planning/STATE.md` §Decisions carried into v2.4 — prior rulings this discussion resolved (storage shape, FTS titles) and standing constraints

No external specs/ADRs exist — requirements fully captured in decisions above plus the roadmap phase detail in `.planning/ROADMAP.md` §Phase 65.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/core/store.js:498` — existing `progressOf` computes progress from `t.subtasks[]` done ratio; extend to a nested-aware rollup (never double-count).
- `src/overlays/popovers.js`, `src/overlays/drawer.js` — existing subtask popover and drawer; home of the promote/demote/re-parent actions.
- `src/views/table.js`, `src/views/board.js`, `src/views/timeline.js` — the three surfaces to render the tree.
- `export/mspdi.js` — already emits per-task rows; add `OutlineLevel` from tree depth.
- `server.js:887` — existing `normalizeTaskAssignees` walk over `t.subtasks[]`; the pattern for tree-aware sweeps.
- `mcp.js` — writeDoc path for round-trip parity tests.

### Established Patterns
- `mergeClientDoc` funnel in `server.js` + client mirror in `src/core/store.js`/`src/actions/actions.js`: every new field needs the normalize whitelist + removal sweep, or it is silently stripped (D-53-1 precedent).
- Dual-backend FTS parity suite (FTS5 contentless shadow + pg `task_search_projection`) — byte-identical tests must be extended for subtask titles.
- SQLite+pg mirror tables created in the same commit when server tables are needed.
- D-02 lazy-loading pattern for new UI (chunk gate 498.11/500 kB).

### Integration Points
- Funnel diff point (also where Phase 67 will hang `diffWebhookEvents` — tree changes must produce a detectable doc diff).
- MCP writeDoc round-trip tests (SUB-04).
- Ctrl-K search palette (`src/pages/search.js`) for the subtask-hint result rendering.

</code_context>

<specifics>
## Specific Ideas

- Depth semantics clarified with the owner during discussion: the cap is nesting levels (5 levels of subtasks under a task), not subtask count — count is unlimited.
- Whole-move rejection on overflow/cycle: the UI must present the localized error without leaving the tree half-moved.
- Amendment session (2026-11-15, post-halt): owner approved a concrete stored-doc example before locking — `{ id:"u1", parentId:null, position:0 }`, `parentId:"u2"` for a child of subtask u2, task implicit at level 0.
- Owner's concern driving the amendment: moves under array-order semantics rewrite sibling entries; `position` localizes the diff to the moved node.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 65-Subtask Tree*
*Context gathered: 2026-11-15*
