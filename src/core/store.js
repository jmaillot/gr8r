/* ---------- store ---------- */
import { TODAY, diffD, iso, parse, uid } from './utils.js';
import { t } from './i18n.js';
import { PCOLORS, TEAMS_SEED } from './constants.js';
import { seed } from '../data/seed.js';
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
export function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && j.data && j.data.tasks) return j;
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

const docSnapshot = () => ({ data: S.data, prefs: S.prefs, views: S.views, collapsed: S.ui.collapsed });

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
  if (doc.data) S.data = doc.data;
  S.data.recentSearches = Array.isArray(S.data.recentSearches) ? S.data.recentSearches : [];
  S.data.savedViews = Array.isArray(S.data.savedViews) ? S.data.savedViews : [];
  /* P3 multi-team: migrate the legacy scalar project.team to teams[] for any
     doc shape still carrying it (fresh server doc, localStorage snapshot). */
  if (Array.isArray(S.data.projects)) {
    for (const p of S.data.projects) {
      if (!p || typeof p !== 'object') continue;
      if (p.team !== undefined) {
        p.teams = Array.isArray(p.team) ? p.team.filter(x => typeof x === 'string' && x) : (typeof p.team === 'string' && p.team ? [p.team] : []);
        delete p.team;
      }
      if (!Array.isArray(p.teams)) p.teams = [];
    }
  }
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
export const canSee = p => !!p && (!p.private || (Array.isArray(p.members) && p.members.includes(D().me)));
export const canManageProject = p => {
  const role = me()?.role;
  return role === 'Owner' || role === 'Admin' || (!!p && p.lead === D().me);
};
export const tasksOf = pid => D().tasks.filter(t => t.project === pid && !t.archived);
export const allTasks = () => D().tasks.filter(t => !t.archived && canSee(proj(t.project)));
export const isOver = t => t.due && t.status !== 'done' && diffD(parse(t.due), TODAY) < 0;
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
export function projInTeam(p, teamId) {
  return projTeams(p).includes(teamId);
}
