# Phase 19: TOTP Encryption Closure - Pattern Map

**Mapped:** 2026-10-28
**Files analyzed:** 4 (1 modified source, 3 test files: 1 extended, 1 new, 1 reused)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `migrateTotpEncryption()` (new function) | migration | batch (one-time row transform) | `server.js` `migrateTenancy()` (lines 948–978) | exact |
| `server.js` — `requireTotpSecret()` (new function) | service (crypto boundary) | request-response | `server.js` `decryptTotpSecret()` (lines 252–264) + outcome-branch route shape (1562–1590) | exact |
| `server.js` — call-site swaps (lines 1568, 1641) | route | request-response | the call sites themselves (modify in place, preserve outcome shape) | n/a (in-place edit) |
| `test/migration.test.mjs` (extend) | test (integration) | batch | itself — `createLegacyDb` fixture + `backups()` + second-boot pattern (lines 1–50, 365–379) | exact (extend) |
| `test/totp-encryption.test.mjs` (new) | test (grep + behavioral) | transform (source-as-text assertion) | `test/error-codes.test.mjs` (lines 1–40, source-reading convention) | exact |
| `test/helpers/server.mjs` (reused as-is) | test helper | — | none needed | n/a |

All analog paths verified git-tracked via `git ls-files` (server.js, test/migration.test.mjs, test/error-codes.test.mjs, test/helpers/server.mjs).

## Pattern Assignments

### `server.js` — `migrateTotpEncryption()` (migration, batch)

**Analog:** `server.js` `migrateTenancy()` (lines 948–978) — copy the backup recipe, NOT its log-and-proceed error handling (D-74 breaks symmetry deliberately).

**Boot call-site pattern** (lines 937–941) — add `migrateTotpEncryption();` as a sibling call:
```js
function bootstrap(opts) {
  ensureWorkspace();
  migrateTenancy();
  ensureAdmin(opts);
}
```

**Backup recipe to copy verbatim** (lines 951–960 — wal_checkpoint + `vacuum into` with quote-escaping):
```js
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(DATA_DIR, `projects-premultitenant-${stamp}.db`);   // → new prefix e.g. projects-preenvelope-
try {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  db.exec('pragma wal_checkpoint(truncate)');
  db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
  console.log(`  pre-migration backup: ${backup}`);
} catch (err) {
  console.error(`  pre-migration backup failed: ${err.message}`);
  // ← D-74 CHANGES THIS: migrateTenancy proceeds here; migrateTotpEncryption must `return`.
}
```

**Key structural difference from the analog:** migrateTenancy reads rows then conditionally backs up. The new migration must be **trigger-gated first** (D-83), with the order: trigger count → MASTER_KEY check (D-73) → backup (D-74, fail → return) → transaction of updates (D-75) → console summary (D-76). This ordering prevents stray backup files on deferred/empty boots (research Pitfall 2).

**Trigger-gated shape** (per D-83 — zero eligible rows means no backup file and no writes):
```js
const pending = db.prepare(
  "select count(*) as n from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v1:%'"
).get().n;
if (!pending) return;
```

**Crypto to reuse — do not touch** (lines 235–264, D-05 tag; migration calls only `encryptTotpSecret`):
```js
function encryptTotpSecret(secretB32) {
  if (!MASTER_KEY) return null;
  try {
    const key = crypto.createHash('sha256').update(MASTER_KEY).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(secretB32), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  } catch { return null; }
}
```

**D-xx tag convention** (line 71–73 and 231–234) — every new function opens with a block comment carrying its decision tags:
```js
/* D-05: the AES-256 master key material comes from the environment. ... */
const MASTER_KEY = String(process.env.MASTER_KEY || '');    // line 73
```

**Transaction helper** (research-verified at server.js:844): `transaction(fn)` — use for the row-update loop. `fail(res, status, code, msg)` helper at server.js:1147 (used by routes, not migration).

---

### `server.js` — `requireTotpSecret()` (service wrapper, request-response)

**Analog:** sits next to `decryptTotpSecret()` (lines 249–264) and is its ONLY caller (D-77/D-79). The wrapper is trivial because decrypt already fails closed — this excerpt is the null contract the wrapper relies on:

```js
// server.js:252–264 (verbatim)
function decryptTotpSecret(envelope) {
  if (!MASTER_KEY) return null;
  try {
    const [v, ivB64, tagB64, ctB64] = String(envelope).split(':');
    if (v !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null;
    const key = crypto.createHash('sha256').update(MASTER_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
```

**Wrapper shape (D-77):**
```js
/* D-77/D-79: single decrypt boundary — call sites branch on ok and fail 503 (D-80/D-81). */
function requireTotpSecret(envelope) {
  const secret = decryptTotpSecret(envelope);   // already returns null on EVERY failure
  return secret ? { ok: true, secret } : { ok: false };
}
```

**Call-site pattern to preserve — disable route** (lines 1562–1590, current code at 1565–1570 + outcome handling at 1588):
```js
const outcome = transaction(() => {
  const fresh = db.prepare('select password_hash, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
  if (!fresh || !verifyPassword(cur, fresh.password_hash)) return 'password';
  if (/^\d{6}$/.test(code)) {
    const secret = decryptTotpSecret(fresh.two_fa_secret);   // ← swap to: const wrapped = requireTotpSecret(fresh.two_fa_secret); if (!wrapped.ok) return 'masterKey';
    if (!secret) return 'masterKey';
    if (!verifyTotpCode(secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000)).ok) return 'code';
  }
  // ... teardown at 1583: update users set two_fa_enabled = 0, two_fa_secret = '' ...
});
if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');  // line 1588 — keep copy verbatim (D-81)
```

**Call-site pattern to preserve — verify/login route** (lines 1639–1645, 503 at 1678):
```js
if (/^\d{6}$/.test(code.trim())) {
  const secret = decryptTotpSecret(user.two_fa_secret);      // ← requireTotpSecret(user.two_fa_secret)
  if (!secret) return 'masterKey';
  const verified = verifyTotpCode(secret, code, user.two_fa_last_step || null, Math.floor(now() / 1000));
  if (!verified.ok) return 'code';
  db.prepare('update users set two_fa_last_step = ? where id = ?').run(verified.matchedStep, user.id);
}
// ...
if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured — 2FA cannot be verified until the admin sets it');  // line 1678 — keep verbatim (D-81)
```

**Guard to keep intact (Pitfall 3):** the login route reaches decrypt only when `user.two_fa_enabled` is true (line 1634 check returns `'dead'` otherwise). Do not touch that gate — it is what protects non-2FA logins.

**Shared conventions:** both call sites already sit inside `transaction(() => …)` returning a string outcome — the wrapper swap must not change that shape, only the decrypt line. Error code `masterKeyMissing` already catalogued in `src/locales/en.json`/`fr.json` and wired in `src/actions/actions.js` (D-80, zero client changes).

---

### `test/totp-encryption.test.mjs` (new — grep + behavioral proofs, D-78)

**Analog:** `test/error-codes.test.mjs` — the "house extraction pattern": server.js cannot be imported by a test (it boots on load), so static proofs read the source as text.

**Source-reading convention to copy** (lines 1–20):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, ROOT, login, signup, startServer, client, inviteToken } from './helpers/server.mjs';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
```

**Assertion styles to imitate** (lines 33–39):
```js
test('no inline error payload survived the fail() conversion', () => {
  assert.ok(!/json\(res,\s*\d+,\s*\{\s*error:/.test(serverSource), '…');
});
test('the three catch sites transfer err.code …', () => {
  assert.equal((serverSource.match(/code: err\.code/g) || []).length, 3, '…');
});
```

Map to D-78: (a) assert no plaintext-fallback pattern (`decrypt\([^)]*\)\s*\?\?` etc.) in serverSource; (c) exclusivity — count `decryptTotpSecret` occurrences: definition + inside `requireTotpSecret` + comments only, zero route call sites. Behavioral half (D-78b) uses `startServer({ dataDir, env })` — `test/helpers/server.mjs:43–57` passes arbitrary env through, so MASTER_KEY present/absent scenarios are directly testable; malformed-envelope/non-`v1:` rows are planted via `withDb(server.dbPath, db => db.prepare('update users set two_fa_secret = ?')…)` or before boot.

---

### `test/migration.test.mjs` (extend — ENC-01 tests, D-84)

**Analog:** itself. Key harness pieces to reuse:

**Setup pattern** (lines 1–50): `mkdtempSync` dataDir → `createLegacyDb(dataDir)` fixture → capture pre-boot state with `withDb` → `startServer({ dataDir })` → `server.output()` for console-output assertions (`assert.match(output, /pre-migration backup: /)` at line 61).

**Backup counting helper** (line 21):
```js
const backups = () => fs.readdirSync(dataDir).filter(name => name.startsWith(BACKUP_PREFIX) && name.endsWith('.db'));
```
New tests use a distinct prefix constant (e.g. `BACKUP_PREFIX = 'projects-preenvelope-'`); assert zero new backups on second boot (D-83).

**Second-boot no-op pattern** (lines 365–379): snapshot → `server.stop()` → `startServer({ dataDir })` → deepEqual snapshots + `assert.equal(backups.length, 1)` → login still works. ENC-01's "byte-identical second boot" test copies this shape directly.

**Plaintext-row planting (A3):** either extend `createLegacyDb` or plant via direct SQL before boot:
`withDb(path.join(dataDir, 'projects.db'), db => db.prepare("update users set two_fa_secret = ? where id = ?").run('JBSWY3DPEHPK3PXP', 'u_…'))`.

**Base32 edge-rule check (D-75) — use the codebase shape, not an invented regex (resolves research A1):** the only base32 shape in the codebase is the strict enrollment form:
```js
// test/totp.fixture.test.mjs:165 and test/tfa-enrollment.test.mjs:78
assert.match(s, /^[A-Z2-7]{32}$/);
```
The migration's per-row eligibility check should match this (`/^[A-Z2-7]{32}$/`) — 32-char unpadded uppercase Base32 is what `encryptTotpSecret` was always fed. Blank `''` rows (disabled 2FA, set by disable teardown at server.js:1583) must be skipped, not encrypted.

## Shared Patterns

### D-xx decision tags
**Source:** `server.js:231–234, 71–73`
**Apply to:** both new server.js functions and all modified call sites
```js
/* D-05: AES-256-GCM envelope for the TOTP secret at rest — … */
```
New code carries tags D-73…D-82 continuing the inline-comment convention.

### Fail-closed 503 outcome pattern
**Source:** `server.js:1562–1590` (transaction → string outcome → `fail(res, 503, 'masterKeyMissing', …)`)
**Apply to:** both decrypt call sites after the wrapper swap. Per-route body copy stays verbatim (D-81): disable route uses the "or the stored secret is undecryptable" string (line 1588), verify route uses the "cannot be verified" string (line 1678).

### Backup-first migration recipe
**Source:** `server.js:951–956`
**Apply to:** `migrateTotpEncryption()` — with the D-74 stricter catch: `return` instead of proceed.

### Source-as-text static proofs
**Source:** `test/error-codes.test.mjs:13`
**Apply to:** `test/totp-encryption.test.mjs` grep/exclusivity tests.

## No Analog Found

None — every file has an exact in-repo analog. The wrapper `requireTotpSecret` itself is novel but is a 3-line composition of two verified patterns (null-contract decrypt + outcome branch).

## Metadata

**Analog search scope:** repo root (server.js), test/, lib/ (absent — TOTP math confirmed elsewhere), test/helpers/
**Files scanned:** server.js (targeted reads: 68–77, 225–269, 930–984, 1548–1691), test/migration.test.mjs (1–100, 355–380), test/error-codes.test.mjs (1–40), base32 grep across repo
**Pattern extraction date:** 2026-10-28
**Git-tracked gate:** all named analogs verified via `git ls-files`
