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

/* ---- G-34-6 wiring pin (static analysis of the call graph) ------------------
   G-34-4 wired hydrateNotifPrefs at 5 hydrateFromServer success sites, but the
   6th — the /w/<slug> boot routine in src/main.js (the F5 path) — was missed.
   These pins read both source files as text and assert that EVERY
   hydrateFromServer success site, in either file, hydrates prefs nearby — so a
   future 7th call site is caught by the test, not by UAT. */

import { readFileSync } from 'node:fs';

const actionsSrc = readFileSync(new URL('../src/actions/actions.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

/* Each hydrateFromServer call must be followed by a hydrateNotifPrefs call
   within this many lines (the success-path pattern: early-return/401/!ok
   branches sit between them). */
const HYDRATE_WINDOW = 12;

function checkSites(src, file) {
  const lines = src.split('\n');
  const misses = [];
  lines.forEach((line, i) => {
    if (!line.includes('hydrateFromServer(') || line.includes('import') || line.includes('function hydrateFromServer')) return;
    const window = lines.slice(i + 1, i + 1 + HYDRATE_WINDOW).join('\n');
    if (!window.includes('hydrateNotifPrefs(')) {
      misses.push(`${file}:${i + 1} — hydrateFromServer success site with no hydrateNotifPrefs within ${HYDRATE_WINDOW} lines`);
    }
  });
  return misses;
}

test('(f) G-34-6: hydrateNotifPrefs is exported from actions.js', () => {
  assert.ok(
    actionsSrc.includes('export async function hydrateNotifPrefs()'),
    'actions.js must export hydrateNotifPrefs so main.js boot can call it'
  );
});

test('(g) G-34-6: main.js imports hydrateNotifPrefs from ./actions/actions.js', () => {
  assert.ok(
    /import\s*{[^}]*hydrateNotifPrefs[^}]*}\s*from\s*'\.\/actions\/actions\.js'/.test(mainSrc),
    "main.js must import hydrateNotifPrefs from './actions/actions.js'"
  );
});

test('(h) G-34-6: every hydrateFromServer success site hydrates prefs — actions.js and the main.js boot path', () => {
  /* pollNotifs (main.js ~line 80) is the one intentional exception — it must
     NOT hydrate (pin (i) enforces that). Strip its region before the sweep. */
  const pStart = mainSrc.indexOf('const pollNotifs');
  const pEnd = mainSrc.indexOf('setInterval(pollNotifs', pStart);
  const mainBootSrc = pStart === -1 ? mainSrc : mainSrc.slice(0, pStart) + mainSrc.slice(pEnd);
  const misses = [...checkSites(actionsSrc, 'src/actions/actions.js'), ...checkSites(mainBootSrc, 'src/main.js')];
  assert.deepEqual(misses, [], `missed hydration site(s):\n  ${misses.join('\n  ')}`);
});

test('(i) G-34-6: pollNotifs does NOT hydrate prefs (boot-time concern, not a 30s GET cadence)', () => {
  const start = mainSrc.indexOf('const pollNotifs');
  const end = mainSrc.indexOf('setInterval(pollNotifs', start);
  assert.ok(start !== -1 && end !== -1, 'pollNotifs not found in main.js');
  const pollBody = mainSrc.slice(start, end);
  assert.equal(
    pollBody.includes('hydrateNotifPrefs'),
    false,
    'pollNotifs must not call hydrateNotifPrefs — prefs hydrate at boot/entry, not on a 30s poll'
  );
});

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
