/* =====================================================================
   API CLIENT — talks to the built-in server when it is present.
   If nothing answers at /api/config (static hosting, `npm run dev` without
   the server), the app falls back to its original local-only demo mode.
   ===================================================================== */
const state = { enabled: false, signup: false, mail: false, user: null, url: '' };

/* Base URL for links the user can share. Set by the server (APP_URL or the
   request host); location.origin covers static hosting and the dev server. */
export function appUrl() {
  return state.url || location.origin;
}
export function appHost() {
  return appUrl().replace(/^https?:\/\//, '');
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
  get url() {
    return appUrl();
  },
  get host() {
    return appHost();
  },

  async init() {
    const r = await call('GET', '/api/config');
    state.enabled = !!(r.ok && r.data?.app === 'gr8r');
    state.signup = !!r.data?.signup;
    state.mail = !!r.data?.mail;
    state.url = typeof r.data?.url === 'string' ? r.data.url.replace(/\/+$/, '') : '';
    return state.enabled;
  },
  async me() {
    if (!state.enabled) return null;
    const r = await call('GET', '/api/auth/me');
    state.user = r.ok ? r.data.user : null;
    return state.user;
  },
  async login(email, password) {
    const r = await call('POST', '/api/auth/login', { email, password });
    if (r.ok) state.user = r.data.user;
    return r;
  },
  async signup(name, email, password) {
    const r = await call('POST', '/api/auth/signup', { name, email, password });
    if (r.ok) state.user = r.data.user;
    return r;
  },
  async logout() {
    await call('POST', '/api/auth/logout');
    state.user = null;
  },
  async workspace() {
    const r = await call('GET', '/api/workspace');
    if (r.ok) this.revision = r.data.revision;
    return r;
  },
  async putWorkspace(doc, opts) {
    const r = await call('PUT', '/api/workspace', { revision: this.revision, doc }, opts);
    if (r.ok) this.revision = r.data.revision;
    return r;
  },
  async createInvites(emails, role, team) {
    return call('POST', '/api/invites', { emails, role, team });
  },
  async invite(token) {
    return call('GET', `/api/invites/${encodeURIComponent(token)}`);
  },
  async acceptInvite(token, name, email, password) {
    const r = await call('POST', `/api/invites/${encodeURIComponent(token)}/accept`, { name, email, password });
    if (r.ok) state.user = r.data.user;
    return r;
  },
};
