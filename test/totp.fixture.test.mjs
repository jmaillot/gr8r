// TFA-01 fixture vectors — RFC 4226 §Appendix D (HOTP, 6 digits) and
// RFC 6238 §B (TOTP SHA-1, 8 digits). These exercise the exact functions
// server.js (16-02) and Phase 17 will import from ../totp.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  base32Decode,
  hotp,
  totpAt,
  verifyTotpCode,
  buildOtpauthUri,
  generateRecoveryCode,
  normalizeRecoveryCode,
  recoveryHash,
  generateTotpSecret,
} from '../totp.js';

const SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // ASCII "12345678901234567890"

// RFC 4226 Appendix D — counters 0–9, 6 digits
const HOTP_VECTORS = [
  [0, '755224'],
  [1, '287082'],
  [2, '359152'],
  [3, '969429'],
  [4, '338314'],
  [5, '254676'],
  [6, '287922'],
  [7, '162583'],
  [8, '399871'],
  [9, '520489'],
];

// RFC 6238 §B (SHA-1) — same secret, 8 digits, T in seconds
const TOTP_VECTORS = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
  [20000000000, '65353130'],
];

test('base32Decode decodes the RFC 4226 test secret', () => {
  assert.equal(base32Decode(SECRET_B32).toString('ascii'), '12345678901234567890');
});

test('RFC 4226: all 10 HOTP vectors (6 digits)', () => {
  for (const [counter, expected] of HOTP_VECTORS) {
    assert.equal(hotp(base32Decode(SECRET_B32), counter, 6), expected, `counter ${counter}`);
  }
});

test('RFC 6238: all 5 TOTP SHA-1 vectors (8 digits)', () => {
  for (const [t, expected] of TOTP_VECTORS) {
    assert.equal(hotp(base32Decode(SECRET_B32), Math.floor(t / 30), 8), expected, `T=${t}`);
  }
});

test('totpAt computes 6-digit codes from Base32 secret + unix time', () => {
  // counter 0 → 755224; step 0 covers time 0..29
  assert.equal(totpAt(SECRET_B32, 0, 30), '755224');
  assert.equal(totpAt(SECRET_B32, 29, 30), '755224');
  assert.equal(totpAt(SECRET_B32, 30, 30), '287082');
});

test('verifyTotpCode accepts the current step and returns matchedStep', () => {
  const step = 12345;
  const code = totpAt(SECRET_B32, step * 30, 30);
  const r = verifyTotpCode(SECRET_B32, code, null, step * 30);
  assert.deepEqual(r, { ok: true, matchedStep: step });
});

test('verifyTotpCode accepts step+1 (future-step code recorded)', () => {
  const step = 12345;
  const code = totpAt(SECRET_B32, (step + 1) * 30, 30);
  const r = verifyTotpCode(SECRET_B32, code, null, step * 30);
  assert.deepEqual(r, { ok: true, matchedStep: step + 1 });
});

test('verifyTotpCode accepts step-1 (clock skew) when lastStep is null', () => {
  const step = 12345;
  const code = totpAt(SECRET_B32, (step - 1) * 30, 30);
  const r = verifyTotpCode(SECRET_B32, code, null, step * 30);
  assert.deepEqual(r, { ok: true, matchedStep: step - 1 });
});

test('D-04 replay guard: code for step <= lastStep is rejected', () => {
  const step = 12345;
  const code = totpAt(SECRET_B32, step * 30, 30);
  // same code re-verified at the same instant with lastStep = matched step
  const r = verifyTotpCode(SECRET_B32, code, step, step * 30);
  assert.deepEqual(r, { ok: false, reason: 'replay' });
});

test('D-04 replay guard: a code for an earlier step is rejected (<=, not ===)', () => {
  const step = 12345;
  const code = totpAt(SECRET_B32, (step - 1) * 30, 30);
  const r = verifyTotpCode(SECRET_B32, code, step, step * 30);
  assert.deepEqual(r, { ok: false, reason: 'replay' });
});

test('D-04 window: a code for step+2 is rejected (no-match)', () => {
  const step = 12345;
  const code = totpAt(SECRET_B32, (step + 2) * 30, 30);
  const r = verifyTotpCode(SECRET_B32, code, null, step * 30);
  assert.deepEqual(r, { ok: false, reason: 'no-match' });
});

test('format gate: 5-digit code returns format, does not throw', () => {
  assert.deepEqual(verifyTotpCode(SECRET_B32, '12345', null, 0), { ok: false, reason: 'format' });
});

test('format gate: non-numeric code returns format, does not throw', () => {
  assert.deepEqual(verifyTotpCode(SECRET_B32, 'abcdef', null, 0), { ok: false, reason: 'format' });
});

test('format gate: empty code returns format, does not throw', () => {
  assert.deepEqual(verifyTotpCode(SECRET_B32, '', null, 0), { ok: false, reason: 'format' });
});

test('base32Decode is case-insensitive and padding-tolerant (Pitfall 4)', () => {
  const lower = base32Decode(SECRET_B32.toLowerCase());
  assert.equal(lower.toString('ascii'), '12345678901234567890');
  const padded = base32Decode(`${SECRET_B32}======`);
  assert.equal(padded.toString('ascii'), '12345678901234567890');
});

test('buildOtpauthUri: D-54 format with encoded email label', () => {
  assert.equal(
    buildOtpauthUri('user@example.com', 'SECRETABC'),
    'otpauth://totp/Gr8r:user%40example.com?secret=SECRETABC&issuer=Gr8r&algorithm=SHA1&digits=6&period=30'
  );
});

test('buildOtpauthUri survives hostile emails (Pitfall 5)', () => {
  const uri = buildOtpauthUri('a:b?c&d e@x.com', 'SECRETABC');
  assert.ok(uri.startsWith('otpauth://totp/Gr8r:'), uri);
  // label fully encoded — first raw colon after totp/ splits scheme path
  const label = uri.slice('otpauth://totp/'.length, uri.indexOf('?'));
  assert.equal(label, `Gr8r:${encodeURIComponent('a:b?c&d e@x.com')}`);
  assert.ok(uri.includes('&issuer=Gr8r&algorithm=SHA1&digits=6&period=30'));
  assert.ok(uri.includes('secret=SECRETABC'));
});

test('generateRecoveryCode: xxxx-xxxx lowercase hex (D-51)', () => {
  for (let i = 0; i < 50; i++) {
    assert.match(generateRecoveryCode(), /^[0-9a-f]{4}-[0-9a-f]{4}$/);
  }
});

test('normalizeRecoveryCode: trim, lowercase, strip dashes/spaces (Pitfall 6)', () => {
  assert.equal(normalizeRecoveryCode('A3F1-9B02'), 'a3f19b02');
  assert.equal(normalizeRecoveryCode('a3f1 9b02'), 'a3f19b02');
  assert.equal(normalizeRecoveryCode('  A3F1-9B02  '), 'a3f19b02');
  assert.equal(normalizeRecoveryCode('A3F1-9B02'), normalizeRecoveryCode('a3f1 9b02'));
});

test('recoveryHash: whole-code sha256 hex (D-09)', async () => {
  const { createHash } = await import('node:crypto');
  assert.equal(recoveryHash('a3f19b02'), createHash('sha256').update('a3f19b02').digest('hex'));
});

test('generateTotpSecret: 20 random bytes → 32-char unpadded uppercase Base32', () => {
  const s = generateTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.equal(base32Decode(s).length, 20);
  // two calls give different secrets
  assert.notEqual(generateTotpSecret(), s);
});
