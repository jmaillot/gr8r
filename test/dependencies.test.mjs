/* =====================================================================
   test: dependencies — the runtime-dependency contract (D-12, as
   amended by Phase 45 D-02).

   The runtime is one bare Node process: package.json historically
   carried no "dependencies" key, and the Dockerfile's runtime stage
   stays bare node + su-exec. Phase 45 (2026-11-07, D-02) amends the
   dependency pin: `pg` is the first runtime dependency — required and
   pinned (plain dependencies, never optionalDependencies: a silently
   skipped install would defeat D-04 fail-closed boot) but loaded via
   dynamic import ONLY when DB_URL is a postgres:// URL. Without
   DB_URL the instance remains 100% Node built-ins. A new runtime
   dependency or a heavier runtime image must still fail npm test
   before it ships.
   ===================================================================== */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

import pkg from '../package.json' with { type: 'json' };

const REPO_ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

test('package.json runtime dependencies are exactly { pg } (D-12 as amended by Phase 45 D-02)', () => {
  assert.ok(
    pkg.dependencies,
    'package.json lost the "dependencies" key — pg must be a REQUIRED runtime dependency (Phase 45 D-02): optionalDependencies would let a broken install silently vanish, defeating D-04 fail-closed boot',
  );
  assert.deepEqual(
    Object.keys(pkg.dependencies).sort(),
    ['pg'],
    `package.json runtime dependencies must be exactly { pg } (Phase 45 D-02) — found: ${Object.keys(pkg.dependencies).join(' | ')}`,
  );
  assert.match(pkg.dependencies.pg, /^\^8\./, 'pg must stay on the 8.x line (D-01 pin)');
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
  // Phase 30: server.js imports oidc.js at runtime (Entra SSO / OIDC), so the image ships it too.
  // Phase 34: server.js imports src/lib/redaction.js at runtime, so the image ships src/ too.
  // Phase 44: server.js imports tz.js at runtime (resolveTz funnel), so the image ships it too.
  assert.deepEqual(
    copyTargets.sort(),
    ['dist', 'mailer.js', 'oidc.js', 'seed.json', 'server.js', 'src', 'totp.js', 'tz.js'],
    `the runtime stage must copy exactly server.js, totp.js, oidc.js, mailer.js, tz.js, seed.json, src and dist — found: ${copyTargets.join(' | ')} (D-12)`,
  );
});
