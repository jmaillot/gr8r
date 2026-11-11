/* Phase 51 (51-01, CRT-01 / D-51-15/16/17): permCreate enforcement and
   lead-on-create inside the doc-write funnel (mergeClientDoc). Pins:

     1. restriction OFF  + member PUT introducing a project  → merges; the
        server sets the creator as lead (D-51-17 — never client goodwill);
     2. restriction ON (STORED prefs.permCreate === true) + member PUT
        introducing a project → that operation refused with the keyed error
        projectCreateForbidden, the OTHER edits in the same PUT still merge
        (scoped refusal — never a whole-PUT 403, Pitfall 1);
     3. restriction ON + admin PUT introducing a project → succeeds; the lead
        set in the doc is kept as today;
     4. a member PUT flipping stored prefs.permCreate → the STORED pref is
        UNCHANGED (the restriction is never taken from the incoming doc —
        Pitfall 3 / T-51-01);
     5. immediacy (D-51-16): the restriction is read from the stored doc per
        request — flipping it changes the very next create-PUT outcome with
        no cache and no restart.

   Expectations are stated inline (never read from production code). Fixture:
   the shared visibility fixture (fresh copy per suite run — the visibility
   suites never see these mutations). */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { login, startServer, withDb } from './helpers/server.mjs';

let dataDir;
let server;
let member; // m_team's client
let admin; // m_admin's client

const storedDoc = () =>
  JSON.parse(
    withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(VIS_WS.id)).doc,
  );
const writeStoredDoc = doc =>
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id));
const setRestriction = on => {
  const doc = storedDoc();
  doc.prefs = { ...(doc.prefs || {}), permCreate: on === null ? undefined : on };
  if (on === null) delete doc.prefs.permCreate;
  writeStoredDoc(doc);
};
const project = id => storedDoc().data.projects.find(p => p.id === id);

const newProject = (id, extra = {}) => ({
  id,
  key: id.replace(/^p_/, ''),
  name: `Created ${id}`,
  icon: 'folder',
  color: '#0EA5E9',
  status: 'planning',
  private: false,
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-project-creation-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  const m = await login(server.base, 'team@visfix.local', VIS_PASSWORD);
  assert.equal(m.status, 200);
  member = m.client;
  const a = await login(server.base, 'admin@visfix.local', VIS_PASSWORD);
  assert.equal(a.status, 200);
  admin = a.client;
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('restriction OFF: a member PUT introducing a project merges — the creator becomes lead (D-51-17)', async () => {
  setRestriction(null);
  const res = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_made1'));
  });
  assert.equal(res.status, 200);
  const p = project('p_made1');
  assert.ok(p, 'the member-created project merges');
  assert.equal(p.lead, 'm_team', 'the acting member is enforced as lead server-side');
  assert.ok(p.members.includes('m_team'), 'the creator stays on the access list');
});

test('restriction ON: the member create is refused with projectCreateForbidden while the rest of the PUT still merges', async () => {
  setRestriction(true);
  const res = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_made2'));
    doc.data.projects.find(p => p.id === 'p_open').name = 'Open (renamed by member)';
  });
  assert.equal(res.status, 200, 'the PUT itself is NOT a 403 — the refusal is scoped to the create operation');
  const codes = (res.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectCreateForbidden'), `a keyed refusal rides the 200 response (got: ${JSON.stringify(res.data)})`);
  assert.ok(!project('p_made2'), 'the restricted create did NOT merge');
  assert.equal(project('p_open').name, 'Open (renamed by member)', 'the unrelated edit in the same PUT still merges');
});

test('restriction ON: an admin PUT introducing a project succeeds — the doc-set lead is kept', async () => {
  const res = await docPutAs(admin, doc => {
    doc.data.projects.push(newProject('p_made3', { lead: 'm_admin', members: ['m_admin'] }));
  });
  assert.equal(res.status, 200);
  const p = project('p_made3');
  assert.ok(p, 'the admin create merges despite the restriction');
  assert.equal(p.lead, 'm_admin', 'the admin-set lead is kept as today');
});

test('a member PUT flipping stored prefs.permCreate leaves the STORED pref unchanged (T-51-01, Pitfall 3)', async () => {
  assert.equal(storedDoc().prefs?.permCreate, true, 'precondition: the stored restriction is ON');
  const res = await docPutAs(member, doc => {
    doc.prefs = { ...(doc.prefs || {}), permCreate: false };
  });
  assert.equal(res.status, 200);
  assert.equal(storedDoc().prefs?.permCreate, true, 'the member cannot rewrite the restriction through the doc PUT');
});

test('immediacy: the restriction is read from the stored doc per request — the next PUT sees the flip (D-51-16)', async () => {
  /* OFF → member create succeeds. */
  setRestriction(false);
  const ok = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_made4'));
  });
  assert.equal(ok.status, 200);
  assert.ok(project('p_made4'), 'with the restriction off, the member create merges');

  /* Flip ON in storage only — no restart, no cache: the very next create-PUT is refused. */
  setRestriction(true);
  const refused = await docPutAs(member, doc => {
    doc.data.projects.push(newProject('p_made5'));
  });
  assert.equal(refused.status, 200);
  const codes = (refused.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectCreateForbidden'), 'the immediate flip refuses the next create');
  assert.ok(!project('p_made5'), 'the immediate refusal kept the project out of the stored doc');
});

/* ---------------- Phase 51 (51-02): CRT-01 client surfaces ---------------- */

test('the restricted-create client strings are catalogued EN+FR (the refusal toast and the tooltip localize)', () => {
  const en = JSON.parse(fs.readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  const fr = JSON.parse(fs.readFileSync(new URL('../src/locales/fr.json', import.meta.url), 'utf8'));
  for (const key of ['err.projectCreateForbidden', 'page.projects.createRestricted']) {
    assert.ok(en[key], `en.json carries ${key}`);
    assert.ok(fr[key], `fr.json carries ${key}`);
    assert.equal(en[key].includes('<'), false, `${key} (en) respects the catalogue contract (no <)`);
    assert.equal(fr[key].includes('<'), false, `${key} (fr) respects the catalogue contract (no <)`);
  }
});
