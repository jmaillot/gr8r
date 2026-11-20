/* =====================================================================
   PHASE 68 MOBILE CARD × HIDDEN[] (POL-01; D-01..D-03): the mobile card
   stack (.mcard, ≤900px) renders its hideable fields (priority, due,
   estimate, progress) as a pure function of the existing hidden[] view
   state — the one the cols popover toggles (D-02 re-enables the popover
   at ≤900px). Minimum-identity fields — status, title, key, assignees —
   render unconditionally (D-01). Entries with no card equivalent
   (labels, deps, …) stay togglable and are inert for the card (D-03).

   Conventions follow mobile-tasks-table.spec.mjs: the context `viewport`
   option, one browser context per account, fixtures through the real
   API (helpers/setup.mjs), web-first auto-retrying assertions — no
   sleeps, no waits of convenience.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';

let acct;

test.beforeAll(async () => {
  const run = newRunId();
  const made = await createAccount(BASE_URL, run, 'mcard', 'Mobile Card Owner', { locale: 'en', workspace: `mcard-${run}` });
  acct = made.account;
  const client = made.client;

  /* One project + two tasks through the real workspace doc: one rich task
     exercising every hideable card field, one plain task for the
     no-equivalent toggle. */
  const got = await client.get(`/api/workspaces/${acct.slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  const memberId = got.data.memberId;
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id: 'p_mcard_a',
      key: 'mcard-a',
      name: `Mobile Card Probe ${run}`,
      icon: 'map',
      color: 'indigo',
      status: 'active',
      teams: [],
      lead: null,
      due: null,
      start: null,
      fav: false,
      members: [],
      desc: '',
      milestones: [],
      last: 0,
      private: false,
      perms: {},
    },
  ];
  doc.data.projOrder = [...(doc.data.projOrder || []), 'p_mcard_a'];
  doc.data.tasks = [
    ...(doc.data.tasks || []),
    {
      id: 't_mcard_rich',
      project: 'p_mcard_a',
      title: `Rich card task ${run}`,
      key: 'MCARD-1',
      status: 'todo',
      assignees: [memberId],
      priority: 'high',
      due: '2031-01-15',
      start: null,
      labels: [{ id: 'l_mcard_a', name: 'card-probe', color: 'indigo' }],
      subtasks: [],
      attachments: [],
      deps: [],
      desc: '',
      estimate: '3d',
      created: Date.now(),
      updated: Date.now(),
      creator: memberId,
      order: 1,
      fav: false,
    },
    {
      id: 't_mcard_plain',
      project: 'p_mcard_a',
      title: `Plain card task ${run}`,
      key: 'MCARD-2',
      status: 'todo',
      assignees: [],
      priority: 'none',
      due: null,
      start: null,
      labels: [],
      subtasks: [],
      attachments: [],
      deps: [],
      desc: '',
      estimate: null,
      created: Date.now(),
      updated: Date.now(),
      creator: memberId,
      order: 2,
      fav: false,
    },
  ];
  const put = await client.put(`/api/workspaces/${acct.slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
});

async function signIn(browser) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 390, height: 844 },
    extraHTTPHeaders: { 'x-forwarded-for': acct.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(acct.email);
  await page.getByLabel('Password', { exact: true }).fill(acct.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${acct.slug}$`));
  return { context, page };
}

async function openTasksTable(page) {
  await page.goto(`/w/${acct.slug}/tasks`);
  await page.locator('button[data-a="setViewMode"][data-v="table"]').click();
  await expect(page.locator('.toolbar')).toBeVisible();
}

/* Open the cols popover if not already open, then toggle one column.
   toggleCol2 re-renders after the click; the popover may close, so
   visibility is probed before every open attempt. */
async function toggleCol(page, id) {
  const check = page.locator(`input.check[data-v="${id}"]`);
  if (!(await check.isVisible().catch(() => false))) {
    await page.locator('.toolbar [data-pop="cols"]').click();
  }
  await check.click();
}

const rich = page => page.locator('.only-m .panel[data-id="t_mcard_rich"]');

/* D-01 minimum identity: the .mch row (status icon + title + key) and the
   assignee name render unconditionally, whatever the toggle state. */
async function expectMinIdentity(page) {
  const card = rich(page);
  await expect(card.locator('.mch b')).toHaveText(/Rich card task/);
  await expect(card.locator('.mch .mono')).toHaveText('MCARD-1');
  await expect(card.locator('.mch').locator('svg, i').first()).toBeVisible(); // status icon
  await expect(card.locator('.mcm')).toContainText('Mobile Card Owner');
}

/* D-03 hideable fields present on the default (nothing-hidden) card. */
async function expectAllFields(page) {
  const mcm = rich(page).locator('.mcm');
  await expect(mcm).toContainText('High');
  await expect(mcm.locator('.due')).toContainText(/2031|Jan|15/);
  await expect(mcm).toContainText('3d');
  await expect(mcm.locator('.prog')).toBeVisible();
}

/* Tracer slice (D-02 + D-03 one-field): the popover is usable at 390×844
   and toggling priority drives the card field through hidden[]. */
test('at 390×844 the cols popover opens and the priority toggle hides/shows the card field (minimum identity survives)', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasksTable(page);

    /* D-02: the Columns button is visible at 390×844 and opens the popover. */
    const colsBtn = page.locator('.toolbar [data-pop="cols"]');
    await expect(colsBtn).toBeVisible();
    await colsBtn.click();
    await expect(page.locator('input.check[data-v="priority"]')).toBeVisible();

    /* Default card shows every hideable field + minimum identity. */
    await expectAllFields(page);
    await expectMinIdentity(page);

    /* Toggle priority off via the popover → card field disappears,
       minimum identity stays (D-01). */
    await page.locator('input.check[data-v="priority"]').click();
    await expect(rich(page).locator('.mcm')).not.toContainText('High');
    await expectMinIdentity(page);

    /* Toggle back on → field returns. */
    await toggleCol(page, 'priority');
    await expectAllFields(page);
    await expectMinIdentity(page);
  } finally {
    await context.close();
  }
});

/* Task 2 toggle matrix: every hideable field (due, estimate, progress —
   priority covered above) follows hidden[] both directions; a no-equivalent
   entry (labels) is togglable but inert for the card (D-03); minimum
   identity (D-01) survives every combination. */
test('at 390×844 every hideable card field follows hidden[] both ways and no-equivalent toggles are inert', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    await openTasksTable(page);
    await expectAllFields(page);
    await expectMinIdentity(page);

    /* due: hide → card .due gone; re-show → back. */
    await toggleCol(page, 'due');
    await expect(rich(page).locator('.mcm .due')).toHaveCount(0);
    await expectMinIdentity(page);
    await toggleCol(page, 'due');
    await expect(rich(page).locator('.mcm .due')).toBeVisible();

    /* estimate: hide → "3d" gone; re-show → back. */
    await toggleCol(page, 'estimate');
    await expect(rich(page).locator('.mcm')).not.toContainText('3d');
    await expectMinIdentity(page);
    await toggleCol(page, 'estimate');
    await expect(rich(page).locator('.mcm')).toContainText('3d');

    /* progress: hide → .prog bar gone; re-show → back. */
    await toggleCol(page, 'progress');
    await expect(rich(page).locator('.mcm .prog')).toHaveCount(0);
    await expectMinIdentity(page);
    await toggleCol(page, 'progress');
    await expect(rich(page).locator('.mcm .prog')).toBeVisible();

    /* D-03 no-equivalent: labels has no card rendering — toggling it must
       not change the card at all (still fully rendered) and must not error. */
    await toggleCol(page, 'labels');
    await expectAllFields(page);
    await expectMinIdentity(page);
    await toggleCol(page, 'labels');
    await expectAllFields(page);

    /* D-01: every minimum-identity element still present after all toggles. */
    await expectMinIdentity(page);
  } finally {
    await context.close();
  }
});

/* =====================================================================
   PHASE 84 BP-03 (D-07): phone-viewport overflow sweep — the three main
   surfaces render without horizontal document overflow at 390×844.
   ===================================================================== */

/* Web-first overflow probe: document scrollWidth must stay ≤ innerWidth
   (expect.poll — no sleeps). */
async function expectNoHorizontalOverflow(page, label) {
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      { message: `${label}: horizontal overflow at the phone viewport`, timeout: 5000 },
    )
    .toBeLessThanOrEqual(0);
}

/* Navigation via direct route navigation — the desktop sidebar is
   off-canvas at 390px (its data-a='go' items are outside the viewport,
   auto-waiting clicks never resolve) and the mobile Primary nav is an
   overlay (french-overflow precedent: routes are navigated directly).
   Arrival proven by the surface's h1 (nav.route.* catalogue values). */
test('at 390×844 dashboard, members and governance render without horizontal overflow', async ({ browser }) => {
  const { context, page } = await signIn(browser);
  try {
    /* Dashboard (the landing route after sign-in). */
    await expectNoHorizontalOverflow(page, 'dashboard');

    /* Members. */
    await page.goto(`/w/${acct.slug}/members`);
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'members');

    /* Governance. */
    await page.goto(`/w/${acct.slug}/governance`);
    await expect(page.getByRole('heading', { name: 'Governance' })).toBeVisible();
    await expectNoHorizontalOverflow(page, 'governance');
  } finally {
    await context.close();
  }
});
