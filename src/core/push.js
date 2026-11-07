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

/* Session prime flag (Pitfall 3): the first notifyNewEvents() call of a session
   seeds the seen-set and notifies nothing. */
let _primed = false;

/* Only these row types map to a push_* pref; update / due_reminder / past_due
   never notify (G-37-2 — the push_due toggle stays dead). */
const PUSH_TYPE_PREF = { mention: 'push_mention', assign: 'push_assign', comment: 'push_comment' };

/* The foreground toast call seam: a live exported binding the test harness can
   observe/replace (toast.js is DOM-bound). Production always uses toast(). */
export let showToast = toast;
export function setToastSink(fn) {
  showToast = fn || toast;
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

/* The poll entry point. First call of a session primes the seen-set and
   returns silently (no toast/notification storm on login). Afterwards each
   candidate is marked seen BEFORE dispatching — the poll is the delivery
   guarantee, the email channel is the backstop. */
export async function notifyNewEvents() {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (!_primed) {
    _primed = true;
    const wsId = api.enabled ? api.workspace?.id : D().ws?.url;
    markSeen(wsId, api.user?.id || 'local', myNotifs().filter(n => !n.read).map(n => n.id));
    return;
  }
  const wsId = api.enabled ? api.workspace?.id : D().ws?.url;
  const userId = api.user?.id || 'local';
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
