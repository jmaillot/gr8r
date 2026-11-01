---
phase: 25-keyring-version-aware-envelopes
plan: 02
subsystem: totp-encryption
tags: [security, keyring, envelope, 2fa, rotation-prep]
requires: ["25-01 version-aware boot filter (SC-1)"]
provides: ["two-key KEYRING (MASTER_KEY + MASTER_KEY_PREVIOUS, D-K1)", "keyIdFor() hash-derived key ids (D-K3)", "frozen v2 envelope format v2:<key-id>:<iv>:<tag>:<ct> (D-K4)", "fail-closed v2 decrypt dispatch behind requireTotpSecret (D-K5)", "D-K2 loud boot validation"]
affects: ["Phase 26 re-wrap rotation consumes the frozen format and the keyring"]
tech-stack:
  added: []
  patterns: ["keyring Map keyed by 8-hex sha256 fingerprint", "single-decrypt-boundary version dispatch", "test-side envelope mirror"]
key-files:
  created: []
  modified: ["server.js", "test/totp-encryption.test.mjs", "test/tfa-enrollment.test.mjs"]
decisions:
  - "D-K3/D-K4 format frozen by user checkpoint (decision, option 1) — key id = first 8 hex chars of sha256(raw key material), envelope = v2:<key-id>:<iv>:<tag>:<ct>"
  - "encryptTotpSecret gained a version param (default 'v1'); ONLY the /api/auth/tfa/enable call site passes 'v2' — the boot migration and all reader call sites stay v1, keeping migration.test.mjs semantics and SC-4 intact"
metrics:
  duration: "~75 min total (tasks 1-2 + checkpoint in first session; task 3 resumed)"
  completed: "2026-10-31"
  tasks: 3
status: complete
actuals:
  tokens: 4900        # chars/4 over the realized diff (19,519 chars across server.js + tests)
  tasks: 3
  commits: 3
commits: 3
plan_head_before: 85bb945
plan_head_after: 173abf1
---

# Phase 25 Plan 02: Keyring & Version-Aware Envelopes Summary

Two-key keyring with hash-derived key ids, frozen `v2:<key-id>:<iv>:<tag>:<ct>` envelope (decrypt + enable-path writer), fail-closed v2 dispatch behind the unchanged `requireTotpSecret` boundary — Phase 26 rotation's data contract is now locked and proven.

## Tasks Completed

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Keyring + keyIdFor + v2 decrypt dispatch (tracer) | 8fa712b |
| 2 | D-K2 boot validation + fail-closed v2 negative tests | 93b3443 |
| 3 | Checkpoint — freeze the one-way format | RESOLVED: "Confirm D-K3 + D-K4 as-is" (user decision) |
| 4 | Enable-path writer flips to v2 + SC-2 enrollment round-trip | 173abf1 |

## What Was Built

- **D-K1 keyring** (`server.js`): `KEYRING` Map seeded from `MASTER_KEY` + optional `MASTER_KEY_PREVIOUS`; no `_2/_3` chain variables.
- **D-K3 key ids**: `keyIdFor(material)` — ONE sha256 call; hex first-8 = id, raw digest = AES key (id and key can never drift).
- **D-K2 boot validation**: `MASTER_KEY_PREVIOUS` without `MASTER_KEY` throws at boot; identical key material warns (A1), never fails.
- **D-K5 decrypt dispatch**: `decryptTotpSecret` v2 branch — strict `/^[0-9a-f]{8}$/` id validation, per-part shape checks, KEYRING lookup; every failure (unknown id, malformed shape, corrupt tag, missing key) is the same `null` → 503 `masterKeyMissing` path. `requireTotpSecret` byte-unchanged (static proof).
- **D-K4 writer flip**: `encryptTotpSecret(secretB32, version='v1')` — the enable path passes `'v2'`; boot migration, disable/verify/regen call sites keep v1.
- **Tests** (`test/totp-encryption.test.mjs`, `test/tfa-enrollment.test.mjs`): planted-envelope SC-2 round-trip, previous-key decrypt/503 pair, D-K2 boot failure, malformed/unknown-id/corrupt-tag fail-closed with rows unmutated, key-id determinism, real enroll→enable v2 shape + fresh-login round-trip, planted v1 legacy verify.

## Verification

- `node --test test/totp-encryption.test.mjs test/migration.test.mjs` — 45/45 pass
- `npm test` — 621/621 pass
- `grep encryptTotpSecret( server.js` — v2 writer only at the enable call site; migration (line 1307) and readers untouched

## Deviations from Plan

**1. [Rule 1 - Bug] Stale format assertion in tfa-enrollment.test.mjs**
- **Found during:** Task 4 (full-suite verify)
- **Issue:** `TFA-03/TFA-04` asserted the enable path stores a `v1:` envelope — invalidated by the very writer flip this task ships.
- **Fix:** assertion updated to the frozen 5-part v2 shape with 8-hex id.
- **Files modified:** test/tfa-enrollment.test.mjs
- **Commit:** 173abf1

**2. [Plan interpretation] Writer flip implemented as a version parameter, not a full flip**
- The plan's action text says "flip encryptTotpSecret to emit v2", but the same function is the boot migration's writer (line 1307) and `files_modified` excludes `test/migration.test.mjs`, whose ENC-01 assertions (and the D-82/D-83 semantics) require the migration to keep wrapping plaintext as v1. The verify section is authoritative (migration suite must stay green). Resolution: `version='v1'` default, enable path passes `'v2'` — satisfies every must_have truth and the "enable-path writer flip" objective; Phase 26's re-wrap owns migrating the v1 stock.

## Checkpoint Resolution

Task 3 (checkpoint:decision, gate blocking): user confirmed option 1 — D-K3 + D-K4 frozen as-is. Resume signal: "RESOLVE: format frozen".

## Known Stubs

None.

## Threat Flags

None — no new surface beyond the plan's threat model (T-25-03/04/05 mitigations all present: strict id regex, fingerprint-only logs, parse-before-crypto with identical catch shape).

## Self-Check: PASSED

- Commits 8fa712b, 93b3443, 173abf1 exist (`git log` verified).
- server.js + both test files modified as claimed; full suite 621/621.
