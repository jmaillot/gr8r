---
phase: 77-maintenance-debt
verified: 2026-11-19T21:30:00Z
status: passed
score: 8/8 must-haves verified
covered_files:
  - .planning/phases/77-maintenance-debt/77-01-PLAN.md
  - .planning/phases/77-maintenance-debt/77-01-SUMMARY.md
  - .planning/phases/77-maintenance-debt/77-02-PLAN.md
  - .planning/phases/77-maintenance-debt/77-02-SUMMARY.md
  - .planning/phases/77-maintenance-debt/77-03-PLAN.md
  - .planning/phases/77-maintenance-debt/77-03-SUMMARY.md
  - eslint.config.js
  - server.js
  - src/features/install-banner.js
  - src/main.js
  - src/locales/en.json
  - src/locales/fr.json
  - src/styles/overlays.css
  - e2e/locale-refusal.spec.mjs
  - e2e/playwright.config.mjs
  - e2e/helpers/setup.mjs
  - test/email-outbox.test.mjs
  - test/pwa-banner.test.mjs
  - test/sw-contract.test.mjs
  - test/locale-account.test.mjs
  - .planning/phases/77-maintenance-debt/77-REVIEW-DISPOSITION.md
covered_digest: "v2:sha256:0e3d4b7e823c1e188cab5e51effd477ef280f73a21234291ae675438ccccc07c"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 8/8
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 77: Maintenance Debt Verification Report

**Phase Goal:** The repo's standing gates are honestly clean — lint exits 0 with no suppressions, nl/de/es render real refusal paths (including the new DOM refusal keys) in the actual app, and every carried review advisory has a recorded disposition.
**Verified:** 2026-11-19T21:30:00Z
**Status:** passed
**Re-verification:** Yes — digest refresh after post-verification .planning commits (6a864c2f, 52a98663, 72-UAT.md status-vocabulary fix)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `npm run lint` exits 0 with zero reported errors (SC1/MAINT-01) | ✓ VERIFIED | Re-ran in HEAD worktree — exit 0, silent |
| 2 | Zero `eslint-disable` introduced; baseline stays at the 5 pre-existing no-control-regex disables (SC1) | ✓ VERIFIED | `git grep "eslint-disable"` = exactly 5: mailer.js:57, server.js:8448, test/subject-encode.test.mjs:125/142/187 — all pre-existing, none new |
| 3 | Full `npm test` green (SC4) | ✓ VERIFIED | Re-ran at HEAD: 1867 tests, 1854 pass, 0 fail, 13 skipped — identical to prior run |
| 4 | No side-effectful initializer destroyed by lint cleanup (typescript-eslint #3456 hazard, SC4) | ✓ VERIFIED | Hazard site `test/email-outbox.test.mjs:284` still a bare `await makeDigestFixture('2027-03-10', {...})`; suite green |
| 5 | nl/de/es render the signup DP-1 refusal in the actual built app (SC2/MAINT-02) | ✓ VERIFIED | Fresh `npm run build` (exit 0) + targeted e2e at HEAD: 3/3 passed (chromium, refusal-nl/de/es) |
| 6 | Rendered refusal equals the imported catalogue entry exactly per locale (D-77-6/D-77-7) | ✓ VERIFIED | Spec imports `src/locales/{nl,de,es}.json` directly and asserts full-string equality on `#email-err`; 3/3 green |
| 7 | Every carried advisory WR-01, WR-02, 73-IN-01..05, 74-IN-01, 74-IN-02 fixed with a regression pin; ledger open: 0 (SC3/MAINT-03) | ✓ VERIFIED | `77-REVIEW-DISPOSITION.md` front-matter: open 0 / fixed 9 / skipped 0 / deferred 0; regression-pin suites green in run #3 |
| 8 | Server LOCALE_CODES production change (0b660e76) is sound and consistent with the client registry | ✓ VERIFIED | server.js LOCALE_CODES still fs-derived from `src/locales`; locale-account pins green in run #3 |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `e2e/locale-refusal.spec.mjs` | one Playwright spec, DP-1 refusal × nl/de/es, catalogues imported | ✓ VERIFIED | exists; 3/3 pass in re-verification run |
| `e2e/playwright.config.mjs` env | `ALLOW_SIGNUP_DOMAINS=e2e.local` run-wide | ✓ VERIFIED | unchanged at HEAD |
| `eslint.config.js` Node-globals block | webhook-formats.js + webhook-ssrf.js covered | ✓ VERIFIED | lint exit 0 over the whole repo |
| `77-REVIEW-DISPOSITION.md` | carryover ledger, one row per advisory | ✓ VERIFIED | 9 fixed rows, open 0 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Lint gate | `npm run lint` (HEAD worktree) | exit 0, silent | ✓ PASS |
| Full unit suite | `npm test` (HEAD worktree) | 1854 pass / 0 fail / 13 skipped | ✓ PASS |
| Build | `npm run build` (HEAD worktree) | exit 0 | ✓ PASS |
| Locale refusal e2e (targeted) | `npm run e2e -- e2e/locale-refusal.spec.mjs` (HEAD worktree) | 3 passed (12.2s) | ✓ PASS |

### Re-verification Note — Working-Tree Contamination (not a phase gap)

During this re-verification the main working tree was being concurrently modified by another session (`src/views/table.js` carrying a stray, transiently-duplicated `export const probe` that broke a vite build mid-run). That edit is unrelated to phase 77 and is not part of any committed state. All gates for this report were therefore re-run in a detached HEAD worktree (`52a98663`), where the repo is clean. If the concurrent session commits its `table.js` experiment, the phase-77 covered-files digest will need another refresh — table.js is not in the covered list, but the build-gate claim would need re-confirmation.

### Human Verification Required

None — all success criteria remain verifiable by running the gates directly.

### Gaps Summary

No gaps. All eight must-haves re-confirmed at committed HEAD (52a98663): lint exit 0 with the 5-disable baseline intact, full suite 1854/0/13, fresh build + targeted locale-refusal e2e 3/3, ledger open 0, hazard site intact. Verification digest regenerated fresh via `verification.fingerprint` (v4 format).

---

_Verified: 2026-11-19T21:30:00Z_
_Verifier: the agent (gsd-verifier)_
