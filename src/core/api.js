/* =====================================================================
   API CLIENT — talks to the built-in server when it is present.
   If nothing answers at /api/config (static hosting, `npm run dev` without
   the server), the app falls back to its original local-only demo mode.

   Multi-workspace: every workspace call is scoped to a slug, and the
   server decides what the signed-in account may read or write there.
   ===================================================================== */
import { t, tErr } from './i18n.js';

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
  maxUploadMb: 25, // /api/config discloses the server's MAX_UPLOAD_MB knob (G-12-3); 25 is the server default
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

/* D-28: the once-per-revocation latch and the registered teardown callback.
   The teardown fires exactly once per revocation: it absorbs the teardown's own
   logout 401, a concurrent second 401, or a 401 landing inside a revoke action.
   applyUser() re-arms the latch on a successful re-auth (one honest teardown per
   revocation, however many happen in the same tab). */
let revokedHandled = false;
let revokedHandler = null;

/* Register the single mid-session revocation teardown. actions.js registers
   signOutRevoked at module load; call() invokes it — a plain function call,
   never a DOM event, so api.js stays node-safe — when a mid-session 401
   carries the server's requireUser code (D-28). */
export function registerAuthRevokedHandler(fn) {
  revokedHandler = fn;
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
    return { ok: false, status: 0, error: t('err.serverUnreachable') };
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
  /* The whole payload is the vars bag: interpolate only replaces the names the
       message actually uses, so passing control fields along is safe (CR-02). */
  const result = { ok: res.ok, status: res.status, data, error: data?.code ? tErr(data.code, data, data?.error) : data?.error };
  /* D-28: a mid-session revocation 401 funnels through the one registered teardown —
     honest "signed out elsewhere" copy, full sign-out, login screen. Fires only when
     ALL hold: status 401, the requireUser code (server.js:1170; the only other 401
     code is invalidCredentials, which cannot occur mid-session), a signed-in account
     (the boot-time /api/auth/me 401 with no user is normal, not a revocation), and a
     clear latch. One honest teardown per revocation, owned by the registered callback. */
  if (res.status === 401 && data?.code === 'signInRequired' && state.user && !revokedHandled) {
    revokedHandled = true;
    revokedHandler?.();
  }
  return result;
}

function applyUser(data) {
  state.user = data?.user || null;
  state.workspaces = Array.isArray(state.user?.workspaces) ? state.user.workspaces : [];
  if (state.user) revokedHandled = false; // re-arm after a successful re-auth (D-28)
  return state.user;
}

/* Adopt the revision reported by a server-side document change. Endpoints that
   edit the document (member role, member removal) bump the revision, so
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
  /* The server's per-file upload cap in MB (G-12-3) — the dropzone hint
     interpolates this so an operator's MAX_UPLOAD_MB never reads as the old
     hardcoded 250. Stays at the 25 server default for demo/no-server paths. */
  get maxUploadMb() {
    return state.maxUploadMb;
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
    state.maxUploadMb = Number(r.data?.maxUploadMb) || 25;
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
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('PATCH', `/api/workspaces/${encodeURIComponent(slug)}`, patch);
    if (r.ok) {
      const next = r.data.workspace;
      state.workspace = { ...state.workspace, ...next };
      state.workspaces = state.workspaces.map(w => (w.id === next.id ? { ...w, ...next } : w));
    }
    return r;
  },
  /* Update the signed-in account's own fields (today: locale). The returned payload is
     adopted so state.user stays fresh without another me() round-trip. */
  async patchMe(patch) {
    const r = await call('PATCH', '/api/auth/me', patch);
    if (r.ok) applyUser(r.data);
    return r;
  },
  /* Auth-scoped session management (SESS-01/02): /api/auth/* endpoints take no
     workspace slug, so these follow the login/logout pattern above — no slug guard. */
  async sessions() {
    return call('GET', '/api/auth/sessions');
  },
  async revokeSession(id) {
    return call('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`);
  },
  async revokeAllSessions() {
    return call('DELETE', '/api/auth/sessions/others');
  },
  async putWorkspace(doc, opts) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('PUT', `/api/workspaces/${encodeURIComponent(slug)}`, { revision: this.revision, doc }, opts);
    if (r.ok) this.revision = r.data.revision;
    return r;
  },
  async createInvites(emails, role, team) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('POST', `/api/workspaces/${encodeURIComponent(slug)}/invites`, { emails, role, team });
  },
  /* Members and their roles. The server owns both; the document only mirrors them. */
  async members() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/members`);
  },
  async setMember(userId, patch) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('PATCH', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`, patch);
    if (r.ok) adoptRevision(r.data);
    return r;
  },
  async removeMember(userId) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('DELETE', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}`);
    if (r.ok) adoptRevision(r.data);
    return r;
  },
  async leave() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('POST', `/api/workspaces/${encodeURIComponent(slug)}/leave`);
    if (r.ok) {
      state.workspaces = state.workspaces.filter(w => w.slug !== slug);
      state.workspace = null;
      state.memberId = null;
      this.revision = 0;
    }
    return r;
  },
  async deleteWorkspace() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
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
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/invites`);
  },
  async revokeInvite(id) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
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
