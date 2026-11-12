/* =====================================================================
   E2E SERVER WRAPPER: one throwaway server per Playwright run.

   Creates a fresh mkdtemp DATA_DIR, boots the real server.js on loopback
   port 4317 with SEED_DATA=false, and removes the directory when it stops.
   Playwright starts and stops this process through `webServer`; it never
   touches a developer database, a running dev server or port 8080.
   ===================================================================== */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4317);
const HOST = '127.0.0.1';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-e2e-'));

/* The suite serves the built app; a missing build is a setup error, not a test failure. */
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('e2e: dist/index.html is missing — run `npm run build` before `npm run e2e`.');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
}

/* The suite serves the built app; a STALE build is the same setup error wearing a subtler
   disguise (src changed, build forgotten, e2e fails on misleading symptoms). The build
   records a sha256 stamp of dist/.vite/manifest.json at build time (vite.config.js
   buildStamp plugin, D-04); the guard recomputes and compares. mtime is never read (D-04):
   git checkout and touch both rewrite mtimes without touching content. Fail-closed (D-05):
   no auto-rebuild, no env opt-out — the message names the exact fix. A dist built before
   the manifest option existed carries no stamp file at all, so it refuses too (fail-closed
   on missing evidence, not just on mismatch). */
const manifestPath = path.join(ROOT, 'dist', '.vite', 'manifest.json');
const stampPath = path.join(ROOT, 'dist', '.vite', 'build-stamp.json');
/* A pre-phase dist built without the manifest option carries no manifest and cannot be
   trusted: refuse it with the same stale message rather than crashing on a read. */
if (!fs.existsSync(manifestPath)) {
  console.error('e2e: dist/ stale — run `npm run build`.');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
}
const recompute = createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
let stamp = null;
try {
  stamp = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
} catch {
  /* a corrupt/missing stamp is stale evidence, not a crash */
}
if (!stamp || stamp.hash !== recompute) {
  console.error('e2e: dist/ stale — run `npm run build`.');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
}

const env = {
  ...process.env,
  PORT: String(PORT),
  HOST,
  DATA_DIR: dataDir,
  /* DB_PATH wins over DATA_DIR in server.js; force it so an exported DB_PATH cannot leak in. */
  DB_PATH: path.join(dataDir, 'projects.db'),
  SEED_DATA: 'false',
  /* PREVIEW-02 drives the oversize path in the browser: a 1 MB cap keeps the
     fixture upload (a 1×1 PNG) far under it and the rejected 2 MB drop fast. */
  MAX_UPLOAD_MB: '1',
  ALLOW_SIGNUP: 'true',
  /* The fixture scheme in helpers/setup.mjs is per-IP throttles dodged by a
     run-unique X-Forwarded-For per account; the server only reads that header
     when TRUST_PROXY is on (production runs behind Traefik). Without it every
     request shares 127.0.0.1 and the 5/hour/IP signup throttle fails the
     full suite. */
  TRUST_PROXY: 'true',
  ADMIN_EMAIL: 'e2e-owner@e2e.local',
  ADMIN_PASSWORD: 'e2e-owner-password',
  ADMIN_NAME: 'E2E Owner',
  WORKSPACE_NAME: 'Acme',
  WORKSPACE_SLUG: 'acme',
  /* A throwaway random MASTER_KEY per run: the TOTP secret envelope (AES-256-GCM)
     is part of the real enable path (D-06), so 2FA e2e must run against a
     genuinely configured server — the fail-closed 503 is the unconfigured-
     production behavior, not the suite's target. Never a test-only backdoor. */
  MASTER_KEY: (await import('node:crypto')).randomBytes(32).toString('hex'),
};

const child = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: 'inherit' });

let stopping = false;

function removeData() {
  fs.rmSync(dataDir, { recursive: true, force: true });
}

child.on('exit', (code, signal) => {
  removeData();
  /* A signal we initiated is not the server's own exit: the handler below owns the code. */
  if (stopping) return;
  process.exit(code ?? (signal ? 1 : 0));
});

child.on('error', err => {
  console.error(`e2e: could not start server.js: ${err.message}`);
  removeData();
  process.exit(1);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const finish = () => {
      removeData();
      process.exit(0);
    };
    if (child.exitCode !== null) return finish();
    child.once('exit', finish);
    child.kill(signal);
    /* A wedged child must not keep Playwright waiting past its shutdown budget. */
    setTimeout(() => {
      child.kill('SIGKILL');
      finish();
    }, 5000).unref();
  });
}
