/* =====================================================================
   PHASE 23 DEEP LINKS (plan 23-01, D-01/D-02/D-03): a signed-in user
   pasting /w/:slug/task/:key lands on the EXISTING task drawer over a
   real underlying page (never page404, no side channel), the URL keeps
   showing the task path across reload, and an unknown key lands on the
   workspace view with the localized "task not found" toast.

   Conventions follow e2e/flows.spec.mjs: fixtures only through the real
   API (helpers/setup.mjs), every account presents its own run-unique
   X-Forwarded-For, and every asserted string is read from
   src/locales/en.json / fr.json — never hardcoded.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, OWNER, apiClient, clientIp, newRunId } from './helpers/setup.mjs';
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

/* A run-unique task hung on the public acme roadmap project, with the same
   field set createTask seeds, so the drawer renders fully. The acme workspace
   is the seeded OWNER's, so OWNER is both fixture writer and the signed-in
   browser user (its run-unique IP keeps login throttles isolated). */
const run = newRunId();
const TASK_KEY = 'dl-roadmap-201';
const TASK_TITLE = `Deep Link Target ${run}`;
const fixture = { user: { ...OWNER, ip: clientIp(run, 'dl-owner') } };

test.beforeAll(async () => {
  const client = apiClient(BASE_URL, { name: 'dl-owner', ip: fixture.user.ip });
  expectStatus('owner login', await client.post('/api/auth/login', { email: OWNER.email, password: OWNER.password }), [200]);
  const doc = expectStatus('acme document', await client.get('/api/workspaces/acme'), [200]);
  doc.doc.data.projects = [
    ...(doc.doc.data.projects || []),
    {
      id: 'p_dl_roadmap',
      key: 'dl-roadmap',
      name: `Deep Link Roadmap ${run}`,
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
      seq: 200,
    },
  ];
  doc.doc.data.projOrder = [...(doc.doc.data.projOrder || []), 'p_dl_roadmap'];
  doc.doc.data.tasks = [
    ...(doc.doc.data.tasks || []),
    {
      id: `t_dl_${run}`,
      key: TASK_KEY,
      title: TASK_TITLE,
      project: 'p_dl_roadmap',
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
  expectStatus('dl task fixture', await client.put('/api/workspaces/acme', { revision: doc.revision, doc: doc.doc }), [200]);
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
  test.describe(`deep links (${lang})`, () => {
    test.use({ locale: lang === 'fr' ? 'fr-FR' : 'en-US' });

    test('valid task key opens the drawer over the project board; URL persists across reload', async ({ page }) => {
      await signIn(page, lang);
      await page.goto(`/w/acme/task/${TASK_KEY}`);

      // D-01: the existing drawer shows the task over a real underlying page —
      // never page404. The title is fixture data, not a catalogue string.
      const drawer = page.locator('.drawer');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText(TASK_TITLE).first()).toBeVisible();

      // D-03: reload keeps both the drawer and the /w/:slug/task/:key URL.
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`/w/acme/task/${TASK_KEY}$`));
      await expect(page.locator('.drawer')).toBeVisible();
      await expect(page.locator('.drawer').getByText(TASK_TITLE).first()).toBeVisible();
    });

    test('unknown task key lands on the workspace view with the localized not-found toast', async ({ page }) => {
      await signIn(page, lang);
      await page.goto('/w/acme/task/does-not-exist-999');

      // D-02: workspace view + localized toast — no drawer, no existence oracle.
      await expect(page).not.toHaveURL(/\/task\//);
      await expect(page.locator('.toast')).toContainText(fmt('err.taskNotFound', lang));
      await expect(page.locator('.drawer')).toHaveCount(0);
    });
  });
}
