/* The e2e dist guard, proven on the REAL server wrapper.
   DELIV-01: e2e/server.mjs must refuse to serve a stale or missing dist/ — fail-closed,
   with the fix named — and must boot normally against a fresh one. The suite spawns the
   actual `node e2e/server.mjs` process for every case: the guard is a boot-path behavior,
   so importing an internal function would fake the very branch being proven.

   Mechanisms (documented per the plan's task spec):
   - Missing dist: e2e/server.mjs derives ROOT from its own module path, so the branch is
     reached by copying the wrapper into a temporary empty root (<tmp>/e2e/server.mjs).
     The real dist/ is never moved or deleted for this case.
   - Stale dist: the real dist/ is built once, then dist/.vite/manifest.json is doctored by
     one byte; after() restores the pristine bytes (asserted) so no fixture poisoning.
   - Fresh dist: the pristine build boots; the test polls the port, then kills the process. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { freePort, ROOT } from './helpers/server.mjs';

const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
const SERVER = path.join(ROOT, 'e2e', 'server.mjs');
const MANIFEST = path.join(ROOT, 'dist', '.vite', 'manifest.json');

let pristineManifest = null;
let stalePort = null;
let freshPort = null;

function buildDist() {
  const result = spawnSync(process.execPath, [VITE_BIN, 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `the dist/ build failed\n${result.stdout || ''}\n${result.stderr || ''}`);
}

/* Spawn a server wrapper with the env it needs pinned (precedent: server.mjs pins DB_PATH
   itself so an exported var cannot leak in; the test pins the same hardening). The wrapper
   path is a parameter: the missing-dist case reaches its branch by spawning a COPY of the
   wrapper from a temporary empty root, never by touching the real dist/. */
function spawnGuard(env, cwd, serverPath) {
  return spawn(process.execPath, [serverPath || SERVER], {
    cwd: cwd || ROOT,
    env: {
      ...process.env,
      E2E_PORT: String(env.port),
      SEED_DATA: 'false',
      DB_PATH: path.join(env.dataDir || os.tmpdir(), 'projects-guard-test.db'),
      MAX_UPLOAD_MB: '1',
      ALLOW_SIGNUP: 'true',
    },
    encoding: 'utf8',
  });
}

function collect(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr.on('data', d => {
      stderr += d;
    });
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve({ code, signal, stderr }));
  });
}

/* Poll until the port accepts a TCP connection (or the deadline passes). */
function waitUntilUp(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect({ port, host: '127.0.0.1' });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() > deadline) return reject(new Error(`the server never accepted a connection on ${port}`));
        setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

before(() => {
  buildDist();
  pristineManifest = fs.readFileSync(MANIFEST, 'utf8');
});

after(() => {
  /* Fixture poisoning guard: the doctored manifest byte MUST be restored byte-identical. */
  if (pristineManifest !== null) fs.writeFileSync(MANIFEST, pristineManifest);
  assert.equal(fs.readFileSync(MANIFEST, 'utf8'), pristineManifest, 'the manifest was restored byte-identical');
});

test('a missing dist refuses fail-closed: exit 1 and the message names the fix', async () => {
  /* The wrapper resolves ROOT from its own module path, so a copy in an empty temporary
     root reaches the missing-dist branch without ever touching the real dist/. */
  const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-guard-missing-'));
  fs.mkdirSync(path.join(fakeRoot, 'e2e'));
  fs.copyFileSync(SERVER, path.join(fakeRoot, 'e2e', 'server.mjs'));
  try {
    const port = await freePort();
    const result = await collect(spawnGuard({ port }, fakeRoot, path.join(fakeRoot, 'e2e', 'server.mjs')));
    assert.equal(result.code, 1, `the wrapper must exit 1 on a missing dist (got ${result.code})`);
    assert.ok(result.stderr.includes('dist/index.html is missing'), `stderr must name the missing dist\n${result.stderr}`);
    assert.ok(!result.stderr.includes('dist/ stale'), 'the missing-dist branch keeps its own message');
  } finally {
    fs.rmSync(fakeRoot, { recursive: true, force: true });
  }
});

test('a stale dist refuses fail-closed: exit 1 and the exact stale message', async () => {
  stalePort = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-guard-stale-'));
  try {
    /* One doctored byte: the stamp no longer matches the manifest content. */
    fs.writeFileSync(MANIFEST, pristineManifest.replace('"file"', '"file" '));
    const result = await collect(spawnGuard({ port: stalePort, dataDir }));
    assert.equal(result.code, 1, `the wrapper must exit 1 on a stale dist (got ${result.code})`);
    assert.ok(
      result.stderr.includes('dist/ stale — run `npm run build`'),
      `stderr must carry the exact actionable message\n${result.stderr}`,
    );
  } finally {
    /* Restore before anything else can observe the doctored state. */
    fs.writeFileSync(MANIFEST, pristineManifest);
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('the refused stale run cleaned up its throwaway dataDir', async () => {
  /* The wrapper's own cleanup ran before exit (it rmSync's its mkdtemp DATA_DIR); the test's
     pinned DB_PATH dir is the only artifact the test itself created. */
  const entries = fs
    .readdirSync(os.tmpdir())
    .filter(name => name.startsWith('projects-e2e-') && Date.now() - fs.statSync(path.join(os.tmpdir(), name)).birthtimeMs < 60000);
  assert.deepEqual(entries, [], `no throwaway projects-e2e-* dir survives a refused run (${entries.join(', ')})`);
});

test('a fresh dist boots: the server accepts connections and never refuses', async () => {
  freshPort = await freePort();
  const child = spawnGuard({ port: freshPort });
  let stderr = '';
  child.stderr.on('data', d => {
    stderr += d;
  });
  try {
    await waitUntilUp(freshPort, 15000);
    assert.ok(!child.exitCode, 'the server must still be running while the port is being served');
    assert.ok(!stderr.includes('dist/ stale'), 'a fresh build must not trip the staleness guard');
  } finally {
    const stopped = collect(child);
    child.kill('SIGTERM');
    await stopped;
  }
  /* The fresh run cleaned its throwaway dataDir on shutdown. */
  const entries = fs
    .readdirSync(os.tmpdir())
    .filter(name => name.startsWith('projects-e2e-') && Date.now() - fs.statSync(path.join(os.tmpdir(), name)).birthtimeMs < 60000);
  assert.deepEqual(entries, [], `no throwaway projects-e2e-* dir survives a fresh run (${entries.join(', ')})`);
});
