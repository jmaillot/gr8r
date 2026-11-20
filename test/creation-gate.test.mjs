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
import { ADMIN, client, inviteToken, login, signup, startServer } from './helpers/server.mjs';

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
