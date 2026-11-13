# Phase 58: Full-Text Search - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 8 (all verified git-tracked via `git ls-files`)
**Analogs found:** 8 / 8 (all are modifications/extensions of existing tracked files or new files with direct in-repo analogs)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `db-adapter.mjs` (modified: `ensureSearchIndex`, `syncTaskFts`, `searchTasks`, `ftsSweep`) | adapter/service | CRUD + transform | `db-adapter.mjs` own facade/tx/schema sections | exact (self-extension) |
| `server.js` (modified: funnel tx diff, boot sweep call, GET search route) | controller + migration | request-response + batch | own PUT funnel (5351-5430), boot sequence (2470-2498), GET workspace route (5340-5349) | exact (self-extension) |
| `mcp.js` (modified: `writeDoc` tx gains FTS sync) | service | event-driven write | `mcp.js` `writeDoc` (174-186) | exact (self-extension) |
| `src/core/search-server.js` (new; or `src/core/api.js` extension) | client service | request-response (debounced/abortable fetch) | `src/core/searchall.js` (pure-search-core convention) + `api.enabled` gate from `src/overlays/palette.js:59,71` | role-match |
| `src/overlays/palette.js` (modified: merge server results) | component/controller | event-driven render | own `paletteItems()` (64-213) + `commands()` gate (59) | exact (self-extension) |
| `src/pages/search.js` (modified: merge server tasks) | page component | request-response render | own `pageSearch()` (8-89) | exact (self-extension) |
| `test/search-fts.test.mjs` (new) | test | batch | `test/db-adapter.test.mjs` (existing DBA parity suite) | role-match |
| `test/db-adapter.test.mjs` (extended) | test | batch | itself | exact (self-extension) |

## Pattern Assignments

### `db-adapter.mjs` — adapter seam (service, CRUD/transform)

**Analog:** its own facade + per-dialect branch. The FTS functions follow the exact established shape: one exported function per operation, `backendKind === 'pg'` branch inside, callsites stay portable, parameterized SQL only.

**Facade + dialect-branch pattern** (db-adapter.mjs:431-444):
```js
export async function get(sql, params = []) {
  return backendKind === 'pg' ? pgGet(sql, params) : sqliteRows(sqlite.prepare(sql).get(...params));
}
export async function run(sql, params = []) {
  return backendKind === 'pg' ? pgRun(sql, params) : sqliteRun(sql, params);
}
export async function tx(fn) {
  if (backendKind === 'pg') return pgTx(fn);
  return sqliteTx(() => sqliteTxScope(fn));
}
```
New shape to copy (for `searchTasks` — Pattern 2 in RESEARCH.md):
```js
export async function searchTasks(wsId, foldedTerms, limit = 30) {
  if (backendKind === 'pg') {
    // task_search_projection: projection @@ to_tsquery('simple', terms.join(' & '))
    //   order by ts_rank desc limit ?
  }
  // SQLite: select task_id, project_id from task_fts where task_fts match ?
  //   order by rank limit ?   -- match arg = terms.map(t => t + '*').join(' ')
}
```

**Schema creation pattern** — dialect-owned, one branch site (db-adapter.mjs:343-350). `ensureSearchIndex()` should follow `runSchema`'s statement-splitting discipline:
```js
export async function runSchema(schemaSql) {
  const sql = backendKind === 'pg' ? pgSchemaVariant(schemaSql) : schemaSql;
  for (const stmt of sql.split(/;\s*\n/).map(s => s.trim()).filter(Boolean)) await run(stmt);
}
```

**CRITICAL — tx scope pattern (Pitfall 2, pg-only):** inside `db.tx(fn)`, pg runs `fn(scope)` on a checked-out client (db-adapter.mjs:400-420). The FTS sync MUST use the passed scope, NOT module-level `db.run` — otherwise pg writes land outside the transaction:
```js
// db-adapter.mjs:405-409 — the scope signature to thread into syncTaskFts
const scope = {
  get: async (sql, params) => (await client.query(pgRewrite(sql), params)).rows[0],
  all: async (sql, params) => (await client.query(pgRewrite(sql), params)).rows,
  run: async (sql, params) => ({ changes: (await client.query(pgRewrite(sql), params)).rowCount }),
};
// syncTaskFts(scope, wsId, storedDoc, next) — accepts scope; callers pass the tx scope
```

**Error contract:** every run returns `{ changes }` on both backends (db-adapter.mjs:370-374) — keep this shape for the upsert/delete helpers.

---

### `server.js` — funnel tx diff site (controller, request-response)

**Analog:** the existing doc-PUT funnel. `syncTaskFts` joins the same `db.tx()` body, computed from `storedDoc` vs `next`, exactly like `storedFileIds`/`newNotifs`.

**Diff-at-the-funnel pattern** (server.js:5384-5395) — copy this shape for the task diff:
```js
const storedFileIds = new Set((Array.isArray(storedDoc?.data?.files) ? storedDoc.data.files : []).map(f => f?.id).filter(Boolean));
const keptFileIds = new Set((Array.isArray(next?.data?.files) ? next.data.files : []).map(f => f?.id).filter(Boolean));
/* P4-f: ... Diffed against the stored doc so each row emails exactly once. */
const storedNotifIds = new Set((Array.isArray(storedDoc?.data?.notifs) ? storedDoc.data.notifs : []).map(n => n?.id).filter(Boolean));
const newNotifs = (Array.isArray(next?.data?.notifs) ? next.data.notifs : []).filter(n => n?.id && !storedNotifIds.has(n.id));
```
The task version: same Set/Map diff over `storedDoc?.data?.tasks` vs `next?.data?.tasks` keyed by `t.id`, calling `await syncTaskFts(scope, row.id, storedDoc, next)` **inside** the tx body (unlike the email fan-out, which is post-commit at 5418 — do NOT imitate that placement).

**Tx skeleton** (server.js:5373-5403): `outcome = await db.tx(async () => { ... return { row, storedDoc, next, ... }; })` — extend the returned outcome object only if post-commit values are needed.

**Permission filter — SEARCH-02 (server.js:928-933):** every route result must pass through this before serialization:
```js
async function memberCanReadProject(p, wsId, memberId) {
  if (canSeeProject(p, memberId)) return true;
  if (!Array.isArray(p?.teams) || !p.teams.length || !wsId || !memberId) return false;
  const memberTeams = await teamsOfMember(wsId, memberId, null);
  return canSeeProject(p, memberId, memberTeams);
}
```

**Route gating pattern** (server.js:5340-5342 + 5351-5354) — the new `GET /api/workspaces/:slug/search` route copies the GET workspace route's gate + the PUT route's `sameOrigin`:
```js
if (wsMatch && method === 'GET') {
  const ctx = await requireWorkspace(req, res, wsMatch[1]);
  if (!ctx) return;
  return json(res, 200, { ... });
}
```
Route handler order: `requireWorkspace(req, res, slug, 'member')` → sanitize query (`searchTerms`) → `db.searchTasks` → per-hit resolve project + `await memberCanReadProject(p, ws.id, ctx.membership.member_id)` → drop failures → build `{ tasks: [{ id, key, title, projectId, snippet }] }` (plain strings only) → return top-30 **after** filtering.

---

### `server.js` — boot sweep (migration, batch)

**Analog:** the boot migration sequence, `migrateTotpReWrap` placement (server.js:2492-2498):
```js
await migrateTotpReWrap();
/* VIEWS (Phase 57, D-06): one-time doc.views → saved_views rows sweep.
   AFTER migrateTotpReWrap — the same load-bearing-order discipline: ... */
await migrateUserViews();
```
New `ensureSearchIndex()` + `ftsSweep` call goes after `migrateUserViews()` with the same style of order-comment. Sweep shape copies `stampInstanceAdmin`'s cheap-guard idiom (server.js:2461-2462):
```js
async function stampInstanceAdmin() {
  if ((await db.get('select count(*) as n from users where is_instance_admin = 1')).n > 0) return;
  ...
}
```
i.e. count-compare staleness check first, rebuild only when stale/missing/empty.

---

### `mcp.js` — second write site (service, event-driven)

**Analog:** its own `writeDoc` (mcp.js:174-186). The FTS sync call is added inside this same `db.tx` body:
```js
async function writeDoc(ws, edit) {
  return await db.tx(async () => {
    const row = await db.get('select doc from workspaces where id = ?', [ws.id]);
    if (!row) throw new Error('Workspace not found');
    const doc = JSON.parse(row.doc);
    await edit(doc);
    await db.run('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?', [JSON.stringify(doc), now(), ws.id]);
    return doc;
  });
}
```
Add `await syncTaskFts(scope, ws.id, storedDoc, doc)` after the `update workspaces` line — same helper the funnel uses (Pitfall 1 fix; best shape is a shared import, e.g. exported from db-adapter.mjs or a server helper module mcp.js already imports from).

---

### `src/core/search-server.js` (new) — client fetch helper (service, request-response)

**Analog:** `src/core/searchall.js` — the pure-search-core convention (no page imports, entry-chunk safe, DELIV-02):
```js
// src/core/searchall.js:1-13 — the file-header + guard conventions to copy
/* ---------- GLOBAL SEARCH CORE (DELIV-02) ----------
   searchAll moved verbatim out of src/pages/search.js so the command
   palette (a first-paint surface) can keep it in the entry chunk ... */
export function searchAll(q) {
  const needle = foldForSearch((q || '').trim()).text;
  if (!needle) return { tasks: [], projects: [], people: [], files: [], comments: [] };
```
**Demo-mode gate** — verbatim from palette (src/overlays/palette.js:59, 71):
```js
].filter(c => api.enabled || c.id !== 'c-ws');
// ...
if (!api.enabled) return [];
```
The new helper: `searchTasksServer(q, signal)` — no-op/empty when `!api.enabled`; caller owns the 250 ms `setTimeout` debounce + `AbortController` (browser built-ins; no new imports, no new chunk). HTML-strip/snippet idiom comes from searchall.js:17: `t.desc.replace(/<[^>]+>/g, '')`.

---

### `src/overlays/palette.js` — server-result merge (component, event-driven render)

**Analog:** its own `paletteItems()` tasks group (palette.js:118, 153-159):
```js
const r = searchAll(q);
// ...
if (sc === 'all' || sc === 'tasks')
  groups.push({
    name: t('nav.route.tasks'),
    items: r.tasks
      .slice(0, lim)
      .map(t => ({ html: stIcon(t.status), name: t.title, sub: proj(t.project).name, r: t.key, run: () => A.openTask({ dataset: { id: t.id } }) })),
  });
```
Merge point: the server results (arriving async via the debounced fetch, stored e.g. on `S.ui.palette`) are merged/deduped by task id into this same `r.tasks` list — local results stay authoritative for ordering start, server-only tasks (invisible to the redacted doc) appended. Items keep the same `{ html, name, sub, r, run }` item shape so `paletteHtml()` (214-262) renders them unchanged with `hl(it.name, pl.q.trim())` (line 246).

---

### `src/pages/search.js` — full-results merge (page component, request-response)

**Analog:** its own task-row markup (search.js:36-44) — D-06 says reuse this exact row, no new view:
```js
r.tasks
  .map(
    t =>
      `<div class="mini" data-a="openTask" data-id="${t.id}">${stIcon(t.status)}<span class="mono faint" style="font-size:11px">${t.key}</span><span class="tt">${hl(t.title, q)}</span><span class="pj"><span class="pdot" style="--c:${pColor(proj(t.project))}"></span>${esc(proj(t.project).name)}</span>${avStack(t.assignees || [], 3, 'sm')}</div>`,
  )
  .join(''),
```
Server task results map onto this same row shape (`stIcon(t.status)` needs status — either the route returns it or the row degrades gracefully for server-only hits; planner's call). Snippet: plain-text, appended as a faint span, HTML stripped with the searchall idiom.

**Highlight helper** — `hl()` (src/ui/helpers.js:74-88), already handles accents via fold-index map; reuse as-is:
```js
export function hl(text, q) {
  const raw = String(text ?? '');
  const needle = foldForSearch(q).text;
  if (!needle) return esc(raw);
  const { text: folded, map } = foldForSearch(raw);
  const i = folded.indexOf(needle);
  ...
  return esc(raw.slice(0, start)) + '<mark>' + esc(raw.slice(start, end)) + '</mark>' + esc(raw.slice(end));
}
```

---

### `test/search-fts.test.mjs` (new) + `test/db-adapter.test.mjs` (extended) — tests

**Analog:** `test/db-adapter.test.mjs` (existing DBA parity suite — extend with `searchTasks`/`syncTaskFts` rows for both backends). New file follows the `node --test` convention (`test/*.test.mjs`, run via `npm test`).

**Required coverage per RESEARCH.md Wave 0:**
- Sanitization unit tests: fold → tokenize → `[a-z0-9]` whitelist; `'"quo*te'`-style inputs return sane results (Pitfall 3); D-15 min-length 2
- Byte-level leak tests (SEARCH-02, non-negotiable): member session querying a known private task title yields **zero occurrences of the title substring in the response body** — assert on body bytes, never status codes
- Both-tx-site tests (SEARCH-03): funnel write findable in-tx; **MCP `writeDoc` write findable** via `searchTasks` immediately
- Sweep test: deleted row healed by `ftsSweep`
- DBA parity rows (SEARCH-04): "elodie" → "Élodie" on both backends
- Drift-pin test if `foldForSearch` is duplicated server-side (server.js cannot import `src/core/utils.js` — browser module; the established duplicate-with-drift-pin pattern is `test/perm-drift.test.mjs` per server.js:976-978)

## Shared Patterns

### Server-side query sanitization (D-13/D-15) — applies to route + adapter
**Source:** `foldForSearch` (src/core/utils.js:22-34) + RESEARCH.md sanitization example. Fold ONCE, split on non-alphanumeric, drop terms < 2 chars, whitelist `[a-z0-9]`, adapter builds `tok*` expressions:
```js
export function foldForSearch(s) {
  const src = String(s ?? '').toLowerCase();
  let text = '';
  const map = [];
  for (let i = 0; i < src.length; i++) {
    const folded = src[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const c of folded) { text += c; map.push(i); }
  }
  return { text, map };
}
```

### In-tx writes use the tx scope — applies to both write sites (server.js funnel, mcp.js writeDoc)
**Source:** db-adapter.mjs:405-409 (pg scope), 422-429 (sqliteTxScope). Pass `scope` into `syncTaskFts(scope, ...)` — never module-level `db.run` inside a tx body for the new code.

### `api.enabled` gating — applies to all client additions
**Source:** src/overlays/palette.js:59, 71. Demo mode stays local-only; no fetch, no FTS.

### HTML-strip idiom — applies to snippets
**Source:** src/core/searchall.js:17 — `s.replace(/<[^>]+>/g, '')`. One idiom, no new regex sites.

### Route gate + sameOrigin — applies to the new search route
**Source:** server.js:5340-5342 (`requireWorkspace` GET), 5352-5354 (`sameOrigin`). Server-side filter only; never trust the client's redacted doc (SEARCH-02).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `task_fts` FTS5 DDL / pg `task_search_projection` | storage | transform | First FTS structures in the codebase — use RESEARCH.md Code Examples (live-probed) for DDL; DDL placement follows `runSchema` (db-adapter.mjs:347-350) |

## Metadata

**Analog search scope:** `src/core/`, `src/overlays/`, `src/pages/`, `src/ui/`, root (`db-adapter.mjs`, `server.js`, `mcp.js`), `test/`
**Files read directly:** searchall.js, utils.js (1-50), search.js, palette.js, helpers.js (65-94), db-adapter.mjs (340-499), server.js (900-969, 2460-2499, 5340-5439), mcp.js (160-189)
**Tracked-source gate:** all named analogs verified via `git ls-files` — no mirrors.
**Pattern extraction date:** 2026-11-12
