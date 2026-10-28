---
phase: 19-totp-encryption-closure
plan: 02
subsystem: auth-crypto-boundary
tags: [totp, encryption, fail-closed, wrapper, enc-02]
requires: [decryptTotpSecret null contract (D-05), migrateTotpEncryption (ENC-01, 19-01)]
provides: [requireTotpSecret() wrapper, D-78 proof suite (test/totp-encryption.test.mjs)]
affects: [server.js TOTP-verify/disable routes, test/totp-encryption.test.mjs]
tech-stack:
  added: []
  patterns: [single-boundary wrapper, outcome-branch fail-closed 503, source-as-text static proof, mutation load-bearing check]
key-files:
  created:
    - test/totp-encryption.test.mjs
  modified:
    - server.js
decisions:
  - "requireTotpSecret is the ONLY caller of decryptTotpSecret — enforced structurally by the exclusivity test, not by convention (D-77/D-78c)"
  - "Call sites keep the existing transaction-outcome shape ('masterKey' string → 503 masterKeyMissing) — per-route body copy byte-identical (D-80/D-81)"
  - "Exclusivity asserted by counting call-syntax occurrences (2: definition + wrapper) with per-occurrence location checks — comment mentions never match the call regex"
metrics:
  duration: 22m
  completed: 2026-10-28
status: complete
estimate:
  tokens: 64000
actuals:
  tokens: 34000
  tasks: 3
  commits: 2
plan_head_before: 6cf4f73c013f9043932e0252b40a8782005c29c1
plan_head_after: 65b3dcbc44fd925f8d0183f321227786a6c49d8f
---

# Phase 19 Plan 02: Decrypt Boundary Closure (ENC-02) Summary

A single `requireTotpSecret(envelope)` wrapper is now the only caller of `decryptTotpSecret`; both TOTP call surfaces fail closed with 503 `masterKeyMissing`, and three proof mechanisms (grep, behavioral, exclusivity) lock in that no plaintext fallback can exist or reappear.

## What Was Built

- **`requireTotpSecret(envelope)`** (server.js, immediately next to `decryptTotpSecret`, block comment carrying D-77/D-79): calls decryptTotpSecret — the null contract means every failure mode (missing MASTER_KEY, malformed envelope, non-`v1:`, tampered GCM tag) already returns null — and returns `{ ok: true, secret }` or `{ ok: false }`. No fallback of any kind inside the wrapper.
- **Two swapped call sites** (plan anchors ~1568/~1641 had shifted after wave 1; actual: disable route ~1663, login-challenge verify ~1737):
  - `const wrapped = requireTotpSecret(...)` / `if (!wrapped.ok) return 'masterKey'` / `verifyTotpCode(wrapped.secret, ...)` — the surrounding `transaction()` outcome shape and the `'masterKey'` → `fail(res, 503, 'masterKeyMissing', …)` handling untouched.
  - Both per-route 503 body copies byte-identical (D-81): disable keeps the "or the stored secret is undecryptable" string, verify keeps the "cannot be verified" string.
  - The `two_fa_enabled` gate in the login-challenge verify untouched (research Pitfall 3).
- **`test/totp-encryption.test.mjs`** (new, 12 tests) — the three D-78 mechanisms:
  - **Grep (D-78a):** no `decryptTotpSecret(…) ?? …` / `||` / `|| String(` / `|| envelope` pattern anywhere in server.js; the wrapper body itself carries no `??`/`||`.
  - **Exclusivity (D-78c):** exactly 2 call-syntax occurrences of `decryptTotpSecret(` — the definition and the one call inside `requireTotpSecret` — with per-occurrence location assertions; plus shape assertions for both swapped call sites (`const wrapped = requireTotpSecret(` ×2, `if (!wrapped.ok)` ×2, `verifyTotpCode(wrapped.secret` ×2).
  - **Behavioral (D-78b):** 10 fail-closed cases — 3 corrupt variants (malformed `garbage-not-envelope`, plaintext `JBSWY3DPEHPK3PXP`, valid-shaped `v1:` envelope) × 2 endpoints (disable step-up, login-challenge verify) × 2 servers (MASTER_KEY set / unset). Each asserts 503 + `masterKeyMissing` code + the byte-identical per-route copy, and that `two_fa_enabled` stays 1, `two_fa_last_step` stays unchanged, and the stored value is never rewritten.
  - **Negative control (Pitfall 3):** a non-2FA account logs in normally with MASTER_KEY unset — no 503, no pending2fa, session minted.
  - **Positive control:** a real enroll→enable→disable live-code round-trip on the keyed server still succeeds — the closure does not break the happy path.
- **Load-bearing check (TDD):** temporarily reverting one call site to the direct `decryptTotpSecret` shape turns the exclusivity and call-site-shape tests red; restored → green.

## Verification

- `node --test test/totp-encryption.test.mjs test/error-codes.test.mjs` — 36/36 pass (12 new + 24 existing error-code tests).
- `npm test` — **542/542 pass, exit 0** (530 pre-existing + 12 new; zero regressions).
- `node --test test/tfa-enrollment.test.mjs test/totp.fixture.test.mjs` — 32/32 pass (2FA happy paths untouched).

## Deviations from Plan

**1. [Line-anchor drift] Call sites sat at ~1663/~1737, not 1568/1641**
- **Found during:** Task 1
- **Issue:** wave 1's `migrateTotpEncryption()` addition shifted the route code; the plan's read_first line anchors no longer matched.
- **Fix:** located the call sites by content (`decryptTotpSecret(` occurrences) instead of line numbers; the swap itself is exactly as specified.
- **Files modified:** server.js
- **Commit:** 7e79b5c

None otherwise — plan executed as written; no stubs, no auth gates, no new security surface.

## Threat Model Compliance

- T-19-04 (mitigated): wrapper exclusivity + null→'masterKey'→503 at both call sites; proven by the exclusivity test and 10 behavioral 503 cases.
- T-19-05 (mitigated): tampered/malformed envelope → GCM fail → null → ok:false → 503; the malformed variant covers this.
- T-19-06 (mitigated): single `masterKeyMissing` code reused for corrupt and missing-key cases — no error oracle; no secret material in any response (asserted indirectly: bodies are the fixed per-route copies).
- T-19-07 (mitigated): `two_fa_enabled` gate intact (static assertion) + non-2FA negative control on a no-key server.

## Known Stubs

None.

## Self-Check: PASSED

- server.js `requireTotpSecret()` + 2 swapped call sites — FOUND (committed 7e79b5c).
- test/totp-encryption.test.mjs — FOUND (committed 65b3dcb), 12/12 green.
- Commits 7e79b5c, 65b3dcb verified in `git log 6cf4f73..65b3dcb` (2 commits).
