/* ---------------- DESIGN SYSTEM ---------------- */
import { dOff } from '../core/utils.js';
import { t } from '../core/i18n.js';
import { ic } from '../core/icons.js';
import { LABELS, PCOLORS, PRIOS, STATUSES } from '../core/constants.js';
import { S, allTasks, task } from '../core/store.js';
import { av, avStack, empty, lbl, pStatus, prPill, progBar, stPill } from '../ui/helpers.js';
import { sItem } from '../shell/layout.js';
import { sk, skRows } from '../shell/skeletons.js';
import { miniRow } from '../components/task-list.js';
import { kcard } from '../views/board.js';

/* The theme keys stay the stored preference values (data-v); the display
   reads the catalogue. */
const THEME_NAMES = { light: 'popover.themeLight', dark: 'popover.themeDark', system: 'popover.themeSystem' };

export function pageSystem() {
  const tok = (n, v) => `<div class="ds-tok"><div class="c" style="--c:var(${v})"></div><div class="n"><span>${n}</span><code>${v}</code></div></div>`;
  const B = (cls, lab, st = '') => `<button class="btn ${cls} ${st}" ${st === 'dis' ? 'disabled' : ''}>${lab}</button>`;
  const states = ['', 'state-hover', 'state-active', 'state-focus', 'dis', 'is-loading'];
  const stN = [
    'page.design.state.default',
    'page.design.state.hover',
    'page.design.state.active',
    'page.design.state.focus',
    'page.design.state.disabled',
    'page.design.state.loading',
  ];
  return `<div class="page">
    <div class="ph"><div><h1>${t('page.design.title')}</h1><p>${t('page.design.subtitle')}</p></div><div class="acts"><div class="seg">${[
      ['light', 'sun'],
      ['dark', 'moon'],
      ['system', 'monitor'],
    ]
      .map(([k, i]) => `<button class="${S.prefs.theme === k ? 'on' : ''}" data-a="setTheme" data-v="${k}">${ic(i, 13)}${t(THEME_NAMES[k])}</button>`)
      .join('')}</div></div></div>
    <div class="ds-sec" style="margin-top:8px"><h2>${t('page.design.colorTitle')} <span>${t('page.design.colorSub')}</span></h2><div class="ds-grid">${[
      ['page.design.token.background', '--bg'],
      ['page.design.token.sidebar', '--bg-side'],
      ['page.design.token.surface', '--surface'],
      ['page.design.token.surface2', '--surface-2'],
      ['page.design.token.surface3', '--surface-3'],
      ['page.design.token.border', '--border'],
      ['page.design.token.borderStrong', '--border-strong'],
      ['page.design.token.text', '--text'],
      ['page.design.token.text2', '--text-2'],
      ['page.design.token.text3', '--text-3'],
      ['page.design.token.accent', '--accent'],
      ['page.design.token.success', '--green'],
      ['page.design.token.warning', '--amber'],
      ['page.design.token.error', '--red'],
    ]
      .map(([k, v]) => tok(t(k), v))
      .join('')}</div></div>
    <div class="ds-sec"><h2>${t('page.design.statusTitle')} <span>${t('page.design.statusSub')}</span></h2><div class="ds-row">${STATUSES.map(s => `<span class="pillbtn bordered">${stPill(s.id)}</span>`).join('')}</div><div class="ds-row">${PRIOS.map(p => `<span class="pillbtn bordered">${prPill(p.id)}</span>`).join('')}</div><div class="ds-row">${LABELS.map(l => lbl(l.id)).join('')}</div></div>
    <div class="ds-sec"><h2>${t('page.design.typeTitle')} <span>${t('page.design.typeSub')}</span></h2><div class="panel" style="padding:4px 16px">${[
      ['page.design.type.pageTitle', 'var(--fs-2xl)', 600, 'page.design.demo.redesign'],
      ['page.design.type.sectionTitle', 'var(--fs-xl)', 600, 'page.design.demo.deadlines'],
      ['page.design.type.subsection', 'var(--fs-md)', 600, 'page.design.demo.subtasks'],
      ['page.design.type.body', 'var(--fs)', 400, 'page.design.demo.wireframes'],
      ['page.design.type.secondary', 'var(--fs-sm)', 400, 'page.design.demo.updatedAgo'],
      ['page.design.type.metadata', 'var(--fs-xs)', 500, 'page.design.demo.dueTicket'],
      ['page.design.type.label', 'var(--fs-2xs)', 600, 'page.design.demo.workspaceTag'],
    ]
      .map(
        ([k, s, w, ex]) =>
          `<div class="row" style="padding:10px 0;border-bottom:1px solid var(--divider);gap:16px"><span class="faint" style="width:110px;font-size:12px;flex-shrink:0">${t(k)}</span><span class="grow trunc" style="font-size:${s};font-weight:${w};${k === 'page.design.type.label' ? 'letter-spacing:.06em;color:var(--text-3)' : k === 'page.design.type.secondary' || k === 'page.design.type.metadata' ? 'color:var(--text-2)' : ''}">${t(ex)}</span><code class="mono faint" style="font-size:11px">${s.replace('var(', '').replace(')', '')} / ${w}</code></div>`,
      )
      .join('')}</div></div>
    <div class="ds-sec"><h2>${t('page.design.spacingTitle')} <span>${t('page.design.spacingSub')}</span></h2><div class="grid2" style="grid-template-columns:1fr 1fr">
      <div class="panel" style="padding:14px">${[1, 2, 3, 4, 5, 6, 8, 10, 12].map(n => `<div class="row" style="height:22px;font-size:12px"><code class="mono faint" style="width:56px">--s-${n}</code><span style="height:8px;width:var(--s-${n});background:var(--accent);border-radius:2px;opacity:.7"></span><span class="faint">${n * 4}px</span></div>`).join('')}</div>
      <div class="panel" style="padding:14px;display:flex;gap:14px;flex-wrap:wrap;align-items:center">${[
        ['xs', 4],
        ['sm', 6],
        ['', 8],
        ['lg', 10],
      ]
        .map(
          ([k, v]) =>
            `<div class="col" style="align-items:center;gap:6px;font-size:11.5px"><span style="width:48px;height:48px;border:1.5px solid var(--border-strong);border-radius:var(--r${k ? '-' + k : ''});background:var(--surface-2)"></span><span class="faint">${v}px</span></div>`,
        )
        .join('')}${[
        ['card', '--shadow-card'],
        ['pop', '--shadow-pop'],
        ['drag', '--shadow-drag'],
      ]
        .map(
          ([n, v]) =>
            `<div class="col" style="align-items:center;gap:6px;font-size:11.5px"><span style="width:48px;height:48px;border-radius:8px;background:var(--surface);box-shadow:var(${v})"></span><span class="faint">${n}</span></div>`,
        )
        .join('')}</div></div></div>
    <div class="ds-sec"><h2>${t('page.design.buttonsTitle')} <span>${t('page.design.buttonsSub')}</span></h2>
      ${[
        ['btn-primary', 'page.design.btn.createTask'],
        ['btn-secondary', 'page.design.btn.share'],
        ['btn-ghost', 'page.design.btn.filter'],
        ['btn-danger', 'act.delete'],
      ]
        .map(
          ([c, l]) =>
            `<div class="ds-row"><span class="lab">${c.replace('btn-', '')}</span>${states.map((s, i) => `<span class="col" style="gap:4px;align-items:flex-start"><span class="faint" style="font-size:11px">${t(stN[i])}</span>${B(c, t(l), s)}</span>`).join('')}</div>`,
        )
        .join('')}
      <div class="ds-row"><span class="lab">icon</span>${['plus', 'list-filter', 'ellipsis', 'star', 'share-2', 'settings'].map((i, k) => `<button class="ibtn ${k === 1 ? 'on' : ''}" aria-label="${i}" data-tip="${i}">${ic(i, 16)}</button>`).join('')}<button class="ibtn" disabled aria-label="${t('a11y.design.disabled')}">${ic('trash-2', 16)}</button><span class="faint" style="font-size:11.5px">${t('page.design.sizes')}</span><button class="btn btn-secondary btn-sm">${t('page.design.size.small')}</button><button class="btn btn-secondary">${t('page.design.size.medium')}</button><button class="btn btn-secondary btn-lg">${t('page.design.size.large')}</button></div></div>
    <div class="ds-sec"><h2>${t('page.design.inputsTitle')}</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px" class="panel" >
      <div style="padding:14px;display:contents"></div>
      ${[
        ['page.design.input.text', `<input class="input" placeholder="${t('a11y.design.taskName')}" id="ds-1">`],
        [
          'page.design.input.focus',
          `<input class="input" value="Homepage wireframes" style="border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)" id="ds-2">`,
        ],
        [
          'page.design.input.error',
          `<input class="input is-error" value="alex@" id="ds-3"><span class="err">${ic('circle-alert', 12)}${t('page.design.emailError')}</span>`,
        ],
        ['page.design.input.disabled', `<input class="input" value="hello@gr8rstudio.com" disabled id="ds-4">`],
        [
          'page.design.input.search',
          `<div class="inwrap">${ic('search', 13)}<input class="input" placeholder="${t('a11y.design.searchTasks')}" id="ds-5"><span class="kbd">/</span></div>`,
        ],
        [
          'page.design.input.select',
          `<select class="select" id="ds-6"><option>${t('page.design.inProgress')}</option><option>${t('page.design.review')}</option></select>`,
        ],
        [
          'page.design.input.multi',
          `<div class="input" style="height:auto;min-height:30px;display:flex;flex-wrap:wrap;gap:4px;padding:4px">${lbl('design')}${lbl('frontend')}${lbl('qa')}<span class="faint" style="font-size:12px;padding:2px 4px">${t('page.design.addMore')}</span></div>`,
        ],
        ['page.design.input.date', `<input type="date" class="input" value="${dOff(3)}" id="ds-7">`],
        ['page.design.input.time', `<input type="time" class="input" value="14:30" id="ds-8">`],
        [
          'page.design.input.checks',
          `<div class="row" style="gap:14px"><input type="checkbox" class="check" checked aria-label="c1"><input type="checkbox" class="check" aria-label="c2"><input type="checkbox" class="check round" checked aria-label="c3"><input type="radio" class="radio" name="dsr" checked aria-label="r1"><input type="radio" class="radio" name="dsr" aria-label="r2"><input type="checkbox" class="toggle" checked aria-label="t1"><input type="checkbox" class="toggle" aria-label="t2"></div>`,
        ],
        ['page.design.input.textarea', `<textarea class="textarea" rows="2" id="ds-9">${t('page.design.descPlaceholder')}</textarea>`],
        [
          'page.design.input.richText',
          `<div class="rte" style="border-color:var(--border)"><div class="rte-tb" style="opacity:1;border-bottom-color:var(--divider)">${['bold', 'italic', 'list', 'list-ordered', 'heading', 'link'].map(i => `<span class="ibtn ibtn-xs">${ic(i, 13)}</span>`).join('')}</div><div class="rte-body" style="min-height:40px"><b>${t('page.design.bold')}</b>, <i>${t('page.design.italic')}</i>, ${t('page.design.andLists')}</div></div>`,
        ],
      ]
        .map(([k, h]) => `<div class="field" style="padding:14px"><span class="label">${t(k)}</span>${h}</div>`)
        .join('')}</div></div>
    <div class="ds-sec"><h2>${t('page.design.navTitle')}</h2><div class="grid2" style="grid-template-columns:260px 1fr">
      <div class="side" style="border:1px solid var(--border);border-radius:var(--r-lg);padding:8px;height:auto">${sItem('home', t('nav.route.home'), 'house')}<button class="sitem on">${ic('inbox', 16)}<span>${t('page.design.demo.inboxActive')}</span><span class="ct dotc">3</span></button><button class="sitem state-hover">${ic('circle-check', 16)}<span>${t('page.design.demo.mytasksHover')}</span></button><div class="sitem"><span class="pico" style="--c:${PCOLORS.indigo}">${ic('globe', 12)}</span><span>${t('page.design.demo.redesign')}</span><span class="sdot" style="background:var(--blue)"></span></div></div>
      <div class="col" style="gap:14px"><nav class="crumbs" style="border:1px solid var(--border);border-radius:var(--r);padding:6px"><button>${t('page.design.demo.studio')}</button><span class="sep">/</span><button>${t('nav.projects')}</button><span class="sep">/</span><button class="cur">${t('page.design.demo.redesign')}</button></nav>
      <div class="tabs">${['nav.route.overview', 'nav.tab.board', 'nav.tab.list', 'nav.tab.table'].map((k, i) => `<button class="tab ${i === 1 ? 'on' : ''}">${t(k)}</button>`).join('')}</div>
      <div class="row"><div class="seg"><button class="on">${ic('layout-grid', 13)}${t('page.design.seg.grid')}</button><button>${ic('list', 13)}${t('nav.tab.list')}</button><button>${ic('table-2', 13)}${t('nav.tab.table')}</button></div><span class="chip">${ic('circle-dot', 12)}<b>${t('page.field.status')}</b> ${t('page.design.is')} <span>${t('page.design.inProgress')}</span><span class="ibtn">${ic('x', 12)}</span></span></div></div></div></div>
    <div class="ds-sec"><h2>${t('page.design.dataTitle')}</h2><div class="grid2" style="grid-template-columns:300px 1fr">
      <div style="background:var(--sunken);padding:10px;border-radius:var(--r-lg)">${kcard(task('t3') || allTasks()[0])}</div>
      <div class="col" style="gap:12px"><div class="ds-row"><span class="lab">${t('page.design.lab.avatar')}</span>${['m1', 'm2', 'm3'].map(i => av(i, 'sm')).join('')}${av('m4')}${av('m5', 'md')}${av('m6', 'lg')}${av(null)}${avStack(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'], 4, 'md')}</div>
      <div class="ds-row"><span class="lab">${t('page.design.lab.badge')}</span><span class="badge">${t('page.design.state.default')}</span><span class="badge accent">${t('page.design.token.accent')}</span><span class="badge green"><span class="dot"></span>${t('page.design.state.active')}</span><span class="badge amber"><span class="dot"></span>${t('common.invited')}</span><span class="badge red">${t('page.design.badge.overdue')}</span>${pStatus('active')}${pStatus('risk')}</div>
      <div class="ds-row"><span class="lab">${t('page.design.lab.progress')}</span><span style="width:200px;display:flex">${progBar(64)}</span><span style="width:120px;display:flex">${progBar(100, 'green')}</span><span style="width:120px;display:flex">${progBar(30, 'red')}</span></div>
      <div class="panel" style="overflow:hidden">${allTasks()
        .slice(0, 2)
        .map(row => miniRow(row))
        .join('')}</div></div></div></div>
    <div class="ds-sec"><h2>${t('page.design.feedbackTitle')}</h2>
      <div class="col" style="gap:8px;margin-bottom:12px"><div class="alert info">${ic('info', 15)}<span><b>${t('page.design.alert.headsUp')}</b> ${t('page.design.alert.timelineDeps')}</span></div><div class="alert ok">${ic('circle-check', 15)}<span>${t('page.design.alert.archived')} <button class="link">${t('toast.undo')}</button></span></div><div class="alert warn">${ic('triangle-alert', 15)}<span>${t('page.design.alert.dueWeek')}</span></div><div class="alert danger">${ic('circle-alert', 15)}<span>${t('page.design.alert.saveFailed')} <button class="link">${t('toast.tryAgain')}</button></span></div></div>
      <div class="ds-row"><span class="lab">${t('page.design.triggers')}</span><button class="btn btn-secondary" data-a="demoToast" data-v="ok">${t('page.design.trigger.toast')}</button><button class="btn btn-secondary" data-a="demoToast" data-v="err">${t('page.design.trigger.errorToast')}</button><button class="btn btn-secondary" data-tip="${t('a11y.design.tooltipTip')}">${t('page.design.trigger.tooltip')}</button><button class="btn btn-secondary" data-a="newTask">${t('page.design.trigger.modal')}</button><button class="btn btn-secondary" data-a="openTask" data-id="t3">${t('page.design.trigger.drawer')}</button><button class="btn btn-secondary" data-a="demoConfirm">${t('page.design.trigger.confirmation')}</button><button class="btn btn-secondary" data-a="openPalette">${t('page.design.trigger.commandMenu')}</button></div></div>
    <div class="ds-sec"><h2>${t('page.design.iconTitle')} <span>${t('page.design.iconSub')}</span></h2><div class="panel" style="padding:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(40px,1fr));gap:6px;color:var(--text-2)">${['house', 'inbox', 'circle-check', 'star', 'search', 'bell', 'folder-kanban', 'list-checks', 'calendar', 'chart-gantt', 'users', 'activity', 'settings', 'plus', 'list-filter', 'arrow-up-down', 'rows-3', 'share-2', 'ellipsis', 'paperclip', 'message-square', 'tag', 'link', 'copy', 'pencil', 'trash-2', 'archive', 'upload', 'repeat', 'timer', 'git-branch', 'lock', 'eye', 'at-sign', 'sun', 'moon'].map(i => `<span style="height:36px;display:grid;place-items:center" title="${i}">${ic(i, 17)}</span>`).join('')}</div></div>
  </div>`;
}

/* ---------------- SYSTEM STATES GALLERY ---------------- */
export function pageStates() {
  const card = (cap, icon, inner) => `<div class="panel"><div class="cap">${ic(icon, 13)}${cap}</div>${inner}</div>`;
  return `<div class="page wide" style="max-width:1240px">
    <div class="ph"><div><h1>${t('page.states.title')}</h1><p>${t('page.states.subtitle')}</p></div><div class="acts"><button class="btn btn-secondary" data-a="toggleOffline">${ic(S.ui.offline ? 'wifi' : 'wifi-off', 14)}${S.ui.offline ? t('page.states.backOnline') : t('page.states.simulateOffline')}</button></div></div>
    <h2 class="sec" style="margin:8px 0 10px">${t('page.states.emptyTitle')}</h2>
    <div class="states-grid">
      ${card(t('page.states.noProjects'), 'folder-kanban', empty('folder-kanban', t('page.states.noProjectsYet'), t('page.states.createFirst'), `<button class="btn btn-primary btn-sm" data-a="newProject">${ic('plus', 14)}${t('page.states.createProject')}</button>`))}
      ${card(t('page.states.noTasks'), 'list-checks', empty('list-checks', t('page.states.noTasksHere'), t('page.states.addTaskBody'), `<button class="btn btn-primary btn-sm" data-a="newTask">${ic('plus', 14)}${t('act.addTask')}</button>`))}
      ${card(t('page.states.noNotifications'), 'bell', empty('bell-off', t('page.states.caughtUp'), t('page.states.mentionsShowUp')))}
      ${card(t('page.states.noSearchResults'), 'search', empty('search-x', t('page.states.noResults'), t('page.states.noResultsBody'), `<button class="btn btn-secondary btn-sm">${t('page.states.clearSearch')}</button>`))}
    </div>
    <h2 class="sec" style="margin:28px 0 10px">${t('page.states.loadingTitle')}</h2>
    <div class="states-grid">
      ${card(t('page.states.listRows'), 'rows-3', `<div style="padding:4px 10px">${skRows(5)}</div>`)}
      ${card(t('page.states.cards'), 'layout-grid', `<div style="padding:12px"><div class="pcard" style="cursor:default">${sk('28px', 28, 'border-radius:7px')}${sk('60%', 12)}${sk('90%', 9)}${sk('70%', 9)}${sk('100%', 4)}</div></div>`)}
      ${card(t('page.states.boardColumn'), 'square-kanban', `<div style="padding:12px;background:var(--sunken)"><div class="col" style="gap:6px">${[0, 1].map(() => `<div class="kcard" style="cursor:default">${sk('40%', 14)}${sk('80%', 10)}<div class="row">${sk('40px', 9)}<span class="sp"></span>${sk('18px', 18, 'border-radius:50%')}</div></div>`).join('')}</div></div>`)}
      ${card(t('page.states.buttonsPage'), 'loader', `<div style="padding:18px;display:flex;flex-direction:column;gap:14px;align-items:flex-start"><div class="row"><button class="btn btn-primary is-loading">${t('page.states.saving')}</button><button class="btn btn-secondary is-loading">${t('page.states.loading')}</button><button class="btn btn-primary" data-a="demoLoad" id="demo-load">${t('page.states.clickToLoad')}</button></div><div class="row muted" style="font-size:13px">${`<span style="width:16px;height:16px;border-radius:50%;border:2px solid var(--border-strong);border-top-color:var(--accent);animation:spin .7s linear infinite;display:inline-block"></span>`}${t('page.states.loadingProject')}</div><button class="btn btn-ghost btn-sm" data-a="reloadPage">${ic('refresh-cw', 13)}${t('page.states.replaySkeleton')}</button></div>`)}
    </div>
    <h2 class="sec" style="margin:28px 0 10px">${t('page.states.errorTitle')}</h2>
    <div class="states-grid">
      ${card(t('page.states.networkError'), 'wifi-off', `<div class="empty-state err sm"><div class="glyph">${ic('wifi-off', 20)}</div><h3 class="es-h">${t('page.states.offlineTitle')}</h3><p>${t('page.states.offlineBody')}</p><button class="btn btn-secondary btn-sm" data-a="demoToast" data-v="retry">${ic('refresh-cw', 13)}${t('toast.tryAgain')}</button></div>`)}
      ${card(t('page.states.failedToLoad'), 'cloud-alert', `<div class="empty-state err sm"><div class="glyph">${ic('cloud-alert', 20)}</div><h3 class="es-h">${t('page.states.somethingWentWrong')}</h3><p>${t('page.states.loadFailedBody')}</p><button class="btn btn-secondary btn-sm" data-a="demoToast" data-v="retry">${t('toast.tryAgain')}</button></div>`)}
      ${card(t('page.states.failedToSave'), 'circle-alert', `<div style="padding:18px" class="col"><div class="alert danger" style="margin-bottom:10px">${ic('circle-alert', 15)}<div><b>${t('page.design.alert.saveFailed')}</b><div class="muted">${t('page.states.serverTimeout')}</div></div></div><button class="btn btn-secondary btn-sm" style="align-self:flex-start" data-a="demoToast" data-v="err">${t('page.states.showAsToast')}</button></div>`)}
      ${card(t('page.states.permissionDenied'), 'lock', `<div class="empty-state sm"><div class="glyph">${ic('lock', 20)}</div><h3 class="es-h">${t('page.states.noAccess')}</h3><p>${t('page.states.portalPrivate')}</p><button class="btn btn-secondary btn-sm" data-a="go" data-r="project" data-id="p6">${t('page.states.openExample')}</button></div>`)}
      ${card(t('page.states.notFound'), 'file-question', `<div class="empty-state sm"><div class="glyph">${ic('file-question', 20)}</div><h3 class="es-h">${t('page.states.notFound')}</h3><p>${t('page.states.notFoundBody')}</p><button class="btn btn-secondary btn-sm" data-a="go" data-r="nowhere">${t('page.states.openExample')}</button></div>`)}
      ${card(t('page.states.formValidation'), 'text-cursor-input', `<div style="padding:18px" class="col"><div class="field"><label class="label" for="st-e">${t('common.email')}</label><input class="input is-error" id="st-e" value="hello@gr8rstudio" aria-invalid="true"><span class="err">${ic('circle-alert', 12)}${t('page.states.emailErrorLong')}</span></div></div>`)}
    </div>
    <h2 class="sec" style="margin:28px 0 10px">${t('page.states.confirmTitle')}</h2>
    <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn btn-secondary" data-a="delProject" data-id="p5" data-demo="1">${ic('trash-2', 14)}${t('act.deleteProject')}</button><button class="btn btn-secondary" data-a="delTask" data-id="t10" data-demo="1">${ic('trash-2', 14)}${t('act.deleteTask')}</button><button class="btn btn-secondary" data-a="removeMember" data-id="m8" data-demo="1">${ic('user-minus', 14)}${t('page.states.removeMember')}</button><button class="btn btn-secondary" data-a="archiveProject" data-id="p7" data-demo="1">${ic('archive', 14)}${t('page.states.archiveProject')}</button></div>
    <p class="faint" style="font-size:12.5px;margin-top:8px">${t('page.states.demoNote')}</p>
  </div>`;
}
