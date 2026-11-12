/* The D-06 boot sweep (Phase 57): legacy top-level doc.views blobs become
   owner-attributed saved_views live rows (sentinel name = ''), the doc field
   is stripped forever, a stale client cannot merge it back, and the second
   boot is a byte-identical no-op. Real server, real SQLite, explicit reboot
   against the same database (the migration-test pattern). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { client, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'viewsmig-password-1';

let tempDir;
let owner;
let ws;

const docOf = () => JSON.parse(withDb(path.join(tempDir, 'projects.db'), db => db.prepare('select doc from workspaces where id = ?').get(ws.id).doc));
const savedViewsRows = () =>
  withDb(path.join(tempDir, 'projects.db'), db => db.prepare('select workspace_id, user_id, key, name, blob, schema_version from saved_views order by key').all());
const memberships = () =>
  withDb(path.join(tempDir, 'projects.db'), db => db.prepare('select user_id, role from memberships where workspace_id = ?').all(ws.id));

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-viewsmig-'));
  /* Boot 1: create the workspace + owner account, then stop so the legacy doc
     can be planted on disk before the migrating boot. */
  const s1 = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'viewsmig-key' } });
  const me = await signup(s1.base, { name: 'Owner', email: 'viewsmig-owner@test.local', password: PASSWORD });
  assert.equal(me.status, 201);
  owner = me.client;
  const created = await owner.post('/api/workspaces', { name: 'Mig', slug: 'mig-ws' });
  assert.equal(created.status, 201);
  ws = withDb(s1.dbPath, db => db.prepare('select id from workspaces where slug = ?').get('mig-ws'));
  await s1.stop();
});

after(async () => {
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------- (a) the migrating boot ------------------- */

test('boot 2: doc.views rows land attributed to the OWNER, doc stripped, idempotent second boot', async () => {
  /* Plant the legacy shape on the stored doc: a top-level views object with
     two snapshots, one per key family (research A2). */
  withDb(path.join(tempDir, 'projects.db'), db => {
    const doc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
    doc.views = {
      tasks: { hidden: ['start'], sort: { f: 'due', dir: -1 }, q: 'transient' },
      'p:legacy1': { hidden: ['created', 'deps'], showDone: false },
    };
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
    /* A per-user row the owner already set AFTER the accessor shipped —
       insert or ignore must keep it over the legacy blob. */
    db.prepare('insert into saved_views (workspace_id, user_id, key, name, blob, schema_version) values (?,?,?,?,?,?)').run(
      ws.id,
      memberships().find(m => m.role === 'owner').user_id,
      'mytasks',
      '',
      JSON.stringify({ showDone: false }),
      1,
    );
  });

  const s2 = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'viewsmig-key' } });
  try {
    const ownerRow = memberships().find(m => m.role === 'owner');
    const rows = savedViewsRows();
    assert.equal(rows.filter(r => r.key === 'tasks').length, 1, 'one live row for tasks');
    const tasksRow = rows.find(r => r.key === 'tasks');
    assert.equal(tasksRow.name, '', 'sentinel name — the live row');
    assert.equal(tasksRow.user_id, ownerRow.user_id, 'owner attribution (D-06 accepted caveat)');
    assert.equal(tasksRow.schema_version, 1);
    assert.deepEqual(JSON.parse(tasksRow.blob).hidden, ['start'], 'legacy blob copied verbatim');
    assert.ok(rows.some(r => r.key === 'p:legacy1'), 'every key family rides the sweep');

    const mytasks = rows.find(r => r.key === 'mytasks');
    assert.deepEqual(JSON.parse(mytasks.blob), { showDone: false }, 'the newer per-user row is NOT overwritten');

    const doc = docOf();
    assert.equal(doc.views, undefined, 'the stored doc no longer carries views');

    /* Boot 3: byte-identical no-op — same rows, same doc bytes. */
    const rowsBefore = JSON.stringify(rows);
    const docBefore = JSON.stringify(doc);
    await s2.stop();
    const s3 = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'viewsmig-key' } });
    try {
      assert.equal(JSON.stringify(savedViewsRows()), rowsBefore, 'second boot: row bytes unchanged');
      assert.equal(JSON.stringify(docOf()), docBefore, 'second boot: doc bytes unchanged');
    } finally {
      await s3.stop();
    }
  } catch (e) {
    await s2.stop();
    throw e;
  }
});

/* ------------------- (b) the three-site strip ------------------- */

test('a stale client cannot merge doc.views back through a workspace doc PUT', async () => {
  const s = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'viewsmig-key' } });
  try {
    const c = client(s.base, 'owner');
    const login = await c.post('/api/auth/login', { email: 'viewsmig-owner@test.local', password: PASSWORD });
    assert.equal(login.status, 200);
    const got = await c.get('/api/workspaces/mig-ws');
    assert.equal(got.status, 200, `doc read ${got.status}`);
    if (got.data?.doc) {
      const stale = got.data.doc;
      stale.views = { tasks: { hidden: ['title'] } }; // the resurrection attempt
      const put = await c.put('/api/workspaces/mig-ws', { revision: got.data.revision, doc: stale });
      assert.ok([200, 409].includes(put.status), `stale PUT ${put.status}`);
    }
    assert.equal(docOf().views, undefined, 'doc.views never resurrects through the merge path');
  } finally {
    await s.stop();
  }
});

test('the served doc never carries a views field, even a crafted stored doc', async () => {
  const s = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'viewsmig-key' } });
  try {
    const c = client(s.base, 'owner');
    await c.post('/api/auth/login', { email: 'viewsmig-owner@test.local', password: PASSWORD });
    /* Craft the field directly on disk, as a pre-migration write would. */
    const doc = docOf();
    doc.views = { tasks: { hidden: ['title'] } };
    withDb(path.join(tempDir, 'projects.db'), db =>
      db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id),
    );
    const got = await c.get('/api/workspaces/mig-ws');
    if (got.status === 200 && got.data?.doc) {
      assert.equal(got.data.doc.views, undefined, 'normalizeDoc strips the field on every read');
    }
  } finally {
    await s.stop();
  }
});
