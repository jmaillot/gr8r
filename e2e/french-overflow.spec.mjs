/* =====================================================================
   PHASE 7 BROWSER PROOF (D-15, I18N-07): the French interface renders in
   a real Chromium session, fits the fixed-size chrome at 1280 px and
   390 px, and the locale switch re-renders without a reload and settles.

   The spec follows the existing suite's conventions: role/label/text
   selectors for every visibility claim, one browser context per account,
   fixtures through the real API (helpers/setup.mjs). The only structural
   selectors are the shell's own layout roots (.side, .topbar, .modal-f)
   — they exist to be measured, which is what D-15 asks for; no product
   visibility claim rests on them.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, newRunId } from './helpers/setup.mjs';

/* A dedicated account and workspace for the French proof. The language is
   an account property (phase 8: users.locale, written through PATCH
   /api/auth/me), so switching Français here changes only this throwaway
   account — it can never reach the accounts or workspaces the English-pinned
   suite (tenancy.spec) reads; the files share one server per run and may run
   concurrently. The workspace is still dedicated so the English fixtures this
   file creates stay out of the shared suite's data. */
let fr;

test.beforeAll(async () => {
  const run = newRunId();
  const account = {
    email: `french-${run}@e2e.local`,
    password: PASSWORD,
    name: 'French Reader',
    ip: clientIp(run, 'french'),
    slug: `french-${run}`,
  };
  const client = apiClient(BASE_URL, { name: 'french', ip: account.ip });
  const signup = await client.post('/api/auth/signup', { name: account.name, email: account.email, password: account.password });
  if (signup.status !== 201) throw new Error(`french signup failed with HTTP ${signup.status}: ${signup.data?.error || ''}`);
  const ws = await client.post('/api/workspaces', { name: `French ${run}`, slug: account.slug });
  if (ws.status !== 201) throw new Error(`french workspace failed with HTTP ${ws.status}: ${ws.data?.error || ''}`);
  fr = { account };
});

/* The product routes the proof enumerates: every ROUTE_IDS entry that is a
   user-facing product surface. Three kinds of id stay out on purpose:
   'member' and 'team' are detail pages that need an entity id in the URL,
   and 'system'/'states' are the design-system showcase pages (developer
   references behind the help popover, not product surfaces). Phase 10
   widens browser coverage. */
const ROUTES = [
  'home',
  'inbox',
  'mytasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'projects',
  'tasks',
  'calendar',
  'timeline',
  'members',
  'teams',
  'activity',
  'settings',
  'archive',
];

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

/* One browser context per account: its own cookies, never another tenant's. */
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

/* The app has booted in French: the shell is rendered and the D-01 wiring
   (account locale from /api/auth/me → primeLocale before the first render) has applied. */
async function frenchShell(page) {
  await expect(page.locator('.content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
}

/* Read-only box math on the shell's layout roots. An intentionally hidden
   element (display:none) or the mobile menu parked off-canvas by a
   transform is reported as null: a hidden menu is not clipped chrome. */
async function chromeBoxes(page) {
  return page.evaluate(() => {
    const box = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      if (cs.position === 'fixed' && cs.transform && cs.transform !== 'none') return null;
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    return { side: box('.side'), top: box('.topbar') };
  });
}

function expectWithin(box, viewport, what) {
  expect(box.left, `${what} starts left of the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.top, `${what} starts above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.right, `${what} is clipped by the right edge`).toBeLessThanOrEqual(viewport.width);
  expect(box.bottom, `${what} is clipped by the bottom edge`).toBeLessThanOrEqual(viewport.height);
}

test('switching the selector to Français re-renders without a reload and settles', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    /* English fixtures first: one project and one task, so the
       stored-vocabulary proof has data to render. */
    await page.getByRole('button', { name: 'New project' }).first().click();
    await page.getByLabel('Project name').fill('Probe');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Probe').first()).toBeVisible();

    /* Back to the workspace home deterministically — creating the project
       may navigate — then create the task from the home header. */
    await page.goto(`/w/${fr.account.slug}/home`);
    await page.getByRole('button', { name: 'New task' }).first().click();
    await page.getByLabel('Task name').fill('Overflow probe');
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto(`/w/${fr.account.slug}/mytasks`);
    await expect(page.getByText('Overflow probe').first()).toBeVisible();

    /* The real D-01 selector path: settings → language row → Français. */
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Language', level: 1 })).toBeVisible();
    await page.evaluate(() => {
      window.__survived = 'no-reload';
    });
    /* The honest selector: two options, labelled in their own names. The
       change persists through the account PATCH, awaited below. */
    const language = page.getByRole('button', { name: 'Language', exact: true, expanded: false });
    await language.click();
    await expect(page.getByRole('option')).toHaveText(['English', 'Français']);
    const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
    await page.getByRole('option', { name: 'Français' }).click();

    /* The document language follows (D-02), the shell re-rendered in
       French, and nothing was reloaded to get there. */
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
    await expect(page.getByRole('heading', { name: 'Langue', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__survived), 'the switch re-rendered in place').toBe('no-reload');

    /* Loop safety (07-RESEARCH risk 1): after the switch the interface
       settles. A MutationObserver on the render root must count zero
       mutations over 1.5 s — a render loop would rewrite #app every
       cycle — and two DOM snapshots 500 ms apart are identical. */
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__mutations = 0;
      new MutationObserver(entries => {
        window.__mutations += entries.length;
      }).observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, characterData: true });
    });
    const before = await page.evaluate(() => document.getElementById('app').innerHTML);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.getElementById('app').innerHTML);
    expect(after, 'the rendered interface drifts after the switch').toBe(before);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__mutations), 'the interface keeps re-rendering after the switch (render loop)').toBe(0);

    /* Persistence: the account PATCH answered 200, so a fresh boot comes up
       French from users.locale — the same path every later test relies on. */
    expect((await saved).status(), 'the account locale write failed').toBe(200);
    await page.reload();
    await frenchShell(page);
  } finally {
    await context.close();
  }
});

for (const vp of VIEWPORTS) {
  test(`the main routes fit the fixed chrome in French at ${vp.width}×${vp.height}`, async ({ browser }) => {
    const { context, page } = await signIn(browser, fr.account, vp);
    try {
      for (const route of ROUTES) {
        await page.goto(`/w/${fr.account.slug}/${route}`);
        await frenchShell(page);

        /* Check 1 of 2 — horizontal document overflow. The document must
           never grow wider than the viewport, whatever its content panes
           scroll internally. */
        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        expect(sw, `${route}: the document overflows horizontally in French at ${vp.width}px (${sw} > ${cw})`).toBeLessThanOrEqual(cw);

        /* Check 2 of 2 — the fixed chrome is unbroken. Separate from the
           overflow check on purpose: a legitimately scrollable content
           pane must not fail a fixed-chrome assertion (07-RESEARCH). */
        const boxes = await chromeBoxes(page);
        expect(boxes.top, `${route}: the top bar is missing at ${vp.width}px`).not.toBeNull();
        expectWithin(boxes.top, vp, `${route}: the top bar`);
        if (boxes.side) expectWithin(boxes.side, vp, `${route}: the sidebar`);
      }
    } finally {
      await context.close();
    }
  });
}

for (const vp of VIEWPORTS) {
  test(`the new-task modal renders its footer and primary button unbroken in French at ${vp.width}×${vp.height}`, async ({ browser }) => {
    const { context, page } = await signIn(browser, fr.account, vp);
    try {
      await page.goto(`/w/${fr.account.slug}/home`);
      await frenchShell(page);
      await page.getByRole('button', { name: 'Nouvelle tâche' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Nouvelle tâche', level: 2 })).toBeVisible();

      const boxes = await page.evaluate(() => {
        const box = el => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        };
        const wrap = document.querySelector('.modal-wrap .modal');
        const foot = wrap?.querySelector('.modal-f');
        return { modal: wrap ? box(wrap) : null, footer: foot ? box(foot) : null };
      });
      expect(boxes.modal, 'the modal is missing').not.toBeNull();
      expectWithin(boxes.modal, vp, 'the modal');
      expect(boxes.footer, 'the modal footer is missing').not.toBeNull();
      expectWithin(boxes.footer, vp, 'the modal footer');

      const submit = page.getByRole('button', { name: 'Créer une tâche' });
      await expect(submit).toBeVisible();
      expectWithin(
        await submit.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        }),
        vp,
        'the modal primary button',
      );
    } finally {
      await context.close();
    }
  });
}

test('a stored status id renders its French label while the data attribute keeps the English id (I18N-07)', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    /* The board column: the stored status id stays English in the data
       attribute the drag-and-drop reads, the rendered label is French.
       The project key is the uppercase initials code makeKey() derived. */
    await page.goto(`/w/${fr.account.slug}/project/PRO`);
    await frenchShell(page);
    const col = page.locator('section[data-drop-col="todo"]');
    await expect(col, 'the To Do column lost its stored status id').toHaveAttribute('data-drop-col', 'todo');
    await expect(col.getByText('À faire').first()).toBeVisible();
    await expect(col.getByText('Overflow probe')).toBeVisible();

    /* The task list's status pill renders the French label too. */
    await page.goto(`/w/${fr.account.slug}/mytasks`);
    await frenchShell(page);
    const row = page.locator('[data-task-row]').filter({ hasText: 'Overflow probe' });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: /À faire/ }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

/* The D-16 read-through found the project tab bar still English after the
   switch: PTABS was a module-level const whose t() calls froze the
   import-time locale into the labels. The fix reads the catalogue at render
   time (ptabs()); this test pins the regression — every project tab renders
   its French label and no unambiguous English label survives. */
test('the project tab bar reads its labels from the catalogue at render time, not at import', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    await page.goto(`/w/${fr.account.slug}/projects`);
    await frenchShell(page);
    await page.getByRole('link', { name: 'Probe', exact: true }).click();
    await frenchShell(page);

    for (const label of ['Vue d’ensemble', 'Tableau', 'Liste', 'Table', 'Calendrier', 'Chronologie', 'Fichiers', 'Activité']) {
      await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
    }
    /* 'Table' is deliberately absent from the negation: the French value is
       identical to the English one, so an exact-match English probe would
       false-positive on the legitimate French label. */
    for (const label of ['Overview', 'Board', 'Calendar', 'Timeline', 'Files', 'Activity']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

/* The D-16 read-through found the Settings → Équipes tab dead: teamsGrid()'s
   map parameter shadowed the catalogue t, so t('page.teams.nMembers') called
   the team object as a function and the page never rendered. The fix renames
   the parameter; this test pins the tab — the grid renders with its member
   and project counts, in French, and the teams page itself still loads. */
test('the settings teams tab renders its grid — the shadowed t no longer crashes it', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    await page.goto(`/w/${fr.account.slug}/settings`);
    await frenchShell(page);
    await page.getByRole('button', { name: 'Équipes', exact: true }).click();
    await expect(page.getByText('Les équipes regroupent des personnes et des projets.')).toBeVisible();

    /* The demo workspace seeds teams, so the grid renders real cards with
       the count fragments the crashed lookup used to build. */
    const grid = page.locator('.pgrid');
    await expect(grid).toBeVisible();
    await expect(grid.getByText(/membres/).first()).toBeVisible();
    await expect(grid.getByText(/projets/).first()).toBeVisible();

    /* The standalone teams page renders too — its title uses the same
       namespace and its body the same teamsList source. */
    await page.goto(`/w/${fr.account.slug}/teams`);
    await frenchShell(page);
    await expect(page.getByRole('heading', { name: 'Équipes', level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});
