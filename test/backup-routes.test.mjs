/* =====================================================================
   Backup-run API suite (Phase 86, plan 86-02, BKBCK-01).

   Pins the frozen /api/backup/runs surface over the 86-01 pipeline:
   - the guard chain order (sameOrigin → requireUser → throttle →
     capability gate → scope checks → concurrency → claim — copied from
     the Phase 85 stub family, never reordered, T-86-07: the gate BEFORE
     any scope probing — no 403-vs-400 oracle);
   - the happy path: holder POST returns a D-18 UUID immediately, the
     export completes in the background, GET current reaches stage done
     with the archive filename + whole-archive sha256 (D-19) and the
     archive + .sha256 sidecar really exist in DATA_DIR/backups;
   - the refusal matrix: wrong role, concurrent run (D-10), bad scope
     (D-17) — each keyed AND audited (D-20); the operator-keyed throttle
     consumes a try even on refusal (D-21); non-holder poll 403 (D-22);
   - the D-13 hygiene wiring: boot sweep clears planted tmp/backup-*
     orphans;
   - the Phase 85 POST /api/backup/tasks stub still refuses
     backupNotConfigured (prohibition pin — Phase 87 owns tasks).
   Pattern: test/instance-roles-api.test.mjs — startServer-per-case with
   the shared harness, withDb for direct row inspection.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, login, signup, startServer, withDb } from './helpers/server.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const backupAuditRows = srv =>
  withDb(srv.dbPath, db => db.prepare("select * from audit_log where action like 'backup_run_%' order by created_at, id").all());
const userIdByEmail = (srv, email) => withDb(srv.dbPath, db => db.prepare('select id from users where email = ?').get(email).id);

/* A holder + the operator client, granted through the Phase 85 grant route. */
async function makeBackupOp(server, email) {
  const joined = await signup(server.base, { name: 'Backup Op', email });
  assert.equal(joined.status, 201, `signup ${email}: ${JSON.stringify(joined.data)}`);
  const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
  const grant = await operator.post('/api/auth/operator/instance-roles', { userId: userIdByEmail(server, email), role: 'backup_operator' });
  assert.equal(grant.status, 200, `grant: ${JSON.stringify(grant.data)}`);
  return (await login(server.base, email, 'password-1234')).client;
}

/* Plant a small but real file tree so an instance export takes long enough
   for the concurrency cell to observe an active stage deterministically. */
function plantData(dataDir) {
  const files = path.join(dataDir, 'files');
  fs.mkdirSync(files, { recursive: true });
  for (let i = 0; i < 400; i++) {
    fs.writeFileSync(path.join(files, `blob-${i}`), crypto.randomBytes(8 * 1024));
  }
  fs.mkdirSync(path.join(dataDir, 'tmp', 'backup-orphan'), { recursive: true }); // D-13 sweep fodder
}

async function pollCurrent(holder, { until = null, timeoutMs = 30000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    const res = await holder.get('/api/backup/runs/current');
    assert.equal(res.status, 200, `poll failed: ${JSON.stringify(res.data)}`);
    last = res.data;
    if (!until || until(last)) return last;
    await sleep(50);
  }
  throw new Error(`poll timeout — last payload: ${JSON.stringify(last)}`);
}

/* ---------- the happy path + hygiene (D-07/D-18/D-19/D-13) ---------- */

test('holder POST returns a UUID immediately; polling reaches done with filename + sha256; archive + sidecar exist; boot sweep cleared the planted orphan', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-routes-'));
  plantData(dataDir);
  const server = await startServer({ dataDir });
  try {
    assert.ok(!fs.existsSync(path.join(dataDir, 'tmp', 'backup-orphan')), 'the D-13 boot sweep removed the planted staging orphan');

    const holder = await makeBackupOp(server, 'op@test.local');
    const post = await holder.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(post.status, 200, `trigger: ${JSON.stringify(post.data)}`);
    assert.deepEqual(Object.keys(post.data).sort(), ['runId']);
    assert.match(post.data.runId, UUID_RE, 'the run id is a D-18 UUID');

    const payload = await pollCurrent(holder, { until: p => p.stage === 'done' || p.stage === 'failed' });
    assert.equal(payload.stage, 'done', `expected done, got: ${JSON.stringify(payload)}`);
    assert.deepEqual(payload.scope, { kind: 'instance', id: null });
    assert.ok(typeof payload.startedAt === 'string' && !Number.isNaN(Date.parse(payload.startedAt)), 'startedAt is an ISO timestamp');
    assert.match(payload.filename, /^backup-instance-\d{8}-\d{6}\.tar\.gz$/, 'the D-14 filename shape');
    assert.match(payload.sha256, /^[0-9a-f]{64}$/, 'the whole-archive sha256');

    /* the archive really landed, and the .sha256 sidecar matches the final bytes */
    const archive = path.join(dataDir, 'backups', payload.filename);
    assert.ok(fs.existsSync(archive), 'the verified archive exists in DATA_DIR/backups');
    const sidecar = fs.readFileSync(`${archive}.sha256`, 'utf8');
    const actual = crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    assert.equal(sidecar.split(/\s+/)[0], payload.sha256, 'the sidecar matches the payload');
    assert.equal(actual, payload.sha256, 'the payload sha256 is the sha256 of the final bytes');

    /* the started attempt is on the trail (D-20) */
    const audits = backupAuditRows(server);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].action, 'backup_run_started:instance');
    assert.equal(audits[0].actor_id, userIdByEmail(server, 'op@test.local'));
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a workspace scope exports too: real workspace id passes the D-17 existence check', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-routes-'));
  plantData(dataDir);
  const server = await startServer({ dataDir });
  try {
    const holder = await makeBackupOp(server, 'op-ws@test.local');
    const wsId = withDb(server.dbPath, db => db.prepare('select id from workspaces limit 1').get()).id;
    assert.ok(wsId, 'the seed workspace exists');
    const post = await holder.post('/api/backup/runs', { scope: { kind: 'workspace', id: wsId } });
    assert.equal(post.status, 200, `workspace trigger: ${JSON.stringify(post.data)}`);
    const payload = await pollCurrent(holder, { until: p => p.stage === 'done' || p.stage === 'failed' });
    assert.equal(payload.stage, 'done', JSON.stringify(payload));
    assert.deepEqual(payload.scope, { kind: 'workspace', id: wsId });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the gates (T-86-07, D-22) ---------- */

test('unauthenticated POST/GET → 401 before any probing; no audit rows', async () => {
  const server = await startServer({});
  try {
    const anon = client(server.base, 'anon');
    assert.equal((await anon.post('/api/backup/runs', { scope: { kind: 'instance' } })).status, 401);
    assert.equal((await anon.get('/api/backup/runs/current')).status, 401);
    assert.equal(backupAuditRows(server).length, 0);
  } finally {
    await server.stop();
  }
});

test('non-holder POST → 403 backupManageRequired + audit row; non-holder GET → 403 backupRoleRequired (D-22)', async () => {
  const server = await startServer({});
  try {
    const joined = await signup(server.base, { name: 'Plain', email: 'plain@test.local' });
    assert.equal(joined.status, 201);
    const plain = (await login(server.base, 'plain@test.local', 'password-1234')).client;

    const refused = await plain.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'backupManageRequired');

    const poll = await plain.get('/api/backup/runs/current');
    assert.equal(poll.status, 403);
    assert.equal(poll.data.code, 'backupRoleRequired', 'a non-holder poll never becomes a status oracle (D-22)');

    const audits = backupAuditRows(server);
    assert.equal(audits.length, 1, 'exactly the refused-trigger audit row (the GET refusal is a read, D-20)');
    assert.equal(audits[0].action, 'backup_run_refused:backupManageRequired');
  } finally {
    await server.stop();
  }
});

/* ---------- the refusal matrix (D-10/D-17/D-20) ---------- */

test('claim race pinned: two immediate POSTs yield exactly ONE started run — the other refused 409 (D-10)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-routes-'));
  plantData(dataDir); // ~3 MB tree → the winner's export stays active while the loser's handler reaches the check
  const server = await startServer({ dataDir });
  try {
    const holder = await makeBackupOp(server, 'op-race@test.local');
    const [a, b] = await Promise.all([
      holder.post('/api/backup/runs', { scope: { kind: 'instance' } }),
      holder.post('/api/backup/runs', { scope: { kind: 'instance' } }),
    ]);
    const statuses = [a.status, b.status].sort();
    assert.deepEqual(statuses, [200, 409], `exactly one trigger wins: ${a.status}/${b.status} — ${JSON.stringify(a.data)} ${JSON.stringify(b.data)}`);
    const refused = a.status === 409 ? a : b;
    assert.equal(refused.data.code, 'backupRunInProgress');
    const startedId = (a.status === 200 ? a : b).data.runId;
    assert.match(startedId, UUID_RE);

    const audits = backupAuditRows(server);
    assert.equal(audits.filter(x => x.action === 'backup_run_started:instance').length, 1, 'exactly one started run');
    assert.ok(audits.some(x => x.action === 'backup_run_refused:backupRunInProgress'), 'the lost race is audited (D-20)');
    await pollCurrent(holder, { until: p => p.stage === 'done' || p.stage === 'failed' });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('bad scope matrix: unknown kind / missing id / spurious instance id / nonexistent ids → keyed 400 scopeNotFound + audit row each (D-17/D-20)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-routes-'));
  const server = await startServer({ dataDir });
  try {
    /* two holders: the D-21 throttle consumes a try per refused attempt, so a
       single operator's 15-min window cannot cover the whole matrix. */
    const holderA = await makeBackupOp(server, 'op-scope@test.local');
    const holderB = await makeBackupOp(server, 'op-scope2@test.local');
    const matrix = [
      { scope: { kind: 'galaxy' }, who: holderA }, // unknown kind
      { scope: { kind: 'project' }, who: holderA }, // missing id
      { scope: { kind: 'workspace' }, who: holderA }, // missing id
      { scope: { kind: 'project', id: 'nope-not-here' }, who: holderB }, // nonexistent project
      { scope: { kind: 'workspace', id: 'nope-not-here' }, who: holderB }, // nonexistent workspace
      { scope: { kind: 'instance', id: 'spurious' }, who: holderB }, // instance must OMIT id (D-17)
    ];
    for (const { scope, who } of matrix) {
      const res = await who.post('/api/backup/runs', { scope });
      assert.equal(res.status, 400, `scope ${JSON.stringify(scope)}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'scopeNotFound', `scope ${JSON.stringify(scope)} carries the keyed refusal`);
    }
    const audits = backupAuditRows(server);
    assert.equal(audits.length, 6, 'every refused trigger landed on the trail (D-20)');
    assert.ok(audits.every(a => a.action === 'backup_run_refused:scopeNotFound'));
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('concurrent run refused: while the first export runs, a second POST gets 409 backupRunInProgress + audit row (D-10/D-20)', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-backup-routes-'));
  plantData(dataDir);
  const server = await startServer({ dataDir });
  try {
    const holder = await makeBackupOp(server, 'op-conc@test.local');
    const first = await holder.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(first.status, 200, JSON.stringify(first.data));

    /* deterministic claim-race pin: the claim is synchronous, so the active
       stage is observable before the loser's request is even dispatched. */
    await pollCurrent(holder, { until: p => ['collecting', 'archiving', 'verifying'].includes(p.stage) });
    const second = await holder.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(second.status, 409, `second trigger: ${JSON.stringify(second.data)}`);
    assert.equal(second.data.code, 'backupRunInProgress');

    const audits = backupAuditRows(server);
    assert.ok(audits.some(a => a.action === 'backup_run_refused:backupRunInProgress'), 'the concurrent refusal is audited (D-20)');

    /* exactly one run ever started */
    assert.equal(audits.filter(a => a.action === 'backup_run_started:instance').length, 1);
    await pollCurrent(holder, { until: p => p.stage === 'done' || p.stage === 'failed' });
  } finally {
    await server.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

/* ---------- the throttle (D-21) ---------- */

test('throttle is operator-keyed and consumes a try even on refusal: 5 refused attempts → the 6th is 429 (D-21)', async () => {
  const server = await startServer({});
  try {
    const holder = await makeBackupOp(server, 'op-throttle@test.local');
    for (let i = 0; i < 5; i++) {
      const res = await holder.post('/api/backup/runs', { scope: { kind: 'galaxy' } });
      assert.equal(res.status, 400, `refused attempt ${i + 1}: ${JSON.stringify(res.data)}`);
    }
    const sixth = await holder.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(sixth.status, 429, `the valid 6th attempt must be throttled: ${JSON.stringify(sixth.data)}`);
    assert.equal(sixth.data.code, 'tooManyAttempts');

    /* another operator still has their own budget — the key is per-operator */
    const other = await makeBackupOp(server, 'op-other@test.local');
    const ok = await other.post('/api/backup/runs', { scope: { kind: 'instance' } });
    assert.equal(ok.status, 200, 'a different operator is not throttled by the first operator\'s window');
  } finally {
    await server.stop();
  }
});

/* ---------- the Phase 85 stub prohibition pin ---------- */

test('POST /api/backup/tasks still refuses backupNotConfigured — the run surface did not make tasks live (prohibition)', async () => {
  const server = await startServer({});
  try {
    const holder = await makeBackupOp(server, 'op-stub@test.local');
    const stub = await holder.post('/api/backup/tasks', { name: 'nightly' });
    assert.equal(stub.status, 400);
    assert.equal(stub.data.code, 'backupNotConfigured');
  } finally {
    await server.stop();
  }
});
