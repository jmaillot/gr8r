/* =====================================================================
   PHASE 7 BROWSER PROOF (D-15, I18N-07): the French interface renders in
   a real Chromium session, fits the fixed-size chrome at 1280 px and
   390 px, and the locale switch re-renders without a reload and settles.

   The spec follows the existing suite's conventions: role/label/text
   selectors for every visibility claim, one browser context per account,
   fixtures through the real API (helpers/setup.mjs). The only structural
   selectors are the shell's own layout roots (.side, .topbar, .modal-f)
   — they exist to be measured, which is what D-15 asks for; no product
   visibility claim rests on them.
   ===================================================================== */
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, inviteToken, newRunId } from './helpers/setup.mjs';
import en from '../src/locales/en.json' with { type: 'json' };
import frCatalogue from '../src/locales/fr.json' with { type: 'json' };

/* A dedicated account and workspace for the French proof. The language is
   an account property (phase 8: users.locale, written through PATCH
   /api/auth/me), so switching Français here changes only this throwaway
   account — it can never reach the accounts or workspaces the English-pinned
   suite (tenancy.spec) reads; the files share one server per run and may run
   concurrently. The workspace is still dedicated so the English fixtures this
   file creates stay out of the shared suite's data. */
let fr;

test.beforeAll(async () => {
  const run = newRunId();
  const account = {
    email: `french-${run}@e2e.local`,
    password: PASSWORD,
    name: 'French Reader',
    ip: clientIp(run, 'french'),
    slug: `french-${run}`,
  };
  const client = apiClient(BASE_URL, { name: 'french', ip: account.ip });
  const signup = await client.post('/api/auth/signup', { name: account.name, email: account.email, password: account.password });
  if (signup.status !== 201) throw new Error(`french signup failed with HTTP ${signup.status}: ${signup.data?.error || ''}`);
  const ws = await client.post('/api/workspaces', { name: `French ${run}`, slug: account.slug });
  if (ws.status !== 201) throw new Error(`french workspace failed with HTTP ${ws.status}: ${ws.data?.error || ''}`);
  fr = { account };
});

/* The product routes the proof enumerates: every ROUTE_IDS entry that is a
   user-facing product surface. Three kinds of id stay out on purpose:
   'member' and 'team' are detail pages that need an entity id in the URL,
   and 'system'/'states' are the design-system showcase pages (developer
   references behind the help popover, not product surfaces). Phase 10
   widens browser coverage. */
const ROUTES = [
  'home',
  'inbox',
  'mytasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'projects',
  'tasks',
  'calendar',
  'timeline',
  'members',
  'teams',
  'activity',
  'settings',
  'archive',
];

const VIEWPORTS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
];

/* One browser context per account: its own cookies, never another tenant's. */
async function signIn(browser, account, viewport) {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    ...(viewport ? { viewport } : {}),
    extraHTTPHeaders: { 'x-forwarded-for': account.ip },
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${account.slug}$`));
  return { context, page };
}

/* The app has booted in French: the shell is rendered and the D-01 wiring
   (account locale from /api/auth/me → primeLocale before the first render) has applied. */
async function frenchShell(page) {
  await expect(page.locator('.content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
  await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
}

/* Read-only box math on the shell's layout roots. An intentionally hidden
   element (display:none) or the mobile menu parked off-canvas by a
   transform is reported as null: a hidden menu is not clipped chrome. */
async function chromeBoxes(page) {
  return page.evaluate(() => {
    const box = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      if (cs.position === 'fixed' && cs.transform && cs.transform !== 'none') return null;
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
    };
    return { side: box('.side'), top: box('.topbar') };
  });
}

function expectWithin(box, viewport, what) {
  expect(box.left, `${what} starts left of the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.top, `${what} starts above the viewport`).toBeGreaterThanOrEqual(0);
  expect(box.right, `${what} is clipped by the right edge`).toBeLessThanOrEqual(viewport.width);
  expect(box.bottom, `${what} is clipped by the bottom edge`).toBeLessThanOrEqual(viewport.height);
}

test('switching the selector to Français re-renders without a reload and settles', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    /* English fixtures first: one project and one task, so the
       stored-vocabulary proof has data to render. */
    await page.getByRole('button', { name: 'New project' }).first().click();
    await page.getByLabel('Project name').fill('Probe');
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByText('Probe').first()).toBeVisible();

    /* Back to the workspace home deterministically — creating the project
       may navigate — then create the task from the home header. */
    await page.goto(`/w/${fr.account.slug}/home`);
    await page.getByRole('button', { name: 'New task' }).first().click();
    await page.getByLabel('Task name').fill('Overflow probe');
    await page.getByRole('button', { name: 'Create task' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto(`/w/${fr.account.slug}/mytasks`);
    await expect(page.getByText('Overflow probe').first()).toBeVisible();

    /* The real D-01 selector path: settings → language row → Français. */
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Language', level: 1 })).toBeVisible();
    await page.evaluate(() => {
      window.__survived = 'no-reload';
    });
    /* The honest selector: two options, labelled in their own names. The
       change persists through the account PATCH, awaited below. */
    const language = page.getByRole('button', { name: 'Language', exact: true, expanded: false });
    await language.click();
    await expect(page.getByRole('option')).toHaveText(['English', 'Français']);
    const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
    await page.getByRole('option', { name: 'Français' }).click();

    /* The document language follows (D-02), the shell re-rendered in
       French, and nothing was reloaded to get there. */
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
    await expect(page.getByRole('heading', { name: 'Langue', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Projets' }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__survived), 'the switch re-rendered in place').toBe('no-reload');

    /* Loop safety (07-RESEARCH risk 1): after the switch the interface
       settles. A MutationObserver on the render root must count zero
       mutations over 1.5 s — a render loop would rewrite #app every
       cycle — and two DOM snapshots 500 ms apart are identical. */
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.__mutations = 0;
      new MutationObserver(entries => {
        window.__mutations += entries.length;
      }).observe(document.getElementById('app'), { childList: true, subtree: true, attributes: true, characterData: true });
    });
    const before = await page.evaluate(() => document.getElementById('app').innerHTML);
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => document.getElementById('app').innerHTML);
    expect(after, 'the rendered interface drifts after the switch').toBe(before);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => window.__mutations), 'the interface keeps re-rendering after the switch (render loop)').toBe(0);

    /* Persistence: the account PATCH answered 200, so a fresh boot comes up
       French from users.locale — the same path every later test relies on. */
    expect((await saved).status(), 'the account locale write failed').toBe(200);
    await page.reload();
    await frenchShell(page);
  } finally {
    await context.close();
  }
});

for (const vp of VIEWPORTS) {
  test(`the main routes fit the fixed chrome in French at ${vp.width}×${vp.height}`, async ({ browser }) => {
    const { context, page } = await signIn(browser, fr.account, vp);
    try {
      for (const route of ROUTES) {
        await page.goto(`/w/${fr.account.slug}/${route}`);
        await frenchShell(page);

        /* Check 1 of 2 — horizontal document overflow. The document must
           never grow wider than the viewport, whatever its content panes
           scroll internally. */
        const { sw, cw } = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
        }));
        expect(sw, `${route}: the document overflows horizontally in French at ${vp.width}px (${sw} > ${cw})`).toBeLessThanOrEqual(cw);

        /* Check 2 of 2 — the fixed chrome is unbroken. Separate from the
           overflow check on purpose: a legitimately scrollable content
           pane must not fail a fixed-chrome assertion (07-RESEARCH). */
        const boxes = await chromeBoxes(page);
        expect(boxes.top, `${route}: the top bar is missing at ${vp.width}px`).not.toBeNull();
        expectWithin(boxes.top, vp, `${route}: the top bar`);
        if (boxes.side) expectWithin(boxes.side, vp, `${route}: the sidebar`);
      }
    } finally {
      await context.close();
    }
  });
}

for (const vp of VIEWPORTS) {
  test(`the new-task modal renders its footer and primary button unbroken in French at ${vp.width}×${vp.height}`, async ({ browser }) => {
    const { context, page } = await signIn(browser, fr.account, vp);
    try {
      await page.goto(`/w/${fr.account.slug}/home`);
      await frenchShell(page);
      await page.getByRole('button', { name: 'Nouvelle tâche' }).click();

      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('heading', { name: 'Nouvelle tâche', level: 2 })).toBeVisible();

      const boxes = await page.evaluate(() => {
        const box = el => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        };
        const wrap = document.querySelector('.modal-wrap .modal');
        const foot = wrap?.querySelector('.modal-f');
        return { modal: wrap ? box(wrap) : null, footer: foot ? box(foot) : null };
      });
      expect(boxes.modal, 'the modal is missing').not.toBeNull();
      expectWithin(boxes.modal, vp, 'the modal');
      expect(boxes.footer, 'the modal footer is missing').not.toBeNull();
      expectWithin(boxes.footer, vp, 'the modal footer');

      const submit = page.getByRole('button', { name: 'Créer une tâche' });
      await expect(submit).toBeVisible();
      expectWithin(
        await submit.evaluate(el => {
          const r = el.getBoundingClientRect();
          return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) };
        }),
        vp,
        'the modal primary button',
      );
    } finally {
      await context.close();
    }
  });
}

test('a stored status id renders its French label while the data attribute keeps the English id (I18N-07)', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    /* The board column: the stored status id stays English in the data
       attribute the drag-and-drop reads, the rendered label is French.
       The project key is the uppercase initials code makeKey() derived. */
    await page.goto(`/w/${fr.account.slug}/project/PRO`);
    await frenchShell(page);
    const col = page.locator('section[data-drop-col="todo"]');
    await expect(col, 'the To Do column lost its stored status id').toHaveAttribute('data-drop-col', 'todo');
    await expect(col.getByText('À faire').first()).toBeVisible();
    await expect(col.getByText('Overflow probe')).toBeVisible();

    /* The task list's status pill renders the French label too. */
    await page.goto(`/w/${fr.account.slug}/mytasks`);
    await frenchShell(page);
    const row = page.locator('[data-task-row]').filter({ hasText: 'Overflow probe' });
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: /À faire/ }).first()).toBeVisible();
  } finally {
    await context.close();
  }
});

/* The D-16 read-through found the project tab bar still English after the
   switch: PTABS was a module-level const whose t() calls froze the
   import-time locale into the labels. The fix reads the catalogue at render
   time (ptabs()); this test pins the regression — every project tab renders
   its French label and no unambiguous English label survives. */
test('the project tab bar reads its labels from the catalogue at render time, not at import', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    await page.goto(`/w/${fr.account.slug}/projects`);
    await frenchShell(page);
    await page.getByRole('link', { name: 'Probe', exact: true }).click();
    await frenchShell(page);

    for (const label of ['Vue d’ensemble', 'Tableau', 'Liste', 'Table', 'Calendrier', 'Chronologie', 'Fichiers', 'Activité']) {
      await expect(page.getByRole('button', { name: label }).first()).toBeVisible();
    }
    /* 'Table' is deliberately absent from the negation: the French value is
       identical to the English one, so an exact-match English probe would
       false-positive on the legitimate French label. */
    for (const label of ['Overview', 'Board', 'Calendar', 'Timeline', 'Files', 'Activity']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

/* The D-16 read-through found the Settings → Équipes tab dead: teamsGrid()'s
   map parameter shadowed the catalogue t, so t('page.teams.nMembers') called
   the team object as a function and the page never rendered. The fix renames
   the parameter; this test pins the tab — the grid renders with its member
   and project counts, in French, and the teams page itself still loads. */
test('the settings teams tab renders its grid — the shadowed t no longer crashes it', async ({ browser }) => {
  const { context, page } = await signIn(browser, fr.account);
  try {
    await page.goto(`/w/${fr.account.slug}/settings`);
    await frenchShell(page);
    await page.getByRole('button', { name: 'Équipes', exact: true }).click();
    await expect(page.getByText('Les équipes regroupent des personnes et des projets.')).toBeVisible();

    /* The demo workspace seeds teams, so the grid renders real cards with
       the count fragments the crashed lookup used to build. */
    const grid = page.locator('.pgrid');
    await expect(grid).toBeVisible();
    await expect(grid.getByText(/membres/).first()).toBeVisible();
    await expect(grid.getByText(/projets/).first()).toBeVisible();

    /* The standalone teams page renders too — its title uses the same
       namespace and its body the same teamsList source. */
    await page.goto(`/w/${fr.account.slug}/teams`);
    await frenchShell(page);
    await expect(page.getByRole('heading', { name: 'Équipes', level: 1 })).toBeVisible();
  } finally {
    await context.close();
  }
});

/* =====================================================================
   PHASE 11 FRENCH LEAK SWEEP (UAT-10 criterion 1, D-01..D-06): the 16-route
   overflow proof above is widened into a 21-route sweep. Every product
   route, visited as a locale-'fr' API-created account (D-06), must FIRST
   prove a known French marker (D-03 — a blank or error page cannot pass),
   THEN prove that no text node, aria-label, data-tip or document.title
   equals an English-catalogue value from src/locales/en.json minus a small
   commented stop-list (D-02). The scan walks the WHOLE DOM tree with no
   visibility filter (D-05) — the deliberate opposite of chromeBoxes()
   above. The route list is pinned data of exactly 21 entries (D-03/D-04);
   adding route 22 without updating it fails loudly on the length assert.
   ===================================================================== */

/* The comparison contract is encoding-safe on both sides (UAT-10 edges):
   the English side comes from JSON.parse-decoded catalogue values (the
   import-with-type form decodes \uXXXX escapes), the DOM side is read as
   the browser's already-decoded text (TreeWalker nodeValue and getAttribute
   are entity-decoded), and both are NFC-normalized, trimmed, with inner
   whitespace collapsed before the Set membership test. */
const norm = s => String(s).normalize('NFC').trim().replace(/\s+/g, ' ');

/* Flatten the catalogue to its leaf string values — the leak heuristic's
   only word source (D-02): never a hand-maintained word list. */
function catalogueLeaves(node, out = []) {
  for (const v of Object.values(node)) {
    if (typeof v === 'string') out.push(v);
    else if (v && typeof v === 'object') catalogueLeaves(v, out);
  }
  return out;
}
const EN_VALUES = catalogueLeaves(en).map(norm);

/* Interpolate a catalogue value with the same {name}/{n} subset t() uses
   (the flows.spec pattern): asserted strings are read from the catalogue,
   never transcribed (10-REVIEW WR-01). */
function fmt(key, vars, lang = 'fr') {
  let s = { en, fr: frCatalogue }[lang][key];
  if (s === undefined) throw new Error(`catalogue key missing in ${lang}: ${key}`);
  if (typeof s === 'object') s = s[new Intl.PluralRules(lang).select(vars?.n ?? 1)] ?? s.other;
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}

/* The sweep's fixture account, filled in beforeAll (D-06): created through
   the real API with locale 'fr', a dedicated workspace, one seeded project
   and one seeded task (API only, never browser-created), plus a real invite
   token for the /join surface. */
let sweep;

/* The pinned route list (D-03/D-04): the 16 overflow routes plus the 5
   phase-10 additions — the param-dependent detail routes 'member' and
   'team', the project detail route, the /join page and the auth page.
   Prototype pages ('system', 'states') stay excluded per PROJECT.md D-15. */
const SWEEP_ROUTES = [
  'home',
  'inbox',
  'mytasks',
  'favorites',
  'notifications',
  'search',
  'overview',
  'projects',
  'tasks',
  'calendar',
  'timeline',
  'members',
  'teams',
  'activity',
  'settings',
  'archive',
  'member',
  'team',
  'project',
  'join',
  'auth',
];
test('the sweep pins exactly 21 routes — adding route 22 without updating the list fails loudly', () => {
  expect(SWEEP_ROUTES).toHaveLength(21);
  expect(new Set(SWEEP_ROUTES).size).toBe(21);
});

test.beforeAll(async () => {
  const run = newRunId();
  const made = await createAccount(BASE_URL, run, 'sweep', 'Sweep Reader', {
    locale: 'fr',
    workspace: `sweep-${run}`,
  });
  const { account, client } = made;

  /* Seed one project + one task through the document API so list and detail
     surfaces render real rows (fixtures never go through the browser UI). */
  const docRes = await client.get(`/api/workspaces/${account.slug}`);
  if (docRes.status !== 200) throw new Error(`sweep doc failed with HTTP ${docRes.status}`);
  const doc = docRes.data.doc;
  const memberId = docRes.data.memberId;
  const projectId = 'p_sweep_probe';
  doc.data.projects = [
    ...(doc.data.projects || []),
    {
      id: projectId,
      key: 'SWP',
      name: `Sweep Probe ${run}`,
      icon: 'map',
      color: 'indigo',
      status: 'active',
      team: null,
      lead: memberId,
      due: null,
      start: null,
      fav: false,
      members: [memberId],
      desc: '',
      milestones: [],
      last: 0,
      private: false,
      perms: {},
    },
  ];
  doc.data.projOrder = [...(doc.data.projOrder || []), projectId];
  doc.data.tasks = [
    ...(doc.data.tasks || []),
    {
      id: 'p_sweep_task',
      key: 'SWP-101',
      project: projectId,
      title: `Sweep overflow probe ${run}`,
      status: 'todo',
      assignee: memberId,
      priority: 'medium',
      due: null,
      start: null,
      labels: [],
      subtasks: [],
      attachments: [],
      deps: [],
      desc: '',
      estimate: null,
      created: 0,
      updated: 0,
      order: 1,
      fav: false,
      recur: null,
    },
  ];
  const put = await client.put(`/api/workspaces/${account.slug}`, { revision: docRes.data.revision, doc });
  if (put.status !== 200) throw new Error(`sweep fixtures failed with HTTP ${put.status}: ${put.data?.error || ''}`);

  /* A real invite token so /join renders a live invite preview. */
  const invite = await client.post(`/api/workspaces/${account.slug}/invites`, {
    emails: [`sweep-guest-${run}@e2e.local`],
    role: 'member',
  });
  if (invite.status !== 201) throw new Error(`sweep invite failed with HTTP ${invite.status}`);
  sweep = { run, account, client, memberId, projectId, projectKey: 'SWP', joinToken: inviteToken(invite.data.invites[0].url) };
});

/* The D-03 French-marker precondition, generalized: the document language is
   fr, and the route's own catalogue-driven marker is present. For workspace
   routes the marker is the document title — the render loop builds it from
   the catalogue (routeName / the active project tab), so a blank or error
   page cannot carry it. Markers come from the fr catalogue via fmt() —
   never a hardcoded transcription. */
async function frenchMarker(page, route, extra) {
  /* The shell's content root exists on workspace routes only — the
     anonymous auth surfaces render their own layout. */
  if (route !== 'join' && route !== 'auth') await expect(page.locator('.content')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr');
  if (route === 'auth') {
    await expect(page.getByRole('heading', { name: fmt('page.auth.welcomeBack') })).toBeVisible();
  } else if (route === 'join') {
    await expect(page.getByRole('heading', { name: fmt('page.auth.joinTitle', { name: `Locale sweep ${sweep.run}` }) })).toBeVisible();
  } else if (route === 'project') {
    await expect.poll(() => page.evaluate(() => document.title)).toContain(fmt('page.project.tab.board'));
  } else if (route === 'member') {
    await expect.poll(() => page.evaluate(() => document.title)).toContain(extra);
  } else if (route === 'team') {
    await expect.poll(() => page.evaluate(() => document.title)).toContain(extra);
  } else {
    await expect.poll(() => page.evaluate(() => document.title)).toContain(fmt('nav.route.' + route));
  }
}

/* The D-02/D-05 leak scan: one evaluate walking the WHOLE document.body
   tree — text nodes, aria-label, data-tip and document.title, hidden nodes
   included (no visibility filter) — flagging every scanned value that
   equals an English-catalogue value under the normalization contract,
   minus the commented stop-list. */
const STOP_LIST = [
  // 'Projects Studio' — the app name is the brand: identical in every locale, so
  // its catalogue presence on the auth/join document.title is not a leak.
  'Projects Studio',
  // 'Projects Studio' — the logo wordmark's aria-label: the brand, identical in every
  // locale.
  'Projects Studio',
  // 'Notifications' — the French catalogue value is identical to the English
  // one (the 'Table' precedent from the project tab bar): a locale-'fr'
  // render legitimately shows this exact string.
  'Notifications',
  // 'Mentions' — identical French and English catalogue values (same
  // rationale as 'Notifications').
  'Mentions',
  // 'Backlog' — identical French and English catalogue values (same
  // rationale as 'Notifications').
  'Backlog',
  // 'Table' — identical French and English catalogue values (the case the
  // project-tab-bar test above already documents).
  'Table',
  // 'Admin' — the role label's French catalogue value is identical to the
  // English one (common.role.admin).
  'Admin',
  // The strings below all have identical French and English catalogue values
  // (settings vocabulary and the colour palette names — cognates that French
  // UI convention keeps as-is), so a locale-'fr' render legitimately shows
  // them. Each was verified against src/locales/fr.json.
  'Permissions',
  'Sessions',
  'Accent',
  'Compact',
  'Indigo',
  'Violet',
  'Rose',
  'Graphite',
  // Team names below — TEAMS_SEED stored workspace data (client-side first-
  // use seed), which stays English per PROJECT.md D-15: seed content is
  // data, not interface.
  'Design',
  'Engineering',
  'Marketing',
  'Product',
];
async function leakScan(page, route) {
  const leaks = await page.evaluate(
    ({ values, stop }) => {
      const en = new Set(values);
      const allowed = new Set(stop);
      const norm = s => String(s).normalize('NFC').trim().replace(/\s+/g, ' ');
      const hits = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = walker.nextNode())) {
        const text = norm(n.nodeValue);
        if (text && en.has(text) && !allowed.has(text)) hits.push({ surface: 'text', value: text });
      }
      for (const el of document.querySelectorAll('[aria-label], [data-tip]')) {
        for (const attr of ['aria-label', 'data-tip']) {
          const v = norm(el.getAttribute(attr));
          if (v && en.has(v) && !allowed.has(v)) hits.push({ surface: attr, value: v });
        }
      }
      const title = norm(document.title);
      if (title && en.has(title) && !allowed.has(title)) hits.push({ surface: 'title', value: title });
      return hits;
    },
    { values: EN_VALUES, stop: STOP_LIST },
  );
  expect(leaks, `route ${route}: untranslated English served`).toEqual([]);
}

test('the 21-route French sweep: every route proves a French marker, then zero English-catalogue leaks', async ({ browser }) => {
  expect(SWEEP_ROUTES).toHaveLength(21);
  const { context, page } = await signIn(browser, sweep.account);
  try {
    for (const route of SWEEP_ROUTES) {
      /* join/auth are anonymous surfaces swept below; member/team/project
         are param-dependent detail routes swept below with real ids. */
      if (route === 'join' || route === 'auth' || route === 'member' || route === 'team' || route === 'project') continue;
      await page.goto(`/w/${sweep.account.slug}/${route}`);
      await frenchMarker(page, route);
      await leakScan(page, route);
    }

    /* The project detail route (deep link by project key, board tab). */
    await page.goto(`/w/${sweep.account.slug}/project/${sweep.projectKey}`);
    await frenchMarker(page, 'project');
    await leakScan(page, 'project');

    /* The member detail route: reached the way the members table reaches
       it — click the member row (the boot deep-link resolves member ids,
       but the row click is the UI's own path and carries the id directly). */
    await page.goto(`/w/${sweep.account.slug}/members`);
    await frenchMarker(page, 'members');
    await leakScan(page, 'members');
    const memberRow = page.locator(`[data-a="go"][data-r="member"][data-id="${sweep.memberId}"]`);
    await expect(memberRow).toBeVisible();
    await memberRow.click();
    await frenchMarker(page, 'member', sweep.account.name);
    await leakScan(page, 'member');

    /* The team detail route: the boot deep-link carries no team id, so the
       route is reached the way the sidebar reaches it — click a team item. */
    await page.goto(`/w/${sweep.account.slug}/teams`);
    await frenchMarker(page, 'teams');
    await leakScan(page, 'teams');
    const teamItem = page.locator('[data-a="go"][data-r="team"]').first();
    await expect(teamItem).toBeVisible();
    const teamName = (await teamItem.innerText()).trim();
    await teamItem.click();
    await frenchMarker(page, 'team', teamName);
    await leakScan(page, 'team');

    /* The two anonymous surfaces negotiate from the browser (the 10-02
       exception): a fr-FR context, so the login and /join pages render
       French without an account. */
    const anon = await browser.newContext({ baseURL: BASE_URL, locale: 'fr-FR' });
    const anonPage = await anon.newPage();
    try {
      await anonPage.goto(`/join/${sweep.joinToken}`);
      await frenchMarker(anonPage, 'join');
      await leakScan(anonPage, 'join');

      await anonPage.goto('/');
      await frenchMarker(anonPage, 'auth');
      await leakScan(anonPage, 'auth');
    } finally {
      await anon.close();
    }
  } finally {
    await context.close();
  }
});
