---
phase: 10-browser-coverage-in-both-locales
plan: 01
subsystem: e2e-harness
tags: [playwright, e2e, locale, uat-09, uat-06, fixtures]
requires:
  - phase-8 per-user locale contract (PATCH /api/auth/me)
  - e2e/server.mjs throwaway-server wrapper
provides:
  - en-US config pin (UAT-09)
  - shared createAccount fixture helper + exported inviteToken (D-06)
  - criterion-4 browser proof (reload / switcher switch / second context)
affects: [10-02 (flows spec reuses createAccount + inviteToken)]
tech-stack:
  added: []
  patterns: [run-unique X-Forwarded-For per fixture account, account-locale-wins-over-negotiated]
key-files:
  created:
    - .planning/phases/10-browser-coverage-in-both-locales/10-01-SUMMARY.md
  modified:
    - e2e/playwright.config.mjs
    - e2e/helpers/setup.mjs
    - e2e/locale.spec.mjs
    - e2e/server.mjs
decisions:
  - Helper status checks rewritten against setup.mjs's own expectStatus convention (plan-sanctioned)
  - Criterion-4 written as a sibling test reusing the alice/bob fixtures; original two-members test untouched
  - Bob granted membership in the second workspace via a real API invite so both accounts can switch (fixture-level, D-04)
  - TRUST_PROXY=true added to e2e/server.mjs so the run-unique X-Forwarded-For scheme actually dodges the per-IP signup throttle (Rule 3)
metrics:
  duration: ~12 min
  completed: 2026-10-24
status: complete
actuals:
  tokens: 32000
  tasks: 2
  commits: 2
commits: 2
plan_head_before: d484c513c7aa284776e41c8e210bd48bb4741309
plan_head_after: 35798bb
---

# Phase 10 Plan 01: English pin + helper promotion + criterion-4 Summary

Suite pinned to `en-US` in the Playwright config (UAT-09), `createAccount`/`inviteToken` promoted into the shared helper file (D-06), and the criterion-4 scenario proven in the browser: two members of one workspace — alice (fr), bob (en) — each keep their own language across a page reload, a switcher-driven workspace switch and a fresh second browser context.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | English pin + helper promotion (tracer) | 47a81ec | e2e/playwright.config.mjs, e2e/helpers/setup.mjs, e2e/locale.spec.mjs |
| 2 | Criterion-4 extension (auto) | 35798bb | e2e/locale.spec.mjs, e2e/server.mjs |

## What Was Built

- **Config pin (UAT-09, D-05):** `use.locale: 'en-US'` with a comment naming UAT-09 and explaining the LOC-03 composition (account locale wins over the negotiated default; null-locale tenancy fixtures boot English). Nothing else in the config changed.
- **Helper promotion (D-06):** `createAccount(base, run, tag, name, { locale, workspace })` now lives in `e2e/helpers/setup.mjs`, exported, with status checks in the file's own `expectStatus` convention and the run passed as a parameter. `inviteToken` gained `export` for plan 10-02. `setupTenants`, `acceptInvite`, `OWNER`, `PREFIX`, `project()` untouched — tenancy's bare fixtures stay byte-identical.
- **Locale spec consumption:** the local `createAccount` copy is deleted; the spec imports the promoted helper and passes `BASE_URL`/`run` explicitly. Behavior unchanged — all 4 original tests pass.
- **Criterion-4 (D-04):** beforeAll creates a second workspace for alice via the API and invites bob through a real invite + accept (never the UI). The new test opens alice (fr-FR browser) and bob (en-US) contexts, and asserts per-account language (`document.documentElement.lang` + catalogue-backed `Projets`/`Projects` nav button) after (a) a reload, (b) a workspace switch through the switcher popover — `button[data-a='switchWs'][data-v=...]` → `toHaveURL(/\/w\/<slug>$)` + switched toast in each language — and (c) a fresh second context per account signed in after the switch. Contexts close in `finally`.

## Verification

- `npm run build && npm run e2e` — **19 passed** (tenancy 5, locale 5, french-overflow 9), zero failed/skipped.
- `grep -n "locale: 'en-US'" e2e/playwright.config.mjs` → line 23, UAT-09 comment adjacent.
- `grep -n "export.*createAccount\|export.*inviteToken" e2e/helpers/setup.mjs` → both exports found; `grep -c "async function createAccount" e2e/locale.spec.mjs` → 0 (import-only, 4 call-site/usage references).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] e2e/server.mjs now sets TRUST_PROXY=true**
- **Found during:** Task 2 verification (full-suite run)
- **Issue:** The wrapper never set `TRUST_PROXY`, so `server.js` ignored `X-Forwarded-For` and every request shared `127.0.0.1`. The full suite makes 7 signups against the 5/hour/IP throttle (`signup|127.0.0.1`), so the full `npm run e2e` run failed with 429s in the locale and tenancy `beforeAll`s — pre-existing fragility exposed by the first full-suite run since locale specs landed, and blocking this plan's verify gate. The per-IP scheme documented in `e2e/helpers/setup.mjs` only works when the server trusts the proxy header.
- **Fix:** `TRUST_PROXY: 'true'` in the e2e wrapper env, with a comment. One line; no app code touched; no spec file modified.
- **Files modified:** e2e/server.mjs
- **Commit:** 35798bb

No other deviations — plan executed as written.

## Known Stubs

None.

## Notes for Plan 10-02

- `createAccount(BASE_URL, run, tag, name, { locale, workspace })` and `inviteToken(url)` are importable from `e2e/helpers/setup.mjs` — use them for the /join fixture.
- The `en-US` pin composes with account locale: patch fixtures to `fr` via the helper's `locale` option and they still boot French.
- The criterion-4 test's switcher pattern (`button[data-a='switchWs'][data-v='<slug>']` + switched toast) is the reference for the workspace-switcher flow spec.

## Self-Check: PASSED

- Commit 47a81ec exists (`feat(10-01): pin suite to en-US and promote createAccount into shared helpers`)
- Commit 35798bb exists (`feat(10-01): criterion-4 proof — reload, switcher-driven workspace switch, second context`)
- SUMMARY file exists at the canonical path; full e2e suite green (19 passed)
