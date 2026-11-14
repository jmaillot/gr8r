/* =====================================================================
   PHASE 64 MOBILE TASKS TABLE (MOB-01; D-01..D-04, D-09..D-11): the
   Columns button is hidden at ≤900px by one generic pure-CSS rule, the
   641–900px band shows the card stack (D-04 Option B), and desktop is
   unchanged. Boundary pinned just under the breakpoint (899px) and one
   desktop-unchanged proof at 1280×720.

   Conventions follow french-overflow.spec.mjs: the context `viewport`
   option (NO second Playwright project, NO setViewportSize-only
   reliance), one browser context per account, fixtures through the real
   API (helpers/setup.mjs), web-first auto-retrying assertions — no
   sleeps, no waits of convenience, no image capture, no (pointer: coarse).
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';

let acct;
let client;

test.beforeAll(async () => {
  const run = newRunId();
  ({ account: acct, client } = await createAccount(BASE_URL, run, 'mtask', 'Mobile Tasks Owner', { locale: 'en', workspace: `mtask-${run}` }));

  /* One project + one task seeded through the real workspace doc, so the
     card stack has content to render at the boundary viewport. */
  const got = await client.get(`/api/workspaces/${acct.slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id: 'p_mtask_a',
      key: 'mtask-a',
      name: `Mobile Probe ${run}`,
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
  doc.data.projOrder = [...(doc.data.projOrder || []), 'p_mtask_a'];
  doc.data.tasks = [
    ...(doc.data.tasks || []),
    {
      id: 't_mtask_1',
      project: 'p_mtask_a',
      title: `Mobile boundary task ${run}`,
      key: 'MTASK-1',
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
      creator: null,
      order: 1,
      fav: false,
    },
  ];
  const put = await client.put(`/api/workspaces/${acct.slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
});

/* One browser context per account, viewport set via the context option. */
async function signIn(browser, account, viewport) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...(viewport ? { viewport } : {}),
    extraHTTPHeaders: { 'x-forwarded-for': account.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
  return { context, page };
}

/* Workspace > Tasks in TABLE view — the view whose toolbar renders the
   Columns button (data-pop="cols"). */
async function openTasksTable(page, account) {
  await page.goto(`/w/${account.slug}/tasks`);
  /* The mode tab's text label is `.hide-m` (hidden ≤900px by design), so the
     tab is reached by its data attributes, not its accessible name. */
  await page.locator('button[data-a="setViewMode"][data-v="table"]').click();
  await expect(page.locator('.toolbar')).toBeVisible();
}

/* D-04 Option B boundary: at 899px (just under the 900px breakpoint) the
   Columns button is hidden (CSS-only — it stays in the DOM, so we assert
   hidden, never count 0), the card stack is visible, and the desktop
   table is hidden. */
test('at 899px the Columns button is hidden, the card stack shows, and the desktop table is hidden', async ({ browser }) => {
  const { context, page } = await signIn(browser, acct, { width: 899, height: 844 });
  try {
    await openTasksTable(page, acct);
    await expect(page.locator('[data-pop="cols"]')).toBeHidden();
    await expect(page.locator('.only-m .panel').first()).toBeVisible();
    await expect(page.locator('.tbl-wrap')).toBeHidden();
  } finally {
    await context.close();
  }
});

/* Desktop unchanged: at 1280×720 the Columns button behaves exactly as
   today — visible. */
test('at 1280×720 the Columns button is visible (desktop unchanged)', async ({ browser }) => {
  const { context, page } = await signIn(browser, acct, { width: 1280, height: 720 });
  try {
    await openTasksTable(page, acct);
    await expect(page.locator('[data-pop="cols"]')).toBeVisible();
  } finally {
    await context.close();
  }
});
