---
phase: 15-password-change-end-to-end
plan: 01
subsystem: password-change
tags: [password, sessions, transaction, throttle, security, node-test, i18n]
requires:
  - 14-03 (keep-current revocation SQL + sessions routes — reused verbatim)
  - hashPassword/verifyPassword scrypt primitives (server.js:190-204)
  - transaction(fn) helper (server.js:779)
  - tooMany() in-memory throttle (D-40 budgets from 13-DECISIONS)
provides:
  - PATCH /api/auth/password — sameOrigin → requireUser → tooMany(pwchange|user.id, 10/15min) → readJson → strength → one atomic transaction (verify fresh hash + rehash + keep-current revoke-others)
  - New server error codes: wrongCurrentPassword, passwordRequired (catalogued EN+FR)
  - test/password-change.test.mjs — 5 real-server tests (PASS-01/02, D-35/38/40/41/42)
  - err.wrongCurrentPassword / err.passwordRequired locale keys (15-02 client plan consumes them)
affects:
  - 15-02 (client rewiring depends on this route and its error codes)
tech-stack:
  added: []
  patterns:
    - verify-inside-transaction (fresh password_hash re-select, Pitfall 4)
    - keep-current bulk revocation keyed by caller's own cookie sha256 (Pitfall 9)
    - per-user throttle key `pwchange|${user.id}` consuming budget before processing (D-41)
key-files:
  created:
    - test/password-change.test.mjs
  modified:
    - server.js
    - src/locales/en.json
    - src/locales/fr.json
    - test/i18n-core-features.test.mjs
decisions:
  - users table column is `password_hash` (plan skeleton said `password`) — re-select and update use the real column name
  - auth-probe endpoint in tests is GET /api/auth/sessions (requireUser-only); /api/auth/me returns 200 {user:null} for anonymous and /api/workspaces/acme 404s non-members, so neither is a valid authentication probe
  - signup returns 201, not 200 (harness assertion)
metrics:
  duration: 8min
  completed: 2026-10-27
status: complete
estimate:
  tokens: 55000
actuals:
  tokens: 3371
  tasks: 3
  commits: 2
plan_head_before: f6d5113f963fe5c7709bd005e040623c107dc8bb
plan_head_after: d1281c9
commits: 2
---

# Phase 15 Plan 01: Server Password-Change Route + PASS-01/02 Tests Summary

A dedicated PATCH /api/auth/password that verifies the current scrypt password, rehashes, and revokes every other session inside one transaction — proven by a 5-test real-server suite covering PASS-01/02 and the D-35/38/40/41/42 edge map.

## What Was Built

### Task 1 — Route + tracer tests (commit c6526b2)

- **PATCH /api/auth/password** in server.js, in the `/api/auth/*` family, guard order per D-34..D-42: `sameOrigin` 403 `crossOriginRejected` → `requireUser` 401 → `tooMany('pwchange|'+user.id, 10, 15*60*1000)` 429 generic `tooManyAttempts` (no Retry-After) → `readJson`, empty fields 400 `passwordRequired` (D-38) → signup-verbatim strength rule 400 `passwordTooWeak` → one `transaction()` → `200 { ok: true }` only (D-37, no revokedCount).
- Inside the transaction: fresh `select password_hash from users where id = ?` (Pitfall 4), `verifyPassword` against it (sentinel false → 403 `wrongCurrentPassword`), `update users set password_hash = ?` with `hashPassword(nw)`, then the Phase 14 keep-current delete verbatim — `delete from sessions where user_id = ? and token_hash != ?` with the caller's own cookie sha256 (Pitfall 9).
- **test/password-change.test.mjs** — 5 real-server + temp-DB tests (own server, no mocks): wrong-current 403 with hash byte-unchanged and both sessions alive; PASS-02 two-cookie (B 401 `signInRequired`, A survives; old password login 401, new 200); D-38 validation map (empty×2, 9-char, 11-char no digit/symbol); D-35 cross-origin 403 via hostile Origin header; D-40/41/42 lockout (10 wrong attempts → 11th is 429 generic copy with `retry-after: null`, second user unaffected — per-user key proof).

### Task 2 — Edge tests

Already fully covered by the tracer file (no duplication, per plan instruction): passwordRequired, passwordTooWeak, crossOriginRejected, 429 lockout with no Retry-After, per-user keying, and the post-lockout recovery boundary (the unaffected user's change sticks; new password logs in). Verify re-run green.

### Task 3 — Full-suite gate (commit d1281c9)

- `npm test` initially failed `test/error-codes.test.mjs` forward parity: the newly emitted codes had no catalogue entries. **[Rule 3] Added `err.wrongCurrentPassword` + `err.passwordRequired` to src/locales/en.json and fr.json** and bumped the catalogue-size pin (1548 → 1550) in test/i18n-core-features.test.mjs. The emit heuristic itself did NOT need extending (`fail(res, …, 'code'` scan caught the new route).
- Prettier style pass on the route block.

## Verification Performed

- `node --test test/password-change.test.mjs` — 5/5 pass, 0 skipped.
- `node --test test/sessions.test.mjs` — 5/5 (revocation primitive unregressed).
- `npm test` — 467/467 pass, 0 fail (incl. error-codes recognising wrongCurrentPassword as emitted).
- `npm run lint` clean; `npx prettier --check` clean on all changed files.
- Source assertions: `token_hash != ?` keep-current clause inside the route's transaction; `{ ok: true }` only in the 200 (grep-verified).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Catalogued the two new error codes EN+FR**
- **Found during:** Task 3
- **Issue:** error-codes.test.mjs forward parity requires every emitted code in both locales; `wrongCurrentPassword`/`passwordRequired` had no entries (the emit heuristic worked fine — the catalogue was the gap; locale files belong to plan 15-02's file list but the gate could not pass without them).
- **Fix:** added both keys to en.json + fr.json (client-facing translations, ready for 15-02) and updated the catalogue-size pin.
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Commit:** d1281c9

(In-task clarifications, not deviations: real column is `password_hash`; test auth-probe is GET /api/auth/sessions; signup is 201.)

## Threat Model Compliance

- **T-15-01** (Spoofing): mitigated — `tooMany('pwchange|'+user.id, 10/15min)` before processing; D-41 consumption and D-40 per-user keying both tested.
- **T-15-02** (Tampering): mitigated — `sameOrigin` 403 before body read; tested with a hostile Origin.
- **T-15-03** (Elevation): mitigated — keep-current revoke inside the same transaction as the rehash; two-cookie test proves B dies, A survives.
- **T-15-04** (Info Disclosure): mitigated — `{ ok: true }` only, generic lockout copy, `retry-after: null` asserted.
- **T-15-05/T-15-06** (accept): untouched per plan — existing timingSafeEqual primitive and accepted lock-hold latency.

## Auth Gates

None.

## Known Stubs

None. Every `<verify>` ran and passed.
