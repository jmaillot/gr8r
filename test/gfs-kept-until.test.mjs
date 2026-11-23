/* =====================================================================
   Phase 90 (90-03 task 1, SC-3 / D-90-16 refined) — the kept-position
   badge input: per-request bucket-position retention visibility.

   D-90-16 as refined: kept-until is the BUCKET POSITION ("kept: 3/7
   daily"), never a date — GFS is count-based per bucket and a run's
   deletion depends on future arrivals, so any date arithmetic is
   semantically wrong (90-RESEARCH Pitfall 1). The server computes the
   map per request from the task's CURRENT policy (gfsKeptPositions,
   beside assignGfsBuckets — the same bucket source + keep-N counting
   walk the rotation pass uses, so badge and projection cannot drift);
   the client renders the payload verbatim with zero GFS math.

   "Pure unit — import nothing from server internals": the helper lives
   in server.js beside assignGfsBuckets (importing server.js boots the
   whole app — no test imports it), so the positions are asserted via
   the tiny exported HTTP surface, the history GET. Idiom:
   test/backup-rotation.test.mjs (startServer-per-case, withDb row
   seeding, backdated created_at — no sleeps, no clock travel).

   Pinned here:
   - positions per bucket for seeded runs (yearly/monthly/weekly/daily
     first-of positions, exactly-one-bucket D-10);
   - arrival simulation: a new same-scale run moves every older
     same-bucket position up by one (proof the position is count-based,
     never derived from a date);
   - newest-verified run sits at position 1 (never beyond keep);
   - manual task_id-null runs (D-11) and non-succeeded runs carry NO
     keptPosition — payload-flag chrome (D-89-21);
   - position monotonicity within a bucket (older ⇒ strictly larger).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, login, signup, startServer, withDb } from './helpers/server.mjs';

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

/* Seed one run row (backdated created_at) — a fake row is enough: the
   kept-position computation reads rows only, never the archive bytes. */
function seedRun(srv, taskId, { id, at, status = 'succeeded' }) {
  withDb(srv.dbPath, db =>
    db.prepare('insert into backup_runs (id, task_id, scope, trigger, status, started_at, created_at) values (?,?,?,?,?,?,?)').run(
      id,
      taskId,
      JSON.stringify({ kind: 'instance' }),
      'scheduled',
      status,
      at,
      at,
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

const history = async (op, taskId) => {
  const res = await op.get(`/api/backup/runs?taskId=${encodeURIComponent(taskId)}`);
  assert.equal(res.status, 200, `history: ${res.status}`);
  return res.data.runs;
};
const keptByRunId = rows => Object.fromEntries(rows.filter(r => r.keptPosition).map(r => [r.id, r.keptPosition]));

const DAY = 24 * 3600 * 1000;
const HOUR = 3600 * 1000;
/* 2026-01-02 Fri (ISO week W01, first of year) — the yearly primer. */
const BASE = Date.UTC(2026, 0, 2, 2, 30);

/* ---------- positions per bucket + first-of assignment (D-10) ---------- */

test('keptPosition: exactly-one-bucket positions per scale for seeded runs (D-10, keep-N counting)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-kept@test.local');
    const taskId = await makeTask(server, op, 'Kept A');
    setRetention(server, taskId, { daily: 2, weekly: 2, monthly: 2, yearly: 2 });
    const y1 = seedRun(server, taskId, { id: 'kept-y1', at: BASE }); // first of 2026 → yearly
    const m1 = seedRun(server, taskId, { id: 'kept-m1', at: BASE + 31 * DAY }); // 2026-02-02 first of month → monthly
    const w1 = seedRun(server, taskId, { id: 'kept-w1', at: BASE + 38 * DAY }); // 2026-02-09 first of ISO week W07 → weekly
    const d1 = seedRun(server, taskId, { id: 'kept-d1', at: BASE + 39 * DAY }); // 2026-02-10 same week/month → daily
    const d2 = seedRun(server, taskId, { id: 'kept-d2', at: BASE + 40 * DAY }); // 2026-02-11 → daily

    const kept = keptByRunId(await history(op, taskId));
    assert.deepEqual(kept[y1], { position: 1, keep: 2, scale: 'yearly' });
    assert.deepEqual(kept[m1], { position: 1, keep: 2, scale: 'monthly' });
    assert.deepEqual(kept[w1], { position: 1, keep: 2, scale: 'weekly' });
    assert.deepEqual(kept[d2], { position: 1, keep: 2, scale: 'daily' });
    assert.deepEqual(kept[d1], { position: 2, keep: 2, scale: 'daily' }, 'the older daily run counts second within its bucket');
  } finally {
    await server.stop();
  }
});

/* ---------- arrival simulation: positions move with arrivals, not dates ---------- */

test('keptPosition: a new same-scale run moves every older same-bucket position up by one (count-based, never a date)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-kept-arrival@test.local');
    const taskId = await makeTask(server, op, 'Kept B');
    setRetention(server, taskId, { daily: 2, monthly: 3, yearly: 2 });
    /* Primer: 2026-01-02 → yearly. Same-day runs 2026-02-10 10:00..13:00:
       the 10:00 run is February's first → monthly; the rest share its ISO
       week W07 + month → daily. */
    const primer = seedRun(server, taskId, { id: 'kept-b-primer', at: BASE });
    const d10 = seedRun(server, taskId, { id: 'kept-b-m1', at: Date.UTC(2026, 1, 10, 10) });
    const d11 = seedRun(server, taskId, { id: 'kept-b-d1', at: Date.UTC(2026, 1, 10, 11) });
    const d12 = seedRun(server, taskId, { id: 'kept-b-d2', at: Date.UTC(2026, 1, 10, 12) });
    const d13 = seedRun(server, taskId, { id: 'kept-b-d3', at: Date.UTC(2026, 1, 10, 13) });

    let kept = keptByRunId(await history(op, taskId));
    assert.deepEqual(kept[d13], { position: 1, keep: 2, scale: 'daily' });
    assert.deepEqual(kept[d12], { position: 2, keep: 2, scale: 'daily' });
    assert.deepEqual(kept[d11], { position: 3, keep: 2, scale: 'daily' }, 'beyond keep — the rotation pass would delete it');
    assert.deepEqual(kept[d10], { position: 1, keep: 3, scale: 'monthly' }, 'the first-of-month run holds the monthly bucket');

    /* Arrival: a new daily run lands. Same run rows, same dates, same
       policy — yet every older same-bucket position moved up by one. A
       date-based rendering would have been silently wrong here. */
    const d14 = seedRun(server, taskId, { id: 'kept-b-d4', at: Date.UTC(2026, 1, 10, 14) });
    kept = keptByRunId(await history(op, taskId));
    assert.deepEqual(kept[d14], { position: 1, keep: 2, scale: 'daily' });
    assert.deepEqual(kept[d13], { position: 2, keep: 2, scale: 'daily' }, 'moved up: 1 → 2');
    assert.deepEqual(kept[d12], { position: 3, keep: 2, scale: 'daily' }, 'moved up: 2 → 3');
    assert.deepEqual(kept[d11], { position: 4, keep: 2, scale: 'daily' }, 'moved up: 3 → 4');
    assert.deepEqual(kept[primer], { position: 1, keep: 2, scale: 'yearly' }, 'other buckets untouched by the arrival');
  } finally {
    await server.stop();
  }
});

/* ---------- newest-verified sits at position 1 ---------- */

test('keptPosition: the newest succeeded run is position 1 — never beyond keep', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-kept-newest@test.local');
    const taskId = await makeTask(server, op, 'Kept C');
    setRetention(server, taskId, { daily: 3 });
    seedRun(server, taskId, { id: 'kept-c-primer', at: BASE });
    seedRun(server, taskId, { id: 'kept-c-d1', at: Date.UTC(2026, 1, 10, 10) });
    seedRun(server, taskId, { id: 'kept-c-d2', at: Date.UTC(2026, 1, 10, 11) });
    seedRun(server, taskId, { id: 'kept-c-d3', at: Date.UTC(2026, 1, 10, 12) });
    seedRun(server, taskId, { id: 'kept-c-d4', at: Date.UTC(2026, 1, 10, 13) });
    const rows = await history(op, taskId);
    const newest = rows[0]; // newest-first (created_at desc, id desc) — the server's order
    assert.equal(newest.id, 'kept-c-d4');
    assert.equal(newest.keptPosition.position, 1, 'the newest-verified run walks first in its bucket');
  } finally {
    await server.stop();
  }
});

/* ---------- payload-flag exclusions: manual + non-succeeded ---------- */

test('keptPosition: manual task_id-null runs (D-11) and non-succeeded runs carry NO keptPosition', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-kept-manual@test.local');
    const taskId = await makeTask(server, op, 'Kept D');
    setRetention(server, taskId, { daily: 2 });
    seedRun(server, taskId, { id: 'kept-d-primer', at: BASE });
    seedRun(server, taskId, { id: 'kept-d-ok', at: Date.UTC(2026, 1, 10, 10) });
    seedRun(server, taskId, { id: 'kept-d-failed', at: Date.UTC(2026, 1, 10, 11), status: 'failed' });
    seedRun(server, taskId, { id: 'kept-d-deleted', at: Date.UTC(2026, 1, 10, 12), status: 'deleted' });
    /* Manual Run-now archive outside rotation (D-11): task_id NULL. */
    seedRun(server, null, { id: 'kept-d-manual', at: Date.UTC(2026, 1, 10, 13) });

    const taskRows = await history(op, taskId);
    for (const r of taskRows) {
      if (r.status !== 'succeeded') assert.equal(r.keptPosition, undefined, `non-succeeded run ${r.id} carries no keptPosition`);
    }
    assert.ok(taskRows.find(r => r.id === 'kept-d-ok')?.keptPosition, 'the succeeded task run carries the badge input');
    assert.ok(taskRows.find(r => r.id === 'kept-d-deleted')?.keptPosition === undefined, 'a rotated-away row carries none');

    const manual = await history(op, 'manual');
    const row = manual.find(r => r.id === 'kept-d-manual');
    assert.ok(row, 'the manual branch lists the D-11 archive');
    assert.equal(row.keptPosition, undefined, 'manual runs (task_id null, outside rotation) never carry keptPosition');
  } finally {
    await server.stop();
  }
});

/* ---------- monotonicity within a bucket ---------- */

test('keptPosition: positions are strictly monotonic with age within a bucket', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-kept-mono@test.local');
    const taskId = await makeTask(server, op, 'Kept E');
    setRetention(server, taskId, { daily: 7 });
    seedRun(server, taskId, { id: 'kept-e-primer', at: BASE });
    seedRun(server, taskId, { id: 'kept-e-d1', at: Date.UTC(2026, 1, 10, 10) });
    seedRun(server, taskId, { id: 'kept-e-d2', at: Date.UTC(2026, 1, 10, 11) });
    seedRun(server, taskId, { id: 'kept-e-d3', at: Date.UTC(2026, 1, 10, 12) });
    seedRun(server, taskId, { id: 'kept-e-d4', at: Date.UTC(2026, 1, 10, 13) });
    const kept = keptByRunId(await history(op, taskId));
    assert.deepEqual(kept['kept-e-d1'], { position: 1, keep: 12, scale: 'monthly' }, "February's first run holds the monthly bucket");
    const daily = [kept['kept-e-d4'], kept['kept-e-d3'], kept['kept-e-d2']];
    for (let i = 1; i < daily.length; i++) {
      assert.equal(daily[i].scale, 'daily');
      assert.equal(daily[i].position, daily[i - 1].position + 1, 'older ⇒ strictly larger position within the bucket');
    }
  } finally {
    await server.stop();
  }
});

/* =====================================================================
   Phase 92 (Task 1) — pinned GFS date tests: the verbatim-relocation
   guard. These pin isoWeekKey/assignGfsBuckets behavior at the ISO
   nearest-Thursday boundaries THROUGH the observable history surface,
   so they must keep passing UNCHANGED when the pure functions relocate
   verbatim into export/gfs.js (Task 2). All math is pure UTC — DST is
   structurally irrelevant (no wall-clock zone ever enters the walk).
   ===================================================================== */

test('pinned GFS dates: ISO nearest-Thursday boundaries — Wed belongs to the previous week; Thu and Sun share the same ISO week', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-iso@test.local');
    const taskId = await makeTask(server, op, 'ISO boundaries');
    /* 2026-01-01 is a Thursday, ISO week 2026-W01 (which spans Mon Dec 29 – Sun Jan 4).
       Jan 6/7/11 are Tue/Wed/Sun of ISO week 2026-W02 (Mon Jan 5 – Sun Jan 11):
       the Wednesday belongs to W02 (the week of its nearest Thursday, Jan 8),
       and the Sunday CLOSES the same W02 — so it must stay daily, never weekly. */
    seedRun(server, taskId, { id: 'iso-thu', at: Date.UTC(2026, 0, 1, 12) }); // Thu Jan 1 → first of 2026 → yearly
    seedRun(server, taskId, { id: 'iso-tue', at: Date.UTC(2026, 0, 6, 12) }); // Tue Jan 6 → first of W02 → weekly
    seedRun(server, taskId, { id: 'iso-wed', at: Date.UTC(2026, 0, 7, 12) }); // Wed Jan 7 → same W02 → daily
    seedRun(server, taskId, { id: 'iso-sun', at: Date.UTC(2026, 0, 11, 12) }); // Sun Jan 11 → same W02 → daily
    const kept = keptByRunId(await history(op, taskId));
    assert.equal(kept['iso-thu'].scale, 'yearly', 'the Jan 1 run is the first of the calendar year');
    assert.equal(kept['iso-tue'].scale, 'weekly', 'the first run of ISO week W02 holds the weekly bucket');
    assert.equal(kept['iso-wed'].scale, 'daily', 'the Wednesday of the SAME ISO week (nearest Thursday = Jan 8) is daily');
    assert.equal(kept['iso-sun'].scale, 'daily', 'the Sunday closing the same ISO week is daily — ISO weeks end Sunday');
  } finally {
    await server.stop();
  }
});

test('pinned GFS dates: year rollover — Dec 29–31 land in W01 of the NEXT ISO year; Jan 1 opens the new isoYear', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-rollover@test.local');
    const taskId = await makeTask(server, op, 'Rollover');
    /* r1 Mon Jan 5 2026: first of the year (and of ISO 2026-W02) → yearly.
       r2 Wed Dec 2 2026: first of December → monthly.
       r3 Wed Dec 30 2026: ISO week is 2027-W01 (nearest Thursday = Jan 1 2027 —
          the rollover case) but 2026 and December are both already seen → weekly.
       r4 Mon Jan 4 2027: first of 2027 → yearly (Jan 1 of the new isoYear). */
    seedRun(server, taskId, { id: 'roll-jan', at: Date.UTC(2026, 0, 5, 9) });
    seedRun(server, taskId, { id: 'roll-dec', at: Date.UTC(2026, 11, 2, 9) });
    seedRun(server, taskId, { id: 'roll-w01', at: Date.UTC(2026, 11, 30, 9) });
    seedRun(server, taskId, { id: 'roll-2027', at: Date.UTC(2027, 0, 4, 9) });
    const kept = keptByRunId(await history(op, taskId));
    assert.equal(kept['roll-jan'].scale, 'yearly');
    assert.equal(kept['roll-dec'].scale, 'monthly');
    assert.equal(kept['roll-w01'].scale, 'weekly', 'Dec 30 2026 belongs to ISO week 2027-W01 — a NEW week despite the old calendar year/month');
    assert.equal(kept['roll-2027'].scale, 'yearly', 'Jan 4 2027 is the first run of isoYear 2027');
  } finally {
    await server.stop();
  }
});

test('pinned GFS dates: DST-irrelevance — the walk is pure UTC (a run inside a European DST switch keeps UTC week math)', async () => {
  const server = await startServer({});
  try {
    const op = await makeBackupOp(server, 'op-dst@test.local');
    const taskId = await makeTask(server, op, 'DST pure UTC');
    /* 2026-03-29 is the European spring-forward Sunday. Bucket math reads
       UTC calendar fields only — the run at 01:30 UTC (02:30 local, a wall
       time that does not exist in Europe/Paris that morning) still classifies
       by its UTC date/week, untouched by any tz. */
    seedRun(server, taskId, { id: 'dst-primer', at: Date.UTC(2026, 0, 2, 3) }); // yearly primer
    seedRun(server, taskId, { id: 'dst-march', at: Date.UTC(2026, 2, 29, 1, 30) }); // first of March → monthly
    const kept = keptByRunId(await history(op, taskId));
    assert.equal(kept['dst-march'].scale, 'monthly', 'the DST-boundary run classifies from UTC fields alone');
  } finally {
    await server.stop();
  }
});
