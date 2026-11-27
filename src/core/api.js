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
  /* [2026-11-21] Super-access gate — SERVER ground truth from /api/config.
     False: the switcher lists only real memberships and governance hides the
     Open action (the server enforces the same flag; this is cosmetic, T-78-05
     precedent). Default true (server default). */
  superAccess: true,
  /* Phase 30 (D-10): SSO visibility is SERVER ground truth from /api/config —
     both default false so the SSO button stays hidden until the config lands. */
  oidcEnabled: false,
  oidcSsoOnly: false, // D-07 client side: hides the password form when SSO is the only door
  /* Phase 88 (D-88-12): S3 toggle visibility is SERVER ground truth from
     /api/config — the boolean only (D-88-11: never endpoint/bucket names).
     Default false fail-closed: the toggle stays hidden until the config lands. */
  s3Enabled: false,
  /* Phase 98 (D-01): FTP toggle visibility is SERVER ground truth from
     /api/config — the boolean only (never host/credentials). Default
     false fail-closed: the toggle stays hidden until the config lands. */
  ftpEnabled: false,
  /* Phase 100 (D-01): SMB toggle visibility is SERVER ground truth from
     /api/config — the boolean only (never host/credentials). Default
     false fail-closed: the toggle stays hidden until the config lands. */
  smbEnabled: false,
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

export async function call(method, path, body, { keepalive = false, signal } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      keepalive,
      /* Phase 58 (D-02): the palette's debounced server search aborts the
         in-flight request when a newer keystroke supersedes it. */
      signal,
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

/* Account adoption — exported for doTfaLogin (17-02): the verify response is
   the only other payload that may mint a signed-in client state. */
export function applyUser(data) {
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
  /* Phase 30 (D-10): SSO button + SSO-only form hiding render ONLY from the
     server's /api/config values — never a client-side env guess. */
  get oidcEnabled() {
    return state.oidcEnabled;
  },
  get oidcSsoOnly() {
    return state.oidcSsoOnly;
  },
  get s3Enabled() {
    return state.s3Enabled;
  },
  get ftpEnabled() {
    return state.ftpEnabled;
  },
  get smbEnabled() {
    return state.smbEnabled;
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
  /* ---------- payload flags (85-02 D-23) ----------
     Client gating is cosmetic (T-78-05): the server re-checks every backup
     endpoint through the hasInstanceRole funnel; these getters only decide
     whether the chrome renders. */
  get canBackup() {
    return !!state.user?.canBackup;
  },
  get canRestore() {
    return !!state.user?.canRestore;
  },

  /* Creation gate (WSG-03/D-112): the server's WORKSPACE_CREATION boolean is
     the truth — creation passes when the gate is open OR the user is an
     instance operator. The legacy workspace owner/admin clause is DEAD under
     the closed gate: workspace roles are tenant-bound (D-112) and the server
     would refuse with workspaceCreationClosed, so the client must not show a
     button that 403s. Client gating is cosmetic (T-78-05); the server gate is
     the enforcement. */
  get canCreateWorkspace() {
    return state.creation || state.user?.isInstanceAdmin;
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
  /* [2026-11-21] Super-access surface gate: false hides governance Open and
     keeps the switcher honest (cosmetic only — the server enforces). */
  get canSuperAccess() {
    return state.superAccess;
  },

  async init() {
    const r = await call('GET', '/api/config');
    state.enabled = !!(r.ok && r.data?.app === 'projects');
    state.signup = !!r.data?.signup;
    state.mail = !!r.data?.mail;
    /* 78-01 sends the strict boolean gate value (WSG-03); `!!` tolerates the
       boolean only — the old 'open'/'admins' string shape is dead server-side.
       Deploy coupling (Pitfall 3): server+client ship from the same repo/commit. */
    state.creation = !!r.data?.workspaceCreation;
    state.superAccess = r.data?.superAccess !== false;
    state.url = typeof r.data?.url === 'string' ? r.data.url.replace(/\/+$/, '') : '';
    state.maxUploadMb = Number(r.data?.maxUploadMb) || 25;
    state.oidcEnabled = !!r.data?.oidcEnabled;
    state.oidcSsoOnly = !!r.data?.oidcSsoOnly; // the server already composes ssoOnly ⊆ enabled
    /* Phase 88: strict boolean gate value (V5 idiom) — the S3 toggle renders
       ONLY when the server says the destination exists (render-only doctrine). */
    state.s3Enabled = !!r.data?.s3Enabled;
    /* Phase 98: strict boolean gate value (V5 idiom) — the FTP toggle renders
       ONLY when the server says the destination exists (render-only doctrine). */
    state.ftpEnabled = !!r.data?.ftpEnabled;
    /* Phase 100: strict boolean gate value (V5 idiom) — the SMB toggle renders
       ONLY when the server says the destination exists (render-only doctrine). */
    state.smbEnabled = !!r.data?.smbEnabled;
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
    /* T-17-07 (D-70, Pitfall 6): a pending2fa response is NOT a sign-in — the
       challenge payload must never populate api.user; only doTfaLogin's
       explicit tfaLogin response adopts the account. */
    if (r.ok && !r.data?.pending2fa) applyUser(r.data);
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
        /* Phase 43 (D-11): the versioned logo URL rides workspacePayload — adopted here so
           the sidebar avatar, favicon swap and settings page all read the same source. */
        logo: r.data.logo || null,
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
  /* Phase 43 (D-01/D-13): the logo POSTs the RAW file body — no query params, no
     client-side transformation or Content-Type-derived hints; the server sniffs
     magic bytes and owns every validation. On 2xx the returned { logo, revision }
     is adopted BEFORE any subsequent doc write — the upload bumped the revision
     server-side, and a stale one would 409 the next save (Pitfall 2). */
  async uploadLogo(file) {
    const slug = state.workspace?.slug;
    if (!slug || !file) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    let res;
    try {
      res = await fetch(`/w/${encodeURIComponent(slug)}/logo`, { method: 'POST', credentials: 'same-origin', body: file });
    } catch {
      return { ok: false, status: 0, error: t('err.serverUnreachable') };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON response */
    }
    if (!res.ok) return { ok: false, status: res.status, error: data?.code ? tErr(data.code, data, data?.error) : data?.error };
    state.workspace = { ...state.workspace, logo: data?.logo || null };
    adoptRevision(data);
    return { ok: true, status: res.status, data };
  },
  async removeLogo() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('DELETE', `/w/${encodeURIComponent(slug)}/logo`);
    if (r.ok) {
      state.workspace = { ...state.workspace, logo: null };
      adoptRevision(r.data);
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
  /* Per-user notification prefs (Phase 34, SETTINGS-02). Unlike the auth-scoped
     sessions family above, prefs ARE workspace-scoped rows (workspace_id,
     user_id) — so the workspace id rides the request; the session still
     supplies the user_id (the server never reads it from the body). */
  async getNotifPrefs(workspaceId) {
    return call('GET', `/api/me/notif-prefs?workspace=${encodeURIComponent(workspaceId || '')}`);
  },
  async putNotifPrefs(workspaceId, prefs) {
    return call('PUT', '/api/me/notif-prefs', { workspace: workspaceId, prefs });
  },
  /* Per-user saved views & live column state (Phase 57, VIEW-01, D-05/D-07):
     the GET/PUT helpers live in the lazy viewSync chunk (DELIV-02 index-gate
     split) directly over the exported call() — the row shape mirrors
     notifPrefs above (workspace id + table key ride the request, the session
     supplies the user_id; blobs whitelisted server-side, PUT merges). */
  /* Auth-scoped session management (SESS-01/02): /api/auth/* endpoints take no
     workspace slug, so these follow the login/logout pattern above — no slug guard. */
  async sessions() {
    return call('GET', '/api/auth/sessions');
  },
  /* MCP-01: personal API keys (Settings > API keys). The raw key rides the
     create response only — every later read sees the prefix. */
  async apiKeys() {
    return call('GET', '/api/keys');
  },
  async createApiKey(body) {
    return call('POST', '/api/keys', body);
  },
  async revokeApiKey(id) {
    return call('DELETE', `/api/keys/${encodeURIComponent(id)}`);
  },
  async revokeSession(id) {
    return call('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`);
  },
  async revokeAllSessions() {
    return call('DELETE', '/api/auth/sessions/others');
  },
  /* Operator console (OPREV-01/02, phase 22): auth-scoped like the sessions
     family above — no slug guard. The read returns the instance's users (D-121
     five fields only); the revoke POST is the plan 01 route. */
  async operatorUsers() {
    return call('GET', '/api/auth/operator/users');
  },
  async operatorRevokeSessions(userId) {
    return call('POST', `/api/auth/operator/users/${encodeURIComponent(userId)}/revoke-sessions`);
  },
  /* 78-01 operator identity (WSG-06): promote freely, demote guarded by the
     server's lastOperator count — the client treats every refusal as a keyed
     toast, the server re-checks authority (client gating is cosmetic). */
  async operatorPromote(userId) {
    return call('POST', `/api/auth/operator/users/${encodeURIComponent(userId)}/promote`);
  },
  async operatorDemote(userId) {
    return call('POST', `/api/auth/operator/users/${encodeURIComponent(userId)}/demote`);
  },
  /* 79-01 operator workspace governance (WSG-07/08, D-10): the route family
     plan 01 shipped — the listing of EVERY workspace on the instance plus
     archive/unarchive, the empty-only delete carrying orphan dispositions,
     and the member reassign/release pair. Read routes carry no throttle;
     every refusal surfaces as a keyed toast client-side, the server is the
     authority (client gating is cosmetic, D-11). */
  async operatorWorkspaces({ signal } = {}) {
    return call('GET', '/api/auth/operator/workspaces', undefined, { signal });
  },
  /* 79-02 (D-05/D-08): the orphan modal's ground truth — the member list of
     the workspace being deleted plus the reassign targets (name + member
     count, delete target excluded). Fetched fresh at every modal open. */
  async operatorWsMembers(id) {
    return call('GET', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/members`);
  },
  async operatorWsArchive(id) {
    return call('POST', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/archive`);
  },
  async operatorWsUnarchive(id) {
    return call('POST', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/unarchive`);
  },
  async operatorWsDelete(id, dispositions) {
    return call('POST', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/delete`, { dispositions });
  },
  /* Phase 83 (D-05/D-04): the workspace rename — guard-ordered identically to
     archive/unarchive server-side; slug rules and refusals reuse the
     creation-time vocabulary (invalidSlug/slugTaken+suggestion). */
  async operatorWsRename(id, { name, slug }) {
    return call('POST', `/api/auth/operator/workspaces/${encodeURIComponent(id)}/rename`, { name, slug });
  },
  /* WR-83-01: a successful GOVERNANCE rename must reconcile the operator's own
     client state — `state.workspaces` by id, and `state.workspace` when the
     loaded workspace IS the renamed one — or every subsequent workspace-scoped
     call (GET /api/workspaces/:slug, invites, members, PUT doc) builds its URL
     from the dead slug and 404s, and the sidebar/switcher links rot until a
     full reload. Same reconcile shape as patchWorkspace (the PATCH precedent).
     The rename bumps NO revision server-side (no doc write), so nothing else
     needs resetting. */
  renameWorkspaceLocal(id, { name, slug }) {
    state.workspaces = state.workspaces.map(w => (w.id === id ? { ...w, name, slug } : w));
    if (state.workspace?.id === id) state.workspace = { ...state.workspace, name, slug };
  },
  /* Phase 83 (D-09): derived-on-read dead-mapping visibility — orphaned
     group_mappings plus the Phase 82 encoded guard trail. Read route: no
     throttle; the payload is raw values (escaping happens at first render). */
  async operatorDeadMappings() {
    return call('GET', '/api/auth/operator/dead-mappings');
  },
  /* 102-01 (Phase 101 routes): the Entra ID group-mappings listing — flat rows
     (id/groupGuid/workspaceId/workspaceName/role/label/createdAt/updatedAt/
     dead/deadReason/liveMembers). Operator-only server-side; refusals surface
     through the page's fullstate / keyed toasts (D-09). */
  async groupMappings({ signal } = {}) {
    return call('GET', '/api/governance/group-mappings', undefined, { signal });
  },
  /* 102-01 Task 2 (Phase 101 POST/DELETE handlers, server.js:8962/9081):
     the body fields are camelCase groupGuid/workspaceId/role/label (read
     verbatim from the server POST handler); the client pre-check (D-08)
     canonicalizes the GUID before submit — the server re-checks everything.
     `call('DELETE', …)` is the established verb form (revokeApiKey etc.). */
  async groupMappingCreate(body) {
    return call('POST', '/api/governance/group-mappings', body);
  },
  async groupMappingDelete(id) {
    return call('DELETE', `/api/governance/group-mappings/${encodeURIComponent(id)}`);
  },
  /* 85-02 (D-19/D-24): the Backup page's ground truth — the stub payload
     carries the capability flags beside the (Phase 86/87) task list. */
  async backupTasks({ signal } = {}) {
    return call('GET', '/api/backup/tasks', undefined, { signal });
  },
  /* 86-02 (D-16/D-18/D-19): the frozen run surface — trigger returns the D-18
     UUID immediately, current polls the D-19 status payload. Every refusal
     (backupManageRequired / backupRunInProgress / scopeNotFound / 429) flows
     through call()'s central handling — no bespoke error parsing here. */
  async backupRun(scope, extra = undefined, { signal } = {}) {
    return call('POST', '/api/backup/runs', extra ? { scope, ...extra } : { scope }, { signal });
  },
  async backupRunCurrent({ signal } = {}) {
    return call('GET', '/api/backup/runs/current', undefined, { signal });
  },
  /* 87-04 (BKBCK-02/BKBCK-04, D-01/D-03/D-14): the task-builder + history
     client surface. Every refusal the task routes can emit — taskNameRequired /
     invalidSchedule / invalidTimezone / backupInvalidScope / invalidRetention /
     taskNotFound / backupManageRequired / tooManyAttempts — flows through
     call()'s central keyed handling; no bespoke error parsing here. The toggle
     is a partial PUT: the server recomputes next_run_at in the SAME write
     (D-07) and the client only refills — no client-side cron math anywhere
     (the builder serializes preset+fields into the raw 5-field string, D-04). */
  async backupTaskCreate(body, { signal } = {}) {
    return call('POST', '/api/backup/tasks', body, { signal });
  },
  async backupTaskUpdate(id, body, { signal } = {}) {
    return call('PUT', `/api/backup/tasks/${encodeURIComponent(id)}`, body, { signal });
  },
  async backupTaskToggle(id, enabled, { signal } = {}) {
    return this.backupTaskUpdate(id, { enabled }, { signal });
  },
  async backupTaskDelete(id, { signal } = {}) {
    return call('DELETE', `/api/backup/tasks/${encodeURIComponent(id)}`, undefined, { signal });
  },
  /* History read (D-14): newest-first, capped 50 server-side; taskId=manual
     lists the D-11 manual archives. taskNotFound only after the gate (T-86-06).
     Phase 94 (D-01/D-04): the params grow ADDITIVELY — the frozen Phase-92
     ?all=1 variant (all/task/trigger/status/limit/offset) rides the same
     method; the legacy ?taskId= query form is byte-unchanged. */
  async backupRuns({ taskId, all, task, trigger, status, limit, offset, signal } = {}) {
    const parts = [];
    if (taskId) parts.push(`taskId=${encodeURIComponent(taskId)}`);
    if (all) parts.push('all=1');
    if (task) parts.push(`task=${encodeURIComponent(task)}`);
    if (trigger) parts.push(`trigger=${encodeURIComponent(trigger)}`);
    if (status) parts.push(`status=${encodeURIComponent(status)}`);
    if (limit != null) parts.push(`limit=${encodeURIComponent(String(limit))}`);
    if (offset != null) parts.push(`offset=${encodeURIComponent(String(offset))}`);
    return call('GET', `/api/backup/runs${parts.length ? `?${parts.join('&')}` : ''}`, undefined, { signal });
  },
  /* 90-02 (D-90-11): the verify re-hash — 200 { ok, checkedAt } on BOTH
     outcomes (a mismatch is a RESULT, never a refusal); the refusal
     vocabulary (backupRoleRequired / restoreArchiveMissing / tooManyAttempts)
     flows through call()'s central keyed handling. */
  async backupVerifyChecksum(runId, { signal } = {}) {
    return call('POST', '/api/backup/verify-checksum', { runId }, { signal });
  },
  /* 90-03 (D-90-12/13/14/15): the rotation projection — GET the dry-run
     grouped delete set for one task, computed server-side from the CURRENT
     policy. noRuns is a RESULT (200), never a refusal; tooManyAttempts /
     backupManageRequired / taskNotFound flow call()'s central keyed
     handling. */
  async backupRotationPreview(taskId, { signal } = {}) {
    return call('GET', `/api/backup/rotation-preview?taskId=${encodeURIComponent(taskId)}`, undefined, { signal });
  },
  /* ==================================================================
     89-06 (BKRST-01..04, D-89-14..23): the restore client surface. The
     five restore methods sit beside the backup family; every route
     refusal flows call()'s central keyed handling — no bespoke error
     parsing here. The refusal vocabulary is the SERVER's, named exactly
     as the 89-03/04/05 routes emit it:
     - list (restoreBackups): backupRoleRequired (403 — RESTORE_USE gate)
     - preview (restorePreview): tooManyAttempts (429, D-89-22/OQ5),
       backupRoleRequired (403), taskNotFound (404 bad-id shape),
       restoreArchiveMissing (404 — gone from both destinations, D-89-15),
       restoreEntryRejected (400 — attacker-supplied entry, D-89-33),
       restoreShaMismatch (400 — digest mismatch),
       restoreManifestCorrupt (400 — structural corruption; the client
       toasts page.restore.previewCorrupt for this class)
     - trigger (restoreRun): tooManyAttempts (429), backupRoleRequired
       (403), restoreInvalidRunId (400), restoreArchiveMissing (404),
       restoreScopeUnsupported (400), restoreNoWorkspace (400 — D-89-23
       live-membership targeting), backupRestoreInProgress (409 — the
       shared D-89-1 vocabulary: one export OR one restore at a time)
     - poll (restoreRunCurrent) / history (restoreRuns):
       backupRoleRequired (403)
     - destructive routes (methods land with Task 2's confirm wiring):
       overwrite — backupManageRequired (403), restoreInvalidRunId /
       restoreTargetMissing (400/404), confirmPhraseMismatch (400 — the
       server re-validates the typed name against the LIVE row, D-89-27),
       restoreTargetMismatch (400), backupRestoreInProgress (409);
       instance DR — operatorOnly (403), confirmPhraseMismatch (400 —
       !== 'RESTORE-INSTANCE'), restoreTargetMismatch (400),
       backupRestoreInProgress (409)
     Every payload is render-only — the client derives nothing.
     ================================================================== */
  async restoreBackups({ signal } = {}) {
    return call('GET', '/api/backup/restore/backups', undefined, { signal });
  },
  async restorePreview(runId, { signal } = {}) {
    return call('GET', `/api/backup/restore/preview?runId=${encodeURIComponent(runId)}`, undefined, { signal });
  },
  /* UAT 2026-11-27 (owner): an off-instance archive uploads as a RAW body —
     the same response envelope as call() without the JSON encoding. */
  async restoreUploadArchive(file, { signal } = {}) {
    let res;
    try {
      res = await fetch(`/api/backup/restore/upload?name=${encodeURIComponent(file.name || 'archive.tar.gz')}`, {
        method: 'POST',
        credentials: 'same-origin',
        signal,
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
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
    return { ok: res.ok, status: res.status, data, error: data?.code ? tErr(data.code, data, data?.error) : data?.error };
  },
  async restoreRun(body, { signal } = {}) {
    return call('POST', '/api/backup/restore', body, { signal });
  },
  async restoreRunCurrent({ signal } = {}) {
    return call('GET', '/api/backup/restore/current', undefined, { signal });
  },
  async restoreRuns({ signal } = {}) {
    return call('GET', '/api/backup/restore/runs', undefined, { signal });
  },
  async restoreOverwrite(body, { signal } = {}) {
    return call('POST', '/api/backup/restore/overwrite', body, { signal });
  },
  async restoreInstance(body, { signal } = {}) {
    return call('POST', '/api/backup/restore/instance', body, { signal });
  },
  /* Phase 92 scopes family (UAT round-8, phase 94): every active workspace
     for the restore-target picker — a Super Admin without live membership
     still picks a target (the server gate accepts the same authority). */
  async backupScopes({ signal } = {}) {
    return call('GET', '/api/backup/scopes', undefined, { signal });
  },
  /* 85-02 (D-16/D-29/D-30): the Instance Roles tab's route family — one
     listing GET (rows + recent activity), the audited grant POST and the
     revoke DELETE. Operator-only server-side; every refusal surfaces as a
     keyed toast, the server is the authority (client gating is cosmetic). */
  async instanceRoles() {
    return call('GET', '/api/auth/operator/instance-roles');
  },
  async instanceRoleGrant(userId, role) {
    return call('POST', '/api/auth/operator/instance-roles', { userId, role });
  },
  async instanceRoleRevoke(id) {
    return call('DELETE', `/api/auth/operator/instance-roles/${encodeURIComponent(id)}`);
  },
  /* Phase 52 (TRN-01): the workspace-admin transparency read — what the TARGET
     member can access, computed server-side through the visibility funnel.
     D-52-3: the caller refetches on every open; nothing is cached here. */
  async memberVisibility(userId) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/visibility`);
  },
  /* Phase 60 (TRN-01): the member's own self-view of the Phase 52 funnel —
     the calling membership row scopes the read server-side; nothing is
     cached here (same D-52-3 posture as memberVisibility). */
  async myVisibility() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/me/visibility`);
  },
  /* Phase 95 (SET-01): the cross-workspace My Access aggregate — every
     workspace the caller is a member of, each with its funnel-filtered
     project list (additive icon/color/role fields). The server is the
     truth-teller; nothing is cached here (same D-52-3 posture as
     myVisibility). */
  async myAccess() {
    return call('GET', '/api/settings/my-access');
  },
  /* Phase 95 (SET-03, D-09/D-10): delete every REVOKED key of the caller in
     one go — the server answers { removed } and the toast names the count. */
  async purgeRevokedKeys() {
    return call('POST', '/api/keys/purge-revoked');
  },
  /* Phase 60 (DASH-01): the admin aggregate dashboard — overdue/load/upcoming/
     activity in one payload. The activityWindow preset rides the query string
     only when provided (the server whitelists it); poll refreshes abort the
     previous in-flight read through call()'s signal passthrough (Phase 58). */
  async dashboard(activityWindow, { signal } = {}) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/dashboard${activityWindow ? `?activityWindow=${encodeURIComponent(activityWindow)}` : ''}`, undefined, { signal });
  },
  /* AUD-02 (phase 24): the workspace-admin tier — revoke a member's sessions
     from the members surface. D-R1 locks the /api/w/ prefix even though the
     sibling member routes use /api/workspaces/. The slug resolves from the
     loaded workspace like every workspace-scoped method above. */
  async revokeMemberSessions(userId) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('POST', `/api/w/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/revoke-sessions`);
  },
  /* AUD-03: the audit trail read — tier-scoped SERVER-side (D-T3); the client
     only forwards the verb filter and the keyset cursor. Auth-scoped, no slug
     guard — same family as the operator methods above (D-121 read precedent). */
  async auditLog(params = {}) {
    const q = new URLSearchParams();
    if (params.verb) q.set('verb', params.verb);
    if (params.before != null) q.set('before', String(params.before));
    if (params.beforeId) q.set('beforeId', params.beforeId);
    const qs = q.toString();
    return call('GET', `/api/audit-log${qs ? `?${qs}` : ''}`);
  },
  /* Change the signed-in account's own password (PASS-02). api.changePassword is
     the only client entry point to PATCH /api/auth/password. Auth-scoped, no slug
     guard — same family as the sessions methods above (D-34). On success the
     server revokes every OTHER session inside the same transaction; this call's
     own cookie survives. */
  async changePassword(currentPassword, newPassword) {
    return call('PATCH', '/api/auth/password', { currentPassword, newPassword });
  },
  /* Two-factor enrollment (TFA-02/03/04): auth-scoped like the sessions family
     above — no workspace slug. The enroll response carries the server-built
     otpauth URI (D-48) and enable returns the one-time recovery codes (D-53);
     both are consumed by the settings 2FA card and never persisted client-side. */
  async tfaEnroll(currentPassword) {
    return call('POST', '/api/auth/tfa/enroll', { currentPassword });
  },
  async tfaEnable(code) {
    return call('POST', '/api/auth/tfa/enable', { code });
  },
  async tfaDisable(currentPassword, code) {
    return call('POST', '/api/auth/tfa/disable', { currentPassword, code });
  },
  /* REGEN-01/02: regenerate recovery codes with a password + live-TOTP step-up.
     The success response carries the new one-time plaintext codes — they flow
     straight into the D-53 recovery modal's transient state and are never
     persisted client-side (D-91). */
  async tfaRecover(currentPassword, code) {
    return call('POST', '/api/auth/tfa/recovery', { currentPassword, code });
  },
  /* TOTP2 (Phase 31): the enrolled-factor list for the settings 2FA card.
     Auth-scoped like the family above; names arrive as catalogue keys and are
     localized at display time — no secret ever crosses this boundary. */
  async tfaFactors() {
    return call('GET', '/api/auth/tfa/factors');
  },
  /* TOTP2 (Phase 31, Plan 02/03): the additional-factor lifecycle. Enroll
     requires a label (D-02) plus the password + existing-factor step-up
     (TOTP2-05) BEFORE any secret is revealed; enable verifies the staged
     secret; remove is the password + live-code confirm (D-19). Auth-scoped,
     no workspace slug. */
  async tfaFactorEnroll({ currentPassword, code, label }) {
    return call('POST', '/api/auth/tfa/factors/enroll', { currentPassword, code, label });
  },
  async tfaFactorEnable({ stagedId, code }) {
    return call('POST', '/api/auth/tfa/factors/enable', { stagedId, code });
  },
  async tfaFactorRemove({ factorId, currentPassword, code }) {
    return call('POST', '/api/auth/tfa/factors/remove', { factorId, currentPassword, code });
  },
  /* TFA-05: verify the pending login challenge. Deliberately NO applyUser here —
     the caller (doTfaLogin) adopts the user through the shared post-success flow. */
  async tfaLogin(code) {
    return call('POST', '/api/auth/tfa/login', { code });
  },
  async putWorkspace(doc, opts) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    const r = await call('PUT', `/api/workspaces/${encodeURIComponent(slug)}`, { revision: this.revision, doc }, opts);
    if (r.ok) this.revision = r.data.revision;
    return r;
  },
  async createInvites(emails, role, teams, scope = undefined) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    /* D-07: the payload carries the full team set, never a scalar team.
       SCOPE-05 (29-04): the optional 4th arg carries the validated scope —
       omitted (undefined) for the legacy call sites, null for an explicit
       workspace-wide guest, an object for the scoped invite. */
    const body = { emails, role, teams: Array.isArray(teams) ? teams : [] };
    if (scope !== undefined) body.scope = scope;
    return call('POST', `/api/workspaces/${encodeURIComponent(slug)}/invites`, body);
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
  /* TEAM-01: set a member's full team set in one call. The route edits only the
     team_members authority rows — the document and its revision are untouched,
     so there is deliberately no adoptRevision here (revokeInvite precedent). */
  async setMemberTeams(userId, teams) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('PUT', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/teams`, { teams });
  },
  /* SCOPE-01 (29-04, D-12): set a member's scope in one call. Like
     setMemberTeams the route edits only the authority column — the document
     and its revision are untouched, so there is deliberately no adoptRevision
     here. An explicit null restores workspace-wide reach (D-01). */
  async setMemberScope(userId, scope) {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('PUT', `/api/workspaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(userId)}/scope`, { scope });
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
