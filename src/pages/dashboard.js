/* =====================================================================
   ADMIN DASHBOARD (Phase 60, DASH-01..04, D-01..D-10)
   One screen, four panels — no tabs (D-02): Overdue per project,
   Load per member, Upcoming, Recent activity (24h/7d/30d presets).
   =====================================================================
   The page renders ONLY from the GET /dashboard response (T-60-05) —
   never from visibleProjects()/allTasks(): the client document is the
   redacted copy, and the server aggregate is the ground truth. The one
   client-side doc read below is the key→id resolution that lets a
   server-returned task key open the existing drawer, and the id→name
   lookups for activity rows' deep links — display data (names, dates,
   counts, verbs) is taken verbatim from the payload; the client does NO
   date math and no window computation (D-06/D-10: the server already
   grouped, filtered and sorted). A member deep-linking the URL gets the
   server 403 surfaced, never a blank page or a client-side guess
   (D-52-4). Skeletons are first-visit only (D-03); afterwards the 30 s
   poll swaps panel HTML in place (D-05). */
import { esc, relDate } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { D, S } from '../core/store.js';
import { t } from '../core/i18n.js';
import { api } from '../core/api.js';
import { av, empty } from '../ui/helpers.js';
import { actHtml } from '../components/task-list.js';
import { ROUTE_TEARDOWN, render } from '../shell/render.js';

/* The one fill loop: a monotonic sequence guards against a stale fetch
   overwriting a newer window selection or a newer route (the fillPage
   pattern). Every fetch aborts the previous in-flight read (D-05). */
let fillSeq = 0;
let timer = null;
let inflight = null;

async function fill() {
  const my = ++fillSeq;
  inflight?.abort();
  inflight = new AbortController();
  const res = await api.dashboard(S.ui.dashWindow || '7d', { signal: inflight.signal });
  if (my !== fillSeq || S.ui.route !== 'dashboard') return;
  if (res.ok) {
    S.ui.dashData = res.data;
    S.ui.dashDataWindow = S.ui.dashWindow || '7d';
    S.ui.dashErr = null;
  } else S.ui.dashErr = { status: res.status };
  render();
}

/* Phase 60 (D-05): the 30 s rhythm matches the notification poll in main.js.
   It starts after the first fill lands (skeletons are first-visit only) and
   tears down on route exit through the shared registry in render.js —
   go() calls it whenever navigation leaves 'dashboard'. */
function startPoll() {
  if (timer) return;
  timer = setInterval(fill, 30000);
  ROUTE_TEARDOWN.dashboard = () => {
    if (timer) clearInterval(timer);
    timer = null;
    fillSeq++; // an in-flight fill drops on arrival
    inflight?.abort();
    inflight = null;
  };
}

/* The task drawer is keyed by the client document's id; the payload carries
   the key (machine identifiers stay on the wire). Resolve key→id for the
   drawer attribute only — never for display (T-60-05). */
const taskIdByKey = key => (D().tasks || []).find(x => (x.key || x.id) === key)?.id || null;
const projName = id => ((D().projects || []).find(p => p.id === id) || {}).name || '';
const taskRowHtml = (tk, showProject = false) => {
  const id = taskIdByKey(tk.key);
  const openAttrs = id ? `data-a="openTask" data-id="${esc(id)}" role="button" tabindex="0"` : '';
  return `<div class="mini" ${openAttrs}><span class="key faint" style="font-size:12px">${esc(tk.key)}</span><span class="tt">${esc(tk.name)}</span>${showProject && tk.projectId ? `<span class="pj hide-m faint" style="font-size:12px">${esc(projName(tk.projectId))}</span>` : ''}<span class="sp"></span><span class="faint" style="font-size:12px">${esc(relDate(tk.due))}</span></div>`;
};

const panel = (title, n, body) =>
  `<section class="panel"><div class="panel-h"><h2>${title}</h2><span class="faint">${n}</span></div>${body}</section>`;
const busyBody = () => `<div class="panel-b faint" aria-busy="true">${t('page.dashboard.loading')}</div>`;
const emptyBody = (icon, title, body) => empty(icon, title, body, '', 'sm', 3);

export function pageDashboard() {
  const w = S.ui.dashWindow || '7d';
  /* The server decision, surfaced verbatim (DASH-04/D-52-4): the gate is the
     server's 403; the page only reports it — keyed message, home way out. */
  if (S.ui.dashErr?.status === 403)
    return `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.dashboard')}</h1><p>${t('err.adminOnly')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
  if (S.ui.dashErr?.status)
    return `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="dashRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

  const d = S.ui.dashData;
  const loading = !d;
  /* First visit (no payload yet) or a window switch still in flight: kick the
     fetch — the panels below render busy placeholders until it lands. */
  if (loading || S.ui.dashDataWindow !== w) fill();
  if (loading) startPoll();

  const overdue = d?.overdue || [];
  const load = d?.load || [];
  const upcoming = d?.upcoming || [];
  const activity = d?.activity || [];

  /* Overdue: grouped per project (server-sorted), group header deep-links to
     the project, task rows ride the existing drawer path (D-09). */
  const overdueBody = loading
    ? busyBody()
    : overdue.length
      ? overdue
          .map(
            g =>
              `<div class="mini" data-a="go" data-r="project" data-id="${esc(g.projectId)}" role="link" tabindex="0"><span class="tt" style="font-weight:600">${esc(g.projectName)}</span><span class="sp"></span><span class="badge amber">${g.tasks.length}</span></div>${g.tasks.map(tk => taskRowHtml(tk)).join('')}`,
          )
          .join('')
      : emptyBody('check', t('page.dashboard.emptyOverdue'), t('page.dashboard.emptyOverdueBody'));

  /* Load per member: pure stat rows {name, count}, server-sorted count desc
     (D-08) — rendered verbatim, never re-derived from the client doc. */
  const loadBody = loading
    ? busyBody()
    : load.length
      ? load.map(r => `<div class="mini" style="min-height:48px" data-a="go" data-r="member" data-id="${esc(r.memberId)}">${av(r.memberId, 'md', false)}<div class="grow"><div style="font-weight:500">${esc(r.name)}</div></div><span class="badge">${r.count}</span></div>`).join('')
      : emptyBody('circle-check', t('page.dashboard.emptyLoad'), t('page.dashboard.emptyLoadBody'));

  /* Upcoming: flat rows, server-sorted by due — dates render verbatim. */
  const upcomingBody = loading
    ? busyBody()
    : upcoming.length
      ? upcoming.map(tk => taskRowHtml(tk, true)).join('')
      : emptyBody('calendar', t('page.dashboard.emptyUpcoming'), t('page.dashboard.emptyUpcomingBody'));

  /* Activity: the preset selector re-fetches with the whitelisted param
     (D-06); rows ride the shared actHtml renderer — the same machine-verb
     vocabulary as the rest of the app. */
  const segBtn = ([v, key]) =>
    `<button class="${w === v ? 'on' : ''}" data-a="set" data-k="dashWindow" data-v="${v}" aria-pressed="${w === v}">${t(key)}</button>`;
  const activityBody =
    `<div class="row" style="gap:8px;margin-bottom:10px"><div class="seg" role="group" aria-label="${t('page.dashboard.activityWindow')}">${[
      ['24h', 'page.dashboard.win24h'],
      ['7d', 'page.dashboard.win7d'],
      ['30d', 'page.dashboard.win30d'],
    ]
      .map(segBtn)
      .join('')}</div></div>` +
    (loading ? busyBody() : activity.length ? `<div class="panel-b feed">${activity.map(a => actHtml(a)).join('')}</div>` : `<div class="panel-b faint">${t('page.dashboard.emptyActivity')}</div>`);

  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${t('nav.route.dashboard')}</h1><p>${t('page.dashboard.subtitle', { ws: esc(D().ws.name) })}</p></div></div>
    <div class="grid2" style="align-items:start">
      <div class="stack">
        ${panel(t('page.filter.overdue'), overdue.length, overdueBody)}
        ${panel(t('page.dashboard.load'), load.length, loadBody)}
      </div>
      <div class="stack">
        ${panel(t('page.home.tab.upcoming'), upcoming.length, upcomingBody)}
        ${panel(t('page.home.recentActivity'), activity.length, activityBody)}
      </div>
    </div>
  </div>`;
}
