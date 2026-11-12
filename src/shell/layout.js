/* ---------- shell ---------- */
import { TODAY, diffD, esc, modKey, parse } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, mem, myNotifs, pColor, proj, team, teamsList, visibleProjects } from '../core/store.js';
import { api } from '../core/api.js';
import { av } from '../ui/helpers.js';
import { t } from '../core/i18n.js';
import { ROUTE_IDS, routeName } from './render.js';
import { skeleton } from './skeletons.js';
import { pageHome } from '../pages/home.js';
import { pageOverview } from '../pages/overview.js';
import { pageMyTasks } from '../pages/my-tasks.js';
import { pageTasks } from '../pages/tasks.js';
import { pageInbox } from '../pages/inbox.js';
import { pageNotifications } from '../pages/notifications.js';
import { pageFavorites } from '../pages/favorites.js';
import { pageProjects } from '../pages/projects.js';
import { page404, stateFailed } from '../pages/errors.js';
import { pageProject } from '../pages/project.js';
import { pageWsCalendar } from '../views/calendar.js';
import { pageWsTimeline } from '../views/timeline.js';
import { pageArchive } from '../features/archive.js';

/* Page loaders (DELIV-02 split): every route resolves through P. First-paint
   routes stay synchronous — their page module is statically imported above and
   the loader returns its HTML without a network fetch, so home (and every
   entry-resident route) keeps today's first paint exactly. Heavy non-first-paint
   modules return a dynamic import; the loader's promise resolves after the shell
   has painted skeleton() into #main-content, which fillPage() then replaces
   (async-render contract the remaining splits reuse). Keep the P[r] || 404
   fallback semantics: the 404 page resolves synchronously. */
const ASYNC_ROUTES = new Set(['settings', 'members', 'member', 'teams', 'team', 'system', 'states', 'activity', 'search']);
const P = {
  home: () => pageHome(),
  inbox: () => pageInbox(),
  mytasks: () => pageMyTasks(),
  favorites: () => pageFavorites(),
  notifications: () => pageNotifications(),
  search: () => import('../pages/search.js').then(m => m.pageSearch()),
  overview: () => pageOverview(),
  projects: () => pageProjects(),
  project: () => pageProject(),
  tasks: () => pageTasks(),
  calendar: () => pageWsCalendar(),
  timeline: () => pageWsTimeline(),
  members: () => import('../pages/members.js').then(m => m.pageMembers()),
  member: () => import('../pages/members.js').then(m => m.pageMember()),
  teams: () => import('../pages/members.js').then(m => m.pageTeams()),
  team: () => import('../pages/members.js').then(m => m.pageTeam()),
  activity: () => import('../pages/activity.js').then(m => m.pageActivity()),
  settings: () => import('../pages/settings.js').then(m => m.pageSettings()),
  system: () => import('../pages/design-system.js').then(m => m.pageSystem()),
  states: () => import('../pages/design-system.js').then(m => m.pageStates()),
  archive: () => pageArchive(),
};
const NOT_FOUND = () => page404();

/* Synchronous page HTML for the shell template. Returns null for async-loader
   routes — the caller paints skeleton() as the loading state and fillPage()
   replaces it when the dynamic import resolves. */
export function renderPageSync() {
  const r = S.ui.route;
  if (ASYNC_ROUTES.has(r)) return null;
  try {
    return (P[r] || NOT_FOUND)();
  } catch (e) {
    console.error(e);
    return stateFailed();
  }
}

/* The awaited form of the same loader map. A rejected page import surfaces
   stateFailed() — never a permanently stuck skeleton. */
export async function renderPage() {
  const r = S.ui.route;
  try {
    return await (P[r] || NOT_FOUND)();
  } catch (e) {
    console.error(e);
    return stateFailed();
  }
}

/* Async fill for async-loader routes: after render() has painted the shell with
   the skeleton in #main-content, await the loader and swap in the page HTML.
   A monotonic sequence guards against a stale fill overwriting a newer render,
   and a rejected import falls back to stateFailed() in the same slot. */
let _fillSeq = 0;
export async function fillPage() {
  if (S.ui.auth || S.ui.loading) return;
  const r = S.ui.route;
  if (!ASYNC_ROUTES.has(r)) return;
  const seq = ++_fillSeq;
  try {
    const html = await renderPage();
    if (seq !== _fillSeq || S.ui.auth || S.ui.route !== r || S.ui.loading) return;
    const el = document.getElementById('main-content');
    if (el) el.innerHTML = html;
  } catch (e) {
    console.error(e);
    if (seq === _fillSeq) {
      const el = document.getElementById('main-content');
      if (el) el.innerHTML = stateFailed();
    }
  }
}

export function renderShell() {
  const u = S.ui;
  return `<button class="skip" data-a="skipToContent">${t('a11y.skipToContent')}</button><div class="shell ${u.collapsed ? 'collapsed' : ''} ${u.mnav ? 'mnav' : ''} ${u.fx.tabs ? 'fx-tabs' : ''}">
    ${renderSidebar()}
    ${u.mnav ? '<div class="side-scrim" data-a="closeMnav"></div>' : ''}
    <main class="main" id="main">
      ${renderTopbar()}
      ${u.offline ? `<div class="offline-bar" role="alert">${ic('wifi-off', 15)}<span><b>${t('nav.offlineTitle')}</b> ${t('nav.offlineBody')}</span><span class="sp"></span><button class="btn btn-sm btn-secondary" data-a="retryOnline">${t('toast.tryAgain')}</button></div>` : ''}
      <div class="content ${u.fx.route ? 'fx-route' : ''}" id="main-content" tabindex="-1" data-keep="c:${u.route}:${u.params.id || ''}:${u.params.tab || ''}:${u.params.sec || ''}">${u.loading ? skeleton() : (renderPageSync() ?? skeleton())}</div>
    </main>
    ${renderBottomNav()}
  </div>`;
}
export function sItem(route, label, icon, opt = {}) {
  const on = S.ui.route === route && (!opt.id || S.ui.params.id === opt.id);
  return `<button class="sitem ${on ? 'on' : ''}" data-a="${opt.act || 'go'}" data-r="${route}" ${opt.id ? `data-id="${opt.id}"` : ''} ${S.ui.collapsed ? `data-tip="${esc(label)}" data-tip-pos="right"` : ''} ${on ? 'aria-current="page"' : ''}>${ic(icon, 16)}<span class="trunc">${esc(label)}</span>${opt.ct ? `<span class="ct ${opt.dot ? 'dotc' : ''}">${opt.ct}</span>` : ''}${opt.kbd ? `<span class="ct hide-m"><kbd>${opt.kbd}</kbd></span>` : ''}</button>`;
}
/* Phase 43 (D-06/D-10): the browser tab follows the workspace logo client-side.
   Runs on every sidebar render (i.e. whenever a workspace context is live) and is
   idempotent; the per-surface fallback is /favicon.svg. URL comes solely from
   workspacePayload.logo (D-11) — never hand-built. No service-worker/manifest involvement. */
export function applyWsFavicon() {
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = api.workspace?.logo?.url || '/favicon.svg';
}
export function renderSidebar() {
  const u = S.ui,
    d = D();
  applyWsFavicon();
  const unreadInbox = myNotifs().filter(n => !n.read && n.type !== 'update').length;
  const unreadAll = myNotifs().filter(n => !n.read).length;
  const myOpen = allTasks().filter(tk => tk.assignees?.includes(d.me) && tk.status !== 'done' && tk.due && diffD(parse(tk.due), TODAY) <= 0).length;
  const projs = visibleProjects().filter(p => p.status !== 'complete');
  const inProj = u.route === 'project' ? u.params.id : null;
  return `<nav class="side" aria-label="${t('a11y.mainNav')}">
    <div class="side-top">
      <div class="row" style="gap:2px">
        <button class="ws grow" data-a="pop" data-pop="ws" aria-haspopup="menu" aria-label="${t('a11y.switchWorkspace')}">
          ${wsLogo({ ...d.ws, logo: api.workspace?.logo || null }, 22)}
          <span class="ws-name trunc">${esc(d.ws.name)}</span>
          <span class="chev-d faint">${ic('chevrons-up-down', 13)}</span>
        </button>
        ${u.collapsed ? '' : `<button class="ibtn ibtn-sm hide-m" data-a="toggleSide" data-tip="${t('a11y.collapseSidebarTip')}" aria-label="${t('a11y.collapseSidebar')}">${ic('panel-left', 15)}</button>`}
      </div>
    </div>
    <div class="side-scroll" data-keep="side">
      ${u.collapsed ? `<button class="sitem" data-a="toggleSide" data-tip="${t('a11y.expandSidebar')}" data-tip-pos="right" aria-label="${t('a11y.expandSidebar')}">${ic('panel-left', 16)}</button>` : ''}
      ${sItem('home', routeName('home'), 'house')}
      ${sItem('inbox', routeName('inbox'), 'inbox', { ct: unreadInbox || '', dot: true })}
      ${sItem('mytasks', routeName('mytasks'), 'circle-check', { ct: myOpen || '' })}
      ${sItem('favorites', routeName('favorites'), 'star')}
      ${sItem('notifications', routeName('notifications'), 'bell', { ct: unreadAll || '' })}
      <div class="sgroup">
        <div class="sgroup-h">${t('common.workspace')}</div>
        ${sItem('overview', routeName('overview'), 'layout-dashboard')}
        ${sItem('projects', routeName('projects'), 'folder-kanban')}
        ${sItem('tasks', routeName('tasks'), 'list-checks')}
        ${sItem('calendar', routeName('calendar'), 'calendar')}
        ${sItem('timeline', routeName('timeline'), 'chart-gantt')}
        ${sItem('members', routeName('members'), 'users')}
        ${sItem('activity', routeName('activity'), 'activity')}
      </div>
      <div class="sgroup" id="side-projects">
        <div class="sgroup-h"><span>${routeName('projects')}</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="newProject" data-tip="${t('a11y.newProjectTip')}" aria-label="${t('a11y.newProject')}">${ic('plus', 14)}</button></div>
        ${projs
          .map(p => {
            const on = inProj === p.id;
            return `<div class="sproj" data-proj-drop="${p.id}">
            <div class="sitem ${on ? 'on' : ''}" draggable="true" data-drag-proj="${p.id}" data-a="go" data-r="project" data-id="${p.id}" data-ctx="project" role="link" tabindex="0" ${u.collapsed ? `data-tip="${esc(p.name)}" data-tip-pos="right"` : ''}>
              <span class="pico" style="--c:${pColor(p)}">${ic(p.icon, 12)}</span>
              <span class="trunc">${esc(p.name)}</span>
              ${p.fav ? `<span class="fav">${ic('star', 11)}</span>` : ''}
              ${p.private ? `<span class="faint" style="margin-left:4px">${ic('lock', 11)}</span>` : ''}
              <span class="sdot" style="background:${PSTAT[p.status].c}" title="${PSTAT[p.status].name}"></span>
              <span class="hov"><span class="ibtn ibtn-xs" data-a="ctxBtn" data-ctx="project" data-id="${p.id}" aria-label="${t('a11y.projectOptions')}">${ic('ellipsis', 14)}</span></span>
            </div>
          </div>`;
          })
          .join('')}
        ${sItem('archive', routeName('archive'), 'archive', { ct: D().tasks.filter(tk => tk.archived).length + D().projects.filter(p => p.archived).length || '' })}
      </div>
      <div class="sgroup">
        <div class="sgroup-h"><span>${routeName('teams')}</span><span class="sp"></span><button class="ibtn ibtn-xs" data-a="newTeam" data-tip="${t('a11y.newTeam')}" aria-label="${t('a11y.newTeam')}">${ic('plus', 14)}</button></div>
        ${teamsList()
          .map(tm => sItem('team', tm.name, tm.icon, { id: tm.id }))
          .join('')}
      </div>
    </div>
    <div class="side-bot">
      <button class="sitem" data-a="pop" data-pop="help" ${u.collapsed ? `data-tip="${t('nav.help')}" data-tip-pos="right"` : ''}>${ic('circle-help', 16)}<span>${t('nav.helpResources')}</span></button>
      ${sItem('settings', routeName('settings'), 'settings')}
      <button class="sitem" data-a="pop" data-pop="user" style="height:36px" ${u.collapsed ? `data-tip="${t('nav.profile')}" data-tip-pos="right"` : ''}>${av(d.me, 'presence', false)}<span class="trunc" style="color:var(--text);font-weight:500">${esc(S.prefs.name)}</span><span class="ct">${ic('chevrons-up-down', 13)}</span></button>
    </div>
  </nav>`;
}

export function crumbs() {
  const u = S.ui,
    r = u.route,
    out = [];
  const c = (label, act = '', cur = false, icon = '') => `<button class="${cur ? 'cur' : ''}" ${act}>${icon}${esc(label)}</button>`;
  if (r === 'project') {
    const p = proj(u.params.id);
    out.push(c(routeName('projects'), 'data-a="go" data-r="projects"'));
    if (p)
      out.push(
        c(
          p.name,
          `data-a="go" data-r="project" data-id="${p.id}" data-tab="overview"`,
          true,
          `<span class="pico" style="--c:${pColor(p)};width:16px;height:16px;border-radius:4px;display:grid;place-items:center;color:${pColor(p)}">${ic(p.icon, 11)}</span>`,
        ),
      );
  } else if (r === 'member') {
    out.push(c(routeName('members'), 'data-a="go" data-r="members"'));
    out.push(c(mem(u.params.id)?.name || routeName('member'), '', true));
  } else if (r === 'team') {
    out.push(c(routeName('teams'), 'data-a="go" data-r="teams"'));
    out.push(c(team(u.params.id)?.name || routeName('team'), '', true));
  } else if (r === 'settings') {
    out.push(c(routeName('settings'), '', true));
  } else out.push(c(ROUTE_IDS.includes(r) ? routeName(r) : t('nav.notFound'), '', true));
  return out.join('<span class="sep">/</span>');
}
export function renderTopbar() {
  return `<header class="topbar">
    <button class="ibtn" data-a="openMnav" aria-label="${t('a11y.openNavigation')}" style="display:none" id="mnav-btn">${ic('menu', 17)}</button>
    <style>@media(max-width:900px){#mnav-btn{display:inline-flex!important}}</style>
    <nav class="crumbs trunc" aria-label="${t('a11y.breadcrumb')}">${crumbs()}</nav>
    <span class="sp"></span>
    <button class="topsearch" data-a="openPalette" aria-label="${t('a11y.searchAndCommands')}">${ic('search', 14)}<span class="lbltxt">${t('nav.searchOrJumpTo')}</span><span class="kbd">${modKey()}K</span></button>
    <button class="ibtn" data-a="go" data-r="notifications" data-tip="${routeName('notifications')}" aria-label="${routeName('notifications')}">${ic('bell', 16)}${myNotifs().some(n => !n.read) ? '<span style="position:absolute;top:6px;right:7px;width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 2px var(--surface)"></span>' : ''}</button>
    <button class="btn btn-secondary btn-sm" data-a="pop" data-pop="create" aria-haspopup="menu" aria-label="${t('a11y.createNew')}">${ic('plus', 14)}<span class="hide-m">${t('act.new')}</span>${ic('chevron-down', 12, 'hide-m')}</button>
    <button class="ibtn hide-m" data-a="pop" data-pop="user" aria-label="${t('a11y.accountMenu')}" style="width:auto;padding:0 2px">${av(D().me, 'md', false)}</button>
  </header>`;
}
export function renderBottomNav() {
  const r = S.ui.route;
  const unread = myNotifs().some(n => !n.read && n.type !== 'update');
  const b = (route, label, icon, extra = '') =>
    `<button class="${r === route ? 'on' : ''}" data-a="go" data-r="${route}">${ic(icon, 19)}<span>${label}</span>${extra}</button>`;
  return `<nav class="bottomnav" aria-label="${t('a11y.primaryNav')}">
    ${b('home', routeName('home'), 'house')}${b('mytasks', routeName('mytasks'), 'circle-check')}${b('projects', routeName('projects'), 'folder-kanban')}${b('inbox', routeName('inbox'), 'inbox', unread ? '<span class="bdot"></span>' : '')}
    <button data-a="openMnav">${ic('ellipsis', 19)}<span>${t('nav.more')}</span></button>
  </nav>`;
}
