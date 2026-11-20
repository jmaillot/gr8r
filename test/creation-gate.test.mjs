/* Creation gate suite (Phase 78, WSG-01/02/03). Proves the single path from
   the WORKSPACE_CREATION env token to boot-refuse / boot-log / the
   POST /api/workspaces gate / the /api/config boolean, and the full
   ALLOW_SIGNUP decoupling. Pattern: startServer-per-case with env overrides,
   server.output() grep for boot lines, await server.stop() in finally
   (domain-admission.test.mjs precedent); invalid tokens are asserted through
   a direct child spawn because a boot-refusing server never serves /api/config
   (Pitfall 6 — assert output + exit code, never await health). */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, client, inviteToken, login, signup, startServer, withDb } from './helpers/server.mjs';

/* ---------- boot-refuse mechanics (Pitfall 6) ---------- */

/* One direct child per invalid token: exit code + captured output are the
   observable — the harness would throw (server never becomes healthy) and a
   test must NOT await a health endpoint that never comes up. */
function bootAttempt(extraEnv) {
  return new Promise(resolve => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-bootrefuse-'));
    const child = spawn(process.execPath, ['server.js'], {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        HOST: '127.0.0.1',
        SEED_DATA: 'false',
        ALLOW_SIGNUP: 'true',
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_NAME: ADMIN.name,
        WORKSPACE_NAME: 'Acme',
        WORKSPACE_SLUG: 'acme',
        PORT: '0',
        DATA_DIR: dir,
        DB_PATH: path.join(dir, 'projects.db'),
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', chunk => (output += chunk));
    child.stderr.on('data', chunk => (output += chunk));
    const backstop = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, 10_000);
    backstop.unref();
    child.on('exit', () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        /* best-effort cleanup */
      }
      resolve({ code: child.exitCode, output });
    });
  });
}

/* ---------- WSG-01: the token matrix ---------- */

test("WORKSPACE_CREATION='true' boots with the open-gate log line", async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: 'true' } });
  try {
    const line = server.output().split('\n').find(l => l.includes('workspace creation:'));
    assert.ok(line, 'the boot log line exists');
    assert.match(line, /workspace creation: open \(any authenticated user\)/);
  } finally {
    await server.stop();
  }
});

test("WORKSPACE_CREATION='false' boots with the closed-gate log line", async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: 'false' } });
  try {
    const line = server.output().split('\n').find(l => l.includes('workspace creation:'));
    assert.ok(line, 'the boot log line exists');
    assert.match(line, /workspace creation: closed \(instance operators only\)/);
  } finally {
    await server.stop();
  }
});

test('unset WORKSPACE_CREATION boots fail-closed with the closed-gate log line', async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: undefined } });
  try {
    const line = server.output().split('\n').find(l => l.includes('workspace creation:'));
    assert.ok(line, 'the boot log line exists');
    assert.match(line, /workspace creation: closed \(instance operators only\)/);
  } finally {
    await server.stop();
  }
});

for (const token of ['TRUE', '', ' ', 'yes', '1']) {
  test(`invalid WORKSPACE_CREATION token ${JSON.stringify(token)} boot-refuses (exit 1, error names the var and both valid values)`, async () => {
    const { code, output } = await bootAttempt({ WORKSPACE_CREATION: token });
    assert.equal(code, 1, `must exit 1, got ${code}`);
    assert.match(output, /WORKSPACE_CREATION/, 'the error names the variable');
    assert.match(output, /'true'/, 'the error names the first valid value');
    assert.match(output, /'false'/, 'the error names the second valid value');
  });
}

/* ---------- WSG-02: the gate matrix (closed via unset = fail-closed) ---------- */

async function operatorAndPlain(base) {
  const operator = (await login(base, ADMIN.email, ADMIN.password)).client;
  const plain = await signup(base, { name: 'Plain', email: 'plain@test.local' });
  return { operator, plain: plain.client };
}

test('closed gate: a plain user is refused 403 workspaceCreationClosed', async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: undefined } });
  try {
    const { plain } = await operatorAndPlain(server.base);
    const res = await plain.post('/api/workspaces', { name: 'Nope Co' });
    assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'workspaceCreationClosed');
    assert.deepEqual(Object.keys(res.data).sort(), ['code', 'error']);
  } finally {
    await server.stop();
  }
});

test('closed gate: an operator creates and becomes the workspace owner (WSG-04)', async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: undefined } });
  try {
    const { operator } = await operatorAndPlain(server.base);
    const res = await operator.post('/api/workspaces', { name: 'Op Co' });
    assert.equal(res.status, 201, `operator must create, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.workspace.role, 'owner', 'the creator must be the workspace owner');
  } finally {
    await server.stop();
  }
});

test('closed gate: a workspace owner who is NOT an operator is refused (D-112)', async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: undefined } });
  try {
    const { operator } = await operatorAndPlain(server.base);
    const created = await operator.post('/api/workspaces', { name: 'Op Co' });
    assert.equal(created.status, 201);
    const ws = created.data.workspace.slug;

    const [row] = (
      await operator.post(`/api/workspaces/${ws}/invites`, { emails: ['invitee@test.local'], role: 'member' })
    ).data.invites;
    // accept-creates-account (membership.test.mjs flow): a signed-up account
    // with the invite's email would 409 accountExistsSignIn instead.
    const fresh = client(server.base, 'invitee');
    const accepted = await fresh.post(`/api/invites/${inviteToken(row.url)}/accept`, {
      name: 'Invitee',
      email: 'invitee@test.local',
      password: 'password-1234',
    });
    assert.equal(accepted.status, 201, `invite accept must succeed, got ${accepted.status}: ${JSON.stringify(accepted.data)}`);
    assert.equal(accepted.data.workspace.slug, ws);

    // promote the invitee to workspace owner (tenant-bound role, NOT the instance flag)
    const members = (await operator.get(`/api/workspaces/${ws}/members`)).data.members;
    const target = members.find(m => m.email === 'invitee@test.local');
    const promoted = await operator.patch(`/api/workspaces/${ws}/members/${target.userId}`, { role: 'owner' });
    assert.ok([200, 201].includes(promoted.status), `owner promotion must succeed, got ${promoted.status}: ${JSON.stringify(promoted.data)}`);

    const res = await fresh.post('/api/workspaces', { name: 'Sneak Co' });
    assert.equal(res.status, 403, 'a workspace owner must not pass the instance gate (D-112)');
    assert.equal(res.data.code, 'workspaceCreationClosed');
  } finally {
    await server.stop();
  }
});

test('open gate (BASE_ENV): any authenticated user creates and becomes owner (WSG-02/04)', async () => {
  const server = await startServer({});
  try {
    const { plain } = await operatorAndPlain(server.base);
    const res = await plain.post('/api/workspaces', { name: 'Mine Co' });
    assert.equal(res.status, 201, `open gate must admit any user, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.workspace.role, 'owner');
  } finally {
    await server.stop();
  }
});

/* ---------- WSG-02: ALLOW_SIGNUP decoupling ---------- */

test('decoupled: ALLOW_SIGNUP=true with a closed gate — signup still succeeds AND creation is refused', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP: 'true', WORKSPACE_CREATION: 'false' } });
  try {
    const joined = await signup(server.base, { name: 'Later', email: 'later@test.local' });
    assert.equal(joined.status, 201, 'signup must still succeed under a closed creation gate');
    const res = await joined.client.post('/api/workspaces', { name: 'Nope Co' });
    assert.equal(res.status, 403);
    assert.equal(res.data.code, 'workspaceCreationClosed');
  } finally {
    await server.stop();
  }
});

test('decoupled: ALLOW_SIGNUP=false still closes signup only (signupDisabled, untouched scope)', async () => {
  const server = await startServer({ env: { ALLOW_SIGNUP: 'false', WORKSPACE_CREATION: 'false' } });
  try {
    const refused = await signup(server.base, { name: 'Blocked', email: 'blocked@test.local' });
    assert.equal(refused.status, 403);
    assert.equal(refused.data.code, 'signupDisabled');

    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await operator.post('/api/workspaces', { name: 'Op Co' });
    assert.equal(res.status, 201, 'the operator still creates under a closed signup door');
  } finally {
    await server.stop();
  }
});

/* ---------- WSG-03: /api/config shape ---------- */

test('/api/config returns a boolean workspaceCreation=true under the open gate', async () => {
  const server = await startServer({});
  try {
    const res = await fetch(`${server.base}/api/config`);
    const data = await res.json();
    assert.equal(data.workspaceCreation, true, `expected boolean true, got ${JSON.stringify(data.workspaceCreation)}`);
  } finally {
    await server.stop();
  }
});

test('/api/config returns a boolean workspaceCreation=false when the gate is unset', async () => {
  const server = await startServer({ env: { WORKSPACE_CREATION: undefined } });
  try {
    const res = await fetch(`${server.base}/api/config`);
    const data = await res.json();
    assert.equal(data.workspaceCreation, false, `expected boolean false, got ${JSON.stringify(data.workspaceCreation)}`);
  } finally {
    await server.stop();
  }
});

/* ---------- WSG-05/06: operator identity — promote/demote endpoints ---------- */

const userRow = (srv, email) => withDb(srv.dbPath, db => db.prepare('select * from users where email = ?').get(email));
const auditRows = srv => withDb(srv.dbPath, db => db.prepare('select * from audit_log order by created_at, id').all());

/* registry so the per-base helpers can reach the harness server (dbPath) */
const servers = new Map();

async function operatorAndTarget(base) {
  const operator = (await login(base, ADMIN.email, ADMIN.password)).client;
  await signup(base, { name: 'Target', email: 'target@test.local' });
  const targetRow = await userRowFrom(base, 'target@test.local');
  return { operator, targetRow };
}

/* resolve ids through the operator users list (no direct db helper needed for routing) */
async function userRowFrom(base, email) {
  const server = servers.get(base);
  return userRow(server, email);
}
test('operator promotes a user — the flag flips, the users list reflects it, one operator_promoted audit row is written', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    const { operator, targetRow } = await operatorAndTarget(server.base);
    const opRow = userRow(server, ADMIN.email);

    const res = await operator.post(`/api/auth/operator/users/${targetRow.id}/promote`);
    assert.equal(res.status, 200, `promote must succeed, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.user.is_instance_admin, 1);

    const list = (await operator.get('/api/auth/operator/users')).data.users;
    assert.equal(list.find(u => u.id === targetRow.id).is_instance_admin, 1, 'the list reflects the flag');

    const rows = auditRows(server);
    assert.equal(rows.length, 1, 'exactly one audit row');
    const row = rows[0];
    assert.equal(row.actor_id, opRow.id);
    assert.equal(row.target_id, targetRow.id);
    assert.equal(row.action, 'operator_promoted');
    assert.equal(row.session_count, 0, 'no sessions were touched by a flag flip');
    assert.equal(row.workspace_id, null);
    assert.equal(row.actor_name, opRow.name);
    assert.equal(row.actor_email, opRow.email);
    assert.equal(row.target_name, targetRow.name);
    assert.equal(row.target_email, targetRow.email);
    assert.equal(Number.isInteger(row.created_at), true);
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('a non-operator caller gets 403 operatorOnly (before any target lookup)', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    await signup(server.base, { name: 'Plain', email: 'plain@test.local' });
    const plain = (await login(server.base, 'plain@test.local', 'password-1234')).client;
    const res = await plain.post('/api/auth/operator/users/whatever-id/promote');
    assert.equal(res.status, 403);
    assert.equal(res.data.code, 'operatorOnly');
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('an unknown target id is a keyed 404 notFound (no existence oracle)', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const res = await operator.post('/api/auth/operator/users/does-not-exist/promote');
    assert.equal(res.status, 404);
    assert.equal(res.data.code, 'notFound');
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('idempotent promote/demote returns 200 no-op with the current state', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    const { operator, targetRow } = await operatorAndTarget(server.base);
    const first = await operator.post(`/api/auth/operator/users/${targetRow.id}/promote`);
    assert.equal(first.status, 200);
    const again = await operator.post(`/api/auth/operator/users/${targetRow.id}/promote`);
    assert.equal(again.status, 200, 're-promoting a flagged user is a 200 no-op');
    assert.equal(again.data.user.is_instance_admin, 1);

    const demote = await operator.post(`/api/auth/operator/users/${targetRow.id}/demote`);
    assert.equal(demote.status, 200);
    const demoteAgain = await operator.post(`/api/auth/operator/users/${targetRow.id}/demote`);
    assert.equal(demoteAgain.status, 200, 're-demoting an unflagged user is a 200 no-op');
    assert.equal(demoteAgain.data.user.is_instance_admin, 0);
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('demoting the last operator is refused 409 lastOperator', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    const operator = (await login(server.base, ADMIN.email, ADMIN.password)).client;
    const opRow = userRow(server, ADMIN.email);
    const res = await operator.post(`/api/auth/operator/users/${opRow.id}/demote`);
    assert.equal(res.status, 409, `the last operator must be undemotable, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.code, 'lastOperator');
    assert.equal(userRow(server, ADMIN.email).is_instance_admin, 1, 'the flag is unchanged');
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('demoting when ≥2 operators exist succeeds and demote-self is legal (guard is the safety net)', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    const { operator, targetRow } = await operatorAndTarget(server.base);
    const promoted = await operator.post(`/api/auth/operator/users/${targetRow.id}/promote`);
    assert.equal(promoted.status, 200);
    // demote-self while another operator exists
    const self = await operator.post(`/api/auth/operator/users/${userRow(server, ADMIN.email).id}/demote`);
    assert.equal(self.status, 200, `demote-self with a surviving operator must succeed, got ${self.status}: ${JSON.stringify(self.data)}`);
    assert.equal(userRow(server, ADMIN.email).is_instance_admin, 0);
    assert.equal(userRow(server, 'target@test.local').is_instance_admin, 1);
    const row = auditRows(server).find(r => r.action === 'operator_demoted');
    assert.ok(row, 'an operator_demoted audit row is written');
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('forced audit failure rolls back the flag update (AUD-01 db.tx discipline)', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    const { operator, targetRow } = await operatorAndTarget(server.base);
    withDb(server.dbPath, db => db.exec('drop table audit_log'));
    const res = await operator.post(`/api/auth/operator/users/${targetRow.id}/promote`);
    assert.ok(res.status >= 500, `audit failure surfaces as 5xx (got ${res.status})`);
    assert.equal(userRow(server, 'target@test.local').is_instance_admin, 0, 'the flag write rolled back');
    withDb(server.dbPath, db =>
      db.exec(`create table if not exists audit_log (
        id text primary key, actor_id text, target_id text, action text, session_count integer,
        ip text, workspace_id text, actor_name text not null, actor_email text not null,
        target_name text not null, target_email text not null, created_at integer not null)`),
    );
    assert.equal(auditRows(server).length, 0, 'no audit row from the failed attempt');
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('the operator flag survives a reboot on the same dataDir (WSG-05)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-persist-'));
  let first = null;
  let second = null;
  try {
    first = await startServer({ dataDir: dir });
    servers.set(first.base, first);
    const { operator, targetRow } = await operatorAndTarget(first.base);
    const promoted = await operator.post(`/api/auth/operator/users/${targetRow.id}/promote`);
    assert.equal(promoted.status, 200);
    assert.equal(userRow(first, 'target@test.local').is_instance_admin, 1);
    servers.delete(first.base);
    await first.stop();
    first = null;
    second = await startServer({ dataDir: dir });
    servers.set(second.base, second);
    const relogged = (await login(second.base, ADMIN.email, ADMIN.password)).client;
    const list = (await relogged.get('/api/auth/operator/users')).data.users;
    assert.equal(list.find(u => u.id === targetRow.id).is_instance_admin, 1, 'the flag persisted across restart');
  } finally {
    if (first) servers.delete(first.base);
    if (second) servers.delete(second.base);
    await first?.stop();
    await second?.stop();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

test('stampInstanceAdmin still seeds the first operator from ADMIN_EMAIL at boot', async () => {
  const server = await startServer({});
  servers.set(server.base, server);
  try {
    assert.equal(userRow(server, ADMIN.email).is_instance_admin, 1, 'ADMIN_EMAIL is stamped as the first operator');
  } finally {
    servers.delete(server.base);
    await server.stop();
  }
});

test('--add-user does NOT set is_instance_admin on the created account (bootstrap + console only)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-adduser-'));
  const first = await startServer({ dataDir: dir }); // boots + seeds admin + workspace
  await first.stop();
  const { code } = await new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ['server.js', '--add-user', 'clib@test.local', 'Cli User'],
      {
        cwd: path.resolve(import.meta.dirname, '..'),
        env: {
          ...process.env,
          DATA_DIR: dir,
          DB_PATH: path.join(dir, 'projects.db'),
          USER_PASSWORD: 'cli-password-1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let out = '';
    child.stdout.on('data', c => (out += c));
    child.stderr.on('data', c => (out += c));
    child.on('exit', () => resolve({ code: child.exitCode, out }));
  });
  assert.equal(code, 0, '--add-user exits 0');
  const row = withDb(path.join(dir, 'projects.db'), db => db.prepare('select * from users where email = ?').get('clib@test.local'));
  assert.ok(row, 'the CLI created the account');
  assert.equal(row.is_instance_admin, 0, 'the flag stays 0 — the console is the only promotion path');
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
});
