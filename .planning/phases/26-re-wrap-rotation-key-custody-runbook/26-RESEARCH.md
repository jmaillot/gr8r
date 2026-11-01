# Phase 26: Re-Wrap Rotation & Key-Custody Runbook - Research

**Researched:** 2026-11-01
**Domain:** In-process SQLite secret re-wrap at boot; operator runbook documentation
**Confidence:** HIGH (all findings verified against the live codebase this session; no external packages involved)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-K8:** During a rotation boot, each v1 row's sealing key is resolved by trial: decrypt with the CURRENT key first, then MASTER_KEY_PREVIOUS. Handles mixed fleets (v1 rows sealed by the current key via the Phase 25 plaintext migration).
- **D-K9:** Rows that decrypt under NEITHER keyring key are left byte-identical, counted, and warned in the boot summary. Never deleted, never guessed.
- **D-K10:** The re-wrap pass upgrades EVERY old envelope to the v2 format — v1 rows re-sealed as `v2:<new-key-id>:…`. After a completed rotation the fleet is uniformly v2 under one key id. (**one-way** decision)
- **D-K11:** Runbook instructs removing MASTER_KEY_PREVIOUS after a verified rotation boot, then rebooting. Code stays tolerant: PREVIOUS set again later simply means another rotation.
- **D-K12:** Server nudges: a boot with MASTER_KEY_PREVIOUS set but ZERO envelopes resolving under it warns that rotation appears complete and PREVIOUS can be removed (D-73 warning tone).
- **D-K13:** SC-2 verification is a documented SQL count query in the runbook; expected output `0`. The boot summary complements it but is not the verification artifact.
- **D-K14:** The pass runs automatically on EVERY boot when both keys are configured. Zero stale rows → no backup file, no writes, byte-identical no-op (D-83 pattern).
- **D-K15:** `migrateTotpReWrap()` is a SIBLING of `migrateTotpEncryption()` — reusing the D-74 backup → transaction → D-76 summary shape. `migrateTotpEncryption()` is not rewritten.
- **D-K16:** Re-wrap backups use the SAME `projects-preenvelope-*.db` naming and the WR-02 prune cap (newest 5).
- **D-K17:** The runbook is a "Key custody & rotation" section in DEPLOY.md.
- **D-K18:** Every runbook step is copy-pasteable: `openssl rand -hex 32` generation, a `node -e` key-id discovery one-liner (sha256 first 8 hex), docker-compose env snippet, the D-K13 verification query, expected boot log lines.
- **D-K19:** Compromise policy is a short, stark SUBSECTION under the planned-rotation flow: rotation does NOT respond to a compromised key; all users re-enroll 2FA honestly.

### the agent's Discretion (lean guidance recorded)
- Ordering of migrateTotpReWrap() relative to migrateTotpEncryption() (lean: re-wrap after the plaintext pass).
- Test seeding strategy (seed v1-under-previous, v2-under-previous, v2-under-current, undecryptable rows; node:test on real SQLite).
- Exact boot summary/line wording (match D-76/D-K7 reporting tone).
- In-transaction re-check pattern (mirror D-75; shared predicate discipline WR-01/WR-02).

### Deferred Ideas (OUT OF SCOPE)
None.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| KEY-03 | Rotation is a boot-time re-wrap pass (idempotent, transactional, with the pre-migration backup guarantee): with the new key set and the old key still configured, every old-envelope secret is re-wrapped to the new key id; a second boot is a no-op; rotation never requires 2FA re-enrollment | `migrateTotpReWrap()` sibling design mirrors migrateTotpEncryption (server.js:1243-1356); trial-decrypt helper (D-K8); D-K14 trigger gate; D-K16 backup naming/prune; test patterns from test/totp-encryption.test.mjs D-K2/D-K5 suites |
| KEY-04 | DEPLOY.md key-custody runbook: key generation/injection, adding the new key alongside the old, running rotation, verifying zero stale envelopes, backup-before-rotation, compromise policy | DEPLOY.md structure verified (numbered sections; §5 Configure holds env vars; no MASTER_KEY docs exist yet — new "Key custody & rotation" section slots into the numbered flow); copy-pasteable one-liners designed below |
</phase_requirements>

## Summary

This phase is almost entirely code-local: one new function (`migrateTotpReWrap()`) in server.js, one call site in `bootstrap()`, and one documentation section in DEPLOY.md. Every primitive it needs already exists and was verified this session: the keyring (`server.js:80-94`), `encryptTotpSecret(secret, 'v2')` (server.js:294-310), the v2 decrypt branch with keyring dispatch (server.js:333-344), the backup+prune block (server.js:1300-1313, 1216-1232), the shared envelope predicate `isEnvelopeVersion` (server.js:1203-1206), and the transaction helper (server.js:1036-1046). No new packages, no external services, no environment changes.

The one genuine design gap the planner must resolve: **there is no decrypt-with-explicit-key-material path for v1 envelopes.** `decryptTotpSecret()` resolves v1 against the global `MASTER_KEY` only (server.js:328). D-K8's trial-decrypt (current, then previous) needs a helper that accepts raw key material — the natural shape is `decryptTotpSecretWithMaterial(envelope, material)`, either extracted from `decryptTotpSecret` or added beside it. This does NOT violate D-78c exclusivity (requireTotpSecret remains the only runtime decrypt boundary); the Phase 25 D-K7 boot probe already established that boot-time probes are sanctioned non-runtime callers. v2 rows need no new code: decrypt via keyring id already works, and re-sealing through `encryptTotpSecret(x, 'v2')` always targets the current key id.

**Primary recommendation:** Add `migrateTotpReWrap()` after `migrateTotpEncryption()` in `bootstrap()` (server.js:1148), structured as: trigger gate (both keys set) → candidate scan (envelope rows that are not v2-under-current-id) → trial-decrypt (D-K8) → D-74-style backup → transaction with D-75-style re-check → D-76-style summary + D-K12 nudge. Then write the DEPLOY.md runbook per D-K17–D-K19.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Re-wrap pass (v1/stale-v2 → v2-current) | API/Backend (boot, server.js) | Database (users.two_fa_secret rows) | Boot-time migration, same tier as migrateTotpEncryption; no route/UI surface |
| Rotation trigger | API/Backend (boot) | — | Env-var driven (D-K14): no operator flag, no endpoint |
| Unused-PREVIOUS nudge (D-K12) | API/Backend (boot console) | — | Lives in/near the re-wrap pass which knows the zero-resolved count |
| Zero-stale verification (D-K13) | Operator (sqlite3 CLI) | — | Documented SQL query against the deployed DB; not an app surface |
| Key-custody runbook (KEY-04) | Documentation (DEPLOY.md) | — | Single doc, operator-facing |

## Standard Stack

### Core
Nothing new. Everything is already in the project.

| Component | Version | Purpose | Why |
|-----------|---------|---------|-----|
| Node.js crypto (sha256, aes-256-gcm) | node v24.21.0 on this machine | key-id derivation, seal/unseal | already used by encrypt/decryptTotpSecret [VERIFIED: server.js:294-349] |
| better-sqlite3 (via existing `db` handle) | existing | row scan + transactional updates | same as migrateTotpEncryption [VERIFIED: server.js:1254-1348] |
| node:test + test/helpers/server.mjs | existing | boot-a-real-server suites on real SQLite files | project convention (test/totp-encryption.test.mjs, test/migration.test.mjs) [VERIFIED: test dirs] |
| openssl rand -hex 32 | any (runbook) | key generation | D-K18 mandated wording |

**Package Legitimacy Audit:** N/A — this phase installs zero external packages. No gate run required.

## Architecture Patterns

### System Architecture Diagram

```
Operator                    Boot (server.js bootstrap)                 SQLite
────────                    ───────────────────────────                ──────
set MASTER_KEY (new)        bootstrap()                                users.two_fa_secret
set MASTER_KEY_PREVIOUS  ┌▶ migrateTotpEncryption()  ─ plaintext→v1 ─▶  v1 rows (current key)
(old key)                │  [unchanged, D-K15]                            (mixed: some v1
                         │                                                sealed by OLD key
                         └▶ migrateTotpReWrap()  ◀── this phase            from pre-25 fleet)
                            1. gate: both keys configured? no → return (D-K14)
                            2. scan: envelope rows NOT v2-under-current-id
                            3. zero candidates? → D-K12 nudge if PREVIOUS
                               resolves nothing → return, no backup
                            4. trial-decrypt each (D-K8): CURRENT → PREVIOUS
                               ├─ decrypts → re-seal v2:<new-id> (D-K10)
                               └─ neither key → leave byte-identical, count, warn (D-K9)
                            5. backup projects-preenvelope-<ts>.db (D-K74/D-K16)
                               + prunePreenvelopeBackups (WR-02 cap 5)
                            6. transaction(re-check same predicate → update)
                            7. console summary (D-76 tone)

Operator (post-rotation)    sqlite3 CLI (D-K13 query) → expect 0
remove MASTER_KEY_PREVIOUS  reboot → keyring converges to one key (D-K11/D-K1)
```

### Recommended placement

```
server.js
├── keyring constants (74-94)          # unchanged
├── encryptTotpSecret (294-310)        # unchanged — the only writer the pass needs
├── decryptTotpSecret (321-349)        # unchanged contract; may gain a with-material sibling
├── migrateTotpEncryption (1243-1356)  # unchanged (D-K15)
├── migrateTotpReWrap()  ← NEW         # beside migrateTotpEncryption, D-K15
└── bootstrap() (1145-1151)            # add migrateTotpReWrap() AFTER migrateTotpEncryption()
```

### Pattern 1: The sibling-migration shape (D-82/D-83 → D-K15)

The pass must copy the exact skeleton of migrateTotpEncryption [VERIFIED: server.js:1243-1356]:

1. **Trigger gate first** (D-83 analog, D-K14): the cheap check that makes zero-work boots byte-identical no-ops must run before anything else.
2. **Backup = no mutation guarantee** (D-74 analog): backup failure skips the pass this boot entirely — stricter than migrateTenancy, deliberately [VERIFIED: server.js:1300-1313 comment].
3. **In-transaction re-check with the SAME predicate** (D-75, WR-01/WR-02 discipline): the candidate filter and the per-row re-check must call one shared function — never two drifted copies.
4. **Console-only summary** (D-76 tone): counts, never key material or ciphertext.

### Pattern 2: The stale-row predicate (the shared predicate for WR discipline)

The eligibility predicate, used by BOTH the scan and the in-transaction re-check:

```js
// A row needs re-wrapping iff it carries an envelope that is not already
// v2 sealed under the CURRENT key id. (Stale = v1:*, or v2:<other-id>:*.)
const isStaleEnvelope = (value, currentId) => {
  const v = String(value || '').trim();
  if (!isEnvelopeVersion(v)) return false;          // plaintext → migrateTotpEncryption's stock, not ours
  const parts = v.split(':');
  return !(parts[0].toLowerCase() === 'v2' && parts[1] === currentId);
};
```

Key subtlety: the D-K13/D-K9 "undecryptable" rows ARE part of the candidate set by this predicate (a `v2:zzzzzzzz:…` row is stale-shaped), but they fail trial-decrypt and are therefore counted/warned and left byte-identical (D-K9). The predicate decides *candidates*; trial-decrypt decides *mutations*. This is exactly how D-75 separates blanks/garbage from wrappable rows.

Note on case: `ENVELOPE_VERSION_RE` is case-insensitive (`/^v\d+:/i` [VERIFIED: server.js:1203]) because SQLite `LIKE` prefilter is case-insensitive (WR-01 rationale, server.js:1196-1206 comment). The re-wrap predicate should lowercase the version tag before comparing, or v2 rows written as `V2:` would be seen as stale forever. In practice all writers emit lowercase, but the predicate should not assume it.

### Pattern 3: Trial-decrypt with explicit material (D-K8)

```js
// Mirror of the v1 branch of decryptTotpSecret, parameterized on material —
// the ONLY way to resolve a v1 envelope sealed by the PREVIOUS key, since
// decryptTotpSecret hard-binds v1 to the global MASTER_KEY (server.js:328).
function decryptV1WithMaterial(envelope, material) {
  try {
    const [, ivB64, tagB64, ctB64] = String(envelope).split(':');
    if (!ivB64 || !tagB64 || !ctB64) return null;
    const key = crypto.createHash('sha256').update(material).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
```

Trial order per D-K8: current first (`decryptV1WithMaterial(v1row, MASTER_KEY)`), then `MASTER_KEY_PREVIOUS`. For stale v2 rows the existing `decryptTotpSecret` already does keyring dispatch — no new code needed there. Decision for the planner: either (a) extract/parameterize the v1 branch of `decryptTotpSecret` so both share one body (DRY, but touches a D-78c-tested function), or (b) add the standalone helper above (zero churn to tested code, small duplication). Lean: **(b)** — the duplication is ~10 lines and keeps `decryptTotpSecret`'s proven contract untouched; test/totp-encryption.test.mjs asserts on its exact failure shapes.

Also verify the re-sealed secret re-validates: re-wrap goes envelope → plaintext b32 → `encryptTotpSecret(plaintext, 'v2')`. If `encryptTotpSecret` returns null (should be impossible with MASTER_KEY set — D-K2 guarantees CURRENT exists whenever PREVIOUS does), the row is skipped and counted, never lost.

### Pattern 4: Backup + prune reuse (D-K16)

Copy verbatim from migrateTotpEncryption's D-74 block [VERIFIED: server.js:1302-1313]: `pragma wal_checkpoint(truncate)` → `vacuum into '<escaped>'` → `prunePreenvelopeBackups(backup)`. `prunePreenvelopeBackups` (server.js:1217-1232) already filters on the shared `projects-preenvelope-` prefix and keeps the newest 5 across BOTH passes — no change needed. **Pitfall:** during a rotation boot, BOTH passes can mint a backup in the same boot (plaintext pass + re-wrap pass each take their own). That is fine (each is independently the rollback artifact for its own mutation) but the runbook should mention two backup lines may appear in one rotation boot's log.

### Pattern 5: Test seeding on real SQLite

Established conventions to reuse [VERIFIED: test/totp-encryption.test.mjs:286, 314-341, 364-366, 385-402 and test/migration.test.mjs:1-56]:
- `startServer({ dataDir, env: { MASTER_KEY, MASTER_KEY_PREVIOUS } })` — the harness already forwards both env vars (D-K2 suite at totp-encryption.test.mjs:314-341 boots with both).
- Envelope mirroring for seeds: local `wrapV2(secret, material)` helper producing `v2:<sha256-first-8>:…` (totp-encryption.test.mjs:286) and `idOf(material)` for key ids. A `wrapV1(secret, material)` mirror (v1 shape with a chosen material) is needed for v1-under-previous seeds — same construction, `v1:iv:tag:ct` layout.
- `withDb(dbPath, db => …)` for direct row planting/inspection (migration.test.mjs:34-38).
- Boot twice on the same dataDir for idempotence assertions (KEY-01 SC-1 suite, totp-encryption.test.mjs:533-557 — exact precedent).

Seed matrix per the discretion note: v1-under-previous, v1-under-current (the Phase 25 mixed-fleet case that forces D-K8), v2-under-previous, v2-under-current (must stay byte-identical), plaintext (goes through the OTHER pass — proves sibling cooperation), undecryptable v2 (unknown id → counted, byte-identical, D-K9), and blank/non-b32 rows for safety. Assert: one backup on first rotation boot, none on second; summary line counts; D-K12 nudge fires when PREVIOUS resolves zero rows; row values decrypt to the original plaintext via `requireTotpSecret` semantics after rotation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Backup file creation/pruning | custom snapshot logic | copy D-74 block + `prunePreenvelopeBackups` (server.js:1300-1313, 1216-1232) | wal_checkpoint + vacuum-into is the proven-consistent snapshot method; prune cap already shared |
| v2 re-sealing | a new crypto writer | `encryptTotpSecret(x, 'v2')` | D-K4 froze the format; a second writer invites drift |
| v2 decrypt under old id | manual key lookup in the pass | `decryptTotpSecret` (keyring dispatch, server.js:333-344) | already handles strict id validation + fail-closed nulls |
| Envelope recognition | a new version list | `isEnvelopeVersion` (WR-01 shared predicate, server.js:1203-1206) | filter/re-check must not drift (WR-01/WR-02 discipline) |
| Key id derivation in runbook | operator guesswork | the D-K18 `node -e` one-liner mirroring `keyIdFor` (server.js:81) | ids must match byte-for-byte or v2 rows resolve to unknown ids |
| Boot sequencing | a new orchestrator | `bootstrap()` (server.js:1145-1151) | one-line insertion is the established migration pattern |

## Common Pitfalls

### Pitfall 1: v1 rows sealed by the PREVIOUS key look undecryptable to the current code
**What goes wrong:** `decryptTotpSecret` binds v1 to the global MASTER_KEY (server.js:328). During rotation, pre-Phase-25-fleet v1 rows sealed by the old key decrypt to null — a naive pass would count them as D-K9 undecryptable and never rotate them, silently leaving the fleet mixed forever.
**Why it happens:** v1 has no key id; only the trial (D-K8) distinguishes "sealed by old key" from "sealed by garbage".
**How to avoid:** the trial-decrypt helper (Pattern 3); test v1-under-previous explicitly.
**Warning signs:** after a rotation boot the summary reports undecryptable counts equal to the pre-rotation v1 row count.

### Pitfall 2: Re-wrap pass stealing plaintext rows from migrateTotpEncryption
**What goes wrong:** if `migrateTotpReWrap()` ran BEFORE the plaintext pass, or its predicate treated plaintext as stale, plaintext rows would be double-handled or wrapped under the wrong regime.
**How to avoid:** the predicate returns false for anything `isEnvelopeVersion` rejects (plaintext is the other pass's stock); call order in `bootstrap()` is plaintext pass → re-wrap pass, so a rotation boot converts same-boot-fresh v1 rows too and SC-1's "one boot re-wraps" holds for a fleet that was also carrying plaintext [VERIFIED: bootstrap order at server.js:1145-1151].
**Warning signs:** boot logs show v1-migration counts nonzero on the boot AFTER rotation completed.

### Pitfall 3: Predicate drift between scan and in-transaction re-check
**What goes wrong:** the exact WR-01/WR-02 failure mode — a row admitted by the scan but rejected (or re-processed) by the re-check produces double-encryption or backup churn every boot.
**How to avoid:** ONE shared `isStaleEnvelope(value, currentId)` closed over by both; the re-check re-runs the same DB query inside the transaction (D-75 pattern, server.js:1319-1323).
**Warning signs:** second rotation boot mints another backup file.

### Pitfall 4: D-K12 nudge misfiring mid-rotation
**What goes wrong:** the nudge ("rotation appears complete, remove PREVIOUS") firing on a boot where rotation genuinely still has work would confuse operators; the inverse (never firing) lets the variable live forever.
**How to avoid:** the nudge condition is precise: PREVIOUS configured AND zero envelopes resolve under it (no v1-any, no v2-under-previous-id, no stale anything). The re-wrap pass naturally computes this count before deciding to back up. Note: on a healthy completed-rotation boot the candidate set is empty so no backup is minted — the nudge is the ONLY output.
**Warning signs:** nudge appears on a boot whose log also shows a fresh preenvelope backup.

### Pitfall 5: Runbook key-id one-liner diverging from `keyIdFor`
**What goes wrong:** operator computes the id differently (different hash input encoding, uppercase hex, first-8-of-different-call) and the D-K13 verification query matches nothing / matches wrong rows; worse, a runbook "discovery" that doesn't mirror keyIdFor invites hand-rolled envelope surgery.
**How to avoid:** the one-liner must be literally `sha256(raw material) → hex → first 8, lowercase` [VERIFIED: server.js:81]. Prefer reading the key from an env var or stdin, never a shell argv (argv is visible in `ps` to other local users — real custody concern for the runbook).
**Warning signs:** runbook examples show `echo <key> | node -e …` with quoting that mangles trailing newlines — pin the exact invocation (`printf %s` not `echo`, or read from the .env var) in the runbook.

### Pitfall 6: LIKE-based verification query case sensitivity
**What goes wrong:** SQLite `LIKE` is case-insensitive for ASCII, so `not like 'v2:<id>:%'` is fine, but a query built with `glob` or `substr`+`=` instead would miss `V2:`-cased rows and report a false 0.
**How to avoid:** use `like` in the D-K13 query (matching the codebase's prefilter convention); document that all server writers emit lowercase so this is belt-and-braces.
**Warning signs:** none visible if wrong — hence the query must be copied, not retyped (D-K18 copy-pasteable requirement).

### Pitfall 7: Forgetting MASTER_KEY_PREVIOUS unset ⇒ pass must not run
**What goes wrong:** running the pass with only MASTER_KEY would try to trial-decrypt v1-under-previous and dump every such row into the D-K9 warn bucket every boot — permanent noise.
**How to avoid:** D-K14's gate is BOTH keys configured; single-key boots return before any scan. (D-K2 already guarantees PREVIOUS-without-CURRENT never boots.)
**Warning signs:** D-K9 warnings appearing on boots without rotation in progress.

## Code Examples

### The pass skeleton (mirrors server.js:1243-1356 exactly)

```js
// Source: server.js migrateTotpEncryption (D-82/D-83/D-74/D-75/D-76 shape), D-K14..D-K16
function migrateTotpReWrap() {
  if (!MASTER_KEY || !MASTER_KEY_PREVIOUS) return;          // D-K14 trigger gate
  const currentId = keyIdFor(MASTER_KEY);
  const staleCandidates = () =>
    db.prepare(
      "select id, two_fa_secret from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret like 'v_:%'",
    ).all()
     .map(r => ({ ...r, value: String(r.two_fa_secret).trim() }))
     .filter(r => isStaleEnvelope(r.value, currentId));      // ONE shared predicate
  let rows = staleCandidates();
  if (rows.length === 0) {
    // D-K12: nudge when PREVIOUS resolves nothing — computed here where the
    // zero count is already known.
    const resolvesUnderPrevious = db.prepare(...).all().some(/* v1 trial-decrypt or v2 id match */);
    if (!resolvesUnderPrevious) console.warn('  TOTP re-wrap: rotation appears complete — MASTER_KEY_PREVIOUS resolves no envelopes and can be removed (D-K12).');
    return;                                                   // no backup, no writes
  }
  // D-74 analog: backup or skip the pass entirely (D-K16 naming + WR-02 prune)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(DATA_DIR, `projects-preenvelope-${stamp}.db`);
  /* ... verbatim copy of server.js:1304-1313 ... */
  let rewrapped = 0, undecryptable = 0, sealFailed = 0, alreadyCurrent = 0;
  transaction(() => {
    rows = staleCandidates();                                 // D-75 re-check, same predicate
    for (const row of rows) {
      const v = row.value;
      const parts = v.split(':');
      let secret = null;
      if (parts[0].toLowerCase() === 'v1') {
        secret = decryptV1WithMaterial(v, MASTER_KEY) ?? decryptV1WithMaterial(v, MASTER_KEY_PREVIOUS); // D-K8
      } else {
        secret = decryptTotpSecret(v);                        // v2: keyring dispatch already handles stale ids
      }
      if (secret === null) { undecryptable++;                 // D-K9: leave byte-identical
        console.warn(`  TOTP re-wrap: user ${row.id} carries an envelope that decrypts under neither keyring key — left as-is; decrypt fails closed (D-K9)`);
        continue; }
      const envelope = encryptTotpSecret(secret, 'v2');       // D-K10: v1 rows become v2, never re-keyed v1
      if (!envelope) { sealFailed++; continue; }
      db.prepare('update users set two_fa_secret = ? where id = ?').run(envelope, row.id);
      rewrapped++;
    }
  });
  console.log(`  TOTP re-wrap: ${rewrapped} row(s) re-sealed to v2:${currentId}, ${undecryptable} undecryptable left as-is, ${sealFailed} seal failures, ${alreadyCurrent} already current.`); // D-76 tone
}
```

### Runbook one-liners (D-K18)

```bash
# Generate a key
openssl rand -hex 32

# Discover a key's id (mirrors keyIdFor — server.js:81 — exactly; reads the key
# from the environment, never argv, so it never appears in `ps` output)
node -e 'console.log(require("crypto").createHash("sha256").update(process.env.MASTER_KEY).digest("hex").slice(0, 8))'

# D-K13 verification query (substitute <CURRENT_KEY_ID>; expect 0 after a
# completed rotation — stricter than D-K13's minimum since it also counts
# undecryptable rows, which is the safe direction)
sqlite3 /path/to/data/projects.db "select count(*) from users where two_fa_secret is not null and two_fa_secret != '' and two_fa_secret not like 'v2:<CURRENT_KEY_ID>:%';"

# docker-compose env injection (rotation window: both keys present)
#   environment:
#     MASTER_KEY: <new-key>
#     MASTER_KEY_PREVIOUS: <old-key>
```

Expected boot log lines during a rotation boot (D-K18): the existing `pre-migration backup:` line style, then the re-wrap summary line; after cleanup, a boot with only MASTER_KEY shows neither pass firing.

## State of the Art

Not applicable — internal pattern continuation, no library landscape. The only SOTA note: the two-key ring with explicit PREVIOUS (D-K1) is a deliberate simplification over chained keyrings (`_2`, `_3` vars explicitly do not exist, server.js:74-79 comment) — the runbook must NOT hint at multi-generation chains; "rotate one generation at a time" is the documented policy.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The test harness `startServer` forwards arbitrary `MASTER_KEY_PREVIOUS` through `env` — strongly implied by totp-encryption.test.mjs:325-333 boots with both keys, but the helper file itself was not opened this session | Test seeding | Tests would need an env-plumbing tweak in the helper (small, discoverable at Wave 0) |
| A2 | Both passes minting a backup in the same rotation boot is acceptable under WR-02 (cap is per-prefix, not per-pass) — read from prunePreenvelopeBackups source, which filters purely on prefix + mtime [VERIFIED: server.js:1217-1232] | Pattern 4 | Only cosmetic (extra retained backup); no correctness risk |
| A3 | D-K13's "nor decryptable under any keyring key" disjunct cannot be expressed in pure SQL; the runbook query given (not-like-v2-current-id) is stricter and expected-0-safe. CONTEXT.md does not prescribe the exact query text | Code Examples (D-K13) | Runbook query wording may need the discuss owner's glance during verify-work |
| A4 | sqlite3 CLI is the operator's natural tool for the verification query — DEPLOY.md's backup/restore sections already assume direct DB file access | Runbook | If the operator environment lacks sqlite3, the query could alternatively run via `docker compose exec` node one-liner; planner may include both |

## Open Questions

1. **decrypt helper shape: extract vs. duplicate** — Pulling the v1 branch out of `decryptTotpSecret` into a shared `decryptV1WithMaterial` is DRY but touches a function whose failure shapes are asserted by test/totp-encryption.test.mjs; a standalone sibling duplicates ~10 lines.
   - What we know: both are safe; D-78c exclusivity applies to runtime decrypt boundary either way.
   - Recommendation: standalone sibling (lean, zero churn to proven code). Planner's call per the discretion grant.

2. **D-K12 detection scope** — "zero envelopes resolving under PREVIOUS" technically requires trial-decrypting v1 rows on EVERY both-keys boot, even when the candidate set is empty (a v1 row could exist that resolves under current). Cheap (few rows), but the nudge condition should be specified precisely in the plan: nudge iff PREVIOUS set AND no row is v1-decryptable-under-either AND no row is v2-under-previous-id.
   - Recommendation: compute during the existing scan; no extra pass.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies beyond the project's own runtime (node v24.21.0 [VERIFIED this session], better-sqlite3 already installed, node:test harness in place). The runbook references `openssl` and `sqlite3` as *operator* tools, which are deployment-host concerns documented in DEPLOY.md's existing Docker workflow, not build-time dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), node v24.21.0 |
| Config file | none — suites run via `node --test` |
| Quick run command | `node --test test/totp-rewrap.test.mjs` (new suite) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| KEY-03 | One-boot re-wrap of v1-under-previous + v1-under-current + v2-under-previous → all v2-under-current | integration (real SQLite, real boot) | `node --test test/totp-rewrap.test.mjs` | ❌ Wave 0 |
| KEY-03 | Second boot is byte-identical no-op: zero rows changed, no backup file | integration | same | ❌ Wave 0 |
| KEY-03 | Backup guarantee: backup exists before mutation; backup failure ⇒ no rows changed | integration | same | ❌ Wave 0 |
| KEY-03 | D-K9: undecryptable rows byte-identical + counted + warned | integration | same | ❌ Wave 0 |
| KEY-03 | D-K12: nudge fires when PREVIOUS resolves zero envelopes; absent when it resolves some | integration | same | ❌ Wave 0 |
| KEY-03 | 2FA login still works after rotation (no re-enrollment) — extend existing tfa-login or totp-encryption suite | integration | `node --test test/totp-encryption.test.mjs test/tfa-login.test.mjs` | ✅ (extension) |
| KEY-04 | Runbook one-liners match server behavior: keyIdFor one-liner output == keyIdFor(key); D-K13 query returns 0 on a converged fixture DB | unit/smoke | `node --test test/totp-rewrap.test.mjs` (keyIdFor parity test) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test test/totp-rewrap.test.mjs test/totp-encryption.test.mjs test/migration.test.mjs`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green before `/gsd-verify-work`; proven Phase 25 commands: `node --test test/migration.test.mjs`, `node --test test/totp-encryption.test.mjs test/migration.test.mjs`

### Wave 0 Gaps
- [ ] `test/totp-rewrap.test.mjs` — the new suite (seed matrix from Pattern 5)
- [ ] `wrapV1(secret, material)` seed helper (mirror of the existing `wrapV2` in totp-encryption.test.mjs:286)
- [ ] Confirm `test/helpers/server.mjs` env plumbing passes MASTER_KEY_PREVIOUS (A1)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V6 Cryptography | yes | Existing sha256/AES-256-GCM envelope — no new crypto; never hand-roll key derivation beyond reusing keyIdFor |
| V5 Input Validation | yes | Envelope shape validation stays in decryptTotpSecret strict parsing (D-K5); re-wrap must not loosen it |
| V4 Access Control | no | No new routes/surfaces |
| V2/V3 Auth/Session | no | Untouched |
| V14 Config (secret custody) | yes | Runbook: keys via env only; never in argv, never in logs, never committed; `openssl rand -hex 32` generation |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Key material leaking into logs/console summaries | Info Disclosure | D-76/D-K7 discipline: counts and version tags only, never key material or ciphertext — re-wrap summary inherits it |
| Key on process argv (`ps` sniffing) during runbook steps | Info Disclosure | `node -e` one-liner reads from env/stdin (Pitfall 5) |
| Rotation used as compromise response | Elevation | D-K19: stark subsection — rotation does NOT respond to a compromised key; full honest re-enrollment |
| Stale-key rows silently dropped | Tampering/DoS | D-K9: byte-identical, counted, warned; decrypt fails closed at runtime |

## Sources

### Primary (HIGH confidence — all read this session)
- `server.js:74-94` — keyring, keyIdFor, D-K2, duplicate-id warning [VERIFIED]
- `server.js:285-349` — encryptTotpSecret v1/v2 writers, decryptTotpSecret v1-vs-v2 dispatch, v1 bound to current key [VERIFIED]
- `server.js:351-359` — requireTotpSecret / D-78c boundary [VERIFIED]
- `server.js:1036-1046` — transaction helper [VERIFIED]
- `server.js:1145-1151` — bootstrap() call order [VERIFIED]
- `server.js:1196-1232` — WR-01 predicate + WR-02 prune [VERIFIED]
- `server.js:1243-1356` — migrateTotpEncryption: the full skeleton being mirrored [VERIFIED]
- `server.js:1923` — enable path, the only v2 writer [VERIFIED]
- `test/totp-encryption.test.mjs` (D-K2/D-K5/KEY-01 suites, wrapV2 mirror, both-key boots) and `test/migration.test.mjs` (harness pattern, backup assertions) [VERIFIED]
- `DEPLOY.md` section map (grep of headings; §5 Configure, §9 Backups, §11 Troubleshooting) [VERIFIED]
- `.planning/phases/26-.../26-CONTEXT.md`, `.planning/REQUIREMENTS.md` — decisions and requirement wording [VERIFIED]

### Secondary
- None needed — no external APIs or libraries are involved.

### Tertiary
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all primitives read in source this session
- Architecture: HIGH — the pass is a direct mirror of a fully-verified sibling; only open question is helper extraction style (both safe)
- Pitfalls: HIGH — every pitfall traces to a specific verified line or decision
- Runbook specifics (A1–A4): MEDIUM — operator-tooling details flagged as assumptions

**Research date:** 2026-11-01
**Valid until:** 2026-12-01 (stable internal domain)
