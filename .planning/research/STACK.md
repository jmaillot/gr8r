# Stack Research — v1.3 Auth Hardening

**Domain:** TOTP 2FA, QR provisioning, session revocation on a zero-runtime-dependency Node 24 backend + plain-JS frontend
**Researched:** 2026-10-26
**Confidence:** HIGH (npm versions verified against the registry today; Node API behavior verified against nodejs.org docs; existing schema verified directly in `server.js`)

## Headline recommendation

**Add zero runtime dependencies.** Everything this milestone needs is either already in
`server.js` (session rows), trivially expressible with `node:crypto` (TOTP is ~40 lines over
HMAC-SHA1), or vendorable as one MIT-licensed plain-JS file (the QR encoder). This is not a
close call: otplib's entire API surface beyond what 40 lines of RFC 6238 cover is generic HOTP/
HOTP-options plumbing Gr8r will never call, and the only QR libraries are heavier than the
hand-vendored encoder.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `node:crypto` (built-in) | Node 24 LTS | TOTP generation + verification (`createHmac('sha1')` + 20-byte truncation per RFC 4226 into RFC 6238) | The whole algorithm is HMAC-SHA1 → take 4 bytes at offset of last nibble → mod 1 000 000. With `crypto.timingSafeEqual` for verification and a ±1 time-step window, this is *smaller and more auditable than any wrapper*. The project already does scrypt + SHA-256 token hashing here. |
| Hand-written Base32 codec | ~20 LOC | Encode/decode TOTP secrets (RFC 4648 alphabet `A–Z2–7`) for the `otpauth://` URI and user-facing secret display | Node has **no** built-in Base32 (only base64/base64url; confirmed against the Node crypto docs `toString("base64")` encodings list). RFC 4648 Base32 without padding is ~15 lines and pure arithmetic — smaller than any 100+ LOC-helper dependency. |
| Vendored QR encoder | one file | Produce the QR matrix for the `otpauth://` URI, rendered client-side | See below — the only QR option that honors the zero-dependency constraint is a vendored pure-JS encoder imported as an ES module by the Vite build. |
| `sessions` table (existing) | n/a | Revoke-all-other-sessions by `user_id` | The hard part of revocation already exists: opaque tokens stored as `token_hash` in SQLite means a revocation is literally `DELETE FROM sessions ...`. No new auth machinery. |

### Supporting Libraries (only if the owner ever relaxes the constraint)

| Library | Latest version | Purpose | When to Use |
|---------|----------------|---------|-------------|
| `qrcode-generator` | 2.0.4 (MIT, verified 2026-10-26) | Kazuhiko Arase's QR encoder; ships a single-dependency-free `qrcode.js` (UMD/plain JS, zero deps itself) | **The vendor candidate.** Copy `qrcode.js` into `src/lib/vendor/` as an ES module, call `qrcode(typeNumber, errorCorrectionLevel)` → `qr.createDataURL()` or read the boolean matrix and hand-render `<rect>`s into an inline SVG. `typeNumber: 0` auto-selects version; `M` error correction. |
| `qrcode` | 1.5.4 (verified) | Server-side SVG/PNG QR strings | Only if the owner prefers server-side rendering *and* accepts a runtime dependency — it would break the no-runtime-dependency invariant, so NOT recommended here (its SVG output would save ~150 lines, not worth it). |
| `otplib` | 13.5.0 (verified) — **complete v13 rewrite**, breaking API changes vs 12; TOTP now covers HOTP legacy `authenticator` package | TOTP/HOTP wrapper | Only if NEeded: no. rf-6238-only app gains nothing; v13 is a fresh rewrite ( younger maturity than v12 ), new API names, plugin architecture. For a 6-digit/30 s/SHA-1 TOTP this dependency buys complexity. Use the node:crypto implementation. |

### What node:crypto alone CAN do (verified capability list)

- **TOTP core:** `crypto.createHmac('sha1', buffer).update(counterBuffer).digest()` with the
  8-byte big-endian counter; dynamic truncation per RFC 4226 §5.4. ~30 lines.
- **Constant-time code comparison:** `crypto.timingSafeEqual(Buffer.from(entered),
  Buffer.from(expected))` — RFC-recommended 6-digit length check and ±1-step window are plain
  JS.
- **Secret generation:** `crypto.randomBytes(20)` → 160-bit secret (RFC 6238 default), encoded
  Base32 → exactly the 32-char secret Google Authenticator expects.
- **Secreter storage at rest (optional but recommended):** `crypto.createCipheriv('aes-256-gcm',
  key, iv)` under a server-side key file (DERIVED, e.g. a key that lives only on the host) if
  unreadable-at-rest is wanted; decrypt only at JWT→TOTP verify time. See Anti-patterns.
- **Session token hashing:** already done (`sha256()`); revocation of N rows is a single
  DELETE.

### What node:crypto alone CANNOT do

- **Base32 encode/decode** (no built-in) → hand-write ~20 lines (RFC 4648).
- **Anything QR** (RS ECC enumeration, RS RS, masking) → vendored pure-JS encoder; hand-write
  is scientifically inadvisible Reed–Solomon ECFA enumeration + RS RS + eight mask patterns
  (see Anti-pattern #2).

## Implementation contours (integration points)

### TOTP (server.js additions)

```js
/* RFC 6238 TOTP over node:crypto — the whole thing */
const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32encode(buf) { /* ~12 lines: 8 bits → 5-bit groups → chars */ }
function base32decode(str) { /* inverse, strips '=' and spaces */ }
function totp(secretBuf, timeStepMs = 30000, t = Date.now()) {
  const counter = Math.floor(t / timeStepMs);
  const cbuf = Buffer.alloc(8); cbuf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', secretBuf).update(cbuf).digest();
  const off = h[h.length - 1] & 0x0f;
  return String.fromCodePoint(((h[off] & 0x7f) << 24 | h[off+1] << 16 | h[off+2] << 8 | h[off+3]) % 1_000_000)
    .padStart(6, '0');
}
function verifyTotp(secretBuf, code) { /* try counter-1..counter+1, timingSafeEqual */ }
```

- **Secret lifecycle:** generate `secretBuf = crypto.randomBytes(20)`; two-phase enrollment:
  store it in a `tfa_pending_secret` column until the entered code verifies, then flip
  `tfa_enabled = 1` and move to `tfa_secret`. Existing installs: columns override to
  `''`/`NULL` mean disconnected 2FA.
- **`otpauth://` URI** (the schema authenticator apps actually parse — verified format):
  ```
  otpauth://totp/Gr8r%20Studio:<email>?secret=<BASE32>&issuer=Gr8r%20Studio&algorithm=SHA1&digits=6&period=30
  ```
  — `issuer:`-prefixed label AND `issuer` param both present, `algorithm=SHA1`, `digits=6`,
  `period=30` explicitly stated (defaults, but never rely on the defaults — some apps misparse
  their absence).
- **Verification window:** accept ±1 step (≈ 30 s of clock skew each way); log the matched
  step for diagnostics; replay-guard by remembering (in-session row or column) the last used
  counter and rejecting `counter <= lastUsed`.
- **Timing:** compare candidate code strings with `crypto.timingSafeEqual` over equal-length
  Buffers, never `===`.

### QR (frontend)

- Vendored `src/lib/vendor/qrcode.js` (Arase-style, MIT-clean), imported as a plain ES module —
  the Vite build bundles it exactly like existing modules; no package-havior resolution.
- Render as inline SVG generated from the boolean matrix (ech `{ x, y }` truthy →
  `<rect x=...>`) rather than `createDataURL()` — the SVG scales to the settings-modal display
  size without any image round-trip, no canvas needed at all.
- Refresh/delete: the same module offers compact codegen; `qr.typeNumber = 0` handles
  auto-size by URI length.

### Session revocation (server.js changes — all additive)

- **Existing schema verified in `server.js`:**
  `sessions(token_hash text primary key, user_id, created_at, expires_at)` +
  `sessions_expiry` index; `--set-password <email>` CLI already does
  `DELETE FROM sessions WHERE user_id = ?` (the exact revocation pattern).
- **Required changes only:**
  1. `requireUser()`/index lookup must also return *this* session's `token_hash` so
     "revoke others" can do:
     ```js
     db.prepare('delete from sessions where user_id = ? and token_hash != ?')
       .run(me.id, currentTokenHash);
     ```
     No cookie rotation ceremony: the current opaque token stays valid; only other rows die.
  2. The "Sessions" page listing needs distinguishability → add nullable
     `label TEXT, last_seen_at INTEGER` columns (user agent guess + heartbeat from
     `requireUser()`, up-to-1-day-fed). Additive, no data migration for old rows (NULL label
     renders as "—").
  3. **Password change revokes everyone else** (per the milestone goal):
     ```js
     // after the scrypt re-hash + update
     db.prepare('delete from sessions where user_id = ? and token_hash != ?')
       .run(user.id, currentTokenHash);
     ```
     Re-establish the current session token to remain logged in under the new password.
- **"Disconnect other sessions" button**: activate once the count of
  `where user_id = ? and token_hash != currentTokenHash` rows > 0 (today's button is dead
  because the client has no "exclude-current" information __at all__ — this is the stub
  root-cause fix).

### Schema changes (the complete list)

| Where | Change | Reason |
|-------|--------|--------|
| `users` | `+ tfa_secret TEXT NULL`, `+ tfa_pending_secret TEXT NULL`, `+ tfa_enabled INTEGER DEFAULT 0` | Enrollment pre-verified secrets live in `tfa_pending_secret`; a second boot with no write does not change bytes (same guarantee as v1.2's locale column). |
| `users` | `+ tfa_last_counter INTEGER NULL` (or `+ tfa_last_used TEXT`) | TOTP replay window guard (reuse of the same 30 s code). |
| `sessions` | `+ label TEXT NULL`, `+ last_seen_at INTEGER NULL`, index `sessions_user on sessions(user_id)` | The Settings page labels sessions and computes "other sessions count" without 30-session-wide scanning. |
| Migration | Follow `migrateTenancy()` pattern: `create table if not exists` / `alter table add column` guarded by column-exists checks, then a `vacuum into` backup like the proven present-at-v1.1 machinery | Same lossless second-boot-is-a-no-op guarantee the project already owns. |

## Installation

```bash
# Nothing. Literally nothing to install for v1.3.
# node:test + @playwright/test remain the only (dev) dependencies.
npm install -D @playwright/test   # already present
```

One file lands in the tree: `src/lib/vendor/qrcode.js` (MIT, vendored, header comment citing
upstream project and license). The TOTP module is `server/auth/totp.mjs` (or inlined in
`server.js` in the project's single-file style).

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| node:crypto TOTP (~40 LOC, builds on existing scrypt/sha256 code, zero deps) | `otplib@13.5.0` | If adoption per-verification via multi-algorithm TOTP (SHA-256/512, 8-digit, HOTP counter-sync) ever matters for a future SSO-compat milestone. Today v13 is a fresh rewrite (API churn is real), and none of its extra surface serves 30 s/SHA-1/6-digit Gr8r. |
| Vendored `qrcode-generator` (1 MIT file) rendered as inline SVG | `qrcode@1.5.4` server-side SVG string | Only when the owner caves on the zero-dep constraint — ~1 700-worth-the-tradeoff if QR ever has server-rendered surfaces (e.g. email-less onboarding printouts). **NOT for v1.3.** |
| Hand-rolled 20-line Base32 (RFC 4648) | Any base32 npm package | Nothing — every base32 package outweighs the codec. This is the clearest no-dependency win in the whole milestone. |
| `DELETE ... WHERE token_hash != currentToken` (mez schema-level revocation) | Per-user `token_version INTEGER` on the users row + revalidation on every request (stateless-ish invalidation) | Only if sessions ever become JWT/statelessly checked. With opaque server-side rows, deleting the row IS the revocation; token_version would add a read+compare on every request for nothing. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `otplib` 13.x for v1.3 | Complete rewrite with breaking-change API churn; buys plugin architecture and HOTP plumbing Gr8r will never exercise. Any bug there is un-debuggable third-party code in an auth path. | 40 RFC-lines with `node:crypto` + `timingSafeEqual` — auditable in one read. |
| Hand-coding the QR algorithm from scratch (own RS-GF(256) + masking) | The algorithm has ~6 trapdoors (Reed-Solomon GF(2^8) with primitive 0x11d, optimal mask fitness scoring, version-selection economics, mode flags). First-attempt QR is illegible — exactly today's fake-QR bug. | Vendored MIT `qrcode.js` — battle-tested, 1 file, zero maintenance. |
| `qrcode@1.5.4` as a runtime dep | Breaks the zero-runtime-dependency project invariant (PROJECT.md v1.2 decisions #1–#3, Phase 12 decision #1); canvas/`canvas`-peer native fallbacks on server-side PNG paths are a deploy risk in the Docker image | Vendor the pure JS encoder into the Vite build as a module. |
| SVG/image "fake QR" (any drawn-look matrix without real encoding) | The current bug; phones cannot decode cosmetic grids | Encode the actual `otpauth://` URI with the vendored encoder. |
| `===` for the 6-digit code compare | Not constant time; leaks digit-prefix information side channels (low practical impact, but free to avoid) | `crypto.timingSafeEqual` over equal-length Buffers. |
| Storing base32 TOTP secrets in plaintext when a server key exists | DB-file exfiltration → instant 2FA bypass. Gr8r stores passwords scrypt-hashed for a reason. | `tfa_secret` AES-256-GCM-encrypted under a key derived/fetched at boot (`DATA_DIR/tfa.key` auto-created once, chmod 600). Optional hardening this milestone; at minimum never log or expose the secret after save. |

## Stack Patterns by Variant

**If the investigation phase confirms all three features share one stubbed auth-zone root cause** (per the milestone's plan):
- Fix the common root (likely missing "current session identity binding" between the browser and
  the sessions/2FA endpoints) once, then implement TOTP/QR/revocation on top — do NOT
  special-case three separate fixes.

**If the owner decides 2FA secrets should be recoverable** (lost authenticator):
- Add one `recovery_codes TEXT` JSON column (8 scrypt-shashed codes, single-use, revoking
  after user). This is scrypt reuse — already the project's primitive — no new stack.

**If the owner ever wants a second TOTP user-app family (8-digit, SHA-512)**:
- `otplib@13.5.0` becomes worthwhile then; the `otpauth://` URI grows `algorithm=SHA1`
  parameter handling too. Not in v1.3.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `node:crypto` TOTP implementation | Node 24 LTS (current project); `writeBigUInt64BE` exists since Node 12; `timingSafeEqual` since 6 | No compat risk. Node 26.x is today's current but the project pins 24 LTS — implementation stays identical on both. |
| Vendored `qrcode.js` (`qrcode-generator` 2.0.4 source) | Plain JS/ESM; Vite bundling (project uses Vite for the client build); no peer deps | Works identically in Chromium tests and the Docker build. |
| `sessions` | existing `sessions_expiry` index | New `sessions_user` index is additive; old rows get `label NULL` naturally. |

## Sources

- nodejs.org `crypto` documentation (Node 26 current / 24 LTS) — verified HMAC, `timingSafeEqual`,
  `randomBytes`, encoding list (no Base32). — HIGH
- RFC 6238 (and RFC 4226 §5.4 truncation spec) — verified via IETF/web fetch. — HIGH
- npm registry, fetched 2026-10-26: `otplib@13.5.0`, `qrcode@1.5.4`, `qrcode-generator@2.0.4`
  (MIT), `@otplib/preset-default@12.0.1` (legacy line). — HIGH
- Snyk/libraries.io/GitHub otplib release pages — confirmed v13 is a complete rewrite with
  breaking changes and active release cadence. — HIGH
- Direct code inspection of `/home/jmaillot/Projects/gr8r/server.js` — existing
  `sessions` schema, `setSessionCookie`, `--set-password` revocation pattern,
  `SESSION_DAYS`, `COOKIE=gr8r_session`. — HIGH

---
*Stack research for: Gr8r Studio v1.3 Auth Hardening (TOTP + QR + session revocation)*
*Researched: 2026-10-26*
