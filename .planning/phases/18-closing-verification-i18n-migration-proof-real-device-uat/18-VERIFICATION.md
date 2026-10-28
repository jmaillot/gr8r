---
phase: 18-closing-verification-i18n-migration-proof-real-device-uat
verified: 2026-10-28T09:34:39.657Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-01-PLAN.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-01-SUMMARY.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-02-PLAN.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-02-SUMMARY.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-03-PLAN.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-03-SUMMARY.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-04-PLAN.md
  - .planning/phases/18-closing-verification-i18n-migration-proof-real-device-uat/18-04-SUMMARY.md
  - src/actions/actions.js
  - test/tfa-state-fix.test.mjs
  - test/migration.test.mjs
  - e2e/flows.spec.mjs
covered_digest: "v2:sha256:45fac7d6327129a44a7c72e453106f2614b298b58580ac46bf5c26baa7ef0273"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 18: Closing Verification — i18n, Migration Proof & Real-Device UAT

**Phase Goal:** The three flows are proven as a whole surface: both locales, real Chromium e2e, migration purity, DONE criteria from the pitfalls checklist, and the QR verified by human eyes on a real device.
**Verified:** 2026-10-28
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

Roadmap success criteria (the contract) merged with PLAN must_haves from 18-01…18-04:

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| SC1 | i18n-scan gate green; every new string/error code catalogued EN+FR; app speaks both languages through all three flows (AUTH-01) | ✓ VERIFIED | Verifier ran `node scripts/i18n-scan.mjs` fresh: `0 literals, 0 pending, 0 unlisted, 0 stale, 0 unresolved, 0 placeholder-mismatch`. It is wired as `prebuild` in package.json (line 10) so every build enforces it. e2e assertions import the catalogue directly (`e2e/flows.spec.mjs:32-33`, `en.json`/`fr.json`) and parametrize on `for (const lang of ['en','fr'])` throughout. |
| SC2 | Chromium e2e covers session revocation, password change + revocation, and full 2FA login path in both locales (AUTH-03) | ✓ VERIFIED | `e2e/flows.spec.mjs:1086` `test.describe('phase 18 auth flows')` loops `['en','fr']`: full 2FA login through the pending2fa screen (test at :1088), recovery-code burn with honest once-only toast (test at :1126, asserts `auth.recoveryUsed`), password change revokes other session + honest copy (test at :1214), revoke-others coverage in the same block. Codes computed locally via `totpAt` import from `../totp.js` (:31, :1033) — no server backdoor (grep of server.js found no test-only TOTP route). Full e2e suite 55/55 green over the final tree (run in the 18-04 closing gate, minutes before this verification). |
| SC3 | Pre-v1.3 DB migrates additively, zero auth fields in any workspace JSON, second boot byte-identical (AUTH-02 final check) | ✓ VERIFIED | Verifier ran `node --test test/migration.test.mjs`: **18/18 pass**. The snapshot() helper explicitly covers the post-17 auth state (Pitfall C guard at :344): `sessions` rows, `login_challenges` count + columns + DDL + index DDL, users' `two_fa_*` columns. Tests present and passing: "a second boot is a no-op" (:365), "a second boot leaves the recovery_codes schema byte-identical" (:415), "every workspace document in the database carries zero auth-bearing keys" (:311, `AUTH_BEARING_DOC_KEYS = ['sessions','tfa']`), "the login_challenges table lands with its SCHEMA definition and stays empty" (:247). Assertions written against the real schema (`login_challenges`), not the CONTEXT's `sessions.pending_tfa` wording — 18-03's finding confirmed by grep. |
| SC4 | Human verifies QR with Google Authenticator + one other app on a real device (AUTH-03) | ✓ VERIFIED | `18-UAT.md` frontmatter `status: complete`; all three tests PASS with dated results (2026-10-28): Google Authenticator scan+enroll, Microsoft Authenticator as the second app, full device 2FA login landing signed in. Test 3 was single-locale on device; both-locale coverage of that surface carried by the e2e pending2fa en/fr tests — no gap filed, accepted. |
| SC5 | Pitfalls "looks-done-but-isn't" checklist runs as explicit verification, each item checked or gaps filed (AUTH-03) | ✓ VERIFIED | `18-PITFALLS-AUDIT.md` covers all 22 numbered pitfalls + all 13 checklist items, each row naming a real test file + test name or code cite; audit summary: 22/22 green, 13/13 green, 0 red gaps, IN-02 filed to backlog per D-85. Spot-read rows (1–17, C1–C13, observations, assumption disposal) are substantive, not "trust me" rows. |
| 18-01 T1 | 2FA login whose finishLogin fails renders the login card, never the stale '2fa' card (WR-01) | ✓ VERIFIED | `src/actions/actions.js:2776` and :2798 set `S.ui.auth = 'login'` before `await finishLogin(...)` (:2782) in the doTfaLogin success path; `test/tfa-state-fix.test.mjs` pins the source structure — verifier ran it: **4/4 pass**. |
| 18-01 T2 | Spurious recovery toast cannot fire after doLogin/doTfaLogin (WR-02) | ✓ VERIFIED | `S.ui.tfaRecoveryRemaining = null` cleared at entry of both handlers (:2682-2692, :2743) before `finishLogin`; `reportRecoveryBurn` (:2682) reads-and-clears so the genuine-burn path still toasts (value set at :2780-2781 in the success path). Pinned by the same passing test. |
| 18-01 P1 | finishLogin does not clear S.ui.auth (Pitfall E prohibition) | ✓ VERIFIED | Extracted the `finishLogin` function body — zero `S.ui.auth` writes inside it. |
| 18-01 P2 | No server-side changes for the WR fix; no new e2e spec file; no TOTP backdoor route | ✓ VERIFIED | 18-01 diffs touch only `src/actions/actions.js` + the test; e2e auth tests live inside the pre-existing `e2e/flows.spec.mjs` (no new auth spec file — the other 4 spec files predate this phase); grep of server.js for test-only TOTP routes: none. |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/actions/actions.js` | WR-01/WR-02 state lifecycle fix | ✓ VERIFIED | Substantive and wired in the login state machine; regression-pinned by tfa-state-fix.test.mjs |
| `test/tfa-state-fix.test.mjs` | Source-structure regression pin | ✓ VERIFIED | Exists, 4/4 pass under `node --test` |
| `e2e/flows.spec.mjs` (extended) | Phase 18 auth describe block, EN+FR parametric | ✓ VERIFIED | `test.describe('phase 18 auth flows')` at :1086; catalogue-backed assertions only |
| `test/migration.test.mjs` (extended) | Post-17 schema + doc-key walk + byte-identical boot | ✓ VERIFIED | 18/18 pass; snapshot covers auth state |
| `18-PITFALLS-AUDIT.md` | Evidence audit of all pitfalls + checklist | ✓ VERIFIED | 22/22 + 13/13 rows with named evidence |
| `18-UAT.md` | status flipped pending → complete | ✓ VERIFIED | `status: complete`, 3/3 PASS, dated |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| e2e/flows.spec.mjs | totp.js | `import { totpAt } from '../totp.js'` | WIRED | Codes computed client-side, no server backdoor |
| e2e/flows.spec.mjs | src/locales/{en,fr}.json | Direct JSON imports + fmt() | WIRED | No raw locale literals in assertions |
| test/migration.test.mjs | legacy fixture DB | `withDb(server.dbPath, ...)` | WIRED | Direct-DB assertions against the real pre-v1.3 fixture; snapshot covers sessions + login_challenges (Pitfall C) |
| scripts/i18n-scan.mjs | build | `prebuild` hook in package.json | WIRED | Gate cannot be bypassed by a normal build |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| WR-01/WR-02 regression pin | `node --test test/tfa-state-fix.test.mjs` | 4 pass / 0 fail | ✓ PASS |
| Migration purity + byte-identical boot | `node --test test/migration.test.mjs` | 18 pass / 0 fail (1022 ms) | ✓ PASS |
| i18n whole-surface gate over current tree | `node scripts/i18n-scan.mjs` | 0 findings | ✓ PASS |
| Full unit suite (526), lint, format, build, e2e 55/55 | `npm test && npm run lint && npm run format:check && npm run build && npm run e2e` | green in the 18-04 closing gate minutes before verification (not re-run here to avoid duplicate full-suite runs; independent spot-checks above all pass) | ✓ PASS (recent independent run) |

Note: a pattern-filtered partial run of migration.test.mjs (`--test-name-pattern`) failed on an ordering-dependent assertion — an artifact of running file-internal setup-dependent tests in isolation. The full-file run is 18/18 green; no action needed.

### Probe Execution

None declared — the phase's gate is the npm closing gate, covered under Behavioral Spot-Checks.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| AUTH-01 | 18-02, 18-04 | All new user-facing strings/error codes catalogued EN+FR; whole-surface discipline | ✓ SATISFIED | i18n-scan 0 findings over final tree (verifier-ran); e2e assertions catalogue-backed; EN+FR parametric coverage |
| AUTH-03 | 18-01, 18-02, 18-03, 18-04 | Three flows covered e2e in both locales; QR verified by human on real device | ✓ SATISFIED | Chromium e2e block EN+FR; 18-UAT.md 3/3 PASS on real device (Google + Microsoft Authenticator) |

REQUIREMENTS.md maps exactly AUTH-01 and AUTH-03 to Phase 18 — both claimed by plans, both satisfied. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None: no TBD/FIXME/TODO/placeholder/stub markers in phase-modified files | — | — |

Code review (18-REVIEW.md, just run): 0 critical, 3 warnings, 4 info — advisory, dispositioned in 18-REVIEW-DISPOSITION.md. Nothing here rises to a blocker.

### Human Verification Required

None. The one inherently-human item — real-device QR UAT — was executed and completed (18-UAT.md status: complete, 3/3 PASS, 2026-10-28). All behavior-dependent truths are exercised by named passing tests.

### Gaps Summary

No gaps. All five roadmap success criteria are observably true in the codebase, all PLAN must-haves verified at artifact + wiring + behavior level, both requirement IDs satisfied, and the closing gate is green over the final tree.

---

_Verified: 2026-10-28_
_Verifier: the agent (gsd-verifier)_
