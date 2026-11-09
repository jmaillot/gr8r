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
import { BASE_URL, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';

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
async function addProject(client, slug, { id, key, name, teamIds = [] }) {
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
      teams: [...teamIds],
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

/* Adds named teams to the workspace doc (teams ride the document — no REST route). */
async function addTeams(client, slug, defs) {
  const got = await client.get(`/api/workspaces/${slug}`);
  if (got.status !== 200) throw Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  doc.data.teams = [
    ...(doc.data.teams || []),
    ...defs.map(({ id, name }) => ({ id, name, icon: 'users', c: '#3B82C4', desc: `Team ${name}` })),
  ];
  const put = await client.put(`/api/workspaces/${slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`teams PUT failed with HTTP ${put.status}`);
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

    /* [2026-11-09 owner ruling] No Share button in the page header — the
       gear is the sole affordance there. Access deep-linking lives in the
       Workspace > Projects ⋯ context menu's Share entry. */
    await expect(page.locator('.proj-h').getByRole('button', { name: L[lang].share, exact: true })).toHaveCount(0);

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

    /* [2026-11-09 owner ruling] NO team chips on the edit General tab — team
       selection lives only in the Access tab. */
    await expect(page.locator('button[role="checkbox"][data-a="pformTeamToggle"]')).toHaveCount(0);

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

/* [2026-11-09 owner ruling] Regression: teams linked in the Access tab
   survive a General-tab save — the edit submit no longer writes p.teams
   (WR-01 fix rides the same branch: a concurrent-admin 409 surfaces the
   conflict message, not a success toast). */
test('Access-tab team links survive a General-tab save; the edit submit is conflict-honest (D-02/T-53-08)', async ({ browser }) => {
  const run = newRunId();
  const name = `Survival ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'sv-en', 'Survival Owner', { locale: 'en', workspace: `sv-en-${run}` });
  await addTeams(client, account.slug, [{ id: 'tm_sv_a', name: `Crew S ${run}` }]);
  await addProject(client, account.slug, { id: 'p_sv_a', key: 'sv-a', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, 'en', name);

    /* Link the team from the Access tab. */
    await page.locator('button[data-a="editProject"]').click();
    await page.getByRole('tab', { name: 'Access' }).click();
    await page.locator(`button[data-a="shareTeamInvite"][data-tid="tm_sv_a"]`).click();
    await expect(page.locator(`select[data-in="teamPerm"][data-tid="tm_sv_a"]`)).toHaveValue('Can edit');

    /* Save from the General tab: rename, submit, wait for the settled push. */
    await page.getByRole('tab', { name: 'General' }).click();
    await page.locator('#p-name').fill(`${name} v2`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Project updated')).toBeVisible();

    /* Reopen: the Access tab STILL lists the linked team — the save never
       touched p.teams. */
    await page.locator('button[data-a="editProject"]').click();
    await page.getByRole('tab', { name: 'Access' }).click();
    await expect(page.locator(`select[data-in="teamPerm"][data-tid="tm_sv_a"]`)).toBeVisible();
    await expect(page.locator(`select[data-in="teamPerm"][data-tid="tm_sv_a"]`)).toHaveValue('Can edit');
  } finally {
    await context.close();
  }
});

/* =====================================================================
   Task 2: per-team perm dropdowns (D-01/D-02) + concurrency honesty.
   ===================================================================== */

const CONFLICT_EN = 'This change conflicts with a recent edit by someone else';

test('linking a team defaults its perm to Can edit; the changed perm persists after reload (D-02)', async ({ browser }) => {
  const run = newRunId();
  const name = `Team Perm ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'tp-en', 'Team Perm Owner', { locale: 'en', workspace: `tp-en-${run}` });
  await addTeams(client, account.slug, [{ id: 'tm_tp_a', name: `Crew A ${run}` }]);
  await addProject(client, account.slug, { id: 'p_tp_a', key: 'tp-a', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, 'en', name);
    await page.locator('button[data-a="editProject"]').click();
    await page.getByRole('tab', { name: 'Access' }).click();

    /* Link the team from the chips row — the linked row appears with the
       D-02 default 'Can edit' preselected. */
    await page.locator(`button[data-a="shareTeamInvite"][data-tid="tm_tp_a"]`).click();
    const sel = page.locator(`select[data-in="teamPerm"][data-tid="tm_tp_a"]`);
    await expect(sel).toBeVisible();
    await expect(sel).toHaveValue('Can edit');

    /* Change the tier and reload — the stored value round-trips. */
    await sel.selectOption({ label: 'Can view' });
    await expect(page.getByText(`Crew A ${run}: Can view`)).toBeVisible();
    await page.reload();
    await page.locator('button[data-a="editProject"]').click();
    await page.getByRole('tab', { name: 'Access' }).click();
    await expect(page.locator(`select[data-in="teamPerm"][data-tid="tm_tp_a"]`)).toHaveValue('Can view');

    /* The stored doc carries the team-keyed perm under p.perms. */
    const got = await client.get(`/api/workspaces/${account.slug}`);
    const stored = (got.data.doc.data.projects || []).find(p => p.id === 'p_tp_a');
    expect(stored?.perms?.['team:tm_tp_a'], 'the perm rides the team-keyed namespace').toBe('Can view');
  } finally {
    await context.close();
  }
});

test('a concurrent admin write surfaces the honest conflict error, never a silent overwrite (T-53-08)', async ({ browser }) => {
  const run = newRunId();
  const name = `Concurrent ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'cc-en', 'Concurrent Owner', { locale: 'en', workspace: `cc-en-${run}` });
  await addTeams(client, account.slug, [{ id: 'tm_cc_a', name: `Crew C ${run}` }]);
  await addProject(client, account.slug, { id: 'p_cc_a', key: 'cc-a', name, teamIds: ['tm_cc_a'] });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, 'en', name);
    await page.locator('button[data-a="editProject"]').click();
    await page.getByRole('tab', { name: 'Access' }).click();
    await expect(page.locator(`select[data-in="teamPerm"][data-tid="tm_cc_a"]`)).toBeVisible();

    /* A concurrent admin session writes the doc between the modal opening
       and the perm save — the browser's revision goes stale. */
    const cc = await client.get(`/api/workspaces/${account.slug}`);
    const doc = cc.data.doc;
    const proj = doc.data.projects.find(p => p.id === 'p_cc_a');
    proj.name = `Concurrent Renamed ${run}`;
    const put = await client.put(`/api/workspaces/${account.slug}`, { revision: cc.data.revision, doc });
    if (put.status !== 200) throw new Error(`concurrent PUT failed with HTTP ${put.status}`);

    /* The stale PUT is refused: the honest conflict message shows and the
       optimistic value reverts to the stored tier. */
    await page.locator(`select[data-in="teamPerm"][data-tid="tm_cc_a"]`).selectOption({ label: 'Can view' });
    await expect(page.getByText(CONFLICT_EN)).toBeVisible();
    await expect(page.locator(`select[data-in="teamPerm"][data-tid="tm_cc_a"]`)).toHaveValue('Can edit');
  } finally {
    await context.close();
  }
});

test('a non-manager sees the Access section read-only with the lock hint — no editable perm controls (D-01)', async ({ browser }) => {
  const run = newRunId();
  const name = `Read Only ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'ro-en', 'Read Only Owner', { locale: 'en', workspace: `ro-en-${run}` });
  await addTeams(client, account.slug, [{ id: 'tm_ro_a', name: `Crew R ${run}` }]);
  await addProject(client, account.slug, { id: 'p_ro_a', key: 'ro-a', name, teamIds: ['tm_ro_a'] });

  /* Invite a plain member through the real API. */
  const memberEmail = `ro-member-${run}@e2e.local`;
  const invite = (await client.post(`/api/workspaces/${account.slug}/invites`, { emails: [memberEmail], role: 'member' })).data.invites[0];
  const member = { email: memberEmail, password: 'e2e-password-1', ip: clientIp(run, 'ro-member') };
  const mClient = apiClient(BASE_URL, { name: 'ro-member', ip: member.ip });
  expect((await mClient.post('/api/auth/signup', { name: 'Read Only Member', email: member.email, password: member.password })).status).toBe(201);
  const token = invite.url.slice(String(invite.url).lastIndexOf('/join/') + '/join/'.length);
  expect((await mClient.post(`/api/invites/${token}/accept`, {})).status).toBeLessThan(400);

  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': member.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, { ...member, slug: account.slug }, 'en');
    await page.goto(`${BASE_URL}/w/${account.slug}/project/ro-a`);
    await expect(page.locator('.proj-h h1')).toHaveText(name);
    await page.locator('button[data-a="editProject"]').click();
    await page.getByRole('tab', { name: 'Access' }).click();

    /* The lock hint shows; the linked team renders a static level, and no
       editable per-team control exists anywhere in the modal. */
    await expect(page.getByText('Only the project lead, an admin or the owner can change who has access.')).toBeVisible();
    await expect(page.locator('.modal').getByText(`Crew R ${run}`)).toBeVisible();
    await expect(page.getByText('Can edit').first()).toBeVisible();
    await expect(page.locator('select[data-in="teamPerm"]')).toHaveCount(0);
    await expect(page.locator('button[data-a="shareTeamInvite"]')).toHaveCount(0);
    await expect(page.locator('button[data-a="shareTeamRemove"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

/* =====================================================================
   Task 3: per-field data-in survival sweep (EN + FR) + old modals gone.
   ===================================================================== */

/* Focuses every keystroke-able General field, types/selects a value, forces
   a full re-render by switching tabs, and asserts every value survived the
   re-render (all fields are data-in-bound to S.ui.pform). */
async function survivalSweep(browser, account, lang, projectName, values) {
  const context = await browser.newContext({ baseURL: BASE_URL, locale: lang === 'fr' ? 'fr-FR' : 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, lang, projectName);
    await page.locator('button[data-a="editProject"]').click();
    await assertSettingsModal(page, lang, 'general', projectName);

    await page.locator('#p-name').fill(values.name);
    await page.locator('#p-desc').fill(values.desc);
    await page.locator('#p-due').fill(values.due);
    await page.locator('.iconpick button[role="radio"][aria-label="rocket"]').click();

    /* Force a full modal re-render (tab toggle re-renders from live store
       state) — every value must survive. */
    await page.getByRole('tab', { name: L[lang].tabAccess }).click();
    await page.getByRole('tab', { name: L[lang].tabGeneral }).click();

    await expect(page.locator('#p-name')).toHaveValue(values.name);
    await expect(page.locator('#p-desc')).toHaveValue(values.desc);
    await expect(page.locator('#p-due')).toHaveValue(values.due);
    await expect(page.locator('.iconpick button[role="radio"][aria-label="rocket"]')).toHaveAttribute('aria-checked', 'true');

    /* The Access tab's per-team select also re-renders from live state —
       its stored tier survives the round-trip too. */
    await page.getByRole('tab', { name: L[lang].tabAccess }).click();
    await expect(page.locator('select[data-in="teamPerm"]').first()).toHaveValue('Can edit');
  } finally {
    await context.close();
  }
}

test('per-field survival sweep: type into every field, re-render, values survive (EN)', async ({ browser }) => {
  const run = newRunId();
  const name = `Survival EN ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'sv-en', 'Survival EN Owner', { locale: 'en', workspace: `sv-en-${run}` });
  await addTeams(client, account.slug, [{ id: 'tm_sv_a', name: `Sweep Crew ${run}` }]);
  await addProject(client, account.slug, { id: 'p_sv_a', key: 'sv-a', name, teamIds: ['tm_sv_a'] });
  await survivalSweep(browser, account, 'en', name, { name: `Survival Renamed ${run}`, desc: `Keystroke survival ${run}`, due: '2030-06-15' });
});

test('per-field survival sweep in French (FR)', async ({ browser }) => {
  const run = newRunId();
  const name = `Survie FR ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'sv-fr', 'Survival FR Owner', { locale: 'fr', workspace: `sv-fr-${run}` });
  await addTeams(client, account.slug, [{ id: 'tm_sv_b', name: `Équipe Sweep ${run}` }]);
  await addProject(client, account.slug, { id: 'p_sv_b', key: 'sv-b', name, teamIds: ['tm_sv_b'] });
  await survivalSweep(browser, account, 'fr', name, { name: `Survie Renommé ${run}`, desc: `Survie des frappes ${run}`, due: '2031-01-20' });
});

test('the old modals are gone: create opens the create-only form and no route opens a share/project modal', async ({ browser }) => {
  const run = newRunId();
  const name = `Legacy Gone ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'lg-en', 'Legacy Owner', { locale: 'en', workspace: `lg-en-${run}` });
  await addProject(client, account.slug, { id: 'p_lg_a', key: 'lg-a', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'en');

    /* The create path still works — through the create-only form, never the
       removed projectModal. */
    await page.getByRole('button', { name: 'New project' }).first().click();
    await expect(page.getByRole('heading', { name: 'New project', level: 2 })).toBeVisible();
    await expect(page.locator('.modal .tmpls[role="radiogroup"]').first()).toBeVisible();
    await page.keyboard.press('Escape');

    /* No entry point opens anything but the unified projectSettings modal.
       [2026-11-09 owner ruling] The header has NO Share button — the gear
       and the context menu are the surviving entry points. */
    await page.goto(`${BASE_URL}/w/${account.slug}/project/lg-a`);
    await expect(page.locator('.proj-h h1')).toHaveText(name);
    await expect(page.locator('.proj-h').getByRole('button', { name: 'Share', exact: true })).toHaveCount(0);
    await page.locator('button[data-a="editProject"]').click();
    await expect(page.locator('.modal')).toHaveCount(1);
    await assertSettingsModal(page, 'en', 'general', name);
    await page.getByRole('tab', { name: 'Access' }).click();
    await assertSettingsModal(page, 'en', 'access', name);
  } finally {
    await context.close();
  }
});
