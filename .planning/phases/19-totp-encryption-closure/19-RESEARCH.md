# Phase 19: TOTP Encryption Closure - Research

**Researched:** 2026-10-28
**Domain:** Node.js single-file server — SQLite boot migration + crypto decrypt boundary closure (AES-256-GCM TOTP envelope)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-73:** MASTER_KEY missing at boot with plaintext rows → **defer migration**: loud console warning, plaintext rows untouched, normal boot; migration retries next boot when MASTER_KEY exists. (Fail closed at decrypt is the safety net meanwhile.)
- **D-74:** Pre-migration backup failure (`vacuum into`) → **skip migration entirely this boot**, retry next boot. No backup = no mutation. Deliberately stricter than `migrateTenancy`, which logs and proceeds.
- **D-75:** Edge-row rules (all three): skip empty/blank secrets; skip non-empty non-base32 values (log, never wrap garbage into an envelope — they fail closed at decrypt later); skip existing `v1:` rows (this is what makes the second boot byte-identical).
- **D-76:** Migration outcomes surfaced via **console only** (backup path, per-row count summary, deferred/failed rows) — same visibility model as migrateTenancy; no admin UI surface.
- **D-77:** Single outcome wrapper `requireTotpSecret(envelope)` in server.js returning `{ ok, secret }` / `{ ok: false }`; call sites branch on `ok` and fail 503. decryptTotpSecret is called only by the wrapper.
- **D-78:** Proof mechanisms (all three): (a) grep-level test reading server.js as text asserting no `decrypt(x) ?? x` / plaintext-fallback pattern exists; (b) behavioral tests — malformed envelope, non-`v1:` value, missing MASTER_KEY at each call site → 503, and non-2FA login still works; (c) wrapper-exclusivity test — `decryptTotpSecret` referenced only by the wrapper (zero direct call sites).
- **D-79:** Wrapper lives in **server.js** next to MASTER_KEY and the existing encrypt/decrypt pair — single-file app convention; all D-xx decision tags live there. (totp.js stays pure TOTP math.)
- **D-80:** Reuse the single existing `masterKeyMissing` error code at every fail-closed 503 — config-missing and corrupt-envelope are one admin triage path. Zero client changes; error handling already wired on both surfaces.
- **D-81:** Keep the existing per-route body copy verbatim ("MASTER_KEY is not configured — 2FA cannot be verified/enabled until the admin sets it"); corrupt-envelope cases reuse the same strings. Do not unify to the generic disable-route string.
- **D-82:** New `migrateTotpEncryption()` as a sibling of `migrateTenancy()`, following its shape: conditional trigger → wal_checkpoint + `vacuum into` backup → transaction of updates → console summary. Called from the same boot migration sequence. Not folded into migrateTenancy.
- **D-83:** Idempotency via **trigger-gated no-op**: trigger query counts rows where `two_fa_secret is not null and != '' and not like 'v1:%'` — zero rows skips everything including the backup. Second boot produces no backup file and no writes.
- **D-84:** ENC-01 tests extend the existing `test/migration.test.mjs`: plaintext→v1: encrypt, second-boot no-op, backup-failure skip, MASTER_KEY-missing defer, edge-row cases.

### the agent's Discretion
- Exact wrapper/trigger naming, console message wording, test structure within migration.test.mjs — the agent has flexibility; decisions above fix behavior, not prose.

### Deferred Ideas (OUT OF SCOPE)
- None — discussion stayed within phase scope. (Key rotation re-enrollment and DEPLOY.md key-custody runbook remain deferred per REQUIREMENTS.md scoping.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ENC-01 | Boot-time idempotent migration of legacy plaintext `users.two_fa_secret` into the `v1:` envelope, in a transaction, with pre-migration backup, byte-identical second boot | Verified envelope crypto (server.js:235–264), backup recipe (server.js:948–978), bootstrap call site (server.js:937–941), migration test harness conventions |
| ENC-02 | Every `decryptTotpSecret` call site fails closed on malformed/non-`v1:` secret — no plaintext fallback; 503 touches only TOTP-verify/disable endpoints | Verified exactly two decrypt call sites (server.js:1568, 1641), both already returning `masterKey` outcome → 503; wrapper design D-77 and three-mechanism proof D-78 |
</phase_requirements>

## Summary

This is a small, fully-grounded gap-closure phase on the shipped v1.3 auth surface. The envelope machinery is complete and verified: `encryptTotpSecret`/`decryptTotpSecret` at server.js:235–264 implement `v1:<iv>:<tag>:<ct>` AES-256-GCM with a sha256(MASTER_KEY)-derived key, and `decryptTotpSecret` returns `null` on **every** failure mode (missing MASTER_KEY, wrong version, tampered tag, malformed shape) — the decrypt function itself already fails closed; what remains is (1) migrating the legacy plaintext rows at boot and (2) proving via wrapper-exclusivity that no future call site can bypass the null contract.

There are exactly **two** decrypt call sites in the codebase today [VERIFIED: server.js:1568 and server.js:1641 — grep for `decryptTotpSecret` returns only the definition, the two call sites, and comments]. Both are inside `transaction()` blocks and both already map a null decrypt to a `'masterKey'` outcome that becomes `fail(res, 503, 'masterKeyMissing', …)` at server.js:1588 (disable) and server.js:1678 (verify/login). So ENC-02 is largely a *refactor + proof* phase: introduce `requireTotpSecret` (D-77), swap the two call sites onto it, and add the three proof mechanisms (D-78).

The migration (ENC-01) mirrors `migrateTenancy()` (server.js:948–978) but is deliberately stricter per D-74: backup failure skips the migration (migrateTenancy logs and proceeds). The test harness (`test/helpers/server.mjs`) passes arbitrary env through, so MASTER_KEY present/absent scenarios are directly testable; `test/migration.test.mjs` already owns a real legacy-database fixture pattern with `createLegacyDb` and second-boot no-op assertions to extend.

**Primary recommendation:** Implement `migrateTotpEncryption()` as a trigger-gated sibling of `migrateTenancy()` called from `bootstrap()` (server.js:937–941, invoked at server.js:2638), and add `requireTotpSecret` next to the crypto pair; swap the two verified call sites; extend `test/migration.test.mjs` for ENC-01 and add a new grep/behavioral/exclusivity test file for ENC-02 following the `error-codes.test.mjs` source-reading convention.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Boot-time plaintext→envelope migration | API/Backend (server.js boot) | Database/Storage (SQLite rows) | Migration runs in the same process that owns the db and the crypto key; single-file app convention (D-79) |
| Decrypt boundary wrapper | API/Backend (server.js) | — | decryptTotpSecret and MASTER_KEY already live there; totp.js stays pure math |
| Fail-closed 503 responses | API/Backend (route handlers) | Client (existing i18n mapping) | `masterKeyMissing` code is already catalogued in both locales and wired in src/actions/actions.js — zero client changes (D-80) |
| Pre-migration backup | Database/Storage (`vacuum into` under DATA_DIR) | — | Established pattern from migrateTenancy |

## Standard Stack

### Core
No new packages. This phase uses only what is already in the project:

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:crypto | Node built-in | AES-256-GCM envelope — already implemented, do not touch | Zero-dependency project policy (STATE.md: "zero runtime dependencies") |
| better-sqlite3-style sync db (`db.prepare/.run/.exec/.transaction` wrappers) | existing dep | Trigger query, transactional updates, `vacuum into` backup | Existing `migrateTenancy` uses exactly these |
| node:test | Node built-in | Test runner — all 50 test files use it | `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json test script] |

**Installation:** none — no new dependencies. **Package Legitimacy Audit below is trivially clean.**

## Package Legitimacy Audit

No external packages are installed by this phase. No legitimacy gate runs required; no `[SUS]`/`[SLOP]` items. All work is on in-repo code (server.js, test/) using existing dependencies.

## Architecture Patterns

### System Architecture Diagram

```
Boot sequence (server.js:2638 bootstrap())
        │
        ▼
bootstrap() ──► migrateTotpEncryption()   [NEW, D-82 — sibling of migrateTenancy()]
        │
        ├─ trigger query: count rows where two_fa_secret
        │   is not null and != '' and not like 'v1:%'   [D-83]
        │        │
        │        ├─ count == 0 ──► return (no-op: no backup, no writes)  ← second boot
        │        └─ count > 0
        │              │
        │              ├─ MASTER_KEY missing? ──► loud console warning, return  [D-73]
        │              │
        │              ├─ wal_checkpoint(truncate) + vacuum into backup
        │              │        └─ backup fails? ──► console error, return  [D-74: no backup = no mutation]
        │              │
        │              └─ db.transaction(): for each eligible row:
        │                    ├─ blank → skip                       [D-75]
        │                    ├─ non-base32 non-v1: → skip + log    [D-75: never wrap garbage]
        │                    ├─ already v1: (excluded by trigger) → skip
        │                    └─ else → two_fa_secret = encryptTotpSecret(plain)
        │                  console summary (backup path, counts)   [D-76]

Runtime decrypt path (the other half)
        │
        ▼
POST /api/auth/tfa/login (server.js:1597)     POST /api/auth/tfa/disable (server.js:1548)
        │                                             │
        └──────────┬──────────────────────────────────┘
                   ▼
     requireTotpSecret(envelope)   [NEW, D-77 — the ONLY caller of decryptTotpSecret]
        ├─ ok:true  → { ok, secret } → verifyTotpCode (totp.js, pure math)
        └─ ok:false → outcome 'masterKey' → fail(res, 503, 'masterKeyMissing', <per-route copy, D-81>)
                   (inside transaction() — no state mutation committed on failure)
```

### Recommended Project Structure
```
server.js                        # everything: wrapper (near line ~265), migration (near migrateTenancy ~948), call-site swaps (1568, 1641), D-xx tags
test/migration.test.mjs          # extend: ENC-01 migration tests (D-84)
test/totp-encryption.test.mjs    # NEW: ENC-02 grep + behavioral + exclusivity proofs (D-78)
test/helpers/server.mjs          # reused as-is — startServer({ env }) passes MASTER_KEY through [VERIFIED: test/helpers/server.mjs:43–57]
```

### Pattern 1: Trigger-gated boot migration (from migrateTenancy, D-82)
**What:** Count eligible rows first; zero → return before any I/O. This makes the second boot byte-identical with no backup file created (D-83).
**When to use:** The migration body itself.

```js
// Source: server.js:948–978 (migrateTenancy) — the shape to mirror, made stricter per D-74
function migrateTotpEncryption() {
  // D-83: trigger-gated no-op — second boot touches nothing, not even a backup file
  const pending = db.prepare(
    "select count(*) as n from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v1:%'"
  ).get().n;
  if (!pending) return;
  // D-73: defer when the key is absent — retry next boot
  if (!MASTER_KEY) { console.warn('  totp encryption: MASTER_KEY not configured — N plaintext secret(s) left unencrypted, will retry next boot'); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `gr8r-preenvelope-${stamp}.db`);
  try {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    db.exec('pragma wal_checkpoint(truncate)');
    db.exec(`vacuum into '${backup.replaceAll("'", "''")}'`);
    console.log(`  pre-migration backup: ${backup}`);
  } catch (err) {
    // D-74: no backup = no mutation (stricter than migrateTenancy, which proceeds)
    console.error(`  pre-migration backup failed: ${err.message} — skipping totp encryption this boot`);
    return;
  }
  transaction(() => {
    // D-75 edge rules + encrypt per row; console summary (D-76)
  });
}
```
[Verified against server.js:951–960 — the backup recipe lines quoted verbatim from the read: `db.exec('pragma wal_checkpoint(truncate)');` / `db.exec(\`vacuum into '${backup.replaceAll("'", "''")}'\`);`]

### Pattern 2: Outcome wrapper (D-77)
**What:** `requireTotpSecret(envelope)` returns `{ ok, secret }` / `{ ok: false }`; it is the only caller of `decryptTotpSecret`.
**Example:**
```js
/* D-77/D-79: single decrypt boundary — call sites branch on ok and fail 503 (D-80/D-81). */
function requireTotpSecret(envelope) {
  const secret = decryptTotpSecret(envelope);   // already returns null on EVERY failure [server.js:252–264]
  return secret ? { ok: true, secret } : { ok: false };
}
```

### Pattern 3: Grep-level source assertion (existing convention)
**What:** Read server.js as text in a test and assert forbidden patterns absent. `test/error-codes.test.mjs` already does exactly this: `const serverSource = fs.readFileSync(path.join(ROOT, 'server.js'), 'utf8')` [VERIFIED: test/error-codes.test.mjs:13]. Follow it for D-78(a)/(c).

### Anti-Patterns to Avoid
- **Proceeding after backup failure:** migrateTenancy logs-and-proceeds (server.js:958–960); D-74 deliberately breaks symmetry — copy the recipe, NOT the error handling.
- **Wrapping garbage:** a non-base32 plaintext must be left as-is (it already fails closed at decrypt); encrypting it would create a *decryptable* envelope of garbage that then fails `verifyTotpCode` differently (D-75 rationale).
- **Encrypting inside the trigger count:** the trigger query must exclude `v1:` rows, otherwise the "second boot byte-identical" criterion fails and a second backup file appears (D-83).
- **Hand-rolling base32 validation:** the migration's edge-rule check (D-75) should use the same base32 shape the rest of the codebase uses — check how enrollment validates secrets (tfa-enrollment.test.mjs / totp.js) rather than inventing a regex; a permissive `^[A-Z2-7]+=*$`-style check is [ASSUMED] unless matched to existing code.
- **Wrapping the blank/empty rows:** `''` secrets belong to users with 2FA disabled (disable route sets `two_fa_secret = ''` at server.js:1583) — they must be skipped, not encrypted.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Envelope crypto | New encrypt/decrypt code | Existing `encryptTotpSecret`/`decryptTotpSecret` (server.js:235–264) | Already correct, tag-anchored (D-05), GCM auth-tag verified |
| Backup snapshot | `db.copyFile` / manual dump | `pragma wal_checkpoint(truncate)` + `vacuum into` | WAL-consistent, proven pattern at server.js:955–956 |
| Atomic row updates | Loop outside transaction | Existing `transaction(fn)` helper (server.js:844) | All-or-nothing migration; same helper the routes use |
| 503 error plumbing | New error code | Existing `masterKeyMissing` code + `fail()` (server.js:1147) | Already in both locale catalogs and client actions (D-80) |
| Test server booting | Spawning server manually | `startServer({ dataDir, env })` in test/helpers/server.mjs | Env pass-through enables MASTER_KEY present/absent scenarios [VERIFIED: test/helpers/server.mjs:43–57] |

## Runtime State Inventory

Not a rename/refactor of existing identifiers, but the phase does mutate stored data — relevant categories answered explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.two_fa_secret` plaintext rows in production SQLite databases (pre-v1.3 restores) | The migration itself (ENC-01); data mutation, transactional, backed up first |
| Live service config | None — MASTER_KEY is env-var config read at boot [VERIFIED: server.js:72–73 `const MASTER_KEY = String(process.env.MASTER_KEY \|\| '');`]; no external service holds secret copies | None |
| OS-registered state | None — verified: no scheduler/pm2/launchd registration in repo | None |
| Secrets/env vars | `MASTER_KEY` env var — name unchanged this phase | None |
| Build artifacts | None — single-file Node app, no compiled artifacts affected | None |

## Common Pitfalls

### Pitfall 1: Backup file created on second boot
**What goes wrong:** If the trigger query doesn't exclude `v1:` rows (or runs after the MASTER_KEY check in the wrong order), every boot writes a new `gr8r-preenvelope-*.db`, violating "byte-identical no-op" and silently filling DATA_DIR.
**How to avoid:** Trigger count first (D-83 query), return before the stamp/backup code. Test: assert `backups()` (existing helper pattern in migration.test.mjs:31) has zero new entries after a second boot.
**Warning signs:** growing backup file count in data dir.

### Pitfall 2: Order of the D-73 / D-74 / D-83 checks
**What goes wrong:** If MASTER_KEY-missing is checked *after* the backup is taken, a deferred migration still leaves a stray backup file; if the trigger check is last, an empty db still backs up.
**How to avoid:** Sequence: trigger count → MASTER_KEY check → backup → transaction. Each early-return is silent except its console line (D-73 warning, D-74 error).
**Warning signs:** backup file exists on a boot where "deferred" was logged.

### Pitfall 3: Non-2FA login regression
**What goes wrong:** The wrapper swap touches the login challenge route; a bad refactor (e.g., treating a missing `two_fa_secret` for enabled=0 users as corrupt) could 503 normal logins — violating success criterion 3.
**How to avoid:** The verify route (server.js:1597) only reaches decrypt when `user.two_fa_enabled` is true (server.js:1634 check returns 'dead' otherwise). Keep that gating intact. Behavioral test: non-2FA login works with MASTER_KEY unset (D-78b).

### Pitfall 4: `decrypt(x) ?? x` patterns arising in *client* code or future edits
**What goes wrong:** The grep proof (D-78a) covers server.js only; a future contributor adds a fallback elsewhere.
**How to avoid:** The exclusivity test (D-78c) is the durable guard: assert `decryptTotpSecret` appears only at its definition, inside `requireTotpSecret`, and in comments.
**Warning signs:** any test-file diff touching the exclusivity assertions.

### Pitfall 5: utf8/base64 round-trip mismatch in migration
**What goes wrong:** Re-encrypting a value that is already an envelope (double-encryption: encrypt(encrypt(plain))) — the result decrypts to a `v1:...` string that fails `verifyTotpCode`.
**How to avoid:** Trigger query's `not like 'v1:%'` plus per-row re-check inside the transaction (defense in depth).
**Warning signs:** users report all codes rejected after upgrade.

## Code Examples

### Verified call-site shape to preserve (disable route)
```js
// Source: server.js:1562–1589 (verbatim excerpt)
const outcome = transaction(() => {
  const fresh = db.prepare('select password_hash, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
  if (!fresh || !verifyPassword(cur, fresh.password_hash)) return 'password';
  if (/^\d{6}$/.test(code)) {
    const secret = decryptTotpSecret(fresh.two_fa_secret);        // ← becomes requireTotpSecret(fresh.two_fa_secret)
    if (!secret) return 'masterKey';                              // ← becomes if (!wrapped.ok) return 'masterKey';
    if (!verifyTotpCode(secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000)).ok) return 'code';
  }
  /* ...teardown... */
});
if (outcome === 'masterKey') return fail(res, 503, 'masterKeyMissing', 'MASTER_KEY is not configured or the stored secret is undecryptable');
```

### Verified call-site shape to preserve (verify/login route)
```js
// Source: server.js:1641–1645 (verbatim excerpt)
const secret = decryptTotpSecret(user.two_fa_secret);             // ← requireTotpSecret(user.two_fa_secret)
if (!secret) return 'masterKey';
const verified = verifyTotpCode(secret, code, user.two_fa_last_step || null, Math.floor(now() / 1000));
if (!verified.ok) return 'code';
```
The 503 at server.js:1678 uses the verify-route copy `'MASTER_KEY is not configured — 2FA cannot be verified until the admin sets it'` — keep verbatim (D-81).

### decrypt null contract (why the wrapper suffices)
```js
// Source: server.js:252–264 (verbatim excerpt — null on every failure mode)
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Plaintext `two_fa_secret` at rest | `v1:` AES-256-GCM envelope, fail-closed decrypt | v1.3 (shipped) | This phase closes the remaining plaintext rows + proves the boundary |
| `decrypt(x) ?? x` fallback style | Null → `'masterKey'` outcome → 503 | v1.3 (shipped on both routes) | Nothing to fix in behavior, only refactor + lock in |

No deprecated approaches to migrate away from; no external-framework currency concerns (node:crypto GCM is stable API).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The base32 edge-rule check for D-75 can reuse an existing validation shape from totp.js / enrollment code (researcher did not read the enrollment validator this session) | Anti-Patterns / Pattern 1 | Planner may need to read totp.js and the enable route to pick the exact regex; low risk — behavior is fixed by D-75 regardless of regex choice |
| A2 | `gr8r-preenvelope-` backup prefix naming (any distinct prefix works; only `gr8r-premultitenant-` is load-bearing in existing tests) | Pattern 1 | Zero — naming is agent discretion |
| A3 | Legacy fixture `createLegacyDb` can be extended (or the fixture reused with a manual `update users set two_fa_secret`) to plant a plaintext secret for ENC-01 tests | Validation Architecture | If the fixture hard-freezes user rows, tests plant the plaintext via direct `withDb` SQL before boot — still fits the existing pattern |

## Open Questions (RESOLVED)

1. **Which users have plaintext secrets in production?**
   - What we know: any pre-v1.3 database restore; fresh installs have none (enable route only ever writes envelopes since server.js:1536).
   - Recommendation: no blocking decision — the trigger query handles zero-case naturally. No user confirmation needed.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | server + node:test | ✓ | (project-local, existing) | — |
| npm test runner | Validation | ✓ | node --test | — |

No external services, no network dependencies. **Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node built-in) |
| Config file | none — glob-based: `test/*.test.mjs` |
| Quick run command | `node --test test/migration.test.mjs` |
| Full suite command | `npm test` (= `node --test --test-concurrency=2 test/*.test.mjs`) [VERIFIED: package.json scripts] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ENC-01 | plaintext → `v1:` on first boot | integration (real db fixture) | `node --test test/migration.test.mjs` | ✅ extend existing |
| ENC-01 | second boot byte-identical no-op (no backup, no writes) | integration | same | ✅ extend (pattern: migration.test.mjs:365 'a second boot is a no-op') |
| ENC-01 | backup failure → skip migration | integration (inject failure) | same | ❌ Wave 0 addition |
| ENC-01 | MASTER_KEY missing → defer + warn | integration (`startServer({ env: { MASTER_KEY: '' } })`) | same | ❌ Wave 0 addition |
| ENC-01 | edge rows: blank skipped, garbage skipped+logged, `v1:` untouched | unit/integration | same | ❌ Wave 0 addition |
| ENC-02 | no `decrypt(x) ?? x` plaintext fallback in server.js | grep-level source test | `node --test test/totp-encryption.test.mjs` (new) | ❌ Wave 0 |
| ENC-02 | decryptTotpSecret referenced only by wrapper | exclusivity source test | same | ❌ Wave 0 |
| ENC-02 | malformed envelope / non-`v1:` / missing MASTER_KEY at both call sites → 503 | behavioral (startServer + fetch) | same | ❌ Wave 0 |
| ENC-02 | non-2FA login unaffected when decryption cannot proceed | behavioral | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/migration.test.mjs test/totp-encryption.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] ENC-01 test additions in `test/migration.test.mjs` (backup-failure injection, MASTER_KEY defer, edge rows)
- [ ] New `test/totp-encryption.test.mjs` for the three ENC-02 proofs (D-78) — modeled on `test/error-codes.test.mjs` source-reading convention + `startServer` env pass-through

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | TOTP secrets encrypted at rest (this phase's core); fail-closed decrypt prevents auth bypass on 2FA paths |
| V3 Session Management | no | Session minting untouched by this phase |
| V4 Access Control | no | No route authorization changes; only failure-mode handling on existing gated routes |
| V5 Input Validation | yes | D-75 edge-row rules; decrypt already validates `v1:` shape + GCM tag (server.js:255–256, 259) |
| V6 Cryptography | yes | AES-256-GCM via node:crypto — never hand-roll; existing implementation reused, key = sha256(MASTER_KEY) |
| V7 Error handling/Logging | yes | 503 `masterKeyMissing` — generic code, no secret-oracle in responses (D-80); console-only migration summary (D-76) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Plaintext TOTP secret in DB backup leakage | Information Disclosure | ENC-01 envelope migration + pre-migration backup policy (D-74) |
| Missing MASTER_KEY → silent plaintext fallback → 2FA bypass | Spoofing / Elevation | Null-contract decrypt + wrapper + 503 (D-77/D-78); no fallback pattern proven by grep test |
| Tampered envelope (GCM tag) | Tampering | GCM auth-tag verification in decrypt (server.js:259–260) → null → 503 |
| Error-message oracle distinguishing corrupt vs missing key | Information Disclosure | Single `masterKeyMissing` code (D-80) — deliberately conflated triage path |

## Sources

### Primary (HIGH confidence — all read this session)
- `server.js:72–73` — MASTER_KEY definition (verbatim: `const MASTER_KEY = String(process.env.MASTER_KEY || '');`)
- `server.js:231–264` — envelope encrypt/decrypt pair, null-contract, D-05 tag
- `server.js:937–978` — bootstrap() and migrateTenancy() (backup recipe, error handling, call site at 939, bootstrap invoked at 2638)
- `server.js:1548–1591` — disable route: call site 1568, `'masterKey'` outcome → 503 at 1588, teardown sets `two_fa_secret = ''` (1583)
- `server.js:1597–1691` — verify/login route: two_fa_enabled gate 1634, call site 1641, 503 at 1678
- `server.js:844` — `transaction(fn)` helper; `server.js:1147` — `fail()` helper
- `test/migration.test.mjs` — full harness pattern: `createLegacyDb` fixture, `startServer({ dataDir })`, `backups()` helper (line 31), second-boot no-op test (line 365)
- `test/helpers/server.mjs:43–57` — `startServer({ env })` pass-through (MASTER_KEY scenarios testable)
- `test/error-codes.test.mjs:13` — server-source-reading test convention for D-78 grep proofs
- `src/actions/actions.js:2464,2487,2522` + `src/locales/en.json:299`, `fr.json:300` — `masterKeyMissing` already wired client-side (D-80 zero client changes)
- `package.json` — `npm test` script
- `.planning/REQUIREMENTS.md` §ENC, `.planning/phases/19-totp-encryption-closure/19-CONTEXT.md` — locked scope

### Secondary (MEDIUM confidence)
- None needed — all claims grounded in-repo.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all APIs read in source
- Architecture: HIGH — both call sites, boot sequence, and wrapper shape verified line-by-line
- Pitfalls: HIGH — derived from verified code (backup ordering, trigger gating, enable-gate) plus CONTEXT-locked decisions

**Research date:** 2026-10-28
**Valid until:** 2026-11-27 (stable; internal code, no ecosystem movement)
