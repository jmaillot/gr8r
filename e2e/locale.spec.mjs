/* =====================================================================
   PHASE 8 BROWSER PROOF (LOC-01, LOC-03, LOC-06): the interface language
   is a per-account property, negotiated from the browser before the first
   paint, switchable without a reload, and durable across reload, sign-out
   and sign-in. Two members of one workspace see their own languages.

   Conventions follow the rest of the suite: role/label/text selectors for
   every visibility claim, one browser context per account, fixtures only
   through the real API (helpers/setup.mjs). Every account here is
   throwaway and owns a run-unique client address, so the per-IP throttles
   never fail a second run and nothing leaks into the English-pinned
   tenancy suite.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, newRunId } from './helpers/setup.mjs';

let run;
let alice; // workspace owner, account locale 'fr'
let bob; // member of alice's workspace, account locale 'en'
let carol; // her own workspace, account locale NULL until she chooses

async function createAccount(tag, name, { locale, workspace } = {}) {
  const account = { email: `${tag}-${run}@e2e.local`, password: PASSWORD, name, ip: clientIp(run, tag), slug: workspace };
  const client = apiClient(BASE_URL, { name: tag, ip: account.ip });
  const signup = await client.post('/api/auth/signup', { name, email: account.email, password: account.password });
  if (signup.status !== 201) throw new Error(`${tag} signup failed with HTTP ${signup.status}: ${signup.data?.error || ''}`);
  if (workspace) {
    const ws = await client.post('/api/workspaces', { name: `Locale ${tag} ${run}`, slug: workspace });
    if (ws.status !== 201) throw new Error(`${tag} workspace failed with HTTP ${ws.status}: ${ws.data?.error || ''}`);
  }
  if (locale) {
    const patched = await client.patch('/api/auth/me', { locale });
    if (patched.status !== 200) throw new Error(`${tag} locale failed with HTTP ${patched.status}: ${patched.data?.error || ''}`);
  }
  return { account, client };
}

test.beforeAll(async () => {
  run = newRunId();
  const a = await createAccount('alice', 'Alice Locale', { locale: 'fr', workspace: `loc-${run}` });
  alice = a.account;
  const b = await createAccount('bob', 'Bob Locale', { locale: 'en' });
  bob = { ...b.account, slug: alice.slug };
  const invite = await a.client.post(`/api/workspaces/${alice.slug}/invites`, { emails: [bob.email], role: 'member' });
  if (invite.status !== 201) throw new Error(`bob invite failed with HTTP ${invite.status}: ${invite.data?.error || ''}`);
  const url = String(invite.data.invites[0].url);
  const token = url.slice(url.lastIndexOf('/join/') + '/join/'.length);
  const accepted = await b.client.post(`/api/invites/${token}/accept`, {});
  if (![200, 201].includes(accepted.status)) throw new Error(`bob accept failed with HTTP ${accepted.status}`);
  const c = await createAccount('carol', 'Carol Locale', { workspace: `carol-${run}` });
  carol = c.account;
});

/* The login form in either language; the context's locale decides which one renders. */
const LOGIN = {
  en: { email: 'Email', password: 'Password', submit: 'Sign in' },
  fr: { email: 'E-mail', password: 'Mot de passe', submit: 'Se connecter' },
};

async function newContext(browser, account, locale) {
  return browser.newContext({ baseURL: BASE_URL, locale, extraHTTPHeaders: { 'x-forwarded-for': account.ip } });
}

async function signInPage(page, account, form) {
  await page.goto('/');
  await page.getByLabel(form.email).fill(account.email);
  await page.getByLabel(form.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: form.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

/* Records every language the first paints ever showed. The observer is installed before any
   page script runs, so a flash of the wrong language — however brief — is caught. */
async function recordPaints(context, wrong) {
  await context.addInitScript(words => {
    window.__flash = [];
    const look = () => {
      const text = document.body ? document.body.innerText : '';
      for (const w of words) if (text.includes(w) && !window.__flash.includes(w)) window.__flash.push(w);
    };
    new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
  }, wrong);
}

const flashed = page => page.evaluate(() => window.__flash);

test('a French browser sees the unauthenticated surfaces in French on first paint (D-08, LOC-06)', async ({ browser }) => {
  const context = await newContext(browser, alice, 'fr-FR');
  await recordPaints(context, ['Welcome back', 'Sign in', 'Email']);
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByText('Bon retour')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
    expect(await flashed(page), 'English painted before the negotiated French').toEqual([]);
    /* No workspace shell ever painted for an anonymous visitor. */
    await expect(page.locator('.side')).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test('a signed-in account boots in its own language from the first paint, whatever the browser says (LOC-03, LOC-06)', async ({ browser }) => {
  const context = await newContext(browser, alice, 'en-US');
  const page = await context.newPage();
  try {
    await signInPage(page, alice, LOGIN.en);
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');

    /* A fresh load: from here on no English word may ever paint. */
    await recordPaints(context, ['Projects', 'My tasks', 'Welcome back']);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await flashed(page), 'English painted before the account language').toEqual([]);
  } finally {
    await context.close();
  }
});

test('the selector switches the interface instantly without a reload and the choice survives reload, sign-out and sign-in (LOC-01, LOC-03)', async ({ browser }) => {
  const context = await newContext(browser, carol, 'en-US');
  const page = await context.newPage();
  try {
    await signInPage(page, carol, LOGIN.en);
    await expect(page.getByRole('button', { name: 'Projects' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Language', level: 1 })).toBeVisible();

    /* The honest selector: exactly two options, each in its own name, the negotiated
       language shown as selected while the account has not chosen (D-13, D-14). */
    const language = page.getByRole('button', { name: 'Language', exact: true, expanded: false });
    await expect(language).toContainText('English');
    await language.click();
    await expect(page.getByRole('option')).toHaveText(['English', 'Français']);

    await page.evaluate(() => {
      window.__survived = 'no-reload';
    });
    const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
    await page.getByRole('option', { name: 'Français' }).click();

    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
    await expect(page.getByRole('heading', { name: 'Langue', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__survived), 'the switch re-rendered in place').toBe('no-reload');

    /* Loop safety: after the switch the interface settles. */
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__mutations = 0;
      new MutationObserver(entries => {
        window.__mutations += entries.length;
      }).observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, characterData: true });
    });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => window.__mutations), 'the interface keeps re-rendering after the switch (render loop)').toBe(0);

    /* LOC-03: the account write answered, a reload keeps French. */
    expect((await saved).status(), 'the account locale write failed').toBe(200);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');

    /* Sign-out falls back to the negotiated language (D-10); sign-in brings the account's back. */
    await page.getByRole('button', { name: 'Menu du compte' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await expect(page.getByText('Welcome back')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('en');
    await signInPage(page, carol, LOGIN.en);
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('fr');
  } finally {
    await context.close();
  }
});

test('two members of one workspace each see the interface in their own language (the phase deliverable)', async ({ browser }) => {
  /* Alice's browser says English and her account says French; Bob's browser says French and
     his account says English. The account wins in both, in the same workspace, at once. */
  const aliceCtx = await newContext(browser, alice, 'en-US');
  const bobCtx = await newContext(browser, bob, 'fr-FR');
  const alicePage = await aliceCtx.newPage();
  const bobPage = await bobCtx.newPage();
  try {
    await signInPage(alicePage, alice, LOGIN.en);
    await signInPage(bobPage, bob, LOGIN.fr);

    await expect(alicePage.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    await expect(bobPage.getByRole('button', { name: 'Projects' }).first()).toBeVisible();
    expect(await alicePage.evaluate(() => document.documentElement.lang)).toBe('fr');
    expect(await bobPage.evaluate(() => document.documentElement.lang)).toBe('en');

    /* Bob's language never leaked into Alice's view, even after both reload. */
    await alicePage.reload();
    await bobPage.reload();
    await expect(alicePage.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    await expect(bobPage.getByRole('button', { name: 'Projects' }).first()).toBeVisible();
  } finally {
    await aliceCtx.close();
    await bobCtx.close();
  }
});
