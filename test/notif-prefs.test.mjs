/* Per-user notification preferences (Phase 34, SETTINGS-01/02).
   Real server, real SQLite. Prefs are rows in user_notif_prefs keyed
   (workspace_id, user_id); the workspace document is never a prefs carrier —
   normalizeDoc (read) and mergeClientDoc (write) strip notifPrefs in both
   directions, and getUserNotifPrefs is the only reader. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { client, inviteToken, signup, startServer, withDb } from './helpers/server.mjs';

const PASSWORD = 'prefs-password-1';

let server;
let tempDir;
let owner;
let ws; // { id, slug }
let stranger; // signed up, never a member
let bob; // invited member (test i)

/* The 13-key default layer the accessor must reproduce (email_comment the ONLY false). */
const DEFAULTS = {
  email_mention: true,
  email_assign: true,
  email_digest: true,
  email_comment: false,
  email_reminder: true,
  due_reminder: true,
  past_due: true,
  push_mention: true,
  push_assign: true,
  push_comment: true,
  push_due: true,
  mention_all: true,
  assign_self: true,
};

const prefsRows = () =>
  withDb(server.dbPath, db => db.prepare('select workspace_id, user_id, prefs from user_notif_prefs').all());

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-prefs-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-prefs-key' } });

  const me = await signup(server.base, { name: 'Owner', email: 'prefs-owner@test.local', password: PASSWORD });
  assert.equal(me.status, 201, 'owner signup');
  owner = me.client;
  const created = await owner.post('/api/workspaces', { name: 'Prefs', slug: 'prefs-ws' });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  ws = withDb(server.dbPath, db => db.prepare('select id, slug from workspaces where slug = ?').get('prefs-ws'));
  assert.ok(ws?.id, 'workspace row exists');

  stranger = (await signup(server.base, { name: 'Stranger', email: 'prefs-stranger@test.local', password: PASSWORD })).client;
  bob = (await signup(server.base, { name: 'Bob', email: 'prefs-bob@test.local', password: PASSWORD })).client;
});

after(async () => {
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------- (a) PUT stores rows, GET merges over defaults ------------------- */

test('PUT whitelisted prefs then GET returns them merged over defaults', async () => {
  const put = await owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_reminder: false, push_due: false } });
  assert.equal(put.status, 200, `PUT prefs ${put.status}`);
  assert.equal(put.data.prefs.email_reminder, false);
  assert.equal(put.data.prefs.push_due, false);

  const got = await owner.get(`/api/me/notif-prefs?workspace=${ws.id}`);
  assert.equal(got.status, 200, `GET prefs ${got.status}`);
  assert.deepEqual(got.data.prefs, { ...DEFAULTS, email_reminder: false, push_due: false }, 'stored row merged over defaults');
  assert.equal(prefsRows().length, 1, 'exactly one row stored');
});

/* ------------------- (b) unknown key → 400 (D-03 whitelist) ------------------- */

test('PUT with an unknown key is rejected with 400', async () => {
  const res = await owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_reminder: false, sneaky_key: true } });
  assert.equal(res.status, 400, `unknown key rejected ${res.status}`);
  assert.equal(res.data.code, 'unknownPrefKey');
  assert.equal(prefsRows().length, 1, 'the rejected PUT wrote nothing');
});

/* ------------------- (c) values coerced to boolean ------------------- */

test('every accepted value is coerced to boolean', async () => {
  const res = await owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_mention: 'yes', due_reminder: 0 } });
  assert.equal(res.status, 200, `coercing PUT ${res.status}`);
  const got = await owner.get(`/api/me/notif-prefs?workspace=${ws.id}`);
  assert.equal(got.data.prefs.email_mention, true, 'truthy string coerces to true');
  assert.equal(got.data.prefs.due_reminder, false, '0 coerces to false');
  // restore the (a) state for later tests
  await owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_reminder: false, push_due: false, email_mention: true, due_reminder: true } });
});

/* ------------------- (d) doc GET: notifPrefs stripped on read ------------------- */

test('a document GET never carries notifPrefs — a planted legacy field is stripped', async () => {
  // Plant a stored document still carrying the legacy prefs block.
  const raw = withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
  const legacy = JSON.parse(raw);
  legacy.data.notifPrefs = { email_reminder: false, past_due: false };
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(legacy), ws.id));

  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200, `doc GET ${read.status}`);
  assert.equal(read.data.doc.data.notifPrefs, undefined, 'the doc field is stripped on every read');
});

/* ------------------- (e) doc PUT: notifPrefs dropped, never merged ------------------- */

test('a document PUT carrying notifPrefs has the field dropped, not merged', async () => {
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  const doc = structuredClone(read.data.doc);
  doc.data.notifPrefs = { email_reminder: false, mention_all: false };
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, `doc PUT ${saved.status}`);

  const after = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(after.data.doc.data.notifPrefs, undefined, 'a stale client cannot resurrect the field');
  assert.equal(prefsRows().filter(r => r.workspace_id === ws.id).length >= 1, true, 'the per-user rows still exist');
});

/* ------------------- (f) unauthenticated access → 401 ------------------- */

test('unauthenticated GET and PUT are rejected with 401', async () => {
  const anon = client(server.base, 'anonymous');
  const got = await anon.get(`/api/me/notif-prefs?workspace=${ws.id}`);
  assert.equal(got.status, 401);
  const put = await anon.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_reminder: false } });
  assert.equal(put.status, 401);
});

/* ------------------- (g) cross-workspace access → no-oracle 404 ------------------- */

test('a non-member is rejected with 404 (no-oracle) for GET and PUT', async () => {
  const got = await stranger.get(`/api/me/notif-prefs?workspace=${ws.id}`);
  assert.equal(got.status, 404, `stranger GET ${got.status}`);
  const put = await stranger.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_reminder: false } });
  assert.equal(put.status, 404, `stranger PUT ${put.status}`);
});

/* ------------------- (h) no row reads all-ON defaults (backstop: empty input) ------------------- */

test('a user with no row reads the all-ON defaults — empty stored prefs read as defaults', async () => {
  const fresh = await owner.post('/api/workspaces', { name: 'Defaults', slug: 'defaults-ws' });
  assert.equal(fresh.status, 201);
  const freshWs = withDb(server.dbPath, db => db.prepare('select id from workspaces where slug = ?').get('defaults-ws'));
  const got = await owner.get(`/api/me/notif-prefs?workspace=${freshWs.id}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.data.prefs, DEFAULTS, 'no row → the exact 13-key default set');

  // An empty stored prefs object reads as defaults too.
  await owner.put('/api/me/notif-prefs', { workspace: freshWs.id, prefs: {} });
  const again = await owner.get(`/api/me/notif-prefs?workspace=${freshWs.id}`);
  assert.deepEqual(again.data.prefs, DEFAULTS, 'empty stored object → defaults');
});

/* ------------------- (i) equal prefs stay two rows; order-insensitive equality ------------------- */

test('two users with exactly equal prefs remain two distinct rows, accessor output equal per key', async () => {
  // Bob joins the first workspace via invite.
  const inv = await owner.post('/api/workspaces/prefs-ws/invites', { emails: ['prefs-bob@test.local'], role: 'member' });
  assert.equal(inv.status, 201, `invite bob ${inv.status}`);
  const joined = await bob.post(`/api/invites/${inviteToken(inv.data.invites[0].url)}/accept`);
  assert.equal(joined.status, 200, `bob accepts ${joined.status}`);

  // Same prefs, deliberately different key insertion order.
  const a = await owner.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_reminder: false, email_mention: false } });
  const b = await bob.put('/api/me/notif-prefs', { workspace: ws.id, prefs: { email_mention: false, email_reminder: false } });
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);

  const rows = prefsRows().filter(r => r.workspace_id === ws.id);
  const userIds = withDb(server.dbPath, db =>
    db.prepare("select user_id from memberships where workspace_id = ? and user_id in (select id from users where email in ('prefs-owner@test.local','prefs-bob@test.local'))").all(ws.id).map(r => r.user_id),
  );
  assert.equal(rows.length, userIds.length, 'no merge/collapse — one row per user');
  assert.deepEqual(
    rows.map(r => r.user_id).sort(),
    [...userIds].sort(),
    'two distinct rows keyed by user_id',
  );

  const aPrefs = (await owner.get(`/api/me/notif-prefs?workspace=${ws.id}`)).data.prefs;
  const bPrefs = (await bob.get(`/api/me/notif-prefs?workspace=${ws.id}`)).data.prefs;
  assert.deepEqual(bPrefs, aPrefs, 'accessor output is per-key equal regardless of stored key order');
  assert.equal(aPrefs.email_reminder, false);
  assert.equal(aPrefs.email_mention, false);
});

/* ------------------- (j) per-recipient consumers (Task 2, Pitfall 1) ------------------- */

/* Minimal SMTP sink (due-reminders REM-05 pattern): captures DATA payloads. */
function fakeSmtp() {
  const messages = [];
  const srv = net.createServer(sock => {
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

/* Decode the base64 text/plain part of a captured message (REM-05 pattern). */
function textPart(raw) {
  const lines = raw.split('\n');
  const i = lines.indexOf('Content-Type: text/plain; charset=UTF-8');
  assert.ok(i !== -1, 'message has a text/plain part');
  const body = [];
  for (let j = i + 2; j < lines.length && !lines[j].startsWith('--'); j++) body.push(lines[j]);
  return Buffer.from(body.join(''), 'base64').toString('utf8');
}

test('two users with different rows get different outcomes — the reminder gate and email dispatch resolve per recipient', async t => {
  const smtp = await fakeSmtp();
  const mailDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-prefs-mail-'));
  const mail = await startServer({
    dataDir: mailDir,
    env: {
      MASTER_KEY: 'projects-prefs-mail-key',
      REMINDER_TEST_TOKEN: 'prefs-reminder-token',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
  try {
    const TOKEN = 'prefs-reminder-token';
    const TZ = '(GMT+00:00) London';
    const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();
    const trigger = nowIso =>
      fetch(`${mail.base}/api/internal/reminder-pass`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
        body: JSON.stringify({ now: nowIso }),
      }).then(async r => {
        assert.equal(r.status, 200);
        return (await r.json()).emitted;
      });

    const ownerA = (await signup(mail.base, { name: 'A', email: 'mail-a@test.local', password: PASSWORD })).client;
    await ownerA.post('/api/workspaces', { name: 'MailWs', slug: 'mail-ws' });
    const mailWs = withDb(mail.dbPath, db => db.prepare('select id, slug from workspaces where slug = ?').get('mail-ws'));

    const userB = (await signup(mail.base, { name: 'B', email: 'mail-b@test.local', password: PASSWORD })).client;
    const inv = await ownerA.post('/api/workspaces/mail-ws/invites', { emails: ['mail-b@test.local'], role: 'member' });
    assert.equal(inv.status, 201);
    const joined = await userB.post(`/api/invites/${inviteToken(inv.data.invites[0].url)}/accept`);
    assert.equal(joined.status, 200);

    // User A opts OUT of reminders; user B keeps the all-ON defaults.
    const off = await ownerA.put('/api/me/notif-prefs', { workspace: mailWs.id, prefs: { email_reminder: false } });
    assert.equal(off.status, 200, `A opts out ${off.status}`);

    // Both tasks are due; the pass must resolve prefs per assignee (Pitfall 1).
    const emails = withDb(
      mail.dbPath,
      db => db.prepare('select m.member_id, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?').all(mailWs.id),
    );
    const memberA = emails.find(r => r.email === 'mail-a@test.local').member_id;
    const memberB = emails.find(r => r.email === 'mail-b@test.local').member_id;
    const raw = withDb(mail.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(mailWs.id).doc);
    const doc = JSON.parse(raw);
    doc.data.tasks = [
      { id: 'ptA', key: 'PW-A', title: 'A task', status: 'todo', assignee: memberA, project: 'p1', due: '2026-01-15' },
      { id: 'ptB', key: 'PW-B', title: 'B task', status: 'todo', assignee: memberB, project: 'p1', due: '2026-01-15' },
    ];
    doc.data.members = emails.map(r => ({ id: r.member_id, name: r.email, email: r.email, userId: null, tz: TZ }));
    doc.data.projects = [{ id: 'p1', name: 'P1' }];
    withDb(mail.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), mailWs.id));

    const emitted = await trigger(at9('2026-01-15'));
    const mine = emitted.filter(n => n.task === 'ptA' || n.task === 'ptB');
    assert.ok(mine.some(n => n.task === 'ptB'), 'B (defaults) still gets reminder rows');

    await new Promise(r => setTimeout(r, 300));
    // Reminder emails carry the task deep link; the invite email to B does not.
    const reminderMails = smtp.messages.filter(raw => textPart(raw).includes('http://app.test/w/'));
    assert.equal(reminderMails.filter(raw => textPart(raw).includes('http://app.test/w/mail-ws/') && textPart(raw).match(/task\/PW-A/)).length, 0, 'no reminder email to A (email_reminder=false)');
    const bRows = mine.filter(n => n.task === 'ptB').length;
    assert.equal(reminderMails.length, bRows, 'one email per B reminder row — A is skipped');
    assert.ok(bRows >= 1, 'B got at least one reminder row');
  } finally {
    await mail.stop();
    smtp.srv.close();
    fs.rmSync(mailDir, { recursive: true, force: true });
  }
});
