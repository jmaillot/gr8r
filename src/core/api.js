/* =====================================================================
   API CLIENT — talks to the built-in server when it is present.
   If nothing answers at /api/config (static hosting, `npm run dev` without
   the server), the app falls back to its original local-only demo mode.

   Multi-workspace: every workspace call is scoped to a slug, and the
   server decides what the signed-in account may read or write there.
   ===================================================================== */
const state = {
  enabled: false,
  signup: false,
  mail: false,
  creation: 'admins', // 'open' | 'admins'
  user: null,
  url: '',
  workspaces: [],
  workspace: null,
  memberId: null,
};

/* Base URL for links the user can share. Set by the server (APP_URL or the
   request host); location.origin covers static hosting and the dev server. */
export function appUrl() {
  return state.url || location.origin;
}
export function appHost() {
  return appUrl().replace(/^https?:\/\//, '');
}

/* Path of a workspace in the app, e.g. "/w/acme/project/p1". */
export function wsPath(slug, rest = '') {
  const base = `/w/${slug}`;
  return rest ? `${base}/${String(rest).replace(/^\/+/, '')}` : base;
}

async function call(method, path, body, { keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      keepalive,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: 'Could not reach the server' };
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      /* non-JSON response */
    }
  }
  return { ok: res.ok, status: res.status, data, error: data?.error };
}

function applyUser(data) {
  state.user = data?.user || null;
  state.workspaces = Array.isArray(state.user?.workspaces) ? state.user.workspaces : [];
  return state.user;
}

/* Adopt the revision reported by a server-side document change. Endpoints that
   edit the document (member role, member removal, plan) bump the revision, so
   the client has to follow it — a stale revision makes the next write fail
   with 409 and the edit is lost. */
function adoptRevision(data) {
  const revision = Number(data?.revision);
  if (Number.isInteger(revision) && revision > 0) api.revision = revision;
}

export const api = {
  revision: 0,
  get enabled() {
    return state.enabled;
  },
  get allowSignup() {
    return state.signup;
  },
  get mailEnabled() {
    return state.mail;
  },
  get user() {
    return state.user;
  },
  get workspaces() {
    return state.workspaces;
  },
  get workspace() {
    return state.workspace;
  },
  get memberId() {
    return state.memberId;
  },
  /* Anyone may create a workspace when sign-ups are open; otherwise only an
     owner or admin of an existing workspace may. */
  get canCreateWorkspace() {
    return state.creation === 'open' || state.workspaces.some(w => w.role === 'owner' || w.role === 'admin');
  },
  get url() {
    return appUrl();
  },
  get host() {
    return appHost();
  },
  rolesIn(slug) {
    return state.workspaces.find(w => w.slug === slug)?.role || null;
  },

  async init() {
    const r = await call('GET', '/api/config');
    state.enabled = !!(r.ok && r.data?.app === 'gr8r');
    state.signup = !!r.data?.signup;
    state.mail = !!r.data?.mail;
    state.creation = r.data?.workspaceCreation === 'open' ? 'open' : 'admins';
    state.url = typeof r.data?.url === 'string' ? r.data.url.replace(/\/+$/, '') : '';
    return state.enabled;
  },
  async me() {
    if (!state.enabled) return null;
    const r = await call('GET', '/api/auth/me');
    if (r.ok) applyUser(r.data);
    return state.user;
  },
  async login(email, password) {
    const r = await call('POST', '/api/auth/login', { email, password });
    if (r.ok) applyUser(r.data);
    return r;
  },
  async signup(name, email, password) {
    const r = await call('POST', '/api/auth/signup', { name, email, password });
    if (r.ok) applyUser(r.data);
    return r;
  },
  async logout() {
    await call('POST', '/api/auth/logout');
    state.user = null;
    state.workspaces = [];
    state.workspace = null;
    state.memberId = null;
    this.revision = 0;
  },
  async listWorkspaces() {
    const r = await call('GET', '/api/workspaces');
    if (r.ok) state.workspaces = r.data.workspaces || [];
    return r;
  },
  async loadWorkspace(slug) {
    const r = await call('GET', `/api/workspaces/${encodeURIComponent(slug)}`);
    if (r.ok) {
      state.workspace = {
        id: r.data.id,
        name: r.data.name,
        slug: r.data.slug,
        color: r.data.color,
        role: r.data.role,
      };
      state.memberId = r.data.memberId || null;
      this.revision = r.data.revision;
      state.workspaces = state.workspaces.map(w => (w.id === r.data.id ? { ...w, name: r.data.name, slug: r.data.slug, color: r.data.color } : w));
    } else if (r.status === 404) {
      state.workspace = null;
      state.memberId = null;
    }
    return r;
  },
  async createWorkspace(name, slug) {
    const r = await call('POST', '/api/workspaces', { name, slug: slug || undefined });
    if (r.ok) state.workspaces = [...state.workspaces, r.data.workspace];
    return r;
  },
  async patchWorkspace(patch) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('PATCH', `/api/workspaces/${encodeURIComponent(slug)}`, patch);
    if (r.ok) {
      const next = r.data.workspace;
      state.workspace = { ...state.workspace, ...next };
      state.workspaces = state.workspaces.map(w => (w.id === next.id ? { ...w, ...next } : w));
    }
    return r;
  },
  async putWorkspace(doc, opts) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('PUT', `/api/workspaces/${encodeURIComponent(slug)}`, { revision: this.revision, doc }, opts);
    if (r.ok) this.revision = r.data.revision;
    return r;
  },
  async createInvites(emails, role, team) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    return call('POST', `/api/workspaces/${encodeURIComponent(slug)}/invites`, { emails, role, team });
  },
  /* Members and their roles. The server owns both; the document only mirrors them. */
  async members() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/members`);
  },
  async setMember(userId, patch) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('PATCH', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, patch);
    if (r.ok) adoptRevision(r.data);
    return r;
  },
  async removeMember(userId) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('DELETE', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`);
    if (r.ok) adoptRevision(r.data);
    return r;
  },
  async leave() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('POST', `/api/workspaces/${encodeURIComponent(slug)}/leave`);
    if (r.ok) {
      state.workspaces = state.workspaces.filter(w => w.slug !== slug);
      state.workspace = null;
      state.memberId = null;
      this.revision = 0;
    }
    return r;
  },
  async setPlan(plan) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('POST', `/api/workspaces/${encodeURIComponent(slug)}/plan`, { plan });
    if (r.ok) adoptRevision(r.data);
    return r;
  },
  async deleteWorkspace() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    const r = await call('DELETE', `/api/workspaces/${encodeURIComponent(slug)}`);
    if (r.ok) {
      state.workspaces = state.workspaces.filter(w => w.slug !== slug);
      state.workspace = null;
      state.memberId = null;
      this.revision = 0;
    }
    return r;
  },
  async invites() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/invites`);
  },
  async revokeInvite(id) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: 'No workspace loaded' };
    return call('DELETE', `/api/workspaces/${encodeURIComponent(slug)}/invites/${encodeURIComponent(id)}`);
  },
  async invite(token) {
    return call('GET', `/api/invites/${encodeURIComponent(token)}`);
  },
  async acceptInvite(token, name, email, password) {
    const r = await call('POST', `/api/invites/${encodeURIComponent(token)}/accept`, { name, email, password });
    if (r.ok) applyUser(r.data);
    return r;
  },
};
