/* The D-02 delivery gate, proven on the REAL bundle.
   DELIV-02 is a property of the shipped artifact: the suite runs the same `vite build`
   the CI runs, into a temporary out directory, and asserts on the produced bytes.
   Nothing is written into dist/: the developer's bundle is never touched.

   Gate rule: every emitted .js chunk must be <= 500000 bytes (500 kB, matching the
   Vite kB chunkSizeWarningLimit reading). The assertion measures real bytes on disk —
   never manifest filename lists. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ROOT } from './helpers/server.mjs';

const VITE_BIN = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

/* The gate threshold: 500 kB in bytes (the Vite kB reading, not KiB). */
const MAX_CHUNK_BYTES = 500000;

let outDir = null;

before(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-gate-'));
  const result = spawnSync(process.execPath, [VITE_BIN, 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `the vite build failed\n${result.stdout || ''}\n${result.stderr || ''}`);
});

after(() => {
  if (outDir) fs.rmSync(outDir, { recursive: true, force: true });
});

/* Every .js chunk under assets/, with its real byte size on disk. */
function jsChunks() {
  const dir = path.join(outDir, 'assets');
  return fs
    .readdirSync(dir)
    .filter(name => name.endsWith('.js'))
    .sort()
    .map(name => ({ name, bytes: fs.statSync(path.join(dir, name)).size }));
}

function chunksByPrefix(prefix) {
  return jsChunks().filter(c => c.name.startsWith(prefix));
}

/* ---------- D-02: the 500 kB chunk gate ---------- */

test('every emitted .js chunk is <= 500000 bytes', () => {
  const oversized = jsChunks().filter(c => c.bytes > MAX_CHUNK_BYTES);
  assert.deepEqual(
    oversized,
    [],
    `oversized chunks (limit ${MAX_CHUNK_BYTES} bytes):\n` +
      oversized.map(c => `  ${c.name}: ${c.bytes} bytes`).join('\n'),
  );
});

/* ---------- split-existence assertions ---------- */

test('the build emits a lazy qrcode chunk', () => {
  const chunks = chunksByPrefix('qrcode');
  assert.ok(chunks.length > 0, `no qrcode-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});

test('the build emits a lazy settings chunk', () => {
  const chunks = chunksByPrefix('settings');
  assert.ok(chunks.length > 0, `no settings-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});

test('the build emits a lazy seed chunk', () => {
  const chunks = chunksByPrefix('seed');
  assert.ok(chunks.length > 0, `no seed-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});

/* 56-02 final edge set: design-system, members, activity, search. */
test('the build emits a lazy design-system chunk', () => {
  const chunks = chunksByPrefix('design-system');
  assert.ok(chunks.length > 0, `no design-system-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});

test('the build emits a lazy members chunk', () => {
  const chunks = chunksByPrefix('members');
  assert.ok(chunks.length > 0, `no members-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});

test('the build emits a lazy activity chunk', () => {
  const chunks = chunksByPrefix('activity');
  assert.ok(chunks.length > 0, `no activity-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});

test('the build emits a lazy search chunk', () => {
  const chunks = chunksByPrefix('search');
  assert.ok(chunks.length > 0, `no search-*.js chunk in assets:\n${jsChunks().map(c => c.name).join('\n')}`);
});
