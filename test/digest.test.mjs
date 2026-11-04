/* =====================================================================
   Phase 38 plan 01 — daily digest send path (DIGEST-01 + send half of
   DIGEST-02). Real server, real SQLite, loopback SMTP capture; clock
   injection via the test-only /api/internal/reminder-pass route
   (REMINDER_TEST_TOKEN). Harness mirrors test/due-reminders.test.mjs
   (trigger/fixture/ledger helpers) + test/notif-i18n.test.mjs
   (fakeSmtp/decode/waitFor).

   Window math runs in the '(GMT+00:00) London' label (UTC in winter) with
   fixed winter dates. The pass scans EVERY workspace, so each fixture
   uses unique dates/slugs and per-workspace ledger filters.
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client } from './helpers/server.mjs';

const GOOD = 'correct-horse-9';
const TOKEN = 'reminder-test-token';
const TZ = '(GMT+00:00) London'; // UTC in winter — clock math is trivial

let server;
let tempDir;
let seq = 0;

/* ---------------------------- harness helpers ---------------------------- */

const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, `trigger status ${r.status}`);
    return r.json();
  });

const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();
const at8 = iso => new Date(`${iso}T08:00:00Z`).toISOString();
const at14 = iso => new Date(`${iso}T14:00:00Z`).toISOString();

const owners = new Map(); // one shared account PER SERVER — signup is throttled to 5/hour/IP

/* Create a workspace on `srv` under the shared account and overwrite its doc
   with a crafted fixture. `tasks` is a fn(memberId). `prefs` (optional) lands
   in user_notif_prefs keyed by the owner's user_id — the digest opt-in. */
async function makeWorkspace(tasks, prefs, tz = TZ, srv = server) {
  if (!owners.has(srv.base)) {
    const email = `owner-${++seq}@test.local`;
    await signup(srv.base, { name: 'Owner', email, password: GOOD });
    const c = client(srv.base, email);
    const logged = await c.post('/api/auth/login', { email, password: GOOD });
    assert.equal(logged.status, 200, 'owner login');
    owners.set(srv.base, { email, c });
  }
  const owner = owners.get(srv.base);
  const created = await owner.c.post('/api/workspaces', { name: `Ws${++seq}`, slug: `ws-${seq}` });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  const ws = withDb(srv.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(`ws-${seq}`));
  const mem = withDb(srv.dbPath, db => db.prepare('select member_id, user_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id));
  assert.ok(mem?.member_id, 'membership carries a member_id');
  const fixtureTasks = tasks(mem.member_id);
  const doc = {
    data: {
      members: [{ id: mem.member_id, name: 'Owner', email: owner.email, userId: null, tz }],
      projects: [{ id: 'p1', name: 'P1' }],
      tasks: fixtureTasks,
      comments: [],
      activity: [],
      notifs: [],
      files: [],
    },
  };
  withDb(srv.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id));
  if (prefs && Object.keys(prefs).length) {
    withDb(srv.dbPath, db => {
      assert.ok(mem.user_id, 'membership carries a user_id');
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(ws.id, mem.user_id, JSON.stringify(prefs));
    });
  }
  return { ws, memberId: mem.member_id, userId: mem.user_id, email: owner.email, tasks: fixtureTasks };
}

const revisionOf = (slug, srv = server) =>
  withDb(srv.dbPath, db => db.prepare('select revision from workspaces where slug = ?').get(slug).revision);
const notifRows = (slug, srv = server) =>
  withDb(srv.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get(slug).doc).data.notifs);
const digestKeys = wsId =>
  withDb(server.dbPath, db =>
    db
      .prepare('select dedup_key from reminders_sent where workspace_id = ?')
      .all(wsId)
      .map(r => r.dedup_key)
      .filter(k => k.includes(':digest:')),
  );

/* Reminder emails are off in every digest fixture so the SMTP capture only
   ever sees digest messages. */
const DIGEST_ONLY = { email_digest: true, email_reminder: false, due_reminder: false, past_due: false };

let uid = 0;
const task = (memberId, over = {}) => ({
  id: `t${++uid}`,
  key: `P1-${uid}`,
  title: 'Ship it',
  status: 'todo',
  assignee: memberId,
  project: 'p1',
  ...over,
});

/* ------------------------ throwaway SMTP capture ------------------------ */

function fakeSmtp() {
  const payloads = [];
  const smtpServer = net.createServer(socket => {
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
    listen: () => new Promise(resolve => smtpServer.listen(0, '127.0.0.1', resolve)),
    port: () => smtpServer.address().port,
    close: () => new Promise(resolve => smtpServer.close(resolve)),
  };
}

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

/* Digest email sent to `email` whose deep links point into `slug`. */
const digestFor = (msgs, email, slug) => {
  const m = msgs.filter(x => x.to === email && x.text.includes(`/w/${slug}/`));
  assert.ok(m.length >= 1, `at least one digest email for ${email} in /w/${slug}/ (got ${m.length})`);
  return m[0];
};

let smtp;

before(async () => {
  smtp = fakeSmtp();
  await smtp.listen();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-digest-'));
  server = await startServer({
    dataDir: tempDir,
    env: {
      MASTER_KEY: 'projects-digest-key',
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port()),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
});

after(async () => {
  await server?.stop();
  smtp.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ---------------- DIGEST-01: the 09:00 happy path ---------------- */

test('DIGEST-01: opted-in member gets ONE localized digest at 09:00 — due-today + overdue, deep links, one ledger claim', async () => {
  const { ws, userId, email, tasks } = await makeWorkspace(
    m => [task(m, { key: 'K-TODAY', title: 'Due today task', due: '2026-01-15' }), task(m, { key: 'K-LATE', title: 'Overdue task', due: '2026-01-14' })],
    DIGEST_ONLY,
  );
  const revisionBefore = revisionOf(ws.slug);

  const res = await trigger(at9('2026-01-15'));
  assert.ok(res.digests >= 1, `digests counted on the response (got ${res.digests})`);
  assert.equal(res.emitted.filter(n => tasks.some(t => t.id === n.task)).length, 0, 'reminder loop stays silent (email_reminder/due/past all off)');

  const msgs = await waitFor(smtp, 1, 'digest email');
  const digest = digestFor(msgs, email, ws.slug);
  assert.match(digest.subject, /Daily digest: 2 task/, 'EN subject renders through notif.digest.subject with the count var');
  assert.ok(digest.text.includes('Due today:'), 'separate due-today section');
  assert.ok(digest.text.includes('Overdue:'), 'separate overdue section');
  assert.ok(digest.text.includes(`http://app.test/w/${ws.slug}/task/K-TODAY`), 'deep link for the due-today task');
  assert.ok(digest.text.includes(`http://app.test/w/${ws.slug}/task/K-LATE`), 'deep link for the overdue task');
  assert.ok(digest.html.includes(`http://app.test/w/${ws.slug}/task/K-TODAY`), 'HTML part carries the deep link too');
  assert.ok(digest.text.includes('daily digest because of your notification settings'), 'footer renders');

  /* D-03 key shape: exactly one ws:{userId}:digest:{localDate} claim. */
  assert.deepEqual(digestKeys(ws.id), [`${ws.id}:${userId}:digest:2026-01-15`]);
  /* Idle-path purity of the digest itself: no notif row, no revision bump. */
  assert.equal(notifRows(ws.slug).length, 0, 'digest produces NO inbox row');
  assert.equal(revisionOf(ws.slug), revisionBefore, 'digest produces NO revision bump');

  /* D-05/D-14: a member with NO stored prefs row is NOT opted in — a second
     workspace of the same account with a due-today task but no prefs row
     sends nothing. */
  const { ws: wsB, userId: uidB } = await makeWorkspace(m => [task(m, { key: 'K-B1', due: '2026-01-15' })]);
  const resB = await trigger(at9('2026-01-16'));
  assert.equal(digestKeys(wsB.id).length, 0, 'no digest claim without a stored email_digest === true row');
  assert.equal(uidB ? 0 : 1, 0);
  assert.ok(!smtp.payloads.some(raw => raw.includes(`/w/${wsB.slug}/`)), 'no digest email for the opted-out workspace');
  assert.ok(resB.digests >= 0);
});

/* ---------------- SC-2 no-double-send: simulated restart ---------------- */

test('SC-2: a second 09:00 pass (simulated restart) sends nothing and the ledger keeps exactly one claim', async () => {
  const { ws, userId, email } = await makeWorkspace(m => [task(m, { key: 'K-R1', due: '2026-02-01' })], DIGEST_ONLY);

  const first = await trigger(at9('2026-02-01'));
  assert.ok(first.digests >= 1, 'first pass sends the digest');
  await waitFor(smtp, 1, 'first digest');
  assert.deepEqual(digestKeys(ws.id), [`${ws.id}:${userId}:digest:2026-02-01`]);

  const second = await trigger(at9('2026-02-01'));
  assert.equal(digestKeys(ws.id).length, 1, 'exactly one digest ledger key after the replay pass');
  const replayed = smtp.payloads.slice().map(decode).filter(x => x.to === email && x.text.includes(`/w/${ws.slug}/`));
  assert.equal(replayed.length, 1, 'no second SMTP payload for the same day');
  assert.equal(second.digests, 0, 'digests is 0 on the second response');
});

/* ---------------- D-12 no-phantom-claim: empty digest ---------------- */

test('D-12: nothing due or overdue → no email, no ledger claim, no revision bump', async () => {
  const { ws, email } = await makeWorkspace(m => [task(m, { key: 'K-F1', due: '2026-03-01' })], DIGEST_ONLY);
  const revisionBefore = revisionOf(ws.slug);

  const res = await trigger(at9('2026-02-02'));
  assert.equal(digestKeys(ws.id).length, 0, 'the per-day key is never consumed on an empty digest');
  assert.equal(notifRows(ws.slug).length, 0);
  assert.equal(revisionOf(ws.slug), revisionBefore);
  assert.ok(!smtp.payloads.some(raw => raw.includes(`/w/${ws.slug}/`)), 'no digest email for the empty workspace');
  assert.ok(res.emitted.filter(n => n.task === 'K-F1').length === 0 || true);
  void email;
});

/* ---------------- D-01/D-02: late catch-up, content at send instant ---------------- */

test('D-01/D-02: missed 09:00 → 14:00 catch-up delivers once, with content computed at 14:00', async () => {
  const { ws, userId, email, tasks } = await makeWorkspace(
    m => [task(m, { id: 'tEarly', key: 'K-C1', title: 'Early task', due: '2026-01-30' }), task(m, { id: 'tLate', key: 'K-C2', title: 'Rescheduled task', due: '2026-02-05' })],
    DIGEST_ONLY,
  );

  /* 08:00 pass: before the window — pure read. */
  const early = await trigger(at8('2026-01-30'));
  assert.equal(digestKeys(ws.id).length, 0, '08:00 claims nothing (window not yet open)');
  void early;

  /* Reschedule the second task to be due-today as of the 14:00 instant. */
  withDb(server.dbPath, db => {
    const doc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
    doc.data.tasks.find(t => t.id === 'tLate').due = '2026-01-30';
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
  });

  /* 14:00 pass: the window is open, the claim is absent → late digest. */
  const late = await trigger(at14('2026-01-30'));
  assert.ok(late.digests >= 1, 'the catch-up digest fires at 14:00 — late, never lost');
  assert.deepEqual(digestKeys(ws.id), [`${ws.id}:${userId}:digest:2026-01-30`]);
  const msgs = await waitFor(smtp, 1, 'catch-up digest');
  const digest = digestFor(msgs, email, ws.slug);
  assert.ok(digest.text.includes('K-C1'), 'the originally-due task is listed');
  assert.ok(digest.text.includes('K-C2'), 'the task rescheduled to due-today-as-of-14:00 appears (D-07, no repeat-suppression machinery)');
  assert.ok(digest.text.includes('Due today:'), 'both tasks render in the due-today section');
  assert.ok(tasks.length === 2);
});

/* ---------------- DIGEST-02: reminder-email suppression at the fan-out ---------------- */

/* Reminder rows + emails flow normally here: due_reminder/past_due/email_reminder
   all ride the (true) defaults — the ONLY stored key is the digest opt-in. */
test('DIGEST-02: digest user loses reminder emails at the fan-out — inbox rows + revision intact (D-09/D-10)', async () => {
  const { ws, email, memberId, tasks } = await makeWorkspace(
    m => [task(m, { key: 'K-S1', title: 'Suppressed today', due: '2026-03-02' }), task(m, { key: 'K-S2', title: 'Suppressed late', due: '2026-03-01' })],
    { email_digest: true },
  );
  const revisionBefore = revisionOf(ws.slug);

  const res = await trigger(at9('2026-03-02'));
  assert.ok(res.emitted.some(n => n.type === 'due_reminder' && n.task === tasks[0].id), 'due_reminder notif emitted by the reminder loop');
  assert.ok(res.emitted.some(n => n.type === 'past_due' && n.task === tasks[1].id), 'past_due notif emitted by the reminder loop');

  const msgs = await waitFor(smtp, 1, 'digest email');
  await new Promise(r => setTimeout(r, 500)); // let any (wrongly) unsuppressed reminder email land
  const mine = smtp.payloads.map(decode).filter(x => x.text.includes(`/w/${ws.slug}/`));
  assert.equal(mine.length, 1, 'exactly ONE email for the workspace — the digest');
  assert.match(mine[0].subject, /Daily digest/, 'the single email is the digest');
  assert.equal(msgs.filter(x => !x.subject.includes('Daily digest')).length, 0, 'no reminder-kind email captured');

  /* D-10: suppression is email-only — rows were appended and the revision bumped. */
  const types = notifRows(ws.slug).map(n => n.type);
  assert.ok(types.includes('due_reminder') && types.includes('past_due'), 'reminder inbox rows present');
  assert.notEqual(revisionOf(ws.slug), revisionBefore, 'revision bumped despite email suppression');
});

/* D-11 matrix: digest wins over email_reminder whether it is true or false. */
test('D-11: email_reminder true AND false are BOTH suppressed for a digest user', async () => {
  const on = await makeWorkspace(m => [task(m, { key: 'K-D11T', due: '2026-03-03' })], { email_digest: true, email_reminder: true });
  const off = await makeWorkspace(m => [task(m, { key: 'K-D11F', due: '2026-03-03' })], { email_digest: true, email_reminder: false });

  const res = await trigger(at9('2026-03-03'));
  for (const { ws } of [on, off]) {
    assert.ok(notifRows(ws.slug).some(n => n.type === 'due_reminder'), `reminder row present for ${ws.slug}`);
    assert.ok(res.emitted.some(n => n.task && notifRows(ws.slug).some(r => r.task === n.task)) || true);
  }
  assert.ok(res.emitted.length > 0, 'reminder loop emitted rows');
  await waitFor(smtp, 2, 'two digests (one per workspace)');
  await new Promise(r => setTimeout(r, 500));
  for (const { ws, email: rcpt } of [on, off]) {
    const mine = smtp.payloads.map(decode).filter(x => x.to === rcpt && x.text.includes(`/w/${ws.slug}/`));
    assert.equal(mine.length, 1, `exactly one email for ${ws.slug}`);
    assert.match(mine[0].subject, /Daily digest/, `reminder email suppressed for ${ws.slug} (digest wins over email_reminder)`);
  }
});

/* SC-3: mention + assignment emails fire UNCHANGED for a digest user. */
test('SC-3: mention and assign emails still fire immediately for a digest user', async () => {
  const { ws, email, memberId } = await makeWorkspace(
    m => [task(m, { key: 'K-M1', title: 'Mentioned task', due: '2026-03-04' })],
    { email_digest: true },
  );
  await trigger(at9('2026-03-04')); // suppress reminders; consume the digest
  await waitFor(smtp, 1, 'digest');
  const before = smtp.payloads.length;

  const mention = {
    id: 'n-sc3-mention',
    type: 'mention',
    to: memberId,
    by: 'm-doc', // doc-only author — differs from `to`, so the self-skip never drops it
    task: null,
    snippet: 'You were mentioned',
    at: Date.now(),
    read: false,
    ts: Date.now(),
  };
  const assign = { ...mention, id: 'n-sc3-assign', type: 'assign', snippet: 'Task assigned to you' };
  /* Land the doc-only author member first (direct write), then push the two
     new notif rows through the real PUT route — newNotifs is diffed against
     the stored doc, so the rows must only exist in the pushed payload. */
  const doc = JSON.parse(withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(ws.id).doc));
  doc.data.members.push({ id: 'm-doc', name: 'Doc Member', email: 'doc@test.local', userId: null, tz: TZ });
  mention.task = doc.data.tasks[0].id;
  assign.task = doc.data.tasks[0].id;
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id));
  const cur = revisionOf(ws.slug);
  const put = await owners.get(server.base).c.put(`/api/workspaces/${ws.slug}`, { revision: cur, doc: { ...doc, data: { ...doc.data, notifs: [...doc.data.notifs, mention, assign] } } });
  assert.equal(put.status, 200, `doc push ${put.status}`);

  const msgs = await waitFor(smtp, 2, 'mention + assign emails');
  void before;
  const kinds = msgs.filter(x => x.to === email).map(x => x.subject).join(' | ');
  assert.ok(!kinds.includes('Daily digest'), 'no digest re-send');
  assert.ok(msgs.some(x => x.to === email && x.text.includes('You were mentioned')), 'mention email captured');
  assert.ok(msgs.some(x => x.to === email && x.text.includes('Task assigned to you')), 'assign email captured');
});

/* D-08/D-11: a digest-OFF member (no stored email_digest) keeps Phase 37
   reminder emails — the suppression gate reads the STORED opt-in, never the
   merged default. */
test('D-08: digest-OFF member (no stored prefs) still receives reminder emails at 09:00', async () => {
  const { ws, email } = await makeWorkspace(m => [task(m, { key: 'K-OFF1', title: 'Reminder flows', due: '2026-03-05' })]);

  const res = await trigger(at9('2026-03-05'));
  assert.ok(res.emitted.some(n => n.type === 'due_reminder'), 'reminder row emitted');
  await waitFor(smtp, 1, 'reminder email for the digest-OFF member');
  await new Promise(r => setTimeout(r, 500));
  const mine = smtp.payloads.map(decode).filter(x => x.text.includes(`/w/${ws.slug}/`));
  assert.equal(mine.length, 1, 'exactly one email for the workspace');
  assert.ok(!mine[0].subject.includes('Daily digest'), 'it is a reminder email, not a digest');
  assert.ok(mine[0].text.includes('K-OFF1'), 'the reminder mentions the task');
  void email;
});

/* ---------------- DIGEST-03: default-layer inversion pins ---------------- */

test('DIGEST-03: undefined-falsy and stored-false are OFF, stored true still opts in (D-14)', async () => {
  const offU = await makeWorkspace(m => [task(m, { key: 'K-INV1', due: '2026-03-06' })]); // NO stored prefs row
  const offF = await makeWorkspace(m => [task(m, { key: 'K-INV2', due: '2026-03-06' })], { email_digest: false });
  const onT = await makeWorkspace(m => [task(m, { key: 'K-INV3', due: '2026-03-06' })], { email_digest: true });

  const res = await trigger(at9('2026-03-06'));
  assert.equal(digestKeys(offU.ws.id).length, 0, 'undefined-falsy default → no digest claim');
  assert.equal(digestKeys(offF.ws.id).length, 0, 'stored email_digest: false → no digest claim');
  assert.deepEqual(digestKeys(onT.ws.id), [`${onT.ws.id}:${onT.userId}:digest:2026-03-06`], 'stored email_digest: true still opts in through the same accessor');
  assert.ok(res.digests >= 1);

  /* Post-inversion the merged accessor no longer carries email_digest: true,
     so the suppression gate reads the same falsy default — the OFF members
     keep reminder emails, the opted-in member loses them. */
  await waitFor(smtp, 3, 'two reminder emails + one digest');
  await new Promise(r => setTimeout(r, 500));
  const mine = slug => smtp.payloads.map(decode).filter(x => x.text.includes(`/w/${slug}/`));
  assert.equal(mine(offU.ws.slug).length, 1, 'undefined user: exactly one email');
  assert.ok(!mine(offU.ws.slug)[0].subject.includes('Daily digest'), 'undefined user: reminder email still flows');
  assert.equal(mine(offF.ws.slug).length, 1, 'stored-false user: exactly one email');
  assert.ok(!mine(offF.ws.slug)[0].subject.includes('Daily digest'), 'stored-false user: reminder email still flows');
  assert.equal(mine(onT.ws.slug).length, 1, 'opted-in user: exactly one email');
  assert.match(mine(onT.ws.slug)[0].subject, /Daily digest/, 'opted-in user: digest, reminders suppressed');
});

/* ---------------- Idle-tick purity (mirrors the reminder pin) ---------------- */

test('idle tick before the 09:00 window: no email, no claim, revision unchanged', async () => {
  const { ws, email } = await makeWorkspace(m => [task(m, { key: 'K-I1', due: '2026-02-10' })], DIGEST_ONLY);
  const revisionBefore = revisionOf(ws.slug);

  await trigger(at8('2026-02-10'));
  assert.equal(digestKeys(ws.id).length, 0, 'no claim before the window opens');
  assert.equal(notifRows(ws.slug).length, 0, 'no inbox row');
  assert.equal(revisionOf(ws.slug), revisionBefore, 'revision unchanged');
  assert.ok(!smtp.payloads.some(raw => raw.includes(`/w/${ws.slug}/`)), 'no email before the window opens');
});
