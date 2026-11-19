/* Email outbox suite (Phase 68, POL-02 / D-04..D-08).
   Claim-then-deliver state machine for notification + digest emails,
   mirroring the Phase 67 webhook delivery engine (same backoff math, same
   drain shape). Real server, real SQLite; clock + send are injected through
   the test-only /api/internal/email-pass route (EMAIL_TEST_TOKEN, the
   /api/internal/webhook-pass pattern) — ZERO network, ZERO real timers.
   Producers need MAILER.enabled (SMTP_HOST set) to claim; the injected send
   stub records calls so assertions pin the rebuilt email params without SMTP. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client } from './helpers/server.mjs';

const TOKEN = 'email-test-token';
const NOW = Date.parse('2026-11-15T12:00:00Z');
const DAY = 86_400_000;

let server;
let mailerOff; // MAILER-disabled server (no SMTP_HOST) — producer gate + pass no-op
let ws;
let wsOff;
let owner;
let memberId;

before(async () => {
  server = await startServer({
    env: {
      EMAIL_TEST_TOKEN: TOKEN,
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1', // dead port — never contacted; the pass send is injected
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
  const email = 'outbox-owner@test.local';
  const password = 'correct-horse-9';
  await signup(server.base, { name: 'Outbox Owner', email, password });
  owner = client(server.base, email);
  const login = await owner.post('/api/auth/login', { email, password });
  assert.equal(login.status, 200, 'owner login');
  const created = await owner.post('/api/workspaces', { name: 'Outbox Ws', slug: 'outbox-ws' });
  assert.equal(created.status, 201, 'workspace create');
  ws = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get('outbox-ws'));
  memberId = withDb(server.dbPath, db => db.prepare('select member_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id)).member_id;
  assert.ok(memberId, 'membership exists');

  mailerOff = await startServer({ env: { EMAIL_TEST_TOKEN: TOKEN } });
  const email2 = 'outbox-off@test.local';
  await signup(mailerOff.base, { name: 'Off Owner', email: email2, password });
  const offClient = client(mailerOff.base, email2);
  await offClient.post('/api/auth/login', { email: email2, password });
  const created2 = await offClient.post('/api/workspaces', { name: 'Off Ws', slug: 'off-ws' });
  assert.equal(created2.status, 201, 'off workspace create');
  wsOff = withDb(mailerOff.dbPath, db => db.prepare('select * from workspaces where slug = ?').get('off-ws'));
});

after(async () => {
  await server?.stop();
  await mailerOff?.stop();
});

/* ---------------------------- harness helpers ---------------------------- */

const trigger = (payload = {}, srv = server) =>
  fetch(`${srv.base}/api/internal/email-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-email-token': TOKEN },
    body: JSON.stringify(payload),
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

function insertEmail(id, over = {}) {
  const row = { wsId: ws.id, dedup: `${id}-dedup`, kind: 'notif', recipient: 'to@test.local', ctx: JSON.stringify({ type: 'notif', to: 'to@test.local' }), attempt: 0, status: 'pending', nextAt: null, createdAt: NOW, ...over };
  withDb(server.dbPath, db =>
    db
      .prepare('insert into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, attempt, status, next_attempt_at, created_at) values (?,?,?,?,?,?,?,?,?,?)')
      .run(id, row.wsId, row.dedup, row.kind, row.recipient, row.ctx, row.attempt, row.status, row.nextAt, row.createdAt),
  );
  return row;
}

const emailRow = (id, srv = server) => withDb(srv.dbPath, db => db.prepare('select * from email_outbox where id = ?').get(id));
const outboxCount = (where = '1=1', params = [], srv = server) =>
  withDb(srv.dbPath, db => db.prepare(`select count(*) as n from email_outbox where ${where}`).get(...params).n);
const callsOf = r => (Array.isArray(r.data?.calls) ? r.data.calls : []);

/* Digest fixture: overwrite the workspace doc with a London-tz member and a
   task due `dueDate` assigned to that member; opt the owner into the digest.
   Clock injection via /api/internal/reminder-pass (REMINDER_TEST_TOKEN). */
async function makeDigestFixture(dueDate, prefs = {}) {
  const mem = withDb(server.dbPath, db => db.prepare('select member_id, user_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id));
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  const doc = read.data.doc;
  doc.data.projects = [{ id: 'p1', name: 'P1' }];
  doc.data.members = [{ id: mem.member_id, name: 'Outbox Owner', email: 'outbox-owner@test.local', tz: '(GMT+00:00) London' }];
  doc.data.tasks = [{ id: 't-dig', key: 'P1-9', title: 'Digest task', status: 'todo', project: 'p1', assignees: [mem.member_id], due: dueDate }];
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, `digest fixture PUT ${saved.status} ${JSON.stringify(saved.data)}`);
  if (Object.keys(prefs).length) {
    withDb(server.dbPath, db =>
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(ws.id, mem.user_id, JSON.stringify(prefs)),
    );
  }
  return mem;
}

const triggerReminders = nowIso =>
  fetch(`${server.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, `reminder pass ${r.status}`);
    return r.json();
  });

/* -------------------------------- tests --------------------------------- */

test('end-to-end: a doc-PUT notification is claimed into the outbox, delivered by the pass exactly once', async () => {
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  assert.equal(read.status, 200);
  const doc = read.data.doc;
  doc.data.projects = [{ id: 'p1', name: 'P1' }];
  doc.data.tasks = [{ id: 't1', key: 'P1-1', title: 'Outbox task', status: 'todo', project: 'p1', assignees: [] }];
  doc.data.notifs = [
    { id: 'n-e2e-1', type: 'mention', to: memberId, by: 'doc-by', task: 't1', snippet: 'hello outbox', at: NOW, read: false },
  ];
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, `baseline PUT ${saved.status} ${JSON.stringify(saved.data)}`);

  const claimed = withDb(server.dbPath, db => db.prepare("select * from email_outbox where dedup_key = 'notif:n-e2e-1'").all());
  assert.equal(claimed.length, 1, 'exactly one claim row for the notification');
  assert.equal(claimed[0].kind, 'notif');
  assert.equal(claimed[0].recipient, 'outbox-owner@test.local', 'recipient resolved from the authority rows');
  const ctx = JSON.parse(claimed[0].ctx);
  assert.equal(ctx.type, 'notif');
  assert.equal(ctx.workspace, 'Outbox Ws');
  assert.equal(ctx.task, 'Outbox task');
  assert.equal(ctx.url, 'http://app.test/w/outbox-ws/task/P1-1', 'APP_URL deep link rides the ctx');
  assert.equal(ctx.locale, 'en');
  assert.ok(claimed[0].created_at > 0);

  /* The post-commit kick fired the pass immediately against the dead SMTP
     port (SMTP_PORT 1) — the claim already made attempt 1 and scheduled a
     retry via D-06 math. Delivery is retried through the injected send. */
  const attempted = withDb(server.dbPath, db => db.prepare("select * from email_outbox where dedup_key = 'notif:n-e2e-1'").get());
  assert.equal(attempted.attempt, 1, 'the post-commit kick consumed attempt 1');
  assert.equal(attempted.status, 'failed');
  assert.ok(attempted.next_attempt_at > Date.now(), 'retry scheduled ~1 minute out (BACKOFF_MS[0])');

  const pass = await trigger({ now: attempted.next_attempt_at, send: { ok: true } });
  assert.equal(pass.status, 200, `pass ${pass.status} ${JSON.stringify(pass.data)}`);
  assert.equal(pass.data.delivered, 1);
  const call = callsOf(pass)[0];
  assert.ok(call, 'the fake send recorded one call');
  assert.equal(call.type, 'notif');
  assert.equal(call.to, 'outbox-owner@test.local');
  const delivered = withDb(server.dbPath, db => db.prepare("select * from email_outbox where dedup_key = 'notif:n-e2e-1'").get());
  assert.equal(delivered.status, 'delivered');
  assert.ok(delivered.delivered_at >= attempted.next_attempt_at, 'delivered_at set');

  /* A second identical claim (same dedup_key) is a no-op — INSERT OR IGNORE. */
  const noop = withDb(server.dbPath, db =>
    db.prepare("insert or ignore into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, created_at) values ('x2', ?, 'notif:n-e2e-1', 'notif', 'to@test.local', '', ?)").run(ws.id, NOW),
  );
  assert.equal(noop.changes, 0, 'UNIQUE dedup_key + INSERT OR IGNORE refuses the duplicate (A5: changes read is portable)');
  const stillOne = outboxCount("dedup_key = 'notif:n-e2e-1'");
  assert.equal(stillOne, 1, 'still exactly one row for the notification');
});

test('a doc-PUT with no new notifications claims nothing new (diff gate preserved)', async () => {
  const before2 = outboxCount();
  const read = await owner.get(`/api/workspaces/${ws.slug}`);
  const saved = await owner.put(`/api/workspaces/${ws.slug}`, { revision: read.data.revision, doc: read.data.doc });
  assert.equal(saved.status, 200);
  assert.equal(outboxCount(), before2, 'no new claim without new notif rows');
});

test('MAILER failure → attempt 1, next_attempt_at = now + 1m, status failed (D-06 backoff[0])', async () => {
  insertEmail('r1');
  const pass = await trigger({ now: NOW, send: { fail: 'smtp down' } });
  assert.equal(pass.data.failed, 1);
  const row = emailRow('r1');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt, 1);
  assert.equal(row.next_attempt_at, NOW + 60_000, 'BACKOFF_MS[0] = 1 minute');
  assert.ok(row.last_error.includes('smtp down'));
});

test('a failed row not yet due is NOT re-driven (no blanket re-drive)', async () => {
  insertEmail('r2', { status: 'failed', attempt: 1, nextAt: NOW + 600_000 });
  const pass = await trigger({ now: NOW, send: { ok: true } });
  assert.equal(pass.data.due, 0, 'the future-due row is not selected');
  assert.equal(callsOf(pass).length, 0);
  const row = emailRow('r2');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempt, 1, 'untouched');
});

test('a due failed row retries; attempt 5 failure → dead (isDead), no further scheduling', async () => {
  insertEmail('r3', { status: 'failed', attempt: 1, nextAt: NOW - 1000 });
  const pass = await trigger({ now: NOW, send: { fail: 'still down' } });
  assert.equal(pass.data.failed, 1);
  const row = emailRow('r3');
  assert.equal(row.attempt, 2);
  assert.equal(row.next_attempt_at, NOW + 300_000, 'BACKOFF_MS[1] = 5 minutes');
  assert.equal(row.status, 'failed');

  insertEmail('r4', { status: 'failed', attempt: 4, nextAt: NOW - 1000, dedup: 'r4-dedup' });
  const pass2 = await trigger({ now: NOW, send: { fail: 'final straw' } });
  assert.equal(pass2.data.dead, 1);
  const dead = emailRow('r4');
  assert.equal(dead.status, 'dead');
  assert.equal(dead.attempt, 5, '5 attempts max (D-06)');
  assert.equal(dead.next_attempt_at, null, 'dead rows are never scheduled again');
});

test('purge: a dead row older than 7 days is deleted; a recent dead row stays (D-08, silent)', async () => {
  insertEmail('old-dead', { status: 'dead', attempt: 5, createdAt: NOW - 8 * DAY, dedup: 'old-dead-dedup' });
  insertEmail('new-dead', { status: 'dead', attempt: 5, createdAt: NOW - 1 * DAY, dedup: 'new-dead-dedup' });
  const pass = await trigger({ now: NOW, send: { ok: true } });
  assert.equal(pass.data.purged, 1);
  assert.equal(emailRow('old-dead'), undefined, 'the 8-day-old dead row is purged');
  assert.ok(emailRow('new-dead'), 'the 1-day-old dead row stays');
});

test('MAILER disabled: producers skip claiming and the pass leaves rows untouched (open question 2)', async () => {
  withDb(mailerOff.dbPath, db =>
    db
      .prepare('insert into email_outbox (id, workspace_id, dedup_key, kind, recipient, ctx, attempt, status, next_attempt_at, created_at) values (?,?,?,?,?,?,?,?,?,?)')
      .run('off-row', wsOff.id, 'off-dedup', 'notif', 'to@test.local', JSON.stringify({ type: 'notif', to: 'to@test.local' }), 0, 'pending', null, NOW),
  );
  const pass = await trigger({ now: NOW, send: { ok: true } }, mailerOff);
  assert.equal(pass.status, 200);
  assert.equal(pass.data.due, 0, 'the pass drains nothing when SMTP is not configured');
  const row = emailRow('off-row', mailerOff);
  assert.equal(row.status, 'pending', 'the row is untouched — no dead/skip marking');
  assert.equal(row.attempt, 0);
});

/* ------------------- Task 2: digest claim articulation (D-07) ------------------- */

test('digest: one outbox row per claimed digest, committed inside the reminders_sent claim tx', async () => {
  const mem = await makeDigestFixture('2026-01-15', { email_digest: true, email_reminder: false, due_reminder: false, past_due: false });
  const result = await triggerReminders('2026-01-15T08:00:00Z');
  assert.equal(result.digests, 1, 'one digest claimed');
  const ledger = withDb(server.dbPath, db => db.prepare('select dedup_key from reminders_sent where workspace_id = ?').all(ws.id).map(x => x.dedup_key).filter(k => k.includes(':digest:')));
  assert.equal(ledger.length, 1, 'exactly one semantic claim (D-12 preserved)');
  const rows = withDb(server.dbPath, db => db.prepare("select * from email_outbox where dedup_key = ?").all(`digest:${ws.id}:${mem.user_id}:2026-01-15`));
  assert.equal(rows.length, 1, 'exactly ONE transport claim per digest');
  assert.equal(rows[0].kind, 'digest');
  assert.equal(rows[0].recipient, 'outbox-owner@test.local');
  const ctx = JSON.parse(rows[0].ctx);
  assert.equal(ctx.type, 'digest');
  assert.equal(ctx.workspace, 'Outbox Ws');
  assert.equal(ctx.appUrl, 'http://app.test');
  assert.deepEqual(
    ctx.dueToday.map(t => t.title),
    ['Digest task'],
    'the digest content snapshot rides the ctx (rebuilt at delivery time)',
  );

  /* Re-run the same clock — the ledger claim collides, nothing is claimed,
     no second outbox row (Phase 38 no-double-send, D-07). */
  const replay = await triggerReminders('2026-01-15T08:00:00Z');
  assert.equal(replay.digests, 0, 'the re-run claims nothing');
  assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) as n from reminders_sent where workspace_id = ?').get(ws.id).n), 1, 'ledger unchanged');
  assert.equal(outboxCount("dedup_key like 'digest:%'"), 1, 'still exactly one outbox row');

  /* Delivery rides the pass — the ctx rebuilds into a sendDigest call.
     The post-commit kick already consumed attempt 1 against the dead SMTP
     port, so drain past the scheduled retry (D-06 backoff[0]). */
  const pass = await trigger({ now: Date.now() + 120_000, send: { ok: true } });
  assert.ok(pass.data.delivered >= 1, 'the digest row is delivered (earlier retries may land in the same drain)');
  const call = callsOf(pass).find(c => c.type === 'digest');
  assert.ok(call, 'the pass rebuilt the digest email');
  assert.equal(call.to, 'outbox-owner@test.local');
  assert.equal(call.wsSlug, 'outbox-ws');
  assert.deepEqual(call.dueToday.map(t => t.title), ['Digest task']);
  assert.equal(emailRow(rows[0].id).status, 'delivered');
});

test('digest: an empty digest claims nothing and writes no outbox row (D-12 guard preserved)', async () => {
  await makeDigestFixture('2027-03-10', { email_digest: true, email_reminder: false, due_reminder: false, past_due: false });
  const before = outboxCount("dedup_key like 'digest:%'");
  const ledgerBefore = withDb(server.dbPath, db => db.prepare('select count(*) as n from reminders_sent').get().n);
  const result = await triggerReminders('2027-03-05T08:00:00Z');
  assert.equal(result.digests, 0, 'no digest claimed for an empty digest');
  assert.equal(outboxCount("dedup_key like 'digest:%'"), before, 'no transport claim either');
  assert.equal(withDb(server.dbPath, db => db.prepare('select count(*) as n from reminders_sent').get().n), ledgerBefore, 'no ledger claim (D-12)');
});

/* ------------------- Task 3: D-04 scope boundary (source asserts) -------------------
   server.js cannot be imported by a test (it boots on load), so the boundary is
   pinned the house way: read the source text and assert the outbox enqueue
   appears at exactly the two D-04 claim sites and NOWHERE in the invites/2FA
   fire-and-forget paths (D-04: invites and 2FA alerts stay direct-send). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');

test('D-04 boundary: the outbox enqueue exists at exactly the notif + digest claim sites', () => {
  const enqueueCalls = serverSource.match(/insert or ignore into email_outbox/g) || [];
  assert.equal(enqueueCalls.length, 2, 'exactly two claim sites: notif (queueNotifEmails) + digest');
  const enclosing = (src, idx) => {
    const re = /\n(?:async )?function ([A-Za-z_]\w*)/g;
    let last = null;
    let m;
    while ((m = re.exec(src)) && m.index < idx) last = m;
    return last ? last[1] : '';
  };
  const first = serverSource.indexOf('insert or ignore into email_outbox');
  const second = serverSource.indexOf('insert or ignore into email_outbox', first + 1);
  assert.equal(enclosing(serverSource, first), 'queueNotifEmails', 'claim site 1 lives in queueNotifEmails (notif path)');
  assert.equal(enclosing(serverSource, second), 'runReminderPass', 'claim site 2 lives in the reminder/digest pass');
});

test('D-04 boundary: sendInvite and sendSecurityAlert remain direct fire-and-forget', () => {
  for (const site of ['MAILER.sendInvite(', 'MAILER.sendSecurityAlert(']) {
    const idx = serverSource.indexOf(site);
    assert.ok(idx !== -1, `${site} call site still exists`);
    /* No outbox enqueue anywhere between the enclosing function start and the
       MAILER call — invites/2FA never ride the claim machinery. */
    const fnStart = serverSource.lastIndexOf('function ', idx);
    const slice = serverSource.slice(fnStart, idx);
    assert.ok(!slice.includes('email_outbox'), `${site} path contains no outbox enqueue`);
    assert.ok(!slice.includes('runEmailDeliveryPass'), `${site} path contains no delivery-pass wiring`);
  }
  /* The rebuilt send lives ONLY inside deliverEmail (the delivery pass) —
     the producer sites never call MAILER directly anymore. */
  const deliverStart = serverSource.indexOf('async function deliverEmail');
  const deliverEnd = serverSource.indexOf('async function runEmailDeliveryPass');
  for (const [site, name] of [['MAILER.sendNotif(', 'sendNotif'], ['MAILER.sendDigest(', 'sendDigest']]) {
    const occurrences = [];
    let at = serverSource.indexOf(site);
    while (at !== -1) {
      occurrences.push(at);
      at = serverSource.indexOf(site, at + 1);
    }
    assert.equal(occurrences.length, 1, `exactly one ${name} call (the delivery pass default sender)`);
    assert.ok(occurrences[0] > deliverStart && occurrences[0] < deliverEnd, `the ${name} call lives inside deliverEmail`);
  }
  /* The delivery pass and the tick piggyback still exist. */
  assert.ok(serverSource.includes('async function runEmailDeliveryPass'), 'runEmailDeliveryPass exists');
  assert.ok(serverSource.includes('runEmailDeliveryPass().catch(err => logWarn(`email tick'), 'the 30 s tick piggyback is wired');
});
