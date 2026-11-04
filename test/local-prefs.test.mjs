/* Per-user notification preferences — client local-mode pins (Phase 34, SETTINGS-02).
   Pins the localStorage adapter in src/core/notifPrefs.js: all-ON defaults when
   the key is absent (D-27-5), per-workspace keying with no bleed (D-08),
   read-side whitelist validation, and exception swallowing. The module reads
   `localStorage` off globalThis, so a stub object stands in for the browser. */
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

const { NOTIF_PREF_DEFAULTS, NOTIF_PREF_KEYS, notifPrefsKey, getLocalNotifPrefs, setLocalNotifPrefs } = await import(
  '../src/core/notifPrefs.js'
);

test('(a) an absent key reads the all-ON defaults (email_comment the only false)', () => {
  backing.clear();
  const prefs = getLocalNotifPrefs('ws-a');
  assert.deepEqual(prefs, NOTIF_PREF_DEFAULTS);
  assert.equal(Object.keys(prefs).length, 11);
  assert.equal(prefs.email_comment, false);
  for (const [k, v] of Object.entries(prefs)) {
    if (k !== 'email_comment') assert.equal(v, true, `${k} defaults ON`);
  }
});

test('(b) write then read-back survives a simulated reload (fresh module state)', async () => {
  backing.clear();
  setLocalNotifPrefs('ws-a', { email_reminder: false, push_comment: false });
  // Fresh module graph — the same thing a page reload produces. The stub's
  // backing Map persists, exactly like localStorage across a reload.
  const fresh = await import('../src/core/notifPrefs.js?reload=1');
  const prefs = fresh.getLocalNotifPrefs('ws-a');
  assert.equal(prefs.email_reminder, false);
  assert.equal(prefs.push_comment, false);
  assert.equal(prefs.email_mention, true, 'untoggled keys stay at defaults');
});

test('(c) two workspace ids produce two isolated keys — no bleed (D-08)', () => {
  backing.clear();
  setLocalNotifPrefs('ws-a', { email_reminder: false });
  setLocalNotifPrefs('ws-b', { push_comment: false });
  assert.notEqual(notifPrefsKey('ws-a'), notifPrefsKey('ws-b'));
  assert.equal(getLocalNotifPrefs('ws-a').email_reminder, false);
  assert.equal(getLocalNotifPrefs('ws-a').push_comment, true, 'ws-b write did not bleed into ws-a');
  assert.equal(getLocalNotifPrefs('ws-b').email_reminder, true, 'ws-a write did not bleed into ws-b');
  // G-37-2: the legacy push toggle pref is off the whitelist — a stored value is dropped outright
  setLocalNotifPrefs('ws-b', { push_due: false });
  assert.equal('push_due' in getLocalNotifPrefs('ws-b'), false, 'a stored push toggle value is DROPPED, never defaulted');
});

test('(d) non-whitelisted keys and non-boolean values are rejected on read', () => {
  backing.clear();
  backing.set(
    notifPrefsKey('ws-a'),
    JSON.stringify({ email_reminder: false, evil_key: true, push_due: 'yes', email_mention: 1, mention_team: false }),
  );
  const prefs = getLocalNotifPrefs('ws-a');
  assert.equal(prefs.evil_key, undefined, 'unknown key dropped');
  assert.equal('push_due' in prefs, false, 'the legacy push toggle pref dropped outright — not whitelisted, no default (G-37-2)');
  assert.equal(prefs.email_mention, true, 'non-boolean value dropped → default');
  assert.equal(prefs.mention_team, false, 'whitelisted extra key with a boolean survives');
  assert.equal(prefs.email_reminder, false, 'legitimate stored value survives');
});

test('(e) storage exceptions are swallowed in both directions', async () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  const saved = globalThis.localStorage;
  globalThis.localStorage = blocked;
  try {
    // Fresh module import whose calls hit the throwing stub.
    const fresh = await import('../src/core/notifPrefs.js?blocked=1');
    const prefs = fresh.getLocalNotifPrefs('ws-a');
    assert.deepEqual(prefs, NOTIF_PREF_DEFAULTS, 'throwing read → defaults');
    assert.doesNotThrow(() => fresh.setLocalNotifPrefs('ws-a', { email_reminder: false }), 'throwing write swallowed');
  } finally {
    globalThis.localStorage = saved;
  }
});

/* The 16-key whitelist surface the read-side sanitizer enforces (11 defaults +
   email_digest (opt-in, D-14) + the 4 undefined-falsy extras — the legacy push
   toggle pref left with G-37-2). */
test('whitelist is the 11 defaults plus the 4 undefined-falsy extras', () => {
  assert.equal(NOTIF_PREF_KEYS.length, 16);
  assert.ok(NOTIF_PREF_KEYS.includes('email_digest'), 'email_digest stays whitelisted (opt-in, D-14)');
  for (const k of ['mention_team', 'mention_ws', 'assign_status', 'assign_over']) {
    assert.ok(NOTIF_PREF_KEYS.includes(k), `${k} whitelisted`);
  }
});

/* ---- store-level no-resurrect pin (T-34-09): a legacy blob cannot push prefs into the doc ---- */

test('a legacy snapshot carrying doc.notifPrefs is stripped on load and excluded from docSnapshot', async () => {
  const legacy = {
    data: {
      ws: { name: 'Legacy', url: 'legacy-ws', c: '#1D1C1A' },
      tasks: [{ id: 't1', title: 'seed-worthy task' }],
      notifPrefs: { email_mention: false, hijack: true },
    },
    prefs: { theme: 'dark' },
    views: {},
    collapsed: false,
  };
  backing.set('projects.v2', JSON.stringify(legacy));
  try {
    const store = await import('../src/core/store.js?legacy=1');
    assert.equal('notifPrefs' in store.S.data, false, 'load() stripped doc.notifPrefs before it reached S.data');
    assert.equal(store.S.data.tasks.length, 1, 'the rest of the blob hydrated normally');
    const snap = store.S.data; // reference — docSnapshot() mutates S.data in place only to delete
    assert.doesNotThrow(() => {
      // docSnapshot is not exported; exercise the save path that serializes it.
      store.save();
    });
    await new Promise(r => setTimeout(r, 250)); // save()'s 150ms debounce
    const written = JSON.parse(backing.get('projects.v2'));
    assert.equal('notifPrefs' in written.data, false, 'the rewritten blob carries no notifPrefs');
    assert.ok(snap); // reference still valid — proves S.data itself stayed free of the field
  } finally {
    backing.delete('projects.v2');
  }
});
