---
phase: 42-one-click-unsubscribe-endpoint
plan: 01
subsystem: api
tags: [rfc8058, unsubscribe, hmac, security-contract, i18n, node-test]
requires:
  - phase: 41-unsubscribe-tokens-list-unsubscribe-headers
    provides: frozen HMAC token helpers (makeUnsubscribeToken/verifyUnsubscribeToken), unsubscribeHmacKey() derivation, List-Unsubscribe-Post headers on digest mail
provides:
  - POST/GET /unsubscribe/:token route in the server.js top-level chain with the consolidated D-01..D-10/SC security-contract comment (D-13)
  - exported pure decodeUnsubscribePayload + buildUnsubscribePage in mailer.js
  - test/unsubscribe-route.test.mjs — 14-test contract matrix pinning the full response matrix, throttle, ordering and no-logging rules
  - notif.unsubscribe.verified/neutral + err.methodNotAllowed i18n keys (EN+FR), catalogue pin 1672→1675
  - DEPLOY.md §14 operator note for the live route
affects: [digest send path consumers, 42-02, verify-work phase 42 UAT]
tech-stack:
  added: []
  patterns: [decode-after-verify (verify-then-decode), merge-upsert via getStoredNotifPrefs, token-blind IP-keyed throttle before verification, one-template one-parameter HTML page (D-04), consolidated D-notation contract comment pinned by source-inspection test]
key-files:
  created: [test/unsubscribe-route.test.mjs]
  modified: [server.js, mailer.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, DEPLOY.md]
key-decisions:
  - "405 path sets the Allow header via res.setHeader before fail() — the plan's fail(..., { Allow }) snippet would have leaked 'Allow' into the JSON body (json() does not accept extra headers)"
  - "Page locale = token user's users.locale clamped === 'fr' ? 'fr' : 'en' (decisions_pinned 1; workspaces table has no language column)"
  - "Upsert unconditional for valid tokens (decisions_pinned 2) — orphan rows harmless, response stays a pure function of token validity"
patterns-established:
  - "Anonymous mutating route pattern: top-level chain branch, outside /api/ (unlogged), sameOrigin-exempt by documented rationale"
  - "Source-inspection pin extracting the route's contract comment block via regex"
requirements-completed: [UNSUB-02]
actuals:
  tokens: 9800
  tasks: 3
  commits: 3
commits: 3
plan_head_before: eb90414790859295dfbdfd6305edf644fccd437f
plan_head_after: 173be51
duration: 17 min
completed: 2026-11-06
status: complete
---

# Phase 42 Plan 01: One-Click Unsubscribe Endpoint Summary

**RFC 8058 one-click POST /unsubscribe/:token live end-to-end — timing-safe verify-then-decode flips email_digest=false via convergent merge-upsert, and every token outcome (valid/forged/stale/garbage/no-MASTER_KEY) answers the same 200 HTML envelope with only the localized body text differing, pinned by a 14-test contract matrix.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-06T09:50:46Z
- **Completed:** 2026-11-06T10:07:36Z
- **Tasks:** 3
- **Files modified:** 7 (1 created)

## Accomplishments
- `/unsubscribe/:token` route in the server.js top-level chain (before `/api/` and serveStatic — token never logged, SC-3), with the consolidated D-notation security-contract comment block (D-13) covering token model, {GET, POST} allow-list, replay posture, response matrix, throttle budget, sameOrigin exemption and no-logging rule
- mailer.js gains two exported pure helpers: `decodeUnsubscribePayload` (decode-after-verify, frozen framing) and `buildUnsubscribePage` (one self-contained template, one escHtml'd message parameter — D-04 envelope parity by construction)
- Full contract test matrix in test/unsubscribe-route.test.mjs: happy path (row flipped/created), forged/stale/wrong-version/truncated/garbage/no-MASTER_KEY → neutral page with identical envelope, GET no-op, replay convergence (byte-identical), 405 method matrix, token-blind IP throttle 10/15min fired before verification, ordering pin, D-13 source-inspection pin, stored-row merge pin (reminder resume per Phase 38)
- DEPLOY.md §14 documents the live route, rotation→neutral-page semantics and the shared IP throttle budget

## Task Commits

Each task was committed atomically:

1. **Task 1: tracer — keys, helpers, route, contract comment, happy-path + forged tests** - `7c52f37` (feat)
2. **Task 2: full security-contract test matrix** - `0902f8b` (test)
3. **Task 3: DEPLOY.md §14 route-behavior note** - `173be51` (docs)

## Files Created/Modified
- `server.js` — handleUnsubscribe handler + consolidated contract comment + chain branch before `/api/`
- `mailer.js` — decodeUnsubscribePayload + buildUnsubscribePage, exported pure
- `src/locales/en.json` / `src/locales/fr.json` — notif.unsubscribe.verified/neutral + err.methodNotAllowed
- `test/unsubscribe-route.test.mjs` — new 14-test contract suite
- `test/i18n-core-features.test.mjs` — catalogue pin 1672 → 1675 with trail comment
- `DEPLOY.md` — §14 live-route note

## Decisions Made
- Set the 405 `Allow` header with `res.setHeader` before `fail()` — the plan's literal `fail(..., { Allow })` would have spread it into the JSON body
- Hostile-token garbage case uses an in-alphabet string; out-of-alphabet bytes never match the route regex at all (pinned in the test)
- Empty-token URL (`/unsubscribe/`) structurally cannot reach the route — pinned as "never asserts unsubscription" rather than 200-neutral

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Catalogued err.methodNotAllowed (EN+FR) + pin bump 1674→1675**
- **Found during:** Task 2 verification (`npm test`)
- **Issue:** The new 405 code failed the error-codes gate ("en missing err.methodNotAllowed")
- **Fix:** Added err.methodNotAllowed to both catalogues; catalogue pin re-bumped with trail comment
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs
- **Verification:** test/error-codes.test.mjs + i18n-core-features green
- **Committed in:** 0902f8b (Task 2 commit)

**2. [Rule 1 - Bug] Plan's catalogue-pin numbers were stale (1677 vs actual 1672)**
- **Found during:** Task 1
- **Issue:** The plan assumed the pin sat at 1677; the landing redesign had moved it to 1672
- **Fix:** Bumped from the actual on-disk value (1672 → 1674 → 1675 with err.methodNotAllowed)
- **Files modified:** test/i18n-core-features.test.mjs
- **Verification:** i18n-core-features green
- **Committed in:** 7c52f37, 0902f8b

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 bug). **Impact:** both required for suite green; no scope creep.

## Issues Encountered
- None beyond the deviations above.

## User Setup Required

None - no external service configuration required.

## Verification

| Check | Result |
|-------|--------|
| `node --test test/unsubscribe-route.test.mjs` | ✅ 14/14 pass |
| `node --test test/digest.test.mjs` (unmodified) | ✅ 20/20 pass |
| `node --test test/unsubscribe-token.test.mjs` | ✅ 10/10 pass |
| `node --test test/i18n-core-features.test.mjs` | ✅ pass (pin 1675) |
| `npm run i18n:scan` | ✅ 0 unlisted, 0 pending |
| `npm test` (full suite) | ✅ 990 tests — 987 pass / 0 fail / 3 env-gated skips |

## Next Phase Readiness
- UNSUB-02 route complete; ready for 42-02 and phase verification/UAT.

## Coverage

- id: D1 — description: "Valid POST /unsubscribe/:token flips/creates the stored prefs row with email_digest=false and answers the verified page" — verification: [tests/test/unsubscribe-route.test.mjs#a valid POST flips the stored row..., pass, tests/test/unsubscribe-route.test.mjs#reminder resume (merge pin), pass] — human_judgment: false
- id: D2 — description: "Forged/stale/wrong-version/truncated/garbage/no-MASTER_KEY POSTs answer 200 with the neutral page, identical envelope, no mutation" — verification: [tests/test/unsubscribe-route.test.mjs#forged token, pass; #hostile-token matrix, pass; #stale token, pass; #no MASTER_KEY, pass] — human_judgment: false
- id: D3 — description: "GET is a stateless no-op; other methods 405 with Allow: GET, POST; replays are byte-identical and idempotent" — verification: [tests/test/unsubscribe-route.test.mjs#GET no-op, pass; #method matrix, pass; #replay convergence, pass] — human_judgment: false
- id: D4 — description: "Token-blind IP throttle (unsub|<ip>, 10/15min) fires before verification; route ordering before serveStatic; contract comment present (D-13); token never logged" — verification: [tests/test/unsubscribe-route.test.mjs#throttle, pass; #ordering pin, pass; #source pin, pass] — human_judgment: false
- id: D5 — description: "DEPLOY.md §14 operator note (live route, rotation semantics, throttle reuse)" — verification: [command: grep -c "unsubscribe" DEPLOY.md = 6 (was 5), pass] — human_judgment: false

## Self-Check: PASSED

- test/unsubscribe-route.test.mjs exists: FOUND
- Commits 7c52f37, 0902f8b, 173be51 in git log: FOUND
- Acceptance/verification commands re-run: all PASS (see table)

---
*Phase: 42-one-click-unsubscribe-endpoint*
*Completed: 2026-11-06*
