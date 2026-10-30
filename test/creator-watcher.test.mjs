/* =====================================================================
   LINK-03 / D-05: the task creator joins the watcher set at creation.

   The watcher set stays COMPUTED (P4-d/e model): assignee + creator +
   commenters, deduped through the Set, tolerant of legacy tasks without
   a creator field (filter(Boolean), no backfill per 23-CONTEXT.md), and
   self-excluded client-side (x !== D().me) so the acting user — including
   the creator acting on their own task — never lands in the fan-out list.
   The server-side `if (n.by === n.to) continue` in server.js is the second
   exclusion layer and is covered by the notification suites.

   The browser modules read `document`, `navigator` and `localStorage`
   while they load, so those globals are stubbed before the store and the
   actions are imported dynamically — the same doc-level pattern as
   test/activity-verbs.test.mjs and test/demo-workspace.test.mjs.
   ===================================================================== */
import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.document = {
  querySelectorAll: () => [],
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
};
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ addEventListener: () => {} }), dispatchEvent: () => {} };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.matchMedia = () => ({ addEventListener: () => {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});

const { register } = await import('node:module');
register(new URL('./virtual-icons-loader.mjs', import.meta.url), import.meta.url);

const { applyDoc, D, commentsOf } = await import('../src/core/store.js');
const { createTask, taskWatchers } = await import('../src/actions/actions.js');

const MEMBERS = [
  { id: 'u1', name: 'Ada', status: 'active' },
  { id: 'u2', name: 'Bob', status: 'active' },
  { id: 'u3', name: 'Cara', status: 'active' },
];

function freshDoc(me) {
  applyDoc(
    {
      data: {
        me,
        members: MEMBERS.map(m => ({ ...m })),
        projOrder: ['p1'],
        projects: [{ id: 'p1', key: 'WEB', seq: 200, name: 'Web' }],
        tasks: [],
        comments: [],
        notifs: [],
        activity: [],
      },
    },
    1,
  );
}

test('createTask records the creating user as the task creator', () => {
  freshDoc('u1');
  const tk = createTask({ title: 'Created by Ada', project: 'p1' });
  assert.equal(tk.creator, 'u1');
});

test('taskWatchers includes the creator when they are neither assignee nor commenter', () => {
  freshDoc('u1');
  const tk = createTask({ title: 'Ada made it', project: 'p1' });
  /* Bob's context: Ada (the creator) is a watcher Bob would notify. */
  D().me = 'u2';
  const watchers = taskWatchers(tk);
  assert.ok(watchers.includes('u1'), `creator u1 must be a watcher, got ${JSON.stringify(watchers)}`);
  assert.deepEqual([...watchers].sort(), ['u1']);
});

test('taskWatchers returns ONE entry when the creator is also the assignee', () => {
  freshDoc('u1');
  const tk = createTask({ title: 'Ada made it for herself', project: 'p1', assignee: 'u1' });
  D().me = 'u2';
  const watchers = taskWatchers(tk);
  assert.equal(watchers.filter(x => x === 'u1').length, 1, 'Set dedup: creator===assignee must not duplicate');
  assert.deepEqual(watchers, ['u1']);
});

test('a legacy task without a creator field yields watchers without throwing', () => {
  freshDoc('u1');
  const legacy = { id: 't-legacy', assignee: 'u2' };
  const watchers = taskWatchers(legacy);
  assert.deepEqual(watchers, ['u2']);
  assert.ok(!watchers.includes(undefined), 'filter(Boolean) must drop the absent creator');
});

test('the acting user never appears in their own taskWatchers output', () => {
  freshDoc('u1');
  const tk = createTask({ title: 'Ada watching herself', project: 'p1', assignee: 'u2' });
  D().comments.push({ id: 'c1', task: tk.id, by: 'u1', body: 'my own comment' });
  assert.ok(commentsOf(tk.id).length === 1);
  const watchers = taskWatchers(tk);
  assert.ok(!watchers.includes('u1'), `D-05: the actor u1 must be excluded, got ${JSON.stringify(watchers)}`);
  assert.deepEqual(watchers, ['u2']);
});
