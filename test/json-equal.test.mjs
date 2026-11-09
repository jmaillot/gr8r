/* [2026-11-09 IN-03 pin] stableJson/jsonEqual: key-order-insensitive deep
   JSON equality. The three call sites (applyPatch skip-unchanged,
   submitMemberTeams teamsChanged, go() same-route) rely on: identical
   objects with different key insertion order compare EQUAL; array order
   still matters; scalars and nested mixes behave like JSON.stringify.

   utils.js runs its font/link setup at import time — the document stub
   goes up before the dynamic import (activity-verbs.test.mjs discipline). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.document = {
  querySelectorAll: () => [],
  documentElement: { lang: 'en' },
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild: () => {}, classList: { add: () => {}, remove: () => {} } },
  createElement: () => ({ style: {}, classList: { add: () => {}, remove: () => {} }, appendChild: () => {} }),
};
globalThis.window = { addEventListener: () => {}, removeEventListener: () => {}, matchMedia: () => ({ addEventListener: () => {} }) };

const { jsonEqual, stableJson } = await import('../src/core/utils.js');
void stableJson;

test('jsonEqual: same object, different key insertion order → equal (IN-03)', () => {
  assert.ok(jsonEqual({ a: 1, b: 2 }, { b: 2, a: 1 }));
  assert.ok(jsonEqual({ a: { x: 1, y: 2 }, b: [1, 2] }, { b: [1, 2], a: { y: 2, x: 1 } }), 'recursion sorts at every depth');
});

test('jsonEqual: array order and real differences still read as changed', () => {
  assert.ok(!jsonEqual([1, 2], [2, 1]), 'array order is data');
  assert.ok(!jsonEqual({ a: 1 }, { a: 2 }));
  assert.ok(!jsonEqual({ a: 1 }, { a: 1, b: undefined }), 'a key with undefined value is NOT collapsible — stringify parity');
  assert.ok(!jsonEqual('x', 'y'));
  assert.ok(jsonEqual('x', 'x'));
  assert.ok(jsonEqual(null, null));
  assert.ok(!jsonEqual(null, {}));
});
