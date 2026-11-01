# Phase 25: Keyring & Version-Aware Envelopes - Pattern Map

**Mapped:** 2026-10-31
**Files analyzed:** 5 (3 source regions in server.js + 2 test suites)
**Analogs found:** 5 / 5 — every change target has a direct in-file analog (this phase modifies existing files; no new modules)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — env/keyring block (~line 73) | config | request-response (boot) | `server.js:71-73` (MASTER_KEY declaration) | exact |
| `server.js` — D-05 helpers (264-297) | service (crypto) | transform | same block (extend in place) | exact |
| `server.js` — boot migration `migrateTotpEncryption()` (1147-1219) | migration | batch (SQL + per-row transform) | same function (extend in place) | exact |
| `test/migration.test.mjs` | test (integration) | batch | ENC-01 block (lines 435-499) | exact |
| `test/totp-encryption.test.mjs` | test (integration + static) | request-response | existing D-78 suites + harness | exact |

All analogs verified git-tracked via `git ls-files`. Single-file server — per RESEARCH.md "Recommended Shape", keep everything in `server.js`, no new module.

## Pattern Assignments

### `server.js` — `MASTER_KEY_PREVIOUS` declaration + D-K2 boot validation (config, boot)

**Analog:** `server.js:71-73`

```js
/* D-05: the AES-256 master key material comes from the environment. Missing or
   unusable on the enable path → fail-closed 503 naming MASTER_KEY (D-06/D-58). */
const MASTER_KEY = String(process.env.MASTER_KEY || '');
```

**Pattern to copy:** env read as `String(process.env.X || '')` immediately beside `MASTER_KEY`, with a D-prefixed comment block. D-K2 validation (`PREVIOUS` set without `CURRENT` → loud boot failure) goes right here — before any request can be served, matching the project's fail-before-listen philosophy (research Pattern 2 shows the throw shape).

**Keyring construction (D-K1/D-K2/D-K3)** — research Pattern 2, apply beside line 73:

```js
const keyIdFor = (m) => crypto.createHash('sha256').update(m).digest('hex').slice(0, 8);
const KEYRING = new Map();
if (MASTER_KEY) KEYRING.set(keyIdFor(MASTER_KEY), MASTER_KEY);
if (MASTER_KEY_PREVIOUS) {
  if (!MASTER_KEY) throw new Error('MASTER_KEY_PREVIOUS is set but MASTER_KEY is not — configure the current key before a previous one (fail-closed, D-K2)');
  KEYRING.set(keyIdFor(MASTER_KEY_PREVIOUS), MASTER_KEY_PREVIOUS);
}
```

Note (Pitfall 3): derive id AND AES key from one sha256 call — hex digest first 8 chars = id, raw digest bytes = AES key. Optionally warn (not fail) when both ids collide (`MASTER_KEY_PREVIOUS === MASTER_KEY`).

---

### `server.js` — `encryptTotpSecret` / `decryptTotpSecret` (service, transform)

**Analog:** `server.js:264-297`

**Wrap pattern** (lines 268-280):

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
  } catch {
    return null;
  }
}
```

**Unwrap + guard pattern** (lines 285-297) — v2 dispatch extends exactly this shape:

```js
function decryptTotpSecret(envelope) {
  if (!MASTER_KEY) return null;
  try {
    const [v, ivB64, tagB64, ctB64] = String(envelope).split(':');
    if (v !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null;
    const key = crypto.createHash('sha256').update(MASTER_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
```

**Error handling pattern (copy verbatim):** every failure — missing key, shape mismatch, unknown key id, tampered tag — returns `null` through the same `try`/`catch { return null; }`. No third error shape; no exception-based flow control for keyring miss (research Anti-Patterns).

**v2 additions per D-K4/D-K5** (research Pattern 2):
- Writer emits `v2:<key-id>:<iv>:<tag>:<ct>` (5 parts; base64 contains no `:` so `split(':')` stays safe).
- Dispatch: `v1` → current-key path (unchanged); `v2` → strict `/^[0-9a-f]{8}$/` id validation, `KEYRING.get(kid)`, miss → `null`; anything else → `null`.
- Validate each of the 5 parts independently (Pitfall 4) — keep the per-part falsy-guard strictness.

**Boundary that must NOT change** (lines 299-307):

```js
function requireTotpSecret(envelope) {
  const secret = decryptTotpSecret(envelope); // already returns null on EVERY failure
  return secret ? { ok: true, secret } : { ok: false };
}
```

SC-4: signature, body, and all 3 `const wrapped = requireTotpSecret(` call sites (disable 1831, verify, regen) stay untouched — the static proofs in totp-encryption.test.mjs assert this literally (see test analog below).

---

### `server.js` — `migrateTotpEncryption()` boot migration (migration, batch)

**Analog:** `server.js:1138-1219`

**THE lines KEY-01 fixes:**

```js
// server.js:1152 — SQL filter (currently v1-unaware)
"select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v1:%'",
// server.js:1197 — in-transaction re-check
if (value.startsWith('v1:')) {
  alreadyEncrypted++;
  continue;
}
```

**Ordering is load-bearing (D-83→D-76), copy the sequence exactly:**
1. Trigger-gated `pendingRows()` — zero eligible rows means no backup file and no writes (keep this gate; per research Open Question 3, broaden the SQL exclusion to something that cannot match plaintext, e.g. `not like 'v_:%'`, and apply the authoritative JS regex `/^v\d+:/` per row).
2. D-73 defer: `if (!MASTER_KEY) { console.warn(...); return; }` (lines 1161-1166).
3. D-74 backup: `vacuum into` `projects-preenvelope-<stamp>.db`, failure skips migration (lines 1170-1180).
4. D-75 in-transaction per-row re-check — **must use the SAME predicate helper as the SQL filter** (anti-pattern: filter and re-check drifting apart).
5. D-76 console summary with one counter per outcome (lines 1216-1218).

**Counter pattern** (lines 1182-1218): `migrated / skippedBlank / skippedGarbage / alreadyEncrypted`; add `unrecognizedVersion` (D-K7) in the same task, and update the summary line format — migration tests assert the text.

**D-K7 warning pattern** — match D-73 tone (lines 1162-1164, 1203):

```js
console.warn(`  TOTP encryption: user ${row.id} has a non-base32 two_fa_secret — left as-is; decrypt fails closed (D-75)`);
```

Shape: two-space indent, `TOTP encryption:` prefix, per-row id, outcome + policy reference, `console.warn`. D-K7: `  TOTP encryption: N row(s) carry unrecognized secret envelope version(s) — left as-is; decryption attempts fail closed.` Quote only version tag + row id, never key material or full ids.

**Transaction pattern:** `transaction(() => { rows = pendingRows(); for ... })` (line 1186) — the in-repo better-sqlite3 helper; reuse as-is.

---

### `test/migration.test.mjs` — SC-1 negative proof (test, integration)

**Analog:** ENC-01 block, `test/migration.test.mjs:435-493`

**Harness pattern:**

```js
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-enc-'));
createLegacyDb(dir);
plantSecret(path.join(dir, 'projects.db'), 'u_alice', VALID_B32);
const first = await startServer({ dataDir: dir, env: { MASTER_KEY: ENC_MASTER } });
// assert on stored row + first.output() + backup files
await first.stop();
const second = await startServer({ dataDir: dir, env: { MASTER_KEY: ENC_MASTER } });
// assert byte-identity / no new backups
fs.rmSync(dir, { recursive: true, force: true });
```

**Key fixtures to reuse:**
- `plantSecret(dbPath, id, value)` (lines 448-455) — pre-adds 2FA columns and sets the secret; the seed vehicle for v2:/v3: rows.
- `envBackups(dir)` (line 444) + `ENV_PREFIX = 'projects-preenvelope-'` — asserts no spurious backup (SC-1 requirement).
- `encStored(dbPath, id)` (lines 467-469) — read-back for byte-identity assertions.
- `VALID_B32` (line 442) — the 32-char base32 shape the migration accepts.
- `output()` log-assertion pattern: `assert.match(first.output(), /TOTP encryption: 1 row\(s\) migrated to the v1: envelope/)` (line 483) — use for the D-K7 warning assertion.

**SC-1 test shape** (research Code Examples): seed `'v2:deadbeef:...'` and `'v3:...'` rows → boot with MASTER_KEY → assert rows byte-identical, zero `projects-preenvelope-*.db` files, D-K7 warning present in output. **This test must land before any v2-writing code exists.**

---

### `test/totp-encryption.test.mjs` — keyring/decrypt tests (test, integration + static)

**Analog:** `test/totp-encryption.test.mjs:1-130`

**Static-proof pattern** (lines 16, 34-47) — reads server.js as text (server.js cannot be imported; it boots on load):

```js
const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8');
test('no decryptTotpSecret expression is followed by a nullish or || fallback (D-78a)', () => {
  assert.ok(!/decryptTotpSecret\([^)]*\)\s*\?\?/.test(serverSource), '...');
});
```

Use this house pattern for new structural proofs: v2 dispatch lives only inside `decryptTotpSecret`/`encryptTotpSecret`; `requireTotpSecret` body unchanged (SC-4); the SQL filter and re-check share one predicate helper.

**Behavioral harness pattern** (lines 92-122):

```js
keyServer = await startServer({ dataDir: keyDir, env: { MASTER_KEY: 'projects-enc-suite-key' } });
noKeyServer = await startServer({ dataDir: noKeyDir, env: { MASTER_KEY: undefined } });
```

plus `make2faUser` (lines 115-122): signup, then plant the envelope straight into SQL with `withDb` — proves the decrypt boundary without enrollment. v2 variants (malformed id, unknown id, corrupt tag, previous-key round-trip, D-K2 boot failure) follow the same plant-then-call shape.

**Envelope mirror pattern** (`test/migration.test.mjs:457-465`): test-side `decryptEnvelope(envelope, masterKey)` re-implements the D-05 unwrap with `assert.equal(v, 'v1', ...)` — extend to a v2 mirror asserting the 5-part shape and `[0-9a-f]{8}` id for round-trip verification.

## Shared Patterns

### Fail-closed null semantics
**Source:** `server.js:277-279, 294-296`
**Apply to:** all v2 keyring paths
```js
} catch {
  return null;
}
```
Every failure mode (missing key, unknown key id, bad shape, tampered tag) is `null`; callers already 503 `masterKeyMissing`. No new error codes, no plaintext fallback, no try/catch for flow control on keyring lookup.

### Boot-time env validation
**Source:** `server.js:71-73` + D-73 defer shape (`server.js:1161-1166`)
**Apply to:** `MASTER_KEY_PREVIOUS` (D-K2)
Loud `throw`/exit at boot when PREVIOUS exists without CURRENT; warn (not fail) on identical key ids (research A1).

### Boot reporting (D-73/D-76 tone)
**Source:** `server.js:1162-1164, 1203, 1216-1218`
**Apply to:** D-K7 unrecognized-version warning + updated summary line
`console.warn`/`console.log`, two-space indent, `TOTP encryption:` prefix, counts per outcome, never silent. Update summary format in the same task as the filter change.

### Single predicate source of truth
**Source:** `server.js:1152` + `server.js:1197` (currently two independent v1 checks)
**Apply to:** KEY-01 — one JS helper (`/^v\d+:/`) used by both the SQL candidate filter (broad `not like 'v_:%'` exclusion preserved for the D-83 no-op gate) and the in-transaction re-check.

### Test harness conventions
**Source:** `test/helpers/server.mjs` (`startServer({dataDir, env})`, `withDb`, `server.output()`, `server.dbPath`, `stop()`)
**Apply to:** all new tests — real SQLite, no mocks, mkdtemp dirs owned and removed by the suite, log assertions against `output()`.

## No Analog Found

None — the whole phase surface extends existing patterns in place. The only genuinely new construct is the keyring Map + hash-derived key id, fully specified by locked decisions D-K1–D-K3 and research Pattern 2.

## Metadata

**Analog search scope:** `server.js`, `test/*.mjs`
**Files scanned:** 6 (server.js 4 regions, 2 test suites, helpers import verified)
**Pattern extraction date:** 2026-10-31
