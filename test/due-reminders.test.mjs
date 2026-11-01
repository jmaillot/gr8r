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

let owner = null; // one shared account — signup is throttled to 5/hour/IP per server process

/* Create a workspace under the shared account and overwrite its doc with a
   crafted fixture. `tasks` is a fn(memberId) so fixtures can reference the
   real member id. Returns the fixture handle plus an `own` row filter. */
async function makeWorkspace(tasks, prefs = {}, tz = TZ) {
  if (!owner) {
    const email = `owner-${++seq}@test.local`;
    await signup(server.base, { name: 'Owner', email, password: GOOD });
    const c = client(server.base, email);
    const logged = await c.post('/api/auth/login', { email, password: GOOD });
    assert.equal(logged.status, 200, 'owner login');
    owner = { email, c };
  }
  const created = await owner.c.post('/api/workspaces', { name: `Ws${++seq}`, slug: `ws-${seq}` });
  assert.equal(created.status, 201, `workspace create ${created.status}`);
  const ws = withDb(server.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(`ws-${seq}`));
  const mem = withDb(server.dbPath, db => db.prepare('select member_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id));
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
      notifPrefs: prefs,
    },
  };
  withDb(server.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id));
  const ids = new Set(fixtureTasks.map(t => t.id));
  return { ws, memberId: mem.member_id, email: owner.email, own: emitted => emitted.filter(n => ids.has(n.task)) };
}

const revisionOf = slug => withDb(server.dbPath, db => db.prepare('select revision from workspaces where slug = ?').get(slug).revision);
const notifRows = slug =>
  withDb(server.dbPath, db => JSON.parse(db.prepare('select doc from workspaces where slug = ?').get(slug).doc).data.notifs);
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
  projectId: 'p1',
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

test('REM-02/03: due-day morning fires (both open windows) once; second run is a no-op; due-date edit re-arms', async () => {
  const { ws, memberId, own } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })]);
  const revisionBefore = revisionOf(ws.slug);

  /* Window-open semantics: on the due date both day_before (window opened
     yesterday, never claimed) and morning_of are open — each fires once. */
  const emitted = own(await trigger(at9('2026-01-15')));
  assert.equal(emitted.length, 2, 'day_before + morning_of both fire on the due-date morning');
  for (const n of emitted) {
    assert.equal(n.type, 'due_reminder');
    assert.equal(n.to, memberId);
    assert.equal(n.by, null, 'system actor — by:null so the email self-skip never drops reminders');
    assert.match(n.snippet, /Due (today|tomorrow): Ship it/, 'distinguishing copy per offset');
  }
  assert.equal(notifRows(ws.slug).length, 2, 'both notifs appended to the doc');
  const keys = reminderKeys(ws.id);
  assert.equal(keys.length, 2);
  const tId = emitted[0].task;
  assert.ok(
    keys.includes(`${ws.id}:${tId}:${memberId}:day_before:2026-01-15`) &&
      keys.includes(`${ws.id}:${tId}:${memberId}:morning_of:2026-01-15`),
    'dedup keys carry ws, task, assignee, offset and due date',
  );
  assert.equal(revisionOf(ws.slug), revisionBefore + 2, 'two emits → exactly two revision bumps');

  /* Simulated restart: a fresh pass invocation (no shared memo) re-scans. */
  const again = own(await trigger(at9('2026-01-15')));
  assert.equal(again.length, 0, 'second pass emits nothing — transactional dedup (REM-03)');
  assert.equal(notifRows(ws.slug).length, 2);
  assert.equal(revisionOf(ws.slug), revisionBefore + 2);

  /* REM-03: editing the due date re-arms — the key carries the due date. */
  withDb(server.dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get(ws.id);
    const doc = JSON.parse(row.doc);
    doc.data.tasks.find(t => t.id === tId).due = '2026-01-16';
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id);
  });
  const reArmed = own(await trigger(at9('2026-01-16')));
  assert.equal(reArmed.length, 2, 'new due date → new keys → reminders re-arm');
  assert.ok(reArmed.every(n => !emitted.some(e => e.id === n.id)), 'fresh notification rows');
});

/* ----------------- Task 2: window matrix — day_before ----------------- */

test('REM-02: day_before opens the day before; month rollover is pure string math', async () => {
  const { ws, memberId: memberIdOf, own } = await makeWorkspace(m => [task(m, { due: '2026-02-01' })]);
  /* Jan 30: window not yet open (day_before = Jan 31). */
  assert.equal(own(await trigger(at9('2026-01-30'))).length, 0, 'day before the day-before: silent');
  const first = own(await trigger(at9('2026-01-31')));
  assert.deepEqual(first.map(n => n.snippet), ['Due tomorrow: Ship it'], 'day_before fires on Jan 31 for a Feb 1 due date');
  assert.ok(reminderKeys(ws.id).some(k => k.endsWith(':day_before:2026-02-01')));
  /* Due-date morning: day_before stays claimed, morning_of fires. */
  const second = own(await trigger(at9('2026-02-01')));
  assert.deepEqual(second.map(n => n.snippet), ['Due today: Ship it']);
  assert.deepEqual(
    reminderKeys(ws.id).sort(),
    [
      `${ws.id}:${first[0].task}:${memberIdOf}:day_before:2026-02-01`,
      `${ws.id}:${first[0].task}:${memberIdOf}:morning_of:2026-02-01`,
    ].sort(),
    'two ledger keys: one per offset',
  );
  /* Month boundary (and the DST-jump month): due Mar 1 → day_before = Feb 28. */
  const { own: own2 } = await makeWorkspace(m => [task(m, { due: '2026-03-01' })]);
  const feb = own2(await trigger(at9('2026-02-28')));
  assert.deepEqual(feb.map(n => n.snippet), ['Due tomorrow: Ship it'], 'day_before of Mar 1 is Feb 28');
});

test('REM-02: both offsets in one pass — task due today AND task due tomorrow', async () => {
  const { own } = await makeWorkspace(m => [
    task(m, { id: 'tToday', key: 'P1-T', title: 'Today', due: '2026-01-20' }),
    task(m, { id: 'tTomorrow', key: 'P1-M', title: 'Tomorrow', due: '2026-01-21' }),
  ]);
  const emitted = own(await trigger(at9('2026-01-20')));
  /* tToday: day_before (window open, unclaimed) + morning_of. tTomorrow: day_before. */
  assert.equal(emitted.length, 3);
  assert.deepEqual(
    emitted.filter(n => n.task === 'tToday').map(n => n.snippet).sort(),
    ['Due today: Today', 'Due tomorrow: Today'],
  );
  assert.deepEqual(emitted.filter(n => n.task === 'tTomorrow').map(n => n.snippet), ['Due tomorrow: Tomorrow']);
});

/* ------------------- REM-04: gating on task/project state ------------------- */

test('REM-04: done, archived, project-archived, private-hidden and due-less tasks never remind', async () => {
  const { own } = await makeWorkspace(m => [
    task(m, { id: 'tDone', key: 'P1-2', due: '2026-01-15', status: 'done' }),
    task(m, { id: 'tArch', key: 'P1-3', due: '2026-01-15', archived: true }),
    task(m, { id: 'tProjArch', key: 'P1-4', due: '2026-01-15', projectId: 'pArch' }),
    task(m, { id: 'tHidden', key: 'P1-5', due: '2026-01-15', projectId: 'pPriv' }),
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
    ['tOk', 'tOk'],
    'only the plain remindable task fires (both open offsets)',
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

/* --------------------- D-27-5: prefs gates (default ON) --------------------- */

test('D-27-5: due_reminder/past_due prefs === false gate in-app rows; missing keys stay ON', async () => {
  const { own: ownOff } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], { due_reminder: false, past_due: false });
  assert.equal(ownOff(await trigger(at9('2026-01-15'))).length, 0, 'due_reminder: false gates the due reminders');
  assert.equal(ownOff(await trigger(at9('2026-01-16'))).length, 0, 'past_due: false gates the nudge');

  /* Missing keys are ON (=== false disables — matches queueNotifEmails). */
  const { own: ownOn } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], {});
  assert.equal(ownOn(await trigger(at9('2026-01-15'))).length, 2, 'undefined prefs default to ON (both offsets)');
  const { own: ownPast } = await makeWorkspace(m => [task(m, { due: '2026-01-14' })], { past_due: false });
  const gated = ownPast(await trigger(at9('2026-01-15')));
  assert.equal(gated.filter(n => n.type === 'past_due').length, 0, 'past_due: false gates the overdue nudge even with due_reminder on');
  assert.ok(gated.every(n => n.type === 'due_reminder'), 'due reminders unaffected by past_due: false');
});

/* --------------------- REM-02: DST + label allow-list --------------------- */

test('REM-02: Pacific label maps through DST — the local date, not the UTC date, decides', async () => {
  const { own: ownP } = await makeWorkspace(m => [task(m, { due: '2026-03-09' })], {}, '(GMT-08:00) Pacific Time');
  const fire = ownP(await trigger('2026-03-09T16:00:00Z'));
  assert.ok(fire.some(n => n.snippet === 'Due today: Ship it'), '09:00 America/Los_Angeles on Mar 9 (PDT) opens the morning_of window');
  const { own: ownE } = await makeWorkspace(m => [task(m, { due: '2026-03-09' })], {}, '(GMT-08:00) Pacific Time');
  const notYet = ownE(await trigger('2026-03-08T16:00:00Z'));
  assert.deepEqual(notYet.map(n => n.snippet), ['Due tomorrow: Ship it'], 'Mar 8 local: only day_before is open for a Mar 9 due');
  /* Unknown/empty label → UTC fallback (legacy docs seed tz: ''). */
  const { own: ownU } = await makeWorkspace(m => [task(m, { due: '2026-01-15' })], {}, '');
  assert.ok(ownU(await trigger(at9('2026-01-15'))).some(n => n.snippet === 'Due today: Ship it'), 'empty tz label falls back to UTC');
});
