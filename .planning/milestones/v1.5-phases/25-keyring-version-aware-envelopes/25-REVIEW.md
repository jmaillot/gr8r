---
phase: 25-keyring-version-aware-envelopes
reviewed: 2026-10-31T18:05:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - server.js
  - test/migration.test.mjs
  - test/totp-encryption.test.mjs
  - test/tfa-enrollment.test.mjs
findings:
  critical: 0
  warning: 2
  info: 5
  total: 7
status: issues_found
---

# Phase 25: Code Review Report

**Reviewed:** 2026-10-31T18:05:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the full phase-25 diff (3f528eb^..fce04d6): the D-K6 version-aware boot-migration filter + shared `isEnvelopeVersion` predicate, the D-K7 unrecognized-version counter/warn, the D-K1/D-K2/D-K3 keyring block, the D-K4 `v2:<key-id>:<iv>:<tag>:<ct>` envelope with v2 decrypt dispatch, the enable-path writer flip, and the three test files.

Verified against the plan's prohibitions: no known-versions list anywhere (generic `/^v\d+:/` only); no key material or ciphertext in any log line (warn lines quote version tags and counts only — asserted by test); no third error shape on decrypt failure (every v2 failure mode returns `null` → existing 503 `masterKeyMissing` path, proven by the D-K5 variant tests); key id and AES key derive from one sha256 call (id = `digest('hex').slice(0,8)` in `keyIdFor`, `key.toString('hex').slice(0,8)` in the v2 writer — same bytes, cannot drift); D-K2 throws at boot before any request; `requireTotpSecret` is byte-unchanged (static proof). Scoped suites pass (57/57; full suite reported 621/621 in summaries).

No critical issues found. Two warnings (a case-sensitivity disagreement between the SQL layer and the JS predicate, and a permanent-fail v1-row edge that permanently re-backs-up) and five info items below.

## Warnings

### WR-01: SQL LIKE and the JS predicate disagree on case — uppercase-prefixed envelope rows are silently skipped (D-K7 "never silent" violated for that shape)

**File:** `server.js:1225-1231` (D-K7 candidate loop), `server.js:1262` (pendingRows filter), `server.js:1187` (`isEnvelopeVersion`)

**Issue:** SQLite `LIKE 'v_:%'` is ASCII case-insensitive, so a row like `V2:deadbeef:...` IS selected as an envelope candidate AND excluded from `pendingRows`. But `isEnvelopeVersion` uses the case-sensitive `/^v\d+:/`, so the candidate loop's `if (!isEnvelopeVersion(value) || ...) continue;` drops it without counting it, and the migration never sees it either. Result: a `V2:`-prefixed row is skipped on every boot with zero warnings, zero counters, zero summary entries — exactly the silent-skip class D-K7 was written to prevent. The two defense-in-depth layers (SQL prefilter and JS predicate) also disagree, the drift class the D-75 static guard was built for (the guard only pins the re-check, not the SQL filter's case behavior).

**Fix:** Normalize case in one place — either make the predicate case-insensitive (`/^v\d+:/i`) so it agrees with LIKE, or make the SQL filter case-sensitive using GLOB (`two_fa_secret not glob 'v[0-9]*:*'` style prefilter + per-row JS authority). The predicate-side fix is the smaller change and keeps D-K6's single source of truth:

```js
const ENVELOPE_VERSION_RE = /^v\d+:/i; // match SQLite LIKE's ASCII case-insensitivity
```

### WR-02: A permanently undecryptable envelope row (e.g. v1 wrapped by a rotated-away key) creates a fresh pre-migration backup on every boot, forever

**File:** `server.js:1222-1235` (D-K7 probe runs before the D-83 gate), `server.js:1254` (`if (rows.length === 0) return;`)

**Issue:** The D-K7 decryptability probe is keyed on decryptability, so a `v1:` row sealed with a previous `MASTER_KEY` (the normal post-rotation state until Phase 26's re-wrap ships) counts as "unrecognized (v1)" — correctly warned, per the 25-01 summary's own note. But the row is also still selected by `pendingRows()` (it is an envelope, and the D-83 no-op gate never triggers while it exists), so every boot: `vacuum into` writes a new `projects-preenvelope-<timestamp>.db` backup (unbounded backup accumulation in `DATA_DIR`), re-runs the migration transaction, and counts the row as `alreadyEncrypted`. Nothing ever converges until Phase 26 lands. The SC-1 test only proves the zero-pending case.

**Fix:** Either exclude rows the D-K7 probe proved envelope-shaped-but-undecryptable from the pending set (they are not plaintext — re-wrapping them is both impossible and pointless), or bound/rotate the backup directory. Minimal, faithful-to-D-83 change: treat the probe's "is an envelope" result as authoritative and skip those rows in `pendingRows()` (e.g. filter `rows = pendingRows().filter(r => !isEnvelopeVersion(String(r.two_fa_secret||'').trim()))` — note the D-75 re-check already guarantees no double-wrap; this only stops the endless backup + transaction churn).

## Info

### IN-01: v1 decrypt branch tolerates trailing junk segments; v2 is strict

**File:** `server.js:321-331`

**Issue:** The v2 branch enforces `parts.length !== 5 → null`, but the v1 branch destructures the first four parts and ignores any extra `:junk` suffix (pre-existing behavior, carried over verbatim). A tampered `v1:<iv>:<tag>:<ct>:extra` still decrypts. Not exploitable (GCM auth still gates the plaintext) but asymmetric with the strictness D-K5 mandated for v2.

**Fix:** Add `if (parts.length !== 4) return null;` to the v1 branch in a follow-up hardening pass (out of phase-25 scope by design — the plan froze the v1 path).

### IN-02: `encryptTotpSecret` silently treats any non-`'v2'` version argument as v1

**File:** `server.js:291-306`

**Issue:** `version = 'v1'` default + `if (version === 'v2')` means a future typo like `encryptTotpSecret(secret, 'v3')` silently writes a v1 envelope with no error. With only two call shapes today the risk is theoretical, but the function accepts an unvalidated enum.

**Fix:** Throw on an unrecognized version argument, or narrow the signature to a `'v1' | 'v2'` union when the code gains types.

### IN-03: Dead defensive code in tests — `fs.tmpdir !== undefined` is always true

**File:** `test/totp-encryption.test.mjs` (3 occurrences: previous-key, writer-flip, SC-4 legacy tests)

**Issue:** `path.join(fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp', ...)` — `node:fs.tmpdir()` has existed since Node 4; the fallback is dead code that implies a portability concern that doesn't exist. Suggests copy-paste from a different runtime constraint.

**Fix:** Use `fs.mkdtempSync(path.join(os.tmpdir(), 'projects-...'))` — the `os` module is already imported in `test/migration.test.mjs`; import it here too and drop the ternary.

### IN-04: D-K7 candidate loop re-derives the version tag with `value.split(':', 1)[0]`

**File:** `server.js:1231`

**Issue:** `split(':', 1)[0]` is an unusual idiom for "everything before the first colon" (and would be clearer as `value.slice(0, value.indexOf(':'))` or by capturing the tag from `ENVELOPE_VERSION_RE`). Functionally correct — noted only for readability.

**Fix:** `const tag = value.match(/^v\d+/)?.[0]; unrecognizedTags.add(tag)` alongside the predicate test.

### IN-05: Minor timing difference between unknown-key-id and tampered-tag v2 failures

**File:** `server.js:336-338`

**Issue:** An unknown key id returns `null` before any base64 decode or GCM work; a corrupt tag runs the full decipher + `final()` throw. Both yield the identical `null` → 503 `masterKeyMissing` response, so there is no response-level oracle, but a local attacker with DB-write access and precise timing could distinguish "key absent from keyring" from "tag tampered". Disclosure value is negligible (the key ids are already readable from the row itself), and the research explicitly accepted this shape.

**Fix:** None required; document in Phase 26's threat model if keyring timing ever becomes attacker-observable over the network.

---

## Verification performed

- Read all four changed files / the full phase diff (`git diff 3f528eb^..fce04d6`).
- Cross-checked every plan prohibition: no known-versions list; no `_2`/`_3` keyring chain; no key material/ciphertext in logs; no third error shape; `requireTotpSecret` unchanged.
- Ran `node --test test/migration.test.mjs test/totp-encryption.test.mjs test/tfa-enrollment.test.mjs` — 57 pass / 0 fail.
- Traced the D-K7 probe → D-83 gate → backup → txn re-check → summary ordering in current `server.js` (lines 1187-1320).

---

_Reviewed: 2026-10-31T18:05:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
