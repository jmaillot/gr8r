/* =====================================================================
   Phase 58 SEARCH suite — FTS core (SEARCH-01/02/03, D-07/D-10/D-13/
   D-14/D-15). Two layers:

   A. Adapter unit tests on a temp SQLite db: ensureSearchIndex /
      syncTaskFts (through the REAL db.tx scope — Pitfall 2) /
      searchTasks / D-13 operator safety / D-15 min length.
   B. Real-server tests on the shared visibility fixture: the funnel
      PUT write is findable via the route immediately (D-07), the
      byte-level leak test (SEARCH-02 — a member querying a private
      task's title gets zero occurrences of that title in the BODY
      bytes, never just a status check), operator characters in the
      query are harmless (D-13), and deletions unindex (SEARCH-03).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

import * as adapter from '../db-adapter.mjs';
import { searchTerms } from '../search-terms.mjs';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

/* ---------------- A. adapter-level (temp db, real tx scope) ------------ */

test('ensureSearchIndex + syncTaskFts through the tx scope, then searchTasks finds it (D-07/D-09)', async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fts-adapter-')), 'projects.db');
  await adapter.connectDb({ dbPath });
  assert.equal(adapter.backendKind, 'sqlite');
  await adapter.ensureSearchIndex();

  const doc = {
    data: {
      tasks: [
        { id: 't1', project: 'p1', title: 'Élodie fiche carte', desc: 'Livraison rapide', status: 'todo' },
        { id: 't2', project: 'p1', title: 'Autre chose', desc: '<b>Wrap</b> HTML body', status: 'todo' },
      ],
    },
  };
  /* The funnel/MCP shape: the sync runs INSIDE db.tx with the tx scope. */
  await adapter.tx(async scope => {
    await adapter.syncTaskFts(scope, 'ws1', null, doc);
  });

  /* Two-token prefix query (D-13: implicit AND + prefix). */
  let hits = await adapter.searchTasks('ws1', searchTerms('elodie fich'));
  assert.deepEqual(hits.map(h => h.task_id), ['t1']);
  /* Accent-folded index side (D-11). */
  hits = await adapter.searchTasks('ws1', searchTerms('Élodie'));
  assert.deepEqual(hits.map(h => h.task_id), ['t1']);
  /* HTML stripped at index time (D-06 idiom) — 'wrap' matches the tag-free body. */
  hits = await adapter.searchTasks('ws1', searchTerms('wrap'));
  assert.deepEqual(hits.map(h => h.task_id), ['t2']);
  /* No cross-workspace bleed. */
  assert.deepEqual(await adapter.searchTasks('ws_other', searchTerms('elodie')), []);
  /* D-15: empty term list → [] without touching MATCH. */
  assert.deepEqual(await adapter.searchTasks('ws1', []), []);
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('unchanged doc leaves the index untouched; changed/removed tasks re-sync (SEARCH-03 edges)', async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fts-adapter-')), 'projects.db');
  await adapter.connectDb({ dbPath });
  await adapter.ensureSearchIndex();
  const doc = { data: { tasks: [{ id: 't1', project: 'p1', title: 'Stable title', desc: 'stable body', status: 'todo' }] } };
  await adapter.tx(async scope => adapter.syncTaskFts(scope, 'ws1', null, doc));
  const rowBefore = withDb(dbPath, db => db.prepare('select rowid from task_fts').get()).rowid;

  /* Same title/desc/project → no delete+insert: the rowid survives. */
  await adapter.tx(async scope => adapter.syncTaskFts(scope, 'ws1', doc, JSON.parse(JSON.stringify(doc))));
  const rowAfter = withDb(dbPath, db => db.prepare('select rowid from task_fts').get()).rowid;
  assert.equal(rowAfter, rowBefore, 'unchanged tasks must not be rewritten');

  /* Rename → re-indexed under the new folded title (desc changes too, so
     the old body token is gone from the row). */
  const renamed = { data: { tasks: [{ ...doc.data.tasks[0], title: 'Renamed élodie', desc: 'fresh body' }] } };
  await adapter.tx(async scope => adapter.syncTaskFts(scope, 'ws1', doc, renamed));
  assert.deepEqual((await adapter.searchTasks('ws1', searchTerms('renamed'))).map(h => h.task_id), ['t1']);
  assert.deepEqual(await adapter.searchTasks('ws1', searchTerms('stable')), []);

  /* Delete → row removed (SEARCH-03 empty edge). */
  await adapter.tx(async scope => adapter.syncTaskFts(scope, 'ws1', renamed, { data: { tasks: [] } }));
  assert.deepEqual(await adapter.searchTasks('ws1', searchTerms('renamed')), []);
  const meta = withDb(dbPath, db => db.prepare('select task_count from fts_meta where workspace_id = ?').get('ws1'));
  assert.equal(meta.task_count, 0);
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

test('operator-laden input never reaches MATCH: sanitized tokens only (D-13, T-58-02)', async () => {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fts-adapter-')), 'projects.db');
  await adapter.connectDb({ dbPath });
  await adapter.ensureSearchIndex();
  /* The adapter builds tok* expressions from ALREADY-whitelisted tokens;
     these query strings must all fold to safe token lists. */
  for (const q of ['"quo*te', 'col:on', 'NEAR((a', 'a OR b', '*', ':', 'NEAR']) {
    const terms = searchTerms(q);
    assert.match(terms.join(' '), /^[a-z0-9* ]*$/, `query ${JSON.stringify(q)} must sanitize to [a-z0-9] tokens`);
    assert.deepEqual(await adapter.searchTasks('ws1', terms), [], 'empty index → [] without throwing');
  }
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

/* ---------------- B. real-server funnel + route + leak ----------------- */

let server;
let owner;
let plain; // member who CANNOT read the private p_hidden project
let dataDir;

const searchRoute = (q) => `/api/workspaces/${VIS_WS.slug}/search?q=${encodeURIComponent(q)}`;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-search-fts-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  const o = await login(server.base, 'owner@visfix.local', VIS_PASSWORD);
  assert.equal(o.status, 200);
  owner = o.client;
  const m = await login(server.base, 'plain@visfix.local', VIS_PASSWORD);
  assert.equal(m.status, 200);
  plain = m.client;
});

after(async () => {
  await server?.stop();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

test('a task written through the doc-PUT funnel is findable via the route immediately (D-07, SEARCH-01)', async () => {
  const get = await owner.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  doc.data.tasks.push({
    id: 't_fts_elodie',
    project: 'p_open',
    title: 'Élodie fiche carte',
    desc: '<b>Livraison</b> rapide du colis',
    status: 'todo',
    subtasks: [],
  });
  const put = await owner.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
  assert.equal(put.status, 200);

  /* Two-token prefix query (implicit AND). */
  const res = await owner.get(searchRoute('elodie fich'));
  assert.equal(res.status, 200);
  const hit = res.data.tasks.find(t => t.id === 't_fts_elodie');
  assert.ok(hit, 'funnel-written task must be in the results');
  assert.equal(hit.title, 'Élodie fiche carte');
  assert.equal(hit.projectId, 'p_open');
  /* Plain-text snippet: HTML gone, surrounding words present (D-06). */
  assert.equal(hit.snippet.includes('<b>'), false, 'no HTML in the snippet');
  assert.match(hit.snippet, /Livraison/);
  /* Constant shape, no counts/totals (T-58-03). */
  assert.deepEqual(Object.keys(res.data), ['tasks']);
  assert.ok(res.data.tasks.length <= 30);
});

test('implicit AND is enforced: one token missing → no hit', async () => {
  const res = await owner.get(searchRoute('elodie zzzz'));
  assert.equal(res.status, 200);
  assert.equal(res.data.tasks.some(t => t.id === 't_fts_elodie'), false);
});

test('BYTE-LEVEL leak test: a member querying a private task title gets zero occurrences in the body bytes (SEARCH-02)', async () => {
  const res = await fetch(server.base + searchRoute('hidden task'), { headers: { cookie: plain.cookie() } });
  assert.equal(res.status, 200);
  const body = await res.text(); // raw bytes, not a parsed shape
  assert.equal(body.includes('Hidden task'), false, 'private title must not appear in body bytes');
  assert.equal(body.includes('t_hidden'), false, 'private task id must not appear in body bytes');
  assert.equal(body.includes('p_hidden'), false);
  /* Constant shape survives filtering (T-58-03). */
  const data = JSON.parse(body);
  assert.deepEqual(Object.keys(data), ['tasks']);
  assert.ok(Array.isArray(data.tasks));
});

test('operator characters in the query are harmless — 200, sane results, never a 500 (D-13, Pitfall 3)', async () => {
  for (const q of ['"quo*te', 'a:b', 'NEAR((x))', '*', 'hidden"task']) {
    const res = await owner.get(searchRoute(q));
    assert.equal(res.status, 200, `query ${JSON.stringify(q)} must not 500`);
    assert.ok(Array.isArray(res.data.tasks));
  }
});

test('D-15: a query folding shorter than 2 characters answers an empty tasks array', async () => {
  for (const q of ['a', 'é', '*', '']) {
    const res = await owner.get(searchRoute(q));
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.tasks, []);
  }
});

test('deleted tasks leave the index through the funnel (SEARCH-03 delete edge)', async () => {
  const get = await owner.get(`/api/workspaces/${VIS_WS.slug}`);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  doc.data.tasks = doc.data.tasks.filter(t => t.id !== 't_fts_elodie');
  const put = await owner.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
  assert.equal(put.status, 200);
  const res = await owner.get(searchRoute('elodie'));
  assert.equal(res.status, 200);
  assert.equal(res.data.tasks.some(t => t.id === 't_fts_elodie'), false);
});
