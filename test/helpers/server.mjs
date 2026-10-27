/* Shared isolated-server harness for the node:test suites.
   Every suite spawns a real server.js on an ephemeral loopback port with its own
   temporary DATA_DIR, so no test needs a developer database, port 8080 or dist/. */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');

export const ADMIN = Object.freeze({ email: 'owner@test.local', password: 'owner-password-1', name: 'Owner' });

/* Constants every suite shares; a test can override any of them per server. */
const BASE_ENV = Object.freeze({
  HOST: '127.0.0.1',
  SEED_DATA: 'false',
  ALLOW_SIGNUP: 'true',
  ADMIN_EMAIL: ADMIN.email,
  ADMIN_PASSWORD: ADMIN.password,
  ADMIN_NAME: ADMIN.name,
  WORKSPACE_NAME: 'Acme',
  WORKSPACE_SLUG: 'acme',
});

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

/*
 * Boot one server process. `dataDir` defaults to a fresh mkdtemp directory the
 * harness owns and deletes on stop; pass one explicitly when a test needs to
 * reboot against the same database (migration tests).
 */
export async function startServer({ dataDir = null, env = {} } = {}) {
  const owned = !dataDir;
  const dir = dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-test-'));
  fs.mkdirSync(dir, { recursive: true });
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let output = '';
  const finalEnv = { ...process.env, ...BASE_ENV, PORT: String(port), DATA_DIR: dir, ...env, DB_PATH: path.join(dir, 'gr8r.db') };
  // A test passes `undefined` for a variable it wants ABSENT (e.g. ADMIN_EMAIL to
  // exercise the cold-start fallback); strip those keys instead of spawning with
  // the string "undefined" or leaving BASE_ENV's value in place.
  for (const key of Object.keys(finalEnv)) if (finalEnv[key] === undefined) delete finalEnv[key];
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: finalEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', chunk => (output += chunk));
  child.stderr.on('data', chunk => (output += chunk));

  const deadline = Date.now() + 12_000;
  let ready = false;
  while (!ready && Date.now() < deadline && child.exitCode === null) {
    try {
      ready = (await fetch(`${base}/api/config`)).ok;
    } catch {
      ready = false;
    }
    if (!ready) await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) {
    child.kill('SIGKILL');
    if (owned) fs.rmSync(dir, { recursive: true, force: true });
    throw new Error(`server did not start on ${base}\n${output}`);
  }

  return {
    base,
    port,
    dataDir: dir,
    dbPath: path.join(dir, 'gr8r.db'),
    output: () => output,
    async stop() {
      if (child.exitCode === null) {
        const exited = new Promise(resolve => child.once('exit', resolve));
        child.kill('SIGTERM');
        await exited;
      }
      if (owned) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/* Cookie-bearing HTTP client. Both auth cookies (session + 2FA challenge) are
   captured like a browser would — a jar, so a pending login followed by
   POST /api/auth/tfa/login completes the session transparently. */
export function client(base, name = 'client') {
  const jar = new Map();

  async function request(method, pathname, body) {
    const headers = {};
    if (jar.size) headers.cookie = [...jar.values()].join('; ');
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + pathname, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie?.() || []) {
      const pair = line.split(';')[0];
      const eq = pair.indexOf('=');
      const cookieName = pair.slice(0, eq);
      if (cookieName === 'gr8r_session' || cookieName === 'gr8r_tfa_challenge') jar.set(cookieName, pair);
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    return { status: res.status, data, name };
  }

  return {
    name,
    cookie: () => [...jar.values()].join('; '),
    get: pathname => request('GET', pathname),
    post: (pathname, body) => request('POST', pathname, body),
    put: (pathname, body) => request('PUT', pathname, body),
    patch: (pathname, body) => request('PATCH', pathname, body),
    del: pathname => request('DELETE', pathname),
  };
}

export async function login(base, email, password) {
  const account = client(base, email);
  const res = await account.post('/api/auth/login', { email, password });
  return { client: account, status: res.status, data: res.data };
}

/* Login for a 2FA-enabled account (TFA-05): the password step answers
   pending2fa; the caller supplies a live/recovery code to complete the
   sign-in on /api/auth/tfa/login. The jar carries challenge → session. */
export async function loginTfa(base, email, password, code) {
  const account = client(base, email);
  const res = await account.post('/api/auth/login', { email, password });
  if (res.status === 200 && res.data?.pending2fa) {
    const verify = await account.post('/api/auth/tfa/login', { code });
    return { client: account, status: verify.status, data: verify.data, pending: res };
  }
  return { client: account, status: res.status, data: res.data };
}

export async function signup(base, { name, email, password = 'password-1234' }) {
  const account = client(base, email);
  const res = await account.post('/api/auth/signup', { name, email, password });
  return { client: account, status: res.status, data: res.data };
}

/* Open the suite's database read/write, and always close it. */
export function withDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/* `/join/<token>` links come back in the invite payload; tests only need the token. */
export function inviteToken(url) {
  const value = String(url || '');
  const marker = '/join/';
  const at = value.lastIndexOf(marker);
  return at === -1 ? null : value.slice(at + marker.length);
}
