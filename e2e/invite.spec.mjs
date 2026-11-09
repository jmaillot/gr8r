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
   changes (each re-renders — the scope section is D-04-gated on Admin),
   a team chip toggle and a project chip toggle (each re-renders).
   Requires ≥1 project in the workspace so the Projects chip exists. */
async function interactAndSurvive(page) {
  await page.locator('#inv-emails').fill(`${EMAIL_ONE}, ${EMAIL_TWO}`);

  const role = page.locator('#inv-role');
  await role.selectOption({ label: 'Admin' });
  await role.selectOption({ label: 'Member' });

  await page.locator('button[data-a="invTeamToggle"]').first().click();
  await page.locator('button[data-a="invProjToggle"]').first().click();

  /* A settle window so a background poll re-render — if one fires — has
     its chance to wipe the unbound draft. */
  await page.waitForTimeout(600);

  const value = await page.locator('#inv-emails').inputValue();
  expect(value, 'the typed emails must survive every re-render').toContain(EMAIL_ONE);
  expect(value, 'the typed emails must survive every re-render').toContain(EMAIL_TWO);
}

test('typed invite emails survive role changes, team chip toggles and project chip toggles (EN) (INVT-01)', async ({ browser }) => {
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

/* The guest D-06 state: with the Guest role selected and ≠1 project the
   send button is disabled and the localized hint shows; selecting exactly
   one project re-enables the send. Chip toggles re-render, so the state
   re-evaluates on every toggle. */
async function assertGuestDisableHint(page, hint) {
  const role = page.locator('#inv-role');
  await role.selectOption({ label: 'Guest' });
  const submit = page.locator('#inv-submit');
  await expect(submit, 'send disabled with zero projects for a guest').toBeDisabled();
  await expect(page.getByText(hint), 'the localized hint is visible').toBeVisible();

  // Toggle the first PROJECT chip on, then off (multi-select preserved for
  // every role — the invalid state is disable+hint, never a clamp).
  await page.locator('button[data-a="invProjToggle"]').first().click();
  await expect(submit, 'one project enables the send').toBeEnabled();
  await expect(page.getByText(hint)).toHaveCount(0);

  await page.locator('button[data-a="invProjToggle"]').first().click();
  await expect(submit, 'deselecting the only project disables again').toBeDisabled();
  await expect(page.getByText(hint), 'the hint returns on the invalid state').toBeVisible();

  await role.selectOption({ label: 'Member' });
  await expect(submit, 'a non-guest role is never disabled by the guest rule').toBeEnabled();
}

test('guest role with zero projects disables send with an English hint; one project enables it (D-06, INVT-03)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'guest-en', 'Guest EN Owner', { locale: 'en', workspace: `guest-en-${run}` });
  await addNamedProjects(client, account.slug, [{ id: 'p_guest_a', key: 'guest-a', name: 'Guest Alpha' }]);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'en');
    await openInviteModal(page);
    await assertGuestDisableHint(page, 'Guests need exactly one project');
  } finally {
    await context.close();
  }
});

test('guest role with zero projects disables send with a French hint; one project enables it (D-06, INVT-03)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'guest-fr', 'Guest FR Owner', { locale: 'fr', workspace: `guest-fr-${run}` });
  await addNamedProjects(client, account.slug, [{ id: 'p_guest_fr', key: 'guest-fr', name: 'Invité Alpha' }]);
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await signIn(page, account, 'fr');
    await openInviteModal(page);
    await assertGuestDisableHint(page, 'Les invités ont besoin d’exactement un projet');
  } finally {
    await context.close();
  }
});

test('project chips feed the invite scope: toggling two project chips sends both ids (INVT-02)', async ({ browser }) => {
  const run = newRunId();
  const { account, client } = await createAccount(BASE_URL, run, 'chips', 'Chips Owner', { locale: 'en', workspace: `chips-${run}` });
  // Two named projects in the workspace doc, so the Projects chips have
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
    // The modal opens with the Admin role selected (the scope section is
    // D-04-gated on Admin); switch to Member to reveal the scope pickers.
    await page.locator('#inv-role').selectOption({ label: 'Member' });
    // The Projects chips row (scopeProjectsLabel) now lists PROJECTS, not teams.
    const projChips = page.locator('button[data-a="invProjToggle"]');
    await expect(page.getByText('Projects they can see')).toBeVisible();
    await projChips.filter({ hasText: 'Chips Alpha' }).click();
    await projChips.filter({ hasText: 'Chips Bravo' }).click();

    const reqPromise = page.waitForRequest(r => r.url().endsWith('/invites') && r.method() === 'POST');
    await page.locator('#inv-emails').fill('chips-scope@example.com');
    await page.locator('#inv-submit').click();
    const req = await reqPromise;
    const body = req.postDataJSON();
    const ids = (body.scope?.projects || []).sort();
    expect(ids, 'both toggled project ids ride the POST scope').toEqual(['p_chips_a', 'p_chips_b']);
  } finally {
    await context.close();
  }
});
