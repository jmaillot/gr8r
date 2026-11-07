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

   NOT under test: the settings permission UX (plan 48-02), the real
   browser notification UI, the 30s poll scheduling (main.js guards).

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
globalThis.localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
};

globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: () => {},
  body: {},
  title: '',
  hidden: true, /* the tracer's scenario: the tab is hidden */
};
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};
globalThis.window = globalThis;

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
const { S, D } = store;

/* Seed the workspace doc: one unread mention row for the current member. */
const d = D();
d.ws = { url: 'acme' };
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
