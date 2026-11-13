/* Per-user notification preferences — local-mode persistence (Phase 34, D-05/D-08).
   When the API is enabled, prefs live in per-user server rows (api.getNotifPrefs /
   api.putNotifPrefs). In local demo mode they live in localStorage, keyed PER
   WORKSPACE so two local workspaces never bleed prefs into each other (D-08).
   The key is deliberately outside the projects.v2 blob (the LOCALE_STORAGE_KEY
   precedent, D-05): the workspace document is never a prefs carrier again (D-01). */
export const NOTIF_PREFS_KEY_PREFIX = 'projects.notifPrefs.';

/* Mirror of the server's NOTIF_PREF_DEFAULTS (D-27-5): 12 keys, email_comment
   the ONLY false. The legacy push toggle for due dates was removed with gap
   G-37-2 and RESTORED by D-09 (Phase 59) on BOTH sides (whitelist parity
   preserved) — push_due is the live reminder-push pref; the foreground toast
   path in core/push.js still never maps due rows (server-side only). The
   settings UI row for push_due lands in Phase 59 plan 03 (with i18n keys).
   email_digest,
   mention_team, mention_ws, assign_status, assign_over read undefined-falsy —
   email_digest is a real OPT-IN as of Phase 38 (D-14: stored true = on,
   undefined/false = off; the digest replaces individual reminder emails) — the
   same shape the server accessor produces for a user with no row. Since
   projectsstudio#18 the mention_ws and assign_* toggles no longer RENDER in
   the settings UI (no emission-code reader — notification-audit), but the
   keys stay whitelisted on both sides so legacy stored rows round-trip. */
export const NOTIF_PREF_DEFAULTS = {
  email_mention: true,
  email_assign: true,
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
  'email_digest', // opt-in key (Phase 38, D-14): toggleable but NOT defaulted — undefined-falsy
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

/* Merge a sanitized client store and a sanitized server row into one prefs
   object (Phase 34, G-34-4). Start from the D-27-5 defaults, apply the client
   object, then the server object — the server row is canonical, mirroring the
   PUT adoption in actions.js. Both sides pass through the same whitelist +
   boolean-only filter the local path uses, so a tampered GET response cannot
   inject free-form keys or non-boolean values into app state (T-34-11). Pure:
   no store, no DOM, no api import; inputs are never mutated (D-01: the result
   is a flat whitelisted object — never a doc-shaped notifPrefs carrier). */
export function mergeNotifPrefs(clientPrefs, serverPrefs) {
  return { ...NOTIF_PREF_DEFAULTS, ...sanitize(clientPrefs), ...sanitize(serverPrefs) };
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
