import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.DEMO_E2E_PORT || 4318);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/* D-11: the demo-mode proof tests the BUILT artifact with NO API behind it.
   `vite preview` serves dist/ only — the /api proxy in vite.config.js lives in
   the dev `server` block and never applies here, so /api/config 404s and the
   client falls back to local demo mode (DEPLOY.md §12). */
export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: '**/demo-locale.spec.mjs',
  outputDir: path.join(ROOT, 'test-results'),
  fullyParallel: false,
  /* One worker: the scenarios share the origin (and its localStorage), so they
     must never run concurrently — the persistence proof would race the other
     context's storage. */
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: path.join(ROOT, 'playwright-report'), open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'vite preview --port 4318 --strictPort',
    cwd: ROOT,
    url: BASE_URL,
    reuseExistingServer: process.env.DEMO_E2E_REUSE_SERVER === 'true',
    timeout: 120_000,
    /* Same contract as the main suite: a graceful stop, not a SIGKILL. */
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
