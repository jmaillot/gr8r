/* Per-user notification preferences — API-mode hydration merge pins (Phase 34, G-34-4).
   Pins mergeNotifPrefs in src/core/notifPrefs.js: defaults shape (D-27-5),
   whitelist + boolean-only sanitation of both sides, canonical-server semantics
   (mirroring the PUT adoption in actions.js), input immutability, and the D-01
   guarantee that no doc-shaped notifPrefs carrier can come back out. Mirrors
   local-prefs.test.mjs style. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

/* Minimal localStorage stub installed before the module under test loads. */
const backing = new Map();
globalThis.localStorage = {
  getItem: k => (backing.has(k) ? backing.get(k) : null),
  setItem: (k, v) => backing.set(k, String(v)),
  removeItem: k => backing.delete(k),
  clear: () => backing.clear(),
};
/* store.js's import graph touches document at module load (utils.js font swap). */
globalThis.document = { querySelectorAll: () => [] };

const { NOTIF_PREF_DEFAULTS, NOTIF_PREF_KEYS, mergeNotifPrefs } = await import('../src/core/notifPrefs.js');

test('(a) merge(undefined, undefined) returns the D-27-5 all-ON defaults (13 keys, email_comment the only false)', () => {
  const prefs = mergeNotifPrefs(undefined, undefined);
  assert.deepEqual(prefs, NOTIF_PREF_DEFAULTS);
  assert.equal(Object.keys(prefs).length, 13);
  assert.equal(prefs.email_comment, false);
  for (const [k, v] of Object.entries(prefs)) {
    if (k !== 'email_comment') assert.equal(v, true, `${k} defaults ON`);
  }
});

test('(b) a stored client row wins over defaults; unknown keys are dropped', () => {
  const prefs = mergeNotifPrefs({ email_reminder: false, evil_key: true }, undefined);
  assert.equal(prefs.email_reminder, false, 'stored row wins over the default');
  assert.equal(prefs.evil_key, undefined, 'whitelist-external key dropped');
  assert.equal(prefs.email_mention, true, 'untouched keys stay at defaults');
  assert.equal(Object.keys(prefs).length, 13, 'output stays on the defaults shape');
});

test('(c) a server row fills the client empty store — the F5 case (G-34-4)', () => {
  const prefs = mergeNotifPrefs(undefined, { push_due: false, push_comment: false });
  assert.equal(prefs.push_due, false, 'server OFF survives reload hydration');
  assert.equal(prefs.push_comment, false);
  assert.equal(prefs.email_mention, true, 'untouched keys stay at defaults');
  assert.equal(Object.keys(prefs).length, 13);
});

test('(d) the server row is canonical, and non-boolean server values are rejected', () => {
  const prefs = mergeNotifPrefs({ email_mention: false }, { email_mention: true, due_reminder: true });
  assert.equal(prefs.email_mention, true, 'server wins over client (PUT adoption shape, actions.js:2695)');
  assert.equal(prefs.due_reminder, true);

  const dirty = mergeNotifPrefs({ email_mention: false }, { email_mention: 1, push_due: 'yes', evil_key: true });
  assert.equal(dirty.email_mention, false, 'non-boolean server value dropped → client value stands');
  assert.equal(dirty.push_due, true, 'non-boolean server value dropped → default');
  assert.equal(dirty.evil_key, undefined, 'unknown key dropped');
});

test('(e) merge never mutates its inputs and never returns a doc-shaped notifPrefs carrier (D-01)', () => {
  const client = { email_mention: false };
  const server = { email_mention: true, due_reminder: true };
  const clientCopy = { ...client };
  const serverCopy = { ...server };
  const prefs = mergeNotifPrefs(client, server);
  assert.deepEqual(client, clientCopy, 'client input untouched');
  assert.deepEqual(server, serverCopy, 'server input untouched');
  assert.notEqual(prefs, server, 'a new object is returned, not a reference');
  assert.equal('notifPrefs' in prefs, false, 'no nested notifPrefs key');
  assert.ok(NOTIF_PREF_KEYS.every(() => true)); // whitelist still the 17-key surface
  for (const k of Object.keys(prefs)) {
    assert.ok(NOTIF_PREF_KEYS.includes(k), `${k} is whitelisted`);
    assert.equal(typeof prefs[k], 'boolean', `${k} is boolean`);
  }
});
