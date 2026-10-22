/* ---------------- COMMAND PALETTE ---------------- */
import { MOD, clamp, esc, foldForSearch } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { LOGO, ic, wsLogo } from '../core/icons.js';
import { PSTAT } from '../core/constants.js';
import { D, S, allTasks, pColor, proj, roleLabel, save, task, workspaceList as wsList } from '../core/store.js';
import { api } from '../core/api.js';
import { FT, av, hl, stIcon } from '../ui/helpers.js';
import { effectiveDark } from '../core/theme.js';
import { go, render } from '../shell/render.js';
import { sortTasks } from '../shell/view-engine.js';
import { searchAll } from '../pages/search.js';
import { openModal } from './modals.js';
import { A } from '../actions/actions.js';

export function commands() {
  return [
    { id: 'c-task', name: t('palette.createTask'), icon: 'plus', kbd: 'N', run: () => A.newTask(document.body) },
    { id: 'c-proj', name: t('palette.createProject'), icon: 'folder-plus', kbd: 'P', run: () => A.newProject() },
    {
      id: 'c-search',
      name: t('palette.searchWorkspace'),
      icon: 'search',
      kbd: '/',
      run: () => {
        S.ui.palette = { q: '', mode: 'search', scope: 'all', hl: 0 };
        render();
      },
    },
    { id: 'c-home', name: t('nav.goHome'), icon: 'house', kbd: 'G H', run: () => go('home') },
    { id: 'c-inbox', name: t('nav.goInbox'), icon: 'inbox', kbd: 'G I', run: () => go('inbox') },
    { id: 'c-my', name: t('nav.goMyTasks'), icon: 'circle-check', kbd: 'G T', run: () => go('mytasks') },
    { id: 'c-projs', name: t('nav.goProjects'), icon: 'folder-kanban', kbd: 'G P', run: () => go('projects') },
    { id: 'c-cal', name: t('nav.goCalendar'), icon: 'calendar', kbd: 'G C', run: () => go('calendar') },
    { id: 'c-tl', name: t('nav.goTimeline'), icon: 'chart-gantt', run: () => go('timeline') },
    { id: 'c-mem', name: t('nav.goMembers'), icon: 'users', run: () => go('members') },
    { id: 'c-set', name: t('palette.openSettings'), icon: 'settings', kbd: 'G S', run: () => go('settings') },
    { id: 'c-app', name: t('palette.appearanceSettings'), icon: 'palette', run: () => go('settings', { sec: 'appearance' }) },
    {
      id: 'c-ws',
      name: t('palette.switchWorkspace'),
      icon: 'arrow-left-right',
      run: () => {
        S.ui.palette = { q: '', mode: 'ws', hl: 0 };
        render();
      },
    },
    {
      id: 'c-dark',
      name: effectiveDark() ? t('palette.switchToLight') : t('palette.switchToDark'),
      icon: effectiveDark() ? 'sun' : 'moon',
      kbd: MOD + ' ⇧ L',
      run: () => A.toggleDark(),
    },
    { id: 'c-inv', name: t('palette.inviteMember'), icon: 'user-plus', run: () => A.invite() },
    { id: 'c-side', name: t('palette.toggleSidebar'), icon: 'panel-left', kbd: '[', run: () => A.toggleSide() },
    { id: 'c-keys', name: t('palette.keyboardShortcuts'), icon: 'keyboard', kbd: '?', run: () => A.shortcuts() },
    { id: 'c-out', name: t('palette.signOut'), icon: 'log-out', run: () => A.signOut() },
  ].filter(c => api.enabled || c.id !== 'c-ws');
}
/* The navigation command ids: the machine keys the Navigation group filters on —
   the display names are catalogue values, so the filter reads the ids. */
const NAV_CMDS = new Set(['c-home', 'c-inbox', 'c-my', 'c-projs', 'c-cal', 'c-tl', 'c-mem']);
export function paletteItems() {
  const pl = S.ui.palette;
  const q = pl.q.trim();
  const ql = foldForSearch(q).text;
  const groups = [];
  if (pl.mode === 'ws') {
    /* The local demo has one workspace, so there is nothing to switch to. */
    if (!api.enabled) return [];
    groups.push({
      name: t('palette.group.switchWs'),
      items: wsList()
        .filter(w => !q || foldForSearch(w.name).text.includes(ql))
        .map(w => ({
          html: `${wsLogo({ name: w.name, c: w.color }, 20)}`,
          name: w.name,
          sub: `${roleLabel(w.role)} · /w/${w.slug}`,
          run: () => A.switchWs({ dataset: { v: w.slug } }),
        })),
    });
    return groups;
  }
  if (pl.mode === 'cmd') {
    const cmds = commands().filter(c => !q || foldForSearch(c.name).text.includes(ql));
    if (!q) {
      groups.push({ name: t('palette.group.suggestions'), items: cmds.slice(0, 3).concat(cmds.filter(c => c.id === 'c-dark' || c.id === 'c-ws')) });
      const recent = sortTasks(
        allTasks().filter(t => t.assignee === D().me || t.fav),
        { f: 'updated', dir: 1 },
      ).slice(0, 4);
      groups.push({
        name: t('palette.group.recentTasks'),
        items: recent.map(t => ({
          html: stIcon(t.status),
          name: t.title,
          sub: proj(t.project).name,
          r: t.key,
          run: () => A.openTask({ dataset: { id: t.id } }),
        })),
      });
      groups.push({ name: t('palette.group.navigation'), items: cmds.filter(c => NAV_CMDS.has(c.id)) });
      return groups;
    }
    if (cmds.length) groups.push({ name: t('palette.group.commands'), items: cmds.slice(0, 5) });
  }
  const r = searchAll(q);
  const sc = pl.mode === 'search' ? pl.scope : 'all';
  const lim = sc === 'all' ? 4 : 12;
  if (pl.mode === 'search' && !q) {
    groups.push({
      name: t('palette.group.recentSearches'),
      items: (D().recentSearches || []).map(s => ({
        icon: 'history',
        name: s,
        run: () => {
          pl.q = s;
          pl.hl = 0;
          render();
        },
      })),
    });
    const suggested = [
      { icon: 'clock-alert', name: t('palette.suggested.overdue'), run: () => A.goTasks({ dataset: { f: 'overdue' } }) },
      { icon: 'user', name: t('palette.suggested.assignedToMe'), run: () => go('mytasks') },
    ];
    const target = D().projects?.find(p => p.id === 'p1') || D().projects?.[0];
    if (target) {
      suggested.push({
        icon: 'signal-high',
        name: t('palette.highPriorityIn', { name: target.name }),
        run: () => {
          go('project', { id: target.id, tab: 'v:v1' });
        },
      });
      suggested.push({ icon: 'paperclip', name: t('palette.filesIn', { name: target.name }), run: () => go('project', { id: target.id, tab: 'files' }) });
    }
    groups.push({ name: t('palette.group.suggested'), items: suggested });
    return groups;
  }
  if (!q) return groups;
  if (sc === 'all' || sc === 'tasks')
    groups.push({
      name: t('nav.route.tasks'),
      items: r.tasks
        .slice(0, lim)
        .map(t => ({ html: stIcon(t.status), name: t.title, sub: proj(t.project).name, r: t.key, run: () => A.openTask({ dataset: { id: t.id } }) })),
    });
  if (sc === 'all' || sc === 'projects')
    groups.push({
      name: t('nav.route.projects'),
      items: r.projects.slice(0, lim).map(p => ({
        html: `<span class="pdot" style="--c:${pColor(p)}"></span>`,
        name: p.name,
        sub: PSTAT[p.status].name,
        run: () => go('project', { id: p.id }),
      })),
    });
  if (sc === 'all' || sc === 'people')
    groups.push({
      name: t('palette.scope.people'),
      items: r.people.slice(0, lim).map(m => ({ html: av(m.id, 'sm', false), name: m.name, sub: m.title, run: () => go('member', { id: m.id }) })),
    });
  if (sc === 'all' || sc === 'files')
    groups.push({
      name: t('palette.scope.files'),
      items: r.files.slice(0, lim).map(f => ({
        icon: FT[f.type].i,
        name: f.name,
        sub: proj(f.project).name,
        r: f.size,
        run: () => openModal({ type: 'filePreview', file: f, tid: f.task }),
      })),
    });
  if (sc === 'all' || sc === 'comments')
    groups.push({
      name: t('palette.scope.comments'),
      items: r.comments
        .slice(0, lim)
        .map(c => ({ html: av(c.by, 'sm', false), name: c.text, sub: 'on ' + task(c.task).title, run: () => A.openTask({ dataset: { id: c.task } }) })),
    });
  const out = groups.filter(g => g.items.length);
  out.push({
    name: '',
    items: [
      {
        icon: 'search',
        name: t('palette.viewAllResults', { q: q }),
        run: () => {
          S.ui.searchQ = q;
          S.ui.searchCat = sc;
          const recents = Array.isArray(D().recentSearches) ? D().recentSearches : [];
          if (!recents.includes(q)) recents.unshift(q);
          D().recentSearches = recents.slice(0, 5);
          save();
          go('search');
        },
      },
    ],
  });
  return out;
}
export function paletteHtml() {
  const pl = S.ui.palette;
  const groups = paletteItems();
  const flat = groups.flatMap(g => g.items);
  pl._flat = flat;
  pl.hl = clamp(pl.hl, 0, Math.max(flat.length - 1, 0));
  let idx = 0;
  const ph = pl.mode === 'search' ? t('palette.searchPlaceholder') : pl.mode === 'ws' ? t('palette.wsPlaceholder') : t('palette.cmdPlaceholder');
  return `<div class="palette" role="dialog" aria-modal="true" aria-label="${t('palette.commandMenu')}">
    <div class="pal-in">${ic(pl.mode === 'search' ? 'search' : 'command', 17)}${pl.mode !== 'cmd' ? `<span class="badge" style="flex-shrink:0">${pl.mode === 'search' ? t('palette.scope.search') : t('palette.scope.workspace')}</span>` : ''}<input id="pal-in" data-in="palQ" value="${esc(pl.q)}" placeholder="${ph}" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-activedescendant="pi-${pl.hl}"><kbd>Esc</kbd></div>
    ${
      pl.mode === 'search'
        ? `<div class="pal-scope" role="tablist">${[
            ['all', t('palette.scope.all'), 'layers'],
            ['tasks', t('palette.scope.tasks'), 'circle-check'],
            ['projects', t('palette.scope.projects'), 'folder'],
            ['people', t('palette.scope.people'), 'users'],
            ['files', t('palette.scope.files'), 'paperclip'],
            ['comments', t('palette.scope.comments'), 'message-square'],
          ]
            .map(([k, n, i]) => `<button role="tab" class="${pl.scope === k ? 'on' : ''}" data-a="palScope" data-v="${k}">${ic(i, 12)}${n}</button>`)
            .join('')}</div>`
        : ''
    }
    <div class="pal-list" id="pal-list" role="listbox">${
      flat.length
        ? groups
            .map(
              g =>
                `<div class="pal-group">${g.name ? `<div class="pal-sec">${g.name}</div>` : ''}${g.items
                  .map(it => {
                    const i = idx++;
                    return `<div class="pi ${i === pl.hl ? 'hl' : ''}" id="pi-${i}" role="option" aria-selected="${i === pl.hl}" data-a="palRun" data-i="${i}" data-hover-i="${i}">${it.html || ic(it.icon || 'circle', 15)}<span class="trunc">${hl(it.name, pl.q.trim())}</span>${it.sub ? `<span class="sub">${esc(it.sub)}</span>` : ''}<span class="r">${it.r ? `<span class="mono">${esc(it.r)}</span>` : ''}${
                      it.kbd
                        ? it.kbd
                            .split(' ')
                            .map(k => `<kbd>${k}</kbd>`)
                            .join('')
                        : ''
                    }</span></div>`;
                  })
                  .join('')}</div>`,
            )
            .join('')
        : `<div class="empty-state sm"><div class="glyph">${ic('search-x', 18)}</div><h2 class="es-h">${t('palette.noResults')}</h2><p>${t('palette.noResultsHint')}</p></div>`
    }</div>
    <div class="pal-f"><span><kbd>↑</kbd><kbd>↓</kbd>${t('palette.footer.navigate')}</span><span><kbd>↵</kbd>${t('palette.footer.select')}</span>${pl.mode === 'cmd' ? `<span><kbd>Tab</kbd>${t('palette.footer.searchMode')}</span>` : `<span><kbd>⌫</kbd>${t('palette.footer.backToCommands')}</span>`}<span class="sp" style="flex:1"></span><span>${LOGO(12)}</span></div>
  </div>`;
}
