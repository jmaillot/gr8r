/* Phase 60 (60-01, DASH-01..04): the admin aggregate dashboard endpoint
   GET /api/workspaces/:slug/dashboard.

   Gate matrix first (DASH-04, D-52-4 convention): owner/admin → 200,
   member/viewer → EXACT 403 (status number asserted, never 404/redirect).
   The power-admin proof: an overdue task on a PRIVATE project reaches the
   admin payload with the private project's real name (the route reads the
   RAW stored doc, deliberately not docForClient), while members cannot reach
   the route at all.

   ANTI-TAUTOLOGY CONTRACT: expectations are hand-derived from the seeded
   fixture rows below (dates computed from the same tz.js-style anchor the
   server uses), NEVER by calling server predicates — this file imports
   nothing from server.js. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { login, startServer, withDb } from './helpers/server.mjs';
import {
  createVisibilityFixtureDb,
  VIS_PASSWORD,
  VIS_USER_IDS,
  VIS_WS,
} from './helpers/visibility-fixture.mjs';

/* The server's date anchor: localParts('') rides the resolveTz default zone
   (Europe/Paris). Replicate the exact Intl math — no production imports. */
const todayIso = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
};
const addDaysIso = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const EMAILS = Object.freeze({
  m_owner: 'owner@visfix.local',
  m_admin: 'admin@visfix.local',
  m_admin2: 'admin2@visfix.local',
  m_plain: 'plain@visfix.local',
  m_team: 'team@visfix.local',
  m_guest: 'guest@visfix.local',
});

const dash = (cl, slug = VIS_WS.slug, query = '') =>
  cl.get(`/api/workspaces/${slug}/dashboard${query}`);

let server;
let dir;
const S = {};

before(async () => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-dashboard-'));
  const dbPath = createVisibilityFixtureDb(dir);
  /* Seed dashboard rows INTO the fixture doc (hand-derived expectations
     below key off these rows). Dates are computed at seed time from the
     same anchor the server recomputes per request. */
  const today = todayIso();
  withDb(dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get(VIS_WS.id);
    const doc = JSON.parse(row.doc);
    doc.data.tasks.push(
      /* Overdue, PRIVATE project (power-admin proof): p_hidden ('Hidden From Plain'). */
      { id: 't_odhidden', key: 'odhidden', project: 'p_hidden', title: 'Overdue hidden task', status: 'todo', due: addDaysIso(today, -3), assignees: ['m_admin'], subtasks: [] },
      /* Overdue on the open project, oldest first group ordering. */
      { id: 't_od5', key: 'od5', project: 'p_open', title: 'Overdue five days', status: 'todo', due: addDaysIso(today, -5), assignees: [], subtasks: [] },
      { id: 't_od4', key: 'od4', project: 'p_open', title: 'Overdue four days', status: 'todo', due: addDaysIso(today, -4), assignees: [], subtasks: [] },
      /* Due exactly today → upcoming, NOT overdue (boundary). */
      { id: 't_today', key: 'today', project: 'p_open', title: 'Due today', status: 'todo', due: today, assignees: ['m_admin'], subtasks: [] },
      { id: 't_up1', key: 'up1', project: 'p_open', title: 'Due tomorrow', status: 'todo', due: addDaysIso(today, 1), assignees: ['m_plain', 'm_team'], subtasks: [] },
      { id: 't_up2', key: 'up2', project: 'p_open', title: 'Due in two days', status: 'todo', due: addDaysIso(today, 2), assignees: ['m_plain', 'm_team'], subtasks: [] },
      /* Done task: never in ANY panel; its assignee must not inflate load. */
      { id: 't_done', key: 'done', project: 'p_open', title: 'Already done', status: 'done', due: addDaysIso(today, -3), assignees: ['m_plain'], subtasks: [] },
      { id: 't_nodue', key: 'nodue', project: 'p_membershare', title: 'No due date', status: 'todo', assignees: [], subtasks: [] },
    );
    const nowMs = Date.now();
    doc.data.activity.unshift(
      { id: 'a_new', by: 'm_plain', verb: 'task_create', task: 't_up1', project: 'p_open', at: nowMs - 60 * 60 * 1000, extra: '' },        // 1 h old
      { id: 'a_3d', by: 'm_team', verb: 'task_complete', task: 't_done', project: 'p_open', at: nowMs - 3 * 24 * 60 * 60 * 1000, extra: '' }, // 3 d old
      { id: 'a_40d', by: 'm_admin', verb: 'task_create', task: 't_od5', project: 'p_open', at: nowMs - 40 * 24 * 60 * 60 * 1000, extra: '' }, // 40 d old
    );
    db.prepare('update workspaces set doc = ? where id = ?').run(JSON.stringify(doc), VIS_WS.id);
  });
  server = await startServer({ dataDir: dir });
  for (const [mid, email] of Object.entries(EMAILS)) {
    const session = await login(server.base, email, VIS_PASSWORD);
    assert.equal(session.status, 200, `${mid} signs in`);
    S[mid] = session.client;
  }
});

after(async () => {
  await server?.stop();
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

/* ---- 1. Gate matrix (DASH-04, D-52-4: the server gate is the control) ---- */

test('gate: owner and admins receive 200; member and viewer receive EXACTLY 403', async () => {
  for (const mid of ['m_owner', 'm_admin', 'm_admin2']) {
    const res = await dash(S[mid]);
    assert.equal(res.status, 200, `${mid} (admin tier) → 200`);
  }
  for (const mid of ['m_plain', 'm_team', 'm_guest']) {
    const res = await dash(S[mid]);
    assert.equal(res.status, 403, `${mid} → exact 403 (never 404, never a redirect)`);
  }
});

test('gate: unauthenticated request is refused by the session gate', async () => {
  const anon = (await login(server.base, 'nobody@visfix.local', VIS_PASSWORD)).client;
  const res = await dash(anon);
  assert.equal(res.status, 401, 'no session → 401 signInRequired');
});

test('gate: a nonexistent workspace slug answers 404', async () => {
  const res = await dash(S.m_admin, 'no-such-workspace');
  assert.equal(res.status, 404);
});

/* ---- 2. Overdue aggregate: power-admin proof + grouping/sorting (DASH-01, D-10) ---- */

test('overdue: the PRIVATE project\'s overdue task reaches the admin payload with its real name (power-admin proof)', async () => {
  const res = await dash(S.m_admin);
  assert.equal(res.status, 200);
  const wire = JSON.stringify(res.data);
  assert.ok(wire.includes('Hidden From Plain'), 'the private project\'s real name is on the wire');
  const hiddenGroup = res.data.overdue.find(g => g.projectId === 'p_hidden');
  assert.ok(hiddenGroup, 'the private project forms its own overdue group');
  assert.ok(hiddenGroup.tasks.some(t => t.key === 'odhidden'), 'the private overdue task is listed');
});

test('overdue: groups sorted by oldest dueDate, tasks within groups by dueDate (D-10)', async () => {
  const res = await dash(S.m_admin);
  const groupIds = res.data.overdue.map(g => g.projectId);
  assert.deepEqual(groupIds, ['p_open', 'p_hidden'], 'p_open (oldest −5d) before p_hidden (−3d)');
  const open = res.data.overdue.find(g => g.projectId === 'p_open');
  assert.deepEqual(open.tasks.map(t => t.key), ['od5', 'od4'], 'tasks within the group ascend by dueDate');
  for (const g of res.data.overdue) {
    assert.deepEqual(
      Object.keys(g).sort(),
      ['projectId', 'projectName', 'tasks'],
      'group entries carry exactly what the panel renders plus keys',
    );
    for (const t of g.tasks) assert.deepEqual(Object.keys(t).sort(), ['due', 'key', 'name']);
  }
});

test('overdue: the due-today task is NOT overdue (boundary), and done tasks appear in NO panel', async () => {
  const res = await dash(S.m_admin);
  const wire = JSON.stringify(res.data);
  assert.equal(wire.includes('"today"'), false, 'due-today task absent from overdue (it belongs to upcoming)');
  for (const needle of ['"done"', 'Already done']) {
    assert.equal(wire.includes(needle), false, `done task invisible: ${needle}`);
  }
});

/* ---- 3. Payload scaffolding: the four-panel shape (DASH-04 single payload) ---- */

test('payload: exactly the four aggregate keys, scaffolding arrays present', async () => {
  const res = await dash(S.m_admin);
  assert.deepEqual(Object.keys(res.data).sort(), ['activity', 'load', 'overdue', 'upcoming']);
  assert.deepEqual(res.data.load, []);
  assert.deepEqual(res.data.upcoming, []);
  assert.deepEqual(res.data.activity, []);
});
