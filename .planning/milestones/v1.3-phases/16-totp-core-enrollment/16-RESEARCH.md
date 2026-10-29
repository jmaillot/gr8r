# Phase 16: TOTP Core & Enrollment - Research

**Researched:** 2026-10-27
**Domain:** TOTP (RFC 6238) implementation with `node:crypto`, zero-dependency Base32, vendored QR rendering, hashed recovery codes
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions (D-46…D-59 — binding, copy of the substance)
- **D-46:** Pending secret lives in an in-memory Map keyed by `user_id` with short TTL (same pattern as attempts Map, `server.js:1163`). Secret never touches disk until enable; abandoned enrollment self-clears; server restart mid-enrollment = re-scan QR, user in pre-enrollment state.
- **D-47:** Route pair on `/api/auth/*`: `POST /api/auth/tfa/enroll` and `POST /api/auth/tfa/enable`. Flat noun-resource style (D-26); `login_challenges` stays login-only.
- **D-48:** Enroll response is `200 { secret, otpauth }` — server builds the full `otpauth://` URI; client feeds URI to `src/lib/qr.js` (D-15) and shows copyable secret.
- **D-49:** Enroll start requires `{ currentPassword }` (step-up, D-34 shape); wrong-password attempts consume throttle budget (D-41 pattern).
- **D-50:** 10 recovery codes issued at enable.
- **D-51:** Codes are lowercase hex `xxxx-xxxx` (8 hex chars, dash-grouped), sha256-hashed **whole** (hash-only, never encrypted), generated with `node:crypto.randomBytes`.
- **D-52:** Hashes in a dedicated `recovery_codes` table (per-code row, used/burned marker); additive migration in the `ensureColumn`/guarded-create style (P-B); byte-identical second-boot guarantee of `test/migration.test.mjs` applies.
- **D-53:** Plaintext shown exactly once in a one-time modal at enable, copy-all affordance, `settings.tfa.recovery`/`recoveryDesc` keys; re-enrollment issues fresh set and invalidates old rows.
- **D-54:** URI identity: `otpauth://totp/Projects:<email>?secret=…&issuer=Projects&algorithm=SHA1&digits=6&period=30`.
- **D-55:** Copyable-secret fallback: monospace read-only field + copy button + "can't scan?" hint. QR rendering per D-15/16 (vendored encoder, inline SVG, EC level M, quiet zone 4, ~132 px).
- **D-56:** Settings 2FA section = one inline card with states (off → enroll in place; on → status + turn-off). No wizard modal, no new routing.
- **D-57:** Disable requires current password AND a code; code input accepts a live 6-digit code **or** a recovery code.
- **D-58:** `MASTER_KEY` missing/undecryptable → fail-closed 503 (D-06); client shows generic `err.*` fallback; the admin-facing 503 body naming `MASTER_KEY` is never rendered to users.
- **D-59:** Disable = complete teardown in one transaction: `two_fa_enabled=0`, secret ciphertext cleared, recovery_codes rows deleted.

### the agent's Discretion
- Pending-Map TTL length; per-user overwrite policy (re-generate and replace — one pending secret per user).
- Throttle budget constant for wrong-password attempts at enroll/disable (within D-11's band; distinct key prefix).
- Burn-time normalization (strip dash / case-fold before sha256) — identical at enable display, Phase 17 login burn, and disable verify.
- Exact toast copy within honest-copy rule; i18n count pins updated in-commit.
- D-06 503 body wording (admin-facing, names `MASTER_KEY`).
- Test file placement following existing `test/` conventions.

### Deferred Ideas (OUT OF SCOPE)
- Admin reset of a user's 2FA — no admin role exists; roadmap backlog item.
- Login second-factor flow (Phase 17), e2e/i18n sweep (Phase 18).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TFA-01 | Secret accepted by standard authenticator; RFC 4226/6238 fixture-vector tests (±1 window, `timingSafeEqual`, matched-step replay guard) | §Code Examples: verified HOTP/TOTP implementation reproducing all RFC vectors locally; §Pitfalls 1–4 |
| TFA-02 | Phone camera scans QR into Google Authenticator; copyable-secret fallback | §Standard Stack: verified `qrcode-generator@2.0.4` API (`createSvgTag`); D-48/D-54/D-55 |
| TFA-03 | 2FA on only after live 6-digit verify vs pending secret; abandonment = pre-enrollment state | D-46/D-47 verify-before-enable; §Architecture Patterns |
| TFA-04 | 8–10 single-use recovery codes, plaintext once, hashed at rest; printed code logs in exactly once | D-50–D-53; §Pitfall 6 (burn normalization); §Code Examples recovery-code shape |
</phase_requirements>

## Summary

This phase is unusually well-constrained: every architectural decision (D-46…D-59) was locked in discuss-phase, and Phase 13 pinned the crypto contracts (D-04…D-17). The research task here was therefore verification, not exploration: (1) prove a ~50-line `node:crypto` HOTP/TOTP implementation reproduces the official RFC 4226 and RFC 6238 fixture vectors — done, all 15 vectors match a local probe run in this environment; (2) confirm the vendored `qrcode-generator@2.0.4` ships `dist/qrcode.mjs` and expose its exact SVG API — done via unpkg; (3) map the RFC semantics onto the pinned `two_fa_last_step` replay-guard column and the D-11 throttle budgets.

The only genuinely tricky parts are traps, not features: `timingSafeEqual` **throws** on length mismatch (must length-guard first), the HOTP dynamic-truncation uses signed-byte arithmetic (must mask with `& 0xff` / `& 0x7f`), the replay guard must reject a code whose matched step is ≤ the stored `two_fa_last_step` (not just equal), and recovery-code normalization must be defined once and used by every future verify path (Phase 17 reuses it verbatim).

**Primary recommendation:** Implement exactly to D-46…D-59. Write `src/lib/totp.js`-style server-side helpers (Base32 + HOTP/TOTP, ~50 lines) validated against the RFC vectors *as the first test*, vendor `dist/qrcode.mjs` unchanged into `src/lib/vendor/qrcode.js` with a thin `src/lib/qr.js` wrapper, and keep all verification through one `verifyTotpCode` + one `normalizeRecoveryCode` function that Phase 17 will import.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Secret generation, TOTP verify, replay guard | API/Backend (`server.js` + helpers) | — | Secrets and codes never touch the client tier; `node:crypto` is server-only |
| AES-256-GCM encrypt at enable (D-05) | API/Backend | — | `MASTER_KEY`-derived, server-side only |
| otpauth URI construction | API/Backend | — | D-48: one source of truth for issuer/label/params |
| Recovery code generation + hashing | API/Backend | — | Plaintext exists server-side once, hashes at rest (D-51/D-52) |
| QR rendering | Browser/Client (`src/lib/qr.js`) | — | D-15/16: vendored encoder, inline SVG in the settings card |
| Pending-secret Map + TTL | API/Backend | — | D-46 mirrors the in-process `attempts` Map |
| Enrollment UI card, one-time codes modal | Browser/Client (`src/pages/settings.js`) | — | D-56 inline card; API methods per `api.sessions` pattern |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | Node ≥24 (`node v24.21.0` present) | HMAC-SHA1, `randomBytes`, `timingSafeEqual`, AES-256-GCM | Project is zero-runtime-deps; everything needed is built in |
| `qrcode-generator` (vendored) | 2.0.4 | QR encoding → inline SVG | D-15/D-17: vendored, never installed; 1.39M weekly downloads, OK verdict |

### Supporting
None. No new npm dependencies — `qrcode-generator` is vendored source, not installed.

**Package Legitimacy Audit** (required — vendor step only, no install):

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `qrcode-generator@2.0.4` | npm | published 2025-08-07 | ~1.39M/wk | github.com/kazuhikoarase/qrcode-generator | OK | Approved (vendored copy of `dist/qrcode.mjs`, 51.9 kB, no postinstall script) [VERIFIED: gsd-tools package-legitimacy check + unpkg listing] |

**Packages removed due to [SLOP] verdict:** none. **Flagged [SUS]:** none.

**Vendored file inventory** [VERIFIED: unpkg.com/qrcode-generator@2.0.4/dist/]: the package ships
`qrcode.mjs` (51.9 kB), `qrcode_SJIS.mjs`, `qrcode_UTF8.mjs`, plus `.js`/`.d.ts` counterparts.
Only `dist/qrcode.mjs` is needed. Copy it verbatim (license header included) to
`src/lib/vendor/qrcode.js` per D-15.

## Architecture Patterns

### System Architecture Diagram

```
Settings page (2FA card, off state)
        │  click "Add a second step"
        ▼
password prompt ── POST /api/auth/tfa/enroll { currentPassword }
        │                    │
        │             [step-up: scrypt verify → tooMany on failure]
        │                    │
        │             generate 20-byte secret → Base32
        │             stash { secret, otpauth } in pending Map[user_id] (TTL)
        │                    │
        │             200 { secret, otpauth }
        ▼                    ▼
QR (src/lib/qr.js renders otpauth → inline SVG)  +  copyable secret field
        │
        │  user scans into authenticator, types 6-digit code
        ▼
POST /api/auth/tfa/enable { code }
        │
   [pending Map lookup → TOTP verify ±1 window → replay guard vs two_fa_last_step]
        │
   [transaction: two_fa_enabled=1, two_fa_secret=AES-GCM(v1:…), two_fa_last_step=matched,
                 recovery_codes: 10 sha256 rows; pending Map cleared]
        │
        ▼
One-time modal: 10 plaintext `xxxx-xxxx` codes + copy-all
```

Disable path (D-57/D-59): password + (live code OR recovery code) → verify → single
transaction clearing all three state stores.

### Recommended Project Structure

```
src/lib/
├── vendor/qrcode.js     # verbatim copy of dist/qrcode.mjs (D-15)
├── qr.js                # thin wrapper: otpauth string → SVG (D-16 params)
server.js                # or helper module per existing conventions:
                         #   base32Decode, hotp, verifyTotpCode, pendingTfa Map,
                         #   normalizeRecoveryCode, recovery-code hash/lookup
test/
├── totp.fixture.test.mjs        # RFC 4226/6238 vectors, ±1 window, replay guard (TFA-01)
├── tfa-enrollment.test.mjs      # route pair, step-up, verify-before-enable, teardown (D-47–D-59)
└── qr.fixture.test.mjs          # D-17 SVG fixture test
```

(File placement is agent discretion; the RFC vector test is mandatory per TFA-01/D-17.)

### Pattern 1: HOTP/TOTP core (verified against RFC vectors)

```js
// Source: RFC 4226 §5.3 / RFC 6238 §4 — all vectors below reproduced by local
// execution probe (node v24.21.0, /tmp/opencode/hotp-probe.mjs) this session.
const A32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) {
  let bits = 0, val = 0; const out = [];
  for (const c of s.toUpperCase()) {
    const i = A32.indexOf(c);
    if (i < 0) continue;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function hotp(keyBuf, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', keyBuf).update(buf).digest();
  const off = h[h.length - 1] & 0xf;                       // low 4 bits of last byte
  const code = (((h[off] & 0x7f) << 24) | (h[off+1] << 16) | (h[off+2] << 8) | h[off+3])
               % 10 ** digits;
  return code.toString().padStart(digits, '0');
}
const totpAt = (secretB32, timeSec, period = 30) =>
  hotp(base32Decode(secretB32), Math.floor(timeSec / period), 6);
```

Fixture vectors (all reproduced `OK` by the probe — use verbatim in tests):

- RFC 4226 (secret ASCII `"12345678901234567890"`, Base32 `GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ`), counters 0–9, 6 digits:
  `755224, 287082, 359152, 969429, 338314, 254676, 287922, 162583, 399871, 520489`
- RFC 6238 SHA-1, 8 digits, same secret: T=59→`94287082`, T=1111111109→`07081804`, T=1234567890→`89005924`, T=2000000000→`69279037`, T=20000000000→`65353130`

### Pattern 2: verify-with-window-and-replay-guard (D-04)

```js
// Compare with timingSafeEqual; it THROWS on length mismatch — length-guard first.
function verifyTotpCode(secretB32, code, lastStep, nowSec) {
  const target = String(code).trim();
  if (!/^\d{6}$/.test(target)) return { ok: false, reason: 'format' };
  const key = base32Decode(secretB32);
  const step = Math.floor(nowSec / 30);
  for (const delta of [0, -1, 1]) {                        // ±1 window (D-04)
    const s = step + delta;
    const candidate = Buffer.from(hotp(key, s, 6));
    if (crypto.timingSafeEqual(candidate, Buffer.from(target))) {
      if (lastStep !== null && s <= lastStep) return { ok: false, reason: 'replay' };
      return { ok: true, matchedStep: s };
    }
  }
  return { ok: false, reason: 'no-match' };
}
// Caller persists matchedStep to two_fa_last_step on success (D-04: store the
// matched step, reject s <= stored on every future verify path).
```

`timingSafeEqual` behavior probe this session: equal-length compare returns `true`;
mismatched lengths **throw** `ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH` — hence the
fixed-6-digit format gate before comparing. [VERIFIED: local probe]

### Pattern 3: vendored QR API (D-15/16)

```js
// Source: https://unpkg.com/qrcode-generator@2.0.4/dist/qrcode.d.ts [VERIFIED this session]
import qrcode from './vendor/qrcode.js';   // default export is the factory
const qr = qrcode(0, 'M');                 // typeNumber 0 = auto-size, EC level 'M' (D-16)
qr.addData(otpauthUri);                    // Byte mode is the default
qr.make();
const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: false }); // quiet zone 4 (D-16)
// insert svg inline (it is a full <svg> string); size to ~132 px via CSS width
```

### Anti-Patterns to Avoid
- **Installing `qrcode-generator` as a dependency:** D-15 forbids it; the project's `dependencies.test.mjs` guards zero runtime deps.
- **Encrypting recovery codes:** D-09/D-51 — hash-only (sha256), so they survive `MASTER_KEY` loss. Encrypting would make them unrecoverable exactly when `MASTER_KEY` is lost.
- **Client-built otpauth URI:** D-48 puts URI construction server-side only.
- **Regex or `===` compares of TOTP codes:** use `timingSafeEqual` (D-04); length-guard first (Pitfall 1).
- **Rendering the admin 503 body in the client:** D-58 — generic `err.*` fallback only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| QR encoding | Hand-drawn module matrix (the deleted 14-04 stub did exactly this — fake 11×11 grid) | Vendored `qrcode-generator` | QR masking/Reed-Solomon ECC is a documented trapdoor (`.planning/research/PITFALLS.md` Pitfall 19); a hand-rolled QR scans in no real camera |
| TOTP itself | A library (otplib, speakeasy) | ~50 lines of `node:crypto` + RFC vectors | Zero-deps project; the algorithm is tiny and the RFC vectors make it provably correct — but *do* use the vendored QR, don't hand-roll that |
| Constant-time comparison | `a === b` / DIY loops | `crypto.timingSafeEqual` | Built in, audited; remember the length-mismatch throw |
| Secure randomness | `Math.random()` | `crypto.randomBytes` | Secret (20 bytes) and recovery codes (4 bytes each) both |

**Key insight:** the only two things worth not hand-rolling are QR (prohibitively hard to get right) and constant-time compare (free from the stdlib). TOTP is the inverse: small enough to hand-write *correctly* only because the RFC vectors can prove it.

## Runtime State Inventory

> Not a rename/migration phase — but Phase 14 landed dormant state this phase flips on, so a short inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.two_fa_enabled`, `users.two_fa_secret`, `users.two_fa_last_step`, `login_challenges` — landed dormant by 14-01 [VERIFIED: 13-DECISIONS re-verification + CONTEXT D-31] | Behavior flip only; no data migration for these. New: `recovery_codes` table (additive guarded create) |
| Live service config | None — self-hosted Node app, no external service config | None |
| OS-registered state | None | None |
| Secrets/env vars | `MASTER_KEY` documented in DEPLOY.md env block (D-07/D-08); no new keys | DEPLOY.md docs update if not already landed |
| Build artifacts | None affected (vendored file is source) | None |

## Common Pitfalls

### Pitfall 1: `timingSafeEqual` throws on length mismatch
**What goes wrong:** comparing `"1234"` vs `"123456"` throws instead of returning false, crashing the request.
**Why:** the API requires equal-length buffers by design.
**How to avoid:** strict format gate (`/^\d{6}$/`) before compare; for recovery codes, hash-then-compare the fixed-length sha256 hex instead of comparing raw strings.
**Warning signs:** 500s on malformed code inputs.

### Pitfall 2: Dynamic truncation with signed bytes
**What goes wrong:** `(h[off] << 24) | …` yields negative numbers when the top bit is set, producing wrong codes ~50% of the time.
**How to avoid:** mask `h[off] & 0x7f` (or `& 0xff` everywhere and use `>>>`). The RFC vectors catch this immediately — run them first.

### Pitfall 3: Replay guard off-by-one
**What goes wrong:** storing the *code* or comparing only equality lets an attacker (or a lagging authenticator) reuse the same code within the window repeatedly.
**How to avoid:** store the matched **time step** (`two_fa_last_step`), reject `matchedStep <= lastStep`, accept the future-step code first (a code for step+1 is valid now and must be recorded so it can't be re-used at step+1). D-04's semantics: "compare and store the matched time step."
**Warning signs:** the same displayed code verifying twice inside 90 s.

### Pitfall 4: Base32 padding / lowercase input
**What goes wrong:** authenticator apps display secrets in uppercase grouped-4 with padding; if enrollment displays an unpadded lowercase string, manual entry can fail or mismatch.
**How to avoid:** generate Base32 uppercase without `=` padding for the URI (standard practice), display it grouped `XXXX XXXX XXXX` for manual entry, and make `base32Decode` case-insensitive and padding-tolerant (the reference impl above already skips non-alphabet chars — keep that).
**Warning signs:** manual secret entry rejected by Google Authenticator.

### Pitfall 5: otpauth label escaping
**What goes wrong:** emails containing `:`, `?`, `&`, or spaces break the URI or the authenticator's issuer/label split (the part before the first `:` in the path is the issuer).
**How to avoid:** `encodeURIComponent` the label (`Projects:${email}`) and every query param value; keep the issuer both in the label prefix and `issuer=` param (D-54 format) so authenticators don't re-prompt.
**Warning signs:** account appears as bare email or with a wrong issuer in the app.

### Pitfall 6: Recovery-code normalization drift
**What goes wrong:** enable-time display shows `xxxx-xxxx`, login (Phase 17) or disable input may arrive as `XXXXXXXX`, uppercase, or with spaces — hash lookup misses, user locked out of a valid printed code.
**How to avoid:** one `normalizeRecoveryCode(code)` = trim → lowercase → strip dashes/whitespace, used identically at generation-hash time and at every burn/verify site; document it in CONTEXT-facing code comments since Phase 17 imports it. (Agent discretion item — pick it once, write it down.)
**Warning signs:** "invalid recovery code" reports for codes visibly on the printout.

### Pitfall 7: Pending-Map TTL without sweep
**What goes wrong:** unbounded Map growth across abandoned enrollments (the existing `tooMany` has a size-5000 sweep; a naive pending Map may not).
**How to avoid:** copy the `tooMany` sweep pattern (`server.js:1163-1173`): lazy sweep on insert when size exceeds a cap, plus per-entry `expiresAt` check on read.
**Warning signs:** memory growth in long-running instances.

### Pitfall 8: Clock skew at ±1 window
**What goes wrong:** ±1 step (±30 s) is the standard tolerance, but phones with drifted clocks fail enrollment; widening the window to ±2+ weakens the replay story.
**How to avoid:** keep ±1 (D-04 pins the behavior); the copyable-secret fallback plus error copy ("check your phone's clock") covers genuine skew. Don't widen the window to fix user confusion.

## Code Examples

### Recovery code generation + hash (D-51/D-52)

```js
// 4 random bytes → 8 lowercase hex chars → dash-grouped
function generateRecoveryCode() {
  const hex = crypto.randomBytes(4).toString('hex');        // e.g. 'a3f19b02'
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;              // 'a3f1-9b02'
}
const normalizeRecoveryCode = s => String(s).trim().toLowerCase().replace(/[\s-]/g, '');
const recoveryHash = normalized => sha256(normalized);      // whole-code sha256, hex
// sha256 helper already exists at server.js:185 (crypto.createHash('sha256'))
```

Schema sketch (additive guarded create, P-B style — exact SQL follows existing table conventions):

```sql
create table if not exists recovery_codes (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  code_hash  text not null,
  used_at    integer,                                        -- null = unburned
  created_at integer not null
);
create index if not exists recovery_codes_user on recovery_codes(user_id);
```

(Structure per D-52 one-row-per-code with burned marker; `id`/column naming is agent discretion matching existing conventions.)

### Step-up + throttle call sites (D-49/D-57, D-11 budgets)

The enroll-start and disable-start handlers copy the `PATCH /api/auth/password` shape
(D-34/D-41, verified pattern in `password-change.test.mjs`): `sameOrigin(req)` →
`requireUser` → `readJson` → `tooMany('<prefix>|' + clientIp + '|' + email)` → scrypt
`verifyPassword(currentPassword, user.password_hash)` → proceed. Distinct throttle key
prefixes per the D-11 table (`2fa-verify|…`, `recovery|…` — 5–8 attempts / 15 min band).

### Client API method (D-56, per `api.sessions` pattern)

```js
// src/core/api.js — auth-scoped method family
tfaEnroll: currentPassword => post('/api/auth/tfa/enroll', { currentPassword }),
tfaEnable: code => post('/api/auth/tfa/enable', { code }),
tfaDisable: (currentPassword, code) => post('/api/auth/tfa/disable', { currentPassword, code }),
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| otplib/speakeasy for TOTP | ~50-line `node:crypto` impl + RFC vector tests | Project convention (zero deps) since Phase 13 | Fewer deps, provable correctness |
| npm-installed QR library | Vendored `qrcode-generator` dist file | D-15 (2026-10) | Bundle-scoped, no dependency-graph risk |
| Encrypted recovery codes | Hash-only (D-09) | Phase 13 pinning | Codes survive `MASTER_KEY` loss |

**Deprecated/outdated in this repo:** the client-side fake 2FA toggles (`A.revokeSession`-style `D().tfa = true`, settings stub QR grid) were deleted in Phase 14 — do not resurrect any of that surface; rebuild per D-56.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Google Authenticator accepts an unpadded uppercase Base32 secret of 20 bytes (160-bit) in the otpauth URI — universally standard, not probed with a real device this session | Standard Stack / Code Examples | Enrollment fails on real device; would surface in Phase 18 real-device UAT, fix is trivial (secret length) |
| A2 | `recovery_codes` table shape (id/user_id/code_hash/used_at/created_at) is an acceptable concretization of D-52's "one row per code with used/burned marker" | Code Examples | Cosmetic — planner/user can rename columns; behavior unchanged |
| A3 | QR `cellSize: 4, margin: 4` produces ~132 px output per D-16's stated params | Pattern 3 | Visual size only; CSS width fixes it |

All other claims are verified (local probes, unpkg, codebase reads) or are pinned D-NN contracts quoted from CONTEXT.md.

## Open Questions (RESOLVED)

1. **Where do TOTP helpers live — inline in `server.js` or a new module?** — (RESOLVED: 16-01 Task 3)
   - What we know: `server.js` is monolithic today; project has no `src/server/` split; `src/lib/` is client-facing (bundled by Vite).
   - What's unclear: whether a server-side helper module (e.g. `server-lib/` or top-level) fits conventions.
   - Resolution: top-level `totp.js` server module, created by 16-01 Task 3; tests import helpers directly for the vector test.
   - Recommendation: planner decides; tests should import helpers directly for the vector test either way.

2. **Disable endpoint name** — D-47 pins only `enroll`/`enable`; D-57/D-59 imply a disable route. — (RESOLVED: 16-02 Task 2)
   - Resolution: `POST /api/auth/tfa/disable` (flat noun-resource, matches D-26), implemented by 16-02 Task 2 and listed in its must_haves.artifacts.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥24 | everything | ✓ | v24.21.0 | — |
| `node:crypto` HMAC/`randomBytes`/`timingSafeEqual`/AES-GCM | TOTP, secrets, encryption | ✓ | stdlib | — |
| `qrcode-generator@2.0.4` dist file (network fetch for vendoring) | D-15 | ✓ (unpkg reachable this session) | 2.0.4 | Re-fetch from npm tarball |
| SQLite via existing driver (`node:sqlite`) | recovery_codes table | ✓ | project-standard | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in), `node --test --test-concurrency=2 test/*.test.mjs` |
| Config file | none needed (conventions in existing `test/*.test.mjs`) |
| Quick run command | `node --test test/totp.fixture.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TFA-01 | RFC 4226/6238 vectors, ±1 window, replay guard | unit (fixture vectors) | `node --test test/totp.fixture.test.mjs` | ❌ Wave 0 |
| TFA-02 | QR SVG fixture (D-17), otpauth URI params | unit | `node --test test/qr.fixture.test.mjs` | ❌ Wave 0 |
| TFA-03 | Step-up, verify-before-enable, abandonment leaves state untouched | integration (own server+temp DB) | `node --test test/tfa-enrollment.test.mjs` | ❌ Wave 0 |
| TFA-04 | 10 codes hashed at rest, burn-once, re-enroll invalidates old | integration | `node --test test/tfa-enrollment.test.mjs` | ❌ Wave 0 |
| — | Second-boot no-op with new table (P-B) | integration | `node --test test/migration.test.mjs` | ✅ extend |

### Sampling Rate
- **Per task commit:** `node --test test/totp.fixture.test.mjs test/qr.fixture.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/totp.fixture.test.mjs` — TFA-01 vectors + replay guard
- [ ] `test/qr.fixture.test.mjs` — D-17 fixture
- [ ] `test/tfa-enrollment.test.mjs` — route pair + recovery codes
- (No framework install needed — `node:test` built-in)

## Security Domain

(security_enforcement: enabled by default)

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | TOTP verify via `timingSafeEqual`; scrypt step-up (D-49); recovery codes hash-only (D-09) |
| V3 Session Management | no | Session lifecycle unchanged this phase (Phase 17 owns login second step) |
| V4 Access Control | yes | `requireUser` + `sameOrigin` on all new routes; password gates on enroll/disable |
| V5 Input Validation | yes | Strict regex gates (`/^\d{6}$/`, hex recovery format) before any compare |
| V6 Cryptography | yes | `node:crypto` only — HMAC-SHA1, AES-256-GCM (D-05), sha256, `randomBytes`; never hand-rolled |
| V7 Error handling | yes | Stable error codes; admin 503 body never user-facing (D-58/D-06) |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| TOTP code brute-force | Spoofing | D-11 throttle budgets (`2fa-verify|ip|email` 5–8/15min); constant-time compare |
| Replay of observed code | Spoofing | `two_fa_last_step` matched-step guard (D-04) |
| 2FA armed on stolen cookie | Elevation | Password step-up on enroll (D-49) and disable (D-57) |
| Recovery-code theft at rest | Information disclosure | sha256 hashes only; plaintext shown once (D-53) |
| QR/secret leak via logs | Information disclosure | Pending secret in memory only (D-46); never log secret or otpauth URI |
| Weak TOTP secret | Spoofing | ≥20 bytes (160-bit) from `crypto.randomBytes` |

## Sources

### Primary (HIGH confidence)
- Local execution probe (`node v24.21.0`, this session) — all RFC 4226 (10/10) and RFC 6238 SHA-1 (5/5) vectors reproduced; `timingSafeEqual` length-mismatch throw confirmed
- unpkg.com/qrcode-generator@2.0.4 — dist file inventory + `qrcode.d.ts` API surface [VERIFIED]
- `gsd-tools query package-legitimacy check` — qrcode-generator OK (1.39M downloads/wk, active repo, no postinstall)
- Codebase reads: `server.js` (throttle `tooMany` :1163, `sha256` :185, scrypt verify :189–204, schema block), `13-DECISIONS.md` verified-diagnosis inventory, `16-CONTEXT.md` D-46–D-59

### Secondary (MEDIUM confidence)
- RFC 4226 / RFC 6238 vector values cross-checked against the local probe [CITED: RFC 4226 §Appendix D, RFC 6238 §B]

### Tertiary (LOW confidence)
- Google Authenticator manual-entry UX behavior [ASSUMED → A1]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is stdlib + one verified vendored file
- Architecture: HIGH — all decisions pinned D-46…D-59, patterns copied from verified Phase 13–15 precedents
- Pitfalls: HIGH — each pitfall verified by probe, RFC semantics, or pinned project decision

**Research date:** 2026-10-27
**Valid until:** 2026-11-26 (stable: stdlib + pinned contracts)
