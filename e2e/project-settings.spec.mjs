/* =====================================================================
   PHASE 53 E2E (PSET-01, PSET-04): the unified project settings modal.

   D-04: ONE modal with two tabs — General (the former projectModal edit
   fields, same pform model) and Access (the former shareModal body, same
   immediate-action handlers). D-05: the settings gear opens the modal on
   the General tab; every Share entry (labeled button, avatar stack,
   context menu) opens it directly on the Access tab. The same modal opens
   identically from the project page and from Workspace > Projects (grid
   ⋯ context menu).

   Conventions follow the rest of the suite: fixtures only through the
   real API (helpers/setup.mjs), one browser context per account,
   per-run client IPs.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';

const L = {
  en: {
    projects: 'Projects',
    share: 'Share',
    renameEdit: 'Rename & edit',
    projectOptions: 'Project options',
    settingsTitle: 'Project settings',
    tabGeneral: 'General',
    tabAccess: 'Access',
    nameField: 'Project name',
    peopleWithAccess: 'People with access',
    shareTitle: name => `Share “${name}”`,
  },
  fr: {
    projects: 'Projets',
    share: 'Partager',
    renameEdit: 'Renommer et modifier',
    projectOptions: 'Options du projet',
    settingsTitle: 'Paramètres du projet',
    tabGeneral: 'Général',
    tabAccess: 'Accès',
    nameField: 'Nom du projet',
    peopleWithAccess: 'Personnes ayant accès',
    shareTitle: name => `Partager « ${name} »`,
  },
};

async function signIn(page, account, lang) {
  const d = {
    en: { email: 'Email', password: 'Password', submit: 'Sign in' },
    fr: { email: 'E-mail', password: 'Mot de passe', submit: 'Se connecter' },
  }[lang];
  await page.goto('/');
  await page.getByLabel(d.email).fill(account.email);
  await page.getByLabel(d.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: d.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* Adds one named public project to the workspace doc through the real API. */
async function addProject(client, slug, { id, key, name }) {
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
      team: null,
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
  doc.data.projOrder = [...(doc.data.projOrder || []), id];
  const put = await client.put(`/api/workspaces/${slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
}

/* Signs in and lands on the fixture project's page. */
async function openProjectPage(page, account, lang, projectName) {
  await signIn(page, account, lang);
  await page.getByRole('button', { name: L[lang].projects }).first().click();
  await page.locator(`[data-a='go'][data-r='project'][aria-label="${projectName}"]`).click();
  await expect(page.locator('.proj-h h1')).toHaveText(projectName);
}

/* D-05 core assertions: the unified modal is open with the given tab active. */
async function assertSettingsModal(page, lang, tab, projectName) {
  const d = L[lang];
  if (tab === 'general') {
    await expect(page.getByRole('heading', { name: d.settingsTitle, level: 2 })).toBeVisible();
    await expect(page.getByRole('tab', { name: d.tabGeneral })).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#p-name')).toBeVisible();
  } else {
    await expect(page.getByRole('heading', { name: d.shareTitle(projectName), level: 2 })).toBeVisible();
    await expect(page.getByRole('tab', { name: d.tabAccess })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText(d.peopleWithAccess)).toBeVisible();
  }
}

/* D-04 open/switch matrix, run for both locales: gear → General, Share →
   Access, and the tab bar switches the body both ways. */
async function openSwitchMatrix(browser, account, lang, projectName) {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: lang === 'fr' ? 'fr-FR' : 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, lang, projectName);

    /* The gear opens General. */
    await page.locator('button[data-a="editProject"]').click();
    await assertSettingsModal(page, lang, 'general', projectName);

    /* Switch to Access and back — both directions render the other body. */
    await page.getByRole('tab', { name: L[lang].tabAccess }).click();
    await assertSettingsModal(page, lang, 'access', projectName);
    await page.getByRole('tab', { name: L[lang].tabGeneral }).click();
    await assertSettingsModal(page, lang, 'general', projectName);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);

    /* The Share button deep-links straight to Access. */
    await page.getByRole('button', { name: L[lang].share, exact: true }).click();
    await assertSettingsModal(page, lang, 'access', projectName);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);

    /* Workspace > Projects: the card's ⋯ context menu opens the SAME modal. */
    await page.getByRole('button', { name: L[lang].projects }).first().click();
    await page.locator(`[data-a='go'][data-r='project'][aria-label="${projectName}"]`).hover();
    await page.locator(`button[data-a="ctxBtn"][data-ctx="project"][data-id]`).first().click();
    await page.getByRole('button', { name: L[lang].renameEdit }).click();
    await assertSettingsModal(page, lang, 'general', projectName);
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal')).toHaveCount(0);
    await page.locator(`button[data-a="ctxBtn"][data-ctx="project"][data-id]`).first().click();
    await page.getByRole('button', { name: L[lang].share, exact: true }).click();
    await assertSettingsModal(page, lang, 'access', projectName);
  } finally {
    await context.close();
  }
}

test('gear → General, Share → Access, tab switching both ways; grid ⋯ menu opens the same modal (EN) (D-04/D-05)', async ({ browser }) => {
  const run = newRunId();
  const name = `Settings Alpha ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'pset-en', 'PSET EN Owner', { locale: 'en', workspace: `pset-en-${run}` });
  await addProject(client, account.slug, { id: 'p_pset_a', key: 'pset-a', name });
  await openSwitchMatrix(browser, account, 'en', name);
});

test('the same open/switch matrix in French (D-04/D-05)', async ({ browser }) => {
  const run = newRunId();
  const name = `Paramètres Alpha ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'pset-fr', 'PSET FR Owner', { locale: 'fr', workspace: `pset-fr-${run}` });
  await addProject(client, account.slug, { id: 'p_pset_fr', key: 'pset-fr', name });
  await openSwitchMatrix(browser, account, 'fr', name);
});

test('General tab renders every former projectModal field, Access tab every former shareModal section (D-04)', async ({ browser }) => {
  const run = newRunId();
  const name = `Full Body ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'pset-body', 'PSET Body Owner', { locale: 'en', workspace: `pset-body-${run}` });
  await addProject(client, account.slug, { id: 'p_pset_b', key: 'pset-b', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, 'en', name);
    await page.locator('button[data-a="editProject"]').click();

    /* General: name, description, icon picker, color swatches, lead select,
       target date — the former projectModal edit field set. */
    await expect(page.locator('#p-name')).toHaveValue(name);
    for (const id of ['p-desc', 'p-lead', 'p-due']) await expect(page.locator(`#${id}`)).toBeVisible();
    await expect(page.locator('.iconpick button[role="radio"]').first()).toBeVisible();
    await expect(page.locator('.swatches button[role="radio"]').first()).toBeVisible();

    await page.getByRole('tab', { name: 'Access' }).click();
    /* Access: invite-by-email row, People with access, General access — the
       former shareModal sections. */
    await expect(page.getByText('People with access')).toBeVisible();
    await expect(page.getByText('General access')).toBeVisible();
    await expect(page.getByLabel('Invite by email')).toBeVisible();
  } finally {
    await context.close();
  }
});
