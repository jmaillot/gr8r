#!/usr/bin/env node
/* End-to-end checks for private project isolation: read redaction, write merge,
   access-field protection and membership edge cases. Spawns an isolated server. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(import.meta.dirname, '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-privacy-'));
const dbPath = path.join(dataDir, 'gr8r.db');
const owner = client('owner');
const bob = client('bob');
const cara = client('cara');

let checks = 0;
const failures = [];
function check(ok, label) {
  checks++;
  if (!ok) failures.push(label);
}
function eq(actual, expected, label) {
  check(Object.is(actual, expected), `${label} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`);
}
function jsonHas(value, needle) {
  return JSON.stringify(value).includes(needle);
}

function client(name) {
  let cookie = '';
  async function request(method, pathname, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers.getSetCookie?.() || [];
    for (const line of set) {
      const pair = line.split(';')[0];
      if (pair.startsWith('gr8r_session=')) cookie = pair;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, data, name };
  }
  return {
    name,
    get: pathname => request('GET', pathname),
    post: (pathname, body) => request('POST', pathname, body),
    put: (pathname, body) => request('PUT', pathname, body),
    del: pathname => request('DELETE', pathname),
  };
}

let base = '';
let server;
async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

async function start() {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATA_DIR: dataDir,
      ALLOW_SIGNUP: 'true',
      ADMIN_EMAIL: 'owner@test.local',
      ADMIN_PASSWORD: 'owner-password-1',
      ADMIN_NAME: 'Owner',
      WORKSPACE_NAME: 'Acme',
      WORKSPACE_SLUG: 'acme',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  server.stdout.on('data', d => (output += d));
  server.stderr.on('data', d => (output += d));
  for (let i = 0; i < 120; i++) {
    try {
      const res = await fetch(`${base}/api/config`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`server did not start\n${output}`);
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  server.kill('SIGTERM');
  await new Promise(resolve => server.once('exit', resolve));
}

const proj = (doc, id) => doc.data.projects.find(p => p.id === id);

try {
  await start();
  eq((await owner.post('/api/auth/login', { email: 'owner@test.local', password: 'owner-password-1' })).status, 200, 'owner signs in');
  for (const [c, email, name] of [
    [bob, 'bob@test.local', 'Bob'],
    [cara, 'cara@test.local', 'Cara'],
  ]) {
    eq((await c.post('/api/auth/signup', { name, email, password: 'password-1234' })).status, 201, `signup ${name}`);
  }
  const invite = await owner.post('/api/workspaces/acme/invites', { emails: ['bob@test.local', 'cara@test.local'], role: 'member' });
  eq(invite.status, 201, 'owner invites Bob and Cara');
  for (const row of invite.data.invites) {
    const token = row.url.split('/join/')[1];
    const who = row.email === 'bob@test.local' ? bob : cara;
    eq((await who.post(`/api/invites/${token}/accept`)).status, 200, `${row.email} accepts`);
  }

  const roster = (await owner.get('/api/workspaces/acme/members')).data.members;
  const ownerId = roster.find(m => m.email === 'owner@test.local').memberId;
  const bobId = roster.find(m => m.email === 'bob@test.local').memberId;
  const caraId = roster.find(m => m.email === 'cara@test.local').memberId;
  check(!!ownerId && !!bobId && !!caraId, 'all member ids resolved');

  const baseDoc = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(baseDoc.doc);
  const now = new Date().toISOString();
  doc.data.projects = [
    {
      id: 'p_pub',
      key: 'public-launch',
      name: 'Public Launch',
      private: 'workspace',
      members: [ownerId, bobId, caraId],
      lead: ownerId,
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
      members: [ownerId, caraId],
      lead: caraId,
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
      members: [caraId],
      lead: caraId,
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
      members: [bobId, caraId, ownerId],
      lead: bobId,
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
      members: [caraId],
      lead: caraId,
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
  let r = await owner.put('/api/workspaces/acme', { revision: baseDoc.revision, doc });
  eq(r.status, 200, 'owner writes the fixture');

  const ownerView = (await owner.get('/api/workspaces/acme')).data;
  eq(proj(ownerView.doc, 'p_pub').private, false, 'non-boolean private is coerced');
  eq(proj(ownerView.doc, 'p_cust').lead, ownerId, 'empty private project gets a custodian lead');
  check(proj(ownerView.doc, 'p_ownerblind') === undefined, 'owner does not see a private project they are not on');
  check(proj(ownerView.doc, 'p_legacy') === undefined, 'owner does not see a legacy private project they are not on');
  const secBefore = JSON.stringify(proj(ownerView.doc, 'p_sec'));
  const taskBefore = JSON.stringify(ownerView.doc.data.tasks.find(t => t.id === 't_sec'));

  /* ---- read redaction ---- */
  const bView = (await bob.get('/api/workspaces/acme')).data;
  for (const needle of ['p_sec', 't_sec', 'c_sec', 'f_sec', 'a_sec', 'n_sec', 'e_sec', 'sv_sec', 'Classified Nebula', 'Secret task']) {
    check(!jsonHas(bView.doc, needle), `Bob's document has no ${needle}`);
  }
  check(bView.doc.views['p:p_sec'] === undefined, 'hidden project view state removed');
  check(bView.doc.views['sv:sv_sec'] === undefined, 'hidden saved-view state removed');
  eq(JSON.stringify(bView.doc.views.tasks.filters), JSON.stringify([{ f: 'project', v: ['p_pub'] }]), 'project filter values are scrubbed');
  check(proj(bView.doc, 'p_cust') === undefined, 'custodian-only project is hidden from Bob');
  check(proj(bView.doc, 'p_ownerblind') === undefined, 'Owner Blind is hidden from Bob');
  eq(proj(bView.doc, 'p_legacy'), undefined, 'legacy private project is hidden from Bob');

  const cView = (await cara.get('/api/workspaces/acme')).data;
  check(!!proj(cView.doc, 'p_sec'), 'Cara sees her private project');
  check(!!proj(cView.doc, 'p_ownerblind'), 'Cara sees the project she is on');
  eq(proj(cView.doc, 'p_legacy').private, true, 'legacy access=private is migrated');
  check(proj(cView.doc, 'p_cust') === undefined, 'Cara does not see the custodian project');

  /* ---- write merge ---- */
  const tampered = structuredClone(bView.doc);
  proj(tampered, 'p_pub').name = 'Bob renamed public';
  proj(tampered, 'p_pub').private = true;
  proj(tampered, 'p_pub').members = [];
  proj(tampered, 'p_pub').lead = null;
  proj(tampered, 'p_pub').perms = { [bobId]: 'Full access' };
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
  r = await bob.put('/api/workspaces/acme', { revision: bView.revision, doc: tampered });
  eq(r.status, 200, 'Bob can write his visible document');

  const afterBob = (await owner.get('/api/workspaces/acme')).data;
  eq(proj(afterBob.doc, 'p_pub').name, 'Bob renamed public', 'visible edits persist');
  eq(proj(afterBob.doc, 'p_pub').private, false, 'Bob cannot privatise a project');
  eq(proj(afterBob.doc, 'p_pub').lead, ownerId, 'Bob cannot clear the lead');
  eq(proj(afterBob.doc, 'p_pub').members.length, 3, 'Bob cannot empty the access list');
  eq(JSON.stringify(proj(afterBob.doc, 'p_pub').perms), '{}', 'Bob cannot rewrite permissions');
  eq(JSON.stringify(proj(afterBob.doc, 'p_sec')), secBefore, 'hidden project is restored byte for byte');
  eq(JSON.stringify(afterBob.doc.data.tasks.find(t => t.id === 't_sec')), taskBefore, 'hidden task is restored byte for byte');
  check(!afterBob.doc.data.tasks.some(t => t.id === 't_evil'), 'task injected into a hidden project is dropped');
  eq(afterBob.doc.data.tasks.find(t => t.id === 't_pub').project, 'p_pub', 'moving a visible task into a hidden project is undone');
  eq(afterBob.doc.data.files.find(f => f.id === 'f_pub').project, 'p_pub', 'moving a visible file into a hidden project is undone');
  check(!afterBob.doc.data.comments.some(c => c.id === 'c_new'), 'comment injected on a hidden task is dropped');
  check(!afterBob.doc.data.events.some(e => e.id === 'e_evil'), 'event injected on a hidden project is dropped');
  check(!afterBob.doc.data.savedViews.some(v => v.id === 'sv_evil'), 'saved view injected on a hidden project is dropped');
  eq(afterBob.doc.data.activity.filter(a => a.id === 'a_sec').length, 1, 'hidden activity is not duplicated');
  check(!!proj(afterBob.doc, 'p_inj'), 'Bob can create a new private project');
  check(proj(afterBob.doc, 'p_inj').members.includes(ownerId), 'new private project gets a custodian');
  check(proj(afterBob.doc, 'p_inj').private, 'new project stays private even with an empty access list');
  check(!jsonHas(bView.doc, 'p_sec'), 'redaction check remains valid');

  // A clean write keeps newest-first activity order while the older hidden entry stays in place.
  const bAgain = (await bob.get('/api/workspaces/acme')).data;
  const clean = structuredClone(bAgain.doc);
  clean.data.activity.unshift({ id: 'a_new', project: 'p_pub', task: null, text: 'new activity', at: now });
  r = await bob.put('/api/workspaces/acme', { revision: bAgain.revision, doc: clean });
  eq(r.status, 200, 'second Bob write accepted');
  const afterClean = (await owner.get('/api/workspaces/acme')).data;
  eq(afterClean.doc.data.activity[0].id, 'a_new', 'new activity stays newest');
  eq(afterClean.doc.data.activity.filter(a => a.id === 'a_sec').length, 1, 'hidden activity still restored once');

  const bAfter = (await bob.get('/api/workspaces/acme')).data;
  check(proj(bAfter.doc, 'p_inj') === undefined, 'Bob does not see the custodian-only project after saving');

  /* ---- project lead can manage access ---- */
  const cEdit = structuredClone((await cara.get('/api/workspaces/acme')).data);
  const cSec = proj(cEdit.doc, 'p_sec');
  if (!cSec.members.includes(bobId)) cSec.members.push(bobId);
  cSec.name = 'Cara renamed secret';
  r = await cara.put('/api/workspaces/acme', { revision: cEdit.revision, doc: cEdit.doc });
  eq(r.status, 200, 'project lead writes access changes');
  const afterCara = (await owner.get('/api/workspaces/acme')).data;
  eq(proj(afterCara.doc, 'p_sec').name, 'Cara renamed secret', 'lead rename persisted');
  check(proj(afterCara.doc, 'p_sec').members.includes(bobId), 'lead added a member');

  const cFlip = structuredClone((await cara.get('/api/workspaces/acme')).data);
  proj(cFlip.doc, 'p_sec').private = false;
  r = await cara.put('/api/workspaces/acme', { revision: cFlip.revision, doc: cFlip.doc });
  eq(r.status, 200, 'lead switches the project to workspace-wide');
  check(!!proj((await bob.get('/api/workspaces/acme')).data.doc, 'p_sec'), 'Bob now sees the shared project');

  /* ---- removal and lead promotion ---- */
  const leaveRes = await cara.post('/api/workspaces/acme/leave');
  eq(leaveRes.status, 409, 'last member of a private project cannot leave');
  const removeCara = await owner.del(`/api/workspaces/acme/members/${roster.find(m => m.email === 'cara@test.local').userId}`);
  eq(removeCara.status, 409, 'last member of a private project cannot be removed');

  const beforeRemoval = (await owner.get('/api/workspaces/acme')).data;
  const promo = proj(beforeRemoval.doc, 'p_promo');
  eq(promo.lead, bobId, 'promotion fixture starts with Bob as lead');
  const bobUserId = roster.find(m => m.email === 'bob@test.local').userId;
  const removed = await owner.del(`/api/workspaces/acme/members/${bobUserId}`);
  eq(removed.status, 200, `Bob is removed from the workspace (${removed.status}: ${removed.data?.error || ''})`);
  const caraRes = await cara.get('/api/workspaces/acme');
  check(caraRes.status === 200, `Cara can still read the workspace after Bob is removed (${caraRes.status}: ${caraRes.data?.error || ''})`);
  const caraAfter = caraRes.data;
  eq(proj(caraAfter.doc, 'p_promo').lead, caraId, 'remaining member is promoted to lead');
  check(!jsonHas(caraAfter.doc.data.members, 'bob@test.local'), 'Bob profile is gone');

  /* ---- legacy lead:null repair and stale revision ---- */
  const db = new DatabaseSync(dbPath);
  const wsRow = db.prepare("select id, doc from workspaces where slug = 'acme'").get();
  const storedDoc = JSON.parse(wsRow.doc);
  storedDoc.data.projects.find(p => p.id === 'p_promo').lead = null;
  db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(storedDoc), wsRow.id);
  db.close();
  const repaired = (await cara.get('/api/workspaces/acme')).data;
  eq(proj(repaired.doc, 'p_promo').lead, caraId, 'lead:null is repaired to the first access member');
  const rename = structuredClone(repaired.doc);
  proj(rename, 'p_promo').name = 'Cara after repair';
  eq((await cara.put('/api/workspaces/acme', { revision: repaired.revision, doc: rename })).status, 200, 'repaired lead can edit');

  const stale = structuredClone((await owner.get('/api/workspaces/acme')).data);
  eq((await owner.put('/api/workspaces/acme', { revision: stale.revision - 1, doc: stale.doc })).status, 409, 'stale revision is rejected');

  if (failures.length) {
    console.error(`\n${failures.length} of ${checks} checks failed:`);
    for (const failure of failures) console.error(`  ✗ ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${checks}/${checks} private-project checks passed.`);
  }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await stop();
  fs.rmSync(dataDir, { recursive: true, force: true });
}
