/* =====================================================================
   ACTIONS · INPUT HANDLERS · DRAG & DROP · KEYBOARD · INIT
   ===================================================================== */
import { $, $$, TODAY, addD, dOff, esc, fmtDate, iso, parse, uid, jsonEqual } from '../core/utils.js';
import { t, t as tMsg, tErr, getLocale, negotiate, primeLocale, readStoredLocale, setLocale, storeLocale } from '../core/i18n.js';
import { ASSIGNEE_CAP, DEFAULT_OPTIONS, PR, PSTAT, LB } from '../core/constants.js';
/* Phase 65 (65-01): subtask-tree ordering — new subtasks are born with
   parentId:null and the next free position (D-01/D-02/D-03). */
import { cascadeDoneIds, descendantsOf, nextPosition } from '../core/subtree.js';
import { mergeNotifPrefs, setLocalNotifPrefs } from '../core/notifPrefs.js';
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
  memberTeams,
  memberScopeEligible,
  myNotifs,
  notifyMembers,
  proj,
  projTeams,
  pushNow,
  ensureSeedData,
  roleLabel,
  save,
  task,
  teamsList,
  tasksOf,
  visibleProjects,
} from '../core/store.js';
import { api, applyUser, registerAuthRevokedHandler } from '../core/api.js';
import { burstUnreadIds } from '../core/inboxBursts.js';
import { searchTasksServer } from '../core/search-server.js';
import { fileType, fsize } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { mutate, toast } from '../ui/toast.js';
import { autosize, focusKey, fxSet, go, render } from '../shell/render.js';
import { applyView, viewOf } from '../shell/view-engine.js';
import { PERMS, TEMPLATES, closeModal, openModal, permLabel } from '../overlays/modals.js';
import { closePop, openPop, tgt } from '../overlays/popovers.js';
import { palServerSearch } from '../overlays/palette.js'; // Phase 58 D-01: debounced server search behind the palette input
import { strengthMeter } from '../ui/strength.js';
import { prefValue } from '../core/prefs.js';
/* 87-04 (D-03): the task form's tz default resolves through the SHARED
   tzPreselect — one timezone defaulting rule, never a second. The import
   targets the leaf lib module (NOT pages/settings.js): an entry→settings
   edge would dissolve the lazy settings chunk (build-chunk-size gate). */
import { tzPreselect } from '../lib/timezones.js';
/* [Phase 57-03 Rule 3] buildExportModel lives in a LAZY chunk (DELIV-02
   index gate): A.exportOpen loads it before the modal opens and stashes the
   module on S.ui.expMod; the submit path awaits the same import. */
/* toCsv rides the lazy chunk (DELIV-02 index gate, 57-02): the only call site is the async static-mode export below. */
/* download/saveBlob ride the lazy chunk (DELIV-02 index gate, 57-02): the
   only call sites are the async export paths below. */
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
      assignees: [],
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
  /* P4-b: tasks created directly with assignees notify the new members too.
     SCOPE-04 (A4): the eligibility pre-filter is advisory — the server's
     assignee write-guard is the authority. */
  for (const id of tk.assignees || [])
    if (memberScopeEligible(mem(id), tk.project))
      notifyMembers([id], { type: 'assign', by: D().me, task: tk.id, project: tk.project, snippet: fmtDate(tk.due) || '' });
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
/* Emit mention notifications for a parsed body. The per-user notifPrefs gate the
   emission (mention_all for members, mention_team for @team) — Phase 34 D-01:
   the field no longer rides the document, so the gating reads the per-user
   prefs object from store state.
   Returns the Set of member ids notified, so a comment can skip them for the
   plain `comment` notification (P4-d). */
export function emitMentions(txt, tk) {
  const { memberIds, teamIds } = parseMentions(txt || '');
  const np = S.notifPrefs || {};
  const targets = new Set();
  if (np.mention_all !== false) memberIds.forEach(id => targets.add(id));
  if (np.mention_team !== false) {
    for (const tid of teamIds)
      (D().members || []).forEach(m => {
        if (memberTeams(m).includes(tid) && m.status === 'active') targets.add(m.id);
      });
  }
  /* SCOPE-04 (A4): send-time eligibility pre-filter — an out-of-scope target
     never enters the fan-out. Advisory only: the projection cannot always
     determine scope (D-05), so memberScopeEligible defaults to allow and the
     server guards are the authority. No notifications-list filtering (D-07). */
  for (const id of [...targets]) {
    if (!memberScopeEligible(mem(id), tk?.project ?? null)) targets.delete(id);
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
  /* SCOPE-04 (A4): the eligibility pre-filter is advisory — the server guards
     are the authority; memberScopeEligible defaults to allow when scope is
     underivable (D-05). */
  return [...new Set([...(t.assignees || []), t.creator, ...commentsOf(t.id).map(c => c.by)])]
    .filter(Boolean)
    .filter(x => x !== D().me)
    .filter(x => memberScopeEligible(mem(x), t.project));
}

export function applyPatch(t, patch) {
  const msgs = [];
  for (const k of Object.keys(patch)) {
    const old = t[k],
      nv = patch[k];
    /* [2026-11-09 IN-03] jsonEqual: the skip-unchanged fast path must not
       depend on the patch object's key insertion order. */
    if (jsonEqual(old, nv)) continue;
    t[k] = nv;
    if (k === 'status') {
      if (nv === 'done') {
        t.completedAt = Date.now();
        t.prevStatus = old;
        logAct('completed', t, {});
        fxSet({ done: t.id });
        /* [Phase 65, 65-02 D-14] Task-level completion cascades to every open
           subtask at every level — same rule as subtask-parent completion.
           D-13: reopening (any non-done status) cascades nothing. */
        const subs65 = Array.isArray(t.subtasks) ? t.subtasks : [];
        for (const sid of cascadeDoneIds(subs65, null)) {
          const d = subs65.find(x => x.id === sid);
          if (!d || d.done) continue;
          d.done = true;
          fxSet({ done: d.id });
          logAct('completedSubtaskOn', t, { kind: 'quoted', value: d.title });
        }
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
    } else if (k === 'assignees') {
      /* D-55-13 diff-based: only newly-added members get the assignment
         notification (author excluded inside notifyMembers) and only removed
         members log `unassigned`; untouched assignees are never pinged.
         SCOPE-04 (A4): the eligibility pre-filter is advisory — the server's
         assignee write-guard is the authority. */
      const prev = Array.isArray(old) ? old : [];
      const next = Array.isArray(nv) ? nv : [];
      for (const id of next) {
        if (prev.includes(id)) continue;
        logAct('assigned', t, { kind: 'assignedTo', value: mem(id)?.name });
        if (memberScopeEligible(mem(id), t.project))
          notifyMembers([id], { type: 'assign', by: D().me, task: t.id, project: t.project, snippet: fmtDate(t.due) || '' });
      }
      for (const id of prev)
        if (!next.includes(id)) {
          logAct('assigned', t, { kind: 'unassigned' });
          /* D-55-13: removed assignees get notified too — the mirror of the
             add path, eligibility pre-filtered (advisory; the server guards
             are the authority). */
          if (memberScopeEligible(mem(id), t.project))
            notifyMembers([id], { type: 'assignRemoved', by: D().me, task: t.id, project: t.project });
        }
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
  if (r === 'settings' && (p.sec === 'sessions' || p.sec === 'tfa' || p.sec === 'apikeys') && api.enabled) {
    refreshSessions();
    refreshTfa(); // T-16-13: the card's on/off split re-reads the server
    if (p.sec === 'sessions') {
      refreshAuditLog(); // AUD-03: the trail card lives on the sessions tab (the operator card relocated to governance, 79-03 D-01)
    }
    if (p.sec === 'apikeys') refreshApiKeys(); // MCP-01: the key rows re-read the server
  }
  if (r === 'settings' && p.sec === 'notif-push' && api.enabled) refreshPushState(); // Phase 59 (D-03): device list + master toggle re-read the server
};
A.back = () => {
  const h = S.ui.history.pop();
  if (h) go(h.route, h.params, { back: true });
  else go('home');
};
A.reload = () => render();
/* Phase 60 (dashboard): retry after a non-403 dashboard fetch failure —
   clears the error state and refills. */
A.dashRetry = () => {
  S.ui.dashErr = null;
  S.ui.dashData = null;
  render();
};
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
  /* [55-04 D-55-6] The single-assignee pops are gone — the task pop (board
     cell, table cell, drawer field, form chip) and the subtask pop (D-55-5)
     open the assignee picker modal instead, from the same placements. */
  if (d.pop === 'assignee' || d.pop === 'subassignee') {
    A.assigneePickOpen(el);
    return;
  }
  if (d.pop === 'views') {
    /* Named saved views (57-02): the body is built by the lazy savedViewsUi
       chunk after it refreshes the member's named rows (DELIV-02 gate). */
    openPop(el);
    /* IN-01 (57-04): a failed chunk load (offline flake, deploy invalidating
       the hash) must not reject unhandled and leave an empty popover — it
       degrades silently like the other lazy seams. */
    import('../views/savedViewsUi.js').then(m => m.refreshViewsPop()).catch(() => {});
    return;
  }
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
  S.ui.pop = { type: 'ctx', ctx: d.ctx, id: d.id, sid: d.sid, key: d.key, vid: d.vid, x: r.left, y: r.bottom + 4, top: r.top, w: r.width };
  render();
};
A.popPick = el => {
  const p = S.ui.pop;
  let v = el.dataset.v;
  if (p.type === 'date' && (p.field === 'subdue' || p.field === 'substart')) {
    const t = task(p.id);
    const sb = t?.subtasks[p.i];
    if (!sb) return;
    const v = el.dataset.v || null;
    const isStart = p.field === 'substart';
    S.ui.pop = null;
    mutate(() => {
      if (isStart) sb.start = v;
      else sb.due = v;
      logAct(isStart ? 'setASubtaskStartDateOn' : 'setASubtaskDueDateOn', t, v ? { kind: 'dateSet', value: v } : { kind: 'dateCleared' });
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
  const field = { status: 'status', priority: 'priority', assignee: 'assignees', project: 'project', recur: 'recur', estimate: 'estimate', date: p.field }[
    p.type
  ];
  if (!field) return;
  /* D-55-3: the client never writes the scalar — a member pick replaces the
     array with [v], clearing maps to []. */
  if (field === 'assignees') v = v ? [v] : [];
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
/* ---------- 55-04 assignee picker ---------- */
/* The picker's open/toggle/apply trio. The draft lives in S.ui.assigneePick
   (pitfall 4) so background renders and chip toggles never wipe it; the
   confirm applies the whole draft as ONE array write and the applyPatch
   assignees branch diffs it against the previous array (D-55-13). */
A.assigneePickOpen = el => {
  const d = el.dataset;
  const id = d.id;
  const subI = d.i != null ? +d.i : null;
  const cur =
    id === '__form'
      ? S.ui.form.assignees || []
      : subI != null
        ? task(id)?.subtasks[subI]?.assignees || []
        : task(id)?.assignees || [];
  S.ui.assigneePick = { taskId: id, subtaskIndex: subI, draft: [...cur], q: '' };
  S.ui.pop = null;
  /* 66-03 gate remedy: the picker's bytes ride features/assignee-pick.js —
     loaded before the modal opens (the S.ui.apMod cache is the modalHtml
     case's renderer); a repeat open skips the import. */
  if (S.ui.apMod) openModal({ type: 'assigneePick' });
  else
    import('../features/assignee-pick.js').then(m => {
      S.ui.apMod = m;
      openModal({ type: 'assigneePick' });
    });
};
A.assigneePickToggle = el => {
  const st = S.ui.assigneePick;
  if (!st) return;
  const id = el.dataset.v;
  if (st.draft.includes(id)) st.draft = st.draft.filter(x => x !== id);
  else if (st.draft.length < ASSIGNEE_CAP) st.draft = [...st.draft, id];
  /* At the cap a further add is blocked (D-55-7) — the hint is visible on the
     modal, so a blocked click only re-renders. */
  render();
};
IN.assigneePickQ = el => {
  if (!S.ui.assigneePick) return;
  S.ui.assigneePick.q = el.value;
  render();
};
A.assigneePickApply = () => {
  const st = S.ui.assigneePick;
  if (!st) return;
  const draft = [...st.draft];
  const { taskId, subtaskIndex } = st;
  S.ui.assigneePick = null;
  closeModal();
  if (taskId === '__form') {
    S.ui.form.assignees = draft;
    render();
    return;
  }
  if (subtaskIndex != null) {
    const tk = task(taskId);
    const sb = tk?.subtasks[subtaskIndex];
    if (!sb) return;
    mutate(() => {
      /* Subtask assignees carry the canonical array shape (D-55-5; server-side
         invariants in 55-01) — the diff feeds the same assigned/unassigned
         activity verbs the old pop used. */
      const prev = Array.isArray(sb.assignees) ? sb.assignees : sb.assignee ? [sb.assignee] : [];
      sb.assignees = draft;
      for (const id of draft)
        if (!prev.includes(id)) logAct('assignedASubtaskOn', tk, { kind: 'assignedTo', value: mem(id)?.name ?? '' });
      for (const id of prev) if (!draft.includes(id)) logAct('assignedASubtaskOn', tk, { kind: 'unassigned' });
    });
    return;
  }
  updateTask(taskId, { assignees: draft });
};
export const ctxTo = type => () => {
  S.ui.pop = { ...S.ui.pop, type, q: '' };
  if (type === 'date') S.ui.pop.m = iso(TODAY);
  render();
};
A.ctxStatus = ctxTo('status');
/* [55-04 D-55-6] The context menu's Assign entry opens the picker modal —
   the scalar assignee pop it used to open no longer exists. */
A.ctxAssign = el => A.assigneePickOpen(el);
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
    assignees: [...(t.assignees || [])],
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
    assignees: d.assignee ? [d.assignee] : [D().me],
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
    assignees: f.assignees || [],
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
  if (c.ctx === 'mytasks') f.assignees = [D().me];
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
    /* [Phase 65, 65-02 D-14] Cascade completion is symmetric at every level:
       completing a subtask that is itself a parent auto-completes its open
       descendants — same rule as top-level task completion. D-13: the reopen
       branch above deliberately does nothing to descendants (undo-minimalism
       — the user reopens children individually). */
    if (s.done) {
      for (const sid of cascadeDoneIds(t.subtasks, s.id)) {
        const d = t.subtasks.find(x => x.id === sid);
        if (!d || d.done) continue;
        d.done = true;
        fxSet({ done: d.id });
        logAct('completedSubtaskOn', t, { kind: 'quoted', value: d.title });
      }
    }
  });
};
A.rmSub = el => {
  const t = task(el.dataset.id);
  mutate(() => {
    /* [Phase 65, 65-02 SUB-02] Children follow parent: the kill-set is the
       target plus every transitive descendant — never an orphaned entry. */
    const kill = new Set(descendantsOf(t.subtasks, el.dataset.sid).map(s => s.id).concat(el.dataset.sid));
    t.subtasks = t.subtasks.filter(x => !kill.has(x.id));
  });
};
KEY.addSub = el => {
  const t = task(el.dataset.id);
  const v = el.value.trim();
  if (!v) return;
  const nid = uid('s');
  fxSet({ added: nid });
  mutate(() => {
    /* Phase 65 (65-01 D-01/D-03): shape-conformant birth — root subtask with
       an explicit integer position so moves stay one-node diffs. */
    t.subtasks.push({ id: nid, parentId: null, position: nextPosition(t.subtasks, null), title: v, done: false });
    logAct('addedSubtaskTo', t, { kind: 'subtaskAdded', value: v });
  });
  setTimeout(() => $('#d-sub')?.focus(), 0);
};
A.expandRow = el => {
  S.ui.openTasks[el.dataset.id] = !S.ui.openTasks[el.dataset.id];
  render();
};
/* Phase 65 (65-03 D-10): per-node collapse carets — a SESSION-ONLY S.ui map
   keyed by subtask id, never persisted per user or in the doc. Shared by the
   drawer checklist, the list/table subrows and the timeline. */
A.toggleSubNode = el => {
  S.ui.subOpenNodes[el.dataset.sid] = !S.ui.subOpenNodes[el.dataset.sid];
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
  openFilePreview(f, t.id);
};
A.previewFile = el => {
  const f = D().files.find(x => x.id === el.dataset.id);
  S.ui.pop = null;
  if (f) openFilePreview(f, f.task);
};
/* 66-03 gate remedy: the preview's bytes ride features/file-preview.js —
   loaded before the modal opens (the S.ui.fpMod cache is the modalHtml
   case's renderer); a repeat open skips the import. */
function openFilePreview(f, tid) {
  if (S.ui.fpMod) openModal({ type: 'filePreview', file: f, tid });
  else
    import('../features/file-preview.js').then(m => {
      S.ui.fpMod = m;
      openModal({ type: 'filePreview', file: f, tid });
    });
}
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

/* Phase 43: workspace logo upload/remove from Settings > General > Workspace.
   The api methods POST the raw file body (D-13) and adopt the returned revision
   before any subsequent doc write (Pitfall 2); a re-render repaints the sidebar
   avatar, favicon and settings header from the single payload source. */
IN.uploadLogo = async el => {
  const file = el.files?.[0];
  el.value = '';
  if (!file) return;
  const r = await api.uploadLogo(file);
  if (!r.ok) return toast(r.error || t('err.serverUnreachable'), { kind: 'err' });
  render();
};
IN.removeLogo = async () => {
  const r = await api.removeLogo();
  if (!r.ok && r.status !== 404) return toast(r.error || t('err.serverUnreachable'), { kind: 'err' });
  render();
};
/* G-43-3: the Settings "Remove logo" button carries the removeLogo action
   name, so the click delegation in events.js dispatches A[el.dataset.a] —
   the handler must be reachable under A, not only IN. Alias, not a copy:
   one code path. */
A.removeLogo = IN.removeLogo;

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
  let f = el.dataset.f;
  let v = el.dataset.v || null;
  /* D-55-3: bulk assignment replaces each task's assignees array. */
  if (f === 'assignee') {
    f = 'assignees';
    v = v ? [v] : [];
  }
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
  if (el.dataset.key) import('../core/viewSync.js').then(m => m.persistLiveView(el.dataset.key));
  render();
};
/* Phase 57 (D-14): "Reset columns" deletes the member's live view state for
   this table key so the hardcoded viewOf() defaults return. The localStorage
   entry goes too (local-mode half of the reset); in server mode the live-row
   DELETE half lands with Phase 57 plan 02's DELETE route — the defaults
   re-apply here regardless. */
A.resetCols = el => {
  delete S.views[el.dataset.key];
  const wsId = api.enabled ? api.workspace?.id : D().ws.url;
  // The D-14 reset via the lazy chunk: server mode DELETEs the live name='' row, local mode clears the mirror (57-01/57-02 halves).
  import('../core/viewSync.js').then(m => m.deleteViewRow(wsId, el.dataset.key, ''));
  viewOf(el.dataset.key); // re-apply the D-13 defaults
  S.ui.pop = null;
  save();
  render();
};
/* Named saved views (Phase 57 plan 02, VIEW-02): the handlers live in the
   lazy savedViewsUi chunk (DELIV-02 index-gate split, the 57-01 pattern). */
for (const fn of ['saveTableView', 'applyTableView', 'deleteTableView', 'updateTableView'])
  A[fn] = el => import('../views/savedViewsUi.js').then(m => m[fn](el)).catch(() => {});
/* Per-user view write-through + hydration live in the lazy viewSync chunk
   (Phase 57, D-05/D-07 — DELIV-02 index-gate split). hydrateViews keeps the
   call sites unchanged; the chunk is fetched at the first view write or the
   first workspace entry. */
export const hydrateViews = () => import('../core/viewSync.js').then(m => m.hydrateViews()).catch(() => {});
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
  S.ui.pform = { name: '', desc: '', icon: 'folder', color: 'indigo', teams: memberTeams(me()), lead: D().me, due: dOff(30), tmpl: 'blank' };
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'projectCreate' });
  /* 67-05: the create modal's favourites block dispatches A.tplPick, whose
     bytes ride the lazy template-ui chunk — pre-warm it the same way
     openTemplatePicker does, so a fast click can never hit a dead action. */
  if (!S.ui.tplUi)
    import('../features/template-ui.js').then(mod => {
      S.ui.tplUi = mod;
      /* the create modal is already open — re-render so the favourites
         block replaces the fallback hint once the chunk lands */
      render();
    });
};
A.editProject = el => {
  /* [53-03 D-05] The gear (and the context-menu Edit entry) opens the unified
     project settings modal on the General tab. */
  el.dataset.tab = el.dataset.tab || 'general';
  A.projectSettings(el);
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
/* P3 multi-team: pformTeamToggle retired 2026-11-11 (create form dropped its
   team chips — teams link via the Access tab); invite forms keep their own
   toggle actions. */
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
    /* [2026-11-08 D-51-17] Lead-on-create, client default: the creator is the
       lead unless the form carries one — the server enforces the same grant
       (51-01 mergeClientDoc), this keeps the local optimistic copy honest. */
    lead: f.lead || D().me,
    /* [Phase 57 VIEW-03] Default workspace visibility seeds the initial
       private flag at creation only: an explicit form choice wins, the pref
       is on, the field is ABSENT (absent = non-private, exactly the
       projectIsPrivate shape). The server mirrors the seed from the STORED
       pref — never retro-applied to existing projects (D-02/D-04). */
    ...(f.private === true || S.prefs?.defaultPrivate === true ? { private: true } : {}),
    due: f.due || dOff(30),
    start: dOff(0),
    fav: false,
    members: [...new Set([D().me, f.lead || D().me])],
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
      assignees: i === 0 ? [D().me] : [],
      priority: i === 0 ? 'high' : 'medium',
      due: dOff(5 + i * 5),
      start: dOff(i * 5),
    });
  return p;
}
A.submitProject = async () => {
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
  /* [2026-11-08 D-51-17] The lead select exists in the modal (modals.js); a
     form state that somehow lost it still defaults to the creator. */
  if (!f.lead) f.lead = D().me;
  if (m.edit) {
    const p = proj(m.edit);
    /* [2026-11-09 owner ruling] teams are no longer editable here — the
       General tab dropped its team chips (they live in Access); writing the
       form's stale f.teams would silently unlink Access-tab connections. */
    const snap = snapshot();
    mutate(() =>
      Object.assign(p, {
        name: f.name,
        desc: f.desc,
        icon: f.icon,
        color: f.color,
        lead: f.lead,
        due: f.due,
        members: [...new Set([...p.members, f.lead])],
      }),
    );
    /* [2026-11-09 WR-01] Conflict honesty: settle the debounced push before
       claiming success — a 409 from a concurrent admin surfaces the conflict
       message with the store restored, never a success toast over a lost
       write (same contract as IN.teamPerm / IN.sharePerm). */
    const res = await pushNow();
    if (!res.ok) {
      restore(snap);
      render();
      toast(res.status === 409 ? t('modal.settingsConflict') : t('err.projectSaveFailed'), { kind: 'err' });
      return;
    }
    S.ui.modals.pop();
    render();
    toast(t('toast.projectUpdated'));
    return;
  }
  let p;
  /* [2026-11-08 D-51-14/15/16] CRT-01 client: the create rides the doc-sync
     PUT, settled with pushNow() so the server's scoped keyed refusal is
     observable. ONLY the projectCreateForbidden code maps to the restricted-
     create toast + revert of the optimistic insert; a generic sync failure
     keeps its existing handling (the conflict banner machinery). No cached
     restriction state — the refusal comes from the server per request
     (D-51-16), the disabled affordance above is UX only (T-51-07). */
  const snap = snapshot();
  if (
    !mutate(() => {
      p = createProject(f, f.tmpl);
    })
  )
    return;
  const res = await pushNow();
  const refused = Array.isArray(res.data?.refused) ? res.data.refused.map(r => r?.code || r) : [];
  if (refused.includes('projectCreateForbidden')) {
    restore(snap);
    render();
    toast(t('err.projectCreateForbidden'), { kind: 'err' });
    return;
  }
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
/* [53-03 D-04/D-05] The unified project settings modal. The entry point
   seeds the tab: gear/general (via A.editProject), share/access. The form
   model (S.ui.pform) and the invite search (S.ui.shareQ) reset here, and the
   modal object carries both the id and the edit id submitProject expects.
   The body renders from live store state — this action takes NO snapshot
   (53-03 Pitfall 3: a stale snapshot would overwrite concurrent grants). */
A.projectSettings = el => {
  const id = el.dataset.id || curProjectId();
  const p = proj(id);
  if (!p) return;
  S.ui.pform = { name: p.name, desc: p.desc, icon: p.icon, color: p.color, teams: projTeams(p), lead: p.lead, due: p.due, tmpl: 'blank' };
  S.ui.errors = {};
  S.ui.shareQ = '';
  S.ui.settingsTab = el.dataset.tab === 'access' ? 'access' : 'general';
  S.ui.pop = null;
  openModal({ type: 'projectSettings', id, edit: id });
};
/* Tab clicks route through the data-a click pipeline (the tab buttons carry
   the action name), so the handler lives in A, not IN. [67-04 D-08] The
   Webhooks tab pre-warms its lazy chunk BEFORE the render (the A.exportOpen
   pattern — no webhook string rides the entry chunk) and fetches the
   canManageProject-gated hook list from the 67-03 routes. */
A.settingsTab = async el => {
  S.ui.settingsTab = ['access', 'webhooks'].includes(el.dataset.v) ? el.dataset.v : 'general';
  if (S.ui.settingsTab === 'webhooks' && !S.ui.whMod) {
    S.ui.whMod = await import('../overlays/webhooks-settings.js');
    await S.ui.whMod.loadHooks();
  }
  render();
};
/* ==================== EXPORT (54-01, D-54-1/D-54-2, R1) ====================
   One modal, two entry points (header icon button, context menu), one
   canManageProject guard at open AND at submit. The view id mapping: a
   saved-view tab ('v:<id>') exports that saved view ('sv:<id>'); a task tab
   exports the project's project-view; overview/files/activity have no task
   view — the modal disables the view scope there. */
A.exportOpen = async el => {
  const id = el.dataset.id;
  const p = proj(id);
  if (!p || !canManageProject(p)) return;
  /* [Phase 57-03 Rule 3] The model chunk is loaded BEFORE the modal opens —
     the modal's scope count derives from buildExportModel synchronously. */
  S.ui.expMod = await import('../export/model.js');
  const tab = S.ui.params.tab || 'board';
  S.ui.expOptions = { ...DEFAULT_OPTIONS };
  S.ui.expScope = 'all';
  /* 54-05: the default format follows the mode — Excel on the server
     build (the richest artifact), CSV on the static build (the only
     browser writer). The submit path sends S.ui.expFormat verbatim. */
  S.ui.expFormat = api.enabled ? 'xlsx' : 'csv';
  S.ui.expViewKey = tab.startsWith('v:')
    ? 'sv:' + tab.slice(2)
    : ['board', 'list', 'table', 'calendar', 'timeline'].includes(tab)
      ? 'p:' + p.id
      : null;
  openModal({ type: 'export', id });
};
IN.exportFormat = el => {
  S.ui.expFormat = el.value;
  render();
};
IN.exportScope = el => {
  S.ui.expScope = el.value;
  render();
};
IN.exportOption = el => {
  const opts = S.ui.expOptions || (S.ui.expOptions = { ...DEFAULT_OPTIONS });
  opts[el.dataset.key] = el.checked;
  render();
};
/* The scope ids a view-scope export sends — computed from the SAME view the
   user is looking at, so what you see is what you export. */
const exportViewIds = p => {
  if (S.ui.expScope !== 'view' || !S.ui.expViewKey) return undefined;
  const v = viewOf(S.ui.expViewKey);
  return applyView(tasksOf(p.id), v).map(t => t.id);
};
const exportCount = p =>
  (S.ui.expMod?.buildExportModel?.(D(), p.id, { scope: S.ui.expScope === 'view' ? 'view' : 'all', ids: exportViewIds(p), options: S.ui.expOptions }, { translate: t, labelName: id => LB[id]?.name || id, now: new Date() })?.rows || []).length;
/* Static-mode filename helper (D-54-2): the same allow-list as the server —
   every character outside A-Z a-z 0-9 dot underscore hyphen becomes a hyphen. */
const safeExportStem = value =>
  String(value || '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '') || 'project';
A.exportSubmit = async el => {
  const p = proj(el.dataset.id);
  if (!p || !canManageProject(p)) return toast(t('err.exportForbidden'), { kind: 'err' });
  const count = exportCount(p);
  if (count === 0) return toast(t('export.scope.count', { n: 0 }), { kind: 'info' });
  const options = { ...(S.ui.expOptions || DEFAULT_OPTIONS) };
  const exp = S.ui.expMod || (await import('../export/model.js'));
  const scope = S.ui.expScope === 'view' && S.ui.expViewKey ? 'view' : 'all';
  const ids = scope === 'view' ? exportViewIds(p) : undefined;
  /* STATIC MODE (54-01): no server — the model and writer run in the browser,
     exactly the code path the server route uses (R9: no charts, no arrows,
     no multi-sheet pretence — CSV only). */
  if (!api.enabled) {
    const [{ saveBlob }, { toCsv }] = await Promise.all([import('../core/download.js'), import('../export/csv.js')]);
    const model = exp.buildExportModel(D(), p.id, { scope, ids, options }, { translate: t, labelName: id => LB[id]?.name || id, now: new Date() });
    const csv = toCsv(model);
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${safeExportStem(p.key)}-${model.exportDateISO}.csv`);
    closeModal();
    return toast(t('export.scope.count', { n: count }), { ms: 1800 });
  }
  const body = { format: S.ui.expFormat || 'csv', scope, options };
  if (scope === 'view') {
    if (!ids) {
      body.scope = 'all';
    } else {
      body.ids = ids;
    }
  }
  const { download, saveBlob } = await import('../core/download.js');
  const r = await download(`/api/workspaces/${encodeURIComponent(D().ws.url)}/projects/${p.id}/export`, body);
  if (!r.ok) return toast(r.error || t('err.exportFailed'), { kind: 'err' });
  saveBlob(r.blob, r.filename);
  closeModal();
  toast(t('export.scope.count', { n: count }), { ms: 1800 });
};
A.share = el => {
  /* [53-03 D-05] Every Share entry (labeled button, avatar stack, user-plus,
     context menu) opens the unified modal directly on the Access tab. */
  el.dataset.tab = 'access';
  A.projectSettings(el);
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
/* [2026-11-08 D-51-5/6/7/8/9] The share modal's Teams section actions. Both
   ride the doc-sync path ONLY (no REST route — a non-admin lead must be able
   to link/unlink teams, and the admin-gated routes would 403 for them; the
   server-side manager gating for p.teams writes is pinned in the
   visibility-team suite). No role choice (D-51-7): the link confers
   Member-level access; optimistic flip with snapshot revert on a refused PUT
   — the same revert shape as the shareAccess toggle (D-51-3). */
A.shareTeamInvite = async el => {
  const p = proj(el.dataset.id);
  const tm = teamsList().find(x => x.id === el.dataset.tid);
  if (!p || !tm) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  const snap = snapshot();
  mutate(() => {
    p.teams = Array.isArray(p.teams) ? p.teams : [];
    if (!p.teams.includes(tm.id)) p.teams.push(tm.id);
    /* [53-03 D-02] A freshly linked team stores its explicit default tier so
       absence-of-key is never load-bearing: the dropdown reads 'Can edit'. */
    p.perms = p.perms || {};
    if (!p.perms['team:' + tm.id]) p.perms['team:' + tm.id] = 'Can edit';
  });
  render();
  toast(t('toast.teamLinked', { name: tm.name }));
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.cannotChangeAccess'), { kind: 'err' });
  }
};
A.shareTeamRemove = async el => {
  const p = proj(el.dataset.id);
  const tm = teamsList().find(x => x.id === el.dataset.tid);
  if (!p || !tm) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  const snap = snapshot();
  mutate(() => {
    p.teams = (Array.isArray(p.teams) ? p.teams : []).filter(x => x !== tm.id);
    /* [53-03] The unlink sweeps the team's perm key client-side, mirroring
       53-01's normalizeProjects sweep on the stored doc. */
    if (p.perms && typeof p.perms === 'object') delete p.perms['team:' + tm.id];
  });
  render();
  toast(t('toast.teamUnlinked', { name: tm.name }));
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.cannotChangeAccess'), { kind: 'err' });
  }
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
    toast(t('toast.permChanged', { name: mem(mid).name, perm: permLabel(el.value) }), { ms: 1800 });
  }
};
IN.shareAccess = async el => {
  const p = proj(el.dataset.id);
  if (!p) return;
  if (!canManageProject(p)) return;
  /* [2026-11-08 D-51-1/2/3] Two-state toggle replacing the shareAccess select:
     the checkbox IS the private flag. Optimistic flip with revert — no
     wait-for-ack spinner (D-51-3): the UI flips instantly, pushNow() settles
     the doc-sync PUT, and a server refusal (409/401/403) restores the
     pre-flip doc with a localized error toast. The self-grant on privatize
     stays (matches server.js mergeClientDoc self-grant). */
  const priv = el.checked;
  const snap = snapshot();
  mutate(() => {
    p.private = priv;
    if (priv && D().me && !p.members.includes(D().me)) p.members.push(D().me);
  });
  toast(priv ? t('toast.privateProject') : t('toast.publicProject', { name: D().ws.name }));
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    /* [53-03 T-53-08] A revision conflict is surfaced honestly: the write was
       refused, so the optimistic toast is followed by the conflict message —
       never a bare success story. */
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.cannotChangeAccess'), { kind: 'err' });
  }
};
/* [53-03 D-02/T-53-08/T-53-09] The per-team perm dropdown (Access tab): the
   client gate mirrors the server's canManageProject (53-01 projectPermFor) —
   a denied write never even opens the optimistic path. The write mutates the
   LIVE store project (never a modal-open snapshot), pushes immediately, and
   on refusal restores the snapshot and surfaces the refusal — a revision
   conflict shows the dedicated conflict message, not a success story. */
IN.teamPerm = async el => {
  const p = proj(el.dataset.id);
  const tid = el.dataset.tid;
  if (!p || !tid) return;
  if (!canManageProject(p)) return toast(t('err.cannotChangeAccess'), { kind: 'err' });
  if (!PERMS.includes(el.value)) return;
  const snap = snapshot();
  mutate(() => {
    p.perms = p.perms || {};
    p.perms['team:' + tid] = el.value;
  });
  toast(t('toast.permChanged', { name: teamsList().find(x => x.id === tid)?.name || tid, perm: permLabel(el.value) }), { ms: 1800 });
  const res = await pushNow();
  if (!res.ok) {
    restore(snap);
    toast(res.status === 409 ? t('modal.settingsConflict') : t('err.cannotChangeAccess'), { kind: 'err' });
  }
};
A.invite = () => {
  S.ui.inviteDraft = '';
  S.ui.inviteTeams = [];
  /* SCOPE-05 (29-04): the invite form's scope section state — role drives the
     D-04 gate and the D-13 guest path. */
  S.ui.inviteRole = ROLE_MEMBER_UI;
  S.ui.inviteScope = { teams: [], projects: [] };
  S.ui.inviteLinks = null;
  S.ui.errors = {};
  S.ui.pop = null;
  openModal({ type: 'invite' });
};
const API_ROLE = { Owner: 'owner', Admin: 'admin', Member: 'member', Guest: 'viewer' };
/* The invite form's role options and their named UI keys (29-04): the display
   labels double as the stored picker state; API_ROLE bridges them to the API
   roles. [2026-11-11 owner request] Owner IS invitable now — owner-tier
   inviter only, enforced server-side (INV-01 revised; HARD-02 still forbids
   a link-only owner invite). */
/* [2026-11-09 fix] The destructure order used to be (MEMBER, ADMIN, GUEST),
   binding ROLE_MEMBER_UI='Admin' and ROLE_ADMIN_UI='Member' — every invite
   defaulted to the Admin role and member invites sent scope:null, so the
   scope chips never reached the POST body. Keys order is Admin/Member/Guest. */
const [ROLE_ADMIN_UI, ROLE_MEMBER_UI, ROLE_GUEST_UI] = Object.keys(API_ROLE).filter(r => r !== 'Owner');

function addInvitedMember(invites, role, teams) {
  invites.forEach(inv => {
    if (!inv.email) return;
    const email = inv.email.toLowerCase();
    const existing = D().members.find(m => (m.email || '').toLowerCase() === email);
    if (existing) {
      existing.status = 'invited';
      existing.role = role;
      existing.teams = teams?.length ? [...new Set(teams)] : memberTeams(existing);
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
      teams: [...(teams || [])],
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
  const role = S.ui.inviteRole || $('#inv-role')?.value || ROLE_MEMBER_UI;
  const teams = [...new Set(S.ui.inviteTeams || [])];
  /* SCOPE-05/D-04 (29-04), narrowed [2026-11-11 owner request]: the scope
     rides ONLY a Guest invite (viewer + exactly one project, D-13 — the
     picker replaced the teams field); Member/Admin/Owner invites are
     workspace-wide, no scope at all (D-01 degrade). */
  const scope =
    role === ROLE_GUEST_UI
      ? (() => {
          const st = S.ui.inviteScope || { projects: [] };
          return st.projects.length ? { teams: [], projects: [...new Set(st.projects)] } : null;
        })()
      : null;
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
  /* D-13 guest invariant, client enforcement point: a Guest invite carries
     exactly one project — the button is already disabled, this guards the
     Enter-key submit path. */
  if (role === ROLE_GUEST_UI && !(S.ui.inviteScope?.projects || []).length) {
    S.ui.errors.invite = tErr('err.inviteGuestProjectRequired');
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
            teams,
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
    const res = await api.createInvites(list, API_ROLE[role] || 'member', teams, scope);
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
/* SET-04 (D-12): ONE chip-toggle contract for both Edit-Teams surfaces —
   the invite form's chips carry data-surface="invite" (on the form) and
   toggle S.ui.inviteTeams (same state submitInvite reads); the member-edit
   modal keeps the S.ui.memberTeams draft behavior byte-for-byte. The retired
   A.invTeamToggle folded into this handler — one component, one behavior. */
A.mteamToggle = el => {
  if (el.closest('[data-surface="invite"]')) {
    const cur = S.ui.inviteTeams || [];
    const id = el.dataset.v;
    S.ui.inviteTeams = cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id];
  } else {
    const st = S.ui.memberTeams;
    if (!st) return;
    const id = el.dataset.v;
    st.teams = st.teams.includes(id) ? st.teams.filter(x => x !== id) : [...st.teams, id];
  }
  render();
};
/* SCOPE-05/06 invite scope pickers retired 2026-11-11 (access limits left the
   invite form — invites are workspace-wide; submitInvite degrades an absent
   scope to null = workspace-wide, D-01). */
/* [2026-11-09 INVT-01] Silent-state draft binding (NO render() — a full
   re-render here re-creates the wipe bug the binding exists to fix; Pitfall 4).
   The textarea renders esc(S.ui.inviteDraft), so background polls and chip
   toggles restore the typed emails from state. */
IN.inviteDraft = el => {
  S.ui.inviteDraft = el.value;
};
/* The role select re-renders the form. */
IN.invRole = el => {
  S.ui.inviteRole = el.value;
  render();
};
/* [2026-11-11] The Guest role's single-project picker (D-13): selecting a
   project REPLACES the pick — exactly one, never more. */
A.invGuestProject = el => {
  const st = S.ui.inviteScope || (S.ui.inviteScope = { teams: [], projects: [] });
  st.projects = [el.dataset.v];
  render();
};
A.copyInviteLink = async () => {
  if (!api.enabled) return copy(`${api.url}/join/${D().ws.url}-7f3k2`, t('toast.inviteLinkCopied'));
  const role = S.ui.inviteRole || API_ROLE[$('#inv-role')?.value] || 'member';
  const teams = [...new Set(S.ui.inviteTeams || [])];
  /* SCOPE-05 (29-04): the copied link honours the form's configured scope.
     The picker state is a UI label ('Member' | 'Admin' | 'Guest'), so the
     admin check must compare against ROLE_ADMIN_UI — the raw 'admin' check
     never matched and let a stale scope ride an admin link (WR-03). */
  const st = S.ui.inviteScope || { teams: [], projects: [] };
  const scopeTeams = [...new Set(st.teams || [])];
  const scopeProjects = [...new Set(st.projects || [])];
  const scope = role === ROLE_ADMIN_UI ? null : scopeTeams.length || scopeProjects.length ? { teams: scopeTeams, projects: scopeProjects } : null;
  const res = await api.createInvites([], role, teams, scope);
  if (!res.ok) return toast(res.error || t('err.inviteLink'), { kind: 'err' });
  await copy(res.data.invites[0].url, t('toast.inviteLinkCopied'));
};
A.resendInvite = async el => {
  const m = mem(el.dataset.id);
  S.ui.pop = null;
  render();
  if (!api.enabled) return toast(t('toast.inviteResent', { email: m.email }));
  if (!m) return;
  const res = await api.createInvites([m.email], API_ROLE[m.role] || 'member', memberTeams(m));
  if (!res.ok) return toast(res.error || t('err.newInvite'), { kind: 'err' });
  const invite = res.data.invites?.[0];
  if (invite?.sent) return toast(t('toast.invitationSentTo', { email: m.email }));
  await copy(invite?.url || '', api.mailEnabled ? t('toast.emailFailedLinkCopied') : t('toast.newInviteLinkCopied'));
};
A.viewProfile = el => go('member', { id: el.dataset.id });
/* D-06: the person-centric mirror of the teams modal — the member context
   menu opens a multi-select team picker over the same authority set. */
A.editMemberTeams = el => {
  const m = mem(el.dataset.id);
  if (!m) return;
  /* SCOPE-01 (29-04): the scope editor's start state. D-05 keeps the member
     payload silent about scope, so the pickers start empty and UNTOUCHED — a
     submit without touching them never writes scope (no blind clear of an
     invite-carried scope). Values the acting admin set in this session are
     reflected on reopen from S.ui.memberScopes. */
  S.ui.memberTeams = {
    id: m.id,
    name: m.name,
    teams: [...memberTeams(m)],
    scope: structuredClone(S.ui.memberScopes?.[m.userId] || { teams: [], projects: [] }),
    scopeTouched: false,
  };
  S.ui.pop = null;
  openModal({ type: 'memberTeams' });
};
A.mteamToggle = el => {
  const st = S.ui.memberTeams;
  if (!st) return;
  const id = el.dataset.v;
  st.teams = st.teams.includes(id) ? st.teams.filter(x => x !== id) : [...st.teams, id];
  render();
};
/* ---------- 84-02 BP-01 team picker ---------- */
/* The picker's open/toggle/add/apply/close group — a clone of the 55-04
   assignee trio (draft-in-S.ui survives background re-renders, ONE array
   write on confirm). The STORED state shapes are UNCHANGED: S.ui.inviteTeams
   stays a plain array of team ids (submitInvite / copyInviteLink still read
   [...new Set(S.ui.inviteTeams || [])]) and S.ui.memberTeams.teams stays the
   member-edit draft (scope / scopeTouched untouched). S.ui.inviteDraft — the
   typed-emails silent binding above (Pitfall 1) — is never touched here. */
A.teamPickOpen = el => {
  const surface = el.dataset.surface || 'invite';
  const cur = surface === 'invite' ? S.ui.inviteTeams || [] : S.ui.memberTeams?.teams || [];
  S.ui.teamPick = { surface, draft: [...cur], q: '', hl: 0 };
  /* 84-02 chunk story: the picker's bytes ride features/team-pick.js —
     loaded before the modal opens (the S.ui.tpMod cache is the modalHtml
     case's renderer); a repeat open skips the import. */
  if (S.ui.tpMod) openModal({ type: 'teamPick' });
  else
    import('../features/team-pick.js').then(m => {
      S.ui.tpMod = m;
      openModal({ type: 'teamPick' });
    });
};
/* Chip removal (and the picker's draft chips): remove-only — the option
   buttons add, chips remove (D-03's Backspace rides keyboard.js). */
A.teamPickToggle = el => {
  const st = S.ui.teamPick;
  if (!st) return;
  st.draft = st.draft.filter(x => x !== el.dataset.v);
  render();
  $('#tp-q')?.focus();
};
/* D-03: Enter (and the option click) selects and keeps the input open —
   the chip accumulates, the query clears for the next search. */
A.teamPickAdd = el => {
  const st = S.ui.teamPick;
  if (!st) return;
  const id = el.dataset.v;
  if (!st.draft.includes(id)) st.draft = [...st.draft, id];
  st.q = '';
  st.hl = 0;
  render();
  $('#tp-q')?.focus();
};
IN.teamPickQ = el => {
  if (!S.ui.teamPick) return;
  S.ui.teamPick.q = el.value;
  S.ui.teamPick.hl = 0;
  render();
};
/* Cancel — the draft is discarded, the stored arrays are untouched. */
A.teamPickClose = () => {
  S.ui.teamPick = null;
  closeModal();
};
/* Confirm applies the whole draft as ONE array write to the surface's
   stored array; scope / scopeTouched are never touched. */
A.teamPickApply = () => {
  const st = S.ui.teamPick;
  if (!st) return;
  const draft = [...st.draft];
  if (st.surface === 'invite') S.ui.inviteTeams = draft;
  else if (S.ui.memberTeams) S.ui.memberTeams.teams = draft;
  S.ui.teamPick = null;
  closeModal();
};
/* SCOPE-01 member-modal scope pickers retired 2026-11-11 (scope editor left
   the member-edit modal — teams only); invite-form scope toggles are separate
   actions (invProjToggle / invScopeTeamToggle). */
A.submitMemberTeams = async () => {
  const st = S.ui.memberTeams;
  const m = mem(st?.id);
  if (!m) {
    S.ui.memberTeams = null;
    S.ui.modals.pop();
    return;
  }
  S.ui.memberTeams = null;
  S.ui.modals.pop();
  const previous = memberTeams(m);
  const next = [...new Set(st.teams)];
  /* [2026-11-09 IN-03] Key-order-stable compare — memberTeams order IS data
     (see the helper), but the guard must not depend on object key order. */
  const teamsChanged = !jsonEqual(previous, next);
  if (teamsChanged) {
    mutate(() => {
      m.teams = next;
    });
  }
  if (!api.enabled) {
    render();
    if (teamsChanged) toast(t('toast.teamSaved', { name: m.name }));
    return;
  }
  if (teamsChanged) {
    /* Hybrid revision contract (Plan 01): setMemberTeams returns no revision —
       never adopt one — while a role PATCH on the same modal would. */
    const res = await api.setMemberTeams(m.userId, next);
    if (!res.ok) {
      m.teams = previous;
      render();
      toast(res.error || t('err.changeTeam'), { kind: 'err' });
      return;
    }
  }
  /* SCOPE-05 (29-04): a touched scope editor PUTs /members/:uid/scope (D-12).
     An all-empty touched state is an explicit clear back to workspace-wide
     (D-01); an untouched editor never writes. */
  if (st.scopeTouched) {
    const scopeTeams = [...new Set(st.scope?.teams || [])];
    const scopeProjects = [...new Set(st.scope?.projects || [])];
    const scope = scopeTeams.length || scopeProjects.length ? { teams: scopeTeams, projects: scopeProjects } : null;
    const res = await api.setMemberScope(m.userId, scope);
    if (!res.ok) {
      render();
      toast(res.error || t('err.changeScope'), { kind: 'err' });
      return;
    }
    S.ui.memberScopes = S.ui.memberScopes || {};
    S.ui.memberScopes[m.userId] = scope;
  }
  render();
  toast(t('toast.teamSaved', { name: m.name }));
};
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
      teams: row.teams || existing?.teams || [],
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

/* MCP-01: the API keys card's ground truth — re-reads /api/keys on mount and
   after every create/revoke; never a client-side copy. A non-ok fetch leaves
   the card empty rather than stale. */
export async function refreshApiKeys() {
  if (!api.enabled) return null;
  const res = await api.apiKeys();
  if (!res.ok) return null;
  S.ui.apiKeys = res.data.keys || [];
  S.ui.apiKeyDays = res.data.days || [];
  render();
  return res.data;
}

/* ---------- Phase 59 (PUSH-01, D-01..D-07): the Settings Push tab ----------
   Server ground truth loaded on mount (the A.go hook above, the sessions
   pattern) and re-read after every state change. The enable/disable/test
   actions themselves ride the LAZY push chunk (DELIV-02) — this file only
   wires state, toasts and render. D-01: the only requestPermission call
   lives inside push.js enablePush, reached exclusively from the pushEnable
   click; nothing here prompts on load. */
export async function refreshPushState() {
  if (!api.enabled) return null;
  const m = await import('../core/push.js');
  const st = await m.readPushState();
  S.ui.pushConfig = st.config;
  S.ui.pushDevices = st.devices;
  S.ui.pushLocalEndpoint = st.localEndpoint;
  render();
  return st;
}
/* D-04: Enable opens the client-chosen naming step (prefilled suggestion) —
   the actual subscribe fires from pushEnableConfirm's own user gesture. */
A.pushEnable = async () => {
  const m = await import('../core/push.js');
  S.ui.pushNaming = m.defaultPushLabel();
  render();
};
A.pushEnableCancel = () => {
  S.ui.pushNaming = null;
  render();
};
A.pushEnableConfirm = async () => {
  const label = $('#push-name')?.value?.trim() || '';
  S.ui.pushNaming = null;
  const m = await import('../core/push.js');
  const r = await m.enablePush(label);
  if (r.ok) toast(t('toast.pushEnabled'), { ms: 2000 });
  else if (r.code === 'unavailable') toast(t('err.pushUnavailable'), { kind: 'err', ms: 6000 });
  else if (r.code === 'denied') m.blockedToastOnce(); // the one-time explanatory toast (D-48-4)
  else if (r.code === 'dismissed') { /* user closed the prompt — no nag, the toggle stays OFF */ }
  /* 59-UAT fix: subscribe/error were silent — a failed subscription (bad key,
     SW reject, save POST failure) gave zero feedback and looked like a dead button. */
  else toast(t('err.pushSubscribeFailed'), { kind: 'err', ms: 6000 });
  await refreshPushState();
  return r;
};
A.pushDisable = async () => {
  const m = await import('../core/push.js');
  await m.disablePush();
  toast(t('toast.pushDisabled'), { ms: 2000 });
  await refreshPushState();
};
A.pushTest = async el => {
  const m = await import('../core/push.js');
  const r = await m.sendTestPush(el.dataset.id);
  if (r.ok) toast(t('toast.pushTestSent'), { ms: 2000 });
  else toast(t('toast.pushTestFailed'), { kind: 'err', ms: 6000 });
};
A.pushUnsub = async el => {
  const m = await import('../core/push.js');
  await m.unsubscribeDevice(el.dataset.id);
  toast(t('toast.pushDisabled'), { ms: 2000 });
  await refreshPushState();
};


/* A.apiKeyCreate — the staged create form's submit (data-submit + button). */
A.apiKeyCreate = () => {
  const label = $('#ak-label')?.value?.trim();
  const workspaceId = $('#ak-ws')?.value;
  const scope = $('#ak-scope')?.value || 'read';
  const days = Number($('#ak-days')?.value || 0);
  if (!label || !workspaceId || !days) {
    render();
    return;
  }
  loadingBtn('ak-save', 0, async () => {
    const res = await api.createApiKey({ label, workspaceId, scope, days });
    if (!res.ok) {
      toast(tErr(res));
      render();
      return;
    }
    /* The raw key rides THIS response only — stage it for the one-shot
       display, then it lives nowhere (the server stores only the hash). */
    S.ui.apiKeyStage = 'created';
    S.ui.newKey = res.data.key;
    await refreshApiKeys();
  });
};
A.apiKeyAskCreate = () => {
  S.ui.apiKeyStage = 'create';
  S.ui.newKey = null;
  render();
};
A.apiKeyDone = () => {
  S.ui.apiKeyStage = null;
  S.ui.newKey = null;
  render();
};
A.apiKeyCancel = () => {
  S.ui.apiKeyStage = null;
  S.ui.newKey = null;
  S.ui.apiKeyPurge = null;
  render();
};
A.apiKeyRevokeAsk = el => {
  S.ui.apiKeyRevoke = el.dataset.id;
  render();
};
A.apiKeyRevokeConfirm = el => {
  const id = el.dataset.id;
  S.ui.apiKeyRevoke = null;
  api.revokeApiKey(id).then(async res => {
    if (!res.ok) toast(tErr(res));
    await refreshApiKeys();
  });
};
/* Phase 95 (SET-03, D-09/D-10): the revoked-key purge — the same 2-click
   ask→confirm idiom as revoke, then the toast names the removed count. */
A.apiKeyPurgeAsk = () => {
  S.ui.apiKeyPurge = true;
  render();
};
A.apiKeyPurgeConfirm = () => {
  S.ui.apiKeyPurge = null;
  api.purgeRevokedKeys().then(async res => {
    if (!res.ok) toast(tErr(res));
    else toast(t('settings.apikeys.purgedToast', { n: res.data.removed }));
    await refreshApiKeys();
  });
};

/* The settings 2FA card's ground truth (T-16-13): re-reads the signed-in user
   (api.user.twoFa) from /api/auth/me — the on-state never renders from a
   client flag. Called on mount of the security tabs and after every tfa state
   change (enroll enable/disable). */
export async function refreshTfa() {
  if (!api.enabled) return null;
  await api.me();
  /* TOTP2 (Phase 31): the factor list rides the same ground-truth refresh —
     server data only, never a client flag; a failed fetch renders no rows
     rather than a stale client-side copy. */
  const factors = await api.tfaFactors();
  S.ui.tfaFactors = factors.ok ? factors.data.factors || [] : [];
  render();
  return api.user;
}

/* The Operators section's ground truth (OPREV-02/D-121; relocated to the
   governance page by 79-03 D-01): the users list is fetched from the server
   on the governance page mount and after every promote/demote/revoke — never
   from the document. A non-operator fetch simply 403s; the section renders
   only from the api.user.isInstanceAdmin server flag, so the fetch is gated
   on it too. */
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

/* 79-03 (WSG-09/D-01): the promote/demote/revoke actions live in the
   governance path only — the governance page is the single operator-management
   surface. 78-02 operator identity actions (WSG-06/D-78-2): promote is free,
   demote is D-90 inline-confirm (S.ui.operatorDemote carries the target id).
   Refusals flow through the same tErr pipeline as the revoke — lastOperator
   (the server's 409 count guard) and operatorOnly render localized toasts. */
A.operatorPromote = async el => {
  const id = el.dataset.id;
  const res = await api.operatorPromote(id);
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    const c = res.data?.code;
    return toast(tErr(c, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshOperatorUsers(); // re-fetch so the list reflects the new flag
  toast(t('settings.operator.toastPromoted'));
};
A.operatorDemoteAsk = el => {
  S.ui.operatorDemote = el.dataset.id; // D-90: the inline confirmation stage carries the target id
  render();
};
A.operatorDemoteCancel = () => {
  S.ui.operatorDemote = null;
  render();
};
A.operatorDemote = async el => {
  const id = el.dataset.id;
  const res = await api.operatorDemote(id);
  S.ui.operatorDemote = null;
  if (!res.ok) {
    if (res.status === 401) return;
    const c = res.data?.code; // lastOperator / operatorOnly / notFound — keyed
    return toast(tErr(c, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshOperatorUsers();
  toast(t('settings.operator.toastDemoted'));
};

/* AUD-03: the audit trail card's ground truth (D-T3, D-V1): the rows come from
   GET /api/audit-log — never synthesized client-side. The server decides the
   tier: instance operators get all rows, workspace admins get their own
   workspaces' rows (server.js tier scoping), and a plain member's 403 leaves
   the state null — the honest absence the card's null-guard renders (D-V1).
   A non-401 failure leaves the state null; the 401 teardown belongs to the
   central intercept (D-28). The fetch is unconditional because only the server
   knows the caller's full admin/owner membership set (a client-side role gate
   could never replicate it). */
const auditVerb = () => S.ui.auditVerb || '';
async function fetchAuditPage(params) {
  const res = await api.auditLog(params);
  if (!res.ok) {
    if (res.status !== 401) S.ui.auditTrail = null; // D-28: 401 defers to the intercept
    return null;
  }
  S.ui.auditTrail = { rows: res.data.rows || [], nextBefore: res.data.nextBefore || null };
  render();
  return S.ui.auditTrail;
}
export async function refreshAuditLog() {
  if (!api.enabled) return null;
  S.ui.auditTrail = null;
  return fetchAuditPage(auditVerb() ? { verb: auditVerb() } : {});
}
A.auditVerbFilter = async el => {
  S.ui.auditVerb = el.dataset.v || '';
  await refreshAuditLog(); // D-V2: a chip click resets state and re-fetches page 1
};
A.auditLoadMore = async () => {
  const trail = S.ui.auditTrail;
  if (!trail?.nextBefore) return; // D-V3: the button only exists when a cursor exists
  const params = { before: trail.nextBefore.created_at, beforeId: trail.nextBefore.id };
  if (auditVerb()) params.verb = auditVerb();
  const res = await api.auditLog(params);
  if (!res.ok) {
    if (res.status !== 401) return;
    return; // D-28
  }
  trail.rows = [...trail.rows, ...(res.data.rows || [])]; // APPEND — never replace
  trail.nextBefore = res.data.nextBefore || null;
  render();
};

/* AUD-02: the workspace-admin revoke stage on the members surface — the same
   D-90 two-stage inline confirm as the operator card, staged by member id. */
A.memberRevokeAsk = el => {
  S.ui.memberRevoke = el.dataset.id;
  render();
};
A.memberRevokeCancel = () => {
  S.ui.memberRevoke = null;
  render();
};
/* Phase 52 (TRN-01, D-52-1..D-52-4): the admin/owner transparency expander on
   the members surface. Toggle by member id; EVERY open refetches the
   visibility endpoint (D-52-3 — no caching between opens), so the panel is
   always the server's current answer, never a client-side derivation from the
   redacted doc (success criterion 1 anti-pattern). The client gate on the
   button is UX only — the server's 'admin' gate (D-52-4) is the control. */
A.memberVisibilityToggle = async el => {
  const id = el.dataset.id;
  if (S.ui.memberVisibility === id) {
    S.ui.memberVisibility = null;
    S.ui.memberVisibilityData = null;
    render();
    return;
  }
  S.ui.memberVisibility = id;
  S.ui.memberVisibilityData = null; // open shows a loading state until the fetch lands
  render();
  const m = mem(id);
  if (!m?.userId) {
    /* The roster can change between render and click (e.g. a mid-session
       membership removal) — never leave the panel stuck in the loading state. */
    S.ui.memberVisibility = null;
    S.ui.memberVisibilityData = { err: true };
    render();
    return;
  }
  const res = await api.memberVisibility(m.userId);
  if (!res.ok) {
    /* D-28: the central intercept owns mid-session 401s. */
    if (res.status === 401) return;
    /* Same stale-guard as the success path: a slow failing request must not
       overwrite a panel that was closed or re-targeted while it was in flight. */
    if (S.ui.memberVisibility !== id) return;
    S.ui.memberVisibilityData = { err: true };
    render();
    return toast(tErr(res.data?.code, res.data, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  /* The expansion may have been closed (or re-targeted) while the request was
     in flight — only the still-open member's result is adopted. */
  if (S.ui.memberVisibility !== id) return;
  S.ui.memberVisibilityData = { projects: res.data?.projects || [] };
  render();
};

A.memberRevokeConfirm = async el => {
  const id = el.dataset.id;
  const m = mem(id);
  S.ui.memberRevoke = null;
  if (!m?.userId) {
    render();
    return toast(t('err.noAccountYet', { name: m?.name || '' }), { kind: 'err' });
  }
  const res = await api.revokeMemberSessions(m.userId);
  if (!res.ok) {
    /* D-28: the central intercept owns every mid-session revocation 401. */
    if (res.status === 401) return;
    return toast(tErr(res.data?.code, res.data, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshMembers();
  toast(t('members.toastRevoked', { name: m.name }));
};

A.resendPendingInvite = async el => {
  const row = (S.ui.pendingInvites || []).find(i => i.id === el.dataset.id);
  if (!row?.email) return;
  const res = await api.createInvites([row.email], row.role, row.teams || [], row.scope || null);
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
  const n = allTasks().filter(t => t.assignees?.includes(m.id) && t.status !== 'done').length;
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
            t.assignees = (t.assignees || []).filter(id => id !== m.id);
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
/* [61-02 D-11] Burst group expand/collapse — dedicated Set in S.ui (transient,
   inboxCat/inboxSel precedent); not routed through the generic `set` handler. */
A.toggleBurst = el => {
  const gk = el.dataset.gk;
  if (!S.ui.inboxBurstOpen) S.ui.inboxBurstOpen = new Set();
  if (S.ui.inboxBurstOpen.has(gk)) S.ui.inboxBurstOpen.delete(gk);
  else S.ui.inboxBurstOpen.add(gk);
  render();
};
/* Group mark-read: fans toggleRead semantics to every unread member of the
   group key (D-11 same task + type), via the pure helper the unit test pins. */
A.burstRead = el => {
  const ids = burstUnreadIds(D().notifs, el.dataset.gk);
  if (!ids.length) return;
  const set = new Set(ids);
  D().notifs.forEach(x => {
    if (set.has(x.id)) x.read = true;
  });
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
  palServerSearch(el.value); // Phase 58 D-01/D-02: debounced, abortable server merge
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
/* Phase 58 (D-05): one abortable server search per /search query. The page render
   calls this with the current query on every pass (all entry paths covered —
   keystroke, palette "view all", deep link); the q guard makes it one fetch per
   query, a newer query aborts the prior request, and searchTasksServer silently
   degrades so nothing ever surfaces an error. Results land in S.ui.searchServer
   and re-render. */
let searchPageCtrl = null;
let searchPageQ = '';
A.searchPageServer = q => {
  if (!api.enabled || !q) return;
  if (searchPageQ === q) return;
  searchPageCtrl?.abort();
  searchPageCtrl = new AbortController();
  const mine = searchPageCtrl;
  searchPageQ = q;
  searchTasksServer(q, mine.signal)
    .then(res => {
      if (searchPageQ !== q) return; // stale — discard
      S.ui.searchServer = { q, tasks: res.tasks || [] };
      render();
    })
    .catch(() => {});
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
  stopAwaitPoll(); // WSG-10: the await probe must never outlive the session
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
    run: async () => {
      await ensureSeedData();
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
  /* Seed-lazy runs are async; confirmDlg ignores the returned promise, so a
     rejected run surfaces as an error toast instead of silently vanishing. */
  Promise.resolve(m.run && m.run()).catch(e => {
    console.error(e);
    toast(e?.message || t('toast.errGeneric'), { kind: 'err' });
  });
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
/* D-07: the settings toggle persists through exactly one branch. The optimistic
   write lands on the per-user prefs object in store state — never the document
   (D-01). Local mode stores per-workspace localStorage (D-08); API mode PUTs
   the row and adopts the canonical merged prefs the server returns. 401 rides
   the session-expired path (the langSel shape); any other failure is an error
   toast and the toggle stays where the user left it for the session. */
/* D-48-3/D-48-4: the toggle is the user gesture that may legitimately prompt for
   notification permission — PREPENDED pre-step, nothing below changes. Only a
   toggle-ON of a push_* key while permission is 'default' requests; 'denied'
   fires the one-time explanatory toast from push.js; every outcome (granted,
   denied, prompt declined) falls through to the UNCHANGED persistence body —
   the pref always saves (D-48-4). */
IN.npToggle = async el => {
  if (
    el.checked &&
    typeof el.dataset.k === 'string' &&
    el.dataset.k.startsWith('push_') &&
    typeof window.Notification !== 'undefined' &&
    window.Notification.permission === 'default'
  ) {
    const p = await window.Notification.requestPermission();
    if (p === 'denied') import('../core/push.js').then(m => m.blockedToastOnce());
  }
  S.notifPrefs[el.dataset.k] = el.checked;
  const wsId = api.enabled ? api.workspace?.id : D().ws.url;
  render();
  if (!api.enabled) {
    setLocalNotifPrefs(wsId, S.notifPrefs);
    return toast(t('toast.notifPrefsSaved'), { ms: 1500 });
  }
  const r = await api.putNotifPrefs(wsId, S.notifPrefs);
  if (r.ok) {
    S.notifPrefs = r.data.prefs || S.notifPrefs;
    return toast(t('toast.notifPrefsSaved'), { ms: 1500 });
  }
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401, error: r.error } }));
    return;
  }
  toast(t('err.notifPrefsSaveFailed'), { kind: 'err', ms: 6000 });
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
/* =====================================================================
   TZ PICKER (Phase 44, D-01/D-04/D-09) — one handler serving both dispatch
   namespaces (the 43-03 alias precedent: one code path, two entry points).
   - Typing: the combobox input (the tzSel data-in hook) updates the filter
     query and re-renders; it never saves (D-04 — nothing auto-saves on render).
   - Selection: an option (the tzSel data-a hook, aliased below) writes the
     CURRENT
     member's tz on S.data.members — NEVER S.prefs (blob prefs.tz is the
     disconnected store this phase replaces, D-09) — then persists through
     the real doc save(). The PUT lands in docFromClient's self-tz-only
     carve-out (Plan 44-02), which re-validates through resolveTz (D-10);
     client-side checks are advisory only (T-44-06).
   ===================================================================== */
IN.tzSel = el => {
  if (el.dataset.v) {
    /* 87-04 (D-03): when the Backup task form is staged, the combobox on
       screen is the FORM's (routes are exclusive — one tz picker rendered at
       a time), so a selection stages into form.tz instead of the member
       profile. The picker itself is the reused Phase 34 component. */
    if (S.ui.backupTaskForm) {
      S.ui.backupTaskForm.tz = el.dataset.v;
      S.ui.backupTaskForm.tzDirty = true;
      S.ui.tzPick = { q: '', hl: 0, v: el.dataset.v, open: false };
      render();
      return;
    }
    const m = me();
    if (!m || !S.data.members.some(x => x.id === m.id)) return;
    m.tz = el.dataset.v;
    /* Selection closes the picker (UAT follow-up): the list unmounts, the
       input mirrors the chosen zone, and the page below never shifts. */
    S.ui.tzPick = { q: '', hl: 0, v: el.dataset.v, open: false };
    save();
    render();
    toast(t('toast.prefSaved'), { ms: 1500 });
    return;
  }
  const pk = S.ui.tzPick || (S.ui.tzPick = { q: '', hl: 0, open: false });
  pk.q = el.value;
  pk.hl = 0;
  pk.open = true; // typing opens the option list
  render();
};
A.tzSel = IN.tzSel;
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
    run: async () => {
      await ensureSeedData();
      S.views = {};
      save();
      S.ui.auth = 'login';
      render();
      toast(t('toast.wsDeletedDemo'), { kind: 'info', ms: 5000 });
    },
  });
};
A.avColor = el => {
  me()?.c && (me().c = el.dataset.v);
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
        /* Super-access: the operator has no member row in a foreign workspace —
           the profile write lands on S.prefs and the server; no local me() row. */
        if (me()) {
          me().name = n;
          me().title = tt;
        }
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
  /* TOTP2: the add-factor wizard's transient staging rides the same cancel —
     no staged secret or id outlives the stage. */
  S.ui.tfaSecret = null;
  S.ui.tfaOtpauth = null;
  S.ui.tfaStagedId = null;
  S.ui.tfaLabel = null;
  S.ui.tfaRemoveId = null;
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
/* TOTP2 (Phase 31, Plan 03) — the Add-factor wizard handlers (D-01/D-02/D-04,
   TOTP2-05). Each clones A.tfaBeginEnroll's validation-then-loadingBtn-then-api
   shape: errors cleared at stage entry, per-field error keys mapped from the
   server codes, 503 mapped to the localized masterKeyMissing copy — the
   response body never renders (D-58). */
A.tfaAddFactor = () => {
  S.ui.errors = {};
  S.ui.tfaStage = 'addName';
  render();
};
A.tfaAddFactorName = () => {
  const e = (S.ui.errors = {});
  const label = $('#tfa-add-name')?.value?.trim() || '';
  /* D-02: a factor is never stored unnamed — the client mirrors the server's
     labelRequired gate before anything else happens. */
  if (!label) e.tfaAddName = t('err.labelRequired');
  if (Object.keys(e).length) return render();
  S.ui.tfaLabel = label;
  S.ui.tfaStage = 'addPw';
  render();
};
A.tfaAddFactorPw = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-add-pw')?.value || '';
  const code = $('#tfa-add-pw-code')?.value?.trim() || '';
  if (!pw) e.tfaAddPw = t('err.enterCurrentPassword');
  if (!code) e.tfaAddPwCode = t('err.codeRequired');
  else if (!/^\d{6}$/.test(code)) e.tfaAddPwCode = t('err.codeRejected'); // D-85 client half: 6-digit only
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-add-pw-save', 0, async () => {
    const res = await api.tfaFactorEnroll({ currentPassword: pw, code, label: S.ui.tfaLabel });
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'wrongCurrentPassword' || c === 'passwordRequired') e.tfaAddPw = t('err.' + c);
      else if (c === 'codeRejected' || c === 'tooManyAttempts') e.tfaAddPwCode = t('err.' + c);
      else if (c === 'labelRequired' || c === 'labelTooLong') {
        // back to the naming step with the field error
        S.ui.tfaStage = 'addName';
        e.tfaAddName = t('err.' + c);
      } else if (c === 'tfaNotEnabled') {
        S.ui.tfaStage = null; // no factors left (removed elsewhere) — back to the off state
        e.tfaMsg = t('err.tfaNotEnabled');
      } else e.tfaAddPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58: the 503 body never renders
      return render();
    }
    S.ui.tfaSecret = res.data.secret;
    S.ui.tfaOtpauth = res.data.otpauth;
    S.ui.tfaStagedId = res.data.stagedId;
    S.ui.tfaStage = 'addVerify';
    render();
  });
};
A.tfaAddFactorVerify = () => {
  const e = (S.ui.errors = {});
  const code = $('#tfa-add-code')?.value?.trim() || '';
  if (!code) return render(); // empty submits nothing (TFA-02 empty edge)
  loadingBtn('tfa-add-verify-save', 0, async () => {
    const res = await api.tfaFactorEnable({ stagedId: S.ui.tfaStagedId, code });
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'noPendingEnrollment') {
        S.ui.tfaStage = null; // the staged setup expired — back to the factor list
        S.ui.tfaStagedId = null;
        S.ui.tfaSecret = null;
        S.ui.tfaOtpauth = null;
        e.tfaMsg = t('err.noPendingEnrollment');
      } else if (c === 'codeRejected' || c === 'tooManyAttempts') {
        e.tfaAddCode = t('err.' + c);
      } else {
        e.tfaAddCode = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58
      }
      return render();
    }
    S.ui.tfaStage = null; // stage cleared BEFORE the refresh (Pitfall 6)
    S.ui.tfaStagedId = null;
    S.ui.tfaSecret = null;
    S.ui.tfaOtpauth = null;
    S.ui.tfaLabel = null;
    /* D-53 (Plan 02 contract): factors/enable returns rotated recovery codes
       exactly once on the first-ever re-enable path — surface them through the
       same transient modal, never persisted (D-91). */
    if (res.data.recoveryCodes) S.ui.recoveryCodes = res.data.recoveryCodes;
    render();
    if (S.ui.recoveryCodes) openModal({ type: 'recovery' });
    await refreshTfa();
    toast(t('settings.tfa.factorAddedToast'));
  });
};
/* TOTP2 (D-19/D-16) — the per-factor remove handlers. The confirm form echoes
   the factor's name (settings.js looks it up from the server list); the error
   mapping clones tfaDisableConfirm's, with factorNotFound clearing the stage
   (the row is gone from server ground truth) and the D-15 survivor-verify
   refusal arriving as codeRejected. */
A.tfaAskRemove = el => {
  S.ui.errors = {};
  S.ui.tfaRemoveId = el.dataset.id;
  S.ui.tfaStage = 'remove';
  render();
};
A.tfaFactorRemove = () => {
  const e = (S.ui.errors = {});
  const pw = $('#tfa-rm-pw')?.value || '';
  const code = $('#tfa-rm-code')?.value?.trim() || '';
  const id = S.ui.tfaRemoveId;
  if (!pw) e.tfaRmPw = t('err.enterCurrentPassword');
  if (!code) e.tfaRmCode = t('err.codeRequired');
  if (Object.keys(e).length) return render();
  loadingBtn('tfa-rm-save', 0, async () => {
    const res = await api.tfaFactorRemove({ factorId: id, currentPassword: pw, code });
    if (!res.ok) {
      const c = res.data?.code;
      if (c === 'wrongCurrentPassword' || c === 'passwordRequired') e.tfaRmPw = t('err.' + c);
      else if (c === 'codeRejected' || c === 'tooManyAttempts') e.tfaRmCode = t('err.' + c);
      else if (c === 'factorNotFound') {
        S.ui.tfaStage = null; // the target no longer exists — re-list from the server
        S.ui.tfaRemoveId = null;
        e.tfaMsg = t('err.factorNotFound');
      } else e.tfaRmPw = res.status === 503 ? t('err.masterKeyMissing') : t('err.serverUnreachable'); // D-58: the 503 body never renders
      return render();
    }
    S.ui.tfaStage = null; // stage cleared BEFORE the refresh (Pitfall 6)
    S.ui.tfaRemoveId = null;
    render();
    await refreshTfa(); // server ground truth re-lists the factors (D-05)
    toast(t('settings.tfa.removedToast'));
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
/* G-34-4: API-mode hydration of the signed-in user's stored notif prefs at
   every workspace entry, so an unchecked pref survives F5 (S.notifPrefs
   previously only ever adopted the PUT response). Store-only (D-01); local
   mode keeps its synchronous localStorage hydration and issues no GET (D-08).
   401 rides the session-expired path; any other failure is silent and
   non-blocking — workspace entry never waits on or fails because of a pref
   read (T-34-12). */
export async function hydrateNotifPrefs() {
  const wsId = api.enabled ? api.workspace?.id : D().ws.url;
  if (!api.enabled) return;
  const r = await api.getNotifPrefs(wsId);
  if (r.ok) {
    S.notifPrefs = mergeNotifPrefs(S.notifPrefs, r.data?.prefs);
    return;
  }
  if (r.status === 401) {
    window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401, error: r.error } }));
  }
}

export async function openWorkspace(slug) {
  if (!slug) return { ok: false, status: 0, error: t('err.noWorkspace') };
  await flushPending();
  const res = await hydrateFromServer(slug);
  if (!res.ok) return res;
  await hydrateNotifPrefs(); // G-34-4: adopt the stored prefs before the first render
  await hydrateViews(); // Phase 57: adopt the live view rows before the first render
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
  } else startAwaitPoll(); // WSG-10: the await-access view polls for arriving access
  S.ui.errors = {};
  render();
}

/* =====================================================================
   WSG-10 await-access poll (78-02): a rights-less user parked on the
   await view is auto-entered as soon as the SERVER reports access —
   a membership appears, the user becomes an operator, or the gate flips
   open (T-78-06: entry is decided from server-verified /api/auth/me
   truth, never client-local state). House poll shape (pollNotifs,
   main.js): guards-first tick, 15 s interval, visible-tab only — the
   document.hidden guard is checked before ANY fetch (the A2 unit pin in
   test/creation-gate-client.test.mjs), and a visibilitychange listener
   re-ticks on return to the tab so a foregrounded wait doesn't sit out
   a full interval. The timer + listener are torn down on entry, on
   sign-out (A.signOut) and whenever the tick finds the view gone — no
   leaked probe after the session ends.
   ===================================================================== */
let awaitTimer = null;
let awaitVisibleHandler = null;
export function stopAwaitPoll() {
  if (awaitTimer) {
    clearInterval(awaitTimer);
    awaitTimer = null;
  }
  if (awaitVisibleHandler) {
    document.removeEventListener('visibilitychange', awaitVisibleHandler);
    awaitVisibleHandler = null;
  }
}
const awaitTick = async () => {
  if (document.hidden) return; // visible-tab only (WSG-10): skip the probe entirely
  if (!api.user || S.ui.auth !== 'no-workspace') return stopAwaitPoll();
  await api.me(); // refreshes workspaces + isInstanceAdmin from the server
  const slug = api.workspaces[0]?.slug;
  if (!slug && !api.canCreateWorkspace) return; // still rights-less: keep waiting
  stopAwaitPoll();
  if (slug) {
    /* Soft-enter (finishLogin happy path; research open Q1 resolved pick). */
    const res = await hydrateFromServer(slug);
    if (res.ok) {
      await hydrateNotifPrefs();
      await hydrateViews();
      history.replaceState(null, '', `/w/${slug}`);
      enterApp(t('toast.welcomeTo', { name: api.workspace?.name || slug }));
      return;
    }
  }
  /* Soft path cannot resolve (no membership yet for a freshly promoted
     operator, or hydration failed): an honest full reload re-runs boot
     routing, which lands onboarding for creators and the await view again
     otherwise — never a stranded surface. */
  location.reload();
};
export function startAwaitPoll() {
  if (awaitTimer) return;
  awaitTimer = setInterval(awaitTick, 15000);
  awaitVisibleHandler = () => {
    if (!document.hidden) awaitTick();
  };
  document.addEventListener('visibilitychange', awaitVisibleHandler);
  awaitTick(); // guard-first immediate probe: no blind 15 s wait on arrival
}

export function enterApp(msg) {
  S.ui.auth = null;
  S.ui.errors = {};
  go(S.prefs.home || 'home');
  toast(msg);
  /* CR-02 (59-REVIEW): a SPA password login never re-fires main.js's boot/load
     SW registration — register here too, or enablePush hangs on
     serviceWorker.ready until the next full page load. */
  import('../core/push.js').then(m => m.registerSw()).catch(() => {});
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
        await hydrateNotifPrefs(); // G-34-4: adopt the stored prefs before the first render
        await hydrateViews(); // Phase 57: adopt the live view rows before the first render
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
  await hydrateNotifPrefs(); // G-34-4: adopt the stored prefs before the first render
  await hydrateViews(); // Phase 57: adopt the live view rows before the first render
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
    await hydrateNotifPrefs(); // G-34-4: adopt the stored prefs before the first render
    await hydrateViews(); // Phase 57: adopt the live view rows before the first render
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
    await hydrateNotifPrefs(); // G-34-4: adopt the stored prefs before the first render
    await hydrateViews(); // Phase 57: adopt the live view rows before the first render
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
        teams: memberTeams(me()),
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
          teams: memberTeams(me()),
          title: t('member.titleMember'),
          c: '#6B7280',
          status: 'invited',
          last: null,
          tz: '—',
        }),
      );
  });
  if (api.enabled && emails.length) {
    const inv = await api.createInvites(emails, 'member', []);
    if (!inv.ok) toast(inv.error || t('err.sendInvites'), { kind: 'err' });
  }
  S.ui.auth = null;
  go('project', { id: p.id, tab: S.prefs.defaultTab });
  toast(t('toast.welcomeTo', { name: D().ws.name }));
};

/* =====================================================================
   79-02 GOVERNANCE (WSG-07/WSG-08 client half, D-02..D-06/D-08/D-11)
   The operator's instance-wide workspace surface. Render-only from the
   GET /api/auth/operator/workspaces payload (T-60-05 doctrine) — never
   from the client document. One fill loop with a monotonic sequence +
   in-flight abort (dashboard.js:27-46 pattern); NO auto-poll — this is
   a low-frequency surface. Client confirm gates are UX only; the server
   re-checks everything (D-11: the server 403/409 is the control).
   ===================================================================== */
let govFillSeq = 0;
let govInflight = null;
export async function refreshGovernanceWorkspaces() {
  if (!api.enabled || !api.user?.isInstanceAdmin) return null;
  const my = ++govFillSeq;
  govInflight?.abort();
  govInflight = new AbortController();
  const res = await api.operatorWorkspaces({ signal: govInflight.signal });
  if (my !== govFillSeq) return null;
  if (res.ok) {
    S.ui.govWs = res.data.workspaces || [];
    S.ui.govWsErr = null;
    /* 83-02 (D-09/D-10): the dead-mapping payload rides the same fill —
       advisory only, so a refusal simply hides the warning card, never an
       error state. Re-checked against the sequence after the await. */
    const dead = await api.operatorDeadMappings();
    if (my === govFillSeq) S.ui.govDead = dead.ok ? { orphans: dead.data.orphans || [], trail: dead.data.trail || [] } : null;
  } else {
    /* D-28: the central intercept owns the 401 teardown. Any other refusal
       surfaces through the page's honest fullstate — never a blank table. */
    if (res.status !== 401) S.ui.govWsErr = { status: res.status };
    return null;
  }
  render();
  return S.ui.govWs;
}
A.govRetry = () => {
  S.ui.govWsErr = null; // CR-01: recovery goes through the explicit retry action, never an auto re-kick
  render();
  refreshGovernanceWorkspaces();
};

/* =====================================================================
   85-02 BACKUP (D-20/D-24/D-26) — the gated top-level surface's ground
   truth. Render-only from the GET /api/backup/tasks payload and its
   capability flags (D-23: the client never derives roles). One fill
   loop with a monotonic sequence + in-flight abort (the governance
   pattern above); NO auto-poll — a low-frequency surface. A non-holder
   fetch 403s with the keyed backupRoleRequired refusal — the page
   surfaces it as the D-26 fullstate, never a blank page or redirect.
   ===================================================================== */
let backupFillSeq = 0;
let backupInflight = null;
export async function refreshBackupTasks() {
  if (!api.enabled) return null;
  const my = ++backupFillSeq;
  backupInflight?.abort();
  backupInflight = new AbortController();
  const res = await api.backupTasks({ signal: backupInflight.signal });
  if (my !== backupFillSeq) return null;
  if (res.ok) {
    S.ui.backupTasks = { tasks: res.data.tasks || [], canBackup: !!res.data.canBackup, canRestore: !!res.data.canRestore };
    S.ui.backupErr = null;
    await refreshBackupLastRuns(); // Phase 94 (D-01): the badge input rides every task refill
  } else {
    /* D-28: the central intercept owns the 401 teardown. Any other refusal
       surfaces through the page's honest fullstate — never a blank page. */
    if (res.status !== 401) S.ui.backupErr = { status: res.status };
    return null;
  }
  render();
  return S.ui.backupTasks;
}
/* Phase 94 (D-01): the last-run badge input — ONE fetch of the frozen
   Phase-92 ?all=1 route (limit 50, the server's default cap), latest run
   per task_id derived client-side (server sorts created_at DESC, id DESC,
   so the first occurrence per task_id is the newest). Staged in
   S.ui.backupLastRuns (never the DOM); a refusal stages null → the badge
   column renders honest dashes. */
export async function refreshBackupLastRuns() {
  if (!api.enabled) return;
  const res = await api.backupRuns({ all: 1, limit: 50 });
  if (!res.ok) {
    if (res.status !== 401) S.ui.backupLastRuns = null;
    return;
  }
  const runs = Array.isArray(res.data?.runs) ? res.data.runs : [];
  const latest = {};
  for (const r of runs) if (r?.task_id && !latest[r.task_id]) latest[r.task_id] = r;
  S.ui.backupLastRuns = latest;
  render();
}
A.backupRetry = () => {
  S.ui.backupErr = null; // CR-01: recovery goes through the explicit retry action, never an auto re-kick
  render();
  refreshBackupTasks();
};

/* XWS-01 (D-11): the Run-now workspace picker's input — ONE fetch of the
   phase-92 operator-gated /api/backup/scopes payload, kicked with the page's
   first load (same in-render kick idiom as refreshBackupTasks). Staged in
   S.ui.backupScopes; a refusal stages null → the picker falls back to the
   loaded workspace only, never memberships (pickers-only doctrine). The
   restore preview reuses the same state (UAT round-8); the guard makes this
   a once-per-session fill (undefined = never fetched, null = refused). */
export async function refreshBackupScopes() {
  if (!api.enabled) return;
  if (S.ui.backupScopes !== undefined) return;
  const res = await api.backupScopes();
  S.ui.backupScopes = res.ok && Array.isArray(res.data?.workspaces) ? res.data.workspaces : null;
  render();
}

/* =====================================================================
   86-02 BACKUP RUN (D-07/D-09/D-10/D-18) — the Run now card's client
   half. Render-only from the GET /api/backup/runs/current payload (85
   D-23): the stage is written verbatim into S.ui.backupRun, never
   derived client-side. The poll loop rides the same monotonic seq +
   in-flight abort pattern as refreshBackupTasks above; the interval
   runs ONLY while a run is active and stops on done|failed (D-07) —
   no download action exists in v1 (Phase 90). Every trigger refusal
   (backupManageRequired / backupRunInProgress / scopeNotFound / 429)
   surfaces as a keyed toast through call()'s central handling — the
   server is the authority, the card never pre-validates authority.
   ===================================================================== */
let backupPollSeq = 0;
let backupPollInflight = null;
let backupPollTimer = null;
const BACKUP_ACTIVE_STAGES = ['collecting', 'archiving', 'verifying', 'uploading'];
/* 89-06 (D-89-29): the restore stage vocabulary — the ONE timer keeps
   polling while EITHER surface reports an active stage. */
const RESTORE_ACTIVE_STAGES = ['fetching', 'validating', 'restoring', 'verifying'];
/* WR-02: cooldown between render-kicked ticks after a failure — no backoff
   here would let pageBackup's in-render kick re-fire on every render. */
const BACKUP_POLL_FAILURE_COOLDOWN_MS = 30000;
export function backupPollKickAllowed() {
  return !S.ui.backupPollFailedAt || Date.now() - S.ui.backupPollFailedAt > BACKUP_POLL_FAILURE_COOLDOWN_MS;
}

export async function backupPollTick() {
  if (!api.enabled) return null;
  const my = ++backupPollSeq;
  backupPollInflight?.abort();
  backupPollInflight = new AbortController();
  const signal = backupPollInflight.signal;
  /* 90-03 (D-90-22): the previous stage captured BEFORE the payload write —
     the transition compare happens after the fetch below. Pending and the
     run identity (startedAt — the D-19 frozen payload field) are captured
     with it: the restore list must invalidate whenever a DIFFERENT finished
     run just landed, and two UAT-90 shapes are invisible to a stage-only
     compare — (a) the first poll of a just-triggered run landing already
     terminal (run finishes inside the trigger POST), (b) run N+1 finishing
     while run N was ALREADY the terminal prevStage (terminal→terminal — the
     common shape here: /current returns the last run even at page load).
     Both are "a finished archive just appeared": identity change catches
     them; identity REPEAT on a settled terminal run keeps the tick silent
     (no refetch loop, exactly-once per finished run). */
  const backupPrevStage = S.ui.backupRun?.stage || null;
  const backupPrevRunId = S.ui.backupRun?.startedAt || null;
  /* Phase 94 (Rule 2 — restore operators): the runs/current read is a
     BACKUP_MANAGE surface (server.js 9295) — a Restore Operator (canBackup
     false) must SKIP this half instead of fetching a guaranteed 403 that
     stamped backupErr and flipped the whole page into the 403 fullstate.
     The restore-only operator's tick rides on for the restore half below
     (the ONE timer, D-89-1, is unchanged). Unknown payload (pre-fill
     trigger path — only reachable for operators) keeps polling. */
  const canBackup = S.ui.backupTasks?.canBackup !== false;
  if (!canBackup) {
    S.ui.backupRun = null;
    S.ui.backupPending = false;
  } else {
  const res = await api.backupRunCurrent({ signal });
  if (my !== backupPollSeq) return null;
  if (res.ok) {
    S.ui.backupRun = res.data;
    S.ui.backupPending = false;
  } else {
    /* D-28: the central intercept owns the 401 teardown. Terminal refusals
       (403 role loss, 404 route gone) stop the loop AND surface the error —
       a non-holder must never spin against the keyed refusal. WR-02: any
       other failure also clears backupPending (otherwise a failure landing
       between trigger and first poll renders the pending panel forever) and
       stamps backupPollFailedAt — the page's render-kick honors it as a
       cooldown, so a persistent 500/network error degrades to one retry per
       BACKUP_POLL_FAILURE_COOLDOWN_MS instead of a render→fetch→render loop. */
    if (res.status === 401) return null;
    S.ui.backupRun = null;
    S.ui.backupPending = false;
    if (res.status === 403 || res.status === 404) S.ui.backupErr = { status: res.status };
    S.ui.backupPollFailedAt = Date.now();
  }
  }
  /* 89-06 (D-89-1): the SAME tick also fetches the restore current payload —
     ONE timer serves both surfaces, never a second interval. A backup-only
     operator skips the restore half (fetch gating on the payload's flag, not
     authority recomputation). Render-only: stage/finalName land verbatim. */
  if (S.ui.backupTasks?.canRestore) {
    const rres = await api.restoreRunCurrent({ signal });
    if (my !== backupPollSeq) return null;
    if (rres.ok) {
      S.ui.restoreRun = rres.data;
      S.ui.restorePending = false;
    } else if (rres.status !== 401) {
      S.ui.restoreRun = null;
      S.ui.restorePending = false;
      S.ui.restorePollFailedAt = Date.now();
    }
  }
  /* D-07 + D-89-1: the interval runs while EITHER surface is active —
     done|failed|idle on both stops the ONE timer. A tick that DISCOVERS an
     active stage (mid-run page re-entry through the kick idiom) starts the
     interval itself, so a re-entering operator keeps live progress. */
  const backupActive = BACKUP_ACTIVE_STAGES.includes(S.ui.backupRun?.stage);
  const restoreActive = !!S.ui.restoreRun?.runId && RESTORE_ACTIVE_STAGES.includes(S.ui.restoreRun.stage);
  /* 90-03 (D-90-22): stage-transition compare INSIDE the existing tick —
     when the polled backup run crossed from an active stage into a terminal
     one THIS tick, or a DIFFERENT finished run just landed (UAT-90 shapes:
     trigger-POST-terminal first poll, terminal→terminal run N+1), the
     just-finished archive changes what the restore list should show, so
     invalidate the shared state by nulling it. The page's in-render kick
     (backup.js — the former `!S.ui.restoreList` guard) then refetches EXACTLY ONCE
     — the tick NEVER invokes the restore refresh action itself and never
     refetches unconditionally inside the 1s tick (Pitfall 8: invalidate
     here, refetch at the render boundary). A settled terminal run polling
     with the SAME identity never re-invalidates. */
  const backupNowRunId = S.ui.backupRun?.startedAt || null;
  const backupFinishedArrived = !backupActive && !!backupNowRunId && backupNowRunId !== backupPrevRunId;

  if ((backupActive || restoreActive) && !backupPollTimer) backupStartPolling();
  if (!backupActive && !restoreActive) backupStopPolling();
  render();
  /* 87-04 piggyback: while the run poll ticks, refresh every OPEN per-task
     history card so a finishing run's row lands without a manual toggle.
     89-06: the restore history card rides the same piggyback. */
  refreshOpenBackupHistories();
  refreshOpenRestoreHistories();
  return S.ui.backupRun;
}

function backupStartPolling() {
  if (backupPollTimer) return;
  backupPollTimer = setInterval(() => backupPollTick(), 1000);
}

function backupStopPolling() {
  clearInterval(backupPollTimer);
  backupPollTimer = null;
}

/* =====================================================================
   89-06 RESTORE (BKRST-01..04, D-89-14..23) — the restore surface's
   client half, riding the SAME fill/poll machinery as the backup side:
   ONE fill loop (refreshRestoreBackups) and the ONE backup poll tick
   extended above to also fetch the restore current payload — never a
   second interval (D-89-1: one global restore pipeline, one timer).
   Render-only throughout: stages and final names land in state verbatim
   from the payload; every refusal surfaces as a keyed toast through
   call()'s central handling — the server is the authority, the section
   never pre-validates authority.
   ===================================================================== */
/* The DR machine constant (D-89-27/BKRST-04): rendered untranslated in
   --mono, gated as typeName, sent as confirmPhrase — the server re-validates
   it !== before anything else. A named constant (never a text node) keeps
   the i18n scanner's zero-findings verdict green — it is machine protocol,
   not catalogue copy. */
const DR_CONFIRM_PHRASE = 'RESTORE-INSTANCE';

/* 89-06 (D-89-23/27): the CLOSED refusal-toast map — every route-level
   restore refusal code maps 1:1 onto its keyed copy; a restore code never
   surfaces a freeform error string. restoreManifestCorrupt maps to the
   UI-SPEC contract copy (page.restore.previewCorrupt). Unknown codes fall
   to tErr's raw-message fallback (D-03) inside restoreToast itself. */
const RESTORE_REFUSAL_TOASTS = {
  backupRoleRequired: 'err.backupRoleRequired',
  backupManageRequired: 'err.backupManageRequired',
  backupDownloadAdminOnly: 'err.backupDownloadAdminOnly',
  operatorOnly: 'err.operatorOnly',
  tooManyAttempts: 'err.tooManyAttempts',
  restoreInvalidRunId: 'err.restoreInvalidRunId',
  restoreArchiveMissing: 'err.restoreArchiveMissing',
  restoreNoWorkspace: 'err.restoreNoWorkspace',
  restoreScopeUnsupported: 'err.restoreScopeUnsupported',
  backupRestoreInProgress: 'err.backupRestoreInProgress',
  restoreEntryRejected: 'err.restoreEntryRejected',
  restoreShaMismatch: 'err.restoreShaMismatch',
  confirmPhraseMismatch: 'err.confirmPhraseMismatch',
  restoreTargetMismatch: 'err.restoreTargetMismatch',
  restoreTargetMissing: 'err.restoreTargetMissing',
  restoreNameCollision: 'err.restoreNameCollision',
  restoreManifestCorrupt: 'page.restore.previewCorrupt',
};
const restoreToast = (code, raw) =>
  RESTORE_REFUSAL_TOASTS[code] ? t(RESTORE_REFUSAL_TOASTS[code]) : tErr(code, null, raw || t('err.serverUnreachable'));

/* UAT round-9 (owner ruling): the standalone archive list is retired — the
   Restore action rides the unified history table rows; refreshRestoreBackups
   (the list fill loop) is gone with it. */

/* WR-02 restore half: cooldown between render-kicked ticks after a
   restore-poll failure — the page's render-kick honors it, so a
   persistent restore-poll error cannot loop render→fetch→render. */
export function restorePollKickAllowed() {
  return !S.ui.restorePollFailedAt || Date.now() - S.ui.restorePollFailedAt > BACKUP_POLL_FAILURE_COOLDOWN_MS;
}

A.backupRunNow = async () => {
  /* UAT fix 2026-11-22 (2nd half): the card renders the instance default with a
     fallback (`S.ui.backupScope || {kind:'instance'}`) but the action used to
     read S.ui.backupScope raw and return on null — so the untouched default
     select made "Run backup" do NOTHING until the operator touched the
     dropdown. Mirror the render fallback here. */
  const scope = S.ui.backupScope || { kind: 'instance', id: null };
  if (!scope) return;
  if (scope.kind === 'project' && !scope.id) return toast(t('err.backupPickProject'), { kind: 'err' });
  /* UAT fix 2026-11-22: scope-shape normalization per 86-D-17.
     1. instance: the id must be OMITTED (server: scope?.id === undefined —
        JSON keeps null and the existence gate reads it as a bad id → silent
        scopeNotFound).
     2. workspace: the single-option select arrives PRESELECTED, so
        IN.backupScopeId never fires — take the id from api.workspace here
        instead of relying on a change event that never happens. */
  const wire =
    scope.kind === 'instance'
      ? { kind: 'instance' }
      : scope.kind === 'workspace'
        ? { kind: 'workspace', id: scope.id || api.workspace?.id }
        : scope;
  if (wire.kind === 'workspace' && !wire.id) return toast(tErr('scopeNotFound', null, t('err.serverUnreachable')), { kind: 'err' });
  const res = await api.backupRun(wire);
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    const code = res.data?.code; // backupManageRequired / backupRunInProgress / scopeNotFound / tooManyAttempts — keyed
    return toast(tErr(code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  /* Render-only: no stage is fabricated client-side — the pending flag only
     says "trigger accepted, first poll has not landed yet"; the first tick
     writes the real D-19 payload. */
  S.ui.backupPending = true;
  backupStartPolling();
  render();
};

/* Staged scope selection (Pitfall: never read the DOM back) — the picker
   stages into S.ui.backupScope; the server re-validates kind + id (D-17). */
IN.backupScopeKind = el => {
  /* D-11: switching to workspace arms the fallback id up front (scopes[0]
     or the loaded workspace) so the rendered select's visible selection and
     the trigger wire (A.backupRunNow's `scope.id || api.workspace?.id`)
     can never disagree — IN.backupScopeId keeps ownership after that. */
  S.ui.backupScope = {
    kind: el.value,
    id:
      el.value === 'workspace'
        ? (Array.isArray(S.ui.backupScopes) && S.ui.backupScopes.length ? S.ui.backupScopes[0].id : api.workspace?.id) || null
        : null,
  };
  render();
};
IN.backupScopeId = el => {
  if (S.ui.backupScope) S.ui.backupScope.id = el.value;
};

/* =====================================================================
   87-04 BACKUP TASK BUILDER (BKBCK-02, D-01/D-03/D-04) — the Backup
   page task console's client half. Render-only + staged state: the form
   lives in S.ui.backupTaskForm (never the DOM); the builder serializes
   preset + per-field dropdown selections into the RAW 5-field cron
   string (D-04 — one source of truth the server stores verbatim and
   re-validates via export/cron.js). There is NO free-text cron input
   (D-01) and NO client cron evaluation (Pitfall 6) — the schedule is
   only ever a summary TEXT, and every refusal (taskNameRequired /
   invalidSchedule / invalidTimezone / backupInvalidScope /
   invalidRetention / backupManageRequired) surfaces as a keyed toast
   through call()'s central handling.
   ===================================================================== */
/* 94-02 (UAT-4): fresh-task defaults moved to 22:00 — UAT 2026-11-24 owner
   preference (03:00 read ambiguously in the Minute/Hour display order). */
const BACKUP_TASK_FIELD_DEFAULTS = { minute: '0', hour: '22', dom: '1', mon: '*', dow: '1' };
const backupTaskFormDefaults = () => ({
  editing: null, // null = create; a task id = partial edit
  name: '',
  scopeKind: 'instance',
  scopeId: null,
  preset: 'daily',
  fields: { ...BACKUP_TASK_FIELD_DEFAULTS },
   /* UAT r3 2026-11-22: retention is form-staged — the builder exposes ALL
      FOUR GFS scales (Phase 94, D-03: day/week/month/year, gfs-keyed labels)
      and always sends them with the save — the displayed value IS the intent.
      Defaults are the server DDL defaults (server.js backup_tasks). */
  retention: { daily: 7, weekly: 4, monthly: 12, yearly: 5 },
  tz: '', // '' → the server's resolveTz(null) default (Europe/Paris, D-02)
  tzDirty: false,
  cronDirty: false, // edit mode: an untouched schedule is NOT re-sent (server keeps the stored cron)
  /* Phase 88 (D-88-12): S3 opt-in stages in the form like every other field;
     the checkbox itself renders only when api.s3Enabled is true (render-only). */
  s3Enabled: false,
  /* Phase 98 (D-01): the FTP opt-in mirrors the S3 staging — the checkbox
     itself renders only when api.ftpEnabled is true (render-only). */
  ftpEnabled: false,
});
/* Preset + fields → the raw 5-field cron string (D-04 serialization).
   Custom sends all five fields verbatim — including `*` — so a Custom
   save is always well-formed. Never evaluates anything (Pitfall 6). */
const cronFromForm = form => {
  const f = form.fields;
  const { minute, hour, dom, mon, dow } = f;
  if (form.preset === 'daily') return `${minute} ${hour} * * *`;
  if (form.preset === 'weekly') return `${minute} ${hour} * * ${dow}`;
  if (form.preset === 'monthly') return `${minute} ${hour} ${dom} * *`;
  return `${minute} ${hour} ${dom} ${mon} ${dow}`; // custom
};
export { cronFromForm, backupTaskFormDefaults };

IN.backupTaskName = el => {
  if (S.ui.backupTaskForm) S.ui.backupTaskForm.name = el.value;
};
IN.backupTaskScopeKind = el => {
  if (S.ui.backupTaskForm) {
    S.ui.backupTaskForm.scopeKind = el.value;
    S.ui.backupTaskForm.scopeId = null;
  }
  render();
};
IN.backupTaskScopeId = el => {
  if (S.ui.backupTaskForm) S.ui.backupTaskForm.scopeId = el.value;
};
IN.backupTaskPreset = el => {
  const form = S.ui.backupTaskForm;
  if (!form) return;
  form.preset = el.value;
  form.cronDirty = true;
  render();
};
IN.backupTaskField = el => {
  const form = S.ui.backupTaskForm;
  if (!form) return;
  form.fields[el.dataset.f] = el.value;
  form.cronDirty = true;
  render();
};
/* UAT r3 2026-11-22: retention inputs stage into the form — no re-render on
   each keystroke (numeric inputs keep focus; the staged value rides the save). */
IN.backupTaskRetention = el => {
  const form = S.ui.backupTaskForm;
  if (!form) return;
  const n = Number.parseInt(el.value, 10);
  form.retention[el.dataset.f] = Number.isInteger(n) && n >= 0 ? n : 0;
};
/* Phase 88 (D-88-12): the S3 checkbox stages like the retention inputs — no
   re-render on toggle (the checkbox IS the state). */
IN.backupTaskS3 = el => {
  if (S.ui.backupTaskForm) S.ui.backupTaskForm.s3Enabled = el.checked;
};
/* Phase 98 (D-01): the FTP checkbox stages like the S3 one — no re-render
   on toggle (the checkbox IS the state). */
IN.backupTaskFtp = el => {
  if (S.ui.backupTaskForm) S.ui.backupTaskForm.ftpEnabled = el.checked;
};
A.backupTaskNew = () => {
  S.ui.backupTaskForm = backupTaskFormDefaults();
  /* 90-review WR-02 (defense in depth): a fresh form never inherits a
     stale projection — deletionsPanel renders inside ANY open form, so a
     leftover from a cancelled preview would render under the New form. */
  S.ui.backupDeletions = null;
  render();
};
A.backupTaskEdit = el => {
  const task = (S.ui.backupTasks?.tasks || []).find(x => x?.id === el.dataset.id);
  if (!task) return;
  S.ui.backupDeletions = null; // 90-03: the ephemeral projection never outlives the form that produced it
  let scope = task.scope || { kind: 'instance', id: null };
  /* Phase 94 (D-02): reverse-map the stored schedule from the SERVER
     descriptor (task.schedule.preset — cronToPreset ran server-side; the
     client never evaluates cron, T-87-11). A matching preset pre-selects the
     dropdowns from the descriptor's singleton fields (hour/minute/weekday,
     the additive dom/mon singletons); a null preset (steps, ranges,
     multi-values, malformed) locks the builder to the readonly custom
     fallback showing the raw expression with an honest hint. CRITICAL: the
     pre-fill does NOT set cronDirty=true — an untouched schedule is not
     re-sent, so a name/tz-only edit cannot silently rewrite the cron
     (RESEARCH pitfall 1; the :cronDirty guard below is untouched). */
  const sp = task.schedule && typeof task.schedule === 'object' ? task.schedule : {};
  const matched = sp.preset === 'daily' || sp.preset === 'weekly' || sp.preset === 'monthly' || sp.preset === 'yearly';
  S.ui.backupTaskForm = {
    ...backupTaskFormDefaults(),
    editing: task.id,
    name: task.name || '',
    scopeKind: scope.kind || 'instance',
    scopeId: scope.id || null,
    preset: matched ? sp.preset : 'custom',
    fields: matched
      ? {
          minute: String(sp.minute ?? '0'),
          hour: String(sp.hour ?? '3'),
          dom: sp.preset === 'monthly' || sp.preset === 'yearly' ? String(sp.dom ?? '1') : '1',
          mon: sp.preset === 'yearly' ? String(sp.mon ?? '*') : '*',
          dow: sp.preset === 'weekly' ? String(sp.weekday ?? '1') : '1',
        }
      : { ...BACKUP_TASK_FIELD_DEFAULTS },
    /* D-02: a non-matching schedule locks the builder — the preset select and
       the per-field dropdowns render disabled and the raw expression shows
       readonly with the customScheduleHint (the ONLY place the raw cron
       renders, payload verbatim through esc()). */
    cronLocked: !matched,
    customCron: matched ? null : String(task.cron || ''),
    /* UAT r3: edit mode preloads the task's current retention so the inputs
       show the stored values (round-trip: displayed value = stored value).
       Phase 94 (D-03): all FOUR scales preload now. */
    retention: {
      daily: Number(task.retention_daily ?? 7),
      weekly: Number(task.retention_weekly ?? 4),
      monthly: Number(task.retention_monthly ?? 12),
      yearly: Number(task.retention_yearly ?? 5),
    },
    tz: task.tz || '',
    tzDirty: false,
    cronDirty: false,
    /* Edit mode: the checkbox shows the stored opt-in (task list rows carry
       s3_enabled verbatim through backupTaskShape). */
    s3Enabled: task.s3_enabled === 1,
    /* Phase 98 (D-01): the checkbox shows the stored FTP opt-in
       (backupTaskShape carries ftp_enabled verbatim). */
    ftpEnabled: task.ftp_enabled === 1,
  };
  render();
};
A.backupTaskCancel = () => {
  S.ui.backupTaskForm = null;
  S.ui.backupDeletions = null; // 90-03: ephemeral projection cleared with the form
  render();
};
A.backupTaskSave = async () => {
  const form = S.ui.backupTaskForm;
  if (!form) return;
  const name = form.name.trim();
  if (!name) return toast(t('err.taskNameRequired'), { kind: 'err' });
  /* UAT fix 2026-11-22: workspace scope's single-option select arrives
     PRESELECTED — IN.backupTaskScopeId never fires, so stage the workspace id
     here (mirrors the Run-now fix). Instance omits the id (86-D-17). */
  const scope =
    form.scopeKind === 'instance'
      ? { kind: 'instance' }
      : form.scopeKind === 'workspace'
        ? { kind: 'workspace', id: form.scopeId || api.workspace?.id }
        : { kind: 'project', id: form.scopeId };
  if (form.scopeKind === 'project' && !scope.id) return toast(t('err.backupPickProject'), { kind: 'err' });
  if (form.scopeKind === 'workspace' && !scope.id) return toast(tErr('scopeNotFound', null, t('err.serverUnreachable')), { kind: 'err' });
  /* D-04: on CREATE the serialized raw string always rides the write (there
     is no stored cron to keep); on EDIT only when the operator touched the
     builder — the server keeps the stored cron otherwise. */
  const cron = form.editing && !form.cronDirty ? undefined : cronFromForm(form);
  if (cron === '') return toast(t('err.invalidSchedule'), { kind: 'err' });
  const body = { name, scope };
  if (cron !== undefined) body.cron = cron;
  /* D-02: tz always resolved client-side through the shared tzPreselect
     (browser/list default), so the displayed combobox value and the stored
     tz can never diverge. */
  body.tz = form.tz || tzPreselect(form.tz);
  /* UAT r3: retention always rides the write — the displayed inputs are the
     intent (server re-validates small non-negative ints, keyed invalidRetention).
     Phase 94 (D-03): all FOUR scales always ride the write. */
  body.retention = { daily: form.retention.daily, weekly: form.retention.weekly, monthly: form.retention.monthly, yearly: form.retention.yearly };
  /* SC-1 (D-88-12/15): the S3 flag rides the write whenever the server says
     the destination exists — absent flag would keep a stored value, so the
     displayed checkbox state is ALWAYS serialized (on AND off). The server
     probes at save (SC-1): unreachable/badCreds/s3ClockSkew refuse keyed. */
  if (api.s3Enabled) body.s3Enabled = form.s3Enabled === true;
  /* Phase 98 (D-01): the FTP flag rides the write whenever the server says
     the destination exists — fail-closed: absent when api.ftpEnabled is
     false. The server probes at save and HARD-refuses on !ok (no
     deleteFailed accept-with-warning analog). */
  if (api.ftpEnabled) body.ftpEnabled = form.ftpEnabled === true;
  const res = form.editing ? await api.backupTaskUpdate(form.editing, body) : await api.backupTaskCreate(body);
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    return toast(tErr(res.data?.code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  S.ui.backupTaskForm = null;
  S.ui.backupDeletions = null; // 90-03: ephemeral projection cleared on save — the policy changed, re-preview before trusting
  S.ui.tzPick = null;
  /* SC-1 probe visibility: a response carrying s3Probe toasts the keyed
     outcome on top of the save confirmation (D-88-15: deleteFailed is a
     warning, not an error — the write path uploads use is proven). */
  const probe = res.data?.s3Probe;
  if (probe) {
    if (probe.key === 'success') toast(t('toast.s3ProbeSuccess'));
    else if (probe.key === 'deleteFailed') toast(t('toast.s3ProbeDeleteFailed'));
    else if (probe.key === 'badCreds') toast(t('toast.s3ProbeBadCreds'), { kind: 'err' });
    else if (probe.key === 'unreachable') toast(t('toast.s3ProbeUnreachable'), { kind: 'err' });
    else if (probe.key === 's3ClockSkew') toast(tErr('s3ClockSkew', null, t('toast.s3ProbeUnreachable')), { kind: 'err' });
    else if (probe.key === 's3NoBucket') toast(tErr('s3NoBucket', null, t('toast.s3ProbeUnreachable')), { kind: 'err' }); // MIN-01: bucket-name typo gets its own keyed message
    if (probe.httpWarning) toast(t('toast.s3ProbeHttpWarning'));
  }
  /* Phase 98 probe visibility: the ftpProbe twin — hard-refusal parity
     (NO deleteFailed branch: a DELE marker failure is a hard refusal
     server-side, the documented D-88-15 divergence). */
  const fprobe = res.data?.ftpProbe;
  if (fprobe) {
    if (fprobe.key === 'success') toast(t('toast.ftpProbeSuccess'));
    else if (fprobe.key === 'ftpAuthFailed') toast(tErr('ftpAuthFailed', null, t('toast.ftpProbeUnreachable')), { kind: 'err' });
    else if (fprobe.key === 'ftpTlsFailed') toast(tErr('ftpTlsFailed', null, t('toast.ftpProbeUnreachable')), { kind: 'err' });
    else if (fprobe.key === 'ftpPassiveFailed') toast(tErr('ftpPassiveFailed', null, t('toast.ftpProbeUnreachable')), { kind: 'err' });
    else if (fprobe.key === 'ftpPathNotFound') toast(tErr('ftpPathNotFound', null, t('toast.ftpProbeUnreachable')), { kind: 'err' });
    else if (fprobe.key === 'ftpQuotaExceeded') toast(tErr('ftpQuotaExceeded', null, t('toast.ftpProbeUnreachable')), { kind: 'err' });
    else if (fprobe.key === 'unreachable') toast(t('toast.ftpProbeUnreachable'), { kind: 'err' });
    if (fprobe.httpWarning) toast(tErr('insecureTlsWarning', null, t('toast.ftpProbeUnreachable')));
  }
  toast(t(form.editing ? 'page.backup.taskUpdated' : 'page.backup.taskSaved'), { ms: 1500 });
  render();
  await refreshBackupTasks();
};
/* Toggle (D-07): the server recomputes next_run_at in the SAME write — the
   client only refills. No client cron math. */
A.backupTaskToggle = async el => {
  const task = (S.ui.backupTasks?.tasks || []).find(x => x?.id === el.dataset.id);
  if (!task) return;
  const res = await api.backupTaskToggle(task.id, !task.enabled);
  if (!res.ok) {
    if (res.status === 401) return;
    return toast(tErr(res.data?.code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshBackupTasks();
};
A.backupTaskDelete = el => {
  const task = (S.ui.backupTasks?.tasks || []).find(x => x?.id === el.dataset.id);
  if (!task) return;
  confirmDlg({
    title: t('page.backup.taskDelete'),
    body: `<b>${esc(task.name)}</b> — ${t('page.backup.taskDeleteBody')}`,
    ok: t('page.backup.taskDelete'),
    danger: true,
    run: async () => {
      const res = await api.backupTaskDelete(task.id);
      if (!res.ok) {
        if (res.status === 401) return;
        return toast(tErr(res.data?.code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
      }
      toast(t('page.backup.taskDeleted'), { ms: 1500 });
      if (S.ui.backupTaskForm?.editing === task.id) S.ui.backupTaskForm = null;
      render();
      await refreshBackupTasks();
    },
  });
};
/* Run now for a task: the EXISTING Phase 86 run endpoint (POST /api/backup/
   runs) with the task's own scope — manual trigger semantics, same refusal
   toasts (backupRunInProgress / backupManageRequired / tooManyAttempts). */
A.backupTaskRunNow = async el => {
  const task = (S.ui.backupTasks?.tasks || []).find(x => x?.id === el.dataset.id);
  if (!task || !task.scope) return;
  const res = await api.backupRun(task.scope);
  if (!res.ok) {
    if (res.status === 401) return;
    return toast(tErr(res.data?.code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  /* Render-only: no stage is fabricated client-side — the pending flag only
     says "trigger accepted, first poll has not landed yet"; the first tick
     writes the real D-19 payload. */
  S.ui.backupPending = true;
  backupStartPolling();
  render();
  await refreshBackupLastRuns(); // Phase 94 (D-01): the badge re-derives after a manual trigger
};
/* =====================================================================
   Phase 94 (D-04): the UNIFIED run history — the per-task history card's
   handlers are retired; one staged filter (S.ui.backupHistoryFilter,
   never the DOM) + one staged result (S.ui.backupHistoryAll) drive the
   single sblock below the task table. Pagination probes limit+1 (the
   payload carries NO total count): a short page grays out "next".
   Names-not-ids: the task select shows task NAMES, requests the id; the
   synthetic `manual` entry maps to the server's task_id IS NULL filter.
   ===================================================================== */
const BACKUP_HISTORY_FILTER_DEFAULTS = () => ({ task: '', trigger: '', status: '', type: '', limit: 50, offset: 0 });
const backupHistoryFilter = () => S.ui.backupHistoryFilter || (S.ui.backupHistoryFilter = BACKUP_HISTORY_FILTER_DEFAULTS());
const backupHistoryStage = (f, patch) => {
  Object.assign(f, patch);
  f.offset = 0;
  render();
  refreshBackupHistory();
};
IN.backupHistoryTask = el => backupHistoryStage(backupHistoryFilter(), { task: el.value });
IN.backupHistoryTrigger = el => backupHistoryStage(backupHistoryFilter(), { trigger: el.value });
IN.backupHistoryStatus = el => backupHistoryStage(backupHistoryFilter(), { status: el.value });
IN.backupHistoryType = el => backupHistoryStage(backupHistoryFilter(), { type: el.value });
export async function refreshBackupHistory() {
  if (!api.enabled) return;
  const f = backupHistoryFilter();
  S.ui.backupHistoryFetching = true;
  S.ui.backupHistoryAll = { runs: [], loading: true };
  render();
  /* limit+1 probe: hasMore derives from the extra row; the rendered page is
     the first `limit` rows (server order verbatim — created_at desc). */
  const res = await api.backupRuns({
    all: 1,
    task: f.task || undefined,
    trigger: f.trigger || undefined,
    status: f.status || undefined,
    limit: Number(f.limit) + 1,
    offset: Number(f.offset) || 0,
  });
  S.ui.backupHistoryFetching = false;
  if (res.status === 401) return; // D-28: the central intercept owns the teardown
  if (!res.ok) {
    /* D-14: the history read is refused with backupManageRequired for
       non-operators — the sblock degrades to the "unavailable" line, never
       an error storm. */
    S.ui.backupHistoryAll = { runs: [], err: res.data?.code || res.error || 'historyUnavailable' };
    render();
    return;
  }
  const runs = Array.isArray(res.data?.runs) ? res.data.runs : [];
  S.ui.backupHistoryAll = { runs: runs.slice(0, f.limit), hasMore: runs.length > f.limit };
  render();
}
A.backupHistoryPage = async el => {
  const f = backupHistoryFilter();
  const dir = Number(el.dataset.dir) || 1;
  const offset = Math.max(0, (Number(f.offset) || 0) + dir * Number(f.limit));
  if (offset === Number(f.offset)) return;
  f.offset = offset;
  await refreshBackupHistory();
};
/* 87-04 → 94 (D-04): the History button FILTERS the unified sblock on the
   task and scrolls to it — the per-task card is gone (its data lives in
   the sblock filtered on that task). */
A.backupTaskHistory = async el => {
  const id = el.dataset.id;
  if (!id) return;
  S.ui.backupHistoryFilter = { ...BACKUP_HISTORY_FILTER_DEFAULTS(), task: id };
  S.ui.backupHistoryAll = null; // force the sblock fetch with the new filter
  render();
  document.getElementById('backupHistorySblock')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  await refreshBackupHistory();
};
/* Piggyback refresh (87-04 → 94): while a run is active, backupPollTick's
   1 s cadence also refreshes the unified sblock when it has loaded data —
   a finishing run's row lands without a manual toggle. */
export async function refreshOpenBackupHistories() {
  if (!S.ui.backupHistoryAll || S.ui.backupHistoryAll.err || S.ui.backupHistoryAll.loading) return;
  await refreshBackupHistory();
}
A.backupRunErr = el => {
  const set = (S.ui.backupRunErrOpen = S.ui.backupRunErrOpen || new Set());
  if (set.has(el.dataset.id)) set.delete(el.dataset.id);
  else set.add(el.dataset.id);
  render();
};

/* 90-02 (SC-2, D-90-7/8): the archive download — a GET that streams the
   stored archive through the ONE client download path (54-02): read the
   bytes as a Blob, derive the filename from the server's Content-Disposition,
   hand it to saveBlob. Success NEVER calls res.text() — the payload is the
   tar.gz archive. Refusals surface through the closed RESTORE_REFUSAL_TOASTS
   map (the server is the authority, the client never pre-validates); the CTA
   stays disabled until the fetch settles (double-click prevention). */
A.backupDownload = async el => {
  el.disabled = true;
  try {
    let res;
    try {
      res = await fetch(`/api/backup/download?runId=${encodeURIComponent(el.dataset.id || '')}`, {
        method: 'GET',
        credentials: 'same-origin',
      });
    } catch {
      return toast(t('err.serverUnreachable'), { kind: 'err' });
    }
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON error body */
      }
      return toast(restoreToast(data?.code, data?.error), { kind: 'err' });
    }
    const [{ saveBlob, filenameFrom }] = await Promise.all([import('../core/download.js')]);
    saveBlob(await res.blob(), filenameFrom(res.headers.get('Content-Disposition')));
  } finally {
    el.disabled = false;
  }
};

/* 90-02 (D-90-11): the verify-checksum action — POST the re-hash route and
   surface the RESULT as the durable keyed badge: the only client state is
   the in-flight flag (row aria-busy + the checksumChecking label swap), the
   persisted result re-renders payload-derived through the 87-04 open-history
   refresh (checksum_ok / checksum_checked_at ride the history payload — the
   client stores no verify result, never a fabricated one during an S3
   stream-back), and NO toast sits on the result path. Refusals surface
   through the closed RESTORE_REFUSAL_TOASTS map — the house refusal idiom
   (restoreRun et al.): restoreToast wrapped in toast(), because the click
   delegation discards handler return values. */
A.backupVerifyChecksum = async el => {
  const id = el.dataset.id || '';
  const busy = (S.ui.backupChecksumBusy = S.ui.backupChecksumBusy || new Set());
  busy.add(id);
  render();
  try {
    const res = await api.backupVerifyChecksum(id);
    if (!res.ok) {
      if (res.status === 401) return; // D-28: the central intercept owns the teardown
      /* call()'s refusal envelope carries the centrally translated message
         in .error (the raw code is dropped), so restoreToast resolves
         through tErr's raw fallback when the map misses. */
      return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
    }
    /* Both outcomes persisted server-side — the owner ruling (UAT round-5):
       the result surfaces as a TOAST at click time, no durable badge.
       (UAT round-11: the endpoint's payload is { ok, checkedAt } — the
       boolean maps 1→verified, 0→failed; the old checksum_ok read was
       always undefined, so no toast ever fired.) */
    await refreshOpenBackupHistories();
    const chk = res.data && res.data.ok == null ? null : res.data ? Number(res.data.ok) : null;
    if (chk === 1) toast(t('toast.checksumOk'));
    else if (chk === 0) toast(t('toast.checksumFail'), { kind: 'err' });
  } finally {
    busy.delete(id);
    render();
  }
};
/* 90-03 task 2 (D-90-12/13/15): the on-demand rotation projection. The
   server computes the dry-run delete set from the CURRENT policy (zero
   client GFS math, D-90-12/16); the result stages EPHEMERALLY in
   S.ui.backupDeletions — cleared on save/cancel/edit above, never stored
   server-side. Refusals toast through the restoreToast closed map —
   tooManyAttempts / backupManageRequired are already mapped (D-90-15: the
   refused attempt consumed a try server-side). */
A.backupPreviewDeletions = async el => {
  const taskId = el.dataset.taskId;
  if (!taskId) return;
  /* 90-review WR-02: the response is stage-guarded on the FORM that asked
     for it — the mounted form object IS the token (the house staged-state
     idiom; no new global). A cancel/save/new/edit while the projection is
     in flight reassigns S.ui.backupTaskForm, so a stale response lands
     nowhere: the 90-03 doctrine ("a stale projection must never outlive
     the form that produced it") holds mid-flight too. */
  const form = S.ui.backupTaskForm;
  if (!form || form.editing !== taskId) return;
  S.ui.backupDeletions = { loading: true };
  render();
  const res = await api.backupRotationPreview(taskId);
  if (S.ui.backupTaskForm !== form) return; // stale: the form was closed/replaced mid-flight — never re-stage
  if (!res.ok) {
    S.ui.backupDeletions = null;
    render();
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
  }
  S.ui.backupDeletions = res.data?.noRuns
    ? { noRuns: true }
    : {
        groups: res.data.groups,
        total: res.data.total,
        /* All groups start collapsed — the count line is the information
           density the operator wants first (D-90-14 honest zeros). */
        open: { daily: false, weekly: false, monthly: false, yearly: false },
      };
  render();
};
A.backupDeletionsToggle = el => {
  const d = S.ui.backupDeletions;
  const scale = el.dataset.scale;
  if (!d?.groups?.[scale]) return;
  d.open = d.open || {};
  d.open[scale] = !d.open[scale];
  render();
};

/* 89-06 restore history (D-89-20): ONE instance-wide card — newest-first
   and the 50 cap are the SERVER's (the client derives none of it); the
   fetch result stages verbatim in S.ui.restoreHistory. */
const restoreHistoryFetch = async () => {
  /* 94-02 (UAT-3): fetching guard — the page fill loop kicks this when
     S.ui.restoreHistory is absent; the flag prevents a render→fetch→render
     loop (same discipline as backupHistoryFetching). */
  S.ui.restoreHistoryFetching = true;
  const res = await api.restoreRuns();
  S.ui.restoreHistoryFetching = false;
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    S.ui.restoreHistory = { runs: [], err: true };
  } else {
    S.ui.restoreHistory = { runs: Array.isArray(res.data?.runs) ? res.data.runs : [] };
  }
  render();
};

/* 94-02 (UAT-3): the unified history sblock merges the restore rows — the
   page's fill loop calls this when the payload is absent. Additive export:
   no route change, no payload recompute (fail-closed render-verbatim). */
export async function refreshRestoreHistory() {
  if (!api.enabled) return;
  await restoreHistoryFetch();
}

export async function refreshOpenRestoreHistories() {
  await restoreHistoryFetch();
}

A.restoreRunErr = el => {
  const set = (S.ui.restoreRunErrOpen = S.ui.restoreRunErrOpen || new Set());
  if (set.has(el.dataset.id)) set.delete(el.dataset.id);
  else set.add(el.dataset.id);
  render();
};

/* The preview drawer: opens on a list row, streams the manifest, and NEVER
   opens without one — a refusal closes it and surfaces the keyed copy
   (corrupt manifests show the page.restore.previewCorrupt contract copy,
   every other class its err.* key — D-89-17, D-89-33 families 2/3). */
A.restorePreview = async el => {
  const runId = el.dataset.id;
  if (!runId) return;
  S.ui.restorePreview = { runId };
  S.ui.restorePreviewData = null;
  render();
  /* UAT round-8: a Super Admin without live memberships still needs a
     target — the phase-92 scopes endpoint lists every active workspace
     (same authority idiom as the trigger gate). Non-admins keep the
     membership list. */
  if (api.user?.isInstanceAdmin) {
    const scopes = await api.backupScopes();
    if (scopes.ok) S.ui.backupScopes = Array.isArray(scopes.data?.workspaces) ? scopes.data.workspaces : null;
  }
  const res = await api.restorePreview(runId);
  if (!res.ok) {
    S.ui.restorePreview = null;
    render();
    if (res.status === 401) return;
    return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
  }
  S.ui.restorePreviewData = { data: res.data };
  render();
};

A.restorePreviewClose = () => {
  S.ui.restorePreview = null;
  S.ui.restorePreviewData = null;
  S.ui.backupScopes = null;
  render();
};

/* Import-as-new trigger (D-33-2: the non-destructive default — single click,
   NO confirm dialog). The accepted run id closes the drawer and hands over
   to the pending panel until the first shared poll lands (render-only).
   D-89-23 client mirror: a project archive restores INTO a membership —
   a trigger attempt without a picker selection surfaces the keyed refusal
   immediately (the server refuses keyed anyway; the chrome mirrors, never
   replaces). Workspace/instance scopes never need a target. */
A.restoreNew = async el => {
  const runId = el.dataset.id || S.ui.restorePreview?.runId;
  if (!runId) return;
  /* UAT round-10: the cold refusal (no target armed) is NOT the server's
     no-membership refusal — it's a client-side "pick a target first"
     (err.restoreTargetMissing), so the Super Admin no-membership bypass
     never shows a misleading membership message. */
  if (S.ui.restorePreviewData?.data?.scope?.kind === 'project' && !S.ui.restoreTarget)
    return toast(restoreToast('restoreTargetMissing'), { kind: 'err' });
  const res = await api.restoreRun({ runId, targetWorkspaceId: S.ui.restoreTarget || undefined });
  if (!res.ok) {
    if (res.status === 401) return;
    return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
  }
  S.ui.restorePreview = null;
  S.ui.restorePreviewData = null;
  S.ui.restoreTarget = null;
  S.ui.restoreTargetProject = null;
  S.ui.restorePending = true;
  backupStartPolling();
  render();
};

A.restoreTargetPick = el => {
  S.ui.restoreTarget = el.dataset.id || null;
  /* 95-05 (D-02): switching the workspace target invalidates the armed
     project — the second-level chips re-render from the new workspace's
     projects, never from the stale pick. */
  S.ui.restoreTargetProject = null;
  render();
};

A.restoreProjectPick = el => {
  S.ui.restoreTargetProject = el.dataset.id || null;
  render();
};

/* Overwrite trigger (D-89-21/27): the target is the archive's source
   workspace — its EXACT live name comes from the auth payload's membership
   list (api.workspaces); the server re-validates confirmName against the
   LIVE row, so the client dialog is chrome, never the boundary. The shared
   OK gate guarantees the typed value === typeName, so sending the captured
   name is the established destructive idiom (delWorkspace precedent). The
   drawer closes only on the ACCEPTED trigger — a refusal leaves it open. */
A.restoreOverwrite = el => {
  const runId = el.dataset.id || S.ui.restorePreview?.runId;
  /* 95-05 (BKRST-05, D-02/D-03): project-archives branch. The target is the
     PICKED workspace + project from the scopes payload; typeName is the
     project's CURRENT name from that payload (chrome only — the server
     re-reads the live doc and re-validates confirmName against it). The
     payload shape mirrors the 95-04 route contract: targetId (workspace) +
     targetProjectId + confirmName. Refusals ride the existing
     tErr/restoreToast vocabulary (restoreNameCollision names the conflict). */
  if (S.ui.restorePreviewData?.data?.scope?.kind === 'project') {
    const wsId = S.ui.restoreTarget;
    const projId = S.ui.restoreTargetProject;
    if (!runId || !wsId || !projId) return toast(restoreToast('restoreTargetMissing'), { kind: 'err' });
    const wsEntry = (Array.isArray(S.ui.backupScopes) ? S.ui.backupScopes : []).find(w => w.id === wsId);
    const targetProject = (Array.isArray(wsEntry?.projects) ? wsEntry.projects : []).find(p => p.id === projId);
    if (!targetProject) return toast(restoreToast('restoreTargetMissing'), { kind: 'err' });
    confirmDlg({
      title: t('page.restore.overwriteConfirmTitle', { name: esc(targetProject.name) }),
      body: t('page.restore.confirmOverwriteBody', { name: esc(targetProject.name) }),
      ok: t('page.restore.confirmOverwriteOk'),
      danger: true,
      typeName: targetProject.name,
      run: async () => {
        const res = await api.restoreOverwrite({ runId, targetId: wsId, targetProjectId: projId, confirmName: targetProject.name });
        if (!res.ok) {
          if (res.status === 401) return;
          return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
        }
        S.ui.restorePreview = null;
        S.ui.restorePreviewData = null;
        S.ui.restoreTarget = null;
        S.ui.restoreTargetProject = null;
        S.ui.restorePending = true;
        backupStartPolling();
        render();
      },
    });
    return;
  }
  const scopeId = S.ui.restorePreviewData?.data?.scope?.id;
  const target = api.workspaces.find(w => w.id === scopeId);
  if (!runId || !target) return;
  confirmDlg({
    title: t('page.restore.confirmOverwriteTitle', { name: target.name }),
    body: t('page.restore.confirmOverwriteBody', { name: esc(target.name) }),
    ok: t('page.restore.confirmOverwriteOk'),
    danger: true,
    typeName: target.name,
    run: async () => {
      const res = await api.restoreOverwrite({ runId, targetId: target.id, confirmName: target.name });
      if (!res.ok) {
        if (res.status === 401) return;
        return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
      }
      S.ui.restorePreview = null;
      S.ui.restorePreviewData = null;
      S.ui.restoreTarget = null;
      S.ui.restoreTargetProject = null;
      S.ui.restorePending = true;
      backupStartPolling();
      render();
    },
  });
};

/* Instance DR trigger (D-89-27/BKRST-04): typeName is the machine constant
   RESTORE-INSTANCE — rendered untranslated in --mono inside the body, and
   re-validated server-side !== 'RESTORE-INSTANCE' before anything else. */
A.restoreInstance = el => {
  const runId = el.dataset.id || S.ui.restorePreview?.runId;
  if (!runId) return;
  confirmDlg({
    title: t('page.restore.confirmInstanceTitle'),
    body: `${t('page.restore.confirmInstanceBody')}<div style="margin-top:8px"><span class="mono">${DR_CONFIRM_PHRASE}</span></div>`,
    ok: t('page.restore.confirmInstanceOk'),
    danger: true,
    typeName: DR_CONFIRM_PHRASE,
    run: async () => {
      const res = await api.restoreInstance({ runId, confirmPhrase: DR_CONFIRM_PHRASE });
      if (!res.ok) {
        if (res.status === 401) return;
        return toast(restoreToast(res.data?.code, res.error), { kind: 'err' });
      }
      S.ui.restorePreview = null;
      S.ui.restorePreviewData = null;
      S.ui.restorePending = true;
      backupStartPolling();
      render();
    },
  });
};

/* =====================================================================
   85-02 INSTANCE ROLES (D-29..D-31, BKROLE-01) — the governance tab's
   grant/revoke client half. Render-only from the single GET fetch
   (rows + recent activity, dead-mappings shape). Grant reuses the
   operator user list as its pool (D-07) through the Phase 84 picker
   pattern (staged state, searchable, confirm-to-apply, D-30); the
   duplicate refusal (D-08) closes the modal, surfaces the keyed toast
   and highlights the existing row; revoke rides the D-90 inline-confirm
   stage. Every refusal is a keyed err toast — the server is the
   authority (T-78-05 doctrine).
   ===================================================================== */
let govRolesFillSeq = 0;
let govRolesInflight = null;
export async function refreshInstanceRoles() {
  if (!api.enabled || !api.user?.isInstanceAdmin) return null;
  const my = ++govRolesFillSeq;
  govRolesInflight?.abort();
  govRolesInflight = new AbortController();
  const res = await api.instanceRoles();
  if (my !== govRolesFillSeq) return null;
  if (res.ok) {
    S.ui.govRoles = res.data.roles || [];
    S.ui.govRolesRecent = res.data.recent || [];
  } else {
    /* D-28: the central intercept owns the 401 teardown. Any other refusal
       leaves the tab empty — the operator gate IS the honest answer. */
    if (res.status !== 401) S.ui.govRoles = null;
    return null;
  }
  render();
  return S.ui.govRoles;
}
A.govRoleGrantAsk = async () => {
  if (!S.ui.operatorUsers) await refreshOperatorUsers(); // D-07: the picker's pool
  /* 93-01 (D-03): inherit the tab-picker's staged draft (role/user) if one
     is staged — the dialog opens pre-filtered to that role. */
  const prev = S.ui.govRoleMod;
  S.ui.govRoleMod = { userId: prev?.userId || null, role: prev?.role || 'backup_operator', q: '' };
  import('../pages/governance.js')
    .then(m => {
      openModal({ type: 'custom', cls: 'sm', render: () => m.govRoleBody() });
    })
    .catch(e => {
      console.error(e);
      S.ui.govRoleMod = null;
      toast(t('err.serverUnreachable'), { kind: 'err' });
    });
};
/* 93-01 (dead-search fix, Pitfall 1): the handler writes the staged q AND
   calls render() — the candidate list re-filters on every keystroke, the
   exact bug class the owner reported at the old govRoleQ (:5604). The
   stage seeds lazily so the per-tab picker filters before any selection. */
IN.govRoleQ = el => {
  /* UAT round-11 fix: the staged draft CARRIES its tab role from the input's
     data-role — without it the first keystroke created a role-less draft,
     roleTabView's per-tab isolation rejected it (stMod.role === role false)
     and re-rendered an empty input (typing was impossible). */
  if (!S.ui.govRoleMod || S.ui.govRoleMod.role == null)
    S.ui.govRoleMod = { userId: S.ui.govRoleMod?.userId ?? null, role: el.dataset.role || S.ui.govRoleMod?.role || null, q: '' };
  S.ui.govRoleMod.q = el.value;
  render();
};
IN.govRoleSel = el => {
  if (S.ui.govRoleMod) S.ui.govRoleMod.role = el.value;
  render();
};
A.govRolePick = el => {
  /* 93-01 (D-03, mteamToggle idiom): single-select toggle on data-v; the
     option's data-role pins the staged role (tab pickers pre-pin it). */
  if (!S.ui.govRoleMod) S.ui.govRoleMod = { userId: null, role: 'backup_operator', q: '' };
  if (el.dataset.role) S.ui.govRoleMod.role = el.dataset.role;
  S.ui.govRoleMod.userId = S.ui.govRoleMod.userId === el.dataset.v ? null : el.dataset.v;
  render();
};
A.govRoleGrantCancel = () => {
  S.ui.govRoleMod = null;
  closeModal();
};
A.govRoleGrantConfirm = async () => {
  const st = S.ui.govRoleMod;
  if (!st?.userId) return;
  const res = await api.instanceRoleGrant(st.userId, st.role);
  if (!res.ok) {
    if (res.status === 401) return; // D-28: the central intercept owns the teardown
    const code = res.data?.code;
    /* D-08: the duplicate refusal closes the modal, toasts the keyed copy and
       highlights the existing row until the refresh clears the stage. */
    if (code === 'instanceRoleDuplicate') {
      S.ui.govRoleMod = null;
      S.ui.govRoleDup = st.userId;
      closeModal();
      render();
      toast(t('err.instanceRoleDuplicate'), { kind: 'err' });
      await refreshInstanceRoles(); // the amber highlight persists on the existing row until the next mutation or route exit
      return;
    }
    return toast(tErr(code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  S.ui.govRoleMod = null;
  closeModal();
  await refreshInstanceRoles();
  toast(t('toast.governanceRoleGranted'));
};
A.govRoleRevokeAsk = el => {
  S.ui.govRoleRevoke = el.dataset.id; // D-90: the inline confirmation stage carries the row id
  render();
};
A.govRoleRevokeCancel = () => {
  S.ui.govRoleRevoke = null;
  render();
};
A.govRoleRevokeConfirm = async el => {
  const id = el.dataset.id;
  const res = await api.instanceRoleRevoke(id);
  S.ui.govRoleRevoke = null;
  if (!res.ok) {
    if (res.status === 401) return;
    const code = res.data?.code; // operatorOnly / notFound / tooManyAttempts — keyed
    return toast(tErr(code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
  }
  await refreshInstanceRoles();
  toast(t('toast.governanceRoleRevoked'));
};
IN.govQ = el => {
  S.ui.govQ = el.value;
  render();
};
IN.govOpQ = el => {
  S.ui.govOpQ = el.value;
  S.ui.govSuperShown = null; // D-90-4: the candidate slice counter resets when the query changes
  render();
};
A.govSeg = el => {
  S.ui.govSegV = el.dataset.v;
  render();
};
/* 90-01/93-01: the console's seg switch mirrors the govSeg handler — set
   the staged stage, rerender; no refetch on switch (all three views render
   from their already-staged payloads). D-01: three values now (admins /
   backup / restore). Per-tab state isolation: the grant-dialog/picker
   stage resets on switch so one tab's staged state never leaks into
   another's body. */
A.govSuperSeg = el => {
  S.ui.govSuperSeg = el.dataset.v;
  S.ui.govRoleMod = null;
  render();
};
/* 90-01 (D-90-4): the candidate slice counter — +10 per click; the query
   input resets it (IN.govOpQ). The cap is the visible affordance, never
   a growing default. */
A.govSuperMore = () => {
  S.ui.govSuperShown = (S.ui.govSuperShown || 10) + 10;
  render();
};
const govWsById = id => (S.ui.govWs || []).find(w => w.id === id);
/* Pitfall 5 separation: the three delete-path refusals land on three DISTINCT
   keyed toasts so the operator can tell exactly which list to fix. */
const govRefusalToast = res => {
  if (res.status === 401) return; // D-28: the central intercept owns the teardown
  const code = res.data?.code;
  const keyed = ['workspaceNotEmpty', 'dispositionRequired', 'memberAlreadyMember', 'targetArchived'].includes(code);
  return toast(keyed ? t('err.' + code) : tErr(code, null, res.error || t('err.serverUnreachable')), { kind: 'err' });
};
A.govArchiveAsk = el => {
  const ws = govWsById(el.dataset.id);
  if (!ws) return;
  confirmDlg({
    title: t('page.governance.confirmArchiveTitle', { name: ws.name }),
    body: t('page.governance.confirmArchiveBody', { slug: `<b>${esc(ws.slug)}</b>` }),
    ok: t('page.governance.okArchive'),
    icon: 'archive',
    danger: false, // amber tile — archive is reversible (D-02)
    typeName: ws.slug, // D-04: type-to-confirm, exact match gates the OK
    run: async () => {
      const res = await api.operatorWsArchive(ws.id);
      if (!res.ok) return govRefusalToast(res);
      await refreshGovernanceWorkspaces();
      toast(t('toast.governanceArchived'));
    },
  });
};
/* 83-02 (D-01/D-03/D-07, T-83-08): the rename modal — staging mirrors the
   orphan modal (S.ui.govEditWs keeps the ORIGINAL slug alongside the live
   edit so the D-03 confirm fork compares against ground truth); the
   chunk-backed custom host renders the governance page's govEditBody.
   Field edits ride data-in handlers — staged state, never the DOM. */
A.govEditAsk = el => {
  const ws = govWsById(el.dataset.id);
  if (!ws) return;
  S.ui.govEditWs = { id: ws.id, name: ws.name || '', slug: ws.slug || '', origSlug: ws.slug || '' };
  S.ui.govEditSuggest = null;
  import('../pages/governance.js')
    .then(m => {
      openModal({ type: 'custom', cls: 'sm', render: () => m.govEditBody(S.ui.govEditWs) });
    })
    .catch(e => {
      console.error(e);
      S.ui.govEditWs = null;
      toast(t('err.serverUnreachable'), { kind: 'err' });
    });
};
IN.govEditName = el => {
  if (S.ui.govEditWs) S.ui.govEditWs.name = el.value;
};
IN.govEditSlug = el => {
  if (S.ui.govEditWs) S.ui.govEditWs.slug = el.value;
};
/* D-07: one click adopts the server's suggested available slug. */
A.govEditAdopt = el => {
  if (S.ui.govEditWs) S.ui.govEditWs.slug = el.dataset.slug || '';
  S.ui.govEditSuggest = null;
  render();
};
A.govEditCancel = () => {
  S.ui.govEditWs = null;
  S.ui.govEditSuggest = null;
  closeModal();
};
A.govEditSave = async () => {
  const ws = S.ui.govEditWs;
  if (!ws) return;
  const name = String(ws.name || '').trim();
  const slug = String(ws.slug || '').trim();
  const slugChanged = slug !== ws.origSlug;
  const run = async () => {
    const res = await api.operatorWsRename(ws.id, { name, slug });
    if (!res.ok) {
      /* D-07: a slugTaken refusal keeps the modal open and offers the
         server's suggestion with one click to adopt. */
      if (res.data?.code === 'slugTaken' && res.data?.suggestion) {
        S.ui.govEditSuggest = res.data.suggestion;
        render();
        return;
      }
      return govRefusalToast(res);
    }
    S.ui.govEditWs = null;
    S.ui.govEditSuggest = null;
    closeModal();
    /* WR-83-01: reconcile the operator's own client workspace state BEFORE the
       governance refresh — the listing refresh writes only S.ui.govWs/govDead;
       without this the loaded workspace keeps the dead slug and the next
       workspace-scoped call 404s. */
    api.renameWorkspaceLocal(ws.id, { name, slug });
    await refreshGovernanceWorkspaces();
    toast(t('toast.governanceRenamed'));
  };
  /* D-03: confirm ONLY on a real slug change — a name-only edit saves
     directly. The confirm body interpolates the OLD slug bold via esc()
     (the 4660 archive/delete precedent) and the type-to-confirm gate
     rides the old slug — the string the operator must own breaking
     (D-82-5: it will 404 permanently, no redirect). */
  if (!slugChanged) return run();
  confirmDlg({
    title: t('page.governance.confirmRenameTitle', { name: name || ws.origSlug }),
    body: t('page.governance.confirmRenameBody', { old: `<b>${esc(ws.origSlug)}</b>`, slug: esc(ws.origSlug) }),
    ok: t('page.governance.okRename'),
    icon: 'pencil',
    danger: true, // red tile — the old slug dies permanently (D-82-5)
    typeName: ws.origSlug,
    run,
  });
};
A.govUnarchive = el => {
  const ws = govWsById(el.dataset.id);
  if (!ws) return;
  confirmDlg({
    title: t('page.governance.confirmUnarchiveTitle', { name: ws.name }),
    body: t('page.governance.confirmUnarchiveBody'),
    ok: t('page.governance.okUnarchive'),
    icon: 'archive',
    danger: false,
    /* D-02 discretion: unarchive is one click + confirm — NO type-to-confirm. */
    run: async () => {
      const res = await api.operatorWsUnarchive(ws.id);
      if (!res.ok) return govRefusalToast(res);
      await refreshGovernanceWorkspaces();
      toast(t('toast.governanceUnarchived'));
    },
  });
};
A.govDeleteAsk = el => {
  const ws = govWsById(el.dataset.id);
  if (!ws) return;
  /* D-05: a delete target WITH members opens the orphan disposition modal
     first — every member is resolved (reassign or release) before the
     delete can execute. A 0-member workspace goes straight to the slug
     type-to-confirm. The server re-checks both regardless (T-79-02). */
  if (ws.memberCount > 0) {
    S.ui.govOrphan = { ws, members: null, targets: null };
    S.ui.govDispositions = {};
    /* Chunk-backed like the assignee picker (66-03 precedent): the orphan
       body renderer lives in the lazy governance page module — preloaded
       before the modal opens so the generic 'custom' host renders the real
       body, never a stranded stub (the members fetch refreshes in behind). */
    import('../pages/governance.js')
      .then(m => {
        openModal({ type: 'custom', cls: 'sm', render: () => m.govOrphanBody(S.ui.govOrphan) });
        refreshGovOrphanMembers(ws.id);
      })
      .catch(e => {
        console.error(e);
        S.ui.govOrphan = null;
        toast(t('err.serverUnreachable'), { kind: 'err' });
      });
    return;
  }
  confirmDlg({
    title: t('page.governance.confirmDeleteTitle', { name: ws.name }),
    body: t('page.governance.confirmDeleteBody', { slug: `<b>${esc(ws.slug)}</b>` }),
    ok: t('page.governance.okDelete'),
    icon: 'trash-2',
    danger: true, // red tile — hard delete is irreversible (D-03)
    typeName: ws.slug,
    run: () => govDelete(ws.id, []),
  });
};
const govDelete = async (id, dispositions) => {
  const res = await api.operatorWsDelete(id, dispositions);
  if (!res.ok) {
    /* D-06: the server's dispositionRequired refusal keeps the orphan modal
       open with its own keyed toast — the operator finishes the list. */
    if (S.ui.govOrphan && res.data?.code === 'dispositionRequired') return govRefusalToast(res);
    S.ui.govOrphan = null;
    closeModal();
    return govRefusalToast(res);
  }
  S.ui.govOrphan = null;
  S.ui.govDispositions = {};
  closeModal();
  await refreshGovernanceWorkspaces();
  toast(t('toast.governanceDeleted'));
};
/* The orphan modal's ground truth: members + reassign targets come from the
   server read (D-08: targets carry name + member count, delete target
   excluded) — never synthesized client-side. */
export async function refreshGovOrphanMembers(id) {
  const res = await api.operatorWsMembers(id);
  if (res.ok && S.ui.govOrphan?.ws?.id === id) {
    S.ui.govOrphan.members = res.data.members || [];
    S.ui.govOrphan.targets = res.data.targets || [];
    render();
  }
}
A.govOrphanPick = el => {
  const uidm = el.dataset.id;
  if (!S.ui.govDispositions) S.ui.govDispositions = {};
  if (el.dataset.v === 'release') S.ui.govDispositions[uidm] = { type: 'release' };
  /* IN-04: with zero reassign targets (every other workspace archived, or the
     last workspace standing) the server would 404 the disposition — refuse
     keyed client-side instead, leaving the member unresolved (D-06). */
  else if (!(S.ui.govOrphan?.targets || []).length) return toast(t('err.noReassignTargets'), { kind: 'err' });
  /* D-08: the reassign default rides the first target + 'member' role; the
     operator refines both in the same step — no multi-step wizard. */
  else S.ui.govDispositions[uidm] = { type: 'reassign', wsId: el.dataset.ws || S.ui.govOrphan?.targets?.[0]?.id || '', role: 'member' };
  render();
};
IN.govDest = el => {
  const d = S.ui.govDispositions?.[el.dataset.id];
  if (d?.type === 'reassign') d.wsId = el.value;
  render();
};
IN.govRole = el => {
  const d = S.ui.govDispositions?.[el.dataset.id];
  if (d?.type === 'reassign') d.role = el.value;
  render();
};
A.govOrphanCancel = () => {
  S.ui.govOrphan = null;
  S.ui.govDispositions = {};
  closeModal();
};
A.govOrphanSubmit = async () => {
  const o = S.ui.govOrphan;
  if (!o?.members) return;
  /* D-06 client half: no submit until every member carries a disposition —
     the button is disabled in the markup; this guard is the second lock.
     The server re-checks completeness regardless (T-79-02). */
  const missing = o.members.some(m => !S.ui.govDispositions?.[m.userId]);
  if (missing) return;
  const dispositions = o.members.map(m => ({ userId: m.userId, ...S.ui.govDispositions[m.userId] }));
  await govDelete(o.ws.id, dispositions);
};
