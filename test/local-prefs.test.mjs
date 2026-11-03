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

const { NOTIF_PREF_DEFAULTS, NOTIF_PREF_KEYS, notifPrefsKey, getLocalNotifPrefs, setLocalNotifPrefs } = await import(
  '../src/core/notifPrefs.js'
);

test('(a) an absent key reads the all-ON defaults (email_comment the only false)', () => {
  backing.clear();
  const prefs = getLocalNotifPrefs('ws-a');
  assert.deepEqual(prefs, NOTIF_PREF_DEFAULTS);
  assert.equal(Object.keys(prefs).length, 13);
  assert.equal(prefs.email_comment, false);
  for (const [k, v] of Object.entries(prefs)) {
    if (k !== 'email_comment') assert.equal(v, true, `${k} defaults ON`);
  }
});

test('(b) write then read-back survives a simulated reload (fresh module state)', async () => {
  backing.clear();
  setLocalNotifPrefs('ws-a', { email_reminder: false, push_due: false });
  // Fresh module graph — the same thing a page reload produces. The stub's
  // backing Map persists, exactly like localStorage across a reload.
  const fresh = await import('../src/core/notifPrefs.js?reload=1');
  const prefs = fresh.getLocalNotifPrefs('ws-a');
  assert.equal(prefs.email_reminder, false);
  assert.equal(prefs.push_due, false);
  assert.equal(prefs.email_mention, true, 'untoggled keys stay at defaults');
});

test('(c) two workspace ids produce two isolated keys — no bleed (D-08)', () => {
  backing.clear();
  setLocalNotifPrefs('ws-a', { email_reminder: false });
  setLocalNotifPrefs('ws-b', { push_due: false });
  assert.notEqual(notifPrefsKey('ws-a'), notifPrefsKey('ws-b'));
  assert.equal(getLocalNotifPrefs('ws-a').email_reminder, false);
  assert.equal(getLocalNotifPrefs('ws-a').push_due, true, 'ws-b write did not bleed into ws-a');
  assert.equal(getLocalNotifPrefs('ws-b').email_reminder, true, 'ws-a write did not bleed into ws-b');
});

test('(d) non-whitelisted keys and non-boolean values are rejected on read', () => {
  backing.clear();
  backing.set(
    notifPrefsKey('ws-a'),
    JSON.stringify({ email_reminder: false, evil_key: true, push_due: 'yes', email_mention: 1, mention_team: false }),
  );
  const prefs = getLocalNotifPrefs('ws-a');
  assert.equal(prefs.evil_key, undefined, 'unknown key dropped');
  assert.equal(prefs.push_due, true, 'non-boolean value dropped → default');
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

/* The 17-key whitelist surface the read-side sanitizer enforces. */
test('whitelist is the 13 defaults plus the 4 undefined-falsy extras', () => {
  assert.equal(NOTIF_PREF_KEYS.length, 17);
  for (const k of ['mention_team', 'mention_ws', 'assign_status', 'assign_over']) {
    assert.ok(NOTIF_PREF_KEYS.includes(k), `${k} whitelisted`);
  }
});
