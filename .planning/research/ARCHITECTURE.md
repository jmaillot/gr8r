# Architecture Research — v2.3 Consolidation & Hardening (integration map)

**Domain:** e2e/test-harness repair + mobile responsive table, inside an existing no-framework ES-module SPA + single-file Node server
**Researched:** 2026-11-14
**Confidence:** HIGH (all integration points verified in the live tree; zero web research needed — this is a read-our-own-code milestone)

## Standard Architecture (as it exists — nothing structural is being built)

The v2.3 repairs are **additive fixes to existing seams**, not new architecture. The relevant layers:

```
┌─────────────────────────── e2e harness ─────────────────────────────┐
│ playwright.config.mjs (webServer, en-US pin, workers/retries)       │
│   └─ webServer: node e2e/server.mjs (mkdtemp DATA_DIR, port 4317,   │
│      dist staleness guard, /api/health readiness)                   │
│ helpers/setup.mjs (BASE_URL, fixtures, apiClient)                   │
│ locale.spec.mjs · french-overflow.spec.mjs · saved-views.spec.mjs   │
├─────────────────────────── app (src/) ──────────────────────────────┤
│ pages/settings.js  (lazy chunk since Phase 56 — langSel select)     │
│ shell/view-engine.js (viewToolbar, cols/views popovers, hide-m)     │
│ styles/views/table.css · styles/responsive.css (breakpoints)        │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities (v2.3 scope)

| Component | Responsibility | v2.3 role |
|-----------|----------------|-----------|
| `e2e/french-overflow.spec.mjs` (728 lines) | FR overflow sweep over 9 pages incl. settings | **modify** — Settings role/timing drift ×7 |
| `e2e/locale.spec.mjs` (268 lines) | LOC-01/03/06 language-switch proofs | **modify** — line 122 block uses the collapsed-button contract |
| `e2e/saved-views.spec.mjs` (133 lines) | VIEW-02 named views on the tasks table | **modify** — de-flake |
| `e2e/playwright.config.mjs` | webServer config, serial-group race home | **modify (small)** — readiness race |
| `e2e/server.mjs` | throwaway server on 4317, health URL | **read/possibly adjust** — the ECONNREFUSED lives in config-vs-server handshake, not the server logic |
| `e2e/helpers/setup.mjs` | `BASE_URL` (`http://127.0.0.1:${E2E_PORT\|\|4317}`, line 16), fixture/login helpers | **extend** — shared `openSettings()` / lazy-chunk wait helper lives here |
| `src/pages/settings.js` | `langSel()` at **line 131-134**: native `<select class="select" data-in="langSel" aria-label="${t('settings.language.title')}">` | **do NOT change** — the code is correct; the specs are stale |
| `src/shell/view-engine.js` | `viewToolbar()` line 227: Columns button `data-a="pop" data-pop="cols"`; `hide-m` spans already used for labels | **modify** — mobile toolbar/table behavior |
| `src/styles/views/table.css` (111 lines) | table view styles, `overflow: auto` (line 5), `min-width: 100%` (line 14) | **modify** — mobile layout |
| `src/styles/responsive.css` | existing breakpoints at **1100px** (line 4), **900px** (line 16), **640px** (line 99) | **modify/extend** — CONS-02 breakpoint lives here |

---

## CONS-01 — The 9 failing e2e specs: role/timing drift + webServer race

### Root cause 1: the Settings contract changed under the specs

Phase 56 made Settings a lazy chunk **and** (from 56-01) the language row now renders a
native `<select data-in="langSel" aria-label="Language">` (combobox role,
`src/pages/settings.js:131-134`). The specs still encode the pre-56 contract — a collapsed
`<button>` named "Language" that you click to expand:

- `e2e/french-overflow.spec.mjs:144-153` — `getByRole('button', { name: 'Language', exact: true }).click()` and the `expanded: false` assertion.
- `e2e/locale.spec.mjs:122` block — identical collapsed-button pattern (`expanded: false`, "English" containment, `getByRole('option')` after a click).

Two failure modes compound:

1. **Role mismatch** — there is no `button` named "Language", only a `combobox` (the select). `getByRole` never resolves → timeout.
2. **Lazy-chunk timing** — even with the right selector, the first navigation to `/w/:slug/settings` must download + execute the Settings chunk before the language row exists. Specs that go straight from "click Settings nav button" to "expect Language row" race the dynamic `import()`.

**Integration decision: fix the specs, not the app.** The `<select>` with a localized
`aria-label` is the *more* accessible contract (native combobox, keyboard-free). Do not
revert to the collapsed-button widget just to please old tests. The canonical pattern is
already proven in the codebase: `e2e/demo-locale.spec.mjs:96` reads the select with
`document.querySelectorAll('select[data-in="langSel"] option')`.

### Recommended pattern — one shared Settings helper in `e2e/helpers/setup.mjs`

```js
// e2e/helpers/setup.mjs (extend)
export async function openSettings(page, slug, slugOk) {
  await page.goto(`/w/${slug}/settings`);
  // Lazy chunk (Phase 56): wait for the chunk to be loaded & painted,
  // not for a fixed timeout.
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByRole('heading', { name: /…/ })).toBeVisible(); // settings chrome
}
export function langSelect(page) {
  // Role-stable selector that survives chunk load: the select's accessible
  // name comes from the catalogue key settings.language.title.
  return page.getByRole('combobox', { name: /* t('settings.language.title') */ 'Language' });
}
```

Then all 8 spec sites swap to:

```js
await langSelect(page).selectOption('fr');
```

**Why a helper and not 8 inline fixes:** the `settings.language.title` catalogue key is
shared by both locales (the aria-label is `t()`-bound), so a single helper gives a
single place to update if the Settings IA changes again — exactly the drift this
milestone exists to close. Spec-side assertions like
`await expect(langSelect(page)).toHaveValue('fr')` replace the `expanded: false` /
`toContainText('English')` button checks in `locale.spec.mjs:128-133` and the
`french-overflow.spec.mjs:153` line.

### Root cause 2: ECONNREFUSED 127.0.0.1:4317 in the serial group

Documented at 56-02 (`milestones/v2.2-phases/56-delivery-infrastructure/56-02-SUMMARY.md:205`):
when Playwright manages its own `webServer`, the first serial-group test can fire before
the server finishes binding — `/api/health` readiness wins the race but a serial-group
test's first request can still land in the gap (same 100/109 result against a pre-warmed
server, so it is a launch-ordering artifact, not server boot slowness).

**Integration points (pick, do not stack):**

| Option | File | Verdict |
|--------|------|---------|
| A. Add `webServer.url` retry tolerance — keep `/api/health` but give Playwright a longer, polling-friendly window | `e2e/playwright.config.mjs:32-40` | Partial: Playwright already polls the URL; the race is *after* readiness, in test code that assumes a warm connection pool |
| B. A `setup.mjs` shared `waitReady()` (fetch `/api/health` until 200) called at the top of the serial-group spec's first test | `e2e/helpers/setup.mjs` | **Recommended** — cheap, no config semantics change, deterministic |
| C. `reuseExistingServer: true` in CI | config line 36 | Rejected — breaks the fresh-DB-per-run guarantee the suite is built on |

Option B keeps `e2e/server.mjs` untouched: its health route and lifecycle (mkdtemp,
SIGTERM graceful shutdown wired in config line 39) are load-bearing and verified
(04-VERIFICATION). **`e2e/server.mjs` is NOT an integration point** for this fix.

---

## CONS-02 — Mobile tasks-table truncation with the columns button

### What the code says today

- The Columns button renders in `viewToolbar()` (`src/shell/view-engine.js:227`), only when `opt.cols` — which is the table view's toolbar.
- Column visibility rides the same view state as saved views (`data-pop="cols"` popover, shared with the `views` popover gated at `opt.views`, line 230).
- The table view already has `overflow: auto` and `min-width: 100%` (`src/styles/views/table.css:5,14`) — a horizontally scrolling table is the desktop answer.
- Existing responsive scaffolding: `src/styles/responsive.css` with `@media (max-width: 1100px)`, `(max-width: 900px)` (line 16), `(max-width: 640px)` (line 99), and `hide-m` utility spans already used inside `viewToolbar` (lines 222, 227, 230) — the infrastructure for mobile-scoped chrome already exists.

The defect (deferred at Phase 57 UAT, 2026-11-12): on a narrow viewport, using the
Columns button toggles column visibility but the table keeps its desktop column model —
cells clip (`overflow: hidden; text-overflow: ellipsis` at table.css:61-62) and content
truncates instead of reflowing. The columns popover itself (`max-width` overlays,
`src/styles/overlays.css`) can also overflow a phone-width screen.

### Recommended approach — two small, seamed changes (no new architecture)

1. **CSS-first (primary):** add a mobile contract to `src/styles/views/table.css` /
   `src/styles/responsive.css` under the **existing 640px breakpoint** (do not invent a
   new one — three breakpoints already exist; a fourth breaks the mental model):

   - Let the table's scroll container own the width: keep `overflow-x: auto` on the
     wrapper, drop per-cell ellipsis clipping at mobile width so the horizontal scroll
     is honest rather than truncated-in-place.
   - Ensure the `cols`/`views` popover buttons stay reachable (toolbar wraps; `hide-m`
     spans already collapse the labels — verify the *button* itself is not hidden, only
     its text span).
   - Cap the `.pop.floating` popover (`src/styles/overlays.css`) at mobile width with
     internal scroll so the Columns checkbox list never overflows the screen.

2. **No JS re-architecture.** Do NOT build a card/list mobile re-render of the table —
   that is a feature, and v2.3 is explicitly "no new features" (PROJECT.md:95-96).
   The owner-facing fix is "nothing is truncated / everything is reachable by scroll",
   which CSS delivers.

### New e2e coverage — viewport-scoped, not viewport-split

Add assertions to the existing mobile-adjacent spec surface rather than a new config:

- A small **new spec** `e2e/mobile-tasks-table.spec.mjs` using Playwright's per-test
  `page.setViewportSize({ width: 390, height: 844 })` (or `use: { viewport: ... }`) on
  the main config — **no second Playwright project, no second webServer**. The
  precedent for "one extra config file" (demo.playwright.config.mjs) exists for a
  *different server*, which is not the case here.
- Assert: after toggling a column off via the Columns button at 390px, no cell is
  clipped behind the container edge without scroll (`scrollWidth >= clientWidth` /
  element-bounding-box checks), and the popover fits the viewport.

---

## CONS-03 — De-flaking VIEW-02

`e2e/saved-views.spec.mjs` flakiness candidates, in likelihood order (read from the spec):

1. **Debounced write-through race** (Phase 57: "column show/hide with debounced
   write-through"). `setColumn()` (line 52-61) toggles a checkbox and immediately closes
   the popover with a coordinate click `page.mouse.click(5, 400)`; the debounced save to
   `/api/me/views` may not have landed when the spec's later steps (apply/reload the
   view) read state. **Prevention:** assert on the network response —
   `await page.waitForResponse(r => r.url().includes('/api/me/views') && r.request().method() !== 'GET')`
   — or make the popover-close path an app-owned `data-a` click instead of coordinates.
2. **Coordinate-based dismissal** (`page.mouse.click(5, 400)`, spec lines 58, 68): a
   click at a fixed point can land on different UI depending on popover position/chrome.
   Replace with `page.keyboard.press('Escape')` or a click on a stable backdrop locator
   (the app already asserts `.pop.floating` count → 0, keep that as the effect check).
3. **Shared mutable fixture:** the spec signs in as the shared `OWNER` of the seeded
   `acme` workspace (line 31-36) — the same account other serial specs may touch.
   Run-unique `VIEW_NAME` (line 20) already guards names, but sort/column *live view
   state* on the shared account is mutated; if any other spec or a retry reads it,
   ordering matters. Keep the test in the serial group; consider resetting live view
   state at the start (navigate with a clean `?` state) instead of trusting the previous
   test's leftovers.
4. **Toast assertions** (line 84): `.toast` visibility timing — standard
   `toHaveVisible` wait already applies; only becomes flaky if the save raced (covered
   by fix 1).

**Integration points:** `e2e/saved-views.spec.mjs` only (helper `setColumn`, dismissal
clicks, save/apply waits). No app code change unless the de-flake reveals the debounced
write-through has no flush signal for e2e — in that case the *minimal* app change is an
exposed awaitable on the debounce flush, decided at plan time, not now.

---

## Data-flow assertion (unchanged)

All three items leave the product data flow untouched:

- **CONS-01:** server.js, `langSel` write path (`actions.js IN.langSel` → account locale
  PATCH, per demo-locale.spec.mjs:87 comment), locale registry — unchanged. Only
  **test-side** selectors/waiting change.
- **CONS-02:** view state model, `saved_views` rows, column visibility keys — unchanged.
  CSS + toolbar reachability only.
- **CONS-03:** `/api/me/views` API, blob shape, debounce behavior — unchanged (unless a
  flush-signal hook is approved at plan time).

Standing gates are untouched by all three: chunk gate (no new chunks — Settings stays
lazy; the mobile spec adds no bundle weight), i18n gate (no new user-facing strings
unless popover fixes add copy — keep any new string catalogued EN+FR), lint, and the
1524-test unit suite (pure e2e/CSS work; expect zero unit-test churn).

## Suggested Build Order (dependency-driven)

1. **CONS-01 first (spec repair + webServer race).** Rationale: it restores the suite
   to a green baseline that everything else is verified against. CONS-02 and CONS-03
   both end with "e2e proves it" — a red baseline poisons that. It is also the
   lowest-risk change (test-only).
   - 1a. `e2e/helpers/setup.mjs` — add `openSettings()`/`langSelect()` helper +
     `waitReady()`.
   - 1b. Rewrite the 8 stale selector sites (`french-overflow.spec.mjs:144-153` and its
     6 siblings; `locale.spec.mjs:105-140` block).
   - 1c. Serial-group readiness fix. Gate: `npm run e2e` → 111/111 (minus the known
     VIEW-02 flake).
2. **CONS-03 second (de-flake VIEW-02).** It is e2e-only and independent of CONS-02,
   but doing it before CONS-02 means the mobile spec (step 3) is written against a
   suite with zero known flakes — clean signal. Gate: VIEW-02 green across repeated
   runs (e.g. 10× `--repeat-each`).
3. **CONS-02 last (mobile CSS + viewport-scoped spec).** Depends on nothing from 1–2
   functionally, but its *verification* does: it needs a green suite to prove no
   regression, and possibly reuses the readiness fix. Also the only item touching
   product CSS (`table.css`, `responsive.css`, `overlays.css` popover caps), so it
   carries the only real regression risk — keep it isolated so a revert is one commit.
   - 3a. CSS breakpoint work under the existing 640px rule.
   - 3b. New `e2e/mobile-tasks-table.spec.mjs` (main config, `setViewportSize`).
   - 3c. i18n gate re-check if any popover copy changed.

## Anti-Patterns to Avoid

| Anti-pattern | Why bad here | Instead |
|--------------|--------------|---------|
| Changing `src/pages/settings.js` back to a collapsed button to appease specs | Reverts an accessibility improvement made in 56-01 and re-opens the lazy-chunk design | Fix spec selectors to the combobox role |
| A second Playwright project/config for mobile | Doubles webServer boots for what is a per-test viewport concern | `setViewportSize` inside the main config's specs |
| A new breakpoint (e.g. 480px) for the tasks table | Four breakpoints fragment the responsive model | Use the existing 640px rule in `responsive.css` |
| Replacing coordinate dismissal with `waitForTimeout` | Masks the race, slows the suite | `waitForResponse` on the debounced write or an app-owned close action |
| Touching `e2e/server.mjs` lifecycle for the ECONNREFUSED | Its health route + graceful shutdown are verified and load-bearing | Fix wait/ordering in config/helpers |

## Sources

- Live code: `e2e/playwright.config.mjs:32-40` (webServer), `e2e/helpers/setup.mjs:16`
  (BASE_URL), `e2e/french-overflow.spec.mjs:144-153`, `e2e/locale.spec.mjs:105-140`,
  `e2e/saved-views.spec.mjs:37-84`, `e2e/demo-locale.spec.mjs:87,96` (proven
  select-based pattern)
- Live code: `src/pages/settings.js:131-134` (`langSel` native select),
  `src/shell/view-engine.js:222-230` (`viewToolbar`, cols/views popovers, `hide-m`),
  `src/styles/views/table.css:5,14,61-62`, `src/styles/responsive.css:4,16,99`
  (existing breakpoints), `src/styles/overlays.css:25-45` (popover widths)
- Project record: `.planning/PROJECT.md:93-111` (v2.3 goals/constraints),
  `milestones/v2.2-phases/56-delivery-infrastructure/56-02-SUMMARY.md:205` (ECONNREFUSED
  diagnosis), `milestones/v2.2-phases/56-delivery-infrastructure/deferred-items.md:18-19`

---
*Architecture research for: gr8r v2.3 Consolidation & Hardening*
*Researched: 2026-11-14*
