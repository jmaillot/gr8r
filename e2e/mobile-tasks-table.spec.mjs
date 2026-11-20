/* =====================================================================
   PHASE 64 MOBILE TASKS TABLE (MOB-01; D-01..D-04, D-09..D-11): the
   card stack shows in the 641–900px band (D-04 Option B) and desktop is
   unchanged. Phase 68 D-02 re-enabled the Columns button ≤900px — the
   cols popover is now visible at mobile viewports and drives both the
   table and the card stack through the same hidden[] view state.
   Boundary pinned just under the breakpoint (899px) and one
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
   Columns button is VISIBLE (Phase 68 D-02 re-enabled the popover on
   mobile — the card stack and the table now share the same hidden[] view
   state), the card stack is visible, and the desktop table is hidden.
   The Phase 64 hidden assertion was inverted by D-02 — the contract
   changed deliberately, nothing was weakened. */
test('at 899px the Columns button is visible, the card stack shows, and the desktop table is hidden', async ({ browser }) => {
  const { context, page } = await signIn(browser, acct, { width: 899, height: 844 });
  try {
    await openTasksTable(page, acct);
    await expect(page.locator('[data-pop="cols"]')).toBeVisible();
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

/* =====================================================================
   PHASE 84 BP-03 (D-07): 57-UAT regression + phone-viewport sweep.
   ===================================================================== */

/* Web-first overflow probe: document scrollWidth must stay ≤ innerWidth
   (expect.poll — no sleeps). Used for the D-07 sweep and reusable for any
   surface reached from these fixtures. */
async function expectNoHorizontalOverflow(page, label) {
  await expect
    .poll(
      () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
      { message: `${label}: horizontal overflow at the phone viewport`, timeout: 5000 },
    )
    .toBeLessThanOrEqual(0);
}

/* The cols popover re-renders after a toggle; the popover may close, so
   visibility is probed before every open attempt (mobile-card-hidden
   convention). */
async function toggleCol(page, id) {
  const check = page.locator(`input.check[data-v="${id}"]`);
  if (!(await check.isVisible().catch(() => false))) {
    await page.locator('.toolbar [data-pop="cols"]').click();
  }
  await check.click();
}

/* 57-UAT deferred item (BP-03): at the phone band the Columns button's
   text label is collapsed (hide-m — the truncation fix), the button itself
   stays visible and functional (Phase 68 D-02 — never display:none), and
   hiding/showing a column through the popover drives BOTH renderings
   through the same hidden[] view state: the card stack field disappears/
   returns, and the desktop table (CSS-hidden ≤900px but still in the DOM)
   reacts in its colgroup. */
test('at 390×844 the Columns label is collapsed and the popover drives table + card stack', async ({ browser }) => {
  const { context, page } = await signIn(browser, acct, { width: 390, height: 844 });
  try {
    await openTasksTable(page, acct);

    const colsBtn = page.locator('.toolbar [data-pop="cols"]');
    await expect(colsBtn).toBeVisible();
    /* 57-UAT fix: label collapsed at ≤900px, button still visible. */
    await expect(colsBtn.locator('span.hide-m')).toBeHidden();

    await colsBtn.click();
    await expect(page.locator('input.check[data-v="priority"]')).toBeVisible();

    /* Card stack responds: the long task carries priority High. */
    const card = page.locator('.only-m .panel[data-id="t_mtask_long"]');
    await expect(card).toContainText('High');
    await page.locator('input.check[data-v="priority"]').click();
    await expect(page.locator('.only-m .panel[data-id="t_mtask_long"]')).not.toContainText('High');

    /* Desktop table responds too (same hidden[] state, in-DOM while
       CSS-hidden at ≤900px): the priority colgroup column disappears. */
    await expect(page.locator('.tbl col[data-col="priority"]')).toHaveCount(0);

    /* Toggle back on — both renderings return. */
    await toggleCol(page, 'priority');
    await expect(card).toContainText('High');
    await expect(page.locator('.tbl col[data-col="priority"]')).toHaveCount(1);

    /* The tasks surface itself never overflows horizontally at 390px. */
    await expectNoHorizontalOverflow(page, 'tasks');
  } finally {
    await context.close();
  }
});
