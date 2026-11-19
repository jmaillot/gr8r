---
phase: 77-maintenance-debt
verified: 2026-11-19T20:55:00Z
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
covered_digest: "v2:sha256:8e8d876d846fb1ba94940c9898cfbb094ea48dae3be76e946b89e9036a6e9355"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 77: Maintenance Debt Verification Report

**Phase Goal:** The repo's standing gates are honestly clean — lint exits 0 with no suppressions, nl/de/es render real refusal paths (including the new DOM refusal keys) in the actual app, and every carried review advisory has a recorded disposition.
**Verified:** 2026-11-19T20:55:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | `npm run lint` exits 0 with zero reported errors (SC1/MAINT-01) | ✓ VERIFIED | Ran `npm run lint` — exit 0, no output |
| 2 | Zero `eslint-disable` introduced; baseline stays at the 5 pre-existing no-control-regex disables (SC1) | ✓ VERIFIED | `git grep -n "eslint-disable" -- '*.js' '*.mjs'` = exactly 5: mailer.js:57, server.js:8448, test/subject-encode.test.mjs:125/142/187 — all pre-existing no-control-regex, none new |
| 3 | Full `npm test` green (SC4) | ✓ VERIFIED | Ran `npm test`: 1867 tests, 1854 pass, 0 fail, 13 skipped — matches SUMMARY claim |
| 4 | No side-effectful initializer destroyed by lint cleanup (typescript-eslint #3456 hazard, SC4) | ✓ VERIFIED | Hazard site `test/email-outbox.test.mjs:284` is a bare `await makeDigestFixture('2027-03-10', {...})` — assignment stripped, the fixture call still runs; no-useless-assignment sites restructured (`let data;`), not statement-deleted; suite green confirms |
| 5 | nl/de/es render the signup DP-1 refusal in the actual built app (SC2/MAINT-02) | ✓ VERIFIED | `npm run build` (fresh dist) then `npm run e2e -- e2e/locale-refusal.spec.mjs`: 3/3 passed (chromium, refusal-nl/de/es accounts) |
| 6 | Rendered refusal equals the imported catalogue entry exactly per locale (D-77-6/D-77-7) | ✓ VERIFIED | Spec imports `src/locales/{nl,de,es}.json` directly (spec lines 30–32) and asserts `err.signupDomainNotAllowed` full-string equality on the inline `#email-err` field error; 3/3 green |
| 7 | Every carried advisory WR-01, WR-02, 73-IN-01..05, 74-IN-01, 74-IN-02 fixed with a regression pin; ledger open: 0 (SC3/MAINT-03) | ✓ VERIFIED | `77-REVIEW-DISPOSITION.md` front-matter: open 0 / fixed 9 / skipped 0 / deferred 0; 9 rows each with pins in test/pwa-banner.test.mjs, test/sw-contract.test.mjs (suite green in run #3) |
| 8 | Server LOCALE_CODES production change (0b660e76) is sound and consistent with the client registry | ✓ VERIFIED | server.js:259 derives codes from `fs.readdirSync(src/locales)` `.json` files — same source of truth as client `import.meta.glob(['../locales/*.json'])` (src/core/i18n.js:23); all five de/es/fr/nl/en round-trip through PATCH /api/auth/me with unknown codes still 400 (test/locale-account.test.mjs:50–64) |

**Score:** 8/8 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `e2e/locale-refusal.spec.mjs` | one Playwright spec, DP-1 refusal × nl/de/es, catalogues imported | ✓ VERIFIED | exists; imports the 3 catalogues; uses `selectLanguage` real PATCH write path; exactly 3 tests, all pass |
| `e2e/playwright.config.mjs` env | `ALLOW_SIGNUP_DOMAINS=e2e.local` run-wide | ✓ VERIFIED | line 42 `env: { ALLOW_SIGNUP_DOMAINS: 'e2e.local' }` in webServer |
| `eslint.config.js` Node-globals block | webhook-formats.js + webhook-ssrf.js added | ✓ VERIFIED | lint exit 0 over the whole repo including those scripts |
| `77-REVIEW-DISPOSITION.md` | carryover ledger, one row per advisory | ✓ VERIFIED | 9 fixed rows, open 0, D-77-6 reconciliations section present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| server.js DP-1 gate | src/pages/auth.js `ferr('email')` | api.js tErr mapping | ✓ WIRED | driven end-to-end by the spec against the real server + built dist (inline `#email-err` assert) |
| e2e spec | src/locales/{nl,de,es}.json | direct catalogue import | ✓ WIRED | no duplicated string table |
| src/main.js boot line | test/pwa-banner.test.mjs pin | `bannerChunkFailed` catch shape | ✓ WIRED | `bannerChunkFailed` at main.js:85/88/91/93; suite green |
| install-banner.js EXIT_MS | overlays.css `--install-banner-exit-ms` | CSS var set at mount | ✓ WIRED | constant-agreement pin passes |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Lint gate | `npm run lint` | exit 0, silent | ✓ PASS |
| Full unit suite | `npm test` | 1854 pass / 0 fail / 13 skipped | ✓ PASS |
| Locale refusal e2e (new spec) | `npm run build` + `npm run e2e -- e2e/locale-refusal.spec.mjs` | 3 passed | ✓ PASS |
| Full e2e suite | `npm run e2e` | 152 passed (6.6m) | ✓ PASS |

### Probe Execution

None — no probe scripts declared by this phase's plans.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| MAINT-01 | 77-01 | Standing lint gate honestly clean | ✓ SATISFIED | lint exit 0; baseline 5 disables unchanged; suite green per commit-group |
| MAINT-02 | 77-03 | nl/de/es refusal paths verified in the real app | ✓ SATISFIED | locale-refusal spec 3/3 green against built dist with catalogue equality |
| MAINT-03 | 77-02 | All carried advisories dispositioned | ✓ SATISFIED | ledger 9 fixed / 0 open, each with regression pin |

### Anti-Patterns Found

None in the phase's modified files relevant to the goal. The dry-run's stale e2e assertions were fixed within the phase (commits 51eb91d4, 0319795d) and the full e2e suite is green.

### Human Verification Required

None — all success criteria were verifiable by running the gates directly.

### Gaps Summary

No gaps. All four roadmap success criteria verified by direct gate execution:
1. lint exits 0, no new suppressions — ✓
2. nl/de/es signup DP-1 refusal e2e exists and passes in the built app — ✓ (fresh build; 3/3; full e2e 152/152)
3. All advisories fixed with regression pins, ledger open: 0 — ✓
4. Suite green, no side-effectful initializer destroyed — ✓ (makeDigestFixture call intact at email-outbox.test.mjs:284)

The plan-77-03 production change (server LOCALE_CODES fs-derived from src/locales, commit 0b660e76) is sound: single source of truth shared with the client registry, regression-pinned (5-code round-trip + 400 on unknown), and it fixed a real phase-75 bug (nl/de/es locale writes silently failing).

---

_Verified: 2026-11-19T20:55:00Z_
_Verifier: the agent (gsd-verifier)_
