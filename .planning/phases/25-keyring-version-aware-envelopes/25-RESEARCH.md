# Phase 25: Keyring & Version-Aware Envelopes - Research

**Researched:** 2026-10-31
**Domain:** In-repo crypto envelope evolution (Node `crypto` AES-256-GCM, SQLite boot migration, node:test) — no external packages
**Confidence:** HIGH (all claims verified by reading server.js this session)

## Summary

This phase evolves an existing, heavily-tested envelope format rather than introducing
anything new. The entire relevant surface is ~120 lines of `server.js`: the D-05
wrap/unwrap helpers (lines 264–297), the single decrypt boundary `requireTotpSecret`
(lines 299–307), and the boot migration `migrateTotpEncryption()` (lines 1147–1219).
The one genuinely version-unaware line is the SQL filter at **server.js:1152**:
`... and two_fa_secret not like 'v1:%'` — it treats any non-`v1:` value as plaintext,
so a future `v2:` row would be "re-wrapped" (i.e. the envelope string itself would be
encrypted as if it were a base32 secret, destroying it). KEY-01 fixes exactly that line
plus the in-transaction re-check at **server.js:1197** (`value.startsWith('v1:')`).

KEY-02 adds a two-key keyring: current `MASTER_KEY` + optional `MASTER_KEY_PREVIOUS`,
both sha256-derived (matching the existing D-05 derivation at server.js:271), with the
envelope growing a key-id field: `v2:<key-id>:<iv>:<tag>:<ct>` per D-K4. The v2 path
lives entirely behind `decryptTotpSecret`/`requireTotpSecret` — their signatures and
fail-closed `null` semantics are unchanged, so all four call sites (server.js:1831,
1889, 1962, and the enable path which calls `encryptTotpSecret` at 1785/1793) keep
their existing 503 `masterKeyMissing` handling (SC-4).

Key id per D-K3: first 8 hex chars of sha256(key material) — computed from the **raw
env var string**, not the derived AES key (equivalent output, but pick one and be
consistent; see Pitfall 4). Decrypt of a `v2:` row resolves the id against the keyring
map `{ id → key material }`; no match → `null` → existing fail-closed 503 path (D-K5).

**Primary recommendation:** Land in this order — (1) SC-1 negative-proof test on the
version-aware filter (pure test against a seeded DB with `v2:`/`v3:` rows, runnable
before any v2-writing code exists), (2) keyring + v2 helpers + version dispatch inside
`decryptTotpSecret`, (3) `MASTER_KEY_PREVIOUS` boot validation (D-K2), (4) v2-writing
enable-path switch. Phase 26 consumes the keyring untouched.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-K1:** Exactly two keys: current `MASTER_KEY` + one `MASTER_KEY_PREVIOUS`. No
  open-ended chain, no `_2`/`_3` variables.
- **D-K2:** `MASTER_KEY_PREVIOUS` set but `MASTER_KEY` missing/empty → boot fails
  loudly (fail-closed).
- **D-K3:** Key id = first 8 hex chars of sha256(key material). No new env var.
- **D-K4:** `v2:<key-id>:<iv>:<tag>:<ct>` — pure prefix insertion into the D-05
  layout, same AES-256-GCM.
- **D-K5:** Parser validates key-id strictly as `[0-9a-f]{8}`; non-conforming `v2:`
  rows → existing fail-closed 503 `masterKeyMissing` path (no new error codes).
- **D-K6:** Boot migration filter is version-aware by **generic pattern** — any
  `v<digits>:` prefix is recognized as an envelope, excluded from the plaintext
  re-wrap filter. Not a known-versions list.
- **D-K7:** Boot migration counts and warns about rows with unrecognized version
  prefixes (D-73-style reporting, skip silently never).

### the agent's Discretion (lean guidance recorded)
- Where keyring/decrypt helpers live: beside the D-05 helpers (server.js:264+);
  `requireTotpSecret` remains the single boundary.
- Test file organization for the SC-1 negative proof: new version-aware filter tests
  vs extending existing suites (existing: `test/migration.test.mjs`,
  `test/totp-encryption.test.mjs` are the natural homes).
- Exact boot log wording for D-K7 (match D-73 reporting tone).
- Where `MASTER_KEY_PREVIOUS` validation lives (D-06/D-73 boot area).

### Deferred Ideas (OUT OF SCOPE)
- Rotation / re-wrap logic — Phase 26 (KEY-03/KEY-04).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KEY-01 | Boot migration filter is version-aware — any `v<n>:` envelope never re-wrapped or treated as plaintext; proven by test before any v2 envelope can exist | Fix SQL filter (server.js:1152) + in-txn re-check (server.js:1197) with `v<digits>:` regex/pattern; SC-1 test seeds `v2:`/`v3:` rows and asserts byte-identity after boot |
| KEY-02 | `v2:<key-id>:…` envelope; decrypt resolves key by id through keyring (current + `MASTER_KEY_PREVIOUS`) via `requireTotpSecret`, fail-closed contract unchanged | Keyring map built at boot from sha256-derived ids (D-K3); version dispatch inside `decryptTotpSecret` (server.js:285–297); all call sites untouched |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Version-aware plaintext filter (KEY-01) | Server boot migration (server.js:1147–1219) | — | Pure SQL filter + report; no API surface |
| Keyring construction + validation (D-K1/D-K2) | Server boot env section (near server.js:72–73) | — | Env-derived, computed once before any request |
| v2 envelope wrap/unwrap + version dispatch (KEY-02) | D-05 helper block (server.js:264–297) | — | `requireTotpSecret` stays the single decrypt boundary (D-77/D-79) |
| 503 `masterKeyMissing` behavior | Existing call sites (server.js:1785, 1850, 1908, 1999) | — | Unchanged — SC-4 requires signature/behavior preservation |

## Standard Stack

No new dependencies. Existing, verified in-repo:

| Component | Version/Location | Purpose | Why Standard |
|-----------|------------------|---------|--------------|
| node `crypto` (aes-256-gcm, sha256) | Node built-in | Envelope crypto (unchanged) | D-05 already uses it `[VERIFIED: server.js:271-276]` |
| better-sqlite3 (sync, transaction()) | in-repo | Boot migration transaction | Existing pattern `[VERIFIED: server.js:1186]` |
| node:test + real SQLite harness | `test/*.test.mjs`, `startServer` helper | All tests | Project convention — no mocks `[VERIFIED: test/totp-encryption.test.mjs:92-101]` |

## Code Anchors (verbatim, read this session)

**v1 envelope format** `[VERIFIED: server.js:276]`:
```js
return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
```

**v1 parse guard (to be extended with v2 dispatch)** `[VERIFIED: server.js:288-289]`:
```js
const [v, ivB64, tagB64, ctB64] = String(envelope).split(':');
if (v !== 'v1' || !ivB64 || !tagB64 || !ctB64) return null;
```

**Key derivation** `[VERIFIED: server.js:271,290]`:
```js
const key = crypto.createHash('sha256').update(MASTER_KEY).digest();
```

**requireTotpSecret — signature must NOT change** `[VERIFIED: server.js:304-307]`:
```js
function requireTotpSecret(envelope) {
  const secret = decryptTotpSecret(envelope); // already returns null on EVERY failure
  return secret ? { ok: true, secret } : { ok: false };
}
```

**THE version-unaware lines (KEY-01 targets)** `[VERIFIED: server.js:1152]`:
```js
"select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v1:%'",
```
and the in-transaction re-check `[VERIFIED: server.js:1197]`:
```js
if (value.startsWith('v1:')) {
  alreadyEncrypted++;
  continue;
}
```

**MASTER_KEY declaration site** `[VERIFIED: server.js:72-73]`:
```js
const MASTER_KEY = String(process.env.MASTER_KEY || '');
```

## Architecture Patterns

### System Architecture Diagram

```
env: MASTER_KEY, MASTER_KEY_PREVIOUS
        │
        ▼ (boot, before any request)
[Keyring build]  sha256 → id8  ──►  Map<id8, keyMaterial>
        │                                │
        ▼ (D-K2 validation)              │
  PREVIOUS w/o CURRENT? ── fail boot     │
        │                                │
        ▼                                ▼
[migrateTotpEncryption]          [decryptTotpSecret]
  row prefix?                      ├─ v1:      → decrypt with current key
  ├─ v<digits>:  → SKIP (count,    └─ v2:<id8> → validate [0-9a-f]{8}
  │   warn if version > v2)            │            → keyring lookup
  └─ else        → wrap to v1:        ▼            miss/parse-fail → null
        │                                ▼
        ▼                        [requireTotpSecret]  ← signature unchanged
  boot summary (D-76 style)               │
                                           ▼
                              call sites: enable / login verify /
                              disable / recovery-regen → 503 masterKeyMissing on null
```

### Recommended Shape

```
server.js (single-file server — keep everything there, no new module)
├── const MASTER_KEY_PREVIOUS = String(process.env.MASTER_KEY_PREVIOUS || '')   // near line 73
├── function keyIdFor(material) → sha256(material).hex.slice(0,8)               // D-K3
├── const KEYRING = buildKeyring()                                              // {id8: material}, D-K1
│     └── throws/warns-and-exits per D-K2 at boot
├── encryptTotpSecret(secretB32)        // now writes v2:<id8>:… (or stays v1 for
│     │                                //   legacy until Phase 26 — see Open Question 2)
├── decryptTotpSecret(envelope)         // gains version dispatch: v1 → current key,
│     │                                //   v2:<id8> → KEYRING lookup, strict [0-9a-f]{8}
└── requireTotpSecret(envelope)         // UNTOUCHED
test/
├── migration.test.mjs                  // extend: SC-1 negative proof (v2:/v3: rows survive boot byte-identical)
└── totp-encryption.test.mjs            // extend: v2 round-trip, wrong-key-missing fail-closed, key-id strictness
```

### Pattern 1: Version-aware filter via generic `v<digits>:` recognition (D-K6)

**What:** Replace the `not like 'v1:%'` SQL filter and the `startsWith('v1:')`
re-check with a version-prefix recognizer. SQL has no regex; use a LIKE family that
cannot over-match, or filter in JS after selecting candidates.

**Verified constraint:** the SELECT at server.js:1152 must remain the trigger-gated
no-op query (D-83) — zero eligible rows must mean no backup file and no writes.

Recommended SQL (prefix-family, cannot match a bare base32 secret):
```sql
... and two_fa_secret not like 'v_:%' escape '' and two_fa_secret not like 'v__:%'
```
— but a stricter, self-documenting option is to select all non-empty rows and apply
the JS regex `/^v\d+:/` as the skip predicate in both the filter and the in-transaction
re-check, keeping the SQL simple and the single source of truth in one JS helper:
```js
// Recognized envelope: any version tag. Unrecognized versions get counted + warned (D-K7).
const VERSION_RE = /^v(\d+):/;
```
**When to use:** both the pendingRows filter and the per-row re-check — they must use
the SAME predicate or the defense-in-depth re-check (D-75) drifts from the filter.

### Pattern 2: Keyring map + strict id dispatch (D-K1/D-K3/D-K5)

```js
// D-K1/D-K2: two keys max; fail boot loudly if PREVIOUS exists without CURRENT.
const MASTER_KEY_PREVIOUS = String(process.env.MASTER_KEY_PREVIOUS || '');
const KEYRING = new Map();
if (MASTER_KEY) KEYRING.set(keyIdFor(MASTER_KEY), MASTER_KEY);
if (MASTER_KEY_PREVIOUS) {
  if (!MASTER_KEY) throw new Error('MASTER_KEY_PREVIOUS is set but MASTER_KEY is not — configure the current key before a previous one (fail-closed, D-K2)');
  KEYRING.set(keyIdFor(MASTER_KEY_PREVIOUS), MASTER_KEY_PREVIOUS);
}
// D-K3: fingerprint only — never stored or logged beyond 8 hex chars.
const keyIdFor = (m) => crypto.createHash('sha256').update(m).digest('hex').slice(0, 8);
```

v2 dispatch inside `decryptTotpSecret` (keeps the null-on-every-failure contract):
```js
const parts = String(envelope).split(':');
if (parts[0] === 'v1') { /* existing 4-part path with current key */ }
else if (parts[0] === 'v2') {
  const [, kid, ivB64, tagB64, ctB64] = parts;
  if (!/^[0-9a-f]{8}$/.test(kid || '')) return null;          // D-K5 strictness
  const material = KEYRING.get(kid);
  if (!material) return null;                                  // unknown key → fail closed
  /* decrypt with sha256(material), identical GCM steps to v1 */
}
else return null;
```

### Pattern 3: D-K7 unrecognized-version warning (D-73 tone)

Match the existing reporting shape `[VERIFIED: server.js:1162-1164, 1216-1218]` —
count, then one console.warn line, never silent:
```
  TOTP encryption: N row(s) carry unrecognized secret envelope version(s) (v3:) — left as-is; decryption attempts fail closed.
```

### Anti-Patterns to Avoid
- **Known-versions list (`v1:`,`v2:` only):** violates D-K6; a future `v3:` envelope
  written by a newer server would be re-wrapped/destroyed by an older server's boot.
- **Filter and re-check drifting apart:** the SQL filter and the in-transaction
  `startsWith('v1:')` re-check must share one predicate helper (D-75 defense-in-depth
  only works if both layers agree).
- **Trying/catching around keyring lookup for flow control:** keyring miss is a normal
  `null` return, same as tampered tag — do not introduce a third error shape.
- **Logging key material or full ids of "unknown" keys:** id IS a fingerprint, but
  warn lines should quote only the version tag and row id (match D-73/D-75 tone).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Key fingerprint | custom truncation/encoding scheme | `sha256(material).hex.slice(0,8)` per D-K3 | locked decision; matches existing sha256 derivation |
| Version-prefix match | SQL regex extension / LIKE chains | single JS regex `/^v\d+:/` used by both filter layers | one source of truth; SQL has no portable regex |
| Boot validation of env pairs | scattered per-route checks | boot-time check beside MASTER_KEY read (server.js:72–73) | fail before listening; D-K2 |
| Test server/DB harness | new fixtures | existing `startServer({dataDir, env})` in test/totp-encryption.test.mjs | proven pattern `[VERIFIED: test/totp-encryption.test.mjs:99-101]` |

## Common Pitfalls

### Pitfall 1: Re-wrapping destroys the envelope, silently
**What goes wrong:** the current migration encrypts any non-`v1:` value — a `v2:`
envelope string would be base32-tested, fail (`/^[A-Z2-7]{32}$/` rejects `:`), and hit
the `skippedGarbage` path... but only in the re-check; the **SQL filter** at 1152
would still SELECT it as "pending", causing a spurious backup file and a misleading
"non-base32 skipped" warning on every boot. Worse, if the re-check predicate isn't
updated in lockstep, the envelope gets encrypted-as-plaintext.
**How to avoid:** fix the filter AND the re-check together (same predicate helper);
SC-1 test asserts both no row mutation AND no spurious backup/no-op byte-identity.
**Warning signs:** every-boot "non-base32 skipped" warnings for rows that never change.

### Pitfall 2: Key-id collision between current and previous key
**What goes wrong:** sha256-derived ids are collision-resistant, but if
`MASTER_KEY_PREVIOUS === MASTER_KEY` (operator misconfig) both map entries collapse —
harmless for decrypt but confusing in Phase 26 rotation (zero rows would re-wrap).
**How to avoid:** one-line boot warn when the two ids are identical (not a hard fail —
the effective keyring is still correct). Or document it in Phase 26's runbook.
**Warning signs:** rotation re-wraps 0 rows.

### Pitfall 3: Changing the sha256 derivation input
**What goes wrong:** D-K3 says "first 8 hex chars of sha256(key material)". The D-05
code hashes the key material to get the AES key (`update(MASTER_KEY).digest()` — raw
bytes). If the implementer hashes the **derived AES key** (or hex-digest vs raw) for
ids, ids won't match the runbook procedure Phase 26 documents, and any v2 envelope
written with one derivation fails to decrypt under the other.
**How to avoid:** derive id and AES key from the same single call:
`sha256(material)` → hex digest first 8 chars = id, raw digest bytes = AES key.
**Warning signs:** v2 round-trip passes in unit test but hand-computed runbook id mismatches.

### Pitfall 4: `split(':')` arity vs base64 padding
**What goes wrong:** base64 alphabet contains no `:`, so split is safe — but a 5-part
v2 envelope parsed with the old 4-part destructure silently assigns `ctB64 = tagB64`
only if guards are weak. The existing guard (`v !== 'v1' || !ivB64 || !tagB64 || !ctB64`)
returns null on shape mismatch, which is correct — keep that strictness per-part in v2.
**How to avoid:** validate each of the 5 parts independently; D-K5 already mandates
strict `[0-9a-f]{8}` for the id.
**Warning signs:** corrupt-envelope tests (existing D-78 variants in
totp-encryption.test.mjs) must still all 503.

### Pitfall 5: Enabling v2-writing in the same commit as the filter fix
**What goes wrong:** SC-1 demands the version-aware filter is *proven by test before
any v2-writing code exists*. If `encryptTotpSecret` starts emitting v2 in the same
deploy as the filter fix and the filter is wrong, live rows are corrupted with no
prior test evidence on real data shapes.
**How to avoid:** order tasks: (T1) filter + SC-1 negative tests (no v2 writer),
(T2) keyring + decrypt dispatch + tests, (T3) flip the enable-path writer to v2.
**Warning signs:** plan containing the writer change before the SC-1 test task.

### Pitfall 6: `alreadyEncrypted` counting semantics change
**What goes wrong:** the summary line (server.js:1216–1218) hardcodes "already
encrypted" counting; with version-awareness the same counter must now cover v1/v2/
unrecognized-version rows distinctly (D-K7 requires the unrecognized count).
**How to avoid:** keep one counter per outcome; add an `unrecognizedVersion` counter;
update the summary format in the same task as the filter (tests assert summary text).
**Warning signs:** test/migration.test.mjs summary assertions fail after filter change.

## Runtime State Inventory

Not a rename/migration of identifiers, but the boot migration touches stored data —
relevant inventory:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `users.two_fa_secret` rows: plaintext (base32) or `v1:` envelopes; **v2 rows cannot exist yet** (this phase gates them) | Filter change only — no data migration in this phase |
| Live service config | `MASTER_KEY` env (admin-managed); `MASTER_KEY_PREVIOUS` does not exist yet | New optional env; D-K2 boot validation |
| OS-registered state | None — verified: no scheduler/Task Scheduler/pm2 in repo (plain node server) | None |
| Secrets/env vars | `MASTER_KEY` referenced only at server.js:73 and D-05 helpers; no other env key names change | None |
| Build artifacts | None relevant — single-file server, no build step for this surface | None |

**Phase-plan note (carried from STATE.md):** confirm `users.two_fa_secret` is the only
envelope column — **CONFIRMED this session**: grep across server.js shows
`two_fa_secret` is the only column ever passed to `encryptTotpSecret`/wrapped storage
(envelope writes at server.js:1793 and 1211 target that column alone). Recovery codes
are never encrypted (D-09/D-51 comment at server.js:266–267).

## Code Examples

### SC-1 negative-proof test shape (v2 row survives boot byte-identical)
```js
// test/migration.test.mjs — extend; runs BEFORE any v2-writing code exists
import { startServer } from './helpers/...'; // reuse existing harness
// 1. seed users with two_fa_secret = 'v2:deadbeef:AAA...:BBB...:CCC...' and 'v3:whatever:...'
// 2. boot server with MASTER_KEY set
// 3. assert: rows byte-identical to seed; no *-preenvelope-*.db backup file created;
//    boot log contains the D-K7 unrecognized-version warning line
```

### v2 round-trip with keyring
```js
// test/totp-encryption.test.mjs — extend
// startServer({ env: { MASTER_KEY: 'new-key', MASTER_KEY_PREVIOUS: 'old-key' } })
//   → enroll user (writes v2:<id8(new-key)>:…) → login verify succeeds
// startServer({ env: { MASTER_KEY: 'new-key' } }) with DB rows wrapped by old-key
//   → v2 rows with old key id decrypt to null → 503 masterKeyMissing (fail closed)
// startServer({ env: { MASTER_KEY_PREVIOUS: 'old' } })  → boot fails loudly (D-K2)
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), real SQLite, no mocks |
| Config file | none — suite run via package.json scripts (`npm test`) |
| Quick run command | `node --test test/migration.test.mjs test/totp-encryption.test.mjs` |
| Full suite command | `npm test` (566+ tests green at v1.5 mid-milestone) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KEY-01 | v2:/v3: rows survive boot byte-identical, no re-wrap, no spurious backup, D-K7 warning present | integration (real SQLite boot) | `node --test test/migration.test.mjs` | ✅ extend |
| KEY-01 | Filter and in-txn re-check use same predicate (no double-wrap window) | unit | `node --test test/migration.test.mjs` | ❌ Wave 0 |
| KEY-02 | v2 enroll→login round-trip with current key | integration | `node --test test/totp-encryption.test.mjs` | ✅ extend |
| KEY-02 | v2 row wrapped by previous key decrypts when `MASTER_KEY_PREVIOUS` set | integration | `node --test test/totp-encryption.test.mjs` | ❌ Wave 0 |
| KEY-02 | v2 row with unknown key id / malformed id / corrupt tag → 503 masterKeyMissing, never plaintext | integration | `node --test test/totp-encryption.test.mjs` | ✅ extend (D-78 variant pattern) |
| KEY-02 | `MASTER_KEY_PREVIOUS` without `MASTER_KEY` → boot fails loudly (D-K2) | integration | `node --test test/tfa-login.test.mjs` or new keyring test | ❌ Wave 0 |
| KEY-02 (SC-4) | `requireTotpSecret` signature + 503 copy verbatim unchanged | regression | existing suites: tfa-login, tfa-disable, tfa-enrollment, tfa-recovery-regen | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/migration.test.mjs test/totp-encryption.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] Keyring-validation test block (D-K2 boot failure; id-derivation determinism) — Wave 0 of the keyring task
- [ ] SC-1 test task MUST precede the v2-writer task (ordering constraint, not a missing file)

## Security Domain

`security_enforcement` treated as enabled (config key absent).

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V6 Cryptography | yes | AES-256-GCM via node crypto (unchanged); key via sha256 KDF; **never hand-roll** — this phase adds zero new primitives |
| V5 Input Validation | yes | strict `[0-9a-f]{8}` id validation (D-K5); 5-part envelope shape validation |
| V4 Access Control | no change | decrypt boundary unchanged; routes untouched |
| V2/V3 Auth/Session | no | 2FA flows behaviorally identical (SC-4) |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Envelope re-wrap corruption by older server version | Tampering | D-K6 generic `v\d+:` recognition — forward-compatible |
| Key-id fingerprint disclosure | Information Disclosure | id is a 32-bit fingerprint only; acceptable per D-K3 (locked decision); never log key material |
| Plaintext fallback under decrypt failure | Elevation | existing D-78a no-fallback invariant; all new paths return null → 503 |
| Timing leak on unknown-key vs tampered-tag | Information Disclosure | both return null through the same path; GCM `final()` throw caught identically to v1 |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `MASTER_KEY_PREVIOUS === MASTER_KEY` should warn (not fail) — D-K1/D-K2 don't state it | Pitfall 2 | Cosmetic; Phase 26 runbook can absorb |
| A2 | D-K7 warning counts by version tag per row (aggregate count acceptable) | Pattern 3 | Minor log-format drift vs D-73 tone |
| A3 | Boot failure mechanism for D-K2: `throw` during boot init (server exits) rather than warn-and-continue | Pattern 2 | "fails loudly" satisfied either way; throw is the literal reading |

## Open Questions (RESOLVED)

1. **RESOLVED — enable-path writes v2 in this phase.** Adopted verbatim by Plan 25-02
   Task 3 (writer flip sequenced after the SC-1 proof and the D-K3/D-K4
   checkpoint:decision freeze in 25-02).

2. **RESOLVED — v1 rows always resolve against the current key.** Per D-K4 there is
   no key id in v1; no dispatch change is needed. Documented in Plan 25-02 Task 1
   ("keep the `v1` path byte-for-byte as today").

3. **RESOLVED — keep SQL candidate filter + JS predicate.** Adopted verbatim in
   Plan 25-01 Task 1: broad SQL exclusion that cannot match base32 plaintext,
   then the authoritative `/^v\d+:/` JS predicate per row (D-K6 single
   source of truth, D-83 no-op gate preserved).

## Environment Availability

Step 2.6: SKIPPED — no external dependencies (node built-ins, better-sqlite3 and the
existing test harness only; all already installed and in use).

## Sources

### Primary (HIGH confidence)
- `server.js:264-307` — D-05 helpers, requireTotpSecret (read this session)
- `server.js:1138-1219` — boot migration, D-73/D-74/D-75/D-76 patterns (read this session)
- `server.js:72-73, 1782-1999` — MASTER_KEY declaration, fail-closed call sites (read this session)
- `.planning/phases/25-keyring-version-aware-envelopes/25-CONTEXT.md` — D-K1…D-K7 locked decisions
- `.planning/REQUIREMENTS.md` §KEY-01/KEY-02; `.planning/STATE.md` (plan-time check: single envelope column — confirmed)

### Secondary
- `test/totp-encryption.test.mjs`, `test/migration.test.mjs` — harness + D-78 variant patterns (grepped/read)

## Metadata

**Confidence breakdown:**
- Envelope/keyring design: HIGH — every anchor read in source this session; decisions locked in CONTEXT.md
- Pitfalls: HIGH — derived from the literal filter/re-check code paths
- Test map: HIGH — existing harness verified (startServer with env, real SQLite)

**Research date:** 2026-10-31
**Valid until:** stable — internal codebase, re-verify anchors if server.js envelope block is refactored before planning
