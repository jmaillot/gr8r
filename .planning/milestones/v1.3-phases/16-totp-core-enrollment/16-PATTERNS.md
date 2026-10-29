# Phase 16: TOTP Core & Enrollment - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 12 (7 new, 5 modified)
**Analogs found:** 12 / 12

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/vendor/qrcode.js` | utility (vendored source) | transform | none (verbatim copy of `qrcode-generator@2.0.4 dist/qrcode.mjs`) | no-analog (by design, D-15) |
| `src/lib/qr.js` | utility (client) | transform | `src/core/utils.js` helpers (`deviceLabel`, `esc`) — pure import-and-format module shape | role-match |
| Server TOTP helpers (Base32/hotp/verifyTotpCode/otpauth URI — placement per OQ1, e.g. top-level `totp.js` or `server.js`) | utility (server) | transform | `hashPassword`/`verifyPassword` crypto helpers in `server.js:183-213` | role-match |
| Pending-secret Map + TTL | state (in-memory) | event-driven TTL | `attempts` Map + `tooMany()` `server.js:1194-1206` | exact |
| `POST /api/auth/tfa/enroll` (new route in server.js) | route/controller | request-response | `PATCH /api/auth/password` `server.js:1338-1372` | exact |
| `POST /api/auth/tfa/enable` (new route) | route/controller | request-response + CRUD txn | `PATCH /api/auth/password` (step-up) + `transaction()` `server.js:779-790` | exact |
| `POST /api/auth/tfa/disable` (new route, name per RESEARCH OQ2) | route/controller | request-response + CRUD txn | `PATCH /api/auth/password` transaction + sessions teardown | exact |
| `recovery_codes` table (schema + ensureColumn) | migration | CRUD | Phase 14 `two_fa_*` ensureColumn block `server.js:167-176` + SCHEMA block `server.js:109-116` (invites table shape) | exact |
| `src/core/api.js` tfa methods | client API layer | request-response | `api.sessions`/`api.revokeSession`/`api.changePassword` `src/core/api.js:233-247` | exact |
| `src/pages/settings.js` 2FA card (new case + section) | component (view) | request-response | `case 'password'` and `case 'sessions'` `src/pages/settings.js:377-414` | exact |
| `src/locales/en.json` + `fr.json` (new `settings.tfa.*` keys) | config (i18n) | static | existing retained keys `en.json:1255-1265` | exact |
| `test/totp.fixture.test.mjs`, `test/qr.fixture.test.mjs`, `test/tfa-enrollment.test.mjs`, extended `test/migration.test.mjs` | test | batch | `test/password-change.test.mjs` (server+temp DB harness), `test/migration.test.mjs` (second-boot) | exact |

## Pattern Assignments

### Server TOTP helpers (utility, transform)

**Analog:** `server.js:183-213` (crypto helpers block)

**Imports pattern** — helpers sit in the `/* helpers */` section of `server.js` (or a sibling module imported there per OQ1; planner decides, tests import directly either way):

```js
// server.js:183-187 — the shape to copy: one-liner pure functions, no class
const now = () => Date.now();
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const uid = () => crypto.randomUUID();
```

**Core pattern** — RESEARCH.md Pattern 1/2 (verified against RFC 4226/6238 vectors; use verbatim):

```js
// Base32 decode + HOTP + TOTP (research-verified, all 15 RFC vectors reproduced)
const A32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Decode(s) { /* case-insensitive, padding-tolerant — see RESEARCH Pattern 1 */ }
function hotp(keyBuf, counter, digits = 6) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', keyBuf).update(buf).digest();
  const off = h[h.length - 1] & 0xf;
  const code = (((h[off] & 0x7f) << 24) | (h[off+1] << 16) | (h[off+2] << 8) | h[off+3]) % 10 ** digits;
  return code.toString().padStart(digits, '0');
}
// verifyTotpCode: format-gate `/^\d{6}$/` BEFORE timingSafeEqual (it throws on
// length mismatch — Pitfall 1); ±1 window; reject matchedStep <= lastStep (D-04).
```

**Recovery code generation** (RESEARCH Code Example; normalize once, use everywhere — Pitfall 6):

```js
function generateRecoveryCode() {
  const hex = crypto.randomBytes(4).toString('hex');
  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
}
const normalizeRecoveryCode = s => String(s).trim().toLowerCase().replace(/[\s-]/g, '');
const recoveryHash = normalized => sha256(normalized); // whole-code sha256, hex — reuses server.js:184
```

---

### Pending-secret Map + TTL (D-46)

**Analog:** `server.js:1194-1206`

**Core pattern** (exact copy shape — note the size-5000 lazy sweep, Pitfall 7):

```js
/* In-memory throttle: a handful of attempts per IP+email per window. */
const attempts = new Map();
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const t = Date.now();
  const row = attempts.get(key);
  if (!row || row.reset < t) { attempts.set(key, { n: 1, reset: t + windowMs }); /* … */ 
    if (attempts.size > 5000) for (const [k, v] of attempts) if (t > v.reset) attempts.delete(k);
  }
  // …returns true when over budget
}
```

Apply as: `const pendingTfa = new Map()` keyed by `user_id` with `{ secret, otpauth, expiresAt }`; lazy sweep on insert, per-entry expiry check on read. One pending secret per user — re-click overwrites.

---

### `POST /api/auth/tfa/enroll` (route, request-response)

**Analog:** `PATCH /api/auth/password`, `server.js:1338-1372` — the D-34/D-49 step-up shape verbatim.

**Guard pattern** (lines 1338-1344):

```js
if (pathname === '/api/auth/password' && method === 'PATCH') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  // Budget keyed by user_id (caller is cookie-authenticated); every attempt —
  // including a wrong current password — consumes one try.
  if (tooMany(`pwchange|${user.id}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```

For enroll: same order (`sameOrigin` → `requireUser` → `tooMany('tfa-enroll|' + user.id, …)` → `readJson`), then `verifyPassword(body.currentPassword, user.password_hash)` → on failure `fail(res, 403, 'wrongCurrentPassword', …)`; distinct throttle key prefix (D-11 band).

**Response pattern** — minimal payloads only:

```js
return json(res, 200, { ok: true }); // D-37 precedent
// enroll per D-48: return json(res, 200, { secret, otpauth }); — server-built URI
```

---

### `POST /api/auth/tfa/enable` (route, request-response + transaction)

**Analog:** `PATCH /api/auth/password` transaction body, `server.js:1356-1370`, plus `transaction()` helper.

**Atomic pattern** (lines 1356-1370 — copy the fresh-reselect-inside-transaction discipline):

```js
const ok = transaction(() => {
  // Pitfall 4: re-select the hash fresh inside the transaction.
  const row = db.prepare('select password_hash from users where id = ?').get(user.id);
  if (!row || !verifyPassword(cur, row.password_hash)) return false;
  db.prepare('update users set password_hash = ? where id = ?').run(hashPassword(nw), user.id);
  db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
  return true;
});
```

Enable applies: inside one `transaction()` — TOTP verify vs pending Map secret (±1 window, replay guard vs `two_fa_last_step`), then `update users set two_fa_enabled=1, two_fa_secret=<v1: ciphertext>, two_fa_last_step=<matched>`, delete+insert 10 `recovery_codes` rows (invalidates old set, D-53), delete pending Map entry.

**Error handling pattern** — `fail()` with stable error codes (see `/api/auth/password` 403 above and `requireUser` `server.js:1216-1219`):

```js
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) { fail(res, 401, 'signInRequired', 'Sign in to continue'); return null; }
  return user;
}
```

D-06/D-58: MASTER_KEY missing → 503 with admin-facing body naming `MASTER_KEY`; client renders generic `err.*`.

---

### `recovery_codes` migration (P-B additive style)

**Analog:** `server.js:167-176` (ensureColumn + SCHEMA block) and invites table shape `server.js:111-127`.

**Pattern** (exact copy shape; add to SCHEMA as `create table if not exists` — the guarded-create makes it a no-op on fresh and existing DBs alike):

```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
```

Schema sketch (RESEARCH; column naming per existing conventions — text ids, integer epochs, FK cascade, named index):

```sql
create table if not exists recovery_codes (
  id         text primary key,
  user_id    text not null references users(id) on delete cascade,
  code_hash  text not null,
  used_at    integer,
  created_at integer not null
);
create index if not exists recovery_codes_user on recovery_codes(user_id);
```

Second-boot byte-identical guarantee: extend `test/migration.test.mjs` pattern.

---

### `src/lib/qr.js` + vendored encoder (utility, transform)

**Analog:** `src/core/utils.js` helper style (pure functions, named exports) — but no true in-repo analog; RESEARCH Pattern 3 is the contract:

```js
import qrcode from './vendor/qrcode.js';   // default export = factory
const qr = qrcode(0, 'M');                 // typeNumber 0 = auto, EC 'M' (D-16)
qr.addData(otpauthUri);
qr.make();
const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: false }); // quiet zone 4
```

`src/lib/vendor/qrcode.js` is a verbatim copy of `qrcode-generator@2.0.4 dist/qrcode.mjs` (license header kept). Never npm-install it — `test/dependencies.test.mjs` guards zero runtime deps (anti-pattern).

---

### `src/core/api.js` tfa methods (client API layer)

**Analog:** `src/core/api.js:233-247` (sessions + changePassword family).

**Pattern** (lines 233-247):

```js
/* Auth-scoped session management (SESS-01/02): /api/auth/* endpoints take no
   workspace slug … no slug guard. */
async sessions() {
  return call('GET', '/api/auth/sessions');
},
async revokeSession(id) {
  return call('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`);
},
```

Apply as:

```js
tfaEnroll: currentPassword => post('/api/auth/tfa/enroll', { currentPassword }),
tfaEnable: code => post('/api/auth/tfa/enable', { code }),
tfaDisable: (currentPassword, code) => post('/api/auth/tfa/disable', { currentPassword, code }),
```

---

### Settings 2FA inline card (component)

**Analog:** `src/pages/settings.js:377-414` — the `password` and `sessions` cases are the two states of D-56.

**Off-state / form pattern** (`case 'password'`, lines 377-388 — inline form, `S.ui.errors` field errors, `data-submit` action, `esc()` everywhere):

```js
case 'password': {
  const e = S.ui.errors;
  return (
    H(t('settings.pw.lead')) +
    `${S.ui.pwDone ? `<div class="alert ok" …>` : ''}<form data-submit="savePassword" class="col" …>
      <div class="field"><label class="label" for="pw-cur">${t('settings.pw.current')}</label>
      <input type="password" class="input ${e.pwCur ? 'is-error' : ''}" id="pw-cur" autocomplete="current-password">
      ${e.pwCur ? `<span class="err">${ic('circle-alert', 12)}${e.pwCur}</span>` : ''}</div> …
```

**On-state / server-ground-truth pattern** (`case 'sessions'`, lines 389-414 — `S.ui.*` populated by a refresh function, `srow()` rows, danger-ghost button):

```js
const rows = S.ui.sessions || [];
return (
  H(t('settings.sessions.lead')) +
  rows.map(s => srow(/* … */)).join('') +
  `<div style="margin-top:16px"><button class="btn btn-danger-ghost" data-a="revokeAll" …>`
);
```

The 2FA card: off → "Add a second step" button → password prompt → QR (via `src/lib/qr.js`) + copyable-secret field + code input, all in place; on → `settings.tfa.on/onDesc` status + turn-off. One-time recovery modal follows the settings inline flow; no new routing (D-56).

**i18n:** retained keys `en.json:1255-1265` (`settings.tfa.lead/on/onDesc/recovery/recoveryDesc/turnOff/scan/appHint/enterCode/verify`) are the copy source; add only new strings (error codes, copy hint, modal bits) EN+FR with count-pin updates in-commit.

---

### Tests

**Analog 1:** `test/password-change.test.mjs:1-38` — integration harness shape (own server + temp DB, no mocks):

```js
import { after, before, test } from 'node:test';
import { login, signup, startServer, withDb } from './helpers/server.mjs';
before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-pwchange-'));
  server = await startServer({ dataDir: tempDir });
});
after(async () => { await server?.stop(); fs.rmSync(tempDir, …); });
```

`test/tfa-enrollment.test.mjs` copies this exactly (signup → login → cookie client → assert on `res.data.code` stable error strings → DB state via `withDb`).

**Analog 2:** `test/migration.test.mjs:1-40` — second-boot idempotency (fixture DB, column snapshots via `pragma table_info`, backup/dir-lifecycle assertions). Extend for the `recovery_codes` table.

**Analog 3:** `test/password-copy-honesty.test.mjs` — honest-copy assertion style if toast copy needs a check.

**Unit tests** (`totp.fixture.test.mjs`): pure `node:test` + `assert/strict`, RFC vectors from RESEARCH Pattern 1 (`755224, 287082, …`; `94287082` etc.) run first — they catch the signed-byte truncation bug (Pitfall 2) immediately.

## Shared Patterns

### Route guard order (every new endpoint)
**Source:** `server.js:1338-1344` (`/api/auth/password`) and 1369-1372 (`sessions/others`)
**Apply to:** enroll / enable / disable
`sameOrigin(req)` check BEFORE body read AND throttle → `requireUser(req, res)` → `tooMany('<prefix>|' + user.id, …)` (user-keyed, D-40) → `readJson` → strict input validation → handler. Stable `fail(res, status, code, message)` codes translated client-side via `err.*` (ERR-01).

### Atomicity via `transaction()`
**Source:** `server.js:779-790` (helper) + `server.js:1356-1370` (usage)
**Apply to:** enable (write columns + recovery rows + clear pending Map) and disable (D-59 teardown: `two_fa_enabled=0`, secret cleared, recovery_codes deleted). Fresh re-select inside the transaction (Pitfall 4 precedent).

### Constant-time comparison + format gates
**Source:** `server.js:203-204` (`timingSafeEqual` in `verifyPassword`) and RESEARCH Pattern 2
**Apply to:** TOTP verify (`/^\d{6}$/` gate first — throws on length mismatch), recovery burn (hash-then-compare fixed-length sha256 hex; normalize once via `normalizeRecoveryCode`).

### In-memory bounded Map with lazy sweep
**Source:** `server.js:1194-1206`
**Apply to:** pending-secret Map (D-46); throttle keys use distinct prefixes within D-11's 5–8/15min band.

### Minimal honest responses
**Source:** `server.js:1371` (`{ ok: true }`, D-37), `server.js:1410` (live counts)
**Apply to:** enable/disable responses; error copy follows honest-copy rule (v1.2); D-06 503 body admin-facing only.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/vendor/qrcode.js` | vendored source | transform | Vendored verbatim per D-15 — no in-repo analog exists or should; copy from unpkg/npm tarball, never hand-roll (Pitfall 19) |
| Server TOTP core (Base32/HOTP) | utility | transform | No crypto algorithm analog beyond hash/scrypt helpers; RESEARCH Pattern 1 (RFC-verified) is the source of truth |

## Metadata

**Analog search scope:** `server.js` (routes/helpers/schema), `src/core/api.js`, `src/pages/settings.js`, `src/core/utils.js`, `src/locales/en.json`, `test/`
**Files scanned:** ~15 (all analogs verified git-tracked via `git ls-files`)
**Pattern extraction date:** 2026-10-27
