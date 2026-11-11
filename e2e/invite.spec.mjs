/* =====================================================================
   PHASE 53 E2E (INVT-01/02/03): the invite modal.

   INVT-01: the email draft survives every interaction that re-renders
   the modal — role changes, team chip toggles, project chip toggles,
   and background state re-renders. The textarea carries
   data-in="inviteDraft" (silent-state binding): the handler mutates
   S.ui.inviteDraft and NEVER calls render(), so the full re-renders
   that chip toggles and role changes trigger restore the typed emails
   from state. Proven in English and French.

   INVT-02: the Projects chips list PROJECTS (not teams) below Team and
   feed S.ui.inviteScope.projects into the POST scope.

   INVT-03/D-06: a guest with ≠1 project disables send with a localized
   hint (EN + FR); one project enables it — no clamping.

   Conventions follow the rest of the suite: fixtures only through the
   real API (helpers/setup.mjs), run-unique per-IP addresses, one browser
   context per account.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, createAccount, newRunId } from './helpers/setup.mjs';

const EMAIL_ONE = 'alpha-inv@example.com';
const EMAIL_TWO = 'beta-inv@example.com';

/* Opens the invite modal from the workspace home header (admin/owner only). */
async function openInviteModal(page) {
  await page.getByRole('button', { name: /Invite member|Inviter un membre/ }).click();
  await expect(page.locator('#inv-emails')).toBeVisible();
}

async function signIn(page, account, lang) {
  const L = {
    en: { email: 'Email', password: 'Password', submit: 'Sign in' },
    fr: { email: 'E-mail', password: 'Mot de passe', submit: 'Se connecter' },
  }[lang];
  await page.goto('/');
  await page.getByLabel(L.email).fill(account.email);
  await page.getByLabel(L.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: L.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* The full interaction sequence that used to wipe the draft: two role
   changes and a team chip toggle — every one of them re-renders the
   modal. [2026-11-11 round 3] the multi-project scope chips are retired
   (SCOPE-01): the only scope picker left is the Guest single-project
   radio row, exercised by the dedicated D-13 tests below. */
async function interactAndSurvive(page) {
  await page.locator('#inv-emails').fill(`${EMAIL_ONE}, ${EMAIL_TWO}`);

  const role = page.locator('#inv-role');
  await role.selectOption({ label: 'Admin' });
  await role.selectOption({ label: 'Member' });

  await page.locator('button[data-a="invTeamToggle"]').first().click();

  /* A settle window so a background poll re-render — if one fires — has
     its chance to wipe the unbound draft. */
  await page.waitForTimeout(600);

  const value = await page.locator('#inv-emails').inputValue();
  expect(value, 'the typed emails must survive every re-render').toContain(EMAIL_ONE);
  expect(value, 'the typed emails must survive every re-render').toContain(EMAIL_TWO);
}

test('typed invite emails survive role changes and team chip toggles (EN) (INVT-01)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'draft-en', 'Draft EN Owner', { locale: 'en', workspace: `draft-en-${run}` });
  await addNamedProjects(client, account.slug, [{ id: 'p_draft_a', key: 'draft-a', name: 'Draft Alpha' }]);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'en');
    await openInviteModal(page);
    await expect(page.getByText('Email addresses')).toBeVisible();
    await interactAndSurvive(page);
  } finally {
    await context.close();
  }
});

test('typed invite emails survive the same interactions in French (INVT-01)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'draft-fr', 'Draft FR Owner', { locale: 'fr', workspace: `draft-fr-${run}` });
  await addNamedProjects(client, account.slug, [{ id: 'p_draft_fr', key: 'draft-fr', name: 'Brouillon Alpha' }]);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'fr');
    await openInviteModal(page);
    await expect(page.getByText('Adresses e-mail')).toBeVisible();
    await interactAndSurvive(page);
  } finally {
    await context.close();
  }
});

/* Adds named public projects to the workspace doc so the Projects chips
   have distinguishable labels to click. */
async function addNamedProjects(client, slug, defs) {
  const got = await client.get(`/api/workspaces/${slug}`);
  if (got.status !== 200) throw new Error(`workspace GET failed with HTTP ${got.status}`);
  const doc = got.data.doc;
  const mkProject = ({ id, key, name }) => ({
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
  });
  doc.data.projects = [...(doc.data.projects || []), ...defs.map(mkProject)];
  doc.data.projOrder = [...(doc.data.projOrder || []), ...defs.map(d => d.id)];
  const put = await client.put(`/api/workspaces/${slug}`, { revision: got.data.revision, doc });
  if (put.status !== 200) throw new Error(`doc PUT failed with HTTP ${put.status}`);
}

/* The guest D-13 state [2026-11-11 round 3]: with the Guest role selected
   and ≠1 project the send button is disabled and the localized hint shows;
   the single-project picker is a radio row (A.invGuestProject REPLACES the
   pick — exactly one, never more), so picking one project re-enables the
   send and the pick cannot grow past one. */
async function assertGuestDisableHint(page, hint) {
  const role = page.locator('#inv-role');
  await role.selectOption({ label: 'Guest' });
  const submit = page.locator('#inv-submit');
  await expect(submit, 'send disabled with zero projects for a guest').toBeDisabled();
  await expect(page.getByText(hint), 'the localized hint is visible').toBeVisible();

  // Pick the first project: exactly one replaces the empty pick and the
  // send re-enables (disable+hint, never a clamp — picking is the fix).
  await page.locator('button[data-a="invGuestProject"]').first().click();
  await expect(submit, 'one project enables the send').toBeEnabled();
  await expect(page.getByText(hint)).toHaveCount(0);

  // Radio semantics: picking a second project REPLACES the first — still
  // exactly one, still enabled.
  await page.locator('button[data-a="invGuestProject"]').nth(1).click();
  await expect(submit, 'the pick replaces, never grows past one').toBeEnabled();
  const picked = await page.locator('button[data-a="invGuestProject"][aria-checked="true"]').count();
  expect(picked, 'exactly one project radio is checked').toBe(1);

  await role.selectOption({ label: 'Member' });
  await expect(submit, 'a non-guest role is never disabled by the guest rule').toBeEnabled();
}

test('guest role with zero projects disables send with an English hint; one project enables it (D-06, INVT-03)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'guest-en', 'Guest EN Owner', { locale: 'en', workspace: `guest-en-${run}` });
  await addNamedProjects(client, account.slug, [
    { id: 'p_guest_a', key: 'guest-a', name: 'Guest Alpha' },
    { id: 'p_guest_b', key: 'guest-b', name: 'Guest Bravo' },
  ]);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'en');
    await openInviteModal(page);
    await assertGuestDisableHint(page, 'Pick one project for the guest first.');
  } finally {
    await context.close();
  }
});

test('guest role with zero projects disables send with a French hint; one project enables it (D-06, INVT-03)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'guest-fr', 'Guest FR Owner', { locale: 'fr', workspace: `guest-fr-${run}` });
  await addNamedProjects(client, account.slug, [
    { id: 'p_guest_fr', key: 'guest-fr', name: 'Invité Alpha' },
    { id: 'p_guest_fr2', key: 'guest-fr2', name: 'Invité Bravo' },
  ]);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'fr');
    await openInviteModal(page);
    await assertGuestDisableHint(page, 'Choisissez d’abord un projet pour l’invité.');
  } finally {
    await context.close();
  }
});

test('the guest single-project pick feeds the invite scope: exactly one id rides the POST (INVT-02) [round 3]', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'chips', 'Chips Owner', { locale: 'en', workspace: `chips-${run}` });
  // Two named projects in the workspace doc, so the guest picker has
  // distinguishable labels to click.
  await addNamedProjects(client, account.slug, [
    { id: 'p_chips_a', key: 'chips-a', name: 'Chips Alpha' },
    { id: 'p_chips_b', key: 'chips-b', name: 'Chips Bravo' },
  ]);

  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'en');
    await openInviteModal(page);
    // [2026-11-11 round 3] the scope rides ONLY a Guest invite (D-13):
    // pick exactly one project through the radio row, then send.
    await page.locator('#inv-role').selectOption({ label: 'Guest' });
    await expect(page.getByText('Project the guest can see')).toBeVisible();
    await page.locator('button[data-a="invGuestProject"]').filter({ hasText: 'Chips Bravo' }).click();
    await expect(page.locator('#inv-submit')).toBeEnabled();

    const reqPromise = page.waitForRequest(r => r.url().endsWith('/invites') && r.method() === 'POST');
    await page.locator('#inv-emails').fill('chips-scope@example.com');
    await page.locator('#inv-submit').click();
    const req = await reqPromise;
    const body = req.postDataJSON();
    expect(body.scope?.projects, 'the picked project id rides the POST scope').toEqual(['p_chips_b']);
  } finally {
    await context.close();
  }
});
