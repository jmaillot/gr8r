---
phase: 09-server-messages-activity-history
plan: 06
subsystem: server-security-hardening
tags: [trust-proxy, throttle, host-header, csrf, boot-gate, tests]
requires: [09-04 (error-code transport + fail() contract), 09-07 (test suite green at 419+)]
provides:
  - TRUST_PROXY opt-in default — X-Forwarded-* never trusted without an explicit true
  - APP_URL-mandatory boot gate when SMTP_HOST is set (exit 1 before listen)
  - sameOrigin guard on /api/auth/login and /api/auth/signup (WR-07 parity)
  - 7 new integration/boot tests pinning all three closures
affects: [11-french-sweep-build-gate-ship-hardening (ship hardening reads DEPLOY.md), 10-browser-coverage (login still Origin-less friendly)]
tech-stack:
  added: []
  patterns: [env-var opt-in instead of deny-list, boot-time configuration gate, guard-before-throttle ordering]
key-files:
  created: []
  modified:
    - server.js
    - test/server-boot.test.mjs
    - test/error-codes.test.mjs
    - .env.example
    - DEPLOY.md
key-decisions:
  - "TRUST_PROXY flips from deny-list ('!== false') to allow-list ('=== true') — the four consumers (proto, clientIp, sameOrigin, x-forwarded-host in publicBase) follow the single switch with no other code change"
  - "The APP_URL boot gate lives in main() beside the mailer boot logs — one site, before server.listen, operator-facing stderr message naming both variables (not an HTTP error, outside i18n)"
  - "The sameOrigin guard sits before the body read AND before the throttle on both session routes — a cross-origin POST cannot consume the victim IP's attempt budget"
  - "docker-compose.yml untouched: it already passes TRUST_PROXY=true explicitly, so the Traefik container deployment keeps its behaviour"
patterns-established:
  - "Opt-in trust: anything proxy-attacker-controlled is read only on an explicit opt-in variable, never excluded by a deny-list"
  - "Fail at boot, not at first use: configuration that is only exploitable per-request (APP_URL with SMTP_HOST) is gated at startup"
requirements-completed: [ERR-01, ERR-02]
duration: 4 min
completed: 2026-10-24
status: complete
plan_head_before: ffcbd0b
plan_head_after: ec0c945
actuals:
  tokens: 4113
  tasks: 3
  commits: 3
coverage:
  - id: D1
    description: "TRUST_PROXY defaults off — by default the login throttle keys on the socket address and X-Forwarded-For rotation hits 429 tooManyLoginAttempts on the 11th attempt (WR-03, T-09-09)"
    requirement: ERR-01
    verification:
      - kind: integration
        ref: test/error-codes.test.mjs#without the TRUST_PROXY opt-in, rotating X-Forwarded-For no longer escapes the login throttle (WR-03)
        status: pass
      - kind: integration
        ref: test/error-codes.test.mjs#with TRUST_PROXY=true the documented behind-proxy behaviour is preserved: rotated X-Forwarded-For does not trip the throttle
        status: pass
      - kind: command
        ref: "grep -q \"=== 'true'\" server.js"
        status: pass
    human_judgment: false
  - id: D2
    description: "SMTP_HOST without APP_URL refuses to boot (exit 1, stderr names both variables); with APP_URL set the boot succeeds and /api/config serves APP_URL (WR-04, T-09-10)"
    requirement: ERR-01
    verification:
      - kind: integration
        ref: test/server-boot.test.mjs#boot gate: SMTP_HOST without APP_URL refuses to start and names both variables
        status: pass
      - kind: integration
        ref: test/server-boot.test.mjs#boot gate positive control: mail enabled with APP_URL set boots and answers /api/config
        status: pass
    human_judgment: false
  - id: D3
    description: "Login and signup reject a hostile Origin with the standard 403 crossOriginRejected (byte-identical to the other 9 guard sites), placed before the body read and before the throttle; Origin-less clients still succeed (WR-07, T-09-11)"
    requirement: ERR-02
    verification:
      - kind: integration
        ref: test/error-codes.test.mjs#a hostile Origin is rejected on login and signup with the standard crossOriginRejected 403 (WR-07)
        status: pass
      - kind: integration
        ref: test/error-codes.test.mjs#positive control: the harness login without an Origin header still succeeds (WR-07 guard is browser-scoped)
        status: pass
    human_judgment: false
  - id: D4
    description: "Docs state the real default: .env.example shows TRUST_PROXY=false with the opt-in rationale; DEPLOY.md rewrites the 'the default' claim, the container recommendation and the APP_URL-mandatory rule"
    requirement: ERR-01
    verification:
      - kind: command
        ref: "grep -c APP_URL DEPLOY.md (non-zero) and .env.example carries TRUST_PROXY=false"
        status: pass
    human_judgment: true
    rationale: "Whether the documentation wording is honest and complete for an operator is a judgment call; only the greps are automatable."
---

# Phase 9 Plan 6: Security gap closure — TRUST_PROXY opt-in, APP_URL boot gate, session-route sameOrigin Summary

**Closed the three review security warnings (WR-03, WR-04, WR-07): X-Forwarded-* trust is now an explicit opt-in so header rotation cannot escape the login throttle, SMTP_HOST without APP_URL refuses to boot so invite links cannot be host-poisoned, and the two session-establishing endpoints carry the same sameOrigin guard as every other mutation — 7 new tests, full suite 431 green.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-10-24T13:18:00Z
- **Completed:** 2026-10-24T13:22:20Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- **WR-03 / T-09-09 (Task 1, `3278ff5`):** `server.js:67` flips from `process.env.TRUST_PROXY !== 'false'` to `=== 'true'`. By default the server reads NO `X-Forwarded-*` header — `clientIp()` falls back to the socket address, so the login throttle key is no longer attacker-chosen; the four consumers (proto, clientIp, sameOrigin, x-forwarded-host in publicBase) follow the single switch. Proved on a real server: 11 failed logins with a rotated `X-Forwarded-For` per request end in `429 tooManyLoginAttempts` on the default server, and stay plain 401s with `TRUST_PROXY=true` (the documented behind-proxy posture). Header comment, `.env.example` and `DEPLOY.md` now state the real default; `docker-compose.yml` is untouched (it already passes `TRUST_PROXY=true` explicitly for the Traefik deployment).
- **WR-04 / T-09-10 (Task 2, `c748af4`):** a boot gate in `main()` — `MAILER.enabled` with an empty `APP_URL` exits 1 before the listener opens, with an operator message naming both variables (invite links would otherwise be built from the request's Host header). Negative test proves the refusal (exit code 1 + stderr naming SMTP_HOST and APP_URL via a real spawn); positive test proves the mail-enabled boot succeeds and `/api/config` reports `url: APP_URL`. DEPLOY.md and .env.example document the new mandatory pairing.
- **WR-07 / T-09-11 (Task 3, `ec0c945`):** `/api/auth/login` and `/api/auth/signup` — the only mutations without an origin guard — now return the standard `fail(403, 'crossOriginRejected', 'Cross-origin request rejected')` (byte-identical to the other 9 sites), placed before the body read AND before the throttle so a cross-origin POST cannot consume the victim IP's attempt budget. `sameOrigin()` itself is unchanged (no-Origin clients like curl/harness stay open), pinned by a positive-control test.

## Verification

- `node --test test/error-codes.test.mjs` — 24/24 pass (20 pre-existing + 4 new)
- `node --test test/server-boot.test.mjs` — 4/4 pass (2 pre-existing + 2 new)
- `npm test` — 431 tests, 0 fail, 0 skip (real servers)
- `npm run build` — green (no client literal added, i18n scan untouched)
- `git diff docker-compose.yml` — empty (container keeps TRUST_PROXY=true)
- The throttle-rotation and cross-origin tests run against real spawned servers via the shared harness; `BASE_ENV` pins neither TRUST_PROXY nor APP_URL/SMTP_HOST, so the defaults under test are exercised genuinely.

## Task Commits

1. **Task 1: TRUST_PROXY opt-in (WR-03)** - `3278ff5` (feat)
2. **Task 2: APP_URL boot gate (WR-04)** - `c748af4` (feat)
3. **Task 3: sameOrigin on login/signup (WR-07)** - `ec0c945` (feat)

## Files Created/Modified

- `server.js` - the opt-in constant, the APP_URL boot gate, the two origin guards
- `test/error-codes.test.mjs` - 4 new tests (throttle rotation ×2, hostile Origin, positive control)
- `test/server-boot.test.mjs` - 2 new boot-gate cases (negative + positive)
- `.env.example` - TRUST_PROXY=false documented; APP_URL-mandatory note
- `DEPLOY.md` - default truth (155), rewritten proxy paragraph (163), APP_URL requirement, container recommendation (684)

## Decisions Made

- Allow-list (`=== 'true'`) instead of deny-list for the trust switch — any value other than the literal `true` is untrusted.
- Boot gate message stays a plain English operator message on stderr — it is not an HTTP error and sits outside the i18n catalogue perimeter (no catalogue key added, no new err.* code).
- Guard-before-throttle ordering on the session routes — the review's own correction (a cross-origin attacker must not drain the victim's IP budget).

## Deviations from Plan

None - plan executed exactly as written. The negative boot-gate test additionally spawns a real process once to capture the exit code and stderr directly (the harness only reports a summary error) — a test-strength addition inside the plan's own sketch, not a behaviour change.

## Issues Encountered

- `npm run lint` reports 3 pre-existing errors in files this plan does not touch (`test/locale-negotiate.test.mjs` no-undef ×2, `test/server-boot.test.mjs:30` no-regex-spaces in pre-existing code) — verified failing at the base commit `ffcbd0b`, logged in `deferred-items.md` by 09-07, untouched per the scope boundary.
- `npm run format:check` fails on a pre-existing set of files including the files this plan touches (verified failing at base) — not introduced by this plan.

## User Setup Required

None - no external service configuration required. Operators who expose the app behind a proxy NOT using the bundled docker-compose must now set `TRUST_PROXY=true` explicitly (documented in DEPLOY.md), and operators who configure `SMTP_HOST` must set `APP_URL` or the server refuses to boot.

## Next Phase Readiness

- All three review warnings assigned to this plan are closed; threats T-09-09 (high) and T-09-10 (high) are mitigated, nothing high remains open for phase 9.
- Phase 9 has no remaining PLAN without SUMMARY — phase complete, ready for `/gsd-verify-work 9` and then phase 10 planning.

## Self-Check: PASSED

All five modified files exist on disk; all four commits (3278ff5, c748af4, ec0c945, 06f98d7) are reachable from HEAD; test suites re-run green after the summary (error-codes 24/24, server-boot 4/4, npm test 431/0 fail).

---
*Phase: 09-server-messages-activity-history*
*Completed: 2026-10-24*
