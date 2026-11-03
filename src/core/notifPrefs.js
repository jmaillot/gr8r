/* Per-user notification preferences — local-mode persistence (Phase 34, D-05/D-08).
   When the API is enabled, prefs live in per-user server rows (api.getNotifPrefs /
   api.putNotifPrefs). In local demo mode they live in localStorage, keyed PER
   WORKSPACE so two local workspaces never bleed prefs into each other (D-08).
   The key is deliberately outside the projects.v2 blob (the LOCALE_STORAGE_KEY
   precedent, D-05): the workspace document is never a prefs carrier again (D-01). */
export const NOTIF_PREFS_KEY_PREFIX = 'projects.notifPrefs.';

/* Mirror of the server's NOTIF_PREF_DEFAULTS (D-27-5): 13 keys, email_comment
   the ONLY false. Four more toggle keys exist in the UI (mention_team,
   mention_ws, assign_status, assign_over) and read undefined-falsy, which the
   settings coercions (x !== false / !!x) render as ON — the same shape the
   server accessor produces for a user with no row. */
export const NOTIF_PREF_DEFAULTS = {
  email_mention: true,
  email_assign: true,
  email_digest: true,
  email_comment: false,
  email_reminder: true,
  due_reminder: true,
  past_due: true,
  push_mention: true,
  push_assign: true,
  push_comment: true,
  push_due: true,
  mention_all: true,
  assign_self: true,
};

/* The 17 keys the settings UI can toggle — the server PUT whitelist plus the
   four undefined-falsy extras. Read-side validation drops anything else, so a
   tampered or stale blob cannot inject arbitrary keys into app state. */
export const NOTIF_PREF_KEYS = [
  ...Object.keys(NOTIF_PREF_DEFAULTS),
  'mention_team',
  'mention_ws',
  'assign_status',
  'assign_over',
];

export const notifPrefsKey = workspaceId => NOTIF_PREFS_KEY_PREFIX + (workspaceId || 'local');

/* Whitelist + boolean-only filter — the readStoredLocale analog: keep only keys
   the server itself would accept, with only boolean values (the PUT coerces to
   Boolean before storing, so a boolean blob is the only legitimate shape). */
function sanitize(stored) {
  const out = {};
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
    for (const k of NOTIF_PREF_KEYS) {
      if (typeof stored[k] === 'boolean') out[k] = stored[k];
    }
  }
  return out;
}

export function getLocalNotifPrefs(workspaceId) {
  try {
    return { ...NOTIF_PREF_DEFAULTS, ...sanitize(JSON.parse(localStorage.getItem(notifPrefsKey(workspaceId)))) };
  } catch {
    /* storage blocked, corrupt JSON, or absent key: all-ON defaults (D-27-5) */
    return { ...NOTIF_PREF_DEFAULTS };
  }
}

export function setLocalNotifPrefs(workspaceId, prefs) {
  try {
    localStorage.setItem(notifPrefsKey(workspaceId), JSON.stringify(sanitize(prefs)));
  } catch {
    /* storage blocked or full: prefs stay for the session only */
  }
}
