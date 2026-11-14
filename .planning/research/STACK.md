# Technology Stack — v2.3 Consolidation & Hardening (repair/de-flake tooling)

**Project:** Projects Studio (gr8r) — v2.3 CONS-01/02/03
**Researched:** 2026-11-14
**Overall confidence:** HIGH (verified against installed versions and Playwright official docs via Context7)

## Verdict up front

**Zero new packages are needed — not even dev-dependencies.** All three items are repairable with the already-installed `@playwright/test@^1.64.1`, `vite@^6.4.4` (already used only at dev time), plain CSS (including container queries, supported in the pinned Chromium), and config edits in `e2e/playwright.config.mjs`. The milestone's real "stack work" is **API choices and config hygiene**, not installs.

## Current Stack (unchanged — verified from `package.json`)

| Tool | Installed Version | Role | Status |
|------|-------------------|------|--------|
| `@playwright/test` | ^1.64.1 | e2e suite (`e2e/playwright.config.mjs`, Chromium only, serial workers) | KEEP — all needed APIs present in this version |
| `vite` | ^6.4.4 | dev/build bundler, code-splitting (Settings lazy chunk from Phase 56) | KEEP — no config change needed for the repairs |
| `eslint` / `prettier` | ^9.39.5 / ^3.9.9 | lint/format gates | KEEP |
| `node:test` (built-in) | Node ≥24 | 1524-test unit suite | KEEP |
| Runtime deps | `pg`, `web-push@4.0.0` | DB adapter, push | UNTOUCHED (standing zero-new-runtime-dep constraint holds trivially) |

## CONS-01 — Lazy-chunk-drifted e2e specs (french-overflow ×7, locale.spec.mjs:122)

**Root cause (confirmed in source):** the specs target the *pre-Phase-56* UI shape — `getByRole('button', { name: 'Language', exact: true })` (a collapsed disclosure button) — while the code now renders a native `<select class="select" data-in="langSel" aria-label="Language title">` (`src/pages/settings.js:131`). A native `<select>` has ARIA role **combobox**, not button, so every role-based lookup fails identically at baseline and HEAD. Nothing about Vite chunking needs to change; only the spec selectors do.

**Tooling needed: Playwright APIs only (all present in 1.64):**

| API | Purpose | Why it's the right fix |
|-----|---------|------------------------|
| `page.getByRole('combobox', { name: … })` | Target the native `<select>` via its accessible name (its `aria-label`) | Role queries are the resilient layer across UI refactors; the drift happened precisely because a role/shape changed |
| `locator.selectOption({ label: 'Français' })` | Replace the old "click button → click option" listbox dance | `selectOption` is the purpose-built API for native selects — auto-waits, no expanded/collapsed state machine, immune to chunk-load timing |
| `expect(locator).toBeVisible()` / `expect.poll(() => document.documentElement.lang)` | Keep the existing first-paint and language assertions | Already used in the file; `expect.poll` (web-first assertion) is the documented anti-flake pattern vs `waitForTimeout` |

Integration point: the specs already navigate Settings through a "Settings" button before hitting the Language control (`e2e/locale.spec.mjs:121-126`). If the Settings page itself now loads as a lazy chunk, the ONLY timing requirement is Playwright's default auto-wait on the locator — no explicit `waitForResponse`/`waitForLoadState('networkidle')` should be added (those are documented flake sources). If a spec ever must wait on the chunk fetch itself, prefer `page.waitForURL` or a `waitForResponse` on the specific `.js` chunk URL over networkidle.

**Do NOT:** add `@testing-library` locator helpers, `axe-playwright`, or any selector-robustness package — `getByRole` + `data-in` attribute selectors (`page.locator('[data-in="langSel"]')`) already give two stable targeting layers.

### CONS-01b — ECONNREFUSED 127.0.0.1:4317 webServer-binding race (serial group)

Verified config (`e2e/playwright.config.mjs:32-40`): Playwright already waits on `url: ${BASE_URL}/api/health` before running tests, and `gracefulShutdown` (present and documented in current Playwright) handles the SIGTERM cleanup. The remaining race window is the gap between the port accepting TCP and `/api/health` being routable, plus any spec or wrapper code connecting to the literal `4317` instead of `baseURL`. Zero-dep fixes, in order of preference:

1. **Never hardcode `4317` in spec code** — derive from `baseURL` (`page.goto('/')`, `request.get('/api/…')`) so `E2E_PORT` actually relocates the suite when the default port is occupied (the usual trigger of this race in serial groups: a stale server from a previous run holding the port).
2. **Make the wrapper's readiness wait retry-tolerant**: `e2e/server.mjs` should bind with retry/backoff on `EADDRINUSE` and only then signal readiness; Playwright's `url` poll (250 ms interval by default) absorbs the rest.
3. Optionally set `reuseExistingServer: !process.env.CI` — the common idiom — instead of the opt-in `E2E_REUSE_SERVER` env flag, so local reruns after a crash don't race a zombie listener.

**Do NOT:** add `wait-on`, `portfinder`, or `get-port` — Playwright's webServer `url` polling is exactly this feature, built in.

## CONS-02 — Mobile tasks-table truncation (columns button)

**No library.** This is a plain-CSS fix validated by Playwright's device emulation. Recommended zero-dep toolkit:

| Capability | Where it lives | Use |
|------------|---------------|-----|
| CSS container queries (`@container`) | Plain CSS; supported in Chromium ≥105 (the suite's pinned browser) and all evergreen mobile browsers | Size queries on the table wrapper so the layout reacts to the *table's* width, not the window — correct even when columns toggling changes width |
| `table-layout: fixed` + `min-width: 0` + `overflow-wrap: anywhere` / `word-break` on cells | Plain CSS | The classic truncation cause is auto table layout giving long content infinite preferred width; `fixed` + `minmax(0, …)` grid/flex containers stop the blowout |
| Horizontal-scroll wrapper (`overflow-x: auto` on a container div, table keeps `min-width`) | Plain CSS | The honest fallback for genuinely wide tables on phones; keeps all columns reachable instead of clipping |
| Hidden-columns feature (Phase 57) as the mobile default | Existing app code | On small screens, auto-collapse low-priority columns rather than shrinking every cell — reuses shipped functionality, no new mechanism |

Verification tooling (Playwright, already installed):

- A dedicated mobile project or `test.use({ viewport: { width: 390, height: 844 } })` (iPhone-ish) — `devices['Desktop Chrome']` is the only project today, so add a **project entry in `e2e/playwright.config.mjs`**, not a package.
- `expect(locator).toBeInViewport({ ratio: … })` — verified available (added in Playwright 1.31, well within 1.64) — to assert truncated/hidden cells are *deliberately* out of view while key cells (task title, status) remain ≥ ratio visible.
- `expect(locator).toHaveScreenshot()` is available but **not recommended** here: pixel snapshots flake across font/DPR environments; prefer structural assertions (viewport ratios, `boundingBox()` width > 0) for a stability-focused milestone.

**Do NOT:** pull in a CSS framework, `react-window`-style virtualizers (no framework anyway), or responsive-table JS libraries (`.tablesaw`, `footable`-style) — the DOM is already column-toggleable; CSS decides the layout.

## CONS-03 — De-flake VIEW-02 (saved-views.spec.mjs)

Zero new deps. Playwright-native stabilization kit, in the order to apply:

1. **Web-first assertions everywhere** — replace any `waitForTimeout`/sleep with `expect(locator).toBeVisible()` / `toContainText` auto-retry. This is the single highest-yield de-flaking move (Playwright docs' own first recommendation).
2. **`expect.configure({ timeout: 10_000 })` (or per-assertion `timeout` option)** for the two or three slow spots (view save round-trips `/api/me/views`); lengthen the *assertion*, never add sleeps.
3. **Wait on the network contract, not the UI side effect**: `page.waitForResponse(r => r.url().includes('/api/me/views') && r.request().method() === 'PUT')` around save/update/delete clicks — the spec already uses this idiom for `/api/auth/me` PATCH in `locale.spec.mjs`, so it's a proven in-repo pattern.
4. **`test.describe.configure({ mode: 'serial' })` semantics check** (verified in docs): serial mode retries the *group* from the start — if VIEW-02 shares a page/context fixture chain with neighbors, confirm a group retry won't double-apply view mutations; prefer independent fixtures (fresh context per test) over serial+retry.
5. **`retries: process.env.CI ? 1 : 0` is already set** — consider `retries: 1` locally too *while diagnosing*, and use the HTML report's retry diff to identify the actual race; then fix the race, don't keep the retry.
6. `trace: 'retain-on-failure'` is already configured — use the existing traces; no `@trace` viewer tooling or `playwright-trace-reporter` package needed.

**Do NOT:** add `jest-extended`, `expect-playwright`, custom retry plugins, or MSW-style network mocking — Playwright's route/response APIs cover interception if ever needed.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Selector strategy | `getByRole('combobox')` + `data-in` attributes | Testing Library / `data-testid` convention package | Existing `data-in` convention is already the project's test hook; a second convention adds nothing |
| Select interaction | `locator.selectOption()` | Click-to-open listbox emulation | `selectOption` is the documented API for native `<select>`; emulation re-introduces the exact timing drift being repaired |
| Mobile layout | Container queries + `table-layout: fixed` + scroll wrapper | Responsive-table npm libs | Zero-dep constraint; libs also fight the existing show/hide columns feature |
| De-flaking | Web-first assertions + `waitForResponse` | Retries + sleeps, `networkidle` waits | Sleeps/networkidle are the documented *causes* of flake; retries mask rather than fix |
| Visual regression | Structural viewport assertions | `toHaveScreenshot()` snapshots | Pixel diffs flake across environments — wrong tool for a stability milestone |
| Server-readiness | webServer `url` polling + wrapper retry | `wait-on` / `portfinder` devDeps | Built-in polling already does the job; extra deps add startup race surface, not remove it |

## Installation

```bash
# Nothing to install. Existing tooling covers every item:
#   @playwright/test ^1.64.1 (already)  — roles, selectOption, toBeInViewport,
#     expect.poll/configure, waitForResponse, webServer url/gracefulShutdown
#   vite ^6.4.4 (already, dev-only)     — no config change required for repairs
#   plain CSS                           — container queries, table-layout, overflow-x
# Runtime deps remain exactly { pg, web-push@4.0.0 }.
```

Only *config* additions contemplated: a mobile viewport project entry in `e2e/playwright.config.mjs`, and possibly `reuseExistingServer: !process.env.CI`.

## Sources

- Playwright official docs via Context7 (`/microsoft/playwright`): webServer config incl. `gracefulShutdown` and `url` polling; `test.describe.configure` serial semantics; `toBeInViewport` assertion (HIGH — current official docs, cross-checked against installed ^1.64.1)
- In-repo evidence (HIGH — read directly): `e2e/playwright.config.mjs`, `e2e/locale.spec.mjs:121-140`, `e2e/french-overflow.spec.mjs:146-153`, `src/pages/settings.js:131-132` (`langSel` native `<select>`), `e2e/saved-views.spec.mjs` (VIEW-02), `vite.config.js`, `package.json`
