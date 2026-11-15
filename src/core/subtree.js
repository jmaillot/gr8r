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
