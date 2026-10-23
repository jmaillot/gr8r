/* =====================================================================
   SETTINGS · AUTH · ONBOARDING · DESIGN SYSTEM · SYSTEM STATES
   ===================================================================== */
import { availableLocales, formatDate, formatTime, getLocale, isAutoDateFmt, t } from '../core/i18n.js';
import { dOff, esc, fmtDate } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { D, S, isMemberAdmin, me } from '../core/store.js';
import { api } from '../core/api.js';
import { av, pIcon } from '../ui/helpers.js';
import { permsTable, teamsGrid } from './members.js';
import { page404 } from './errors.js';
import { SHORTCUTS } from '../overlays/modals.js';

/* The samples the format previews are computed from: a fixed day and a fixed
   time, so a preview never changes with the current date. */
const SAMPLE_DATE = new Date(2026, 9, 1);
const SAMPLE_TIME = new Date(2026, 9, 1, 14, 30);

/* The lookup tables that turn a stored preference value into its catalogue
   key: the accent swatches' data-tip and the density segments' label. The
   stored values stay the machine ids (data-v / data-k), the display reads
   the catalogue. */
const ACCENT_TIPS = {
  indigo: 'settings.accent.indigo',
  blue: 'settings.accent.blue',
  violet: 'settings.accent.violet',
  teal: 'settings.accent.teal',
  rose: 'settings.accent.rose',
  graphite: 'settings.accent.graphite',
};
const DENSITY_LABELS = { comfortable: 'settings.density.comfortable', compact: 'settings.density.compact' };

export const SET_NAV = [
  [
    'modal.sc.general',
    [
      ['workspace', 'settings.nav.workspace', 'building-2'],
      ['appearance', 'settings.nav.appearance', 'palette'],
      ['language', 'settings.language.title', 'languages'],
      ['datetime', 'settings.nav.datetime', 'clock'],
    ],
  ],
  [
    'common.workspace',
    [
      ['members', 'nav.route.members', 'users'],
      ['teams', 'nav.route.teams', 'users-round'],
      ['projects', 'nav.route.projects', 'folder-kanban'],
      ['permissions', 'settings.nav.permissions', 'shield'],
    ],
  ],
  [
    'nav.route.notifications',
    [
      ['notif-email', 'settings.nav.email', 'mail'],
      ['notif-push', 'settings.nav.push', 'smartphone'],
      ['notif-mentions', 'settings.nav.mentions', 'at-sign'],
      ['notif-assign', 'settings.nav.assignments', 'user-check'],
    ],
  ],
  [
    'settings.group.personal',
    [
      ['profile', 'settings.nav.profile', 'user'],
      ['preferences', 'settings.nav.preferences', 'sliders-horizontal'],
      ['shortcuts', 'settings.nav.shortcuts', 'keyboard'],
    ],
  ],
  [
    'settings.group.security',
    [
      ['password', 'settings.nav.password', 'key-round'],
      ['sessions', 'settings.nav.sessions', 'monitor-smartphone'],
      ['2fa', 'settings.nav.twoFactor', 'shield-check'],
    ],
  ],
];
export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
export const tog = (k, on, src = 'pref') =>
  `<input type="checkbox" class="toggle" data-in="${src}Toggle" data-k="${k}" ${on ? 'checked' : ''} aria-label="${k}">`;
export const sel = (k, opts, v) =>
  `<select class="select" style="width:auto;min-width:180px" data-in="prefSel" data-k="${k}" aria-label="${k}">${opts
    .map(o => {
      const [val, n] = Array.isArray(o) ? o : [o, o];
      return `<option value="${val}" ${String(v) === String(val) ? 'selected' : ''}>${n}</option>`;
    })
    .join('')}</select>`;
/* The language row's own select (Pitfall 3): a dedicated data-in key, never the shared
   preference-document key, so a language change can never reach S.prefs or save(). The
   options come straight from the registry — the honest selector offers only what exists. */
export const langSel = v =>
  `<select class="select" style="width:auto;min-width:180px" data-in="langSel" aria-label="${t('settings.language.title')}">${availableLocales()
    .map(l => `<option value="${l.code}" ${v === l.code ? 'selected' : ''}>${l.name}</option>`)
    .join('')}</select>`;
export function pageSettings() {
  const sec = S.ui.params.sec || S.ui.settings || 'appearance';
  const title = SET_NAV.flatMap(g => g[1]).find(x => x[0] === sec) || ['appearance', 'settings.nav.appearance'];
  return `<div class="set">
    <nav class="set-nav" aria-label="${t('nav.route.settings')}">${SET_NAV.map(([g, items]) => `<div class="gh">${t(g)}</div>${items.map(([k, n, i]) => `<button class="sitem ${sec === k ? 'on' : ''}" data-a="go" data-r="settings" data-sec="${k}">${ic(i, 15)}<span>${t(n)}</span></button>`).join('')}`).join('')}</nav>
    <div class="set-body" data-keep="set:${sec}"><div class="set-in">${settingsBody(sec, title[1])}</div></div>
  </div>`;
}
export function settingsBody(sec, title) {
  const P = S.prefs;
  const d = D();
  const np = d.notifPrefs;
  const H = lead => `<h1>${t(title)}</h1><p class="lead">${lead}</p>`;
  switch (sec) {
    case 'workspace': {
      const wsAdmin = !api.enabled || api.workspace?.role === 'owner' || api.workspace?.role === 'admin';
      return (
        H(t('settings.ws.lead')) +
        `
      <form data-submit="saveWorkspace">
      <div class="sblock" style="margin-top:0"><div class="row" style="gap:14px;margin-bottom:18px">${wsLogo(d.ws, 52)}<div><div class="label" style="margin-bottom:6px">${t('settings.ws.icon')}</div><div class="swatches">${['#2F2E2A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'].map(c => `<button type="button" class="sw ${d.ws.c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="wsColor" data-v="${c}" aria-label="${t('common.color')} ${c}"></button>`).join('')}</div></div></div>
      <div class="col" style="gap:14px;max-width:440px"><div class="field"><label class="label" for="ws-name">${t('common.wsName')}</label><input class="input" id="ws-name" value="${esc(d.ws.name)}" ${wsAdmin ? '' : 'readonly'}></div>
      <div class="field"><label class="label" for="ws-url">${t('common.wsUrl')}</label><div class="row" style="gap:0"><span class="input" style="width:auto;background:var(--surface-2);border-right:0;border-radius:6px 0 0 6px;display:flex;align-items:center;color:var(--text-2)">${esc(api.host)}/w/</span><input class="input" id="ws-url" value="${esc(d.ws.url)}" style="border-radius:0 6px 6px 0" ${wsAdmin ? '' : 'readonly'}></div><span class="hint">${wsAdmin ? t('settings.ws.urlWarning') : t('settings.ws.urlReadonly')}</span></div>
      ${wsAdmin ? `<div><button class="btn btn-primary" data-a="saveWorkspace" id="ws-save">${t('settings.ws.saveChanges')}</button></div>` : ''}</div></div></form>
      ${
        api.enabled
          ? `<div class="sblock"><h2 style="color:var(--red)">${t('settings.ws.dangerZone')}</h2>
      ${srow(t('settings.ws.leaveTitle'), t('settings.ws.leaveBody'), `<button class="btn btn-danger-ghost" style="border:1px solid color-mix(in srgb,var(--red) 35%,transparent)" data-a="leaveWorkspace">${t('settings.ws.leaveTitle')}</button>`)}
      ${
        api.workspace?.role === 'owner'
          ? srow(
              t('settings.ws.deleteTitle'),
              t('settings.ws.deleteBodyApi'),
              `<button class="btn btn-danger-ghost" style="border:1px solid color-mix(in srgb,var(--red) 35%,transparent)" data-a="deleteWorkspace">${t('settings.ws.deleteTitle')}</button>`,
            )
          : ''
      }</div>`
          : `<div class="sblock"><h2 style="color:var(--red)">${t('settings.ws.dangerZone')}</h2>${srow(t('settings.ws.deleteTitle'), t('settings.ws.deleteBodyLocal'), `<button class="btn btn-danger-ghost" style="border:1px solid color-mix(in srgb,var(--red) 35%,transparent)" data-a="delWorkspace">${t('settings.ws.deleteTitle')}</button>`)}</div>`
      }`
      );
    }
    case 'appearance':
      return (
        H(t('settings.appearance.lead')) +
        `
      <div class="sblock" style="margin-top:0"><h2>${t('popover.theme')}</h2><div class="themecards" style="margin-top:12px" role="radiogroup" aria-label="${t('popover.theme')}">${[
        ['light', 'popover.themeLight'],
        ['dark', 'popover.themeDark'],
        ['system', 'popover.themeSystem'],
      ]
        .map(([k, n]) => {
          const L = { bg: '#FBFAF8', s: '#F2F1EE', t: '#1D1C1A', b: '#E3E1DC', a: '#4B5BD6' },
            Dk = { bg: '#1D1D1C', s: '#151514', t: '#ECEAE5', b: '#333230', a: '#8E9AF3' };
          const pv = c =>
            `<div class="s" style="background:${c.s}"><i style="background:${c.b};width:70%"></i><i style="background:${c.a};width:55%"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.b};width:60%"></i></div><div class="m" style="background:${c.bg}"><i style="background:${c.t};width:45%;height:7px"></i><i style="background:${c.b}"></i><i style="background:${c.b};width:80%"></i><i style="background:${c.a};width:30%;height:10px;margin-top:4px"></i></div>`;
          return `<button class="tcard ${P.theme === k ? 'on' : ''}" role="radio" aria-checked="${P.theme === k}" data-a="setTheme" data-v="${k}"><div class="tprev" style="${k === 'system' ? 'grid-template-columns:1fr 1fr;display:grid' : ''}">${k === 'system' ? `<div style="display:grid;grid-template-columns:30% 1fr">${pv(L)}</div><div style="display:grid;grid-template-columns:30% 1fr">${pv(Dk)}</div>` : pv(k === 'light' ? L : Dk)}</div><span class="row" style="font-weight:500;font-size:13px;gap:6px">${ic(k === 'light' ? 'sun' : k === 'dark' ? 'moon' : 'monitor', 14)}${t(n)}${P.theme === k ? `<span class="sp"></span><span style="color:var(--accent)">${ic('circle-check', 15)}</span>` : ''}</span></button>`;
        })
        .join('')}</div></div>
      <div class="sblock"><h2>${t('settings.appearance.accentTitle')}</h2>${srow(
        t('settings.appearance.accent'),
        t('settings.appearance.accentDesc'),
        `<div class="swatches" role="radiogroup" aria-label="${t('a11y.settings.accentColor')}">${[
          ['indigo', '#4B5BD6'],
          ['blue', '#2F6CD4'],
          ['violet', '#7348CC'],
          ['teal', '#1A7F7A'],
          ['rose', '#B93D68'],
          ['graphite', '#34332F'],
        ]
          .map(
            ([k, c]) =>
              `<button class="sw ${P.accent === k ? 'on' : ''}" style="--c:${c}" role="radio" aria-checked="${P.accent === k}" data-a="setPref" data-k="accent" data-v="${k}" aria-label="${k}" data-tip="${t(ACCENT_TIPS[k])}">${P.accent === k ? ic('check', 13) : ''}</button>`,
          )
          .join('')}</div>`,
      )}</div>
      <div class="sblock"><h2>${t('settings.appearance.density')}</h2>
        ${srow(t('settings.density.sidebarTitle'), t('settings.density.sidebarDesc'), `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.side === k ? 'on' : ''}" data-a="setPref" data-k="side" data-v="${k}">${t(DENSITY_LABELS[k])}</button>`).join('')}</div>`)}
        ${srow(t('settings.density.taskTitle'), t('settings.density.taskDesc'), `<div class="seg">${['comfortable', 'compact'].map(k => `<button class="${P.density === k ? 'on' : ''}" data-a="setPref" data-k="density" data-v="${k}">${t(DENSITY_LABELS[k])}</button>`).join('')}</div>`)}
        ${srow(
          t('settings.density.motionTitle'),
          t('settings.density.motionDesc'),
          sel(
            'motion',
            [
              ['system', t('settings.motion.system')],
              ['reduce', t('settings.motion.reduce')],
            ],
            P.motion,
          ),
        )}
      </div>`
      );
    case 'language':
      return (
        H(t('settings.language.lead')) +
        srow(
          t('settings.language.title'),
          t('settings.language.rowDesc'),
          /* D-14: the row shows what the user is actually seeing — the account locale, or the
             negotiated language while it is still NULL; getLocale() is exactly that value. */
          langSel(getLocale()),
        ) +
        srow(t('settings.language.spellcheck'), t('settings.language.spellcheckDesc'), tog('spell', P.spell !== false))
      );
    case 'datetime':
      return (
        H(t('settings.datetime.lead')) +
        srow(
          t('settings.datetime.tzTitle'),
          t('settings.datetime.tzDesc'),
          sel('tz', ['(GMT-08:00) Pacific Time', '(GMT-05:00) Eastern Time', '(GMT+00:00) London', '(GMT+01:00) Berlin', '(GMT+08:00) Singapore'], P.tz),
        ) +
        srow(
          t('settings.datetime.dateTitle'),
          `${t('settings.datetime.preview')} <b>${fmtDate(dOff(8))}</b>`,
          sel(
            'dateFmt',
            [
              /* The 'auto' option IS the stored 'MMM d': the document cannot tell a
                 preference that was never touched from one the user picked as the
                 default, so the stored default means "follow the locale" (D-04).
                 The preview is the LOCALE's own date form, computed from a fixed
                 sample — never a hard-coded English string. */
              ['auto', formatDate(SAMPLE_DATE, { pattern: 'auto', year: 'never' })],
              ['d/M', t('settings.dateFormat.dayMonth')],
              ['M/d', t('settings.dateFormat.monthDay')],
              ['yyyy-MM-dd', t('settings.dateFormat.iso')],
            ],
            isAutoDateFmt(P.dateFmt) ? 'auto' : P.dateFmt,
          ),
        ) +
        srow(
          t('settings.datetime.weekTitle'),
          t('settings.datetime.weekDesc'),
          sel(
            'weekStart',
            [
              ['1', t('settings.datetime.monday')],
              ['0', t('settings.datetime.sunday')],
              ['6', t('settings.datetime.saturday')],
            ],
            P.weekStart,
          ),
        ) +
        srow(
          t('settings.datetime.timeTitle'),
          '',
          sel(
            'timeFmt',
            [
              /* The clock follows the locale when the preference is unset: a
                 12-hour clock in English, a 24-hour one in French. The two
                 explicit choices keep their text, and the sample is rendered by
                 the formatter instead of being typed into the label. */
              ['auto', `${t('settings.timeFormat.auto')} (${formatTime(SAMPLE_TIME, { cycle: 'auto' })})`],
              ['12', `${t('settings.timeFormat.h12')} (${formatTime(SAMPLE_TIME, { cycle: '12' })})`],
              ['24', `${t('settings.timeFormat.h24')} (${formatTime(SAMPLE_TIME, { cycle: '24' })})`],
            ],
            P.timeFmt || 'auto',
          ),
        )
      );
    case 'members':
      return (
        H(t('settings.members.lead', { n: d.members.length, name: esc(d.ws.name) })) +
        `<div class="row" style="margin-bottom:12px">${isMemberAdmin() ? `<button class="btn btn-primary" data-a="invite">${ic('user-plus', 14)}${t('settings.members.invite')}</button>` : ''}<button class="btn btn-secondary" data-a="go" data-r="members">${t('settings.members.openDirectory')}</button></div>
      <div class="panel" style="overflow:hidden">${d.members.map(m => `<div class="mini" style="min-height:52px;cursor:default" data-ctx="member" data-id="${m.id}">${av(m.id, 'md', false)}<div class="grow"><div style="font-weight:500">${esc(m.name)}</div><div class="faint" style="font-size:12px">${esc(m.email)}</div></div>${m.status === 'invited' ? `<span class="badge amber">${t('common.invited')}</span>` : ''}${isMemberAdmin() && m.id !== d.me && (me().role === 'Owner' || (m.role !== 'Owner' && m.role !== 'Admin')) ? `<button class="pillbtn bordered" data-a="pop" data-pop="role" data-id="${m.id}">${m.role}${ic('chevron-down', 12)}</button>` : `<span class="pillbtn">${m.role === 'Owner' ? ic('crown', 13) : ''}${m.role}</span>`}<button class="ibtn ibtn-sm" data-a="ctxBtn" data-ctx="member" data-id="${m.id}" aria-label="${t('a11y.settings.options')}">${ic('ellipsis', 14)}</button></div>`).join('')}</div>`
      );
    case 'teams':
      return H(t('settings.teams.lead')) + teamsGrid();
    case 'projects': {
      const arch = d.projects.filter(p => p.archived);
      return (
        H(t('settings.projects.lead')) +
        srow(
          t('settings.projects.defaultView'),
          t('settings.projects.defaultViewDesc'),
          sel(
            'defaultTab',
            [
              ['board', t('nav.tab.board')],
              ['list', t('nav.tab.list')],
              ['table', t('nav.tab.table')],
              ['overview', t('nav.route.overview')],
              ['timeline', t('nav.route.timeline')],
            ],
            P.defaultTab || 'board',
          ),
        ) +
        srow(t('settings.projects.showDone'), '', tog('showDoneBoard', P.showDoneBoard !== false)) +
        `<div class="sblock"><h2>${t('settings.projects.archived')}</h2>${arch.length ? arch.map(p => `<div class="srow"><div class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></div><div class="row"><button class="btn btn-secondary btn-sm" data-a="restoreProject" data-id="${p.id}">${t('act.restore')}</button><button class="btn btn-danger-ghost btn-sm" data-a="delProject" data-id="${p.id}">${t('act.delete')}</button></div></div>`).join('') : `<p class="faint" style="padding:12px 0">${t('settings.projects.noArchived')}</p>`}<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-a="go" data-r="archive">${ic('archive', 13)}${t('settings.projects.openArchive')}</button></div></div>`
      );
    }
    case 'permissions':
      return (
        H(t('settings.perms.lead')) +
        srow(t('settings.perms.create'), '', tog('permCreate', P.permCreate !== false)) +
        srow(t('settings.perms.guests'), t('settings.perms.guestsDesc'), tog('permGuests', P.permGuests !== false)) +
        srow(t('settings.perms.public'), t('settings.perms.publicDesc'), tog('permPublic', !!P.permPublic)) +
        `<div class="sblock"><h2>${t('settings.perms.roleTable')}</h2><div style="margin-top:12px">${permsTable()}</div></div>`
      );
    case 'notif-email':
      return (
        H(t('settings.notif.emailLead')) +
        srow(t('settings.notif.mentions'), t('settings.notif.mentionsDesc'), tog('email_mention', np.email_mention, 'np')) +
        srow(t('settings.notif.assignments'), t('settings.notif.assignmentsDesc'), tog('email_assign', np.email_assign, 'np')) +
        srow(t('settings.notif.comments'), t('settings.notif.commentsDesc'), tog('email_comment', np.email_comment, 'np')) +
        srow(t('settings.notif.digest'), t('settings.notif.digestDesc'), tog('email_digest', np.email_digest, 'np'))
      );
    case 'notif-push':
      return (
        H(t('settings.notif.pushLead')) +
        srow(t('settings.notif.mentions'), '', tog('push_mention', np.push_mention, 'np')) +
        srow(t('settings.notif.assignments'), '', tog('push_assign', np.push_assign, 'np')) +
        srow(t('settings.notif.comments'), '', tog('push_comment', np.push_comment, 'np')) +
        srow(t('settings.notif.dueReminders'), t('settings.notif.dueDesc'), tog('push_due', np.push_due, 'np'))
      );
    case 'notif-mentions':
      return (
        H(t('settings.notif.mentionsLead')) +
        srow(t('settings.notif.atAll'), '', tog('mention_all', np.mention_all, 'np')) +
        srow(t('settings.notif.atTeam'), t('settings.notif.atTeamDesc'), tog('mention_team', np.mention_team !== false, 'np')) +
        srow(t('settings.notif.atWorkspace'), t('settings.notif.atWorkspaceDesc'), tog('mention_ws', !!np.mention_ws, 'np'))
      );
    case 'notif-assign':
      return (
        H(t('settings.notif.assignLead')) +
        srow(t('settings.notif.assignedMe'), '', tog('assign_self', np.assign_self, 'np')) +
        srow(t('settings.notif.statusChange'), '', tog('assign_status', np.assign_status !== false, 'np')) +
        srow(t('settings.notif.overdue'), '', tog('assign_over', np.assign_over !== false, 'np'))
      );
    case 'profile': {
      const err = S.ui.errors.pname2;
      return (
        H(t('settings.profile.lead')) +
        `<form data-submit="saveProfile" class="col" style="gap:16px;max-width:440px">
      <div class="row" style="gap:14px">${av(d.me, 'xl', false)}<div><div class="label" style="margin-bottom:6px">${t('settings.profile.avatarColor')}</div><div class="swatches">${['#5A67D8', '#C54B78', '#3B82C4', '#23918A', '#C48A1E', '#8662C9'].map(c => `<button type="button" class="sw ${me().c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="avColor" data-v="${c}" aria-label="${t('common.color')}"></button>`).join('')}</div></div></div>
      <div class="field"><label class="label" for="pf-name">${t('common.fullName')}</label><input class="input ${err ? 'is-error' : ''}" id="pf-name" value="${esc(P.name)}">${err ? `<span class="err">${ic('circle-alert', 12)}${err}</span>` : ''}</div>
      <div class="field"><label class="label" for="pf-title">${t('settings.profile.title')}</label><input class="input" id="pf-title" value="${esc(P.title)}"></div>
      <div class="field"><label class="label" for="pf-email">${t('common.email')}</label><input class="input" id="pf-email" value="${esc(me().email)}" disabled><span class="hint">${t('settings.profile.emailHint')}</span></div>
      <div><button class="btn btn-primary" data-a="saveProfile" id="pf-save">${t('settings.profile.save')}</button></div></form>`
      );
    }
    case 'preferences':
      return (
        H(t('settings.prefs.lead')) +
        srow(
          t('settings.prefs.launch'),
          t('settings.prefs.launchDesc'),
          sel(
            'home',
            [
              ['home', t('nav.route.home')],
              ['mytasks', t('nav.route.mytasks')],
              ['inbox', t('nav.route.inbox')],
            ],
            P.home,
          ),
        ) +
        srow(
          t('settings.prefs.openTasks'),
          t('settings.prefs.openTasksDesc'),
          sel(
            'openTasks',
            [
              ['drawer', t('settings.prefs.sidePanel')],
              ['full', t('settings.prefs.fullPage')],
            ],
            P.openTasks,
          ),
        ) +
        srow(t('settings.prefs.confirmDel'), '', tog('confirmDel', P.confirmDel !== false))
      );
    case 'shortcuts':
      return (
        H(t('settings.shortcuts.lead')) +
        SHORTCUTS.map(
          ([g, list]) =>
            `<div class="sblock" style="margin-top:18px"><h2>${t(g)}</h2>${list.map(([n, k]) => `<div class="srow" style="padding:9px 0"><span>${t(n)}</span><span class="row" style="gap:4px">${k.map((x, i) => `${i && k[0] === 'G' ? '<span class="faint" style="font-size:11px">then</span>' : ''}<kbd>${x}</kbd>`).join('')}</span></div>`).join('')}</div>`,
        ).join('')
      );
    case 'password': {
      const e = S.ui.errors;
      const pw = S.ui.pwNew || '';
      return (
        H(t('settings.pw.lead')) +
        `${S.ui.pwDone ? `<div class="alert ok" style="margin-bottom:14px">${ic('circle-check', 15)}<span>${t('settings.pw.done')}</span></div>` : ''}<form data-submit="savePassword" class="col" style="gap:14px;max-width:400px">
      <div class="field"><label class="label" for="pw-cur">${t('settings.pw.current')}</label><input type="password" class="input ${e.pwCur ? 'is-error' : ''}" id="pw-cur" autocomplete="current-password">${e.pwCur ? `<span class="err">${ic('circle-alert', 12)}${e.pwCur}</span>` : ''}</div>
      <div class="field"><label class="label" for="pw-new">${t('settings.pw.new')}</label><input type="password" class="input ${e.pwNew ? 'is-error' : ''}" id="pw-new" data-in="pwStrength" value="${esc(pw)}" autocomplete="new-password">${strengthMeter(pw)}${e.pwNew ? `<span class="err">${ic('circle-alert', 12)}${e.pwNew}</span>` : `<span class="hint">${t('common.pwHint')}</span>`}</div>
      <div class="field"><label class="label" for="pw-conf">${t('settings.pw.confirm')}</label><input type="password" class="input ${e.pwConf ? 'is-error' : ''}" id="pw-conf" autocomplete="new-password">${e.pwConf ? `<span class="err">${ic('circle-alert', 12)}${e.pwConf}</span>` : ''}</div>
      <div><button class="btn btn-primary" data-a="savePassword" id="pw-save">${t('settings.pw.update')}</button></div></form>`
      );
    }
    case 'sessions':
      return (
        H(t('settings.sessions.lead')) +
        d.sessions
          .map(s =>
            srow(
              `<span class="row" style="gap:8px">${ic(s.dev.includes('iPhone') ? 'smartphone' : 'monitor', 15)}${esc(s.dev)}${s.cur ? `<span class="badge green">${t('settings.sessions.thisDevice')}</span>` : ''}</span>`,
              `${esc(s.loc)} · ${esc(s.at)}`,
              s.cur ? '' : `<button class="btn btn-secondary btn-sm" data-a="revokeSession" data-id="${s.id}">${t('palette.signOut')}</button>`,
            ),
          )
          .join('') +
        `<div style="margin-top:16px"><button class="btn btn-danger-ghost" data-a="revokeAll" ${d.sessions.length > 1 ? '' : 'disabled'}>${t('settings.sessions.revokeAll')}</button></div>`
      );
    case '2fa':
      return (
        H(t('settings.tfa.lead')) +
        (d.tfa
          ? `<div class="alert ok">${ic('shield-check', 16)}<div><b>${t('settings.tfa.on')}</b><div class="muted">${t('settings.tfa.onDesc')}</div></div></div><div class="sblock"><h2>${t('settings.tfa.recovery')}</h2><p class="muted" style="font-size:13px">${t('settings.tfa.recoveryDesc')}</p><div style="display:grid;grid-template-columns:repeat(2,max-content);gap:6px 28px;font-family:var(--mono);font-size:13px;padding:14px;border:1px solid var(--border);border-radius:var(--r);background:var(--sunken);user-select:all">${['7KQ2-M8PX', 'D4TN-9WRE', 'HV3C-QZ6L', 'P2YB-J7SK', 'R9FG-4NUD', 'X6MA-T3HE'].map(c => `<span>${c}</span>`).join('')}</div><div style="margin-top:14px"><button class="btn btn-danger-ghost" data-a="disable2fa">${t('settings.tfa.turnOff')}</button></div></div>`
          : S.ui.tfaSetup
            ? `<div class="panel" style="padding:18px;display:flex;gap:20px;flex-wrap:wrap"><div style="width:132px;height:132px;display:grid;grid-template-columns:repeat(11,1fr);gap:1px;padding:8px;background:#fff;border-radius:8px;border:1px solid var(--border)" aria-label="${t('a11y.settings.qr')}">${Array.from(
                { length: 121 },
                (_, i) => {
                  const r = Math.floor(i / 11),
                    c = i % 11;
                  const f = (r < 3 && c < 3) || (r < 3 && c > 7) || (r > 7 && c < 3);
                  const on = f ? !((r === 1 && c === 1) || (r === 1 && c === 9) || (r === 9 && c === 1)) : (i * 7919) % 13 < 6;
                  return `<i style="background:${on ? '#1D1C1A' : '#fff'}"></i>`;
                },
              ).join('')}</div>
        <div class="grow col" style="gap:10px;min-width:220px"><div><b>${t('settings.tfa.scan')}</b><div class="muted" style="font-size:13px">${t('settings.tfa.appHint')}</div></div><div><b>${t('settings.tfa.enterCode')}</b></div><form data-submit="verify2fa" class="row"><input class="input mono ${S.ui.errors.tfa ? 'is-error' : ''}" id="tfa-code" inputmode="numeric" maxlength="6" placeholder="000000" style="width:130px;letter-spacing:.2em;font-size:15px" autofocus><button class="btn btn-primary" data-a="verify2fa">${t('settings.tfa.verify')}</button><button type="button" class="btn btn-ghost" data-a="cancel2fa">${t('common.cancel')}</button></form>${S.ui.errors.tfa ? `<span class="err">${ic('circle-alert', 12)}${S.ui.errors.tfa}</span>` : `<span class="hint">${t('settings.tfa.anyDigits')}</span>`}</div></div>`
            : `<div class="panel" style="padding:18px" ><div class="row" style="gap:14px;align-items:flex-start"><span class="ftype" style="--c:var(--amber);width:36px;height:36px">${ic('shield-alert', 18)}</span><div class="grow"><b>${t('settings.tfa.off')}</b><p class="muted" style="margin:4px 0 12px;font-size:13px">${t('settings.tfa.offDesc')}</p><button class="btn btn-primary" data-a="setup2fa">${t('settings.tfa.setup')}</button></div></div></div>`)
      );
  }
  return page404();
}
export function strengthMeter(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[0-9]/.test(pw) && /[a-zA-Z]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  const c = ['var(--red)', 'var(--red)', 'var(--amber)', 'var(--green)', 'var(--green)'][s];
  const n = t(['settings.pw.meter.tooShort', 'settings.pw.meter.weak', 'settings.pw.meter.fair', 'settings.pw.meter.good', 'settings.pw.meter.strong'][s]);
  return pw
    ? `<div class="row" style="gap:8px"><div class="strength grow" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < s ? 'on' : ''}" style="--c:${c}"></i>`).join('')}</div><span style="font-size:11.5px;color:${c};width:60px;text-align:right">${n}</span></div>`
    : '';
}
