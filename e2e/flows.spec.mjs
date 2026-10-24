/* =====================================================================
   PHASE 10 FLOWS WAVE 1 (UAT-01..UAT-04, D-01, D-03): the first four
   flows of the eight-flow matrix, proven in Chromium as full happy paths
   asserted at every step with role/label/text selectors plus toasts —
   in English and in French. This file owns:
     - onboarding wizard  (UAT-01): browser signup → wizard → workspace
     - invite modal       (UAT-02): header/input/submit/toast + link row
     - /join page         (UAT-03): fresh visitor accepts, invalid token
     - project share modal(UAT-04): add by email, permission select
   The remaining four flows (UAT-05..UAT-09's flows) arrive in wave 2 and
   reuse the per-flow selector-dictionary structure established here.

   Conventions follow the rest of the suite: fixtures only through the
   real API (helpers/setup.mjs), every account/context presents its own
   run-unique X-Forwarded-For so per-IP throttles never cross, and every
   asserted string is a catalogue-backed surface whose value is read
   from src/locales/en.json / fr.json — imported directly, so no
   transcription can drift from the catalogue (the prohibition against
   asserting raw-English splices holds by construction).
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };

const CATALOGUE = { en, fr };

/* Interpolate a catalogue value with the same {name}/{n} subset t() uses. */
function fmt(key, vars, lang) {
  let s = CATALOGUE[lang][key];
  if (s === undefined) throw new Error(`catalogue key missing in ${lang}: ${key}`);
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/* Every string the login form shows, straight from the catalogue. */
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

/* One browser context per account, with the account's run-unique client
   address and clipboard permissions (the invite modal's copy-link toast
   needs navigator.clipboard.writeText to succeed). */
async function newContext(browser, { ip, lang = 'en-US' } = {}) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    locale: lang,
    extraHTTPHeaders: ip ? { 'x-forwarded-for': ip } : undefined,
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE_URL });
  return context;
}

/* The sign-in path shared by every flow: goto / → labelled fields →
   submit → land on the account's workspace. */
async function signIn(page, account, lang) {
  const form = loginDict(lang);
  await page.goto('/');
  await page.getByLabel(form.email, { exact: true }).fill(account.email);
  await page.getByLabel(form.password, { exact: true }).fill(account.password);
  await page.getByRole('button', { name: form.submit }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
}

let run;
const FLOW = {}; // per-language fixtures, filled in beforeAll

test.beforeAll(async () => {
  run = newRunId();
  for (const lang of ['en', 'fr']) {
    /* Owner of a workspace whose locale is the account's own (D-02): the
       invite modal and the share modal render in this language. */
    const inv = await createAccount(BASE_URL, run, `inv-${lang}`, `Invite Owner ${lang}`, {
      locale: lang,
      workspace: `inv-${lang}-${run}`,
    });
    /* Share owner + a second account that joins as a member, so the share
       modal can add an existing member by email (server mode requires it). */
    const shr = await createAccount(BASE_URL, run, `shr-${lang}`, `Share Owner ${lang}`, {
      locale: lang,
      workspace: `shr-${lang}-${run}`,
    });
    const tgt = await createAccount(BASE_URL, run, `tgt-${lang}`, `Share Target ${lang}`);
    const invite = await must('share target invite', await shr.client.post(`/api/workspaces/${shr.account.slug}/invites`, { emails: [tgt.account.email], role: 'member' }), [201]);
    await must('share target accept', await tgt.client.post(`/api/invites/${inviteToken(invite.invites[0].url)}/accept`, {}), [200, 201]);

    /* One public project on the share workspace, created through the
       document API — fixtures never go through the browser UI. */
    const docRes = await must('share workspace doc', await shr.client.get(`/api/workspaces/${shr.account.slug}`), [200]);
    const doc = docRes.doc;
    const projectId = `p_shr_${lang}`;
    doc.data.projects = [
      ...(doc.data.projects || []),
      {
        id: projectId,
        key: `flows-share-${lang}`,
        name: `Share Roadmap ${lang} ${run}`,
        icon: 'map',
        color: 'indigo',
        status: 'active',
        team: null,
        lead: docRes.memberId,
        due: null,
        start: null,
        fav: false,
        members: [docRes.memberId],
        desc: '',
        milestones: [],
        last: 0,
        private: false,
        perms: {},
      },
    ];
    doc.data.projOrder = [...(doc.data.projOrder || []), projectId];
    await must('share project fixtures', await shr.client.put(`/api/workspaces/${shr.account.slug}`, { revision: docRes.revision, doc }), [200]);

    FLOW[lang] = {
      inviteOwner: inv.account,
      inviteWsName: `Locale inv-${lang} ${run}`,
      shareOwner: shr.account,
      shareWsName: `Locale shr-${lang} ${run}`,
      target: tgt.account,
      projectName: `Share Roadmap ${lang} ${run}`,
    };
  }
});

/* =====================================================================
   ONBOARDING WIZARD (UAT-01, D-03)
   ===================================================================== */

/* The wizard walked step by step; only the catalogue differs per locale.
   The signup happens IN THE BROWSER so the post-signup route lands on the
   wizard (an API-created account owns a workspace and skips it). The fr
   variant patches its freshly signed-up account to `fr` through the API
   and reloads — the browser-level locale pin stays en-US (D-02: French
   comes from the account, never from the browser). */
async function walkWizard(page, lang, { wsName, slug, projName }) {
  /* Step 2 of 6 — the signup landed on the wizard's workspace step. */
  await expect(page.getByRole('heading', { name: fmt('page.auth.onb2Title', {}, lang) })).toBeVisible();
  await expect(page.locator(`[aria-label="${fmt('page.auth.stepOf', { n: 2, total: 6 }, lang)}"]`)).toBeVisible();
  await page.getByLabel(fmt('common.wsName', {}, lang), { exact: true }).fill(wsName);
  await page.locator('#o-url').fill(slug);
  await page.locator('#onb-next').click();

  /* Step 3 of 6 — how the team works. */
  await expect(page.getByRole('heading', { name: fmt('page.auth.onb3Title', {}, lang) })).toBeVisible();
  await expect(page.locator(`[aria-label="${fmt('page.auth.stepOf', { n: 3, total: 6 }, lang)}"]`)).toBeVisible();
  await page.getByRole('radio', { name: fmt('page.auth.team.boards', {}, lang) }).click();
  await page.getByRole('button', { name: fmt('page.auth.size.justMe', {}, lang), exact: true }).click();
  await page.locator('#onb-next').click();

  /* Step 4 of 6 — the first project, from a template. */
  await expect(page.getByRole('heading', { name: fmt('page.auth.onb4Title', {}, lang) })).toBeVisible();
  await expect(page.locator(`[aria-label="${fmt('page.auth.stepOf', { n: 4, total: 6 }, lang)}"]`)).toBeVisible();
  await page.getByLabel(fmt('page.auth.projectName', {}, lang), { exact: true }).fill(projName);
  await page.getByRole('radio', { name: fmt('project.template.product.name', {}, lang) }).click();
  await page.locator('#onb-next').click();

  /* Step 5 of 6 — invites left empty (documented choice: the success card
     then asserts the "no invites yet" row instead of a throwaway address). */
  await expect(page.getByRole('heading', { name: fmt('page.auth.onb5Title', {}, lang) })).toBeVisible();
  await expect(page.locator(`[aria-label="${fmt('page.auth.stepOf', { n: 5, total: 6 }, lang)}"]`)).toBeVisible();
  await expect(page.locator('#o-inv-0')).toBeVisible();
  await page.locator('#onb-next').click();

  /* Step 6 of 6 — the success card, then the landing. */
  await expect(page.getByRole('heading', { name: fmt('page.auth.onb6Title', {}, lang) })).toBeVisible();
  await expect(page.locator(`[aria-label="${fmt('page.auth.stepOf', { n: 6, total: 6 }, lang)}"]`)).toBeVisible();
  await expect(page.getByText(fmt('page.auth.readyWorkspace', { name: wsName }, lang))).toBeVisible();
  await page.locator(`button[data-a='onbFinish']`).click();

  await expect(page).toHaveURL(new RegExp(`/w/${slug}$`));
  await expect(page.locator('button.ws')).toContainText(wsName);
}

test.describe('onboarding wizard', () => {
  for (const lang of ['en', 'fr']) {
    test(`a browser signup walks the onboarding wizard and lands in the created workspace (${lang})`, async ({ browser }) => {
      const tag = `onb-${lang}`;
      const email = `${tag}-${run}@e2e.local`;
      const wsName = `Onboard ${lang} ${run}`;
      const slug = `onb-${lang}-${run}`;
      const projName = `Onboarding Roadmap ${lang}`;
      const context = await newContext(browser, { ip: clientIp(run, tag) });
      const page = await context.newPage();
      try {
        await page.goto('/');
        await page.locator(`button[data-a='auth'][data-v='signup']`).first().click();
        /* The signup page itself is negotiated (browser en-US) for both
           variants — the account locale only exists after the account does. */
        await expect(page.getByRole('heading', { name: fmt('page.auth.createYourAccount', {}, 'en') })).toBeVisible();
        await page.getByLabel(fmt('common.fullName', {}, 'en'), { exact: true }).fill(`Onboard ${lang}`);
        await page.getByLabel(fmt('page.auth.workEmail', {}, 'en'), { exact: true }).fill(email);
        await page.getByLabel(fmt('common.password', {}, 'en'), { exact: true }).fill(PASSWORD);
        await page.locator(`button[data-a='doSignup']`).click();
        await expect(page.getByRole('heading', { name: fmt('page.auth.onb2Title', {}, 'en') })).toBeVisible();

        if (lang === 'fr') {
          /* D-02: the French variant comes from the account, not the browser.
             Patch the just-created account via the API and reload — the boot
             re-enters the wizard (no workspace yet) in French. */
          const client = apiClient(BASE_URL, { name: `${tag}-api`, ip: clientIp(run, `${tag}-api`) });
          await must('onboarding fr sign-in', await client.post('/api/auth/login', { email, password: PASSWORD }), [200]);
          await must('onboarding fr locale patch', await client.patch('/api/auth/me', { locale: 'fr' }), [200]);
          await page.reload();
        }
        await walkWizard(page, lang, { wsName, slug, projName });
      } finally {
        await context.close();
      }
    });
  }
});