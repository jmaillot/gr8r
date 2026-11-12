/* Per-user saved views & column state — local-mode persistence (Phase 57, D-05/D-08).
   When the API is enabled, live view state lives in per-user server rows
   (api.getViews / api.putViews, the saved_views table's sentinel name='' row).
   In local demo mode it lives in localStorage, keyed PER WORKSPACE so two
   local workspaces never bleed view state into each other (D-08) — the
   notifPrefs pattern. The key is deliberately outside the projects.v2 blob:
   the workspace document is never a view-state carrier again (D-05/D-06).
   Pure leaf module: no store, no DOM, no api import — the same discipline
   notifPrefs.js keeps. */

export const SAVED_VIEWS_KEY_PREFIX = 'projects.savedViews.';

/* The D-11 snapshot whitelist: a view blob captures filters + columns
   (hidden set + widths) + sort + group + showDone. The transient free-text
   `q` and every `_`-prefixed transient key are never stored (D-11); unknown
   fields intersect away silently — the lenient-load criterion (D-12), no
   hard failure on a blob written by a newer/older schema. */
export const VIEW_BLOB_KEYS = ['filters', 'sort', 'group', 'hidden', 'colW', 'showDone'];

export const VIEW_SCHEMA_VERSION = 1;

/* Shallow whitelist filter over one view blob. Values pass verbatim — the
   consumer (viewOf) owns their shape; the whitelist only decides which KEYS
   may exist. Pure: the input is never mutated. */
export function sanitizeViewBlob(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of VIEW_BLOB_KEYS) if (raw[k] !== undefined) out[k] = raw[k];
  return out;
}

export const savedViewsStorageKey = workspaceId => SAVED_VIEWS_KEY_PREFIX + (workspaceId || 'local');

/* Read the whole per-workspace { tableKey: blob } map, sanitized per blob.
   Storage blocked / corrupt JSON / absent key all read as {} — viewOf()
   defaults apply per key (D-13). */
function readMap(workspaceId) {
  const out = {};
  const parsed = JSON.parse(localStorage.getItem(savedViewsStorageKey(workspaceId)));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [k, blob] of Object.entries(parsed)) {
      if (blob && typeof blob === 'object' && !Array.isArray(blob)) out[k] = sanitizeViewBlob(blob);
    }
  }
  return out;
}

export function getLocalSavedViews(workspaceId) {
  try {
    return readMap(workspaceId);
  } catch {
    /* storage blocked, corrupt JSON, or absent key: no stored view state */
    return {};
  }
}

/* Merge one key's sanitized blob into the per-workspace map (merge-not-replace
   at the map level — other table keys' blobs are never touched). blob === null
   removes the entry: the local-mode half of the D-14 reset (delete the row so
   defaults return). Storage blocked or full: state stays for the session only. */
export function setLocalSavedViews(workspaceId, key, blob) {
  try {
    const map = readMap(workspaceId);
    if (blob === null || blob === undefined) delete map[key];
    else map[key] = sanitizeViewBlob(blob);
    localStorage.setItem(savedViewsStorageKey(workspaceId), JSON.stringify(map));
  } catch {
    /* storage blocked or full */
  }
}

/* D-14 reset, local half: remove one table key's live entry so the next
   viewOf() call re-creates the hardcoded defaults. */
export function removeLocalSavedView(workspaceId, key) {
  setLocalSavedViews(workspaceId, key, null);
}
