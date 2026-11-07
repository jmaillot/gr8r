---
status: passed
verdict: VERIFICATION_PASSED
verified_at: 2026-11-06
---

# Phase 42 Verification Report

**Phase Goal:** A mail-client one-click POST actually turns the digest off for that (workspace, user) — contract first (UNSUB-02)
**Verified:** 2026-11-06
**Verdict:** VERIFICATION_PASSED
**Method:** Goal-backward — must-haves of 42-01/42-02 PLANs + ROADMAP SC-1..SC-5 verified against live code, then all verification commands re-run in this process.

## 1. Must-have truths — live code (not SUMMARY claims)

### Plan 01 (route)

| Truth | Status | Evidence |
|---|---|---|
| Valid logged-out POST flips `email_digest=false` for exactly (token.wsId, token.userId), creating sparse row, 200 verified page | VERIFIED | server.js:5348-5356 — unconditional `insert or replace into user_notif_prefs (workspace_id, user_id, prefs)` with merged prefs from `getStoredNotifPrefs(userId, wsId)`; response 200 `text/html; charset=utf-8` + `Cache-Control: no-store` with `notif.unsubscribe.verified` (server.js:5366-5368). Pinned by test "a valid POST flips the stored row…" |
| Forged/stale/rotated/garbage/no-MASTER_KEY → 200 neutral page, never error, never assertion of unsubscription | VERIFIED | server.js:5345-5347,5366 — null key or failed verify ⇒ `payload=null` ⇒ no mutation, `notif.unsubscribe.neutral`; same envelope. Pinned by hostile-token matrix, stale-token, no-MASTER_KEY tests |
| GET = stateless no-op; other methods 405 via fail() with Allow: GET, POST | VERIFIED | server.js:5337-5340 (`res.setHeader('Allow','GET, POST')` before `fail(res,405,'methodNotAllowed',…)`); mutation gated on `method === 'POST'` (5348) |
| Replays convergent: identical response, no burn, idempotent row | VERIFIED | No token state, no claim key anywhere in the path; idempotent upsert; pinned by "replayed POSTs are convergent: byte-identical" test |
| Token never reaches request logs, activity rows, any log call | VERIFIED | Branch at server.js:5423 sits BEFORE the `/api/` branch whose `finish` handler logs pathnames (5430-5434); handler body calls no log* function; contract comment forbids it (5326-5331); source pin test enforces |

### Plan 02 (badge)

| Truth | Status | Evidence |
|---|---|---|
| Three inert push toggles render "coming soon" badge; due_reminder/past_due stay badge-free (D-11) | VERIFIED | src/pages/settings.js:394-396 — badge span in srow description slot on exactly push_mention/push_assign/push_comment; pinned by badge-placement test |
| Toggle behavior unchanged — rendered, clickable, no disabling (D-12) | VERIFIED | `tog(..., 'np')` wiring intact on all three rows; pin asserts no `disabled` in the case block |
| Badge key catalogued EN+FR, i18n gate green | VERIFIED | en.json/fr.json:1250 `settings.notif.pushComingSoon`; `npm run i18n:scan` → 0 literals, 0 pending, 0 unlisted |

## 2. Success criteria SC-1..SC-5

| SC | Status | Evidence |
|---|---|---|
| SC-1 flip + sparse-row creation | VERIFIED | Upsert unconditional for valid tokens (server.js:5351-5356); row-flip test + reminder-resume merge test (other prefs survive) |
| SC-2 convergent replay + GET no-op | VERIFIED | Byte-identical replay test; GET no-op test (D-05) |
| SC-3 no oracle / timing-safe / token never logged | VERIFIED | Timing-safe: mailer.js:148-162 length-guard + `crypto.timingSafeEqual` (Phase 41 helper, unchanged); single one-template response (D-03/D-04, envelope-parity test); route outside logged chain; no log* calls with token |
| SC-4 contract pinned by tests | VERIFIED | Consolidated D-01..D-10/SC contract comment at server.js:5290-5334; source-inspection test pins its anchors; 15-test matrix in test/unsubscribe-route.test.mjs (379 lines) |
| SC-5 digest suite unmodified, full suite green, zero runtime deps | VERIFIED | `git log --follow test/digest.test.mjs` — last commit predates phase 42; `npm test` → 991 tests, 988 pass, 0 fail, 3 env-gated skips; package.json has no `dependencies` block (devDependencies only) |

## 3. Verification commands re-run (this process)

| Command | Result |
|---|---|
| `node --test test/unsubscribe-route.test.mjs` | ✅ 15 pass / 0 fail |
| `node --test test/unsubscribe-token.test.mjs` | ✅ 0 fail (Phase 41 freeze intact) |
| `node --test test/digest.test.mjs` | ✅ 0 fail (unmodified) |
| `node --test test/i18n-core-features.test.mjs` | ✅ 0 fail (catalogue pin green) |
| `npm run i18n:scan` | ✅ 0 literals, 0 pending, 0 unlisted, 0 stale |
| `npm test` (full suite) | ✅ 991 tests — 988 pass / 0 fail / 3 env-gated skips |

## 4. Threat model mitigations (T-42-01..T-42-06)

| Threat | Mitigation in code | Status |
|---|---|---|
| T-42-01 spoofing | Frozen-framing HMAC verify-then-decode (mailer.js:150-180); token-blind IP throttle `unsub\|<ip>` 10/15min fired BEFORE verification (server.js:5341-5344) | PRESENT |
| T-42-02 oracle | One template, one escHtml'd message param (mailer.js:187-202); identical envelope all outcomes; envelope-parity test | PRESENT |
| T-42-03 logging | Branch before `/api/` logging chain; no log calls in handler; contract comment + source pin | PRESENT |
| T-42-04 CSRF | Token-as-credential; structurally outside Fetch-Metadata guard (separate branch, documented D-07 rationale server.js:5321-5324); scope bounded to token payload ids | PRESENT |
| T-42-05 DoS/replay | Idempotent convergent upsert, no burn, no body read; login-family IP budget | PRESENT |
| T-42-06 orphan rows | Accepted — unconditional upsert, digest gate joins memberships | ACCEPTED (as planned) |
| T-42-SC supply chain | No package installs; package.json unchanged (no runtime deps) | PRESENT |

## 5. Artifacts & requirements

- server.js route + contract comment ✅ · mailer.js `decodeUnsubscribePayload` + `buildUnsubscribePage` exported pure (mailer.js:961) ✅ · test/unsubscribe-route.test.mjs (15 tests) ✅ · locales EN+FR (notif.unsubscribe.verified/neutral, err.methodNotAllowed, settings.notif.pushComingSoon) ✅ · DEPLOY.md §14 note (6 "unsubscribe" mentions) ✅ · settings.js badge ✅
- UNSUB-02: SATISFIED — anonymous, throttled, sameOrigin-exempt, convergent, GET no-op.

## 6. Human-verification items (route to /gsd verify-work UAT)

1. **Badge on-screen look** — visual placement/legibility of the badge in the live Settings panel (client-render visual; scope pinned by test).
2. **Real mail-client one-click POST** — end-to-end via a real mail client through Traefik (per 42-CONTEXT landmine: UAT trigger is the injected-clock internal path, not direct public curl). Response-matrix semantics are fully test-pinned server-side.

These are UI/external-integration items only; no code gap is associated with them.

## Verdict

**VERIFICATION_PASSED** — all must-have truths, SC-1..SC-5 and threat mitigations verified against the live codebase; all verification commands green (991 tests, 0 failures); zero runtime dependencies; digest suite unmodified.

---
_Verified: 2026-11-06 — gsd-verifier (goal-backward)_
