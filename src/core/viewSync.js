/* Per-user view sync — the bridge between the store/actions and the
   saved_views substrate (Phase 57, D-05/D-07/D-08). Split into its own lazy
   chunk by the DELIV-02 500 kB index gate (the 56-02 pattern): the write path
   is needed at the first column toggle, the read path at workspace entry —
   never at boot parse time. */
import { D, S } from './store.js';
import { api, call } from './api.js';
import { viewOf } from '../shell/view-engine.js';
import { getLocalSavedViews, removeLocalSavedView, sanitizeViewBlob, setLocalSavedViews } from './savedViews.js';

const getViews = (workspaceId, key) => call('GET', `/api/me/views?workspace=${encodeURIComponent(workspaceId || '')}&key=${encodeURIComponent(key || '')}`);
const putViews = (workspaceId, key, blob) => call('PUT', '/api/me/views', { workspace: workspaceId, key, blob });
const putViewsNamed = (workspaceId, key, name, blob) => call('PUT', '/api/me/views', { workspace: workspaceId, key, name, blob });

/* Per-user view write-through (D-05/D-07): debounced like the doc push — a
   column toggle must not PUT per click. Server mode writes the saved_views
   live row via api.putViews; local mode mirrors into the per-workspace
   localStorage key and never calls the routes (D-08). The blob is whitelisted
   client-side (no `q`, no `_`-prefixed transients); the server intersects
   again. Failures are silent except 401 (session-expired path), mirroring
   hydrateNotifPrefs' discipline — a failed view save must never block the UI. */
let _viewsT;
export function persistLiveView(key) {
  if (!key) return;
  clearTimeout(_viewsT);
  _viewsT = setTimeout(async () => {
    const wsId = api.enabled ? api.workspace?.id : D().ws.url;
    const blob = sanitizeViewBlob(S.views[key]);
    if (!api.enabled) return setLocalSavedViews(wsId, key, blob);
    const r = await putViews(wsId, key, blob);
    if (r.status === 401) {
      window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401, error: r.error } }));
    }
  }, 450);
}

/* Hydration of the signed-in user's live view rows at every workspace entry
   (the hydrateNotifPrefs pattern). Every viewOf() key family rides the same
   live row shape (research A2): the two static tables plus one key per
   project. Local mode reads its per-workspace localStorage key and issues no
   GET (D-08). 401 rides the session-expired path; any other failure is silent
   and non-blocking — workspace entry never waits on or fails because of a
   view read, and a missing row simply leaves viewOf()'s defaults in place
   (D-13). */
export async function hydrateViews() {
  const wsId = api.enabled ? api.workspace?.id : D().ws.url;
  if (!api.enabled) {
    S.views = getLocalSavedViews(wsId);
    return;
  }
  const keys = ['tasks', 'mytasks', ...(Array.isArray(D().projects) ? D().projects.filter(p => p?.id).map(p => `p:${p.id}`) : [])];
  let unauthorized = false;
  for (const key of keys) {
    const r = await getViews(wsId, key);
    if (r.ok && r.data?.views?.live) S.views[key] = sanitizeViewBlob(r.data.views.live);
    else if (r.status === 401) unauthorized = true;
  }
  if (unauthorized) {
    window.dispatchEvent(new CustomEvent('projects:save-error', { detail: { status: 401 } }));
  }
}

/* D-14 reset, local half: remove one table key's live localStorage entry so
   the next viewOf() call re-creates the hardcoded defaults. */
export { removeLocalSavedView };

/* ---------- named views (Phase 57 plan 02, VIEW-02, D-10/D-11/D-12) ---------- */

import { cachedNamedViews, getLocalNamedViews, isNamedViewKey, removeLocalNamedView, setLocalNamedView, setNamedViewsCache, NAMED_VIEW_KEYS, NAMED_VIEW_MAX, NAMED_VIEW_BLOB_MAX_BYTES } from './savedViews.js';

/* Snapshot of the current live view through the whitelist — never a whole-
   object clone: `q` and every `_`-prefixed render-time transient (e.g. the
   _projHidden table.js mutation) are excluded by construction. */
export function snapshotView(key) {
  return sanitizeViewBlob(S.views[key]);
}

/* Refresh the named-views cache for the current workspace — the views popover
   calls this on every open (D-52 refetch-on-open discipline). Server mode
   GETs the two D-10 keys; local mode reads the per-workspace mirror. */
export async function refreshNamedViews() {
  const wsId = api.enabled ? api.workspace?.id : D().ws.url;
  if (!api.enabled) {
    for (const key of NAMED_VIEW_KEYS) setNamedViewsCache(wsId, key, getLocalNamedViews(wsId, key));
    return;
  }
  for (const key of NAMED_VIEW_KEYS) {
    const r = await getViews(wsId, key);
    setNamedViewsCache(wsId, key, r.ok && Array.isArray(r.data?.views?.named) ? r.data.views.named : []);
  }
}

export { cachedNamedViews };

/* Save the current live view under a name. Server mode PUTs a named row
   (server-side caps/uniqueness are the real guard — client pre-checks only
   produce honest errors); local mode upserts the mirror row. Returns the
   keyed error code on failure, null on success. */
export async function saveNamedView(workspaceId, key, name) {
  const blob = snapshotView(key);
  if (!isNamedViewKey(key)) return 'viewKeyNotNamed';
  const size = JSON.stringify(blob).length;
  if (size > NAMED_VIEW_BLOB_MAX_BYTES) return 'viewBlobTooLarge';
  if (!api.enabled) {
    const existing = getLocalNamedViews(workspaceId, key);
    if (!existing.some(v => v.name.toLowerCase() === name.toLowerCase()) && existing.length >= NAMED_VIEW_MAX) return 'viewLimitReached';
    setLocalNamedView(workspaceId, key, name, blob);
    await refreshNamedViews();
    return null;
  }
  const r = await putViewsNamed(workspaceId, key, name, blob);
  if (r.ok) {
    await refreshNamedViews();
    return null;
  }
  return r.data?.code || 'viewSaveFailed';
}

/* Apply a named view: the whole live viewOf(key) state is replaced IN PLACE
   (D-11/D-15) except the two live-only keys the snapshot can never carry —
   the transient search text `q` and the render `mode` (list/board/table),
   which belong to the session, not the snapshot. The whitelist intersection
   is lenient: unknown fields from an older/newer schema version intersect
   away (D-12). The normal write-through persists the applied state (the
   caller triggers it like any other view edit). */
export function applyNamedView(key, blob) {
  const v = viewOf(key);
  const clean = sanitizeViewBlob(blob);
  for (const k of Object.keys(v)) if (k !== 'q' && k !== 'mode' && !(k in clean)) delete v[k];
  Object.assign(v, clean);
}

/* Delete one named row (or, with name='', the live row — the server half of
   the D-14 reset). Returns the keyed error code or null. */
export async function deleteViewRow(workspaceId, key, name) {
  if (!api.enabled) {
    if (name) removeLocalNamedView(workspaceId, key, name);
    else removeLocalSavedView(workspaceId, key);
    await refreshNamedViews();
    return null;
  }
  const r = await call('DELETE', `/api/me/views?workspace=${encodeURIComponent(workspaceId || '')}&key=${encodeURIComponent(key || '')}&name=${encodeURIComponent(name || '')}`);
  if (r.ok) {
    await refreshNamedViews();
    return null;
  }
  return r.data?.code || 'viewDeleteFailed';
}
