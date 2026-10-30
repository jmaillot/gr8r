/* =====================================================================
   PHASE 23 BACK/FORWARD (plan 23-04, LINK-04 / roadmap SC-4): in-app
   navigation mirrors into browser history (pushState), one popstate
   handler restores views on back/forward, deep-link and manual
   navigation behave identically, and the D-03 URL persistence holds in
   the pushState world (drawer-close PUSHES the underlying view URL, so
   Back after close re-opens the task).

   Conventions follow e2e/flows.spec.mjs and e2e/deep-link.spec.mjs:
   fixtures only through the real API (helpers/setup.mjs), every account
   presents its own run-unique X-Forwarded-For, and every asserted
   string is read from src/locales/en.json / fr.json — never hardcoded.
   Fixture titles derive from the static task key on purpose: the acme
   document is shared across workers and runs, and key-based resolution
   takes the first match, so run-unique titles would race.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, OWNER, apiClient, clientIp, newRunId, withAcmeDoc } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const CATALOGUE = { en, fr };

function fmt(key, lang) {
  const s = CATALOGUE[lang][key];
  if (typeof s !== 'string') throw new Error(`catalogue key missing in ${lang}: ${key}`);
  return s;
}

function expectStatus(step, res, allowed) {
  if (allowed.includes(res.status)) return res.data;
  throw new Error(`${step} failed with HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`);
}

/* A run-unique project + task in the seeded acme workspace, same field set
   createTask seeds, so the board renders the card and the drawer renders
   fully. The acme workspace is the seeded OWNER's. */
const run = newRunId();
const TASK_KEY = 'bf-roadmap-301';
const TASK_TITLE = `Back Forward Target ${TASK_KEY}`;
const PROJ_NAME = `Back Forward Board ${TASK_KEY}`;
const fixture = { user: { ...OWNER, ip: clientIp(run, 'bf-owner') } };

/* The sidebar's localized route buttons (role button in the desktop nav;
   hidden mobile duplicates stay out of the a11y tree). */
/* The main sidebar's localized route buttons — scoped to the main nav so the
   breadcrumb's same-named button never trips strict mode. */
const navBtn = (page, r, lang) =>
  page.getByRole('navigation', { name: fmt('a11y.mainNav', lang) }).getByRole('button', { name: fmt(`nav.route.${r}`, lang), exact: true });

test.beforeAll(async () => {
  const client = apiClient(BASE_URL, { name: 'bf-owner', ip: fixture.user.ip });
  expectStatus('owner login', await client.post('/api/auth/login', { email: OWNER.email, password: OWNER.password }), [200]);
  await withAcmeDoc(client, 'bf task fixture', (doc) => {
    if (!(doc.doc.data.projects || []).some(p => p.id === 'p_bf_roadmap')) {
      doc.doc.data.projects = [
        ...(doc.doc.data.projects || []),
        {
          id: 'p_bf_roadmap',
          key: 'bf-roadmap',
          name: PROJ_NAME,
          icon: 'map',
          color: 'indigo',
          status: 'active',
          team: null,
          lead: doc.memberId,
          due: null,
          start: null,
          fav: false,
          members: [doc.memberId],
          desc: '',
          milestones: [],
          last: 0,
          private: false,
          perms: {},
          seq: 301,
        },
      ];
      doc.doc.data.projOrder = [...(doc.doc.data.projOrder || []), 'p_bf_roadmap'];
    }
    if (!(doc.doc.data.tasks || []).some(t => t.key === TASK_KEY)) {
      doc.doc.data.tasks = [
        ...(doc.doc.data.tasks || []),
        {
          id: `t_bf_${run}`,
          key: TASK_KEY,
          title: TASK_TITLE,
          project: 'p_bf_roadmap',
          status: 'todo',
          assignee: null,
          priority: 'medium',
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
          order: 901,
          fav: false,
          recur: null,
          creator: doc.memberId,
        },
      ];
    }
  });
});

/* Sign in through the UI. The login form renders in the browser's negotiated
   locale, so its labels come from this locale's catalogue. */
async function signIn(page, lang) {
  await page.goto('/');
  await page.getByLabel(fmt('common.email', lang), { exact: true }).fill(fixture.user.email);
  await page.getByLabel(fmt('common.password', lang), { exact: true }).fill(fixture.user.password);
  await page.getByRole('button', { name: fmt('page.auth.signIn', lang) }).click();
  await expect(page).toHaveURL(/\/w\/acme$/);
}

for (const lang of ['en', 'fr']) {
  test.describe(`back/forward (${lang})`, () => {
    test.use({ locale: lang === 'fr' ? 'fr-FR' : 'en-US' });

    // Scenario 1 (LINK-04): manual navigation across three views, then
    // back/forward — the views restore without any full page reload
    // (the boot-time sentinel window flag survives, proving no re-init).
    test('manual navigation writes history: back and forward restore views with no reload', async ({ page }) => {
      await signIn(page, lang);
      await page.evaluate(() => { window.__bfBootSentinel = 'alive'; });

      // inbox → my tasks → home: three distinct views via the sidebar.
      await navBtn(page, 'inbox', lang).click();
      await expect(navBtn(page, 'inbox', lang)).toHaveClass(/on/);
      await navBtn(page, 'mytasks', lang).click();
      await expect(navBtn(page, 'mytasks', lang)).toHaveClass(/on/);
      await navBtn(page, 'home', lang).click();
      await expect(navBtn(page, 'home', lang)).toHaveClass(/on/);

      // back → my tasks view, forward → home again, back → my tasks.
      await page.goBack();
      await expect(navBtn(page, 'mytasks', lang)).toHaveClass(/on/);
      await page.goForward();
      await expect(navBtn(page, 'home', lang)).toHaveClass(/on/);

      // No reload happened anywhere: the sentinel is untouched.
      expect(await page.evaluate(() => window.__bfBootSentinel)).toBe('alive');
      expect(await page.evaluate(() => document.readyState)).toBe('complete');
    });

    // Scenario 2 (SC-4): a deep link and an internal click produce identical
    // history behaviour — back leaves the task, forward re-opens the drawer.
    test('deep link and manual navigation behave identically on back/forward', async ({ page }) => {
      await signIn(page, lang);

      // Deep-link landing: /w/acme/task/:key directly from the signed-in root.
      await page.goto(`/w/acme/task/${TASK_KEY}`);
      const drawer = page.locator('.drawer');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(TASK_TITLE).first()).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/w/acme/task/${TASK_KEY}$`));

      // Back → the previous (workspace root) entry, drawer closed.
      await page.goBack();
      await expect(page).toHaveURL(/\/w\/acme$/);
      await expect(page.locator('.drawer')).toHaveCount(0);

      // Forward → the task entry re-opens the drawer (same as an internal click).
      await page.goForward();
      await expect(page).toHaveURL(new RegExp(`/w/acme/task/${TASK_KEY}$`));
      await expect(page.locator('.drawer').getByText(TASK_TITLE).first()).toBeVisible();
    });

    // Scenario 2b (D-03 / research Open Question 2, RESOLVED): the drawer
    // URL is never rewritten while open — closing PUSHES the underlying
    // view's URL, so browser Back after close re-opens the task drawer.
    test('closing the drawer pushes the underlying view URL; back re-opens the task', async ({ page }) => {
      await signIn(page, lang);

      // Internal click path: open the task from its project board.
      await page
        .getByRole('navigation', { name: fmt('a11y.mainNav', lang) })
        .getByRole('link', { name: PROJ_NAME })
        .click();
      const card = page.locator('.kcard', { hasText: TASK_TITLE }).first();
      await expect(card).toBeVisible();
      await card.click();
      await expect(page).toHaveURL(new RegExp(`/w/acme/task/${TASK_KEY}$`));
      await expect(page.locator('.drawer').getByText(TASK_TITLE).first()).toBeVisible();

      // Close via the drawer's close button → URL pushes to the underlying
      // board view's address, drawer gone. Clicked through evaluate(): the
      // header button can sit outside the headless viewport for long
      // localized titles, and dispatching on the element still drives
      // A.closeDrawer.
      await page.locator('.drawer [data-a="closeDrawer"]').evaluate(el => el.click());
      await expect(page.locator('.drawer')).toHaveCount(0);
      await expect(page).toHaveURL(/\/w\/acme\/project\/bf-roadmap$/);

      // Back re-opens the task drawer at the task URL.
      await page.goBack();
      await expect(page).toHaveURL(new RegExp(`/w/acme/task/${TASK_KEY}$`));
      await expect(page.locator('.drawer').getByText(TASK_TITLE).first()).toBeVisible();

      // Forward returns to the closed state (board URL, no drawer).
      await page.goForward();
      await expect(page).toHaveURL(/\/w\/acme\/project\/bf-roadmap$/);
      await expect(page.locator('.drawer')).toHaveCount(0);
    });

    // Scenario 3: D-03 regression in the pushState world — a refresh on a
    // task URL keeps both the drawer and the URL.
    test('refresh on a task URL keeps the drawer open and the URL', async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/w/acme/task/${TASK_KEY}`);
      await expect(page.locator('.drawer').getByText(TASK_TITLE).first()).toBeVisible();

      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/w/acme/task/${TASK_KEY}$`));
      await expect(page.locator('.drawer').getByText(TASK_TITLE).first()).toBeVisible();
    });

    // Scenario 4 (Pitfall 4): no history inflation while going back —
    // navigating two views adds exactly two entries, and repeated back
    // presses (even past the first app entry) never grow history.
    test('history length stays stable while pressing back at the first entry', async ({ page }) => {
      await signIn(page, lang);
      const atLanding = await page.evaluate(() => history.length);

      await navBtn(page, 'inbox', lang).click();
      await navBtn(page, 'mytasks', lang).click();
      expect(await page.evaluate(() => history.length)).toBe(atLanding + 2);

      // Back twice: my tasks → inbox → the sign-in landing entry. Length
      // unchanged — popstate navigation never pushes.
      await page.goBack();
      await page.goBack();
      await expect(page).toHaveURL(/\/w\/acme$/);
      expect(await page.evaluate(() => history.length)).toBe(atLanding + 2);

      // Further back presses leave the app (or no-op) but never grow it.
      await page.goBack().catch(() => {});
      await page.goBack().catch(() => {});
      await page.waitForTimeout(200);
      expect(await page.evaluate(() => history.length)).toBe(atLanding + 2);
    });
  });
}
