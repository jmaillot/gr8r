/* =====================================================================
   PHASE 53 E2E (INVT-01): the invite email draft survives every
   interaction that re-renders the modal — role changes, team chip
   toggles, project chip toggles, and background state re-renders.

   The textarea carries data-in="inviteDraft" (silent-state binding): the
   handler mutates S.ui.inviteDraft and NEVER calls render(), so the full
   re-renders that chip toggles and role changes trigger restore the
   typed emails from state. Proven in English and French.

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

/* The full interaction sequence that used to wipe the draft: two role
   changes (each re-renders — the scope section is D-04-gated on Admin),
   a team chip toggle and a project chip toggle (each re-renders). */
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
  const { account } = await createAccount(BASE_URL, run, 'draft-en', 'Draft EN Owner', { locale: 'en', workspace: `draft-en-${run}` });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'en-US', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByLabel('Email').fill(account.email);
    await page.getByLabel('Password', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));

    await openInviteModal(page);
    await expect(page.getByText('Email addresses')).toBeVisible();
    await interactAndSurvive(page);
  } finally {
    await context.close();
  }
});

test('typed invite emails survive the same interactions in French (INVT-01)', async ({ browser }) => {
  const run = newRunId();
  const { account } = await createAccount(BASE_URL, run, 'draft-fr', 'Draft FR Owner', { locale: 'fr', workspace: `draft-fr-${run}` });
  const context = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR', extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await page.getByLabel('E-mail').fill(account.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));

    await openInviteModal(page);
    await expect(page.getByText('Adresses e-mail')).toBeVisible();
    await interactAndSurvive(page);
  } finally {
    await context.close();
  }
});
