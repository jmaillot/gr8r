# Phase 62: E2E Baseline Repair - Research

**Researched:** 2026-11-14
**Domain:** Playwright e2e suite repair — webServer readiness contract + drifted Settings/locale specs
**Confidence:** HIGH (all key claims verified by reading source files this session)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions

#### Readiness fix placement (E2E-01)
- **D-01:** `webServer.url` (`/api/health` in `e2e/playwright.config.mjs`) becomes the single owner of readiness — the helper-level readiness poll in `e2e/helpers/setup.mjs` is removed as a *poll*, race gone by construction.
- **D-02:** Helpers that need the server up get an assert-once, fail-fast fetch with a clear "server not ready" error — no retries, no wait loop. Keeps the fail-closed spirit with zero race surface. `reuseExistingServer` defaults, global `retries`, and `gracefulShutdown` stay untouched (locked anti-features).

#### openSettings() helper API shape (E2E-02)
- **D-03:** Two composable helpers in `e2e/helpers/setup.mjs`: `openSettings(page, { tab? })` (navigates, waits the lazy Settings chunk via role-based expect, optionally lands on a tab) and `selectLanguage(page, lang)` (native `<select>` driven by its real combobox role). Not one mega-helper, not a fixture object.
- **D-04:** Helpers own navigation and waits only — every assertion stays inline in each spec via role-based `expect()` calls, keeping the "assertions strengthened, never weakened" diff reviewable spec-side.
- **D-05:** The two waits live in the helpers: lazy-chunk wait inside `openSettings()`, `waitForResponse` on the locale PATCH inside `selectLanguage()`. Specs never hand-roll either wait.

#### Drift sweep breadth
- **D-06:** Fix exactly the 9 failing specs — no sibling-spec migration onto the new helpers this phase. Other specs that duplicate settings-wait logic keep working; smallest diff, fastest to green baseline.
- **D-07:** If the rewrite reveals a real app bug behind a "drifted" assertion, flag it and stop — owner decides fix-now vs deferred. Never mask an app bug in the spec.

#### Sleep replacement signal
- **D-08:** `waitForTimeout(300/500/1000)` sleeps are replaced by: `selectLanguage` awaiting the real network completion (`waitForResponse` on the locale PATCH `/api/auth/me`), then spec-side web-first `expect()` assertions on re-rendered French text. No sleeps, no `networkidle`.

### Locked anti-features (from STATE.md / REQUIREMENTS.md)
- No weakened assertions, no global retries increase, no timeout inflation, no `reuseExistingServer` change, no chunk-gate edits.
- Sequencing locked: readiness fix lands as its own small plan BEFORE the 9-spec rewrite.

### Deferred Ideas (OUT OF SCOPE)
- Migrating sibling specs (`saved-views`, `project-settings`, `demo-locale`, …) onto `openSettings()`/`selectLanguage()` — candidate for a later hardening phase; not this phase (D-06).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| E2E-01 | webServer readiness contract race-free — no ECONNREFUSED 127.0.0.1:4317 from a shared helper-level readiness poll; fail-closed design preserved | Config already polls `/api/health` via `webServer.url` (verified); setup.mjs currently contains no readiness poll (verified — see Open Question 1); helper assert-once fetch pattern sketched below |
| E2E-02 | 9 drifted specs pass via role-based queries and auto-retrying waits on the lazy Settings chunk; assertions strengthened never weakened; native `<select>` asserted by its real role | Lazy-chunk source verified (`layout.js:67`), select enhancement roles verified (`src/ui/select.js`), proven in-repo combobox pattern at `demo-locale.spec.mjs:96-102`, exact sleep clusters located |
</phase_requirements>

## Summary

This is a repair-only phase with an unusually rich in-repo evidence base; almost everything the planner needs is verifiable in the repo right now. The readiness half (E2E-01) is small: `e2e/playwright.config.mjs:32-40` already makes `webServer.url: ${BASE_URL}/api/health` the readiness owner with a 120 s timeout, SIGTERM graceful shutdown, and opt-in `reuseExistingServer` (`E2E_REUSE_SERVER === 'true'`). Contrary to the CONTEXT wording, **`e2e/helpers/setup.mjs` currently contains no readiness poll** — a full read of all 267 lines shows only fixtures/API-client code. The ECONNREFUSED 127.0.0.1:4317 lines therefore most plausibly come from (a) Playwright's own `webServer.url` probe logging failed connection attempts before the server binds (documented Playwright behavior: it polls the URL until it answers), or (b) an at-head regression not yet in the file I read. The plan must start with a 5-minute reproduction run (`npm run build && npm run e2e`) to capture where the error line prints before deleting anything — D-01's "remove the helper poll" is then either a no-op or a trivial deletion, plus the D-02 assert-once fail-fast fetch added to helpers.

The drift half (E2E-02) has a fully verified target contract. The Settings page is a lazy chunk: `src/shell/layout.js:67` — `settings: lazy(() => import('../pages/settings.js'), 'pageSettings')` — so navigating to Settings triggers a dynamic import; the correct wait is a role-based `expect()` on content only present once the chunk has rendered, inside `openSettings()`. The language control is NOT a bare native `<select>` in the accessibility tree: the design-system select (`src/ui/select.js`) enhances it into a trigger button (`.select-btn`, `aria-haspopup="listbox"`) + `role="listbox"` menu of `role="option"` buttons, with the native `<select>` set `aria-hidden="true"`. The proven in-repo driving pattern (STATE.md flags it: "fix pattern proven in-repo — `demo-locale.spec.mjs:96` combobox contract") clicks the trigger then `getByRole('option', { name })`. **Critical planning note:** E2E-02's phrase "native `<select>` asserted by its real combobox role" must be read as the ARIA *combobox pattern* (button + listbox), not `getByRole('combobox')` — no element in the enhancement carries `role="combobox"`, and such a query would fail.

**Primary recommendation:** Plan 1 = reproduce + remove any helper-level readiness code + add D-02 assert-once fetch; Plan 2 = add `openSettings()`/`selectLanguage()` to `e2e/helpers/setup.mjs` modeled on the `demo-locale.spec.mjs:96-102` pattern, then rewrite the 9 drifted specs (the exact drift sites are pinned below to line numbers), replacing every `waitForTimeout` with the existing `waitForResponse(PATCH /api/auth/me)` idiom the specs already use.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Server readiness signal | Test harness (`webServer.url` in playwright.config.mjs) | — | Playwright owns process lifecycle; helpers must not duplicate it (D-01) |
| Fail-fast "server not ready" guard | Test helpers (`e2e/helpers/setup.mjs`) | — | Assert-once fetch; no retry loop (D-02) |
| Lazy-chunk Settings wait | Test helpers (`openSettings()`) | Browser (dynamic import in `src/shell/layout.js`) | Exactly one place knows the contract (success criterion 3, D-05) |
| Language switch network wait | Test helpers (`selectLanguage()`) | API (`PATCH /api/auth/me`) | `waitForResponse` in the helper; specs never hand-roll it (D-05, D-08) |
| All visibility/behavior assertions | Specs (inline `expect()`) | — | Helpers own navigation/waits only; assertions stay spec-side for diff review (D-04) |
| App behavior (locale persistence, re-render) | App (`src/core/i18n.js`, `src/actions/actions.js`) | — | Phase must NOT change app behavior unless D-07 triage proves a real bug → flag & stop |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@playwright/test` | ^1.64.1 (installed) [VERIFIED: package.json:30] | e2e framework; `webServer`, `expect.poll`, `waitForResponse`, role-based `expect()` | Already the suite's framework — no change |
| Node | v24.21.0 (`engines: >=24`) [VERIFIED: shell `node --version`, package.json:36] | runtime for wrapper + server | Already pinned |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| — | — | **No new packages.** This phase installs nothing. | — |

## Package Legitimacy Audit

> Not applicable: this phase installs zero external packages. `@playwright/test@^1.64.1` is already a pinned devDependency in active use; no registry lookups, no installs, no postinstall surface.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
npm run e2e
   │
   ▼
Playwright config (e2e/playwright.config.mjs)
   │  webServer.command: node e2e/server.mjs
   │  webServer.url: http://127.0.0.1:4317/api/health   ← SINGLE readiness owner (D-01)
   ▼
server.mjs wrapper ── stale-dist stamp guard (fail-closed, exit 1) ──▶ spawns server.js
   │                                                    (loopback 4317, throwaway DATA_DIR)
   ▼
[tests start only after /api/health answers]
   │
   ├─ beforeAll fixtures ─▶ e2e/helpers/setup.mjs  (apiClient: real-API signup/workspace/locale)
   │                              └─ D-02: assert-once fetch guard here (no retry)
   ▼
Spec body (role-based queries only)
   ├─ openSettings(page, { tab })  ─▶ navigate → lazy chunk loads (layout.js:67 dynamic import)
   │                                   → expect() on rendered Settings content = the wait (D-05)
   ├─ selectLanguage(page, lang)   ─▶ click .select-btn trigger (ARIA combobox pattern)
   │                                   → getByRole('option', { name }) click
   │                                   → waitForResponse(PATCH /api/auth/me)  (D-08)
   ▼
Spec-side assertions on re-rendered text (fr.json keys), document.documentElement.lang
```

### Recommended Project Structure (delta only)

```
e2e/
├── helpers/
│   └── setup.mjs        # + openSettings(page, { tab? }), selectLanguage(page, lang);
│                        #   + D-02 assert-once readiness guard (if any helper code needs it)
├── french-overflow.spec.mjs   # 7 specs rewritten onto helpers, sleeps removed
├── locale.spec.mjs            # :122 spec rewritten onto helpers, sleeps removed
└── playwright.config.mjs      # unchanged (locked): url/retries/gracefulShutdown/reuseExistingServer
```

### Pattern 1: Driving the enhanced select (the proven in-repo contract)

**What:** The design-system select (`src/ui/select.js`) hides the native `<select>` and renders a trigger button + listbox menu.
**When to use:** Every language-select interaction in the 9 specs and both new helpers.

Source roles, verbatim from `src/ui/select.js`:
- line 16: `btn.className = 'select select-btn';`
- line 18: `btn.setAttribute('aria-haspopup', 'listbox');`
- line 31: `sel.setAttribute('aria-hidden', 'true');`
- line 64: `menu.setAttribute('role', 'listbox');`
- line 69: `<button type="button" class="mi" role="option" data-i="${i}" aria-selected="${o.selected}">…`

**Example** (proven pattern, `e2e/demo-locale.spec.mjs:96-102`, verbatim):

```javascript
/* The design-system select (src/ui/select.js) enhances the native <select>
   into a trigger button + role=listbox menu — the native control is
   aria-hidden, so drive the real UI: open the trigger, pick the option
   whose label the registry gives to code 'en' (label read from the DOM,
   never transcribed). */
await page.locator('.set-body .select-btn').click();
const enLabel = await page.evaluate(() => [...document.querySelectorAll('select[data-in="langSel"] option')].find(o => o.value === 'en')?.text);
if (!enLabel) throw new Error('no en option in the language select');
await page.getByRole('option', { name: enLabel }).click();
```

For the helper, prefer role-first over the `.select-btn` locator: the trigger button's accessible name is the current language label (it renders `sel.options[sel.selectedIndex]?.text`, `src/ui/select.js:26`), so the French-wording drift disappears if the option label is read from the DOM (as demo-locale does) rather than transcribed in the spec.

### Pattern 2: The lazy-chunk wait (what `openSettings()` replaces)

**What:** Navigating to Settings triggers `lazy(() => import('../pages/settings.js'), 'pageSettings')` [VERIFIED: src/shell/layout.js:67]. The wait for the chunk must be an auto-retrying role-based `expect()` on Settings-only content — never a sleep.
**Skeleton for the helper** (ids/labels to be pinned at execution against HEAD):

```javascript
export async function openSettings(page, { tab } = {}) {
  await page.getByRole('button', { name: 'Settings' }).click();   // existing pattern in both drifted specs
  // D-05: THE lazy-chunk wait lives here — an expect() on content the chunk renders.
  // Candidates verified in src/pages/settings.js: heading text from t('settings.language.title')
  // (en.json:25 "settings.language.title": "Language") for the language tab.
  if (tab === 'language') {
    await page.getByRole('button', { name: 'Language', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Language', level: 1 })).toBeVisible();
  }
}
```

Note: both drifted specs already use exactly this click + heading expect pair (french-overflow.spec.mjs:145-147, locale.spec.mjs:131-133) — `openSettings()` is a lift of working code into the one shared home, not a new invention. **The executors must first verify at HEAD whether the settings nav entry point / tab buttons still match** — the specs are *failing*, so something in this chain drifted; triage each spec before lifting.

### Pattern 3: The PATCH wait (what `selectLanguage()` wraps)

Both drifted specs already carry the correct idiom (french-overflow.spec.mjs:156, locale.spec.mjs:145, verbatim):

```javascript
const saved = page.waitForResponse(r => r.url().endsWith('/api/auth/me') && r.request().method() === 'PATCH');
// ... click the option ...
expect((await saved).status(), 'the account locale write failed').toBe(200);
```

`selectLanguage(page, lang)` wraps this: arm the `waitForResponse`, click `getByRole('option', { name })` for `lang` (label read from the DOM or from the locale registry — never transcribed), await the response, return it. The app-side write path is `api.patchMe({ locale: code })` then failure toast `t('toast.localeSaveFailed')` on non-OK [VERIFIED: src/actions/actions.js:3347, 3353].

### Anti-Patterns to Avoid
- **`getByRole('combobox')` for the language select:** no element carries that role — the enhancement is button(`.select-btn`, `aria-haspopup="listbox"`) + `role="listbox"` + `role="option"`. This would fail and burn a debug cycle.
- **`waitForTimeout` as "settle":** the exact debt this phase removes (D-08). The only legitimate remaining wait in the drifted region is the loop-safety check (`MutationObserver` counts zero mutations) — see Pitfall 3 for how to keep it without the leading sleeps.
- **`networkidle`:** locked anti-feature; also unreliable in this SPA (background polls).
- **Moving assertions into helpers:** D-04 explicitly forbids it — helpers wait, specs assert.
- **Raising timeouts/retries to get green:** locked anti-feature (STATE.md).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Server readiness | helper poll loop | `webServer.url` + D-02 assert-once fetch | Playwright already retries the URL until it answers [CITED: playwright.dev webServer docs / Context7 `/microsoft/playwright`]; a second poll is the race (D-01) |
| Waiting for async UI | sleeps / MutationObserver scaffolding per spec | web-first `expect()` (auto-retrying) and `expect.poll` | Both already used throughout the suite (e.g. `document.documentElement.lang` polls) |
| Waiting for a network write | timeout guesses | `page.waitForResponse()` predicate | Already proven in both drifted specs |
| Language labels in French | transcribing `Français` etc. | read option text from DOM / locale registry | demo-locale pattern; survives catalogue edits |
| Stale dist protection | — | already exists, fail-closed in `server.mjs:35-55` (sha256 stamp) | Don't touch; it is part of the fail-closed design D-01 must preserve |

## Runtime State Inventory

> Included because this is a repair/refactor phase, though no renames are involved.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — specs use throwaway mkdtemp DATA_DIR per run (`server.mjs:18,61-63`); locale writes go to that throwaway SQLite | None |
| Live service config | None — no external services; `E2E_PORT`/`E2E_REUSE_SERVER` env vars are read-only inputs this phase must not change | None |
| OS-registered state | None — Playwright owns process lifecycle; no scheduler/pm2 registration | None |
| Secrets/env vars | None added or renamed; `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`MASTER_KEY` env contract in `server.mjs:75-84` untouched | None |
| Build artifacts | `dist/` staleness guard exists (`server.mjs:21-55`); specs require a current `npm run build` before e2e — a stale dist is a setup error, and STATE.md names stale dist/ports/`test-results/` as "environmental traps across all phases" | Each plan: run `npm run build` first; clean `test-results/` if a previous run left artifacts |

## Common Pitfalls

### Pitfall 1: Chasing the wrong ECONNREFUSED source
**What goes wrong:** The plan deletes a "helper poll" that doesn't exist (setup.mjs has none today — verified) and the error persists.
**Why it happens:** Playwright's own `webServer.url` probe logs a connection error for each failed attempt before the server binds; the wrapper uses `stdio: 'inherit'` (`server.mjs:87`) so server startup noise also streams into the same output.
**How to avoid:** Plan task 1 of Plan 1 = reproduce and capture: `npm run build && npm run e2e` with a scrubbed environment (kill anything on 4317, fresh `test-results/`). Identify the exact emitter of the line before editing.
**Warning signs:** ECONNREFUSED lines appearing *before* the first test starts = webServer probe; lines mid-run = something else entirely (investigate).

### Pitfall 2: The "combobox role" misread
**What goes wrong:** Executor writes `page.getByRole('combobox')` per the E2E-02 wording; nothing matches.
**Why it happens:** Requirement text says "native `<select>` … asserted by its real combobox role", but the enhancement's real ARIA shape is button + listbox + option (verified roles above); the native select is `aria-hidden`.
**How to avoid:** Follow the `demo-locale.spec.mjs:96-102` proven pattern. Planner should write the task action as "drive the select enhancement via its trigger button and `role='option'` items" so the wording never invites `getByRole('combobox')`.
**Warning signs:** a spec edit adding the string `'combobox'`.

### Pitfall 3: The loop-safety check is assertion infrastructure, not drift
**What goes wrong:** A mechanical "delete all waitForTimeout" sweep deletes the `waitForTimeout(500/1000)` inside the MutationObserver loop-safety check (french-overflow:170-182, locale:154-162) and weakens a real assertion (render-loop detection).
**Why it happens:** The sleep cluster *looks* like the classic D-08 debt, but two of the sleeps bound an observation window (0 mutations over 1.5 s; two snapshots 500 ms apart identical) — the measurement *requires* elapsed time.
**How to avoid:** Keep the loop-safety measurement, but restructure it sleep-free where possible: start the MutationObserver BEFORE the language click, arm `waitForResponse` for the PATCH, assert the French re-render, then a single bounded poll (`expect.poll` on `window.__mutations === 0` with a timeout) replaces the leading 300 ms settle + trailing 1000 ms read. Assertion strength must be diffed in review (success criterion 2).
**Warning signs:** a diff that removes the render-loop assertion entirely, or a spec that no longer proves "settles".

### Pitfall 4: Fixing the symptom in the spec when it's an app bug
**What goes wrong:** A drifted assertion is "repaired" around a genuine post-Phase-56 app regression (D-07 violated).
**Why it happens:** Drift and regression look identical from a red spec.
**How to avoid:** For each of the 9 specs, triage first: does the *app* still honor the old contract at HEAD? If the assertion was right and the app changed behavior without a decision, flag & stop per D-07.
**Warning signs:** any task description that says "relax the assertion".

### Pitfall 5: Shared-suite coupling in the rewrite
**What goes wrong:** The language switch leaks into the English-pinned suite (config `locale: 'en-US'` only pins negotiated default; account locale wins, LOC-03 — config comment, `playwright.config.mjs:21-25`).
**Why it happens:** french-overflow already isolates via a dedicated throwaway account/workspace (lines 18-42); a rewrite that shares contexts or accounts across specs reintroduces cross-tenant flake.
**How to avoid:** preserve the per-account, per-context isolation (`signIn` helper, run-unique `clientIp` for throttle budgets).
**Warning signs:** a rewrite that reuses `OWNER`/acme for French tests.

## Code Examples

See Patterns 1–3 above (all sourced from files read this session). Additional contract facts the executor needs, verbatim:

- Locale storage path in demo mode differs — `storeLocale` / `LOCALE_STORAGE_KEY` (`src/core/i18n.js:130`); in API mode the persistence is `PATCH /api/auth/me` (`src/actions/actions.js:3347`). The 9 specs are API-mode; demo-locale is out of scope (D-06) and `testIgnore`d in the main config (`playwright.config.mjs:13`).
- French assertion anchors already exist in the drifted specs and must survive strengthening: `document.documentElement.lang === 'fr'` (expect.poll), heading `'Langue'` level 1, button `'Projets'` — e.g. french-overflow.spec.mjs:161-163.
- Config block that must remain byte-identical (D-01/D-02 constraints), verbatim `e2e/playwright.config.mjs:32-40`:

```javascript
  webServer: {
    command: 'node e2e/server.mjs',
    cwd: ROOT,
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === 'true',
    timeout: 120_000,
    /* Without this Playwright SIGKILLs the group, skipping the wrapper's temp-dir cleanup. */
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
  },
```

- D-02 helper guard skeleton (assert-once, fail-fast — no loop):

```javascript
async function assertServerUp(base = BASE_URL) {
  let res;
  try {
    res = await fetch(`${base}/api/health`);
  } catch (e) {
    throw new Error(`e2e server not ready at ${base}/api/health (webServer.url should have gated this): ${e.message}`);
  }
  if (!res.ok) throw new Error(`e2e server /api/health answered HTTP ${res.status} — server not ready`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Custom button+menu language selector (what the drifted specs encode) | Design-system select enhancement (`.select-btn` + listbox), `src/ui/select.js` | Phase 56 (per phase goal) | The 9 specs' selector queries drift; demo-locale.spec.mjs already encodes the new contract |
| Eager page modules | `lazy(() => import('../pages/settings.js'))` in `src/shell/layout.js:67` | Phase 56 | Settings navigation now has an async chunk; specs must wait via role-based expect |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The ECONNREFUSED 127.0.0.1:4317 lines originate from Playwright's `webServer.url` probe logging failed attempts before bind (not from helper code) | Summary, Pitfall 1 | If mid-run, a different fix (port lifecycle, wrapper) is needed — hence reproduce-first task |
| A2 | All 9 failures trace to the Phase-56 Settings contract change (lazy chunk + select enhancement), not to 9 unrelated bugs | Summary, Pitfall 4 | If not, D-07 flag-and-stop fires per spec; triage task covers it |
| A3 | `openSettings()` entry point remains `getByRole('button', { name: 'Settings' })` at HEAD | Pattern 2 | Task says verify-at-HEAD first; if drifted, the triage finds the real entry affordance |

## Open Questions (RESOLVED — dispositions assigned at planning revision 1)

1. **Where exactly does the ECONNREFUSED line print?** — RESOLVED by delegation: owned by 62-01 Task 1 (reproduce-first tracer), which names the emitter from a live run and gates Task 2's scope. No open question remains at planning time.
2. **Does the ARIA-combobox wording in E2E-02 mean the owner wants a `role="combobox"` element to exist?** — RESOLVED as pattern wording: the enhancement exposes button+listbox+option only (verified, src/ui/select.js); specs drive the select by its real enhanced roles (button trigger + option), not `getByRole('combobox')` (62-02 prohibitions). No DOM change; no app changes in a repair-only phase.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| node | everything | ✓ | v24.21.0 | — |
| @playwright/test + Chromium browsers | e2e run | ✓ (devDependency ^1.64.1; browsers assumed installed — existing suite runs) | 1.64.x | `npx playwright install chromium` if missing |
| built `dist/` with valid build stamp | server.mjs guard | required — run `npm run build` first | — | none (fail-closed by design) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test unit suite (1524 tests) + Playwright 1.64 e2e |
| Config file | `e2e/playwright.config.mjs` |
| Quick run command | `npx playwright test --config e2e/playwright.config.mjs e2e/locale.spec.mjs` |
| Full suite command | `npm run e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| E2E-01 | readiness race-free run (no ECONNREFUSED) | e2e (suite itself is the proof) | `npm run e2e` — grep output for ECONNREFUSED | ✅ (after Plan 1) |
| E2E-02 | 9 drifted specs green via role-based queries | e2e | `npx playwright test --config e2e/playwright.config.mjs e2e/french-overflow.spec.mjs e2e/locale.spec.mjs` | ✅ (repaired this phase) |
| Gates | unit suite, lint, chunk gate, i18n gate stay green | unit/lint/build | `npm test`, `npm run lint`, `npm run build` (prebuild runs `i18n:scan`; chunk gate runs in build) | ✅ |

### Sampling Rate
- **Per task commit:** targeted spec run + `npm run lint`
- **Per wave merge:** `npm test` + `npm run build` + full `npm run e2e`
- **Phase gate:** full e2e green with zero ECONNREFUSED; assertion-diff review confirms strengthened-never-weakened

### Wave 0 Gaps
- None — existing test infrastructure covers all phase requirements. (E2E is itself the subject.)

## Security Domain

> Phase touches test code only; no new auth/session/crypto surface. Existing security properties that must be preserved: per-IP throttle budget scheme via run-unique `X-Forwarded-For` (`setup.mjs:31-35`), throwaway `MASTER_KEY` per run (`server.mjs:84`), no test-only backdoors. ASVS categories not applicable (no production code changed; if D-07 triage exposes an app bug, escalate per D-07 rather than fixing inline).

## Sources

### Primary (HIGH confidence — files read this session)
- `e2e/playwright.config.mjs` — webServer block, locale pinning, retries, gracefulShutdown
- `e2e/helpers/setup.mjs` — full file; fixtures only, NO readiness poll
- `e2e/server.mjs` — wrapper, stale-dist guard, env contract, stdio inherit
- `e2e/french-overflow.spec.mjs` — drift sites :145-182 (selector + sleep cluster), isolation scheme
- `e2e/locale.spec.mjs:104-169` — LOC-01/03 spec drift sites
- `e2e/demo-locale.spec.mjs:80-110` — proven post-56 select-driving contract (STATE.md:72 names it the fix pattern)
- `src/shell/layout.js:67` — lazy Settings chunk import
- `src/ui/select.js` — enhancement roles (button/listbox/option, aria-hidden native select)
- `src/pages/settings.js:420-432` — language row composition, `langSel(getLocale())`
- `src/actions/actions.js:3340-3353` — locale switch → PATCH /api/auth/me → failure toast
- `.planning/REQUIREMENTS.md` §E2E Repair — E2E-01/02/03 text
- `.planning/STATE.md:57-75` — sequencing, fix-pattern provenance, environmental traps
- `package.json` — scripts, engines, @playwright/test version

### Secondary (MEDIUM confidence)
- Context7 `/microsoft/playwright` — webServer.url "waits for the given url to be available" (poll-with-retry semantics)

### Tertiary (LOW confidence)
- None — all claims are file-verified or Playwright-doc-cited; remaining uncertainty captured in Assumptions/Open Questions.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; versions read from package.json
- Architecture: HIGH — every integration point read at source this session
- Pitfalls: HIGH — drift sites pinned to line numbers; the two judgment calls (ECONNREFUSED emitter, combobox wording) are explicitly triaged as first tasks

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (stable — repair-only phase on a pinned suite)
