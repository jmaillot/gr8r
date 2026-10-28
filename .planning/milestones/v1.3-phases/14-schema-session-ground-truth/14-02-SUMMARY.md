---
phase: 14-schema-session-ground-truth
plan: 02
subsystem: client-sessions-foundation
tags: [i18n, locales, api-client, user-agent, sessions]
requires:
  - 14-01 (strip-free docs; three /api/auth/sessions endpoints land in 14-03)
  - 13-DECISIONS.md D-18/D-28/D-29/D-33
  - i18n two-gate pattern (P-D: catalogue parity + CLIENT_ONLY_ERR_CODES reverse parity)
provides:
  - 10 dev.* device-label keys in en.json and fr.json (ios/android/mac/windows/linux/edge/opera/chrome/firefox/safari)
  - err.signedOutElsewhere honest-copy key in both locales, distinct from err.sessionExpired (D-28)
  - signedOutElsewhere in CLIENT_ONLY_ERR_CODES (reverse-parity gate passes)
  - api.sessions(), api.revokeSession(id), api.revokeAllSessions() — auth-scoped, no slug guard
  - deviceLabel(ua) export in src/core/utils.js — pure UA → t('dev.*') label renderer
affects:
  - 14-03 (server endpoints these three client methods call)
  - 14-04 (settings sessions page consumes api.sessions() + deviceLabel())
tech-stack:
  added: []
  patterns:
    - auth-scoped client method pattern (call() directly, no slug guard — /api/auth/* takes no slug)
    - catalogue-key-only renderer (every visible token is a t() key, per P-D)
key-files:
  created: []
  modified:
    - src/locales/en.json
    - src/locales/fr.json
    - test/error-codes.test.mjs
    - test/i18n-core-features.test.mjs
    - src/core/api.js
    - src/core/utils.js
decisions:
  - dev.* keys placed beside the err.sessionExpired cluster in both catalogues (the file is a flat map, not sectioned — the plan's "data/doc section" wording does not apply to the real file shape)
  - catalogue count pin (1549) and api call-site pin (24) updated in the same plan as the additions they pin — keeps the byte-identity guards green in one commit
metrics:
  duration: 3min
  completed: 2026-10-26
status: complete
estimate:
  tokens: 25000
actuals:
  tokens: 1856
  tasks: 2
  commits: 2
plan_head_before: df015f3f9cf70be0730baf93ecf7405ad54a6855
plan_head_after: a417d26e155e2e8990e1bbeb26098680f258510f
commits: 2
---

# Phase 14 Plan 02: Client Foundation for Sessions Revocation Summary

Locale vocabulary (10 dev.* device labels + err.signedOutElsewhere), three auth-scoped client API methods for the future /api/auth/sessions endpoints, and a deviceLabel() User-Agent renderer built entirely from catalogue keys.

## What Was Built

### Task 1 — Locale keys + CLIENT_ONLY_ERR_CODES (commit 5e9b52d)

- `src/locales/en.json` + `src/locales/fr.json`: 10 `dev.*` keys (iOS, Android, Mac, Windows, Linux, Edge, Opera, Chrome, Firefox, Safari — platform names, non-translated) and `err.signedOutElsewhere` with honest copy (EN: "You have been signed out from another device. Sign in again to continue." / FR: "Vous avez été déconnecté depuis un autre appareil…"), distinct from `err.sessionExpired` per D-28.
- `test/error-codes.test.mjs`: `signedOutElsewhere` appended to `CLIENT_ONLY_ERR_CODES` after `code403` (P-D reverse parity — a client-composed err.* code must be allow-listed or the suite fails).

### Task 2 — API methods + deviceLabel() (commit a417d26)

- `src/core/api.js`: three methods beside the auth-scoped precedent (`me`/`login`/`logout`/`patchMe`) — `sessions()` → GET `/api/auth/sessions`, `revokeSession(id)` → DELETE `/api/auth/sessions/{encodeURIComponent(id)}`, `revokeAllSessions()` → DELETE `/api/auth/sessions/others`. No slug guard: `/api/auth/*` endpoints take no workspace slug (plan prohibition honored).
- `src/core/utils.js`: `deviceLabel(ua)` — `String(ua || '')` coercion, OS chain (iPhone/iPad→dev.ios, Android, Mac|Darwin, Windows, Linux), browser chain (Edg/→dev.edge, OPR/, Chrome/, Firefox/, Safari/), join `os · br` with ` · ` filtering empties, em-dash `—` when both are empty. Every visible token is a `t('dev.*')` catalogue key; the em-dash `—` matches the existing symbol convention (like `isMac`'s `⌘`) and the i18n scan passes with it.

## Verification Performed

- `node scripts/i18n-scan.mjs` — 0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch (both tasks).
- `npm test` — 450/451 pass; the single failure is the pre-existing `test/i18n-prefs.test.mjs:243` (v1.3 ROADMAP rewrite removed the Phase 6 section it asserts) already logged to deferred-items.md in 14-01 — reproduced at base `df015f3`, unrelated to this plan.
- UA spot checks via node: `iPhone…Safari/604.1` → `"iOS · Safari"`; `Windows NT…Chrome/120` → `"Windows · Chrome"`; `''`/`null`/`curl/8.0` → `"—"`; `Mac…Edg/120` → `"Mac · Edge"` (Edge wins over Chrome via order).
- `npm run lint` — clean; `npx prettier --check` on all touched files — clean.

## Tracer Feedback Gate

N/A — this plan carries only `type="auto"` tasks (no tracer); each task's `<verify>` was re-run end-to-end after its commit and passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Catalogue count pin moved 1538 → 1549**
- **Found during:** Task 1 verification
- **Issue:** `test/i18n-core-features.test.mjs` pins the exact catalogue key count; the 11 new keys broke it (`1549 !== 1538`).
- **Fix:** Pin updated to 1549 with the delta annotated in the test title ("+ 10 dev.<device> keys and err.signedOutElsewhere, phase 14 plan 2").
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** 5e9b52d

**2. [Rule 3 - Blocking] API call-site pin moved 21 → 24**
- **Found during:** Task 2 verification
- **Issue:** The same file pins the number of `call(...)` sites in api.js ("byte-identical verbs/paths" test); the three new methods broke it.
- **Fix:** Pin updated to 24 with the annotation extended ("+ the three session endpoints (14-02)").
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** a417d26

Both are the byte-identity guard tests doing their job — the pins exist to force an intentional update on every addition, and both were updated in the same commit as their cause.

## Threat Model Compliance

No new threats — the three API methods are thin `call()` wrappers (no new trust boundary; auth is cookie-based and enforced server-side in 14-03), the locale keys are static reviewed data, and `deviceLabel()` is a pure string transformation whose output reaches the DOM through `esc()` at the 14-04 render site.

## Auth Gates

None.

## Known Stubs

None. The three API methods target endpoints that 14-03 builds — that dependency order is the plan's design (Wave 1 runs 14-02 ∥ 14-01, 14-03 consumes both), not a stub. Every `<verify>` ran and passed.

## Self-Check: PASSED

- All 6 modified files exist on disk; both commit hashes (`5e9b52d`, `a417d26`) verified in git log.
- Content spot checks: `signedOutElsewhere` present in both catalogues and `CLIENT_ONLY_ERR_CODES`; `deviceLabel` exported from utils.js.
- `git rev-list --count df015f3..a417d26` = 2 (matches `commits: 2`).
