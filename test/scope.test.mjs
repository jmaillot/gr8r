/* Phase 29 SCOPE-01: the membership scope substrate, proven end-to-end over
   HTTP on its own isolated server (the shared membership suite spends its own
   invite-accept throttle budget; this suite spends exactly one accept).

   Tracer slice: admin sets a scope on a member-role account → the member's
   doc GET omits out-of-scope projects and every dependent list rides the same
   funnel → a stale doc PUT cannot resurrect out-of-scope rows → admin targets
   are refused (D-04) and scope details are never projected (D-05). */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'scope-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });

let server;
let owner;
let scoped;
let scopedUserId;
let ownerId;

const storedDoc = () => JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
const scopeOf = userId =>
  withDb(server.dbPath, db => db.prepare('select scope from memberships where workspace_id = ? and user_id = ?').get(server.wsId, userId).scope);

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;

  // Shape the workspace: 2 public + 2 private projects, 2 team definitions,
  // one task in each public project.
  const live = (await owner.get('/api/workspaces/acme')).data;
  server.wsId = live.id;
  const ownerIdRow = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === ADMIN.email);
  ownerId = ownerIdRow.userId;
  const doc = structuredClone(live.doc);
  doc.data.projects = [
    { id: 'p_in', key: 'in', name: 'In Scope', private: false, members: [], teams: [] },
    { id: 'p_out', key: 'out', name: 'Out of Scope', private: false, members: [], teams: [] },
    { id: 'p_priv1', key: 'prv1', name: 'Private One', private: true, members: [ownerIdRow.memberId], lead: ownerIdRow.memberId, teams: [] },
    { id: 'p_priv2', key: 'prv2', name: 'Private Two', private: true, members: [ownerIdRow.memberId], lead: ownerIdRow.memberId, teams: ['team_a'] },
  ];
  doc.data.projOrder = ['p_in', 'p_out', 'p_priv1', 'p_priv2'];
  doc.data.teams = [
    { id: 'team_a', name: 'Alpha', members: [] },
    { id: 'team_b', name: 'Beta', members: [] },
  ];
  doc.data.tasks = [
    { id: 't_in', project: 'p_in', title: 'Visible task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_out', project: 'p_out', title: 'Hidden task', status: 'todo', labels: [], subtasks: [] },
  ];
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  // One member-role membership, joined via invite (1 of 5 accept budget).
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['scoped@test.local'], role: 'member' })).data.invites;
  scoped = (await signup(server.base, ACCOUNT('Scoped', 'scoped@test.local'))).client;
  const joined = await scoped.post(`/api/invites/${inviteToken(inv.url)}/accept`);
  assert.ok([200, 201].includes(joined.status), 'the member joined');
  scopedUserId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'scoped@test.local').userId;
});

after(async () => {
  await server?.stop();
});

test('the scope columns exist on memberships and invites', () => {
  for (const table of ['memberships', 'invites']) {
    const cols = withDb(server.dbPath, db => db.prepare(`pragma table_info(${table})`).all().map(c => c.name));
    assert.ok(cols.includes('scope'), `${table}.scope exists after boot`);
  }
});

test('the admin can set a project scope on a member and it lands in the authority row', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(res.status, 200);
  assert.equal('revision' in res.data, false, 'a membership route never claims a doc revision (TEAM-05 precondition)');
  assert.equal('scope' in res.data.member, false, 'the payload never projects scope details (D-05)');
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: [], projects: ['p_in'] }, 'the scope JSON is stored');
});

test('the workspace document is byte-unchanged by a scope write', async () => {
  // The scope route never touches the doc: its revision stayed where the
  // fixture PUT left it, and the stored doc still lists every project.
  const doc = storedDoc();
  assert.deepEqual(
    doc.data.projects.map(p => p.id),
    ['p_in', 'p_out', 'p_priv1', 'p_priv2'],
    'no project row was moved or removed',
  );
  assert.equal(doc.data.tasks.some(t => t.id === 't_out'), true, 'the stored task set is intact');
});

test("a scoped member's doc GET omits out-of-scope projects and every dependent list", async () => {
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.deepEqual(
    view.doc.data.projects.map(p => p.id),
    ['p_in'],
    'only the in-scope project survives the read',
  );
  assert.deepEqual(
    view.doc.data.tasks.map(t => t.id),
    ['t_in'],
    'out-of-scope tasks ride the same funnel',
  );
  assert.equal(view.doc.data.projOrder.includes('p_out'), false, 'projOrder is redacted too');
});

test('a scoped doc PUT cannot resurrect out-of-scope rows', async () => {
  const live = (await scoped.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_evil', project: 'p_out', title: 'Resurrected', status: 'todo', labels: [], subtasks: [] });
  doc.data.projects.push({ id: 'p_out', key: 'out', name: 'Out of Scope', private: false, members: [], teams: [] });
  const saved = await scoped.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(saved.status, 200, 'the merge is silent, not an error');

  const stored = storedDoc();
  assert.equal(stored.data.tasks.some(t => t.id === 't_evil'), false, 'the out-of-scope task never landed');
  assert.equal(stored.data.tasks.some(t => t.id === 't_out'), true, 'the reserved task is held by the merge');
});

test('a scope write to an admin or owner target is rejected (D-04)', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${ownerId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'scopeNotAllowed');
  assert.equal(scopeOf(ownerId), null, 'the admin row stays untouched');
});

test('stored scope JSON can never blind an admin (D-04, server-side predicate)', async () => {
  // Plant the scope directly — the route refuses this shape, proving the
  // defense is the projectScope() predicate itself, not just the route gate.
  withDb(server.dbPath, db =>
    db.prepare('update memberships set scope = ? where workspace_id = ? and user_id = ?').run('{"projects":["p_out"]}', server.wsId, ownerId),
  );
  const view = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(
    view.doc.data.projects.some(p => p.id === 'p_out'),
    true,
    'the owner still sees the project the planted scope would hide',
  );
  assert.equal(
    view.doc.data.projects.some(p => p.id === 'p_priv1'),
    true,
    'the owner still sees private projects',
  );
  withDb(server.dbPath, db => db.prepare('update memberships set scope = null where workspace_id = ? and user_id = ?').run(server.wsId, ownerId));
});

test('non-array teams and projects are refused with the shape errors', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: 'x', projects: [] } })).status, 400, 'teamsRequired');
  assert.equal(
    (await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: [], projects: 'p_in' } })).status,
    400,
    'projectsRequired',
  );
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: 'p_in' })).status, 400, 'scopeRequired');
  assert.equal((await owner.put('/api/workspaces/acme/members/not-a-user/scope', { scope: null })).status, 404, 'notAMember');
  // The refused writes stored nothing.
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: [], projects: ['p_in'] });
});

test('an explicit null scope restores workspace-wide reach', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null });
  assert.equal(res.status, 200);
  assert.equal(scopeOf(scopedUserId), null, 'null is stored, not an empty JSON object');
  const view = (await scoped.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_out'), true, 'the member sees the whole workspace again');
});

test('a member cannot edit scopes at all', async () => {
  const res = await scoped.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_out'], teams: [] } });
  assert.equal(res.status, 403, 'requireWorkspace(admin) gates the route');
});

/* ---- Phase 29 task 2: full validation — whitelists, caps, D-04 promotion ---- */

test('scope ids are whitelisted against the workspace document (T-29-01)', async () => {
  // Known baseline, so "nothing stored" below is provable.
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: ['team_a'], projects: ['p_in'] } })).status, 200);

  const ghostTeam = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: ['ghost-team'], projects: ['p_in'] } });
  assert.equal(ghostTeam.status, 400);
  assert.equal(ghostTeam.data.code, 'unknownTeam');

  const ghostProject = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { teams: ['team_a'], projects: ['ghost-project'] } });
  assert.equal(ghostProject.status, 400);
  assert.equal(ghostProject.data.code, 'unknownProject');

  // The refused writes stored nothing.
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] });
});

test('scope caps mirror the teams cap (25 per list)', async () => {
  const tooManyProjects = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: [], projects: Array.from({ length: 26 }, (_, i) => `p_${i}`) },
  });
  assert.equal(tooManyProjects.status, 400);
  assert.equal(tooManyProjects.data.code, 'tooManyProjects');

  const tooManyTeams = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: Array.from({ length: 26 }, (_, i) => `t_${i}`), projects: [] },
  });
  assert.equal(tooManyTeams.status, 400);
  assert.equal(tooManyTeams.data.code, 'tooManyTeams');
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] }, 'still nothing stored');
});

test('scope lists are trimmed, sliced and deduped like the teams route', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: [' team_a ', 'team_a', 'x'.repeat(60)], projects: [' p_in ', 'p_in'] },
  });
  assert.equal(res.status, 400, "a 60-char team id slices to 40 and misses the whitelist");
  const trimmed = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {
    scope: { teams: [' team_a ', 'team_a'], projects: [' p_in ', 'p_in'] },
  });
  assert.equal(trimmed.status, 200);
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] }, 'trimmed and deduped before the whitelist');
});

test('the route is scope-explicit: an absent scope field is a 400', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, {});
  assert.equal(res.status, 400);
  assert.equal(res.data.code, 'scopeRequired');
});

test('promoting a scoped member to admin clears the scope in the same transaction (D-04)', async () => {
  assert.deepEqual(JSON.parse(scopeOf(scopedUserId)), { teams: ['team_a'], projects: ['p_in'] }, 'precondition: a scope is stored');

  const promoted = await owner.patch(`/api/workspaces/acme/members/${scopedUserId}`, { role: 'admin' });
  assert.equal(promoted.status, 200);
  assert.equal(scopeOf(scopedUserId), null, 'promotion nulled the scope transactionally');

  // And the now-admin target can carry no scope either way (D-04).
  const rescope = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(rescope.status, 400);
  assert.equal(rescope.data.code, 'scopeNotAllowed');

  const demoted = await owner.patch(`/api/workspaces/acme/members/${scopedUserId}`, { role: 'member' });
  assert.equal(demoted.status, 200, 'back to member for the suite');
});

/* ---- Phase 29 Plan 02 task 1: the D-03 grant truth table ----

   For a scoped member, the scope OPENS projects inside its reach — the grant
   terms short-circuit the private check (D-03), and a team scope reaches the
   scoped teams' projects including private team-linked ones (A1 union read).
   Workspace-wide (null scope) members keep the pre-phase canSeeProject path. */

let scopedMemberId;

test('truth-table fixture: the scoped member joins a private project access list', async () => {
  scopedMemberId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'scoped@test.local').memberId;
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.projects.find(p => p.id === 'p_priv1').members.push(scopedMemberId);
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
});

const truthTable = [
  { name: 'public + in-scope', scope: { projects: ['p_in'], teams: [] }, expected: ['p_in'] },
  { name: 'public + out-of-scope', scope: { projects: ['p_out'], teams: [] }, expected: ['p_out'] },
  {
    name: 'private + in-scope + on the access list',
    scope: { projects: ['p_priv1'], teams: [] },
    expected: ['p_priv1'],
  },
  {
    name: 'private + in-scope + OFF the access list (D-03 grant, guest-critical)',
    scope: { projects: ['p_priv2'], teams: [] },
    expected: ['p_priv2'],
  },
  {
    name: 'private + out-of-scope + on the access list (out-of-scope still wins)',
    scope: { projects: ['p_in'], teams: [] },
    expected: ['p_in'],
  },
  {
    name: 'team scope covering a private team-linked project (A1 union read)',
    scope: { projects: [], teams: ['team_a'] },
    expected: ['p_priv2'],
  },
];

for (const cell of truthTable) {
  test(`D-03 truth table: ${cell.name} → [${cell.expected.join(', ')}]`, async () => {
    const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: cell.scope });
    assert.equal(res.status, 200, 'the scope lands');
    const view = (await scoped.get('/api/workspaces/acme')).data;
    assert.deepEqual(
      view.doc.data.projects.map(p => p.id),
      cell.expected,
      `${cell.name}: visibility must be exactly the expected set`,
    );
  });
}

test('null-scope membership keeps the pre-phase workspace-wide view (regression)', async () => {
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
  const view = (await scoped.get('/api/workspaces/acme')).data;
  // Pre-phase semantics: everything except private projects the member is not
  // on the access list of. The fixture put them on p_priv1's list only.
  assert.deepEqual(view.doc.data.projects.map(p => p.id), ['p_in', 'p_out', 'p_priv1']);
});

/* ---- Phase 29 Plan 02 task 2: the file-serve side door ----

   File binaries ride /w/:slug/file/:id OUTSIDE the doc funnel, so the
   record.project visibility check has to happen in serveFileBinary itself
   (T-29-05) — unknown, foreign and out-of-scope ids must answer the same
   byte-identical 404 fileNotFound (no existence oracle). */

/* Plant a file record (metadata rides the doc channel) and its binary. */
async function plantScopedFile(id, projectId) {
  const bytes = Buffer.from(`${id}:${projectId}:gr8r-scope-matrix`, 'utf8');
  fs.writeFileSync(path.join(server.dataDir, 'files', id), bytes);
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.files = Array.isArray(doc.data.files) ? doc.data.files : [];
  doc.data.files.push({ id, name: `${id}.txt`, size: bytes.length, type: 'txt', project: projectId });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 200, `plant ${id} on ${projectId}`);
  return bytes;
}

/* The harness client is JSON-only; file GETs are plain fetch with the cookie. */
const fileGet = (cl, id) => fetch(`${server.base}/w/acme/file/${id}`, { headers: { cookie: cl.cookie() } });

test('file-serve fixture: records planted on in-scope, out-of-scope and private projects', async () => {
  await plantScopedFile('f_in', 'p_in');
  await plantScopedFile('f_out', 'p_out');
  await plantScopedFile('f_priv1', 'p_priv1');
  await plantScopedFile('f_priv2', 'p_priv2');
});

test('a scoped member downloads an in-scope file (200 with the exact bytes)', async () => {
  assert.equal(
    (await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } })).status,
    200,
  );
  const res = await fileGet(scoped, 'f_in');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'f_in:p_in:gr8r-scope-matrix');
});

test('an out-of-scope file answers the byte-identical unknown-id 404 (no oracle)', async () => {
  const out = await fileGet(scoped, 'f_out');
  const unknown = await fileGet(scoped, 'f_missing');
  assert.equal(out.status, 404);
  assert.equal(unknown.status, 404);
  const outBody = await out.json();
  const unknownBody = await unknown.json();
  assert.equal(outBody.code, 'fileNotFound');
  assert.equal(unknownBody.code, 'fileNotFound');
  assert.equal(outBody.error, unknownBody.error, 'status AND code AND message are identical');
});

test('an in-scope private project file is visible to the scoped member (D-03 rides the side door too)', async () => {
  // scope = { projects: ['p_in'] } from the previous cell: p_priv1 is
  // out-of-scope here, so flip to the grant scope first.
  assert.equal(
    (await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: { projects: ['p_priv1'], teams: [] } })).status,
    200,
  );
  const res = await fileGet(scoped, 'f_priv1');
  assert.equal(res.status, 200, 'the grant opens the private project and its files');
  assert.equal(await res.text(), 'f_priv1:p_priv1:gr8r-scope-matrix');
});

test('a workspace-wide outsider hits the closed gap: private-project file now 404s (pre-existing hole)', async () => {
  // Restore the pre-phase reach: null scope. The member is on p_priv1's
  // access list, so use p_priv2 (private, off-list) — previously this served
  // bytes to ANY member with the id.
  assert.equal((await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: null })).status, 200);
  const res = await fileGet(scoped, 'f_priv2');
  assert.equal(res.status, 404);
  assert.equal((await res.json()).code, 'fileNotFound');
});

/* ---- Phase 29 Plan 02 task 3: the named 404-matrix (SCOPE-03) ----

   Table-driven sweep: family → probe (in-scope id / out-of-scope known id /
   unknown id) → expected outcome, all driven by one fixture member holding
   scope { projects: ['p_in'], teams: [] }. Unknown ≡ out-of-scope must be
   byte-identical wherever a status exists (no existence oracle, T-29-06).

   Checked, NOT affected (no probe needed):
   - family 3 (file upload): metadata rides the doc channel — family 2's
     write guard covers what a caller can attach;
   - family 7 (members roster): D-05 keeps it unfiltered; scope edits are
     admin-gated authority writes;
   - family 8 (workspace meta): D-08 untouched — no project surface.

   Families 5–7 below are placeholder rows covered by Plans 03/04; a new
   project-touching family added later must visibly extend this table. */

const MATRIX = [
  {
    family: 1,
    name: 'doc GET omission (the 404-equivalent is absence from the payload)',
    kind: 'doc-get',
    expected: { inScope: 'present', outOfScope: 'absent', unknown: 'absent' },
  },
  {
    family: 2,
    name: 'doc PUT rejection/rollback (out-of-scope rows never land)',
    kind: 'doc-put',
    expected: { inScope: 'lands', outOfScope: 'reserved', unknown: null },
  },
  {
    family: 4,
    name: 'file serve (byte-identical 404 fileNotFound)',
    kind: 'file',
    expected: { inScope: 200, outOfScope: 404, unknown: 404 },
  },
  { family: 3, name: 'file upload', skip: 'covered by Plan 29-02 family 2 — metadata rides the doc channel' },
  { family: 5, name: 'reminder pass', skip: 'covered by Plan 29-03 (SCOPE-04 server-side skip)' },
  { family: 6, name: 'invites', skip: 'covered by Plan 29-04 (SCOPE-05/06 invite-carried scope)' },
  { family: 7, name: 'members', skip: 'covered by Plan 29-04 (D-05 roster unfiltered, admin-gated scope edits)' },
];

const MATRIX_SCOPE = { projects: ['p_in'], teams: [] };
const MATRIX_OUT_ID = 'p_out';
const MATRIX_UNKNOWN_ID = 'p_ghost';
const MATRIX_FILES = { inScope: 'f_in', outOfScope: 'f_out', unknown: 'f_missing' };
const MATRIX_PROJECTS = { inScope: 'p_in', outOfScope: MATRIX_OUT_ID, unknown: MATRIX_UNKNOWN_ID };

/* One helper drives every family with the same fixture member. */
const matrixProbe = {
  'doc-get': async probe => {
    const view = (await scoped.get('/api/workspaces/acme')).data;
    const present = view.doc.data.projects.some(p => p.id === MATRIX_PROJECTS[probe])
      || view.doc.data.tasks.some(t => t.project === MATRIX_PROJECTS[probe])
      || view.doc.data.files.some(f => f.project === MATRIX_PROJECTS[probe]);
    return present ? 'present' : 'absent';
  },
  'doc-put': async probe => {
    if (probe === 'unknown') return null; // dangling-project write semantics pre-date this phase; not a scope hole
    const tid = `t_matrix_${probe}`;
    const live = (await scoped.get('/api/workspaces/acme')).data;
    const doc = structuredClone(live.doc);
    doc.data.tasks.push({ id: tid, project: MATRIX_PROJECTS[probe], title: 'matrix probe', status: 'todo', labels: [], subtasks: [] });
    const saved = await scoped.put('/api/workspaces/acme', { revision: live.revision, doc });
    assert.equal(saved.status, 200, 'the merge is silent, not an error');
    const landed = storedDoc().data.tasks.some(t => t.id === tid);
    return landed ? 'lands' : 'reserved';
  },
  file: async probe => {
    const res = await fileGet(scoped, MATRIX_FILES[probe]);
    const body = res.status === 200 ? null : await res.json();
    return { status: res.status, code: body?.code ?? null, error: body?.error ?? null };
  },
};

test('404-matrix fixture: the fixture member holds scope { projects: [p_in], teams: [] }', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${scopedUserId}/scope`, { scope: MATRIX_SCOPE });
  assert.equal(res.status, 200);
});

for (const row of MATRIX) {
  if (row.skip) {
    test(`404-matrix [family ${row.family}] ${row.name}`, { skip: row.skip }, () => {});
    continue;
  }
  for (const probe of ['inScope', 'outOfScope', 'unknown']) {
    if (row.expected[probe] === null) {
      test(`404-matrix [family ${row.family}] ${row.name} — ${probe}`, { skip: 'dangling-project writes are pre-phase semantics, not a scope hole' }, () => {});
      continue;
    }
    test(`404-matrix [family ${row.family}] ${row.name} — ${probe} → ${JSON.stringify(row.expected[probe])}`, async () => {
      const got = await matrixProbe[row.kind](probe);
      if (row.kind === 'file') {
        assert.equal(got.status, row.expected[probe]);
        if (row.expected[probe] === 404) {
          assert.equal(got.code, 'fileNotFound');
          const cross = await matrixProbe.file(probe === 'unknown' ? 'outOfScope' : 'unknown');
          assert.deepEqual(got, cross, 'unknown ≡ out-of-scope: identical status, code AND message (no oracle)');
        }
      } else {
        assert.equal(got, row.expected[probe]);
      }
    });
  }
}

/* ---- Phase 29 Plan 03: SCOPE-04 — send-time notification enforcement ----

   A scoped member is never assigned, mentioned, reminded or emailed about
   content outside their scope. Three server guards (reminder pass, email
   mirror, assignee write-guard) are the AUTHORITY; the client emit filter is
   advisory (A4). The guards run on their own SMTP-enabled server instance so
   the email mirror is exercised for real (the same fakeSmtp pattern as
   test/due-reminders.test.mjs). */

const SCOPE_TOKEN = 'scope-reminder-token';
const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();

function fakeSmtp() {
  const messages = [];
  const srv = net.createServer(sock => {
    sock.on('error', () => {}); // the server under test may reset mid-teardown
    sock.write('220 test ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let current = null;
    sock.on('data', chunk => {
      buffer += chunk.toString();
      let idx;
      while ((idx = buffer.indexOf('\r\n')) !== -1) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current.join('\n'));
            current = null;
            sock.write('250 OK\r\n');
          } else if (current) {
            current.push(line.startsWith('..') ? line.slice(1) : line);
          }
        } else if (/^EHLO/i.test(line)) {
          sock.write('250-test\r\n250 OK\r\n');
        } else if (/^DATA/i.test(line)) {
          inData = true;
          current = [];
          sock.write('354 go\r\n');
        } else if (/^QUIT/i.test(line)) {
          sock.write('221 bye\r\n');
          sock.end();
        } else {
          sock.write('250 OK\r\n');
        }
      }
    });
  });
  return new Promise(resolve => {
    srv.listen(0, '127.0.0.1', () => resolve({ srv, port: srv.address().port, messages }));
  });
}

function textPart(raw) {
  const lines = raw.split('\n');
  const i = lines.indexOf('Content-Type: text/plain; charset=UTF-8');
  assert.ok(i !== -1, 'message has a text/plain part');
  const body = [];
  for (let j = i + 2; j < lines.length && !lines[j].startsWith('--'); j++) body.push(lines[j]);
  return Buffer.from(body.join(''), 'base64').toString('utf8');
}

const triggerReminders = (srv, nowIso) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': SCOPE_TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, 'reminder trigger status');
    return (await r.json()).emitted;
  });

test('SCOPE-04: the send-time server guards never reach an out-of-scope member', async t => {
  const smtp = await fakeSmtp();
  const mail = await startServer({
    env: {
      REMINDER_TEST_TOKEN: SCOPE_TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
  try {
    const signedIn = await login(mail.base, ADMIN.email, ADMIN.password);
    assert.equal(signedIn.status, 200, 'owner signs in on the mail server');
    const ownerMail = signedIn.client;

    // One member-role membership (this server spends its own invite budget).
    const [inv] = (await ownerMail.post('/api/workspaces/acme/invites', { emails: ['guard@test.local'], role: 'member' })).data.invites;
    const memberClient = (await signup(mail.base, ACCOUNT('Guard', 'guard@test.local'))).client;
    const joined = await memberClient.post(`/api/invites/${inviteToken(inv.url)}/accept`);
    assert.ok([200, 201].includes(joined.status), 'the member joined');

    const wsRow = withDb(mail.dbPath, db => db.prepare('select id from workspaces where slug = ?').get('acme'));
    const memberIds = withDb(mail.dbPath, db =>
      db
        .prepare(
          'select m.member_id, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?',
        )
        .all(wsRow.id),
    );
    const scopedMid = memberIds.find(r => r.email === 'guard@test.local').member_id;
    const ownerMid = memberIds.find(r => r.email === ADMIN.email).member_id;
    const guardUserId = (await ownerMail.get('/api/workspaces/acme/members')).data.members.find(
      m => m.email === 'guard@test.local',
    ).userId;

    // Shape the workspace: two public projects, one task per probe, all due
    // inside the same injected 09:00 window.
    const doc = {
      data: {
        members: [{ id: ownerMid, name: 'Owner' }],
        projects: [
          { id: 'p_in', key: 'in', name: 'In Scope', private: false, members: [], teams: [] },
          { id: 'p_out', key: 'out', name: 'Out of Scope', private: false, members: [], teams: [] },
        ],
        tasks: [
          { id: 't_s_in', key: 'IN-1', title: 'In-scope reminder task', status: 'todo', assignee: scopedMid, projectId: 'p_in', due: '2027-03-15', labels: [], subtasks: [] },
          { id: 't_s_out', key: 'OUT-1', title: 'Out-of-scope reminder task', status: 'todo', assignee: scopedMid, projectId: 'p_out', due: '2027-03-15', labels: [], subtasks: [] },
          { id: 't_s_admin', key: 'OUT-2', title: 'Admin reminder task', status: 'todo', assignee: ownerMid, projectId: 'p_out', due: '2027-03-15', labels: [], subtasks: [] },
        ],
        comments: [],
        activity: [],
        notifs: [],
        files: [],
        notifPrefs: {},
      },
    };
    withDb(mail.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsRow.id));

    // The member is scoped to p_in only.
    const scopedRes = await ownerMail.put(`/api/workspaces/acme/members/${guardUserId}/scope`, {
      scope: { projects: ['p_in'], teams: [] },
    });
    assert.equal(scopedRes.status, 200, 'scope lands on the mail server');

    await t.test('the reminder pass skips an out-of-scope assignee, delivers the in-scope one', async () => {
      const emitted = await triggerReminders(mail, at9('2027-03-15'));
      const reminders = emitted.filter(n => n.type === 'due_reminder');
      assert.ok(reminders.some(n => n.task === 't_s_in' && n.to === scopedMid), 'in-scope reminder delivered');
      assert.ok(!reminders.some(n => n.task === 't_s_out'), 'no reminder row for the out-of-scope task');
      assert.ok(reminders.some(n => n.task === 't_s_admin' && n.to === ownerMid), 'null-scope (admin) assignee still reminded');
    });

    await t.test('the email mirror never queues an out-of-scope reminder email', async () => {
      // The invite email may arrive first — wait for the in-scope reminder itself.
      const deadline = Date.now() + 5000;
      while (!smtp.messages.some(raw => textPart(raw).includes('In-scope reminder task')) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
      assert.ok(smtp.messages.some(raw => textPart(raw).includes('In-scope reminder task')), 'the in-scope reminder email arrived');
      assert.ok(!smtp.messages.some(raw => textPart(raw).includes('Out-of-scope reminder task')), 'no out-of-scope email');
    });

    await t.test('a doc PUT cannot assign an out-of-scope member to an out-of-scope task', async () => {
      const live = (await ownerMail.get('/api/workspaces/acme')).data;
      const next = structuredClone(live.doc);
      next.data.tasks.push({ id: 't_guard_out', key: 'OUT-3', title: 'Guard probe', status: 'todo', assignee: scopedMid, project: 'p_out', projectId: 'p_out', labels: [], subtasks: [] });
      const res = await ownerMail.put('/api/workspaces/acme', { revision: live.revision, doc: next });
      assert.equal(res.status, 400, 'the write is rejected');
      assert.equal(res.data?.code, 'assigneeOutOfScope');
      const stored = withDb(mail.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
      assert.ok(!stored.data.tasks.some(x => x.id === 't_guard_out'), 'the stored doc is unchanged');
    });

    await t.test('workspace-wide (null-scope) assignees are never rejected', async () => {
      const live = (await ownerMail.get('/api/workspaces/acme')).data;
      const next = structuredClone(live.doc);
      next.data.tasks.push({ id: 't_guard_admin', key: 'OUT-4', title: 'Admin assignee probe', status: 'todo', assignee: ownerMid, project: 'p_out', projectId: 'p_out', labels: [], subtasks: [] });
      const res = await ownerMail.put('/api/workspaces/acme', { revision: live.revision, doc: next });
      assert.equal(res.status, 200, 'a null-scope assignee lands');
      const stored = withDb(mail.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
      assert.ok(stored.data.tasks.some(x => x.id === 't_guard_admin'), 'the task is stored');
    });
  } finally {
    await mail.stop();
    smtp.srv.close();
  }
});

/* ---- Phase 29 Plan 03 task 2: the client emit pre-filter (SCOPE-04, A4) ----

   The browser modules read `document`, `navigator` and `localStorage` while
   they load, so those globals are stubbed before the store and the actions
   are imported dynamically — the same pattern as test/creator-watcher.test.mjs.
   A4: the server guards are the authority; the client filter is advisory and
   DEFAULTS TO ELIGIBLE whenever the projection cannot determine scope (D-05
   forbids projecting scope details, so a marker is the only forward-compat
   signal — never a raw scope read for UI). */

globalThis.document = {
  querySelectorAll: () => [],
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
};
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ addEventListener: () => {} }), dispatchEvent: () => {} };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ addEventListener: () => {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});

const { register } = await import('node:module');
register(new URL('./virtual-icons-loader.mjs', import.meta.url), import.meta.url);

const { applyDoc: applyClientDoc, D: CD, memberScopeEligible } = await import('../src/core/store.js');
const { createTask: clientCreateTask, emitMentions: clientEmitMentions, taskWatchers: clientTaskWatchers } = await import('../src/actions/actions.js');

function clientDoc() {
  applyClientDoc(
    {
      data: {
        me: 'm_actor',
        members: [
          { id: 'm_actor', name: 'Actor', status: 'active', role: 'Owner' },
          { id: 'm_marked', name: 'Ann Marker', status: 'active', role: 'member', scope: { projects: ['p_in'], teams: [] } },
          { id: 'm_plain', name: 'Bill Plain', status: 'active', role: 'member' },
          { id: 'm_admin', name: 'Cara Admin', status: 'active', role: 'Admin' },
        ],
        projOrder: ['p_in', 'p_out'],
        projects: [
          { id: 'p_in', key: 'IN', seq: 1, name: 'In', teams: [] },
          { id: 'p_out', key: 'OUT', seq: 2, name: 'Out', teams: [] },
        ],
        tasks: [],
        comments: [],
        notifs: [],
        activity: [],
      },
    },
    1,
  );
}

test('SCOPE-04: memberScopeEligible defaults to eligible when the projection cannot determine scope (A4)', () => {
  clientDoc();
  const plain = CD().members.find(m => m.id === 'm_plain');
  assert.equal(memberScopeEligible(plain, 'p_in'), true, 'unmarked member: eligible (default-allow)');
  assert.equal(memberScopeEligible(plain, 'p_out'), true, 'unmarked member stays eligible on any project');
  assert.equal(memberScopeEligible(null, 'p_in'), false, 'an unknown target is not eligible');
  assert.equal(memberScopeEligible(plain, null), true, 'workspace-level content: eligible');
  const admin = CD().members.find(m => m.id === 'm_admin');
  assert.equal(memberScopeEligible(admin, 'p_out'), true, 'admin/owner is workspace-wide (D-04)');
});

test('SCOPE-04: the projection-marked out-of-scope target never lands in the mention fan-out', () => {
  clientDoc();
  const marked = CD().members.find(m => m.id === 'm_marked');
  assert.equal(memberScopeEligible(marked, 'p_in'), true, 'in scope: eligible');
  assert.equal(memberScopeEligible(marked, 'p_out'), false, 'out of scope: filtered');
  const targetsOut = clientEmitMentions('@Ann Marker @Bill Plain', { id: 't1', project: 'p_out' });
  assert.ok(!targetsOut.has('m_marked'), 'out-of-scope target filtered from the emit Set');
  assert.ok(targetsOut.has('m_plain'), 'default-allow target NOT dropped (guards over-filtering)');
  const targetsIn = clientEmitMentions('@Ann Marker', { id: 't2', project: 'p_in' });
  assert.ok(targetsIn.has('m_marked'), 'the same target is eligible inside their scope');
});

test('SCOPE-04: the assign notify and the watcher set ride the same eligibility filter', () => {
  clientDoc();
  clientCreateTask({ title: 'Out of scope assign', project: 'p_out', assignee: 'm_marked' });
  assert.ok(!CD().notifs.some(n => n.to === 'm_marked' && n.type === 'assign'), 'no assign notify to an out-of-scope assignee');
  clientCreateTask({ title: 'In scope assign', project: 'p_in', assignee: 'm_marked' });
  assert.ok(CD().notifs.some(n => n.to === 'm_marked' && n.type === 'assign'), 'in-scope assignee still notified');
  const tOut = { id: 't3', project: 'p_out', assignee: 'm_plain', creator: 'm_marked' };
  const watchers = clientTaskWatchers(tOut);
  assert.ok(!watchers.includes('m_marked'), 'out-of-scope watcher filtered');
  assert.ok(watchers.includes('m_plain'), 'default-allow watcher kept');
});
