/* Due-date reminder scheduler suite (phase 27 plan 01, REM-01..REM-05).
   Real server, real SQLite. Clock injection via the test-only
   /api/internal/reminder-pass route (REMINDER_TEST_TOKEN) — no sleeps, no
   fake timers. Idle ticks are pure reads: the revision must never move.
   Window math runs in the '(GMT+00:00) London' label (UTC in winter) with
   fixed winter dates, so injected UTC instants map 1:1 to local date/hour.
   The pass scans EVERY workspace, so each fixture uses unique task ids and
   assertions filter the emitted rows down to the fixture's own tasks. */
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

/* Clock-injected reminder run against the real server. */
const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, `trigger status ${r.status}`);
    return (await r.json()).emitted;
  });

/* 09:00 workspace-local on the given ISO date → the UTC instant to inject
   (valid for the UTC-equivalent London winter label). */
const at9 = iso => new Date(`${iso}T09:00:00Z`).toISOString();
const at8 = iso => new Date(`${iso}T08:00:00Z`).toISOString();

const owners = new Map(); // one shared account PER SERVER — signup is throttled to 5/hour/IP

/* Create a workspace on `srv` under the shared account and overwrite its doc
   with a crafted fixture. `tasks` is a fn(memberId) so fixtures can reference
   the real member id. Returns the fixture handle plus an `own` row filter. */
async function makeWorkspace(tasks, prefs = {}, tz = TZ, srv = server) {
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
  const mem = withDb(srv.dbPath, db => db.prepare('select member_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id));
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
  /* Phase 34: prefs are per-user rows, never doc fields — a fixture's prefs
     land in user_notif_prefs keyed by the owner's user_id (the gate resolves
     the fixture assignee's member_id back to this account). */
  if (Object.keys(prefs).length) {
    withDb(srv.dbPath, db => {
      const uid = db.prepare('select user_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id).user_id;
      assert.ok(uid, 'membership carries a user_id');
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(ws.id, uid, JSON.stringify(prefs));
    });
  }
  const ids = new Set(fixtureTasks.map(t => t.id));
  return { ws, memberId: mem.member_id, email: owner.email, own: emitted => emitted.filter(n => ids.has(n.task)) };
}

const revisionOf = (slug, srv = server) =>
  withDb(srv.dbPath, db => db.prepare('select revision from workspaces where slug = ?').get(slug).revision);
const notifRows = (slug, srv = server) =>
  withDb(srv.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get(slug).doc).data.notifs);
const reminderKeys = wsId =>
  withDb(server.dbPath, db => db.prepare('select dedup_key from reminders_sent where workspace_id = ?').all(wsId).map(r => r.dedup_key));

/* Default fixture task. Unique id/key per call — the pass scans all workspaces. */
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

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-reminders-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-reminders-key', REMINDER_TEST_TOKEN: TOKEN } });
});

after(async () => {
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* ------------------- REM-01: idle tick is a pure read ------------------- */

test('REM-01: a run outside the 09:00 hour writes nothing — revision unchanged, zero rows', async () => {
  const { ws, own } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })]);
  const before = revisionOf(ws.slug);
  const emitted = await trigger(at8('2026-01-15'));
  assert.equal(own(emitted).length, 0, 'no rows emitted off-hour');
  assert.equal(revisionOf(ws.slug), before, 'idle tick must never bump the workspace revision (SC-5)');
  assert.equal(notifRows(ws.slug).length, 0);
  assert.equal(reminderKeys(ws.id).length, 0);
});

/* ------------- REM-02/REM-03: due-day morning end-to-end + exactly-once ------------- */

test('REM-02/03: due-day morning fires once; second run is a no-op; due-date edit re-arms', async () => {
  const { ws, memberId, own } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })]);
  const revisionBefore = revisionOf(ws.slug);

  /* On the due-date morning only morning_of is open (the day-before offset was
     removed in Phase 37) — exactly one notification per task per assignee (REM-01). */
  const emitted = own(await trigger(at9('2026-01-15')));
  assert.equal(emitted.length, 1, 'morning_of alone fires on the due-date morning');
  for (const n of emitted) {
    assert.equal(n.type, 'due_reminder');
    assert.equal(n.to, memberId);
    assert.equal(n.by, null, 'system actor — by:null so the email self-skip never drops reminders');
    assert.match(n.snippet, /Due today: Ship it/, 'due-day copy');
  }
  assert.equal(notifRows(ws.slug).length, 1, 'one notif appended to the doc');
  const keys = reminderKeys(ws.id);
  assert.equal(keys.length, 1);
  const tId = emitted[0].task;
  assert.ok(
    keys.includes(`${ws.id}:${tId}:${memberId}:morning_of:2026-01-15`),
    'dedup key carries ws, task, assignee, offset and due date',
  );
  assert.equal(revisionOf(ws.slug), revisionBefore + 1, 'one emit → exactly one revision bump');

  /* Simulated restart: a fresh pass invocation (no shared memo) re-scans. */
  const again = own(await trigger(at9('2026-01-15')));
  assert.equal(again.length, 0, 'second pass emits nothing — transactional dedup (REM-03)');
  assert.equal(notifRows(ws.slug).length, 1);
  assert.equal(revisionOf(ws.slug), revisionBefore + 1);

  /* REM-03: editing the due date re-arms — the key carries the due date. */
  withDb(server.dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get(ws.id);
    const doc = JSON.parse(row.doc);
    doc.data.tasks.find(t => t.id === tId).due = '2026-01-16';
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
  });
  const reArmed = own(await trigger(at9('2026-01-16')));
  assert.equal(reArmed.length, 1, 'new due date → new keys → reminders re-arm');
  assert.ok(reArmed.every(n => !emitted.some(e => e.id === n.id)), 'fresh notification rows');
});

/* CR-01 contract drift: reminder rows must carry the client notif contract —
   `at` (number) + `read: false` (store.js notifyMembers shape), not just `ts`. */
test('CR-01: emitted rows match the client notif contract (at + read)', async () => {
  const { ws, own } = await makeWorkspace(m => [task(m, { due: '2026-03-02' })]);
  const emitted = own(await trigger(at9('2026-03-02')));
  assert.ok(emitted.length >= 1, 'at least one reminder emitted');
  for (const n of emitted) {
    assert.equal(typeof n.at, 'number', 'row carries `at` as a number (inbox sort / ago())');
    assert.ok(!Number.isNaN(new Date(n.at).getTime()), 'at is a valid epoch ms');
    assert.equal(n.read, false, 'row starts unread (inbox unread toggle)');
    assert.ok(n.snippet, 'row carries snippet');
  }
  const rows = notifRows(ws.slug);
  assert.ok(rows.every(r => typeof r.at === 'number' && r.read === false), 'doc-persisted rows match the contract');
});

/* ---------------- Task 2: window matrix — morning_of only ---------------- */
test('REM-02: morning_of opens on the due date; nothing fires before it (day-before offset removed)', async () => {
  const { own } = await makeWorkspace(m => [task(m, { due: '2026-02-01' })]);
  /* Jan 30/31: no window open — the day-before offset is gone (Phase 37). */
  assert.equal(own(await trigger(at9('2026-01-30'))).length, 0, 'two days out: silent');
  assert.equal(own(await trigger(at9('2026-01-31'))).length, 0, 'day before the due date: silent');
  const first = own(await trigger(at9('2026-02-01')));
  assert.deepEqual(first.map(n => n.snippet), ['Due today: Ship it'], 'morning_of fires on the due-date morning');
  /* Month boundary (and the DST-jump month): due Mar 1 — Feb 28 (the old
     day-before morning) stays silent, Mar 1 fires. */
  const { own: own2 } = await makeWorkspace(m => [task(m, { due: '2026-03-01' })]);
  assert.equal(own2(await trigger(at9('2026-02-28'))).length, 0, 'month rollover: nothing fires the morning before');
  assert.deepEqual(own2(await trigger(at9('2026-03-01'))).map(n => n.snippet), ['Due today: Ship it']);
});

test('REM-02: both offsets across a due-date boundary in one pass — due today + due yesterday', async () => {
  const { own } = await makeWorkspace(m => [
    task(m, { id: 'tToday', key: 'P1-T', title: 'Today', due: '2026-01-20' }),
    task(m, { id: 'tYesterday', key: 'P1-M', title: 'Yesterday', due: '2026-01-19' }),
  ]);
  const emitted = own(await trigger(at9('2026-01-20')));
  /* tToday: morning_of. tYesterday: morning_of (open catch-up window) +
     past_due — the open window plus an absent dedup key IS the catch-up. */
  assert.equal(emitted.length, 3);
  assert.deepEqual(emitted.filter(n => n.task === 'tToday').map(n => n.snippet), ['Due today: Today']);
  assert.deepEqual(
    emitted.filter(n => n.task === 'tYesterday').map(n => n.snippet).sort(),
    ['Due today: Yesterday', 'Past due: Yesterday'],
  );
});

/* ------------------- REM-04: gating on task/project state ------------------- */

test('REM-04: done, archived, project-archived, private-hidden and due-less tasks never remind', async () => {
  const { own } = await makeWorkspace(m => [
    task(m, { id: 'tDone', key: 'P1-2', due: '2026-01-15', status: 'done' }),
    task(m, { id: 'tArch', key: 'P1-3', due: '2026-01-15', archived: true }),
    task(m, { id: 'tProjArch', key: 'P1-4', due: '2026-01-15', project: 'pArch' }),
    task(m, { id: 'tHidden', key: 'P1-5', due: '2026-01-15', project: 'pPriv' }),
    task(m, { id: 'tNoDue', key: 'P1-6', due: null }),
    task(m, { id: 'tOk', key: 'P1-7', due: '2026-01-15' }),
  ]);
  // Register the extra projects into this fixture's workspace doc before the pass.
  const wsRow = withDb(server.dbPath, db =>
    db.prepare('select id from workspaces where doc like ?').get(`%tProjArch%`),
  );
  withDb(server.dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get(wsRow.id);
    const doc = JSON.parse(row.doc);
    doc.data.projects.push(
      { id: 'pArch', name: 'Archived', archived: true },
      { id: 'pPriv', name: 'Private', private: true, members: ['someone-else'] },
    );
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsRow.id);
  });
  const emitted = own(await trigger(at9('2026-01-15')));
  assert.deepEqual(
    emitted.map(n => n.task).sort(),
    ['tOk'],
    'only the plain remindable task fires (morning_of only)',
  );
});

/* --------------------- REM-04: past-due nudge semantics --------------------- */

test('REM-04: past_due fires exactly once at the first 09:00 after the due date', async () => {
  const { ws, own } = await makeWorkspace(m => [task(m, { due: '2026-01-10' })]);
  /* Due-date morning: due_reminder offsets only — the nudge is the morning AFTER. */
  const onDue = own(await trigger(at9('2026-01-10')));
  assert.ok(onDue.length >= 1 && onDue.every(n => n.type === 'due_reminder'), 'due-date morning is due_reminder only');
  /* First 09:00 after: past_due. */
  const after = own(await trigger(at9('2026-01-11')));
  assert.deepEqual(after.map(n => n.type), ['past_due'], 'past_due fires the morning after, exactly once');
  assert.match(after[0].snippet, /Past due: Ship it/);
  /* Still overdue a week later: still exactly one. */
  const week = own(await trigger(at9('2026-01-18')));
  assert.equal(week.length, 0, 'past_due never repeats while overdue (D-27-3)');
  assert.equal(notifRows(ws.slug).filter(n => n.type === 'past_due').length, 1);
});

/* --------------- REM-03: multi-morning replay pin (D-06) --------------- */

test('REM-03: multi-morning replay — exactly one morning_of + one past_due, then silence (regression pin)', async () => {
  const { own } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })]);
  const onDue = own(await trigger(at9('2026-01-15')));
  assert.equal(onDue.filter(n => n.type === 'due_reminder').length, 1, 'exactly one morning_of');
  const after = own(await trigger(at9('2026-01-16')));
  assert.equal(after.filter(n => n.type === 'past_due').length, 1, 'exactly one past_due');
  for (const day of ['2026-01-17', '2026-01-20']) {
    assert.equal(own(await trigger(at9(day))).length, 0, `nothing re-fires on ${day}`);
  }
});

/* --------------------- D-27-5: prefs gates (default ON) --------------------- */

test('D-27-5: due_reminder/past_due prefs === false gate in-app rows; missing keys stay ON', async () => {
  const { own: ownOff } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], { due_reminder: false, past_due: false });
  assert.equal(ownOff(await trigger(at9('2026-01-15'))).length, 0, 'due_reminder: false gates the due reminders');
  assert.equal(ownOff(await trigger(at9('2026-01-16'))).length, 0, 'past_due: false gates the nudge');

  /* Missing keys are ON (=== false disables — matches queueNotifEmails). */
  const { own: ownOn } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], {});
  assert.equal(ownOn(await trigger(at9('2026-01-15'))).length, 1, 'undefined prefs default to ON (morning_of)');
  const { own: ownPast } = await makeWorkspace(m => [task(m, { due: '2026-01-14' })], { past_due: false });
  const gated = ownPast(await trigger(at9('2026-01-15')));
  assert.equal(gated.filter(n => n.type === 'past_due').length, 0, 'past_due: false gates the overdue nudge even with due_reminder on');
  assert.ok(gated.every(n => n.type === 'due_reminder'), 'due reminders unaffected by past_due: false');
});

/* --------------------- D-27-5: defaults ON, phase 34 --------------------- */

test('D-27-5: a user with no prefs row reads email_reminder/due_reminder/past_due as true', async () => {
  const owner = owners.get(server.base);
  const created = await owner.c.post('/api/workspaces', { name: `Ws${++seq}`, slug: `ws-${seq}` });
  assert.equal(created.status, 201, 'workspace created');
  const ws = withDb(server.dbPath, db => db.prepare('select id from workspaces where slug = ?').get(`ws-${seq}`));
  const res = await owner.c.get(`/api/me/notif-prefs?workspace=${ws.id}`);
  assert.equal(res.status, 200, 'prefs fetched');
  assert.equal(res.data.prefs.email_reminder, true, 'email_reminder defaults ON');
  assert.equal(res.data.prefs.due_reminder, true, 'due_reminder defaults ON');
  assert.equal(res.data.prefs.past_due, true, 'past_due defaults ON');
  /* The doc field itself is retired — a document never carries prefs again. */
  const doc = await owner.c.get(`/api/workspaces/ws-${seq}`);
  assert.equal(doc.data.doc.data.notifPrefs, undefined, 'notifPrefs left the document (Phase 34)');
});

test('D-27-5: a legacy doc carrying notifPrefs reads all-ON defaults — the field is stripped, the scheduler still reminds', async () => {
  const { ws, own } = await makeWorkspace(m => [task(m, { id: 'tLegacy', key: 'P1-L', due: '2026-01-15' })]);
  /* Plant a stale legacy doc field: Phase 34 strips it on every read. */
  const raw = withDb(server.dbPath, db => db.prepare('select doc from workspaces where id = ?').get(ws.id).doc);
  const legacy = JSON.parse(raw);
  legacy.data.notifPrefs = { email_reminder: false, past_due: false };
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(legacy), ws.id));
  const res = await owners.get(server.base).c.get(`/api/workspaces/${ws.slug}`);
  assert.equal(res.status, 200, 'workspace fetched');
  assert.equal(res.data.doc.data.notifPrefs, undefined, 'the doc field is stripped, never merged (Phase 34)');
  /* The behavior half: with no per-user row, the accessor reads all-ON — the
     real pass still reminds. */
  assert.equal(own(await trigger(at9('2026-01-15'))).length, 1, 'no row reads as all-ON — still reminds');
});

/* --------------------- REM-02: DST + label allow-list --------------------- */

test('REM-02: Pacific label maps through DST — the local date, not the UTC date, decides', async () => {
  const { own: ownP } = await makeWorkspace(m => [task(m, { due: '2026-03-09' })], {}, '(GMT-08:00) Pacific Time');
  const fire = ownP(await trigger('2026-03-09T16:00:00Z'));
  assert.ok(fire.some(n => n.snippet === 'Due today: Ship it'), '09:00 America/Los_Angeles on Mar 9 (PDT) opens the morning_of window');
  const { own: ownE } = await makeWorkspace(m => [task(m, { due: '2026-03-09' })], {}, '(GMT-08:00) Pacific Time');
  const notYet = ownE(await trigger('2026-03-08T16:00:00Z'));
  assert.equal(notYet.length, 0, 'Mar 8 local: no window open for a Mar 9 due (day-before offset removed in Phase 37)');
  /* Unknown/empty label → UTC fallback (legacy docs seed tz: ''). */
  const { own: ownU } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], {}, '');
  assert.ok(ownU(await trigger(at9('2026-01-15'))).some(n => n.snippet === 'Due today: Ship it'), 'empty tz label falls back to UTC');
});

/* ==================== REM-05: reminder email path (Task 3) ==================== */

/* Minimal SMTP sink: captures DATA payloads so assertions can inspect the
   real message mailer.js builds. Speaks just enough SMTP (no TLS/AUTH). */
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

/* Decode the base64 text/plain part of a captured message. */
function textPart(raw) {
  const lines = raw.split('\n');
  const i = lines.indexOf('Content-Type: text/plain; charset=UTF-8');
  assert.ok(i !== -1, 'message has a text/plain part');
  const body = [];
  for (let j = i + 2; j < lines.length && !lines[j].startsWith('--'); j++) body.push(lines[j]);
  return Buffer.from(body.join(''), 'base64').toString('utf8');
}

test('REM-05: email gate, deep link, by:null never self-skipped, failure isolation', async t => {
  const smtp = await fakeSmtp();
  const mailDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-reminders-mail-'));
  const mail = await startServer({
    dataDir: mailDir,
    env: {
      MASTER_KEY: 'projects-reminders-mail-key',
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(smtp.port),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });

  await t.test('email on: one email per reminder row with the exact deep link (LINK-01)', async () => {
    const { ws, email, own } = await makeWorkspace(m => [task(m, { id: 'tMail', key: 'K-M1', due: '2026-01-15' })], {}, TZ, mail);
    const emitted = own(await trigger(at9('2026-01-15'), mail));
    assert.equal(emitted.length, 1, 'in-app row present');
    await new Promise(r => setTimeout(r, 300));
    assert.equal(smtp.messages.length, 1, 'one email per reminder row');
    for (const raw of smtp.messages) {
      assert.ok(raw.includes(`To: <${email}>`), 'by:null reminder rows are never self-skipped — owner emailed');
      assert.ok(textPart(raw).includes(`http://app.test/w/${ws.slug}/task/`), 'deep link shape');
      assert.ok(textPart(raw).includes('Reminders'), 'by-label is the system "Reminders", not "Un membre"');
    }
    // Exact deep link resolves the task key.
    assert.ok(smtp.messages.every(raw => textPart(raw).includes(`http://app.test/w/${ws.slug}/task/`)));
    const keys = new Set(smtp.messages.map(raw => textPart(raw).match(/http:\/\/app\.test\/w\/[^/]+\/task\/(\S+)/)?.[1]));
    assert.deepEqual([...keys], ['K-M1'], 'deep link points at the task key');
    /* Claim this workspace's remaining past_due window so later clocks in
       this suite emit nothing further for it. */
    const nudge = own(await trigger(at9('2026-01-16'), mail));
    assert.deepEqual(nudge.map(n => n.type), ['past_due']);
    await new Promise(r => setTimeout(r, 300));
  });

  await t.test('email_reminder false: in-app row present, no email queued (D-27-5)', async () => {
    /* Due Jan 20 so the first workspace's windows are all claimed by now —
       the pass scans every workspace, so only this fixture's emits differ. */
    const { ws, own } = await makeWorkspace(m => [task(m, { id: 'tGate', key: 'K-M2', due: '2026-01-20' })], { email_reminder: false }, TZ, mail);
    const emitted = own(await trigger(at9('2026-01-20'), mail));
    assert.equal(emitted.length, 1, 'in-app row still generated');
    assert.equal(notifRows(ws.slug, mail).length, 1);
    const countBefore = smtp.messages.length;
    await new Promise(r => setTimeout(r, 200));
    assert.equal(smtp.messages.length, countBefore, 'no email queued while email_reminder is false');
  });

  await t.test('simulated restart: second pass yields no second email (REM-03)', async () => {
    const countBefore = smtp.messages.length;
    await trigger(at9('2026-01-20'), mail); // same clocks again — everything claimed
    await new Promise(r => setTimeout(r, 200));
    assert.equal(smtp.messages.length, countBefore, 'no duplicate emails on a replay pass');
  });

  await mail.stop();
  smtp.srv.close();
  fs.rmSync(mailDir, { recursive: true, force: true });
});

test('REM-05: MAILER rejection is isolated — logged, never rethrown, process survives', async () => {
  /* Dead SMTP port: connection refused → sendNotif rejects on the .catch path. */
  const dead = net.createServer();
  await new Promise(r => dead.listen(0, '127.0.0.1', r));
  const deadPort = dead.address().port;
  dead.close();
  const deadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-reminders-dead-'));
  const deadSrv = await startServer({
    dataDir: deadDir,
    env: {
      MASTER_KEY: 'projects-reminders-dead-key',
      REMINDER_TEST_TOKEN: TOKEN,
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: String(deadPort),
      SMTP_REQUIRE_TLS: 'false',
      MAIL_FROM: 'noreply@test.local',
      APP_URL: 'http://app.test',
    },
  });
  const { own } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], {}, TZ, deadSrv);
  const emitted = own(await trigger(at9('2026-01-15'), deadSrv));
  assert.equal(emitted.length, 1, 'in-app row written regardless of SMTP health');
  await new Promise(r => setTimeout(r, 300));
  const health = await fetch(`${deadSrv.base}/api/health`);
  assert.equal(health.status, 200, 'process survived the MAILER rejection');
  assert.ok(deadSrv.output().includes('notif email'), 'failure logged via console.warn');
  await deadSrv.stop();
  fs.rmSync(deadDir, { recursive: true, force: true });
});
