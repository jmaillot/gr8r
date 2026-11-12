/* =====================================================================
   PHASE 57 E2E (VIEW-03): the default workspace visibility setting.

   The owner story, proven in Chromium on the real server:
   - owner enables "New projects are private" in Settings > General;
   - a member creates a project through the UI → it is PRIVATE and
     invisible to a non-invited member (the funnel is the unchanged
     per-project binary — no third state, D-01);
   - the Access tab shows the informational default hint (D-04);
   - with the setting off, a created project is workspace-visible.

   Conventions follow the rest of the suite: fixtures only through the
   real API (helpers/setup.mjs), run-unique per-IP addresses, one
   browser context per account.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';

async function signIn(page, account, lang = 'en') {
  const d =
    lang === 'fr'
      ? { email: 'E-mail', password: 'Mot de passe', submit: 'Se connecter' }
      : { email: 'Email', password: 'Password', submit: 'Sign in' };
  await page.goto('/');
  await page.getByLabel(d.email).fill(account.email);
  await page.getByLabel(d.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: d.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* Invites + accepts one member into the run's workspace through the real API. */
async function joinMember(base, owner, slug, email, run, tag) {
  const invite = await owner.post(`/api/workspaces/${slug}/invites`, { emails: [email], role: 'member' });
  expect(invite.status, 'invite created').toBe(201);
  const joiner = apiClient(base, { name: tag, ip: clientIp(run, tag) });
  await joiner.post('/api/auth/signup', { name: tag, email, password: PASSWORD });
  const accept = await joiner.post(`/api/invites/${inviteToken(invite.data.invites[0].url)}/accept`, {});
  expect(accept.status, 'invite accepted').toBeLessThan(300);
  return { client: joiner, email, password: PASSWORD, slug };
}

/* Creates a project through the real UI modal (the client seed under test). */
async function createProjectViaUi(page, name) {
  await page.locator(`[data-a='go'][data-r='projects']`).first().click();
  await page.locator(`button[data-a='newProject']`).first().click();
  await page.getByLabel('Project name', { exact: true }).fill(name);
  await page.locator(`[data-a='submitProject']`).click();
  await expect(page.getByText(`Created ${name}`)).toBeVisible();
}

/* Adds one public project through the real API (GET doc → mutate → PUT),
   the same doc-PUT fixture shape the rest of the suite uses. */
async function addProject(client, slug, { id, key, name }) {
  const got = await client.get(`/api/workspaces/${slug}`);
  expect(got.status, 'workspace GET').toBe(200);
  const revision = got.data.revision ?? got.data.doc.revision;
  const doc = JSON.parse(JSON.stringify(got.data.doc));
  doc.data.projects.push({
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
  });
  doc.data.projOrder = [...(doc.data.projOrder || []), id];
  const put = await client.put(`/api/workspaces/${slug}`, { revision, doc });
  if (put.status !== 200) throw new Error(`project fixture PUT failed: ${put.status} ${JSON.stringify(put.data)?.slice(0, 300)}`);
}

/* The workspace doc as the owner's API client sees it. */
async function projectsOf(client, slug) {
  const got = await client.get(`/api/workspaces/${slug}`);
  expect(got.status, 'workspace GET').toBe(200);
  return got.data.doc.data.projects;
}

test('owner default-visibility setting seeds private creations and hides them from non-invited members (EN)', async ({ browser }) => {
  const run = newRunId();
  const slug = `dv-${run}`;
  const { account, client: owner } = await createAccount(BASE_URL, run, 'dv-owner', 'DV Owner', { locale: 'en', workspace: slug });
  const maker = await joinMember(BASE_URL, owner, slug, `dv-maker-${run}@dv.local`, run, 'DV Maker');
  const outsider = await joinMember(BASE_URL, owner, slug, `dv-out-${run}@dv.local`, run, 'DV Out');
  await addProject(owner, slug, { id: 'p_dv_fixture', key: 'dv-fix', name: `DV Fixture ${run}` });

  const ownerCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const makerCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': maker.ip } });
  try {
    const ownerPage = await ownerCtx.newPage();
    await signIn(ownerPage, account);

    /* Owner enables the default in Settings > General (the workspace section). */
    await ownerPage.locator(`button.sitem[data-a='go'][data-r='settings']`).first().click();
    await ownerPage.locator(`[data-a='go'][data-r='settings'][data-sec='workspace']`).click();
    const toggle = ownerPage.locator(`input[data-in='prefToggle'][data-k='defaultPrivate']`);
    await expect(toggle).toBeVisible();
    await toggle.click();

    /* The toggle rides the debounced doc PUT — wait until the STORED pref is
       on before any member creation depends on it. */
    await expect
      .poll(async () => (await owner.get(`/api/workspaces/${slug}`)).data.doc.prefs?.defaultPrivate, {
        timeout: 10_000,
      })
      .toBe(true);

    /* The hint shows the workspace default on a project's Access tab. */
    const projects = await projectsOf(owner, slug);
    const someId = projects[0]?.id;
    expect(someId, 'a fixture project exists').toBeTruthy();
    await ownerPage.locator(`[data-a='go'][data-r='projects']`).first().click();
    await ownerPage.locator(`[data-a='go'][data-r='project'][aria-label="DV Fixture ${run}"]`).click();
    await ownerPage.locator(`[data-a='editProject'][data-id='${someId}']`).click();
    await ownerPage.getByRole('tab', { name: 'Access' }).click();
    await expect(ownerPage.getByText('Workspace default: new projects start private.')).toBeVisible();
    await ownerPage.close();
    await ownerCtx.close();

    /* A member creates a project through the UI → seeded private. */
    const makerPage = await makerCtx.newPage();
    await signIn(makerPage, maker);
    /* The member's create rides the debounced doc PUT — wait for the flush. */
    const name = `Seeded Private ${run}`;
    await createProjectViaUi(makerPage, name);
    /* The create rides save()'s 150 ms debounce + the 450 ms push — give the
       dirty flag time to arm before the pagehide keepalive flush. */
    await makerPage.waitForTimeout(1500);
    await makerPage.close();
    await makerCtx.close();
    let created = null;
    await expect
      .poll(
        async () => {
          created = ((await maker.client.get(`/api/workspaces/${slug}`)).data?.doc?.data?.projects || []).find(
            p => p.name === name,
          );
          return created || null;
        },
        { timeout: 15_000 },
      )
      .not.toBeNull();
    expect(created.private, 'the creation was seeded private:true').toBe(true);

    /* Server-side funnel proof: the outsider's redacted doc never contains it. */
    await expect
      .poll(
        async () =>
          ((await outsider.client.get(`/api/workspaces/${slug}`)).data?.doc?.data?.projects || []).some(
            p => p.name === name,
          ),
        { timeout: 10_000 },
      )
      .toBe(false);

    /* Invisible to a non-invited member: the outsider's projects list
       (the collapsed funnel) never contains it. */
    const outCtx = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': outsider.ip } });
    const outPage = await outCtx.newPage();
    await signIn(outPage, outsider);
    await outPage.locator(`[data-a='go'][data-r='projects']`).first().click();
    await expect(outPage.getByRole('link', { name, exact: true })).toHaveCount(0);
    await outCtx.close();

    /* With the setting OFF, a created project is workspace-visible. */
    const ownerCtx2 = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
    const ownerPage2 = await ownerCtx2.newPage();
    await signIn(ownerPage2, account);
    await ownerPage2.locator(`button.sitem[data-a='go'][data-r='settings']`).first().click();
    await ownerPage2.locator(`[data-a='go'][data-r='settings'][data-sec='workspace']`).click();
    const toggle2 = ownerPage2.locator(`input[data-in='prefToggle'][data-k='defaultPrivate']`);
    await expect(toggle2).toBeVisible();
    if (await toggle2.isChecked()) await toggle2.click();
    await expect
      .poll(async () => (await owner.get(`/api/workspaces/${slug}`)).data.doc.prefs?.defaultPrivate, { timeout: 10_000 })
      .toBe(false);
    await ownerCtx2.close();

    const makerCtx2 = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': maker.ip } });
    const makerPage2 = await makerCtx2.newPage();
    await signIn(makerPage2, maker);
    const publicName = `Open Project ${run}`;
    await createProjectViaUi(makerPage2, publicName);
    await makerPage2.waitForTimeout(1500);
    await makerPage2.close();
    await makerCtx2.close();
    let created2 = null;
    await expect
      .poll(
        async () => {
          created2 = ((await maker.client.get(`/api/workspaces/${slug}`)).data?.doc?.data?.projects || []).find(
            p => p.name === publicName,
          );
          return created2 || null;
        },
        { timeout: 15_000 },
      )
      .not.toBeNull();
    expect(created2.private === true, 'not seeded private with the pref off').toBe(false);
    const outCtx2 = await browser.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { 'x-forwarded-for': outsider.ip } });
    const outPage2 = await outCtx2.newPage();
    await signIn(outPage2, outsider);
    await outPage2.locator(`[data-a='go'][data-r='projects']`).first().click();
    await expect(outPage2.getByRole('link', { name: publicName, exact: true })).toBeVisible();
    await outCtx2.close();
  } finally {
    await Promise.allSettled([ownerCtx.close(), makerCtx.close()]);
  }
});
