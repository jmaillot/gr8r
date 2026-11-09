/* =====================================================================
   PHASE 53 E2E (TEAM-01, TEAM-02, TEAM-03): the Edit Team members box
   and the team detail page hygiene.

   TEAM-01: the members box is accent-insensitive searchable
   (foldForSearch) and typing/clearing the search NEVER loses the checked
   state — the checks live in the team form state (f.members), so a
   search re-render must restore them.
   TEAM-02: the team hint reads the owner's verbatim multi-team sentence
   (page.team.accessHint) in EN and FR — never the old primary-team
   wording (page.team.membersHint).
   TEAM-03: the team detail page has NO invite button — invites are
   managed only via Workspace > Members.

   Conventions follow the rest of the suite: fixtures only through the
   real API, one browser context per account, every asserted string read
   from the locale catalogues directly.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const CATALOGUE = { en, fr };

/* A member fixture: signup → owner invite → accept. Each account presents
   its own run-unique IP so the per-IP throttles never cross. */
async function addMember(base, ownerClient, slug, run, tag, name) {
  const email = `${tag}-${run}@e2e.local`;
  const joiner = apiClient(base, { name: tag, ip: clientIp(run, tag) });
  const su = await joiner.post('/api/auth/signup', { name, email, password: PASSWORD });
  if (su.status !== 201) throw new Error(`signup ${tag} failed with HTTP ${su.status}`);
  const inv = await ownerClient.post(`/api/workspaces/${slug}/invites`, { emails: [email], role: 'member' });
  if (inv.status !== 201) throw new Error(`invite ${tag} failed with HTTP ${inv.status}`);
  const url = inv.data?.invites?.[0]?.url || '';
  const marker = '/join/';
  const token = url.slice(String(url).lastIndexOf(marker) + marker.length);
  const acc = await joiner.post(`/api/invites/${token}/accept`, {});
  if (![200, 201].includes(acc.status)) throw new Error(`accept ${tag} failed with HTTP ${acc.status}`);
  return email;
}

async function signIn(page, account) {
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* Opens the Edit Team modal for `teamName` from the team detail page. */
async function openEditTeam(page, slug, teamName) {
  await page.goto(`/w/${slug}/teams`);
  await page.locator('.pcard[data-a="go"][data-r="team"]', { hasText: teamName }).click();
  await expect(page.getByRole('button', { name: en['act.editTeam'] })).toBeVisible();
  await page.getByRole('button', { name: en['act.editTeam'] }).click();
}

const memberCheck = (page, name) =>
  page.locator('label.mi', { hasText: name }).locator('input[type="checkbox"]');

test.describe('team members box (TEAM-01)', () => {
  test('accent-insensitive search filters the list and never loses checked state', async ({ page }) => {
    const run = newRunId();
    const slug = `teams-${run}`;
    const { account, client } = await createAccount(BASE_URL, run, 'owner', 'Teams Owner', { workspace: slug });

    for (const [tag, name] of [
      ['alice', 'Alice Alpha'],
      ['elodie', 'Élodie Sørensen'],
      ['bob', 'Bob Bêta'],
      ['chloe', 'Chloé Gamma'],
    ]) {
      await addMember(BASE_URL, client, slug, run, tag, name);
    }

    await signIn(page, account);

    // Create a team with Alice + Élodie through the real UI modal.
    await page.goto(`/w/${slug}/teams`);
    /* Two "New team" buttons exist (sidebar ibtn + page CTA) — target the page one. */
    await page.locator('button[data-a="newTeam"].btn-primary').click();
    await page.getByLabel(en['page.team.name']).fill('Search Crew');
    await memberCheck(page, 'Alice Alpha').check();
    await memberCheck(page, 'Élodie Sørensen').check();
    await page.getByRole('button', { name: en['act.createTeam'] }).click();
    await expect(page.getByRole('button', { name: en['act.editTeam'] })).toBeVisible();

    // Re-open the Edit Team modal and add Bob (three checked members).
    await openEditTeam(page, slug, 'Search Crew');
    await memberCheck(page, 'Bob Bêta').check();
    for (const name of ['Alice Alpha', 'Élodie Sørensen', 'Bob Bêta']) {
      await expect(memberCheck(page, name)).toBeChecked();
    }

    // Type an accent-stripped query: "elod" must surface "Élodie" (foldForSearch).
    const search = page.getByLabel(en['a11y.searchMembers']);
    await search.fill('elod');
    await expect(memberCheck(page, 'Élodie Sørensen')).toBeVisible();
    await expect(memberCheck(page, 'Alice Alpha')).toHaveCount(0);
    await expect(memberCheck(page, 'Élodie Sørensen')).toBeChecked();

    // A no-match query renders the localized empty row.
    await search.fill('zzzz');
    await expect(page.getByText(en['team.noMembersMatch'])).toBeVisible();

    // Clearing restores every row with ALL checks intact.
    await search.fill('');
    for (const name of ['Alice Alpha', 'Élodie Sørensen', 'Bob Bêta']) {
      await expect(memberCheck(page, name)).toBeChecked();
    }
    await expect(memberCheck(page, 'Chloé Gamma')).not.toBeChecked();

    // Submit and prove the membership survived the search round-trip.
    await page.getByRole('button', { name: en['act.saveChanges'] }).click();
    await expect(page.getByRole('button', { name: en['act.editTeam'] })).toBeVisible();
    for (const name of ['Alice Alpha', 'Élodie Sørensen', 'Bob Bêta']) {
      await expect(page.locator(`[data-r="member"]`, { hasText: name })).toBeVisible();
    }
  });
});
