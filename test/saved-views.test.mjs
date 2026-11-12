/* Named saved views (Phase 57 plan 02, VIEW-02, D-10/D-11/D-12).
   Real server, real SQLite. Named views are rows in the saved_views table
   beside the sentinel name='' live row, keyed (workspace_id, user_id, key).
   Guardrails are server-side: ≤20 named rows per member per key, blob ≤2 kB,
   case-insensitive name uniqueness — and a lenient load: a stored blob written
   by an older schema_version is whitelist-intersected on read, never a hard
   failure. Named views exist only for the tasks/mytasks keys (D-10). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { signup, startServer, withDb } from './helpers/server.mjs';
import { NAMED_VIEW_BLOB_MAX_BYTES, NAMED_VIEW_KEYS, NAMED_VIEW_MAX, VIEW_BLOB_KEYS } from '../src/core/savedViews.js';

/* IN-02 drift pin (57-04): the view whitelist/cap constants are hand-duplicated
   between server.js and src/core/savedViews.js (the NO-IMPORTS client/server
   split forbids a shared module). This string-scan pins them the same way
   export-client.test.mjs pins DEFAULT_OPTIONS: a one-sided edit must fail a
   test, not ship a silent guardrail drift. */
const serverSrc = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
const serverConst = name => {
  const m = serverSrc.match(new RegExp(`(?:const|let) ${name} = (.+?);`, 's'));
  assert.ok(m, `server.js declares ${name}`);
  return m[1];
};

test('server.js view constants mirror the client savedViews exports (drift pin)', () => {
  assert.deepEqual(JSON.parse(serverConst('VIEW_BLOB_KEYS').replace(/'/g, '"')), VIEW_BLOB_KEYS);
  assert.equal(serverConst('NAMED_VIEW_MAX'), String(NAMED_VIEW_MAX));
  assert.equal(serverConst('NAMED_VIEW_BLOB_MAX_BYTES'), String(NAMED_VIEW_BLOB_MAX_BYTES));
  // client NAMED_VIEW_KEYS is a plain array; server declares a Set — compare
  // the inner list, quote-style normalized
  const inner = serverConst('NAMED_VIEW_KEYS').match(/new Set\(\[(.*?)\]\)/s);
  assert.ok(inner, 'server.js NAMED_VIEW_KEYS is a Set of a literal array');
  assert.deepEqual(JSON.parse(`[${inner[1].replace(/'/g, '"')}]`), NAMED_VIEW_KEYS);
});

const PASSWORD = 'views-named-password-1';

let server;
let tempDir;
let owner;
let ws;

const namedRows = () =>
  withDb(server.dbPath, db =>
    db
      .prepare(
        "select workspace_id, user_id, key, name, blob, schema_version from saved_views where name != '' order by name",
      )
      .all(),
  );

const putNamed = (blob, name = 'Work', key = 'tasks') => owner.put('/api/me/views', { workspace: ws.id, key, name, blob });

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-named-views-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-named-views-key' } });

  const me = await signup(server.base, { name: 'Owner', email: 'named-views-owner@test.local', password: PASSWORD });
  assert.equal(me.status, 201, 'owner signup');
  owner = me.client;
  const created = await owner.post('/api/workspaces', { name: 'Named Views', slug: 'named-views-ws' });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  ws = withDb(server.dbPath, db => db.prepare('select id, slug from workspaces where slug = ?').get('named-views-ws'));
  assert.ok(ws?.id, 'workspace row exists');
});

after(async () => {
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------- (a) the happy path ------------------- */

test('PUT named row stores it; canonical GET returns the named list', async () => {
  const put = await putNamed({ hidden: ['start'], q: 'leak', _projHidden: ['p1'], junk: true });
  assert.equal(put.status, 200, `PUT named ${put.status} ${JSON.stringify(put.data)}`);
  assert.equal(put.data.views.live, null, 'named save never touches the live row');
  assert.equal(put.data.views.named.length, 1);
  assert.equal(put.data.views.named[0].name, 'Work');
  assert.deepEqual(put.data.views.named[0].blob, { hidden: ['start'] }, 'blob intersected to the whitelist');

  const got = await owner.get(`/api/me/views?workspace=${ws.id}&key=tasks`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.data.views.named, [{ name: 'Work', blob: { hidden: ['start'] } }]);

  const rows = namedRows();
  assert.equal(rows.length, 1, 'exactly one named row');
  assert.equal(rows[0].schema_version, 1, 'schema_version coerced');
});

test('PUT named row is replace semantics — never a merge with the old blob', async () => {
  await putNamed({ hidden: ['start', 'created'], colW: { start: 120 } });
  const put = await putNamed({ showDone: false });
  assert.equal(put.status, 200);
  assert.deepEqual(put.data.views.named[0].blob, { showDone: false }, 'old keys gone — snapshot replaces');
});

/* ------------------- (b) caps (T-57-04, D-12) ------------------- */

test('PUT named row: 20 rows accepted, the 21st is a keyed error and the count holds', async () => {
  for (let i = namedRows().filter(r => r.key === 'mytasks').length; i < 20; i++) {
    const put = await owner.put('/api/me/views', { workspace: ws.id, key: 'mytasks', name: `View ${i}`, blob: { showDone: false } });
    assert.equal(put.status, 200, `cap fill ${i}`);
  }
  assert.equal(namedRows().filter(r => r.key === 'mytasks').length, 20, 'twenty named rows stored');
  const overflow = await owner.put('/api/me/views', { workspace: ws.id, key: 'mytasks', name: 'One Too Many', blob: { showDone: false } });
  assert.equal(overflow.status, 413, `limit status ${overflow.status}`);
  assert.equal(overflow.data?.code, 'viewLimitReached', 'keyed limit error');
  assert.equal(namedRows().filter(r => r.key === 'mytasks').length, 20, 'row count unchanged');
  // Overwriting an EXISTING row stays allowed at the cap (explicit-confirm overwrite per D-12).
  const overwrite = await owner.put('/api/me/views', { workspace: ws.id, key: 'mytasks', name: 'View 0', blob: { showDone: true } });
  assert.equal(overwrite.status, 200, 'overwrite at the cap is allowed');
});

test('PUT named row: blob over 2 kB rejected; exactly 2 kB accepted (boundary)', async () => {
  // Sanitized output is exactly `{"hidden":["` + n + `"]}` → 15 + n chars, ASCII = bytes.
  const at = await putNamed({ hidden: ['x'.repeat(2033)] }, 'Boundary');
  assert.equal(at.status, 200, `2 kB boundary blob accepted (got ${at.status})`);
  const over = await putNamed({ hidden: ['x'.repeat(2034)] }, 'Too Big');
  assert.equal(over.status, 413, 'blob above 2 kB rejected');
  assert.equal(over.data?.code, 'viewBlobTooLarge', 'keyed blob-cap error');
  assert.equal(namedRows().some(r => r.name === 'Too Big'), false, 'rejected row not stored');
});

/* ------------------- (c) uniqueness (D-12) ------------------- */

test('PUT name duplicating an existing row differing only by case is a keyed conflict', async () => {
  const dup = await putNamed({ hidden: [] }, 'work');
  assert.equal(dup.status, 409, `case-insensitive conflict status ${dup.status}`);
  assert.equal(dup.data?.code, 'viewNameConflict', 'keyed conflict error');
  assert.equal(namedRows().filter(r => r.name.toLowerCase() === 'work').length, 1, 'no second row');
  const exact = await putNamed({ hidden: ['deps'] }, 'Work');
  assert.equal(exact.status, 200, 'exact same-name overwrite allowed by the route (confirm is client UX)');
});

/* ------------------- (d) lenient load (ROADMAP SC-3, D-12) ------------------- */

test('GET with an old-schema blob + unknown fields intersects leniently and normalizes schema_version', async () => {
  withDb(server.dbPath, db =>
    db
      .prepare("insert or replace into saved_views (workspace_id, user_id, key, name, blob, schema_version) values (?,?,?,?,?,?)")
      .run(ws.id, namedRows().find(r => r.name === 'Work').user_id, 'tasks', 'Legacy', JSON.stringify({ filters: [], futureField: { x: 1 }, q: 'leak' }), 0),
  );
  const got = await owner.get(`/api/me/views?workspace=${ws.id}&key=tasks`);
  assert.equal(got.status, 200, 'old-schema blob never a hard failure');
  const legacy = got.data.views.named.find(v => v.name === 'Legacy');
  assert.ok(legacy, 'legacy row listed');
  assert.deepEqual(legacy.blob, { filters: [] }, 'unknown fields intersected away');
  const stored = namedRows().find(r => r.name === 'Legacy');
  assert.equal(stored.schema_version, 1, 'stored schema_version normalized');
  assert.deepEqual(JSON.parse(stored.blob), { filters: [] }, 'stored blob normalized to the whitelist');
});

test('GET with a corrupt stored blob reads clean — never a 500', async () => {
  withDb(server.dbPath, db =>
    db
      .prepare("update saved_views set blob = '{not json' where workspace_id = ? and key = 'tasks' and name = 'Legacy'")
      .run(ws.id),
  );
  const got = await owner.get(`/api/me/views?workspace=${ws.id}&key=tasks`);
  assert.equal(got.status, 200, 'corrupt blob tolerated');
  const legacy = got.data.views.named.find(v => v.name === 'Legacy');
  assert.deepEqual(legacy.blob, {}, 'corrupt blob reads as an empty whitelist blob');
});

/* ------------------- (e) DELETE ------------------- */

test('DELETE by (workspace, key, name) removes the row and returns the canonical body', async () => {
  const del = await owner.del(`/api/me/views?workspace=${ws.id}&key=tasks&name=${encodeURIComponent('Boundary')}`);
  assert.equal(del.status, 200);
  assert.equal(namedRows().some(r => r.name === 'Boundary'), false, 'row gone');
  assert.equal(Array.isArray(del.data.views.named), true, 'canonical GET body returned');
  assert.equal(del.data.views.named.some(v => v.name === 'Boundary'), false);
});

test('DELETE the live row (name=empty) removes it; GET then returns live null (D-14 reset)', async () => {
  await owner.put('/api/me/views', { workspace: ws.id, key: 'mytasks', blob: { hidden: ['due'] } });
  const gotBefore = await owner.get(`/api/me/views?workspace=${ws.id}&key=mytasks`);
  assert.ok(gotBefore.data.views.live, 'live row exists before the delete');
  const del = await owner.del(`/api/me/views?workspace=${ws.id}&key=mytasks&name=`);
  assert.equal(del.status, 200);
  assert.equal(del.data.views.live, null, 'live row gone');
  const rows = withDb(server.dbPath, db =>
    db.prepare("select 1 from saved_views where workspace_id = ? and key = 'mytasks' and name = ''").all(ws.id),
  );
  assert.equal(rows.length, 0, 'sentinel row deleted from storage');
});

/* ------------------- (f) D-10 — named views only for tasks/mytasks ------------------- */

test('PUT named view for a project key family is rejected; GET returns no named views there', async () => {
  const put = await putNamed({ hidden: [] }, 'Proj View', 'p:abc123');
  assert.equal(put.status, 400, `named write outside tasks/mytasks rejected (${put.status})`);
  assert.equal(put.data?.code, 'viewKeyNotNamed', 'keyed D-10 error');
  const got = await owner.get(`/api/me/views?workspace=${ws.id}&key=p:abc123`);
  assert.equal(got.status, 200, 'the live row read for project keys still works');
  assert.deepEqual(got.data.views.named, [], 'named list always empty outside tasks/mytasks');
});

/* ------------------- (g) trust boundaries carry over (T-57-05) ------------------- */

test('DELETE is membership-gated like GET/PUT — a non-member reads 404', async () => {
  const stranger = (await signup(server.base, { name: 'Stranger', email: 'named-views-stranger@test.local', password: PASSWORD })).client;
  assert.equal((await stranger.del(`/api/me/views?workspace=${ws.id}&key=tasks&name=Work`)).status, 404);
  assert.equal(namedRows().some(r => r.name === 'Work'), true, "stranger can't delete the owner's row");
  const spoof = await owner.put('/api/me/views', { workspace: ws.id, key: 'tasks', name: 'Spoof', blob: { hidden: [] }, user_id: 'someone-else' });
  assert.equal(spoof.status, 200);
  assert.equal(namedRows().find(r => r.name === 'Spoof').user_id, namedRows().find(r => r.name === 'Work').user_id, 'row attributed to the session user');
});
