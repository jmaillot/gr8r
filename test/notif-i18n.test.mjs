/* =====================================================================
   Phase 36 plan 02 — server notification email i18n (I18N-01/I18N-02).

   A recipient's notification email (subject AND body) renders in the
   recipient's account locale through tFor, with EN fallback. Proven on
   the real server with a loopback SMTP capture: a FR-locale recipient
   and an EN-locale recipient of the SAME workspace notification get
   French and English respectively in one run, with no global locale
   mutation (the i18n module singleton stays 'en').

   Locale edges (Task 2): doc-only members (no users row), NULL locales
   and malformed stored locales all clamp to EN — the fan-out never
   blanks an email or dies.
   ===================================================================== */
import assert from 'node:assert/strict';
import net from 'node:net';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startServer, signup, login, client, withDb } from './helpers/server.mjs';
import { getLocale } from '../src/core/i18n.js';

const GOOD = 'correct-horse-9';

/* ---------- throwaway SMTP peer (same pattern as notif-email-link) ---------- */
function fakeSmtp() {
  const payloads = [];
  const server = net.createServer(socket => {
    /* Per-connection state — concurrent sends each get their own session. */
    let current = null;
    let inData = false;
    socket.write('220 test ESMTP\r\n');
    let buf = '';
    socket.on('data', chunk => {
      buf += chunk.toString('utf8');
      let idx;
      while ((idx = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            payloads.push(current);
            current = null;
            socket.write('250 ok\r\n');
          } else current += line + '\r\n';
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith('EHLO') || cmd.startsWith('HELO')) socket.write('250-test\r\n250 8BITMIME\r\n');
        else if (cmd.startsWith('DATA')) {
          inData = true;
          current = '';
          socket.write('354 go\r\n');
        } else if (cmd.startsWith('QUIT')) {
          socket.write('221 bye\r\n');
          socket.end();
        } else socket.write('250 ok\r\n');
      }
    });
  });
  return {
    payloads,
    listen: () => new Promise(resolve => server.listen(0, '127.0.0.1', resolve)),
    port: () => server.address().port,
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

/* Decode one captured SMTP payload: RFC 2047 subject words (plain-ASCII
   subjects are sent unencoded) + base64 parts. */
function decode(raw) {
  const parts = [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map(m =>
    Buffer.from(m[1].replace(/\r\n/g, ''), 'base64').toString('utf8'),
  );
  const encodedWords = [...raw.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(m => Buffer.from(m[1], 'base64').toString('utf8'));
  const rawSubject = (raw.match(/^Subject: (.*)$/m) || [])[1] || '';
  const subject = encodedWords.length ? encodedWords.join('') : rawSubject;
  return { to: (raw.match(/^To: <([^>]+)>/m) || [])[1] || '', subject, text: parts[0] || '', html: parts[1] || '' };
}

const waitFor = async (smtp, n, label) => {
  const start = smtp.payloads.length;
  const deadline = Date.now() + 10_000;
  while (smtp.payloads.length < start + n && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  assert.ok(smtp.payloads.length >= start + n, `${label}: expected ≥${n} new emails, got ${smtp.payloads.length - start}`);
  return smtp.payloads.slice(start).map(decode);
};

const payloadFor = (msgs, email) => {
  const m = msgs.filter(x => x.to === email);
  assert.ok(m.length >= 1, `at least one email for ${email} (got ${m.length})`);
  return m[0];
};

/* FR catalogue values pad guillemets/colons with U+00A0 — squeeze for asserts. */
const squeeze = s => s.replace(/\u00a0/g, ' ');

let smtp;
let server;
let tempDir;
let owner;
let frUser;
let ws;
let ownerMemberId;
let frMemberId = 'm-fr-1';
let doc;

before(async () => {
  smtp = fakeSmtp();
  await smtp.listen();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-notif-i18n-'));
  server = await startServer({
    dataDir: tempDir,
    env: {
      MASTER_KEY: 'projects-notif-i18n-key',
      REMINDER_TEST_TOKEN: 'notif-i18n-token',
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port()),
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'gr8r@test.local',
      APP_URL: 'https://i18n.example.com',
    },
  });

  /* Accounts: the admin (EN by default, auto-created at boot) and a FR-locale member. */
  const ownerLogin = await login(server.base, 'owner@test.local', 'owner-password-1');
  assert.equal(ownerLogin.status, 200, `owner login ${ownerLogin.status}`);
  owner = ownerLogin.client;
  const frSignup = await signup(server.base, { name: 'Zoé', email: 'zoe@test.local', password: GOOD });
  assert.equal(frSignup.status, 201, `fr signup ${frSignup.status}`);
  await login(server.base, 'zoe@test.local', GOOD);
  frUser = frSignup.client;
  const patched = await frUser.patch('/api/auth/me', { locale: 'fr' });
  assert.equal(patched.status, 200, `locale PATCH ${patched.status}`);

  const created = await owner.post('/api/workspaces', { name: 'I18n Ws', slug: 'i18n-ws' });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  ws = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get('i18n-ws'));
  ownerMemberId = withDb(server.dbPath, db =>
    db.prepare('select member_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id),
  ).member_id;
  const frUid = withDb(server.dbPath, db => db.prepare('select id from users where email = ?').get('zoe@test.local')).id;
  withDb(server.dbPath, db =>
    db.prepare('insert into memberships (workspace_id, user_id, role, member_id) values (?,?,?,?)').run(ws.id, frUid, 'member', frMemberId),
  );

  /* Baseline doc: one task, both account-backed members on the roster. */
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200);
  doc = read.data.doc;
  doc.data.projects = [{ id: 'p1', name: 'P1' }];
  doc.data.members = [
    { id: ownerMemberId, name: 'Owner', email: 'owner@test.local', userId: null },
    { id: frMemberId, name: 'Zoé', email: 'zoe@test.local', userId: null },
  ];
});

after(async () => {
  await server?.stop();
  await smtp?.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* Append mention notifs to the doc and PUT it — the diff fans the new rows
   out through queueNotifEmails on the real server. */
async function putNotifs(notifs, extraMembers = []) {
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200, `doc read ${read.status}`);
  const next = read.data.doc;
  next.data.members = [...doc.data.members, ...extraMembers];
  next.data.projects = doc.data.projects;
  if (!next.data.tasks?.length) next.data.tasks = [{ id: 't1', key: 'P1-1', title: 'Rapport naïf', status: 'todo', assignee: ownerMemberId, project: 'p1' }];
  const at = Date.now();
  for (const n of notifs) next.data.notifs.push({ at, read: false, ...n });
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc: next });
  assert.equal(saved.status, 200, `doc PUT ${saved.status} ${JSON.stringify(saved.data)}`);
}

const mention = (id, to, by) => ({ id, type: 'mention', to, by, task: 't1', snippet: '' });

/* ---------------- SC-1: FR vs EN on the same workspace, one run ---------------- */

test('SC-1: a FR-locale recipient gets a French mention email; EN recipients of the same workspace get English', async () => {
  await putNotifs([
    mention('n-fr-1', frMemberId, ownerMemberId),
    mention('n-en-1', ownerMemberId, frMemberId),
  ]);
  const msgs = await waitFor(smtp, 2, 'fr/en pair');

  const fr = payloadFor(msgs, 'zoe@test.local');
  assert.match(fr.subject, /vous a mentionné/, `FR subject: ${fr.subject}`);
  assert.ok(fr.subject.includes('Rapport naïf'), `FR subject carries the title: ${fr.subject}`);
  assert.ok(fr.text.includes('Bonjour,'), `FR greeting: ${fr.text.split('\r\n')[0]}`);
  assert.match(squeeze(fr.text), /« Rapport naïf »/, `FR sentence uses the guillemets: ${fr.text}`);
  assert.ok(fr.text.includes('dans I18n Ws.'), `FR sentence tail: ${fr.text}`);
  assert.match(squeeze(fr.text), /Ouvrez la tâche :/, `FR open-task line: ${fr.text}`);
  assert.ok(fr.text.includes('Vous recevez cet e-mail'), `FR footer: ${fr.text}`);
  assert.ok(fr.html.includes('Ouvrir la tâche'), `FR button: ${fr.html}`);

  const en = payloadFor(msgs, 'owner@test.local');
  assert.match(en.subject, /mentioned you in/, `EN subject: ${en.subject}`);
  assert.ok(en.text.includes('Hi,'), `EN greeting: ${en.text.split('\r\n')[0]}`);
  assert.ok(en.text.includes('Open the task:'), `EN open-task line: ${en.text}`);
  assert.ok(en.text.includes("You receive this because of your notification settings"), `EN footer: ${en.text}`);
});

/* ---------- I18N-02: no global locale mutation ---------- */

test('the i18n module singleton locale is still en after the server-side sends', async () => {
  assert.equal(getLocale(), 'en', 'the client singleton must never be mutated by server-side tFor renders');
});

/* ---------- D-11 email side: the reminder family renders per recipient ---------- */

const REMINDER_TZ = '(GMT+00:00) London';

test('reminder emails render the localized by-label and their own verb/subject per recipient locale', async () => {
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200);
  const next = read.data.doc;
  next.data.members = doc.data.members.map(m => ({ ...m, tz: REMINDER_TZ }));
  next.data.tasks = [
    { id: 't-rem-fr', key: 'P1-2', title: 'Rapport naïf', status: 'todo', assignee: frMemberId, project: 'p1', due: '2026-01-15' },
    { id: 't-rem-en', key: 'P1-3', title: 'Ship it', status: 'todo', assignee: ownerMemberId, project: 'p1', due: '2026-01-15' },
  ];
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc: next });
  assert.equal(saved.status, 200, `doc PUT ${saved.status}`);
  const trigger = await fetch(`${server.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': 'notif-i18n-token' },
    body: JSON.stringify({ now: '2026-01-15T09:00:00Z' }),
  });
  assert.equal(trigger.status, 200, `reminder pass ${trigger.status}`);

  const msgs = await waitFor(smtp, 4, 'reminder pair');

  const fr = payloadFor(msgs, 'zoe@test.local');
  assert.equal(squeeze(fr.subject), 'Rappel : Rapport naïf', `FR reminder subject: ${fr.subject}`);
  assert.match(squeeze(fr.text), /Rappels vous a envoyé un rappel pour/, `FR reminder by-label + verb: ${fr.text}`);

  const en = payloadFor(msgs, 'owner@test.local');
  assert.equal(en.subject, 'Reminder: Ship it', `EN reminder subject: ${en.subject}`);
  assert.match(en.text, /Reminders sent you a reminder about/, `EN reminder by-label + verb: ${en.text}`);
});

/* ---------- SC-5 / Pitfalls 4-5: locale edges all clamp to EN ---------- */

test('a doc-only member (no users row) gets an English email', async () => {
  const docOnly = { id: 'm-doc-1', name: 'Doc Only', email: 'doc-only@test.local' };
  /* No task: a project-scoped mention to a non-member would be scope-skipped
     (memberCanReadProject) — the locale edge here is about the authority-map
     miss, so the notif stays workspace-level (projectId null → keeps flowing). */
  await putNotifs([{ id: 'n-doc-1', type: 'mention', to: 'm-doc-1', by: ownerMemberId, task: null, snippet: '' }], [docOnly]);
  const msgs = await waitFor(smtp, 1, 'doc-only');
  const en = payloadFor(msgs, 'doc-only@test.local');
  assert.match(en.subject, /mentioned you in/, `doc-only subject must be EN: ${en.subject}`);
  assert.ok(en.text.includes('Hi,'), `doc-only greeting must be EN: ${en.text}`);
});

test('a NULL-locale user gets an English email (null clamp)', async () => {
  withDb(server.dbPath, db => db.prepare('update users set locale = null where email = ?').run('zoe@test.local'));
  await putNotifs([mention('n-null-1', frMemberId, ownerMemberId)]);
  const msgs = await waitFor(smtp, 1, 'null locale');
  const en = payloadFor(msgs, 'zoe@test.local');
  assert.match(en.subject, /mentioned you in/, `NULL-locale subject must be EN: ${en.subject}`);
  assert.ok(en.text.includes('Bonjour,') === false, 'NULL locale must not render French');
});

test('a malformed stored locale (fr-FR) clamps to EN instead of blanking the email', async () => {
  withDb(server.dbPath, db => db.prepare('update users set locale = ? where email = ?').run('fr-FR', 'zoe@test.local'));
  await putNotifs([mention('n-bad-1', frMemberId, ownerMemberId)]);
  const msgs = await waitFor(smtp, 1, 'malformed locale');
  const en = payloadFor(msgs, 'zoe@test.local');
  assert.match(en.subject, /mentioned you in/, `malformed-locale subject must be EN: ${en.subject}`);
  assert.ok(en.text.includes('Bonjour,') === false, 'malformed locale must not render French');
  withDb(server.dbPath, db => db.prepare('update users set locale = ? where email = ?').run('fr', 'zoe@test.local'));
});
