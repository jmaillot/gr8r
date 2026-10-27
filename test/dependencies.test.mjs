/* =====================================================================
   test: dependencies — the zero-runtime-dependency contract (D-12).

   The runtime is one bare Node process: package.json carries no
   "dependencies" key, and the Dockerfile's runtime stage stays bare
   node + su-exec copying only server.js/mailer.js/seed.json/dist.
   A new runtime dependency or a heavier runtime image must fail npm test
   before it ships.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import pkg from '../package.json' with { type: 'json' };

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

test('package.json carries no runtime dependencies (D-12)', () => {
  assert.equal(
    'dependencies' in pkg,
    false,
    'package.json gained a "dependencies" key — runtime dependencies are forbidden (D-12): the server runs on Node built-ins only; dev-time tooling belongs in devDependencies',
  );
});

test('the Dockerfile runtime stage stays bare node + su-exec with exactly the five COPY targets (D-12)', () => {
  const dockerfile = fs.readFileSync(path.join(REPO_ROOT, 'Dockerfile'), 'utf8');

  // Scope every assertion to the runtime stage, never the build stage
  // (the build stage legitimately runs npm ci).
  const start = dockerfile.search(/^FROM\s+.*\s+AS\s+runtime\s*$/m);
  assert.ok(start !== -1, 'the Dockerfile lost its runtime stage');
  const runtime = dockerfile.slice(start);

  assert.ok(/^FROM\s+node:24-alpine\s+AS\s+runtime\s*$/m.test(runtime), 'the runtime stage must be bare node:24-alpine (D-12)');

  const apkInvocations = [...runtime.matchAll(/apk\s+add[^\n]*/g)].map(m => m[0].replace(/\s*\\$/, '').trim());
  assert.deepEqual(
    apkInvocations,
    ['apk add --no-cache su-exec'],
    `the runtime stage must install nothing but su-exec — found: ${apkInvocations.join(' | ')} (D-12)`,
  );

  const copyTargets = [...runtime.matchAll(/^COPY(?:\s+--from=\S+)?\s+(.+)$/gm)]
    .map(m => m[1].trim().split(/\s+/).pop().replace(/^\.\//, ''))
    // the entrypoint script is infrastructure, not app payload — D-12 constrains
    // the app surface: one Node process served by server.js/mailer.js/seed.json/dist
    .filter(t => t !== '/usr/local/bin/docker-entrypoint.sh');
  // 7668ece: server.js imports totp.js at runtime, so the image ships it too.
  assert.deepEqual(
    copyTargets.sort(),
    ['dist', 'mailer.js', 'seed.json', 'server.js', 'totp.js'],
    `the runtime stage must copy exactly server.js, totp.js, mailer.js, seed.json and dist — found: ${copyTargets.join(' | ')} (D-12)`,
  );
});
