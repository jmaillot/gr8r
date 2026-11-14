# Phase 57: Views, Columns & General Access - Pattern Map

**Mapped:** 2026-11-12
**Files analyzed:** 11 (4 new, 7 modified)
**Analogs found:** 11 / 11 — every new file has a verified, git-tracked analog
**Verification note:** all analog paths confirmed via `git ls-files` (no mirror paths). All excerpts read from live source this session.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/core/savedViews.js` (new) | utility (pure leaf module) | CRUD / localStorage | `src/core/notifPrefs.js` | exact |
| `server.js` — `saved_views` DDL | model (schema) | CRUD | `server.js:384-389` (`user_notif_prefs`) | exact |
| `server.js` — views GET/PUT/DELETE routes | controller (REST) | request-response | `server.js:4072-4108` (notif-prefs PUT) | exact |
| `server.js` — `migrateUserViews()` boot sweep | migration | batch | `server.js:2522-2572` (`migrateUserNotifPrefs`) | exact |
| `server.js` — `mergeClientDoc` strips + `defaultPrivate` normalization | service (merge/normalize) | transform | `server.js:1193-1237` | exact |
| `db-adapter.mjs` — PG schema variant entry | config (schema variant) | batch | existing `user_notif_prefs` PG entry (~line 267 region) | exact |
| `src/core/api.js` — `getViews`/`putViews`/`deleteView` | service (API client) | request-response | `src/core/api.js:291-299` (`getNotifPrefs`/`putNotifPrefs`) | exact |
| `src/core/store.js` — docSnapshot strip + row hydration | store | event-driven (doc apply) | `src/core/store.js:100-104, 160-167, 307-308` | exact |
| `src/actions/actions.js` — write-through + save/apply/delete view actions | controller (client actions) | event-driven | `toggleCol2` site + legacy `saveViewSubmit` (`actions.js:1448-1457`) | role-match |
| `src/overlays/popovers.js` — saved-views popover | component (popover UI) | request-response | `cols` popover (`popovers.js:307-319`) | exact |
| `src/overlays/modals.js` — Access-tab hint line | component (modal UI) | request-response | General Access row (`modals.js:317-318`) | exact |
| `src/pages/settings.js` — owner default-visibility toggle | component (settings page) | CRUD | `permCreate` row (`settings.js:319`) | exact |
| `src/actions/actions.js` — `createProject` private seed | controller | transform | `createProject` itself (`actions.js:1618-1652`) | self (modify in place) |
| `test/saved-views.test.mjs`, `test/views-migration.test.mjs`, `test/default-private.test.mjs` (new) | test | batch | existing `test/*.test.mjs` node --test files; pure-module contract per `src/core/prefs.js` header | role-match |

**Naming hazard (verified):** legacy project-page named views already occupy `saveView`/`sv:` tab routing (`actions.js:1448-1457`, merged/redacted server-side, seeded in `seed.js:512`). New action names MUST NOT collide — use e.g. `saveTableView`/`applyTableView`/`deleteTableView`. Per research Open Question 1 (recommended): leave `doc.savedViews` untouched this phase; the planner must state this explicitly.

## Pattern Assignments

### `src/core/savedViews.js` (utility, localStorage CRUD)

**Analog:** `src/core/notifPrefs.js` (whole file, 87 lines — clone the shape)

**Leaf-module contract** (prefs.js header, lines 10-13 states it; notifPrefs.js obeys it): pure, no store/DOM/api imports — this is what lets bare-Node tests import it.

**Key prefix pattern** (notifPrefs.js:7,45):
```js
export const NOTIF_PREFS_KEY_PREFIX = 'projects.notifPrefs.';
export const notifPrefsKey = workspaceId => NOTIF_PREFS_KEY_PREFIX + (workspaceId || 'local');
```
Saved-views equivalent: `projects.savedViews.<wsId>` — deliberately outside the `projects.v2` doc blob (D-08).

**Whitelist sanitize / lenient intersection** (notifPrefs.js:50-58) — the D-12 `schema_version` loader template; extend to drop `q` and `_`-prefixed keys:
```js
function sanitize(stored) {
  const out = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const k of NOTIF_PREF_KEYS) {
      if (typeof stored[k] === 'boolean') out[k] = stored[k];
    }
  }
  return out;
}
```

**Server-canonical merge** (notifPrefs.js:68-70):
```js
export function mergeNotifPrefs(clientPrefs, serverPrefs) {
  return { ...NOTIF_PREF_DEFAULTS, ...sanitize(clientPrefs), ...sanitize(serverPrefs) };
}
```

**Try/catch localStorage accessors** (notifPrefs.js:72-87):
```js
export function getLocalNotifPrefs(workspaceId) {
  try {
    return { ...NOTIF_PREF_DEFAULTS, ...sanitize(JSON.parse(localStorage.getItem(notifPrefsKey(workspaceId)))) };
  } catch {
    return { ...NOTIF_PREF_DEFAULTS };
  }
}
export function setLocalNotifPrefs(workspaceId, prefs) {
  try {
    localStorage.setItem(notifPrefsKey(workspaceId), JSON.stringify(sanitize(prefs)));
  } catch { /* storage blocked or full: stay for the session only */ }
}
```

**Snapshot shape to whitelist** — `viewOf()` (view-engine.js:91-103), everything EXCEPT `q` and `_`-prefixed transients (D-11; `_projHidden` is render-mutated, table.js:67-71):
```js
export function viewOf(key) {
  if (!S.views[key])
    S.views[key] = {
      filters: [],
      sort: { f: 'manual', dir: 1 },
      group: key === 'tasks' || key === 'mytasks' ? 'status' : 'status',
      q: '',
      hidden: ['start', 'created', 'deps'],
      colW: {},
      showDone: true,
    };
  return S.views[key];
}
```
First-run defaults (D-13) are exactly this object — no new defaults table.

---

### `server.js` — `saved_views` DDL (model, CRUD)

**Analog:** `server.js:384-389`
```sql
create table if not exists user_notif_prefs (
  workspace_id text not null,
  user_id      text not null,
  prefs        text not null,
  primary key (workspace_id, user_id)
);
```
`saved_views` follows with PK `(workspace_id, user_id, key, name)` + `blob` + `schema_version` integer columns (D-05/D-12). The comment block above it (lines 380-383) is the house documentation style — copy it. One table for live + named rows (sentinel name or `is_current` flag — planner's call, research Open Question 2). **Case-insensitive unique names** must be JS-enforced in the PUT (SQLite `collate nocase` is stripped in the pg variant — Pitfall 4).

**PG parity:** `db-adapter.mjs` schema variant (~line 267 region) must gain the same table; `insert or replace` is auto-translated to `on conflict do update` (db-adapter.mjs:40-44). `schema_version` integer is within the adapter's safe range.

---

### `server.js` — views routes (controller, request-response)

**Analog:** `server.js:4072-4108` (notif-prefs PUT). Route shape to clone per D-07 (revision-free, so no 409 coupling):

**Gate + validation pattern** (4073-4087):
```js
const user = await requireUser(req, res);
if (!user) return;
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
const body = await readJson(req);
// Only body.workspace and body.prefs.prefs-keys are read; user_id always
// comes from the session — never the body (mass-assignment discipline).
```
**Workspace + membership resolution** (4088-4091):
```js
const wsId = String(body?.workspace || '');
const ws = wsId ? await db.get('select id from workspaces where id = ?', [wsId]) : null;
const member = ws ? await db.get('select 1 from memberships where workspace_id = ? and user_id = ?', [ws.id, user.id]) : null;
if (!ws || !member) return fail(res, 404, 'workspaceNotFound', 'Workspace not found');
```
**Merge-not-replace + corrupt-blob guard** (4092-4107) — load-bearing (research Anti-Pattern "Blind-replace PUT"):
```js
const existingRow = await db.get('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?', [ws.id, user.id]);
let existing = {};
try {
  const parsed = JSON.parse(existingRow?.prefs ?? '{}');
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed;
} catch { /* corrupt stored blob: start clean */ }
```
**Caps enforcement here (server-authoritative, D-12):** ≤20 rows/member/key, blob ≤2 kB (fail 400/413 with a keyed code), name uniqueness case-insensitive, whitelist intersect to the D-11 field set with `schema_version`. Return the canonical GET body (line 4108 pattern: `return json(res, 200, { prefs: await getUserNotifPrefs(...) })`).

---

### `server.js` — `migrateUserViews()` boot sweep (migration, batch)

**Analog:** `migrateUserNotifPrefs()` (server.js:2522-2572). Clone structurally:

1. **JS guard on the doc JSON** (2530-2543) — eligibility = stored doc carries `views` at TOP level (`views` sits next to `prefs`, NOT inside `data` — the strip must target the right level; research Critical fact 2):
```js
for (const row of await db.all('select id, doc from workspaces')) {
  let doc = {};
  try { doc = JSON.parse(row.doc); } catch { continue; }
  const prefs = doc?.data?.notifPrefs;
  if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) continue;
  eligible.push({ id: row.id, doc, prefs });
}
if (eligible.length === 0) return;
```
2. **Pre-migration backup** (2544-2556): `vacuum into` timestamped file, `sqliteOnly`, abort on failure (no backup = no mutation).
3. **One transaction** (2557-2571): copy rows (`insert or ignore` keeps any pre-existing per-user row — D-06 attribution: rows go to the workspace OWNER, unlike notifPrefs which copied to every member; owner id resolution is the planner's one new lookup) AND delete the field from the stored doc in the same tx:
```js
const stripped = { ...ws.doc, data: { ...ws.doc.data } };
delete stripped.data.notifPrefs;
await db.run('update workspaces set doc = ? where id = ?', [JSON.stringify(stripped), ws.id]);
```
For views: `const stripped = { ...ws.doc }; delete stripped.views;`
4. **Sequence position:** after `migrateUserNotifPrefs`/`migrateTotpReWrap`, before first read (Pitfall discipline). Second boot must be a byte-identical no-op (guard = field presence, never "table empty").

**Three-site strip** (research Critical fact 2 — ALL THREE required):
- Client save: `docSnapshot()` (store.js:164-167) drops `views` (belt-and-braces delete, notifPrefs precedent at line 165)
- Client hydration: `S.views = doc.views || {}` (store.js:308) replaced by row hydration, seeded like `notifPrefs: getLocalNotifPrefs(...)` (store.js:100-104)
- Server merge: `mergeClientDoc` strips an incoming `views` so a stale client never merges it back (notifPrefs server strips at server.js:803/2096-2098 are the precedent)

---

### `server.js` — `mergeClientDoc` normalization (service, transform)

**Analog:** `server.js:1193-1237`. The D-03 `prefs.defaultPrivate` rule copies the D-51-15/16 convention exactly (1210-1214):
```js
/* [2026-11-08 D-51-15/16, T-51-01] The project-creation restriction is read
   from the STORED document's prefs ONLY — the client ships its prefs copy on
   every save, so the incoming one is never trusted (Pitfall 3). Read fresh
   per request: a settings flip bites on the very next PUT. */
const createRestricted = stored?.prefs?.permCreate === true;
```
`defaultPrivate` joins this family: read `stored?.prefs?.defaultPrivate === true`, never from `incoming`. Normalization of the incoming prefs blob coerces the boolean in `mergeClientDoc` (fail-closed). **The visibility funnel is NOT touched** (D-01/D-02): `projectIsPrivate` (server.js:857-863) and `hiddenFor` stay byte-identical; leak tests unmodified.

---

### `src/core/api.js` — views client (service, request-response)

**Analog:** `src/core/api.js:291-299`:
```js
async getNotifPrefs(workspaceId) {
  return call('GET', `/api/me/notif-prefs?workspace=${encodeURIComponent(workspaceId || '')}`);
},
async putNotifPrefs(workspaceId, prefs) {
  return call('PUT', '/api/me/notif-prefs', { workspace: workspaceId, prefs });
},
```
Views equivalents: `getViews(workspaceId, key)` / `putViews(workspaceId, key, blob)` / `deleteView(workspaceId, key, name)` mirroring the `/api/me/…?workspace=` shape (recommended per research Open Question 3). Hydration call site: store.js:104 region (where notifPrefs hydrates).

---

### `src/actions/actions.js` — write-through + view actions (controller, event-driven)

**Write site:** `toggleCol2` (~line 1378) and the `sortBy`/filter mutators — after mutating `viewOf(key)`, trigger a debounced write-through: server mode → `api.putViews`, local mode → `setLocalSavedViews` (the flow in RESEARCH.md "Recommended flow"). Read `toggleCol2` before editing.

**Named-view actions:** the legacy `saveViewSubmit` (actions.js:1448-1457) shows the house push-to-doc style — do NOT copy its storage target (doc), only its action dispatch/modal-open shape; name the new actions `saveTableView`/`applyTableView`/`deleteTableView` (collision rule above).

**`createProject` seed** (actions.js:1618-1652, modify in place) — verified gap: the built object has NO `private` field today. Add per D-04:
```js
private: S.prefs.defaultPrivate === true || f.private === true ? true : undefined →  // set `private: true` only when the pref says so
```
(i.e. `if (D().prefs.defaultPrivate === true) p.private = true;` — absent stays non-private, matching `projectIsPrivate`'s `p.private === true` test.)

---

### `src/overlays/popovers.js` — saved-views popover (component)

**Analog:** `cols` popover (popovers.js:307-319) — checkbox list + reset row, the exact D-15 "beside the cols popover" placement:
```js
case 'cols': {
  const v = viewOf(p.key);
  inner =
    `<div class="mh">${tMsg('popover.visibleColumns')}</div>` +
    TCOLS.filter(c => c[0] !== 'title').map(...).join('') +
    `<div class="msep"></div><button class="mi" data-a="resetCols" data-key="${p.key}">${ic('rotate-ccw', 14)}${tMsg('popover.resetWidths')}</button>`;
  break;
}
```
Add a `views` case: list rows (apply + delete icon), `Save current…`, `Update`. Reuse `data-a`/`data-key` attributes, `ic()`, `tMsg()`, `.mi`/`.mh`/`.msep` classes. "Reset columns" (D-14) maps to deleting the member's live row then re-applying `viewOf()` defaults — extend the existing `resetCols` action's target.

---

### `src/overlays/modals.js` — Access-tab hint (component)

**Analog:** General Access row (modals.js:317-318) — add the default hint in the same `.faint` style:
```js
<div class="row" style="gap:10px"><span class="ftype" ...>${ic(p.private ? 'lock' : 'building-2', 14)}</span><div class="grow"><label class="row" ...><input type="checkbox" class="toggle" data-in="shareAccess" ...>${p.private ? t('modal.onlyInvited') : t('modal.everyoneAt', { name: esc(D().ws.name) })}</label><div class="faint" style="font-size:11.5px;padding-left:4px">${p.private ? t('modal.privateHint') : t('modal.workspaceHint')}</div></div></div>
```
Hint line shows the workspace default (`S.prefs.defaultPrivate`) — informational only, no action (D-04).

---

### `src/pages/settings.js` — owner toggle (component)

**Analog:** `permCreate` row (settings.js:319) — the exact owner-gated toggle idiom:
```js
<div class="sblock">${srow(t('settings.perms.create'), '', tog('permCreate', P.permCreate === true))}</div>
```
The `defaultPrivate` toggle joins the perms block: `${wsAdmin ? … : ''}` gating is already in this section; handler follows the `saveWorkspace`/toggle-action pattern, persisted via the doc PUT's `prefs` ride.

## Shared Patterns

### Per-user rows recipe (Phase 34) — apply to DDL, routes, migration, api client, local module
**Source:** `server.js:384-389, 4072-4108, 2522-2572` + `src/core/notifPrefs.js` + `src/core/api.js:291-299`
Session supplies user_id (never the body); whitelist-validate; merge-not-replace; JSON.parse in try/catch; corrupt blob → clean start; return canonical GET body; localStorage mirror keyed per-workspace for local mode only (D-08 — local mode never calls the routes).

### Three-site doc-field strip — apply wherever `views` is touched
**Source:** `src/core/store.js:160-167, 308` + `server.js:803, 2096-2098` (notifPrefs precedent)
`views` is doc TOP-level (next to `prefs`), not inside `data`. Strip at client snapshot, client hydration, and server merge — missing any one resurrects `doc.views` (Pitfall 1).

### Stored-doc-only prefs reads — apply to `defaultPrivate`
**Source:** `server.js:1209-1214` (D-51-15/16)
Never trust the incoming prefs blob server-side; read from `stored.prefs`. Client toggle rides the existing docSnapshot `prefs` field.

### i18n gate
**Source:** `scripts/i18n-scan.mjs` (prebuild hook, blocks on dead/stale)
Every new UI string and any server error-message keys go through `t()`/`fail(..., code, ...)` catalogues in BOTH `locales/` en+fr. Standing constraint: gate must stay green.

### Pure-leaf-module test contract
**Source:** `src/core/prefs.js:10-13`, `src/core/notifPrefs.js`
New client persistence helpers live in a leaf module with no store/DOM/api imports so bare-Node `node --test` files can exercise sanitize/merge/caps logic directly.

## No Analog Found

None — every file in scope has a verified analog. Nearest misses (role-match only):
- Named-view action functions (`saveTableView` etc.): the legacy `saveViewSubmit` analog matches dispatch shape but NOT storage target (doc vs rows) — copy dispatch, not persistence.
- Test files: follow existing `test/*.test.mjs` conventions; no dedicated read performed (Wave 0 gaps listed in RESEARCH.md §Validation).

## Metadata

**Analog search scope:** repo root (`server.js`, `db-adapter.mjs`), `src/core/`, `src/shell/`, `src/views/`, `src/overlays/`, `src/pages/`, `src/actions/`
**Files scanned:** 13 analogs read (targeted sections); research's verified line numbers re-confirmed on live source where read
**Pattern extraction date:** 2026-11-12
