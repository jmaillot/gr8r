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
  /* D-12 deterministic long task: 200+ char unbroken-ish title, 4 assignees
     (the seeded owner repeated), estimate + due date present. Fixed ids/keys. */
  const memberId = got.data.memberId;
  doc.data.tasks = [
    ...doc.data.tasks,
    {
      id: 't_mtask_long',
      project: 'p_mtask_a',
      title: `Longtask${run}Supercalifragilisticexpialidociousunbreakabletoken`.repeat(4),
      key: 'MTASK-9',
      status: 'inprogress',
      assignees: [memberId, memberId, memberId, memberId],
      priority: 'high',
      due: '2031-01-15',
      start: null,
      labels: [
        { id: 'l_mtask_a', name: 'wrap-probe-one', color: 'indigo' },
        { id: 'l_mtask_b', name: 'wrap-probe-two', color: 'red' },
      ],
      subtasks: [],
      attachments: [],
      deps: [],
      desc: '',
      estimate: 3,
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

/* D-09..D-12 at 390×844: the deterministic long task renders on a fully
   wrapped card (per-card overflow ≤ 2px, D-11 tolerance), the page itself
   never overflows horizontally, and the toolbar controls stay visible
   (D-07) while the stack renders. No image capture, no sleeps — scroll/
   clientWidth measurement + computed styles only. */
test('at 390px the long-task card wraps with zero overflow and the toolbar stays visible', async ({ browser }) => {
  const { context, page } = await signIn(browser, acct, { width: 390, height: 844 });
  try {
    await openTasksTable(page, acct);

    /* D-07: toolbar affordances all visible while the card stack renders. */
    await expect(page.locator('.toolbar input.search-sm')).toBeVisible();
    await expect(page.locator('[data-pop="sort"]').first()).toBeVisible();
    await expect(page.locator('[data-a="newTask"]').first()).toBeVisible();

    const card = page.locator('.only-m .panel[data-id="t_mtask_long"]');
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box && box.width).toBeGreaterThan(0);

    /* D-11: per-card horizontal overflow ≤ 2px, on every card (not just the fixture). */
    const overs = await page
      .locator('.only-m .panel')
      .evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth));
    expect(overs.length).toBeGreaterThan(0);
    expect(overs.filter((o) => o > 2), `cards overflowing by >2px: ${overs.join(',')}`).toEqual([]);

    /* D-08: the long title wraps — never nowrap, never ellipsis. */
    const title = card.locator('b').first();
    const cs = await title.evaluate((el) => {
      const s = getComputedStyle(el);
      return { whiteSpace: s.whiteSpace, textOverflow: s.textOverflow, overflowWrap: s.overflowWrap };
    });
    expect(cs.whiteSpace).not.toBe('nowrap');
    expect(cs.textOverflow).not.toBe('ellipsis');

    /* Document-level guard: the page itself never overflows horizontally at 390px. */
    const doc = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    expect(doc.sw).toBeLessThanOrEqual(doc.cw);
  } finally {
    await context.close();
  }
});
