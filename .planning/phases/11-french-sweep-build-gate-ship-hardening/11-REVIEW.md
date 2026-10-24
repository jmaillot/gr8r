---
phase: 11-french-sweep-build-gate-ship-hardening
reviewed: 2026-10-24T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - .github/workflows/ci.yml
  - CHANGELOG.md
  - DEPLOY.md
  - README.md
  - e2e/demo-locale.spec.mjs
  - e2e/demo.playwright.config.mjs
  - e2e/french-overflow.spec.mjs
  - e2e/playwright.config.mjs
  - test/dependencies.test.mjs
  - test/i18n-scan.test.mjs
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-10-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

Reviewed the phase-11 diff (base `616d23b` → HEAD): the 21-route French leak sweep in
`e2e/french-overflow.spec.mjs`, the isolated demo-mode spec + config, the `docker-build` CI job,
the zero-dependency contract test, the two new i18n-scan pins, and the doc updates.

The core sweep is solid: the French-marker precondition genuinely gates the leak scan, the
comparison contract is encoding-safe as claimed, the route list is pinned with a loud length
assert, and the API fixture shapes (`{status, data}`, invites payload, workspace PUT with
`revision`) were cross-checked against `e2e/helpers/setup.mjs` and `server.js`. The Dockerfile
contract test passes against the real Dockerfile. `node --test test/dependencies.test.mjs
test/i18n-scan.test.mjs` → 27/27 pass on the live tree.

No critical defects found. Two warnings concern the demo-mode proof: its API-probe skip
heuristic is fragile (it works today only via a behavior its own comment denies), and the demo
suite is not wired into CI at all, so the proof it provides can regress silently.

## Warnings

### WR-01: Demo-spec API probe misclassifies a 404 as "API present" — the demo proof silently skips in a reachable configuration

**File:** `e2e/demo-locale.spec.mjs:53-63`
**Issue:** The `beforeEach` guard sets `apiPresent = res.status() < 500`, with a comment claiming
"the real API answers /api/config < 500; a dead proxy target answers 5xx or refuses". But
`vite preview` for a path with no proxy at all answers **404** — and `404 < 500` is true, so both
demo tests skip with a green suite. The setup only works today because Vite's `preview` command
**inherits `server.proxy`** (`vite.config.js` defines the `/api` proxy in the `server` block), so
the dead `localhost:8080` target produces a proxy 5xx. The suite's own run output confirms this —
`11-03-SUMMARY.md` records `[vite] http proxy error: /api/config` lines as "EXPECTED", directly
contradicting the config comment that says the proxy "never applies". Any future change that
removes the proxy inheritance, a `preview.proxy` override, or a static-host run leaves the demo
guarantee silently unproven.

**Fix:** Probe positively for the real API instead of a status band:
```js
const res = await request.get('/api/config');
apiPresent = res.ok(); // 2xx = a real API answered; 404/5xx/throw = demo mode
```
and correct the comments in both the spec and `e2e/demo.playwright.config.mjs` to state that
`vite preview` inherits `server.proxy` and the dead target is what makes `/api/config` fail.

### WR-02: The demo-mode proof is not wired into any automated entry point

**File:** `package.json:7-22` / `.github/workflows/ci.yml`
**Issue:** `e2e/demo-locale.spec.mjs` is excluded from the main suite (`testIgnore` in
`e2e/playwright.config.mjs:14`) and no npm script or CI step runs
`playwright test --config e2e/demo.playwright.config.mjs`. The "French server-less demo" guarantee
advertised in CHANGELOG/README is only verified when a developer remembers to build and run the
demo config by hand. `npm run e2e` never touches it; CI never touches it.
**Fix:** Add a `"e2e:demo": "npm run build && playwright test --config e2e/demo.playwright.config.mjs"`
script and either a CI step (after the build job publishes `dist/` as an artifact) or a step in
the existing e2e job, so the demo proof runs on every push.

## Info

### IN-01: `fmt()` helper duplicated across three spec files

**File:** `e2e/demo-locale.spec.mjs:23-29`, `e2e/french-overflow.spec.mjs:371-377`, `e2e/flows.spec.mjs`
**Issue:** The identical catalogue-interpolation helper (including the plural-handling and the
"catalogue key missing" error) is copy-pasted in three specs. A future fix to placeholder
handling (e.g. a new `{count}` token shape) must be applied in three places or the specs diverge.
**Fix:** Move `fmt()` into `e2e/helpers/` (e.g. `e2e/helpers/fmt.mjs`) and import it everywhere.

### IN-02: STOP_LIST is a hand-maintained literal list that permanently masks matches

**File:** `e2e/french-overflow.spec.mjs:434-475`
**Issue:** 16 exact strings are stop-listed by hand. Several of them ('Notifications', 'Mentions',
'Backlog', 'Table', 'Admin', 'Permissions', 'Sessions', 'Accent', 'Compact', 'Indigo', 'Violet',
'Rose', 'Graphite') are stop-listed precisely because the fr and en catalogue values are
*identical* — a property the catalogue itself already encodes. If a future fr translation changes
one of these values, the stale stop-list entry keeps masking the English value elsewhere in the
UI, and the hand list keeps growing.
**Fix:** Derive the "legitimately identical" part of the allow-set at test time by comparing
flattened `fr.json` and `en.json` leaf values (any value equal in both catalogues cannot be a
leak), leaving only brand names ('Gr8r', 'Gr8r Studio') and seed-data team names as explicit,
commented entries.

### IN-03: CI failure diagnostics lose container logs under `--rm`

**File:** `.github/workflows/ci.yml:60-63`
**Issue:** The container is started with `docker run -d --rm`, so if the server crashes before
`/api/health` responds, the container is auto-removed and `docker ps --filter ancestor=gr8r:ci`
returns empty — the `docker logs` debug step prints nothing useful, exactly when it is needed.
**Fix:** Drop `--rm` from the run (the explicit `docker stop` + `if: always()` cleanup already
handles teardown; add `docker rm -f` there) or capture logs to `$GITHUB_STEP_SUMMARY`/a file
before exiting.

---

_Reviewed: 2026-10-24T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
