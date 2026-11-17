# Phase 71: Subtask columns in List view - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Make subtask rows in the List view display the same metadata columns as parent tasks: Status, Assignees, Priority, Due — aligned to the parent column grid. Today the subrows render through the shared `subTreeChecklistHtml` renderer with `{ compact: true }`, which strips ALL metadata (subtask-popovers.js:54 `opt.compact ? '' : …`).

**In scope:** List view subrows only (`task-list.js:83` renders via `treeChecklist.fn(t, { compact: true, rowClass: 'subrow' })`), the shared renderer's compact mode, grid template alignment.
**Out of scope:** Board subtask cards, Timeline, export channels (xlsx/MSPDI/CSV — untouched), subtask DETAIL drawer (already has all fields), status/priority data model (subtasks keep `done` boolean + no own priority — nothing new is stored).

</domain>

<decisions>
## Implementation Decisions

### Columns shown
- **D-71-1:** Subtask rows show 4 metadata columns matching the parent grid: Status, Assignees, Priority, Due. Aligned under the parent columns of the SAME row group (the `.c-meta` cells of the subrow must land in the same grid columns as the parent's `${cols.map(c => c-meta)}` cells — the subrow container must join the parent's grid template `18px 30px minmax(220px,1fr) ${cols…} 40px`, not the current flat flow).
- **D-71-2:** Status cell = a chip/pill derived from `s.done` (the model contract: subtasks carry `done`, never a real status). It stays EDITABLE inline — the existing `data-a="toggleSub" data-id data-sid` checkbox/pill interaction, clicking toggles done. No status popover.
- **D-71-3:** Assignees cell = the subtask's OWN assignees (`s.assignees`, avStack like the parent's cellAssignee), read-only display (editing stays in the subtask-detail drawer / subassignee popover there). Empty shows the unassigned/empty state, not the parent's assignees.
- **D-71-4:** Priority cell = the PARENT task's priority pill, inherited for display only (`prPill(t.priority)` style, visually the same pill — subtasks have no own priority in the model; owner chose inheritance over a dash or editable own priority).
- **D-71-5:** Due cell = `s.due || task.due` with the EXISTING inherited-value affordance: when the value comes from the parent (`!s.due && task.due`) show the `page.subtask.inheritedDue` tooltip (same contract as the drawer, subtask-detail.js:27, and the compact renderer, subtask-popovers.js:57). Overdue styling (`diffD(parse(due), TODAY) < 0 && !s.done` → `.over` class) carries over from the compact renderer's logic. Read-only.

### Renderer contract
- **D-71-6:** The change lives in the SHARED renderer `subTreeChecklistHtml` (features/subtask-popovers.js) — the compact flag must stop stripping metadata. Surfaces that pass `{ compact: true }`: the List view subrows (task-list.js:83) and the board card popover (subtask-popovers.js:72). The drawer checklist passes non-compact already. Both compact surfaces get the 4-column treatment: the renderer emits the metadata cells; each CONSUMER decides grid alignment (List = parent grid columns; board popover = its own layout, may stack/wrap). The renderer signature must stay backward-compatible (opt-in opt, e.g. `columns: true` or reuse compact with a layout hint) so the board popover cannot regress.
- **D-71-7:** Interaction contract: Status toggle stays live (toggleSub); Assignees/Priority/Due cells are NOT clickable for editing (no popovers inline) — the full edit surface remains the subtask-detail drawer. The line's open affordance (openSub via title click) unchanged.

### Owner-answered summary (2026-11-17)
- 4 columns: Status + Assignees + Priority (inherited) + Due — owner picked "Toutes les 4".
- Priority = inherited from parent — owner picked "Héritée du parent".
- Interaction = status editable inline only — owner picked "Statut seul éditable".

### the agent's Discretion
- Exact chip/pill visual for the done/todo status (reuse `stPill` style conventions or a lighter chip — must read as a status, not a bare checkbox).
- Grid alignment mechanism in the List (subrow joins the parent grid template vs its own matching template — planner picks, observable contract is column alignment per D-71-1).
- Whether Priority inherits visually dimmed (faint) to signal inheritance, or renders identically to the parent's pill — planner/researcher picks, document in plan.
- How the renderer handles the board-popover layout hint (separate opt vs shared markup).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The surfaces
- `src/components/task-list.js:18-24` — LCOLS grid definitions (status 126px, assignee 150px, priority 108px, due 104px, labels 168px); :80 the parent's `${cols.map(c-meta)}` cells; :87 the grid template string; :83 the subrows container calling `treeChecklist.fn(t, { compact: true, rowClass: 'subrow' })`; `cellStatus/cellAssignee/…` at :26-36 are the parent-cell patterns to mirror.
- `src/features/subtask-popovers.js:40-66` — the shared recursive renderer: :54 the compact stripping (`opt.compact ? '' : …`), :57-60 the due/start/assignees markup that ALREADY exists for non-compact mode (reuse, do not rewrite), :46 the indent `--ind:${depth*16}px`.
- `src/features/subtask-popovers.js:72` — the board card popover consumer (compact:true) — must not regress.
- `src/features/subtask-detail.js:19-31` — the drawer's field buttons (subassignee/subdue pops) and the inherited tooltips — the editing surfaces that stay canonical (List cells do NOT duplicate them).
- `src/ui/helpers.js` — `stPill`, `prPill`, `avStack`, `relDate`, `diffD`, `parse` — the shared primitives the cells compose.

### Model contract (no changes)
- Subtasks carry `done`, `assignees[]`, `due`, `start` — no own status/priority (Phase 65/69 contract; export model derives done/todo per D-70-2). This phase is display-only inheritance; nothing stored.

### i18n
- `page.subtask.inheritedDue` / `page.subtask.inheritedStart` exist (drawer + compact renderer use them). No new keys expected; if a tooltip for inherited PRIORITY is wanted (D discretion), add `page.subtask.inheritedPriority` EN+FR in the same commit (locales gate: src/locales/en.json, fr.json).

### Tests
- Find existing List view / task-list tests (grep test/ for task-list, listHtml, subrow) and the subtask renderer tests — planner enumerates exact pins; new assertions: subrow shows 4 cells aligned, status chip toggles via toggleSub, priority inherits parent, due shows inherited tooltip when !s.due.
- Standing gates: npm test grow-only from 1726 pass / 1739 total; lint exactly 15 baseline; build chunk ≤500000 bytes (UI code must stay within the lazy-chunk budget — subtask-popovers is a lazy chunk, task-list is core); zero new dependencies; EN+FR i18n gate if any new key.

</specifics>
</specifics>
