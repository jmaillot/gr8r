/* =====================================================================
   ACTIONS · INPUT HANDLERS · DRAG & DROP · KEYBOARD · INIT
   ===================================================================== */
import { $, $$, TODAY, addD, dOff, esc, fmtDate, iso, parse, uid } from '../core/utils.js';
import { t, t as tMsg, tErr, getLocale, negotiate, primeLocale, readStoredLocale, setLocale, storeLocale } from '../core/i18n.js';
import { PR, PSTAT } from '../core/constants.js';
import { seed } from '../data/seed.js';
import {
  D,
  DEFAULT_PREFS,
  S,
  allTasks,
  canManageProject,
  canSee,
  clearLocalCache,
  commentsOf,
  flushPending,
  hydrateFromServer,
  logAct,
  me,
  mem,
  notifyMembers,
  proj,
  projTeams,
  roleLabel,
  save,
  task,
  teamsList,
  tasksOf,
  visibleProjects,
} from '../core/store.js';
import { api, applyUser, registerAuthRevokedHandler } from '../core/api.js';
import { fileType, fsize } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { mutate, toast } from '../ui/toast.js';
import { autosize, focusKey, fxSet, go, render } from '../shell/render.js';
import { viewOf } from '../shell/view-engine.js';
import { TEMPLATES, closeModal, openModal } from '../overlays/modals.js';
import { closePop, openPop, tgt } from '../overlays/popovers.js';
import { strengthMeter } from '../pages/settings.js';
import { prefValue } from '../core/prefs.js';

/* The preference value is written the way the user chose it: the 'auto'
   sentinel must reach the bag as the string 'auto', so it is still read as
   the sentinel on the next render. The helper lives in core/prefs.js —
   a leaf module — because this one reaches a Vite virtual module through
   the store and cannot be imported by the node suite. */
export { prefValue };

export const A = {},
  IN = {},
  KEY = {},
  DBL = {},
  BLUR = {};

/* ---------- task mutations ---------- */
export function nextKey(p) {
  p.seq = (p.seq || 200) + 1;
  return p.key + '-' + p.seq;
}
export function createTask(f) {
  const p = proj(f.project) || visibleProjects().find(canSee);
  const maxO = Math.max(0, ...D().tasks.map(t => t.order));
  /* tk, not t: the default title reads the catalogue inside the object
     literal that this const initialises, so a local named t would be in its
     temporal dead zone while the literal evaluates. */
  const tk = Object.assign(
    {
      project: p.id,
      title: t('task.untitled'),
      status: 'todo',
      assignee: null,
      priority: 'none',
      due: null,
      start: null,
      labels: [],
      subtasks: [],
      attachments: [],
      deps: [],
      desc: '',
      estimate: null,
      created: Date.now(),
      updated: Date.now(),
      creator: D().me,
      order: maxO + 1,
      fav: false,
      recur: null,
    },
    f,
    { project: p.id },
  );
  tk.id = f.id || uid('t');
  tk.key = f.key || nextKey(p);
  D().tasks.push(tk);
  fxSet({ added: tk.id });
  logAct('created', tk, {});
  /* P4-b: a task created directly with an assignee notifies them too. */
  if (tk.assignee) notifyMembers([tk.assignee], { type: 'assign', by: D().me, task: tk.id, project: tk.project, snippet: fmtDate(tk.due) || '' });
  return tk;
}
export const RECUR_DAYS = { Daily: 1, Weekly: 7, 'Every 2 weeks': 14, Monthly: 30 };
/* ---------- P4-c mentions ---------- */
/* Parse `@Full Name`, `@First` (unique across the roster) and `@Team Name` in a
   plain-text body. Longest names win so "Sarah Chen" is not eaten by "Sarah". */
export function parseMentions(txt) {
  const d = D();
  const memberIds = new Set();
  const teamIds = new Set();
  const names = [
    ...(d.members || []).filter(m => m?.status !== 'invited' && m.name).map(m => ({ id: m.id, name: m.name })),
    ...(teamsList() || []).filter(tm => tm?.name).map(tm => ({ id: tm.id, name: tm.name, team: true })),
  ].sort((a, b) => b.name.length - a.name.length);
  // First pass: exact full names, longest first, consumed out of the text.
  let rest = txt;
  for (const { id, name, team } of names) {
    const re = new RegExp('(?:^|\\s)@' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)', 'gi');
    if (re.test(rest)) {
      (team ? teamIds : memberIds).add(id);
      rest = rest.replace(re, ' ');
    }
  }
  // Second pass: bare first tokens, only when unique among remaining members.
  for (const m of d.members || []) {
    if (m?.status === 'invited' || !m.name || memberIds.has(m.id)) continue;
    const first = m.name.split(' ')[0];
    if (rest.match(new RegExp('(?:^|\\s)@' + first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=\\s|$)', 'i'))) {
      const clash = (d.members || []).some(x => x !== m && x?.name && x.name.split(' ')[0] === first);
      if (!clash) memberIds.add(m.id);
    }
  }
  return { memberIds: [...memberIds], teamIds: [...teamIds] };
}
/* Emit mention notifications for a parsed body. Workspace notifPrefs gate the
   emission (mention_all for members, mention_team for @team).
   Returns the Set of member ids notified, so a comment can skip them for the
   plain `comment` notification (P4-d). */
export function emitMentions(txt, tk) {
  const { memberIds, teamIds } = parseMentions(txt || '');
  const np = D().notifPrefs || {};
  const targets = new Set();
  if (np.mention_all !== false) memberIds.forEach(id => targets.add(id));
  if (np.mention_team !== false) {
    for (const tid of teamIds) (D().members || []).forEach(m => { if (m?.team === tid && m.status === 'active') targets.add(m.id); });
  }
  if (targets.size) {
    // Snippet: a short plain excerpt around the first @, for the inbox preview.
    const at = (txt || '').indexOf('@');
    const snippet = at < 0 ? '' : (txt || '').slice(at, at + 70).trim();
    notifyMembers([...targets], { type: 'mention', by: D().me, task: tk?.id ?? null, project: tk?.project ?? null, snippet });
  }
  return targets;
}

/* P4-d/e: watchers of a task = its assignee, its creator (LINK-03) and
   everyone who commented on it. The author is excluded inside
   notifyMembers, but pre-filtering here keeps the notification lists
   honest for dedup and cap accounting. */
export function taskWatchers(t) {
  return [...new Set([t.assignee, t.creator, ...commentsOf(t.id).map(c => c.by)].filter(Boolean).filter(x => x !== D().me))];
}

export function applyPatch(t, patch) {
  const msgs = [];
  for (const k of Object.keys(patch)) {
    const old = t[k],
      nv = patch[k];
    if (JSON.stringify(old) === JSON.stringify(nv)) continue;
    t[k] = nv;
    if (k === 'status') {
      if (nv === 'done') {
        t.completedAt = Date.now();
        t.prevStatus = old;
        logAct('completed', t, {});
        fxSet({ done: t.id });
      } else logAct('moved', t, { kind: 'statusMoved', from: old, to: nv });
      /* P4-e: a status change notifies the task's watchers
         (author excluded inside taskWatchers/notifyMembers). */
      notifyMembers(taskWatchers(t), {
        type: 'update',
        by: D().me,
        task: t.id,
        project: t.project,
        status: nv,
      });
      if (nv === 'done' && t.recur && t.due) {
        const nd = iso(addD(parse(t.due), RECUR_DAYS[t.recur] || 7));
        const n = createTask({
          ...JSON.parse(JSON.stringify(t)),
          id: undefined,
          key: undefined,
          status: 'todo',
          due: nd,
          start: nd,
          subtasks: t.subtasks.map(s => ({ ...s, done: false })),
          completedAt: null,
          attachments: [],
        });
        delete n.prevStatus;
        msgs.push(tMsg('toast.recurringNext', { title: t.title, date: fmtDate(nd) }));
      }
    } else if (k === 'assignee') {
      logAct('assigned', t, nv ? { kind: 'assignedTo', value: mem(nv)?.name } : { kind: 'unassigned' });
      /* P4-b: notify the new assignee (author excluded inside notifyMembers). */
      if (nv) notifyMembers([nv], { type: 'assign', by: D().me, task: t.id, project: t.project, snippet: fmtDate(t.due) || '' });
    } else if (k === 'priority') logAct('changedPriorityOf', t, { kind: 'prioritySet', value: nv });
    else if (k === 'due') logAct('changedDueDateOf', t, nv ? { kind: 'dateSet', value: nv } : { kind: 'dateCleared' });
    else if (k === 'start') logAct('changedStartDateOf', t, nv ? { kind: 'dateSet', value: nv } : { kind: 'dateCleared' });
    else if (k === 'project') {
      const p = proj(nv);
      t.key = nextKey(p);
      logAct('moved', t, { kind: 'movedToProject', value: p.id });
    } else if (k === 'labels') logAct('updatedLabelsOn', t, {});
    else if (k === 'title') logAct('renamed', t, { kind: 'renamedTo', value: nv });
    else if (k === 'recur') logAct('setRepeatOn', t, nv ? { kind: 'repeatSet', id: nv.toLowerCase() } : {});
    else if (k === 'estimate') logAct('estimated', t, nv ? { kind: 'estimateSet', value: nv } : {});
    else if (k === 'deps') logAct('updatedDependenciesOf', t, {});
    t.updated = Date.now();
  }
  return msgs;
}
export function updateTask(id, patch) {
  if (id === '__form') {
    Object.assign(S.ui.form, patch);
    render();
    return;
  }
  const t = task(id);
  if (!t) return;
  let msgs = [];
  if (
    mutate(() => {
      msgs = applyPatch(t, patch);
    })
  )
    msgs.forEach(m => toast(m, { kind: 'info' }));
}
export function confirmDlg(o) {
  S.ui.confirmText = '';
  openModal({ type: 'confirm', ...o });
}
export function snapshot() {
  return JSON.stringify(S.data);
}
export function restore(snap) {
  S.data = JSON.parse(snap);
  save();
  render();
}
export async function copy(text, msg = t('toast.linkCopied')) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast(t('toast.copyUnavailable', { link: text }), { kind: 'info', ms: 6000 });
  }
}
export function loadingBtn(id, ms, fn) {
  const b = document.getElementById(id);
  if (b) {
    b.classList.add('is-loading');
    b.setAttribute('aria-busy', 'true');
  }
  setTimeout(fn, ms);
}
export function curProjectId() {
  if (S.ui.route === 'project') return S.ui.params.id;
  return null;
}
export function projectFromKey(key) {
  if (!key) return null;
  if (key.startsWith('p:')) return key.slice(2);
  if (key.startsWith('sv:')) return D().savedViews.find(v => v.id === key.slice(3))?.project;
  return null;
}

/* ---------- navigation ---------- */
A.go = el => {
  const r = el.dataset.r;
  const p = {};
  if (el.dataset.id) p.id = el.dataset.id;
  if (el.dataset.tab) p.tab = el.dataset.tab;
  else if (r === 'project') p.tab = S.prefs.defaultTab || 'board';
  if (el.dataset.sec) p.sec = el.dataset.sec;
  S.ui.palette = null;
  const tabOnly = r === 'project' && S.ui.route === 'project' && S.ui.params.id === p.id;
  go(r, p, { tab: tabOnly });
  if (r === 'members' && api.enabled) refreshMembers();
  if (r === 'settings' && (p.sec === 'sessions' || p.sec === 'tfa') && api.enabled) {
    refreshSessions();
    refreshTfa(); // T-16-13: the card's on/off split re-reads the server
    if (p.sec === 'sessions') refreshOperatorUsers(); // OPREV-02: card lives only on the sessions tab (IN-02)
  }
};
A.back = () => {
  const h = S.ui.history.pop();
  if (h) go(h.route, h.params, { back: true });
  else go('home');
};
A.reload = () => render();
A.openProject = el => go('project', { id: el.dataset.id, tab: S.prefs.defaultTab || 'board' });
A.set = el => {
  const k = el.dataset.k;
  let v = el.dataset.v;
  if (/Tab$|Cat$|Mode$|View$/.test(k)) fxSet({ tabs: true });
  if (k === 'inboxSel' && !v) v = null;
  S.ui[k] = v;
  if (k === 'membersTab' || k === 'searchCat') S.ui.pop = null;
  render();
};
A.toggleSide = () => {
  S.ui.collapsed = !S.ui.collapsed;
  save();
  render();
};
A.openMnav = () => {
  S.ui.mnav = true;
  render();
};
A.closeMnav = () => {
  S.ui.mnav = false;
  render();
};
A.toggleExpand = el => {
  S.ui.expanded[el.dataset.id] = !S.ui.expanded[el.dataset.id];
  render();
};
A.goTasks = el => {
  const f = el.dataset.f;
  const v = viewOf('tasks');
  v.mode = 'list';
  v.filters =
    f === 'open'
      ? [{ f: 'status', op: 'not', v: ['done'] }]
      : f === 'done'
        ? [
            { f: 'status', op: 'is', v: ['done'] },
            { f: 'updated', op: 'is', v: ['7'] },
          ]
        : f === 'overdue'
          ? [{ f: 'due', op: 'is', v: ['overdue'] }]
          : [];
  go('tasks');
};
A.goFilteredList = el => {
  const v = viewOf('p:' + el.dataset.id);
  v.filters = [{ f: 'status', op: 'is', v: [el.dataset.st] }];
  v.group = 'status';
  go('project', { id: el.dataset.id, tab: 'list' }, { tab: true });
};

/* ---------- theme ---------- */
A.setTheme = el => {
  S.prefs.theme = el.dataset.v;
  save();
  render();
};
A.toggleDark = () => {
  S.prefs.theme = effectiveDark() ? 'light' : 'dark';
  save();
  S.ui.palette = null;
  render();
  toast(effectiveDark() ? t('toast.darkModeOn') : t('toast.lightModeOn'), { kind: 'info', ms: 1800 });
};
A.setPref = el => {
  S.prefs[el.dataset.k] = prefValue(el.dataset.k, el.dataset.v);
  save();
  render();
};

/* ---------- popovers ---------- */
A.pop = el => {
  const d = el.dataset;
  const p = S.ui.pop;
  if (p && p.type === d.pop && p.id === d.id && p.key === d.key && p.i == (d.i != null ? +d.i : undefined) && p.field === d.field) {
    closePop();
    return;
  }
  openPop(el);
};
A.ctxBtn = el => {
  const r = el.getBoundingClientRect();
  const d = el.dataset;
  const p = S.ui.pop;
  if (p && p.type === 'ctx' && p.id === d.id && p.ctx === d.ctx) {
    closePop();
    return;
  }
  S.ui.pop = { type: 'ctx', ctx: d.ctx, id: d.id, key: d.key, vid: d.vid, x: r.left, y: r.bottom + 4, top: r.top, w: r.width };
  render();
};
A.popPick = el => {
  const p = S.ui.pop;
  let v = el.dataset.v;
  if (p.type === 'subassignee' || (p.type === 'date' && p.field === 'subdue')) {
    const t = task(p.id);
    const sb = t?.subtasks[p.i];
    if (!sb) return;
    const k = p.type === 'subassignee' ? 'assignee' : 'due';
    v = v || null;
    S.ui.pop = null;
    mutate(() => {
      sb[k] = v;
      logAct(
        k === 'assignee' ? 'assignedASubtaskOn' : 'setASubtaskDueDateOn',
        t,
        k === 'assignee'
          ? v
            ? { kind: 'assignedTo', value: mem(v)?.name ?? '' }
            : { kind: 'unassigned' }
          : v
            ? { kind: 'dateSet', value: v }
            : { kind: 'dateCleared' },
      );
    });
    return;
  }
  if (p.type === 'pstatus') {
    const pr = proj(p.id);
    mutate(() => {
      pr.status = v;
      D().activity.unshift({
        id: uid('a'),
        by: D().me,
        verb: 'projectStatusChanged',
        task: null,
        project: pr.id,
        at: Date.now(),
        extra: { kind: 'projStatusSet', value: v },
      });
    });
    S.ui.pop = null;
    render();
    toast(t('toast.projectMarked', { name: pr.name, status: PSTAT[v].name }));
    return;
  }
  if (p.type === 'role') {
    const m = mem(p.id);
    S.ui.pop = null;
    if (v === m.role) {
      render();
      return;
    }
    if (api.enabled) {
      if (!m.userId) {
        render();
        toast(t('err.noAccountYet', { name: m.name }), { kind: 'err' });
        return;
      }
      const previous = m.role;
      m.role = v;
      render();
      api.setMember(m.userId, { role: API_ROLE[v] || 'member' }).then(res => {
        if (!res.ok) {
          m.role = previous;
          render();
          toast(res.error || t('err.changeRole'), { kind: 'err' });
          return;
        }
        toast(t('toast.roleChanged', { name: m.name, article: getLocale() === 'fr' ? 'un' : v === 'Admin' || v === 'Owner' ? 'an' : 'a', role: roleLabel(v) }));
        refreshMembers();
      });
      return;
    }
    mutate(() => {
      m.role = v;
    });
    render();
    toast(t('toast.roleChanged', { name: m.name, article: getLocale() === 'fr' ? 'un' : v === 'Admin' ? 'an' : 'a', role: roleLabel(v) }));
    return;
  }
  const field = { status: 'status', priority: 'priority', assignee: 'assignee', project: 'project', recur: 'recur', estimate: 'estimate', date: p.field }[
    p.type
  ];
  if (!field) return;
  if (field === 'assignee' && !v) v = null;
  if (field === 'recur' && v === 'Does not repeat') v = null;
  if ((field === 'estimate' || field === 'due' || field === 'start') && !v) v = null;
  S.ui.pop = null;
  const patch = { [field]: v };
  if (field === 'due' && v && p.id !== '__form') {
    const t = task(p.id);
    if (t.start && t.start > v) patch.start = v;
  }
  updateTask(p.id, patch);
};
A.popToggleLabel = el => {
  const p = S.ui.pop;
  const t = tgt(p);
  const v = el.dataset.v;
  const labels = t.labels.includes(v) ? t.labels.filter(x => x !== v) : [...t.labels, v];
  updateTask(p.id, { labels });
};
A.popToggleDep = el => {
  const p = S.ui.pop;
  const t = task(p.id);
  const v = el.dataset.v;
  updateTask(p.id, { deps: t.deps.includes(v) ? t.deps.filter(x => x !== v) : [...t.deps, v] });
};
A.popMonth = el => {
  const p = S.ui.pop;
  const m = parse(p.m);
  p.m = iso(new Date(m.getFullYear(), m.getMonth() + +el.dataset.d, 1));
  render();
};
IN.popQ = el => {
  if (S.ui.pop) {
    S.ui.pop.q = el.value;
    render();
  }
};
export const ctxTo = type => () => {
  S.ui.pop = { ...S.ui.pop, type, q: '' };
  if (type === 'date') S.ui.pop.m = iso(TODAY);
  render();
};
A.ctxStatus = ctxTo('status');
A.ctxAssign = ctxTo('assignee');
A.ctxPrio = ctxTo('priority');
A.ctxMove = ctxTo('project');
A.ctxRole = ctxTo('role');

/* ---------- tasks ---------- */
A.openTask = el => {
  const id = el.dataset.id;
  if (!task(id)) return;
  if (!canSee(proj(task(id).project))) {
    toast(t('err.taskAccess'), { kind: 'err' });
    return;
  }
  if (!S.ui.drawer || !document.activeElement?.closest?.('.drawer')) S.ui.drawerOpener = el.isConnected ? focusKey(el) : S.ui.drawerOpener;
  S.ui.drawer = id;
  S.ui.drawerFull = S.prefs.openTasks === 'full' || (S.ui.drawerFull && S.ui.drawer === id);
  S.ui.pop = null;
  S.ui.palette = null;
  S.ui.modals = [];
  S.ui.mention = null;
  S.ui.subOpen = null;
  S.ui.drawerTab = S.ui.drawerTab || 'comments';
  /* LINK-04 (plan 23-04): opening the drawer routes through go() so its URL
     write (pushState of /w/:slug/task/:key) happens in the single seam —
     back returns to the underlying view, forward re-opens the task, and
     internal clicks behave exactly like deep links (SC-4). noHistory keeps
     the drawer out of the internal view-back stack (it is not a view); the
     same-URL guard in go() skips the write when the task URL is already
     showing (e.g. a popstate re-open). */
  go(S.ui.route, S.ui.params, { keepDrawer: true, noHistory: true });
  const dr = $('.drawer');
  if (dr && !dr.contains(document.activeElement)) dr.focus({ preventScroll: true });
};
A.closeDrawer = () => {
  S.ui.drawer = null;
  S.ui.drawerFull = false;
  S.ui.subOpen = null;
  /* LINK-04 (plan 23-04; research Open Question 2, RESOLVED — consistent
     with D-03): closing the drawer PUSHES the underlying view's URL as a new
     history entry — the task URL is never rewritten while the drawer is
     open, so browser Back after closing re-opens the task. */
  go(S.ui.route, S.ui.params, { keepDrawer: true, noHistory: true });
};
A.skipToContent = () => {
  const c = $('#main-content');
  c?.focus();
};
A.projUp = el => A._projMove(el, -1);
A.projDown = el => A._projMove(el, 1);
A._projMove = (el, d) => {
  const vis = visibleProjects().map(p => p.id);
  const i = vis.indexOf(el.dataset.id);
  const j = i + d;
  if (j < 0 || j >= vis.length) return;
  const o = D().projOrder;
  const a = o.indexOf(vis[i]),
    b = o.indexOf(vis[j]);
  [o[a], o[b]] = [o[b], o[a]];
  S.ui.pop = null;
  save();
  render();
  toast(t('toast.moved', { name: proj(el.dataset.id).name, direction: t(d < 0 ? 'toast.dirUp' : 'toast.dirDown') }), { ms: 1600 });
};
A.toggleDrawerFull = () => {
  S.ui.drawerFull = !S.ui.drawerFull;
  render();
};
A.toggleDone = el => {
  const tk = task(el.dataset.id);
  if (!tk) return;
  const wasDone = tk.status === 'done';
  S.ui.pop = null;
  updateTask(tk.id, { status: wasDone ? (tk.prevStatus && tk.prevStatus !== 'done' ? tk.prevStatus : 'todo') : 'done' });
  if (!wasDone && !S.ui.offline)
    toast(t('toast.completed', { title: tk.title }), { action: t('toast.undo'), onAction: () => updateTask(tk.id, { status: tk.prevStatus || 'todo' }) });
};
A.toggleFavTask = el => {
  const tk = task(el.dataset.id);
  mutate(() => {
    tk.fav = !tk.fav;
  });
  S.ui.pop = null;
  toast(tk.fav ? t('toast.addedToFavorites') : t('toast.removedFromFavorites'), { ms: 1800 });
  render();
};
A.toggleFavProj = el => {
  const p = proj(el.dataset.id);
  mutate(() => {
    p.fav = !p.fav;
  });
  S.ui.pop = null;
  render();
  toast(p.fav ? t('toast.projectAddedToFavorites', { name: p.name }) : t('toast.removedFromFavorites'), { ms: 1800 });
};
A.copyLink = el => {
  S.ui.pop = null;
  render();
  const d = el.dataset;
  /* G-12-2: the « ... » file context menu stamps only data-id; the file menu's
     copyLink item must resolve the file link from that id. Branch order is
     safe: task, pid and fid lookups are all keyed on id-spaces disjoint from
     file ids, so a file-id data-id deterministically misses them first
     (debug-session branch simulation). */
  const file = d.id ? (D().files || []).find(f => f.id === d.id) : null;
  const path =
    d.id && task(d.id)
      ? `task/${task(d.id).key}`
      : d.pid
        ? `project/${proj(d.pid).key.toLowerCase()}`
        : d.fid
          ? `file/${d.fid}`
          : file
            ? `file/${file.id}`
            : d.id && proj(d.id)
              ? `project/${proj(d.id).key.toLowerCase()}`
              : '';
  copy(`${api.url}/w/${D().ws.url}${path ? `/${path}` : ''}`);
};
A.copyText = el => copy(el.dataset.text, t('toast.copiedToClipboard'));
A.copyEmail = el => {
  S.ui.pop = null;
  render();
  copy(mem(el.dataset.id).email, t('toast.emailCopied'));
};
A.dupTask = el => {
  const tk = task(el.dataset.id);
  S.ui.pop = null;
  let n;
  mutate(() => {
    n = createTask({
      ...JSON.parse(JSON.stringify(tk)),
      id: uid('t'),
      key: undefined,
      title: `${tk.title} ${t('act.copySuffix')}`,
      created: Date.now(),
      fav: false,
    });
    n.key = nextKey(proj(n.project));
  });
  toast(t('toast.taskDuplicated'), { action: t('toast.open'), onAction: () => A.openTask({ dataset: { id: n.id } }) });
};
A.archiveTask = el => {
  const tk = task(el.dataset.id);
  const snap = snapshot();
  S.ui.pop = null;
  if (S.ui.drawer === tk.id) {
    S.ui.drawer = null;
    /* LINK-04: the drawer URL (if any) must not outlive the drawer. */
    go(S.ui.route, S.ui.params, { keepDrawer: true, noHistory: true });
  }
  mutate(() => {
    tk.archived = true;
    tk.archivedAt = Date.now();
    logAct('archived', tk, {});
  });
  toast(t('toast.archivedTask', { title: tk.title }), { action: t('toast.undo'), onAction: () => restore(snap) });
};
export function deleteTasks(ids) {
  const set = new Set(ids);
  D().tasks = D().tasks.filter(t => !set.has(t.id));
  D().tasks.forEach(t => (t.deps = t.deps.filter(d => !set.has(d))));
  D().comments = D().comments.filter(c => !set.has(c.task));
  if (set.has(S.ui.drawer)) S.ui.drawer = null;
  ids.forEach(i => S.ui.sel.delete(i));
}
A.delTask = el => {
  const tk = task(el.dataset.id);
  S.ui.pop = null;
  if (!tk) return;
  const run = () => {
    const snap = snapshot();
    if (mutate(() => deleteTasks([tk.id]))) toast(t('toast.deletedTask', { title: tk.title }), { action: t('toast.undo'), onAction: () => restore(snap) });
  };
  if (S.prefs.confirmDel === false && !el.dataset.demo) return run();
  confirmDlg({
    title: t('act.deleteTaskTitle'),
    body: `<b>${esc(tk.title)}</b>${tk.subtasks.length ? `, its ${tk.subtasks.length} subtasks,` : ''} and ${commentsOf(tk.id).length} comment${commentsOf(tk.id).length === 1 ? '' : 's'} will be permanently deleted.`,
    ok: t('act.deleteTask'),
    danger: true,
    run,
  });
};
A.editTask = el => {
  const t = task(el.dataset.id);
  if (!t) return;
  S.ui.form = {
    title: t.title,
    desc: (t.desc || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
    project: t.project,
    status: t.status,
    assignee: t.assignee,
    priority: t.priority,
    due: t.due,
    start: t.start,
    labels: [...t.labels],
    subtasks: t.subtasks.map(s => ({ ...s })),
    files: [],
    recur: t.recur,
    more: false,
  };
  S.ui.errors = {};
  openModal({ type: 'task', edit: t.id });
};
A.newTask = el => {
  const d = el?.dataset || {};
  const pid =
    d.project ||
    curProjectId() ||
    projectFromKey(S.ui.composer?.ctx) ||
    (S.ui.drawer && task(S.ui.drawer)?.project) ||
    visibleProjects().find(p => canSee(p) && p.status !== 'complete')?.id;
  S.ui.form = {
    title: '',
    desc: '',
    project: canSee(proj(pid)) ? pid : 'p1',
    status: 'todo',
    assignee: d.assignee || D().me,
    priority: 'medium',
    due: d.due || null,
    start: null,
    labels: [],
    subtasks: [],
    files: [],
    recur: null,
    more: S.ui.form?.more || false,
  };
  S.ui.errors = {};
  openModal({ type: 'task' });
};
IN.form = el => {
  S.ui.form[el.dataset.f] = el.value;
  if (el.dataset.f === 'title' && S.ui.errors.title && el.value.trim()) {
    S.ui.errors.title = null;
    render();
  }
};
IN.formMore = el => {
  S.ui.form.more = el.checked;
};
IN.formFiles = el => {
  [...el.files].forEach(f => S.ui.form.files.push({ name: f.name, size: fsize(f.size), type: fileType(f.name) }));
  render();
};
KEY.formAddSub = el => {
  const v = el.value.trim();
  if (!v) return;
  S.ui.form.subtasks.push({ id: uid('s'), title: v, done: false });
  render();
  setTimeout(() => $('#f-sub')?.focus(), 0);
};
A.formRmSub = el => {
  S.ui.form.subtasks.splice(+el.dataset.i, 1);
  render();
};
A.formRmFile = el => {
  S.ui.form.files.splice(+el.dataset.i, 1);
  render();
};
A.submitTask = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.form;
  const title = ($('#f-title')?.value ?? f.title).trim();
  f.title = title;
  f.desc = $('#f-desc')?.value ?? f.desc;
  if (!title) {
    S.ui.errors.title = t('err.taskNameRequired');
    render();
    $('#f-title')?.focus();
    return;
  }
  S.ui.errors = {};
  const files = f.files.map(x => ({ id: uid('a'), name: x.name, type: x.type, size: x.size, by: D().me, at: Date.now() }));
  const base = {
    title,
    project: f.project,
    status: f.status,
    assignee: f.assignee,
    priority: f.priority,
    due: f.due,
    start: f.start && f.due && f.start > f.due ? f.due : f.start,
    labels: f.labels,
    recur: f.recur,
    subtasks: f.subtasks,
  };
  if (m.edit) {
    const tk = task(m.edit);
    if (
      !mutate(() => {
        applyPatch(tk, base);
        if (
          f.desc !==
          (tk.desc || '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
        ) {
          tk.desc = f.desc ? `<p>${esc(f.desc)}</p>` : '';
          /* P4-c: mentions typed in a freshly saved description notify too (dedup guards repeats). */
          if (f.desc && f.desc.includes('@')) emitMentions(f.desc, tk);
        }
        tk.attachments.push(...files);
      })
    )
      return;
    S.ui.modals.pop();
    render();
    toast(t('toast.changesSaved'));
    return;
  }
  let tk;
  if (
    !mutate(() => {
      tk = createTask({ ...base, desc: f.desc ? `<p>${esc(f.desc)}</p>` : '', attachments: files });
      files.forEach(x => D().files.unshift({ ...x, project: tk.project, task: tk.id }));
      /* P4-c: mentions typed in the description notify too. */
      if (f.desc) emitMentions(f.desc, tk);
    })
  )
    return;
  if (f.more) {
    Object.assign(f, { title: '', desc: '', subtasks: [], files: [] });
    render();
    setTimeout(() => $('#f-title')?.focus(), 0);
    toast(t('toast.created', { key: tk.key }), { ms: 2000 });
    return;
  }
  S.ui.modals.pop();
  fxSet({ added: tk.id });
  render();
  toast(t('toast.createdIn', { key: tk.key, name: proj(tk.project).name }), {
    action: t('toast.open'),
    onAction: () => A.openTask({ dataset: { id: tk.id } }),
  });
};

/* inline composer */
A.startComposer = el => {
  S.ui.composer = { ctx: el.dataset.ctx, group: el.dataset.group, gb: JSON.parse(el.dataset.gb || '{}') };
  S.ui.pop = null;
  render();
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
A.cancelComposer = () => {
  S.ui.composer = null;
  render();
};
KEY.commitComposer = () => A.commitComposer();
A.commitComposer = () => {
  const c = S.ui.composer;
  const el = $('#composer-in');
  const v = el?.value.trim();
  if (!c) return;
  if (!v) {
    A.cancelComposer();
    return;
  }
  const f = { title: v, ...c.gb };
  f.project = f.project || projectFromKey(c.ctx) || curProjectId() || 'p1';
  if (c.ctx === 'mytasks') f.assignee = D().me;
  mutate(() => createTask(f));
  setTimeout(() => $('#composer-in')?.focus(), 0);
};
KEY.commitTitle = el => DBL._commitTitle(el);
DBL.editTitle = el => {
  const row = el.closest('[data-task-row]');
  if (!row) return;
  S.ui.drawer = null;
  /* LINK-04: the drawer URL (if any) must not outlive the drawer. */
  go(S.ui.route, S.ui.params, { keepDrawer: true, noHistory: true });
  S.ui.editCell = { id: row.dataset.taskRow, f: 'title' };
  render();
  const i = $('#edit-title');
  if (i) {
    i.focus();
    i.select();
  }
};
DBL._commitTitle = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (v && v !== task(c.id).title) updateTask(c.id, { title: v });
  else render();
};
DBL.editCell = el => {
  S.ui.drawer = null;
  S.ui.editCell = { id: el.dataset.id || el.closest('[data-id]').dataset.id, f: el.dataset.f };
  render();
  const i = $('#edit-cell');
  if (i) {
    i.focus();
    i.select();
  }
};
A.editCell = el => DBL.editCell(el);
KEY.commitCell = el => {
  const c = S.ui.editCell;
  if (!c) return;
  S.ui.editCell = null;
  const v = el.value.trim();
  if (c.f === 'title' && !v) {
    render();
    return;
  }
  updateTask(c.id, { [c.f]: v || null });
};
BLUR.commitCell = el => KEY.commitCell(el);
BLUR.commitTitle = el => DBL._commitTitle(el);
BLUR.commitDrawerTitle = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (t && v && v !== t.title) updateTask(t.id, { title: v });
};
KEY.blur = el => el.blur();

/* subtasks */
A.toggleSub = el => {
  const t = task(el.dataset.id);
  const s = t.subtasks.find(x => x.id === el.dataset.sid);
  if (!s.done) fxSet({ done: s.id });
  mutate(() => {
    s.done = !s.done;
    logAct(s.done ? 'completedSubtaskOn' : 'reopenedSubtaskOn', t, { kind: 'quoted', value: s.title });
  });
};
A.rmSub = el => {
  const t = task(el.dataset.id);
  mutate(() => {
    t.subtasks = t.subtasks.filter(x => x.id !== el.dataset.sid);
  });
};
KEY.addSub = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (!v) return;
  const nid = uid('s');
  fxSet({ added: nid });
  mutate(() => {
    t.subtasks.push({ id: nid, title: v, done: false });
    logAct('addedSubtaskTo', t, { kind: 'subtaskAdded', value: v });
  });
  setTimeout(() => $('#d-sub')?.focus(), 0);
};
A.expandRow = el => {
  S.ui.openTasks[el.dataset.id] = !S.ui.openTasks[el.dataset.id];
  render();
};

/* attachments */
A.rmAttach = el => {
  const tk = task(el.dataset.id);
  const f = tk.attachments.find(a => a.id === el.dataset.aid);
  mutate(() => {
    tk.attachments = tk.attachments.filter(a => a.id !== el.dataset.aid);
    logAct('removedAFileFrom', tk, { kind: 'fileRemoved', value: f.name });
  });
  toast(t('toast.removed', { name: f.name }));
};
A.filePreview = el => {
  const t = task(el.dataset.tid);
  const f = t.attachments.find(a => a.id === el.dataset.aid);
  openModal({ type: 'filePreview', file: f, tid: t.id });
};
A.previewFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (f) openModal({ type: 'filePreview', file: f, tid: f.task });
};
export function handleFiles(files, ctx) {
  if (!files || !files.length) return;
  if (S.ui.offline) {
    toast(t('err.uploadOffline'), { kind: 'err', action: t('toast.tryAgain'), onAction: () => {} });
    return;
  }
  S.ui.uploads = S.ui.uploads || [];
  [...files].forEach(file => {
    const up = { id: uid('u'), name: file.name, size: fsize(file.size), project: ctx.project, task: ctx.task, pct: 0 };
    S.ui.uploads.push(up);
    /* D-08: one XHR per file — fetch has no upload progress. Real bytes POST raw to the
       upload endpoint; the progress contract (--p CSS var + pct text) is preserved. */
    const failRow = code => {
      S.ui.uploads = S.ui.uploads.filter(x => x !== up);
      render();
      toast(tErr(code, null, t('err.serverUnreachable')), { kind: 'err' });
    };
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/w/${D().ws.url}/files?name=${encodeURIComponent(file.name)}&project=${ctx.project || ''}&task=${ctx.task || ''}`);
    xhr.responseType = 'json';
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return;
      up.pct = Math.round((e.loaded / e.total) * 100);
      const bar = document.getElementById('upbar-' + up.id),
        pc = document.getElementById('upct-' + up.id);
      if (bar) bar.style.setProperty('--p', up.pct / 100);
      if (pc) pc.textContent = up.pct + '%';
    };
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return failRow(xhr.response?.code || 'serverUnreachable');
      S.ui.uploads = S.ui.uploads.filter(x => x !== up);
      const rec = { id: xhr.response.id, name: up.name, type: fileType(up.name), size: up.size, by: D().me, at: Date.now() };
      D().files.unshift({ ...rec, project: up.project, task: up.task || null });
      if (up.task) {
        const tk = task(up.task);
        tk.attachments.push(rec);
        logAct('addedAFileTo', tk, { kind: 'fileAdded', value: up.name });
      }
      save();
      render();
      toast(t('toast.uploaded', { name: up.name }));
    };
    xhr.onerror = () => failRow('serverUnreachable');
    xhr.send(file);
  });
  render();
}
IN.uploadFiles = el => {
  handleFiles(el.files, { project: el.dataset.project, task: el.dataset.task });
  el.value = '';
};

/* comments */
IN.draft = el => {
  const id = el.dataset.id;
  S.ui.drafts[id] = el.value;
  const before = el.value.slice(0, el.selectionStart);
  const m = before.match(/(?:^|\s)@([A-Za-z]*)$/);
  const prev = JSON.stringify(S.ui.mention);
  S.ui.mention = m ? { tid: id, q: m[1] } : null;
  if (prev !== JSON.stringify(S.ui.mention)) render();
  if (el.dataset.autosize != null) autosize(el);
};
A.pickMention = el => {
  const id = el.dataset.id;
  const d = S.ui.drafts[id] || '';
  S.ui.drafts[id] = d.replace(/@([A-Za-z]*)$/, '@' + el.dataset.name + ' ');
  S.ui.mention = null;
  render();
  const ta = $('#d-cmt');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
};
A.insertAt = el => {
  const id = el.dataset.id;
  const d = S.ui.drafts[id] || '';
  S.ui.drafts[id] = d + (d && !d.endsWith(' ') ? ' @' : '@');
  S.ui.mention = { tid: id, q: '' };
  render();
  const ta = $('#d-cmt');
  if (ta) {
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  }
};
KEY.postComment = el => A.postComment(el);
A.postComment = el => {
  const id = el.dataset.id;
  const txt = (S.ui.drafts[id] || '').trim();
  if (!txt) {
    $('#d-cmt, #inbox-reply')?.focus();
    return;
  }
  const tk = task(id);
  if (
    mutate(() => {
      D().comments.push({ id: uid('c'), task: id, by: D().me, at: Date.now(), text: txt, re: {} });
      logAct('commentedOn', tk, {});
      S.ui.drafts[id] = '';
      S.ui.mention = null;
      S.ui.drawerTab = 'comments';
    })
  ) {
    /* P4-c: a comment notifies the members and teams @mentioned in it. */
    const mentioned = emitMentions(txt, tk);
    /* P4-d: the task's watchers (assignee, prior commenters) get a `comment`
       notification — unless they were just mentioned in this same comment. */
    const rest = taskWatchers(tk).filter(x => !mentioned.has(x));
    if (rest.length) notifyMembers(rest, { type: 'comment', by: D().me, task: tk.id, project: tk.project, snippet: txt.slice(0, 70) });
    if (S.ui.route === 'inbox') toast(t('toast.replyPosted'));
  }
};
A.delComment = el => {
  const c = D().comments.find(x => x.id === el.dataset.id);
  const snap = snapshot();
  mutate(() => {
    D().comments = D().comments.filter(x => x !== c);
  });
  toast(t('toast.commentDeleted'), { action: t('toast.undo'), onAction: () => restore(snap) });
};
A.react = el => {
  const c = D().comments.find(x => x.id === el.dataset.id);
  const e = el.dataset.e;
  S.ui.pop = null;
  mutate(() => {
    c.re = c.re || {};
    const l = c.re[e] || [];
    c.re[e] = l.includes(D().me) ? l.filter(x => x !== D().me) : [...l, D().me];
  });
};

/* rich text description */
document.addEventListener('mousedown', e => {
  const b = e.target.closest('[data-cmd]');
  if (!b) return;
  e.preventDefault();
  const [cmd, arg] = b.dataset.cmd.split(':');
  if (cmd === 'createLink') {
    const s = String(getSelection());
    if (/^https?:\/\//.test(s)) document.execCommand('createLink', false, s);
    else toast(t('toast.selectUrlToLink'), { kind: 'info' });
  } else document.execCommand(cmd, false, arg ? `<${arg}>` : null);
  const ed = $('#d-desc');
  if (ed) {
    const tk = task(ed.dataset.rte);
    tk.desc = ed.innerHTML;
    save();
  }
});
document.addEventListener('input', e => {
  const ed = e.target.closest?.('[data-rte]');
  if (!ed) return;
  const t = task(ed.dataset.rte);
  if (t) {
    t.desc = ed.innerHTML;
    t.updated = Date.now();
    save();
  }
});

/* selection & bulk */
A.selRow = el => {
  const id = el.dataset.id;
  S.ui.sel.has(id) ? S.ui.sel.delete(id) : S.ui.sel.add(id);
  render();
};
A.selAll = el => {
  const ids = $$('[data-task-row]', el.closest('.tlist')).map(r => r.dataset.taskRow);
  const all = ids.every(i => S.ui.sel.has(i));
  ids.forEach(i => (all ? S.ui.sel.delete(i) : S.ui.sel.add(i)));
  render();
};
A.clearSel = () => {
  S.ui.sel.clear();
  render();
};
A.bulkSet = el => {
  const f = el.dataset.f;
  let v = el.dataset.v || null;
  const ids = [...S.ui.sel];
  S.ui.pop = null;
  if (mutate(() => ids.forEach(id => applyPatch(task(id), { [f]: v })))) toast(t('act.tasksUpdated', { n: ids.length }));
};
A.bulkDelete = () => {
  const ids = [...S.ui.sel];
  confirmDlg({
    title: t('act.deleteTasksTitle', { n: ids.length }),
    body: t('act.deleteTasksBody'),
    ok: t('act.deleteTasksConfirm', { n: ids.length }),
    danger: true,
    run: () => {
      const snap = snapshot();
      if (mutate(() => deleteTasks(ids))) toast(t('toast.deletedTasks', { n: ids.length }), { action: t('toast.undo'), onAction: () => restore(snap) });
    },
  });
};

/* views: sort, group, filters, columns */
A.sortBy = el => {
  const v = viewOf(el.dataset.key);
  const f = el.dataset.f;
  if (S.ui.justResized) return;
  v.sort = v.sort.f === f ? { f, dir: -v.sort.dir } : { f, dir: 1 };
  save();
  render();
};
A.setSort = el => {
  const v = viewOf(el.dataset.key);
  v.sort = { f: el.dataset.v, dir: v.sort.dir || 1 };
  S.ui.pop = null;
  save();
  render();
};
A.setSortDir = el => {
  viewOf(el.dataset.key).sort.dir = +el.dataset.v;
  save();
  render();
};
A.setGroup = el => {
  viewOf(el.dataset.key).group = el.dataset.v;
  S.ui.pop = null;
  save();
  render();
};
A.toggleGroup = el => {
  const gk = el.dataset.gk;
  S.ui.collapsedGroups[gk] = el.getAttribute('aria-expanded') === 'true';
  render();
};
A.setViewMode = el => {
  viewOf(el.dataset.key).mode = el.dataset.v;
  save();
  render();
};
A.toggleCol2 = el => {
  const v = viewOf(el.dataset.key);
  const c = el.dataset.v;
  v.hidden = v.hidden.includes(c) ? v.hidden.filter(x => x !== c) : [...v.hidden, c];
  save();
  render();
};
A.resetCols = el => {
  viewOf(el.dataset.key).colW = {};
  S.ui.pop = null;
  save();
  render();
};
IN.viewQ = el => {
  viewOf(el.dataset.key).q = el.value;
  render();
};
A.addFilter = el => {
  const v = viewOf(el.dataset.key);
  v.filters.push({ f: el.dataset.f, op: 'is', v: [] });
  if (S.ui.pop?.type === 'filter') S.ui.pop.edit = v.filters.length - 1;
  else {
    const r = el.getBoundingClientRect();
    S.ui.pop = { type: 'filter', key: el.dataset.key, x: r.left, y: r.bottom + 4, edit: v.filters.length - 1 };
  }
  save();
  render();
};
A.fEdit = el => {
  const p = S.ui.pop;
  p.edit = p.edit === +el.dataset.i ? null : +el.dataset.i;
  render();
};
A.fToggleVal = el => {
  const f = viewOf(el.dataset.key).filters[+el.dataset.i];
  const x = el.dataset.v;
  f.v = f.v.includes(x) ? f.v.filter(y => y !== x) : [...f.v, x];
  save();
  render();
};
A.rmFilter = el => {
  const v = viewOf(el.dataset.key);
  v.filters.splice(+el.dataset.i, 1);
  if (S.ui.pop && S.ui.pop.type === 'fvals') S.ui.pop = null;
  if (S.ui.pop?.type === 'filter') S.ui.pop.edit = null;
  save();
  render();
};
A.clearFilters = el => {
  const v = viewOf(el.dataset.key);
  v.filters = [];
  v.q = '';
  S.ui.pop = null;
  save();
  render();
};
IN.fField = el => {
  const f = viewOf(el.dataset.key).filters[+el.dataset.i];
  f.f = el.value;
  f.v = [];
  S.ui.pop.edit = +el.dataset.i;
  save();
  render();
};
IN.fOp = el => {
  viewOf(el.dataset.key).filters[+el.dataset.i].op = el.value;
  save();
  render();
};
A.saveView = el => {
  const k = 'p:' + el.dataset.id;
  openModal({ type: 'saveView', pid: el.dataset.id, nf: viewOf(k).filters.length });
};
A.saveViewSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const name = $('#sv-name').value.trim() || t('act.untitledView');
  const type = $('#sv-type').value;
  const sv = { id: uid('v'), project: m.pid, name, type, filters: JSON.parse(JSON.stringify(viewOf('p:' + m.pid).filters)) };
  D().savedViews.push(sv);
  save();
  S.ui.modals.pop();
  go('project', { id: m.pid, tab: 'v:' + sv.id }, { tab: true });
  toast(t('toast.savedView', { name: name }));
};
A.renameView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  openModal({
    type: 'prompt',
    title: t('act.renameView'),
    label: t('act.viewName'),
    value: v.name,
    run: val => {
      if (val) {
        v.name = val;
        save();
      }
    },
  });
};
A.delView = el => {
  const v = D().savedViews.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  D().savedViews = D().savedViews.filter(x => x !== v);
  save();
  if (S.ui.params.tab === 'v:' + v.id) go('project', { id: v.project, tab: 'list' }, { tab: true });
  else render();
  toast(t('toast.deletedView', { name: v.name }));
};

/* board column menu */
A.toggleCol = el => {
  delete S.ui.collapsedCols[el.dataset.ck];
  render();
};
A.colCollapse = el => {
  S.ui.collapsedCols[S.ui.pop.key + ':' + el.dataset.id] = true;
  S.ui.pop = null;
  render();
};
A.colAdd = el => {
  const key = S.ui.pop.key;
  const pid = projectFromKey(key);
  S.ui.pop = null;
  A.startComposer({ dataset: { ctx: key, group: el.dataset.id, gb: JSON.stringify({ status: el.dataset.id, ...(pid ? { project: pid } : {}) }) } });
};
export function colTasks(key, st) {
  const pid = projectFromKey(key);
  return (pid ? tasksOf(pid) : allTasks()).filter(t => t.status === st);
}
A.colDoneAll = el => {
  const ts = colTasks(S.ui.pop.key, el.dataset.id);
  S.ui.pop = null;
  if (!ts.length) {
    render();
    return;
  }
  const snap = snapshot();
  if (mutate(() => ts.forEach(t => applyPatch(t, { status: 'done' }))))
    toast(t('toast.markedDone', { n: ts.length }), { action: t('toast.undo'), onAction: () => restore(snap) });
};
A.colArchive = () => {
  const ts = colTasks(S.ui.pop.key, 'done');
  S.ui.pop = null;
  const snap = snapshot();
  if (
    mutate(() =>
      ts.forEach(t => {
        t.archived = true;
        t.archivedAt = Date.now();
      }),
    )
  )
    toast(t('toast.archivedCompleted', { n: ts.length }), { action: t('toast.undo'), onAction: () => restore(snap) });
};
A.colSortPrio = el => {
  const ts = colTasks(S.ui.pop.key, el.dataset.id).sort((a, b) => PR[b.priority].w - PR[a.priority].w);
  const base = Math.min(...ts.map(t => t.order));
  S.ui.pop = null;
  mutate(() => ts.forEach((t, i) => (t.order = base + i * 0.001)));
};

/* calendar & timeline */
A.calNav = el => {
  const d = +el.dataset.d;
  const cur = parse(S.ui.calDate);
  S.ui.calDate = d === 0 ? iso(TODAY) : S.ui.calMode === 'month' ? iso(new Date(cur.getFullYear(), cur.getMonth() + d, 1)) : iso(addD(cur, d * 7));
  render();
};
A.tlToday = () => {
  const r = $('#tl-right');
  if (r) r.scrollTo({ left: Math.max(0, +$('.tl').dataset.tlToday - 160), behavior: 'smooth' });
};
IN.tlGroup = el => {
  S.ui.tlGroup = el.value;
  render();
};

/* projects */
IN.projQ = el => {
  S.ui.projQ = el.value;
  render();
};
IN.projStatus = el => {
  S.ui.projStatus = el.value;
  render();
};
IN.projSort = el => {
  S.ui.projSort = el.value;
  render();
};
A.clearProjFilters = () => {
  S.ui.projQ = '';
  S.ui.projStatus = 'all';
  render();
};
A.newProject = () => {
  S.ui.pform = { name: '', desc: '', icon: 'folder', color: 'indigo', teams: me().team ? [me().team] : [], lead: D().me, due: dOff(30), tmpl: 'blank' };
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'project' });
};
A.editProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  S.ui.pform = { name: p.name, desc: p.desc, icon: p.icon, color: p.color, teams: projTeams(p), lead: p.lead, due: p.due, tmpl: 'blank' };
  S.ui.errors = {};
  openModal({ type: 'project', edit: p.id });
};
IN.pform = el => {
  S.ui.pform[el.dataset.f] = el.value;
  if (el.dataset.f === 'name' && S.ui.errors.pname && el.value.trim()) {
    S.ui.errors.pname = null;
    render();
  }
};
A.pformSet = el => {
  S.ui.pform[el.dataset.f] = el.dataset.v;
  if (el.dataset.f === 'tmpl') {
    const tp = TEMPLATES.find(x => x.id === el.dataset.v);
    if (tp && S.ui.pform.icon === 'folder') S.ui.pform.icon = tp.icon === 'file' ? 'folder' : tp.icon;
  }
  render();
};
/* P3 multi-team: toggle one team id inside the form's teams[] array. */
A.pformTeamToggle = el => {
  const id = el.dataset.v;
  const cur = Array.isArray(S.ui.pform.teams) ? S.ui.pform.teams : [];
  S.ui.pform.teams = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  render();
};
export function makeKey(name) {
  let k = name
    .split(/\s+/)
    .map(w => w[0] || '')
    .join('')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  if (k.length < 2)
    k =
      name
        .replace(/[^A-Za-z]/g, '')
        .slice(0, 3)
        .toUpperCase() || t('act.projectKeyFallback');
  while (D().projects.some(p => p.key === k)) k += 'X';
  return k;
}
export function createProject(f, tmplId) {
  const p = {
    id: uid('p'),
    key: makeKey(f.name),
    name: f.name,
    icon: f.icon,
    color: f.color,
    status: 'planning',
    teams: Array.isArray(f.teams) ? f.teams.filter(Boolean) : [],
    lead: f.lead,
    due: f.due || dOff(30),
    start: dOff(0),
    fav: false,
    members: [...new Set([D().me, f.lead])],
    desc: f.desc || t('common.noDescriptionYet'),
    milestones: [],
    last: 0,
  };
  D().projects.push(p);
  D().projOrder.unshift(p.id);
  D().activity.unshift({ id: uid('a'), by: D().me, verb: 'createdProject', task: null, project: p.id, at: Date.now(), extra: {} });
  const tm = TEMPLATES.find(x => x.id === tmplId);
  for (let i = 0; i < (tm?.tasks || 0); i++)
    createTask({
      project: p.id,
      title: t(`project.template.${tmplId}.task.${i + 1}`),
      status: i === 0 ? 'todo' : 'backlog',
      assignee: i === 0 ? D().me : null,
      priority: i === 0 ? 'high' : 'medium',
      due: dOff(5 + i * 5),
      start: dOff(i * 5),
    });
  return p;
}
A.submitProject = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const f = S.ui.pform;
  f.name = ($('#p-name')?.value || '').trim();
  f.desc = $('#p-desc')?.value || '';
  if (!f.name) {
    S.ui.errors.pname = t('err.projectNameRequired');
    render();
    $('#p-name')?.focus();
    return;
  }
  if (m.edit) {
    const p = proj(m.edit);
    if (
      mutate(() =>
        Object.assign(p, {
          name: f.name,
          desc: f.desc,
          icon: f.icon,
          color: f.color,
          teams: Array.isArray(f.teams) ? f.teams.filter(Boolean) : [],
          lead: f.lead,
          due: f.due,
          members: [...new Set([...p.members, f.lead])],
        }),
      )
    ) {
      S.ui.modals.pop();
      render();
      toast(t('toast.projectUpdated'));
    }
    return;
  }
  let p;
  if (
    !mutate(() => {
      p = createProject(f, f.tmpl);
    })
  )
    return;
  S.ui.modals.pop();
  go('project', { id: p.id, tab: f.tmpl === 'blank' ? 'overview' : S.prefs.defaultTab || 'board' });
  toast(tasksOf(p.id).length ? t('toast.createdStarters', { name: p.name, n: tasksOf(p.id).length }) : t('toast.createdProject', { name: p.name }));
};
A.dupProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  let n;
  mutate(() => {
    n = createProject({ ...p, name: p.name + ' copy' }, 'blank');
    tasksOf(p.id).forEach(t => createTask({ ...JSON.parse(JSON.stringify(t)), id: uid('t'), key: undefined, project: n.id, status: 'todo' }));
  });
  toast(t('toast.duplicated', { name: p.name }), { action: t('toast.open'), onAction: () => go('project', { id: n.id }) });
};
A.archiveProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  confirmDlg({
    title: t('act.archiveTitle', { name: p.name }),
    body: t('act.archiveProjectBody'),
    ok: t('act.archiveProject'),
    icon: 'archive',
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          p.archived = true;
          p.archivedAt = Date.now();
        })
      ) {
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
        toast(t('toast.archived', { name: p.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
      }
    },
  });
};
A.restoreProject = el => {
  const p = proj(el.dataset.id);
  mutate(() => {
    p.archived = false;
    p.archivedAt = null;
  });
  toast(t('toast.restored', { name: p.name }));
};
A.delProject = el => {
  const p = proj(el.dataset.id);
  S.ui.pop = null;
  const n = tasksOf(p.id).length;
  confirmDlg({
    title: t('act.deleteTitle', { name: p.name }),
    body: `${t('act.deleteProjectBodyHead')} <b>${t('act.deleteProjectTaskCount', { n: n })}</b>${t('act.deleteProjectBodyTail')}`,
    ok: t('act.deleteProject'),
    danger: true,
    typeName: p.name,
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          const ids = tasksOf(p.id).map(t => t.id);
          D()
            .tasks.filter(t => t.project === p.id)
            .forEach(t => ids.push(t.id));
          deleteTasks(ids);
          D().projects = D().projects.filter(x => x !== p);
          D().projOrder = D().projOrder.filter(x => x !== p.id);
          D().files = D().files.filter(f => f.project !== p.id);
        })
      ) {
        if (S.ui.route === 'project' && S.ui.params.id === p.id) go('projects');
        toast(t('toast.deleted', { name: p.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
      }
    },
  });
};
A.requestAccess = el => {
  const p = proj(el.dataset.id);
  /* The fallback name is hoisted: a literal inside a display-named var
     property is a finding, a lowercase fallback on a plain const is not. */
  const lead = mem(p?.lead)?.name || 'the owner';
  toast(t('toast.accessRequested', { name: lead }));
};

/* sharing & invites */
A.share = el => {
  const id = el.dataset.id || curProjectId();
  S.ui.shareQ = '';
  S.ui.pop = null;
  openModal({ type: 'share', id });
};
IN.shareQ = el => {
  S.ui.shareQ = el.value;
  render();
};
A.shareAdd = el => {
  const p = proj(el.dataset.id);
  const m = mem(el.dataset.mid);
  if (!p || !m) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  mutate(() => {
    p.members.push(m.id);
  });
  S.ui.shareQ = '';
  render();
  toast(t('toast.memberCanEdit', { name: m.name, project: p.name }));
};
A.shareInvite = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const p = proj(m.id);
  if (!p) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  const v = ($('#share-in')?.value || '').trim();
  const perm = $('#share-perm')?.value;
  if (!v) {
    $('#share-in')?.focus();
    return;
  }
  const ex = D().members.find(x => x.email.toLowerCase() === v.toLowerCase() || x.name.toLowerCase() === v.toLowerCase());
  if (ex) {
    if (!p.members.includes(ex.id))
      mutate(() => {
        p.members.push(ex.id);
        p.perms = p.perms || {};
        p.perms[ex.id] = perm;
      });
    S.ui.shareQ = '';
    render();
    toast(t('toast.sharedWith', { name: ex.name }));
    return;
  }
  if (api.enabled) {
    // Project access lists only reference workspace members; invite the person from Members first.
    toast(t('err.inviteFirst'), { kind: 'err' });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(v)) {
    toast(t('err.invalidEmail'), { kind: 'err' });
    return;
  }
  const nm = v
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
  mutate(() => {
    const id = uid('m');
    D().members.push({
      id,
      name: nm,
      email: v,
      role: 'Guest',
      team: projTeams(p)[0] || '',
      title: t('member.titleGuest'),
      c: '#6B7280',
      status: 'invited',
      last: null,
      tz: '—',
    });
    p.members.push(id);
    p.perms = p.perms || {};
    p.perms[id] = perm;
  });
  S.ui.shareQ = '';
  render();
  toast(t('toast.invitationSentTo', { email: v }));
};
IN.sharePerm = el => {
  const p = proj(el.dataset.id);
  const mid = el.dataset.mid;
  if (!p) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  if (el.value === '__remove') {
    if (p.members.length <= 1) return toast(t('err.lastMember'), { kind: 'err' });
    const snap = snapshot();
    mutate(() => {
      p.members = p.members.filter(x => x !== mid);
      if (p.lead === mid) p.lead = p.members[0] || null;
    });
    toast(t('toast.removed', { name: mem(mid).name }), { action: t('toast.undo'), onAction: () => restore(snap) });
  } else {
    mutate(() => {
      p.perms = p.perms || {};
      p.perms[mid] = el.value;
    });
    toast(t('toast.permChanged', { name: mem(mid).name, perm: el.value }), { ms: 1800 });
  }
};
IN.shareAccess = el => {
  const p = proj(el.dataset.id);
  if (!p) return;
  if (!canManageProject(p)) return;
  const priv = el.value === 'private';
  mutate(() => {
    p.private = priv;
    if (priv && D().me && !p.members.includes(D().me)) p.members.push(D().me);
  });
  toast(priv ? t('toast.privateProject') : t('toast.publicProject', { name: D().ws.name }));
};
A.invite = () => {
  S.ui.inviteDraft = '';
  S.ui.inviteLinks = null;
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'invite' });
};
const API_ROLE = { Owner: 'owner', Admin: 'admin', Member: 'member', Guest: 'viewer' };

function addInvitedMember(invites, role, team) {
  invites.forEach(inv => {
    if (!inv.email) return;
    const email = inv.email.toLowerCase();
    const existing = D().members.find(m => (m.email || '').toLowerCase() === email);
    if (existing) {
      existing.status = 'invited';
      existing.role = role;
      existing.team = team;
      return;
    }
    D().members.push({
      id: uid('m'),
      name: inv.email
        .split('@')[0]
        .replace(/[._-]+/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase()),
      email: inv.email,
      role,
      team,
      title: role,
      c: '#6B7280',
      status: 'invited',
      last: null,
      tz: '—',
    });
  });
}

A.submitInvite = () => {
  const raw = $('#inv-emails').value;
  S.ui.inviteDraft = raw;
  const role = $('#inv-role').value;
  const team = $('#inv-team').value;
  const list = raw
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(Boolean);
  const bad = list.filter(e => !/^\S+@\S+\.\S+$/.test(e));
  if (!list.length) {
    S.ui.errors.invite = t('err.enterEmails');
    render();
    return;
  }
  if (bad.length) {
    S.ui.errors.invite = `${bad[0]} isn't a valid email address`;
    render();
    return;
  }
  if (!api.enabled) {
    loadingBtn('inv-submit', 600, () => {
      if (
        !mutate(() =>
          addInvitedMember(
            list.map(email => ({ email })),
            role,
            team,
          ),
        )
      )
        return;
      S.ui.modals.pop();
      S.ui.errors = {};
      render();
      toast(t('act.invitationsSent', { n: list.length }));
    });
    return;
  }
  loadingBtn('inv-submit', 0, async () => {
    const btn = document.getElementById('inv-submit');
    const done = () => {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    };
    const res = await api.createInvites(list, API_ROLE[role] || 'member', team || null);
    done();
    if (!res.ok) {
      S.ui.errors = { invite: res.error || t('err.invitesCreateFailed') };
      render();
      return;
    }
    refreshMembers();
    const invites = res.data.invites || [];
    const count = invites.length;
    S.ui.inviteLinks = invites;
    S.ui.errors = {};
    render();
    const sent = invites.filter(invite => invite.sent).length;
    const failed = invites.filter(invite => invite.email && !invite.sent).length;
    if (!api.mailEnabled) {
      toast(t('act.inviteLinksCreated', { n: count }));
    } else if (sent && !failed) {
      toast(t('act.invitationsSent', { n: sent }));
    } else if (sent) {
      /* The count selects the plural member without being rendered, so the
         vars travel as a hoisted object: the catalogue members of these two
         messages carry no placeholder to interpolate. */
      const nv = { n: failed };
      toast(`${t('act.bulkInvite.summary', { sent: sent, failed: failed })} ${t('act.bulkInvite.copyLinks', nv)}`, { kind: 'err' });
    } else {
      const nv = { n: count };
      toast(`${t('act.bulkInvite.created', nv)} ${t('act.bulkInvite.copyLink', nv)}`, { kind: 'err' });
    }
  });
};
A.copyInviteLink = async () => {
  if (!api.enabled) return copy(`${api.url}/join/${D().ws.url}-7f3k2`, t('toast.inviteLinkCopied'));
  const role = API_ROLE[$('#inv-role')?.value] || 'member';
  const team = $('#inv-team')?.value || null;
  const res = await api.createInvites([], role, team);
  if (!res.ok) return toast(res.error || t('err.inviteLink'), { kind: 'err' });
  await copy(res.data.invites[0].url, t('toast.inviteLinkCopied'));
};
A.resendInvite = async el => {
  const m = mem(el.dataset.id);
  S.ui.pop = null;
  render();
  if (!api.enabled) return toast(t('toast.inviteResent', { email: m.email }));
  if (!m) return;
  const res = await api.createInvites([m.email], API_ROLE[m.role] || 'member', m.team || null);
  if (!res.ok) return toast(res.error || t('err.newInvite'), { kind: 'err' });
  const invite = res.data.invites?.[0];
  if (invite?.sent) return toast(t('toast.invitationSentTo', { email: m.email }));
  await copy(invite?.url || '', api.mailEnabled ? t('toast.emailFailedLinkCopied') : t('toast.newInviteLinkCopied'));
};
A.viewProfile = el => go('member', { id: el.dataset.id });
A.assignToMember = el => {
  S.ui.pop = null;
  A.newTask({ dataset: { assignee: el.dataset.id } });
};
/* Mirror the server's member list into the document, keeping the cosmetic
   fields that only exist client-side (colour, last-seen, timezone). */
export async function refreshMembers() {
  if (!api.enabled) return null;
  const res = await api.members();
  if (!res.ok) return null;
  const rows = res.data.members || [];
  const profiles = rows.map(row => {
    const existing = D().members.find(m => (row.memberId && m.id === row.memberId) || m.userId === row.userId);
    return {
      id: row.memberId || existing?.id || uid('m'),
      userId: row.userId,
      name: row.name,
      email: row.email,
      role: row.roleLabel,
      team: row.team ?? existing?.team ?? '',
      title: row.title || existing?.title || '',
      c: existing?.c || '#6B7280',
      status: row.status,
      last: row.lastLoginAt ? Math.max(0, Math.round((Date.now() - row.lastLoginAt) / 60000)) : null,
      tz: existing?.tz || '—',
    };
  });
  const emails = new Set(rows.map(r => (r.email || '').toLowerCase()));
  const withoutAccount = D().members.filter(m => !m.userId && !emails.has((m.email || '').toLowerCase()));
  D().members = [...profiles, ...withoutAccount];
  S.ui.pendingInvites = res.data.invites || [];
  render();
  return res.data;
}

/* The sessions tab reads the server's session table (SESS-01) — never the
   document, which stopped carrying a sessions field in 14-01. Refreshed on
   mount (the A.go hook above) and after every successful revocation (D-29);
   no polling, no sockets (D-29). */
export async function refreshSessions() {
  if (!api.enabled) return null;
  const res = await api.sessions();
  if (!res.ok) return null;
  S.ui.sessions = res.data.sessions || [];
  S.ui.sessionsLoaded = true;
  render();
  return res.data;
}

/* The settings 2FA card's ground truth (T-16-13): re-reads the signed-in user
   (api.user.twoFa) from /api/auth/me — the on-state never renders from a
   client flag. Called on mount of the security tabs and after every tfa state
   change (enroll enable/disable). */
export async function refreshTfa() {
  if (!api.enabled) return null;
  await api.me();
  render();
  return api.user;
}

/* The operator card's ground truth (OPREV-02, D-121): the users list is fetched
   from the server on the sessions tab mount and after every revoke — never from
   the document. A non-operator fetch simply 403s; the card renders only from
   the api.user.isInstanceAdmin server flag, so the fetch is gated on it too. */
export async function refreshOperatorUsers() {
  if (!api.enabled || !api.user?.isInstanceAdmin) return null;
  const res = await api.operatorUsers();
  if (!res.ok) {
    /* The 401 teardown belongs to the central intercept (D-28); other refusals
       leave the card empty — the gate itself is the honest answer. */
    if (res.status !== 401) S.ui.operatorUsers = null;
    return null;
  }
  S.ui.operatorUsers = res.data.users || [];
  render();
  return S.ui.operatorUsers;
}

A.operatorRevokeAsk = el => {
  S.ui.operatorRevoke = el.dataset.id; // D-90: the inline confirmation stage carries the target id
  render();
};
A.operatorRevokeCancel = () => {
  S.ui.operatorRevoke = null;
  render();
};
A.operatorRevokeConfirm = async el => {
  const id = el.dataset.id;
  const res = await api.operatorRevokeSessions(id);
  S.ui.operatorRevoke = null;
  if (!res.ok) {
    /* D-28: the central intercept owns every mid-session revocation 401 —
       the operator's own teardown is already in flight. */
    if (res.status === 401) return;
    const c = res.data?.code;
    return toast(tErr(c, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshOperatorUsers(); // re-fetch so the list reflects the revoke
  toast(t('settings.operator.toastRevoked'));
};

A.resendPendingInvite = async el => {
  const row = (S.ui.pendingInvites || []).find(i => i.id === el.dataset.id);
  if (!row?.email) return;
  const res = await api.createInvites([row.email], row.role, row.team || null);
  if (!res.ok) return toast(res.error || t('err.newInvite'), { kind: 'err' });
  const invite = res.data.invites?.[0];
  await refreshMembers();
  if (invite?.sent) return toast(t('toast.invitationSentTo', { email: row.email }));
  await copy(invite?.url || '', api.mailEnabled ? t('toast.emailFailedLinkCopied') : t('toast.newInviteLinkCopied'));
};

A.revokeInvite = async el => {
  const id = el.dataset.id;
  const row = (S.ui.pendingInvites || []).find(i => i.id === id);
  S.ui.pop = null;
  const res = await api.revokeInvite(id);
  if (!res.ok) return toast(res.error || t('err.revokeInvite'), { kind: 'err' });
  toast(t('toast.inviteRevoked', { email: row?.email || 'that address' }));
  await refreshMembers();
};

/* Leaving and deleting are both one-way; both navigate with the server's answer. */
async function leaveTo(nextSlug) {
  if (nextSlug) {
    await openWorkspace(nextSlug);
    go(S.prefs.home || 'home');
    return;
  }
  enterNoWorkspace();
}
A.leaveWorkspace = () => {
  const name = D().ws.name;
  confirmDlg({
    title: t('act.leaveTitle', { name: name }),
    body: t('act.leaveWorkspaceBody'),
    ok: t('act.leaveWorkspace'),
    danger: true,
    icon: 'log-out',
    run: async () => {
      const res = await api.leave();
      if (!res.ok) return toast(res.error || t('err.leaveWorkspace'), { kind: 'err' });
      toast(t('toast.leftWorkspace', { name: name }));
      await leaveTo(res.data?.nextSlug);
    },
  });
};
A.deleteWorkspace = () => {
  const ws = D().ws;
  confirmDlg({
    title: t('act.deleteTitle', { name: ws.name }),
    body: t('act.deleteWorkspaceBody'),
    ok: t('act.deleteWorkspace'),
    danger: true,
    icon: 'trash-2',
    typeName: ws.url,
    run: async () => {
      const res = await api.deleteWorkspace();
      if (!res.ok) return toast(res.error || t('err.deleteWorkspace'), { kind: 'err' });
      toast(t('toast.workspaceDeleted', { name: ws.name }));
      await leaveTo(res.data?.nextSlug);
    },
  });
};

A.removeMember = el => {
  const m = mem(el.dataset.id);
  S.ui.pop = null;
  const n = allTasks().filter(t => t.assignee === m.id && t.status !== 'done').length;
  confirmDlg({
    title: t('act.removeTitle', { name: m.name }),
    body: `${t('act.removeAccess.losesAccess', { name: esc(m.name), ws: esc(D().ws.name) })}${
      n ? ` ${t('act.removeAccess.unassigns', { tasks: `${t('act.removeAccess.their')} <b>${t('act.removeAccess.openTasks', { n: n })}</b>` })}` : ''
    }`,
    ok: t('act.removeMember'),
    danger: true,
    icon: 'user-minus',
    run: async () => {
      if (api.enabled) {
        if (!m.userId) return toast(t('err.noAccountToRemove', { name: m.name }), { kind: 'err' });
        const res = await api.removeMember(m.userId);
        if (!res.ok) return toast(res.error || t('err.removeMember'), { kind: 'err' });
        await refreshMembers();
        if (S.ui.route === 'member') go('members');
        toast(t('toast.removed', { name: m.name }));
        return;
      }
      const snap = snapshot();
      if (
        mutate(() => {
          D().members = D().members.filter(x => x !== m);
          D().tasks.forEach(t => {
            if (t.assignee === m.id) t.assignee = null;
          });
          D().projects.forEach(p => (p.members = p.members.filter(x => x !== m.id)));
        })
      ) {
        if (S.ui.route === 'member') go('members');
        toast(t('toast.removed', { name: m.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
      }
    },
  });
};
IN.memQ = el => {
  S.ui.memQ = el.value;
  render();
};
IN.actWho = el => {
  S.ui.actWho = el.value;
  render();
};

/* files */
IN.fileQ = el => {
  S.ui.fileQ = el.value;
  render();
};
IN.fileType = el => {
  S.ui.fileType = el.value;
  render();
};
IN.fileSort = el => {
  S.ui.fileSort = el.value;
  render();
};
A.renameFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  openModal({
    type: 'prompt',
    title: t('act.renameFile'),
    label: t('act.fileName'),
    value: f.name,
    run: v => {
      if (v)
        mutate(() => {
          f.name = v;
          f.type = fileType(v);
        });
    },
  });
};
A.dupFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  mutate(() => {
    const i = D().files.indexOf(f);
    D().files.splice(i + 1, 0, { ...f, id: uid('f'), name: f.name.replace(/(\.[^.]+)$/, ' copy$1'), at: Date.now(), by: D().me });
  });
  toast(t('toast.fileDuplicated'));
};
A.delFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  confirmDlg({
    title: t('act.deleteFileTitle'),
    body: `<b>${esc(f.name)}</b> ${f.task ? t('act.deleteFileBodyTask') : t('act.deleteFileBody')}.`,
    ok: t('act.deleteFile'),
    danger: true,
    run: () => {
      const snap = snapshot();
      if (
        mutate(() => {
          D().files = D().files.filter(x => x !== f);
          if (f.task && task(f.task)) task(f.task).attachments = task(f.task).attachments.filter(a => a.name !== f.name);
        })
      )
        toast(t('toast.deleted', { name: f.name }), { action: t('toast.undo'), onAction: () => restore(snap) });
    },
  });
};

/* inbox & notifications */
A.selNotif = el => {
  const n = D().notifs.find(x => x.id === el.dataset.id);
  n.read = true;
  S.ui.inboxSel = n.id;
  save();
  render();
};
A.toggleRead = el => {
  const n = D().notifs.find(x => x.id === el.dataset.id);
  n.read = !n.read;
  save();
  render();
};
A.markAllRead = () => {
  const n = myNotifs().filter(x => !x.read).length;
  myNotifs().forEach(x => (x.read = true));
  save();
  render();
  if (n) toast(t('toast.allCaughtUp'));
};
A.toggleUnreadOnly = () => {
  S.ui.inboxUnread = !S.ui.inboxUnread;
  render();
};
A.openNotif = el => {
  const n = D().notifs.find(x => x.id === el.dataset.id);
  n.read = true;
  save();
  if (n.task) A.openTask({ dataset: { id: n.task } });
  else if (n.project) go('project', { id: n.project, tab: 'overview' });
};

/* search & palette */
A.openPalette = () => {
  S.ui.palOpener = focusKey(document.activeElement);
  S.ui.palette = { q: '', mode: 'cmd', scope: 'all', hl: 0 };
  S.ui.pop = null;
  render();
};
A.openSearch = () => {
  S.ui.palOpener = focusKey(document.activeElement);
  S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
  S.ui.pop = null;
  S.ui.mnav = false;
  render();
};
A.closePalette = () => {
  S.ui.palette = null;
  render();
};
A.palScope = el => {
  S.ui.palette.scope = el.dataset.v;
  S.ui.palette.hl = 0;
  render();
  $('#pal-in')?.focus();
};
IN.palQ = el => {
  S.ui.palette.q = el.value;
  S.ui.palette.hl = 0;
  render();
};
A.palRun = el => {
  const it = S.ui.palette?._flat?.[+el.dataset.i];
  if (!it) return;
  S.ui.palette = null;
  render();
  it.run();
};
IN.searchQ = el => {
  S.ui.searchQ = el.value;
  render();
};
A.setSearch = el => {
  S.ui.searchQ = el.dataset.q;
  render();
  $('#search-page-q')?.focus();
};

/* workspace, account, prototype controls */
A.switchWs = async el => {
  S.ui.pop = null;
  const slug = el.dataset.v;
  /* The local demo has exactly one workspace and renders no switcher. */
  if (!api.enabled) return;
  const target = api.workspaces.find(w => w.slug === slug);
  if (!target) return;
  if (api.workspace?.slug === slug) {
    go('home');
    return;
  }
  const res = await openWorkspace(slug);
  if (!res.ok) return toast(res.error || t('err.switchWorkspace'), { kind: 'err' });
  S.ui.pop = null;
  go('home');
  toast(t('toast.switchedTo', { name: target.name }));
};
A.newWorkspace = () => {
  S.ui.pop = null;
  if (!api.enabled) return toast(t('toast.demoSingleWorkspace'), { kind: 'info' });
  if (!api.canCreateWorkspace) {
    return toast(t('err.askAdmin'), { kind: 'err' });
  }
  S.ui.auth = 'onboarding';
  S.ui.onb = 1;
  S.ui.onbData.ws = '';
  S.ui.onbData.url = '';
  render();
};
/* D-10/D-11 lifecycle moments. Every sign-in path ends in a render, so the locale is applied
   silently just before it — a non-NULL account locale wins, a NULL one keeps the negotiated
   value. Never the dispatching switch: the render that follows is the only one. */
async function adoptAccountLocale() {
  await primeLocale(api.user?.locale || negotiate());
}
A.signOut = async () => {
  if (api.enabled) {
    await flushPending();
    await api.logout();
    api.revision = 0;
    clearLocalCache();
    history.replaceState(null, '', '/');
  }
  /* D-10: the account is gone, so its locale is gone with it — back to the negotiated value
     (demo mode has no account: its own stored choice stands). */
  await primeLocale((!api.enabled && readStoredLocale()) || negotiate());
  S.ui.conflict = false;
  S.ui.pop = null;
  S.ui.palette = null;
  S.ui.drawer = null;
  S.ui.modals = [];
  S.ui.wantedSlug = null;
  S.ui.auth = 'login';
  S.ui.errors = {};
  render();
};
/* D-28: a revoked browser's 401 teardown — the same sign-out path as A.signOut,
   but with the honest "signed out elsewhere" copy instead of the generic
   session-expired toast (err.signedOutElsewhere landed in 14-02). Registered
   once at module load as the central teardown: api.js call() invokes it on any
   mid-session 401 carrying the server's signInRequired code — save path, boot
   hydration, sessions refresh and revoke actions all inherit it. */
async function signOutRevoked() {
  await A.signOut();
  toast(t('err.signedOutElsewhere'), { kind: 'err' });
}
registerAuthRevokedHandler(signOutRevoked);
A.shortcuts = () => {
  S.ui.pop = null;
  S.ui.palette = null;
  openModal({ type: 'shortcuts' });
};
A.startOnboarding = () => {
  S.ui.pop = null;
  S.ui.auth = 'onboarding';
  S.ui.onb = 0;
  render();
};
A.toggleOffline = () => {
  S.ui.offline = !S.ui.offline;
  S.ui.pop = null;
  render();
  toast(S.ui.offline ? t('err.offlineMode') : t('toast.backOnline'), { kind: S.ui.offline ? 'err' : 'ok' });
};
A.retryOnline = el => {
  el.classList.add('is-loading');
  setTimeout(() => {
    S.ui.offline = false;
    render();
    toast(t('toast.reconnected'));
  }, 700);
};
A.resetDemo = () => {
  if (api.enabled) return toast(t('toast.demoResetLocal'), { kind: 'info' });
  S.ui.pop = null;
  confirmDlg({
    title: t('act.resetDemoTitle'),
    body: t('act.resetDemoBody'),
    ok: t('act.resetData'),
    danger: true,
    icon: 'rotate-ccw',
    run: () => {
      S.data = seed();
      S.views = {};
      S.prefs = { ...DEFAULT_PREFS, theme: S.prefs.theme };
      S.ui.drawer = null;
      save();
      go('home');
      toast(t('toast.demoRestored'));
    },
  });
};
A.toastInfo = el => toast(el.dataset.msg, { kind: 'info' });
A.demoToast = el => {
  const v = el.dataset.v;
  if (v === 'err') toast(t('err.changesNotSaved'), { kind: 'err', action: t('toast.tryAgain'), onAction: () => toast(t('toast.saved')) });
  else if (v === 'retry') {
    toast(t('toast.retrying'), { kind: 'info', ms: 1200 });
    setTimeout(() => toast(t('toast.loadedSuccessfully')), 1300);
  } else toast(t('toast.demoMoved'), { action: t('toast.undo'), onAction: () => toast(t('toast.undone'), { kind: 'info' }) });
};
A.demoConfirm = () =>
  confirmDlg({
    title: t('act.archiveDemoTitle'),
    body: t('act.archiveDemoBody'),
    ok: t('act.archiveProject'),
    icon: 'archive',
    run: () => toast(t('toast.demoPreview'), { kind: 'info' }),
  });
A.demoLoad = el => {
  el.classList.add('is-loading');
  setTimeout(() => {
    el.classList.remove('is-loading');
    toast(t('toast.loaded'));
  }, 1400);
};
A.reloadPage = () => {
  S.ui.loading = true;
  render();
  setTimeout(() => {
    S.ui.loading = false;
    render();
  }, 1400);
};

/* modals */
A.closeModal = () => closeModal();
A.closeModalBg = (el, e) => {
  if (e.target === el) closeModal();
};
A.confirmOk = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  if (m.typeName && S.ui.confirmText !== m.typeName) return;
  S.ui.modals.pop();
  S.ui.confirmText = '';
  render();
  m.run && m.run();
};
IN.confirmText = el => {
  S.ui.confirmText = el.value;
  const m = S.ui.modals[S.ui.modals.length - 1];
  const b = $('.modal:last-of-type [data-a="confirmOk"]') || $$('[data-a="confirmOk"]').pop();
  if (b) b.disabled = el.value !== m.typeName;
};
A.promptSubmit = () => {
  const m = S.ui.modals[S.ui.modals.length - 1];
  const v = $('#prompt-in').value.trim();
  S.ui.modals.pop();
  render();
  m.run(v);
};
IN.noop = () => {};

/* settings */
IN.prefToggle = el => {
  S.prefs[el.dataset.k] = el.checked;
  save();
};
IN.npToggle = el => {
  D().notifPrefs[el.dataset.k] = el.checked;
  save();
  toast(t('toast.notifPrefsSaved'), { ms: 1500 });
};
IN.prefSel = el => {
  const k = el.dataset.k;
  S.prefs[k] = prefValue(k, el.value);
  save();
  render();
  toast(t('toast.prefSaved'), { ms: 1500 });
};
/* D-12: the language is applied instantly and persisted separately. setLocale announces
   projects:locale, whose listener re-renders; the account write follows in the background and
   never touches S.prefs, save() or the document revision (LOC-04). D-16: a failed write keeps
   the language for the session with a warning; a 401 rides the session-expired path. */
IN.langSel = async el => {
  const code = el.value;
  await setLocale(code);
  if (!api.enabled) return storeLocale(code);
  const r = await api.patchMe({ locale: code });
  if (r.ok) return;
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401, error: r.error } }));
    return;
  }
  toast(t('toast.localeSaveFailed'), { kind: 'err', ms: 6000 });
};
A.wsColor = el => {
  const c = el.dataset.v;
  D().ws.c = c;
  save();
  render();
  if (api.enabled && api.workspace) {
    api.patchWorkspace({ color: c }).then(r => {
      if (!r.ok) toast(r.error || t('err.wsColor'), { kind: 'err' });
    });
  }
};
A.saveWorkspace = () => {
  const n = $('#ws-name').value.trim();
  const u = $('#ws-url')
    .value.trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-');
  if (!n) {
    toast(t('err.wsNameEmpty'), { kind: 'err' });
    return;
  }
  if (api.enabled) {
    const current = api.workspace?.slug;
    const rename = () => {
      loadingBtn('ws-save', 600, async () => {
        const patch = { name: n };
        if (u && u !== current) patch.slug = u;
        const res = await api.patchWorkspace(patch);
        if (!res.ok) return toast(res.error || t('err.wsSettings'), { kind: 'err' });
        D().ws.name = res.data.workspace.name;
        D().ws.url = res.data.workspace.slug;
        if (patch.slug) history.replaceState(null, '', `/w/${res.data.workspace.slug}`);
        save();
        toast(t('toast.wsSettingsSaved'));
      });
    };
    if (u && u !== current) {
      confirmDlg({
        title: t('act.changeUrlTitle'),
        body: t('act.changeUrlBody', { from: current, to: u }),
        ok: t('act.changeUrl'),
        run: rename,
      });
      return;
    }
    rename();
    return;
  }
  loadingBtn('ws-save', 600, () => {
    if (
      mutate(() => {
        D().ws.name = n;
        D().ws.url = u || D().ws.url;
      })
    )
      toast(t('toast.wsSettingsSaved'));
  });
};
A.delWorkspace = () => {
  if (api.enabled) return toast(t('toast.deleteWsUnavailable'), { kind: 'info' });
  return confirmDlg({
    title: t('act.deleteTitle', { name: D().ws.name }),
    body: t('act.deleteWorkspaceBody'),
    ok: t('act.deleteWorkspace'),
    danger: true,
    typeName: D().ws.name,
    run: () => {
      S.data = seed();
      S.views = {};
      save();
      S.ui.auth = 'login';
      render();
      toast(t('toast.wsDeletedDemo'), { kind: 'info', ms: 5000 });
    },
  });
};
A.avColor = el => {
  me().c = el.dataset.v;
  save();
  render();
};
A.saveProfile = () => {
  const n = $('#pf-name').value.trim();
  if (!n) {
    S.ui.errors.pname2 = t('err.enterName');
    render();
    return;
  }
  S.ui.errors.pname2 = null;
  const tt = $('#pf-title').value.trim();
  loadingBtn('pf-save', 600, () => {
    if (
      mutate(() => {
        S.prefs.name = n;
        S.prefs.title = tt;
        me().name = n;
        me().title = tt;
      })
    )
      toast(t('toast.profileUpdated'));
  });
};
IN.pwStrength = el => {
  S.ui.pwNew = el.value;
  const m = el.parentElement.querySelector('.row .strength')?.parentElement;
  const tmp = document.createElement('div');
  tmp.innerHTML = strengthMeter(el.value);
  if (m) m.replaceWith(tmp.firstElementChild || document.createTextNode(''));
  else if (tmp.firstElementChild) el.after(tmp.firstElementChild);
};
A.savePassword = () => {
  const e = (S.ui.errors = {});
  const cur = $('#pw-cur').value,
    nw = $('#pw-new').value,
    cf = $('#pw-conf').value;
  S.ui.pwDone = false;
  if (!cur) e.pwCur = t('err.enterCurrentPassword');
  if (nw.length < 10 || !/[0-9\W]/.test(nw)) e.pwNew = t('err.passwordWeak');
  if (nw !== cf) e.pwConf = t('err.passwordMismatch');
  if (Object.keys(e).length) {
    render();
    return;
  }
  loadingBtn('pw-save', 0, async () => {
    const btn = document.getElementById('pw-save');
    const done = () => {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    };
    const res = await api.changePassword(cur, nw);
    done();
    if (!res.ok) {
      /* D-28/D-44: the central 401 intercept in api.js owns every mid-session
         revocation — no local 401 branch here. Map the server's stable codes
         to the field they belong to (T-15-07): wrongCurrentPassword and
         passwordRequired live under the CURRENT field; only #pw-cur is
         cleared — the new-password value round-trips through S.ui.pwNew so
         the input survives the re-render (D-39). Unknown codes fall through
         to the generic translation call() already attached to res.error. */
      const code = res.data?.code;
      if (code === 'wrongCurrentPassword' || code === 'passwordRequired') {
        e.pwCur = t('err.' + code);
      } else if (code === 'passwordTooWeak') {
        e.pwNew = t('err.passwordTooWeak');
      } else {
        e.pwCur = res.error || t('err.serverUnreachable');
      }
      render();
      return;
    }
    /* D-43: honest success — the banner and the toast both state exactly what
       happened, with no invented count (D-37). All fields clear (pw-cur and
       pw-conf carry no value binding; pw-new's S.ui.pwNew resets), the user
       stays signed in, and the sessions tab ground-truths itself (D-29). */
    S.ui.pwDone = true;
    S.ui.pwNew = '';
    render();
    await refreshSessions(); // D-29
    toast(t('toast.passwordUpdatedAll'));
  });
};
/* ---------- two-factor enrollment (16-03, D-56/D-57/D-58) ---------- */
A.tfaStart = () => {
  S.ui.errors = {};
  S.ui.tfaStage = 'pw';
  render();
};
A.tfaCancel = () => {
  S.ui.errors = {};
  S.ui.tfaStage = null;
  render();
};
A.tfaBeginEnroll = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-pw')?.value || '';
  if (!pw) e.tfaPw = t('err.enterCurrentPassword'); // empty submits nothing (TFA-02 empty edge)
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-pw-save', 0, async () => {
    const res = await api.tfaEnroll(pw);
    if (!res.ok) {
      const code = res.data?.code;
      if (code === 'wrongCurrentPassword' || code === 'passwordRequired') e.tfaPw = t('err.' + code);
      else if (code === 'tooManyAttempts') e.tfaPw = t('err.tooManyAttempts');
      else e.tfaPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58: the 503 body never renders
      return render();
    }
    S.ui.tfaSecret = res.data.secret;
    S.ui.tfaOtpauth = res.data.otpauth;
    S.ui.tfaStage = 'verify';
    render();
  });
};
A.tfaVerify = () => {
  const e = (S.ui.errors = {});
  const code = $('#tfa-code')?.value?.trim() || '';
  if (!code) return render(); // empty submits nothing (TFA-02 empty edge)
  loadingBtn('tfa-verify-save', 0, async () => {
    const res = await api.tfaEnable(code);
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'noPendingEnrollment') {
        S.ui.tfaStage = null; // the pending setup expired — back to the off state
        e.tfaMsg = t('err.noPendingEnrollment');
      } else if (c === 'codeRejected' || c === 'tooManyAttempts') {
        e.tfaCode = t('err.' + c);
      } else {
        e.tfaCode = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58
      }
      return render();
    }
    /* D-53/T-16-10: the plaintext codes live ONLY in this transient render
       state — the modal shows them exactly once, A.recoveryDismiss clears
       them, and nothing is written to localStorage/sessionStorage. */
    S.ui.recoveryCodes = res.data.recoveryCodes || [];
    S.ui.tfaStage = null;
    S.ui.tfaSecret = null;
    S.ui.tfaOtpauth = null;
    render();
    openModal({ type: 'recovery' });
    await refreshTfa();
    toast(t('settings.tfa.enabledToast'));
  });
};
A.tfaAskDisable = () => {
  S.ui.errors = {};
  S.ui.tfaStage = 'disable';
  render();
};
A.tfaDisableConfirm = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-off-pw')?.value || '';
  const code = $('#tfa-off-code')?.value?.trim() || '';
  if (!pw) e.tfaOffPw = t('err.enterCurrentPassword');
  if (!code) e.tfaOffCode = t('err.codeRequired'); // D-57: one input, either shape
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-off-save', 0, async () => {
    const res = await api.tfaDisable(pw, code);
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'wrongCurrentPassword' || c === 'passwordRequired') e.tfaOffPw = t('err.' + c);
      else if (c === 'codeRejected' || c === 'tooManyAttempts') e.tfaOffCode = t('err.' + c);
      else e.tfaOffPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58
      return render();
    }
    S.ui.tfaStage = null; // D-59: a fresh enroll afterwards is indistinguishable from a first one
    render();
    await refreshTfa();
    toast(t('settings.tfa.disabledToast'));
  });
};
/* REGEN-01/02 — recovery-code regeneration from the tfa card. The confirm
   handler clones tfaDisableConfirm's error mapping, with tfaNotEnabled mapped
   to its own err key (the 409 the regen route adds beyond disable). On success
   the stage is cleared FIRST (Pitfall 6 — no mounted password field), then the
   new codes render exactly once through the reused D-53 modal; S.ui.recoveryCodes
   is transient-only (D-91) — nothing is written to any storage. */
A.tfaAskRegen = () => {
  S.ui.errors = {};
  S.ui.tfaStage = 'regen';
  render();
};
A.tfaRegenConfirm = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-regen-pw')?.value || '';
  const code = $('#tfa-regen-code')?.value?.trim() || '';
  if (!pw) e.tfaRegenPw = t('err.enterCurrentPassword');
  if (!code) e.tfaRegenCode = t('err.codeRequired');
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-regen-save', 0, async () => {
    const res = await api.tfaRecover(pw, code);
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'wrongCurrentPassword' || c === 'passwordRequired') e.tfaRegenPw = t('err.' + c);
      else if (c === 'codeRejected' || c === 'tooManyAttempts') e.tfaRegenCode = t('err.' + c);
      else if (c === 'tfaNotEnabled') e.tfaRegenPw = t('err.tfaNotEnabled');
      else e.tfaRegenPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58: the 503 body never renders
      return render();
    }
    S.ui.tfaStage = null; // Pitfall 6: no password field lingers mounted
    S.ui.recoveryCodes = res.data.recoveryCodes || []; // D-91: transient only
    render();
    openModal({ type: 'recovery' });
    await refreshTfa();
    toast(t('settings.tfa.regenToast'));
  });
};
A.recoveryDismiss = () => {
  S.ui.recoveryCodes = null; // D-53: gone for good — no re-render can show them
  closeModal();
};
A.revokeSession = async el => {
  const id = el.dataset.id;
  const res = await api.revokeSession(id);
  if (!res.ok) {
    /* D-28: the central intercept in api.js owns every mid-session revocation
       401 — the teardown is already in flight by the time this code runs. */
    if (res.status === 401) return;
    return toast(res.error || t('err.serverUnreachable'), { kind: 'err' });
  }
  await refreshSessions(); // D-29
  toast(t('toast.sessionSignedOut'));
};
A.revokeAll = () =>
  confirmDlg({
    title: t('act.signOutOthersTitle'),
    body: t('act.signOutOthersBody'),
    ok: t('act.signOutOthers'),
    danger: true,
    icon: 'log-out',
    run: async () => {
      const res = await api.revokeAllSessions();
      if (!res.ok) {
        /* D-28: the central intercept in api.js owns every mid-session
           revocation 401 — no per-site teardown, no stacked second toast. */
        if (res.status === 401) return;
        return toast(res.error || t('err.serverUnreachable'), { kind: 'err' });
      }
      await refreshSessions(); // D-29
      toast(t('toast.signedOutOthers'));
    },
  });
/* auth */
A.auth = el => {
  S.ui.auth = el.dataset.v;
  S.ui.errors = {};
  S.ui.pwNew = '';
  render();
  setTimeout(() => $('.auth input')?.focus(), 20);
};
A.toggleShowPw = () => {
  const v = $('#l-pw')?.value;
  S.ui.showPw = !S.ui.showPw;
  render();
  const i = $('#l-pw');
  if (i) {
    i.value = v;
    i.focus();
  }
};
export const EMAIL_RE = /^\S+@\S+\.\S+$/;
/* Load a workspace by slug and land on the default route for it. */
export async function openWorkspace(slug) {
  if (!slug) return { ok: false, status: 0, error: t('err.noWorkspace') };
  await flushPending();
  const res = await hydrateFromServer(slug);
  if (!res.ok) return res;
  history.replaceState(null, '', `/w/${slug}`);
  S.ui.route = 'home';
  S.ui.params = {};
  S.ui.history = [];
  S.ui.drawer = null;
  S.ui.expanded = {};
  return res;
}

/* Signed in but with no workspace yet: either create one or wait for an invite. */
function enterNoWorkspace() {
  S.ui.auth = api.canCreateWorkspace ? 'onboarding' : 'no-workspace';
  if (api.canCreateWorkspace) {
    S.ui.onb = 1;
    S.ui.onbData = { ...S.ui.onbData, ws: '', url: '', urlTouched: false };
  }
  S.ui.errors = {};
  render();
}

export function enterApp(msg) {
  S.ui.auth = null;
  S.ui.errors = {};
  go(S.prefs.home || 'home');
  toast(msg);
}

/* D-75 (TFA-05): verify success lands through the exact same post-success
   handling as a password login — ?next= / queued invite / workspace hydrate /
   the normal home overview. No special 2FA routing anywhere. */
async function finishLogin(em, done) {
  await adoptAccountLocale();
  // G-12-5 (T-12-13 reopened, plan 12-07): the server redirected the
  // logged-out document navigation here with the file path in ?next= (it
  // only ever echoes its OWN url.pathname, but validate before following:
  // same-origin, path-only — single leading /, no //, no backslash, no
  // ://). Full navigation on purpose: the server re-evaluates the now-
  // authenticated document navigation and the file URL delivers its bytes.
  // Invalid or missing next falls through to the wantedSlug flow.
  const next = new URLSearchParams(location.search).get('next');
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\') && !next.includes('://')) {
    location.assign(next);
    return;
  }
  // Signing in from an invite link accepts it, so the person lands in the workspace.
  const queued = S.ui.join;
  if (queued?.token) {
    const inv = await api.acceptInvite(queued.token);
    S.ui.join = null;
    if (!inv.ok) {
      done();
      S.ui.errors = { login: inv.error || t('err.inviteAcceptFailed') };
      render();
      return;
    }
    const joinSlug = inv.data?.workspace?.slug || api.workspaces[0]?.slug;
    if (joinSlug) {
      const joined = await hydrateFromServer(joinSlug);
      if (joined.ok) {
        history.replaceState(null, '', `/w/${joinSlug}`);
        enterApp(t('toast.welcomeTo', { name: api.workspace?.name || joinSlug }));
        reportRecoveryBurn();
        return;
      }
    }
  }
  const slug = (S.ui.wantedSlug && api.rolesIn(S.ui.wantedSlug) ? S.ui.wantedSlug : null) || api.workspaces[0]?.slug;
  if (!slug) {
    done();
    S.ui.wantedSlug = null;
    enterNoWorkspace();
    return;
  }
  const ws = await hydrateFromServer(slug);
  if (!ws.ok) {
    done();
    S.ui.errors = { login: t('err.workspaceLoadFailed') };
    render();
    return;
  }
  history.replaceState(null, '', `/w/${slug}`);
  S.ui.wantedSlug = null;
  enterApp(t('toast.signedInAs', { name: api.user?.name || em }));
  reportRecoveryBurn();
}

/* D-73/D-74 (TFA-05): a recovery-code burn at login is reported honestly AFTER
   the app is entered — the remaining count in a non-blocking toast with a
   settings shortcut, escalating to the last-code copy when N = 0. Copy-only
   escalation: identical behavior on both paths, no special routing (D-75). */
function reportRecoveryBurn() {
  const remaining = S.ui.tfaRecoveryRemaining;
  S.ui.tfaRecoveryRemaining = null;
  if (typeof remaining !== 'number') return;
  if (remaining === 0) toast(t('auth.recoveryUsedLast'), { ms: 8000 });
  else toast(t('auth.recoveryUsed', { count: remaining }), { action: t('nav.route.settings'), onAction: () => go('settings') });
}

A.doLogin = () => {
  const e = (S.ui.errors = {});
  /* WR-02: a stale recovery count must never survive into a later login. */
  S.ui.tfaRecoveryRemaining = null;
  const em = $('#l-email').value.trim(),
    pw = $('#l-pw').value;
  S.ui.af.email = em;
  if (!em) e.email = t('err.enterEmail');
  else if (!EMAIL_RE.test(em)) e.email = t('err.emailInvalidExample');
  if (!pw) e.pw = t('err.enterPassword');
  if (Object.keys(e).length) {
    render();
    (e.email ? $('#l-email') : $('#l-pw'))?.focus();
    if (!e.email) $('#l-pw').value = pw;
    return;
  }
  if (!api.enabled) {
    loadingBtn('login-btn', 750, () => enterApp(t('toast.signedInAs', { name: em })));
    return;
  }
  loadingBtn('login-btn', 0, async () => {
    const btn = document.getElementById('login-btn');
    const done = () => {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    };
    const res = await api.login(em, pw);
    if (!res.ok) {
      done();
      S.ui.errors = { login: res.error || t('err.signinFailed') };
      render();
      return;
    }
    /* TFA-05 (D-60/D-70): the server stopped the sign-in at the second factor.
       Park the client in the dedicated full-screen code state — in-memory only:
       S.ui carries the masked email, nothing touches localStorage/sessionStorage,
       and a reload mid-challenge lands back on the login form by construction. */
    if (res.data?.pending2fa) {
      done();
      S.ui.auth = '2fa';
      S.ui.maskedEmail = res.data.maskedEmail || '';
      S.ui.errors = {};
      render();
      return;
    }
    await finishLogin(em, done);
  });
};

/* TFA-05: verify the pending second-factor challenge. One dual-shape field, no
   client branching on code shape (D-64) — the server decides TOTP vs recovery. */
A.doTfaLogin = () => {
  S.ui.errors = {};
  /* WR-02: a stale recovery count must never survive into a later login. */
  S.ui.tfaRecoveryRemaining = null;
  const code = $('#tfa-login-code')?.value?.trim() || '';
  if (!api.enabled) return;
  loadingBtn('tfa-login-btn', 0, async () => {
    const btn = document.getElementById('tfa-login-btn');
    const done = () => {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    };
    const res = await api.tfaLogin(code);
    if (!res.ok) {
      done();
      const c = res.data?.code;
      if (c === 'challengeExpired') {
        /* D-66 client side: a dead challenge restarts at the password step. */
        S.ui.auth = 'login';
        S.ui.maskedEmail = null;
        S.ui.errors = { login: t('err.challengeExpired') };
      } else if (c === 'tooManyAttempts') S.ui.errors = { login: t('err.tooManyAttempts') };
      else S.ui.errors = { login: c === 'invalidTfaCode' ? t('err.invalidTfaCode') : res.error || t('err.signinFailed') };
      render();
      return;
    }
    if (!res.data?.user) {
      done();
      S.ui.errors = { login: t('err.signinFailed') };
      render();
      return;
    }
    applyUser(res.data);
    S.ui.maskedEmail = null;
    /* WR-01: any finishLogin failure render must land on the login card,
       never a stale '2fa' card with an empty masked email (17-REVIEW). */
    S.ui.auth = 'login';
    /* D-73/D-74: keep the recovery count for the post-landing honest report.
       WR-02: a TOTP login (no burn) clears any stale count instead — the
       success-path value must survive until reportRecoveryBurn() reads it. */
    if (typeof res.data.recoveryRemaining === 'number') S.ui.tfaRecoveryRemaining = res.data.recoveryRemaining;
    else S.ui.tfaRecoveryRemaining = null;
    await finishLogin(api.user?.name || api.user?.email || '', done);
  });
};

/* D-61 (TFA-05): abandoning the challenge is a real sign-out — the HttpOnly
   projects_tfa_challenge cookie can only be cleared by the server, and plan-01's
   logout deletes the pending challenge row with it. The throttle budget is
   server-owned and intentionally survives the abandon — never touched here. */
A.tfaBackToSignIn = async () => {
  if (api.enabled) {
    await flushPending();
    await api.logout();
    api.revision = 0;
    clearLocalCache();
    history.replaceState(null, '', '/');
  }
  S.ui.auth = 'login';
  S.ui.maskedEmail = null;
  S.ui.errors = {};
  render();
};
A.socialAuth = el => {
  if (api.enabled) return toast(t('toast.socialNotConfigured'), { kind: 'info' });
  el.classList.add('is-loading');
  setTimeout(() => enterApp(t('toast.signedInWith', { provider: el.dataset.v })), 800);
};
A.doJoin = () => {
  const j = S.ui.join;
  if (!j?.token) return;
  const e = (S.ui.errors = {});
  S.ui.af = S.ui.af || { email: '', name: '' };
  const nm = $('#j-name').value.trim();
  const em = (j.email || $('#j-email').value).trim();
  const pw = $('#j-pw').value;
  S.ui.af.name = nm;
  S.ui.af.email = em;
  if (!nm) e.name = t('err.enterName');
  if (!EMAIL_RE.test(em)) e.email = t('err.emailInvalid');
  if (pw.length < 10 || !/[0-9\W]/.test(pw)) e.pw = t('err.passwordWeak');
  if (Object.keys(e).length) {
    render();
    return;
  }
  loadingBtn('join-btn', 0, async () => {
    const btn = document.getElementById('join-btn');
    const done = () => {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    };
    const res = await api.acceptInvite(j.token, nm, em, pw);
    if (!res.ok) {
      done();
      // Existing account: send them to sign in; the token stays queued for after login.
      if (res.data?.needsSignIn) {
        S.ui.errors = { login: `${em} already has an account. Sign in to accept the invite.` };
        S.ui.auth = 'login';
        render();
        return;
      }
      S.ui.errors = { join: res.error || t('err.joinFailed') };
      render();
      return;
    }
    await adoptAccountLocale();
    const slug = res.data?.workspace?.slug || api.workspaces[0]?.slug;
    if (!slug) {
      done();
      S.ui.pwNew = '';
      history.replaceState(null, '', '/');
      enterNoWorkspace();
      return;
    }
    const ws = await hydrateFromServer(slug);
    if (!ws.ok) {
      done();
      S.ui.errors = { join: t('err.accountCreatedLoadFailed') };
      render();
      return;
    }
    S.ui.pwNew = '';
    history.replaceState(null, '', `/w/${slug}`);
    enterApp(t('toast.welcomeUser', { name: nm }));
  });
};
A.doSignup = () => {
  const e = (S.ui.errors = {});
  const nm = $('#s-name').value.trim(),
    em = $('#s-email').value.trim(),
    pw = $('#s-pw').value;
  S.ui.af.name = nm;
  S.ui.af.email = em;
  if (!nm) e.name = t('err.enterName');
  if (!EMAIL_RE.test(em)) e.email = t('err.workEmailInvalid');
  if (pw.length < 10 || !/[0-9\W]/.test(pw)) e.pw = t('err.passwordWeak');
  if (Object.keys(e).length) {
    render();
    $('#s-email').value = em;
    return;
  }
  if (!api.enabled) {
    loadingBtn('signup-btn', 800, () => {
      S.ui.auth = 'verify';
      startResend();
      render();
    });
    return;
  }
  if (!api.allowSignup) {
    S.ui.errors = { email: t('err.signupDisabled') };
    render();
    return;
  }
  loadingBtn('signup-btn', 0, async () => {
    const btn = document.getElementById('signup-btn');
    const done = () => {
      btn?.classList.remove('is-loading');
      btn?.removeAttribute('aria-busy');
    };
    const res = await api.signup(nm, em, pw);
    if (!res.ok) {
      done();
      S.ui.errors = { email: res.error || t('err.accountCreateFailed') };
      render();
      return;
    }
    await adoptAccountLocale();
    const slug = api.workspaces[0]?.slug;
    if (!slug) {
      done();
      S.ui.af.pw = '';
      enterNoWorkspace();
      return;
    }
    const ws = await hydrateFromServer(slug);
    if (!ws.ok) {
      done();
      S.ui.errors = { email: t('err.accountCreatedLoadFailed') };
      render();
      return;
    }
    history.replaceState(null, '', `/w/${slug}`);
    S.ui.af.pw = '';
    enterApp(t('toast.welcomeUser', { name: nm }));
  });
};
export function startResend() {
  S.ui.resendT = 30;
  clearInterval(startResend._i);
  startResend._i = setInterval(() => {
    S.ui.resendT--;
    const el = $('#resend-t');
    if (el) el.textContent = S.ui.resendT;
    if (S.ui.resendT <= 0) {
      clearInterval(startResend._i);
      if (S.ui.auth === 'verify') render();
    }
  }, 1000);
}
A.resend = el => {
  if (el.dataset.v === 'verify') {
    startResend();
    render();
    toast(t('toast.verificationSent', { email: S.ui.af.email }));
  } else toast(t('toast.resetSent', { email: S.ui.af.email }));
};
A.verified = () => {
  S.ui.auth = 'onboarding';
  S.ui.onb = 0;
  S.ui.onbData.ws = '';
  S.ui.onbData.url = '';
  render();
};
A.doForgot = () => {
  const em = $('#f-email').value.trim();
  S.ui.af.email = em;
  S.ui.errors = {};
  if (!EMAIL_RE.test(em)) {
    S.ui.errors.email = t('err.forgotEmailInvalid');
    render();
    return;
  }
  loadingBtn('forgot-btn', 700, () => {
    S.ui.auth = 'forgot-sent';
    render();
  });
};
A.doReset = () => {
  const a = $('#r-pw').value,
    b = $('#r-pw2').value;
  const e = (S.ui.errors = {});
  if (a.length < 10 || !/[0-9\W]/.test(a)) e.pw = t('err.passwordWeak');
  if (a !== b) e.pw2 = t('err.passwordMismatch');
  if (Object.keys(e).length) {
    render();
    return;
  }
  loadingBtn('reset-btn', 700, () => {
    S.ui.auth = 'reset-done';
    S.ui.pwNew = '';
    render();
  });
};

/* onboarding */
A.onbSet = el => {
  S.ui.onbData[el.dataset.k] = el.dataset.v;
  if (el.dataset.k === 'tmpl') {
    const tp = TEMPLATES.find(x => x.id === el.dataset.v);
    if (tp && !S.ui.onbData.projTouched) S.ui.onbData.proj = tp.id === 'web' ? 'Website Launch' : t(`project.template.${tp.id}.name`);
  }
  render();
};
IN.onbWs = el => {
  const o = S.ui.onbData;
  o.ws = el.value;
  if (!o.urlTouched)
    o.url = el.value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  if (S.ui.errors.ws && el.value.trim()) S.ui.errors.ws = null;
  render();
};
IN.onbUrl = el => {
  S.ui.onbData.url = el.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
  S.ui.onbData.urlTouched = true;
  render();
};
IN.onbProj = el => {
  S.ui.onbData.proj = el.value;
  S.ui.onbData.projTouched = true;
};
IN.onbInv = el => {
  const a = (S.ui.onbData.invites || '').split(',');
  a[+el.dataset.i] = el.value.trim();
  S.ui.onbData.invites = a.join(',');
};
A.onbBack = () => {
  S.ui.onb = Math.max(0, S.ui.onb - 1);
  render();
};
A.onbNext = el => {
  const o = S.ui.onbData;
  if (S.ui.onb === 1 && !o.ws.trim()) {
    S.ui.errors.ws = t('err.wsNameRequired');
    render();
    $('#o-ws')?.focus();
    return;
  }
  if (S.ui.onb === 3 && !o.proj.trim()) {
    toast(t('err.projectName'), { kind: 'err' });
    return;
  }
  if (S.ui.onb === 4 && el.dataset.skip) o.invites = '';
  if (S.ui.onb === 4 && !el.dataset.skip) {
    const bad = (o.invites || '').split(',').filter(x => x && !EMAIL_RE.test(x));
    if (bad.length) {
      toast(t('err.notValidEmail', { email: bad[0] }), { kind: 'err' });
      return;
    }
  }
  S.ui.onb++;
  render();
  setTimeout(() => $('.auth input')?.focus(), 20);
};
A.onbExit = () => {
  S.ui.auth = null;
  render();
};
A.onbFinish = async () => {
  const o = S.ui.onbData;
  const emails = (o.invites || '')
    .split(',')
    .map(x => x.trim())
    .filter(x => EMAIL_RE.test(x));
  if (api.enabled) {
    const res = await api.createWorkspace(o.ws.trim() || t('common.workspace'), o.url || undefined);
    if (!res.ok) {
      S.ui.errors = { ws: res.error || t('err.createWorkspace') };
      toast(res.error || t('err.createWorkspace'), { kind: 'err' });
      render();
      return;
    }
    const loaded = await openWorkspace(res.data.workspace.slug);
    if (!loaded.ok) {
      toast(t('err.wsCreatedNotLoaded'), { kind: 'err' });
      return;
    }
  }
  let p;
  mutate(() => {
    if (!api.enabled && o.ws.trim()) {
      /* The demo keeps a single workspace: rename it instead of adding another. */
      D().ws.name = o.ws.trim();
      D().ws.url = o.url || D().ws.url;
    }
    S.prefs.defaultTab = { kanban: 'board', list: 'list', timeline: 'timeline', table: 'table' }[o.team] || 'board';
    const tm = TEMPLATES.find(x => x.id === o.tmpl) || TEMPLATES[2];
    p = createProject(
      {
        name: o.proj.trim() || t(`project.template.${tm.id}.name`),
        icon: tm.icon === 'file' ? 'folder' : tm.icon,
        color: 'indigo',
        team: me().team,
        lead: D().me,
        desc: t('act.createdFromTemplate', { name: t(`project.template.${tm.id}.name`) }),
      },
      tm.id,
    );
    if (!api.enabled)
      emails.forEach(e =>
        D().members.push({
          id: uid('m'),
          name: e.split('@')[0].replace(/\b\w/g, c => c.toUpperCase()),
          email: e,
          role: 'Member',
          team: me().team,
          title: t('member.titleMember'),
          c: '#6B7280',
          status: 'invited',
          last: null,
          tz: '—',
        }),
      );
  });
  if (api.enabled && emails.length) {
    const inv = await api.createInvites(emails, 'member', null);
    if (!inv.ok) toast(inv.error || t('err.sendInvites'), { kind: 'err' });
  }
  S.ui.auth = null;
  go('project', { id: p.id, tab: S.prefs.defaultTab });
  toast(t('toast.welcomeTo', { name: D().ws.name }));
};
