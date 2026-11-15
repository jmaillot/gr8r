/* =====================================================================
   SUBTREE — Phase 65 (65-01) — pure, DOM-free subtask-tree helpers.
   =====================================================================
   The one shared definition of subtask-tree ordering and normalization,
   consumed by the server funnel (normalizeSubtasks sink), the client
   actions and the browser bundle. Mirrors the src/export/model.js
   discipline: NO IMPORTS AT ALL, no DOM access, plain comparators only
   (never localeCompare) so ordering is byte-identical across hosts.

   Stored shape (CONTEXT.md D-01/D-01a/D-02/D-03):
     { id:'u1', parentId:null, position:0, title:'…', done:false }
   Only tasks carry a subtasks[] array; all descendants — at any depth —
   are entries of that one flat array. The task is the implicit level-0
   root and never appears in parentId. Cycle/depth VALIDATION lives in
   65-02 (validateSubtreeMove) — not here.
   ===================================================================== */

/* Entries of `list` whose parentId matches, ordered by a plain
   (position, arrayIndex) comparator — position first (D-03 explicit
   integer), array order as the deterministic tiebreak. */
export function orderedSiblings(list, parentId) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s && typeof s === 'object' && s.parentId === parentId) out.push({ s, i });
  }
  out.sort((a, b) => (a.s.position - b.s.position) || (a.i - b.i));
  return out.map(x => x.s);
}

/* Next free position within a parentId group: max existing position + 1
   (0 when the group is empty). */
export function nextPosition(list, parentId) {
  let max = -1;
  if (Array.isArray(list)) {
    for (const s of list) {
      if (s && typeof s === 'object' && s.parentId === parentId && Number.isInteger(s.position) && s.position > max) {
        max = s.position;
      }
    }
  }
  return max + 1;
}

/* Depth of a subtask within the flat array: roots (parentId null) sit at
   level 1 under the task (the task itself is level 0). Unknown ids and
   dangling chains return null; a visited set guards against crafted
   cycles. */
export function depthOf(list, id) {
  if (!Array.isArray(list)) return null;
  const byId = new Map();
  for (const s of list) if (s && typeof s === 'object' && typeof s.id === 'string') byId.set(s.id, s);
  const start = byId.get(id);
  if (!start) return null;
  const seen = new Set([id]);
  let depth = 1;
  let cur = start;
  while (cur.parentId !== null && cur.parentId !== undefined) {
    if (seen.has(cur.parentId)) return null; /* crafted cycle — refuse to loop */
    const parent = byId.get(cur.parentId);
    if (!parent) return null; /* dangling parent */
    seen.add(cur.parentId);
    cur = parent;
    depth++;
  }
  return depth;
}

/* Every transitive child of `id` (array order), cycle-safe via a visited
   set. Children whose parentId dangles are orphans, never included. */
export function descendantsOf(list, id) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    const cur = queue.shift();
    for (const s of list) {
      if (!s || typeof s !== 'object' || s.parentId !== cur) continue;
      if (seen.has(s.id)) continue; /* crafted cycle — stop, do not loop */
      seen.add(s.id);
      out.push(s);
      queue.push(s.id);
    }
  }
  return out;
}

/* Position-sorted nested view of the flat array: every node gains a
   `children` array (roots = parentId null). Sibling order is the same
   (position, arrayIndex) comparator used everywhere else. */
export function buildTree(list) {
  const nodes = [];
  if (Array.isArray(list)) {
    for (const s of list) {
      if (s && typeof s === 'object') nodes.push({ ...s, children: [] });
    }
  }
  const byId = new Map(nodes.map(n => [n.id, n]));
  const roots = [];
  for (const n of nodes) {
    const parent = n.parentId != null ? byId.get(n.parentId) : null;
    if (parent) parent.children.push(n);
    else roots.push(n);
  }
  const sortSibs = arr => {
    arr.sort((a, b) => (a.position - b.position));
    for (const n of arr) sortSibs(n.children);
  };
  sortSibs(roots);
  return roots;
}

/* =====================================================================
   65-02 — tree validation, cascade and rollup (D-04/D-05/D-13/D-14/SUB-03).
   Still zero imports, zero DOM: the same module discipline as above.
   ===================================================================== */

/* D-04: the task is the implicit level-0 root; subtasks may nest at most
   5 levels beneath it. Child COUNT is unlimited — depth is the only
   structural limit. */
export const MAX_SUBTASK_DEPTH = 5;

/* Number of levels in the subtree rooted at `id`, counting the root itself
   (a leaf → 1). Unknown ids → 0. A visited set guards crafted cycles. */
export function subtreeHeight(list, id) {
  if (!Array.isArray(list)) return 0;
  const kids = new Map();
  for (const s of list) {
    if (!s || typeof s !== 'object' || typeof s.id !== 'string') continue;
    if (!kids.has(s.parentId)) kids.set(s.parentId, []);
    kids.get(s.parentId).push(s);
  }
  const start = list.find(s => s && typeof s === 'object' && s.id === id);
  if (!start) return 0;
  /* breadth-first level count; the visited set stops crafted loops */
  let level = 0;
  let frontier = [start];
  const seen = new Set([id]);
  while (frontier.length) {
    level++;
    const next = [];
    for (const node of frontier) {
      for (const child of kids.get(node.id) || []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        next.push(child);
      }
    }
    frontier = next;
  }
  return level;
}

/* D-04 gate: would the subtree rooted at `subtreeRootId`, re-rooted so the
   root itself sits at level `rootLevel` (defaults to its current depth),
   push ANY of its nodes past level MAX_SUBTASK_DEPTH? Pure read-only. */
export function wouldExceedCap(list, subtreeRootId, rootLevel) {
  if (rootLevel === undefined) {
    const d = depthOf(list, subtreeRootId);
    if (d === null) return false; /* unknown root — normalize owns it */
    rootLevel = d;
  }
  return rootLevel - 1 + subtreeHeight(list, subtreeRootId) > MAX_SUBTASK_DEPTH;
}

/* One-level restructure validator (SUB-02/D-05; also the client pre-check).
   `id` is the moved subtask, `newParentId` its target parent (null = task
   root). Returns { ok: true } or a stable reject code:
     subtaskCycle — self-parent or an ancestor offered as a child;
     subtaskDepth — the move would push any node past level 5 (D-04). */
export function validateMove(list, id, newParentId) {
  if (!Array.isArray(list)) return { ok: true };
  const s = list.find(x => x && typeof x === 'object' && x.id === id);
  if (!s) return { ok: true }; /* nothing to validate — normalize owns junk */
  if (newParentId === id) return { code: 'subtaskCycle' };
  if (newParentId !== null && newParentId !== undefined) {
    /* ancestor-as-child: walk the candidate parent's ancestor chain; hitting
       the moved node means the move would fold the chain into a loop */
    const byId = new Map(list.filter(x => x && typeof x === 'object').map(x => [x.id, x]));
    const seen = new Set([id]);
    let cur = byId.get(newParentId);
    while (cur) {
      if (cur.id === id) return { code: 'subtaskCycle' };
      if (seen.has(cur.id)) return { code: 'subtaskCycle' }; /* pre-existing loop */
      seen.add(cur.id);
      cur = cur.parentId != null ? byId.get(cur.parentId) : null;
    }
  }
  let parentLevel = 0;
  if (newParentId != null) {
    const d = depthOf(list, newParentId);
    if (d === null) return { ok: true }; /* dangling target — normalize re-roots it */
    parentLevel = d;
  }
  const rootLevel = parentLevel + 1;
  if (wouldExceedCap(list, id, rootLevel)) return { code: 'subtaskDepth' };
  return { ok: true };
}

/* Whole-array structural gate used by the funnel BEFORE the lazy heal runs —
   the heal re-roots self-parents, so a raw self-parenting PUT must be caught
   here or the violation would silently normalize away instead of rejecting
   wholesale (D-05). Validates every resolvable parent chain: any loop
   (self, mutual, longer) → subtaskCycle; any node beyond level 5 →
   subtaskDepth. Junk entries and dangling parents are IGNORED — the normalize
   pass owns them (splices / re-roots). */
export function validateSubtree(list) {
  if (!Array.isArray(list)) return { ok: true };
  const entries = list.filter(s => s && typeof s === 'object' && typeof s.id === 'string');
  const byId = new Map(entries.map(s => [s.id, s]));
  /* cycle detection: walk every node's ancestor chain with a per-walk set */
  for (const s of entries) {
    const seen = new Set([s.id]);
    let cur = s.parentId != null ? byId.get(s.parentId) : null;
    while (cur) {
      if (seen.has(cur.id)) return { code: 'subtaskCycle' };
      seen.add(cur.id);
      cur = cur.parentId != null ? byId.get(cur.parentId) : null;
    }
  }
  /* depth: only chains that terminate at a null parent have a defined level;
     a chain ending in a dangling parent is re-rooted by normalize → level 1 */
  for (const s of entries) {
    let level = 1;
    let cur = s;
    const chain = new Set([s.id]);
    while (cur.parentId != null) {
      const parent = byId.get(cur.parentId);
      if (!parent) break; /* dangling → normalize re-roots; level stays valid */
      if (chain.has(parent.id)) break; /* cycle → already returned above */
      chain.add(parent.id);
      level++;
      cur = parent;
    }
    if (level > MAX_SUBTASK_DEPTH) return { code: 'subtaskDepth' };
  }
  return { ok: true };
}

/* D-14 cascade: ids of the OPEN descendants of `parentId` (null = the task
   root — every open subtask at every level). Pure, read-only, visited-set
   safe. The reopen path (D-13) simply never calls this. */
export function cascadeDoneIds(list, parentId) {
  return descendantsOf(list, parentId)
    .filter(s => !s.done)
    .map(s => s.id);
}

/* SUB-03: the leaf-only progress rollup — the ONE definition of "never
   double-count". Only subtasks WITHOUT descendants count toward the
   numerator/denominator (a parent's done state is implied by its leaves);
   the caller's status short-circuit and STATUS fallback shape are kept.
   `statusProgress` is the caller's status curve (store.js and model.js each
   pass their own copy). Zero imports; works on the flat t.subtasks[] array. */
export function rollupProgress(t, statusProgress) {
  if (t.status === 'done') return 100;
  const list = Array.isArray(t.subtasks) ? t.subtasks : [];
  const entries = list.filter(s => s && typeof s === 'object');
  const leaves = entries.filter(s => !entries.some(x => x && x.parentId === s.id));
  if (leaves.length) {
    return Math.round((leaves.filter(s => s.done).length / leaves.length) * 100);
  }
  return (statusProgress && statusProgress[t.status]) || 0;
}

/* =====================================================================
    The D-01a/D-03 heal — the single place that owns subtask shape.
   Mutates IN PLACE (never rebuilds the objects — any pass that maps
   subtasks to fresh objects silently strips unknown fields; the
   whitelist trap, research Pitfall 1). Rules:
     - non-object entries are spliced out;
     - missing id → generated through the injected factory (the server
       passes its uid(); the module itself stays import-free). An entry
       with no id and no factory is dropped — it could never be referenced;
     - parentId not resolving INSIDE the same task's array → null
       (covers legacy docs, dangling ids and crafted cross-task references);
     - missing/junk position (not a safe integer) → array index (D-03 tie
       rule: storage order normalizes to explicit positions on write).
   Returns the (possibly spliced) array for convenience; callers may
   ignore the return and rely on in-place mutation.
   ===================================================================== */
export function normalizeTaskSubtasks(t, uidFactory) {
  if (!t || typeof t !== 'object' || !Array.isArray(t.subtasks)) return t?.subtasks;
  t.subtasks = t.subtasks.filter(s => s && typeof s === 'object');
  for (let i = 0; i < t.subtasks.length; i++) {
    const s = t.subtasks[i];
    if (typeof s.id !== 'string' || !s.id) {
      if (typeof uidFactory === 'function') s.id = uidFactory();
      else {
        t.subtasks.splice(i, 1);
        i--;
        continue;
      }
    }
    const resolvable = s.parentId === null || t.subtasks.some(x => x && x !== s && x.id === s.parentId);
    if (!resolvable) s.parentId = null;
    if (!Number.isSafeInteger(s.position)) s.position = i;
  }
  return t.subtasks;
}
