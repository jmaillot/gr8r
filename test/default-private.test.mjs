/* Default workspace visibility (Phase 57 plan 03, VIEW-03, D-01..D-04).
   `prefs.defaultPrivate` is a single owner/admin setting that seeds the
   initial `p.private` on NEW projects only — no retro-apply, no third
   access state, and the visibility funnel (projectIsPrivate/hiddenFor)
   is untouched. Server pins:

     1. pref unset + member PUT introducing a project with NO private key
        → the project merges non-private (normalizeProjects always stores
        the explicit boolean; the client-side "absent key" shape is the
        createProject contract proven in e2e);
     2. the pref is read from the STORED document only — a member PUT
        claiming prefs.defaultPrivate=true while the stored pref is false
        never flips it (D-51-15/16 convention, T-57-07);
     3. a non-boolean incoming defaultPrivate is coerced fail-closed to
        false — truthiness can never smuggle into the stored doc;
     4. stored defaultPrivate=true + member PUT introducing a project with
        NO private key → the project is seeded private:true (A3 server
        parity with the client createProject seed);
     5. an explicit private:false on the created project always wins over
        the pref (the per-project binary stays the authority, D-04);
     6. no retro-apply: flipping the pref leaves every EXISTING project's
        visibility byte-identical.

   Expectations are stated inline (never read from production code).
   Fixture: the shared visibility fixture (fresh copy per suite run). */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

let dataDir;
let server;
let owner; // ws owner
let member; // m_team's client

const storedDoc = () =>
  JSON.parse(
    withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(VIS_WS.id)).doc,
  );
const writeStoredDoc = doc =>
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id));
const setDefaultPrivate = v => {
  const doc = storedDoc();
  doc.prefs = { ...(doc.prefs || {}), defaultPrivate: v };
  if (v === undefined) delete doc.prefs.defaultPrivate;
  writeStoredDoc(doc);
};
const project = id => storedDoc().data.projects.find(p => p.id === id);
/* D-02 evidence: the visibility state of every PRE-EXISTING project at boot —
   the no-retro-apply pin compares against this, not against "all false" (the
   fixture legitimately contains private projects). */
let initialPrivate = {};

const newProject = (id, extra = {}) => ({
  id,
  key: id.replace(/^p_/, ''),
  name: `Created ${id}`,
  icon: 'folder',
  color: '#0EA5E9',
  status: 'planning',
  members: ['m_team'],
  lead: null,
  teams: [],
  perms: {},
  tasks: [],
  milestones: [],
  ...extra,
});

/* GET the current doc+revision as the session, apply `mutate`, PUT back. */
async function docPutAs(c, mutate) {
  const get = await c.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  mutate(doc);
  return c.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-default-private-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  const o = await login(server.base, 'owner@visfix.local', VIS_PASSWORD);
  assert.equal(o.status, 200);
  owner = o.client;
  const m = await login(server.base, 'team@visfix.local', VIS_PASSWORD);
  assert.equal(m.status, 200);
  member = m.client;
  initialPrivate = Object.fromEntries(
    storedDoc()
      .data.projects.filter(p => !p.id.startsWith('p_dv_'))
      .map(p => [p.id, p.private === true]),
  );
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('pref unset: a member-created project with no private key merges NON-private', async () => {
  setDefaultPrivate(undefined);
  const res = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_dv_off'));
  });
  assert.equal(res.status, 200);
  const p = project('p_dv_off');
  assert.ok(p, 'the project merges');
  assert.equal(p.private === true, false, 'non-private when the pref is unset — never seeded');
});

test('T-57-07: a member PUT claiming defaultPrivate=true never flips the STORED pref', async () => {
  setDefaultPrivate(false);
  const res = await docPutAs(member, doc => {
    doc.prefs = { ...(doc.prefs || {}), defaultPrivate: true };
  });
  assert.equal(res.status, 200);
  assert.equal(storedDoc().prefs?.defaultPrivate, false, 'the incoming blob is never trusted');
});

test('fail-closed coercion: a non-boolean incoming defaultPrivate is normalized to false', async () => {
  const res = await docPutAs(owner, doc => {
    doc.prefs = { ...(doc.prefs || {}), defaultPrivate: 'yes' };
  });
  assert.equal(res.status, 200);
  assert.equal(storedDoc().prefs?.defaultPrivate, false, 'truthiness can never enter the stored doc');

  const res2 = await docPutAs(owner, doc => {
    doc.prefs = { ...(doc.prefs || {}), defaultPrivate: true };
  });
  assert.equal(res2.status, 200);
  assert.equal(storedDoc().prefs?.defaultPrivate, true, 'a boolean owner write is stored');
});

test('A3 seeding parity: stored pref ON + member create with no private key → seeded private:true', async () => {
  assert.equal(storedDoc().prefs?.defaultPrivate, true, 'precondition: the stored pref is ON');
  const res = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_dv_seed'));
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_dv_seed')?.private, true, 'the server seeds from the STORED pref');
});

test('D-04: an explicit private:false on the created project wins over the pref', async () => {
  const res = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_dv_explicit', { private: false }));
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_dv_explicit')?.private, false, 'the per-project binary stays the authority');
});

test('D-02: no retro-apply — the existing projects stay byte-identical when the pref is ON', async () => {
  const now = Object.fromEntries(
    storedDoc()
      .data.projects.filter(p => !p.id.startsWith('p_dv_'))
      .map(p => [p.id, p.private === true]),
  );
  assert.deepEqual(now, initialPrivate, 'no pre-existing project changed visibility with the pref flip');
});
