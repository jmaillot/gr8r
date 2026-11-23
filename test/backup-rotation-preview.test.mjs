/* =====================================================================
   Phase 90 (90-03 task 2, SC-3 / D-90-12..15) — the rotation projection
   endpoint GET /api/backup/rotation-preview: the on-demand DRY-RUN of the
   GFS keep-N pass.

   Pinned here:
   - guard funnel: capability 403 backupManageRequired for non-operators;
     429 tooManyAttempts past the budget (10 / 15 min, D-89-22 idiom — a
     refused attempt still consumed a try, D-90-15);
   - never-run task → 200 { noRuns: true } (keyed empty state, D-90-14);
   - seeded multi-scale task → grouped counts match the keep-N walk's
     expectation (same assignGfsBuckets + reverse counting as
     runBackupRotationPass), runs carry filename, the newest-verified run
     is NEVER among the candidates (T-87-07 exclusion);
   - MUTATION-FREEDOM (D-90-12): backup_runs rows/statuses byte-identical
     before vs after the call (withDb snapshot) and ZERO new audit rows —
     a projection mutates nothing.

   Harness idiom: test/backup-rotation.test.mjs (startServer-per-case,
   withDb row inspection/backdating — no sleeps, no clock travel).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

async function makeTask(srv, op, name) {
  const created = await op.post('/api/backup/tasks', { name, scope: { kind: 'instance' }, cron: '30 2 * * *' });
  assert.equal(created.status, 200, `create: ${JSON.stringify(created.data)}`);
  return created.data.task.id;
}

/* Seed one succeeded run row (backdated created_at) — the projection reads
   rows only, never archive bytes. */
function seedRun(srv, taskId, { id, at }) {
  withDb(srv.dbPath, db =>
    db.prepare('insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at, filename) values (?,?,?,?,?,?,?,?)').run(
      id,
      taskId,
      JSON.stringify({ kind: 'instance' }),
      'scheduled',
      'succeeded',
      at,
      at,
      `backup-${id}.tar.gz`,
    ),
  );
  return id;
}

const setRetention = (srv, taskId, retention) =>
  withDb(srv.dbPath, db =>
    db.prepare('update backup_tasks set retention_daily = ?, retention_weekly = ?, retention_monthly = ?, retention_yearly = ? where id = ?').run(
      retention.daily ?? 7,
      retention.weekly ?? 4,
      retention.monthly ?? 12,
      retention.yearly ?? 5,
      taskId,
    ),
  );

const preview = async (op, taskId) => {
  const res = await op.get(`/api/backup/rotation-preview?taskId=${encodeURIComponent(taskId)}`);
  return res;
};

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
/* 2026-01-02 Fri — the yearly primer (the task's first run of 2026). */
const BASE = Date.UTC(2026, 0, 2, 2, 30);

/* ---------- guard funnel ---------- */

test('rotation-preview: 403 backupManageRequired for a non-operator (BACKUP_MANAGE gate)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-prev@test.local');
    const taskId = await makeTask(server, op, 'Prev A');
    const joined = await signup(server.base, { name: 'Plain', email: 'plain-prev@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain-prev@test.local', 'password-1234')).client;
    const res = await preview(plain, taskId);
    assert.equal(res.status, 403);
    assert.equal(res.data?.code, 'backupManageRequired');
  } finally {
    await server.stop();
  }
});

test('rotation-preview: 429 tooManyAttempts past the budget (10 / 15 min, D-89-22)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-prev-thr@test.local');
    const taskId = await makeTask(server, op, 'Prev B');
    for (let i = 0; i < 10; i++) {
      const res = await preview(op, taskId);
      assert.notEqual(res.status, 429, `attempt ${i + 1} is inside the budget`);
    }
    const res = await preview(op, taskId);
    assert.equal(res.status, 429);
    assert.equal(res.data?.code, 'tooManyAttempts');
  } finally {
    await server.stop();
  }
});

/* ---------- never-run → keyed empty state ---------- */

test('rotation-preview: a never-run task answers 200 { noRuns: true } (D-90-14)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-prev-empty@test.local');
    const taskId = await makeTask(server, op, 'Prev C');
    const res = await preview(op, taskId);
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { noRuns: true });
  } finally {
    await server.stop();
  }
});

/* ---------- grouped projection over a multi-scale task ---------- */

test('rotation-preview: grouped counts match the keep-N walk; runs carry filename; newest never projected', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-prev-run@test.local');
    const taskId = await makeTask(server, op, 'Prev D');
    setRetention(server, taskId, { daily: 2 });
    seedRun(server, taskId, { id: 'prev-primer', at: BASE }); // yearly (first of 2026)
    seedRun(server, taskId, { id: 'prev-m1', at: BASE + 31 * DAY }); // Feb 2 → monthly
    seedRun(server, taskId, { id: 'prev-w1', at: BASE + 38 * DAY }); // Feb 9 → weekly
    /* Five same-day dailies (Feb 10, ISO week W07, month 2) with keep 2 →
       the three OLDEST are candidates. */
    const dailies = [];
    for (let i = 0; i < 5; i++) dailies.push(seedRun(server, taskId, { id: `prev-d${i}`, at: Date.UTC(2026, 1, 10, 10 + i) }));

    const res = await preview(op, taskId);
    assert.equal(res.status, 200);
    const { groups, total } = res.data;
    assert.deepEqual(
      Object.keys(groups),
      ['daily', 'weekly', 'monthly', 'yearly'],
      'the four groups render in the fixed order with honest zeros (D-90-14)',
    );
    assert.equal(groups.daily.count, 3, 'keep 2 over 5 dailies → the 3 oldest are candidates');
    assert.equal(groups.weekly.count, 0, 'honest zero — the weekly slot is within keep');
    assert.equal(groups.monthly.count, 0, 'honest zero');
    assert.equal(groups.yearly.count, 0, 'honest zero');
    assert.equal(total, 3);
    for (const r of groups.daily.runs) {
      assert.equal(typeof r.filename, 'string');
      assert.ok(r.filename.startsWith('backup-prev-d'), 'projected runs carry their filename');
    }
    const projectedIds = new Set(groups.daily.runs.map(r => r.id));
    for (const id of ['prev-d2', 'prev-d1', 'prev-d0']) assert.ok(projectedIds.has(id), `the oldest daily ${id} is a candidate`);
    for (const id of ['prev-d4', 'prev-d3']) assert.ok(!projectedIds.has(id), `within-keep daily ${id} is not a candidate`);
    assert.ok(!projectedIds.has('prev-d4'), 'the newest-verified run is NEVER among the candidates (T-87-07)');
    assert.ok(!['prev-primer', 'prev-m1', 'prev-w1'].some(id => projectedIds.has(id)), 'other buckets untouched');
  } finally {
    await server.stop();
  }
});

/* ---------- mutation-freedom (D-90-12) ---------- */

test('rotation-preview: the dry-run mutates nothing — rows/statuses identical, zero audit rows', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-prev-mut@test.local');
    const taskId = await makeTask(server, op, 'Prev E');
    setRetention(server, taskId, { daily: 2 });
    seedRun(server, taskId, { id: 'prev-e-primer', at: BASE });
    for (let i = 0; i < 4; i++) seedRun(server, taskId, { id: `prev-e-d${i}`, at: Date.UTC(2026, 1, 10, 10 + i) });
    const snapshot = () =>
      withDb(server.dbPath, db => ({
        runs: db.prepare('select * from backup_runs order by id').all(),
        audit: db.prepare('select count(*) as n from audit_log').get().n,
      }));
    const before = snapshot();
    const res = await preview(op, taskId);
    assert.equal(res.status, 200);
    assert.equal(res.data.total > 0, true, 'the projection actually has candidates to show');
    const after = snapshot();
    assert.deepEqual(after.runs, before.runs, 'backup_runs byte-identical — no unlink, no status write');
    assert.equal(after.audit, before.audit, 'zero new audit rows');
    /* And the on-disk (non-)deletion: nothing was removed either — the seed
       wrote no archive files, but assert no file was created/removed under
       the backups dir is moot here; the row snapshot IS the mutation proof. */
  } finally {
    await server.stop();
  }
});

/* ---------- 90-review WR-02: the stale-projection race ----------
   Source-assertion (backup-history-client discipline): the action's
   staging must be guarded on the mounted form that requested it — a
   cancel/save/new/edit while the projection is in flight reassigns
   S.ui.backupTaskForm, and the late response must land NOWHERE. */

test('90-review WR-02: the preview action stage-guards its response on the mounted form — a stale projection never re-stages after the form changed', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'actions', 'actions.js'), 'utf8');
  const start = src.indexOf('A.backupPreviewDeletions');
  const end = src.indexOf('A.backupDeletionsToggle');
  assert.ok(start !== -1 && end > start, 'the preview action exists beside the toggle');
  const action = src.slice(start, end);

  /* The form identity is captured BEFORE the await and re-checked AFTER
     it — the mounted form object IS the request token (no new global). */
  const awaitIdx = action.indexOf('await api.backupRotationPreview');
  assert.ok(awaitIdx !== -1, 'the action awaits the projection endpoint');
  assert.ok(
    action.indexOf('const form = S.ui.backupTaskForm;') !== -1 && action.indexOf('const form = S.ui.backupTaskForm;') < awaitIdx,
    'the requesting form is captured before the await',
  );
  assert.ok(
    action.indexOf('form.editing !== taskId') !== -1 && action.indexOf('form.editing !== taskId') < awaitIdx,
    'the task id matches the mounted edit form before staging the loading state',
  );
  const guardIdx = action.indexOf('if (S.ui.backupTaskForm !== form) return;');
  assert.ok(guardIdx !== -1 && guardIdx > awaitIdx, 'the stale guard sits after the await');
  /* BOTH post-response mutations (the keyed-refusal clear and the result
     staging) come after the guard — no path writes S.ui.backupDeletions
     on a stale response. */
  const clearIdx = action.indexOf('S.ui.backupDeletions = null;');
  const stageIdx = action.indexOf('S.ui.backupDeletions = res.data?.noRuns');
  assert.ok(clearIdx > guardIdx && stageIdx > guardIdx, 'every staging write is behind the stale guard');

  /* Defense in depth: a brand-new form never inherits the projection. */
  const newStart = src.indexOf('A.backupTaskNew');
  const newEnd = src.indexOf('A.backupTaskEdit');
  assert.ok(newStart !== -1 && newEnd > newStart, 'backupTaskNew exists');
  assert.match(src.slice(newStart, newEnd), /S\.ui\.backupDeletions = null;/, 'backupTaskNew clears the ephemeral projection');
});

/* ---------- 90-UAT item 6: the projection detail list scrolls ----------
   Live-UAT finding (48 seeded runs → 33 daily candidates): the expanded
   per-scale detail list rendered every filename at full height with no
   scroll container — it pushed the page instead of scrolling within the
   panel, exactly what the UAT row forbids. The container must carry an
   explicit max-height + overflow-y:auto so the list scrolls in place. */

test('90-UAT item 6: the expanded projection detail list scrolls within the panel — max-height + overflow-y on the detail container', () => {
  const src = fs.readFileSync(path.join(REPO, 'src', 'pages', 'backup.js'), 'utf8');
  const start = src.indexOf('const detailId = `backupDel-${scale}`');
  assert.ok(start !== -1, 'the detail container template exists');
  const row = src.slice(start, src.indexOf('};', start));
  assert.match(row, /id="\$\{detailId\}"[^`]*max-height:\d+px;overflow-y:auto/, 'the expanded detail list container carries an explicit max-height and scrolls vertically instead of pushing the page');
  assert.match(row, /class="mono trunc" style="max-width:\d+px" title="/, 'each detail row stays trunc+title (90-03 deviation accepted by owner)');
});
