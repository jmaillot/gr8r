/* =====================================================================
   PHASE 21 (DIS-01/DIS-02, D-102/D-106/D-109): the tightened 2FA disable
   route proven in Chromium, parametrically in EN + FR — one spec family
   covering the full cycle: enable → login with 2FA → disable (password +
   live TOTP through the real data-submit="tfaDisableConfirm" form) →
   login without 2FA → re-enable, plus the two contract-critical
   scenarios: the D-102 recovery-code rejection regression at the UI
   level (a typed recovery code surfaces the server's codeRejected error
   and nothing is disabled) and the D-106 session-policy assertion (a
   second browser context — a genuinely separate cookie jar — dies on its
   next requireUser surface through the central honest 401 teardown,
   err.signedOutElsewhere, while the first session stays signed in).

   Conventions follow flows.spec.mjs: fixtures only through the real API
   (helpers/setup.mjs), TOTP codes computed locally from the enrollment
   secret via totp.js (no test-only backdoor), every account/context
   presents its own run-unique X-Forwarded-For so throttle budgets never
   cross, and every asserted string resolves through fmt() against
   src/locales/en.json / fr.json — zero raw literals in assertions
   (D-111). Helpers are locally copied rather than imported out of
   flows.spec.mjs so that file stays untouched.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';
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

/* Every string the anonymous login form shows, straight from the catalogue. */
function loginDict(lang) {
  return {
    email: fmt('common.email', {}, lang),
    password: fmt('common.password', {}, lang),
    submit: fmt('page.auth.signIn', {}, lang),
  };
}

/* Status-checked fixture call, the setup.mjs convention. */
async function must(step, res, allowed) {
  if (!allowed.includes(res.status)) {
    throw new Error(`${step} failed with HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`);
  }
  return res.data;
}

/* A TOTP code for the enrollment secret, computed locally at submit time.
   codeSec is an absolute epoch second — callers pass now+1 for the current
   step (D-04 boundary hardening). */
function tfaCodeAt(secret, codeSec) {
  return totpAt(secret, codeSec);
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
    const res = await client.post('/api/auth/tfa/enable', { code: tfaCodeAt(secret, codeSec) });
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
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: lang,
    extraHTTPHeaders: ip ? { 'x-forwarded-for': ip } : undefined,
  });
  return context;
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
   step strictly past the step consumed at lastStepSec (the D-04 replay
   guard refuses s <= lastStep). One deterministic retry for the residual
   boundary race. Returns the epoch second of the consumed step. */
async function loginWith2fa(page, account, secret, lang, lastStepSec) {
  await fillLogin(page, account, lang);
  await expect(page.getByRole('heading', { name: fmt('page.auth.tfaTitle', {}, lang) })).toBeVisible();
  await nextWindow(lastStepSec);
  const ok = await submitTfaCode(page, account.slug, tfaCodeAt(secret, Math.floor(Date.now() / 1000) + 1));
  if (!ok) {
    await expect(page.getByText(fmt('err.invalidTfaCode', {}, lang))).toBeVisible();
    await nextWindow(Math.floor(Date.now() / 1000));
    const retried = await submitTfaCode(page, account.slug, tfaCodeAt(secret, Math.floor(Date.now() / 1000) + 1));
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

/* Drive the disable stage of the real tfa card: open the stage with the
   data-a="tfaAskDisable" entry button, fill the shipped form
   (#tfa-off-pw + #tfa-off-code) and submit via #tfa-off-save. Returns
   after the submit click — the caller asserts the outcome. */
async function openDisableStage(page, lang) {
  await expect(page.getByText(fmt('settings.tfa.on', {}, lang), { exact: true })).toBeVisible();
  await page.locator(`button[data-a='tfaAskDisable']`).click();
  await expect(page.locator(`form[data-submit='tfaDisableConfirm']`)).toBeVisible();
}

async function fillDisableForm(page, pw, code) {
  await page.locator('#tfa-off-pw').fill(pw);
  await page.locator('#tfa-off-code').fill(code);
  await page.locator('#tfa-off-save').click();
}

/* Submit the disable form with a live TOTP code, after nextWindow() has
   moved the server step past the one the login consumed. One retry for
   the residual boundary race. */
async function disableWithTotp(page, secret, lang, lastStepSec) {
  /* Reset the stage first: any error rendered by a previous attempt
     (e.g. the D-102 recovery-code rejection) would otherwise be visible
     stale text and poison the success/rejection race below. */
  await page.locator(`button[data-a='tfaCancel']`).click();
  await page.locator(`button[data-a='tfaAskDisable']`).click();
  await expect(page.locator(`form[data-submit='tfaDisableConfirm']`)).toBeVisible();
  await nextWindow(lastStepSec);
  await fillDisableForm(page, PASSWORD, tfaCodeAt(secret, Math.floor(Date.now() / 1000) + 1));
  /* Race the outcome: either the codeRejected error renders under the
     code field or the success toast pops — waiting for one alone would
     burn the toast's lifetime on the success path. */
  const errLoc = page.getByText(fmt('err.codeRejected', {}, lang));
  const okLoc = page.getByText(fmt('settings.tfa.disabledToast', {}, lang));
  await errLoc.or(okLoc).waitFor({ state: 'visible', timeout: 10_000 });
  if (await errLoc.isVisible()) {
    await expect(page.locator(`form[data-submit='tfaDisableConfirm']`)).toBeVisible();
    await nextWindow(Math.floor(Date.now() / 1000));
    await fillDisableForm(page, PASSWORD, tfaCodeAt(secret, Math.floor(Date.now() / 1000) + 1));
    await okLoc.waitFor({ state: 'visible', timeout: 10_000 });
  }
}

let run;

test.beforeEach(() => {
  run = newRunId();
});

test.describe('phase 21 tfa disable cycle', () => {
  /* Three nextWindow waits in the worst test (enable → login → login →
     disable) can legitimately cross up to three 30s boundaries. */
  test.setTimeout(240_000);
  for (const lang of ['en', 'fr']) {
    test(`the full disable cycle: enable → login 2FA → disable → login without 2FA → re-enable, with the recovery-code rejection regression at the form (${lang})`, async ({ browser }) => {
      const tag = `tdis-${lang}`;
      const acct = await createAccount(BASE_URL, run, tag, `TfaDisable ${lang}`, { locale: lang, workspace: `tdis-${lang}-${run}` });
      const { secret, recoveryCodes, lastStepSec } = await enrollAndEnableTfa(acct.client);

      /* Browser login with a live TOTP code (replay-guard discipline). */
      const context = await newContext(browser, { ip: acct.account.ip, lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const page = await context.newPage();
      try {
        const loginStepSec = await loginWith2fa(page, acct.account, secret, lang, lastStepSec);

        /* The real disable stage: entry button, then the shipped form. */
        await openSettingsSec(page, 'tfa');
        await openDisableStage(page, lang);

        /* D-102 at the UI level: a valid, unused recovery code posted
           into the disable form surfaces the server's codeRejected copy
           under the code field and 2FA stays on — nothing is disabled. */
        await fillDisableForm(page, PASSWORD, recoveryCodes[0]);
        await expect(page.getByText(fmt('err.codeRejected', {}, lang))).toBeVisible();
        await expect(page.getByText(fmt('settings.tfa.on', {}, lang), { exact: true })).toBeVisible();
        await expect(page.locator(`form[data-submit='tfaDisableConfirm']`)).toBeVisible();

        /* Disable with password + live TOTP through the same form. The
           login consumed a step; the nextWindow wait keeps the replay
           guard out of the way. */
        await disableWithTotp(page, secret, lang, loginStepSec);

        /* The card's server-ground-truth off state (refreshTfa re-reads
           twoFa); the success toast was already consumed by the helper. */
        await expect(page.getByText(fmt('settings.tfa.off', {}, lang), { exact: true })).toBeVisible();
      } finally {
        await context.close();
      }

      /* Login WITHOUT 2FA from a genuinely fresh cookie jar proves the
         disable took: straight to the workspace, no pending2fa screen. */
      const freshCtx = await newContext(browser, { ip: clientIp(run, `${tag}-relogin`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const fresh = await freshCtx.newPage();
      try {
        await fillLogin(fresh, acct.account, lang);
        await expect(fresh).toHaveURL(new RegExp(`/w/${acct.account.slug}$`));
        await expect(fresh.getByRole('heading', { name: fmt('page.auth.tfaTitle', {}, lang) })).toHaveCount(0);
      } finally {
        await freshCtx.close();
      }

      /* Re-enable (D-109 cycle closes) through the real API: the disable
         revoked the original API session (D-105), so sign in fresh —
         which also re-proves, at the API level, that 2FA is off. */
      const reclient = apiClient(BASE_URL, { name: `${tag}-re`, ip: clientIp(run, `${tag}-re`) });
      await must('re-login after disable', await reclient.post('/api/auth/login', { email: acct.account.email, password: PASSWORD }), [200]);
      const reenabled = await enrollAndEnableTfa(reclient);
      expect(reenabled.secret).toBeTruthy();
      expect(reenabled.recoveryCodes.length).toBeGreaterThan(0);
    });

    test(`disabling revokes the other device's session through the honest 401 teardown and keeps the current one (${lang})`, async ({ browser }) => {
      const tag = `trev-${lang}`;
      const acct = await createAccount(BASE_URL, run, tag, `TfaRevoke ${lang}`, { locale: lang, workspace: `trev-${lang}-${run}` });
      const { secret, lastStepSec } = await enrollAndEnableTfa(acct.client);

      /* Two separate browser contexts = two separate cookie jars. */
      const ctxA = await newContext(browser, { ip: clientIp(run, `${tag}-a`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const ctxB = await newContext(browser, { ip: clientIp(run, `${tag}-b`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const a = await ctxA.newPage();
      const b = await ctxB.newPage();
      try {
        /* B signs in first, A second — each login consumes a TOTP step
           and chains its replay baseline to the previous consumption. */
        const bStepSec = await loginWith2fa(b, acct.account, secret, lang, lastStepSec);
        const aStepSec = await loginWith2fa(a, acct.account, secret, lang, bStepSec);

        /* A disables through the real settings surface. A's login just
           consumed a step; the nextWindow wait keeps the guard out. */
        await openSettingsSec(a, 'tfa');
        await openDisableStage(a, lang);
        await disableWithTotp(a, secret, lang, aStepSec);

        /* A's keep-current session survives: the tfa card's server
           ground truth reads off, and the sessions tab still loads its
           server ground truth with this device present. */
        await expect(a.getByText(fmt('settings.tfa.off', {}, lang), { exact: true })).toBeVisible();
        await openSettingsSec(a, 'sessions');
        await expect(a.getByText(fmt('settings.sessions.thisDevice', {}, lang))).toBeVisible();

        /* B dies on its next requireUser surface, through the central
           honest 401 teardown: signed out, honest copy (D-106). */
        await openSettingsSec(b, 'sessions');
        await expect(b.getByText(fmt('err.signedOutElsewhere', {}, lang))).toBeVisible();
        await expect(b.getByLabel(fmt('common.email', {}, lang), { exact: true })).toBeVisible();
      } finally {
        await ctxA.close();
        await ctxB.close();
      }
    });
  }
});
