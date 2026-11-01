# Phase 26: Re-Wrap Rotation & Key-Custody Runbook - Pattern Map

**Mapped:** 2026-11-01
**Files analyzed:** 4 (1 modified, 2 created, 1 doc section)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — `migrateTotpReWrap()` + `decryptV1WithMaterial()` helper + `bootstrap()` call | service (boot-time migration) | batch (DB scan → transactional update) | `server.js` `migrateTotpEncryption()` (1243-1356) | exact (D-K15 mandates sibling) |
| `test/totp-rewrap.test.mjs` (new) | test | batch/integration | `test/totp-encryption.test.mjs` | exact |
| `test/totp-rewrap.test.mjs` backup/idempotence assertions | test | batch/integration | `test/migration.test.mjs` | exact (backup-listing pattern) |
| `DEPLOY.md` — "Key custody & rotation" section | documentation | operator runbook | `DEPLOY.md` §5 Configure (env var docs + `openssl rand` precedent) | role-match (no MASTER_KEY docs exist yet) |

## Pattern Assignments

### `server.js` — `migrateTotpReWrap()` (service, batch)

**Analog:** `server.js:1243-1356` — `migrateTotpEncryption()`. D-K15 requires the sibling to mirror this skeleton exactly: trigger gate → backup → transaction with in-txn re-check → console summary.

**Placement:** immediately after `migrateTotpEncryption()` (ends line 1356); call added in `bootstrap()` AFTER `migrateTotpEncryption()` (server.js:1145-1151):

```js
function bootstrap(opts) {
  ensureWorkspace();
  migrateTenancy();
  migrateTotpEncryption();   // plaintext → v1 (unchanged, D-K15)
  migrateTotpReWrap();       // NEW — v1/stale-v2 → v2:<current-id>
  ensureAdmin(opts);
  stampInstanceAdmin();
}
```

**Trigger gate pattern** (copy D-83 shape, server.js:1280-1288 — D-K14):

```js
// server.js:1280-1288 — zero eligible rows → return before anything else
const pendingRows = () =>
  db
    .prepare(
      "select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v_:%'",
    )
    .all()
    .filter(row => !isEnvelopeVersion(row.two_fa_secret));
let rows = pendingRows();
if (rows.length === 0) return;
```

For the re-wrap pass the gate is BOTH keys set, and the SQL prefilter flips: rows ARE envelope-shaped but NOT `v2:<currentId>:%`:

```js
function migrateTotpReWrap() {
  if (!MASTER_KEY || !MASTER_KEY_PREVIOUS) return; // D-K14 gate — Pitfall 7: single-key boots must never scan
  const currentId = keyIdFor(MASTER_KEY);
  const staleCandidates = () =>
    db
      .prepare(
        "select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret like 'v_:%'",
      )
      .all()
      .map(r => ({ ...r, value: String(r.two_fa_secret || '').trim() }))
      .filter(r => isStaleEnvelope(r.value, currentId)); // ONE shared predicate (WR discipline)
  let rows = staleCandidates();
  if (rows.length === 0) { /* D-K12 nudge; return — no backup, no writes */ }
  ...
}
```

**Shared predicate pattern** (WR-01 discipline — copy the "SQL prefilter broad, JS predicate authoritative" comment structure from server.js:1196-1206):

```js
// server.js:1203-1206 — the existing shared envelope predicate; REUSE, never duplicate
const ENVELOPE_VERSION_RE = /^v\d+:/i;
function isEnvelopeVersion(value) {
  return ENVELOPE_VERSION_RE.test(String(value || '').trim());
}
```

New sibling predicate (same shape, one function closed over by scan AND in-txn re-check — Pitfall 3):

```js
// Stale = carries an envelope that is not already v2 under the CURRENT key id.
// Plaintext returns false — it is migrateTotpEncryption's stock, not ours (Pitfall 2).
const isStaleEnvelope = (value, currentId) => {
  const v = String(value || '').trim();
  if (!isEnvelopeVersion(v)) return false;
  const parts = v.split(':');
  return !(parts[0].toLowerCase() === 'v2' && parts[1] === currentId);
};
```

**Backup pattern** (D-74 → D-K16 — copy verbatim, server.js:1300-1313):

```js
// server.js:1302-1313 — backup first; failure skips the pass entirely this boot
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(DATA_DIR, `projects-preenvelope-${stamp}.db`);
try {
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  db.exec('pragma wal_checkpoint(truncate)');
  db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
  console.log(`  pre-migration backup: ${backup}`);
  prunePreenvelopeBackups(backup); // WR-02: bound backup accumulation
} catch (err) {
  console.error(`  TOTP re-wrap skipped: pre-migration backup failed: ${err.message}`);
  return;
}
```

`prunePreenvelopeBackups` (server.js:1216-1232) is reused as-is — its regex `/^projects-preenvelope-.*\.db$/` already covers both passes; no change needed (D-K16, research A2).

**In-transaction re-check pattern** (D-75 — copy structure, server.js:1319-1350):

```js
// server.js:1319-1323 — re-run the SAME query inside the transaction
let migrated = 0; let skippedBlank = 0; let skippedGarbage = 0; let alreadyEncrypted = 0;
transaction(() => {
  // D-75: per-row re-check inside the transaction — defense in depth
  // against double-encryption (research Pitfall 5).
  rows = pendingRows();
  for (const row of rows) { ... }
});
```

The re-wrap loop mirrors this with its own counters (`rewrapped`, `undecryptable`, `sealFailed`, `alreadyCurrent`) and the SAME `staleCandidates()` re-check:

```js
transaction(() => {
  rows = staleCandidates(); // D-75 re-check — same shared predicate
  for (const row of rows) {
    const v = row.value;
    const parts = v.split(':');
    let secret = null;
    if (parts[0].toLowerCase() === 'v1') {
      secret = decryptV1WithMaterial(v, MASTER_KEY) ?? decryptV1WithMaterial(v, MASTER_KEY_PREVIOUS); // D-K8 trial order
    } else {
      secret = decryptTotpSecret(v); // v2 stale-id rows: keyring dispatch already works
    }
    if (secret === null) { undecryptable++; /* D-K9: leave byte-identical, warn, continue */ continue; }
    const envelope = encryptTotpSecret(secret, 'v2'); // D-K10: NEVER re-key as v1
    if (!envelope) { sealFailed++; continue; }
    db.prepare('update users set two_fa_secret = ? where id = ?').run(envelope, row.id);
    rewrapped++;
  }
});
```

**Console summary pattern** (D-76 tone — server.js:1351-1355):

```js
// server.js:1353-1355 — counts only, never key material or ciphertext
console.log(
  `  TOTP encryption: ${migrated} row(s) migrated to the v1: envelope, ${skippedBlank} blank skipped, ${skippedGarbage} non-base32 skipped, ${alreadyEncrypted} already encrypted, ${unrecognizedVersion} unrecognized version(s) left as-is.`,
);
```

Re-wrap summary (same register): `  TOTP re-wrap: N row(s) re-sealed to v2:<id>, N undecryptable left as-is, ...`

**D-K9 warn-line pattern** (copy D-75 garbage warn, server.js:1339):

```js
console.warn(`  TOTP encryption: user ${row.id} has a non-base32 two_fa_secret — left as-is; decrypt fails closed (D-75)`);
```

**v1 decrypt source** (server.js:321-348) — the trial-decrypt helper `decryptV1WithMaterial(envelope, material)` is this body parameterized on key material (research Pattern 3, lean = standalone sibling, zero churn to the D-78c-tested function):

```js
// server.js:325-331 — v1 branch to mirror; swap MASTER_KEY → `material`
if (parts[0] === 'v1') {
  const [, ivB64, tagB64, ctB64] = parts;
  if (!ivB64 || !tagB64 || !ctB64) return null;
  const key = crypto.createHash('sha256').update(MASTER_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
```

**v2 re-seal writer** (server.js:294-310) — `encryptTotpSecret(secret, 'v2')` already targets the CURRENT key id; the pass must not create a second writer (D-K4 frozen format):

```js
// server.js:303-305
if (version === 'v2') {
  return `v2:${key.toString('hex').slice(0, 8)}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}
```

**Keyring primitives** (server.js:73-94) — used as-is:

```js
const MASTER_KEY = String(process.env.MASTER_KEY || '');
const MASTER_KEY_PREVIOUS = String(process.env.MASTER_KEY_PREVIOUS || '');
const keyIdFor = (material) => crypto.createHash('sha256').update(material).digest('hex').slice(0, 8);
const KEYRING = new Map();
```

**Transaction helper** (server.js:1036-1046) — used as-is:

```js
function transaction(fn) {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}
```

**Runtime-writer constraint to respect:** `decryptTotpSecret` call sites are audited by test/totp-encryption.test.mjs:53-60 (exactly 3: definition, `requireTotpSecret`, D-K7 probe). If the re-wrap pass calls `decryptTotpSecret` for stale-v2 rows, that test's `assert.equal(callSites.length, 3)` must be updated to the new count — flag this to the planner.

---

### `test/totp-rewrap.test.mjs` (test, batch/integration)

**Analog:** `test/totp-encryption.test.mjs` — imports, harness, seed helpers.

**Imports + source-text pattern** (lines 10-17):

```js
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ADMIN, ROOT, login, signup, startServer, withDb } from './helpers/server.mjs';

const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
```

**Row planting helpers** (lines 29-31):

```js
const plant = (dbPath, email, value) =>
  withDb(dbPath, db => db.prepare('update users set two_fa_secret = ? where email = ?').run(value, email));
const userRow = (dbPath, email) => withDb(dbPath, db => db.prepare('select * from users where email = ?').get(email));
```

**Key-id + wrapV2 mirrors** (lines 280-312) — copy; add a `wrapV1(secret, material)` sibling (same construction, 4-part `v1:iv:tag:ct` output):

```js
function wrapV2(secret, material) {
  const digest = crypto.createHash('sha256').update(material);
  const key = digest.digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return `v2:${key.toString('hex').slice(0, 8)}:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}
```

**Both-keys boot pattern** (lines 330-341) — the exact seed-boot shape for the rotation suites:

```js
const both = await startServer({ dataDir: dir, env: { MASTER_KEY: CURRENT, MASTER_KEY_PREVIOUS: PREVIOUS } });
// ... signup, plant, enableFor ...
await both.stop();
const currentOnly = await startServer({ dataDir: dir, env: { MASTER_KEY: CURRENT, MASTER_KEY_PREVIOUS: undefined } });
```

**Idempotence pattern (boot twice, same dataDir):** KEY-01 SC-1 precedent in totp-encryption.test.mjs (~533-557) — boot, assert mutation, stop, boot again on the same dataDir, assert no-op. Backup listing pattern from migration.test.mjs:22:

```js
const backups = () => fs.readdirSync(dataDir).filter(name => name.startsWith('projects-preenvelope-') && name.endsWith('.db'));
```

**Fixture teardown pattern** (migration.test.mjs:27-51) — suite owns its tmp dir; `server.output()` captures console for summary/nudge assertions; harness never deletes a caller-supplied dataDir.

**Seed matrix (from research Pattern 5):** v1-under-previous, v1-under-current, v2-under-previous, v2-under-current (byte-identical assert), plaintext (other pass's stock), undecryptable v2 (`v2:zzzzzzzz:...`), blank. Assert per KEY-03/SC-1/SC-2: one backup on rotation boot, none on second; summary counts; D-K12 nudge fires iff PREVIOUS resolves zero rows; post-rotation login verifies with no re-enrollment.

**Runbook-parity test (KEY-04):** unit-test that the `node -e` one-liner's derivation (`sha256(material).hex.slice(0,8)`) equals `keyIdFor` output — mirrors the D-K3 determinism test (totp-encryption.test.mjs:306-312).

---

### `DEPLOY.md` — "Key custody & rotation" section (documentation, operator runbook)

**Analog:** `DEPLOY.md` §5 Configure (lines 130-217) — numbered top-level sections; env vars documented in prose blocks after a dotenv snippet; copy-pasteable shell blocks with `openssl` already established:

```sh
# DEPLOY.md:212-214 — the openssl precedent to follow
openssl rand -base64 24
```

**Placement:** new numbered section after §9 Backups / before or after §10 Updates (planner's call; D-K17 says a "Key custody & rotation" section in the numbered flow). Runbook content per D-K18/D-K19 and research Code Examples:

```bash
# Generate a key (D-K18)
openssl rand -hex 32

# Discover a key's id — mirrors keyIdFor (server.js:81) exactly; reads the key
# from the environment, never argv, so it never appears in `ps` output.
# Use printf-style/stdin-safe invocation — trailing-newline quoting mangling is Pitfall 5.
node -e 'console.log(require("crypto").createHash("sha256").update(process.env.MASTER_KEY).digest("hex").slice(0, 8))'

# D-K13 verification query (substitute <CURRENT_KEY_ID>; expect 0 after a
# completed rotation). Uses `like`, matching the codebase's prefilter convention (Pitfall 6).
sqlite3 /path/to/data/projects.db "select count(*) from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v2:<CURRENT_KEY_ID>:%';"
```

Section outline: (1) key generation + .env/docker-compose injection, (2) adding MASTER_KEY_PREVIOUS alongside MASTER_KEY, (3) running rotation (one boot; expected boot log lines — the existing `  pre-migration backup: …` line then the `  TOTP re-wrap: …` summary; note two backups may appear in one rotation boot, research A2), (4) verifying zero stale envelopes (D-K13 query, expected `0`), (5) removing MASTER_KEY_PREVIOUS and rebooting (D-K11; "rotate one generation at a time" — never hint at key chains), (6) backup-before-rotation note (the preenvelope backup IS the rollback artifact, D-K16), (7) **compromise policy subsection — stark, unmissable, D-K19**: "rotation alone is not sufficient" is the exact KEY-04 phrase — a compromised key must be treated as having exported every secret; all users re-enroll 2FA honestly.

## Shared Patterns

### Fail-closed / no-destructive-mutation
**Source:** server.js:1339 (D-75 warn), server.js:1266-1270 (D-K7 warn) — **Apply to:** re-wrap pass (D-K9: undecryptable rows byte-identical, counted, warned; never deleted)

### Console-only reporting, counts never secrets
**Source:** server.js:1351-1355 (D-76) — **Apply to:** re-wrap summary + D-K12 nudge. Warn lines quote version tags + counts + user ids only; never key material or ciphertext.

### Trigger-gated no-op
**Source:** server.js:1272-1288 (D-83) — **Apply to:** D-K14. Zero candidates → return before backup: no backup file, no writes.

### Shared-predicate discipline (WR-01/WR-02)
**Source:** server.js:1196-1206 + the filter/re-check pairing at 1286/1333 — **Apply to:** `isStaleEnvelope` closed over by scan AND in-transaction re-check. Never two drifted copies.

### Reuse, don't rebuild
`prunePreenvelopeBackups` (1216-1232), `isEnvelopeVersion` (1203-1206), `encryptTotpSecret(x, 'v2')` (294-310), `decryptTotpSecret` (321-349), `keyIdFor`/`KEYRING` (81-89), `transaction` (1036-1046) — all used as-is; the only genuinely new code is `migrateTotpReWrap()` + `decryptV1WithMaterial()`.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `DEPLOY.md` "Key custody & rotation" | documentation | operator procedure | No MASTER_KEY/rotation docs exist anywhere in DEPLOY.md yet — style anchors are §5 (env docs) and §9 (backup procedure); content comes from RESEARCH.md one-liners + D-K17–D-K19 |

## Metadata

**Analog search scope:** `server.js`, `test/`, `DEPLOY.md` (all git-tracked — verified via `git ls-files`)
**Files scanned:** ~8 (4 read in depth)
**Pattern extraction date:** 2026-11-01
