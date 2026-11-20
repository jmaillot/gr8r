# Phase 83: Governance — Workspace Rename & Slug Edit - Pattern Map

**Mapped:** 2026-11-20
**Files analyzed:** 9 (2 routes in server.js, 3 client files, 5 locale files, 3 test files)
**Analogs found:** 9 / 9 (all reuse in-place; only 1 truly new file — the server test suite)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `POST /api/auth/operator/workspaces/:id/rename` | route (operator mutation) | request-response | `server.js:7125–7151` archive/unarchive route + `server.js:7449–7474` creation route | exact |
| `server.js` — `GET /api/auth/operator/dead-mappings` | route (operator read) | request-response | boot dead-mapping loop `server.js:9616–9627` + read-route shape `server.js:7125` (guard prefix) | role-match |
| `src/core/api.js` — `operatorWsRename` / `operatorDeadMappings` | api-client | request-response | `src/core/api.js:363–380` operatorWsArchive/Delete/Members | exact |
| `src/actions/actions.js` — `A.govEditAsk` / `A.govEditSave` + confirm fork | action handlers | event-driven | `src/actions/actions.js:4655–4742` govArchiveAsk/govDeleteAsk/govDelete | exact |
| `src/pages/governance.js` — Edit row button + edit modal body + warning card | page component | transform (payload→markup) | `src/pages/governance.js:51–112` wsRow + pageGovernance; modal: `govOrphanBody` | exact |
| `src/locales/{en,fr,nl,de,es}.json` — new `page.governance.*` + `toast.*` keys | config (i18n) | n/a | existing `page.governance.*` block + `err.invalidSlug/slugTaken/workspaceNameRequired` at lines 1793–1795 of all 5 files | exact |
| `test/governance-rename.test.mjs` — NEW | test (server, node:test) | batch | `test/governance.test.mjs` | exact |
| `test/governance-client.test.mjs` — extend | test (client-source assertions) | batch | itself (source-grep assertion style) | exact |
| `test/i18n-toast.test.mjs` — pin updates | test (suite pins) | batch | itself, lines 301–303 | exact |

## Pattern Assignments

### `server.js` rename route (route, request-response)

**Analog:** `server.js:7125–7151` (archive route — guard order, verbatim) + `server.js:7449–7474` (creation route — slug rules, verbatim)

**Guard order pattern** (lines 7125–7137 — copy the sequence exactly, Pitfall 22):
```js
const operatorWsFlagMatch = pathname.match(/^\/api\/auth\/operator\/workspaces\/([A-Za-z0-9_-]{1,64})\/(archive|unarchive)$/);
if (operatorWsFlagMatch && method === 'POST') {
  // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const operator = await requireUser(req, res);
  if (!operator) return;
  // Pitfall 10: throttle keyed on the operator (never per-IP) — the single
  // legitimate operator is never locked out; every attempt consumes a try.
  if (tooMany(`op-ws-archive|${operator.id}`, 5, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  // T-79-07/D-09: the gate runs BEFORE any target lookup (no existence oracle).
  if (!isInstanceAdmin(operator)) return fail(res, 403, 'operatorOnly', 'Only the instance operator can do that');
  const ws = await db.get('select id, slug, name, archived from workspaces where id = ?', [operatorWsFlagMatch[1]]);
  if (!ws) return fail(res, 404, 'notFound', 'Not found');
```
Key invariants: gate BEFORE target lookup (no existence oracle — SC4); fetch by id, NEVER `requireWorkspace` (archived rows stay actionable); the new route sits inside this same operator-family block and must match its `pathname.match(/^...$/)` regex style with key `op-ws-rename|${operator.id}`.

**Slug validation + keyed refusal pattern** (lines 7460–7470 — D-04 mandates reuse verbatim):
```js
const body = await readJson(req);
const name = String(body?.name || '').trim().slice(0, 60);
if (!name) return fail(res, 400, 'workspaceNameRequired', 'Enter a workspace name');
let slug = null;
if (body?.slug) {
  slug = sanitizeSlug(body.slug);
  if (!slug) return fail(res, 400, 'invalidSlug', 'Use 2–40 lowercase letters, numbers, or hyphens');
  if (await wsBySlug(slug)) return fail(res, 409, 'slugTaken', 'That URL is already taken', { suggestion: await uniqueSlug(slug) });
}
```
**Rename variant:** pass the renamed row's id to `uniqueSlug(next, ws.id)` for the suggestion, and only run the collision check when `next !== ws.slug` (self-collision Pitfall 1). Refusal literals must stay EXPLICIT at this call site (error-codes reverse-parity test greps server.js source — Phase 80-02 lesson).

**Slug helper signatures** (lines 941–960):
```js
function sanitizeSlug(value) {
  const slug = slugify(value);
  return SLUG_RE.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null;
}
async function uniqueSlug(base, excludeId = null) {
  let root = sanitizeSlug(base) || 'workspace';
  root = root.slice(0, 32).replace(/-+$/g, '');
  let slug = root;
  let n = 2;
  while (await db.get('select 1 from workspaces where slug = ? collate nocase and id is not ?', [slug, excludeId])) {
    slug = `${root}-${n++}`;
  }
  return slug;
}
async function wsBySlug(slug) {
  return (await db.get('select * from workspaces where slug = ? collate nocase', [String(slug || '')])) || null;
}
```
`uniqueSlug`'s `excludeId` already implements self-exclusion — do not write a new query. All slug lookups are `collate nocase` — never `=`.

**Log line pattern** (lines 7148–7150):
```js
logInfo(`workspace ${archiving ? 'archived' : 'unarchived'} "${ws.name}" (slug: ${ws.slug}) by ${operator.email}`);
return json(res, 200, { workspace: { id: ws.id, slug: ws.slug, name: ws.name, archived: archiving } });
```
Rename follows with `(governance)` suffix + old→new slug visible (D-06): `logInfo(\`workspace renamed "..." (old-slug) → "..." (new-slug) (governance) by ${operator.email}\`)`. NOTE: archive writes an audit_log row + logSecurity; rename does NOT (D-06 — logInfo only, matching the `workspace deleted (governance)` precedent in the delete route).

---

### `server.js` dead-mappings route (route, request-response read)

**Analog:** `server.js:9616–9627` (boot orphan loop — the source-of-truth predicate)

```js
const groupMappings = await db.all('select group_guid, workspace_id from group_mappings');
if (groupMappings.length === 0) {
  logInfo('group mappings: off');
} else {
  logInfo(`group mappings: ${groupMappings.length}`);
  const wsIds = new Set((await db.all('select id from workspaces')).map(r => r.id));
  for (const m of groupMappings) {
    if (!wsIds.has(m.workspace_id)) {
      logWarn(`group mapping dead: group ${m.group_guid} → missing workspace ${m.workspace_id}`);
    }
  }
}
```
On-read route: same predicate (`!wsIds.has(m.workspace_id)`), but `select group_guid, workspace_id, kind, label from group_mappings` — include `kind` and `label` (schema at server.js:618–630; `label` is opaque and MUST be escaped client-side). Guard prefix: sameOrigin → requireUser → `isInstanceAdmin` gate; NO throttle (Phase 78/79 GET read precedent, commented at server.js:7125 area — read routes carry no throttle). Trail source (query B): `select action, workspace_id, created_at from audit_log where action like 'group_%:group:%' order by created_at desc limit <50–100>` — the encoded format is written at server.js:5310 as `group_${delta}:group:${guid}:guard-refused`. Render split: FIRST colon only (`action.split(/:(.*)/s)`).

---

### `src/core/api.js` additions (api-client, request-response)

**Analog:** `src/core/api.js:363–380`

```js
async operatorWsArchive(id) {
  return call('POST', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/archive`);
},
async operatorWsDelete(id, dispositions) {
  return call('POST', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/delete`, { dispositions });
},
```
Copy the shape: `call('POST', ...)` with `encodeURIComponent(id)` and a body object; dead-mappings is `call('GET', '/api/auth/operator/dead-mappings')`. Place the new methods in this same operator block; keep the `/* phase refs */` comment convention above each method.

---

### `src/actions/actions.js` — govEditAsk / govEditSave (action handlers, event-driven)

**Analog:** `src/actions/actions.js:4649–4726` (govRefusalToast + govArchiveAsk + govDeleteAsk)

**Keyed refusal toast** (lines 4649–4654 — extend `keyed` list only if genuinely new codes appear; rename reuses existing ones):
```js
const govRefusalToast = res => {
  if (res.status === 401) return; // D-28: the central intercept owns the teardown
  const code = res.data?.code;
  const keyed = ['workspaceNotEmpty', 'dispositionRequired', 'memberAlreadyMember', 'targetArchived'].includes(code);
  return toast(keyed ? t('err.' + code) : tErr(code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
};
```

**Confirm dialog + run pattern** (lines 4655–4672):
```js
A.govArchiveAsk = el => {
  const ws = govWsById(el.dataset.id);
  if (!ws) return;
  confirmDlg({
    title: t('page.governance.confirmArchiveTitle', { name: ws.name }),
    body: t('page.governance.confirmArchiveBody', { slug: `<b>${esc(ws.slug)}</b>` }),
    ok: t('page.governance.okArchive'),
    icon: 'archive',
    danger: false, // amber tile — archive is reversible (D-02)
    typeName: ws.slug, // D-04: type-to-confirm, exact match gates the OK
    run: async () => {
      const res = await api.operatorWsArchive(ws.id);
      if (!res.ok) return govRefusalToast(res);
      await refreshGovernanceWorkspaces();
      toast(t('toast.governanceArchived'));
    },
  });
};
```
For D-03's confirm fork: `govEditSave` reads the modal fields, compares slug to the staged row (`S.ui.govEditWs.slug`), runs directly on name-only edit, else wraps the same run in `confirmDlg` with `danger: true`, `typeName: oldSlug`, and body interpolating `<b>${esc(oldSlug)}</b>` (D-82-5 warning, old slug bold — same `esc()`-wrapped interpolation as line 4660/4719). `S.ui.govEditWs` staging + modal open mirrors the `S.ui.govOrphan` staging + lazy `openModal({ type: 'custom', ... })` pattern at lines 4699–4714.

---

### `src/pages/governance.js` — Edit button + modal body + warning card (page component)

**Analog:** `src/pages/governance.js:51–112` (wsRow + pageGovernance structure)

**Row action pattern** (lines 57–65 — add Edit beside the existing actions):
```js
<td><span class="row" style="gap:8px;justify-content:flex-end">${w.archived ? `<button class="btn btn-secondary btn-sm" data-a="govUnarchive" data-id="${esc(w.id)}">...` : `<button class="btn btn-secondary btn-sm" data-a="govArchiveAsk" data-id="${esc(w.id)}">...`}<button class="btn btn-danger btn-sm" data-a="govDeleteAsk" data-id="${esc(w.id)}">${t('page.governance.delete')}</button></span></td>
```
Copy the button conventions exactly: `data-a` + `data-id="${esc(w.id)}"`, `btn btn-secondary btn-sm` for non-destructive actions (Edit is secondary), `t('page.governance.*')` labels. WARNING: every new `data-a` occurrence bumps the pinned counts in test/i18n-toast.test.mjs (see pin pattern below) — D-12 same-commit rule.

**Page structure** (lines 103–112): the warning card (D-10) slots between the `<div class="ph">` header and the workspaces `.sblock`, operator-gated (`api.user?.isInstanceAdmin`), rendered only when the dead-mappings payload is non-empty. Card markup copies the fullstate/panel idioms already in the file (`panel`, `hint`, `esc()` everywhere — text nodes only, T-79-10; `esc(label)` at first render is the carried Phase 80 XSS watch-item).

**Modal body:** mirror the existing `govOrphanBody` export in this file (lazy-loaded via `openModal({ type: 'custom', cls: 'sm', render: () => ... })` — actions.js:4705–4707). Name field uses the existing `input`/`inwrap` markup idiom (see the govQ search input at line 108).

---

### `src/locales/{en,fr,nl,de,es}.json` — i18n keys (config)

**Analog:** the `err.*` block at lines 1793–1795 of ALL FIVE files (verified present in every locale this session — research assumption A4 RESOLVED):
```json
"err.workspaceNameRequired": "Enter a workspace name",
"err.invalidSlug": "Use 2–40 lowercase letters, numbers, or hyphens",
"err.slugTaken": "That URL is already taken",
```
**No new `err.*` refusal codes are needed** (D-04 reuse). New keys are `page.governance.edit` / modal title+labels / `confirmRenameTitle` / `confirmRenameBody` / `okRename` / `toast.governanceRenamed` / warning-card strings — copy the adjacent `page.governance.confirmArchive*`/`toast.governanceArchived` entries as shape templates, add to all 5 files in the SAME commit as the emitting code (D-12).

---

### `test/governance-rename.test.mjs` — NEW (test, node:test)

**Analog:** `test/governance.test.mjs:1–40`

```js
/* Governance suite (Phase 79, WSG-07/WSG-08). Proves the operator-gated ... */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const userRow = (srv, email) => withDb(srv.dbPath, db => db.prepare('select * from users where email = ?').get(email));
const wsRow = (srv, slug) => withDb(srv.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(slug));

async function plainWorkspace(base, name, slug) {
  const joined = await signup(base, { name: `${name} Owner`, email: `${slug}-owner@test.local` });
  const created = await joined.client.post('/api/workspaces', { name });
  return { owner: joined.client, ws: created.data.workspace };
}

test('operator GET /api/auth/operator/workspaces lists ALL workspaces incl. one the operator holds no membership in', async () => {
  const server = await startServer({});
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    ...
```
Copy per-case: `startServer({})` + try/finally teardown, `ADMIN` login for the operator client, `signup`-based plain users for non-operator refusal cases, `withDb(srv.dbPath, ...)` for direct row inspection, `assert.equal(status, ...)` on `client.post(...)` results. The D-15 pin fetches the old slug URL and asserts exact 404 + `assert.ok(!('location' in headers))`-style absence of Location.

---

### `test/governance-client.test.mjs` — extend (test, source assertions)

**Analog:** itself, lines 27–38:
```js
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = rel => readFileSync(`${ROOT}/${rel}`, 'utf8');
const actions = () => src('src/actions/actions.js');
const page = () => src('src/pages/governance.js');

test('govDeleteAsk forks on memberCount: >0 opens the orphan modal, 0 goes to the slug type-to-confirm', () => {
  const a = actions();
  assert.match(a, /if \(ws\.memberCount > 0\) \{[\s\S]{0,400}?S\.ui\.govOrphan = \{ ws, members: null, targets: null \}/, 'the >0 fork does not stage the orphan modal');
  assert.match(a, /memberCount > 0[\s\S]{0,1400}?typeName: ws\.slug/, 'the 0-member path misses the slug type-to-confirm');
});
```
New assertions follow this regex-source-grep style: slug-changed-only confirm fork, `esc(label)` on the warning card, Edit button `data-a="govEditAsk"`. The file also imports all 5 locale JSONs directly (lines 21–25) — reuse for any locale-parity assertion of the new keys.

---

### `test/i18n-toast.test.mjs` — pin updates (test, suite pins)

**Analog:** itself, lines 301–303:
```js
assert.equal(a, 572, 'data-a sites'); // +N (83-xx): the governance Edit button per row + ... — one data-a per markup occurrence
assert.equal(v, 91, 'data-v sites');
assert.equal(r, 62, 'data-r sites'); // ...same annotated-changelog convention
```
Convention: bump the literal and PREPEND the delta + phase tag to the existing inline comment chain (never rewrite the history). Count every markup occurrence of new `data-a` (Edit button per row, modal Save/Cancel, warning-card buttons if any) and `data-r`.

## Shared Patterns

### Operator guard order (Pitfall 22)
**Source:** `server.js:7125–7137`
**Apply to:** both new routes (rename: full sequence incl. throttle; dead-mappings: sameOrigin → requireUser → gate, no throttle).
sameOrigin FIRST → requireUser → operator-keyed tooMany → isInstanceAdmin → target fetch. Gate before lookup = no existence oracle (exact `403 operatorOnly` for every non-operator, real id or fake).

### Keyed refusals with explicit literals
**Source:** `server.js:7464–7469`, surfaced client-side via `govRefusalToast` (`src/actions/actions.js:4649–4654`)
**Apply to:** rename route + modal error handling. Codes reused verbatim: `workspaceNameRequired`, `invalidSlug`, `slugTaken` (+ `suggestion` payload), `notFound`, `operatorOnly`, `tooManyAttempts`, `crossOriginRejected`. Zero new vocabulary (D-04); literals explicit at the server.js call site (reverse-parity test greps source).

### `esc()` at first render
**Source:** `src/pages/governance.js:58–64` (all payload values), `src/actions/actions.js:4660` (bold slug in confirm body)
**Apply to:** modal fields, warning-card rows — CRITICAL for `group_mappings.label` (opaque carried value, Phase 80 XSS watch-item).

### data-a / data-r / data-v pin discipline
**Source:** `test/i18n-toast.test.mjs:301–303`
**Apply to:** any markup added to governance.js / actions.js. Same-commit count bump with annotated comment (D-12).

### Zero-rows honesty (D-11 vocabulary)
**Source:** `server.js:9617–9618` (`logInfo('group mappings: off')`) — at the UI level, D-10 mandates full hiding: zero dead items → card markup absent entirely, no off-line.
**Apply to:** dead-mappings route payload + card render condition.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | | | Every touch point has a verified in-repo analog; Phase 83 is composition of Phase 78–82 primitives |

## Metadata

**Analog search scope:** server.js (operator family 7100–7500, slug helpers 938–960, trail writer 5301–5310, boot loop 9605–9630), src/actions/actions.js 4640–4749, src/pages/governance.js 1–120, src/core/api.js 360–384, test/ (governance, governance-client, i18n-toast), src/locales/*.json
**Files scanned:** 11
**Pattern extraction date:** 2026-11-20

**Verification notes:**
- All analog paths confirmed git-tracked (`git ls-files` non-empty).
- Research assumption A4 RESOLVED: `err.invalidSlug` / `err.slugTaken` / `err.workspaceNameRequired` present in all 5 locales at identical line positions (1793–1795).
- Line anchors re-verified against source this session (archive route at 7125–7151, not 7111 as CONTEXT estimated — grep by content, not line, at execution time).
