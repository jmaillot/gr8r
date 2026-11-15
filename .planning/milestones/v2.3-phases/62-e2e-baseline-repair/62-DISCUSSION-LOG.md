# Phase 62: E2E Baseline Repair - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 62-E2E Baseline Repair
**Areas discussed:** Readiness fix placement, openSettings() API shape, Drift sweep breadth, Sleep replacement signal

---

## Readiness fix placement

| Option | Description | Selected |
|--------|-------------|----------|
| Single owner: webServer.url | Delete the helper poll; webServer.url already polls /api/health with backoff — race gone by construction | ✓ |
| Keep poll, make race-free | Keep belt-and-braces poll, honor webServer readiness via shared promise | |
| Server wrapper owns it | e2e/server.mjs signals ready only when accepting; strip both polls | |

| Option | Description | Selected |
|--------|-------------|----------|
| Assert-once, fail fast | Helpers keep a single fail-fast fetch with clear "server not ready" error | ✓ |
| Delete from helpers | Remove readiness code entirely from helpers | |
| Fixture-based await | Promise resolved by Playwright's own readiness via fixture | |

**User's choices:** Single owner: webServer.url; Assert-once, fail fast
**Notes:** Fail-closed spirit preserved; race surface zero.

---

## openSettings() API shape

| Option | Description | Selected |
|--------|-------------|----------|
| openSettings + selectLanguage | Two composable helpers: openSettings(page,{tab?}) + selectLanguage(page,lang) | ✓ |
| One mega-helper | openSettings(page,{tab,locale?}) fusing both contracts | |
| Fixture object | Page-bound settings fixture (.open/.setLocale/.gotoTab) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Wait-only, asserts inline | Helpers navigate/wait; assertions stay inline in specs via role-based expect() | ✓ |
| Helpers assert too | Helpers expose expect-style assertions centrally | |

**User's choices:** openSettings + selectLanguage; Wait-only, asserts inline
**Notes:** Keeps "assertions strengthened" reviewable spec-side.

---

## Drift sweep breadth

| Option | Description | Selected |
|--------|-------------|----------|
| 9 failing specs only | Smallest diff, fastest to green baseline; sibling migration later | ✓ |
| Full migration sweep | Fix 9 AND migrate all specs hand-rolling settings waits | |
| 9 + TODO markers | Fix 9; leave TODOs in siblings referencing new helpers | |

| Option | Description | Selected |
|--------|-------------|----------|
| Flag app bugs, don't mask | Stop and flag if a rewrite exposes a real app bug; owner decides | ✓ |
| Specs assert HEAD as-is | App bugs go to backlog untouched | |

**User's choices:** 9 failing specs only; Flag app bugs, don't mask
**Notes:** None

---

## Sleep replacement signal

| Option | Description | Selected |
|--------|-------------|----------|
| PATCH response + French assert | waitForResponse on locale PATCH, then web-first French text assertions | ✓ |
| French assert only | Skip network wait; rely solely on auto-retrying assertions | |
| Visible settle marker | Assert on a visible settled-UI marker | |

| Option | Description | Selected |
|--------|-------------|----------|
| Helpers own both waits | Lazy-chunk wait in openSettings(); PATCH wait in selectLanguage() | ✓ |
| Specs own the waits | Each spec hand-rolls waits (rejected — recreates duplication) | |

**User's choices:** PATCH response + French assert; Helpers own both waits
**Notes:** Replaces waitForTimeout(300/500/1000) cluster in french-overflow.spec.mjs.

---

## the agent's Discretion

None — every gray area presented received an explicit owner decision.

## Deferred Ideas

- Sibling-spec migration onto openSettings()/selectLanguage() (saved-views, project-settings, demo-locale, …) — later hardening phase.
