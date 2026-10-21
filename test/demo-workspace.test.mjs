/* Regression test for the demo's honest single-workspace behaviour.
   The browser modules read `document`, `navigator` and `localStorage` while they
   load, so those globals are stubbed before the store is imported dynamically.
   If the seed ever regrows `data.workspaces`, or the demo list returns more than
   one entry, this file fails. */
import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.document = { querySelectorAll: () => [] };
Object.defineProperty(globalThis, 'navigator', {
  value: { platform: 'Linux', userAgent: 'node' },
  configurable: true,
  writable: true,
});
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };

const { seed } = await import('../src/data/seed.js');
const { D, currentSlug, workspaceList } = await import('../src/core/store.js');

test('the demo seed carries no workspace array', () => {
  const doc = seed();
  assert.equal(Object.hasOwn(doc, 'workspaces'), false, 'seed() must not return data.workspaces');
  assert.equal(doc.workspaces, undefined);
  assert.equal(typeof doc.ws?.name, 'string', 'the single workspace still names itself in ws');
});

test('demo mode exposes exactly one workspace derived from ws', () => {
  const list = workspaceList();
  assert.equal(list.length, 1, 'the demo must never offer a second workspace');
  const [ws] = list;
  assert.equal(ws.id, 'demo');
  assert.equal(ws.name, D().ws.name);
  assert.equal(ws.slug, currentSlug());
  assert.equal(ws.role, 'owner');
});
