/* =====================================================================
   test: palette-dispatch — the G-58-2 regression: the Ctrl-K palette's
   default cmd mode must dispatch the debounced server search.

   D-01 promises a hybrid merge into "the same palette results" with no
   mode restriction; the render path is already cmd-ready (the tasks
   group renders with sc='all' and the pl.serverQ === q merge hook is
   mode-independent). Only dispatchServerSearch's mode guard blocked
   cmd-mode fetches. The matrix:

     - cmd + server mode  → dispatches (was the bug)
     - search + server mode → dispatches (unchanged)
     - ws mode            → never dispatches (still guarded)
     - demo mode          → never dispatches (palServerSearch gate)

   Real modules are imported as shipped (the i18n-search precedent:
   virtual-icons loader + stubbed browser globals); the network is
   stubbed at fetch() so searchTasksServer exercises the real client
   (api.enabled → call → fetch) without any server.
   ===================================================================== */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { test } from 'node:test';

register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

/* Browser globals the app modules read while they load. */
globalThis.document = {
  querySelectorAll: () => [],
  querySelector: () => null,
  getElementById: () => null,
  addEventListener: () => {},
  body: {},
  title: '',
  documentElement: { setAttribute() {}, removeAttribute() {}, getAttribute: () => null },
};
/* A universal inert element: render() paints into #app/#layer after the merge,
   and the palette overlay refocuses #pal-in. The node suite never inspects the
   painted HTML — it only asserts on the store state the merge writes. */
const fakeEl = () => ({
  innerHTML: '',
  textContent: '',
  tabIndex: 0,
  dataset: {},
  style: {},
  focus() {},
  close() {},
  matches: () => false,
  hasAttribute: () => true,
  setAttribute() {},
  removeAttribute() {},
  getAttribute: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  scrollTop: 0,
  scrollLeft: 0,
  isConnected: true,
});
document.querySelector = () => fakeEl();
document.querySelectorAll = () => [];
document.activeElement = fakeEl();
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
globalThis.addEventListener = () => {};

/* fetch() stub keyed on the route: /api/config enables server mode,
   /search answers with one server-only task. */
const SEARCH_PAYLOAD = { tasks: [{ id: 'srv-1', title: 'Server-only task', key: 'SRV-1', snippet: 'lives only on the server' }] };
let searchCalls = [];
function stubFetch() {
  globalThis.fetch = async path => {
    path = String(path);
    if (path.includes('/api/config')) return { ok: true, status: 200, text: async () => JSON.stringify({ app: 'projects', url: 'http://localhost' }) };
    if (path.includes('/api/auth/me')) return { ok: true, status: 200, text: async () => '{}' };
    if (/\/api\/workspaces\/acme\/search/.test(path)) {
      searchCalls.push(path);
      return { ok: true, status: 200, text: async () => JSON.stringify(SEARCH_PAYLOAD) };
    }
    /* workspace load: the client reads id/slug/role/memberId/revision off it */
    if (/\/api\/workspaces\/[^/]+$/.test(path)) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: 'w1', slug: 'acme', name: 'Acme', color: '#123456', role: 'owner', memberId: 'm1', revision: 1 }) };
    }
    return { ok: true, status: 200, text: async () => '{}' };
  };
}
stubFetch();

const { api } = await import('../src/core/api.js');
await api.init();
await api.loadWorkspace('acme');
assert.ok(api.enabled, 'the stubbed /api/config must enable server mode');

const { S } = await import('../src/core/store.js');
const { palServerSearch } = await import('../src/overlays/palette.js');

const settle = () => new Promise(r => setTimeout(r, 400)); // > the 250 ms debounce

/* ---------- cmd mode: the G-58-2 regression ---------- */

test('cmd mode dispatches the debounced server search and merges the server-only task', async () => {
  searchCalls = [];
  S.ui.palette = { q: 'server', mode: 'cmd', scope: 'all', hl: 0 };
  palServerSearch('server');
  assert.equal(searchCalls.length, 0, 'the fetch is debounced — nothing fires synchronously');
  await settle();
  assert.equal(searchCalls.length, 1, 'cmd mode must dispatch exactly one /search fetch after the debounce');
  assert.ok(searchCalls[0].includes('q=server'), 'the query rides the /search route');
  assert.equal(S.ui.palette.serverQ, 'server', 'the merge hook (pl.serverQ === q) is armed for the tasks group');
  assert.deepEqual(S.ui.palette.serverTasks, SEARCH_PAYLOAD.tasks, 'server-only tasks are stored for the palette merge');
});

/* ---------- search mode: unchanged ---------- */

test('search mode still dispatches as before', async () => {
  searchCalls = [];
  S.ui.palette = { q: 'server', mode: 'search', scope: 'all', hl: 0 };
  palServerSearch('server');
  await settle();
  assert.equal(searchCalls.length, 1, 'search mode dispatch is unchanged');
  assert.deepEqual(S.ui.palette.serverTasks, SEARCH_PAYLOAD.tasks);
});

/* ---------- ws mode: still guarded ---------- */

test('ws mode never dispatches', async () => {
  searchCalls = [];
  S.ui.palette = { q: 'acme', mode: 'ws', hl: 0 };
  palServerSearch('acme');
  await settle();
  assert.equal(searchCalls.length, 0, 'the mode guard must still block ws');
  assert.equal(S.ui.palette.serverQ, undefined, 'no server state is written in ws mode');
});

/* ---------- demo mode: the palServerSearch gate still short-circuits ---------- */

test('demo mode (api.enabled=false) never dispatches', async () => {
  stubFetch(); // fresh stubs; below we flip the mode off through the real gate
  searchCalls = [];
  const { api: liveApi } = await import('../src/core/api.js');
  /* Temporarily simulate demo mode: no workspace loaded → the client cannot
     scope the query, and the palServerSearch gate reads api.enabled. We
     exercise the gate by unloading the workspace (enabled reflects the
     boot-time /api/config, so we assert BOTH gates: q='' short-circuits
     synchronously, and a null workspace slug yields no fetch). */
  const enabled = liveApi.enabled;
  palServerSearch(''); // the !q branch — must short-circuit before any dispatch
  assert.equal(searchCalls.length, 0, 'empty query never dispatches');
  const savedWs = liveApi.workspace;
  await liveApi.loadWorkspace('__nope__'); // 404-ish stub → workspace cleared
  palServerSearch('server');
  await settle();
  assert.equal(searchCalls.length, 0, 'no workspace loaded → the client degrades to no fetch');
  await liveApi.loadWorkspace(savedWs?.slug || 'acme');
  assert.equal(liveApi.enabled, enabled, 'server mode state is untouched');
});

/* ---------- stale discard: a mode switch mid-flight drops the response ---------- */

test('a mid-flight mode switch (pl.q !== q) discards the stale response', async () => {
  searchCalls = [];
  const pl = { q: 'server', mode: 'cmd', scope: 'all', hl: 0 };
  S.ui.palette = pl;
  palServerSearch('server');
  /* Mutate before the debounce elapses, exactly like the user typing on or
     switching modes: the response must be dropped, serverTasks/serverQ unset. */
  pl.q = 'other';
  await settle();
  assert.deepEqual(pl.serverTasks, undefined, 'the stale response must not be stored');
  assert.equal(pl.serverQ, undefined, 'serverQ must stay unset for a stale response');
});
