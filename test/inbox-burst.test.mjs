/* Inbox burst coalescing (Phase 61, NOTIF-03 / D-10..D-13).
   Pins the pure render-only grouping transform in src/pages/inbox.js: unread
   rows sharing task + type coalesce into one burst descriptor (D-11 trigger,
   generic over all types), read rows stay standalone and are never absorbed,
   groups never cross task or type, a lone unread row stays a plain notification,
   and the openSet argument flattens an expanded group's members into the output.
   The module's import graph touches localStorage/document at load, so stubs are
   installed first — the established client-module pattern (test/local-prefs.test.mjs). */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { register } from 'node:module';

/* Client modules transitively import `virtual:icons` — a Vite-only virtual
   module the default ESM loader cannot resolve; the established suite hook
   stubs it before the module under test loads (test/browser-push.test.mjs). */
register(new URL('./helpers/virtual-icons-loader.mjs', import.meta.url));

const backing = new Map();
globalThis.localStorage = {
  getItem: k => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: k => backing.delete(k),
  clear: () => backing.clear(),
};
/* store.js's import graph touches document at module load (utils.js font swap). */
globalThis.document = { querySelectorAll: () => [], addEventListener: () => {} };
globalThis.addEventListener = () => {};

const { groupBursts, burstUnreadIds } = await import('../src/pages/inbox.js');

/* Rows arrive time-sorted newest-first (pageInbox sorts b.at - a.at). */
const n = (id, task, type, at, read = false) => ({ id, task, type, at, read });

test('(a) same task + same type unread rows coalesce into ONE burst descriptor', () => {
  const ns = [n('n3', 't1', 'comment', 300), n('n2', 't1', 'comment', 200), n('n1', 't1', 'comment', 100)];
  const out = groupBursts(ns);
  assert.equal(out.length, 1);
  const g = out[0];
  assert.equal(g.burst, true);
  assert.equal(g.gk, 't1|comment');
  assert.equal(g.members.length, 3);
  /* newest-member position + newest first: the summary sits where the newest member was */
  assert.deepEqual(g.members.map(m => m.id), ['n3', 'n2', 'n1']);
  assert.equal(g.open, false);
});

test('(b) read rows stand alone and unread groups never absorb read siblings', () => {
  const ns = [
    n('n1', 't1', 'comment', 300, true),
    n('n2', 't1', 'comment', 200),
    n('n3', 't1', 'comment', 100),
    n('n4', 't1', 'comment', 50, true),
  ];
  const out = groupBursts(ns);
  /* read n1 standalone, unread pair grouped, read n4 standalone */
  assert.equal(out.length, 3);
  assert.equal(out[0].burst, undefined);
  assert.equal(out[0].id, 'n1');
  assert.equal(out[1].burst, true);
  assert.deepEqual(out[1].members.map(m => m.id), ['n2', 'n3']);
  assert.equal(out[2].id, 'n4');
});

test('(c) groups never cross task or type', () => {
  const ns = [
    n('n1', 't1', 'comment', 400),
    n('n2', 't2', 'comment', 300),
    n('n3', 't1', 'update', 200),
    n('n4', 't1', 'comment', 100),
  ];
  const out = groupBursts(ns);
  /* n1+n4 group (same task+type); n2 and n3 stay plain */
  assert.equal(out.length, 3);
  assert.equal(out[0].burst, true);
  assert.deepEqual(out[0].members.map(m => m.id), ['n1', 'n4']);
  assert.equal(out[1].id, 'n2');
  assert.equal(out[2].id, 'n3');
});

test('(d) a lone unread row stays a plain notification', () => {
  const ns = [n('n1', 't1', 'comment', 300), n('n2', 't1', 'assign', 200)];
  const out = groupBursts(ns);
  assert.deepEqual(out, ns);
});

test('(e) openSet with the group key flattens members into the output; closed keeps summary only', () => {
  const ns = [n('n2', 't1', 'comment', 200), n('n1', 't1', 'comment', 100)];
  const closed = groupBursts(ns, new Set());
  assert.equal(closed.length, 1);
  assert.equal(closed[0].burst, true);
  const open = groupBursts(ns, new Set(['t1|comment']));
  /* summary descriptor followed by the member rows, in order */
  assert.equal(open.length, 3);
  assert.equal(open[0].burst, true);
  assert.equal(open[0].open, true);
  assert.deepEqual(open.slice(1).map(x => x.id), ['n2', 'n1']);
});

test('(f) burstUnreadIds fans to every unread member id of the group key (group mark-read)', () => {
  const ns = [
    n('n0', 't1', 'comment', 400, true), // read sibling — excluded
    n('n2', 't1', 'comment', 200),
    n('x9', 't2', 'comment', 150), // other task — excluded
    n('n1', 't1', 'comment', 100),
  ];
  assert.deepEqual(burstUnreadIds(ns, 't1|comment'), ['n2', 'n1']);
  assert.deepEqual(burstUnreadIds(ns, 't1|update'), []);
});
