/* =====================================================================
   Restore instance-DR suite (Phase 89, plan 89-05, BKRST-04).

   Pins the disaster-recovery restore — engine-level
   restoreInstanceUnit + route-level POST /api/backup/restore/instance:
   - DR replaces the DATA tables (workspaces doc-and-all + roster) in
     ONE tx; the instance stays live mid-restore (D-89-26 — no
     maintenance mode; the restore_lock is the only concurrency control);
   - instance_roles rebuild is EXCEPTED from the operational skip
     (D-89-8): archive rows rebuild with per-row user_id validation
     against LIVE users — dead ids skip + report, never dangling, never
     resurrecting an account (prohibition P9);
   - every other operational table (saved_views, user_notif_prefs,
     webhook_hooks, email_outbox, …) is skipped + counted into the run
     summary (OQ4 resolution); DR emits NO email claims (D-89-28 — the
     re-login wall is the notification);
   - `delete from sessions` runs strictly POST-commit and removes every
     session INCLUDING the initiator's (D-89-25) — a planted pre-commit
     revocation attempt is the negative test;
   - the pre_restore snapshot machinery mirrors the overwrite unit
     (planner flag 1: tag on the restore_runs row + audit, trigger
     stays 'manual');
   - route: the guard chain rides CAP.INSTANCE_ROLES_MANAGE — in NO role
     map, so the gate IS Super-Admin-only (D-89-21 funnel discipline);
     refusal keyed operatorOnly (the existing code, ×5 since Phase 85 —
     NO new refusal code) + audited; the confirm phrase re-validated
     SERVER-side === 'RESTORE-INSTANCE' exactly (D-89-27/P8); throttle
     restoreinstance|<id> 3/15min consuming a try (D-89-22).

   Harness: engine tests ride the DATA_DIR harness (test/
   restore-overwrite.test.mjs idiom); route tests ride startServer-per-
   case (test/restore-routes.test.mjs idiom). Failure injection rides
   the unit's documented _hooks (afterSnapshot / midTx).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-instance-dr-'));
process.env.DATA_DIR = DATA_DIR;
delete process.env.BACKUPS_DIR;
const FILES_DIR = path.join(DATA_DIR, 'files');
const LOGOS_DIR = path.join(DATA_DIR, 'logos');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

const db = await import('../db-adapter.mjs');
const backup = await import('../export/backup.js');
const restore = await import('../export/restore.js');

const T = 1700000000000;

async function freshDb() {
  await db.close();
  await db.connectDb({ dbPath: path.join(DATA_DIR, 'projects.db') });
  await db.runSchema(db.SQLITE_SCHEMA);
}

const OP = { id: 'user-op-000000000000', email: 'op@test.local', name: 'Operator' };
const LIVE = { id: 'user-live-0000000000', email: 'live@test.local', name: 'Live Member' };
const DEAD = 'user-dead-00000000000';

function wsDoc(wsId, { projectId = 'p1', fileId = null, logo = null } = {}) {
  return {
    data: {
      projects: [{ id: projectId, name: `Project ${wsId}`, color: '#33aa55' }],
      tasks: [{ id: 't1', project: projectId, title: 'Task', desc: '' }],
      comments: [],
      files: fileId ? [{ id: fileId, project: projectId, name: 'a.txt', ext: 'txt' }] : [],
      teams: [],
      projOrder: [projectId],
      logo,
      members: [],
      activity: [],
      notifs: [],
      events: [],
      savedViews: [],
      recentSearches: [],
    },
  };
}

let events = [];
restore.setRestoreRunEmitter(async e => events.push(e));

let sourceRun = null;

async function resetWorld() {
  events = [];
  await db.run('pragma foreign_keys = off');
  for (const t of ['memberships', 'team_members', 'invites', 'instance_roles', 'audit_log', 'backup_runs', 'restore_runs', 'workspaces', 'users', 'sessions', 'saved_views', 'user_notif_prefs', 'webhook_hooks', 'email_outbox']) {
    await db.run(`delete from ${t}`);
  }
  fs.rmSync(FILES_DIR, { recursive: true, force: true });
  fs.rmSync(LOGOS_DIR, { recursive: true, force: true });
  fs.rmSync(BACKUPS_DIR, { recursive: true, force: true });
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.mkdirSync(LOGOS_DIR, { recursive: true });

  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [OP.id, OP.email, OP.name, 'x', T]);
  await db.run('insert into users (id, email, name, password_hash, created_at) values (?,?,?,?,?)', [LIVE.id, LIVE.email, LIVE.name, 'x', T]);

  /* The archive world: two workspaces + roster + the operational rows DR
     must skip. ws-a carries a file blob f1 + logo lg1. */
  for (const [wsId, slug, fileId, logo] of [['ws-a', 'alpha', 'f1', 'lg1'], ['ws-b', 'beta', null, null]]) {
    await db.run(
      'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
      [wsId, slug, wsId === 'ws-a' ? 'Alpha WS' : 'Beta WS', '#123456', JSON.stringify(wsDoc(wsId, { fileId, logo })), 3, T, T, 0],
    );
    await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [wsId, OP.id, 'owner', `m_${OP.id.slice(0, 8)}`, 'manual']);
    if (wsId === 'ws-a') await db.run('insert into memberships (workspace_id, user_id, role, member_id, provenance) values (?,?,?,?,?)', [wsId, LIVE.id, 'member', 'm_live-mem', 'manual']);
  }
  await db.run('insert into invites (token_hash, email, role, workspace_id, created_by, created_at, expires_at) values (?,?,?,?,?,?,?)', ['hash-live', 'newbie@test.local', 'member', 'ws-a', OP.id, T, T + 60000]);
  /* The dead-id instance_roles row: the P9 probe (planted FK-off — the
     real vector is a cross-instance DR). */
  await db.run('insert into instance_roles (id, user_id, role, granted_by, granted_at) values (?,?,?,?,?)', ['ir-live', LIVE.id, 'backup_operator', OP.id, T]);
  await db.run('insert into instance_roles (id, user_id, role, granted_by, granted_at) values (?,?,?,?,?)', ['ir-dead', DEAD, 'restore_operator', OP.id, T]);
  /* Operational rows DR must SKIP (kept live, listed in the summary). */
  await db.run('insert into saved_views (workspace_id, user_id, key, name, blob, schema_version) values (?,?,?,?,?,?)', ['ws-a', OP.id, 'board', 'My view', '{}', 1]);
  await db.run('insert into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)', ['ws-a', OP.id, '{}']);
  await db.run('insert into webhook_hooks (id, workspace_id, project_id, url, secret, events, status, created_by, created_at) values (?,?,?,?,?,?,?,?,?)', ['wh-1', 'ws-a', 'p1', 'https://hook.test/x', 'sec', '[]', 'active', OP.id, T]);
  /* A live session for the initiator — DR must revoke it POST-commit. */
  await db.run('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)', ['hash-op-session', OP.id, T, T + 86400000]);

  /* Blobs: f1/lg1 are the archive content; f-old/lg-old are LIVE rows the
     archive never carried — DR must unlink them post-commit. */
  fs.writeFileSync(path.join(FILES_DIR, 'f1'), 'archive blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg1'), 'archive logo');
  fs.writeFileSync(path.join(FILES_DIR, 'f-old'), 'live-only blob\n');
  fs.writeFileSync(path.join(LOGOS_DIR, 'lg-old'), 'live-only logo');

  sourceRun = await backup.runExport({ kind: 'instance' }, { trigger: 'manual' });
  assert.equal(sourceRun.ok, true, `source export failed: ${sourceRun.error}`);

  /* Post-export drift: a NEW workspace + a revision bump — both must be
     gone/reverted after DR (replacement, never a merge). */
  await db.run(
    'insert into workspaces (id, slug, name, color, doc, revision, created_at, updated_at, archived) values (?,?,?,?,?,?,?,?,?)',
    ['ws-extra', 'extra', 'Extra WS', '#123456', JSON.stringify(wsDoc('ws-extra', { projectId: 'px' })), 1, T, T, 0],
  );
  await db.run('update workspaces set revision = 9 where id = ?', ['ws-a']);
  await db.run('pragma foreign_keys = on');
}

await freshDb();
await db.ensureSearchIndex(); // task_fts exists from boot in production

const backupsCount = () => fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.tar.gz')).length;

function drUnit(overrides = {}) {
  return restore.restoreInstanceUnit({
    runId: 'dr-test-run-1',
    backupRun: { filename: sourceRun.filename, sha256: sourceRun.sha256, uploaded: 0 },
    operator: OP,
    ...overrides,
  });
}

const wsIds = async () => (await db.all('select id from workspaces order by id', [])).map(r => r.id);
const rolesRows = async () => db.all('select user_id, role from instance_roles order by user_id', []);
const liveRevision = async wsId => (await db.get('select revision from workspaces where id = ?', [wsId])).revision;

/* ---------- engine: restoreInstanceUnit ---------- */

test('89-05 DR (BKRST-04): replaces the data tables doc-and-all — post-export drift reverted, archive set restored exactly; roster validated; instance_roles rebuilt EXCEPTED from the operational skip', async () => {
  await resetWorld();

  const result = await drUnit();
  assert.equal(result.ok, true, `DR failed: ${result.error}`);

  /* Replacement, never a merge: ws-extra is gone, the archive set is back. */
  assert.deepEqual(await wsIds(), ['ws-a', 'ws-b'], 'the workspaces table is exactly the archive set');
  assert.equal(await liveRevision('ws-a'), 3, 'the ws-a row carries the ARCHIVE revision (drift reverted)');
  const doc = JSON.parse((await db.get('select doc from workspaces where id = ?', ['ws-a'])).doc);
  assert.equal(doc.data.projects[0].name, 'Project ws-a', 'the archive doc landed');

  /* Roster replace-with-validation: live rows back, dead rows skipped. */
  const roster = await db.all("select user_id, role from memberships where workspace_id = 'ws-a' order by user_id", []);
  assert.deepEqual(roster.map(r => r.user_id).sort(), [LIVE.id, OP.id].sort(), 'live memberships restored');

  /* instance_roles rebuild EXCEPTED from the operational skip (D-89-8):
     the live row is back, the dead-id row skipped + reported. */
  const roles = await rolesRows();
  assert.deepEqual(roles, [{ user_id: LIVE.id, role: 'backup_operator' }], 'only the live-user role row rebuilt');
  assert.equal(result.summary.instanceRoles.rebuilt, 1, 'the rebuild count');
  assert.equal(result.summary.instanceRoles.skipped, 1, 'the dead-id role row skip-reported');

  /* Operational tables skipped, LIVE ROWS KEPT, listed in the summary (OQ4). */
  assert.equal((await db.get('select count(*) as n from saved_views', [])).n, 1, 'saved_views kept');
  assert.equal((await db.get('select count(*) as n from user_notif_prefs', [])).n, 1, 'user_notif_prefs kept');
  assert.equal((await db.get('select count(*) as n from webhook_hooks', [])).n, 1, 'webhook_hooks kept');
  const skippedTables = result.summary.skipped.map(s => s.table);
  for (const t of ['saved_views', 'user_notif_prefs', 'webhook_hooks']) {
    assert.ok(skippedTables.includes(t), `the summary lists ${t} in the skip report`);
  }

  /* Blob layer: archive blobs swapped in, live-only blobs unlinked. */
  assert.equal(fs.readFileSync(path.join(FILES_DIR, 'f1'), 'utf8'), 'archive blob\n');
  assert.equal(fs.existsSync(path.join(FILES_DIR, 'f-old')), false, 'live-only blob unlinked post-commit');
  assert.equal(fs.existsSync(path.join(LOGOS_DIR, 'lg-old')), false);

  /* Snapshot machinery (flag 1): the tag rides the restore_runs row + audit. */
  assert.ok(fs.existsSync(path.join(BACKUPS_DIR, result.snapshotFilename)), 'the pre_restore snapshot exists');
  const snapEvent = events.find(e => e.snapshotTag === 'pre_restore');
  assert.ok(snapEvent, 'the emitter carried snapshotRunId + snapshotTag=pre_restore');
  const audit = await db.get("select * from audit_log where action = 'restore_snapshot_started:pre_restore'", []);
  assert.ok(audit, 'the snapshot is audited');
  assert.equal(audit.actor_id, OP.id);

  /* Stage vocabulary walked (D-89-29). */
  const stages = events.filter(e => e.stage).map(e => e.stage);
  assert.ok(stages.indexOf('validating') < stages.indexOf('restoring') < stages.indexOf('verifying'), `stages walked in order: ${stages.join('→')}`);

  /* No email claims (D-89-28): the re-login wall is the notification. */
  assert.equal((await db.get('select count(*) as n from email_outbox', [])).n, 0, 'DR emitted zero email_outbox rows');
});

test('89-05 DR revocation is strictly POST-commit (D-89-25): every session including the initiator — negative test proves no pre-commit revocation', async () => {
  await resetWorld();
  await db.run('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)', ['hash-live-session', LIVE.id, T, T + 86400000]);

  const result = await drUnit({
    _hooks: {
      /* Inside the tx — BEFORE the commit boundary. If the unit revoked
         sessions pre-commit (the D-89-25 violation), this read sees an
         already-empty table and the negative test fails. */
      midTx: async () => {
        const n = (await db.get('select count(*) as n from sessions', [])).n;
        assert.ok(n >= 2, `sessions still present INSIDE the tx (pre-commit revocation happened early): ${n}`);
      },
    },
  });
  assert.equal(result.ok, true, `DR failed: ${result.error}`);

  const left = (await db.get('select count(*) as n from sessions', [])).n;
  assert.equal(left, 0, 'every session revoked post-commit — including the initiator');
});

test('89-05 DR keeps the instance live mid-restore (D-89-26): doc reads succeed inside the tx — the lock is the only concurrency control', async () => {
  await resetWorld();
  let midReads = 0;
  const result = await drUnit({
    _hooks: {
      midTx: async () => {
        const rows = await db.all('select id, doc from workspaces', []);
        assert.equal(rows.length, 2, 'the archive workspace set is visible in-tx');
        for (const r of rows) JSON.parse(r.doc); // every restored doc parses — reads never 5xx
        midReads += 1;
      },
    },
  });
  assert.equal(result.ok, true, `DR failed: ${result.error}`);
  assert.equal(midReads, 1, 'the mid-restore read hook ran exactly once (inside the tx)');
});

test('89-05 DR scope guard: a workspace-scope archive refuses keyed restoreTargetMismatch — the snapshot still came first (the net is unconditional)', async () => {
  await resetWorld();
  const wsRun = await backup.runExport({ kind: 'workspace', id: 'ws-a' }, { trigger: 'manual' });
  assert.equal(wsRun.ok, true);
  const before = await wsIds();

  const result = await drUnit({ backupRun: { filename: wsRun.filename, sha256: wsRun.sha256, uploaded: 0 } });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'restoreTargetMismatch', `keyed: ${result.code ?? result.error}`);
  assert.deepEqual(await wsIds(), before, 'zero state change');
  assert.equal(backupsCount(), 3, 'the snapshot still came first (instance source + ws export + pre_restore snapshot)');
});

/* ---------- route: POST /api/backup/restore/instance ---------- */

/* Route-level db reads ride ONE persistent DatabaseSync reader per test —
   NEVER open/close cycles. An external read connection that closes while
   the server holds the db checkpoints + REMOVES the WAL (the closer
   misreads itself as the last connection), and the server's subsequent
   writes land in the deleted WAL — invisible to every later reader
   (bisected 2026-11-22, probes 11-15). A reader held open for the test's
   lifetime keeps the WAL alive and every read honest. */
import { DatabaseSync } from 'node:sqlite';
const openReader = srv => {
  const ro = new DatabaseSync(srv.dbPath);
  ro.exec('pragma busy_timeout = 5000');
  return {
    get: (sql, ...params) => ro.prepare(sql).get(...params),
    all: (sql, ...params) => ro.prepare(sql).all(...params),
    close: () => ro.close(),
  };
};

const { ADMIN, login, signup, startServer } = await import('./helpers/server.mjs');
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const userIdByEmail = (ro, email) => {
  const row = ro.get('select id from users where email = ?', email);
  return row?.id;
};
const pollDb = (ro, read, { timeoutMs = 20000 } = {}) =>
  new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      let v = null;
      try {
        v = read(ro);
      } catch {
        /* transient read trouble — keep polling */
      }
      if (v) return resolve(v);
      if (Date.now() > deadline) return reject(new Error('pollDb timeout'));
      setTimeout(tick, 40);
    };
    tick();
  });
const grantRole = async (srv, ro, email, role) => {
  const admin = (await login(srv.base, ADMIN.email, ADMIN.password)).client;
  const grant = await admin.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(ro, email), role });
  assert.equal(grant.status, 200, `grant ${role}: ${JSON.stringify(grant.data)}`);
};
const makeRestoreOp = async (srv, ro, email) => {
  const joined = await signup(srv.base, { name: 'Restore Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  await grantRole(srv, ro, email, 'restore_operator');
  return (await login(srv.base, email, 'password-1234')).client;
};
const makeBackupOp = async (srv, ro, email) => {
  const op = await signup(srv.base, { name: 'Backup Op', email });
  assert.equal(op.status, 201);
  await grantRole(srv, ro, email, 'backup_operator');
  return (await login(srv.base, email, 'password-1234')).client;
};
const pollBackupCurrent = async (holder, { until = null, timeoutMs = 30000 } = {}) => {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  /* Plain awaited loop — a self-scheduling tick chain leaves later ticks'
     rejections unhandled (an unhandledRejection fails the whole test even
     when the poll itself would have recovered). */
  while (Date.now() < deadline) {
    const res = await holder.get('/api/backup/runs/current');
    assert.equal(res.status, 200, `poll failed: ${JSON.stringify(res.data)}`);
    last = res.data;
    if (!until || until(last)) return last;
    await sleep50();
  }
  throw new Error(`poll timeout — last: ${JSON.stringify(last)}`);
};
const sleep50 = () => new Promise(r => setTimeout(r, 50));

/* Boot + a real instance-scope archive (the trigger target). The run id
   comes from the API response — no external db read here (the reader is
   the test's own persistent handle, opened by the caller after boot). */
async function bootWithInstanceArchive() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-dr-route-'));
  const srv = await startServer({ dataDir });
  const admin = (await login(srv.base, ADMIN.email, ADMIN.password)).client;
  const run = await admin.post('/api/backup/runs', { scope: { kind: 'instance' } });
  assert.equal(run.status, 200, `instance backup trigger: ${JSON.stringify(run.data)}`);
  await pollBackupCurrent(admin, { until: p => p.stage === 'done' || p.stage === 'failed' });
  return { dataDir, srv, admin, runId: run.data.runId };
}

test('89-05 DR route role-gate matrix: backup_operator / restore_operator / plain member all 403 operatorOnly + audited instanceAdminRequired (CAP.INSTANCE_ROLES_MANAGE is Super-Admin-only)', async () => {
  const { dataDir, srv, admin, runId } = await bootWithInstanceArchive();
  const ro = openReader(srv);
  try {
    const backupOp = await makeBackupOp(srv, ro, 'dr-backup-op@test.local');
    const restoreOp = await makeRestoreOp(srv, ro, 'dr-restore-op@test.local');
    const plain = (await signup(srv.base, { name: 'Plain', email: 'dr-plain@test.local' })) && (await login(srv.base, 'dr-plain@test.local', 'password-1234')).client;

    for (const [who, cl] of [['backup_operator', backupOp], ['restore_operator', restoreOp], ['plain member', plain]]) {
      const res = await cl.post('/api/backup/restore/instance', { runId, confirmPhrase: 'RESTORE-INSTANCE' });
      assert.equal(res.status, 403, `${who}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'operatorOnly', `${who}: the existing instance-roles family code — no new refusal code`);
    }
    const audits = ro.all("select action from audit_log where action like 'restore_refused:%'");
    assert.equal(audits.filter(a => a.action === 'restore_refused:instanceAdminRequired').length, 3, 'every refusal audited');

    /* The lock was never claimed by a refused trigger; no run row. */
    assert.equal(ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null);
    assert.equal(ro.get("select count(*) as n from restore_runs where trigger = 'instance'").n, 0);
    assert.ok(admin, 'the Super-Admin client passed the gate (further pinned by the phrase matrix)');
  } finally {
    ro.close();
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-05 DR route phrase matrix: missing / wrong / near-miss confirmPhrase → keyed confirmPhraseMismatch, ZERO state change; exact RESTORE-INSTANCE triggers (D-89-27/P8)', async () => {
  const { dataDir, srv, admin, runId } = await bootWithInstanceArchive();
  const ro = openReader(srv);
  try {
    const wsBefore = ro.get('select count(*) as n from workspaces').n;

    for (const phrase of [undefined, 'restore-instance', 'RESTORE-INSTANCE ', 'RESTORE INSTANCE']) {
      const res = await admin.post('/api/backup/restore/instance', { runId, confirmPhrase: phrase });
      assert.equal(res.status, 400, `phrase ${JSON.stringify(phrase)}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'confirmPhraseMismatch', `keyed: ${JSON.stringify(res.data)}`);
    }
    assert.equal(ro.get('select count(*) as n from workspaces').n, wsBefore, 'zero state change on near-misses');
    assert.equal(ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock untouched by refused phrases');
    assert.equal(ro.get("select count(*) as n from restore_runs where trigger = 'instance'").n, 0);

    /* The exact phrase triggers — runId leaves before the pipeline (D-89-2). */
    const ok = await admin.post('/api/backup/restore/instance', { runId, confirmPhrase: 'RESTORE-INSTANCE' });
    assert.equal(ok.status, 200, `trigger: ${JSON.stringify(ok.data)}`);
    assert.match(ok.data.runId, UUID_RE, 'a fresh run id');
    const row = await pollDb(ro, db => db.get("select * from restore_runs where id = ? and trigger = 'instance'", ok.data.runId) ?? null);
    assert.ok(row, 'the start row exists with trigger instance');
    assert.equal(row.snapshot_tag, 'pre_restore', 'flag 1: the pre_restore tag rides the restore_runs row');
    assert.ok(row.snapshot_run_id, 'the snapshot run link');
  } finally {
    ro.close();
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-05 DR route throttle: restoreinstance|<id> 3/15min consuming a try — the 4th attempt 429s (D-89-22)', async () => {
  const { dataDir, srv, admin, runId } = await bootWithInstanceArchive();
  const ro = openReader(srv);
  try {
    for (let i = 0; i < 3; i++) {
      const res = await admin.post('/api/backup/restore/instance', { runId, confirmPhrase: 'wrong' });
      assert.equal(res.status, 400, `attempt ${i + 1} refused keyed`);
    }
    const fourth = await admin.post('/api/backup/restore/instance', { runId, confirmPhrase: 'RESTORE-INSTANCE' });
    assert.equal(fourth.status, 429, `the 4th attempt throttled: ${JSON.stringify(fourth.data)}`);
    assert.equal(fourth.data.code, 'tooManyAttempts');
    assert.equal(ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null);
  } finally {
    ro.close();
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('89-05 DR route E2E: the run lands done; every session INCLUDING the Super-Admin initiator is revoked (next request 401s); the lock releases; no email claims', async () => {
  const { dataDir, srv, admin, runId } = await bootWithInstanceArchive();
  const ro = openReader(srv);
  try {
    const secondUser = await makeRestoreOp(srv, ro, 'dr-second@test.local');
    assert.equal(await secondUser.get('/api/backup/restore/runs').then(r => r.status), 200, 'the second user is authenticated pre-DR');

    const ok = await admin.post('/api/backup/restore/instance', { runId, confirmPhrase: 'RESTORE-INSTANCE' });
    assert.equal(ok.status, 200, `trigger: ${JSON.stringify(ok.data)}`);

    const done = await pollDb(ro, db => db.get('select * from restore_runs where id = ? and status = ?', ok.data.runId, 'done') ?? null);
    assert.ok(done, 'the DR run lands done');
    const summary = JSON.parse(done.summary);
    assert.ok(Array.isArray(summary.skipped) && summary.skipped.some(s => s.table === 'saved_views'), 'the summary skip report carries the operational tables');

    /* Post-commit revocation: EVERY client 401s — initiator first (D-89-25). */
    const revokedAdmin = await admin.get('/api/backup/restore/runs');
    assert.equal(revokedAdmin.status, 401, `the initiating Super Admin was revoked: ${revokedAdmin.status}`);
    const revokedSecond = await secondUser.get('/api/backup/restore/runs');
    assert.equal(revokedSecond.status, 401, 'every other session revoked too');

    assert.equal(ro.get('select claimed_by from restore_lock where id = 1').claimed_by, null, 'the lock released');
    assert.equal(ro.get('select count(*) as n from email_outbox').n, 0, 'no email claims (D-89-28)');
  } finally {
    ro.close();
    await srv.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
