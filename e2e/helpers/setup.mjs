/* =====================================================================
   E2E FIXTURES: everything the browser needs, created through the real API.

   Only fixtures live here (accounts, workspaces, invites, projects). The
   spec asserts visibility and 404s in Chromium, never through this client.

   Throttles are per client IP (`X-Forwarded-For` because the server runs
   behind a proxy in production): signup 5/hour/IP, invite accept 5/hour/IP,
   login 10 per 15 minutes per IP+email. Each fixture account therefore
   presents its own per-run address, so repeated local runs never inherit
   another run's budget. The browser contexts use the same run-unique
   address for the same reason.
   ===================================================================== */
import { createHash } from 'node:crypto';
/* Phase 62 (D-03): the two Settings helpers below are the first Playwright
   imports in this file — the helpers drive the real UI (navigation + the two
   waits), while every assertion stays in the specs (D-04). The option/tab
   labels are read from the locale catalogues, never transcribed. */
import { test, expect } from '@playwright/test';
import en from '../../src/locales/en.json' with { type: 'json' };
import frCatalogue from '../../src/locales/fr.json' with { type: 'json' };

const cat = (lang, key) => ({ en, fr: frCatalogue })[lang]?.[key];

export const BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT || 4317}`;

/* Phase 62 (D-01/D-02): assert-once, fail-fast readiness guard. Per D-01 the
   `webServer.url` probe in e2e/playwright.config.mjs is the single owner of
   readiness — there is deliberately NO poll here. Helpers that need the
   server call this once before their first network use: a single plain
   fetch (setup.mjs stays plain-Node ESM, not page.request) that throws a
   clear "server not ready" error instead of letting fixture calls die with
   a raw ECONNREFUSED. No retries, no wait loop — race-free by construction. */
let _serverAsserted = false;
export async function assertServerUp(base = BASE_URL) {
  if (_serverAsserted) return;
  let res;
  try {
    res = await fetch(`${base}/api/health`);
  } catch (e) {
    throw new Error(`e2e server not ready at ${base}/api/health (webServer.url should have gated this): ${e.message}`);
  }
  if (!res.ok) throw new Error(`e2e server /api/health answered HTTP ${res.status} — server not ready`);
  _serverAsserted = true;
}

export const OWNER = Object.freeze({ email: 'e2e-owner@e2e.local', password: 'e2e-owner-password', name: 'E2E Owner' });

export const PASSWORD = 'e2e-password-1';

export const PREFIX = Object.freeze({
  publicProject: 'acme-roadmap',
  publicProjectName: 'Acme Roadmap',
  privateProject: 'secret-roadmap',
  privateProjectName: 'Secret Roadmap',
  betaProject: 'beta-roadmap',
  betaProjectName: 'Beta Roadmap',
});

/* A run-unique client address, so per-IP throttles do not accumulate across runs. */
export function clientIp(run, tag) {
  const h = createHash('sha1').update(`${run}:${tag}`).digest();
  return `10.${h[0]}.${h[1]}.${(h[2] % 254) + 1}`;
}

export function newRunId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/* =====================================================================
   PHASE 62 (D-03/D-05/D-08): the two composable Settings helpers.

   Exactly one place (this file) knows the lazy-chunk contract
   (src/shell/layout.js: `settings: lazy(() => import('../pages/settings.js'))`)
   and the design-system select contract (src/ui/select.js: the native
   <select> is enhanced into a trigger button (`aria-haspopup="listbox"`,
   accessible name = the current option label) + a `role="listbox"` menu of
   `role="option"` items; the native control is aria-hidden, so no element
   carries role="combobox"). Specs never hand-roll either wait (D-05);
   helpers own navigation and waits only — assertions stay spec-side (D-04).
   ===================================================================== */

/* Navigate to Settings and wait for the lazy chunk by its rendered content —
   a role-based, auto-retrying expect() on the Language tab affordance, never
   a sleep. With `tab: 'language'`, clicks the Language tab and waits for its
   level-1 heading (the arrival signal for the language row). */
export async function openSettings(page, { tab } = {}) {
  /* The Settings entry affordance is the shell nav button; its accessible
     name is catalogue-driven, so resolve it from the catalogue of the
     language the document currently renders (label-from-catalogue, never
     transcribed). */
  const lang = await page.evaluate(() => document.documentElement.lang || 'en');
  const settingsLabel = cat(lang, 'nav.route.settings') || cat('en', 'nav.route.settings');
  await page.getByRole('button', { name: settingsLabel }).click();
  const languageLabel = cat(lang, 'settings.language.title') || cat('en', 'settings.language.title');
  /* THE lazy-chunk wait (D-05): the tab buttons only exist once the Settings
     chunk has rendered. */
  await expect(page.getByRole('button', { name: languageLabel, exact: true })).toBeVisible();
  if (tab === 'language') {
    await page.getByRole('button', { name: languageLabel, exact: true }).click();
    await expect(page.getByRole('heading', { name: languageLabel, level: 1 })).toBeVisible();
  }
}

/* Drive the enhanced language select to `lang` and await the real write path:
   the account locale PATCH /api/auth/me (src/actions/actions.js IN.langSel →
   api.patchMe). The option label is read from the DOM's own native <select>
   (label-from-DOM — never transcribed); the PATCH wait is armed BEFORE the
   option click so the network completion can never be missed (D-08). Returns
   the response — the caller asserts its status spec-side (D-04). */
export async function selectLanguage(page, lang) {
  const label = await page.evaluate(l => {
    const opt = [...document.querySelectorAll('select[data-in="langSel"] option')].find(o => o.value === l);
    if (!opt) throw new Error(`selectLanguage: no option with value "${l}" in select[data-in="langSel"]`);
    return opt.text;
  }, lang);
  const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
  await page.locator('.set-body .select-btn').click();
  await page.getByRole('option', { name: label }).click();
  return saved;
}

/* Cookie-bearing API client; the server sets `projects_session` on sign-in and signup.
   Exported so a spec that needs its own isolated workspace (french-overflow:
   the language switch must not leak into the English-pinned suite) reuses the
   same boot path instead of reimplementing the cookie handling. */
export function apiClient(base, { name, ip }) {
  let cookie = '';

  async function request(method, pathname, body) {
    const headers = { 'x-forwarded-for': ip };
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + pathname, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const line of res.headers.getSetCookie?.() || []) {
      const pair = line.split(';')[0];
      if (pair.startsWith('projects_session=')) cookie = pair;
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* empty body (204) */
    }
    return { status: res.status, data };
  }

  return {
    name,
    ip,
    cookie: () => cookie,
    get: pathname => request('GET', pathname),
    post: (pathname, body) => request('POST', pathname, body),
    put: (pathname, body) => request('PUT', pathname, body),
    patch: (pathname, body) => request('PATCH', pathname, body),
  };
}

function expectStatus(step, res, allowed) {
  if (allowed.includes(res.status)) return res.data;
  const detail = res.data?.error ? `: ${res.data.error}` : '';
  throw new Error(`${step} failed with HTTP ${res.status}${detail}`);
}

export function inviteToken(url) {
  const marker = '/join/';
  const at = String(url || '').lastIndexOf(marker);
  if (at === -1) throw new Error(`invite response has no join link: ${url}`);
  return String(url).slice(at + marker.length);
}

/* Phase 23 (post-merge gate fix): read-modify-write of the shared acme
   document with revision-conflict recovery. Parallel Playwright workers all
   append fixtures to the same seeded workspace, so the revision-guarded PUT
   can lose a race (409 workspaceChanged). Re-read and replay the mutation on
   the fresh revision instead of failing the fixture. */
export async function withAcmeDoc(client, step, mutate, { attempts = 12 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    const got = await client.get('/api/workspaces/acme');
    if (got.status !== 200) throw new Error(`${step}: acme GET failed with HTTP ${got.status}`);
    const doc = got.data;
    mutate(doc);
    const put = await client.put('/api/workspaces/acme', { revision: doc.revision, doc: doc.doc });
    if (put.status === 200) return doc;
    if (put.status !== 409 || i === attempts) {
      throw new Error(`${step} failed with HTTP ${put.status} after ${i} attempt(s): ${JSON.stringify(put.data)?.slice(0, 200)}`);
    }
  }
  throw new Error(`${step}: unreachable`);
}

/* Deterministic shape for the fields the project page reads. */
function project({ id, key, name, members, lead, isPrivate }) {
  return {
    id,
    key,
    name,
    icon: 'map',
    color: 'indigo',
    status: 'active',
    team: null,
    lead,
    due: null,
    start: null,
    fav: false,
    members: [...members],
    desc: '',
    milestones: [],
    last: 0,
    private: !!isPrivate,
    perms: {},
  };
}

/*
 * Locale-aware account creation, promoted from locale.spec.mjs (D-06): signup
 * through the real API, an optional workspace, and an optional account locale
 * written via PATCH /api/auth/me — all with explicit status checks — so the
 * locale is an account property before any browser opens (D-02). Fixtures
 * only through the real API; each account presents its own run-unique
 * clientIp(run, tag) so the per-IP throttles never cross accounts or runs.
 */
export async function createAccount(base, run, tag, name, { locale, workspace } = {}) {
  await assertServerUp(base);
  const account = { email: `${tag}-${run}@e2e.local`, password: PASSWORD, name, ip: clientIp(run, tag), slug: workspace };
  const client = apiClient(base, { name: tag, ip: account.ip });
  expectStatus(`${tag} signup`, await client.post('/api/auth/signup', { name, email: account.email, password: account.password }), [201]);
  if (workspace) {
    expectStatus(`${tag} workspace`, await client.post('/api/workspaces', { name: `Locale ${tag} ${run}`, slug: workspace }), [201]);
  }
  if (locale) {
    expectStatus(`${tag} locale`, await client.patch('/api/auth/me', { locale }), [200]);
  }
  return { account, client };
}

/*
 * Two real workspaces owned by two accounts, plus a plain member of the first.
 * Returns the fixture ids the spec navigates with.
 */
/*
 * An account that joins while a browser session is already open. The join
 * happens in another session, which is the case a browser test needs: the
 * workspace must keep accepting the open session's writes.
 */
export async function acceptInvite(base, { email, role = 'member', inviterIp, joinerIp, name = 'Late Joiner' }) {
  await assertServerUp(base);
  const inviter = apiClient(base, { name: 'inviter', ip: inviterIp });
  expectStatus('owner sign-in', await inviter.post('/api/auth/login', { email: OWNER.email, password: OWNER.password }), [200]);

  const joiner = apiClient(base, { name: 'joiner', ip: joinerIp });
  expectStatus('joiner signup', await joiner.post('/api/auth/signup', { name, email, password: PASSWORD }), [201]);

  const invite = expectStatus('joiner invite', await inviter.post('/api/workspaces/acme/invites', { emails: [email], role }), [201]).invites[0];
  expectStatus('joiner accept', await joiner.post(`/api/invites/${inviteToken(invite.url)}/accept`, {}), [200, 201]);
  return email;
}

export async function setupTenants(base = BASE_URL, run = newRunId()) {
  await assertServerUp(base);
  const ownerClient = apiClient(base, { name: 'owner', ip: clientIp(run, 'owner') });
  expectStatus('owner sign-in', await ownerClient.post('/api/auth/login', { email: OWNER.email, password: OWNER.password }), [200]);

  const ownerMe = await ownerClient.get('/api/auth/me');
  const ownerUser = expectStatus('owner profile', ownerMe, [200]).user;

  /* Tenant 2: a second account with its own workspace. */
  const tenant2 = {
    email: `tenant2-${run}@e2e.local`,
    password: PASSWORD,
    name: 'Tenant Two',
    ip: clientIp(run, 'tenant2'),
    slug: `beta-${run}`,
  };
  const tenant2Client = apiClient(base, { name: 'tenant2', ip: tenant2.ip });
  expectStatus('tenant2 signup', await tenant2Client.post('/api/auth/signup', { name: tenant2.name, email: tenant2.email, password: tenant2.password }), [201]);
  const beta = expectStatus('tenant2 workspace', await tenant2Client.post('/api/workspaces', { name: `Beta ${run}`, slug: tenant2.slug }), [201]).workspace;

  /* Carol: an ordinary member of Acme, invited by the owner and accepting the link. */
  const carol = {
    email: `carol-${run}@e2e.local`,
    password: PASSWORD,
    name: 'Carol Member',
    ip: clientIp(run, 'carol'),
    slug: 'acme',
  };
  const carolClient = apiClient(base, { name: 'carol', ip: carol.ip });
  expectStatus('carol signup', await carolClient.post('/api/auth/signup', { name: carol.name, email: carol.email, password: carol.password }), [201]);

  const invite = expectStatus('carol invite', await ownerClient.post('/api/workspaces/acme/invites', { emails: [carol.email], role: 'member' }), [201])
    .invites[0];
  expectStatus('carol accept', await carolClient.post(`/api/invites/${inviteToken(invite.url)}/accept`, {}), [200, 201]);

  /* Acme: a public project and a private one only the owner is on. */
  const acme = expectStatus('acme document', await ownerClient.get('/api/workspaces/acme'), [200]);
  const ownerMemberId = acme.memberId;
  if (!ownerMemberId) throw new Error('acme membership has no member id');
  const carolUserId = (expectStatus('carol profile', await carolClient.get('/api/auth/me'), [200]).user || {}).id;

  const acmeDoc = acme.doc;
  acmeDoc.data.projects = [
    ...(acmeDoc.data.projects || []),
    project({
      id: 'p_acme_roadmap',
      key: PREFIX.publicProject,
      name: PREFIX.publicProjectName,
      members: [ownerMemberId],
      lead: ownerMemberId,
      isPrivate: false,
    }),
    project({
      id: 'p_secret_roadmap',
      key: PREFIX.privateProject,
      name: PREFIX.privateProjectName,
      members: [ownerMemberId],
      lead: ownerMemberId,
      isPrivate: true,
    }),
  ];
  acmeDoc.data.projOrder = [...(acmeDoc.data.projOrder || []), 'p_acme_roadmap', 'p_secret_roadmap'];
  expectStatus('acme fixtures', await ownerClient.put('/api/workspaces/acme', { revision: acme.revision, doc: acmeDoc }), [200]);

  /* Beta: one public project, so tenant 2 has a document of its own. */
  const betaDoc = expectStatus('beta document', await tenant2Client.get(`/api/workspaces/${beta.slug}`), [200]);
  const tenant2MemberId = betaDoc.memberId;
  if (!tenant2MemberId) throw new Error('beta membership has no member id');
  betaDoc.doc.data.projects = [
    ...(betaDoc.doc.data.projects || []),
    project({
      id: 'p_beta_roadmap',
      key: PREFIX.betaProject,
      name: PREFIX.betaProjectName,
      members: [tenant2MemberId],
      lead: tenant2MemberId,
      isPrivate: false,
    }),
  ];
  betaDoc.doc.data.projOrder = [...(betaDoc.doc.data.projOrder || []), 'p_beta_roadmap'];
  expectStatus('beta fixtures', await tenant2Client.put(`/api/workspaces/${beta.slug}`, { revision: betaDoc.revision, doc: betaDoc.doc }), [200]);

  return {
    run,
    accounts: { owner: { ...OWNER, ip: clientIp(run, 'owner'), slug: 'acme' }, tenant2, carol },
    ids: { ownerUserId: ownerUser.id, ownerMemberId, carolUserId, tenant2MemberId },
    slugs: { acme: 'acme', beta: beta.slug },
    keys: { ...PREFIX },
  };
}
