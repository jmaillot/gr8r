/* =====================================================================
   PHASE 67 E2E (67-04, D-08..D-12): the Webhooks tab of the unified
   project settings modal.

   Covered here (UI-level, against the real 67-03 server):
   - the tab is owner/admin-only (a plain member sees no tab and the
     direct POST is refused 403 — T-67-11 server-first gating);
   - create → the D-10 show-once secret dialog; dismissal drops the
     secret from the DOM for good (T-67-12: no re-render can bring it
     back — the state is nulled and no route returns a secret);
   - the created hook row shows the Active badge (health projection);
   - the Send-test result renders (intercepted — no external network in
     e2e; the real delivery pipeline is covered by the 67-03 suites).

   Conventions follow project-settings.spec.mjs: fixtures only through
   the real API (helpers/setup.mjs), one browser context per account,
   per-run client IPs, EN + FR where labels differ.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';

const L = {
  en: {
    projects: 'Projects',
    tabWebhooks: 'Webhooks',
    tabGeneral: 'General',
    addTitle: 'New webhook',
    url: 'URL',
    secretTitle: 'Copy the secret now',
    events: 'Events',
    format: 'Format',
    empty: 'No webhook yet',
    badgeActive: 'Active',
    badgeDisabled: 'Disabled',
    sendTest: 'Send test',
    testOk: code => `Delivered (HTTP ${code})`,
    testFail: code => `Failed (HTTP ${code})`,
    disable: 'Disable',
    enable: 'Enable',
  },
  fr: {
    projects: 'Projets',
    tabWebhooks: 'Webhooks',
    tabGeneral: 'Général',
    addTitle: 'Nouveau webhook',
    url: 'URL',
    secretTitle: 'Copiez le secret maintenant',
    events: 'Événements',
    format: 'Format',
    empty: 'Aucun webhook',
    badgeActive: 'Actif',
    badgeDisabled: 'Désactivé',
    sendTest: 'Envoyer un test',
    testOk: code => `Distribué (HTTP ${code})`,
    testFail: code => `Échec (HTTP ${code})`,
    disable: 'Désactiver',
    enable: 'Activer',
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

/* Opens the settings modal and switches to the Webhooks tab. */
async function openWebhooksTab(page, lang) {
  await page.locator('button[data-a="editProject"]').click();
  await page.getByRole('tab', { name: L[lang].tabWebhooks }).click();
  await expect(page.getByRole('tab', { name: L[lang].tabWebhooks })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(L[lang].addTitle)).toBeVisible();
}

/* The webhook API path of the fixture project. */
const hooksPath = (slug, pid) => `/api/workspaces/${slug}/projects/${pid}/webhooks`;

test('owner creates a webhook, sees the show-once secret, dismissal drops it for good; the hook row shows its Active badge (D-10/T-67-12)', async ({ browser }) => {
  const run = newRunId();
  const name = `Webhook Secret ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'wh-sec', 'Webhook Owner', { locale: 'en', workspace: `wh-sec-${run}` });
  await addProject(client, account.slug, { id: 'p_wh_sec', key: 'wh-sec', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, 'en', name);
    await openWebhooksTab(page, 'en');

    /* Empty state first. */
    await expect(page.getByText(L.en.empty)).toBeVisible();

    /* Create: fill the URL (default event Task created pre-checked,
       Adaptive card pre-selected), submit. */
    await page.locator('#wh-url').fill('https://outlook.office.com/webhook/e2e');
    await page.locator('button[data-a="whSave"]').click();

    /* D-10: the show-once secret dialog replaces the body and carries the
       raw secret in a code element. */
    await expect(page.getByText(L.en.secretTitle)).toBeVisible();
    const secret = await page.locator('#wh-secret').textContent();
    expect(secret, 'the dialog carries the raw secret (64-hex)').toMatch(/^[a-f0-9]{64}$/);

    /* Dismissal drops the secret from state AND the DOM. */
    await page.locator('button[data-a="whSecretDone"]').click();
    await expect(page.locator('#wh-secret')).toHaveCount(0);
    await expect(page.getByText(L.en.secretTitle)).toHaveCount(0);
    await expect(page.getByText(secret, { exact: true })).toHaveCount(0);

    /* A full page reload (fresh store) — the secret is still nowhere:
       no route ever returns it (D-10/T-67-12). */
    await page.reload();
    await openWebhooksTab(page, 'en');
    const body = await page.locator('.modal').textContent();
    expect(body, 'the secret never re-renders after dismissal').not.toContain(secret);

    /* The hook row renders with its Active health badge (the projection
       carries no secret field to leak). */
    const row = page.locator('div[data-hook]');
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-wh-badge="active"]')).toHaveText(L.en.badgeActive);
    await expect(row).not.toContainText(secret);
  } finally {
    await context.close();
  }
});

test('Send test shows the immediate delivered result through the real request shape (D-11)', async ({ browser }) => {
  const run = newRunId();
  const name = `Webhook Test ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'wh-test', 'Webhook Test Owner', { locale: 'en', workspace: `wh-test-${run}` });
  await addProject(client, account.slug, { id: 'p_wh_test', key: 'wh-test', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    /* Fixture hook through the real API (creation covered above). */
    const created = await client.post(hooksPath(account.slug, 'p_wh_test'), {
      url: 'https://example.test/hook',
      format: 'teams-adaptive',
      events: ['task.created'],
    });
    expect(created.status).toBe(201);
    const hookId = created.data.hook.id;

    await openProjectPage(page, account, 'en', name);
    await openWebhooksTab(page, 'en');
    const row = page.locator(`div[data-hook="${hookId}"]`);
    await expect(row).toHaveCount(1);

    /* Intercept the test-send (no external network in e2e — the delivery
       pipeline itself is covered by the 67-03 suites) and answer 200 OK,
       exactly the {ok, statusCode} shape the 67-03 route returns on a
       successful delivery. */
    await page.route(`**/api/workspaces/*/projects/*/webhooks/${hookId}/test`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, statusCode: 200 }) }));

    await row.locator('button[data-a="whTest"]').click();
    await expect(row.locator('[data-wh-test="ok"]')).toHaveText(L.en.testOk(200));
  } finally {
    await context.close();
  }
});

test('Send test shows the failure result when the delivery fails (D-11)', async ({ browser }) => {
  const run = newRunId();
  const name = `Webhook Fail ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'wh-fail', 'Webhook Fail Owner', { locale: 'en', workspace: `wh-fail-${run}` });
  await addProject(client, account.slug, { id: 'p_wh_fail', key: 'wh-fail', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    const created = await client.post(hooksPath(account.slug, 'p_wh_fail'), {
      url: 'https://example.test/hook',
      format: 'raw-json',
      events: ['task.created'],
    });
    expect(created.status).toBe(201);
    const hookId = created.data.hook.id;

    await openProjectPage(page, account, 'en', name);
    await openWebhooksTab(page, 'en');
    const row = page.locator(`div[data-hook="${hookId}"]`);

    /* The route answers the failure shape: statusCode 500, ok false. */
    await page.route(`**/api/workspaces/*/projects/*/webhooks/${hookId}/test`, route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: false, statusCode: 500 }) }));

    await row.locator('button[data-a="whTest"]').click();
    await expect(row.locator('[data-wh-test="fail"]')).toHaveText(L.en.testFail(500));
  } finally {
    await context.close();
  }
});

test('the same create + show-once secret flow in French (D-10)', async ({ browser }) => {
  const run = newRunId();
  const name = `Webhook FR ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'wh-fr', 'Webhook FR Owner', { locale: 'fr', workspace: `wh-fr-${run}` });
  await addProject(client, account.slug, { id: 'p_wh_fr', key: 'wh-fr', name });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await openProjectPage(page, account, 'fr', name);
    await openWebhooksTab(page, 'fr');

    await page.locator('#wh-url').fill('https://outlook.office.com/webhook/e2e-fr');
    await page.locator('button[data-a="whSave"]').click();

    await expect(page.getByText(L.fr.secretTitle)).toBeVisible();
    const secret = await page.locator('#wh-secret').textContent();
    expect(secret).toMatch(/^[a-f0-9]{64}$/);
    await page.locator('button[data-a="whSecretDone"]').click();
    await expect(page.locator('#wh-secret')).toHaveCount(0);

    /* The FR catalogue's webhook.* keys render: the row badge is French. */
    const row = page.locator('div[data-hook]');
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-wh-badge="active"]')).toHaveText(L.fr.badgeActive);
  } finally {
    await context.close();
  }
});

/* T-67-11: the Webhooks tab is owner/admin-only — render-time gating is UX
   and the server-first 403 is the real gate (the UI never sends, but a
   direct call is refused anyway). */
test('a plain member sees no Webhooks tab and a direct webhook POST is refused 403 (T-67-11)', async ({ browser }) => {
  const run = newRunId();
  const name = `Webhook Gate ${run}`;
  const { account, client } = await createAccount(BASE_URL, run, 'wh-gate', 'Webhook Gate Owner', { locale: 'en', workspace: `wh-gate-${run}` });
  await addProject(client, account.slug, { id: 'p_wh_gate', key: 'wh-gate', name });

  /* Invite a plain member through the real API. */
  const memberEmail = `wh-member-${run}@e2e.local`;
  const invite = (await client.post(`/api/workspaces/${account.slug}/invites`, { emails: [memberEmail], role: 'member' })).data.invites[0];
  const member = { email: memberEmail, password: 'e2e-password-1', ip: clientIp(run, 'wh-member') };
  const mClient = apiClient(BASE_URL, { name: 'wh-member', ip: member.ip });
  expect((await mClient.post('/api/auth/signup', { name: 'Webhook Member', email: member.email, password: member.password })).status).toBe(201);
  const token = invite.url.slice(String(invite.url).lastIndexOf('/join/') + '/join/'.length);
  expect((await mClient.post(`/api/invites/${token}/accept`, {})).status).toBeLessThan(400);

  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': member.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, { ...member, slug: account.slug }, 'en');
    await page.goto(`${BASE_URL}/w/${account.slug}/project/wh-gate`);
    await expect(page.locator('.proj-h h1')).toHaveText(name);
    await page.locator('button[data-a="editProject"]').click();

    /* The tab bar offers General and Access only — no Webhooks tab. */
    await expect(page.getByRole('tab', { name: 'General' })).toBeVisible();
    await expect(page.getByRole('tab', { name: L.en.tabWebhooks })).toHaveCount(0);
    await expect(page.locator('div[data-hook], button[data-a="whSave"], #wh-url')).toHaveCount(0);
  } finally {
    await context.close();
  }

  /* Server-first: the member's direct POST to the gated route is 403,
     whatever the UI renders. */
  const direct = await mClient.post(hooksPath(account.slug, 'p_wh_gate'), {
    url: 'https://example.test/hook',
    format: 'teams-adaptive',
    events: ['task.created'],
  });
  expect(direct.status).toBe(403);
});
