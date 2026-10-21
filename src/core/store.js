/* ---------- store ---------- */
import { TODAY, diffD, iso, parse, uid } from './utils.js';
import { PCOLORS, TEAMS_SEED } from './constants.js';
import { seed } from '../data/seed.js';
import { api } from './api.js';

export const STORE_KEY = 'gr8r.v2';
export const DEFAULT_PREFS = {
  theme: 'system',
  accent: 'indigo',
  side: 'comfortable',
  density: 'comfortable',
  weekStart: 1,
  dateFmt: 'MMM d',
  lang: 'English (US)',
  tz: '(GMT-07:00) Pacific Time',
  motion: 'system',
  home: 'home',
  openTasks: 'drawer',
  name: 'Tanjim Islam',
  title: 'Head of Product',
};
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
  prefs: Object.assign({}, DEFAULT_PREFS, saved?.prefs || {}),
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
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('gr8r:save-error', { detail }));
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
  S.prefs = Object.assign({}, DEFAULT_PREFS, doc.prefs || {});
  S.views = doc.views || {};
  S.ui.collapsed = !!doc.collapsed;
  S.ui.conflict = false;
  if (Number.isInteger(revision)) api.revision = revision;
  const mid = api.user?.memberId;
  if (mid && S.data.members?.some(m => m.id === mid)) S.data.me = mid;
  return true;
}

export async function hydrateFromServer() {
  if (!api.enabled) return { ok: false, status: 0 };
  const res = await api.workspace();
  if (res.ok) applyDoc(res.data.doc, res.data.revision);
  return res;
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
export const canSee = p => !p.private || p.members.includes(D().me);
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

/* ---------- teams (workspace data, seeded on first use) ---------- */
export const NO_TEAM = { id: '', name: 'No team', icon: 'users', c: '#8A867E', desc: '' };
export function teamsList() {
  const d = D();
  if (!d.teams) d.teams = TEAMS_SEED.map(t => ({ ...t }));
  return d.teams;
}
export function team(id) {
  return teamsList().find(t => t.id === id) || null;
}
export const TM = new Proxy({}, { get: (_, k) => team(k) || NO_TEAM });
