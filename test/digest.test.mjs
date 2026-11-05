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
import crypto from 'node:crypto';
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

/* 38-03 (CR-01): add a SECOND account-backed member to an existing workspace —
   a users row, a memberships row (with an optional restricted project scope)
   and the matching doc roster entry. Kept local so makeWorkspace's
   single-member signature is untouched. member_id is the literal 'm-peer'. */
function addPeerMember(ws, docPatch = null, scope = null, srv = server) {
  const peerUserId = `u-peer-${++seq}`;
  const peerEmail = `peer-${seq}@test.local`;
  withDb(srv.dbPath, db => {
    db.prepare('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)').run(
      peerUserId, peerEmail, 'Peer', 'not-a-real-hash', Date.now(),
    );
    db.prepare('insert into memberships (workspace_id, user_id, role, member_id, scope) values (?,?,?,?,?)').run(
      ws.id, peerUserId, 'member', 'm-peer', scope,
    );
    const doc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
    doc.data.members.push({ id: 'm-peer', name: 'Peer', email: peerEmail, userId: null, tz: TZ });
    if (docPatch) docPatch(doc);
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
  });
  return { memberId: 'm-peer', userId: peerUserId, email: peerEmail };
}

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
  assert.ok(uidB, 'membership carries a user_id');
  assert.ok(!smtp.payloads.some(raw => raw.includes(`/w/${wsB.slug}/`)), 'no digest email for the opted-out workspace');
  assert.equal(resB.digests, 1, 'only ws\'s overdue catch-up digest fires — wsB (no stored opt-in row) contributes zero sends');
});

/* ---------------- CR-01 recipient-scope pin (38-03, multi-member) ---------------- */

test('CR-01: a digest recipient receives ONLY their own, in-scope tasks — never another member\'s tasks or out-of-scope titles', async () => {
  const DUE = '2026-04-20'; // fresh date — the pass scans every workspace
  const { ws, userId: m1UserId, email: m1Email, memberId: m1MemberId } = await makeWorkspace(
    m => [
      task(m, { key: 'K-A1', title: 'Ordinary task', due: DUE }),
      task(m, { key: 'K-A2', title: 'Private task', due: DUE, project: 'p-private' }),
      task('m-peer', { key: 'K-B1', title: 'Peer task', due: DUE }),
    ],
    DIGEST_ONLY,
  );

  /* M2 joins with a restricted scope (only p1 in reach) so the SCOPE-04
     checks — correctly evaluated against the RECIPIENT — must deny p-private. */
  const peer = addPeerMember(
    ws,
    doc => doc.data.projects.push({ id: 'p-private', name: 'Private', private: true, members: [m1MemberId] }),
    JSON.stringify({ teams: [], projects: ['p1'] }),
  );
  withDb(server.dbPath, db =>
    db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(
      ws.id, peer.userId, JSON.stringify(DIGEST_ONLY),
    ),
  );

  const res = await trigger(at9(DUE));
  void res;
  const msgs = await waitFor(smtp, 2, 'two digests (one per opted-in member)');
  const digestM1 = digestFor(msgs, m1Email, ws.slug);
  const digestM2 = digestFor(msgs, peer.email, ws.slug);

  /* M2 (the leak detector, first-class): their own task appears; the owner's
     non-assignee task and the out-of-scope private task NEVER do. */
  assert.ok(digestM2.text.includes(`/w/${ws.slug}/task/K-B1`), 'M2 digest lists their own task K-B1');
  assert.ok(!digestM2.text.includes('K-A1'), 'M2 digest does NOT list the non-assignee task K-A1 (CR-01)');
  assert.ok(!digestM2.text.includes('K-A2'), 'M2 digest does NOT leak the out-of-scope private task K-A2 (CR-01)');

  /* M1 (owner, workspace-wide): the assignee===recipient gate must NOT
     over-suppress — both of M1's own tasks appear, the peer's does not. */
  assert.ok(digestM1.text.includes(`/w/${ws.slug}/task/K-A1`), 'M1 digest lists K-A1');
  assert.ok(digestM1.text.includes(`/w/${ws.slug}/task/K-A2`), 'M1 digest lists K-A2 (M1 can read the private project)');
  assert.ok(!digestM1.text.includes('K-B1'), 'M1 digest does NOT list the peer\'s task K-B1');

  /* Exactly one digest claim per opted-in member. */
  assert.deepEqual(
    digestKeys(ws.id).sort(),
    [`${ws.id}:${m1UserId}:digest:${DUE}`, `${ws.id}:${peer.userId}:digest:${DUE}`].sort(),
    'one digest ledger key per member',
  );
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
  assert.ok(!res.emitted.some(n => String(n.task || '').includes('K-F1')), 'no reminder row emitted for the future-dated task');
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
    const wsRows = notifRows(ws.slug).map(n => n.task);
    assert.ok(res.emitted.filter(n => n.task && wsRows.includes(n.task)).length > 0, `emitted rows correspond to doc notif rows for ${ws.slug}`);
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

/* =====================================================================
   Phase 40 plan 02 — bracketed subjects + Project — Task lines
   (SUBJ-01/SUBJ-02). Additive cases on top of the Phase 38 suite: the
   per-workspace `[WS]` subject prefix, the `Project Name — Task Name`
   label in both MIME parts, the silent title-only degrade (D-06), the
   no-leak pin for invisible private projects (T-40-06), and the SC-5
   English-literal fallback exercised through the now-exported
   buildDigestMessage with a poisoned catalogue (restored in finally).
   ===================================================================== */

test('SUBJ-01: a member of two workspaces gets two same-morning digests, each subject bracketed with its own workspace name', async () => {
  const a = await makeWorkspace(m => [task(m, { key: 'K-WSA', title: 'Due in A', due: '2026-05-10' })], DIGEST_ONLY);
  const b = await makeWorkspace(m => [task(m, { key: 'K-WSB', title: 'Due in B', due: '2026-05-10' })], DIGEST_ONLY);

  const res = await trigger(at9('2026-05-10'));
  assert.ok(res.digests >= 2, `both workspaces contribute a digest (got ${res.digests})`);
  const msgs = await waitFor(smtp, 2, 'two same-morning digests');

  for (const { ws, email } of [a, b]) {
    const digest = digestFor(msgs, email, ws.slug);
    assert.ok(digest.subject.startsWith(`[${ws.name}] `), `bracket prefix with the workspace name for ${ws.slug}: ${digest.subject}`);
    assert.match(digest.subject, /Daily digest: 1 task\(s\)/, 'localized subject still renders behind the bracket');
  }
  /* The two digests must NOT share one subject — each workspace owns its bracket. */
  const subjects = [a, b].map(({ ws, email }) => digestFor(msgs, email, ws.slug).subject);
  assert.notEqual(subjects[0], subjects[1], 'per-workspace subjects differ');
});

test('SUBJ-02: task lines read "Project Name — Task Name" in the text part and ONE whole-label <a> in the HTML part', async () => {
  const DUE = '2026-05-11';
  const { ws, email } = await makeWorkspace(
    m => [task(m, { key: 'K-PT1', title: 'Due one', due: DUE }), task(m, { key: 'K-PT2', title: 'Late one', due: '2026-05-10' })],
    DIGEST_ONLY,
  );

  const res = await trigger(at9(DUE));
  assert.ok(res.digests >= 1, 'digest fires');
  const digest = digestFor(await waitFor(smtp, 1, 'digest email'), email, ws.slug);

  assert.ok(digest.text.includes('Due today:\r\n- P1 — Due one'), 'due-today text line joins project and title with the em dash');
  assert.ok(digest.text.includes('Overdue:\r\n- P1 — Late one'), 'overdue text line carries the SAME join (Pitfall 5: both sections)');
  assert.ok(!digest.text.includes('&amp;'), 'text part is plain — no HTML entities leaked into it');
  assert.ok(
    digest.html.includes(`<a href="http://app.test/w/${ws.slug}/task/K-PT1" style="color:#3b5bdb;text-decoration:none">P1 — Due one</a>`),
    'HTML part: one anchor whose inner text is the FULL Project — Task label',
  );
  assert.ok(digest.html.includes('P1 — Late one'), 'HTML part: overdue label rendered too');
});

test('SUBJ-02/D-06: a task whose project row has no name degrades to title-only — no placeholder, both parts', async () => {
  const DUE = '2026-05-12';
  const { ws, email } = await makeWorkspace(m => [task(m, { key: 'K-NN1', title: 'Mystery task', due: DUE, project: 'p-noname' })], DIGEST_ONLY);
  /* Snapshot-defense fixture: the project row exists but carries NO name —
     projects.get(...).name is undefined → `|| ''` → title-only label. */
  withDb(server.dbPath, db => {
    const doc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
    doc.data.projects.push({ id: 'p-noname' });
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
  });

  await trigger(at9(DUE));
  const digest = digestFor(await waitFor(smtp, 1, 'digest email'), email, ws.slug);

  assert.ok(digest.text.includes('- Mystery task'), 'title-only line in the text part');
  assert.ok(!digest.text.includes(' — '), 'no em-dash join when the project name is missing');
  assert.ok(!digest.text.includes('Unknown project') && !digest.text.includes('Private project'), 'no placeholder text (D-06)');
  assert.ok(digest.html.includes('>Mystery task</a>'), 'title-only degrades in the HTML part too');
});

test('T-40-06: an invisible private project name appears NOWHERE in a non-member digest payload', async () => {
  const DUE = '2026-05-13';
  const { ws, email: m1Email, memberId: m1MemberId } = await makeWorkspace(
    m => [
      task(m, { key: 'K-V1', title: 'Visible task', due: DUE }),
      task(m, { key: 'K-H1', title: 'Hidden task', due: DUE, project: 'p-private' }),
      task('m-peer', { key: 'K-PV1', title: 'Peer visible', due: DUE }),
    ],
    DIGEST_ONLY,
  );
  const peer = addPeerMember(
    ws,
    doc => doc.data.projects.push({ id: 'p-private', name: 'Zebra Hidden Project', private: true, members: [m1MemberId] }),
    JSON.stringify({ teams: [], projects: ['p1'] }),
  );
  withDb(server.dbPath, db =>
    db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(
      ws.id, peer.userId, JSON.stringify(DIGEST_ONLY),
    ),
  );

  await trigger(at9(DUE));
  const msgs = await waitFor(smtp, 2, 'two digests (one per opted-in member)');
  const m1 = digestFor(msgs, m1Email, ws.slug);
  const m2 = digestFor(msgs, peer.email, ws.slug);

  assert.ok(m1.text.includes('Zebra Hidden Project — Hidden task'), 'positive control: M1 can read the private project, full label rendered');
  assert.ok(!m2.text.includes('Zebra Hidden Project'), 'M2 text part carries no invisible project name');
  assert.ok(!m2.html.includes('Zebra Hidden Project'), 'M2 HTML part carries no invisible project name');
  const raw = smtp.payloads.map(decode).find(x => x.to === peer.email && x.text.includes(`/w/${ws.slug}/`));
  assert.ok(raw && !`${raw.text}${raw.html}`.includes('Zebra'), 'raw decoded payload is clean end to end');
});

test('SUBJ-01/SC-5: subjectWs renders per-locale and the English-literal fallback survives a poisoned catalogue', async () => {
  const { buildDigestMessage } = await import('../mailer.js');
  const { registerCatalogue } = await import('../src/core/i18n.js');
  const enJson = JSON.parse(fs.readFileSync(new URL('../src/locales/en.json', import.meta.url), 'utf8'));
  const frJson = JSON.parse(fs.readFileSync(new URL('../src/locales/fr.json', import.meta.url), 'utf8'));
  const mk = (locale, ws) =>
    buildDigestMessage(
      { from: 'noreply@test.local' },
      {
        to: 'x@test.local',
        locale,
        workspace: ws,
        wsSlug: 'ws-unit',
        appUrl: 'http://app.test',
        dueToday: [{ key: 'K1', title: 'T1', project: 'P1' }],
        overdue: [],
      },
    );

  /* SC-5: a catalogue render throw degrades to the catch-frame English
     literal — subject keeps the [ws] prefix and the count. */
  const broken = { ...enJson, get 'notif.digest.subjectWs'() { throw new Error('catalogue exploded'); } };
  registerCatalogue('en', broken);
  try {
    const d = decode(mk('en', 'Poison WS').data);
    assert.equal(d.subject, '[Poison WS] Daily digest: 1 task(s)', 'SC-5 fallback literal renders with the truncated [ws] prefix');
    assert.ok(d.text.includes('- P1 — T1'), 'task lines still render in the fallback frame');
  } finally {
    registerCatalogue('en', enJson);
    registerCatalogue('fr', frJson);
  }

  /* Happy paths, both locales, rendered directly through the builder. */
  assert.equal(decode(mk('en', 'Fresh WS').data).subject, '[Fresh WS] Daily digest: 1 task(s)', 'EN subjectWs render');
  assert.equal(decode(mk('fr', 'Atelier').data).subject, '[Atelier] Résumé quotidien\u00a0: 1 tâche(s)', 'FR subjectWs render (NBSP typography + accents ride encodeWord)');
  const long = decode(mk('en', 'W'.repeat(80)).data);
  assert.ok(long.subject.startsWith(`[${'W'.repeat(64)}…]`), 'ws name capped at 64 chars by mailer-side truncate (D-11)');
});

/* =====================================================================
   Phase 41 plan 01 — RFC 8058 one-click unsubscribe headers (UNSUB-01)
   + footer settings link (UNSUB-03). Additive only: a SECOND server
   fixture with APP_URL=https://app.test (its own SMTP capture) — the
   existing http://app.test fixture above stays byte-identical, so its
   digests omit both headers (D-05/D-06 second-gate proof comes from
   Plan 02's negative-gate tests; the raw no-header pin for the http
   fixture lives in the UNSUB-01 test below).
   ===================================================================== */

let smtpHttps;
let httpsServer;
let httpsTempDir;

before(async () => {
  smtpHttps = fakeSmtp();
  await smtpHttps.listen();
  httpsTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-digest-https-'));
  httpsServer = await startServer({
    dataDir: httpsTempDir,
    env: {
      MASTER_KEY: 'projects-digest-key',
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpHttps.port()),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'https://app.test',
    },
  });
});

after(async () => {
  await httpsServer?.stop();
  smtpHttps?.close();
  if (httpsTempDir) fs.rmSync(httpsTempDir, { recursive: true, force: true });
});

test('UNSUB-01: an https-APP_URL digest carries List-Unsubscribe/-Post headers and the footer settings link in BOTH MIME parts', async () => {
  const { ws, userId, email } = await makeWorkspace(
    m => [task(m, { key: 'K-U1', title: 'Unsub task', due: '2026-06-01' })],
    DIGEST_ONLY,
    TZ,
    httpsServer,
  );

  const res = await trigger(at9('2026-06-01'), httpsServer);
  assert.ok(res.digests >= 1, 'digest fires on the https fixture');
  const digest = digestFor(await waitFor(smtpHttps, 1, 'https digest email'), email, ws.slug);

  /* Raw payload: headers live above the MIME parts — decode() drops them. */
  const raw = smtpHttps.payloads.find(p => p.includes(`/unsubscribe/`));
  assert.ok(raw && raw.includes(`To: <${email}>`), 'the captured raw payload is the https digest');

  /* Both header strings, verbatim, with the https URL (D-05). */
  const headerLine = raw.match(/^List-Unsubscribe: <(https:\/\/app\.test\/unsubscribe\/[^>]+)>$/m);
  assert.ok(headerLine, 'List-Unsubscribe header present verbatim with the https URL');
  assert.ok(raw.includes('List-Unsubscribe: <https://app.test/unsubscribe/'), 'List-Unsubscribe literal prefix asserted verbatim');
  assert.ok(raw.includes('List-Unsubscribe-Post: List-Unsubscribe=One-Click'), 'List-Unsubscribe-Post header present verbatim');

  /* Ordering probe (RFC 8058 §3.1 resolution): Subject → List-Unsubscribe →
     List-Unsubscribe-Post → Date. */
  const idx = name => raw.indexOf(`${name}: `);
  assert.ok(idx('Subject') < raw.indexOf('List-Unsubscribe') && raw.indexOf('List-Unsubscribe') < idx('List-Unsubscribe-Post') && idx('List-Unsubscribe-Post') < idx('Date'), 'header order Subject → List-Unsubscribe → List-Unsubscribe-Post → Date');

  /* Token shape: opaque single path segment, base64url, no padding, no CR/LF. */
  const token = headerLine[1].split('/unsubscribe/')[1];
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'base64url alphabet only');
  assert.ok(!token.includes('=') && !/[\r\n]/.test(token), 'no padding, no CR/LF inside the token');

  /* Token decodes to version ‖ wsId(36B) ‖ userId(36B) ‖ MAC(32B) and verifies
     against the server-side derivation shape (sha256(MASTER_KEY ‖ purpose)). */
  const decoded = Buffer.from(token, 'base64url');
  assert.equal(decoded.length, 1 + 36 + 36 + 32, 'fixed 105-byte framing');
  assert.equal(decoded[0], 0x01, 'version byte first');
  assert.equal(decoded.subarray(1, 37).toString('utf8'), ws.id, 'bytes 1-36 are the workspace id');
  assert.equal(decoded.subarray(37, 73).toString('utf8'), userId, 'bytes 37-72 are the user id');
  const { verifyUnsubscribeToken } = await import('../mailer.js');
  const key = crypto.createHash('sha256').update('projects-digest-key').update('unsubscribe-tokens:v1').digest();
  assert.equal(verifyUnsubscribeToken(key, token), true, 'token verifies against the purpose-tagged derivation');

  /* Footer settings link (UNSUB-03, D-01/D-03): inline after the footer
     sentence in BOTH parts — and it renders even though headers rendered too
     (adjacency: footer and headers coexist independently). */
  const settingsUrl = `https://app.test/w/${ws.slug}/settings#notif-email`;
  for (const [part, name] of [[digest.text, 'text'], [digest.html, 'html']]) {
    assert.ok(part.includes(settingsUrl), `${name} part carries the settings anchor link`);
  }
  assert.ok(digest.text.includes('notification settings. If you weren\'t expecting it, you can ignore this email. https://app.test/'), 'text link is INLINE after the footer sentence');
  assert.ok(digest.html.includes(`Unsubscribe from these emails</a>`), 'HTML part renders the localized link label');
});

test('UNSUB-01/D-05: the http://app.test fixture digest carries NO List-Unsubscribe headers (gate negative, footer still renders)', async () => {
  const { ws, email } = await makeWorkspace(m => [task(m, { key: 'K-U2', title: 'Http task', due: '2026-06-02' })], DIGEST_ONLY);
  const payloadsBefore = smtp.payloads.length;
  const res = await trigger(at9('2026-06-02'));
  assert.ok(res.digests >= 1, 'digest fires on the http fixture');
  const digest = digestFor(await waitFor(smtp, 1, 'http digest email'), email, ws.slug);
  /* Raw payloads carry base64 bodies — scope by recipient over THIS test's
     slice (the owner account is shared across the file's main-server tests). */
  const raw = smtp.payloads.slice(payloadsBefore).find(p => p.includes(`To: <${email}>`));
  assert.ok(raw, 'captured raw http digest');
  assert.ok(!raw.includes('List-Unsubscribe'), 'no List-Unsubscribe header, no http:// downgrade');
  assert.ok(!raw.includes('List-Unsubscribe-Post'), 'no List-Unsubscribe-Post header');
  assert.ok(digest.text.includes(`http://app.test/w/${ws.slug}/settings#notif-email`), 'footer settings link still renders in the text part');
  assert.ok(digest.html.includes('Unsubscribe from these emails'), 'footer settings link still renders in the HTML part');
});

/* =====================================================================
   Phase 41 plan 02 — D-05 gate-negative integration tests, one per
   gate. Append-only: neither the 41-01 fixtures/tests nor the helpers
   are touched. GATE 1 boots a THIRD server with NO MASTER_KEY but
   APP_URL=https (https — not the http fixture's URL — so the zero-
   header outcome is attributable to the missing key alone: key absent
   → unsubscribeHmacKey() null → no unsubscribeUrl in msg → mailer
   renders zero headers). GATE 2 reuses the EXISTING http://app.test
   main fixture so the mailer-side URL-shape gate is pinned with the
   server-side https gate layered in front (both refuse http).
   ===================================================================== */

let smtpGate1;
let gate1Server;
let gate1TempDir;

before(async () => {
  smtpGate1 = fakeSmtp();
  await smtpGate1.listen();
  gate1TempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-digest-gate1-'));
  gate1Server = await startServer({
    dataDir: gate1TempDir,
    env: {
      MASTER_KEY: '', // explicit: defeats any process.env leakage into the child
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtpGate1.port()),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'https://app.test',
    },
  });
});

after(async () => {
  await gate1Server?.stop();
  smtpGate1?.close();
  if (gate1TempDir) fs.rmSync(gate1TempDir, { recursive: true, force: true });
});

test('UNSUB-01/D-05 gate 1: a digest from a server booted WITHOUT MASTER_KEY carries NO List-Unsubscribe headers (footer still renders in BOTH parts)', async () => {
  const { ws, email } = await makeWorkspace(
    m => [task(m, { key: 'K-NOKEY', title: 'No-key task', due: '2026-06-03' })],
    DIGEST_ONLY,
    TZ,
    gate1Server,
  );

  const res = await trigger(at9('2026-06-03'), gate1Server);
  assert.ok(res.digests >= 1, 'digest fires on the no-MASTER_KEY server (keyring absence is fail-open, not fatal)');
  const digest = digestFor(await waitFor(smtpGate1, 1, 'no-key digest email'), email, ws.slug);

  /* Raw payload: headers live above the MIME parts — decode() drops them. */
  const raw = smtpGate1.payloads.find(p => p.includes(`To: <${email}>`));
  assert.ok(raw, 'captured raw no-key digest');

  /* Zero header occurrences of EITHER kind (D-05 gate 1). */
  assert.ok(!raw.includes('List-Unsubscribe'), 'no List-Unsubscribe header without MASTER_KEY');
  assert.ok(!raw.includes('List-Unsubscribe-Post'), 'no List-Unsubscribe-Post header without MASTER_KEY');

  /* The plain footer unsubscribe path survives the gate failure — D-05 scope
     is headers only. APP_URL is https here, so the settings URL is https. */
  const settingsUrl = `https://app.test/w/${ws.slug}/settings#notif-email`;
  assert.ok(digest.text.includes(settingsUrl), 'footer settings link still renders in the text part');
  assert.ok(digest.html.includes(settingsUrl), 'footer settings link still renders in the HTML part');
});

test('UNSUB-01/D-05 gate 2: an http://APP_URL digest carries NO List-Unsubscribe headers (footer still renders in BOTH decoded parts)', async () => {
  const { ws, email } = await makeWorkspace(m => [task(m, { key: 'K-HTTP2', title: 'Http gate task', due: '2026-06-04' })], DIGEST_ONLY);
  const payloadsBefore = smtp.payloads.length;
  const res = await trigger(at9('2026-06-04'));
  assert.ok(res.digests >= 1, 'digest fires on the http fixture');
  const digest = digestFor(await waitFor(smtp, 1, 'http gate-2 digest email'), email, ws.slug);
  const raw = smtp.payloads.slice(payloadsBefore).find(p => p.includes(`To: <${email}>`));
  assert.ok(raw, 'captured raw http gate-2 digest');

  /* Zero header occurrences of EITHER kind — the server-side https gate and
     the mailer-side URL-shape gate BOTH refuse http (layered defense). */
  assert.ok(!raw.includes('List-Unsubscribe'), 'no List-Unsubscribe header for an http APP_URL');
  assert.ok(!raw.includes('List-Unsubscribe-Post'), 'no List-Unsubscribe-Post header for an http APP_URL');

  /* Footer survives: the settings URL (http, matching the fixture's APP_URL)
     renders in BOTH decoded parts — header omission never suppresses it. */
  const settingsUrl = `http://app.test/w/${ws.slug}/settings#notif-email`;
  assert.ok(digest.text.includes(settingsUrl), 'footer settings link still renders in the decoded text part');
  assert.ok(digest.html.includes(settingsUrl), 'footer settings link still renders in the decoded HTML part');
});
