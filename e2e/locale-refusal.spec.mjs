/* =====================================================================
   PHASE 77 LOCALE-REFUSAL PROOF (MAINT-02 / SC2, D-77-4..7): the signup
   DP-1 refusal renders correctly in nl, de and es in the REAL built app.

   Per locale: a throwaway account signs in, switches the interface through
   the real write path (selectLanguage → PATCH /api/auth/me, phase-62
   helpers), signs out — the anonymous surfaces then negotiate from the
   browser context's own locale (D-10: the account is gone, its locale
   with it) — opens the signup view, submits an email OUTSIDE the run-wide
   ALLOW_SIGNUP_DOMAINS=e2e.local gate (server.js DP-1), and asserts the
   inline form-field error (span.err#email-err, the ferr('email') surface
   in src/pages/auth.js — NOT a toast; D-77-5's wording owner-reconciled
   2026-11-19 to this render surface).

   D-77-6 reconciliation (OWNER DECISION, 2026-11-19): err.signupDomainNotAllowed
   is a static catalogue string on the signup path with NO placeholder, so
   placeholder parity = the rendered text equals the imported catalogue
   entry EXACTLY (D-77-7 full-string equality — the strongest available
   cross-check, and trivially subsumes "no raw {token} tokens remain").
   Pitfall-5 guard: a missing key would fall back to the English server
   message and fail this exact-match assert, so the equality IS the
   catalogue-existence proof too.

   The catalogues are imported directly (D-77-7) — no duplicated string
   table. Only the signup DP-1 flow is exercised (D-77-5): no invite-create,
   invite-accept or SSO paths.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, createAccount, newRunId, openSettings, selectLanguage } from './helpers/setup.mjs';
import nl from '../src/locales/nl.json' with { type: 'json' };
import de from '../src/locales/de.json' with { type: 'json' };
import es from '../src/locales/es.json' with { type: 'json' };

/* The refusal key under test — the same one the server's fail() code maps
   through tErr on the client (src/core/api.js → src/core/i18n.js). */
const REFUSAL_KEY = 'err.signupDomainNotAllowed';
for (const [lang, cat] of [['nl', nl], ['de', de], ['es', es]]) {
  test.expect(typeof cat[REFUSAL_KEY], `${lang} catalogue carries ${REFUSAL_KEY}`).toBe('string');
}

const CATALOGUES = { nl, de, es };

let run;
let accounts;

test.beforeAll(async () => {
  run = newRunId();
  /* One throwaway account per locale, created through the real API with its
     own run-unique client address (the suite's throttle-dodge convention).
     Locale is deliberately NOT set at creation: the switch below must be the
     spec's own act (selectLanguage), not a fixture property. */
  accounts = {
    nl: (await createAccount(BASE_URL, run, 'refusal-nl', 'Refusal NL Reader', { workspace: `refusal-nl-${run}` })).account,
    de: (await createAccount(BASE_URL, run, 'refusal-de', 'Refusal DE Reader', { workspace: `refusal-de-${run}` })).account,
    es: (await createAccount(BASE_URL, run, 'refusal-es', 'Refusal ES Reader', { workspace: `refusal-es-${run}` })).account,
  };
});

/* One browser context per locale: the context's negotiated locale is what
   the ANONYMOUS signup form renders in after sign-out (D-10 fallback), so it
   must match the language the account was switched to. The account's own IP
   rides the extra header so the per-IP throttles never cross accounts. */
async function signInSwitchAndSignOut(browser, lang) {
  const account = accounts[lang];
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: `${lang}-${lang.toUpperCase()}`,
    extraHTTPHeaders: { 'x-forwarded-for': account.ip },
  });
  const page = await context.newPage();
  const cat = CATALOGUES[lang];

  /* Anonymous boot negotiates the context locale → the login form renders
     in that language; labels come from the imported catalogue, never
     transcribed. */
  await page.goto('/');
  await page.getByLabel(cat['common.email']).fill(account.email);
  await page.getByLabel(cat['common.password'], { exact: true }).fill(account.password);
  await page.getByRole('button', { name: cat['page.auth.signIn'] }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));

  /* THE switch under test: through the shared helpers — openSettings owns
     the lazy-chunk wait, selectLanguage the trigger click and the PATCH
     /api/auth/me wait (D-08: the real write path, no reload, no
     localStorage hack). The context locale pre-negotiated `lang`, and the
     select shows the negotiated value when the account locale is null —
     clicking the current option fires no change, so first move OFF it
     (a real switch to en, PATCH awaited), then perform the switch under
     test to `lang`: a genuine change event and a genuine account write. */
  await openSettings(page, { tab: 'language' });
  const primed = await selectLanguage(page, 'en');
  expect(primed.status(), 'the priming locale write failed').toBe(200);
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');
  const saved = await selectLanguage(page, lang);
  expect(saved.status(), 'the account locale write failed').toBe(200);
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);

  /* Sign out: the account locale dies with the account (D-10) and the
     anonymous surfaces negotiate from the context — which is the same
     language, so the signup form below renders in `lang`. */
  await page.getByRole('button', { name: cat['a11y.accountMenu'] }).click();
  await page.getByRole('button', { name: cat['palette.signOut'] }).click();
  await expect(page.getByLabel(cat['common.password'], { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
  return { context, page, cat };
}

for (const lang of ['nl', 'de', 'es']) {
  test(`signup DP-1 refusal renders the ${lang} catalogue entry exactly (MAINT-02/SC2)`, async ({ browser }) => {
    const { context, page, cat } = await signInSwitchAndSignOut(browser, lang);
    try {
      /* The signup view: the login form's own "Sign up" affordance. */
      await page.getByRole('button', { name: cat['page.auth.signUp'] }).click();
      await expect(page.getByRole('button', { name: cat['page.auth.createAccount'] })).toBeVisible();

      /* A genuinely out-of-domain email: the run-wide env admits only
         @e2e.local, so this submit must hit the DP-1 gate (server.js
         signupDomainNotAllowed). */
      await page.getByLabel(cat['common.fullName']).fill('Refusal Probe');
      await page.getByLabel(cat['page.auth.workEmail']).fill(`rejected-${run}-${lang}@forbidden.example`);
      await page.getByLabel(cat['common.password'], { exact: true }).fill(PASSWORD);
      await page.getByRole('button', { name: cat['page.auth.createAccount'] }).click();

      /* THE assertion (D-77-6 reconciliation + D-77-7): the inline
         form-field error — the ferr('email') span (aria-describedby
         email-err in src/pages/auth.js) — equals the imported catalogue
         entry EXACTLY. Full-string equality; any fallback (Pitfall 5:
         English server message) or raw token fails. */
      await expect(page.locator('#email-err')).toHaveText(cat[REFUSAL_KEY]);
    } finally {
      await context.close();
    }
  });
}
