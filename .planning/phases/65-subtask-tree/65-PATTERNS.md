# Phase 65: Subtask Tree - Pattern Map

**Mapped:** 2026-11-15
**Files analyzed:** 15 new/modified files
**Analogs found:** 15 / 15 (no-analog count 0 for role matches; 1 truly new file — `src/core/subtree.js` — patterned on existing helpers)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/subtree.js` (NEW) | utility | transform | `src/core/store.js` helpers (`taskProg`) + server-side sweeps | partial (no tree helper exists) |
| `server.js` (funnel validators, cascade, sweeps) | service | request-response | `server.js` normalizeTaskAssignees / write-guard / stripMember | exact |
| `db-adapter.mjs` (FTS fold) | service | streaming (index sync) | `syncTaskFts` itself (extend in place) | exact |
| `src/core/store.js` (`taskProg`, `S.ui.subCollapsed`) | store | transform | existing `taskProg` + `S.ui.collapsedCols` | exact |
| `src/actions/subtasks.js` (promote/demote/re-parent) | controller (client actions) | event-driven | `A.promoteSub` in same file | exact |
| `src/actions/actions.js` (`toggleSub`/`rmSub`/`toggleDone` cascade mirror) | controller | event-driven | `A.toggleSub` / `A.rmSub` / `A.toggleDone` | exact |
| `src/overlays/drawer.js` (tree checklist) | component | request-response (render) | drawer subtask block, lines 104-107 | exact |
| `src/overlays/popovers.js` (restructure menu) | component | event-driven | existing popover menu actions | role-match |
| `src/views/table.js` (indented tree rows) | component | render | `tcell`/`tableHtml` + `S.ui.collapsedGroups` pattern | exact |
| `src/views/board.js` (open-count badge) | component | render | `kcard` subtask progress row, line 18 | exact |
| `src/views/timeline.js` (indented bars) | component | render | `tl-row` template, line 124 | exact |
| `src/pages/search.js` (subtask-hint row) | component | request-response | `taskRow`/`srvRows`, lines 34-53 | exact |
| `src/export/model.js` (nested child rows) | service | transform (batch) | subtask child-row block, lines 185-219 | exact |
| `export/mspdi.js` (OutlineLevel/Summary depth) | service | transform | writer rows loop, lines 200-284 | exact |
| `mcp.js` (parentId parity in builders/whitelist) | service | request-response | `create_task` / `add_subtask` / `update_task` whitelist | exact |
| `src/core/i18n.js` (EN+FR keys) | config | static | existing catalogue entries | exact |
| `test/subtask-tree.test.mjs` (NEW) + extensions | test | batch | existing `test/*.test.mjs` node-test suite | role-match |

**All named analogs are git-tracked (`git ls-files` verified 2026-11-15).**

## Pattern Assignments

### `src/core/subtree.js` (NEW — shared tree helpers, utility, transform)

**Analog:** no direct analog; keep it DOM-free (imported by both client and server tests) like `src/core/store.js` pure helpers.

**Shape to copy** — pure-function module, exported helpers, from `src/core/store.js:491-500`:

```js
export function taskProg(t) {
  if (t.status === 'done') return 100;
  if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
  return { backlog: 0, todo: 5, progress: 45, review: 80 }[t.status] || 0;
}
```

`buildSubtree(t)` / `depthOf` / `wouldCycle` / `gatherDescendants` / `rollupProg` follow the same style: pure, no imports of DOM modules, group on `s.parentId ?? null`, sibling order = array order (D-01/D-03). **Do NOT import from `src/` into `export/`** — the mspdi prohibition test fails (`export/mspdi.js:4-6` documents it); export needs a self-contained copy of the depth calc in `src/export/model.js`.

### `server.js` — funnel validators, cascade, sweeps (service, request-response)

**Analog 1 — tree-aware sweep:** `normalizeTaskAssignees`, lines 872-890. The recursion at 887-889 is the template for every new sweep (parentId/id sanitization, delete-cascade):

```js
  t.assignees = out;
  delete t.assignee;
  if (Array.isArray(t.subtasks)) {
    for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds);
  }
}
```

**Rule:** sweeps mutate the subtask object in place; strip-style sweeps must SPREAD, never rebuild field-by-field — see `stripMember` lines 2582-2589 (the D-01 "silent strip" precedent):

```js
  d.tasks = (d.tasks || []).map(t => {
    const next = { ...t };
    if (Array.isArray(next.assignees)) next.assignees = next.assignees.filter(id => !hit(id));
    if (Array.isArray(next.subtasks) && next.subtasks.some(s => Array.isArray(s?.assignees) && s.assignees.some(hit))) {
      next.subtasks = next.subtasks.map(s => (Array.isArray(s?.assignees) ? { ...s, assignees: s.assignees.filter(id => !hit(id)) } : s));
    }
    return next;
  });
```

**Analog 2 — funnel insertion point:** `mergeClientDoc` starts at line 1258 (`async function mergeClientDoc(incoming, stored, membership, wsId, refusals = [])`), deep-copies via `JSON.parse(JSON.stringify(incoming))` at 1259, runs normalize sweeps at 1285-1288, then `mergeList` per list at 1478 (`nextData.tasks = mergeList(storedData.tasks, nextData.tasks, …)`). New tree validators (cycle/depth/dangling parentId → wholesale reject, D-05) go after the normalize sweeps and before the merge; the cascade (SUB-03) after merge.

**Analog 3 — error style:** write-guard throw with code, lines 1552-1557:

```js
        if (!(await memberCanReadProject(projectById.get(t.project), wsId, a))) {
          const err = new Error('Assignee cannot read the task project');
          err.code = 'assigneeOutOfScope';
          throw err;
        }
```

Copy this shape for `subtaskCycle` / `subtaskDepthOverflow` codes (httpError style also used in-repo: `throw httpError(409, msg, 'lastPrivateMember')`, `server.js:2596`). The write-guard at 1546-1559 also shows the flat `t.subtasks` flatMap over assignees (line 1550) — permission coverage for nested rows is already structural; extend tests only (A5).

### `db-adapter.mjs` — FTS subtask-title fold (D-06/D-08)

**Analog:** extend `syncTaskFts` (lines 515-573) and `ftsSweep` in place. `insert` (532-550):

```js
  const insert = (id, t) => {
    const foldedTitle = foldForSearch(t.title).text;
    const foldedBody = foldForSearch(stripTags(t.desc)).text;
    return pg
      ? scope.run(`insert into task_search_projection ... on conflict (workspace_id, task_id) do update set ...`, [wsId, id, String(t.project ?? ''), `${foldedTitle} ${foldedBody}`, `${foldedTitle} ${foldedBody}`])
      : scope.run('insert into task_fts (ws_id, task_id, project_id, title, body) values (?,?,?,?,?)', [wsId, id, String(t.project ?? ''), foldedTitle, foldedBody]);
  };
```

Append the subtask-title fold to both backends' text. **Critical:** the diff skip at line 555 must consider the folded subtask text or subtask-title-only changes are invisible (Pitfall 1):

```js
    if (nt && nt.title === t.title && nt.desc === t.desc && nt.project === t.project) continue; // unchanged → index untouched
```

All writes go through `scope.run`/`scope.get` inside tx (pg Pitfall 2). No schema change, no tokenizer change (tokenizer locked at table creation). For the D-07 hint, `searchTasks` (581-598) returns only `task_id, project_id` — post-filter matching subtask titles in the route, no per-subtask rows.

### `src/core/store.js` — rollup + session collapse state

**Analog 1 — `taskProg`** (lines 496-500, quoted above): becomes the nested-aware rollup; consume the shared `src/core/subtree.js` helper so client and server rules can't diverge (Pitfall 5: board/drawer/timeline all count `sd/len` today — board.js:13-18, drawer.js:38, timeline.js:124 — one shared helper for all).

**Analog 2 — session-only UI state:** `S.ui` literal at store.js lines 135/152:

```js
    collapsedGroups: {},
    ...
    collapsedCols: {},
```

Add `subCollapsed: {}` here (D-10). It is automatically excluded from persistence: `docSnapshot()` (lines 172-175) carries only `{ data, prefs, collapsed }` — collapse state must never ride a save:

```js
const docSnapshot = () => {
  delete S.data.notifPrefs;
  return { data: S.data, prefs: S.prefs, collapsed: S.ui.collapsed };
};
```

### `src/actions/subtasks.js` — tree restructure actions (controller, event-driven)

**Analog:** `A.promoteSub`, lines 56-82. The action pattern is: look up via `task(id)` + `subOf`, wrap mutation in `mutate()` (rolls back local state on failure and returns falsy → early return), `logAct` inside the mutate, then `render()` + `toast(tMsg(...))`:

```js
A.promoteSub = el => {
  const t = task(el.dataset.id);
  const s = subOf(t, el.dataset.sid);
  if (!s) return;
  let n;
  if (!mutate(() => { ...; logAct('convertedASubtaskOf', t, { kind: 'subtaskConverted', value: n.key }); })) return;
  S.ui.subOpen = null;
  render();
  toast(tMsg('toast.subtaskConverted', { key: n.key }), { ... });
};
```

**Naming collision (anti-pattern):** `A.promoteSub` already means "subtask → top-level task". Name the new tree actions distinctly (`subPromoteLevel`/`subDemoteLevel`/`subReparent`). Mutations ride the normal `save()` → doc-PUT — no new write path (D-09). Pre-validate with the shared tree helper inside the action so a rejected move never half-mutates the local tree (Pitfall 3 / A1: client does NOT auto-rollback on server refusal).

**Cascade mirror:** `A.toggleDone` (`src/actions/actions.js:728`) and `A.toggleSub` (1081) are where the client mirrors the server's parent-done cascade for instant UI; `uid('s')` from `actions.js:910` (`S.ui.form.subtasks.push({ id: uid('s'), title: v, done: false })`) is the id generator for new subtask rows — new rows get `parentId: null` unless created under a node.

### `src/overlays/drawer.js` — tree checklist render

**Analog:** the subtask block, lines 104-107. The flat row template at 105 is the row unit to recurse over:

```js
${t.subtasks.map(s => `<div class="subt ${s.done ? 'done' : ''}${fxc('added', s.id)}${fxc('done', s.id)}"><input type="checkbox" class="check" ${s.done ? 'checked' : ''} data-a="toggleSub" data-id="${t.id}" data-sid="${s.id}" aria-label="..."><button class="s" data-a="openSub" data-id="${t.id}" data-sid="${s.id}">${esc(s.title)}</button>${(() => { const due = s.due || t.due; ... })()}...`).join('')}
```

Note the date-inheritance IIFE (`s.due || t.due`, `s.start || t.start`) — reuse the same inheritance for timeline bars (D-12). Keep the `data-a="openSub"` action and `t.id`+`s.id` dataset convention for nested rows. Count header at 104 (`${sd}/${t.subtasks.length}` + progBar) switches to the shared rollup helper. `subtaskHtml` lives in `src/features/subtasks.js` (imported at drawer.js:17) — the sub-detail pane that restructure actions open.

### `src/views/table.js` — indented tree rows (SUB-01)

**Analog:** title cell, lines 29-32, and the group-row caret precedent at 88. The title cell already carries `stIcon` + trunc + key; subtask rows render as additional `<tr>`s after the parent task row with indent `padding-left: calc(16px * depth)` and a caret toggling `S.ui.subCollapsed[sid]`; open affordance keeps `data-a="openTask"` pointing at the parent task (no deep-link):

```js
    case 'title':
      return ed
        ? `<td class="sticky editing"><input id="edit-cell" ...></td>`
        : `<td class="sticky cellbtn" data-a="openTask" data-id="${t.id}" ...><span class="row" style="gap:8px">${stIcon(t.status, 13)}<span class="trunc" ...>${esc(t.title)}</span>...</span></td>`;
```

Collapse pattern analog: `S.ui.collapsedGroups` / group header count in `tableHtml` lines 86-91 — subtask rows emit inside the same `g.tasks.map(t => ...)` row loop, DFS order, siblings in array order.

### `src/views/board.js` — open-count badge (D-11)

**Analog:** `kcard` subtask row, line 18:

```js
    ${t.subtasks.length ? `<div class="subp">${ic('list-checks', 12)}<span class="num">${sd}/${t.subtasks.length}</span>${progBar(Math.round((sd / t.subtasks.length) * 100), sd === t.subtasks.length ? 'green' : '')}</div>` : ''}
```

Replace `sd` with the shared open-count helper (D-11 says badge = count of OPEN subtasks). Tapping expands the checklist in the existing card popover pattern — wire via `data-a="pop"` like the other meta buttons (lines 22-27), no nested kanban.

### `src/views/timeline.js` — indented bars (D-12)

**Analog:** left label row, line 124 (currently shows only a count chip):

```js
      return `<div class="tl-row" data-a="openTask" data-id="${t.id}">${stIcon(t.status, 13)}<span class="trunc grow" ...>${esc(t.title)}</span>${t.subtasks.length ? `<span class="faint num" ...>${t.subtasks.filter(s => s.done).length}/${t.subtasks.length}</span>` : ''}${avStack(t.assignees || [], 3, 'sm')}</div>`;
```

Add indented subtask rows (same `tl-row` shape, indent + caret wired to `S.ui.subCollapsed`); bars must extend the row-height machinery (`rowY`/`H` at lines 139-143) for the extra rows; dates `s.start || t.start` / `s.due || t.due`.

### `src/pages/search.js` — subtask-hint (D-07)

**Analog:** `taskRow` and the server-hit `srvRows`, lines 34-53. The hint rides the existing snippet slot — no new view (the file's own D-05 comment: "server-only hits reuse the EXISTING task-row markup — no new view"):

```js
  const taskRow = (t, snippet) =>
    `<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}...${
      snippet ? `<span class="faint" style="font-size:12px;...">${esc(snippet)}</span>` : ''
    }</div>`;
```

Render "via subtask: …" as the snippet; `data-a="openTask"` opens the parent drawer — keep exactly this action, no deep-link.

### `src/export/model.js` — nested child rows (SUB-04)

**Analog:** the subtask child-row block, lines 185-219 (quoted in part):

```js
    if (options.subtasks && Array.isArray(t.subtasks)) {
      t.subtasks.forEach((s, i) => {
        rows.push({
          key: (t.key || '') + '.' + (i + 1),
          ...
          start: s.start || t.start || '',
          due: t.due || '',
          ...
          id: t.id,
          ...
          parent: t.id,
        });
      });
    }
```

Extend this loop recursively: nested subtasks become additional rows in DFS order (parent-then-children, array order for siblings), key scheme extends (`PARENT.n.m` style), each row carries its `parentId`-derived depth. Date inheritance line 202-203 is the exact pattern. Rows are excluded from kpis via `topRows = rows.filter(r => !r.parent)` (line 222) — nested rows keep `parent` set so this holds.

### `export/mspdi.js` — OutlineLevel/Summary depth (SUB-04)

**Analog:** UID/summary maps at 200-208 and the Task row at 282-283:

```js
  const uidOf = new Map();
  rows.forEach((r, i) => { if (r && r.id && !r.parent) uidOf.set(r.id, i + 1); });
  const summaryIds = new Set(rows.map(r => r?.parent).filter(Boolean));
  ...
      `<Task><UID>${uid}</UID><ID>${uid}</ID><Name>${esc(row.title)}</Name><Type>1</Type>${row.parent ? '<OutlineLevel>1</OutlineLevel>' : ''}...<Summary>${!row.parent && summaryIds.has(row.id) ? 1 : 0}</Summary>...`,
```

Changes: `<OutlineLevel>` becomes depth+1 (from the model's new depth field); `summaryIds` becomes subtree-aware (any row that parents child rows at ANY level). **Do not reorder** — MSPDI is positional; model DFS order satisfies it. No `src/` imports into this file.

### `mcp.js` — parentId parity (SUB-04 round-trip)

**Analog 1:** `create_task` builder, line 1238 — subtasks are rebuilt title-strings → objects:

```js
          subtasks: (Array.isArray(a.subtasks) ? a.subtasks : []).map(title => ({ id: uid('s'), title: String(title).trim().slice(0, 200), done: false })),
```

**Analog 2:** `add_subtask` (1362-1379) — builder + writeDoc mutation:

```js
        const sub = { id: uid(), title: a.title.trim(), done: false };
        await writeDoc(ctx.ws, async d => {
          const live = tasksOf(d).find(x => x.id === t.id);
          live.subtasks = Array.isArray(live.subtasks) ? live.subtasks : [];
          live.subtasks.push(sub);
          ...
        });
```

**Analog 3:** the unknown-key whitelist, lines 1684-1685 — any round-trip payload carrying subtask-level `parentId` must pass this list:

```js
          if (Object.keys(t).some(k => !['title', 'description', 'status', 'assignee', 'priority', 'due', 'start', 'labels', 'recur', 'estimate', 'subtasks'].includes(k))) {
```

Extend builders to carry `parentId` (`null` for roots) and the whitelist in the same commit; round-trip test: doc-PUT in → MCP get → MCP write → doc-PUT out → tree byte-identical.

### `src/core/i18n.js` — EN+FR keys

**Analog:** existing catalogue; every new key (`toast.subtaskCycle`, `toast.subtaskDepth`, a11y caret labels, hint label) must exist in EN and FR in the same commit (i18n scan gate in `npm run build`).

### Tests (Wave 0)

**Analog:** `node --test` suite (`test/*.test.mjs`, `--test-concurrency=2` per package.json). New `test/subtask-tree.test.mjs` follows the existing funnel-test shape (import server helpers, doc fixtures). Extensions to `test/db-adapter.test.mjs`, `test/search-fts.test.mjs` (byte-identical SQLite/pg parity), `test/export-model.test.mjs`, `test/export-mspdi.test.mjs`, and a new e2e spec (`e2e/playwright.config.mjs`, 115/115 baseline).

## Shared Patterns

### Funnel mutate-in-place + spread sweeps
**Source:** `server.js:887-889`, `server.js:2582-2589`
**Apply to:** every new normalize/strip pass and the delete-cascade.
```js
if (Array.isArray(t.subtasks)) {
  for (const s of t.subtasks) if (s && typeof s === 'object') normalizeTaskAssignees(s, memberIds);
}
// strip style — spread, never field-rebuild:
next.subtasks = next.subtasks.map(s => (cond ? { ...s, changed } : s));
```

### Wholesome reject with coded error
**Source:** `server.js:1552-1557` (`err.code = 'assigneeOutOfScope'`)
**Apply to:** cycle/depth validators at the funnel; client toasts map codes to `toast.subtaskCycle` / `toast.subtaskDepth` i18n keys.

### Date/field inheritance from parent
**Source:** `src/overlays/drawer.js:105` (`s.due || t.due`), `src/export/model.js:202-203`
**Apply to:** timeline bars and any subtask row rendering.

### Session-only collapse state in S.ui
**Source:** `src/core/store.js:135,152` (`collapsedGroups`, `collapsedCols`); excluded from `docSnapshot()` (172-175)
**Apply to:** `S.ui.subCollapsed` used by table/timeline/drawer carets. Never persisted.

### One shared rollup/count helper
**Source:** `src/core/store.js:496-500` (current `taskProg`); consumers board.js:18, drawer.js:104, timeline.js:124
**Apply to:** `src/core/subtree.js` rollup consumed by all surfaces + server cascade, so counts never double-count and rules can't diverge.

### data-a action + dataset convention
**Source:** throughout (`data-a="toggleSub" data-id= data-sid=`, drawer.js:105; `data-a="openTask"`, table.js:32/search.js:35)
**Apply to:** every new caret/menu/badge control; restructure menus ride `data-a` + popover pattern, no drag-and-drop (D-09).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/core/subtree.js` | utility | transform | No tree helper exists anywhere; model on pure store helpers, DOM-free, zero dependencies |

## Metadata

**Analog search scope:** `server.js`, `db-adapter.mjs`, `mcp.js`, `src/core/`, `src/actions/`, `src/views/`, `src/overlays/`, `src/pages/`, `src/export/`, `export/`
**Files scanned:** ~20 (targeted reads; all analogs git-tracked, verified via `git ls-files`)
**Pattern extraction date:** 2026-11-15
