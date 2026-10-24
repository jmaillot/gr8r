/* =====================================================================
   PHASE 11 DEMO-MODE PROOF (D-11, UAT-10 criterion 3): the BUILT demo —
   dist/ served by `vite preview` with NO API behind it — renders French
   for a fr-preferring browser, and the phase-8 language selector's choice
   survives a reload through the localStorage path (LOCALE_STORAGE_KEY).

   No API server exists in this run: `vite preview` does not proxy /api
   (the proxy lives in vite.config.js's dev `server` block only), so
   /api/config 404s and the client falls back to local demo mode
   (DEPLOY.md §12). The main suite's en-US pin lives in
   e2e/playwright.config.mjs and stays there — this config deliberately
   pins nothing, because anonymous demo surfaces negotiate the language
   from the browser (the 10-02 exception pattern).

   Markers come from the fr catalogue via fmt() — never a hardcoded
   transcription (10-REVIEW WR-01). One fresh browser context per
   scenario: localStorage is per-origin and read at boot, so the two
   scenarios must never share storage.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };
import frCatalogue from '../src/locales/fr.json' with { type: 'json' };

/* Interpolate a catalogue value with the same {name}/{n} subset t() uses —
   asserted strings are read from the catalogue, never transcribed. */
function fmt(key, vars, lang = 'fr') {
  let s = { en, fr: frCatalogue }[lang][key];
  if (s === undefined) throw new Error(`catalogue key missing in ${lang}: ${key}`);
  if (typeof s === 'object') s = s[new Intl.PluralRules(lang).select(vars?.n ?? 1)] ?? s.other;
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/* The demo actually booted (not a server-error or sign-in page): the shell's
   content root is rendered and the language marker matches the catalogue. */
async function demoBootedIn(page, lang, route = 'home') {
  await expect(page.locator('.content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
  /* The document title is catalogue-driven on every workspace route
     (shell/render.js pageTitle: `${routeName(route)} · ${ws.name}`) — a blank
     or error page cannot carry it. The route key follows the app's own
     navigation because the language switch re-renders in place on Settings. */
  await expect.poll(() => page.title()).toContain(fmt(`nav.route.${route}`, undefined, lang));
}

/* These tests are only meaningful when NO API sits behind the origin: the
   demo fallback fires on /api/config failure. The main suite's config
   (e2e/playwright.config.mjs) serves the app WITH its API, so when this spec
   is picked up by a config that has an API behind it, skip — don't fail.
   Probe status-based: the real API answers /api/config < 500; a dead proxy
   target answers 5xx or refuses the connection (request throws). */
test.beforeEach(async ({ request }) => {
  let apiPresent = false;
  try {
    const res = await request.get('/api/config');
    apiPresent = res.status() < 500;
  } catch {
    apiPresent = false;
  }
  test.skip(apiPresent, 'an API is reachable behind this origin — demo mode cannot fire; run e2e/demo.playwright.config.mjs instead');
});

test('demo mode renders French for a fr-preferring browser with no API server', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR' });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await demoBootedIn(page, 'fr');
    /* A catalogue-read French marker in the shell itself: the sidebar's
       projects entry (nav.projects) is fr-only vocabulary. */
    await expect(page.getByRole('button', { name: fmt('nav.projects') }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

test('the demo language switch persists across a reload through localStorage', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'fr-FR' });
  try {
    const page = await context.newPage();
    await page.goto('/');
    await demoBootedIn(page, 'fr');

    /* The phase-8 language selector on the settings page: the page opens on
       the Apparence section, so enter the Langue section first. Switching to
       English stores the choice under LOCALE_STORAGE_KEY (api is disabled in
       demo mode, so storeLocale is the persistence path — actions.js IN.langSel). */
    await page.getByRole('button', { name: fmt('nav.route.settings') }).click();
    await page.getByRole('button', { name: fmt('settings.language.title') }).click();
    /* The design-system select (src/ui/select.js) enhances the native <select>
       into a trigger button + role=listbox menu — the native control is
       aria-hidden, so drive the real UI: open the trigger, pick the option
       whose label the registry gives to code 'en' (label read from the DOM,
       never transcribed). */
    await page.locator('.set-body .select-btn').click();
    const enLabel = await page.evaluate(
      () => [...document.querySelectorAll('select[data-in="langSel"] option')].find(o => o.value === 'en')?.text,
    );
    if (!enLabel) throw new Error('no en option in the language select');
    await page.getByRole('option', { name: enLabel }).click();
    await demoBootedIn(page, 'en', 'settings');

    /* The proof: a reload re-negotiates fr-FR from the browser, but the
       stored choice wins (main.js: readStoredLocale() || negotiated). */
    await page.reload();
    await demoBootedIn(page, 'en');
  } finally {
    await context.close();
  }
});
