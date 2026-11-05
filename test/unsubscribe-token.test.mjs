/* =====================================================================
   Phase 41 plan 02 — token format freeze (UNSUB-01, D-09/D-10/D-11/D-12).
   Pure unit file: node:test + node:assert/strict, NO server boot — the
   three named exports from mailer.js take the key as an argument, so a
   fixed literal Buffer pins the whole contract without MASTER_KEY scope
   (Phase 40 named-export rationale).

   Frozen contract: payload = 0x01 ‖ wsId(36B UUID) ‖ userId(36B UUID);
   token = payload ‖ HMAC-SHA256(key, payload); base64url (RFC 4648 §5,
   no padding, no +/=, no CR/LF); verify = length-guard then
   crypto.timingSafeEqual. ANY change to version byte, framing, alphabet
   or derivation MUST break this suite before Phase 42 consumes it.
   ===================================================================== */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { test } from 'node:test';
import { makeUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken } from '../mailer.js';

const KEY = crypto.createHash('sha256').update('fixed-test-material').digest();
const WS_ID = '11111111-2222-3333-4444-555555555555'; // fixed 36-char UUID literals
const USER_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('UNSUB-01 freeze: makeUnsubscribeToken is deterministic for a fixed key and fixed ids', () => {
  const a = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  const b = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  assert.equal(typeof a, 'string');
  assert.equal(a, b, 'same key + same ids → byte-identical token');
  assert.notEqual(a, makeUnsubscribeToken(KEY, WS_ID, 'ffffffff-ffff-ffff-ffff-ffffffffffff'), 'different user → different token');
  assert.notEqual(a, makeUnsubscribeToken(crypto.createHash('sha256').update('other').digest(), WS_ID, USER_ID), 'different key → different token');
});

test('UNSUB-01 freeze: decoded token is version 0x01 ‖ wsId(36B) ‖ userId(36B) ‖ HMAC-SHA256(payload)(32B)', () => {
  const raw = Buffer.from(makeUnsubscribeToken(KEY, WS_ID, USER_ID), 'base64url');
  assert.equal(raw.length, 1 + 36 + 36 + 32, 'fixed 105-byte framing');
  assert.equal(raw[0], 0x01, 'version byte 0x01 first');
  assert.equal(raw.subarray(1, 37).toString('utf8'), WS_ID, 'bytes 1-36 are wsId');
  assert.equal(raw.subarray(37, 73).toString('utf8'), USER_ID, 'bytes 37-72 are userId');
  const want = crypto.createHmac('sha256', KEY).update(raw.subarray(0, 73)).digest();
  assert.ok(raw.subarray(73).equals(want), 'remaining 32 bytes are the HMAC-SHA256 over bytes 0-72');
});

test('UNSUB-01 freeze: token matches the base64url alphabet with no padding and no CR/LF bytes', () => {
  const token = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  assert.match(token, /^[A-Za-z0-9_-]+$/, 'RFC 4648 §5 alphabet only');
  assert.ok(!token.includes('='), 'no padding');
  assert.ok(!/[\r\n]/.test(token), 'no CR/LF — the header-injection surface is empty');
});

test('UNSUB-01 freeze: unsubscribeUrl returns exactly appUrl + /unsubscribe/ + token — no query string, no other path chars', () => {
  const token = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  assert.equal(unsubscribeUrl(KEY, 'https://app.test', WS_ID, USER_ID), `https://app.test/unsubscribe/${token}`);
  assert.equal(unsubscribeUrl(KEY, 'https://app.test/', WS_ID, USER_ID), `https://app.test/unsubscribe/${token}`, 'trailing slash normalized, never doubled');
  assert.ok(!unsubscribeUrl(KEY, 'https://app.test', WS_ID, USER_ID).includes('?'), 'no query string (D-09)');
  assert.ok(!/\?|&|@|:.*@/.test(unsubscribeUrl(KEY, 'https://app.test', WS_ID, USER_ID).split('/unsubscribe/')[1]), 'opaque single path segment — no readable identifiers (D-09/D-12)');
});

test('UNSUB-01 freeze: domain separation — different purpose tags over the same material produce different signatures', () => {
  // Replicates the server.js derivation SHAPE (sha256 over key-material ‖ purpose)
  // without importing server.js: two derived keys, same payload → different MACs.
  const material = 'shared-master-material';
  const keyA = crypto.createHash('sha256').update(material).update('purpose-a').digest();
  const keyB = crypto.createHash('sha256').update(material).update('purpose-b').digest();
  assert.notEqual(keyA.toString('hex'), keyB.toString('hex'), 'different tags → different keys');
  const rawA = Buffer.from(makeUnsubscribeToken(keyA, WS_ID, USER_ID), 'base64url');
  const rawB = Buffer.from(makeUnsubscribeToken(keyB, WS_ID, USER_ID), 'base64url');
  assert.deepEqual(rawA.subarray(0, 73), rawB.subarray(0, 73), 'same payload');
  assert.notDeepEqual(rawA.subarray(73), rawB.subarray(73), 'different signatures — the purpose tag is the domain separator (D-10/T-41-02)');
});

test('UNSUB-01 freeze: verifyUnsubscribeToken accepts a freshly made token and binds the key', () => {
  const token = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  assert.equal(verifyUnsubscribeToken(KEY, token), true, 'fresh token verifies');
  assert.equal(verifyUnsubscribeToken(crypto.createHash('sha256').update('another-key').digest(), token), false, 'token from a different key fails (key binding)');
});

test('UNSUB-01 freeze: flipping any single payload byte breaks verification', () => {
  const token = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  for (const pos of [0, 1, 20, 36, 50, 72]) {
    // positions: version byte, wsId edges/middle, userId edges/middle
    const raw = Buffer.from(token, 'base64url');
    raw[pos] ^= 0x01;
    assert.equal(verifyUnsubscribeToken(KEY, raw.toString('base64url')), false, `payload byte ${pos} flipped → false`);
  }
});

test('UNSUB-01 freeze: flipping any single MAC byte breaks verification', () => {
  const token = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  for (const pos of [73, 85, 104]) {
    const raw = Buffer.from(token, 'base64url');
    raw[pos] ^= 0x01;
    assert.equal(verifyUnsubscribeToken(KEY, raw.toString('base64url')), false, `MAC byte ${pos} flipped → false`);
  }
});

test('UNSUB-01 freeze: truncated, oversized, wrong-version and non-base64 tokens fail WITHOUT throwing', () => {
  const token = makeUnsubscribeToken(KEY, WS_ID, USER_ID);
  const raw = Buffer.from(token, 'base64url');
  assert.equal(verifyUnsubscribeToken(KEY, raw.subarray(0, 100).toString('base64url')), false, 'truncated token → false');
  assert.equal(verifyUnsubscribeToken(KEY, raw.subarray(0, 73).toString('base64url')), false, 'MAC-less token → false');
  assert.equal(verifyUnsubscribeToken(KEY, Buffer.concat([raw, Buffer.alloc(1)]).toString('base64url')), false, 'oversized token → false (strict exact length)');
  const wrongVersion = Buffer.from(raw);
  wrongVersion[0] = 0x02;
  assert.equal(verifyUnsubscribeToken(KEY, wrongVersion.toString('base64url')), false, 'unknown version byte → false');
  assert.equal(verifyUnsubscribeToken(KEY, 'not a token!!'), false, 'garbage input → false, not a throw');
  assert.equal(verifyUnsubscribeToken(KEY, ''), false, 'empty token → false');
});

test('UNSUB-01 freeze: verification is timing-safe — the compare goes through crypto.timingSafeEqual, length-guard first', async () => {
  /* Source inspection of mailer.js (the plan's sanctioned probe): the verify
     path must use the length-guard-then-timingSafeEqual form (server.js L414
     precedent). The behavioral guard is pinned above by non-throwing false
     returns on every length mismatch. */
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../mailer.js', import.meta.url), 'utf8');
  const verifyBody = src.slice(src.indexOf('function verifyUnsubscribeToken'), src.indexOf('}', src.indexOf('timingSafeEqual')));
  assert.ok(verifyBody.includes('timingSafeEqual'), 'verifyUnsubscribeToken compares via crypto.timingSafeEqual');
  assert.ok(verifyBody.includes('mac.length === want.length &&'), 'the timingSafeEqual call is length-guarded first');
  assert.ok(verifyBody.includes('createHmac'), 'the expected MAC is recomputed and compared — never string equality');
});
