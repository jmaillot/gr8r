# Phase 65: Subtask Tree - Research

**Researched:** 2026-11-15
**Domain:** hierarchical subtask tree over the gr8r one-workspace-doc spine (client store + mergeClientDoc funnel + FTS/exports/MCP surfaces)
**Confidence:** HIGH (100% codebase-grounded; zero external libraries involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Flat `t.subtasks[]` array per task, each subtask a stable-id object with an explicit `parentId` (`null` = child of the task, otherwise the parent subtask's id — the task itself is the implicit level-0 root and never appears in `parentId`). Only tasks carry a `subtasks[]` array; all descendants are entries in that single array. — one-way (flat-vs-nested boundary accepted; flat→keyed-map stays mechanical).
- **D-01a:** Root subtasks use `parentId: null`. Task ids never appear inside `subtasks[]` entries.
- **D-02:** Each subtask object carries a stable id (uuid-style); `parentId` references the parent subtask's id, `null` for roots. Re-parenting and cycle checks rely on stable identity.
- **D-03:** Sibling order = explicit `position` integer on each subtask. Rendering and export ordering sort by `position` within each `parentId` group; array storage order is irrelevant. Ties/missing position are normalized to array order by the funnel on write.
- **D-04:** Maximum 5 subtask nesting levels under a task (task = level 0). Unlimited children per node — depth is the only structural limit.
- **D-05:** A promote/demote/re-parent that would push any node past level 5 (or create a cycle) is rejected **wholesale** by the server at the funnel with a localized error — no partial state, no clamping.
- **D-06:** Subtask titles ARE indexed in the FTS projection (`task_search_projection` + FTS5, SQLite+pg byte-identical parity suite extended).
- **D-07:** A search hit from a subtask title shows the parent task with a subtask-hint (e.g. "via subtask: …"); clicking opens the task drawer — no deep-link into subtasks.
- **D-08:** Projection follows the doc: deleting a subtask removes its title from the index on the task's next funnel write; no separate sweep.
- **D-09:** Restructuring via popover/drawer-context-menu actions (promote / demote / re-parent) — no drag-and-drop; enforces one-level-at-a-time; keeps the ~2 kB chunk headroom.
- **D-10:** Collapse/expand state is session-only component state — not persisted.
- **D-11:** Board card shows a count badge of open subtasks; tapping expands the checklist in the existing card popover pattern. No nested kanban.
- **D-12:** Table/list views get full indent + collapse caret tree; timeline/Gantt renders subtask bars indented under the parent, collapsible — subtasks without dates inherit the parent's date range.

### the agent's Discretion
- Exact error-message keys and i18n wording (EN+FR same commit).
- Internal naming of tree-building helpers, validation function shape, and how the rollup `progressOf`/`taskProg` is refactored to avoid double-counting nested progress.
- Details of the FTS hint rendering in search results.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (REQUIREMENTS.md future list also excludes drag-and-drop reparenting and MCP webhook management.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SUB-01 | Multi-level tree in list/table (indent + carets), board child-count badge, no nested kanban | `task-list.js` row renderer + `expandRow` caret already exist (flat); board badge exists (flat); extend to depth-aware recursive render with `position` ordering |
| SUB-02 | Promote/demote/re-parent one level at a time; server rejects cycles + depth overflow at funnel; children follow parent on delete | New `normalizeSubtasksTree`/`validateSubtree` pass in `mergeClientDoc` mirroring `normalizeTaskAssignees` recursion; `rmSub` cascade rewrite |
| SUB-03 | Completing parent auto-completes open descendants; parent progress = computed rollup, never double-counts | Extend `toggleSub`/task-completion mutate; rewrite `taskProg` (store.js:498) and export `taskProgress` (model.js:44) to leaf-only rollup |
| SUB-04 | Tree shape survives mergeClientDoc sweeps, FTS projection, MSPDI OutlineLevel, xlsx/CSV rows, MCP writeDoc round-trip | `syncTaskFts` diff loop extension; export model recursive subtask rows; mspdi `OutlineLevel` by depth; mcp.test.mjs parity extension |
</phase_requirements>

## Summary

The codebase already has a **flat, one-level** subtask model: `t.subtasks[]` of `{id, title, done, assignees?, start?, due?, note?}` (client `uid('s')` ids), rendered flat in drawer checklist (`drawer.js:105`), table subrows (`task-list.js:72`), board count (`board.js:18`), timeline count (`timeline.js:124`). Server-side, `normalizeTaskAssignees` (server.js:872–890) already recurses into `t.subtasks[]`, and `stripMember` (server.js:2585–2587) sweeps subtask assignees — both are the exact patterns Phase 65 generalizes to a tree-aware `normalizeSubtasks` pass. The funnel (`mergeClientDoc`, server.js:1258) deep-clones the incoming doc and runs inside `db.tx`, so a wholesale reject (D-05) is a `throw httpError(...)` inside the funnel — the tx rollback pattern already exists (server.js:5866–5869 assignee-guard rollback).

Phase 65 adds three structural fields (`id` already exists; `parentId: number|null`, `position: integer`), one server validation gate, a recursive client render, a leaf-only progress rollup, FTS title indexing, and depth-aware exports. No new dependencies, no new write path, no new tables.

**Primary recommendation:** build ONE shared pure tree module (`subtree.js`-style, DOM-free like `src/export/model.js`) holding `buildTree`, `depthOf`, `validateSubtreeMove`, `rollupProgress`, `orderedSiblings`; consume it from the funnel validator, the client actions, the views, and the export model — one definition, five consumers, no drift.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tree validation (cycle/depth/wholesale reject) | Server (funnel) | Client (optimistic pre-check) | D-05 mandates server rejection at `mergeClientDoc`; client pre-check is UX only |
| Shape normalization (`parentId`/`position` whitelist) | Server funnel + read path | — | `normalizeDoc`/`docForClient`/`mergeClientDoc` — the D-53-1 sink pattern |
| Tree rendering (indent/carets/badge/timeline bars) | Client views | — | `task-list.js`, `board.js`, `timeline.js`, `drawer.js` |
| Restructure actions (promote/demote/re-parent) | Client actions → doc PUT | — | No new write path; flows through existing save funnel |
| Cascade auto-done + rollup | Client mutate + shared pure fn | Server never stores rollup | Progress is computed, never stored (STATE.md ruling) |
| FTS subtask titles | Server `db-adapter.mjs` | — | `syncTaskFts` inside the funnel tx; dual-backend symmetric |
| Exports (MSPDI OutlineLevel, xlsx/CSV rows) | Shared export model | writers | `src/export/model.js` is the DOM-free single source both Node & browser import |
| MCP round-trip | `mcp.js` writeDoc | — | Same funnel; parity proven by `test/mcp.test.mjs` |

## Standard Stack

**Zero new dependencies** (standing constraint, REQUIREMENTS.md exclusions). Everything is stdlib + existing in-repo modules.

| Asset | Location | Purpose | Why |
|-------|----------|---------|-----|
| `mergeClientDoc` funnel | server.js:1258 | All writes pass here | Only write path (project spine) |
| `normalizeTaskAssignees` | server.js:872–890 | The recursion-into-subtasks precedent | Copy its shape for `normalizeSubtasks` |
| `stripMember` subtask sweep | server.js:2582–2589 | Removal-sweep precedent (CONTEXT cited server.js:2579; actual subtask lines 2585–2587) | Extend to delete-orphaned subtree entries |
| `syncTaskFts` / `ensureSearchIndex` | db-adapter.mjs:488–569 | Dual-backend FTS diff sync | Extend `insert()` + unchanged-check with subtask titles |
| `task_search_projection` schema | db-adapter.mjs:491–496 | pg projection table | No schema change needed — subtask titles fold into `folded`/`projection` text |
| `taskProg` / `progressOf` | src/core/store.js:491–503 | Client rollup | Rewrite `taskProg` to leaf-only nested rollup |
| `taskProgress` + subtask rows | src/export/model.js:44–50, 185–219 | Export model (shared Node+browser) | Make recursive; `PARENT.n` keys → depth-aware |
| MSPDI writer | export/mspdi.js:283 | Already emits `<OutlineLevel>1</OutlineLevel>` when `row.parent` | Change to `OutlineLevel = depth` |
| `A.toggleSub` / `A.rmSub` / `KEY.addSub` | src/actions/actions.js:1081–1104 | Client subtask mutations | Add cascade + descendant removal + `parentId`/`position` fields |
| `A.promoteSub` | src/actions/subtasks.js:56–82 | ⚠️ **Existing `promoteSub` means "convert subtask → standalone task"** | New restructure actions need distinct names (e.g. `moveSubUp`/`moveSubDown`/`reparentSub`) to avoid colliding with this shipped action |
| `fail()` | server.js:3850 | Error shape `{error, code}` | New codes (`subtaskCycle`, `subtaskDepth`); client maps code → i18n key (existing pattern: api.js:93 reads `data?.code`) |
| i18n catalogues + scan gate | src/locales/en.json, fr.json; scripts/i18n-scan.mjs | EN+FR same commit | Dead-key gate runs in `prebuild` |

## Architecture Patterns

### System Architecture Diagram

```
Client views (table/board/timeline/drawer)
   │  promote/demote/re-parent/toggle/complete  (D-09 popover actions)
   ▼
client mutate() → doc PUT  ── no new write path ──▶  POST /w/:slug/doc
                                                        │
                                                        ▼
                                          mergeClientDoc (server.js:1258, inside db.tx)
                                                        │
                             ┌──────────────────────────┼──────────────────────────┐
                             ▼                          ▼                          ▼
                  normalizeSubtasks              validateSubtreeMove        stripMember / perm gates
                  (parentId/position             (cycle + depth ≤5 →        (tree-aware sweeps)
                   whitelist + tie fix)          throw → tx rollback)
                             │                          │
                             └──────────┬───────────────┘
                                        ▼
                          doc stored (revision bump, server.js:5859)
                                        │
                                        ▼ (same tx, server.js:5864)
                          syncTaskFts(stored, next)  ──▶  FTS5 task_fts | pg task_search_projection
                                        │                    (subtask titles folded in, D-06/D-08)
                                        ▼
                          Phase-67 hook point: funnel diff (subtask.tree-changed detectable)
```

Client read path mirrors: `docForClient` → store → views sort siblings by `position` within `parentId` groups (D-03); collapse state in `S.ui` (D-10).

### Recommended structure

```
src/core/subtree.js          # NEW — pure, DOM-free tree helpers (importable by Node tests)
  buildTree(task)            # flat[] → nested (position-sorted, ties→array order)
  depthOf / wouldExceedCap   # D-04: cap 5 levels under task (level 0)
  validateMove(task, id, newParentId)  # cycle + depth, returns error code or ok
  rollupProgress(task)       # leaf-only done ratio — single definition of "never double-count"
  descendantsOf(task, id)    # cascade delete / auto-done
server.js                    # normalizeSubtasks + validate gate inside mergeClientDoc; read-side normalize
src/actions/subtasks.js      # new move/reparent actions; rename-safe vs existing promoteSub
src/components/task-list.js  # recursive indent+caret rows (extends expandRow pattern)
src/views/board.js           # open-count badge + popover checklist (D-11)
src/views/timeline.js        # indented bars, date inheritance (D-12)
src/export/model.js          # recursive subtask rows, depth in row meta
export/mspdi.js              # OutlineLevel = depth
db-adapter.mjs               # FTS insert/unchanged-check include subtask titles
```

### Pattern 1: Tree-aware normalize pass (the D-53-1 sink pattern)

**What:** one `normalizeSubtasks(task)` run on every read (`normalizeDoc`/`docForClient`) and every incoming doc (`mergeClientDoc`), exactly mirroring `normalizeTaskAssignees` (server.js:872–890).
**Why:** fields not touched by a normalize pass that *rebuilds* subtask objects are silently stripped — the CONTEXT.md whitelist warning. Normalizing explicitly also implements D-03's "ties/missing position → array order" on write and heals legacy docs (see Runtime State Inventory).

```js
// Shape (per CONTEXT.md D-01/D-02/D-03, owner-confirmed example):
// { id:'u1', parentId:null, position:0, title:'…', done:false }
// child of subtask u2 → { parentId:'u2', ... }; task is implicit level-0 root.
function normalizeSubtasks(t) {
  if (!Array.isArray(t.subtasks)) return;
  t.subtasks.forEach((s, i) => {
    if (!s || typeof s !== 'object') { t.subtasks.splice(i, 1); return; }
    if (typeof s.id !== 'string' || !s.id) s.id = uid('s');
    if (s.parentId !== null && !t.subtasks.some(x => x?.id === s.parentId)) s.parentId = null; // dangling → root
    if (!Number.isInteger(s.position)) s.position = i; // D-03 tie/missing → array order
  });
  for (const s of t.subtasks) normalizeSubtasks(s); // not recursive-by-nesting — see note
}
```

Note: recursion here iterates the **same flat array** (all descendants are entries of `t.subtasks[]`, D-01) — the recursion in `normalizeTaskAssignees` recurses per *object*; the tree walk must instead group by `parentId`.

### Pattern 2: Wholesale reject at the funnel (D-05)

`mergeClientDoc` runs inside `db.tx`; the existing assignee-guard precedent throws and the tx rolls back (server.js:5866–5869: `err?.code === 'assigneeOutOfScope' → fail(res, 400, …)`). Copy it:

```js
if (err?.code === 'subtaskCycle') return fail(res, 400, 'subtaskCycle', '…');
if (err?.code === 'subtaskDepth') return fail(res, 400, 'subtaskDepth', '…');
```

Localized error = server sends the stable `code`; client maps `code → i18n key` (existing client precedent: api.js:93 branches on `data?.code`). EN+FR keys land in the same commit.

### Pattern 3: Leaf-only rollup (SUB-03, no double-count)

Current `taskProg` (store.js:498–499, verbatim): `if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);` — counts *all* entries, so a nested parent and its children would both count. Rule: numerator/denominator count **leaf subtasks only** (a subtask with descendants contributes nothing itself; its done state is implied). Keep `status === 'done' → 100` short-circuit and the STATUS_PROGRESS fallback (mirrored in export/model.js:42–50 — fix BOTH, they are duplicated deliberately because model.js must stay import-free).

### Pattern 4: FTS subtask titles (D-06/D-08)

`syncTaskFts` (db-adapter.mjs:515–564) diffs stored vs next tasks with the unchanged-check `nt.title === t.title && nt.desc === t.desc && nt.project === t.project` (line 555) — subtask title/structure changes currently skip reindex. Extend:
- unchanged-check must also compare a cheap serialized subtask-title string (e.g. `titles(t) !== titles(nt)`);
- `insert()` appends folded subtask titles: SQLite row gets `title`/`body` strings extended; pg `folded` string extended identically → byte-identical parity (both backends consume the same folded text today, lines 533–550).

Deletion follows the doc automatically: a removed subtask changes the serialized titles → row re-indexed without it (D-08, no separate sweep). Empty subtree = unchanged empty string — no special case. **Symmetry rule:** compute the title suffix once, feed the same string to both dialects.

### Pattern 5: Export depth (SUB-04)

`src/export/model.js:185–219` emits one row per subtask keyed `PARENT.n` by array index, with `parent: t.id`. Generalize: recursive walk per `buildTree` order (position-sorted), row key `PARENT.1.2` style per level, `parent` = parent row's id (subtask id for nested), carry `depth` on the row; mspdi.js:283 changes `row.parent ? '<OutlineLevel>1</OutlineLevel>' : ''` → `OutlineLevel = row.depth + 1` (MSPDI is 1-based; task = level 1, first subtask level 2). Child rows already stay out of `topRows`/KPIs via `r.parent` filter (model.js:222) — keep that predicate (nested rows all carry `parent`). xlsx/CSV writers consume `model.rows` unchanged (mspdi.js:9 comment confirms writers share the model).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cycle detection | ad-hoc walks at each call site | one `validateMove` in the shared subtree module | one definition; funnel, client pre-check, and tests all assert the same rule |
| Stable ordering | `localeCompare` / array order | `position` sort with array-index tiebreak (D-03) | deterministic across SQLite/pg and FR/EN hosts (model.js:239 precedent: plain comparators, never localeCompare) |
| Progress rollup | per-view percentage math | `rollupProgress` single fn | double-counting is the exact SUB-03 failure mode; also duplicated in model.js today |
| IDs | new id scheme | existing `uid('s')` (actions.js:1097) | D-02 "uuid-style" — the prefix convention is established |
| FTS folding | custom normalization | existing `foldForSearch` / `searchTerms` (server.js:82–83 imports) | parity suite already pins its behavior |
| Error transport | new error channel | `fail()` code + client i18n mapping | established 400-code pattern |

**Key insight:** the whole feature is a refactor of one array's semantics plus one validation gate — the danger is divergence between the five consumers (funnel, client actions, views, exports, MCP), which the shared DOM-free module and the parity tests exist to prevent.

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Every existing workspace doc has flat subtasks `{id, title, done, …}` with **no `parentId` and no `position`** (actions.js:1098 `t.subtasks.push({ id: nid, title: v, done: false })`) | **No migration** — heal lazily in `normalizeSubtasks`: missing `parentId` → `null`, missing `position` → array index (D-03 tie rule). One boot pass NOT required; read/write normalize suffices (Phase 49/55 lazy-normalize precedent) |
| Live service config | None — no external services hold subtask state | None — verified by grep (no subtask references outside server/src/export/mcp) |
| OS-registered state | None | None — verified |
| Secrets/env vars | None affected | None |
| Build artifacts | None — no compiled/bundled name changes; chunk gate is the only artifact constraint (~2 kB headroom, test/build-chunk-size.test.mjs) | Lazy-load any heavy tree UI (D-02 pattern) if bundle pressure appears |

## Common Pitfalls

### Pitfall 1: The whitelist / silent-strip trap
**What goes wrong:** `parentId`/`position` vanish after any funnel pass that rebuilds subtask objects. **Why:** normalization passes map arrays to new objects; unknown fields die unless spread-preserved or explicitly whitelisted. **How to avoid:** the new `normalizeSubtasks` is the single place that owns subtask shape; `stripMember`'s subtask sweep (server.js:2585–2587) and mcp.js:318–320 (its own assignee strip on a `next` copy) must be updated to the same shape. **Warning signs:** round-trip test writes `parentId`, reads `null`.

### Pitfall 2: `promoteSub` name collision
**What goes wrong:** the shipped action `A.promoteSub` (subtasks.js:56) *converts a subtask into a standalone task* — it is NOT tree "promote" (move up one level). Reusing the name creates a behavior regression on the existing convert flow. **How to avoid:** new actions get distinct keys; keep `promoteSub` semantics untouched (its removal isn't in scope).

### Pitfall 3: Rollup double-count
**What goes wrong:** naive `subtasks.filter(done).length / subtasks.length` over the flat array counts nested parents alongside their leaves. **How to avoid:** leaf-only rollup (Pattern 3); fix both copies (`store.js` and `export/model.js`). **Warning signs:** a task at 50% with 2 subtasks of which one has 2 open children.

### Pitfall 4: FTS reindex skips structure-only changes
**What goes wrong:** subtask retitle/delete doesn't change task `title`/`desc`/`project`, so the unchanged-check (db-adapter.mjs:555) skips the row and the index goes stale — D-08 violated. **How to avoid:** fold a subtask-title signature into the unchanged comparison.

### Pitfall 5: Whole-PUT rejection scope confusion
**What goes wrong:** the funnel's philosophy is per-item refusal (perm gates hold rows back, the rest merges) — D-05 explicitly overrides this for tree violations: **reject wholesale**. Implementing it as a per-task refusal would let a depth-overflowing move land. **How to avoid:** throw inside the funnel → tx rollback → `fail(res, 400, code)`; add to the error-codes test (test/error-codes.test.mjs exists).

### Pitfall 6: Idempotency via mutation, not replay
**What goes wrong:** worrying about "repeated promote" as a special case. **Reality:** every restructure is a plain doc-PUT of a fully-specified next state; applying the same doc twice is a no-op by construction. The real guarantee needed is *atomicity* (tx rollback on reject), which the funnel already provides. Concurrency is the existing whole-doc revision model (last-write-wins with revision bump) — an interrupted move leaves either the old or the new complete doc, never a half-moved tree. Prove with a repeat-PUT test rather than new machinery.

### Pitfall 7: Chunk gate
**What goes wrong:** recursive tree rendering + new popover actions push `main` chunk past 500 kB with ~2 kB headroom (STATE.md metric; test/build-chunk-size.test.mjs fails the build). **How to avoid:** keep the tree helpers dependency-free and small; lazy-load new UI islands per the D-02 pattern.

## Code Examples

### Verbatim anchors (read this session)

- store.js:498–499: `if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);` — the flat rollup to replace [VERIFIED: src/core/store.js:491-503]
- actions.js:1098: `t.subtasks.push({ id: nid, title: v, done: false });` — legacy subtask shape to normalize [VERIFIED: src/actions/actions.js:1094-1104]
- server.js:887–889: `if (Array.isArray(t.subtasks)) { for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds); }` — recursion precedent [VERIFIED: server.js:872-890]
- db-adapter.mjs:555: `if (nt && nt.title === t.title && nt.desc === t.desc && nt.project === t.project) continue; // unchanged → index untouched` — FTS skip to extend [VERIFIED: db-adapter.mjs:515-564]
- db-adapter.mjs:491–496: `create table if not exists task_search_projection (workspace_id, task_id, project_id, folded, projection …)` + GIN index — no schema change needed for D-06 [VERIFIED: db-adapter.mjs:488-496]
- export/mspdi.js:283: `…${row.parent ? '<OutlineLevel>1</OutlineLevel>' : ''}…` — depth extension point [VERIFIED: export/mspdi.js:283]
- server.js:3850–3852: `function fail(res, status, code, message, extra) { return json(res, status, { error: message, code, ...extra }); }` — error contract [VERIFIED: server.js:3850-3852]

### Restructure action shape (client)

```js
// one-level-at-a-time (SUB-02/D-09); server re-validates at the funnel
A.demoteSub = el => {
  const t = task(el.dataset.id), s = subOf(t, el.dataset.sid);
  mutate(() => {
    const prev = prevSibling(t, s);            // position-sorted neighbor
    if (!prev || depthOf(t, prev) + 1 + subtreeHeight(t, s) > 5) return toastErr('subtaskDepth');
    s.parentId = prev.id; s.position = nextPosition(t, prev.id);
  }); // save() rides the normal funnel; server is the authority (D-05)
};
```

### Cascade delete (SUB-02 owner ruling)

```js
A.rmSub = el => {
  mutate(() => {
    const kill = new Set(descendantsOf(t, el.dataset.sid).map(s => s.id).concat(el.dataset.sid));
    t.subtasks = t.subtasks.filter(s => !kill.has(s.id)); // children follow parent
  });
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Flat subtask checklist (Phase 55) | Nested tree via `parentId`/`position` | Phase 65 | Every consumer extends; no shape migration needed (lazy normalize) |
| FTS indexes task title+desc only | + subtask titles (D-06) | Phase 65 | `syncTaskFts` unchanged-check + insert extension; parity suite extended |
| MSPDI `OutlineLevel` binary (0/1) | True depth | Phase 65 | MS Project shows real hierarchy |
| `promoteSub` = convert-to-task (only restructure) | + one-level promote/demote/re-parent (D-09) | Phase 65 | Both coexist; distinct action keys |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MSPDI `OutlineLevel` is 1-based with task=1 (spec: OutlineLevel ≥ 1; current code emits it only on child rows) | Code Examples / Pattern 5 | MS Project misinterprets hierarchy — verify against test/export-mspdi.test.mjs expectations during planning |
| A2 | Legacy docs never stored subtask `parentId`/`position`, so lazy normalize is a complete heal (no historic nested write path exists) | Runtime State Inventory | If some doc had junk fields, dangling-parent rule (→ root) covers it anyway; low risk |
| A3 | Whole-doc revision model (last-write-wins) is the accepted concurrency story for parallel restructures | Pitfall 6 | Two concurrent moves could silently drop one; consistent with every other doc edit in the product |

## Open Questions (RESOLVED)

Edge-probe findings from the spec-less pass, resolved as far as code + decisions allow:

1. **SUB-01 depth-cap boundary rendering** — resolved: cap is structural (D-05 rejects >5); UI renders whatever depth exists (≤5 by construction). Equal-order siblings: D-03 ties normalize to array order on write, so rendering never sees ties post-funnel; a deterministic `(position, arrayIndex)` comparator makes it robust client-side regardless. Empty/null subtrees: `subtasks: []` renders no caret (existing `t.subtasks.length ?` guards at task-list.js:62, board.js:18); null/junk entries are dropped by `normalizeSubtasks`. Stable sibling ordering: `position` within `parentId` group — settled by D-03.
2. **SUB-02 idempotency/concurrency** — resolved: restructures are whole-doc PUTs; repeated apply is a no-op (Pitfall 6); interrupted/parallel writes resolve via the existing revision model with tx-atomic reject (Pitfall 5). Proven by repeat-PUT + concurrent-save tests, no new machinery.
3. **SUB-03 cascade + rollup contract** — resolved: cascade auto-done on parent completion (owner ruling, REQUIREMENTS SUB-03); rollup = leaf-only computed percentage, never stored (Pattern 3). Reopen-cascade sub-question: **resolved by owner ruling (D-13)** — reopening a parent leaves descendants done. Subtask-parent cascade symmetry: **resolved by owner ruling (D-14)** — completing a subtask parent cascades to its open children, same rule at every level.
4. **SUB-04 surfaces** — resolved: depth cap enforced at the funnel so mergeClientDoc sweeps never see >5; FTS empty subtree = no suffix (no special case); export rows ordered by `(position, arrayIndex)` per `parentId` group; xlsx/CSV consume `model.rows` so depth ordering falls out of the model; MCP round-trip rides the same funnel (test/mcp.test.mjs extension).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node + `node --test` | unit suite | ✓ | (repo scripts) | — |
| Playwright | e2e 115/115 gate | ✓ | ^1.64.1 [VERIFIED: package.json:30] | — |
| pg (optional backend) | FTS parity matrix | via existing test matrix | — | SQLite-only tests skip pg matrix |

No missing dependencies — zero new deps by standing constraint.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (node:test), `--test-concurrency=2`; Playwright ^1.64.1 for e2e |
| Config file | package.json scripts (`test`, `e2e` → e2e/playwright.config.mjs) |
| Quick run command | `node --test test/subtask-tree.test.mjs` |
| Full suite command | `npm test` (1524 baseline — grow, never shrink) · `npm run e2e` (115/115) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUB-01 | Depth-aware render, caret, board badge, position ordering | unit (DOM-free helpers) + e2e | `node --test test/subtask-tree.test.mjs` + targeted e2e spec | ❌ Wave 0 |
| SUB-02 | Cycle/depth reject codes, one-level rule, cascade delete | unit (server funnel + helper) | `node --test test/subtask-tree.test.mjs` (funnel cases) | ❌ Wave 0 |
| SUB-02 | Error contract registered | unit | `node --test test/error-codes.test.mjs` | ✅ (extend) |
| SUB-03 | Leaf-only rollup, cascade auto-done | unit (store + export model) | `node --test test/export-model.test.mjs` + new tree test | ✅ export-model / ❌ tree |
| SUB-04 | FTS titles SQLite+pg parity | unit | `node --test test/search-fts.test.mjs test/copy-sqlite-to-pg.test.mjs` | ✅ (extend) |
| SUB-04 | MSPDI OutlineLevel / xlsx / CSV depth rows | unit | `node --test test/export-mspdi.test.mjs test/export-xlsx.test.mjs test/export-csv.test.mjs` | ✅ (extend) |
| SUB-04 | MCP writeDoc round-trip with tree fields | unit | `node --test test/mcp.test.mjs` | ✅ (extend) |
| SUB-04 | mergeClientDoc normalization/strip survival | unit | `node --test test/client-surfaces.test.mjs` (or new tree test) | ✅ pattern / ❌ tree cases |
| gates | chunk ≤500 kB, i18n EN+FR | unit | `node --test test/build-chunk-size.test.mjs test/i18n-scan` (prebuild) | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/subtask-tree.test.mjs` + touched suites
- **Per wave merge:** `npm test`
- **Phase gate:** full `npm test` + `npm run e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/subtask-tree.test.mjs` — normalize/validate/cascade/rollup/idempotency (covers SUB-01/02/03 core)
- [ ] Extend `test/search-fts.test.mjs` + pg parity for subtask titles (SUB-04)
- [ ] Extend `test/export-mspdi.test.mjs`, `test/export-model.test.mjs`, `test/mcp.test.mjs` for depth rows + round-trip (SUB-04)
- [ ] Extend `test/error-codes.test.mjs` with `subtaskCycle`/`subtaskDepth`
- [ ] e2e spec: tree render + restructure via popover + board badge (SUB-01/02 UX path)

## Security Domain

`security_enforcement` not disabled → included.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes | Funnel-side `normalizeSubtasks` + `validateSubtreeMove` — server never trusts client tree shape (D-05 fail-closed) |
| V4 Access Control | yes | Existing per-project "Can edit" task gate (server.js:1333–1357) already covers tree writes — restructure is a task edit; no new gate needed, but verify denials hold whole tasks byte-identical including subtasks |
| V2/V3/V6 | no | No auth/session/crypto surface touched |
| DoS via tree size | DoS | Depth cap 5 (D-04); consider a sane per-task subtask-count sanity bound in normalize (not a ruling — the cap is depth-only per D-04, so count stays unlimited; recursion over depth 5 is cheap) |

Known threat patterns: crafted `parentId` referencing another task's subtask id → dangling-parent rule normalizes to root (never cross-task linkage); crafted self-parent → cycle validator rejects; junk `position` types → Number.isInteger check. All server-side, never client-trusted.

## Sources

### Primary (HIGH confidence)
- Direct code reads this session: server.js (872–890, 1258–1387, 2582–2589, 3850–3852, 5855–5869), db-adapter.mjs (488–569), src/core/store.js (491–503), src/actions/actions.js (1081–1104), src/actions/subtasks.js, src/features/subtasks.js, src/components/task-list.js, src/overlays/drawer.js, src/views/{board,timeline,table}.js, src/export/model.js, export/mspdi.js, mcp.js, package.json, test/ directory listing
- `.planning/phases/65-subtask-tree/65-CONTEXT.md` (owner decisions D-01..D-12), `.planning/REQUIREMENTS.md`, `.planning/STATE.md`

### Secondary / Tertiary
- None used — no external research required; the phase is fully grounded in repo precedent.

## Metadata

**Confidence breakdown:**
- Standard stack / integration points: HIGH — every anchor read this session
- Architecture: HIGH — pure extension of documented, test-pinned patterns
- Pitfalls: HIGH — all derived from in-repo precedent (silent-strip, chunk gate, duplicated rollup)
- Assumptions A1–A3: LOW→MEDIUM — flagged for planner confirmation

**Research date:** 2026-11-15
**Valid until:** 2026-12-15 (repo-stable; re-verify only if funnel/FTS code changes)
