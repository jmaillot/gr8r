---
phase: 41-unsubscribe-tokens-list-unsubscribe-headers
plan: 01
subsystem: mailer
tags: [email, rfc8058, unsubscribe, hmac, i18n]
requires: [MASTER_KEY env, APP_URL env, digest send path (server.js), buildDigestMessage (mailer.js)]
provides:
  - makeUnsubscribeToken(key, wsId, userId) — frozen RFC 8058 token format (Phase 42 contract)
  - unsubscribeUrl(key, appUrl, wsId, userId)
  - verifyUnsubscribeToken(key, tokenB64url) — timing-safe verification path for Phase 42's route
  - unsubscribeHmacKey() — purpose-tagged sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1') derivation in server.js
  - i18n key notif.digest.unsubscribe (en + fr)
affects: [server.js digest send site, mailer.js buildDigestMessage, i18n catalogue size pin (1677)]
tech-stack:
  added: []
  patterns: [purpose-tagged sha256 key derivation (encryptTotpSecret precedent), conditional-spread header rendering, length-guard-then-timingSafeEqual, Phase 40 named-export pure-helper pattern]
key-files:
  created: [test/unsubscribe-token.test.mjs]
  modified: [mailer.js, server.js, src/locales/en.json, src/locales/fr.json, test/digest.test.mjs, test/i18n-core-features.test.mjs]
key-decisions:
  - "Domain separation via sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1') — one createHash, two chained updates, matching the encryptTotpSecret precedent (research D-item discretion)"
  - "Token framing frozen as 0x01 ‖ wsId(36B) ‖ userId(36B) ‖ HMAC-SHA256(32B) — internal UUIDs make delimiter-free framing unambiguous (research Open Question 1)"
  - "Both-layer gate defense: server omits unsubscribeUrl unless MASTER_KEY set AND APP_URL https; mailer additionally refuses non-https URLs"
  - "Footer settings link targets /w/:slug/settings#notif-email (D-04 discretion) and renders unconditionally — independent of both header gates"
requirements-completed: []
requirements: [UNSUB-01, UNSUB-03]
metrics:
  duration: 18 min
  completed: 2026-11-05
  tasks: 2
  files: 7
status: complete
actuals:
  tokens: 47000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 5c8bac4374d622b7ababf278bcfccab0f164e025
plan_head_after: cae77f2e8cb01c693ea2672ddda408a9f2ef60d0
---

# Phase 41 Plan 01: Unsubscribe Tokens & List-Unsubscribe Headers Summary

**One-liner:** RFC 8058 one-click unsubscribe wired end-to-end — frozen HMAC token helpers (0x01 ‖ wsId ‖ userId ‖ MAC, timing-safe verify), purpose-tagged `sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1')` derivation, gated `List-Unsubscribe`/`-Post` headers between Subject and Date, and an unconditional localized footer settings link in both MIME parts.

## What Was Built

**Task 1 (tracer) — end-to-end one-click digest path:**
- `mailer.js`: three exported pure helpers (`makeUnsubscribeToken`, `unsubscribeUrl`, `verifyUnsubscribeToken`) with a phase-tagged block comment; keys are arguments — the mailer module stays key-free (pure-renderer rule). `verifyUnsubscribeToken` uses strict exact-length framing + version-byte check + length-guard-then-`crypto.timingSafeEqual`.
- `mailer.js buildDigestMessage`: conditional-spread `List-Unsubscribe: <url>` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` inserted between Subject and Date, rendered only when `msg.unsubscribeUrl` exists AND starts with `https://` (no http:// downgrade — omitted entirely). Footer link (`appUrl + /w/:slug/settings#notif-email`) rides inline after the footer sentence in the text join and as an escaped `<a>` inside the HTML footer paragraph — unconditional, independent of the header gates. SC-5 catch fallback gained the English unsub literal.
- `server.js`: `unsubscribeHmacKey()` near the keyring block (fail-open-null when MASTER_KEY unset; never raw MASTER_KEY, never the AES envelope path); `unsubscribeUrl` imported from mailer.js; the digest send site gained exactly one conditional msg field (`ws.id, r.user_id` ordering) — existing fields and the byte-identical claim key untouched.
- `src/locales/en.json` + `fr.json`: `notif.digest.unsubscribe` after `notif.digest.footer` in both (EN: "Unsubscribe from these emails"; FR: "Se désabonner de ces e-mails").
- `test/digest.test.mjs` (+109, zero deletions): second server fixture with `APP_URL=https://app.test` + its own SMTP capture (own `before`/`after`, purely additive); positive-path test asserting both header strings verbatim, Subject → List-Unsubscribe → List-Unsubscribe-Post → Date order, token alphabet/padding/CR-LF pins, 105-byte decode framing (version/wsId/userId), `verifyUnsubscribeToken` true against the replicated server derivation, and the settings URL in both parts; gate-negative test pinning the http fixture digest carries NO unsubscribe headers while the footer link still renders.
- `test/i18n-core-features.test.mjs`: catalogue-size pin 1676 → 1677 with the established `+ notif.digest.unsubscribe, phase 41 plan 1` trail (Rule 3 blocking fix — the pin fails on any catalogue growth).

**Task 2 (tdd freeze) — `test/unsubscribe-token.test.mjs`:** 10 pure-unit blocks (no server boot, fixed literal key/UUIDs) pinning determinism, version-byte position, 36-byte framing, base64url alphabet / no padding / no CR-LF, exact URL shape, purpose-tag domain separation, payload+MAC single-byte tamper rejection, key binding, truncated/oversized/wrong-version/garbage inputs returning false without throwing, and the timing-safe compare path (source inspection + behavioral length-guard).

## Verification

| Check | Result |
|-------|--------|
| `node --test test/unsubscribe-token.test.mjs` | ✅ 10/10 pass |
| `node --test test/digest.test.mjs` | ✅ 18/18 pass (Phase 38/40 tests unmodified, 0 deletions in diff) |
| `npm test` (full suite) | ✅ 963 tests — 960 pass / 0 fail / 3 env-gated skips (verified at Task 1 commit a371e24, before a concurrent session's unrelated WIP landed — see Deviations) |
| `npm run i18n:scan` | ✅ green at Task 1 commit; ❌ at SUMMARY time — 1 unlisted literal in `src/views/table.js:87` from ANOTHER session's uncommitted WIP (not this plan's files) |
| Acceptance criteria | All Task 1 criteria re-run individually: PASS (grep counts, export line, purpose tag, send-site arg order, digest diff additions-only) |

## Deviations from Plan

**Total deviations:** 1 auto-fixed (Rule 3) + 1 out-of-scope discovery. **Impact:** none on the plan's slice.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] i18n catalogue-size pin (1676 → 1677)**
- **Found during:** Task 1 verification (`npm test`)
- **Issue:** `test/i18n-core-features.test.mjs` pins the exact catalogue size; the new key moved it 1676 → 1677.
- **Fix:** Bumped the pinned count and appended `+ notif.digest.unsubscribe, phase 41 plan 1` to the test's established addition-trail description (the same pattern every prior i18n phase used).
- **Files modified:** test/i18n-core-features.test.mjs
- **Commit:** a371e24

### Out-of-Scope Discovery (logged, NOT fixed — scope boundary)

**Concurrent-session working-tree contamination.** A second session created/checked out `feat/landing-signup-redesign` (based exactly on plan HEAD `5c8bac4`) and left uncommitted WIP in `src/pages/auth.js`, `src/views/table.js` (adds `export const probe = 'A literal that was never extracted'`), `src/styles/pages/auth.css`, `public/logo-*.svg`, and `page.auth.panelLine` keys in en/fr.json. At SUMMARY time this breaks `npm run i18n:scan` (table.js:87) and `test/i18n-vocab.test.mjs` — **not caused by 41-01**; the full suite and scan were verified green at Task 1 commit `a371e24` before the foreign WIP landed. Recorded in `.planning/phases/41-.../deferred-items.md`. My committed files were re-verified green after the contamination: token suite 10/10, digest suite 18/18, i18n-core 14/14.

**Note:** the plan's Task 1 commit landed on branch `feat/landing-signup-redesign` (the working tree was switched off `main` between the executor's start-time check and the first commit, by that concurrent session). The branch base is byte-identical to plan HEAD `5c8bac4`, so history is linear and correct; both 41-01 commits (`a371e24`, `cae77f2`) sit directly on it.

## Authentication Gates

None.

## Known Stubs

None — every value flows from real server-side derivation or the catalogue; no placeholders.

## Threat Flags

None — no new surface beyond the plan's threat model; all five mitigations (T-41-01..05) landed as specified (T-41-01/02/03 frozen by the unit suite, T-41-04/05 by the integration pins).

## Coverage

- kind: tests, ref: test/unsubscribe-token.test.mjs (10 blocks), status: pass, human_judgment: false
- kind: tests, ref: test/digest.test.mjs#UNSUB-01 https positive path, status: pass, human_judgment: false
- kind: tests, ref: test/digest.test.mjs#UNSUB-01/D-05 http gate-negative pin, status: pass, human_judgment: false
- kind: tests, ref: test/digest.test.mjs (Phase 38/40 suite unmodified), status: pass, human_judgment: false
- kind: command, ref: npm test (963 tests, 0 fail), status: pass, human_judgment: false
- kind: command, ref: npm run i18n:scan, status: pass, human_judgment: false (green at Task 1 commit; SUMMARY-time failure is a concurrent session's unrelated WIP — see Deviations)
- Deliverable "DEPLOY.md DKIM caveat": NOT in this plan (Plan 02 per plan output spec) — no coverage entry owed here.

## Next

Plan 02 (gate-negative suite hardening + DEPLOY.md §14 DKIM/rotation subsection) — ready for 41-02.

## Self-Check: PASSED

- test/unsubscribe-token.test.mjs exists: FOUND
- Commits a371e24, cae77f2 in git log: FOUND
- Acceptance criteria re-run: all PASS
- Note: SUMMARY-time `npm run i18n:scan` red is attributable to a concurrent session's uncommitted table.js literal (out of scope, documented above); the plan's own slice is green.
