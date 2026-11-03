/* DEPLOY-01: docker-compose.yml forwards MASTER_KEY_PREVIOUS to the container in
   the optional `${MASTER_KEY_PREVIOUS:-}` form (D-07) — never `:?`, so fresh
   installs without the variable keep booting (T-35-03).

   Two layers per D-09:
   1. Parse (no docker needed): the MASTER_KEY_PREVIOUS line sits directly after
      the MASTER_KEY line and uses the `:-` optional form only.
   2. Config (docker required): `docker compose config` exits 0 with the variable
      unset (fresh-install boot) and set (the rendered environment carries the
      value — interpolation proven end-to-end, T-35-05). The three `:?` required
      vars (ADMIN_EMAIL, ADMIN_PASSWORD, MASTER_KEY) are set in BOTH runs —
      `compose config` exits 1 without them — only MASTER_KEY_PREVIOUS varies.
   If the docker binary is absent, only the config cases skip, with an explicit
   named reason — never a silent pass (D-09). */

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const COMPOSE = fileURLToPath(new URL('../docker-compose.yml', import.meta.url));

test('compose forwards MASTER_KEY_PREVIOUS via optional :- form, directly after MASTER_KEY', () => {
  const lines = readFileSync(COMPOSE, 'utf8').split('\n');
  const masterIdx = lines.findIndex(l => l.trim().startsWith('MASTER_KEY:'));
  assert.ok(masterIdx !== -1, 'MASTER_KEY line exists in docker-compose.yml');
  const prevIdx = lines.findIndex(l => l.trim().startsWith('MASTER_KEY_PREVIOUS:'));
  assert.ok(prevIdx !== -1, 'MASTER_KEY_PREVIOUS line exists in docker-compose.yml');
  assert.equal(prevIdx, masterIdx + 1, 'MASTER_KEY_PREVIOUS is the line immediately after MASTER_KEY (D-07)');
  const line = lines[prevIdx];
  assert.ok(
    line.includes('${MASTER_KEY_PREVIOUS:-'),
    'uses the optional ${MASTER_KEY_PREVIOUS:-} form (fresh installs keep booting)',
  );
  assert.ok(!line.includes(':?'), 'never uses the required :? form (T-35-03)');
});

// The three required `:?` vars are ALWAYS provided in both config runs (Pitfall 2:
// `docker compose config` exits 1 without them). Only MASTER_KEY_PREVIOUS varies.
const BASE_ENV = {
  ...process.env,
  ADMIN_EMAIL: 'admin@example.com',
  ADMIN_PASSWORD: 'x'.repeat(12),
  MASTER_KEY: 'k'.repeat(64),
};

test('docker compose config exits 0 with MASTER_KEY_PREVIOUS unset (fresh install boots)', async t => {
  const env = { ...BASE_ENV };
  delete env.MASTER_KEY_PREVIOUS;
  try {
    await execFileAsync('docker', ['compose', 'config', '--quiet'], { env, cwd: fileURLToPath(new URL('../', import.meta.url)) });
  } catch (err) {
    if (err.code === 'ENOENT') {
      t.skip('docker compose unavailable');
      return;
    }
    throw err;
  }
});

test('docker compose config exits 0 with MASTER_KEY_PREVIOUS set and forwards the value', async t => {
  const env = { ...BASE_ENV, MASTER_KEY_PREVIOUS: 'old-key-sentinel-value' };
  let stdout;
  try {
    ({ stdout } = await execFileAsync('docker', ['compose', 'config'], { env, cwd: fileURLToPath(new URL('../', import.meta.url)) }));
  } catch (err) {
    if (err.code === 'ENOENT') {
      t.skip('docker compose unavailable');
      return;
    }
    throw err;
  }
  assert.ok(
    stdout.includes('MASTER_KEY_PREVIOUS: old-key-sentinel-value'),
    'rendered config carries the forwarded value in the service environment (T-35-05)',
  );
});
