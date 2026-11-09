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
   Task 2: Share dedup — the project page has NO Share button (2026-11-09
   owner ruling: redundant with the settings gear); access management lives
   in the unified modal's Access tab, opened from the gear.
   ===================================================================== */

test('no Share button on the project page; the gear opens General with Access reachable (EN) (PROJ-02, 2026-11-09 ruling)', async ({ browser }) => {
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

    /* The removed Share affordance: zero labeled Share buttons in the page
       header, zero data-a="share" markup, no addMember user-plus button. */
    await expect(page.locator('.proj-h').getByRole('button', { name: 'Share' })).toHaveCount(0);
    await expect(page.locator('[data-a="share"]')).toHaveCount(0);
    await expect(page.locator('button[aria-label="Add member"]')).toHaveCount(0);

    /* Access management stays reachable: the gear opens General, the Access
       tab renders the access body. */
    await page.locator('button[data-a="editProject"]').click();
    await expect(page.getByRole('heading', { name: 'Project settings', level: 2 })).toBeVisible();
    await page.getByRole('tab', { name: 'Access' }).click();
    await expect(page.getByText('People with access')).toBeVisible();

    /* The overview members pill is display-only — never a Share affordance. */
    await page.keyboard.press('Escape');
    await page.locator('nav[aria-label="Project views"] button[data-tab="overview"]').click();
    await expect(page.locator('dd span.pillbtn').first()).toBeVisible();
    await expect(page.locator('[data-a="share"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
