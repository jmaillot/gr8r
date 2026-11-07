/* =====================================================================
   test: browser-push — the real-browser push + toast slice (Phase 48).

   Under test:
     - public/sw.js is the MINIMAL click router: notificationclick, a
       same-origin URL resolution, and NO network-interception / lifecycle
       handler and NO module reference anywhere in the file (T-48-02/T-48-03).
     - notifyNewEvents() delivers exactly ONE feedback per new unread
       mention/assign/comment row behind its push_* pref (D-48-2): a toast
       when the tab is visible, a showNotification when hidden — never both.
     - the first call of a session PRIMES the seen-set silently (no
       notification storm on login), the seen-set dedupes every later call,
       and read / pref-off / non-mapped rows never dispatch.

   NOT under test: the real browser notification UI, the 30s poll scheduling
   (main.js guards). The settings permission UX IS under test here (48-02):
   the npToggle requestPermission pre-step and the one-time blocked toast.

   The browser modules read document/navigator/localStorage/window while
   they load, so every global is stubbed BEFORE the dynamic imports —
   the stub order is load-bearing (the i18n-search precedent).
   ===================================================================== */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* localStorage backed by a Map, so seen-set persistence is observable. */
const ls = new Map();
/* Minimal DOM element stand-in: render()/toast() run inside IN.npToggle, and
   they only ever write into containers — behaviour is asserted via storage and
   the seams, never via the rendered DOM. */
const fakeEl = () => ({
  innerHTML: '',
  style: {},
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  appendChild() {}, removeChild() {}, remove() {}, setAttribute() {}, removeAttribute() {},
  focus() {}, addEventListener() {},
  scrollTop: 0, scrollLeft: 0,
  querySelector: () => fakeEl(),
  querySelectorAll: () => [],
});
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => fakeEl(),
  getElementById: () => fakeEl(),
  addEventListener: () => {},
  body: fakeEl(),
  title: '',
  hidden: true, /* the tracer's scenario: the tab is hidden */
  documentElement: fakeEl(),
  activeElement: null,
  createElement: fakeEl,
};
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.CSS = globalThis.CSS || { escape: s => s };
globalThis.requestAnimationFrame = () => {};
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.CustomEvent = class CustomEvent {
  constructor(type, opts) { this.type = type; this.detail = opts?.detail; }
};

/* The showNotification recorder: every call lands here, at module scope. */
const showCalls = [];
const regStub = {
  showNotification: async (title, options) => {
    showCalls.push({ title, options });
  },
};
globalThis.navigator.serviceWorker = {
  register: async () => regStub,
  getRegistration: async () => regStub,
};

/* Static-property class so tests mutate Notification.permission per case. */
globalThis.Notification = class Notification {
  static permission = 'granted';
  static requestPermission = async () => 'granted';
};

const ROOT = path.join(import.meta.dirname, '..');
const source = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* Dynamic imports AFTER the stubs. */
const store = await import('../src/core/store.js');
const push = await import('../src/core/push.js');
const actions = await import('../src/actions/actions.js');
const { S, D } = store;

/* Seed the workspace doc: one unread mention row for the current member. */
const d = D();
d.ws = { url: 'acme', name: 'Acme', c: '#5A67D8' };
d.me = 'm-me';
d.members.push({ id: 'm-me', name: 'Me', role: 'Owner' }, { id: 'm-elo', name: 'Élodie', role: 'Member' });
d.projects.push({ id: 'p-1', key: 'ELN', name: 'Élan', members: ['m-me'] });
d.tasks.push({ id: 't-1', key: 'ELN-1', project: 'p-1', title: 'Website launch', status: 'todo' });
d.notifs.push({ id: 'n-1', to: 'm-me', type: 'mention', by: 'm-elo', task: 't-1', read: false });
S.notifPrefs = { push_mention: true, push_assign: true, push_comment: true };

/* ---------- public/sw.js: the minimal worker (T-48-02 / T-48-03) ---------- */

test('public/sw.js is the minimal click router: notificationclick, same-origin URL, no network/lifecycle handler, no module reference', () => {
  const sw = source('public/sw.js');
  assert.ok(sw.includes("addEventListener('notificationclick'"), 'sw.js must own the notificationclick handler');
  assert.ok(
    sw.includes("new URL(e.notification.data?.url || '/', self.location.origin)"),
    'the click URL must resolve against self.location.origin (T-48-03)',
  );
  assert.ok(!/\b(fetch|install|activate|import)\b/.test(sw), 'sw.js must carry no fetch/install/activate/import token (T-48-02)');
  assert.ok(sw.includes('openWindow'), 'the no-window fallback must open a new window');
});

test('public/sw.js resolves data.url through the URL constructor, never openWindow(rawString)', () => {
  const sw = source('public/sw.js');
  assert.ok(sw.includes('new URL('), 'the raw string must go through new URL(…, origin)');
  assert.ok(sw.includes('openWindow(url)'), 'openWindow only ever receives the resolved href');
});

/* ---------- the tracer: hidden-tab mention → SW notification ---------- */

test('the first notifyNewEvents call of a session primes the seen-set and notifies nothing', async () => {
  await push.notifyNewEvents();
  assert.equal(showCalls.length, 0, 'the prime must be silent (Pitfall 3)');
  const seen = JSON.parse(localStorage.getItem('projects.pushSeen.acme.local'));
  assert.deepEqual(seen, ['n-1'], 'the prime must seed every current unread id');
});

test('a hidden-tab mention yields exactly ONE showNotification with the localized body, tag, icon and a same-origin deep-link data.url', async () => {
  d.notifs.push({ id: 'n-2', to: 'm-me', type: 'mention', by: 'm-elo', task: 't-1', read: false });
  await push.notifyNewEvents();
  assert.equal(showCalls.length, 1, 'exactly one notification (D-48-2)');
  const call = showCalls[0];
  assert.ok(call.title.includes('Élodie'), 'the body names the actor');
  assert.ok(call.title.includes('Website launch'), 'the body names the task');
  assert.ok(call.title.includes('mentioned you'), 'the EN catalogue line resolves');
  assert.equal(call.options.tag, 'gr8r-n-2');
  assert.equal(call.options.icon, '/favicon.svg');
  assert.equal(call.options.data.url, '/w/acme/task/ELN-1');
  assert.ok(call.options.data.url.startsWith('/'), 'the deep link is same-origin relative (T-48-03)');
  /* mark-seen-BEFORE-dispatch: the id is already persisted when the call returns */
  const seen = JSON.parse(localStorage.getItem('projects.pushSeen.acme.local'));
  assert.deepEqual(seen, ['n-1', 'n-2']);
});

test('a second notifyNewEvents call re-notifies nothing — the seen-set dedupes (D-48-2)', async () => {
  await push.notifyNewEvents();
  await push.notifyNewEvents();
  assert.equal(showCalls.length, 1, 'no duplicate notification for an already-seen row');
});

/* ---------- expansion: foreground toast, gating, read/unsupported rows ---------- */

test('a visible-tab mention fires the toast seam once and never showNotification — never both channels (D-48-2)', async () => {
  const toasts = [];
  push.setToastSink(msg => toasts.push(msg));
  document.hidden = false;
  d.notifs.push({ id: 'n-3', to: 'm-me', type: 'mention', by: 'm-elo', task: 't-1', read: false });
  await push.notifyNewEvents();
  assert.equal(toasts.length, 1, 'the foreground branch toasts once');
  assert.equal(toasts[0].includes('<'), false, 'the toast line is plain composed text (T-48-01)');
  assert.equal(showCalls.length, 1, 'no notification while the tab is visible');
  push.setToastSink(null);
  document.hidden = true;
});

test('a push_assign=false gate swallows a new assign row: no toast, no notification', async () => {
  const toasts = [];
  push.setToastSink(msg => toasts.push(msg));
  S.notifPrefs.push_assign = false;
  d.notifs.push({ id: 'n-4', to: 'm-me', type: 'assign', by: 'm-elo', task: 't-1', read: false });
  await push.notifyNewEvents();
  assert.equal(toasts.length, 0);
  assert.equal(showCalls.length, 1);
  S.notifPrefs.push_assign = true;
  push.setToastSink(null);
  /* simulate the member reading the row in the inbox, so the re-enabled pref
     cannot resurrect it in later cases */
  d.notifs.find(n => n.id === 'n-4').read = true;
});

test('update and due_reminder rows never dispatch, whatever the prefs say (G-37-2)', async () => {
  const toasts = [];
  push.setToastSink(msg => toasts.push(msg));
  document.hidden = true;
  d.notifs.push(
    { id: 'n-5', to: 'm-me', type: 'update', by: 'm-elo', task: 't-1', read: false },
    { id: 'n-6', to: 'm-me', type: 'due_reminder', by: null, task: 't-1', read: false },
  );
  await push.notifyNewEvents();
  assert.equal(toasts.length, 0);
  assert.equal(showCalls.length, 1);
  push.setToastSink(null);
});

test('a read row never dispatches', async () => {
  const toasts = [];
  push.setToastSink(msg => toasts.push(msg));
  d.notifs.push({ id: 'n-7', to: 'm-me', type: 'mention', by: 'm-elo', task: 't-1', read: true });
  await push.notifyNewEvents();
  assert.equal(toasts.length, 0);
  assert.equal(showCalls.length, 1);
  push.setToastSink(null);
});

/* ---------- the deriveCandidates seam: per-type gating, unit-level ---------- */

test('deriveCandidates maps mention/assign/comment to their push_* prefs and excludes update/reminder rows and seen/read rows', () => {
  const rows = [
    { id: 'a', type: 'mention', read: false },
    { id: 'b', type: 'assign', read: false },
    { id: 'c', type: 'comment', read: false },
    { id: 'd', type: 'update', read: false },
    { id: 'e', type: 'due_reminder', read: false },
    { id: 'f', type: 'past_due', read: false },
    { id: 'g', type: 'mention', read: true },
    { id: 'a', type: 'mention', read: false }, // seen duplicate
  ];
  const prefs = { push_mention: true, push_assign: false, push_comment: true };
  assert.deepEqual(push.deriveCandidates(rows, prefs, ['a']).map(n => n.id), ['c']);
  assert.deepEqual(push.deriveCandidates(rows, { push_mention: true, push_assign: true, push_comment: true }, ['a']).map(n => n.id), [
    'b',
    'c',
  ], 'a seen id never re-derives, even duplicated in the list');
  assert.deepEqual(push.deriveCandidates(rows, {}, []), [], 'all prefs off gates everything');
  assert.deepEqual(push.deriveCandidates(null, prefs, []), [], 'a missing notif list yields no candidates');
});

test("a missing Notification API degrades to a silent no-op — no throw", async () => {
  const Cls = globalThis.Notification;
  delete globalThis.Notification;
  try {
    d.notifs.push({ id: 'n-8', to: 'm-me', type: 'comment', by: 'm-elo', task: 't-1', read: false });
    await push.notifyNewEvents();
    assert.equal(showCalls.length, 1, 'no notification without the API');
  } finally {
    globalThis.Notification = Cls;
  }
});

/* ---------- expansion (48-02): the requestPermission pre-step in npToggle (D-48-3/D-48-4) ----------
   The pre-step is PREPENDED to IN.npToggle — the persistence body below it stays
   byte-identical (one-branch persistence invariant, D-07 style). Local mode is
   exercised: api.enabled is false in this harness, so setLocalNotifPrefs is the
   persistence observable (the localStorage projects.notifPrefs.<ws> key). */

/* reset the module-level session state each expansion run relies on */
const notifPrefsStored = () => JSON.parse(localStorage.getItem('projects.notifPrefs.acme'));
const toggle = (k, checked = true) => actions.IN.npToggle({ checked, dataset: { k } });

test('permission default + toggle-ON of a push_* key: requestPermission fires exactly once and the pref still persists (D-48-3)', async () => {
  Notification.permission = 'default';
  let rpCalls = 0;
  Notification.requestPermission = async () => {
    rpCalls++;
    return 'granted';
  };
  await toggle('push_mention');
  assert.equal(rpCalls, 1, 'requestPermission runs inside the click (user-gesture context)');
  assert.equal(notifPrefsStored().push_mention, true, 'the persistence body still runs after the pre-step');
});

test('permission denied after the request: the blocked toast fires exactly ONCE across two toggles and the pref still persists (D-48-4)', async () => {
  const toasts = [];
  push.setToastSink(msg => toasts.push(msg));
  Notification.permission = 'default';
  Notification.requestPermission = async () => 'denied';
  await toggle('push_assign');
  await toggle('push_comment');
  assert.equal(toasts.length, 1, 'the explanatory toast is one-time per session');
  assert.ok(toasts[0].length > 0, 'the toast carries the catalogue line');
  assert.equal(notifPrefsStored().push_assign, true, 'the pref saves despite denial (fall-through)');
  assert.equal(notifPrefsStored().push_comment, true);
  push.setToastSink(null);
});

test('permission granted: no requestPermission call and no blocked toast', async () => {
  const toasts = [];
  push.setToastSink(msg => toasts.push(msg));
  Notification.permission = 'granted';
  let rpCalls = 0;
  Notification.requestPermission = async () => {
    rpCalls++;
    return 'granted';
  };
  await toggle('push_mention', false);
  await toggle('push_mention');
  assert.equal(rpCalls, 0, "only 'default' requests");
  assert.equal(toasts.length, 0);
  push.setToastSink(null);
});

test('toggling a non-push key never touches the permission API', async () => {
  Notification.permission = 'default';
  let rpCalls = 0;
  Notification.requestPermission = async () => {
    rpCalls++;
    return 'granted';
  };
  await toggle('email_mention');
  assert.equal(rpCalls, 0);
  assert.equal(notifPrefsStored().email_mention, true, 'non-push keys persist exactly as before');
});

/* ---------- expansion (48-02): the poll permission memo (D-48-4) ----------
   The badge derives from Notification.permission per render; main.js's 30s poll
   compares the read every tick (the _pollUnread memo pattern) so a denied →
   granted flip in browser settings clears the badge without a reload. */

test('permChanged fires exactly once on a denied → granted flip and never on a stable tick (D-48-4)', () => {
  let memo = 'denied';
  let renders = 0;
  const tick = perm => {
    if (push.permChanged(perm, memo)) {
      memo = perm;
      renders++;
    }
  };
  tick('denied'); /* stable: badge stays, no re-render */
  tick('denied');
  tick('granted'); /* the flip: exactly one re-render */
  tick('granted'); /* stable again */
  assert.equal(renders, 1, 'one re-render on the flip, none on stable ticks');
  assert.equal(push.permChanged('granted', 'granted'), false);
  assert.equal(push.permChanged('default', ''), true, 'the first tick after boot seeds the memo as a change');
});

test('main.js wires the permission memo into the poll render condition (source contract)', () => {
  const src = source('src/main.js');
  assert.ok(src.includes('let _pollPerm'), 'the _pollPerm memo exists beside _pollUnread');
  assert.ok(src.includes('pollPerm()'), 'each poll tick reads the live permission');
  assert.ok(
    src.includes('unread !== _pollUnread || permChanged(perm, _pollPerm)'),
    'the render condition is the combined unread-or-permission diff',
  );
  assert.ok(src.includes("_pollPerm = perm;"), 'the memo updates when the condition fires');
});
