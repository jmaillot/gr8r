/* Phase 51 (51-01, D-51-1..3 / VIS-01): the share-modal private toggle made
   real end-to-end. Pins the authority matrix for the toggle write path — the
   doc-sync PUT through mergeClientDoc — and the ONE client surface path the
   phase mandates: a non-admin project lead flips their project private and
   the change persists through the server merge. Cells assert the STORED doc
   after each PUT (never the echoed request):

     owner ✓ · admin ✓ · lead ✓ (non-admin, via p.lead) · member ✗ (pinned)

   Expectations are stated inline (never read from production code). Fixture:
   the shared visibility fixture — p_membershare is private with lead m_plain
   (a plain Member, NOT an admin): exactly the D-51-17 lead shape. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { client, login, startServer, withDb } from './helpers/server.mjs';

let dataDir;
let server;
const sessions = {}; // email → client

const storedDoc = () =>
  JSON.parse(
    withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(VIS_WS.id)).doc,
  );
const project = id => storedDoc().data.projects.find(p => p.id === id);

/* The one doc-sync cell helper: GET the current doc+revision as `email`,
   apply `mutate` to the doc copy, PUT it back. Returns the raw response. */
async function docPutAs(email, mutate) {
  const c = sessions[email];
  const get = await c.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200, `${email} reads the workspace doc`);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  mutate(doc);
  return c.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-client-surfaces-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  for (const email of ['owner@visfix.local', 'admin@visfix.local', 'plain@visfix.local', 'team@visfix.local']) {
    const s = await login(server.base, email, VIS_PASSWORD);
    assert.equal(s.status, 200, `${email} signs in`);
    sessions[email] = s.client;
  }
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('fixture shape: p_membershare is private with a plain-member lead (D-51-17 cell)', () => {
  const p = project('p_membershare');
  assert.equal(p.private, true);
  assert.equal(p.lead, 'm_plain');
  assert.equal(storedDoc().data.members.find(m => m.id === 'm_plain').role, 'Member');
});

test('owner flips their injected private project public through the doc PUT (stored doc reflects it)', async () => {
  /* Phase 49 posture: the doc-GET admin/owner door is access-list-gated, so
     the owner cell uses p_sealed — the private-empty project the owner is
     injected into on the SERVED copy (normalizeProjects). */
  const res = await docPutAs('owner@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_sealed').private = false;
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_sealed').private, false, 'the owner write persists');
});

test('admin flips p_hidden public through the doc PUT (stored doc reflects it)', async () => {
  /* p_hidden is on the admin's access list — visible and writable. */
  const res = await docPutAs('admin@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_hidden').private = false;
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_hidden').private, false, 'the admin write persists');
});

test('END-TO-END: the non-admin lead flips their project private via doc-sync — both directions persist', async () => {
  /* m_plain leads p_membershare but holds NO workspace rank — the exact path
     the share-modal toggle must ride (D-51-17; doc-sync, no admin route). */
  const res = await docPutAs('plain@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_membershare').private = false;
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_membershare').private, false, 'the lead write persists (public)');

  const res2 = await docPutAs('plain@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_membershare').private = true;
  });
  assert.equal(res2.status, 200);
  const after = project('p_membershare');
  assert.equal(after.private, true, 'the lead write persists (private)');
  assert.ok(after.members.includes('m_plain'), 'the lead keeps their access-list entry');
});

test('member PUT cannot flip p.private — the server pins it (stored doc keeps prev)', async () => {
  /* m_team can see the public p_open but is not its manager (no lead, not
     listed): the privatize attempt must be pinned, not rejected (200, T-50-01
     family), and the STORED doc keeps public. */
  const res = await docPutAs('team@visfix.local', doc => {
    doc.data.projects.find(p => p.id === 'p_open').private = true;
  });
  assert.equal(res.status, 200, 'the doc PUT itself succeeds (fields are pinned, not rejected)');
  assert.equal(project('p_open').private, false, 'the member privatize attempt was pinned');
});

/* ---------------- Phase 51 (51-02): the share modal's Teams section ----------------
   D-51-5/6/7/8/9: the invite + unlink actions ride the SAME doc-sync path as the
   toggle — the non-admin lead links and unlinks a team on their own project and
   the stored doc reflects it (the client canManageProject gate mirrors the
   server-side manager gating pinned in visibility-team.test.mjs). */

test('END-TO-END: the non-admin lead links then unlinks a team via doc-sync (Teams section write path)', async () => {
  const res = await docPutAs('plain@visfix.local', doc => {
    const p = doc.data.projects.find(x => x.id === 'p_membershare');
    p.teams = Array.isArray(p.teams) ? p.teams : [];
    if (!p.teams.includes('engA')) p.teams.push('engA');
  });
  assert.equal(res.status, 200);
  assert.deepEqual(project('p_membershare').teams, ['engA'], 'the team link persisted');

  const res2 = await docPutAs('plain@visfix.local', doc => {
    const p = doc.data.projects.find(x => x.id === 'p_membershare');
    p.teams = (Array.isArray(p.teams) ? p.teams : []).filter(x => x !== 'engA');
  });
  assert.equal(res2.status, 200);
  assert.deepEqual(project('p_membershare').teams, [], 'the team unlink persisted');
});
