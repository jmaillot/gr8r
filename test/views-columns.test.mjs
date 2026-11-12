/* Per-user saved views & live column state (Phase 57, VIEW-01, D-05/D-07/D-08).
   Real server, real SQLite. Live view state is the saved_views sentinel row
   (name = '') keyed (workspace_id, user_id, key); the workspace document is
   never a view-state carrier. Client-side: the pure leaf module sanitizes
   blobs (whitelist intersect, no `q`, no `_`-prefixed transients) and mirrors
   into the per-workspace localStorage key in local mode (D-08). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { signup, startServer, withDb } from './helpers/server.mjs';
import { getLocalSavedViews, removeLocalSavedView, sanitizeViewBlob, setLocalSavedViews, VIEW_BLOB_KEYS } from '../src/core/savedViews.js';

const PASSWORD = 'views-password-1';

let server;
let tempDir;
let owner;
let ws;
let stranger; // signed up, never a member

const viewRows = () =>
  withDb(server.dbPath, db => db.prepare('select workspace_id, user_id, key, name, blob, schema_version from saved_views').all());

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-views-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-views-key' } });

  const me = await signup(server.base, { name: 'Owner', email: 'views-owner@test.local', password: PASSWORD });
  assert.equal(me.status, 201, 'owner signup');
  owner = me.client;
  const created = await owner.post('/api/workspaces', { name: 'Views', slug: 'views-ws' });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  ws = withDb(server.dbPath, db => db.prepare('select id, slug from workspaces where slug = ?').get('views-ws'));
  assert.ok(ws?.id, 'workspace row exists');

  stranger = (await signup(server.base, { name: 'Stranger', email: 'views-stranger@test.local', password: PASSWORD })).client;
});

after(async () => {
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------- (a) sanitizeViewBlob — the D-11 whitelist ------------------- */

test('sanitize drops q, _-prefixed transients and unknown fields, keeps the whitelist', () => {
  const raw = {
    filters: [{ f: 'status', op: 'is', v: ['todo'] }],
    sort: { f: 'due', dir: -1 },
    group: 'priority',
    hidden: ['start', 'created'],
    colW: { start: 120 },
    showDone: false,
    q: 'search text', // transient free text — never stored (D-11)
    _projHidden: ['p1'], // transient underscore key — never stored
    unknownFuture: { x: 1 }, // lenient load: unknown fields intersect away
  };
  const clean = sanitizeViewBlob(raw);
  assert.deepEqual(Object.keys(clean).sort(), [...VIEW_BLOB_KEYS].sort(), 'exactly the whitelist keys survive');
  assert.equal(clean.q, undefined);
  assert.equal(clean._projHidden, undefined);
  assert.equal(clean.unknownFuture, undefined);
  assert.deepEqual(clean.hidden, ['start', 'created']);
  assert.deepEqual(clean.sort, { f: 'due', dir: -1 });
  // input never mutated
  assert.equal(raw.q, 'search text');
});

test('sanitize rejects non-object shapes', () => {
  assert.deepEqual(sanitizeViewBlob(null), {});
  assert.deepEqual(sanitizeViewBlob('x'), {});
  assert.deepEqual(sanitizeViewBlob([1, 2]), {});
  assert.deepEqual(sanitizeViewBlob(undefined), {});
});

/* ------------------- (b) localStorage mirror — D-08 local mode ------------------- */

test('localStorage accessors survive a missing/blocked localStorage (try/catch fallbacks)', () => {
  // Node has no localStorage: every accessor must fall back, never throw.
  assert.deepEqual(getLocalSavedViews('demo'), {});
  assert.doesNotThrow(() => setLocalSavedViews('demo', 'tasks', { hidden: ['start'] }));
  assert.doesNotThrow(() => removeLocalSavedView('demo', 'tasks'));
});

/* ------------------- (c) live-row routes — PUT then GET ------------------- */

test('PUT stores the live row; GET returns it; whitelisted keys only (T-57-03)', async () => {
  const put = await owner.put('/api/me/views', {
    workspace: ws.id,
    key: 'tasks',
    blob: { hidden: ['start'], q: 'leak', _projHidden: ['p1'], junk: true },
  });
  assert.equal(put.status, 200, `PUT views ${put.status}`);
  assert.deepEqual(put.data.views.live, { hidden: ['start'] }, 'blob intersected to the whitelist');
  assert.deepEqual(put.data.views.named, [], 'no named views yet');

  const got = await owner.get(`/api/me/views?workspace=${ws.id}&key=tasks`);
  assert.equal(got.status, 200, `GET views ${got.status}`);
  assert.deepEqual(got.data.views.live, { hidden: ['start'] });

  const rows = viewRows().filter(r => r.key === 'tasks');
  assert.equal(rows.length, 1, 'exactly one live row');
  assert.equal(rows[0].name, '', 'sentinel name for the live row');
  assert.equal(rows[0].schema_version, 1, 'schema_version coerced');
});

test('PUT merges into the stored blob — a partial body never erases omitted keys', async () => {
  const put = await owner.put('/api/me/views', { workspace: ws.id, key: 'tasks', blob: { showDone: false, colW: { start: 140 } } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.data.views.live, { hidden: ['start'], showDone: false, colW: { start: 140 } }, 'merge-not-replace across PUTs');
});

test('PUT is revision-free — no If-Match/revision gate can 409 a view save (D-07)', async () => {
  const res = await owner.put('/api/me/views', { workspace: ws.id, key: 'tasks', blob: { showDone: true } });
  assert.equal(res.status, 200, 'view save never conflicts with the doc revision');
});

test('GET for a key with no row returns live: null (viewOf defaults apply, D-13)', async () => {
  const got = await owner.get(`/api/me/views?workspace=${ws.id}&key=mytasks`);
  assert.equal(got.status, 200);
  assert.equal(got.data.views.live, null);
});

/* ------------------- (d) trust boundaries — T-57-01 ------------------- */

test('non-member GET/PUT read as 404 — no workspace-existence oracle', async () => {
  const got = await stranger.get(`/api/me/views?workspace=${ws.id}&key=tasks`);
  assert.equal(got.status, 404);
  const put = await stranger.put('/api/me/views', { workspace: ws.id, key: 'tasks', blob: { hidden: [] } });
  assert.equal(put.status, 404);
});

test('a crafted body user_id is ignored — rows always attribute to the session user', async () => {
  const ownerRow = viewRows().find(r => r.key === 'tasks');
  const res = await owner.put('/api/me/views', {
    workspace: ws.id,
    key: 'tasks',
    blob: { hidden: ['start', 'created'] },
    user_id: 'spoofed-account-id',
  });
  assert.equal(res.status, 200);
  const after = viewRows().find(r => r.key === 'tasks');
  assert.equal(after.user_id, ownerRow.user_id, 'row still attributed to the session user');
  assert.deepEqual(JSON.parse(after.blob).hidden, ['start', 'created']);
});

test('malformed bodies are 400, not 500', async () => {
  assert.equal((await owner.put('/api/me/views', { workspace: ws.id, key: '', blob: {} })).status, 400, 'empty key rejected');
  assert.equal((await owner.put('/api/me/views', { workspace: ws.id, key: 'tasks', blob: 'nope' })).status, 400, 'non-object blob rejected');
  assert.equal((await owner.put('/api/me/views', { workspace: ws.id, key: 'tasks' })).status, 400, 'missing blob rejected');
  assert.equal((await owner.get(`/api/me/views?workspace=${ws.id}&key=`)).status, 400, 'empty key GET rejected');
});

/* ------------------- (e) the doc is never a view-state carrier (D-05) ------------------- */

test('after a view save, the stored workspace doc carries no top-level views field', async () => {
  await owner.put('/api/me/views', { workspace: ws.id, key: 'tasks', blob: { hidden: ['deps'] } });
  const stored = withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(ws.id));
  const doc = JSON.parse(stored.doc);
  assert.equal(doc.views, undefined, 'doc.views never resurrects');
});
