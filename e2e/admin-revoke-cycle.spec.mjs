/* =====================================================================
   PHASE 24 (AUD-02): the workspace-admin session revocation lifecycle
   proven in Chromium, parametrically in EN + FR. An admin-tier account
   (the workspace owner) opens the members surface, revokes a member
   through the two-stage inline confirm, the member's browser session
   dies on its next requireUser surface through the central honest 401
   teardown (err.signedOutElsewhere, D-106) while the admin's session
   survives; then the refusal path — revoking a PEER ADMIN toasts the
   server's adminOnly copy (strictly-below-admin rank rule, D-R2).

   Conventions follow operator-revoke-cycle.spec.mjs verbatim: fixtures
   only through the real API (helpers/setup.mjs), every account/context
   presents its own run-unique X-Forwarded-For so throttle budgets never
   cross (Pitfall 5 — the FR run doubles every budget), and every
   asserted string resolves through fmt() against src/locales/en.json /
   fr.json — zero raw literals in assertions.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const CATALOGUE = { en, fr };

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

async function must(step, res, allowed) {
  if (!allowed.includes(res.status)) {
    throw new Error(`${step} failed with HTTP ${res.status}: ${JSON.stringify(res.data)?.slice(0, 200)}`);
  }
  return res.data;
}

async function newContext(browser, { ip, lang = 'en-US' } = {}) {
  return browser.newContext({
    baseURL: BASE_URL,
    locale: lang,
    extraHTTPHeaders: ip ? { 'x-forwarded-for': ip } : undefined,
  });
}

function loginDict(lang) {
  return {
    email: fmt('common.email', {}, lang),
    password: fmt('common.password', {}, lang),
    submit: fmt('page.auth.signIn', {}, lang),
  };
}

async function fillLogin(page, account, lang) {
  const form = loginDict(lang);
  await page.goto('/');
  await page.getByLabel(form.email, { exact: true }).fill(account.email);
  await page.getByLabel(form.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: form.submit }).click();
}

/* The signed-in member dies on its next requireUser surface through the
   central honest 401 teardown (D-106). */
async function openSettingsSessions(page, lang) {
  await page.locator(`[data-a='go'][data-r='settings']`).first().click();
  await page.locator(`.sitem[data-sec='sessions']`).click();
}

let run;

test.beforeEach(() => {
  run = newRunId();
});

test.describe('phase 24 admin revoke cycle', () => {
  test.setTimeout(180_000);
  for (const lang of ['en', 'fr']) {
    test(`the workspace admin revokes a member from the members surface; the member gets the honest teardown and the peer admin is immune (${lang})`, async ({ browser }) => {
      const tag = `admrev-${lang}`;
      const slug = `${tag}-${run}`.slice(0, 40);

      /* The admin-tier account owns its own workspace (owner rank ≥ admin,
         so requireWorkspace's 'admin' gate passes for it). */
      const admin = await createAccount(BASE_URL, run, tag, `Admin Revoke ${lang}`, { locale: lang, workspace: slug });
      const adminIp = admin.account.ip;

      /* A member of that workspace, invited by the admin and accepting the
         real link — signup gives session 1; the browser login below adds
         session 2. */
      const member = {
        email: `${tag}-member-${run}@e2e.local`,
        password: PASSWORD,
        name: `Member ${lang}`,
        ip: clientIp(run, `${tag}-member`),
      };
      const memberClient = apiClient(BASE_URL, { name: 'member', ip: member.ip });
      await must('member signup', await memberClient.post('/api/auth/signup', { name: member.name, email: member.email, password: member.password }), [201]);
      const invite = await must(
        'member invite',
        await admin.client.post(`/api/workspaces/${slug}/invites`, { emails: [member.email], role: 'member' }),
        [201],
      );
      await must('member accept', await memberClient.post(`/api/invites/${inviteToken(invite.invites[0].url)}/accept`, {}), [200, 201]);

      /* A PEER ADMIN of the same workspace — the refusal-path target. */
      const peer = {
        email: `${tag}-peer-${run}@e2e.local`,
        password: PASSWORD,
        name: `Peer Admin ${lang}`,
        ip: clientIp(run, `${tag}-peer`),
      };
      const peerClient = apiClient(BASE_URL, { name: 'peer', ip: peer.ip });
      await must('peer signup', await peerClient.post('/api/auth/signup', { name: peer.name, email: peer.email, password: peer.password }), [201]);
      const peerInvite = await must(
        'peer invite',
        await admin.client.post(`/api/workspaces/${slug}/invites`, { emails: [peer.email], role: 'admin' }),
        [201],
      );
      await must('peer accept', await peerClient.post(`/api/invites/${inviteToken(peerInvite.invites[0].url)}/accept`, {}), [200, 201]);

      /* The member signs in from a real browser — the device about to be
         revoked — and lands on the workspace. */
      const memberCtx = await newContext(browser, { ip: member.ip, lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const memberPage = await memberCtx.newPage();

      /* The admin drives the members surface from its own browser. */
      const adminCtx = await newContext(browser, { ip: adminIp, lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const adminPage = await adminCtx.newPage();
      try {
        await fillLogin(memberPage, member, lang);
        await expect(memberPage).toHaveURL(new RegExp(`/w/${slug}$`));

        await fillLogin(adminPage, admin.account, lang);
        await expect(adminPage).toHaveURL(new RegExp(`/w/${slug}$`));
        await adminPage.locator(`[data-a='go'][data-r='members']`).first().click();
        await expect(adminPage.getByRole('heading', { name: fmt('nav.route.members', {}, lang) })).toBeVisible();

        /* Revoke the member: the D-90 two-stage inline confirm. */
        const memberRow = adminPage.locator(`tr[data-ctx='member']`, { hasText: member.email });
        await expect(memberRow).toBeVisible();
        await memberRow.locator(`button[data-a='memberRevokeAsk']`).click();
        const confirmBtn = memberRow.locator(`button[data-a='memberRevokeConfirm']`);
        await expect(confirmBtn).toBeVisible();
        await confirmBtn.click();
        /* Deterministic outcome: the stage closes and the re-fetched list
           puts the ask button back. */
        await expect(memberRow.locator(`button[data-a='memberRevokeConfirm']`)).toHaveCount(0);
        await expect(adminPage.getByText(fmt('members.toastRevoked', { name: member.name }, lang))).toBeVisible();

        /* The member dies on its next requireUser surface through the
           central honest 401 teardown (D-106) — signed out, honest copy. */
        await openSettingsSessions(memberPage, lang);
        await expect(memberPage.getByText(fmt('err.signedOutElsewhere', {}, lang))).toBeVisible();

        /* The admin's session survives: the members surface answers again. */
        await adminPage.locator(`[data-a='go'][data-r='members']`).first().click();
        await expect(adminPage.getByRole('heading', { name: fmt('nav.route.members', {}, lang) })).toBeVisible();

        /* Refusal path: the admin targets the PEER ADMIN — the strictly-
           below-admin rank rule answers 403 adminOnly and the toast carries
           the catalogue copy. */
        const peerRow = adminPage.locator(`tr[data-ctx='member']`, { hasText: peer.email });
        await expect(peerRow).toBeVisible();
        await peerRow.locator(`button[data-a='memberRevokeAsk']`).click();
        await peerRow.locator(`button[data-a='memberRevokeConfirm']`).click();
        await expect(adminPage.locator('.toast', { hasText: fmt('err.adminOnly', {}, lang) })).toBeVisible();
      } finally {
        await memberCtx.close();
        await adminCtx.close();
      }
    });
  }
});
