# Phase 65: Subtask Tree - Research

**Researched:** 2026-11-15
**Domain:** Repo-internal feature — hierarchical subtasks over the one-workspace-doc spine (mergeClientDoc funnel, dual-backend FTS, MSPDI/xlsx/CSV exports, MCP writeDoc, three view surfaces)
**Confidence:** HIGH (all findings grounded in this session's direct file reads; no external technology is introduced — zero new dependencies is a standing constraint)

## Summary

Phase 65 is a pure repo-extension phase. There is no external stack to research: the project's locked constraint is **zero new runtime or dev dependencies** and every finding below is a direct code read of the exact seams CONTEXT.md names. The existing subtask model is a flat, ordered `t.subtasks[]` array of `{ id, title, done, note?, due?, start?, assignees[] }` objects with **no `parentId`** — subtasks are one level deep, rendered only in the task drawer, board-card progress row, timeline count chip, and the opt-in export child rows. Adding `parentId` + tree semantics touches: the funnel (normalize sweeps, new server validators), client store helpers (`taskProg`), three view renderers (table, board, timeline), the drawer/popover restructuring UI, FTS projection on both backends, the export model + MSPDI `OutlineLevel`, and MCP tool schemas.

**Primary recommendation:** Build one shared tree module (build tree from flat array, depth calc, cycle check, subtree gather, rollup-aware progress) consumed by server validator, client views, and exports alike (server-side copy for `export/` which must stay import-free of DOM-touching modules); thread `id`/`parentId` through the normalize/strip sweeps as sibling fields of the existing assignees sweep; extend `syncTaskFts`'s title/body fold with subtask titles; render the tree in table/board/timeline from a session-only collapse map in `S.ui`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flat `t.subtasks[]` + `parentId`. Subtasks of subtasks are entries in the same single ordered array; only tasks carry a `subtasks[]` array. Tree built by grouping on `parentId`. One-way reversibility — the shape is written into every stored workspace doc and mirrored across mergeClientDoc whitelist, FTS projection, exports, and MCP.
- **D-02:** Each subtask object carries a stable uuid-style id; `parentId` references the parent subtask's id, `null` for roots. Re-parenting and cycle checks rely on stable identity.
- **D-03:** Sibling order = array order in the single `t.subtasks[]` array — no separate sibling-order field.
- Note: `parentId` and subtask id MUST join the `mergeClientDoc` normalize whitelist or they are silently stripped (removal-sweep precedent at `server.js:2579` for subtask assignees).
- **D-04:** Max 5 subtask nesting levels under a task (task = level 0). Unlimited children per node.
- **D-05:** Promote/demote/re-parent that would push any node past level 5 (or create a cycle) is rejected wholesale by the server at the funnel with a localized error — no partial state, no clamping.
- **D-06:** Subtask titles ARE indexed in FTS projection (`task_search_projection` + FTS5, SQLite+pg byte-identical parity suite extended).
- **D-07:** Search hit from a subtask title shows the parent task with a subtask-hint ("via subtask: …"); clicking opens the task drawer — no deep-link.
- **D-08:** Projection follows the doc: deleting a subtask removes its title from the index on the task's next funnel write; no separate sweep.
- **D-09:** Restructuring via popover/drawer-context-menu actions (promote/demote/re-parent) — no drag-and-drop. Keeps the ~2 kB chunk headroom.
- **D-10:** Collapse/expand state is session-only component state — not persisted.
- **D-11:** Board card shows a count badge of open subtasks; tapping expands the checklist in the existing card popover pattern. No nested kanban.
- **D-12:** Table/list views get full indent + collapse caret tree; timeline renders subtask bars indented under the parent, collapsible — subtasks without dates inherit the parent's date range.

### the agent's Discretion
- Exact error-message keys and i18n wording (EN+FR same commit).
- Internal naming of tree-building helpers, validation function shape, and how the rollup `progressOf`/`taskProg` is refactored to avoid double-counting nested progress.
- Details of the FTS hint rendering in search results.

### Deferred Ideas (OUT OF SCOPE)
- None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | Multi-level tree in list/table (indent + collapse carets), board child-count badge, no nested kanban | Table renders tasks only today (`src/views/table.js`); board already has a `sd/len` progress row (`src/views/board.js:13-18`) to upgrade to an open-count badge; D-10 session-only collapse map fits the existing `S.ui.collapsedGroups` pattern |
| SUB-02 | Promote/demote/re-parent one level at a time; server rejects cycles/depth overflow at the funnel; children follow parent on delete | Funnel lives in `mergeClientDoc` (`server.js:1258`); existing one-level `A.promoteSub` (convert to task) is a *different* action that must be kept distinct from tree-level promote; delete cascade = filter `subtasks[]` by subtree membership |
| SUB-03 | Completing parent auto-completes open descendants; parent progress is computed rollup, never double-counting | `taskProg` (`src/core/store.js:496-500`) is the rollup point; cascade must run server-side at the funnel (writeDoc PUT is whole-doc, so server recomputes) and client mirror |
| SUB-04 | Tree survives every surface: normalize sweeps, FTS projection, MSPDI OutlineLevel, xlsx/CSV rows, MCP writeDoc round-trip | All seams verified below; MCP `add_subtask` emits `{id,title,done}` only (mcp.js:1370) and `update_task`'s `tasks[]` key-check whitelist (mcp.js:1684) will need `parentId` handling |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tree validation (depth cap, cycle, one-level moves) | API/Backend (funnel) | Client mirror | D-05 mandates server-side wholesale rejection; client mirrors for UX but server is authority (established "authority-not-advisory" convention, `server.js:1529`) |
| Tree building / rendering | Browser/Client (views) | — | Pure projection of doc data; no server render |
| Auto-complete cascade + progress rollup | API/Backend | Client (`taskProg`) | Owner ruling SUB-03: cascaded `done` must be durable even when the edit arrives via MCP or API, so it belongs at the funnel; client mirrors for instant UI |
| FTS subtask-title indexing | Database/Storage (adapter) | — | `syncTaskFts`/`ftsSweep` in `db-adapter.mjs` are the single index seam for both backends |
| MSPDI OutlineLevel / xlsx/CSV rows | API/Backend (export writers) | `src/export/model.js` (shared model) | Writers are server-only DOM-free modules fed by `buildExportModel` |
| Restructure actions (promote/demote/re-parent) | Browser/Client (popovers/drawer) | API funnel | No new write path — actions mutate the doc and ride the normal doc-PUT (D-09) |
| MCP round-trip | API/Backend (mcp.js) | — | MCP tools are separate write paths into `writeDoc`; their schemas/builders must carry `parentId` |

## Standard Stack

No new packages — zero-dependency constraint is a standing gate (REQUIREMENTS.md line 6). Everything uses existing in-repo infrastructure:

| Facility | Location | Purpose | Provenance |
|----------|----------|---------|------------|
| `mergeClientDoc` funnel | `server.js:1258` | Every doc write funnels here; new validators + sweeps plug in around task merge | [VERIFIED: server.js:1258-1306] |
| `normalizeTaskAssignees` walk | `server.js:872-890` | The recursive task→subtask sweep pattern; the tree-aware sweeps copy this shape | [VERIFIED: server.js:872-890] — recursion at line 887-888: `if (Array.isArray(t.subtasks)) { for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds); }` |
| Subtask-assignee removal sweep | `server.js:2585-2586` in `stripMember` | The "silent strip" precedent CONTEXT cites: `if (Array.isArray(next.subtasks) && next.subtasks.some(s => Array.isArray(s?.assignees) && s.assignees.some(hit))) { next.subtasks = next.subtasks.map(s => (Array.isArray(s?.assignees) ? { ...s, assignees: s.assignees.filter(id => !hit(id)) } : s)); }` | [VERIFIED: server.js:2582-2589] |
| `syncTaskFts` / `ftsSweep` | `db-adapter.mjs:515-573` / `608-659` | In-tx diff sync + boot sweep; subtask titles fold into the title/body text here for BOTH backends | [VERIFIED: db-adapter.mjs:515-573] — diff skip condition line 555: `if (nt && nt.title === t.title && nt.desc === t.desc && nt.project === t.project) continue;` — a subtask-title-only change currently skips the index; this condition must be extended or the change is invisible to FTS |
| FTS tables | `db-adapter.mjs:488-506` | SQLite: `task_fts using fts5(ws_id UNINDEXED, task_id UNINDEXED, project_id UNINDEXED, title, body, tokenize='unicode61 remove_diacritics 2')`; pg: `task_search_projection (workspace_id, task_id, project_id, folded, projection tsvector)` | [VERIFIED: db-adapter.mjs:491-504] — subtask titles fold into existing `title`/`folded` text columns; **no schema change needed** (D-06 fits without ALTER) |
| `buildExportModel` | `src/export/model.js:96-220` | Emits child rows keyed `PARENT.n` with `parent: t.id`; tree children become additional rows in this loop | [VERIFIED: src/export/model.js:185-219] |
| MSPDI writer | `export/mspdi.js:186-286` | Already emits `<OutlineLevel>1</OutlineLevel>` when `row.parent` (mspdi.js:283); needs depth-based level + `<Summary>` only for rows that parent child rows (already computed at line 208 via `summaryIds = new Set(rows.map(r => r?.parent).filter(Boolean))` — will need to become subtree-aware) | [VERIFIED: export/mspdi.js:194-208, 282-284] |
| MCP writeDoc tools | `mcp.js` | `add_subtask` builds `{ id: uid(), title, done: false }` (mcp.js:1370) — no parentId; `toggle_subtask` mutates in place (parent-safe); `create_task` maps title strings to subtask objects (mcp.js:1238); `putTask`-style tasks[] item key whitelist at mcp.js:1684-1693 | [VERIFIED: mcp.js:1362-1379, 1238, 1684-1693] |
| Client rollup | `src/core/store.js:496-500` | `taskProg`: `if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);` — becomes the nested-aware rollup | [VERIFIED: src/core/store.js:496-500] |
| Restructure actions | `src/actions/subtasks.js:56-82` | Existing `A.promoteSub` converts a subtask to a top-level TASK — tree-level promote/demote/re-parent are NEW actions beside it; keep the naming distinct | [VERIFIED: src/actions/subtasks.js:56-82] |
| Drawer subtask list | `src/overlays/drawer.js:104-105` | Flat checklist render — becomes the recursive tree render | [VERIFIED: src/overlays/drawer.js:104-105] |
| Search palette | `src/pages/search.js:35` | Result row template with `data-a="openTask"` — subtask-hint rides here (D-07) | [VERIFIED: src/pages/search.js:35] |

**Note on D-01's "normalize whitelist":** There is no field-level whitelist that strips unknown subtask fields today — tasks and subtasks merge as whole objects (`mergeClientDoc` deep-copies via `JSON.parse(JSON.stringify(incoming))` at server.js:1259 and merges by id via `mergeList` at server.js:1478). The genuine silent-strip risks are: (1) `normalizeDoc`/`mergeClientDoc` *field deletes* that target top-level keys (notifPrefs, views) — no subtask risk; (2) MCP tool builders that **reconstruct** subtask objects with only `{id,title,done}` (mcp.js:1238, 1370) — an MCP-driven write would drop `parentId`/`note`/`due`/`start`/`assignees` on newly built rows, but rows built this way are new roots so the real risk is narrow; (3) the *invariant* that future sweeps (member-strip, label-strip, etc.) copy the whole subtask object with spread (as line 2586 does) rather than rebuilding it. The planner should still add a regression test: a doc PUT carrying `parentId` must round-trip byte-identically.

**Installation:** none — zero new dependencies.

## Package Legitimacy Audit

No external packages are installed by this phase (zero-dependency standing constraint, REQUIREMENTS.md line 6). Audit skipped — nothing to verify.

## Architecture Patterns

### System Architecture Diagram

```
 Client edit (drawer/popover promote/demote/re-parent; toggle; delete)
        │  mutate doc in S.data → save() → doc-PUT (whole workspace doc)
        ▼
 mergeClientDoc (server.js:1258)  ◄── also fed by MCP writeDoc paths
        │  1. normalize sweeps over t.subtasks[] (assignees … + NEW: parentId/id sanitization)
        │  2. NEW tree validators: cycle check, depth-cap check (D-04/D-05) → throw localized error code
        │  3. NEW parent-done cascade: completing a parent marks open descendants done (SUB-03)
        │  4. mergeList tasks → merged doc persisted (revision+1)
        ▼
 ┌──────────────────────┬───────────────────────────┬──────────────────────┐
 ▼                      ▼                           ▼                      ▼
 syncTaskFts         docForClient              export routes           poll/hydrate
 (db-adapter.mjs)    (redacted read)           buildExportModel →      client applyDoc →
  subtask titles                              MSPDI OutlineLevel /    taskProg rollup →
  folded into title/                          xlsx / CSV child rows   table/board/timeline
  body on BOTH backends                                               render from S.ui collapse map
```

MCP writeDoc tools (`create_task`, `add_subtask`, `toggle_subtask`, `update_task`, tasks[] put) sit beside the doc-PUT and reach the same funnel; their schemas/builders must carry `parentId` so a round-trip (SUB-04) is identity-preserving.

### Recommended Project Structure

```
src/core/subtree.js            # NEW shared tree helpers: buildSubtree(t)→nodes, depthOf, wouldCycle, gatherDescendants, rollupProg — DOM-free so server tests can import
server.js                      # funnel validators + cascade + sweeps (inline, following existing inline-funnel style)
db-adapter.mjs                 # syncTaskFts/ftsSweep fold subtask titles
export/mspdi.js                # OutlineLevel from row depth
src/export/model.js            # child rows for nested subtasks (level-aware keys)
src/views/table.js, board.js, timeline.js   # tree rendering
src/overlays/drawer.js, popovers.js          # tree render + restructure actions
src/actions/subtasks.js        # promote/demote/re-parent actions
src/pages/search.js            # subtask-hint rendering
mcp.js                         # schema/builder parentId parity
src/core/i18n.js               # EN+FR keys same commit
```

### Pattern 1: Tree-aware sweep (copy of normalizeTaskAssignees)

**What:** Any sweep that must reach nested subtasks walks the flat array and recurses.
**When to use:** every normalize/strip pass that touches subtask fields.
**Example** (existing, the template — [VERIFIED: server.js:887-889]):
```js
if (Array.isArray(t.subtasks)) {
  for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds);
}
```
New sweeps follow the same shape: mutate in place on the object (the array is flat — no reassembly needed), never rebuild objects field-by-field.

### Pattern 2: Tree construction from the flat array (D-01/D-03)

```js
// Group roots and children by parentId; sibling order = array order (stable).
function buildTree(t) {
  const byParent = new Map(); // parentId(null for roots) -> [subtask,...] in array order
  for (const s of t.subtasks) {
    const k = s.parentId ?? null;
    (byParent.get(k) ?? byParent.set(k, []).get(k)).push(s);
  }
  return byParent;
}
// depth(node) = 1 + depth(parent); task = level 0, roots = level 1 … cap 5 (D-04).
```
Cycle check: walk `parentId` chain from the node's new parent — if you reach the node itself, reject. Because the array is flat and ids are unique per task, this is a bounded walk (≤ subtask count).

### Pattern 3: Rollup progress that never double-counts (SUB-03)

`taskProg` currently counts `t.subtasks.filter(s=>s.done)` — with nesting, counting top-level done subtasks **is** the rollup if parents' `done` is derived, or count leaf-level done only. Recommendation (agent discretion): make the rollup recursive over the tree — a subtask is "done" for rollup purposes when itself done OR all its children are done — computed over the tree once; count only top-level subtasks (children of the task) as units so nested progress is never counted twice. Mirror the same rule server-side where the funnel recomputes `done` on cascade.

### Pattern 4: Session-only collapse state (D-10)

`S.ui` already carries per-view transient state (`collapsedGroups`, `collapsedCols` — [VERIFIED: src/core/store.js:135, 152]). Add e.g. `S.ui.subCollapsed = {}` keyed by subtask id; never written into `docSnapshot()` (the snapshot carries only `{data, prefs, collapsed}` — [VERIFIED: src/core/store.js:172-175]).

### Anti-Patterns to Avoid

- **Rebuilding subtask objects field-by-field in sweeps:** the assignee sweep at server.js:2586 correctly uses spread (`{ ...s, ... }`); a field-rebuilding sweep would silently drop `parentId`/`note`. Always spread.
- **Deriving depth from array index:** sibling order is array order (D-03) but depth comes ONLY from `parentId` chains. Positions in the array are not levels.
- **Client-only cascade:** completing a parent via MCP or a stale client must still auto-complete descendants — the cascade runs at the funnel, the client merely mirrors for instant feedback.
- **Altering the FTS tokenizer or adding columns:** the tokenizer is locked at table creation ("D-11: the tokenizer is LOCKED… changing it later requires dropping and rebuilding task_fts for every workspace" — [VERIFIED: db-adapter.mjs:482-484]); fold subtask titles into the existing `title`/`body` text instead.
- **`import` from src/ into export/:** export/mspdi.js documents the prohibition test ("the prohibition test fails the moment a src/ module reaches this file" — [VERIFIED: export/mspdi.js:4-6]); tree helpers needed by exports must be self-contained in the export model or duplicated there deliberately.
- **Fuzzy 'promote' naming collision:** existing `A.promoteSub` (subtask → task conversion) already occupies "promote"; name tree actions distinctly (e.g. `subPromoteLevel`/`subDemoteLevel`/`subReparent`) or rename the old one in the same commit.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backend-parity index writes | Trigger-based or dialect-specific sync | `syncTaskFts`/`ftsSweep` seam (one code path, tx-scoped) | "No SQLite triggers — one code path for both backends, proven by test" [VERIFIED: db-adapter.mjs:461-475] |
| Whole-doc merge/permission gates | New write path for restructure ops | Existing doc-PUT through `mergeClientDoc` | Owner ruling: no new write path; refusal/refusal-code plumbing already exists (`refusals` array, server.js:1258) |
| UUID generation | Custom id scheme | Existing `uid('s')` helper (src/actions/actions.js:910 pattern) | Ids are opaque strings; `parentId` needs only string equality |
| Export document structure | New export pipeline | `buildExportModel` rows + writer template strings | MSPDI is positional ("one reordered child triggers Project's repair prompt" [VERIFIED: export/mspdi.js:17-19]) — extend, never reorder |
| Localized errors | Ad-hoc message strings | `httpError(409/400, msg, code)` + error-codes catalogue + i18n keys | `error-codes.test.mjs` and i18n gates enforce the pattern |

## Runtime State Inventory

Not a rename/migration phase per se, but stored docs already exist — the shape change is additive, and the inventory matters:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Every workspace doc's `data.tasks[*].subtasks[]` rows (SQLite `workspaces.doc` JSON + pg mirror) — existing subtasks have NO `parentId` field | Additive: absent `parentId` = root. `normalizeDoc`/funnel should tolerate missing `parentId` (treat `undefined` as `null`). No backfill migration needed |
| Live service config | None — verified: no external service holds subtask state (FTS tables are derived and rebuilt by `ftsSweep`) | None |
| OS-registered state | None — verified (no schedulers/daemons register task content) | None |
| Secrets/env vars | None affected | None |
| Build artifacts | FTS indexes (`task_fts` / `task_search_projection`) hold title+desc folds WITHOUT subtask titles — stale relative to D-06 until next funnel write or boot sweep | One-time backfill: either bump the `fts_meta` staleness semantics so the boot sweep rebuilds, or run a manual `ftsSweep` per workspace in a boot migration; test it |

## Common Pitfalls

### Pitfall 1: The FTS diff-sync skip condition hides subtask-title changes
**What goes wrong:** `syncTaskFts` skips re-index when "no task id/title/desc/project changed" (`nt.title === t.title && nt.desc === t.desc && nt.project === t.project` — db-adapter.mjs:555). Adding subtask titles without touching this condition means a subtask rename never reaches the index (D-08 fails silently).
**Why it happens:** the condition predates tree subtasks.
**How to avoid:** extend the comparison to the folded subtask-title text (or the subtasks array identity), and mirror it in `ftsSweep`'s staleness marker if task_count semantics change.
**Warning signs:** search finds a renamed subtask's old title only; parity tests compare SQLite vs pg rows byte-identically and would catch divergence.

### Pitfall 2: `syncTaskFts` must go through the tx scope on pg
**What goes wrong:** module-level `run()` inside a tx body lands OUTSIDE the checked-out pg client ("Pitfall 2" — db-adapter.mjs:466-468).
**How to avoid:** any new index write follows the existing `scope.run`/`scope.get` discipline inside `tx`.

### Pitfall 3: Cycle/depth validation must reject WHOLESALE, not partially
**What goes wrong:** D-05 forbids clamping or partial moves. A client that already mutated its local tree before the server rejects would show a half-moved tree.
**How to avoid:** server throws with a code (e.g. `subtaskCycle` / `subtaskDepthOverflow`); client `mutate()` already rolls back on push failure? — **verify**: client optimistic mutation + doc-PUT failure sets `S.ui.conflict` (store.js:194) but does NOT auto-rollback; the UI must present the localized error and let the next hydrate heal, or pre-validate client-side with the same helper before mutating. Use the shared tree helper in both places so the checks can't diverge.
**Warning signs:** e2e asserting "UI shows error and tree unchanged".

### Pitfall 4: MCP tools reconstruct subtask objects
**What goes wrong:** `create_task` maps title strings → `{ id, title, done:false }` (mcp.js:1238) and `add_subtask` builds `{ id: uid(), title, done:false }` (mcp.js:1370); if tree fields must round-trip, new MCP-created roots are fine, but `update_task`'s `tasks[]` item unknown-key check (mcp.js:1684-1685: `if (Object.keys(t).some(k => !['title','description','status','assignee','priority','due','start','labels','recur','estimate','subtasks'].includes(k)))`) rejects any payload carrying subtask-level `parentId` if the round-trip test posts doc-shaped tasks back through it.
**How to avoid:** extend the key whitelist and the subtask builders in the same commit; the round-trip test (SUB-04) must exercise: doc-PUT in → MCP get_task → MCP write → doc-PUT out → tree byte-identical.

### Pitfall 5: Board/timeline/table count subtasks differently
**What goes wrong:** board shows `sd/len` over ALL subtasks (board.js:13-18), timeline shows the same (timeline.js:124), drawer shows `sd/len` (drawer.js:38). After nesting, D-11 says board badge = count of OPEN subtasks; rollups must not double-count.
**How to avoid:** one shared rollup/count helper consumed by all three surfaces.

### Pitfall 6: Chunk gate headroom is ~2 kB
**What goes wrong:** 498.11 kB < 500 kB; tree rendering in table/timeline is inline template code — a naive recursive renderer with helpers could push over.
**How to avoid:** keep the tree helper module small, reuse existing icon/css primitives; `build-chunk-size.test.mjs` enforces the gate; lazy-load anything beyond core render (D-02 pattern).

### Pitfall 7: MSPDI OutlineLevel must be depth-correct and Summary-correct
**What goes wrong:** current writer emits `<OutlineLevel>1</OutlineLevel>` for any child and `<Summary>` for parents of children; with 5 levels, level must be `depth+1` and Summary must be set for any row that parents child rows at ANY level. MSPDI is positional — nested rows must appear in document order (DFS over the tree, array order for siblings) or Project's repair prompt fires.
**How to avoid:** compute depth during `buildExportModel` row emission (it already emits rows in parent-then-children order at src/export/model.js:133-219 — extend the same loop recursively); extend `export-mspdi.test.mjs` expectations.

### Pitfall 8: Tree changes must produce a detectable doc diff (Phase 67 dependency)
**What goes wrong:** Phase 67's `diffWebhookEvents(storedDoc, next)` hangs at the funnel diff point and the 8-event vocabulary includes `subtask.tree-changed`; if restructure ops are expressed as ordinary array edits, the diff is still detectable (whole-object compare) but must be tested.
**How to avoid:** keep restructures as plain doc mutations (no out-of-band channel) and pin a funnel-level test that a promote/re-parent produces a detectable stored-vs-next task diff.

## Code Examples

### Server funnel validation (shape, following existing guard style — [VERIFIED pattern: server.js:1546-1556 write-guard])
```js
// Inside mergeClientDoc, after normalize sweeps, before persist:
for (const t of nextData.tasks || []) {
  const err = validateSubtree(t);            // shared helper
  if (err) { const e = new Error(err.msg); e.code = err.code; throw e; }
}
// validateSubtree: builds parentId map, walks each node:
//  - unknown parentId → reject (dangling)
//  - parentId === own id or reachable ancestor → subtaskCycle
//  - depth(node) > 5 → subtaskDepthOverflow
```
Localized client toast keys: `toast.subtaskCycle`, `toast.subtaskDepth` (EN+FR same commit — agent discretion on wording).

### Parent-done cascade (SUB-03)
```js
// At the funnel, after merge: for any task whose status became 'done',
// mark every descendant s.done = true (walk subtree via parentId).
// Client mirror in actions.js toggleDone path for instant UI.
```

### FTS fold extension ([VERIFIED: db-adapter.mjs:532-550])
```js
const foldedTitle = foldForSearch(t.title).text;
const foldedBody = foldForSearch(stripTags(t.desc)).text;
// NEW: append subtask titles — D-06/D-07 (hint needs which subtask matched)
const subs = (Array.isArray(t.subtasks) ? t.subtasks : []).map(s => s?.title).filter(Boolean);
const subFold = foldForSearch(subs.join(' ')).text;
// SQLite: body = foldedBody + ' ' + subFold … pg: folded = foldedTitle + ' ' + foldedBody + ' ' + subFold
```
D-07 hint: the search hit currently returns only `task_id, project_id` (searchTasks, db-adapter.mjs:581-598). To render "via subtask: …" the server must know WHICH subtask matched — either post-filter the parent task's subtask titles by the terms in server code, or store per-subtask rows. **Recommendation:** post-filter in the route (no schema change, keeps both backends symmetric); if a subtask title matched, surface the first matching title. This is discretion-area design (D-07 details).

### Table view tree row (SUB-01, D-12)
Existing title cell (table.js:32) gains, for subtask rows rendered under the parent task row: an indent style `padding-left: calc(16px * depth)` + caret button toggling `S.ui.subCollapsed[sid]` + the `data-a="openTask"`-style open affordance pointing at the PARENT task drawer (no deep-link, D-07 analog). Subtask rows reuse the drawer's field inheritance (due/start inherit parent — already the drawer's behavior at drawer.js:105).

### Board badge (D-11)
board.js:13-18 currently: `${t.subtasks.length ? \`<div class="subp">${ic('list-checks', 12)}<span class="num">${sd}/${t.subtasks.length}</span>…` — becomes open-count badge opening the existing card popover checklist.

### Timeline bars (D-12)
timeline.js:124 renders one row per task with a subtask count chip; add indented subtask rows (collapsible via the same S.ui map), dates `s.start || t.start` / `s.due || t.due` (the exact inheritance the drawer and export model already use — [VERIFIED: src/export/model.js:202-203]).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scalar `assignee` on tasks/subtasks | `assignees[]` arrays with normalize sweeps (Phase 55) | 2026-11 (D-55-x) | The sweep pattern this phase copies; new sweeps must be recursive over subtasks |
| Doc-carried prefs/views/notifPrefs | Server tables / stripped fields (Phases 34/57) | earlier | Reinforces: collapse state must NOT ride the doc (D-10) |
| One-level subtasks (drawer checklist only) | Tree via parentId (this phase) | — | Touches every consumer listed above |

**Deprecated/outdated:** none relevant — no external APIs consumed.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Client optimistic mutation is not auto-rolled-back on server rejection (`S.ui.conflict` is set but local tree stays mutated); the UI must pre-validate or rely on hydrate-heal | Pitfall 3 | e2e "tree unchanged after rejection" fails; plan must specify pre-validation via the shared helper |
| A2 | One-time FTS backfill for existing workspaces is needed (index has no subtask titles today) and the `fts_meta` marker (task_count vs indexed count) will NOT self-trigger a rebuild from a subtask-title-only change | Runtime State / Pitfall 1 | Search misses subtask titles until the next title/desc change per task; needs explicit sweep migration |
| A3 | `uid('s')` / `uid()` produce collision-safe string ids adequate as `parentId` references | Standard Stack | If ids collide or are numeric-index-like, cycle checks and grouping break |
| A4 | MSPDI child-row order in `buildExportModel` is already parent-then-children DFS; nested extension preserves that property | Pitfall 7 | Project repair prompt on open (positional schema) |
| A5 | `memberCanReadProject` guard already iterates subtask assignees flat (server.js:1546-1552) and needs no nesting change (assignees arrays remain per-subtask fields, depth-independent) | — | Permission leak through nested subtasks if the guard skips deeper rows — it reads `t.subtasks` flat so ALL subtasks (nested or not) are covered; low risk, but the plan should add a nested-subtask assignee guard test |

## Open Questions

1. **Does the pg backend need the same subtask-title fold verified byte-identically?**
   - What we know: parity suite exists (`test/db-adapter.test.mjs`, `test/search-fts.test.mjs`) and D-06 mandates extending it.
   - What's unclear: whether pg CI runs in this environment (adapter branches on `backendKind`).
   - Recommendation: planner includes the parity test extension; if the pg harness is env-gated, follow the existing test's skip convention.
2. **Collapse caret a11y/i18n key inventory** — agent discretion, but the i18n scan gate requires every new key present in EN+FR catalogues in the same commit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | tests/server | ✓ | v24.21.0 (engines >=24 [VERIFIED: package.json]) | — |
| Vite build (chunk gate) | chunk-size test | ✓ | ^6.4.4 | — |
| Playwright | e2e 115/115 baseline | ✓ | ^1.64.1 | — |
| PostgreSQL (pg parity tests) | FTS parity suite | env-dependent — adapter branches on `backendKind` | — | Existing test skip convention (Open Question 1) |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test --test-concurrency=2 test/*.test.mjs` (Node test runner) + Playwright e2e |
| Config file | `package.json` scripts; `eslint.config.js`; `e2e/playwright.config.mjs` |
| Quick run command | `node --test test/subtask-tree.test.mjs` (new) |
| Full suite command | `npm test` (1524 baseline, grow never shrink) then `npm run e2e` (115/115) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-01 | Tree renders in table/board/timeline; collapse; badge | e2e + client-surfaces unit | `npm run e2e -- --grep subtask` / `node --test test/client-surfaces.test.mjs` | ❌ Wave 0 (new e2e spec + assertions) |
| SUB-02 | Promote/demote/re-parent; cycle & depth rejection; delete cascade | unit (funnel) | `node --test test/subtask-tree.test.mjs` | ❌ Wave 0 |
| SUB-03 | Parent-done cascade; rollup no double-count | unit | `node --test test/subtask-tree.test.mjs` | ❌ Wave 0 |
| SUB-04 | normalize sweeps keep parentId; FTS title index SQLite+pg parity; MSPDI OutlineLevel; xlsx/CSV rows; MCP round-trip | unit | `node --test test/db-adapter.test.mjs test/export-mspdi.test.mjs test/export-model.test.mjs test/mcp-*.test.mjs` | ❌ extend existing files |

### Sampling Rate
- **Per task commit:** the new `test/subtask-tree.test.mjs` + touched-file tests
- **Per wave merge:** `npm test`
- **Phase gate:** full unit suite + e2e 115/115 + `npm run build` (i18n scan + chunk gate) + `npm run lint`

### Wave 0 Gaps
- [ ] `test/subtask-tree.test.mjs` — funnel validators, cascade, rollup, sweeps (SUB-02/03/04)
- [ ] Extend `test/db-adapter.test.mjs` + `test/search-fts.test.mjs` — subtask-title indexing parity (SUB-04, D-06/D-08)
- [ ] Extend `test/export-model.test.mjs` / `test/export-mspdi.test.mjs` — nested rows + OutlineLevel (SUB-04)
- [ ] New e2e spec for tree navigation + restructure error toast (SUB-01/02)
- [ ] MCP round-trip parity test (SUB-04)

## Security Domain

security_enforcement is not disabled in config (key absent → enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | yes | `memberCanReadProject` write-guard already covers subtask assignee arrays (server.js:1546-1556); extend tests to nested rows; restructure ops inherit the per-task 'Can edit' gate (server.js:1342-1350) |
| V5 Input Validation | yes | Funnel validators (cycle/depth/dangling parentId) + existing schema validators; MCP schema objects |
| V2/V3/V6 | no | No auth/session/crypto changes in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Crafted doc PUT with cyclic/deep parentId (DoS on renderer) | Tampering | Server-side cycle+depth validation BEFORE persist; client renderer defensive depth cap |
| Permission leak via nested subtask assignees | Elevation | Existing write-guard reads `t.subtasks` flat — all rows covered; add regression test (A5) |
| Search surfacing subtask titles from hidden projects | Information disclosure | FTS index is per-workspace; project visibility filtering happens at result rendering (`project_id` returned, route filters via `canSee` — verify route-side filter covers the new hint text) |

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `server.js` lines 812-906 (normalizeDoc, normalizeTaskAssignees), 1258-1556 (mergeClientDoc, write-guard), 2567-2605 (stripMember sweep)
- `db-adapter.mjs` lines 455-664 (FTS seam, syncTaskFts, searchTasks, ftsSweep)
- `export/mspdi.js` (full), `src/export/model.js` (full)
- `src/core/store.js` (full), `src/actions/subtasks.js` (full), `src/views/table.js`, `src/views/board.js:13-18`, `src/views/timeline.js:124`, `src/overlays/drawer.js:104-105`, `src/pages/search.js:35`
- `mcp.js` lines 1180-1434, 1684-1693
- `package.json` (scripts, engines, deps)
- `.planning/` docs: 65-CONTEXT.md, REQUIREMENTS.md, STATE.md, config.json

### Secondary (MEDIUM confidence)
- None needed — no external technology questions.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Storage/funnel seams: HIGH — every claim is a quoted, line-cited read
- FTS/export/MCP seams: HIGH — read directly, exact conditions quoted
- UI rendering plan: HIGH on current code shape, MEDIUM on exact CSS/UX values (discretion area)
- Pitfall A1/A2: ASSUMED — flagged above

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (repo-internal; re-verify only if upstream phases land first)
