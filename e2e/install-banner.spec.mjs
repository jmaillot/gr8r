/* =====================================================================
   PHASE 73 INSTALL BANNER (plan 73-02, PWA-04 crit 1–3): the whole
   Chromium journey in a real browser, plus the iOS path's runtime
   reachability.

   STUB CONTRACT: the real beforeinstallprompt event never fires in
   Playwright (no install criteria are met in headless Chromium, and no
   user gesture precedes it) — so it is stubbed with page.addInitScript:
   an Event named 'beforeinstallprompt' whose prompt() sets
   window.__bipPrompted = true (a test-only marker that lives ONLY in this
   spec, never in src/) and whose userChoice resolves { outcome:
   'accepted' }, dispatched ~150 ms after load. The iOS scenario is the
   inverse proof: a faked navigator (iPhone UA) with NO stubbed event —
   the boot-time checkIos() call wired in plan 01 must render the static
   iosHint strip with no Install button, entirely on its own (D-06,
   runtime reachability — not just a unit seam).

   Shape follows e2e/manifest.spec.mjs (header contract, webServer fixture
   booting e2e/server.mjs on built dist) and reuses the phase-62 Settings
   helpers (e2e/helpers/setup.mjs) for the real EN→FR language switch —
   the same demo-locale switching journey, through the account-locale
   PATCH path that the API-backed main suite uses. One fresh browser
   context per scenario via the standard `page` fixture; every account is
   throwaway with a run-unique client address (per-IP throttle safety).
   ===================================================================== */
import { test, expect } from '@playwright/test';
import en from '../src/locales/en.json' with { type: 'json' };
import frCatalogue from '../src/locales/fr.json' with { type: 'json' };
import { BASE_URL, createAccount, newRunId, openSettings, selectLanguage } from './helpers/setup.mjs';

/* The stub, exactly as PATTERNS.md specifies: prompt() records the
   side-effect marker and resolves accepted. */
const BIP_STUB = `
  const ev = new Event('beforeinstallprompt');
  ev.prompt = () => {
    ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.__bipPrompted = true;
  };
  ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  setTimeout(() => { window.__bipDispatched = true; window.dispatchEvent(ev); }, 150);
`;

/* iOS navigator fakery: override the UA on the Navigator prototype inside
   the init script (configurable, init-script timing) — no event is
   dispatched in this scenario, ever. */
const IOS_UA_INIT = `
  Object.defineProperty(Navigator.prototype, 'userAgent', {
    value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    configurable: true,
  });
`;

const EN_CTA = en['pwa.install.cta'];
const FR_CTA = frCatalogue['pwa.install.cta'];
const EN_HINT = en['pwa.install.iosHint'];
const DISMISS_LABEL = en['a11y.dismiss'];

/* Sign in through the real UI into a fresh throwaway account + workspace.
   The banner's canShow() guard suppresses the strip on the login screen
   (D-03), so the stubbed event may only be dispatched AFTER sign-in —
   tests install the addInitScript and reload once the workspace has
   booted. */
async function signIn(page, tag, run) {
  const { account } = await createAccount(BASE_URL, run, tag, `Banner ${tag}`, { workspace: `bnr-${tag}-${run}` });
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
  await expect(page.locator('.content')).toBeVisible();
  return account;
}

/* ---------- 1. EN: strip → native prompt triggered (stub marker) ---------- */

test('the stubbed beforeinstallprompt shows the strip with EN text and the Install click triggers the prompt', async ({ page }) => {
  const run = newRunId();
  await signIn(page, 'en', run);

  /* install the stub only now — the reload boots straight into the signed-in
     workspace and dispatches the event ~150 ms after load */
  await page.addInitScript(BIP_STUB);
  await page.reload();

  const strip = page.locator('.install-banner');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.grow')).toHaveText(EN_CTA);
  await expect(strip.locator('button.install-cta')).toHaveText(EN_CTA);

  await strip.locator('button.install-cta').click();
  await expect.poll(() => page.evaluate(() => window.__bipPrompted), { timeout: 5_000 }).toBe(true);
  /* the native-prompt gesture hides the strip (accepted outcome, D-04) */
  await expect(strip).toBeHidden();
});

/* ---------- 2. dismissal persistence: cooldown survives a reload ---------- */

test('dismissing the strip persists the cooldown and suppresses re-render across a reload', async ({ page }) => {
  const run = newRunId();
  await signIn(page, 'dsm', run);

  await page.addInitScript(BIP_STUB);
  await page.reload();
  const strip = page.locator('.install-banner');
  await expect(strip).toBeVisible();

  await strip.getByRole('button', { name: DISMISS_LABEL }).click();
  await expect(strip).toBeHidden();
  const stored = await page.evaluate(() => localStorage.getItem('pwa.installDismissedAt'));
  expect(Number(stored)).toBeGreaterThan(0);

  /* the stub re-dispatches a fresh event after the reload too — the persisted
     14-day cooldown must beat it (Pitfall 3) */
  await page.reload();
  await expect(strip).toBeHidden({ timeout: 3_000 });
  /* wait out the stub's 150 ms dispatch so the suppression is proven against
     a genuinely re-fired event, not an empty early frame */
  await expect.poll(() => page.evaluate(() => window.__bipDispatched === true), { timeout: 3_000 }).toBe(true);
});

/* ---------- 3. FR: locale switch before the event dispatch ---------- */

test('after switching the language to FR the strip shows the FR catalogue string', async ({ page }) => {
  const run = newRunId();
  await signIn(page, 'fr', run);

  /* the real EN→FR switch: Settings → Language tab → the design-system select
     (phase-62 helpers; the write path is the account-locale PATCH) */
  await openSettings(page, { tab: 'language' });
  const patch = await selectLanguage(page, 'fr');
  expect(patch.status()).toBe(200);

  /* switch BEFORE installing the stub: the reload boots in French and only
     then dispatches the event */
  await page.addInitScript(BIP_STUB);
  await page.reload();

  const strip = page.locator('.install-banner');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.grow')).toHaveText(FR_CTA);
  await expect(strip.locator('button.install-cta')).toHaveText(FR_CTA);
});

/* ---------- 4. iOS runtime reachability (D-06): no stubbed event at all ---------- */

test('a faked iOS navigator renders the boot-time iosHint strip with no Install button and no prompt', async ({ page }) => {
  const run = newRunId();
  await signIn(page, 'ios', run);

  /* fake the navigator, dispatch NOTHING — the strip can only come from the
     boot-time bannerMod().then(m => m.checkIos()) call wired in plan 01 */
  await page.addInitScript(IOS_UA_INIT);
  await page.reload();

  const strip = page.locator('.install-banner');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.grow')).toHaveText(EN_HINT);
  await expect(strip.locator('button.install-cta')).toHaveCount(0);
  await expect(strip.locator('button.ibtn-xs')).toHaveCount(1); /* the dismiss X is still present */
  const prompted = await page.evaluate(() => window.__bipPrompted);
  expect(prompted, 'no prompt ever triggered on the iOS path').toBeUndefined();
});
