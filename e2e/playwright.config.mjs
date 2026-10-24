import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.E2E_PORT || 4317);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: import.meta.dirname,
  testMatch: '**/*.spec.mjs',
  outputDir: path.join(ROOT, 'test-results'),
  fullyParallel: false,
  workers: process.env.CI ? 1 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { outputFolder: path.join(ROOT, 'playwright-report'), open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    /* UAT-09: the suite is pinned to English. This only fixes the browser's
       negotiated default for accounts whose locale is null (e.g. the tenancy
       fixtures) — accounts patched to a locale via PATCH /api/auth/me still
       boot in their own language, because the account locale wins over the
       negotiated one (LOC-03). */
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/server.mjs',
    cwd: ROOT,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true',
    timeout: 120_000,
    /* Without this Playwright SIGKILLs the group, skipping the wrapper's temp-dir cleanup. */
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
});
