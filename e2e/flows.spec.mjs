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

/* Interpolate a catalogue value with the same {name}/{n} subset t() uses.
   Plural members are objects keyed by CLDR category (the phase-5 contract),
   selected with Intl.PluralRules like i18n.js does. */
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
   submit → land on the account's workspace. The LOGIN form itself is
   negotiated (the visitor has no account yet; the suite is pinned to
   en-US, UAT-09), so its labels always come from the English catalogue —
   the account's language takes over right after the sign-in. */
async function signIn(page, account) {
  const form = loginDict('en');
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
      inviteClient: inv.client,
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

/* =====================================================================
   INVITE MODAL (UAT-02)
   ===================================================================== */

test.describe('invite modal', () => {
  for (const lang of ['en', 'fr']) {
    test(`the invite modal asserts its header, input and submit, creates a link and copies it (${lang})`, async ({ browser }) => {
      const owner = FLOW[lang].inviteOwner;
      const wsName = FLOW[lang].inviteWsName;
      const inviteeEmail = `invitee-${lang}-${run}@e2e.local`;
      const context = await newContext(browser, { ip: owner.ip });
      const page = await context.newPage();
      try {
        await signIn(page, owner);

        /* The invite entry lives in the workspace popover (admin-gated; the
           fixture owner qualifies). */
        await page.locator('button.ws').click();
        await page.getByRole('button', { name: fmt('popover.inviteMembers', {}, lang) }).click();

        /* Modal header, link-hint branch (SMTP off on the e2e server) and
           the labelled email textarea. */
        await expect(page.getByRole('heading', { name: fmt('modal.inviteTo', { name: wsName }, lang), level: 2 })).toBeVisible();
        await expect(page.getByText(fmt('modal.inviteLinkHint', {}, lang))).toBeVisible();
        await page.getByLabel(fmt('modal.emailAddresses', {}, lang), { exact: true }).fill(inviteeEmail);
        await expect(page.locator('#inv-submit')).toContainText(fmt('act.createLinks', {}, lang));
        await page.locator('#inv-submit').click();

        /* The created-links toast, asserted immediately (4.2 s lifetime). */
        await expect(page.getByText(fmt('act.inviteLinksCreated', { n: 1 }, lang))).toBeVisible();
        /* The pending link row carries the catalogue aria-label and a join URL. */
        const row = page.locator(`input[aria-label="${fmt('modal.inviteLinkFor', { email: inviteeEmail }, lang)}"]`);
        await expect(row).toBeVisible();
        await expect(row).toHaveValue(/\/join\//);

        /* The footer copy button copies the fresh link (toast.inviteLinkCopied). */
        await page.getByRole('button', { name: fmt('act.copyInviteLink', {}, lang) }).click();
        await expect(page.getByText(fmt('toast.inviteLinkCopied', {}, lang))).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});

/* =====================================================================
   /JOIN PAGE (UAT-03)
   ===================================================================== */

test.describe('/join page', () => {
  for (const lang of ['en', 'fr']) {
    test(`a fresh visitor accepts a workspace invite from the /join page (${lang})`, async ({ browser }) => {
      const owner = FLOW[lang].inviteOwner;
      const wsName = FLOW[lang].inviteWsName;
      const joinerEmail = `joiner-${lang}-${run}@e2e.local`;
      const invite = await must('join invite', await FLOW[lang].inviteClient.post(`/api/workspaces/${owner.slug}/invites`, { emails: [joinerEmail], role: 'member' }), [201]);
      const token = inviteToken(invite.invites[0].url);

      /* A fresh browser context is the new visitor: its own run-unique IP
         (the invite-accept throttle is 5/hour/IP) and no session state.
         The /join page is ANONYMOUS, so its language is negotiated from the
         browser, not from an account (D-02 governs signed-in surfaces) —
         the fr variant therefore negotiates with a fr-FR context, the one
         locale lever an account-less page has. The freshly joined account
         adopts that negotiated language (adoptAccountLocale). */
      const context = await newContext(browser, { ip: clientIp(run, `joiner-${lang}`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const page = await context.newPage();
      try {
        await page.goto(`/join/${token}`);
        await expect(page.getByRole('heading', { name: fmt('page.auth.joinTitle', { name: wsName }, lang) })).toBeVisible();
        /* The invite carries the address: the email field is readonly. */
        await expect(page.locator('#j-email')).toHaveValue(joinerEmail);
        await expect(page.locator('#j-email')).toHaveAttribute('readonly', '');
        await page.getByLabel(fmt('common.fullName', {}, lang), { exact: true }).fill(`Joiner ${lang}`);
        await page.getByLabel(fmt('common.password', {}, lang), { exact: true }).fill(PASSWORD);
        await expect(page.locator(`button[data-a='doJoin']`)).toContainText(fmt('page.auth.createJoin', {}, lang));
        await page.locator(`button[data-a='doJoin']`).click();

        await expect(page).toHaveURL(new RegExp(`/w/${owner.slug}$`));
        await expect(page.getByRole('button', { name: fmt('nav.route.projects', {}, lang) }).first()).toBeVisible();
      } finally {
        await context.close();
      }
    });

    test(`an invalid invite token renders the unavailable state (${lang})`, async ({ browser }) => {
      const context = await newContext(browser, { ip: clientIp(run, `bogus-${lang}`), lang: lang === 'fr' ? 'fr-FR' : 'en-US' });
      const page = await context.newPage();
      try {
        await page.goto(`/join/${'x'.repeat(20)}`);
        await expect(page.getByRole('heading', { name: fmt('page.auth.inviteUnavailable', {}, lang) })).toBeVisible();
        await expect(page.getByRole('button', { name: fmt('page.auth.goToSignIn', {}, lang) })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});

/* =====================================================================
   PROJECT SHARE MODAL (UAT-04)
   ===================================================================== */

test.describe('project share modal', () => {
  for (const lang of ['en', 'fr']) {
    test(`the share modal adds a member by email with a catalogue-labelled permission select (${lang})`, async ({ browser }) => {
      const owner = FLOW[lang].shareOwner;
      const target = FLOW[lang].target;
      const wsName = FLOW[lang].shareWsName;
      const projectName = FLOW[lang].projectName;
      const context = await newContext(browser, { ip: owner.ip });
      const page = await context.newPage();
      try {
        await signIn(page, owner);

        /* Open the project from the projects grid, then its share modal. */
        await page.getByRole('button', { name: fmt('nav.route.projects', {}, lang) }).first().click();
        await page.locator(`[data-a='go'][data-r='project'][aria-label="${projectName}"]`).click();
        await page.getByRole('button', { name: fmt('act.share', {}, lang), exact: true }).click();

        /* Header and the two access sections. */
        await expect(page.getByRole('heading', { name: fmt('modal.shareTitle', { name: projectName }, lang), level: 2 })).toBeVisible();
        await expect(page.getByText(fmt('modal.peopleWithAccess', {}, lang))).toBeVisible();
        await expect(page.getByText(fmt('modal.generalAccess', {}, lang))).toBeVisible();

        /* The general-access select renders both catalogue options without
           needing to change it. */
        const accessOptions = await page.locator(`select[data-in='shareAccess'] option`).allTextContents();
        expect(accessOptions).toEqual([fmt('modal.onlyInvited', {}, lang), fmt('modal.everyoneAt', { name: wsName }, lang)]);

        /* Add the existing workspace member by email; the permission select
           is driven by its RENDERED catalogue label (I18N-07: selecting by
           option value text would fail in French). */
        await page.getByLabel(fmt('a11y.inviteByEmail', {}, lang), { exact: true }).fill(target.email);
        await page.locator('#share-perm').selectOption({ label: fmt('common.perm.view', {}, lang) });
        await page.getByRole('button', { name: fmt('act.invite', {}, lang), exact: true }).click();

        /* The outcome: the shared toast and the member row's own permission
           select, holding the machine value behind the chosen label. */
        await expect(page.getByText(fmt('toast.sharedWith', { name: target.name }, lang))).toBeVisible();
        const permSelect = page.locator(`select[data-in='sharePerm'][aria-label="${fmt('modal.permissionFor', { name: target.name }, lang)}"]`);
        await expect(permSelect).toBeVisible();
        await expect(permSelect).toHaveValue('Can view');
      } finally {
        await context.close();
      }
    });
  }
});