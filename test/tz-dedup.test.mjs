/* Dedup-under-tz-change edge tests (Phase 44, D-11/D-12) + multi-member
   ordering determinism. Real server, real SQLite, clock injection via
   /api/internal/reminder-pass — the same harness discipline as
   test/due-reminders.test.mjs: one shared account per server, unique task
   ids per fixture, assertions filtered to the fixture's own rows.

   Contract under test: the digest claim key `${ws.id}:${user_id}:digest:
   ${localDate}` and the reminder claim key `${ws.id}:${t.id}:${assignee}:
   ${offset}:${due}` are byte-identical to the pre-Phase-44 ledger — a tz
   change never re-fires an already-claimed emission for the same localDate,
   and a tz change yielding a DIFFERENT localDate fires exactly one new
   legitimate claim (re-window allowed, no ledger reset). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { startServer, withDb, signup, client } from './helpers/server.mjs';

const GOOD = 'correct-horse-9';
const TOKEN = 'reminder-test-token';

let server;
let tempDir;
let seq = 0;

const trigger = (nowIso, srv = server) =>
  fetch(`${srv.base}/api/internal/reminder-pass`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-reminder-token': TOKEN },
    body: JSON.stringify({ now: nowIso }),
  }).then(async r => {
    assert.equal(r.status, 200, `trigger status ${r.status}`);
    return (await r.json());
  });

const owners = new Map();

async function sharedOwner(srv = server) {
  if (!owners.has(srv.base)) {
    const email = `owner-${++seq}@test.local`;
    await signup(srv.base, { name: 'Owner', email, password: GOOD });
    const c = client(srv.base, email);
    const logged = await c.post('/api/auth/login', { email, password: GOOD });
    assert.equal(logged.status, 200, 'owner login');
    owners.set(srv.base, { email, c });
  }
  return owners.get(srv.base);
}

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

/* Create a workspace and overwrite its doc with a crafted fixture:
   arbitrary members[] (id/tz pairs), one project, given tasks. An entry
   with id 'OWNER' is replaced by the real membership member_id so tz
   lookups match the digest/reminder resolution sites. */
async function fixture({ members, tasks, digest = false, srv = server } = {}) {
  const owner = await sharedOwner(srv);
  const created = await owner.c.post('/api/workspaces', { name: `Ws${++seq}`, slug: `ws-${seq}` });
  assert.equal(created.status, 201, 'workspace created');
  const ws = withDb(srv.dbPath, db => db.prepare('select * from workspaces where slug = ?').get(`ws-${seq}`));
  const mem = withDb(srv.dbPath, db =>
    db.prepare('select member_id, user_id from memberships where workspace_id = ? order by rowid limit 1').get(ws.id));
  assert.ok(mem?.member_id, 'membership carries a member_id');
  members = members.map(m => (m.id === 'OWNER' ? { ...m, id: mem.member_id } : m));
  const fixtureTasks = typeof tasks === 'function' ? tasks(mem.member_id) : tasks;
  const doc = {
    data: {
      members,
      projects: [{ id: 'p1', name: 'P1' }],
      tasks: fixtureTasks,
      comments: [],
      activity: [],
      notifs: [],
      files: [],
    },
  };
  withDb(srv.dbPath, db => db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), ws.id));
  if (digest) {
    withDb(srv.dbPath, db =>
      db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)')
        .run(ws.id, mem.user_id, JSON.stringify({ email_digest: true })));
  }
  const ids = new Set(fixtureTasks.map(t => t.id));
  return { ws, memberId: mem.member_id, userId: mem.user_id, owner,
    own: r => (r?.emitted || r || []).filter(n => ids.has(n.task)) };
}

const setMemberTz = (wsId, memberId, tz, srv = server) =>
  withDb(srv.dbPath, db => {
    const doc = JSON.parse(db.prepare('select doc from workspaces where id = ?').get(wsId).doc);
    doc.data.members.find(m => m.id === memberId).tz = tz;
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), wsId);
  });

const digestKeys = wsId =>
  withDb(server.dbPath, db => db.prepare('select dedup_key from reminders_sent where workspace_id = ?').all(wsId).map(r => r.dedup_key));

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tz-dedup-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-tz-dedup-key', REMINDER_TEST_TOKEN: TOKEN } });
});

after(async () => {
  await server?.stop();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

/* (a) digest: fired in London, switch to Tokyo, SAME localDate → no refire */
test('D-11a: digest fired once; a tz switch that keeps the same localDate never re-fires', async () => {
  const { ws, memberId } = await fixture({
    members: [{ id: 'OWNER', name: 'Owner', tz: '(GMT+00:00) London' }],
    tasks: m => [task(m, { due: '2026-01-15' })],
    digest: true,
  });
  /* 14:00Z = 14:00 London (01-15) = 23:00 Tokyo (01-15) — same localDate in both zones. */
  const first = await trigger('2026-01-15T14:00:00Z');
  assert.equal(first.digests, 1, 'first pass fires the digest once (14:00 London, window open)');
  const after = await trigger('2026-01-15T14:00:00Z');
  assert.equal(after.digests, 0, 'repeat pass is idempotent (already claimed)');
  setMemberTz(ws.id, memberId, 'Asia/Tokyo');
  const tokyoSameDate = await trigger('2026-01-15T14:00:00Z');
  assert.equal(tokyoSameDate.digests, 0, 'tz switch to Tokyo, same localDate 2026-01-15 → no refire (D-11)');
  assert.equal(digestKeys(ws.id).filter(k => k.endsWith(':digest:2026-01-15')).length, 1, 'exactly one claim row for (user, 2026-01-15)');
});

/* (b) digest: tz switch yielding a DIFFERENT localDate → exactly one new claim */
test('D-11b: a tz switch yielding a different localDate fires exactly one new claim', async () => {
  const { ws, memberId, userId } = await fixture({
    members: [{ id: 'OWNER', name: 'Owner', tz: '(GMT+00:00) London' }],
    tasks: m => [task(m, { due: '2026-01-15' })],
    digest: true,
  });
  const first = await trigger('2026-01-15T14:00:00Z');
  assert.equal(first.digests, 1, 'claim 2026-01-15 in London');
  setMemberTz(ws.id, memberId, '(GMT-08:00) Pacific Time');
  /* 2026-01-16T18:00:00Z = 10:00 Los Angeles on 01-16 — a NEW localDate; the
     task (due 01-15) is now overdue content. Exactly one new claim. */
  const rewindowed = await trigger('2026-01-16T18:00:00Z');
  assert.equal(rewindowed.digests, 1, 'different localDate → exactly one new legitimate claim (D-12 re-window)');
  const repeat = await trigger('2026-01-16T18:00:00Z');
  assert.equal(repeat.digests, 0, 'no duplicate for the same (user, localDate)');
  const digestRows = digestKeys(ws.id).filter(k => k.includes(':digest:'));
  assert.equal(digestRows.length, 2, 'two claims total: 01-15 (London) + 01-16 (LA)');
  assert.deepEqual(digestRows.sort(), [
    `${ws.id}:${userId}:digest:2026-01-15`,
    `${ws.id}:${userId}:digest:2026-01-16`,
  ], 'D-11 ledger key shape byte-identical: ws:user:digest:localDate');
});

/* reminder variant of (a): claimed reminder does not re-fire under tz change */
test('D-11 reminder variant: claimed (task, assignee, offset, due) never re-fires on tz change', async () => {
  const { ws, own, memberId } = await fixture({
    members: [{ id: 'OWNER', name: 'Owner', tz: '(GMT+00:00) London' }],
    tasks: m => [task(m, { due: '2026-01-15' })],
  });
  const first = own(await trigger('2026-01-15T08:00:00Z'));
  assert.equal(first.length, 1, 'morning_of fires at 08:00 London');
  setMemberTz(ws.id, memberId, 'Asia/Tokyo');
  /* 2026-01-15T08:00:00Z is 17:00 Tokyo on localDate 01-15 — same window
     semantics, and the claim key carries offset+due (not the tz) anyway. */
  const tokyo = own(await trigger('2026-01-15T08:00:00Z'));
  assert.equal(tokyo.length, 0, 'no refire for the same claim key under a tz change');
  const laterTokyo = own(await trigger('2026-01-15T14:00:00Z'));
  assert.equal(laterTokyo.length, 0, 'still no refire on later ticks — exactly-once holds');
  assert.equal(digestKeys(ws.id).length, 1, 'exactly one reminder claim row');
});

/* ordering: two members with different tzs fire independently in one pass */
test('D-09 ordering: Paris and LA assignees resolve their own windows in one pass — no leakage, idempotent', async () => {
  const { own } = await fixture({
    members: [
      { id: 'm_paris', name: 'Paris', tz: 'Europe/Paris' },
      { id: 'm_la', name: 'LA', tz: 'America/Los_Angeles' },
    ],
    tasks: [task('m_paris', { due: '2026-01-15' }), task('m_la', { due: '2026-01-15' })],
  });
  /* 08:00Z → 09:00 Paris (window open, fires) vs 00:00 LA (window closed). */
  const early = own(await trigger('2026-01-15T08:00:00Z'));
  assert.equal(early.length, 1, 'only the Paris assignee fires on this pass');
  assert.equal(early[0].to, 'm_paris', 'no member receives the other member’s emission');
  /* 17:00Z → 18:00 Paris (already claimed) vs 09:00 LA (now fires). */
  const late = own(await trigger('2026-01-15T17:00:00Z'));
  assert.equal(late.length, 1, 'the LA assignee fires at their own 08:00 window');
  assert.equal(late[0].to, 'm_la');
  const repeat = own(await trigger('2026-01-15T17:00:00Z'));
  assert.equal(repeat.length, 0, 'repeated passes are idempotent — no double-claim');
});
