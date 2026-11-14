# Feature Landscape — v2.3 Consolidation & Hardening

**Domain:** Self-hosted PM workspace — consolidation (e2e repair, mobile table layout, flaky-test stabilization). No new features.
**Researched:** 2026-11-14
**Overall confidence:** HIGH — grounded in the actual specs (`e2e/french-overflow.spec.mjs`, `e2e/locale.spec.mjs:122`, `e2e/saved-views.spec.mjs`), the actual table code (`src/views/table.js`), the actual CSS (`src/styles/responsive.css`, `src/styles/views/table.css`), and the actual Playwright config (`e2e/playwright.config.mjs`), cross-checked against Playwright official docs (locators/actionability/webServer).

---

## Target CONS-01 — Repair 9 failing e2e specs (lazy-chunk Settings drift)

### What "good" looks like (expected behavior)

The 9 failures share one root cause: Phase 56 split Settings into a lazy Vite chunk. The affected specs navigate to Settings and immediately click inside it (`page.getByRole('button', { name: 'Settings' }).click()` → `Language` → options). Before 56, Settings markup was in the entry bundle and rendered synchronously; now the first click lands while the chunk is still fetching/parsing, and the follow-up locator either times out or binds to a DOM node the re-render then replaces.

"Good" for an e2e spec facing lazy-loaded routes:

1. **Locator auto-waiting already handles most of it** (HIGH confidence, Playwright docs): `getByRole(...).click()` re-resolves via `_retryWithProgressIfNotConnected` until the element is actionable — so the *first* interaction is usually fine. What breaks is **locators bound before a re-render** (stale element) and **non-auto-retrying reads** (`locator.evaluate()`, `isChecked()`, `innerText()` — single-attempt). The fix pattern: keep everything as web-first assertions (`expect(locator).toBeVisible()`, `toHaveText`, `toHaveAttribute`) which auto-retry, and convert single-attempt reads into `expect.poll()` where the value must settle.
2. **Wait for a post-chunk symptom, never for the chunk itself.** Don't poll for `import()` or network idle. Wait for the *rendered result* of the lazy chunk — e.g. `await expect(page.getByRole('heading', { name: fmt('settings.language') })).toBeVisible()` before interacting inside it. That is chunk-agnostic (works even if Settings stops being lazy) and mirrors what the existing `frenchShell(page)` helper already does for the shell.
3. **The spec's own `__survived` no-reload probe (french-overflow line 148–164) is sound** and should survive: the mutation-observer settle check runs *after* the language switch is confirmed, so it is not affected by load-time chunking — only the *entry* into Settings needs the added wait.

### Table Stakes (must ship for CONS-01 to be done)

| Feature | Why Expected | Complexity | Notes / Dependency on existing code |
|---|---|---|---|
| Await the lazy Settings render before interacting, in all 9 failing specs | Specs click into Settings faster than the chunk loads post-56 | Low | One `expect(...).toBeVisible()` per spec at the Settings entry point. Touches: `french-overflow.spec.mjs` (language-switch test + teams-tab test + the `settings` route inside the 16-route overflow loop and 21-route sweep), `locale.spec.mjs:122` onward. The route-level tests (`goto('/settings')` + `frenchShell`) likely need `expect.poll` on a Settings-specific marker, not just the shell |
| Convert single-attempt reads that follow lazy renders into auto-retrying assertions | `isChecked()`, `evaluate()`, `innerText()` don't retry; they fail if the node was replaced mid-chunk-load | Low | In french-overflow: `chromeBoxes()` and `leakScan()` are `page.evaluate` calls but they run after `frenchShell()`/`frenchMarker()` settled — audit, don't blanket-rewrite. In saved-views: `await box.isChecked()` inside `setColumn()` is a single-attempt read on popover content — also relevant to VIEW-02 |
| e2e suite back to 111/111 green | Milestone gate | Low | Pure repair; standing gates (chunk gate 11/11, i18n gate) must stay green |

### Differentiators (valued, optional)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| A shared `openSettings(page, tab)` helper | One place knows how to wait for the lazy chunk; the 9 specs stop duplicating entry choreography | Low | Follows the existing helper convention (`frenchShell`, `signIn`, `openTasksTable` in the same suite) |
| A "lazy-route ready" marker convention (each lazy route exposes a stable rendered heading to await) | Future route splits can't re-break the suite | Med | Needs agreement on one marker per lazy route; keep it a *rendered* symptom, not a DOM/data attribute on the bundle |

### Anti-Features (explicitly NOT to build)

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| `page.waitForTimeout(...)` sleeps before Settings interactions | The classic flake re-importer: too short = flaky, too long = slow suite; masks the real async contract | Auto-retrying `expect(locator)...` on a rendered symptom |
| Un-splitting Settings (reverting Phase 56 code-splitting) | Breaks the D-02 500 kB chunk gate and ships slower first paint | Await the lazy render in tests |
| `networkidle` waits | Deprecated advice; SPA polling (30s notif poll) makes it unreliable | Web-first assertions |

### Dependencies

- Phase 56 loaders (`src/` lazy import of Settings) — read-only; do not modify.
- `e2e/playwright.config.mjs` — already correct (`webServer.url` = `/api/health`, 120 s timeout, `gracefulShutdown`). The existing **dist staleness guard** (Phase 56) is fail-closed — keep intact.
- `retries: CI ? 1 : 0` — with retries on, local runs are the honest signal; verify fixes pass with `retries=0` locally, not just in CI.

---

## Target CONS-02 — Mobile layout of the tasks table with the columns button

### What "good" looks like (expected behavior)

The codebase already made the architectural choice (HIGH confidence, `src/views/table.js:83-91` + `responsive.css`): the desktop `<table>` is `.hide-m` (display:none under 640px) and mobile renders a **card stack** (`.only-m` panels: status icon, title, key, priority pill, assignee avatars, due, estimate, progress bar). That is the correct pattern — **card-stacking**, which is the ecosystem's recommended answer for data tables on phones (horizontal scroll at 390px is unusable for a wide PM table; priority-column pruning loses too much).

The reported bug: "strongly truncated when using the columns button." Root cause analysis from the code:

- The **columns popover** (`act.columns` button, `.pop.floating` with checkboxes) writes `v.hidden[]`, which drives `TCOLS.filter(...)` for the *desktop table only*. The mobile card stack **hardcodes** its fields and ignores `v.hidden` — so hiding columns has no visible effect on mobile, and *showing* hidden columns changes nothing either. Meanwhile the column *widths* (`v.colW`, `style="width:${totalW}px"`) and the popover's own layout are desktop-tuned.
- "Truncated" likely means: opening the columns popover on mobile clips it (popover positioned for desktop, `.pop.floating` overflowing the 390px viewport — the same class of bug the inbox-tabs fix already addressed for `.tabs`), and/or the card stack's second `.row` with `flex-wrap` renders a truncated/overlapping field set. Either way the mobile experience of a column-management affordance is broken because the affordance targets a table that isn't rendered.

Expected behavior matrix ("good"):

| Mobile width | Table view behavior |
|---|---|
| ≤640px | Card stack renders; columns button either (a) is hidden, or (b) filters the *card* fields — never a clipped popover over a hidden table |
| >640px | Current desktop table + popover unchanged |

### Table Stakes (must ship for CONS-02)

| Feature | Why Expected | Complexity | Notes / Dependency on existing code |
|---|---|---|---|
| Decide and implement the mobile contract for the columns button: hide it on mobile OR make it drive the card stack's fields | A control that mutates an invisible table is broken UX; this is the core of CONS-02 | Low–Med | Simplest honest fix: hide the columns/sort/saved-views toolbar buttons under the `hide-m`/`only-m` regime (mobile already has the card stack with its own fixed fields). Making the popover drive card fields is the richer option but touches `tableHtml()`'s mobile template and saved-view blobs |
| Columns popover never overflows the 390px viewport when opened | Truncation reported at UAT (Phase 57, 2026-11-12) | Low | If kept visible on mobile: clamp `.pop.floating` with `max-width: min(360px, calc(100vw - 24px))` + internal scroll — the pattern `components.css:748` already uses (360px cap) and overlays.css (720px cap) |
| Mobile card stack respects the same "truncation-free" bar the suite already enforces | The french-overflow spec already asserts `scrollWidth ≤ clientWidth` and unclipped chrome at 390px for the `tasks` route — it must keep passing | Low | The overflow proof is the regression harness; no new spec framework needed |
| An e2e proof: at 390px, open the columns popover (if kept) and assert every checkbox row is fully inside the viewport | "Good" = pinned outcome, both viewports — the inbox-tabs spec is the exact template | Low | Model on french-overflow's inbox-tabs test (box math on the popover + operability after layout change) |

### Differentiators (valued, optional)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| Card stack fields follow `v.hidden` | Column choices apply everywhere, saved views mean the same thing on phone and desktop | Med | Requires mapping hidden columns → card field suppression; saved-view blobs already carry `hidden[]` so persistence is free |
| Priority-column awareness documented | Industry patterns offer "priority columns" (keep 2–3 key columns visible, scroll the rest) as the middle path | — | Rejected as over-engineering here: the card stack already IS the priority-column answer |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| Horizontal-scroll table on mobile (`overflow-x: auto` under 640px) | A PM tasks table at 390px needs ~900px+; horizontal scroll for primary data is the known-bad pattern; also conflicts with the spec's document-overflow assertion | Keep/repair the card stack |
| A third responsive regime (table+priority columns) | Three rendering paths triple the e2e surface for zero new capability | Two regimes: cards ≤640px, table >640px |
| Any new runtime dependency (responsive table library) | Standing zero-dependency constraint | Hand CSS, as everywhere else |

### Dependencies

- `src/views/table.js` `tableHtml()` — the mobile card template is inline in the same export; edits are surgical.
- `src/styles/responsive.css` (`hide-m`/`only-m` breakpoints at 640px) and `components.css` popover styles.
- Saved views (`saved_views` blobs) — if card fields start honoring `hidden[]`, verify the blob shape is unchanged (it is; `hidden` already exists) so VIEW-01/02 remain byte-compatible.
- CONS-01's repaired french-overflow specs are the regression net for this work — **sequence CONS-01 before CONS-02**.

---

## Target CONS-03 — Stabilize the flaky VIEW-02 spec

### What "good" looks like (expected behavior)

Flaky-test triage methodology (standard practice, applicable directly):

1. **Reproduce with retries off, in a loop.** `retries: 0` locally is already the config default; run the single spec repeatedly (`--repeat-each` or a loop) until it fails, with `trace: retain-on-failure` (already on) — the trace is the diagnosis artifact.
2. **Classify the flake**: timing/async, shared-state, or ordering. This spec has all three candidate classes visible in its code.
3. **Fix the cause in the spec or the app's async contract, never add a sleep.** Then prove stability: green across N consecutive runs locally, and green in CI (where `workers: 1, retries: 1` — note CI retries currently *mask* the flake, which is why it's "known flaky" rather than failing).

Candidate root causes found by reading the spec (opinionated ranking):

1. **Debounced write-through race (most likely).** Column show/hide is "debounced write-through" (Phase 56/57 record). `setColumn()` toggles a checkbox and immediately dismisses the popover; the *next* step saves the view. If the debounce hasn't flushed when the save reads live state — or the apply-refetch lands while assertions run — the saved blob or re-applied state can miss a column. Fix: make the spec await the network effect (`page.waitForResponse(r => ...'/api/me/views')`) or await a rendered symptom of the applied state, instead of trusting wall-clock.
2. **Coordinate-based popover dismissal** — `page.mouse.click(5, 400)` (a raw viewport coordinate, used 3×) is brittle: if the popover renders at that spot, the click toggles content instead of dismissing. Fix: `page.keyboard.press('Escape')` or click the known backdrop element.
3. **Shared OWNER/acme workspace.** The spec reuses the seeded OWNER account in the shared `acme` workspace (run-unique view names prevent name collisions, but toolbar state — live hidden columns, sort — is mutated in a workspace other specs/parallel fixtures also read). Fix: a dedicated throwaway account+workspace with API-seeded tasks (the french-overflow sweep pattern is the proven template), or accept and pin ordering (`fullyParallel: false` already serializes).
4. **Toast-based assertions** (`expect(page.locator('.toast', ...))`) — toasts are transient; if one expires between steps, the assertion can miss it. Auto-retrying `expect` mostly covers this; keep toast windows in mind when sequencing.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---|---|---|---|
| Root-cause the flake from a retained trace (retries off, repeated local run) | Triage step zero; without a reproduced failure any "fix" is a guess | Low | Config already retains traces on failure; `workers:1` in CI, undefined locally |
| Remove coordinate-based dismissal (`mouse.click(5,400)`) from `setColumn()` and friends | Deterministic dismissal: Escape or a named backdrop; coordinates silently change meaning when layout shifts | Low | 3 occurrences in saved-views.spec.mjs |
| Await the debounce/write network effect before asserting saved state | The debounced write-through is an async contract the spec currently doesn't await | Low | `waitForResponse` on `/api/me/views` PUT/POST around the save/apply steps |
| VIEW-02 green across N≥10 consecutive local runs with retries=0 | The definition of "stabilized"; CI retry=1 currently masks the flake | Low | Document the N in the phase verification |
| Isolate VIEW-02 fixtures from the shared OWNER workspace (or prove ordering safety) | Shared mutable live-view state is a classic inter-spec coupling | Low–Med | Throwaway account + API-seeded workspace follows the sweep-account precedent; alternatively document why serialization suffices |

### Differentiators (optional)

| Feature | Value Proposition | Complexity | Notes |
|---|---|---|---|
| A suite-wide popover-helper (`openPopover(page, label)` with Escape-dismiss) | Removes the coordinate-dismiss pattern everywhere it appears | Low | Generalizes `setColumn()`; benefits projects-table spec too |
| CI flake detector job (repeat VIEW-02 ×5 on main) | Catches regressions before they're "known flaky" | Med | Optional; costs CI minutes |

### Anti-Features

| Anti-Feature | Why Avoid | What to Do Instead |
|---|---|---|
| `waitForTimeout` before toast/popover assertions | Converts a flake into a slower flake | `waitForResponse` / auto-retrying expects |
| Raising `retries` to hide the flake | Masks the symptom; CI would pass while local devs see failures | Fix the async contract; keep retries at 1 for genuine network jitter only |
| Deleting VIEW-02 coverage to "stabilize" | Loses the only e2e proof of saved-view round-trip (SC-2) | Repair the spec |

### Dependencies

- Phase 57 saved-views app code (debounced write-through, `saved_views` rows, popover/modal components) — read-only unless triage proves an app bug rather than a spec bug (in which case fix the app's async contract; that's a legitimate outcome).
- `e2e/playwright.config.mjs` — untouched; trace retention and retries=0-local already support triage.
- Sequencing: **run CONS-03 triage independently but land after CONS-01** so the suite is green and any VIEW-02 fix is measured against a stable baseline.

---

## Feature Dependencies

```
CONS-01 (9 spec repairs) → CONS-02 (mobile table)   [overflow proof specs are the regression net]
CONS-01 → CONS-03 landing                           [stabilize against a green baseline]
CONS-03 triage ∥ CONS-01 execution                  [triage/reproduce can start in parallel]
CONS-02 popover fix ↔ saved-views blob shape        [must stay byte-compatible: VIEW-01/02]
```

## MVP Recommendation

Prioritize:
1. **CONS-01** — cheapest, unblocks everything; the suite is the verification instrument for the other two targets.
2. **CONS-03** — diagnose (trace + reproduce) early because its root cause might be an app bug; land after CONS-01.
3. **CONS-02** — the only user-visible change; do it last, protected by the repaired overflow specs.

Defer: card-stack-follows-hidden-columns (Med complexity, real design question about what saved views mean on mobile) — the hide-the-button-on-mobile contract satisfies the UAT finding; the richer contract deserves its own owner discussion.

## Sources

- `e2e/french-overflow.spec.mjs`, `e2e/locale.spec.mjs`, `e2e/saved-views.spec.mjs`, `e2e/playwright.config.mjs` — repo, HIGH
- `src/views/table.js` (mobile card template, `hide-m`/`only-m`), `src/styles/responsive.css` (640px/900px breakpoints), `src/styles/components.css` (360px popover cap) — repo, HIGH
- Playwright official docs via Context7: locators (web-first, auto-retry + `_retryWithProgressIfNotConnected`), actionability (auto-retrying assertions), `expect.poll` (deadline-based re-resolution for lazy rendering), webServer (`url` readiness, `reuseExistingServer`, timeouts) — HIGH
- PROJECT.md v2.2/v2.3 records (Phase 56 lazy-chunk split, Phase 57 UAT deferral, VIEW-02 flaky-at-baseline note) — HIGH
