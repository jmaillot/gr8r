/* =====================================================================
   TWO-TENANT UAT: proves workspace isolation in a real Chromium session.

   Fixtures come from the API (helpers/setup.mjs). Every visibility claim is
   asserted here, in the browser, with role/label/text selectors only — no
   CSS implementation details, no direct API assertions.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, setupTenants } from './helpers/setup.mjs';

let fixtures;

test.beforeAll(async () => {
  fixtures = await setupTenants(BASE_URL);
});

/* One browser context per account: its own cookies, never the other tenant's. */
async function signIn(browser, account) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: { 'x-forwarded-for': account.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
  return { context, page };
}

test('the owner signs in to Acme and opens its own project', async ({ browser }) => {
  const { context, page } = await signIn(browser, fixtures.accounts.owner);
  try {
    await expect(page).toHaveURL(new RegExp(`/w/${fixtures.slugs.acme}$`));

    await page.goto(`/w/${fixtures.slugs.acme}/project/${fixtures.keys.publicProject}`);
    await expect(page.getByRole('heading', { name: fixtures.keys.publicProjectName, level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("a foreign workspace slug falls back to the owner's own workspace", async ({ browser }) => {
  const { context, page } = await signIn(browser, fixtures.accounts.owner);
  try {
    await page.goto(`/w/${fixtures.slugs.beta}`);
    await expect(page).toHaveURL(new RegExp(`/w/${fixtures.slugs.acme}$`));
    await expect(page.getByRole('heading', { name: fixtures.keys.betaProjectName })).toHaveCount(0);

    await page.goto(`/w/${fixtures.slugs.acme}/project/${fixtures.keys.betaProject}`);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('tenant two sees Beta, and never the Acme document', async ({ browser }) => {
  const { context, page } = await signIn(browser, fixtures.accounts.tenant2);
  try {
    await expect(page).toHaveURL(new RegExp(`/w/${fixtures.slugs.beta}$`));

    await page.goto(`/w/${fixtures.slugs.beta}/project/${fixtures.keys.betaProject}`);
    await expect(page.getByRole('heading', { name: fixtures.keys.betaProjectName, level: 1 })).toBeVisible();

    /* Asking for Acme falls back to Beta and shows none of Acme's projects. */
    await page.goto(`/w/${fixtures.slugs.acme}`);
    await expect(page).toHaveURL(new RegExp(`/w/${fixtures.slugs.beta}$`));
    await expect(page.getByRole('heading', { name: fixtures.keys.publicProjectName })).toHaveCount(0);

    await page.goto(`/w/${fixtures.slugs.acme}/project/${fixtures.keys.publicProject}`);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('a private project is invisible to a member who is not on it, and reachable by its owner', async ({ browser }) => {
  /* Carol is a plain member of Acme and is not on Secret Roadmap. */
  const carol = await signIn(browser, fixtures.accounts.carol);
  try {
    const { page } = carol;
    await page.goto(`/w/${fixtures.slugs.acme}/project/${fixtures.keys.publicProject}`);
    await expect(page.getByRole('heading', { name: fixtures.keys.publicProjectName, level: 1 })).toBeVisible();

    /* Neither the workspace home (sidebar included) nor the project list names it. */
    await page.goto(`/w/${fixtures.slugs.acme}`);
    await expect(page.getByText(fixtures.keys.publicProjectName).first()).toBeVisible();
    await expect(page.getByText(fixtures.keys.privateProjectName)).toHaveCount(0);
    await page.getByRole('button', { name: 'Projects' }).first().click();
    await expect(page.getByText(fixtures.keys.publicProjectName).first()).toBeVisible();
    await expect(page.getByText(fixtures.keys.privateProjectName)).toHaveCount(0);

    /* The deep link answers the generic 404 and still leaks nothing. */
    await page.goto(`/w/${fixtures.slugs.acme}/project/${fixtures.keys.privateProject}`);
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
    await expect(page.getByText(fixtures.keys.privateProjectName)).toHaveCount(0);
  } finally {
    await carol.context.close();
  }

  /* The owner is on the project: the 404 above is caused by access, not a broken fixture. */
  const owner = await signIn(browser, fixtures.accounts.owner);
  try {
    await owner.page.goto(`/w/${fixtures.slugs.acme}/project/${fixtures.keys.privateProject}`);
    await expect(owner.page.getByRole('heading', { name: fixtures.keys.privateProjectName, level: 1 })).toBeVisible();
  } finally {
    await owner.context.close();
  }
});
