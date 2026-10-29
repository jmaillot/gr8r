/* =====================================================================
   PHASE 22 (OPREV-01/OPREV-02, D-120/D-121/D-123): the operator session
   revocation lifecycle proven in Chromium, parametrically in EN + FR —
   one spec covering the full v1.4 cycle: enroll 2FA → regenerate
   recovery codes → disable → re-enroll → browser login with 2FA in the
   soon-to-be-revoked victim context → the bootstrap operator (the
   D-113 ADMIN_EMAIL-flagged account) opens the settings operator card
   (D-120), sees the instance's users (D-121) and revokes the victim →
   the victim context dies on its next requireUser surface through the
   central honest 401 teardown (err.signedOutElsewhere — zero server
   work in the assertion, D-106) while the operator's session survives.

   Conventions follow tfa-disable-cycle.spec.mjs / flows.spec.mjs:
   fixtures only through the real API (helpers/setup.mjs), TOTP codes
   computed locally from the enrollment secret via totp.js (no
   test-only backdoor), every account/context presents its own
   run-unique X-Forwarded-For so throttle budgets never cross (Pitfall
   5 — the FR run doubles every budget), and every asserted string
   resolves through fmt() against src/locales/en.json / fr.json — zero
   raw literals in assertions. Helpers are locally copied rather than
   imported out of flows.spec.mjs so that file stays untouched.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, OWNER, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';
import { totpAt } from '../totp.js';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const CATALOGUE = { en, fr };

/* Interpolate a catalogue value with the same {name}/{n} subset t() uses
   (plural members selected with Intl.PluralRules, as i18n.js does). */
function fmt(key, vars, lang) {
  let s = CATALOGUE[lang][key];
  if (s === undefined) throw new Error(`catalogue key missing in ${lang}: ${key}`);
  if (typeof s === 'object') {
    const category = new Intl.PluralRules(lang === 'fr' ? 'fr' : 'en').select(vars?.n ?? 1);
    s = s[category] ?? s.other;
  }
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/* Escape a catalogue string for literal use inside new RegExp(). */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Status-checked fixture call, the setup.mjs convention. */
async function must(step, res, allowed) {
  if (!allowed.includes(res.status)) {
    throw new Error(`${step} failed with HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`);
  }
  return res.data;
}

/* Wait until the server-side 30s window has moved strictly past the step
   consumed at lastStepSec (the D-04 replay guard refuses s <= lastStep).
   Deterministic — never submits a code whose step can be refused. */
async function nextWindow(lastStepSec) {
  while (Math.floor(Date.now() / 1000 / 30) <= Math.floor(lastStepSec / 30)) {
    await new Promise(r => setTimeout(r, 500));
  }
}

/* Enroll + enable 2FA through the real API, returning the once-only
   recovery codes (D-53) and the epoch second of the code the server
   accepted (its step becomes two_fa_last_step — the replay baseline every
   later submit must clear). */
async function enrollAndEnableTfa(client) {
  const enroll = await must('tfa enroll', await client.post('/api/auth/tfa/enroll', { currentPassword: PASSWORD }), [200]);
  const secret = enroll.secret;
  if (!secret) throw new Error('tfa enroll response has no secret');
  for (const offset of [1, 31]) {
    const codeSec = Math.floor(Date.now() / 1000) + offset;
    const res = await client.post('/api/auth/tfa/enable', { code: totpAt(secret, codeSec) });
    if (res.status === 200) return { secret, recoveryCodes: res.data.recoveryCodes, lastStepSec: codeSec };
    if (res.status !== 400 || res.data?.code !== 'codeRejected') {
      throw new Error(`tfa enable failed with HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`);
    }
  }
  throw new Error('tfa enable rejected both boundary codes');
}

/* One browser context per device, with its own run-unique client address
   and negotiated language (the fr variants use fr-FR — the /join lever;
   the account locale owns the signed-in surfaces). */
async function newContext(browser, { ip, lang = 'en-US' } = {}) {
  return browser.newContext({
    baseURL: BASE_URL,
    locale: lang,
    extraHTTPHeaders: ip ? { 'x-forwarded-for': ip } : undefined,
  });
}

/* Every string the anonymous login form shows, straight from the catalogue. */
function loginDict(lang) {
  return {
    email: fmt('common.email', {}, lang),
    password: fmt('common.password', {}, lang),
    submit: fmt('page.auth.signIn', {}, lang),
  };
}

/* Sign in through the anonymous login form. Stops at the pending-2FA
   state for enrolled accounts. */
async function fillLogin(page, account, lang) {
  const form = loginDict(lang);
  await page.goto('/');
  await page.getByLabel(form.email, { exact: true }).fill(account.email);
  await page.getByLabel(form.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: form.submit }).click();
}

/* Submit the second factor and wait for the workspace landing; returns
   false if the challenge rejected the code while still alive, so the
   caller can retry once with the next step's code (D-04). */
async function submitTfaCode(page, slug, code) {
  await page.locator('#tfa-login-code').fill(code);
  await page.locator('#tfa-login-btn').click();
  try {
    await expect(page).toHaveURL(new RegExp(`/w/${slug}$`), { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

/* Full 2FA login: form → pending2fa screen → code computed fresh at
   submit time, but only after nextWindow() has moved the server's 30s
   step strictly past the step consumed at lastStepSec. One deterministic
   retry for the residual boundary race. Returns the epoch second. */
async function loginWith2fa(page, account, secret, lang, lastStepSec) {
  await fillLogin(page, account, lang);
  await expect(page.getByRole('heading', { name: fmt('page.auth.tfaTitle', {}, lang) })).toBeVisible();
  await nextWindow(lastStepSec);
  const ok = await submitTfaCode(page, account.slug, totpAt(secret, Math.floor(Date.now() / 1000) + 1));
  if (!ok) {
    /* The first submit can fail with a code rejection OR a challenge expiry
       (nextWindow pushed past the 30s step the code was minted from) — the
       retry is valid for either failure mode (IN-03). */
    await expect(
      page.getByText(new RegExp(`${escapeRe(fmt('err.invalidTfaCode', {}, lang))}|${escapeRe(fmt('err.challengeExpired', {}, lang))}`)),
    ).toBeVisible();
    await nextWindow(Math.floor(Date.now() / 1000));
    const retried = await submitTfaCode(page, account.slug, totpAt(secret, Math.floor(Date.now() / 1000) + 1));
    if (!retried) throw new Error('retry with the next step code failed');
  }
  return Math.floor(Date.now() / 1000);
}

/* Navigate to a settings section (the signed-in device that acts drives
   the real settings surface). */
async function openSettingsSec(page, sec) {
  await page.locator(`[data-a='go'][data-r='settings']`).first().click();
  await page.locator(`.sitem[data-sec='${sec}']`).click();
}

let run;

test.beforeEach(() => {
  run = newRunId();
});

test.describe('phase 22 operator revoke cycle', () => {
  /* Four nextWindow waits in the worst test (enable → regen → disable →
     re-enable → login) can legitimately cross up to four 30s boundaries. */
  test.setTimeout(300_000);
  for (const lang of ['en', 'fr']) {
    test(`the operator revokes the victim through the settings card; the victim gets the honest teardown and the operator survives (${lang})`, async ({ browser }) => {
      const tag = `oprev-${lang}`;

      /* The victim account with its own workspace and locale. */
      const acct = await createAccount(BASE_URL, run, tag, `OpRevoke ${lang}`, { locale: lang, workspace: `${tag}-${run}` });
      const victimId = (await must('victim me', await acct.client.get('/api/auth/me'), [200])).user.id;

      /* Full 2FA lifecycle through the real API: enroll → regenerate
         recovery codes → disable → re-enroll (D-123). Each step consumes
         a TOTP step; nextWindow keeps the D-04 replay guard out of the
         way. The disable's D-105 revoke-others keeps this client's own
         cookie, so it drives the re-enroll directly. */
      const first = await enrollAndEnableTfa(acct.client);
      await nextWindow(first.lastStepSec);
      const regSec = Math.floor(Date.now() / 1000) + 1;
      const regen = await must('regen', await acct.client.post('/api/auth/tfa/recovery', { currentPassword: PASSWORD, code: totpAt(first.secret, regSec) }), [200]);
      expect(regen.recoveryCodes.length).toBeGreaterThan(0);
      await nextWindow(regSec);
      await must('disable', await acct.client.post('/api/auth/tfa/disable', { currentPassword: PASSWORD, code: totpAt(first.secret, Math.floor(Date.now() / 1000) + 1) }), [200]);
      const second = await enrollAndEnableTfa(acct.client);
      expect(second.secret).toBeTruthy();

      /* The victim signs in with 2FA in a browser context — the device
         the operator is about to revoke. */
      const victimCtx = await newContext(browser, { ip: clientIp(run, `${tag}-victim`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const victimPage = await victimCtx.newPage();

      /* The operator: the D-113 bootstrap admin (e2e server ADMIN_EMAIL
         = the OWNER fixture), a separate browser context, no 2FA. */
      const opIp = clientIp(run, `${tag}-op`);
      const operatorCtx = await newContext(browser, { ip: opIp, lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const opPage = await operatorCtx.newPage();
      try {
        await loginWith2fa(victimPage, acct.account, second.secret, lang, second.lastStepSec);

        await fillLogin(opPage, { email: OWNER.email, password: OWNER.password }, lang);
        await expect(opPage).toHaveURL(new RegExp('/w/acme$'));

        /* The operator card (D-120) lives on the settings sessions tab,
           rendered only for the flagged viewer; it lists the instance's
           users (D-121) from the server. */
        await openSettingsSec(opPage, 'sessions');
        await expect(opPage.getByText(fmt('settings.operator.title', {}, lang))).toBeVisible();
        await expect(opPage.getByText(acct.account.email)).toBeVisible();
        /* UI-side defense-in-depth (D-120/D-119): the operator's own
           (owner) row carries no revoke action — the keep-current note
           instead. */
        await expect(opPage.getByText(fmt('settings.operator.selfNote', {}, lang))).toBeVisible();
        await expect(opPage.locator(`button[data-a='operatorRevokeAsk']`).first()).toBeVisible();

        /* Revoke the victim: the D-90 inline confirmation stage. */
        await opPage.locator(`button[data-a='operatorRevokeAsk'][data-id='${victimId}']`).click();
        await expect(opPage.locator(`button[data-a='operatorRevokeConfirm'][data-id='${victimId}']`)).toBeVisible();
        await opPage.locator(`button[data-a='operatorRevokeConfirm'][data-id='${victimId}']`).click();
        /* Deterministic outcome: the D-90 stage closes and the re-fetched
           list (refreshOperatorUsers) puts the victim's revoke button back. */
        await expect(opPage.locator(`button[data-a='operatorRevokeConfirm'][data-id='${victimId}']`)).toHaveCount(0);
        await expect(opPage.locator(`button[data-a='operatorRevokeAsk'][data-id='${victimId}']`)).toBeVisible();

        /* The victim dies on its next requireUser surface through the
           central honest 401 teardown (D-106) — signed out, honest copy. */
        await openSettingsSec(victimPage, 'sessions');
        await expect(victimPage.getByText(fmt('err.signedOutElsewhere', {}, lang))).toBeVisible();
        await expect(victimPage.getByLabel(fmt('common.email', {}, lang), { exact: true })).toBeVisible();

        /* The operator's session survives (success criterion: the
           operator can still load settings — the card answers again). */
        await openSettingsSec(opPage, 'sessions');
        await expect(opPage.getByText(fmt('settings.operator.title', {}, lang))).toBeVisible();
      } finally {
        await victimCtx.close();
        await operatorCtx.close();
      }
    });
  }
});
