// TOTP core (TFA-01) — RFC 4226 / RFC 6238 SHA-1 via node:crypto.
// Zero runtime dependencies. Server-side only: NOT under src/ so Vite
// never bundles server crypto. Phase 16-02 (routes) and Phase 17 (login
// second step) import these exact functions verbatim.
//
// Contracts honored here (13-DECISIONS / 16-CONTEXT):
// - D-04: verifyTotpCode compares AND returns the matched time step; callers
//   persist it to users.two_fa_last_step. The guard rejects when the matched
//   step is <= the stored step (not just equal) — replay of the same code or
//   an earlier-window code is refused.
// - D-54: otpauth URI identity is
//   otpauth://totp/Gr8r:<encodeURIComponent(email)>?secret=…&issuer=Gr8r&algorithm=SHA1&digits=6&period=30
// - D-51: recovery codes are lowercase hex xxxx-xxxx, hashed whole (sha256),
//   never encrypted (D-09 — survive MASTER_KEY loss).
// - Secrets and otpauth URIs are never logged (T-16-07).
import crypto from 'node:crypto';

const A32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const sha256hex = s => crypto.createHash('sha256').update(s).digest('hex');

// Case-insensitive, padding-tolerant Base32 decode (Pitfall 4): skips '='
// and any non-alphabet character.
export function base32Decode(s) {
  let bits = 0,
    val = 0;
  const out = [];
  for (const c of String(s).toUpperCase()) {
    const i = A32.indexOf(c);
    if (i < 0) continue;
    val = (val << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((val >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// RFC 4226 HOTP. The dynamic truncation masks h[off] with 0x7f — the
// signed-byte trap (Pitfall 2) that produces wrong codes when the top bit
// is set. Proven by all 10 RFC 4226 + 5 RFC 6238 fixture vectors.
export function hotp(keyBuf, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', keyBuf).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}

export const totpAt = (secretB32, timeSec, period = 30) => hotp(base32Decode(secretB32), Math.floor(timeSec / period), 6);

// TOTP verify with ±1 step window and the D-04 matched-step replay guard.
// The /^\d{6}$/ format gate runs BEFORE timingSafeEqual, which THROWS
// ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH on length mismatch (Pitfall 1) —
// malformed input returns { ok:false, reason:'format' }, never a 500.
// Returns { ok:true, matchedStep } on success; the caller stores
// matchedStep in two_fa_last_step.
export function verifyTotpCode(secretB32, code, lastStep, nowSec, period = 30) {
  const target = String(code).trim();
  if (!/^\d{6}$/.test(target)) return { ok: false, reason: 'format' };
  const key = base32Decode(secretB32);
  const step = Math.floor(nowSec / period);
  for (const delta of [0, -1, 1]) {
    const s = step + delta;
    const candidate = Buffer.from(hotp(key, s, 6));
    if (crypto.timingSafeEqual(candidate, Buffer.from(target))) {
      if (lastStep !== null && lastStep !== undefined && s <= lastStep) {
        return { ok: false, reason: 'replay' };
      }
      return { ok: true, matchedStep: s };
    }
  }
  return { ok: false, reason: 'no-match' };
}

// D-54: the label (Gr8r:<email>) is fully encodeURIComponent-ed so emails
// containing ':', '?', '&', or spaces cannot break the issuer/label split
// (Pitfall 5). Issuer appears both as the label prefix and the issuer= param.
export function buildOtpauthUri(email, secretB32) {
  const label = `Gr8r:${encodeURIComponent(email)}`;
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=Gr8r&algorithm=SHA1&digits=6&period=30`;
}

// D-51: 4 random bytes → 8 lowercase hex chars → dash-grouped xxxx-xxxx.
export function generateRecoveryCode() {
  const hex = crypto.randomBytes(4).toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}

// Pitfall 6 — the ONE normalization, used identically at generation-hash
// time (16-02 enable) and at every future burn/verify site (Phase 17 login,
// 16-02 disable). Phase 17 imports this verbatim.
export const normalizeRecoveryCode = s => String(s).trim().toLowerCase().replace(/[\s-]/g, '');

// D-09: whole-code sha256 hex — hash-only, never encrypted.
export const recoveryHash = normalized => sha256hex(normalized);

// 20 random bytes (160-bit) → unpadded uppercase Base32 (32 chars), the
// standard Google Authenticator-compatible secret shape (RESEARCH A1).
export function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function base32Encode(buf) {
  let bits = 0,
    val = 0;
  let out = '';
  for (const b of buf) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += A32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}
