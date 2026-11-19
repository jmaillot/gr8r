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
   'accepted' }. TWO dispatch orderings are exercised (plan 73-03):

   1. Delayed post-hydration dispatch (BIP_STUB, scenarios 1-3): the event
      lands ~150 ms after load, well past /api/boot hydration — the settled
      ordering, easy to stub but not the one production Chromium races.

   2. rAF-timed pre-hydration dispatch (BIP_PRE_HYDRATION_STUB, scenario 5):
      the init script schedules the dispatch with requestAnimationFrame —
      ZERO setTimeout, no wall-clock delay. A synchronous document-start
      dispatch would be structurally lost: Playwright init scripts run
      BEFORE any page script, so the event would fire before src/main.js
      registers its beforeinstallprompt listener (module-eval time) and
      nothing would ever receive it. And a bare document-start rAF fires
      before the listener too here: the deferred module script is fetched
      over the network and first paint precedes its evaluation. So the
      stub dispatches on the first rAF AFTER the app's listener
      registration (via an addEventListener patch) — still before
      /api/boot hydration resolves (a network fetch pending across the
      first frames) — exactly the race window CR-01 concerns, the same
      one checkIos's 300-frame budget documents.

   The iOS scenario is the inverse proof: a faked navigator (iPhone UA) with
   NO stubbed event — the boot-time checkIos() call wired in plan 01 must
   render the static iosHint strip with no Install button, entirely on its
   own (D-06, runtime reachability — not just a unit seam).

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

/* The PRE-HYDRATION stub (plan 73-03, WR-03/CR-01): identical to BIP_STUB
   except the dispatch timing — ZERO setTimeout, no wall-clock delay. A
   synchronous document-start dispatch would be structurally lost (init
   scripts run before any page script), and a bare document-start rAF fires
   BEFORE the listener too in this app: the deferred module script is
   fetched over the network and first paint precedes its evaluation
   (measured: rAF dispatch → listener registration, probe evidence
   73-03). So the stub patches addEventListener and dispatches on the first
   rAF AFTER main.js registers its beforeinstallprompt listener — still
   before /api/boot hydration resolves (the fetch is pending across the
   first frames). That is exactly the race window CR-01 concerns, the same
   one checkIos's 300-frame budget documents. */
const BIP_PRE_HYDRATION_STUB = `
  const orig = EventTarget.prototype.addEventListener;
  const ev = new Event('beforeinstallprompt');
  ev.prompt = () => {
    ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
    window.__bipPrompted = true;
  };
  ev.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
  let fired = false;
  EventTarget.prototype.addEventListener = function (type, ...rest) {
    if (this === window && type === 'beforeinstallprompt' && !fired) {
      fired = true;
      EventTarget.prototype.addEventListener = orig;
      requestAnimationFrame(() => { window.__bipDispatched = true; window.dispatchEvent(ev); });
    }
    return orig.call(this, type, ...rest);
  };
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
/* WR-01 (77-02): the cta flavour's grow-span renders the dedicated
   pwa.install.hint key — the button keeps the CTA string. */
const EN_BIP_HINT = en['pwa.install.hint'];
const FR_BIP_HINT = frCatalogue['pwa.install.hint'];
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
  await expect(strip.locator('.grow')).toHaveText(FR_BIP_HINT);
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

/* ---------- 5. pre-hydration dispatch (plan 73-03, CR-01/WR-03): the real
   Chromium race — the event fires before /api/boot hydration resolves, so
   onBip's single-frame decision would see api.enabled === false and never
   retry; the bounded rAF budget renders the strip as soon as hydration
   lands. The boot response is held at the route level so hydration is
   DEFINITELY still pending when the rAF-timed dispatch lands — on
   localhost it resolves faster than a frame, which would let the old
   one-shot recheck win too (measured during 73-03). The browser-side
   dispatch stays delay-free. NOTE: this stub proves ORDERING robustness,
   not the real event — real-Chromium confirmation remains a human verify
   item post-execution (73-VERIFICATION.md, Human Verification #1). */

test('a pre-hydration beforeinstallprompt (rAF-timed, no delay) still shows the strip and triggers the prompt', async ({ page }) => {
  const run = newRunId();
  await signIn(page, 'pre', run);

  /* hold the hydration response (api.init() GET /api/config) long enough
     that hydration is still pending across the dispatch frames — the
     pending-fetch shape the plan assumed ("/api/boot" in the verification
     doc is shorthand for this boot call) */
  await page.route('**/api/config', async route => {
    await new Promise(r => setTimeout(r, 150));
    await route.continue();
  });

  /* the reload boots into the signed-in workspace and dispatches the event
     via rAF right after listener registration — before the held hydration
     resolves; the 300-frame retry budget (~5 s at 60 fps) comfortably
     covers hydration, so the default expect timeout suffices */
  await page.addInitScript(BIP_PRE_HYDRATION_STUB);
  await page.reload();

  const strip = page.locator('.install-banner');
  await expect(strip).toBeVisible();
  await expect(strip.locator('.grow')).toHaveText(EN_BIP_HINT);
  await expect(strip.locator('button.install-cta')).toHaveText(EN_CTA);

  await strip.locator('button.install-cta').click();
  await expect.poll(() => page.evaluate(() => window.__bipPrompted), { timeout: 5_000 }).toBe(true);
  /* the native-prompt gesture hides the strip (accepted outcome, D-04) */
  await expect(strip).toBeHidden();
});
