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
import { api, call } from './api.js';
import { deviceLabel } from './utils.js';
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

/* ================= Settings Push tab client helpers (Phase 59, D-01..D-07) =================
   Subscribe/unsubscribe/device-list helpers. They ride the lazy push chunk
   (DELIV-02) — the SW registration itself stays eager elsewhere. D-01: the
   ONLY permission request in the codebase fires inside enablePush, reached
   exclusively from the Settings master-toggle click (never page load, never
   first mention). The workspace id rides a seam (the setToastSink pattern)
   so the node harness can pin it while production reads api state. */

export let pushWorkspace = () => (api.enabled ? api.workspace?.id || '' : '');
export function setPushWorkspace(fn) {
  pushWorkspace = fn || (() => (api.enabled ? api.workspace?.id || '' : ''));
}

/* D-04: the device label is client-chosen once at subscribe time — derived
   from the browser/OS (the same builder the sessions table uses), never
   asked for twice. */
/* One idempotent SW registration, callable from anywhere (boot in main.js AND
   every SPA login path via enterApp — CR-02: a password login with no reload
   never re-fired the boot-time registration, leaving serviceWorker.ready
   hanging and enablePush unusable until the next full page load). */
export const registerSw = () => {
  if (!('serviceWorker' in navigator) || !api.enabled) return;
  navigator.serviceWorker.register('/sw.js').catch(() => {});
};

/* CR-02: serviceWorker.ready hangs forever when no SW is registered yet —
   every waiter must be bounded so failures surface as toasts, not dead UI. */
const swReady = () =>
  Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, rej) => setTimeout(() => rej(new Error('swUnavailable')), 8000)),
  ]);

export const defaultPushLabel = () => {
  try {
    return deviceLabel(navigator.userAgent) || t('settings.notif.pushUnnamed');
  } catch {
    return t('settings.notif.pushUnnamed');
  }
};

/* Fail-absent (MCP-01 pattern): an unconfigured server answers 404 — the
   caller receives null and the UI hides the master toggle entirely. */
export async function fetchPushConfig() {
  const r = await call('GET', '/api/me/push-config');
  return r.ok ? r.data : null;
}

export async function fetchPushDevices() {
  const r = await call('GET', `/api/me/push-subscriptions?workspace=${encodeURIComponent(pushWorkspace())}`);
  return r.ok ? r.data?.subscriptions || [] : null;
}

/* One read of everything the Push tab renders (the refreshSessions pattern):
   server config, this member's device rows, and this browser's local
   subscription endpoint — the master toggle's ON/OFF state. */
export async function readPushState() {
  const config = await fetchPushConfig();
  const devices = await fetchPushDevices();
  let localEndpoint = null;
  try {
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription();
    localEndpoint = sub?.endpoint || null;
  } catch {
    /* no SW registration yet: nothing local to report */
  }
  return { config, devices: devices || [], localEndpoint };
}

let _enabling = false;

/* The master enable path (D-01/D-02): the caller is the user gesture. The
   permission request fires HERE and nowhere else. Double-clicks are guarded
   by the in-flight flag; a re-subscribe to the same endpoint replaces the
   row server-side (59-01 insert-or-replace), so enable stays idempotent. */
export async function enablePush(label) {
  if (_enabling) return { ok: false, code: 'busy' };
  _enabling = true;
  try {
    const cfg = await fetchPushConfig();
    if (!cfg) return { ok: false, code: 'unavailable' };
    if (typeof window.Notification !== 'undefined' && window.Notification.permission === 'default') {
      const p = await window.Notification.requestPermission();
      if (p !== 'granted') return { ok: false, code: p === 'denied' ? 'denied' : 'dismissed' };
    }
    const reg = await swReady();
    const raw = Uint8Array.from(atob(String(cfg.vapidPublicKey).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: raw });
    /* CANONICAL body: subscription.toJSON() verbatim + the client-chosen
       label (D-04) — exactly the shape the 59-01 route whitelist validates;
       no reshaping that could drop a field the server expects. */
    const body = { ...sub.toJSON(), label: label || defaultPushLabel(), workspace: pushWorkspace() };
    const r = await call('POST', '/api/me/push-subscriptions', body);
    if (!r.ok) return { ok: false, code: 'subscribe' };
    return { ok: true, endpoint: sub.endpoint };
  } catch {
    /* subscribe can reject (no SW, bad key, browser refusal): honest refusal */
    return { ok: false, code: 'error' };
  } finally {
    _enabling = false;
  }
}

/* Master OFF (D-07 discretion): unsubscribe this browser AND delete its row —
   enable/disable symmetry; the row would otherwise linger until the sweep. */
export async function disablePush() {
  let endpoint = null;
  try {
    const reg = await swReady();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      endpoint = sub.endpoint;
      await sub.unsubscribe();
    }
  } catch {
    /* no SW/subscription: still delete the server row below */
  }
  const body = { workspace: pushWorkspace() };
  if (endpoint) body.endpoint = endpoint;
  await call('DELETE', '/api/me/push-subscriptions', body);
  return { ok: true, endpoint };
}

/* Per-row unsubscribe from the device list (D-07 discretion): row delete
   only — this browser's SW subscription is untouched. Caller-owned row
   server-side (the DELETE route constrains to the session user). */
export async function unsubscribeDevice(endpoint) {
  return call('DELETE', '/api/me/push-subscriptions', { endpoint, workspace: pushWorkspace() });
}

/* Per-device test push (D-05/D-06): the real payload/display path server-side,
   tagged as a test — the owner's acceptance instrument for PUSH-01. */
export async function sendTestPush(endpoint) {
  return call('POST', '/api/me/push-subscriptions/test', { endpoint, workspace: pushWorkspace() });
}
