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

export const BASE_URL = `http://127.0.0.1:${process.env.E2E_PORT || 4317}`;

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

/* Cookie-bearing API client; the server sets `gr8r_session` on sign-in and signup.
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
      if (pair.startsWith('gr8r_session=')) cookie = pair;
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

function inviteToken(url) {
  const marker = '/join/';
  const at = String(url || '').lastIndexOf(marker);
  if (at === -1) throw new Error(`invite response has no join link: ${url}`);
  return String(url).slice(at + marker.length);
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
 * Two real workspaces owned by two accounts, plus a plain member of the first.
 * Returns the fixture ids the spec navigates with.
 */
/*
 * An account that joins while a browser session is already open. The join
 * happens in another session, which is the case a browser test needs: the
 * workspace must keep accepting the open session's writes.
 */
export async function acceptInvite(base, { email, role = 'member', inviterIp, joinerIp, name = 'Late Joiner' }) {
  const inviter = apiClient(base, { name: 'inviter', ip: inviterIp });
  expectStatus('owner sign-in', await inviter.post('/api/auth/login', { email: OWNER.email, password: OWNER.password }), [200]);

  const joiner = apiClient(base, { name: 'joiner', ip: joinerIp });
  expectStatus('joiner signup', await joiner.post('/api/auth/signup', { name, email, password: PASSWORD }), [201]);

  const invite = expectStatus('joiner invite', await inviter.post('/api/workspaces/acme/invites', { emails: [email], role }), [201]).invites[0];
  expectStatus('joiner accept', await joiner.post(`/api/invites/${inviteToken(invite.url)}/accept`, {}), [200, 201]);
  return email;
}

export async function setupTenants(base = BASE_URL, run = newRunId()) {
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
