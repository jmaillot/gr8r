/* =====================================================================
   PHASE 53 E2E (PROJ-01, PROJ-02): the Workspace > Projects table and
   the Share dedup on the project page.

   PROJ-01: the table view renders Lead / Teams / Members count / Status
   (PSTAT pill + task-based progress) / Target date, plus a standalone
   per-row settings gear opening the unified modal on the General tab.
   PROJ-02: the project page has exactly ONE Share affordance — the
   labeled button, opening the unified modal's Access tab (D-05/M-13).

   Conventions follow the rest of the suite: fixtures only through the
   real API (helpers/setup.mjs), one browser context per account,
   per-run client IPs.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';

async function signIn(page, account) {
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* Adds one named public project to the workspace doc through the real API. */
async function addProject(client, slug, { id, key, name, members = [] }) {
  const got = await client.get(`/api/workspaces/${slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id,
      key,
      name,
      icon: 'map',
      color: 'indigo',
      status: 'active',
      teams: [],
      lead: null,
      due: null,
      start: null,
      fav: false,
      members: [...members],
      desc: '',
      milestones: [],
      last: 0,
      private: false,
      perms: {},
    },
  ];
  doc.data.projOrder = [...(doc.data.projOrder || []), id];
  const put = await client.put(`/api/workspaces/${slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
}

/* Signs in and lands on Workspace > Projects in TABLE view. */
async function openProjectsTable(page, account) {
  await signIn(page, account);
  await page.getByRole('button', { name: 'Projects' }).first().click();
  await page.locator('button[data-a="set"][data-k="projView"][data-v="table"]').click();
  await expect(page.locator('.perm-t thead')).toBeVisible();
}

/* =====================================================================
   Task 1: table columns + row gear → unified modal, General tab.
   ===================================================================== */

test('the table renders all columns with a numeric Members cell, and the row gear opens settings on General (EN) (PROJ-01)', async ({ browser }) => {
  const run = newRunId();
  const nameA = `Table Alpha ${run}`;
  const nameB = `Table Bravo ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'ptbl-en', 'PTBL EN Owner', { locale: 'en', workspace: `ptbl-en-${run}` });
  await addProject(client, account.slug, { id: 'p_ptbl_a', key: 'ptbl-a', name: nameA, members: ['m-ptbl-a'] });
  await addProject(client, account.slug, { id: 'p_ptbl_b', key: 'ptbl-b', name: nameB });

  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectsTable(page, account);

    /* Every column header is present — the five plan columns plus the
       existing companions. */
    const headers = page.locator('.perm-t thead th');
    for (const h of ['Project', 'Status', 'Lead', 'Team', 'Members', 'Progress', 'Tasks', 'Due', 'Last activity']) {
      await expect(headers.filter({ hasText: h })).toHaveCount(1);
    }

    /* The Members cell is a COARSE COUNT — a number, never a roster. */
    const rowA = page.locator('.perm-t tbody tr', { hasText: nameA });
    await expect(rowA.locator('td').nth(4)).toHaveText(/^\d+$/);

    /* Status cell keeps the PSTAT pill + progress bar; Target date cell exists. */
    await expect(rowA.locator('.pstatus')).toBeVisible();
    await expect(rowA.locator('.prog')).toBeVisible();

    /* The row gear opens the unified modal directly on the General tab. */
    await rowA.locator('button[data-a="projectSettings"][data-tab="general"]').click();
    await expect(page.getByRole('heading', { name: 'Project settings', level: 2 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#p-name')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

/* =====================================================================
   Task 2: Share dedup — exactly one labeled Share affordance on the
   project page, opening the unified modal's Access tab (D-05/M-13).
   ===================================================================== */

test('exactly one Share affordance opens the Access tab; the deleted duplicates are gone (EN) (PROJ-02)', async ({ browser }) => {
  const run = newRunId();
  const name = `Share Solo ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'shsol-en', 'Share Solo Owner', { locale: 'en', workspace: `shsol-en-${run}` });
  await addProject(client, account.slug, { id: 'p_shsol_a', key: 'shsol-a', name, members: ['m-shsol-a'] });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account);
    await page.getByRole('button', { name: 'Projects' }).first().click();
    await page.locator(`[data-a='go'][data-r='project'][aria-label="${name}"]`).click();
    await expect(page.locator('.proj-h h1')).toHaveText(name);

    /* Exactly one Share affordance, dispatching the unified modal on Access. */
    const share = page.locator('[data-a="projectSettings"][data-tab="access"]');
    await expect(share).toHaveCount(1);
    await expect(share).toContainText('Share');

    /* The deleted duplicates: no data-a="share" markup, no addMember
       user-plus button anywhere on the page. */
    await expect(page.locator('[data-a="share"]')).toHaveCount(0);
    await expect(page.locator('button[aria-label="Add member"]')).toHaveCount(0);

    /* The overview members pill is display-only — never a second Share
       affordance. */
    await page.locator('nav[aria-label="Project views"] button[data-tab="overview"]').click();
    await expect(page.locator('dd span.pillbtn').first()).toBeVisible();
    await expect(page.locator('[data-a="projectSettings"][data-tab="access"]')).toHaveCount(1);

    /* The one labeled Share opens the modal directly on the Access tab. */
    await page.locator('.proj-h').locator('[data-a="projectSettings"][data-tab="access"]').click();
    await expect(page.getByRole('heading', { name: `Share “${name}”`, level: 2 })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Access' })).toHaveAttribute('aria-selected', 'true');
  } finally {
    await context.close();
  }
});
