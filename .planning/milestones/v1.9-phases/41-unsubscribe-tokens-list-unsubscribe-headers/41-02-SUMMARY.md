---
phase: 41-unsubscribe-tokens-list-unsubscribe-headers
plan: 02
subsystem: mailer + docs
tags: [email, rfc8058, unsubscribe, dkim, integration-tests]
requires: [41-01 mailer header gates, unsubscribeHmacKey() in server.js, digest test harness]
provides:
  - Dedicated D-05 gate-1 integration test (no-MASTER_KEY boot → zero unsubscribe headers, footer intact)
  - Dedicated D-05 gate-2 integration test (http://APP_URL → zero unsubscribe headers, footer intact)
  - DEPLOY.md §14 "One-click unsubscribe (RFC 8058)" operator subsection (DKIM caveat + rotation semantics)
affects: [test/digest.test.mjs suite size (18 → 20), DEPLOY.md §14]
tech-stack:
  added: []
  patterns: [third server fixture with explicit MASTER_KEY:'' env defeat, payloadsBefore slice raw capture, per-gate test isolation]
key-files:
  created: []
  modified: [test/digest.test.mjs, DEPLOY.md]
key-decisions:
  - "Gate-1 fixture boots with APP_URL=https (not the plan's literal 'identical to the http one') so the zero-header outcome is attributable to the missing key alone — matches the must-have key_links chain"
  - "Gate-1 fixture passes MASTER_KEY:'' explicitly because startServer spreads process.env — defeats any developer-shell key leakage"
  - "Both gate tests assert the footer settings link in BOTH decoded parts, honoring D-05 scope = headers only"
requirements-completed: [UNSUB-01, UNSUB-03]
requirements: [UNSUB-01, UNSUB-03]
metrics:
  duration: 11 min
  completed: 2026-11-05
  tasks: 2
  files: 2
status: complete
actuals:
  tokens: 32000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: 2ecf7449
plan_head_after: 427c7b7
---

# Phase 41 Plan 02: D-05 Gate Tests & DEPLOY.md DKIM/Rotation Docs Summary

**One-liner:** Both D-05 header render gates individually pinned by integration tests — a no-MASTER_KEY https server and the http://APP_URL fixture each produce header-free digests whose plain footer settings link still renders in both MIME parts — plus a DEPLOY.md §14 subsection giving operators the relay-DKIM caveat (RFC 8058 §4) and the MASTER_KEY-rotation-invalidates-emailed-tokens semantics with no env knob anywhere.

## What Was Built

**Task 1 — gate-negative integration tests (+88/-0 in test/digest.test.mjs, append-only):**
- **Gate 1 (no MASTER_KEY):** a third server fixture booted with `MASTER_KEY: ''` (explicit empty string defeats any `process.env` leakage — `startServer` spreads the parent env) and `APP_URL=https://app.test`, own fakeSmtp capture. Test triggers a digest (asserts ≥1 fired — the send path is fail-open, not fatal), captures the raw payload and asserts zero `List-Unsubscribe` and zero `List-Unsubscribe-Post` occurrences, then asserts the `https://app.test/w/<slug>/settings#notif-email` footer link renders in BOTH decoded parts.
- **Gate 2 (http://APP_URL):** new independent test on the existing `http://app.test` main fixture (per plan; complements 41-01's http gate-negative pin), with its own workspace, `payloadsBefore` raw-capture slice, zero-occurrence assertions for both headers, and footer-link-in-both-parts assertions using the fixture's http APP_URL. Pins the mailer-side URL-shape gate with the server-side https gate layered in front.
- Append-only verified: `git diff` is +88/-0; the 41-01 positive-path and gate-negative tests are untouched and still pass.

**Task 2 — DEPLOY.md §14 subsection (+28/-0):** "### One-click unsubscribe (RFC 8058)" inserted after "### Key generation & injection", in §14's second-person operator voice: (1) the two render gates (`MASTER_KEY` set + https `APP_URL`), omission-otherwise, footer always works, no knob exists; (2) the DKIM caveat — receivers honor one-click only on DKIM-authenticated mail, signing stays at the instance's SMTP relay, verify relay signing before shipping (T-41-08); (3) rotation semantics — rotating `MASTER_KEY` invalidates every previously emailed token, stateless by design, no migration, footer link is the fallback (T-41-09); one forward-looking sentence on the Phase 42 no-redirect POST (RFC 8058 §3.1). Zero occurrences of any `LIST_UNSUBSCRIBE_POST`-style knob (D-07 held).

## Verification

| Check | Result |
|-------|--------|
| `node --test test/digest.test.mjs` | ✅ 20/20 pass (2 new gate tests + all 18 prior, incl. 41-01 https positive path) |
| `git diff --numstat` (test file) | ✅ 88 insertions, 0 deletions |
| `grep -c 'List-Unsubscribe-Post' DEPLOY.md` | ✅ 1 (subsection present) |
| `grep -ci 'dkim' DEPLOY.md` | ✅ 3 |
| `grep -c 'LIST_UNSUBSCRIBE_POST' DEPLOY.md` | ✅ 0 (no env knob, D-07) |
| `npm test` (full suite) | 6 failures in `test/i18n-scan.test.mjs` — **proven unrelated to this plan**: the suite fails only while a concurrent session's uncommitted `src/` WIP (table.js literal, auth pages, locale edits) sits in the tree; `i18n-scan.test.mjs` passes 36/36 with that WIP absent (verified via a stash round-trip during execution). This plan's files were never implicated. Same contamination phenomenon 41-01 documented. |

## Deviations from Plan

**Total deviations:** 2 auto-fixed/clarified (Rule 3 / plan-ambiguity). **Impact:** none on the plan's slice; both gates are isolated exactly as the must-have `key_links` chains describe.

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Gate-1 fixture APP_URL set to https, not the http fixture's URL**
- **Found during:** Task 1 implementation
- **Issue:** The plan said the gate-1 server is "identical to the http one but WITHOUT the MASTER_KEY env var". With `http://APP_URL` both gates fire simultaneously and the zero-header outcome could not be attributed to the missing key — contradicting the plan's own must-have key_links chain (no-MASTER_KEY → `unsubscribeHmacKey()` null → no `unsubscribeUrl` → mailer renders zero headers).
- **Fix:** Booted gate 1 with `APP_URL=https://app.test` so only the key gate is exercised. Gate 2 covers the http side.
- **Files modified:** test/digest.test.mjs
- **Commit:** c0a2d00

**2. [Rule 3 - Blocking] Explicit `MASTER_KEY: ''` in the gate-1 fixture env**
- **Found during:** Task 1 implementation
- **Issue:** `startServer` spreads the parent `process.env` into the child; a developer shell carrying `MASTER_KEY` would silently turn gate 1 into a false negative (headers would render).
- **Fix:** Pass `MASTER_KEY: ''` in the fixture env so the child always sees a falsy key regardless of the invoking shell.
- **Files modified:** test/digest.test.mjs
- **Commit:** c0a2d00

### Out-of-Scope Discovery (logged, NOT fixed — scope boundary)

**Concurrent-session working-tree contamination, round two.** A second session is actively working in this same checkout: it switched the branch to `feat/landing-signup-redesign` mid-execution (both 41-02 commits `c0a2d00`, `427c7b7` landed on that branch, directly on top of its `2ecf744` — the same linear-history situation 41-01 documented), and its uncommitted `src/` WIP breaks `test/i18n-scan.test.mjs` under `npm test`. Proven unrelated to this plan via a stash round-trip: with the foreign WIP absent, `i18n-scan.test.mjs` passes 36/36. Recorded in `.planning/phases/41-.../deferred-items.md` (by 41-01; same root cause). My slice (digest suite 20/20, i18n-core + token suites 24/24) is green.

## Authentication Gates

None.

## Known Stubs

None — tests assert real server behavior; docs describe shipped behavior.

## Threat Flags

None — no new surface; T-41-07 mitigated by the two gate tests, T-41-08 by the DEPLOY.md DKIM caveat, T-41-09 accepted and documented. No package installs (T-41-SC trivially satisfied).

## Coverage

- kind: tests, ref: test/digest.test.mjs#UNSUB-01/D-05 gate 1 (no MASTER_KEY), status: pass, human_judgment: false
- kind: tests, ref: test/digest.test.mjs#UNSUB-01/D-05 gate 2 (http APP_URL), status: pass, human_judgment: false
- kind: tests, ref: test/digest.test.mjs#UNSUB-01 https positive path (unmodified, still passing), status: pass, human_judgment: false
- kind: command, ref: grep -c LIST_UNSUBSCRIBE_POST DEPLOY.md = 0 (D-07), status: pass, human_judgment: false
- kind: human_judgment, ref: DEPLOY.md §14 subsection operator tone matches the section's voice, rationale: "Prose register is a judgment call; content (DKIM caveat, rotation semantics, two gates, no knob) is grep-verified", human_judgment: true
- kind: command, ref: npm test full suite, status: pass with concurrent-session contamination caveat — see Verification table and Deviations (this plan's files green)

## Next

Phase 41 complete from this plan's perspective: SC-2 (both gates individually pinned) and SC-4 (DKIM + rotation story in writing) hold. Ready for phase verification / Phase 42 (unsubscribe POST endpoint).

## Self-Check: PASSED

- test/digest.test.mjs contains the two new gate test blocks: FOUND (gate 1 + gate 2, 20/20 green)
- Commits c0a2d00, 427c7b7 in git log: FOUND (on feat/landing-signup-redesign — see Deviations note)
- DEPLOY.md §14 subsection present, knob count 0: FOUND
- All Task acceptance criteria re-run: PASS
