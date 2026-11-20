/* =====================================================================
   PHASE 78 AWAIT-ACCESS PROOF (78-02, WSG-10): the closed-gate client
   surfaces in the REAL built app.

   The shared e2e server runs WORKSPACE_CREATION=true (helpers/setup.mjs
   fixtures create workspaces with non-operator accounts), so this spec
   boots its OWN throwaway server with the gate UNSET — the 78-01
   fail-closed default — on a private port. Everything is server truth:
   the admin account is the boot-stamped instance operator (ADMIN_EMAIL),
   the await users sign up through the real API and drive the real UI.

   Cases:
   1. A rights-less signup lands on the await view: invite copy, poll
      hint, sign-out present, NO app shell, NO creation surface — and the
      15 s poll auto-enters the app once a membership appears (invite +
      accept through the real API while the page is open).
   2. A promoted user is auto-entered too: no membership, so the soft
      path cannot resolve and the poll falls back to the honest reload —
      boot routing lands onboarding (operator can create).
   3. Button gating: the workspace-switcher popover carries the create
      button ONLY for a righted viewer (the operator), never for a plain
      member.

   A2 note (78-VALIDATION): the document.hidden pause is pinned at unit
   level (test/creation-gate-client.test.mjs — the guard-first tick);
   Playwright cannot flip document.hidden, so dispatching
   visibilitychange here can only prove the resume path, not the pause.
   The catalogues are imported directly (D-77-7 convention) — no
   duplicated string table; no sleeps, no networkidle (expect-only).
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PASSWORD, apiClient, clientIp, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
import nl from '../src/locales/nl.json' with { type: 'json' };
import de from '../src/locales/de.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };

const cat = en;

/* WSG-11: the await-page + operator-console keys exist in all 5 catalogues. */
for (const key of [
  'page.auth.noWorkspaceTitle',
  'page.auth.noWorkspaceBody',
  'page.auth.awaitPollHint',
  'settings.operator.promote',
  'settings.operator.demoteShort',
  'settings.operator.demoteConfirmBody',
  'settings.operator.demoteConfirm',
  'settings.operator.toastPromoted',
  'settings.operator.toastDemoted',
]) {
  for (const [lang, catalogue] of [['en', en], ['fr', fr], ['nl', nl], ['de', de], ['es', es]]) {
    test.expect(typeof catalogue[key], `${lang} catalogue carries ${key}`).toBe('string');
  }
}

/* ---------- the closed-gate server (WORKSPACE_CREATION unset = false) ---------- */
const AWAIT_PORT = Number(process.env.E2E_AWAIT_PORT || 4319);
const AWAIT_BASE = `http://127.0.0.1:${AWAIT_PORT}`;
const ADMIN = { email: 'e2e-owner@e2e.local', password: 'e2e-owner-password' };

let child;
let dataDir;
let stopped = false;

async function startClosedServer() {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-e2e-await-'));
  child = spawn(
    process.execPath,
    ['server.js'],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      env: {
        ...process.env,
        PORT: String(AWAIT_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: dataDir,
        DB_PATH: path.join(dataDir, 'projects.db'),
        SEED_DATA: 'false',
        ALLOW_SIGNUP: 'true',
        TRUST_PROXY: 'true',
        ADMIN_EMAIL: ADMIN.email,
        ADMIN_PASSWORD: ADMIN.password,
        ADMIN_NAME: 'E2E Await Admin',
        WORKSPACE_NAME: 'Acme',
        WORKSPACE_SLUG: 'acme',
        MAX_UPLOAD_MB: '1',
        /* WORKSPACE_CREATION deliberately unset — the fail-closed gate. */
      },
      stdio: 'inherit',
    },
  );
  child.on('exit', code => {
    if (code && code !== 0 && !stopped) throw new Error(`closed-gate server exited with ${code}`);
  });
}


async function stopClosedServer() {
  stopped = true;
  if (!child) return;
  const done = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM');
  await Promise.race([done, new Promise(resolve => setTimeout(resolve, 5000))]);
  if (child.exitCode === null) child.kill('SIGKILL');
  fs.rmSync(dataDir, { recursive: true, force: true });
}

test.beforeAll(async () => {
  await startClosedServer();
  /* Readiness: poll /api/health — the same gate the playwright webServer
     config uses for the shared server. No fixed sleep. */
  await expect
    .poll(
      async () => {
        try {
          const r = await fetch(`${AWAIT_BASE}/api/health`);
          return r.ok;
        } catch {
          return false;
        }
      },
      { timeout: 30_000, intervals: [250] },
    )
    .toBe(true);
});

test.afterAll(async () => {
  await stopClosedServer();
});

let run;
let admin;
let awaiter; // case 1: gains a membership while the await page is open
let awaiter2; // case 2: is promoted to operator, no membership

test.beforeAll(async () => {
  run = newRunId();
  admin = apiClient(AWAIT_BASE, { name: 'await-admin', ip: clientIp(run, 'await-admin') });
  expect((await admin.post('/api/auth/login', ADMIN)).status, 'admin sign-in').toBe(200);

  async function signup(tag, name) {
    const c = apiClient(AWAIT_BASE, { name: tag, ip: clientIp(run, tag) });
    const email = `${tag}-${run}@e2e.local`;
    expect((await c.post('/api/auth/signup', { name, email, password: PASSWORD })).status, `${tag} signup`).toBe(201);
    const me = await c.get('/api/auth/me');
    expect(me.status, `${tag} me`).toBe(200);
    return { client: c, email, id: me.data.user.id };
  }
  awaiter = await signup('awaiter', 'Await Member');
  awaiter2 = await signup('awaiter2', 'Await Operator');
});

/* Sign a fixture account in through the REAL UI (en-pinned suite). */
async function signIn(page, account) {
  await page.goto('/');
  await page.getByLabel(cat['common.email']).fill(account.email);
  await page.getByLabel(cat['common.password'], { exact: true }).fill(account.password || PASSWORD);
  await page.getByRole('button', { name: cat['page.auth.signIn'] }).click();
}

const AWAIT_HEADING = cat['page.auth.noWorkspaceTitle'];

test('case 1: rights-less signup lands on the await view and the poll auto-enters on membership', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: AWAIT_BASE,
    extraHTTPHeaders: { 'x-forwarded-for': awaiter.client.ip },
  });
  const page = await context.newPage();
  try {
    await signIn(page, awaiter);

    /* THE await view: invite copy + poll hint + sign-out, and NO app shell
       (no workspace switcher) and NO creation surface (no onboarding step). */
    await expect(page.getByRole('heading', { name: AWAIT_HEADING })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(cat['page.auth.awaitPollHint'])).toBeVisible();
    await expect(page.getByRole('button', { name: cat['palette.signOut'] })).toBeVisible();
    await expect(page.getByLabel(cat['a11y.switchWorkspace'])).toHaveCount(0);
    await expect(page.getByRole('heading', { name: cat['page.auth.onb1Title'] })).toHaveCount(0);

    /* Access arrives WHILE the page polls: the operator invites the account
       into acme and the account accepts — server-side membership truth. */
    const invRes = await admin.post('/api/workspaces/acme/invites', { emails: [awaiter.email], role: 'member' });
    expect(invRes.status, 'await invite').toBe(201);
    const token = String(invRes.data?.invites?.[0]?.url || '').split('/join/')[1];
    expect(token, 'invite token').toBeTruthy();
    expect((await awaiter.client.post(`/api/invites/${token}/accept`, {})).status, 'accept').toBe(200);

    /* THE auto-entry: within one or two 15 s ticks the page soft-enters. */
    await expect(page).toHaveURL(/\/w\/acme$/, { timeout: 35_000 });
    await expect(page.getByLabel(cat['a11y.switchWorkspace'])).toBeVisible();
  } finally {
    await context.close();
  }
});

test('case 2: a promoted user is auto-entered — reload fallback lands onboarding (create path)', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: AWAIT_BASE,
    extraHTTPHeaders: { 'x-forwarded-for': awaiter2.client.ip },
  });
  const page = await context.newPage();
  try {
    await signIn(page, awaiter2);
    await expect(page.getByRole('heading', { name: AWAIT_HEADING })).toBeVisible({ timeout: 15_000 });

    /* The operator promotes the awaiting account (78-01 endpoint). */
    expect(
      (await admin.post(`/api/auth/operator/users/${awaiter2.id}/promote`, {})).status,
      'promote',
    ).toBe(200);

    /* No membership → the soft path cannot resolve → honest reload → boot
       routing sees canCreateWorkspace (operator) → onboarding. The boot path
       starts the flow at step 2 (main.js S.ui.onb = 1) — "Create your workspace". */
    await expect(page.getByRole('heading', { name: cat['page.auth.onb2Title'] })).toBeVisible({ timeout: 35_000 });
    await expect(page.getByRole('heading', { name: AWAIT_HEADING })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('case 3: the create button in the workspace switcher is role-gated (member ✗, operator ✓)', async ({ browser }) => {
  /* A dedicated plain member of acme (own invite, accepted server-side before
     any browser opens) — no dependency on case 1's flow. */
  const memberEmail = `await-member-${run}@e2e.local`;
  const memberClient = apiClient(AWAIT_BASE, { name: 'await-member', ip: clientIp(run, 'await-member') });
  expect((await memberClient.post('/api/auth/signup', { name: 'Await Member Two', email: memberEmail, password: PASSWORD })).status, 'member signup').toBe(201);
  const invRes = await admin.post('/api/workspaces/acme/invites', { emails: [memberEmail], role: 'member' });
  expect(invRes.status, 'member invite').toBe(201);
  const memberToken = String(invRes.data?.invites?.[0]?.url || '').split('/join/')[1];
  expect((await memberClient.post(`/api/invites/${memberToken}/accept`, {})).status, 'member accept').toBe(200);

  const memberContext = await browser.newContext({
    baseURL: AWAIT_BASE,
    extraHTTPHeaders: { 'x-forwarded-for': clientIp(run, 'await-member-ui') },
  });
  const memberPage = await memberContext.newPage();
  try {
    await signIn(memberPage, { email: memberEmail, ip: clientIp(run, 'await-member-ui') });
    await expect(memberPage.getByLabel(cat['a11y.switchWorkspace'])).toBeVisible({ timeout: 15_000 });
    await memberPage.getByLabel(cat['a11y.switchWorkspace']).click();
    await expect(memberPage.getByRole('button', { name: cat['popover.createWorkspace'] })).toHaveCount(0);
  } finally {
    await memberContext.close();
  }

  /* The boot-stamped operator: the create button is there. */
  const adminContext = await browser.newContext({
    baseURL: AWAIT_BASE,
    extraHTTPHeaders: { 'x-forwarded-for': clientIp(run, 'await-admin-ui') },
  });
  const adminPage = await adminContext.newPage();
  try {
    await signIn(adminPage, { ...ADMIN, password: ADMIN.password });
    await expect(adminPage.getByLabel(cat['a11y.switchWorkspace'])).toBeVisible({ timeout: 15_000 });
    await adminPage.getByLabel(cat['a11y.switchWorkspace']).click();
    await expect(adminPage.getByRole('button', { name: cat['popover.createWorkspace'] })).toBeVisible();
  } finally {
    await adminContext.close();
  }
});
