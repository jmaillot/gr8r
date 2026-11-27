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
    <div class="sblock">
      <div class="panel" style="overflow-x:auto">${body}</div>
    </div>
  </div>`;
}

/* Phase 60 (D-05): teardown registry pattern — the skeleton's stub; plan 02
   fills this with the staged inline-confirm/form state cleanup (the
   governance.js govOrphanTeardown pattern). */
const mapTeardown = () => {};
ROUTE_TEARDOWN.mappings = mapTeardown;
