/* Phase 3 private-project isolation over HTTP: read redaction, write merge,
   access-field protection and membership edge cases. Ported from the phase 3
   standalone matrix script to node:test. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'member-password-1';
const proj = (doc, id) => (doc.data.projects || []).find(p => p.id === id);
const jsonHas = (value, needle) => JSON.stringify(value).includes(needle);

let server;
let owner;
let bob;
let cara;
let ownerId;
let bobId;
let caraId;
let bobUserId;
let caraUserId;
let bobView;
let secBefore;
let taskBefore;

/* Invite an account that already signed up, then accept while signed in. */
async function join(actor, slug, account, email, role = 'member') {
  const invited = await actor.post(`/api/workspaces/${slug}/invites`, { emails: [email], role });
  assert.equal(invited.status, 201, `invite ${email}`);
  const token = inviteToken(invited.data.invites[0].url);
  assert.equal((await account.post(`/api/invites/${token}/accept`)).status, 200, `${email} accepts`);
}

function fixture(baseDoc, ids) {
  const now = new Date().toISOString();
  const doc = structuredClone(baseDoc.doc);
  doc.data.projects = [
    {
      id: 'p_pub',
      key: 'public-launch',
      name: 'Public Launch',
      private: 'workspace',
      members: [ids.ownerId, ids.bobId, ids.caraId],
      lead: ids.ownerId,
      perms: {},
      team: 'product',
      status: 'active',
      color: 'blue',
      icon: 'folder',
      desc: '',
      start: null,
      due: null,
      last: 60,
      archived: false,
    },
    {
      id: 'p_sec',
      key: 'classified',
      name: 'Classified Nebula',
      private: true,
      members: [ids.ownerId, ids.caraId],
      lead: ids.caraId,
      perms: {},
      team: 'product',
      status: 'active',
      color: 'violet',
      icon: 'lock',
      desc: 'secret',
      start: null,
      due: null,
      last: 60,
      archived: false,
    },
    {
      id: 'p_cust',
      key: 'custodian',
      name: 'Custodian Project',
      private: true,
      members: [],
      lead: null,
      perms: {},
      team: 'product',
      status: 'active',
      color: 'slate',
      icon: 'folder',
      desc: '',
      start: null,
      due: null,
      last: 60,
      archived: false,
    },
    {
      id: 'p_ownerblind',
      key: 'owner-blind',
      name: 'Owner Blind',
      private: true,
      members: [ids.caraId],
      lead: ids.caraId,
      perms: {},
      team: 'product',
      status: 'active',
      color: 'teal',
      icon: 'folder',
      desc: '',
      start: null,
      due: null,
      last: 60,
      archived: false,
    },
    {
      id: 'p_promo',
      key: 'promotion',
      name: 'Promotion Project',
      private: true,
      members: [ids.bobId, ids.caraId, ids.ownerId],
      lead: ids.bobId,
      perms: {},
      team: 'product',
      status: 'active',
      color: 'rose',
      icon: 'folder',
      desc: '',
      start: null,
      due: null,
      last: 60,
      archived: false,
    },
    {
      id: 'p_legacy',
      key: 'legacy',
      name: 'Legacy Project',
      access: 'private',
      members: [ids.caraId],
      lead: ids.caraId,
      perms: {},
      team: 'product',
      status: 'active',
      color: 'slate',
      icon: 'folder',
      desc: '',
      start: null,
      due: null,
      last: 60,
      archived: false,
    },
  ];
  doc.data.projOrder = doc.data.projects.map(p => p.id);
  doc.data.tasks = [
    { id: 't_pub', project: 'p_pub', title: 'Public task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_sec', project: 'p_sec', title: 'Secret task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_cust', project: 'p_cust', title: 'Custodian task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_ob', project: 'p_ownerblind', title: 'Blind task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_promo', project: 'p_promo', title: 'Promotion task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_legacy', project: 'p_legacy', title: 'Legacy task', status: 'todo', labels: [], subtasks: [] },
  ];
  doc.data.comments = [
    { id: 'c_pub', task: 't_pub', text: 'public comment' },
    { id: 'c_sec', task: 't_sec', text: 'secret comment' },
    { id: 'c_evil', task: 't_sec', text: 'injected comment' },
  ];
  doc.data.files = [
    { id: 'f_pub', project: 'p_pub', task: 't_pub', name: 'public.txt' },
    { id: 'f_sec', project: 'p_sec', task: 't_sec', name: 'secret.txt' },
  ];
  doc.data.activity = [
    { id: 'a_pub', project: 'p_pub', task: 't_pub', text: 'public activity', at: now },
    { id: 'a_sec', project: 'p_sec', task: 't_sec', text: 'secret activity', at: now },
  ];
  doc.data.notifs = [
    { id: 'n_pub', project: 'p_pub', task: 't_pub', text: 'public notification' },
    { id: 'n_sec', project: 'p_sec', task: 't_sec', text: 'secret notification' },
  ];
  doc.data.events = [
    { id: 'e_pub', project: 'p_pub', name: 'Public event' },
    { id: 'e_sec', project: 'p_sec', name: 'Secret event' },
  ];
  doc.data.savedViews = [
    { id: 'sv_pub', project: 'p_pub', name: 'Public view', type: 'board', filters: [] },
    { id: 'sv_sec', project: 'p_sec', name: 'Secret view', type: 'list', filters: [] },
  ];
  doc.views = {
    'p:p_pub': { filters: [], sort: { f: 'manual', dir: 1 } },
    'p:p_sec': { filters: [], sort: { f: 'manual', dir: 1 } },
    'sv:sv_sec': { filters: [], sort: { f: 'manual', dir: 1 } },
    tasks: { filters: [{ f: 'project', v: ['p_pub', 'p_sec'] }], sort: { f: 'manual', dir: 1 } },
  };
  return doc;
}

before(async () => {
  server = await startServer();
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'owner signs in');
  owner = signedIn.client;

  const bobSignup = await signup(server.base, { name: 'Bob', email: 'bob@test.local', password: PASSWORD });
  assert.equal(bobSignup.status, 201, 'Bob signs up');
  bob = bobSignup.client;
  const caraSignup = await signup(server.base, { name: 'Cara', email: 'cara@test.local', password: PASSWORD });
  assert.equal(caraSignup.status, 201, 'Cara signs up');
  cara = caraSignup.client;
  await join(owner, 'acme', bob, 'bob@test.local');
  await join(owner, 'acme', cara, 'cara@test.local');

  const roster = (await owner.get('/api/workspaces/acme/members')).data.members;
  ownerId = roster.find(m => m.email === ADMIN.email).memberId;
  bobId = roster.find(m => m.email === 'bob@test.local').memberId;
  caraId = roster.find(m => m.email === 'cara@test.local').memberId;
  bobUserId = roster.find(m => m.email === 'bob@test.local').userId;
  caraUserId = roster.find(m => m.email === 'cara@test.local').userId;
  assert.ok(ownerId && bobId && caraId, 'all member ids resolved');

  const baseDoc = (await owner.get('/api/workspaces/acme')).data;
  const written = await owner.put('/api/workspaces/acme', { revision: baseDoc.revision, doc: fixture(baseDoc, { ownerId, bobId, caraId }) });
  assert.equal(written.status, 200, 'owner writes the fixture');
});

after(async () => {
  await server?.stop();
});

test('stored projects are normalised and hidden from accounts that are not on them', async () => {
  const ownerView = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(proj(ownerView.doc, 'p_pub').private, false, 'non-boolean private is coerced');
  assert.equal(proj(ownerView.doc, 'p_cust').lead, ownerId, 'empty private project gets a custodian lead');
  assert.equal(proj(ownerView.doc, 'p_ownerblind'), undefined, 'owner does not see a private project they are not on');
  assert.equal(proj(ownerView.doc, 'p_legacy'), undefined, 'owner does not see a legacy private project they are not on');
  secBefore = JSON.stringify(proj(ownerView.doc, 'p_sec'));
  taskBefore = JSON.stringify(ownerView.doc.data.tasks.find(t => t.id === 't_sec'));
});

test('a member never receives a private project or anything that references it', async () => {
  bobView = (await bob.get('/api/workspaces/acme')).data;
  for (const needle of ['p_sec', 't_sec', 'c_sec', 'f_sec', 'a_sec', 'n_sec', 'e_sec', 'sv_sec', 'Classified Nebula', 'Secret task']) {
    assert.equal(jsonHas(bobView.doc, needle), false, `Bob's document has no ${needle}`);
  }
  assert.equal(bobView.doc.views['p:p_sec'], undefined, 'hidden project view state removed');
  assert.equal(bobView.doc.views['sv:sv_sec'], undefined, 'hidden saved-view state removed');
  assert.deepEqual(bobView.doc.views.tasks.filters, [{ f: 'project', v: ['p_pub'] }], 'project filter values are scrubbed');
  assert.equal(proj(bobView.doc, 'p_cust'), undefined, 'custodian-only project is hidden from Bob');
  assert.equal(proj(bobView.doc, 'p_ownerblind'), undefined, 'Owner Blind is hidden from Bob');
  assert.equal(proj(bobView.doc, 'p_legacy'), undefined, 'legacy private project is hidden from Bob');
});

test('a project member receives the private project they are on', async () => {
  const view = (await cara.get('/api/workspaces/acme')).data;
  assert.ok(proj(view.doc, 'p_sec'), 'Cara sees her private project');
  assert.ok(proj(view.doc, 'p_ownerblind'), 'Cara sees the project she is on');
  assert.equal(proj(view.doc, 'p_legacy').private, true, 'legacy access=private is migrated');
  assert.equal(proj(view.doc, 'p_cust'), undefined, 'Cara does not see the custodian project');
});

test('a write cannot forge, delete or extract hidden projects', async () => {
  const live = (await bob.get('/api/workspaces/acme')).data;
  const tampered = structuredClone(live.doc);
  proj(tampered, 'p_pub').name = 'Bob renamed public';
  proj(tampered, 'p_pub').private = true;
  proj(tampered, 'p_pub').members = [];
  proj(tampered, 'p_pub').lead = null;
  proj(tampered, 'p_pub').perms = { [bobId]: 'Full access' };

  const ownerView = (await owner.get('/api/workspaces/acme')).data;
  const injected = structuredClone(proj(ownerView.doc, 'p_sec'));
  injected.name = 'Hacked Nebula';
  tampered.data.projects.push(injected);
  tampered.data.projOrder.push('p_sec');
  tampered.data.tasks.push({ id: 't_evil', project: 'p_sec', title: 'Injected' });
  tampered.data.tasks.find(t => t.id === 't_pub').project = 'p_sec';
  tampered.data.comments.push({ id: 'c_new', task: 't_sec', text: 'Injected' });
  tampered.data.files.push({ id: 'f_evil', project: 'p_pub', task: 't_evil', name: 'evil.txt' });
  tampered.data.files.find(f => f.id === 'f_pub').project = 'p_sec';
  tampered.data.events.push({ id: 'e_evil', project: 'p_sec', name: 'Injected event' });
  tampered.data.savedViews.push({ id: 'sv_evil', project: 'p_sec', name: 'Injected view', type: 'board', filters: [] });
  tampered.views['p:p_sec'] = { filters: [], sort: { f: 'manual', dir: 1 } };
  tampered.data.projects.push({
    id: 'p_inj',
    key: 'inj',
    name: 'Bob Private',
    private: true,
    members: [],
    lead: null,
    perms: {},
    team: 'product',
    status: 'active',
    color: 'slate',
    icon: 'folder',
    desc: '',
    start: null,
    due: null,
    last: 60,
    archived: false,
  });
  tampered.data.projOrder.push('p_inj');

  const written = await bob.put('/api/workspaces/acme', { revision: live.revision, doc: tampered });
  assert.equal(written.status, 200, 'Bob can write his visible document');

  const afterBob = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(proj(afterBob.doc, 'p_pub').name, 'Bob renamed public', 'visible edits persist');
  assert.equal(proj(afterBob.doc, 'p_pub').private, false, 'Bob cannot privatise a project');
  assert.equal(proj(afterBob.doc, 'p_pub').lead, ownerId, 'Bob cannot clear the lead');
  assert.equal(proj(afterBob.doc, 'p_pub').members.length, 3, 'Bob cannot empty the access list');
  assert.deepEqual(proj(afterBob.doc, 'p_pub').perms, {}, 'Bob cannot rewrite permissions');
  assert.equal(JSON.stringify(proj(afterBob.doc, 'p_sec')), secBefore, 'hidden project is restored byte for byte');
  assert.equal(JSON.stringify(afterBob.doc.data.tasks.find(t => t.id === 't_sec')), taskBefore, 'hidden task is restored byte for byte');
  assert.equal(
    afterBob.doc.data.tasks.some(t => t.id === 't_evil'),
    false,
    'task injected into a hidden project is dropped',
  );
  assert.equal(afterBob.doc.data.tasks.find(t => t.id === 't_pub').project, 'p_pub', 'moving a visible task into a hidden project is undone');
  assert.equal(afterBob.doc.data.files.find(f => f.id === 'f_pub').project, 'p_pub', 'moving a visible file into a hidden project is undone');
  assert.equal(
    afterBob.doc.data.comments.some(c => c.id === 'c_new'),
    false,
    'comment injected on a hidden task is dropped',
  );
  assert.equal(
    afterBob.doc.data.events.some(e => e.id === 'e_evil'),
    false,
    'event injected on a hidden project is dropped',
  );
  assert.equal(
    afterBob.doc.data.savedViews.some(v => v.id === 'sv_evil'),
    false,
    'saved view injected on a hidden project is dropped',
  );
  assert.equal(afterBob.doc.data.activity.filter(a => a.id === 'a_sec').length, 1, 'hidden activity is not duplicated');
  assert.ok(proj(afterBob.doc, 'p_inj'), 'Bob can create a new private project');
  assert.ok(proj(afterBob.doc, 'p_inj').members.includes(ownerId), 'new private project gets a custodian');
  assert.ok(proj(afterBob.doc, 'p_inj').private, 'new project stays private even with an empty access list');
  assert.equal(jsonHas(bobView.doc, 'p_sec'), false, 'redaction check remains valid');
});

test('a clean write keeps newest-first activity order with hidden rows restored once', async () => {
  const again = (await bob.get('/api/workspaces/acme')).data;
  const clean = structuredClone(again.doc);
  clean.data.activity.unshift({ id: 'a_new', project: 'p_pub', task: null, text: 'new activity', at: new Date().toISOString() });
  assert.equal((await bob.put('/api/workspaces/acme', { revision: again.revision, doc: clean })).status, 200, 'second Bob write accepted');

  const afterClean = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(afterClean.doc.data.activity[0].id, 'a_new', 'new activity stays newest');
  assert.equal(afterClean.doc.data.activity.filter(a => a.id === 'a_sec').length, 1, 'hidden activity still restored once');

  const bAfter = (await bob.get('/api/workspaces/acme')).data;
  assert.equal(proj(bAfter.doc, 'p_inj'), undefined, 'Bob does not see the custodian-only project after saving');
});

test('a project lead manages access and can make the project workspace-wide', async () => {
  const edit = structuredClone((await cara.get('/api/workspaces/acme')).data);
  const sec = proj(edit.doc, 'p_sec');
  if (!sec.members.includes(bobId)) sec.members.push(bobId);
  sec.name = 'Cara renamed secret';
  assert.equal((await cara.put('/api/workspaces/acme', { revision: edit.revision, doc: edit.doc })).status, 200, 'project lead writes access changes');

  const afterCara = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(proj(afterCara.doc, 'p_sec').name, 'Cara renamed secret', 'lead rename persisted');
  assert.ok(proj(afterCara.doc, 'p_sec').members.includes(bobId), 'lead added a member');

  const flip = structuredClone((await cara.get('/api/workspaces/acme')).data);
  proj(flip.doc, 'p_sec').private = false;
  assert.equal((await cara.put('/api/workspaces/acme', { revision: flip.revision, doc: flip.doc })).status, 200, 'lead switches the project to workspace-wide');
  assert.ok(proj((await bob.get('/api/workspaces/acme')).data.doc, 'p_sec'), 'Bob now sees the shared project');
});

test('the last member of a private project cannot leave or be removed', async () => {
  assert.equal((await cara.post('/api/workspaces/acme/leave')).status, 409, 'last member of a private project cannot leave');
  assert.equal((await owner.del(`/api/workspaces/acme/members/${caraUserId}`)).status, 409, 'last member of a private project cannot be removed');
});

test('removal promotes the remaining member to lead and drops the profile', async () => {
  const before = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(proj(before.doc, 'p_promo').lead, bobId, 'promotion fixture starts with Bob as lead');

  const removed = await owner.del(`/api/workspaces/acme/members/${bobUserId}`);
  assert.equal(removed.status, 200, `Bob is removed from the workspace (${removed.status}: ${removed.data?.error || ''})`);

  const caraRes = await cara.get('/api/workspaces/acme');
  assert.equal(caraRes.status, 200, `Cara can still read the workspace after Bob is removed (${caraRes.status}: ${caraRes.data?.error || ''})`);
  assert.equal(proj(caraRes.data.doc, 'p_promo').lead, caraId, 'remaining member is promoted to lead');
  assert.equal(jsonHas(caraRes.data.doc.data.members, 'bob@test.local'), false, 'Bob profile is gone');
});

test('a stored lead:null is repaired and stale revisions are rejected', async () => {
  withDb(server.dbPath, db => {
    const row = db.prepare("select id, doc from workspaces where slug = 'acme'").get();
    const stored = JSON.parse(row.doc);
    stored.data.projects.find(p => p.id === 'p_promo').lead = null;
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(stored), row.id);
  });

  const repaired = (await cara.get('/api/workspaces/acme')).data;
  assert.equal(proj(repaired.doc, 'p_promo').lead, caraId, 'lead:null is repaired to the first access member');

  const rename = structuredClone(repaired.doc);
  proj(rename, 'p_promo').name = 'Cara after repair';
  assert.equal((await cara.put('/api/workspaces/acme', { revision: repaired.revision, doc: rename })).status, 200, 'repaired lead can edit');

  const stale = (await owner.get('/api/workspaces/acme')).data;
  assert.equal((await owner.put('/api/workspaces/acme', { revision: stale.revision - 1, doc: stale.doc })).status, 409, 'stale revision is rejected');
});
