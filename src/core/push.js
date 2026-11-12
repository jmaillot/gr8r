/* Real browser push + foreground toasts for notification rows (Phase 48, D-48-1/D-48-2).
   The 30s poll in main.js calls notifyNewEvents() after a successful hydration —
   ONE dispatch site, behind the existing poll guards, never a parallel fetch
   channel (D-48-2). Exactly ONE feedback per new unread mention/assign/comment
   row, gated by its push_* pref: a foreground toast when the tab is visible,
   a browser Notification (via the service worker when registered) when the tab
   is hidden — never both.

   Seen-set discipline (Pitfall 3): the set of already-notified notif ids lives
   in localStorage under 'projects.pushSeen.<wsId>.<userId>' — scoped PER USER +
   WORKSPACE, deliberately outside the projects.v2 blob (D-01). The first call
   of a session PRIMES the set silently, so login never toasts a backlog. */
import { S, D, myNotifs, mem, task } from './store.js';
import { api } from './api.js';
import { t } from './i18n.js';
import { toast } from '../ui/toast.js';

export const PUSH_SEEN_PREFIX = 'projects.pushSeen.';

/* Session prime (Pitfall 3): the seen-set key the last prime covered. The first
   notifyNewEvents() call for a given user+workspace seeds that seen-set and
   notifies nothing — and an SPA workspace switch (a new seen key, no reload)
   re-primes silently, so the target workspace's unread backlog never toasts. */
let _primedFor = null;

/* Only these row types map to a push_* pref; update / due_reminder / past_due
   never notify (G-37-2 — the push_due toggle stays dead). */
const PUSH_TYPE_PREF = { mention: 'push_mention', assign: 'push_assign', comment: 'push_comment' };

/* The foreground toast call seam: a live exported binding the test harness can
   observe/replace (toast.js is DOM-bound). Production always uses toast(). */
export let showToast = toast;
export function setToastSink(fn) {
  showToast = fn || toast;
}

/* One-time explanatory toast when a permission request comes back 'denied'
   (48-02, D-48-4): at most ONE per browser session, module-scoped — the user
   has already been told; re-toggling never spams the same explanation.
   Phase 57: the module now rides the lazy push chunk (DELIV-02 index gate),
   so the latched state is exposed as a live binding for the D-48-4 test —
   the handler resolves a DIFFERENT module instance than a static test
   import would see. */
let _blockedToastShown = false;
export let blockedToastFired = false;
export function blockedToastOnce() {
  if (_blockedToastShown) return;
  _blockedToastShown = true;
  blockedToastFired = true;
  showToast(t('toast.pushBrowserBlocked'), { kind: 'err', ms: 9000 });
}

export const seenKey = (wsId, userId) => `${PUSH_SEEN_PREFIX}${wsId || 'local'}.${userId || 'local'}`;

export function getSeen(wsId, userId) {
  try {
    const v = JSON.parse(localStorage.getItem(seenKey(wsId, userId)));
    return Array.isArray(v) ? v : [];
  } catch {
    /* storage blocked, corrupt JSON, or absent key: nothing is considered seen */
    return [];
  }
}

export function markSeen(wsId, userId, ids) {
  try {
    localStorage.setItem(seenKey(wsId, userId), JSON.stringify(Array.isArray(ids) ? ids.slice(-200) : []));
  } catch {
    /* storage blocked or full: the seen-set stays for the session only */
  }
}

/* PURE (test seam): the unread, unseen rows whose type maps to an enabled
   push_* pref. Read rows, seen rows, and non-mapped types (update,
   due_reminder, past_due) never become candidates. */
export function deriveCandidates(notifs, prefs, seen) {
  return (notifs || []).filter(n => {
    if (!n || n.read || seen.includes(n.id)) return false;
    const pref = PUSH_TYPE_PREF[n.type];
    return !!pref && !!prefs[pref];
  });
}

/* PURE (test seam): the same-origin deep link for a row — the render.js
   /w/:slug/task/:key grammar, without importing shell/render.js (cycle risk). */
export function buildNotifUrl(n) {
  const tk = n.task ? task(n.task) : null;
  const slug = D().ws?.url;
  return tk?.key && slug ? `/w/${slug}/task/${encodeURIComponent(tk.key)}` : slug ? `/w/${slug}` : '/';
}

/* The poll entry point. The first call for a given user+workspace primes the
   seen-set and returns silently (no toast/notification storm on login — or on
   an SPA workspace switch, which changes the seen key without a reload).
   Afterwards each candidate is marked seen BEFORE dispatching — the poll is
   the delivery guarantee, the email channel is the backstop. */

/* PURE (test seam): the poll permission memo diff (48-02, D-48-4). The settings
   badge derives from Notification.permission, so a flip (denied → granted) must
   re-render without a reload; a stable read must not. */
export function permChanged(current, memo) {
  return current !== memo;
}
export async function notifyNewEvents() {
  /* typeof (not the quoted 'Notification' in-check): the i18n sweep reports any
     quoted capitalised single word as a suspected user-visible literal. */
  if (typeof window === 'undefined' || typeof window.Notification === 'undefined') return;
  const wsId = api.enabled ? api.workspace?.id : D().ws?.url;
  const userId = api.user?.id || 'local';
  const key = seenKey(wsId, userId);
  if (_primedFor !== key) {
    _primedFor = key;
    markSeen(wsId, userId, myNotifs().filter(n => !n.read).map(n => n.id));
    return;
  }
  const seen = getSeen(wsId, userId);
  const candidates = deriveCandidates(myNotifs(), S.notifPrefs, seen);
  if (candidates.length) markSeen(wsId, userId, [...seen, ...candidates.map(n => n.id)]);
  for (const n of candidates) {
    const name = mem(n.by)?.name || '';
    const title = (n.task ? task(n.task)?.title : '') || '';
    const vars = { name, title };
    const line = t(`toast.push${n.type[0].toUpperCase()}${n.type.slice(1)}`, vars);
    if (!document.hidden) {
      /* Foreground: the plain composed string — toast.js applies esc() itself (T-48-01). */
      showToast(line);
      continue;
    }
    if (Notification.permission !== 'granted') continue;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.showNotification(line, { body: line, tag: `gr8r-${n.id}`, icon: '/favicon.svg', data: { url: buildNotifUrl(n) } });
      else new Notification(line, { body: line }); // SW not yet active — constructor fallback (Pattern 1)
    } catch {
      /* dispatch failed: the poll is the delivery guarantee, email is the backstop */
    }
  }
}
