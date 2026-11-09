/* Phase 53 (53-01, PSET-02/03): per-team permission levels stored INSIDE the
   existing p.perms map as 'team:'+teamId keys, and the server-side
   content-write gate (projectPermFor) through the doc-PUT funnel
   (mergeClientDoc — the route that mutates tasks). Pins:

     1. an admin sets p.perms['team:engA'] = 'Can view' on a project doc via
        the normal doc-PUT path — no migration, no new top-level field;
     2. a member whose ONLY access is that 'Can view' team is refused a task
        update with the keyed refusal projectPermDenied riding the 200
        response (scoped per item — never a whole-PUT 403, Pitfall 1), and
        the stored task row is unchanged;
     3. the same member with the team tier 'Can edit' succeeds;
     4. the project lead bypasses with 'Full access' even under a view-only
        team key (D-01: lead ⇒ Full access);
     5. normalizeProjects sweeps a dangling 'team:ghost' key (ghost ∉ p.teams)
        and a non-PERMS team value — fail-safe, in place.

   Expectations are stated inline (never read from production code). Fixture:
   the shared visibility fixture (fresh copy per suite run). */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createVisibilityFixtureDb, VIS_PASSWORD, VIS_WS } from './helpers/visibility-fixture.mjs';
import { client, login, startServer, withDb } from './helpers/server.mjs';

let dataDir;
let server;
let admin; // m_admin's client (admin role, lead of p_teamshare)
let member; // m_team's client (plain member, engA team_members row)

const storedDoc = () =>
  JSON.parse(
    withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(VIS_WS.id)).doc,
  );
const project = id => storedDoc().data.projects.find(p => p.id === id);
const task = id => storedDoc().data.tasks.find(t => t.id === id);

/* GET the current doc+revision as the session, apply `mutate`, PUT back. */
async function docPutAs(c, mutate) {
  const get = await c.get(`/api/workspaces/${VIS_WS.slug}`);
  assert.equal(get.status, 200);
  const doc = JSON.parse(JSON.stringify(get.data.doc));
  mutate(doc);
  return c.put(`/api/workspaces/${VIS_WS.slug}`, { revision: get.data.revision, doc });
}

/* Set (or clear) the per-team perm key on p_teamshare as the admin. */
async function setTeamPerm(value) {
  const res = await docPutAs(admin, doc => {
    const p = doc.data.projects.find(p => p.id === 'p_teamshare');
    p.perms = p.perms || {};
    if (value === null) delete p.perms['team:engA'];
    else p.perms['team:engA'] = value;
  });
  assert.equal(res.status, 200, `admin doc PUT succeeds (got ${res.status}: ${JSON.stringify(res.data)})`);
  return res;
}

/* m_team edits the title of t_teamshare (the seeded task on p_teamshare). */
async function memberEditsTask(title) {
  return docPutAs(member, doc => {
    const t = doc.data.tasks.find(t => t.id === 't_teamshare');
    assert.ok(t, 'm_team sees p_teamshare via the live engA link, so the task rides the redacted doc');
    t.title = title;
  });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-perm-'));
  createVisibilityFixtureDb(dataDir);
  server = await startServer({ dataDir });
  const a = await login(server.base, 'admin@visfix.local', VIS_PASSWORD);
  assert.equal(a.status, 200);
  admin = a.client;
  const m = await login(server.base, 'team@visfix.local', VIS_PASSWORD);
  assert.equal(m.status, 200);
  member = m.client;

  // Seed one task on p_teamshare through the admin doc channel.
  const seed = await docPutAs(admin, doc => {
    doc.data.tasks.push({ id: 't_teamshare', project: 'p_teamshare', title: 'Teamshare task', status: 'todo', subtasks: [] });
  });
  assert.equal(seed.status, 200);
  assert.ok(task('t_teamshare'), 'the seeded task is stored');
});

after(async () => {
  await server?.stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('row 1: the admin stores p.perms["team:engA"]="Can view" through the normal doc-PUT path', async () => {
  await setTeamPerm('Can view');
  const p = project('p_teamshare');
  assert.equal(p.perms['team:engA'], 'Can view', 'the team-keyed perm round-trips through mergeClientDoc');
  assert.equal(p.teams.includes('engA'), true, 'engA is a live linked team');
  assert.ok(!('teamPerms' in p), 'no top-level p.teamPerms field exists — team keys ride p.perms only');
});

test('row 2: the view-only team member is refused the task update with projectPermDenied and the stored row is unchanged', async () => {
  const before = JSON.stringify(task('t_teamshare'));
  const res = await memberEditsTask('Renamed by view-only member');
  assert.equal(res.status, 200, 'the refusal is scoped to the item — never a whole-PUT 403 (Pitfall 1)');
  const rows = res.data?.refused || [];
  const hit = rows.find(r => (r.code || r) === 'projectPermDenied');
  assert.ok(hit, `a keyed projectPermDenied refusal rides the 200 response (got: ${JSON.stringify(res.data)})`);
  assert.equal(JSON.stringify(task('t_teamshare')), before, 'the stored task row survives byte-identical');
});

test('row 3: the same member with the team tier "Can edit" succeeds', async () => {
  await setTeamPerm('Can edit');
  const res = await memberEditsTask('Renamed by Can-edit member');
  assert.equal(res.status, 200);
  assert.deepEqual(res.data?.refused || [], [], 'no refusals ride the response');
  assert.equal(task('t_teamshare').title, 'Renamed by Can-edit member', 'the edit merged');
});

test('row 4: the project lead bypasses with Full access even under a view-only team key (D-01)', async () => {
  await setTeamPerm('Can view');
  const res = await docPutAs(admin, doc => {
    const t = doc.data.tasks.find(t => t.id === 't_teamshare');
    t.title = 'Renamed by the lead';
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data?.refused || [], [], 'the lead (m_admin) is never gated by the team key');
  assert.equal(task('t_teamshare').title, 'Renamed by the lead', 'the lead edit merged');
});

test('row 5: normalizeProjects sweeps a dangling team key and a non-PERMS team value', async () => {
  // Write invalid keys straight into storage, then trigger a normalize pass via any doc read/write.
  const doc = storedDoc();
  const p = doc.data.projects.find(x => x.id === 'p_teamshare');
  p.perms['team:ghost'] = 'Can edit'; // ghost ∉ p.teams
  p.perms['team:engA'] = 'Owner only'; // not a PERMS value
  p.perms['m_plain'] = 'Can view'; // non-team key keeps member semantics
  withDb(server.dbPath, db =>
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id));
  // normalizeProjects mutates the merged doc on the PUT path — a doc read only
  // normalizes the served COPY, so persist the sweep through a doc PUT.
  const put = await docPutAs(admin, () => {});
  assert.equal(put.status, 200);
  const swept = storedDoc().data.projects.find(p => p.id === 'p_teamshare').perms;
  assert.ok(!('team:ghost' in swept), 'the dangling team key is deleted');
  assert.ok(!('team:engA' in swept), 'the non-PERMS team value is deleted');
  assert.equal(swept['m_plain'], 'Can view', 'non-team keys keep their member semantics');
});

test('row 6: a view-only team member is refused a comment create (≥ Can comment required) — no comment merges', async () => {
  await setTeamPerm('Can view');
  const before = (storedDoc().data.comments || []).length;
  const res = await docPutAs(member, doc => {
    doc.data.comments.push({ id: 'c_viewonly', task: 't_teamshare', text: 'Comment by view-only member', by: 'm_team', at: 1 });
  });
  assert.equal(res.status, 200);
  const codes = (res.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectPermDenied'), `the comment create is refused (got: ${JSON.stringify(res.data)})`);
  assert.equal((storedDoc().data.comments || []).length, before, 'no comment merged');
});

test('row 7: a Can-edit team member comments and attaches a file record; a view-only member is refused a file edit', async () => {
  await setTeamPerm('Can edit');
  const ok = await docPutAs(member, doc => {
    doc.data.comments.push({ id: 'c_canedit', task: 't_teamshare', text: 'Comment by Can-edit member', by: 'm_team', at: 2 });
    doc.data.files.push({ id: 'f_canedit', project: 'p_teamshare', task: 't_teamshare', name: 'a.txt', size: 3, mime: 'text/plain', by: 'm_team', at: 2 });
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.data?.refused || [], [], 'comment + file record merge at the Can-edit tier');
  assert.ok(storedDoc().data.comments.some(c => c.id === 'c_canedit'));
  assert.ok(storedDoc().data.files.some(f => f.id === 'f_canedit'));

  await setTeamPerm('Can view');
  const denied = await docPutAs(member, doc => {
    const f = doc.data.files.find(f => f.id === 'f_canedit');
    f.name = 'renamed.txt'; // file metadata edit below the edit tier
  });
  assert.equal(denied.status, 200);
  const codes = (denied.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectPermDenied'), `the file-record edit is refused (got: ${JSON.stringify(denied.data)})`);
  assert.equal(storedDoc().data.files.find(f => f.id === 'f_canedit').name, 'a.txt', 'the stored file record survives byte-identical');
});

test('row 8 (T-53-01 pin property): a non-manager PUT whose payload omits p.perms entirely leaves stored team keys untouched', async () => {
  await setTeamPerm('Can edit');
  const before = JSON.stringify(project('p_teamshare').perms);
  const res = await docPutAs(member, doc => {
    const p = doc.data.projects.find(p => p.id === 'p_teamshare');
    delete p.perms; // the stale client omits the map entirely
    const t = doc.data.tasks.find(t => t.id === 't_teamshare');
    t.title = 'Unrelated task edit while omitting perms';
  });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data?.refused || [], [], 'the task edit itself is allowed at the Can-edit tier');
  assert.equal(JSON.stringify(project('p_teamshare').perms), before, 'p.perms is pinned wholesale by the non-manager PUT');
});

test('row 9 (T-53-01 pin property): a stale team key in a non-manager PUT cannot downgrade the stored value', async () => {
  const res = await docPutAs(member, doc => {
    const p = doc.data.projects.find(p => p.id === 'p_teamshare');
    p.perms['team:engA'] = 'Can view'; // stale client copy — the stored value is 'Can edit'
  });
  assert.equal(res.status, 200);
  assert.equal(project('p_teamshare').perms['team:engA'], 'Can edit', 'the stored team perm is byte-identical after mergeClientDoc');
});

/* -------------------- rows 10-14 (53-02, INVT-03 / T-53-05) --------------------
   Guest = exactly one project (D-50-11 re-derived) on every write path:
   the invite create route (admin/owner path — previously UNGUARDED), the
   accept path, and the project-membership edit routes. The MCP ceiling
   (row 14b/T-53-06) pins that no MCP tool can mint invites. */

const GUEST_EMAIL = 'freshguest@visfix.local';
const GUEST_PASSWORD = 'guest-password-1';
let guestInviteUrl = null;

test('row 10: an ADMIN guest invite with zero projects is refused with a keyed refusal (T-53-05, unguarded path)', async () => {
  const res = await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, {
    emails: [`zero-${GUEST_EMAIL}`],
    role: 'viewer',
    teams: [],
    scope: { projects: [], teams: [] },
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
  assert.equal(res.data?.code, 'inviteGuestProjectRequired', 'the zero-project guest refusal is keyed');
});

test('row 11: an ADMIN guest invite with two projects is refused (inviteGuestProjectSingle)', async () => {
  const res = await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, {
    emails: [`two-${GUEST_EMAIL}`],
    role: 'viewer',
    teams: [],
    scope: { projects: ['p_membershare', 'p_teamshare'], teams: [] },
  });
  assert.equal(res.status, 400, `expected 400, got ${res.status}: ${JSON.stringify(res.data)}`);
  assert.equal(res.data?.code, 'inviteGuestProjectSingle', 'the two-project guest refusal is keyed');
});

test('row 12: an ADMIN guest invite with exactly one project is accepted and stored with that project', async () => {
  const res = await admin.post(`/api/workspaces/${VIS_WS.slug}/invites`, {
    emails: [GUEST_EMAIL],
    role: 'viewer',
    teams: [],
    scope: { projects: ['p_membershare'], teams: [] },
  });
  assert.equal(res.status, 201, `expected 201, got ${res.status}: ${JSON.stringify(res.data)}`);
  const row = (res.data?.invites || [])[0];
  assert.equal(row?.project, 'p_membershare', 'the stored invite carries the single guest project');
  assert.equal(row?.role, 'viewer');
  guestInviteUrl = row?.url || null;
  assert.ok(guestInviteUrl, 'the invite response carries the join link');
});

test('row 13: accepting the well-formed guest invite creates the membership scoped to the one project', async () => {
  assert.ok(guestInviteUrl, 'row 12 must have produced a link');
  // The accept path re-derives the per-project allowInviteGuests toggle from
  // the CURRENT doc (D-50-8) — flip it on for p_membershare as the admin first.
  const flip = await admin.patch(`/api/workspaces/${VIS_WS.slug}/projects/p_membershare`, { allowInviteGuests: true });
  assert.equal(flip.status, 200, `toggle flipped (got ${flip.status}: ${JSON.stringify(flip.data)})`);
  const token = guestInviteUrl.slice(guestInviteUrl.lastIndexOf('/join/') + '/join/'.length);
  const fresh = client(server.base, 'freshguest');
  const res = await fresh.post(`/api/invites/${token}/accept`, { name: 'Fay FreshGuest', email: GUEST_EMAIL, password: GUEST_PASSWORD });
  assert.ok([200, 201].includes(res.status), `accept succeeded (got ${res.status}: ${JSON.stringify(res.data)})`);
  const doc = storedDoc();
  const guestProfile = doc.data.members.find(m => (m.email || '').toLowerCase() === GUEST_EMAIL);
  assert.ok(guestProfile, 'the accepted guest has a doc member profile');
  assert.equal(guestProfile.role, 'Guest', 'the guest role rides the invite row');
  const scoped = doc.data.projects.filter(p => Array.isArray(p.members) && p.members.includes(guestProfile.id));
  assert.deepEqual(
    scoped.map(p => p.id),
    ['p_membershare'],
    'the guest is scoped to exactly the one invited project',
  );
});

test('row 14: the membership edit surface can never drive a guest to zero projects or to two (D-50-11)', async () => {
  const doc = storedDoc();
  const guestProfile = doc.data.members.find(m => (m.email || '').toLowerCase() === GUEST_EMAIL);
  assert.ok(guestProfile, 'the fresh guest from row 13 exists');
  // (a) granting a SECOND project is refused
  const add = await admin.post(`/api/workspaces/${VIS_WS.slug}/projects/p_open/members`, { userId: guestProfile.userId });
  assert.equal(add.status, 400, `second-project grant refused (got ${add.status}: ${JSON.stringify(add.data)})`);
  assert.equal(add.data?.code, 'inviteGuestProjectSingle', 'the second-project refusal is keyed');
  // (b) removing the guest from their ONLY project is refused
  const del = await admin.del(`/api/workspaces/${VIS_WS.slug}/projects/p_membershare/members/${guestProfile.userId}`);
  assert.equal(del.status, 400, `zero-project removal refused (got ${del.status}: ${JSON.stringify(del.data)})`);
  assert.equal(del.data?.code, 'inviteGuestProjectRequired', 'the zero-project refusal is keyed');
  // (c) no silent clamping happened: the guest still holds exactly the one project
  const after = storedDoc();
  const id = guestProfile.id;
  const stillScoped = after.data.projects.filter(p => Array.isArray(p.members) && p.members.includes(id));
  assert.deepEqual(stillScoped.map(p => p.id), ['p_membershare'], 'no clamp, no downgrade — the scope is untouched');
});

/* -------------------- rows 16-18 (CR-01 regression, 2026-11-09) --------------------
   The content-write gate keys on the STORED row's project ("stored parent
   wins" — the comment-gate rule), never on the incoming row's. Both bypass
   vectors from the review are pinned: (a) stripping the project binding must
   not skip the gate; (b) re-pointing the project at one the actor can edit
   must not launder a write out of the view-only project. Fail closed: an
   unresolvable id is refused, never merged past the gate. */

test('row 16 (CR-01 vector a): a view-only member cannot bypass the task gate by omitting the project binding', async () => {
  await setTeamPerm('Can view');
  const before = JSON.stringify(task('t_teamshare'));
  const res = await docPutAs(member, doc => {
    const t = doc.data.tasks.find(t => t.id === 't_teamshare');
    delete t.project; // the crafted payload strips the binding the gate used to key on
    t.title = 'Rewritten with binding stripped';
  });
  assert.equal(res.status, 200, 'the refusal rides the 200 (Pitfall 1)');
  const codes = (res.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectPermDenied'), `the binding-stripped PUT is refused (got: ${JSON.stringify(res.data)})`);
  assert.equal(JSON.stringify(task('t_teamshare')), before, 'the stored task survives byte-identical');
  assert.equal(task('t_teamshare').project, 'p_teamshare', 'the project binding was never stripped from storage');
});

test('row 17 (CR-01 vector b): re-pointing a view-only task at an editable project is refused (source-project check)', async () => {
  const before = JSON.stringify(task('t_teamshare'));
  const res = await docPutAs(member, doc => {
    const t = doc.data.tasks.find(t => t.id === 't_teamshare');
    t.project = 'p_teamboth'; // m_team sits on this access list → defaults to Can edit
    t.title = 'Moved out of the view-only project';
  });
  assert.equal(res.status, 200);
  const codes = (res.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectPermDenied'), `the re-point is refused (got: ${JSON.stringify(res.data)})`);
  assert.equal(JSON.stringify(task('t_teamshare')), before, 'the source project content survives byte-identical');
  assert.equal(task('t_teamshare').project, 'p_teamshare', 'the task never moved');
});

test('row 18 (CR-01, files): the same stored-wins rule refuses a re-pointed file record below the edit tier', async () => {
  const before = JSON.stringify(storedDoc().data.files.find(f => f.id === 'f_canedit'));
  const res = await docPutAs(member, doc => {
    const f = doc.data.files.find(f => f.id === 'f_canedit');
    f.project = 'p_teamboth'; // destination is editable — the gate must still key on the stored project
    f.name = 'laundered.txt';
  });
  assert.equal(res.status, 200);
  const codes = (res.data?.refused || []).map(r => r.code || r);
  assert.ok(codes.includes('projectPermDenied'), `the file re-point is refused (got: ${JSON.stringify(res.data)})`);
  assert.equal(JSON.stringify(storedDoc().data.files.find(f => f.id === 'f_canedit')), before, 'the stored file record survives byte-identical');
});

test('row 15 (T-53-06 MCP ceiling): the MCP server exposes exactly three tools and none of them creates invites', async () => {
  const fs2 = await import('node:fs');
  const src = fs2.readFileSync(new URL('../mcp.js', import.meta.url), 'utf8');
  const names = [...src.matchAll(/name: '([a-z-]+)'/g)].map(m => m[1]);
  const toolNames = names.filter(n => ['daily-standup', 'triage-backlog', 'prepare-review'].includes(n));
  assert.deepEqual(
    [...new Set(toolNames)].sort(),
    ['daily-standup', 'prepare-review', 'triage-backlog'],
    'the MCP tool list is exactly the three read-only tools',
  );
  assert.ok(!names.some(n => /invite/.test(n)), 'no MCP tool name mentions invites — no MCP path can mint one');
});

