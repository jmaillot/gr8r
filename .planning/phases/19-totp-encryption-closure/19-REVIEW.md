---
phase: 19-totp-encryption-closure
reviewed: 2026-10-28T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - server.js
  - test/migration.test.mjs
  - test/totp-encryption.test.mjs
findings:
  critical: 0
  warning: 2
  info: 7
  total: 9
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-10-28
**Depth:** standard
**Files Reviewed:** 3 (server.js, test/migration.test.mjs, test/totp-encryption.test.mjs — diff f425ae1^..65b3dcb)
**Status:** issues_found

## Summary

The phase implementation is solid. The locked decisions are honored: D-73 (MASTER_KEY defer before any I/O, server.js:1013–1021), D-74 (backup failure → console.error + return, server.js:1027–1031 — deliberately no proceed), D-75 (per-row blank/garbage/`v1:` skips inside the transaction, server.js:1044–1064), D-77/D-79 (`requireTotpSecret` next to `decryptTotpSecret`, server.js:266–273, exclusive caller), D-80/D-81 (both 503 sites reuse `masterKeyMissing` with byte-identical per-route copy), D-83 (trigger-gated no-op). The three D-78 proof mechanisms exist and are genuinely load-bearing. The two warnings below both stem from the same root: the D-83 trigger query is broader than the D-75 per-row skip rules, so the migration can fail to converge.

## Warnings

### WR-01: Migration never converges when a permanently-skipped row exists — a new plaintext backup file is written on EVERY boot

**Severity:** major (blocker-adjacent for the D-83 must-have)
**File:** `server.js:1004–1005, 1022–1031`
**Issue:** The D-83 trigger counts rows where `two_fa_secret is not null and != '' and not like 'v1:%'`, but the D-75 per-row rules skip whitespace-only and non-base32 values forever. For a database containing one such row (e.g. `'  '` or `'not-a-base32!!'`), every boot: trigger > 0 → (MASTER_KEY set) → `wal_checkpoint` + `vacuum into gr8r-preenvelope-<stamp>.db` → transaction that skips the row without migrating it. Consequences:

1. A new `gr8r-preenvelope-*.db` (containing **plaintext** TOTP secrets of all other users at that moment) is created on every boot — unbounded file accumulation in DATA_DIR, and repeated plaintext-at-rest snapshots, which is exactly what ENC-01 exists to eliminate.
2. The locked must-have "Second boot after a completed migration is a byte-identical no-op: no new backup file" is violated for any database with a garbage row — and the edge-row test (migration.test.mjs, ENC-01 edge-rows case) boots only once, so this is untested.

**Fix:** Make the trigger match the eligibility rule, e.g. only rows whose value (trimmed) matches `/^[A-Z2-7]{32}$/` are eligible:
```sql
select id, two_fa_secret from users
 where two_fa_secret is not null and trim(two_fa_secret) != ''
   and two_fa_secret not like 'v1:%'
   and trim(two_fa_secret) glob '[A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7][A-Z2-7]'
```
(or a `regexp` user function / pre-filter in JS on `pendingRows()` results). Keep the per-row D-75 re-check as defense in depth, and add a test: a db with only a garbage row boots with zero new backup files and a silent migration.

### WR-02: `LIKE 'v1:%'` is case-insensitive in SQLite — `V1:`-prefixed rows are silently excluded from both migration and garbage logging

**Severity:** major
**File:** `server.js:1005`
**Issue:** SQLite `LIKE` is case-insensitive for ASCII, so a row stored as `V1:…` (tampered db, hand-imported data, legacy bug) is excluded by the D-83 trigger AND never reaches the D-75 per-row skip log. It sits unencrypted/unverifiable indefinitely with zero console visibility, contradicting D-76 ("deferred/failed rows appear on console"). Decrypt fails closed at runtime, so there is no auth bypass — but the row becomes permanently invisible to the migration's reporting.

**Fix:** Use a case-sensitive check: `two_fa_secret not like 'v1:%' escape '\'` doesn't help; instead use `substr(two_fa_secret,1,3) != 'v1:'` or `two_fa_secret not glob 'v1:*'` (GLOB is case-sensitive), or add the shape check in JS inside `pendingRows()`.

## Info

### IN-01: `skippedGarbage` conflates two distinct conditions; the encrypt-null path logs nothing

**File:** `server.js:1058–1061`
**Issue:** `if (!envelope) { skippedGarbage++; continue; }` — `encryptTotpSecret` returns null only on missing MASTER_KEY (already checked) or a crypto exception. Counting it as "non-base32 skipped" misreports the cause, and unlike the shape-check branch it emits no per-row console line (D-76 visibility gap).
**Fix:** Give the encrypt-null branch its own counter/log line (e.g. `skippedEncryptError` with `console.error` naming the user id).

### IN-02: Dead expression in the D-81 copy test

**File:** `test/totp-encryption.test.mjs:79`
**Issue:** `VERIFY_COPY.replaceAll('—', '—')` replaces the em dash with itself — a no-op that suggests an escaping intent that isn't happening. (The copy contains no regex metacharacters, so it works, by luck of content.)
**Fix:** Drop the `replaceAll`, or use `VERIFY_COPY.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')` if regex-escaping was intended.

### IN-03: Pointless defensive check on `fs.tmpdir`

**File:** `test/totp-encryption.test.mjs:95, 97`
**Issue:** `fs.tmpdir !== undefined ? fs.tmpdir() : '/tmp'` — `fs.tmpdir` always exists in Node; the ternary is dead noise and silently diverges from the `os.tmpdir()` convention used in migration.test.mjs.
**Fix:** `fs.mkdtempSync(path.join(os.tmpdir(), 'gr8r-totpe-key-'))` (import `os`), matching the sibling test file.

### IN-04: Wrapper-body assertions keyed to a distant marker comment

**File:** `test/totp-encryption.test.mjs:47–50, 72`
**Issue:** Both the "wrapper shape" and exclusivity tests slice the source using `serverSource.indexOf('/* D-46: pending')` as the wrapper's end boundary. If the D-46 comment block is ever edited, moved, or reworded, the tests break or (if it lands before the wrapper) fail with a misleading message. Loud failure, but unnecessarily brittle.
**Fix:** Slice to the first `}` after `function requireTotpSecret(` or match the wrapper body with a single regex (`/function requireTotpSecret\(envelope\) \{[\s\S]*?\n\}/`).

### IN-05: Behavioral verify test omits the stored-value-unchanged assertion

**File:** `test/totp-encryption.test.mjs:130–149`
**Issue:** The keyed disable test asserts `row.two_fa_secret === value` post-503 (the "never rewritten" guarantee), but the sibling login-challenge verify test (keyed server) asserts only `two_fa_enabled` and `two_fa_last_step`. The plan's D-78b acceptance calls for no-rewrite assertions at both surfaces.
**Fix:** Add `assert.equal(row.two_fa_secret, value, ...)` to the keyed verify loop.

### IN-06: Pre-migration backup contains plaintext TOTP secrets with umask-dependent permissions

**File:** `server.js:1022–1026`
**Issue:** `gr8r-preenvelope-<stamp>.db` is intentionally a full plaintext snapshot (D-74, user-emphasized invariant) but is created with default permissions and never cleaned up. On shared hosts with a permissive umask, that widens plaintext exposure indefinitely — the very property the phase closes.
**Fix (optional hardening, not a decision violation):** `fs.chmodSync(backup, 0o600)` after `vacuum into`, and note in the console line that the backup contains plaintext secrets.

### IN-07: Grep proof is approximate by design — accepts known evasions

**File:** `test/totp-encryption.test.mjs:40–45`
**Issue:** The D-78a regexes miss fallbacks written as `const s = secret ?? envelope;` on a following line, or wrapped through a helper. D-78a locks only "grep-level", so this is compliant, but the mechanism's guarantee should not be overstated in comments ("no plaintext fallback **can** exist").
**Fix:** None required; optionally extend the regexes with `[\s\S]{0,40}?\?\?` distance matching, and keep the behavioral + exclusivity proofs as the real guarantee.

## Decision-compliance check (passed)

- D-73 defer ordering is before the backup stamp code — no stray backup on deferred boots (server.js:1013–1021, proven by test).
- D-74 asymmetry vs migrateTenancy correctly implemented: catch → `console.error` → `return` (server.js:1027–1031).
- D-75 strict shape `/^[A-Z2-7]{32}$/` matches the codebase enrollment rule; per-row re-check inside the transaction present.
- D-77/D-79 wrapper placement and `{ok, secret}` shape correct; exclusivity test counts exactly 2 call-syntax occurrences.
- D-80/D-81 both 503 sites reuse `masterKeyMissing`; per-route copy strings byte-identical (verified by test and manual diff read).
- `two_fa_enabled` gate in the login-challenge verify untouched (server.js:1729 region; static assertion in test).
- No secret material ever reaches a console line, response body, or log in the reviewed diff.

---

_Reviewed: 2026-10-28_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
