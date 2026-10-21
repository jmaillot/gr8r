/* =====================================================================
   E2E SERVER WRAPPER: one throwaway server per Playwright run.

   Creates a fresh mkdtemp DATA_DIR, boots the real server.js on loopback
   port 4173 with SEED_DATA=false, and removes the directory when it stops.
   Playwright starts and stops this process through `webServer`; it never
   touches a developer database, a running dev server or port 8080.
   ===================================================================== */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4173);
const HOST = '127.0.0.1';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-e2e-'));

/* The suite serves the built app; a missing build is a setup error, not a test failure. */
if (!fs.existsSync(path.join(ROOT, 'dist', 'index.html'))) {
  console.error('e2e: dist/index.html is missing — run `npm run build` before `npm run e2e`.');
  fs.rmSync(dataDir, { recursive: true, force: true });
  process.exit(1);
}

const env = {
  ...process.env,
  PORT: String(PORT),
  HOST,
  DATA_DIR: dataDir,
  /* DB_PATH wins over DATA_DIR in server.js; force it so an exported DB_PATH cannot leak in. */
  DB_PATH: path.join(dataDir, 'gr8r.db'),
  SEED_DATA: 'false',
  ALLOW_SIGNUP: 'true',
  ADMIN_EMAIL: 'e2e-owner@e2e.local',
  ADMIN_PASSWORD: 'e2e-owner-password',
  ADMIN_NAME: 'E2E Owner',
  WORKSPACE_NAME: 'Acme',
  WORKSPACE_SLUG: 'acme',
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
