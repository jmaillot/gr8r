/* =====================================================================
   102-01 ENTRA ID MAPPINGS (MAPUI-01 client half) — the operator's
   group → workspace mapping surface over the Phase 101 routes. Render
   ONLY from the GET /api/governance/group-mappings payload (T-60-05
   doctrine) — never from the client document. One fill loop with a
   monotonic sequence + in-flight abort lives in actions.js
   (refreshMappings, the governance pattern); NO auto-poll — a
   low-frequency surface. A non-operator deep-linking the route gets the
   server 403 surfaced as a fullstate — never a blank page, never a
   client-side guess (D-11: the server is the control, the nav gate is
   cosmetic). All payload strings render through esc() — text nodes
   only, no raw interpolation (T-79-10 stored-XSS watch-item).
   ===================================================================== */
import { esc, ago } from '../core/utils.js';
import { ic } from '../core/icons.js';
import { S } from '../core/store.js';
import { api } from '../core/api.js';
import { t } from '../core/i18n.js';
import { empty } from '../ui/helpers.js';
import { ROUTE_TEARDOWN } from '../shell/render.js';
import { srow } from './settings.js';
import { refreshMappings } from '../actions/actions.js';

/* The fullstates are verbatim governance.js shapes: 403 → lock glyph +
   err.code403 + route name + keyed body + home way out; other fetch
   errors → cloud-alert + retry (explicit, never auto re-kicked while
   the error state is set — CR-01). */
const full403 = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state" style="padding:0"><div class="glyph">${ic('lock', 20)}</div></div><span class="code">${t('err.code403')}</span><h1>${t('nav.route.mappings')}</h1><p>${t('err.operatorOnly')}</p><div class="row"><button class="btn btn-primary" data-a="go" data-r="home">${t('nav.goHome')}</button></div></div></div>`;
const fullErr = () =>
  `<div class="fullstate"><div class="box"><div class="empty-state err" style="padding:0"><div class="glyph">${ic('cloud-alert', 20)}</div></div><h1>${t('page.somethingWrong')}</h1><p>${t('page.loadFailedBody')}</p><div class="row"><button class="btn btn-primary" data-a="mapRetry">${ic('refresh-cw', 14)}${t('page.tryAgain')}</button></div></div></div>`;

/* One row per mapping — the payload's flat row shape (Phase 101): label,
   workspaceName, role badge, groupGuid (mono), and the createdAt/updatedAt
   timestamps in the house ago() format (MAPUI-02: timestamps in the list).
   label/workspaceName/groupGuid ride esc() at EVERY render — the stored-XSS
   watch-item (T-102-01). No data-a anywhere: display-only this plan (plan 02
   adds the delete control). */
const mapRow = m =>
  srow(
    `<span class="row" style="gap:8px"><span class="trunc" style="display:inline-block;max-width:260px;vertical-align:bottom;font-weight:600">${esc(m.label || '')}</span><span class="badge">${t('common.role.' + (m.role || 'member'))}</span></span>`,
    `<span class="row" style="gap:8px"><span class="faint trunc" style="display:inline-block;max-width:220px;vertical-align:bottom">${esc(m.workspaceName || '—')}</span><span class="faint mono trunc" style="display:inline-block;max-width:180px;vertical-align:bottom">${esc(m.groupGuid || '')}</span></span>`,
    `<span class="row" style="gap:8px"><span class="faint">${esc(ago(m.createdAt))}</span><span class="faint">${esc(ago(m.updatedAt))}</span></span>`,
  );

export function pageMappings() {
  /* The server decision, surfaced verbatim (governance DASH-04/D-52-4 shape):
     the gate is the server's 403; the page only reports it — keyed message,
     home way out. */
  if (S.ui.mapErr?.status === 403) return full403();
  if (S.ui.mapErr?.status) return fullErr();

  const loading = !S.ui.mapRows;
  if (!S.ui.mapRows && !S.ui.mapErr) refreshMappings(); // in-render kick covers a boot-time deep link (governance.js:76 precedent)

  const rows = loading ? [] : S.ui.mapRows;
  const body = loading
    ? `<div class="panel-b faint" aria-busy="true">${t('page.mappings.loading')}</div>`
    : rows.length
      ? rows.map(mapRow).join('')
      : empty('link', t('page.mappings.emptyTitle'), t('page.mappings.emptyBody'), '', 'sm', 3);

  return `<div class="page wide" style="max-width:1200px">
    <div class="ph"><div><h1>${t('nav.route.mappings')}</h1><p>${t('page.mappings.subtitle')}</p></div></div>
    ${mapCreateForm()}
    <div class="sblock">
      <div class="panel" style="overflow-x:auto">${body}</div>
    </div>
    ${api.user?.isInstanceAdmin ? govDeadCard() : ''}
  </div>`;
}

/* =====================================================================
   102-02 CREATE FORM PANEL (MAPUI-02, D-01/D-03/D-08): ALWAYS visible —
   a compact panel ABOVE the list, no reveal-on-add button (searching =
   adding, the governance D-90-3 precedent). GUID paste input, label
   input maxlength="200" (the server slices at 200), workspace select
   fed by S.ui.mapWs (the plan-01 loader's advisory pool — until it
   lands the picker shows a disabled 'select workspace' option), role
   select owner/admin/member riding the existing common.role.* keys
   (the govOrphanBody precedent). Every draft value renders through
   esc() — value attributes are the stored-XSS watch-item (T-102-04).
   Draft state lives in S.ui.mapForm via the IN.map* handlers, never
   the DOM.
   ===================================================================== */
const mapCreateForm = () => {
  const f = S.ui.mapForm || {};
  const wsPool = S.ui.mapWs || [];
  const wsOptions = wsPool.length
    ? wsPool.map(w => `<option value="${esc(w.id || '')}" ${f.wsId === w.id ? 'selected' : ''}>${esc(w.name || '')}</option>`).join('')
    : '';
  const wsSelect = `<select class="input" id="map-ws" data-in="mapWs" aria-label="${t('page.mappings.wsLabel')}">${
    wsPool.length
      ? `<option value="" ${!f.wsId ? 'selected' : ''} disabled>${t('page.mappings.wsPlaceholder')}</option>${wsOptions}`
      : `<option value="" selected disabled>${t('page.mappings.wsPlaceholder')}</option>`
  }</select>`;
  const roleSelect = `<select class="input" id="map-role" data-in="mapRole" aria-label="${t('page.mappings.roleLabel')}">${['owner', 'admin', 'member']
    .map(r => `<option value="${r}" ${(f.role || 'member') === r ? 'selected' : ''}>${t('common.role.' + r)}</option>`)
    .join('')}</select>`;
  return `<div class="sblock">
    <h2 style="margin-bottom:4px">${t('page.mappings.formTitle')}</h2>
    <p class="hint" style="margin-bottom:10px">${t('page.mappings.formLead')}</p>
    <div class="panel" style="padding:12px">
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:flex-end">
        <div><label class="label" for="map-guid">${t('page.mappings.guidLabel')}</label>
          <input class="input" id="map-guid" data-in="mapGuid" placeholder="${t('page.mappings.guidPlaceholder')}" value="${esc(f.guid || '')}" aria-label="${t('page.mappings.guidLabel')}"></div>
        <div><label class="label" for="map-label">${t('page.mappings.labelLabel')}</label>
          <input class="input" id="map-label" data-in="mapLabel" value="${esc(f.label || '')}" maxlength="200" aria-label="${t('page.mappings.labelLabel')}"></div>
        <div><label class="label" for="map-ws">${t('page.mappings.wsLabel')}</label>${wsSelect}</div>
        <div><label class="label" for="map-role">${t('page.mappings.roleLabel')}</label>${roleSelect}</div>
        <button class="btn btn-primary" data-a="mapCreate">${t('page.mappings.create')}</button>
      </div>
    </div>
  </div>`;
};

/* =====================================================================
   83-02 DEAD-MAPPING WARNING CARD (D-06/D-07/D-08/D-10/D-11, T-83-07)
   MOVED WHOLESALE from governance.js (102-01): renders ONLY on the
   Mappings page, BELOW the list. Operator-gated, DISPLAY-ONLY: lists
   orphaned group_mappings rows and the Phase 82 refused-guard audit
   trail. Rendered ONLY when the dead-mappings payload carries at least
   one item — zero dead items → the markup is absent entirely, no
   off-line shell (D-10). Every value is esc()d at FIRST render —
   group_mappings.label is an opaque carried value (the Phase 80 XSS
   watch-item) and the trail action string is split on the FIRST colon
   only (D-08). No data-a anywhere in the card (D-11: cleanup stays
   deferred with the mapping editor). Content keys unchanged apart from
   the namespace rename page.governance.dead* → page.mappings.dead*
   (D-07: zero new card content keys).
   ===================================================================== */
const govDeadCard = () => {
  const dead = S.ui.govDead;
  if (!dead) return '';
  const orphans = dead.orphans || [];
  const trail = dead.trail || [];
  if (!orphans.length && !trail.length) return '';
  /* FIRST-colon-only split (D-08/Pitfall 7): `group_<delta>:group:<guid>:<reason>`
     → delta | group | guid | reason. A second first-colon split peels guid
     from reason — a colon inside a reason never corrupts the split. */
  const splitFirst = s => {
    const [head, tail] = String(s ?? '').split(/:(.*)/s);
    return [head || '', tail || ''];
  };
  const orphanRow = o =>
    `<div class="srow"><div><div class="row" style="gap:8px"><span class="badge amber">${esc(o.kind || '')}</span><span class="t trunc">${esc(o.label || '')}</span><span class="faint mono trunc">${esc(o.group_guid || '')} → ${esc(o.workspace_id || '')}</span></div></div></div>`;
  const trailRow = r => {
    const [delta, rest] = splitFirst(r.action);
    const [ns, tail2] = splitFirst(rest);
    const [guid, reason] = splitFirst(tail2);
    return `<div class="srow"><div><div class="row" style="gap:8px"><span class="badge">${esc(delta)}</span><span class="faint">${esc(ns)}</span><span class="mono trunc">${esc(guid)}</span><span class="faint trunc">${esc(reason)}</span><span class="faint">${esc(ago(r.created_at))}</span></div></div></div>`;
  };
  return `<div class="sblock" style="margin-top:16px"><h2 style="margin-bottom:4px">${t('page.mappings.deadTitle')}</h2><p class="hint" style="margin-bottom:10px">${t('page.mappings.deadLead')}</p><div class="panel"><div style="margin-bottom:12px"><div class="label" style="margin-bottom:6px">${t('page.mappings.deadOrphans')}</div>${orphans.map(orphanRow).join('')}</div><div><div class="label" style="margin-bottom:6px">${t('page.mappings.deadTrail')}</div>${trail.map(trailRow).join('')}</div></div></div>`;
};

/* Phase 60 (D-05): teardown registry pattern — the skeleton's stub; plan 02
   fills this with the staged inline-confirm/form state cleanup (the
   governance.js govOrphanTeardown pattern). */
const mapTeardown = () => {};
ROUTE_TEARDOWN.mappings = mapTeardown;
