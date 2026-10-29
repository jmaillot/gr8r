# Phase 18 — Pitfalls Audit (D-80/D-81/D-85)

**Date:** 2026-10-27
**Source walked in full:** `.planning/research/PITFALLS.md` — all 22 numbered pitfalls plus the 13-item
"Looks Done But Isn't" checklist. One row per item; evidence names a real test (file + test name) or a
code location. No "trust me" rows (T-18-05).

**Legend:** ✅ green (verified by evidence) · ⚠ observation (documented, no fix per D-85) · ❌ red (filed gap — none in this audit)

## Critical Pitfalls (1–22)

| # | Pitfall | Status | Evidence | Gap |
|---|---------|--------|----------|-----|
| 1 | Time-step drift — ±1 window | ✅ green | `test/totp.fixture.test.mjs`: "verifyTotpCode accepts step+1 (future-step code recorded)" and "verifyTotpCode accepts step-1 (clock skew) when lastStep is null"; server.js:1521-1523 passes the stored `two_fa_last_step` and a ±1 window | — |
| 2 | Replay — same code accepted twice | ✅ green | `test/totp.fixture.test.mjs`: "D-04 replay guard: code for step <= lastStep is rejected" + "…an earlier step is rejected (<=, not ===)"; `test/tfa-login.test.mjs` "D-04: replaying the same code on a fresh challenge is rejected"; replay guard written inside the mint transaction (server.js:1646, 17-VERIFICATION T-17-06) | — |
| 3 | Non-constant-time code compare | ✅ green | `totp.js:69` `crypto.timingSafeEqual` inside the shared verify helper; length-gated by the `/^\d{6}$/` format gate BEFORE the call (`totp.js:56` comment) — same helper serves login and settings paths | — |
| 4 | TOTP secret stored plaintext | ✅ green | AES-256-GCM envelope `v1:<iv>:<tag>:<ct>` under MASTER_KEY (server.js:231-243); enable stores the envelope (server.js:1536); fail-closed 503 tested: `test/tfa-enrollment.test.mjs` "D-06: enable without MASTER_KEY → fail-closed 503 naming MASTER_KEY, no state change" | — |
| 5 | Base32 padding/charset edge cases | ✅ green | `test/totp.fixture.test.mjs`: "base32Decode decodes the RFC 4226 test secret", "base32Decode is case-insensitive and padding-tolerant", "generateTotpSecret: 20 random bytes → 32-char unpadded uppercase Base32"; RFC 4226 (10 HOTP) + RFC 6238 (5 TOTP SHA-1) known-vector tests | — |
| 6 | Clock issues / server-now assumptions | ✅ green | Single `now()` helper (server.js convention); the initial `two_fa_last_step` is set to `verified.matchedStep` (server.js:1536), never a server-now-derived step; `verifyTotpCode` takes an explicit unix-time parameter (unit-tested with fixed vectors) | — |
| 7 | otpauth URI params (SHA1/6/30, escaping) | ✅ green | `test/totp.fixture.test.mjs`: "buildOtpauthUri: D-54 format with encoded email label" + "buildOtpauthUri survives hostile emails (Pitfall 5)" — D-54 exact label format `Projects:<encodeURIComponent(email)>`, params built per 16-01 | — |
| 8 | Scan-time vs enable-time mismatch | ✅ green | Two-step flow: `test/tfa-enrollment.test.mjs` "D-49 step-up + D-46: enroll returns the secret and server-built URI, nothing is persisted" then "TFA-03/TFA-04: enable with a live code flips 2FA on" — enable requires a verifying code; no code → not enabled | — |
| 9 | Revoking your OWN session (self-DoS) | ✅ green | `test/sessions.test.mjs` "SESS-02: disconnect-all-others kills the other cookie and keeps the caller (Pitfall 9)"; 18-02 Chromium e2e revocation EN+FR: device B dies with `err.signedOutElsewhere`, device A survives and keeps acting | — |
| 10 | Revocation not enforced / cached identity | ✅ green | `currentUser()` re-derives identity from the DB per request (13-DECISIONS diagnosis item 6 — server.js:1125-1131 unchanged); no memoization introduced (grep: no auth-side cache); `test/auth-revoked.test.mjs` proves the revoked browser's next call fires the D-28 teardown exactly once | — |
| 11 | Remember-me vs single-tier sessions | ✅ green | Deliberate single-tier held: one `SESSION_DAYS`, no remember-me column, no client-side remembered-cookie path, no `maxAge` variants in fixtures; revocation is `token_hash != sha256(current)` — correct under one tier (13-DECISIONS / Pitfall 11 avoid-pattern honored) | — |
| 12 | Password change without revoking others in-transaction | ✅ green | `test/password-change.test.mjs` "PASS-02: change with cookie A revokes cookie B; old password fails login, new one succeeds"; 18-02 e2e password-change-revocation EN+FR through the real settings surface with `toast.passwordUpdatedAll` | — |
| 13 | Token derived from the password | ✅ green | Invariant locked at 13-DECISIONS: tokens are pure random entropy (`crypto.randomBytes` → sha256 `token_hash`); password change revokes by row deletion (PASS-02), never by derivation; no code reaches into `password_hash` from a token-issuing path | — |
| 14 | Old password policy leak | ✅ green | `test/password-change.test.mjs` "D-38 validation map: empty fields → passwordRequired, weak new → passwordTooWeak"; one shared validator (signup + change); password history explicitly deferred (not built) | — |
| 15 | Pending-2FA challenge = auth bypass (LOAD-BEARING) | ✅ green | `test/tfa-login.test.mjs` "D-71: with only a challenge cookie held, every identity endpoint treats the caller as anonymous" — the 401 matrix across requireUser routes, file route, invite accept, PATCH me; separate `projects_tfa_challenge` cookie; `currentUser()` reads only the session cookie (17-VERIFICATION T-17-02, truths 1-5) | — |
| 16 | Recovery codes stored plaintext | ✅ green | `test/tfa-enrollment.test.mjs:119` asserts each `code_hash` matches `^[0-9a-f]{64}$` — "sha256 hex hash only — never plaintext or ciphertext" (D-09 hash-only, survives MASTER_KEY loss) | — |
| 17 | Recovery code not single-use / audit loss | ✅ green | `test/tfa-login.test.mjs` "D-72: a recovery code authenticates exactly once and reports the remaining count" (conditional `used_at is null` update, `changes !== 1` guard — server.js:1650-1654); `test/tfa-enrollment.test.mjs` "D-57/T-16-14: an already-burned recovery code is rejected" | — |
| 18 | Brute-force on 6-digit/recovery codes — wrong throttle key/constant | ✅ green | D-11 budgets landed per endpoint with distinct prefixes (`2fa-login\|ip\|email` 5/15min — server.js:1610; T-17-01 verified); `test/tfa-enrollment.test.mjs` "D-11/TFA-03: wrong codes are rejected (state untouched) and the 6th attempt locks out" + "T-16-14: the disable throttle is a distinct budget"; one error shape (no oracle) | — |
| 19 | Zero-deps violated / wrong things hand-rolled | ✅ green | QR is the vendored MIT `qrcode-generator@2.0.4` (`src/lib/vendor/qrcode.js`, D-15 — never hand-written); `test/qr.fixture.test.mjs` pins a real deterministic module matrix; `test/dependencies.test.mjs` holds zero runtime dependencies; TOTP is ~60 lines of `node:crypto` with RFC vectors | — |
| 20 | i18n build gate flags new literals | ✅ green | Every new key catalogued EN+FR in-commit through Phases 14–17; `node scripts/i18n-scan.mjs` → 0 findings at 17-VERIFICATION and 18-01/02/03 gates; the AUTH-01 whole-surface re-run over the final tree is the closing gate of this plan (Task 3) | — |
| 21 | Migration byte-identical second boot (LOAD-BEARING) | ✅ green | `test/migration.test.mjs` "a second boot is a no-op and both accounts keep access" extended in 18-03: snapshot now covers full sessions rows + login_challenges count/pragma/DDL; "the 2FA columns and the login_challenges table land dormant" (no backfill, no per-user boot writes); 18/18 pass | — |
| 22 | Minor sharp edges (challenge lifetime / length-crash / CSRF on 2FA family) | ✅ green | (a) challenge cookie Max-Age=300 asserted (17-VERIFICATION truth 1, test D-68); (b) format gate runs before `timingSafeEqual` — `test/totp.fixture.test.mjs` 5-digit/non-numeric/empty "returns format, does not throw" (no 500); (c) every new 2FA/password/revoke mutation endpoint starts with `sameOrigin(req)` (20 guard sites incl. server.js:1599 verify, password change, revocations) | — |

## "Looks Done But Isn't" Checklist (13 items)

| # | Checklist item | Status | Evidence | Gap |
|---|----------------|--------|----------|-----|
| C1 | TOTP window + replay counter (same code fails on 2nd submit) | ✅ green | `test/totp.fixture.test.mjs` step±1 accept + both D-04 replay-guard tests; `test/tfa-login.test.mjs` D-04 | — |
| C2 | Constant-time compare, length-guarded, at all comparison sites | ✅ green | Single shared verify helper (`totp.js:56-69`) used by login + settings paths; format gate tests prove no length-crash | — |
| C3 | Materialization: DB dump after enable has no plaintext secret/codes | ✅ green | `test/tfa-enrollment.test.mjs:119` — recovery `code_hash` sha256-hex-only assertion; secret persisted only as the AES-256-GCM envelope (server.js:1536) | — |
| C4 | otpauth params + issuer escaping (fixture vector, 5 params) | ✅ green | buildOtpauthUri fixture tests (D-54 format, hostile emails); QR fixture encodes the same URI | — |
| C5 | Enable flow confirms with a live code; retry keeps the secret | ✅ green | tfa-enrollment D-49 (enroll persists nothing) → TFA-03/TFA-04 (enable requires live code); D-53 rotation deletes old rows; wrong code leaves state untouched | — |
| C6 | Revoke-others keeps the caller signed in | ✅ green | SESS-02 test (second cookie dead, caller alive — Pitfall 9 named in the test) + 18-02 e2e | — |
| C7 | Password change revokes others inside the hash-write transaction | ✅ green | PASS-02 test + 18-02 e2e; same-transaction revoke reuses SESS-02's SQL (Phase 15) | — |
| C8 | Recovery single-use race-safety + login-throttle reuse | ✅ green | D-72 exactly-once + remaining-count; T-16-14 already-burned rejected; distinct `recovery\|ip\|email` budget (D-11) | — |
| C9 | Throttle on the TOTP challenge itself (11 rapid fails → 429) | ✅ green | server.js:1610 `2fa-login\|` prefix 5/15min; tfa-enrollment lockout tests (6th attempt) — budgets within the D-11 band | — |
| C10 | Throttle hygiene — no budget reset mid-flow | ✅ green | `test/tfa-login.test.mjs` "D-03: one logical login = one throttle budget — pending successes never reset it"; `attempts.delete` audited to exactly 3 sites (eviction + 2 success sites, 17-VERIFICATION) | — |
| C11 | EN+FR catalogue keys for every new string (i18n-scan passes) | ✅ green | i18n-scan → 0 findings at every phase gate since Phase 14; catalogue tests green; final-tree re-run = this plan's Task 3 closing gate | — |
| C12 | Migration does not backfill 2FA state at boot | ✅ green | migration.test.mjs "2FA columns and login_challenges land dormant"; byte-identical second boot incl. login_challenges (18-03 extension) | — |
| C13 | `tfa`/`sessions` are real columns, gone from the workspace doc | ✅ green | migration.test.mjs "every workspace document in the database carries zero auth-bearing keys" (D-79 no-filter walk) + "served document … carries no sessions or tfa fields" + client-write persistence test | — |

## Observations (no fix per D-85)

| Item | Status | Evidence | Disposition |
|------|--------|----------|-------------|
| IN-02 — logout route (`server.js:1421`) has no `sameOrigin` guard | ⚠ observation | 17-VERIFICATION review info item; pre-existing, precedes v1.3; logout is a low-risk mutation (destroys caller's own session only, no state read) | Backlog (D-85) — explicit out-of-scope for Phase 18; no logout CSRF work here |

## Six flagged specless assumptions from 18-01 — final disposal

| Assumption | Disposal | Evidence / plan |
|------------|----------|-----------------|
| AUTH-01 adjacency (catalogue adjacency collisions) | disposed-by-evidence | i18n-scan's duplicate-key/stale-entry detection; gate green at 18-01/02/03; whole-surface re-run over the final tree = Task 3 closing gate |
| AUTH-01 empty (empty/null catalogue values) | disposed-by-evidence | i18n-scan treats empty-string values as findings; 0 findings at every phase gate; final-tree re-run = Task 3 |
| AUTH-01 ordering (stable catalogue output) | disposed-by-evidence | catalogue key order not user-facing; `test/build-locales.test.mjs` pins stable output; green at every gate; final-tree re-run = Task 3 |
| AUTH-03 adjacency (duplicate rows / identical steps) | disposed-by-evidence | 18-02 revocation e2e proves exactly-one-session-death (SESS-02 + per-row revoke EN+FR); replay guard proves one-step-once |
| AUTH-03 empty (empty code at the 2FA step) | disposed-by-evidence | `test/tfa-login.test.mjs` D-65: wrong AND empty codes both return `invalidTfaCode`, empty consumes nothing; 18-02 wrong-code negative e2e |
| AUTH-03 ordering (session list ordering) | disposed-by-evidence | Recorded against the Phase 14 sessions items: `test/sessions.test.mjs` SESS-01 (list shape/metadata) + 14-04 client wiring verified in-phase; out of Phase 18's new-test scope by design |

## Audit summary

- **22/22 pitfalls: green** — every one carries a named test or code cite.
- **13/13 checklist items: green.**
- **1 observation (IN-02)** filed to backlog per D-85; **0 red gaps** — nothing requires a fix plan.
- **6/6 flagged assumptions disposed** (5 by direct evidence, AUTH-03-ordering by recording against the Phase 14 sessions verification).
- No source-code changes were made by this audit (D-81 honored; the sole inline-fix exception WR-01/WR-02 shipped in 18-01 — `test/tfa-state-fix.test.mjs` 4/4, cited above via C2's context and 18-01-SUMMARY).
- Remaining human item: real-device QR UAT (Pitfall 19's definitive check per D-17) — `18-UAT.md`, executed by the human per D-82/D-83.
