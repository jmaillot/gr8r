/* ---------- store ---------- */
import { TODAY, diffD, iso, parse, uid } from './utils.js';
import { t } from './i18n.js';
import { PCOLORS, TEAMS_SEED } from './constants.js';
import { seed } from '../data/seed.js';
import { getLocalNotifPrefs } from './notifPrefs.js';
import { api } from './api.js';

export const STORE_KEY = 'projects.v2';
export const DEFAULT_PREFS = {
  theme: 'system',
  accent: 'indigo',
  side: 'comfortable',
  density: 'comfortable',
  weekStart: 1,
  dateFmt: 'MMM d',
  tz: '(GMT-07:00) Pacific Time',
  motion: 'system',
  home: 'home',
  openTasks: 'drawer',
  name: 'Tanjim Islam',
  title: 'Head of Product',
};
/* The language lives on the account (users.locale), never in the shared document:
   an old localStorage blob or an old server doc must not resurrect prefs.lang into
   S.prefs, or docSnapshot() would write it back into workspaces.doc on every save. */
function stripLegacyLang(prefs) {
  delete prefs.lang;
  return prefs;
}
/* Phase 34 D-01: notifPrefs is per-user server rows (or per-workspace
   localStorage), never a document field. An old localStorage blob (or any stale
   snapshot) carrying data.notifPrefs must not re-enter S.data, or docSnapshot()
   would write it back into workspaces.doc on every save — the resurrection the
   double strip in server.js (normalizeDoc read / mergeClientDoc write) already
   blocks server-side; this closes the client side of the same hole. The blob
   shape is { data, prefs, views }: the field rides on the doc (blob.data). */
function stripLegacyNotifPrefs(blob) {
  if (blob?.data && typeof blob.data === 'object') delete blob.data.notifPrefs;
  return blob;
}
export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && j.data && j.data.tasks) return stripLegacyNotifPrefs(j);
    }
  } catch {
    /* storage blocked or corrupt: start from seed data */
  }
  return null;
}
export const saved = load();
export const S = {
  data: saved?.data || seed(),
  prefs: stripLegacyLang(Object.assign({}, DEFAULT_PREFS, saved?.prefs || {})),
  views: saved?.views || {},
  /* Per-user notif prefs (Phase 34 D-01): never on the document. Local mode
     hydrates from the per-workspace localStorage key; API mode adopts the
     server row's canonical merge on the first toggle. */
  notifPrefs: getLocalNotifPrefs(saved?.data?.ws?.url),
  ui: {
    fx: {},
    auth: null,
    authStep: 'login',
    onb: 0,
    onbData: { use: 'product', team: 'kanban', size: '2-10', ws: '', proj: 'Website Launch', tmpl: 'web', invites: '' },
    route: 'home',
    params: {},
    history: [],
    collapsed: !!saved?.collapsed,
    mnav: false,
    expanded: { p1: true },
    drawer: null,
    drawerFull: false,
    drawerTab: 'comments',
    modals: [],
    pop: null,
    palette: null,
    loading: false,
    offline: false,
    wantedSlug: null,
    sel: new Set(),
    composer: null,
    editCell: null,
    openTasks: {},
    collapsedGroups: {},
    calDate: iso(TODAY),
    calMode: 'month',
    tlZoom: 'week',
    tlGroup: 'status',
    fileView: 'grid',
    projView: 'grid',
    homeTab: 'upcoming',
    inboxCat: 'all',
    inboxUnread: false,
    inboxSel: null,
    notifFilter: 'all',
    settings: 'appearance',
    searchQ: '',
    searchCat: 'all',
    myView: 'list',
    membersTab: 'members',
    collapsedCols: {},
    errors: {},
    drafts: {},
  },
};
export let _saveT;
let _pushT;
let pushing = false;
let pushQueued = false;
let flushing = false;
let dirty = false;
let changeSeq = 0;

/* Phase 34 Pitfall 3: docSnapshot must never include notifPrefs — belt-and-braces
   on top of the load-time strip, so a legacy field that somehow reached S.data
   (an old hydrate path, a restored backup) can never ride a save back into
   workspaces.doc. Deleting in place keeps the snapshot allocation-free. */
const docSnapshot = () => {
  delete S.data.notifPrefs;
  return { data: S.data, prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed };
};

function notify(detail) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('projects:save-error', { detail }));
}

/* Push the whole document to the server. A revision mismatch means another
   session saved in the meantime; we stop writing instead of clobbering it. */
async function push() {
  if (!api.enabled || !api.user || S.ui.conflict) return;
  if (pushing) {
    pushQueued = true;
    return;
  }
  pushing = true;
  const seq = changeSeq;
  const res = await api.putWorkspace(docSnapshot());
  pushing = false;
  if (!res.ok) {
    if (res.status === 409 || res.status === 401 || res.status === 403) S.ui.conflict = true;
    notify({ status: res.status, error: res.error });
    return;
  }
  dirty = changeSeq !== seq;
  if (dirty || pushQueued) {
    pushQueued = false;
    _pushT = setTimeout(push, 450);
  }
}

/* Phase 35 honest undo: an awaitable one-shot doc push for the delTeam undo
   onAction. Same guards as push(), but it RESOLVES with the server result so
   the caller can sequence authority PUTs behind a confirmed doc write (the
   server whitelists team ids against the stored doc — a premature membership
   PUT 400s unknownTeam). Clears the pending debounce timers (a debounced push
   must not double-PUT behind this one), writes the localStorage snapshot the
   same way save()'s inner timeout does, then awaits the wire. */
export async function pushNow() {
  if (!api.enabled || !api.user || S.ui.conflict) return { ok: false, status: 0 };
  /* A debounced push already in flight must settle first — racing it would
     send two concurrent PUTs of the same document. Bounded (~5s, the toast
     window): a hung in-flight PUT must not park the undo click handler
     forever with no feedback — time out with the same ok:false shape as the
     guard above, so the caller's error toast fires honestly. */
  const deadline = Date.now() + 5000;
  while (pushing) {
    if (Date.now() > deadline) return { ok: false, status: 0 };
    await new Promise(r => setTimeout(r, 25));
  }
  clearTimeout(_saveT);
  clearTimeout(_pushT);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(docSnapshot()));
  } catch {
    /* storage full or blocked: the server copy is authoritative */
  }
  /* WR-02 (Gap 2): hold the same shared `pushing` mutex push() uses while this
     PUT is in flight — a save() scheduled during this window must defer into
     pushQueued, not fire a second concurrent PUT of the same doc (a false
     positive 409 would set S.ui.conflict and lock the app mid-undo). */
  pushing = true;
  try {
    const res = await api.putWorkspace(docSnapshot());
    if (!res.ok && (res.status === 409 || res.status === 401 || res.status === 403)) S.ui.conflict = true;
    return res;
  } finally {
    pushing = false;
  }
}

export function save() {
  changeSeq++;
  if (api.enabled && api.user && !S.ui.conflict) dirty = true;
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(docSnapshot()));
    } catch {
      /* storage full or blocked: the server copy is authoritative when enabled */
    }
    if (api.enabled && api.user && !S.ui.conflict) {
      clearTimeout(_pushT);
      _pushT = setTimeout(push, 450);
    }
  }, 150);
}

/* Last chance to save when the tab is hidden or closed. keepalive lets the
   browser finish the request even if the page is going away. */
function flushNow() {
  if (flushing || pushing || !dirty || !api.enabled || !api.user || S.ui.conflict) return;
  clearTimeout(_pushT);
  flushing = true;
  const seq = changeSeq;
  dirty = false;
  api
    .putWorkspace(docSnapshot(), { keepalive: true })
    .then(r => {
      if (!r.ok || changeSeq !== seq) dirty = true;
    })
    .finally(() => {
      flushing = false;
    });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushNow);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNow();
  });
}

/* Replace local state with the server copy (used at boot and after sign-in). */
export function applyDoc(doc, revision) {
  if (!doc || typeof doc !== 'object') return false;
  /* [2026-11-08 D-51-4] Visibility-epoch detection: capture the project ids the
     local doc carried BEFORE the hydrate replaces it. A project present here
     but absent from the merged doc means someone flipped it private (the
     server redacts it from this member's served copy). The ids are recorded on
     S.ui.lostProjects so open views and overlays render the honest localized
     not-found state — no silent removal, no crash. No refetch machinery: the
     poll hydration IS the epoch trigger (plan Task 2 / RESEARCH A1). */
  const beforeIds = new Set((Array.isArray(S.data?.projects) ? S.data.projects : []).map(p => p?.id).filter(Boolean));
  if (doc.data) S.data = doc.data;
  S.data.recentSearches = Array.isArray(S.data.recentSearches) ? S.data.recentSearches : [];
  S.data.savedViews = Array.isArray(S.data.savedViews) ? S.data.savedViews : [];
  /* P3 multi-team: migrate the legacy scalar project.team to teams[] for any
     doc shape still carrying it (fresh server doc, localStorage snapshot). */
  if (Array.isArray(S.data.projects)) {
    for (const p of S.data.projects) {
      if (!p || typeof p !== 'object') continue;
      if (p.team !== undefined) {
        p.teams = Array.isArray(p.team) ? p.team.filter(x => typeof x === 'string' && x) : typeof p.team === 'string' && p.team ? [p.team] : [];
        delete p.team;
      }
      if (!Array.isArray(p.teams)) p.teams = [];
    }
  }
  /* P4-a: notifications are per-recipient — rows without `to` are pre-P4 legacy/demo and purged. */
  if (Array.isArray(S.data.notifs)) S.data.notifs = S.data.notifs.filter(n => n && typeof n.to === 'string' && n.to);
  S.prefs = stripLegacyLang(Object.assign({}, DEFAULT_PREFS, doc.prefs || {}));
  S.views = doc.views || {};
  S.ui.collapsed = !!doc.collapsed;
  S.ui.conflict = false;
  if (Number.isInteger(revision)) api.revision = revision;
  const mid = api.memberId || S.data.members?.find(m => m.userId && m.userId === api.user?.id)?.id;
  if (mid && S.data.members?.some(m => m.id === mid)) S.data.me = mid;
  const current = S.data.members?.find(m => m.id === S.data.me);
  if (current) {
    S.prefs.name = current.name;
    S.prefs.title = current.title || '';
  }
  /* [2026-11-08 D-51-4] Compare against the pre-hydrate set and record the loss.
     null when nothing vanished, so a later clean hydrate clears the state. */
  const afterIds = new Set((Array.isArray(S.data.projects) ? S.data.projects : []).map(p => p?.id).filter(Boolean));
  const lost = [...beforeIds].filter(id => !afterIds.has(id));
  S.ui.lostProjects = lost.length ? lost : null;
  return true;
}

/* The legacy workspace-shared language label, captured from the raw server document before
   applyDoc() strips it. The one-time migration seed (D-04) reads it; one read per hydration. */
let legacyLangLabel = null;
export function consumeLegacyLang() {
  const v = legacyLangLabel;
  legacyLangLabel = null;
  return v;
}

export async function hydrateFromServer(slug) {
  if (!api.enabled) return { ok: false, status: 0 };
  const res = await api.loadWorkspace(slug);
  if (res.ok) {
    const lang = res.data?.doc?.prefs?.lang;
    legacyLangLabel = typeof lang === 'string' ? lang : null;
    applyDoc(res.data.doc, res.data.revision);
  }
  return res;
}

/* Write any pending change before leaving this workspace (switching, sign-out). */
export async function flushPending() {
  if (!api.enabled || !api.user || S.ui.conflict || !api.workspace) return;
  clearTimeout(_pushT);
  for (let i = 0; i < 5 && dirty && !S.ui.conflict; i++) await push();
}

/* Signing out must not leave the previous account's workspace in this browser. */
/* True while a local edit is still travelling to the server: the 30s notification
   poll must not hydrate over an unsaved change (it would clobber the client copy). */
export function hasPendingChanges() {
  return dirty;
}

/* 55-08 409 recovery: after hydrateFromServer adopts the server revision,
   clear the pending flag so pollNotifs' hasPendingChanges() guard passes
   again — applyDoc replaces S.data wholesale (hydrate wins), so there is no
   surviving payload to replay; post-recovery edits flow through save() as
   fresh changes. Not exported as the mutable flag itself. */
export function resetDirty() {
  dirty = false;
}

export function clearLocalCache() {
  try {
    localStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked */
  }
}

/* ---------- lookups ---------- */
export const D = () => S.data;
export const me = () => D().members.find(m => m.id === D().me);
export const mem = id => D().members.find(m => m.id === id);
export const proj = id => D().projects.find(p => p.id === id);
export const task = id => D().tasks.find(t => t.id === id);
export const pColor = p => PCOLORS[p?.color] || PCOLORS.slate;
export const visibleProjects = () =>
  D()
    .projOrder.map(proj)
    .filter(Boolean)
    .filter(p => !p.archived);
/* [2026-11-09 fix] The client mirror of the server funnel (canSeeProject,
   server.js:800): non-private ∨ access list ∨ LIVE linked-team term (D-50-5).
   The server-side team term was restored in Phase 50 but this mirror kept the
   access-list-only shape, so a project granted through a team rendered in the
   list (the server sends it) and then 404'd on open (this predicate denied
   it). One shared predicate — every surface filters through this. */
export const canSee = p => {
  if (!p) return false;
  if (!p.private) return true;
  if (Array.isArray(p.members) && p.members.includes(D().me)) return true;
  const pt = projTeams(p);
  if (!pt.length) return false;
  return memberTeams(me()).some(t => pt.includes(t));
};
export const canManageProject = p => {
  const role = me()?.role;
  return role === 'Owner' || role === 'Admin' || (!!p && p.lead === D().me);
};
export const tasksOf = pid => D().tasks.filter(t => t.project === pid && !t.archived);
export const allTasks = () => D().tasks.filter(t => !t.archived && canSee(proj(t.project)));
export const isOver = t => t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0;

/* ---------- notifications (P4-a) ---------- */
/* Rows live in the flat workspace doc; `to` scopes each row to one member.
   Rows without `to` are legacy/demo leftovers and are dropped on hydration. */
const NOTIF_CAP = 100;
export const myNotifs = () => {
  const mid = D().me;
  return D().notifs.filter(n => n && n.to === mid);
};
/* Central emission primitive: one row per recipient, author excluded, deduped
   while unread, capped FIFO per recipient. Callers pass type-specific fields
   (task, project, snippet, status). */
export function notifyMembers(ids, n) {
  const d = D();
  const now = Date.now();
  let added = false;
  for (const to of new Set(ids)) {
    if (!to || to === n.by) continue;
    if (!d.members.some(m => m.id === to)) continue;
    if (d.notifs.some(x => x.to === to && x.type === n.type && x.task === n.task && x.by === n.by && !x.read)) continue;
    d.notifs.push({
      id: uid('n'),
      to,
      type: n.type,
      by: n.by ?? null,
      task: n.task ?? null,
      project: n.project ?? null,
      snippet: n.snippet || '',
      status: n.status ?? null,
      at: now,
      read: false,
    });
    added = true;
  }
  if (added) {
    // FIFO cap per recipient: keep the NOTIF_CAP newest rows addressed to each member.
    const byTo = new Map();
    for (const x of d.notifs) {
      if (!x.to) continue;
      if (!byTo.has(x.to)) byTo.set(x.to, []);
      byTo.get(x.to).push(x);
    }
    const drop = new Set();
    for (const rows of byTo.values()) {
      rows.sort((a, b) => b.at - a.at);
      for (const old of rows.slice(NOTIF_CAP)) drop.add(old);
    }
    if (drop.size) d.notifs = d.notifs.filter(x => !drop.has(x));
    save();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('projects:notifs'));
  }
  return added;
}
export const commentsOf = tid => D().comments.filter(c => c.task === tid);
export function progressOf(pid) {
  const ts = tasksOf(pid);
  if (!ts.length) return 0;
  return Math.round((ts.filter(t => t.status === 'done').length / ts.length) * 100);
}
export function taskProg(t) {
  if (t.status === 'done') return 100;
  if (t.subtasks.length) return Math.round((t.subtasks.filter(s => s.done).length / t.subtasks.length) * 100);
  return { backlog: 0, todo: 5, progress: 45, review: 80 }[t.status] || 0;
}

/* ---------- activity + notification helpers ---------- */
export function logAct(verb, t, extra = '') {
  D().activity.unshift({ id: uid('a'), by: D().me, verb, task: t?.id || null, project: t?.project || null, at: Date.now(), extra });
  if (t) t.updated = Date.now();
}

/* ---------- workspaces (server-backed, or the single local workspace) ---------- */
/* The role display: the document stores the capitalised id ('Owner', compared
   as such in src/pages/settings.js) while the catalogue key shape is lowercase,
   so the lookup LOWERCASES the stored id before it builds the key — the stored
   value never changes, only the display does (D-08, I18N-07's groundwork).
   `viewer` is the workspace role the server returns and renders the Guest
   label, exactly as ROLE_LABELS did; an unknown id falls back to the member
   label instead of showing the key itself (T-06-45). */
const ROLE_KEYS = new Set(['owner', 'admin', 'member', 'viewer', 'guest']);
export const roleLabel = role => {
  const id = String(role || '').toLowerCase();
  return ROLE_KEYS.has(id) ? t('common.role.' + id) : t('common.role.member');
};

/* Owner or admin: who may invite people and manage the roster. */
export const isMemberAdmin = () => ['Owner', 'Admin'].includes(me()?.role || '');

/* The signed-in account's workspaces in server mode; the local demo has exactly
   one workspace, derived from the current `ws` object (never a stored list). */
export function workspaceList() {
  if (api.enabled) {
    return api.workspaces.map(w => ({ id: w.id, slug: w.slug, name: w.name, color: w.color, role: w.role }));
  }
  const ws = D().ws || {};
  return [{ id: 'demo', slug: currentSlug(), name: ws.name || t('common.workspace'), color: ws.c || '#1D1C1A', role: 'owner' }];
}

export function currentSlug() {
  return (
    D().ws.url ||
    String(D().ws.name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  );
}

/* ---------- teams (workspace data, seeded on first use) ---------- */
/* The pseudo-team the interface shows when a member belongs to no team: its
   display name is a catalogue value read at access time, its icon and colour
   are machine values. */
export const NO_TEAM = {
  id: '',
  get name() {
    return t('common.noTeam');
  },
  icon: 'users',
  c: '#8A867E',
  desc: '',
};
export function teamsList() {
  const d = D();
  if (!d.teams) d.teams = TEAMS_SEED.map(t => ({ ...t }));
  return d.teams;
}
export function team(id) {
  return teamsList().find(t => t.id === id) || null;
}
export const TM = new Proxy({}, { get: (_, k) => team(k) || NO_TEAM });
/* A project's team ids as an array — tolerant of the legacy scalar shape. */
export function projTeams(p) {
  if (!p) return [];
  if (Array.isArray(p.teams)) return p.teams.filter(Boolean);
  return p.team ? [p.team] : [];
}
/* A member's team ids as an array — the client-side mirror of the same
   scalar→array tolerance projTeams applies to projects. One shared predicate
   for every roster/mention/picker surface; the API's teams[] payload and the
   legacy scalar doc shape both read through this. */
export function memberTeams(m) {
  if (!m) return [];
  if (Array.isArray(m.teams)) return m.teams.filter(Boolean);
  return m.team ? [m.team] : [];
}
export function projInTeam(p, teamId) {
  return projTeams(p).includes(teamId);
}
/* TEAM-04: a member is assignable to a project when their team set intersects
   the project's team set. Feeds assignment pickers via assignableInProject. */
export function memberInProjectTeams(m, p) {
  const mt = memberTeams(m);
  return projTeams(p).some(id => mt.includes(id));
}
/* TEAM-04: assignment-picker predicate — every assignee/subassignee option
   source filters through this. A project with an empty teams[] is unscoped:
   every member stays assignable (mirrors canSee's broad-access semantics).
   A member granted to a team-scoped project directly — their id in p.members
   (Share's push, the project-scoped invite-accept grant, 55-08) — is also
   assignable. Takes the task's CURRENT `assignees[]` array (D-55-11) — members
   already in the array are always offered so existing state is never silently
   hidden from the picker. A legacy scalar third argument (subtask popover until
   Plans 55-04/55-06 migrate) is tolerated as a one-element array. */
export function assignableInProject(m, p, currentAssignees) {
  const cur = Array.isArray(currentAssignees) ? currentAssignees : currentAssignees ? [currentAssignees] : [];
  if (!p || projTeams(p).length === 0) return true;
  return cur.includes(m?.id) || memberInProjectTeams(m, p) || (Array.isArray(p.members) && p.members.includes(m?.id));
}
/* Phase 29 SCOPE-04 (A4): send-time emit eligibility for notification
   targets. D-05 forbids projecting scope details, so this derives from the
   ACTOR's projected data only and DEFAULTS TO ELIGIBLE whenever scope is
   underivable — the server guards (reminder pass, email mirror, assignee
   write-guard) are the authority; an underivable target is never silently
   dropped. The only readable signals: the roster role (admin/owner is always
   workspace-wide, D-04) and an optional forward-compat scope marker on the
   projected profile — never rendered, never a UI scope read. */
export function memberScopeEligible(m, projectId) {
  if (!m) return false;
  if (!projectId) return true;
  const role = String(m.role || '').toLowerCase();
  if (role === 'admin' || role === 'owner') return true;
  let raw = m.scope;
  if (raw === undefined || raw === null) return true; // no marker in the projection → default-allow
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return true; // unreadable marker → default-allow, like the server predicate
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return true;
  const teams = Array.isArray(raw.teams) ? raw.teams.filter(t => typeof t === 'string' && t) : [];
  const projects = Array.isArray(raw.projects) ? raw.projects.filter(p => typeof p === 'string' && p) : [];
  if (!teams.length && !projects.length) return true; // empty scope = workspace-wide (D-01)
  const p = proj(projectId);
  if (p && projects.includes(p.id)) return true;
  return !!p && projTeams(p).some(t => teams.includes(t));
}
