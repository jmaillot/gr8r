---
phase: 77-maintenance-debt
plan: 03
subsystem: locale-e2e
tags: [e2e, playwright, i18n, dp-1, signup-domain-gate, locale-refusal]
requires: ["77-01 (lint-clean repo)", "77-02 (fresh dist needed — src changed)"]
provides: ["MAINT-02/SC2 evidence — nl/de/es signup DP-1 refusal rendered and catalogue-equal in the built app", "run-wide e2e ALLOW_SIGNUP_DOMAINS=e2e.local", "server LOCALE_CODES derived from the shipped locale registry (nl/de/es persist)"]
affects: []
tech-stack:
  added: []
  patterns: ["catalogue-imported full-string e2e equality (D-77-7)", "priming selectLanguage off the negotiated value (a no-op change fires no PATCH)", "fs-derived server allowlist mirroring the client glob registry (D-07)"]
key-files:
  created:
    - e2e/locale-refusal.spec.mjs
  modified:
    - e2e/playwright.config.mjs
    - e2e/helpers/setup.mjs
    - e2e/default-visibility.spec.mjs
    - e2e/install-banner.spec.mjs
    - e2e/french-overflow.spec.mjs
    - e2e/locale.spec.mjs
    - server.js
    - test/locale-account.test.mjs
    - .planning/phases/77-maintenance-debt/77-REVIEW-DISPOSITION.md
decisions:
  - "LOCALE_CODES fix derived from readdirSync(src/locales) rather than a widened hardcoded pair — the comment's own intent ('registry codes the interface actually renders') and D-07's derived-registry principle; a future locale file joins the gate automatically"
  - "selectLanguage needs a priming switch (en) first when the account locale is null and the context already negotiates the target language — clicking the currently-selected option fires no change event and no PATCH"
  - "Run-wide env's invite-door consequence handled by fixture alignment, not config: INVITE_DOMAINS inherits SIGNUP_DOMAINS when unset (domains.js:80), so the @dv.local fixtures moved to the suite's @e2e.local scheme"
metrics:
  duration: ~55 min
  completed: 2026-11-19
status: complete
commits: 6
plan_head_before: 6e0e6ec1
plan_head_after: a859f1e0
actuals:
  tokens: 62000
  tasks: 3
  commits: 6
---

# Phase 77 Plan 03: Locale Refusal e2e Summary

One Playwright spec proves the real built app renders the signup DP-1 refusal in nl, de and es — each locale switched through the real `selectLanguage` PATCH write path, the out-of-domain submit hitting the run-wide `ALLOW_SIGNUP_DOMAINS=e2e.local` gate, and the inline `ferr('email')` error asserted exactly equal to the imported catalogue entry (D-77-6 owner-reconciled full-string parity) — plus the dry-run-discovered server bug fixed: `LOCALE_CODES` still rejected nl/de/es since phase 75, now derived from the shipped registry.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | Run-wide ALLOW_SIGNUP_DOMAINS env + Wave-0 dry run (A2 gate) | 9e469242 | e2e/playwright.config.mjs, e2e/default-visibility.spec.mjs |
| 1b | Stale e2e assertions aligned with delivered behavior (dry-run discovery) | 51eb91d4, 0319795d | e2e/install-banner.spec.mjs, e2e/french-overflow.spec.mjs, e2e/locale.spec.mjs |
| 2 | Server LOCALE_CODES bug fix (discovered by the spec's PATCH write path) | 0b660e76 | server.js, test/locale-account.test.mjs |
| 2 | e2e/locale-refusal.spec.mjs — signup DP-1 refusal × nl/de/es | 80442048 | e2e/locale-refusal.spec.mjs, e2e/helpers/setup.mjs |
| 3 | Full suite + ledger reconciliation note | a859f1e0 | 77-REVIEW-DISPOSITION.md |

## Must-Haves Verification

| Truth | Result |
| ----- | ------ |
| Switching the real app to nl/de/es renders the signup DP-1 refusal correctly, in the built app (SC2) | ✅ PASS — 3/3 tests green (`npm run e2e -- e2e/locale-refusal.spec.mjs`), full suite 152 passed / 0 failed |
| Rendered refusal equals the imported catalogue entry exactly, per locale (D-77-6 + D-77-7) — no raw `{token}` tokens | ✅ PASS — `toHaveText(cat['err.signupDomainNotAllowed'])` full-string equality on `#email-err`; the static key has no placeholder, so equality subsumes the no-tokens check; Pitfall-5 fallback (English server message) would fail this assert |
| Refusal renders as the inline ferr('email') form-field error, not a toast (D-77-5 reconciled) | ✅ PASS — asserted on `span.err#email-err` (auth.js:90 surface), documented in the ledger Reconciliations |
| ALLOW_SIGNUP_DOMAINS=e2e.local run-wide leaves every existing e2e spec green (Wave-0 dry run) | ✅ PASS — full `npm run e2e` 152 passed / 0 failed (149 existing + 3 new); signup-creating specs (flows onboarding wizard en/fr, tenancy, invites) all green |

| Artifact | Result |
| -------- | ------ |
| e2e/locale-refusal.spec.mjs | ✅ one spec, exactly 3 tests, imports src/locales/{nl,de,es}.json directly, uses selectLanguage (no reload/localStorage hack) |
| e2e/playwright.config.mjs run-wide env | ✅ `env: { ALLOW_SIGNUP_DOMAINS: 'e2e.local' }` in webServer (Playwright merges over process.env — wrapper passthrough preserved); no second config |
| 77-REVIEW-DISPOSITION.md D-77-6 reconciliation note | ✅ Reconciliations section with (a)(b)(c) + execution notes |

| Key link | Result |
| -------- | ------ |
| server.js DP-1 gate → api.js tErr → auth.js ferr('email') | ✅ driven end-to-end by the spec against the real server and built dist |
| dist fail-closed guard → fresh build before e2e | ✅ `npm run build` run before the dry run and before the spec run |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Server LOCALE_CODES rejected nl/de/es (live product bug, found by the new spec)**
- **Found during:** Task 2 — the spec's selectLanguage PATCH returned 400 unknownLocale
- **Issue:** server.js:253 hardcoded `['en','fr']` while the client registry derives from src/locales/*.json; since phase 75 the UI offers nl/de/es but the account-locale write silently failed (toast.localeSaveFailed) and the language fell back to negotiation on reload
- **Fix:** LOCALE_CODES derived from readdirSync(src/locales) — same source of truth as the client glob; regression pin in test/locale-account.test.mjs (all five codes round-trip; unknown codes still 400 — 'de' removed from the bad list, 'xx' added)
- **Files modified:** server.js, test/locale-account.test.mjs
- **Commit:** 0b660e76

**2. [Rule 3 - Blocking] default-visibility fixtures refused by the run-wide gate (env-caused)**
- **Found during:** Task 1 dry run — invite creation 400 (inviteDomainNotAllowed) + API signup refusal
- **Issue:** INVITE_DOMAINS inherits SIGNUP_DOMAINS when unset (domains.js:80), so the run-wide env also gates invites; the spec's `@dv.local` emails violate it
- **Fix:** fixtures moved to the suite's @e2e.local scheme (behavior-neutral — the spec tests default visibility, not domain admission)
- **Files modified:** e2e/default-visibility.spec.mjs
- **Commit:** 9e469242

**3. [Rule 1 - Bug] Stale e2e assertions pre-dating this plan (dry-run discovery, blocking the phase e2e gate)**
- **Found during:** Task 1 dry run — 13 failures, none env-caused
- **Issue:** (a) install-banner spec expected the old duplicated CTA in the grow-span (77-02's WR-01 hint key changed it); (b) french-overflow + locale specs asserted the pre-phase-75 two-language select — the aborted switch test left the fr account locale unset, cascading 7 downstream failures; (c) covered by deviation 2
- **Fix:** expectations aligned with already-shipped, owner-ratified behavior (grow-span → pwa.install.hint, catalogue-imported; select → the five native registry names)
- **Files modified:** e2e/install-banner.spec.mjs, e2e/french-overflow.spec.mjs, e2e/locale.spec.mjs
- **Commits:** 51eb91d4, 0319795d

**4. [Rule 3 - Blocking] openSettings helper + selectLanguage no-op-change hazard**
- **Found during:** Task 2
- **Issue:** helper's label-from-catalogue map only knew en/fr (Spanish UI never matched); selectLanguage clicking the already-negotiated option fires no change event and no PATCH
- **Fix:** helper map widened to all five locales; spec primes with a real switch to en before the switch under test
- **Files modified:** e2e/helpers/setup.mjs, e2e/locale-refusal.spec.mjs
- **Commit:** 80442048

## Deviations — GSD Rule-4 checkpoint

The LOCALE_CODES fix touches server.js (production auth-adjacent gate). It is a one-allowlist widening to match the already-shipped client registry — not an architectural change — so it was treated as Rule 1 (bug fix blocking the task) rather than a Rule 4 stop. Recorded here and in the ledger for review visibility.

## Gates at close-out

- `npm run e2e`: 152 passed / 0 failed (run-wide env active, new spec included)
- `npm test`: 1867 tests / 1854 pass / 0 fail / 13 skipped
- `npm run lint`: exit 0, zero eslint-disable introduced

## Requirements

- MAINT-02: ✅ satisfied (SC2: nl/de/es refusal rendering proven in the real built app with catalogue↔render cross-checks)

## Self-Check: PASSED

- All 6 commits present on main (9e469242, 51eb91d4, 0319795d, 0b660e76, 80442048, a859f1e0)
- e2e/locale-refusal.spec.mjs exists and runs 3 green tests
- Working tree clean after the ledger commit
