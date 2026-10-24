/* =====================================================================
   PHASE 10 FLOWS WAVE 1 (UAT-01..UAT-04, D-01, D-03): the first four
   flows of the eight-flow matrix, proven in Chromium as full happy paths
   asserted at every step with role/label/text selectors plus toasts —
   in English and in French. This file owns:
     - onboarding wizard  (UAT-01): browser signup → wizard → workspace
     - invite modal       (UAT-02): header/input/submit/toast + link row
     - /join page         (UAT-03): fresh visitor accepts, invalid token
     - project share modal(UAT-04): add by email, permission select
   Wave 2 completes the matrix in this same file:
      - workspace switcher  (UAT-06): switch between two API-fixture workspaces
      - member removal      (UAT-05): context menu → app's own confirm dialog → toast
      - billing-free state  (UAT-07, reinterpreted): absence proof, both locales
      - project creation    (UAT-08): modal by role/name, fill by label, submit

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

    /* UAT-06 switcher fixture: a second workspace owned by the SAME
       account, created through the API (D-04 — the UI proves the switch,
       not the creation). */
    const swi = await createAccount(BASE_URL, run, `swi-${lang}`, `Switch Owner ${lang}`, {
      locale: lang,
      workspace: `swi-${lang}-${run}`,
    });
    const second = await must('switcher second workspace', await swi.client.post('/api/workspaces', { name: `Locale swi2-${lang} ${run}`, slug: `swi2-${lang}-${run}` }), [201]);

    /* UAT-05 member-removal fixture: an owner plus a real member that
       joined through the API invite/accept chain (so removeMember finds a
       userId to remove — invited-only rows error). */
    const rem = await createAccount(BASE_URL, run, `rem-${lang}`, `Remove Owner ${lang}`, {
      locale: lang,
      workspace: `rem-${lang}-${run}`,
    });
    const remm = await createAccount(BASE_URL, run, `remm-${lang}`, `Removed Member ${lang}`);
    const remInvite = await must('removal member invite', await rem.client.post(`/api/workspaces/${rem.account.slug}/invites`, { emails: [remm.account.email], role: 'member' }), [201]);
    await must('removal member accept', await remm.client.post(`/api/invites/${inviteToken(remInvite.invites[0].url)}/accept`, {}), [200, 201]);

    FLOW[lang] = {
      inviteOwner: inv.account,
      inviteClient: inv.client,
      inviteWsName: `Locale inv-${lang} ${run}`,
      shareOwner: shr.account,
      shareWsName: `Locale shr-${lang} ${run}`,
      target: tgt.account,
      projectName: `Share Roadmap ${lang} ${run}`,
      switchOwner: swi.account,
      switchClient: swi.client,
      switchFirst: { name: `Locale swi-${lang} ${run}`, slug: swi.account.slug },
      switchSecond: { name: second.workspace.name, slug: second.workspace.slug },
      remOwner: rem.account,
      remOwnerClient: rem.client,
      removedMember: remm.account,
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

/* =====================================================================
   WORKSPACE SWITCHER (UAT-06, popovers.js 'ws' case)
   Two workspaces owned by one account, both created through the API in
   beforeAll (D-04); the browser proves the SWITCH, not the creation.
   ===================================================================== */

/* The switcher surfaces, per locale: popover heading, the Owner role
   label both fixture workspaces render, and the create entry. */
function switcherDict(lang) {
  return {
    heading: fmt('popover.workspaces', {}, lang),
    ownerRole: fmt('common.role.owner', {}, lang),
    first: FLOW[lang].switchFirst,
    second: FLOW[lang].switchSecond,
  };
}

test.describe('workspace switcher', () => {
  for (const lang of ['en', 'fr']) {
    test(`the switcher popover moves between two workspaces and lands on the new one (${lang})`, async ({ browser }) => {
      const d = switcherDict(lang);
      const owner = FLOW[lang].switchOwner;
      const context = await newContext(browser, { ip: owner.ip });
      const page = await context.newPage();
      try {
        await signIn(page, owner);

        /* Open the switcher from the workspace button; the popover lists
           both fixture workspaces with their role labels, and marks the
           current one with the check affordance. */
        await page.locator('button.ws').click();
        await expect(page.getByText(d.heading)).toBeVisible();
        for (const ws of [d.first, d.second]) {
          const row = page.locator(`button[data-a='switchWs'][data-v='${ws.slug}']`);
          await expect(row).toBeVisible();
          await expect(row).toContainText(ws.name);
          await expect(row).toContainText(d.ownerRole);
        }
        await expect(page.locator(`button[data-a='switchWs'][data-v='${d.first.slug}'] .ck`)).toBeVisible();
        await expect(page.locator(`button[data-a='switchWs'][data-v='${d.second.slug}'] .ck`)).toHaveCount(0);

        /* Switch to the second workspace: URL and rendered name both move. */
        await page.locator(`button[data-a='switchWs'][data-v='${d.second.slug}']`).click();
        await expect(page).toHaveURL(new RegExp(`/w/${d.second.slug}$`));
        await expect(page.locator('button.ws')).toContainText(d.second.name);
      } finally {
        await context.close();
      }
    });
  }
});

/* =====================================================================
   MEMBER REMOVAL (UAT-05, A.removeMember at actions.js)
   The context menu opens the app's own confirm dialog (`.modal-wrap
   .modal`; no Playwright `dialog` event is involved). Only catalogue-
   backed surfaces are asserted: title, ok button, toast — never the
   confirm body, which holds a deliberately deferred raw-English splice
   (actions.js removeMember body) and must stay unasserted in BOTH
   locales.
   ===================================================================== */

/* The removal surfaces, per locale, keyed on the member being removed. */
function removalDict(lang, memberName) {
  return {
    membersRoute: fmt('nav.route.members', {}, lang),
    rowOptions: fmt('a11y.memberOptions', {}, lang),
    removeEntry: fmt('act.removeFromWorkspace', {}, lang),
    title: fmt('act.removeTitle', { name: memberName }, lang),
    ok: fmt('act.removeMember', {}, lang),
    toast: fmt('toast.removed', { name: memberName }, lang),
  };
}

test.describe('member removal', () => {
  for (const lang of ['en', 'fr']) {
    test(`the owner removes a member through the row's context menu and the app's confirm dialog (${lang})`, async ({ browser }) => {
      const owner = FLOW[lang].remOwner;
      const member = FLOW[lang].removedMember;
      const d = removalDict(lang, member.name);
      const context = await newContext(browser, { ip: owner.ip });
      const page = await context.newPage();
      try {
        await signIn(page, owner);
        await page.locator(`[data-a='go'][data-r='members']`).first().click();
        await expect(page.getByRole('heading', { name: d.membersRoute })).toBeVisible();

        /* The member row's options menu carries the remove entry. */
        const row = page.locator(`tr[data-ctx='member']`, { hasText: member.email });
        await expect(row).toBeVisible();
        await row.getByRole('button', { name: d.rowOptions }).click();
        await page.getByRole('button', { name: d.removeEntry }).click();

        /* The app's own confirm dialog: title + danger ok button, inside
           the modal wrap (box presence only — the body is never asserted). */
        await expect(page.locator('.modal-wrap .modal').last()).toBeVisible();
        await expect(page.getByRole('heading', { name: d.title })).toBeVisible();
        const okButton = page.locator(`[data-a='confirmOk']`);
        await expect(okButton).toContainText(d.ok);
        await expect(okButton).toHaveClass(/btn-danger/);
        await okButton.click();

        /* The removed toast fires immediately (~4.2 s lifetime), and the
           member row is gone from the members surface. */
        await expect(page.getByText(d.toast)).toBeVisible();
        await expect(page.locator(`tr[data-ctx='member']`, { hasText: member.email })).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
  }
});

/* =====================================================================
   BILLING-FREE STATE (UAT-07, REINTERPRETED — user decision 2026-10-24)
   The plan-change flow was deliberately removed in phase 7 (commit
   45e3c42; the `/plan` endpoint 404s per test/membership.test.mjs). No
   flow is restored and REQUIREMENTS.md is not reworded: UAT-07 is
   proven as the ABSENCE of the billing surface — the settings page
   renders no plan/billing group in either locale, and the endpoint
   stays 404 (an API-side absence check alongside, never a substitute).
   ===================================================================== */

/* The removed keys' former vocabulary (git show 45e3c42, en.json) plus
   the natural French words a reintroduced billing group would render —
   each asserted absent from the settings surface. */
const BILLING_ABSENT = {
  en: ['Plan', 'Billing', 'Billing email', 'Billing address', 'Invoices', 'Upgrade', 'Downgrade', 'Current plan'],
  fr: ['Plan', 'Facturation', 'Facture', 'Adresse de facturation', 'Abonnement', 'Améliorer', 'Rétrograder', 'Moyens de paiement'],
};

test.describe('billing-free state (UAT-07 reinterpretation)', () => {
  for (const lang of ['en', 'fr']) {
    test(`the settings surface renders no plan/billing group and the plan endpoint stays 404 (${lang})`, async ({ browser }) => {
      const owner = FLOW[lang].remOwner;
      const context = await newContext(browser, { ip: owner.ip });
      const page = await context.newPage();
      try {
        await signIn(page, owner);
        await page.locator(`[data-a='go'][data-r='settings']`).first().click();

        /* The settings page really renders in the account's language
           (the workspace section's catalogue nav is visible), so the
           absence below is not an English-render artifact. */
        await expect(page.getByRole('button', { name: fmt('settings.nav.workspace', {}, lang) })).toBeVisible();

        /* No element on the settings surface matches the removed
           billing vocabulary. */
        for (const word of BILLING_ABSENT[lang]) {
          expect(await page.getByText(word, { exact: true }).count()).toBe(0);
        }

        /* API-side absence check alongside the browser assertions: the
           plan endpoint is gone for the owner too. */
        const res = await FLOW[lang].remOwnerClient.post(`/api/workspaces/${owner.slug}/plan`, { plan: 'Team' });
        if (res.status !== 404) throw new Error(`plan endpoint responded ${res.status}, expected 404`);
      } finally {
        await context.close();
      }
    });
  }
});

/* =====================================================================
   PROJECT CREATION (UAT-08, A.newProject at actions.js:1289)
   The modal opens by role/name, is filled by its catalogue label, and
   the created project's visible result is asserted. The name mixes
   case and accents to exercise makeKey's derivation. Both variants run
   on the removal owner's workspace (still owned, still intact after
   the member was removed).
   ===================================================================== */

/* The creation surfaces, per locale, keyed on the project name. */
function newProjectDict(lang, projectName) {
  return {
    projectsRoute: fmt('nav.route.projects', {}, lang),
    newButton: fmt('act.newProject', {}, lang),
    header: fmt('act.newProject', {}, lang),
    hint: fmt('modal.projectHint', {}, lang),
    nameLabel: fmt('modal.projectName', {}, lang),
    submit: fmt('palette.createProject', {}, lang),
    toast: fmt('toast.createdProject', { name: projectName }, lang),
  };
}

test.describe('project creation', () => {
  for (const lang of ['en', 'fr']) {
    test(`a project is created from the modal with a mixed-case accented name (${lang})`, async ({ browser }) => {
      const owner = FLOW[lang].remOwner;
      const projectName = `Übergabe Éclair ${lang} ${run}`;
      const d = newProjectDict(lang, projectName);
      const context = await newContext(browser, { ip: owner.ip });
      const page = await context.newPage();
      try {
        await signIn(page, owner);
        await page.locator(`[data-a='go'][data-r='projects']`).first().click();

        /* Open the modal from the projects header button. */
        await page.getByRole('button', { name: d.newButton }).click();

        /* Modal header and hint, then the labelled name field. */
        await expect(page.getByRole('heading', { name: d.header, level: 2 })).toBeVisible();
        await expect(page.getByText(d.hint)).toBeVisible();
        await page.getByLabel(d.nameLabel, { exact: true }).fill(projectName);
        await page.getByRole('button', { name: d.submit }).click();

        /* The visible result: the created toast and the project rendered
           in the sidebar's project list (the key derivation ran on the
           mixed-case accented name by construction). */
        await expect(page.getByText(d.toast)).toBeVisible();
        await expect(page.locator(`[data-a='go'][data-r='project']`, { hasText: projectName })).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
});