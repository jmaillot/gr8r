/* Per-user view sync — the bridge between the store/actions and the
   saved_views substrate (Phase 57, D-05/D-07/D-08). Split into its own lazy
   chunk by the DELIV-02 500 kB index gate (the 56-02 pattern): the write path
   is needed at the first column toggle, the read path at workspace entry —
   never at boot parse time. */
import { D, S } from './store.js';
import { api, call } from './api.js';
import { getLocalSavedViews, removeLocalSavedView, sanitizeViewBlob, setLocalSavedViews } from './savedViews.js';

const getViews = (workspaceId, key) => call('GET', `/api/me/views?workspace=${encodeURIComponent(workspaceId || '')}&key=${encodeURIComponent(key || '')}`);
const putViews = (workspaceId, key, blob) => call('PUT', '/api/me/views', { workspace: workspaceId, key, blob });

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
