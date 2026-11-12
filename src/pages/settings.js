/* =====================================================================
   SETTINGS · AUTH · ONBOARDING · DESIGN SYSTEM · SYSTEM STATES
   ===================================================================== */import { availableLocales, formatDate, formatTime, getLocale, isAutoDateFmt, t } from '../core/i18n.js';
import { ago, clamp, dOff, deviceLabel, esc, foldForSearch, fmtDate } from '../core/utils.js';
import { ic, wsLogo } from '../core/icons.js';
import { D, S, isMemberAdmin, me, projTeams, team } from '../core/store.js';
import { api } from '../core/api.js';
import { renderQrSvg } from '../lib/qr.js';
import { toast } from '../ui/toast.js';
import { av, pIcon } from '../ui/helpers.js';
import { teamsGrid } from './members.js';
import { page404 } from './errors.js';
import { SHORTCUTS } from '../overlays/modals.js';
import { TIMEZONES } from '../lib/timezones.js';
import { resolveTz } from '../../tz.js';

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

/* DELIV-02 (D-03): the QR SVG now renders asynchronously through the lazy
   vendor chunk (import('./vendor/qrcode.js') auto-split in src/lib/qr.js).
   The stage markup carries a spinner placeholder that the awaited
   renderQrSvg() replaces in place; on chunk-load failure the error toast
   fires (D-03) and qr.js resets its cached promise so the next click
   retries. No idle preloading anywhere. */
function tfaQrFill(id) {
  setTimeout(() => {
    const slot = document.getElementById(id);
    if (!slot) return;
    renderQrSvg(S.ui.tfaOtpauth || '')
      .then(svg => {
        if (document.getElementById(id) === slot) slot.innerHTML = svg;
      })
      .catch(() => toast(t('toast.qrLoadFailed'), { kind: 'err' }));
  }, 0);
  return '';
}

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
    'nav.route.notifications',
    [
      ['notif-email', 'settings.nav.email', 'mail'],
      ['notif-push', 'settings.nav.push', 'smartphone'],
      ['notif-mentions', 'settings.nav.mentions', 'at-sign'],
    ],
  ],
  [
    'settings.group.security',
    [
      ['password', 'settings.nav.password', 'key-round'],
      ['tfa', 'settings.tfa.nav', 'smartphone'],
      ['sessions', 'settings.nav.sessions', 'monitor-smartphone'],
      ['apikeys', 'settings.apikeys.nav', 'plug'],
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
/* =====================================================================
   TZ COMBOBOX (Phase 44, D-01..D-05) — the member's own Settings > Date &
   time picker, a searchable list over the FULL bundled IANA zone list
   (TIMEZONES, generated by scripts/gen-timezones.mjs).

   D-02: every option's offset is computed live at render via
   Intl.DateTimeFormat shortOffset — never cached, never stored, so labels
   stay honest across DST. D-03: the zone list is the committed static array
   (the build-time enumeration lives only in the generator script — the
   client never enumerates zones at runtime). D-04: the preselect chain
   (tzPreselect) runs at render and NOTHING auto-saves — a change persists
   only through the explicit A.tzSel selection. D-05: legacy stored labels
   resolve through the single tz.js funnel (resolveTz) — no second
   label→zone mapping lives client-side. D-09: selection writes the CURRENT
   member's tz via S.data.members (never S.prefs — blob prefs is the
   disconnected store this phase replaces) and reaches the server through
   the doc PUT's self-tz carve-out (docFromClient, resolveTz-validated).

   Filtering and keyboard/ARIA discipline follow src/overlays/palette.js:
   foldForSearch matching, clamped highlight index, role=combobox driving a
   role=listbox of role=option items, esc() on every interpolated string
   (T-44-05). Machine values (IANA ids, city segments, Intl offsets) are
   deliberately NOT catalogue strings — keeps npm run i18n:scan green.
   ===================================================================== */

/* D-02: live UTC offset label, e.g. "GMT+1". Computed per call at render —
   never cached, never stored. An unresolvable zone yields '' and the option
   renders its id without an offset segment instead of a fake label. */
export const tzOffsetLabel = zone => {
  try {
    return (
      new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'shortOffset' })
        .formatToParts(new Date())
        .find(p => p.type === 'timeZoneName')?.value || ''
    );
  } catch {
    return '';
  }
};

/* The rendered candidate list: accent-folded substring match over id and
   city name (palette.js discipline), capped so a 400-zone render stays
   cheap. Sorted order is the generator's — stable for search and keyboard
   navigation. Exported for the wiring test. */
export function tzFilter(q) {
  const f = foldForSearch(String(q ?? '').trim()).text;
  const base = f ? TIMEZONES.filter(z => foldForSearch(z.id).text.includes(f) || foldForSearch(z.name).text.includes(f)) : TIMEZONES;
  return base.slice(0, 80);
}

/* D-04 preselect chain, computed at render (nothing auto-saves):
   1. a stored tz that resolves (legacy labels through resolveTz per D-05,
      valid IANA as submitted) AND exists in the static list;
   2. a non-empty but unresolvable stored value degrades to Europe/Paris
      (D-07 — Paris shown, never blank);
   3. an empty stored value preselects the browser zone
      (Intl.DateTimeFormat().resolvedOptions().timeZone) when it is in the
      list, else Europe/Paris (invalid-browser-zone degradation, D-04/D-07).
   Exported for the wiring test's ordering assertion. */
export function tzPreselect(stored) {
  const s = typeof stored === 'string' ? stored.trim() : '';
  if (s) {
    const zone = resolveTz(s);
    return TIMEZONES.some(z => z.id === zone) ? zone : 'Europe/Paris';
  }
  let browser = '';
  try {
    browser = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    browser = '';
  }
  return browser && TIMEZONES.some(z => z.id === browser) ? browser : 'Europe/Paris';
}

export function tzCombobox() {
  /* D-09: the stored value read here is the member profile's tz (me()), with
     the legacy blob pref (P.tz) as a degrade-without-loss fallback. */
  const stored = me()?.tz || S.prefs.tz || '';
  const sel = tzPreselect(stored);
  /* The option list only exists while the picker is open (UAT follow-up:
     after a validated selection the list stays closed, so the page below it
     never shifts). Open = the user typed into the input or pressed ArrowDown;
     closed = a selection was made or Escape was pressed. */
  const pk = S.ui.tzPick || (S.ui.tzPick = { q: '', hl: 0, v: sel, open: false });
  if (pk.open === undefined) pk.open = false;
  if (pk.q === '') pk.v = sel; // no query in flight: the input mirrors the resolved selection
  const list = pk.open ? tzFilter(pk.q) : [];
  pk.hl = clamp(pk.hl, 0, Math.max(list.length - 1, 0));
  pk._flat = list; // keyboard.js picks the highlighted entry from here
  const q = pk.q !== '' ? pk.q : pk.v;
  return `<div style="min-width:260px;max-width:340px">
    <input id="tz-q" class="input" style="width:100%" data-in="tzSel" value="${esc(q)}" placeholder="${t('settings.tz.placeholder')}" autocomplete="off" role="combobox" aria-expanded="${pk.open}" aria-controls="tz-list" aria-activedescendant="${pk.open ? `tz-opt-${pk.hl}` : ''}" aria-label="${t('settings.tz.searchLabel')}">${
      pk.open
        ? `<div id="tz-list" role="listbox" aria-label="${t('settings.tz.searchLabel')}" style="max-height:240px;overflow:auto;margin-top:6px;border:1px solid var(--border);border-radius:var(--r-sm);background:var(--surface)">${
            list.length
              ? list
                  .map((z, i) => {
                    const off = tzOffsetLabel(z.id);
                    return `<div class="pi ${i === pk.hl ? 'hl' : ''}" id="tz-opt-${i}" role="option" aria-selected="${i === pk.hl}" data-a="tzSel" data-v="${esc(z.id)}" data-i="${i}" data-hover-i="${i}"><span class="trunc">${esc(z.name)}</span><span class="sub" style="flex-shrink:0"><span class="mono">${esc(z.id)}</span>${off ? ` · ${esc(off)}` : ''}</span></div>`;
                  })
                  .join('')
              : `<div class="hint" style="padding:8px 10px">${t('settings.tz.noResults')}</div>`
          }</div>`
        : ''
    }</div>`;
}

/* The operator console (OPREV-02, phase 22): rendered ONLY for a viewer whose
   boot/me payload says isInstanceAdmin (server ground truth — D-112; never a
   client flag, the twoFa convention). The list comes from
   refreshOperatorUsers() (GET /api/auth/operator/users, D-121); the per-row
   revoke uses the D-90 inline-confirmation stage (S.ui.operatorRevoke carries
   the target id). Owner rows are immune (D-119) — the action is replaced by
   the honest hint; the operator's own row explains the keep-current semantics
   (D-118: their other browsers sign out, this device survives). */
export function operatorCard() {
  const rows = S.ui.operatorUsers;
  if (!rows) return '';
  const meId = api.user?.id;
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('settings.operator.title')}</h2><p class="hint" style="margin-bottom:10px">${t('settings.operator.lead')}</p>${rows
    .map(u =>
      srow(
        `<span class="row" style="gap:8px">${esc(u.name || '')}<span class="faint">${esc(u.email)}</span>${u.id === meId ? `<span class="badge green">${t('settings.operator.youBadge')}</span>` : ''}${u.is_instance_admin ? `<span class="badge">${t('settings.operator.ownerBadge')}</span>` : ''}</span>`,
        u.last_login_at ? ago(u.last_login_at) : '—',
        S.ui.operatorRevoke === u.id
          ? `<span class="row" style="gap:8px"><span class="hint">${t('settings.operator.confirmBody')}</span><button class="btn btn-danger btn-sm" data-a="operatorRevokeConfirm" data-id="${esc(u.id)}">${t('settings.operator.confirm')}</button><button class="btn btn-secondary btn-sm" data-a="operatorRevokeCancel">${t('common.cancel')}</button></span>`
          : u.is_instance_admin
            ? `<span class="hint">${u.id === meId ? t('settings.operator.selfNote') : t('settings.operator.ownerImmune')}</span>`
            : `<button class="btn btn-secondary btn-sm" data-a="operatorRevokeAsk" data-id="${esc(u.id)}">${t('settings.operator.revokeShort')}</button>`,
      ),
    )
    .join('')}</div>`;
}

/* The audit trail (AUD-03, D-T3, D-V1): tier-scoped read of the append-only
   audit_log, mounted unconditionally beside the operator card on the sessions
   tab — the server decides who sees what (instance operators: all rows,
   workspace admins: their own workspaces' rows, plain members: 403 → null →
   the card renders nothing). Rows render purely from snapshot columns (D-V4)
   — no joins — so rows whose target user was deleted stay fully readable.
   Verb filter chips (D-V2) re-query the server; load-more appends the next
   keyset page (D-V3). */
export function auditTrailCard() {
  const trail = S.ui.auditTrail;
  if (!trail) return '';
  const verbLabel = a => t(a === 'sessions_revoked_by_workspace_admin' ? 'settings.audit.verbAdmin' : 'settings.audit.verbOperator');
  const chips = [
    ['', 'settings.audit.filterAll'],
    ['sessions_revoked_by_operator', 'settings.audit.filterOperator'],
    ['sessions_revoked_by_workspace_admin', 'settings.audit.filterAdmin'],
  ];
  const row = r =>
    srow(
      `<span class="row" style="gap:8px">${esc(r.actor_name || '')}<span class="faint">${esc(r.actor_email || '')}</span><span class="badge">${verbLabel(r.action)}</span></span>`,
      `<span class="row" style="gap:8px;flex-wrap:wrap"><span>${t('settings.audit.target')} ${esc(r.target_name || '')} <span class="faint">${esc(r.target_email || '')}</span></span><span class="faint">${t('settings.audit.sessions')}: ${esc(String(r.session_count ?? ''))}</span><span class="faint">${esc(r.ip || '—')}</span><span class="faint">${esc(r.workspace_id || '—')}</span><span class="faint">${ago(r.created_at)}</span></span>`,
      '',
    );
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('settings.audit.title')}</h2><p class="hint" style="margin-bottom:10px">${t('settings.audit.lead')}</p><div class="row" style="gap:8px;margin-bottom:10px">${chips
    .map(([v, k]) => `<button class="btn btn-sm ${auditVerbMatch(v) ? 'btn-primary' : 'btn-secondary'}" data-a="auditVerbFilter" data-v="${v}" aria-pressed="${auditVerbMatch(v)}">${t(k)}</button>`)
    .join('')}</div>${
    trail.rows.length ? trail.rows.map(row).join('') : `<p class="hint">${t('settings.audit.empty')}</p>`
  }${trail.nextBefore ? `<div style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-a="auditLoadMore">${t('settings.audit.loadMore')}</button></div>` : ''}</div>`;
}
const auditVerbMatch = v => (S.ui.auditVerb || '') === v;

export function pageSettings() {
  const known = SET_NAV.flatMap(g => g[1]).map(x => x[0]);
  /* T-51-08: a stale ?sec=<removed-section> deep-link (e.g. the deleted
     Permissions page) never renders a 404 body — an unknown section falls
     back to the first tab. */
  let sec = S.ui.params.sec || S.ui.settings || 'appearance';
  if (!known.includes(sec)) sec = known[0];
  const title = SET_NAV.flatMap(g => g[1]).find(x => x[0] === sec) || ['appearance', 'settings.nav.appearance'];
  return `<div class="set">
    <nav class="set-nav" aria-label="${t('nav.route.settings')}">${SET_NAV.map(([g, items]) => `${g === 'settings.group.personal' ? '<hr class="gsep" aria-hidden="true">' : ''}<div class="gh">${t(g)}</div>${items.map(([k, n, i]) => `<button class="sitem ${sec === k ? 'on' : ''}" data-a="go" data-r="settings" data-sec="${k}">${ic(i, 15)}<span>${t(n)}</span></button>`).join('')}`).join('')}</nav>
    <div class="set-body" data-keep="set:${sec}"><div class="set-in">${settingsBody(sec, title[1])}</div></div>
  </div>`;
}
export function settingsBody(sec, title) {
  const P = S.prefs;
  const d = D();
  /* Phase 34 D-01: notifPrefs no longer rides the workspace document — the
     settings page renders the per-user prefs object from store state. */
  const np = S.notifPrefs;
  const H = lead => `<h1>${t(title)}</h1><p class="lead">${lead}</p>`;
  switch (sec) {
    case 'workspace': {
      const wsAdmin = !api.enabled || api.workspace?.role === 'owner' || api.workspace?.role === 'admin';
      /* Phase 43 (D-05/D-11): the logo URL comes solely from workspacePayload.logo
         (api.workspace) — merged onto the ws doc object for the shared wsLogo slot. */
      const logo = api.workspace?.logo || null;
      return (
        H(t('settings.ws.lead')) +
        `
      <form data-submit="saveWorkspace">
      <div class="sblock" style="margin-top:0"><div class="row" style="gap:14px;margin-bottom:18px">${wsLogo({ ...d.ws, logo }, 52)}<div><div class="label" style="margin-bottom:6px">${t('settings.ws.icon')}</div><div class="swatches">${['#2F2E2A', '#5A67D8', '#3B82C4', '#23918A', '#C54B78', '#C48A1E'].map(c => `<button type="button" class="sw ${d.ws.c === c ? 'on' : ''}" style="--c:${c};width:22px;height:22px" data-a="wsColor" data-v="${c}" aria-label="${t('common.color')} ${c}"></button>`).join('')}</div>
      ${wsAdmin ? `<div class="row" style="gap:8px;margin-top:10px"><label class="btn btn-sm btn-secondary" style="cursor:pointer">${t('settings.ws.uploadLogo')}<input type="file" hidden accept="image/png,image/jpeg,image/svg+xml" data-in="uploadLogo"></label>${logo ? `<button type="button" class="btn btn-sm btn-danger-ghost" data-a="removeLogo">${t('settings.ws.removeLogo')}</button>` : ''}</div>` : ''}</div></div>
      <div class="col" style="gap:14px;max-width:440px"><div class="field"><label class="label" for="ws-name">${t('common.wsName')}</label><input class="input" id="ws-name" value="${esc(d.ws.name)}" ${wsAdmin ? '' : 'readonly'}></div>
      <div class="field"><label class="label" for="ws-url">${t('common.wsUrl')}</label><div class="row" style="gap:0"><span class="input" style="width:auto;background:var(--surface-2);border-right:0;border-radius:6px 0 0 6px;display:flex;align-items:center;color:var(--text-2)">${esc(api.host)}/w/</span><input class="input" id="ws-url" value="${esc(d.ws.url)}" style="border-radius:0 6px 6px 0" ${wsAdmin ? '' : 'readonly'}></div><span class="hint">${wsAdmin ? t('settings.ws.urlWarning') : t('settings.ws.urlReadonly')}</span></div>
      ${wsAdmin ? `<div><button class="btn btn-primary" data-a="saveWorkspace" id="ws-save">${t('settings.ws.saveChanges')}</button></div>` : ''}</div></div></form>
      <div class="sblock">${srow(t('settings.perms.create'), '', tog('permCreate', P.permCreate === true))}</div>
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
      )}
        <div class="accent-preview" aria-hidden="true">
          <div class="ap-side">
            <div class="ap-item on">${ic('home', 12)}${t('nav.route.home')}</div>
            <div class="ap-item">${ic('inbox', 12)}${t('nav.route.inbox')}<span class="ct">3</span></div>
            <div class="ap-item">${ic('list', 12)}${t('nav.tab.list')}</div>
          </div>
          <div class="ap-main">
            <div class="ap-tabs"><span class="on">${t('nav.tab.board')}</span><span>${t('nav.tab.list')}</span></div>
            <div class="ap-row"><span class="ap-btn">${t('act.newTask')}</span><span class="ap-check">${ic('check', 9)}</span><span class="ap-toggle"></span></div>
            <div class="ap-prog"><i style="width:62%"></i></div>
            <div class="ap-foot"><span class="ap-link">@mention</span><span class="ap-unread">${t('nav.route.notifications')}</span></div>
          </div>
        </div></div>
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
          tzCombobox(),
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
      const active = d.projects.filter(p => !p.archived);
      const activeRows = active.length
        ? active
            .map(p => {
              const tmNames = projTeams(p).map(id => team(id)?.name).filter(Boolean);
              return `<div class="srow"><div class="row" style="cursor:default"><a class="row" href="#" data-a="go" data-r="project" data-id="${p.id}" style="color:inherit;text-decoration:none">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></a>${tmNames.length ? `<span class="faint" style="font-size:12px">${esc(tmNames.join(', '))}</span>` : ''}</div><div class="row"><span class="badge faint">${esc(p.status)}</span></div></div>`;
            })
            .join('')
        : `<p class="faint" style="padding:12px 0">${t('settings.projects.noActive')}</p>`;
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
        `<div class="sblock"><h2>${t('settings.projects.active')}</h2>${activeRows}</div>` +
        `<div class="sblock"><h2>${t('settings.projects.archived')}</h2>${arch.length ? arch.map(p => `<div class="srow"><div class="row">${pIcon(p, '', 14)}<b style="font-weight:500">${esc(p.name)}</b></div><div class="row"><button class="btn btn-secondary btn-sm" data-a="restoreProject" data-id="${p.id}">${t('act.restore')}</button><button class="btn btn-danger-ghost btn-sm" data-a="delProject" data-id="${p.id}">${t('act.delete')}</button></div></div>`).join('') : `<p class="faint" style="padding:12px 0">${t('settings.projects.noArchived')}</p>`}<div style="margin-top:12px"><button class="btn btn-secondary btn-sm" data-a="go" data-r="archive">${ic('archive', 13)}${t('settings.projects.openArchive')}</button></div></div>`
      );
    }
    case 'notif-email':
      return (
        H(t('settings.notif.emailLead')) +
        srow(t('settings.notif.mentions'), t('settings.notif.mentionsDesc'), tog('email_mention', np.email_mention, 'np')) +
        srow(t('settings.notif.assignments'), t('settings.notif.assignmentsDesc'), tog('email_assign', np.email_assign, 'np')) +
        srow(t('settings.notif.comments'), t('settings.notif.commentsDesc'), tog('email_comment', np.email_comment, 'np')) +
        srow(t('settings.notif.digest'), t('settings.notif.digestDesc'), tog('email_digest', np.email_digest, 'np')) +
        srow(t('settings.notif.emailReminder'), t('settings.notif.emailReminderDesc'), tog('email_reminder', np.email_reminder, 'np'))
      );
    case 'notif-push': {
      /* D-48-4: the badge is DERIVED per render from a live permission read,
         never stored — a later grant clears it on the next poll re-render. */
      const blocked = typeof window.Notification !== 'undefined' && window.Notification.permission === 'denied';
      const bad = blocked ? `<span class="badge red">${t('settings.notif.pushBrowserBlocked')}</span>` : '';
      return (
        H(t('settings.notif.pushLead')) +
        srow(t('settings.notif.mentions'), bad, tog('push_mention', np.push_mention, 'np')) +
        srow(t('settings.notif.assignments'), bad, tog('push_assign', np.push_assign, 'np')) +
        srow(t('settings.notif.comments'), bad, tog('push_comment', np.push_comment, 'np')) +
        srow(t('settings.notif.dueReminder'), t('settings.notif.dueReminderDesc'), tog('due_reminder', np.due_reminder, 'np')) +
        srow(t('settings.notif.pastDue'), t('settings.notif.pastDueDesc'), tog('past_due', np.past_due, 'np'))
      );
    }
    case 'notif-mentions':
      return (
        H(t('settings.notif.mentionsLead')) +
        srow(t('settings.notif.atAll'), '', tog('mention_all', np.mention_all, 'np')) +
        srow(t('settings.notif.atTeam'), t('settings.notif.atTeamDesc'), tog('mention_team', np.mention_team !== false, 'np'))
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
    case 'tfa': {
      /* TFA-02/03/04 — the D-56 inline card. The on/off split reads ONLY
         server ground truth (api.user.twoFa, refreshed by refreshTfa() on
         mount and after every state change, T-16-13) — never a client flag;
         the deleted 14-04 stub pattern stays deleted. Enrollment states
         (password step-up → QR + copyable secret + live code) render in
         place, no wizard, no new routing (D-56). */
      const e = S.ui.errors;
      const stage = S.ui.tfaStage;
      const on = api.enabled && !!api.user?.twoFa;
      const fld = (id, label, errKey, extra = '') =>
        `<div class="field"><label class="label" for="${id}">${label}</label><input class="input ${e[errKey] ? 'is-error' : ''}" id="${id}" ${extra}>${e[errKey] ? `<span class="err">${ic('circle-alert', 12)}${e[errKey]}</span>` : ''}</div>`;
      if (!api.enabled) return H(t('settings.tfa.lead')) + srow(t('settings.tfa.off'), t('settings.tfa.offDesc'), '');
      if (on) {
        /* TOTP2 (Phase 31, D-01/D-05): the enrolled-factor list — one row per
           factor (sessions-row pattern), catalogue-localized name (the row
           stores a key, D-07) + relative last-used derived from the replay
           guard's matched step (step × 30s; 0 = never used). No add/remove
           controls yet — Plan 02/03 own those. */
        const factors = S.ui.tfaFactors || [];
        /* TOTP2 (D-19): the remove confirm echoes the factor's localized name —
           looked up from the same server ground-truth list that rendered it. */
        const rmName = t(factors.find(f => f.id === S.ui.tfaRemoveId)?.name || '');
        return (
          H(t('settings.tfa.lead')) +
          srow(
            t('settings.tfa.on'),
            t('settings.tfa.onDesc'),
            /* TOTP2 (D-01): "Add factor" relaunches the staged wizard — hidden
               while any stage is open and for first-ever enrollment (zero
               factors; the legacy password-only setup wizard owns that path). */
            stage || !factors.length
              ? ''
              : `<button class="btn btn-secondary" data-a="tfaAddFactor">${t('settings.tfa.addFactor')}</button><button class="btn btn-secondary" data-a="tfaAskRegen">${t('settings.tfa.regenShort')}</button><button class="btn btn-danger-ghost" data-a="tfaAskDisable">${t('act.turnOff')}</button>`,
          ) +
          factors
            .map(f =>
              srow(
                `<span class="row" style="gap:8px">${ic('smartphone', 15)}${esc(t(f.name))}</span>`,
                f.lastStep > 0 ? ago(f.lastStep * 30 * 1000) : '—',
                /* TOTP2 (D-19): per-factor remove opens the in-place staged
                   confirm — never a picker. The id selects the target; the
                   confirm form echoes the name via the factor list lookup. */
                `<button class="btn btn-danger-ghost btn-sm" data-a="tfaAskRemove" data-id="${esc(f.id)}">${t('settings.tfa.remove')}</button>`,
              ),
            )
            .join('') +
          (stage === 'disable'
            ? `<form data-submit="tfaDisableConfirm" class="col" style="gap:14px;max-width:400px;margin-top:14px">
                ${fld('tfa-off-pw', t('settings.tfa.pwLabel'), 'tfaOffPw', 'type="password" autocomplete="current-password"')}
                ${fld('tfa-off-code', t('settings.tfa.codeLabel'), 'tfaOffCode', 'autocomplete="one-time-code"')}
                <div class="row"><button class="btn btn-danger" data-a="tfaDisableConfirm" id="tfa-off-save">${t('settings.tfa.turnOff')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
              </form>`
            : '') +
          (stage === 'regen'
            ? /* REGEN-01/02 — the regenerate step-up form. The code field is
                 6-digit-only semantics (D-85 client half): unlike the disable
                 form it must never accept a recovery code. */
              `<form data-submit="tfaRegenConfirm" class="col" style="gap:14px;max-width:400px;margin-top:14px">
                ${fld('tfa-regen-pw', t('settings.tfa.regenLabel'), 'tfaRegenPw', 'type="password" autocomplete="current-password"')}
                ${fld('tfa-regen-code', t('settings.tfa.regenCodeLabel'), 'tfaRegenCode', 'autocomplete="one-time-code" inputmode="numeric"')}
                <span class="err">${ic('circle-alert', 12)}${t('settings.tfa.regenWarning')}</span>
                <div class="row"><button class="btn btn-primary" data-a="tfaRegenConfirm" id="tfa-regen-save">${t('settings.tfa.regen')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
              </form>`
            : '') +
          /* TOTP2 (Phase 31, Plan 03) — the Add-factor wizard stages (D-02/D-04):
             name → password + existing-factor code → QR/verify. The verify stage
             clones the first-enrollment QR rendering; the secret fallback stays
             monospace, read-only, copyable. */
          (stage === 'addName'
            ? `<form data-submit="tfaAddFactorName" class="col" style="gap:14px;max-width:400px;margin-top:14px">
                ${fld('tfa-add-name', t('settings.tfa.addNameLabel'), 'tfaAddName', 'maxlength="64"')}
                <span class="hint">${t('settings.tfa.addNameHint')}</span>
                <div class="row"><button class="btn btn-primary" data-a="tfaAddFactorName" id="tfa-add-name-save">${t('common.next')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
              </form>`
            : '') +
          (stage === 'addPw'
            ? `<form data-submit="tfaAddFactorPw" class="col" style="gap:14px;max-width:400px;margin-top:14px">
                ${fld('tfa-add-pw', t('settings.tfa.pwLabel'), 'tfaAddPw', 'type="password" autocomplete="current-password"')}
                ${fld('tfa-add-pw-code', t('settings.tfa.addPwCodeLabel'), 'tfaAddPwCode', 'autocomplete="one-time-code" inputmode="numeric"')}
                <span class="hint">${t('settings.tfa.addPwHint')}</span>
                <div class="row"><button class="btn btn-primary" data-a="tfaAddFactorPw" id="tfa-add-pw-save">${t('common.next')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
              </form>`
            : '') +
          (stage === 'addVerify'
            ? `<div class="sblock" style="margin-top:14px"><div class="col" style="gap:14px;max-width:400px">
                <div class="field"><span class="label">${t('settings.tfa.scan')} — ${esc(S.ui.tfaLabel || '')}</span><div style="margin-top:8px"><span id="tfa-add-qr" class="tfa-qr-spin" role="status" aria-busy="true"></span></div><span class="hint">${t('settings.tfa.appHint')}</span></div>
                <div class="field"><label class="label" for="tfa-add-secret">${t('settings.tfa.cantScan')}</label><div class="row" style="gap:0"><input class="input" id="tfa-add-secret" readonly value="${esc(S.ui.tfaSecret || '')}" style="font-family:var(--mono,monospace);border-right:0;border-radius:6px 0 0 6px"><button type="button" class="btn btn-secondary" style="border-radius:0 6px 6px 0" data-a="copyText" data-text="${esc(S.ui.tfaSecret || '')}">${t('settings.tfa.copy')}</button></div></div>
                <form data-submit="tfaAddFactorVerify" class="col" style="gap:14px">
                  ${fld('tfa-add-code', t('settings.tfa.enterCode'), 'tfaAddCode', 'autocomplete="one-time-code" inputmode="numeric"')}
                  <div><button class="btn btn-primary" data-a="tfaAddFactorVerify" id="tfa-add-verify-save">${t('settings.tfa.verify')}</button></div>
                </form>
              </div></div>`
            : '') +
          tfaQrFill('tfa-add-qr') +
          /* TOTP2 (D-19/D-16): the per-factor remove confirm — an in-place
             staged form echoing the factor's name, password + live code. No
             picker anywhere (the factor's own id opens the form, D-16's
             exclusion lives server-side). */
          (stage === 'remove'
            ? `<form data-submit="tfaFactorRemove" class="col" style="gap:14px;max-width:400px;margin-top:14px">
                <span class="err">${ic('circle-alert', 12)}${esc(rmName)}</span>
                ${fld('tfa-rm-pw', t('settings.tfa.pwLabel'), 'tfaRmPw', 'type="password" autocomplete="current-password"')}
                ${fld('tfa-rm-code', t('settings.tfa.codeLabel'), 'tfaRmCode', 'autocomplete="one-time-code" inputmode="numeric"')}
                <span class="hint">${t('settings.tfa.removeHint')}</span>
                <div class="row"><button class="btn btn-danger" data-a="tfaFactorRemove" id="tfa-rm-save">${t('settings.tfa.remove')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
              </form>`
            : '')
        );
      }
      if (stage === 'verify') {
        /* D-48/D-55: the URI comes verbatim from the enroll response — the
           client never rebuilds it (T-16-12). The QR is rendered only through
           src/lib/qr.js wrapping the vendored encoder; the secret fallback is
           monospace, read-only, copyable, with the "can't scan?" hint. */
        /* DELIV-02 (D-03): the QR renders asynchronously into the spinner
           placeholder above — the initiating enroll click already shows its
           loading state, and the spinner stays until the lazy chunk resolves. */
        tfaQrFill('tfa-qr');
        return (
          H(t('settings.tfa.lead')) +
          `<div class="sblock" style="margin-top:0"><div class="col" style="gap:14px;max-width:400px">
            <div class="field"><span class="label">${t('settings.tfa.scan')}</span><div style="margin-top:8px"><span id="tfa-qr" class="tfa-qr-spin" role="status" aria-busy="true"></span></div><span class="hint">${t('settings.tfa.appHint')}</span></div>
            <div class="field"><label class="label" for="tfa-secret">${t('settings.tfa.cantScan')}</label><div class="row" style="gap:0"><input class="input" id="tfa-secret" readonly value="${esc(S.ui.tfaSecret || '')}" style="font-family:var(--mono,monospace);border-right:0;border-radius:6px 0 0 6px"><button type="button" class="btn btn-secondary" style="border-radius:0 6px 6px 0" data-a="copyText" data-text="${esc(S.ui.tfaSecret || '')}">${t('settings.tfa.copy')}</button></div></div>
            <form data-submit="tfaVerify" class="col" style="gap:14px">
              ${fld('tfa-code', t('settings.tfa.enterCode'), 'tfaCode', 'autocomplete="one-time-code" inputmode="numeric"')}
              <div><button class="btn btn-primary" data-a="tfaVerify" id="tfa-verify-save">${t('settings.tfa.verify')}</button></div>
            </form>
          </div></div>`
        );
      }
      if (stage === 'pw') {
        /* D-49: the password step-up renders in place — no wizard. */
        return (
          H(t('settings.tfa.lead')) +
          `<form data-submit="tfaBeginEnroll" class="col" style="gap:14px;max-width:400px">
            ${fld('tfa-pw', t('settings.tfa.pwLabel'), 'tfaPw', 'type="password" autocomplete="current-password"')}
            <span class="hint">${t('settings.tfa.pwStep')}</span>
            <div class="row"><button class="btn btn-primary" data-a="tfaBeginEnroll" id="tfa-pw-save">${t('common.next')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
          </form>`
        );
      }
      return (
        H(t('settings.tfa.lead')) +
        `${e.tfaMsg ? `<div class="err" style="margin-bottom:12px">${ic('circle-alert', 12)}${e.tfaMsg}</div>` : ''}` +
        srow(t('settings.tfa.off'), t('settings.tfa.offDesc'), `<button class="btn btn-primary" data-a="tfaStart">${t('settings.tfa.start')}</button>`)
      );
    }
    case 'apikeys': {
      /* MCP-01: personal API keys for the /mcp endpoint. Ground truth is
         S.ui.apiKeys (refreshApiKeys(), server data only). The raw key of a
         fresh key (S.ui.newKey) renders exactly once — the server stores only
         the hash. Revoke follows the operator card's inline-confirm stage. */
      if (!api.enabled) return H(t('settings.apikeys.lead')) + srow(t('settings.apikeys.off'), t('settings.apikeys.offDesc'), '');
      const rows = S.ui.apiKeys || [];
      const stage = S.ui.apiKeyStage;
      const wss = api.workspaces || [];
      const scopeLabel = s => t(s === 'write' ? 'settings.apikeys.scopeWrite' : 'settings.apikeys.scopeRead');
      const row = k =>
        srow(
          `<span class="row" style="gap:8px">${ic('plug', 15)}${esc(k.label)}<span class="mono faint">${esc(k.prefix)}…</span><span class="badge ${k.scope === 'write' ? '' : 'faint'}">${scopeLabel(k.scope)}</span>${k.revokedAt ? `<span class="badge amber">${t('settings.apikeys.revoked')}</span>` : k.expired ? `<span class="badge amber">${t('settings.apikeys.expired')}</span>` : ''}</span>`,
          `${esc(k.workspaceName || '—')} · ${t('settings.apikeys.expires')} ${ago(k.expiresAt)}${k.lastUsedAt ? ` · ${t('settings.apikeys.lastUsed')} ${ago(k.lastUsedAt)}` : ''}`,
          k.revokedAt || k.expired
            ? ''
            : S.ui.apiKeyRevoke === k.id
              ? `<span class="row" style="gap:8px"><span class="hint">${t('settings.apikeys.confirmBody')}</span><button class="btn btn-danger btn-sm" data-a="apiKeyRevokeConfirm" data-id="${esc(k.id)}">${t('settings.apikeys.revoke')}</button><button class="btn btn-secondary btn-sm" data-a="apiKeyCancel">${t('common.cancel')}</button></span>`
              : `<button class="btn btn-danger-ghost btn-sm" data-a="apiKeyRevokeAsk" data-id="${esc(k.id)}">${t('settings.apikeys.revoke')}</button>`,
        );
      return (
        H(t('settings.apikeys.lead')) +
        (S.ui.newKey
          ? `<div class="alert ok" style="margin-bottom:14px"><span>${t('settings.apikeys.createdHint')}</span></div><div class="field" style="max-width:560px"><label class="label">${t('settings.apikeys.newKey')}</label><div class="row" style="gap:0"><input class="input" id="apikey-value" readonly value="${esc(S.ui.newKey)}" style="font-family:var(--mono,monospace);border-right:0;border-radius:6px 0 0 6px"><button type="button" class="btn btn-secondary" style="border-radius:0 6px 6px 0" data-a="copyText" data-text="${esc(S.ui.newKey)}">${t('settings.tfa.copy')}</button></div><span class="hint">${t('settings.apikeys.onceHint')}</span></div><div style="margin-top:10px"><button class="btn btn-secondary btn-sm" data-a="apiKeyDone">${t('common.next')}</button></div>`
          : '') +
        rows.map(row).join('') +
        (!rows.length && !stage && !S.ui.newKey ? `<p class="hint">${t('settings.apikeys.empty')}</p>` : '') +
        (stage === 'create'
          ? `<form data-submit="apiKeyCreate" class="col" style="gap:14px;max-width:440px;margin-top:14px">
              <div class="field"><label class="label" for="ak-label">${t('settings.apikeys.label')}</label><input class="input" id="ak-label" maxlength="60" placeholder="${t('settings.apikeys.labelPlaceholder')}"></div>
              <div class="field"><label class="label" for="ak-ws">${t('settings.apikeys.workspace')}</label><select class="select" id="ak-ws" style="width:100%">${wss.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select><span class="hint">${t('settings.apikeys.workspaceHint')}</span></div>
              <div class="field"><label class="label" for="ak-scope">${t('settings.apikeys.scope')}</label><select class="select" id="ak-scope" style="width:100%"><option value="read">${scopeLabel('read')}</option><option value="write">${scopeLabel('write')}</option></select><span class="hint">${t('settings.apikeys.scopeHint')}</span></div>
              <div class="field"><label class="label" for="ak-days">${t('settings.apikeys.expiry')}</label><select class="select" id="ak-days" style="width:100%">${(S.ui.apiKeyDays || []).map(d => `<option value="${d}">${t('settings.apikeys.days', { n: d })}</option>`).join('')}</select><span class="hint">${t('settings.apikeys.expiryHint')}</span></div>
              <div class="row"><button class="btn btn-primary" data-a="apiKeyCreate" id="ak-save">${t('common.save')}</button><button type="button" class="btn btn-secondary" data-a="apiKeyCancel">${t('common.cancel')}</button></div>
            </form>`
          : stage !== 'created'
            ? `<div style="margin-top:16px"><button class="btn btn-primary" data-a="apiKeyAskCreate">${ic('plus', 14)}${t('settings.apikeys.new')}</button></div>`
            : '')
      );
    }
    case 'sessions': {
      /* Server ground truth (SESS-01): S.ui.sessions is populated by
         refreshSessions() — the mount hook in A.go and after every revoke.
         The document no longer carries a sessions field (14-01). No location
         column anywhere (D-19); pre-upgrade rows with a NULL last_seen_at
         fall back to createdAt for display (D-25). */
      const rows = S.ui.sessions || [];
      return (
        H(t('settings.sessions.lead')) +
        rows
          .map(s =>
            srow(
              `<span class="row" style="gap:8px">${ic(/iPhone|iPad|Android|Mobile/i.test(s.userAgent) ? 'smartphone' : 'monitor', 15)}${esc(deviceLabel(s.userAgent))}${s.current ? `<span class="badge green">${t('settings.sessions.thisDevice')}</span>` : ''}</span>`,
              `${esc(s.ip || '—')} · ${esc(s.lastSeenAt || s.createdAt ? ago(s.lastSeenAt || s.createdAt) : '—')}`,
              s.current ? '' : `<button class="btn btn-secondary btn-sm" data-a="revokeSession" data-id="${esc(s.id)}">${t('palette.signOut')}</button>`,
            ),
          )
          .join('') +
        `<div style="margin-top:16px"><button class="btn btn-danger-ghost" data-a="revokeAll" ${rows.length > 1 ? '' : 'disabled'}>${t('settings.sessions.revokeAll')}</button></div>`
      ) + (operatorCard() + auditTrailCard());
    }
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
