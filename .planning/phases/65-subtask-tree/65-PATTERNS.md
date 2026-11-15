# Phase 65: Subtask Tree - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 16 (1 new module, 13 modified sources, 2 locale catalogues + test suites)
**Analogs found:** 16 / 16 — every new/modified file has a direct in-repo precedent (this phase is a generalization of existing flat-subtask code, not greenfield)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/subtree.js` (NEW) | utility (pure, DOM-free) | transform | `src/export/model.js` | exact (the module must copy model.js's "no DOM, no imports" discipline) |
| `server.js` — `normalizeSubtasks` + funnel gate | middleware (funnel pass) | request-response | `server.js:872–890 normalizeTaskAssignees` | exact |
| `server.js` — tx-rollback error gate | error handling | request-response | `server.js:5864–5869` + `fail()` `server.js:3850` | exact |
| `src/actions/actions.js` (toggleSub/rmSub/addSub) | client actions | event-driven mutate | same file lines 1081–1107 | exact (extend in place) |
| `src/actions/subtasks.js` (move/demote/reparent) | client actions | event-driven mutate | `src/actions/subtasks.js:56–82 A.promoteSub` | exact |
| `src/core/store.js` — `taskProg` rollup | utility (computed rollup) | transform | `src/core/store.js:491–503` | exact (rewrite in place) |
| `src/components/task-list.js` — recursive rows | component (render) | transform | `task-list.js:50–73` rowRow/expandRow caret | exact (generalize flat subrows) |
| `src/views/board.js` — badge + popover | component (render) | transform | `board.js:10–31 kcard` line 18 subp badge | exact |
| `src/views/timeline.js` — indented bars | component (render) | transform | `timeline.js:115–126` row renderers | role-match |
| `src/overlays/drawer.js` — tree checklist + menu | component (render) | transform | `drawer.js:104–107` subt section + `ctxBtn` line 67 | exact |
| `src/overlays/popovers.js` — context-menu items | component (menu) | event-driven | `popovers.js:100` `mi` button list | role-match |
| `src/pages/search.js` — subtask-hint result | component (render) | transform | `search.js:35` task-hit row | exact (add hint inline) |
| `src/export/model.js` — recursive rows + progress | utility (export model) | batch/transform | `model.js:44–50 taskProgress` + `185–219 subtask rows` | exact (rewrite in place) |
| `export/mspdi.js` — OutlineLevel | writer | batch | `mspdi.js:283` | exact (one-line change) |
| `db-adapter.mjs` — syncTaskFts | service (FTS sync) | event-driven diff | `db-adapter.mjs:515–564 syncTaskFts` | exact (extend in place) |
| `mcp.js` — shape mirror | service (MCP writeDoc) | request-response | `mcp.js:308–322 mcpStripMember` | role-match |
| `src/locales/en.json`/`fr.json` | config (i18n) | — | — | established pattern; see Shared: i18n |
| `test/subtask-tree.test.mjs` (NEW) | test | — | `test/error-codes.test.mjs` (house node:test style) | role-match |

All analog paths verified git-tracked (`git ls-files`, this session).

## Pattern Assignments

### `src/core/subtree.js` (NEW — pure tree module)

**Analog:** `src/export/model.js` — the house "shared, DOM-free, import-free module" precedent.

**Discipline to copy** (model.js:40–42):
```js
/* The default progress curve for a status (mirrors taskProg in
   src/core/store.js without importing the DOM-touching module). */
const STATUS_PROGRESS = { backlog: 0, todo: 5, progress: 45, review: 80, done: 100 };
```
Rules: zero imports, zero DOM, works under `node --test` AND the browser bundle. Export the API surface from research: `buildTree`, `depthOf`/`wouldExceedCap`, `validateMove`, `rollupProgress`, `descendantsOf`, `orderedSiblings` (comparator `(position, arrayIndex)` — model.js:239 precedent: plain comparators, never `localeCompare`).

Stored shape (owner-confirmed, CONTEXT D-01/D-02/D-03): `{ id:'u1', parentId:null, position:0, title:'…', done:false }`; task is implicit level-0 root; only tasks carry `subtasks[]`; all descendants are entries of that one array.

---

### `server.js` — `normalizeSubtasks` pass (whitelist sink)

**Analog:** `normalizeTaskAssignees`, `server.js:872–890` — the single normalize step that runs on every read (`normalizeDoc`/`docForClient`) and every incoming doc, recursing into subtasks:

```js
function normalizeTaskAssignees(t, memberIds) {
  const incoming = [];
  if (Array.isArray(t.assignees)) incoming.push(...t.assignees);
  if (t.assignee !== null && t.assignee !== undefined && t.assignee !== '') incoming.push(t.assignee);
  const out = [];
  const seen = new Set();
  for (const id of incoming) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (memberIds && memberIds.size && !memberIds.has(id)) continue; // out-of-scope strip (D-55-4)
    seen.add(id);
    out.push(id);
    if (out.length === 5) break; // cap 5, insertion order preserved (D-55-7)
  }
  t.assignees = out;
  delete t.assignee;
  if (Array.isArray(t.subtasks)) {
    for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds);
  }
}
```

**Where it hooks:** `mergeClientDoc` (`server.js:1258`) calls the assignee sink right after deep-cloning + `normalizeProjects` (lines 1280–1288). `normalizeSubtasks` slots into the same call block — before perm gates read tasks. **CRITICAL (CONTEXT note + research Pitfall 1):** any normalize pass that *rebuilds* subtask objects silently strips unknown fields — `parentId`, `id`, `position` must be explicitly carried or the pass must mutate in place like the analog above does.

**Lazy heal (research Runtime State Inventory):** legacy docs have no `parentId`/`position` — no migration; missing `parentId` → `null` (also covers dangling ids, incl. crafted cross-task references), missing/junk `position` → array index (D-03 tie rule), junk entries dropped. Phase 49/55 lazy-normalize precedent.

**Removal sweep to keep in sync:** `stripMember` subtask sweep (`server.js:2582–2589`) — its subtask branch must survive the new shape (it maps `{ ...s, assignees: … }`, which already preserves unknown fields — verify, don't break it):
```js
if (Array.isArray(next.subtasks) && next.subtasks.some(s => Array.isArray(s?.assignees) && s.assignees.some(hit))) {
  next.subtasks = next.subtasks.map(s => (Array.isArray(s?.assignees) ? { ...s, assignees: s.assignees.filter(id => !hit(id)) } : s));
}
```
Note the analog recurses only one level; the tree-aware version must walk all `subtasks[]` entries by `parentId` group (research Pattern 1 note).

---

### `server.js` — wholesale reject gate (D-05)

**Analog:** assignee-guard tx rollback, `server.js:5864–5869` — throw inside the funnel tx, catch maps `err.code` to `fail()`:
```js
} catch (err) {
  // SCOPE-04: the assignee write-guard rejects with an explicit 400 —
  // db.tx has already rolled the transaction back.
  if (err?.code === 'assigneeOutOfScope') return fail(res, 400, 'assigneeOutOfScope', 'Assignee cannot read the task project');
  throw err;
}
```
Add sibling branches: `err?.code === 'subtaskCycle'` and `'subtaskDepth'` → `fail(res, 400, code, …)`.

**Error contract** (`server.js:3850`):
```js
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```
Client maps `code → i18n key` (existing precedent `api.js:93` branches on `data?.code`). EN+FR keys land the same commit. FTS sync rides the same tx (`server.js:5861` — `await syncTaskFts(scope, row.id, storedDoc, next)` inside `db.tx`), so a rejected move never leaves a stale index.

---

### `src/actions/actions.js` — toggle/cascade/delete/add

**Analog:** `src/actions/actions.js:1081–1107` (verbatim current shape):
```js
A.toggleSub = el => {
  const t = task(el.dataset.id);
  const s = t.subtasks.find(x => x.id === el.dataset.sid);
  if (!s.done) fxSet({ done: s.id });
  mutate(() => {
    s.done = !s.done;
    logAct(s.done ? 'completedSubtaskOn' : 'reopenedSubtaskOn', t, { kind: 'quoted', value: s.title });
  });
};
A.rmSub = el => {
  const t = task(el.dataset.id);
  mutate(() => {
    t.subtasks = t.subtasks.filter(x => x.id !== el.dataset.sid);
  });
};
KEY.addSub = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (!v) return;
  const nid = uid('s');
  fxSet({ added: nid });
  mutate(() => {
    t.subtasks.push({ id: nid, title: v, done: false });
    logAct('addedSubtaskTo', t, { kind: 'subtaskAdded', value: v });
  });
  setTimeout(() => $('#d-sub')?.focus(), 0);
};
```
Extensions per decisions:
- `toggleSub` gains cascade (D-14): completing a subtask that is a parent auto-completes its open descendants — `descendantsOf` from `subtree.js`; **D-13: reopening a parent leaves descendants done** (no re-cascade). Also cascade task-level completion (SUB-03).
- `rmSub` delete becomes cascade: `t.subtasks.filter(s => !kill.has(s.id))` with `kill = {sid} ∪ descendantsOf(t, sid)` (children follow parent).
- `addSub` pushes `{ id: uid('s'), parentId: null, position: <next>, title: v, done: false }` — keep `uid('s')` id scheme (D-02 "uuid-style" is satisfied by the established prefix convention).
- Same structure for new `A.demoteSub`/`A.moveSubUpLevel`/`A.reparentSub` in `src/actions/subtasks.js` — `mutate(() => …)` + `logAct` + client pre-check via `subtree.validateMove` (UX only; server is authority, D-05).

---

### `src/actions/subtasks.js` — ⚠️ name-collision guard

**Analog:** `A.promoteSub` (`src/actions/subtasks.js:56–82`) — the existing action means **convert subtask → standalone task**:
```js
A.promoteSub = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (!s) return;
  let n;
  if (!mutate(() => { n = createTask({ title: s.title, … }); t.subtasks = t.subtasks.filter(x => x !== s); logAct('convertedASubtaskOf', …); })) return;
  S.ui.subOpen = null;
  render();
  toast(tMsg('toast.subtaskConverted', { key: n.key }), { action: tMsg('toast.open'), onAction: … });
};
```
Copy the house pattern (`subOf` lookup → `mutate` → `logAct` → `render`/`toast`) for the new restructure actions, but **do not reuse `promoteSub`/`promote` naming** — new keys must be distinct (e.g. `moveSubUp`/`moveSubDown`/`reparentSub`) so the shipped convert flow is untouched.

---

### `src/core/store.js` — leaf-only rollup

**Analog:** `taskProg` (`src/core/store.js:496–500`) — the flat rollup to rewrite:
```js
export function taskProg(t) {
  if (t.status === 'done') return 100;
  if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
  return { backlog: 0, todo: 5, progress: 45, review: 80 }[t.status] || 0;
}
```
Rule (research Pattern 3): numerator/denominator count **leaf subtasks only** (subtask with descendants contributes nothing itself). Keep the `status === 'done' → 100` short-circuit and the STATUS_PROGRESS fallback. Delegate the ratio to `subtree.rollupProgress` — store.js may import the DOM-free helper (model.js discipline cuts the other way: store.js is the DOM-touching one). Sibling `progressOf` (lines 491–495) is per-task-list and unaffected by nesting except through `t.status` rollups — verify against SUB-03 during planning.

---

### `src/components/task-list.js` — recursive indent + caret

**Analog:** flat row renderer (`task-list.js:50–73`) — caret toggle and subrow strip to generalize:
```js
${t.subtasks.length ? `<span class="ibtn ibtn-xs" data-a="expandRow" data-id="${t.id}" aria-label="…" aria-expanded="${!!open}" style="margin-left:-4px">${ic(open ? 'chevron-down' : 'chevron-right', 13)}</span>` : '<span style="width:18px;flex-shrink:0"></span>'}
…
${open ? `<div class="subrows">${t.subtasks.map(s => `<div class="subrow ${s.done ? 'done' : ''}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="…"><span>${esc(s.title)}</span></div>`).join('')}</div>` : ''}
```
Generalization: render children of a subtask recursively when `S.ui.openTasks` (or a new session-only `S.ui` map — D-10) says the node is expanded; indent per `depthOf`; order siblings via `subtree.orderedSiblings`. Progress chip on line 66 (`sd}/${t.subtasks.length` + progBar) must switch to the leaf-only rollup or it double-counts (Pitfall 3). The `expandRow` action/state key needs a per-node variant.

---

### `src/views/board.js` — count badge + popover checklist (D-11)

**Analog:** `kcard` (`board.js:10–31`), badge line 18:
```js
${t.subtasks.length ? `<div class="subp">${ic('list-checks', 12)}<span class="num">${sd}/${t.subtasks.length}</span>${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</div>` : ''}
```
D-11: badge shows **open** subtask count (not done/total — rework `sd` derivation to leaf-based open count); tapping expands the checklist in the existing card-popover pattern (line 27 `data-a="pop"` precedent for popover attachment). No nested kanban — badge only, no card-per-subtask. Rollup here must also be leaf-only.

---

### `src/views/timeline.js` — indented bars

**Analog:** row renderers (`timeline.js:115–126`), the `ms`/`g`/task branch shape:
```js
if (r.type === 'g')
  return `<div class="tl-row g">${r.G.html || ''}${esc(r.G.name)}<span class="faint" style="font-weight:500">${r.G.tasks.length}</span></div>`;
const t = r.t;
return `<div class="tl-row" data-a="openTask" data-id="${t.id}">${stIcon(t.status, 13)}<span class="trunc grow" …>${esc(t.title)}</span>${t.subtasks.length ? `<span class="faint num" …>${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>` : ''}${avStack(t.assignees || [], 3, 'sm')}</div>`;
```
The `r.type` discriminator + `.g` (group) class is the existing indented-row precedent — subtask bars become a new row type (or `depth` on the task row type) indented under the parent, collapsible (D-10 session state), dates inherited from parent when absent (D-12; same inheritance fallback as drawer line 105: `s.due || t.due`).

---

### `src/overlays/drawer.js` — tree checklist + context menu

**Analog:** subtasks section (`drawer.js:104–107`) — flat checklist, the exact surface D-09's actions live beside:
```js
<div class="dsec"><div class="dsec-h"><h3>${tMsg('modal.subtasks')}</h3><span class="cnt num">${sd}/${t.subtasks.length}</span>${…progBar…}</div>
  ${t.subtasks.map(s => `<div class="subt ${s.done ? 'done' : ''}…"><input type="checkbox" … data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" …><button class="s" data-a="openSub" data-id="${t.id}" data-sid="${s.id}">${esc(s.title)}</button>${(() => { const due = s.due || t.due; return due ? `<span class="due" …>${ic('calendar', 12)}${relDate(due)}</span>` : ''; })()}…</div>`).join('')}
  <div class="subt" style="color:var(--text-3)">${ic('plus', 15)}<input class="inline-in" id="d-sub" data-key-enter="addSub" …></div>
</div>
```
- Recurse/indent via `orderedSiblings` per `parentId`; per-subtask collapse carets (D-10 state).
- Context-menu entry point already exists: `ctxBtn` `data-ctx="task"` (drawer.js:67, task-list.js:70, board.js:29) — extend the task context menu (and/or a per-subtask `ctxBtn`) with promote/demote/re-parent menu items.
- Note the date-inheritance tip pattern (`page.subtask.inheritedDue`) — D-12 timeline inherits the same way.
- Header counter + progBar (line 104) → leaf-only rollup.

**Menu item markup analog** — `src/overlays/popovers.js:100`:
```js
${list.map(it => `<button class="mi" data-a="${it.act || 'popPick'}" data-v="${esc(it.id)}" role="menuitemradio" aria-checked="${!!it.on}">${it.html || ''}<span class="trunc">${esc(it.name)}</span>${it.kbd ? `<span class="r"><kbd>${it.kbd}</kbd></span>` : ''}${it.on ? `<span class="ck">${ic('check', 14)}</span>` : ''}</button>`).join('') || `<div class="mi faint" style="cursor:default">${tMsg('popover.noMatches')}</div>`}
```

---

### `src/pages/search.js` — subtask hint (D-07)

**Analog:** server task-hit row (`search.js:35`):
```js
`<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}<span class="mono faint" style="font-size:11px">${t.key}</span><span class="tt">${hl(t.title, q)}</span><span class="pj">…${esc(proj(t.project).name)}</span>${avStack(t.assignees || [], 3, 'sm')}${`
```
A subtask-title hit renders the **parent task row** (same `data-a="openTask"` — drawer opens, no deep-link per D-07) with an inline hint, e.g. append `<span class="hint">via subtask: ${hl(matchingSubTitle, q)}</span>` styled like the existing `.pj`/faint spans. Server side: the hit must expose which subtask title matched — carry it in the search response alongside the task id (fold pattern below guarantees the text is in the index).

---

### `src/export/model.js` — recursive rows + duplicated rollup (fix BOTH copies)

**Analog:** `taskProgress` (`model.js:44–50`) — deliberately duplicated copy of `taskProg` (model.js must stay import-free; keep the duplication, fix both):
```js
export function taskProgress(t) {
  if (t.status === 'done') return 100;
  if (Array.isArray(t.subtasks) && t.subtasks.length) {
    return Math.round((t.subtasks.filter(s => s && s.done).length / t.subtasks.length) * 100);
  }
  return STATUS_PROGRESS[t.status] || 0;
}
```

**Analog:** subtask row emission (`model.js:185–219`) — flat, `PARENT.n` keyed:
```js
if (options.subtasks && Array.isArray(t.subtasks)) {
  t.subtasks.forEach((s, i) => {
    …
    rows.push({
      key: (t.key || '') + '.' + (i + 1),
      title: s?.title || '',
      …
      id: t.id,
      statusId: done ? 'done' : 'todo',
      priorityId: 'none',
      deps: [],
      archived: !!t.archived,
      parent: t.id,
    });
  });
}
```
Generalization (research Pattern 5): walk `buildTree(task)` order (position-sorted); row key per level (`PARENT.1.2` style); `parent` = parent row's id (**subtask id** for nested rows, task id for roots); add `depth` to row meta; keep every row's date-inheritance fallbacks (`start: s.start || t.start`, etc.). Predicate `topRows = rows.filter(r => !r.parent)` (line 222) already keeps all child rows out of KPIs — nested rows all carry `parent`, so it holds unchanged. xlsx/CSV writers consume `model.rows` unchanged.

---

### `export/mspdi.js` — OutlineLevel = depth

**Analog:** `mspdi.js:283` (one-line extension point):
```js
`<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(row.title)}</Name><Type>1</Type>${row.parent ? '<OutlineLevel>1</OutlineLevel>' : ''}<Start>${start}</Start>…`
```
Change to `row.depth ? '<OutlineLevel>' + (row.depth + 1) + '</OutlineLevel>' : ''` — MSPDI OutlineLevel is 1-based (task = level 1, first subtask = 2). **A1 flag:** verify 1-basing against `test/export-mspdi.test.mjs` expectations during planning. `Summary`/`constraint` logic on the same line already keys off `row.parent` — re-check each against depth rows.

---

### `db-adapter.mjs` — FTS subtask titles (D-06/D-08)

**Analog:** `syncTaskFts` diff loop (`db-adapter.mjs:515–564`); two edit points:

1. **unchanged-check** (line 555) must include a subtask-title signature, else structure-only changes skip reindex:
```js
if (nt && nt.title === t.title && nt.desc === t.desc && nt.project === t.project) continue; // unchanged → index untouched (SEARCH-03 empty edge)
```
→ compare a cheap serialized subtask-title string too (`titles(t) !== titles(nt)`). Deletion then follows the doc automatically (D-08, no sweep). Empty subtree = unchanged empty string, no special case.

2. **insert()** (lines 532–550) — both dialects consume the same folded text today; **symmetry rule:** compute the subtask-title suffix once, append to both:
```js
const insert = (id, t) => {
  const foldedTitle = foldForSearch(t.title).text;
  const foldedBody = foldForSearch(stripTags(t.desc)).text;
  return pg
    ? scope.run(`insert into task_search_projection …`, [wsId, id, String(t.project ?? ''), `${foldedTitle} ${foldedBody}`, `${foldedTitle} ${foldedBody}`])
    : scope.run('insert into task_fts (ws_id, task_id, project_id, title, body) values (?,?,?,?,?)', [wsId, id, String(t.project ?? ''), foldedTitle, foldedBody]);
};
```
Reuse `foldForSearch` / `stripTags` (already imported here) — never hand-roll normalization (research "Don't Hand-Roll"). **No schema change** — `task_search_projection` (lines 491–496) folds everything into text; FTS5 `task_fts` likewise.

---

### `mcp.js` — shape mirror

**Analog:** `mcpStripMember` (`mcp.js:308–322`) — MCP keeps its own member-strip copy that walks subtasks on a `next` copy; it must learn the new subtask shape (research Pitfall 1 explicitly names mcp.js:318–320):
```js
d.tasks = (d.tasks || []).map(t => {
  const next = hit(t.assignee) ? { ...t, assignee: null } : t;
  if (Array.isArray(next.subtasks) && next.subtasks.some(s => hit(s?.assignee))) {
    next.subtasks = next.subtasks.map(s => (hit(s?.assignee) ? { ...s, assignee: null } : s));
  }
  return next;
});
```
writeDoc rides `mergeClientDoc`, so the funnel gate covers MCP writes too (SUB-04 round-trip proven by extending `test/mcp.test.mjs` — write `parentId`/`position` doc, read it back intact).

---

### `src/locales/en.json` + `fr.json` + i18n scan

**Analog:** every `tMsg('a11y.…')`/`tk('…')` call shown above; error keys follow the contract pinned by `test/error-codes.test.mjs:19–28`:
```js
for (const m of serverSource.matchAll(/fail\(res,\s*\d+,\s*'([A-Za-z][A-Za-z0-9]*)'/g)) codes.add(m[1]);
…
assert.ok(typeof en[`err.${code}`] === 'string' && en[`err.${code}`] !== '', `en missing err.${code}`);
assert.ok(typeof fr[`err.${code}`] === 'string' && fr[`err.${code}`] !== '', `fr missing err.${code}`);
```
Adding `fail(res, 400, 'subtaskCycle', …)` / `'subtaskDepth'` to server.js **requires** non-empty `err.subtaskCycle`/`err.subtaskDepth` in BOTH catalogues or this gate fails. UI strings (menu labels, hint text, a11y labels) get keys in the same commit (EN+FR, agent's discretion on wording). Dead-key scan runs in `prebuild` (`scripts/i18n-scan.mjs`).

---

### `test/subtask-tree.test.mjs` (NEW)

**Analog:** `test/error-codes.test.mjs` house style — `node:test`, `import assert from 'node:assert/strict'`, JSON-catalogue imports `with { type: 'json' }`, server test helpers from `./helpers/server.mjs`. Cover: normalize (whitelist survival, lazy heal, dangling→root), validateMove (cycle, depth>5, wholesale reject codes), cascade delete, cascade auto-done (D-14) + no reopen-cascade (D-13), leaf-only rollup, repeat-PUT idempotency, chunk gate untouched. Extensions: `search-fts` (+pg parity), `export-mspdi`/`export-model`/`mcp`, `error-codes` (codes arrive automatically via the static extraction — just add the catalogue keys).

## Shared Patterns

### The funnel sink + whitelist discipline (D-53-1)
**Source:** `server.js:872–890` (normalize), `server.js:1258/1280–1288` (hook point), `server.js:2582–2589` (sweep), `mcp.js:308–322` (MCP mirror)
**Apply to:** every touch of subtask shape. Any pass that rebuilds subtask objects must carry `id`/`parentId`/`position` explicitly or mutate in place. Both server `stripMember` and MCP `mcpStripMember` must be updated together.

### Wholesale reject → tx rollback → code → i18n (D-05)
**Source:** `server.js:5864–5869` + `fail()` `server.js:3850` + `test/error-codes.test.mjs:20–28`
**Apply to:** tree validation only. Per-item refusal (the funnel's usual philosophy) is explicitly overridden here. Client maps `code → err.<code>` key (api.js:93 precedent).

### Leaf-only progress, fixed at every copy
**Source:** `src/core/store.js:498`, `src/export/model.js:47`, and every inline `sd}/${t.subtasks.length}` progress chip (`task-list.js:66`, `board.js:18`, `timeline.js:124`, `drawer.js:104`)
**Apply to:** all five call sites — the naive flat ratio double-counts nested parents (research Pitfall 3). The rollup lives once in `src/core/subtree.js`.

### Session-only UI state in `S.ui`
**Source:** `task-list.js:50` `S.ui.openTasks[t.id]`, `board.js:36` `S.ui.collapsedCols`
**Apply to:** collapse/expand state for tree nodes (D-10) — never persisted per user.

### Event-delegated action wiring
**Source:** `data-a="toggleSub" data-id data-sid` → `A.toggleSub(el)` reading `el.dataset` (actions.js:1081–1095, drawer.js:105)
**Apply to:** all new actions (move/demote/reparent/collapse) — same attribute contract, no direct listeners.

### DOM-free shared module discipline
**Source:** `src/export/model.js` header comment (line 40–42 excerpt above)
**Apply to:** `src/core/subtree.js` — zero imports, zero DOM, plain comparators (no `localeCompare`), importable by both `node --test` and the browser bundle.

## No Analog Found

| File | Role | Data Flow | Reason | Planner guidance |
|------|------|-----------|--------|------------------|
| `src/core/subtree.js` — `validateMove` (cycle+depth) | utility | transform | No tree validation exists anywhere in the repo (deepest structure today is one level) | Use research Pattern 1 sketch + D-04/D-05 rules; pure function returning `{ ok }` or `{ code }` |
| subtask-hint search response field | server payload | request-response | Search responses currently expose no "matched sub-path" concept | Keep minimal: matched-title string beside task id; render analog is search.js:35 |
| e2e tree spec | test | — | No existing spec exercises restructure UX | Follow `npm run e2e` Playwright config (e2e/playwright.config.mjs); base on existing board/drawer specs |

## Metadata

**Analog search scope:** `server.js`, `db-adapter.mjs`, `mcp.js`, `src/core/`, `src/actions/`, `src/components/`, `src/views/`, `src/overlays/`, `src/pages/`, `src/export/`, `export/`, `test/`
**Files read this session:** 14 source files (targeted ranges), 1 test file; all analog paths git-tracked via `git ls-files`
**Pattern extraction date:** 2026-11-15
