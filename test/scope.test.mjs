/* Phase 49 (49-03) — the collapsed visibility model, proven end-to-end over
   HTTP on its own isolated server. The Phase 29 membership scope substrate
   and the Phase 32 team term are both retired (D-49-1..5): visibility is the
   boolean `private` flag ∨ the project access list, admins/owners see all.
   The scope columns stay on disk only as sweep input — this suite pins:

   - the retired surfaces answer 404 / carry NULL (route, invite payload);
   - the collapsed funnel gates doc GET, doc PUT resurrection, files,
     reminders and the email mirror through ONE predicate;
   - the assignee write-guard rejects an assignee who cannot read the task
     project (D-49-3, 'Assignee cannot read the task project');
   - team-derived access is gone: a team roster entry no longer opens a
     private team-linked project. */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { after, before, test } from 'node:test';
import { ADMIN, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'scope-password-1';
const ACCOUNT = (name, email) => ({ name, email, password: PASSWORD });
/* Test token for the internal reminder-pass route. */
const SCOPE_TOKEN = 'scope-reminder-token';

let server;
let owner;
let member;
let memberUserId;
let ownerId;
let scopedInviteUrl; // captured from the POST response — GET /invites projects no url

const storedDoc = () => JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where slug = ?').get('acme').doc));
const scopeOf = userId =>
  withDb(server.dbPath, db => db.prepare('select scope from memberships where workspace_id = ? and user_id = ?').get(server.wsId, userId).scope);
const fileGet = (cl, id) => fetch(`${server.base}/w/acme/file/${id}`, { headers: { cookie: cl.cookie() } });

before(async () => {
  // REMINDER_TEST_TOKEN enables the test-only reminder-pass route — the
  // send-time gating block drives it.
  server = await startServer({ env: { REMINDER_TEST_TOKEN: SCOPE_TOKEN } });
  const signedIn = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(signedIn.status, 200, 'bootstrap owner signs in');
  owner = signedIn.client;

  // Shape the workspace: 2 public + 2 private projects (one private project
  // carries a legacy teams:[X] marker to pin the team-term retirement), 2
  // team definitions, one task in each public project.
  const live = (await owner.get('/api/workspaces/acme')).data;
  server.wsId = live.id;
  const ownerRow = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === ADMIN.email);
  ownerId = ownerRow.userId;
  const doc = structuredClone(live.doc);
  doc.data.projects = [
    { id: 'p_in', key: 'in', name: 'In Scope', private: false, members: [], teams: [] },
    { id: 'p_out', key: 'out', name: 'Public Two', private: false, members: [], teams: [] },
    { id: 'p_priv1', key: 'prv1', name: 'Private One', private: true, members: [ownerRow.memberId], lead: ownerRow.memberId, teams: [] },
    { id: 'p_teamX', key: 'prv2', name: 'Team Marked Private', private: true, members: [ownerRow.memberId], lead: ownerRow.memberId, teams: ['team_a'] },
  ];
  doc.data.projOrder = ['p_in', 'p_out', 'p_priv1', 'p_teamX'];
  doc.data.teams = [
    { id: 'team_a', name: 'Alpha', members: [] },
    { id: 'team_b', name: 'Beta', members: [] },
  ];
  doc.data.tasks = [
    { id: 't_in', project: 'p_in', title: 'Visible task', status: 'todo', labels: [], subtasks: [] },
    { id: 't_out', project: 'p_out', title: 'Second public task', status: 'todo', labels: [], subtasks: [] },
  ];
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  // One member-role membership, joined via invite (1 of 5 accept budget).
  const [inv] = (await owner.post('/api/workspaces/acme/invites', { emails: ['member@test.local'], role: 'member' })).data.invites;
  member = (await signup(server.base, ACCOUNT('Member', 'member@test.local'))).client;
  const joined = await member.post(`/api/invites/${inviteToken(inv.url)}/accept`);
  assert.ok([200, 201].includes(joined.status), 'the member joined');
  memberUserId = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'member@test.local').userId;
});

after(async () => {
  await server?.stop();
});

/* ------------------------- retired scope substrate ------------------------- */

test('the scope columns still exist on memberships and invites (sweep input)', () => {
  const cols = withDb(server.dbPath, db =>
    db.prepare("select name from pragma_table_info('memberships') where name = 'scope'").all().length +
    db.prepare("select name from pragma_table_info('invites') where name = 'scope'").all().length,
  );
  assert.equal(cols, 2, 'both scope columns survive as legacy sweep input');
});

test('the member scope PUT route is retired and answers 404', async () => {
  const res = await owner.put(`/api/workspaces/acme/members/${memberUserId}/scope`, { scope: { projects: ['p_in'], teams: [] } });
  assert.equal(res.status, 404, 'the route is gone');
});

test('an invite POST carrying a scope field is accepted but the scope is ignored', async () => {
  const res = await owner.post('/api/workspaces/acme/invites', {
    emails: ['scoped-invite@test.local'],
    role: 'member',
    scope: { projects: ['p_in'], teams: [] },
  });
  assert.equal(res.status, 201, 'the invite is created');
  const [row] = res.data.invites;
  assert.equal(row.scope ?? null, null, 'the payload projects scope: null (D-49-5)');
  scopedInviteUrl = row.url;
  const stored = withDb(server.dbPath, db =>
    db.prepare('select scope from invites where token_hash = ?').get(createHash('sha256').update(inviteToken(row.url)).digest('hex')),
  );
  assert.equal(stored.scope, null, 'the invites row stores a NULL scope');
});

test('acceptance lands a NULL membership scope (no silent grant)', async () => {
  // One more accept from the per-server budget — the scoped-invite above.
  assert.ok(scopedInviteUrl, 'precondition: the scoped invite url was captured at creation');
  const client = (await signup(server.base, ACCOUNT('Scoped Inv', 'scoped-invite@test.local'))).client;
  const joined = await client.post(`/api/invites/${inviteToken(scopedInviteUrl)}/accept`);
  assert.ok([200, 201].includes(joined.status), `the invite accepted (status ${joined.status}: ${JSON.stringify(joined.data)})`);
  const uid = (await owner.get('/api/workspaces/acme/members')).data.members.find(m => m.email === 'scoped-invite@test.local').userId;
  assert.equal(scopeOf(uid), null, 'memberships.scope is NULL after acceptance');
});

/* ------------------------- the collapsed read funnel ------------------------- */

test('a plain member\u2019s doc GET omits private projects they are not on and every dependent row', async () => {
  const view = (await member.get('/api/workspaces/acme')).data;
  const ids = view.doc.data.projects.map(p => p.id);
  assert.equal(ids.includes('p_in'), true, 'public project served');
  assert.equal(ids.includes('p_out'), true, 'second public project served');
  assert.equal(ids.includes('p_priv1'), false, 'private project hidden');
  assert.equal(ids.includes('p_teamX'), false, 'team-marked private project hidden — the team term is retired (D-49-2)');
  for (const needle of ['p_priv1', 'p_teamX', 'Private One', 'Team Marked Private']) {
    assert.equal(JSON.stringify(view.doc).includes(needle), false, `no trace of ${needle}`);
  }
});

test('a member on the access list reads the private project; the owner (admin) sees everything', async () => {
  const ownerView = (await owner.get('/api/workspaces/acme')).data;
  assert.equal(ownerView.doc.data.projects.some(p => p.id === 'p_priv1'), true, 'admin bypass survives (D-49-1)');

  // Add the member to p_priv1's access list via the roster route.
  const roster = (await owner.get('/api/workspaces/acme/members')).data.members;
  const memberMid = roster.find(m => m.email === 'member@test.local').memberId;
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  const p = doc.data.projects.find(p => p.id === 'p_priv1');
  p.members.push(memberMid);
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);
  const view = (await member.get('/api/workspaces/acme')).data;
  assert.equal(view.doc.data.projects.some(p => p.id === 'p_priv1'), true, 'access-list membership opens the private project');
});

test('a stale doc PUT cannot resurrect a hidden row', async () => {
  // Re-hide p_priv1 from the member first.
  const roster = (await owner.get('/api/workspaces/acme/members')).data.members;
  const memberMid = roster.find(m => m.email === 'member@test.local').memberId;
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  const p = doc.data.projects.find(p => p.id === 'p_priv1');
  p.members = p.members.filter(id => id !== memberMid);
  assert.equal((await owner.put('/api/workspaces/acme', { revision: live.revision, doc })).status, 200);

  // The member's stale view still carries p_priv1; the merge reserves it.
  const stale = structuredClone((await member.get('/api/workspaces/acme')).data.doc);
  assert.equal(stale.data.projects.some(p => p.id === 'p_priv1'), false, 'precondition: the member no longer sees p_priv1');
  stale.data.projects.push({ id: 'p_priv1', key: 'prv1', name: 'Resurrected', private: true, members: [], teams: [] });
  const saved = await member.put('/api/workspaces/acme', { revision: 999999, doc: stale });
  assert.notEqual(saved.status, 200, 'a stale revision is rejected outright');
});

test('the assignee write-guard rejects an assignee who cannot read the task project (D-49-3)', async () => {
  const roster = (await owner.get('/api/workspaces/acme/members')).data.members;
  const memberMid = roster.find(m => m.email === 'member@test.local').memberId;
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  doc.data.tasks.push({ id: 't_guard', key: 'GRD-1', title: 'Guard probe', status: 'todo', assignee: memberMid, project: 'p_priv1', labels: [], subtasks: [] });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 400, 'the write is rejected');
  assert.equal(res.data?.code, 'assigneeOutOfScope');
  assert.equal(res.data?.error, 'Assignee cannot read the task project');
  const stored = storedDoc();
  assert.ok(!stored.data.tasks.some(t => t.id === 't_guard'), 'the stored doc is unchanged');
});

test('the assignee write-guard passes an assignee on the access list', async () => {
  const roster = (await owner.get('/api/workspaces/acme/members')).data.members;
  const memberMid = roster.find(m => m.email === 'member@test.local').memberId;
  const live = (await owner.get('/api/workspaces/acme')).data;
  const doc = structuredClone(live.doc);
  const p = doc.data.projects.find(p => p.id === 'p_priv1');
  if (!p.members.includes(memberMid)) p.members.push(memberMid);
  doc.data.tasks.push({ id: 't_guard_ok', key: 'GRD-2', title: 'Guard pass probe', status: 'todo', assignee: memberMid, project: 'p_priv1', labels: [], subtasks: [] });
  const res = await owner.put('/api/workspaces/acme', { revision: live.revision, doc });
  assert.equal(res.status, 200, 'the write lands');
  assert.ok(storedDoc().data.tasks.some(t => t.id === 't_guard_ok'), 'the task is stored');
  // Restore the closed state for the file-serve cells below.
  const restore = (await owner.get('/api/workspaces/acme')).data;
  const rdoc = structuredClone(restore.doc);
  rdoc.data.projects.find(p => p.id === 'p_priv1').members = rdoc.data.projects.find(p => p.id === 'p_priv1').members.filter(id => id !== memberMid);
  rdoc.data.tasks = rdoc.data.tasks.filter(t => t.id !== 't_guard_ok');
  assert.equal((await owner.put('/api/workspaces/acme', { revision: restore.revision, doc: rdoc })).status, 200);
});

/* ------------------------- file serve side door ------------------------- */

test('a hidden private-project file answers the byte-identical unknown-id 404; the access-listed one serves', async () => {
  // Plant files directly (metadata rides the doc channel; bytes on disk).
  const doc = storedDoc();
  doc.data.files.push(
    { id: 'f_priv', name: 'f_priv.txt', size: 5, type: 'txt', project: 'p_priv1' },
    { id: 'f_in', name: 'f_in.txt', size: 5, type: 'txt', project: 'p_in' },
  );
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
  fs.writeFileSync(path.join(server.dataDir, 'files', 'f_priv'), Buffer.from('f_priv:p_priv1:gr8r-scope-suite', 'utf8'));
  fs.writeFileSync(path.join(server.dataDir, 'files', 'f_in'), Buffer.from('f_in:p_in:gr8r-scope-suite', 'utf8'));

  const hidden = await fileGet(member, 'f_priv');
  assert.equal(hidden.status, 404);
  const unknown = await fileGet(member, 'f_missing');
  assert.equal(unknown.status, 404);
  assert.deepEqual(await hidden.json(), await unknown.json(), 'hidden ≡ unknown: identical status, code AND message');
  const visible = await fileGet(member, 'f_in');
  assert.equal(visible.status, 200, 'a public-project file serves');
});

/* ------------------------- send-time gating (SMTP server) ------------------------- */

const at8 = iso => new Date(`${iso}T08:00:00Z`).toISOString();

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

test('send-time guards: an assignee off the private access list is never reminded or emailed', async t => {
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

    // Two member-role memberships (this server spends its own invite budget).
    const join = async email => {
      const [inv] = (await ownerMail.post('/api/workspaces/acme/invites', { emails: [email], role: 'member' })).data.invites;
      const cl = (await signup(mail.base, ACCOUNT(email.split('@')[0], email))).client;
      const joined = await cl.post(`/api/invites/${inviteToken(inv.url)}/accept`);
      assert.ok([200, 201].includes(joined.status), `${email} joined`);
      return (await ownerMail.get('/api/workspaces/acme/members')).data.members.find(m => m.email === email);
    };
    await join('onlist@test.local');
    await join('offlist@test.local');

    const wsRow = withDb(mail.dbPath, db => db.prepare('select id from workspaces where slug = ?').get('acme'));
    const mids = withDb(mail.dbPath, db =>
      db.prepare('select m.member_id, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?').all(wsRow.id),
    );
    const onMid = mids.find(r => r.email === 'onlist@test.local').member_id;
    const offMid = mids.find(r => r.email === 'offlist@test.local').member_id;
    const ownerMid = mids.find(r => r.email === ADMIN.email).member_id;

    // One private project: onList is on the access list, offList is not.
    const doc = {
      data: {
        members: [{ id: ownerMid, name: 'Owner' }],
        projects: [{ id: 'p_priv', key: 'priv', name: 'Mail Private', private: true, members: [ownerMid, onMid], lead: ownerMid, teams: [] }],
        tasks: [],
        comments: [],
        activity: [],
        notifs: [],
        files: [],
        notifPrefs: {},
      },
    };
    withDb(mail.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsRow.id));

    await t.test('the reminder pass skips an off-list assignee, delivers the on-list one', async () => {
      withDb(mail.dbPath, db => {
        const live = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(wsRow.id).doc);
        live.data.tasks.push(
          { id: 't_on', key: 'ON-1', title: 'On-list reminder task', status: 'todo', assignee: onMid, project: 'p_priv', due: '2027-03-15', labels: [], subtasks: [] },
          { id: 't_off', key: 'OFF-1', title: 'Off-list reminder task', status: 'todo', assignee: offMid, project: 'p_priv', due: '2027-03-15', labels: [], subtasks: [] },
          { id: 't_admin', key: 'AD-1', title: 'Admin reminder task', status: 'todo', assignee: ownerMid, project: 'p_priv', due: '2027-03-15', labels: [], subtasks: [] },
        );
        db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(live), wsRow.id);
      });
      const emitted = await triggerReminders(mail, at8('2027-03-15'));
      const reminders = emitted.filter(n => n.type === 'due_reminder');
      assert.ok(reminders.some(n => n.task === 't_on' && n.to === onMid), 'on-list reminder delivered');
      assert.ok(!reminders.some(n => n.task === 't_off'), 'no reminder row for the off-list assignee');
      assert.ok(reminders.some(n => n.task === 't_admin' && n.to === ownerMid), 'admin assignee still reminded');
    });

    await t.test('the email mirror never queues an off-list reminder email', async () => {
      const deadline = Date.now() + 5000;
      while (!smtp.messages.some(raw => textPart(raw).includes('On-list reminder task')) && Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 50));
      }
      assert.ok(smtp.messages.some(raw => textPart(raw).includes('On-list reminder task')), 'the on-list reminder email arrived');
      assert.ok(!smtp.messages.some(raw => textPart(raw).includes('Off-list reminder task')), 'no off-list email');
    });
  } finally {
    await mail.stop();
    smtp.srv.close();
  }
});

/* ---- D-06 workspace-level surfaces: activity + recent searches ride the
   same collapsed funnel (private-hidden scrubbing for the plain member). ---- */

test('fixture: activity rows and recent-search terms planted on public and private projects', () => {
  const doc = storedDoc();
  doc.data.activity = [
    { id: 'act_in', project: 'p_in', text: 'Public activity', at: 1 },
    { id: 'act_priv', project: 'p_priv1', text: 'Private activity', at: 2 },
  ];
  doc.data.recentSearches = ['Private One sprint', 'In Scope planning', 'generic term'];
  /* The client search folds t.desc — the API fixture tasks predate the field. */
  for (const t of doc.data.tasks || []) if (t.desc === undefined) t.desc = '';
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
});

test('the member\u2019s activity feed and recent searches carry zero private-project references', async () => {
  const view = (await member.get('/api/workspaces/acme')).data;
  assert.deepEqual(view.doc.data.activity.map(a => a.id), ['act_in'], 'the activity feed lists no private event');
  assert.deepEqual(view.doc.data.recentSearches, ['In Scope planning', 'generic term'], 'recent-search terms naming a private project are scrubbed ("In Scope planning" survives — its only hidden collision was scope-derived, retired with the scope term)');
});

/* ---- Phase 34 (SEARCH-01, D-13): tokenized redaction end-to-end ---- */

test('recent-search redaction matches on full tokens, not substrings', async () => {
  const doc = storedDoc();
  doc.data.projects.push({ id: 'p_sarah', key: 'srh', name: 'Sarah', private: true, members: [ownerId], lead: ownerId, teams: [] });
  doc.data.recentSearches = ['sarah smith', 'Sara Corp'];
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), server.wsId));
  const view = (await member.get('/api/workspaces/acme')).data;
  assert.deepEqual(view.doc.data.recentSearches, ['Sara Corp'], 'a full-token collision is dropped; a substring-only collision survives');
});

/* ---- Phase 29 Plan 03 task 2 (A4, kept for Phase 51): the client emit
   pre-filter. The browser modules read `document`, `navigator` and
   `localStorage` while they load, so those globals are stubbed before the
   store and the actions are imported dynamically — the same pattern as
   test/creator-watcher.test.mjs. The server guards are the authority; the
   client filter is advisory and DEFAULTS TO ELIGIBLE whenever the
   projection cannot determine scope. The scope MARKER on doc profiles is
   legacy — nothing projects it anymore (D-49-5), so only the crafted
   fixture below can exercise the marked path. */

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
const { searchAll: clientSearchAll } = await import('../src/core/searchall.js');

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

test('memberScopeEligible defaults to eligible when the projection cannot determine scope (A4)', () => {
  clientDoc();
  const plain = CD().members.find(m => m.id === 'm_plain');
  assert.equal(memberScopeEligible(plain, 'p_in'), true, 'unmarked member: eligible (default-allow)');
  assert.equal(memberScopeEligible(plain, 'p_out'), true, 'unmarked member stays eligible on any project');
  assert.equal(memberScopeEligible(null, 'p_in'), false, 'an unknown target is not eligible');
  assert.equal(memberScopeEligible(plain, null), true, 'workspace-level content: eligible');
  const admin = CD().members.find(m => m.id === 'm_admin');
  assert.equal(memberScopeEligible(admin, 'p_out'), true, 'admin/owner is workspace-wide');
});

test('the projection-marked out-of-scope target never lands in the mention fan-out', () => {
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

test('the assign notify and the watcher set ride the same eligibility filter', () => {
  clientDoc();
  clientCreateTask({ title: 'Out of scope assign', project: 'p_out', assignees: ['m_marked'] });
  assert.ok(!CD().notifs.some(n => n.to === 'm_marked' && n.type === 'assign'), 'no assign notify to an out-of-scope assignee');
  clientCreateTask({ title: 'In scope assign', project: 'p_in', assignees: ['m_marked'] });
  assert.ok(CD().notifs.some(n => n.to === 'm_marked' && n.type === 'assign'), 'in-scope assignee still notified');
  const tOut = { id: 't3', project: 'p_out', assignees: ['m_plain'], creator: 'm_marked' };
  const watchers = clientTaskWatchers(tOut);
  assert.ok(!watchers.includes('m_marked'), 'out-of-scope watcher filtered');
  assert.ok(watchers.includes('m_plain'), 'default-allow watcher kept');
});

test('a cross-project search over the client-visible payload finds only served content', async () => {
  const view = (await member.get('/api/workspaces/acme')).data;
  applyClientDoc(view.doc, 1); // the redacted doc is the client's whole world
  assert.equal(clientSearchAll('Private One').projects.length, 0, 'the private project is unfindable');
  assert.equal(clientSearchAll('Visible task').tasks.length, 1, 'a public task is still findable');
  assert.equal(clientSearchAll('In Scope').projects.length, 1, 'a public project is still findable');
});
