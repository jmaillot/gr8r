# Domain Pitfalls — v2.3 Consolidation & Hardening Repairs

**Domain:** Post-refactor e2e repair, frameworkless responsive tables, spec de-flaking (zero-dep vanilla-JS SPA, Playwright suite, D-02/i18n/Phase-38 gates)
**Researched:** 2026-11-14
**Overall confidence:** HIGH (codebase-verified — specs, config, lazy-route map and gate scripts read directly; plus established Playwright/Playwright-config community wisdom)

Scope: pitfalls for exactly the three repair targets (CONS-01, CONS-02, CONS-03) on THIS codebase, including cross-repair integration pitfalls and the standing constraints (zero new runtime deps, 500 kB chunk gate, EN+FR i18n gate, Phase 38 suppression invariants, byte-level redaction/leak tests green).

---

## Critical Pitfalls

### Pitfall 1: "Fixing" drifted specs by weakening assertions into tautologies (CONS-01)

**What goes wrong:** The 9 failing specs (`french-overflow.spec.mjs` ×7 + `locale.spec.mjs:122`) drifted when 56-01 made Settings a lazy chunk (`src/shell/layout.js:67` — `settings: lazy(() => import('../pages/settings.js'), 'pageSettings')`). Under time pressure, the tempting fix is to soften each failing assertion: swap `expect(x).toBeVisible()` for `expect(x).toBeTruthy()`, catch the error and pass, count elements with `> 0`, or delete the assertion that fails and keep the navigation.

**Why it happens:** The specs are gatekeeping specs by design — `french-overflow` measures the French interface at 1280 px AND 390 px across 16 routes; `locale.spec.mjs:122` asserts a role on the Settings language row. When the underlying element simply doesn't exist *yet* (chunk loading), every fix that "makes the test pass" looks equivalent, and the weakest one is the easiest.

**Consequences:** The suite returns to 111/111 while silently no longer proving anything: a real role regression (e.g. the language `<select>` losing its accessible role — exactly the current `locale.spec.mjs:122` failure mode, where the spec expects a `<button>` role on a native `<select>`), a real a11y regression, or a real French overflow would ship undetected. The suite becomes worse than no suite, because it *claims* coverage. This is the single biggest risk of the milestone.

**Prevention:**
- Classify each of the 9 failures FIRST as either (a) spec drift — spec waits on an element that now arrives after the lazy chunk loads — or (b) genuine app regression introduced by the split. Never edit an assertion until the classification is written down per spec.
- The repair for class (a) is *better waiting*, never *weaker expectation*: assert the lazy route has settled before asserting on its content. The codebase already exposes the settle contract — `layout.js` renders `null` for an unloaded lazy route and fills on first visit (`f.lazy && !l.mod`); so the correct pattern is to wait for the concrete user-visible element you were going to assert anyway, via `expect(...).toBeVisible()` (auto-retries), NOT a weakened check.
- Keep every role/text/overflow assertion at its original strength. A spec whose assertions you downgraded must be rejected in review — diff the assertion strength, not just pass/fail.
- For `locale.spec.mjs:122` specifically: first verify against 56-01's pre-split behavior what the correct role IS. If the lazy Settings chunk changed what renders (native `<select>` vs custom button), decide with the owner whether the app or the spec is wrong — do not let the spec's expectation define the app's a11y contract by accident.
- Re-run the affected specs against the pre-split commit (56-02 already did this bisect: same 9 fail at 7ce7521) to keep the "these are drift, not new regressions" claim honest — a worktree bisect is cheap and already has precedent in `56-02-SUMMARY.md`.

**Detection (warning signs you're doing it wrong):** a diff that deletes `.toBeVisible()` / role checks / `expect(page).toHaveURL(...)` lines; new `try { ... } catch {}` or `|| {}` around assertions; a spec that goes green without any `await` added before the failing assertion (nothing changed about timing, so the only other way it went green is that the assertion stopped measuring).

---

### Pitfall 2: The ECONNREFUSED webServer race — "fixing" flake by adding retries that mask real failures (CONS-01/CONS-03 interaction)

**What goes wrong:** Playwright's `webServer.url` readiness probe (`/api/health` in `e2e/playwright.config.mjs:35`) can pass while the first serial-group test still hits `ECONNREFUSED 127.0.0.1:4317` — documented twice (`56-02-SUMMARY.md` line 205, `deferred-items.md` lines 18–19). The instinctive fixes are: bump `retries` globally, add `test.setTimeout`, wrap the first navigation in a retry loop, or set `reuseExistingServer: true` everywhere.

**Why it happens:** `webServer.url` polling succeeds once the socket accepts; the SPA's first XHR can race a still-warming server (SQLite open, seed check, route registration). Because it's timing-shaped, everyone reaches for timing knobs instead of the readiness contract.

**Consequences:** Global `retries: 2` locally hides REAL flake (VIEW-02 work in CONS-03 becomes unverifiable — you can no longer tell a fixed race from a retried one); `reuseExistingServer: true` by default violates the suite's own fail-closed design (`reuseExistingServer` is deliberately opt-in via `E2E_REUSE_SERVER=true` — Phase 04 review explicitly removed the old `!process.env.CI` default because a developer's preview server contaminated fixtures); a retry loop around the first navigation makes every future first-navigation failure ambiguous.

**Prevention:**
- Fix the readiness contract, not the retries: point `webServer.url` at an endpoint that only answers when the server is genuinely able to serve API traffic (e.g. confirm `/api/health` performs a real DB touch, or keep the URL probe but note the race lives in the *first test's first request*, and give the FIRST navigation in each spec a single explicit `page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })` warm-up with an API ping via `helpers/setup.mjs`'s `apiClient` — fail the *setup* fast and clearly, not the assertion).
- Keep `retries: 0` locally. The suite's value for CONS-03 depends on flake being visible. If the ECONNREFUSED race needs tolerance, make it ONE targeted, loudly-commented mechanism at the webServer/health level — never a global retry budget.
- Never touch `reuseExistingServer` semantics; the E2E_REUSE_SERVER opt-in and `gracefulShutdown` (config lines 36–39) are load-bearing (temp DATA_DIR cleanup depends on graceful SIGTERM).
- Also remember the standing invocation trap (Phase 12/53 notes): `npx playwright test <spec>` without `--config e2e/playwright.config.mjs` boots NO webServer and fails with ECONNREFUSED by design — that's an invocation error, not the race. Verify how you launched before diagnosing.

**Detection:** a diff that changes `retries`, `timeout`, or `reuseExistingServer` defaults in `playwright.config.mjs` without a justification paragraph; a spec that "passes" only when run with `E2E_REUSE_SERVER=true`.

---

### Pitfall 3: De-flaking VIEW-02 by adding timeouts that hide the race instead of removing it (CONS-03)

**What goes wrong:** VIEW-02 (`e2e/saved-views.spec.mjs`) has several intrinsic race sources: (1) column show/hide writes through a **debounced** `persistLiveView` (`actions.js:1402` — `import('../core/viewSync.js').then(...)`), so a save can land after the spec has already moved on; (2) the views/columns bodies are **lazy chunks** (`savedViewsUi.js`, `viewSync.js` — imported with `.catch(() => {})` that silently swallows failures, `actions.js:455`); (3) the popover dismiss is a **coordinate click** (`page.mouse.click(5, 400)`), which can land on whatever happens to be at that pixel; (4) the OWNER/acme workspace is **shared mutable state** across concurrent spec files. The tempting fix: sprinkle `page.waitForTimeout(500)`, increase global timeouts, add `retries`.

**Why it happens:** `.catch(() => {})` on lazy imports and debounce windows are invisible in the spec; the failure manifests downstream as "the row wasn't there" and reads like a UI bug, so the spec author buys time instead of awaiting the write.

**Consequences:** A `waitForTimeout` flake-fix de-flakes THIS run and re-flakes on a slower CI machine; worse, it converts a genuine product bug (a dropped view write, a swallowed chunk-load failure) into an intermittent green. The Phase 38 lesson applies at spec scale: suppression/waiver mechanics that hide symptoms outlive their diagnosis.

**Prevention:**
- Replace every sleep with an awaited *condition that is the actual completion signal*: after toggling a column, await the `PUT /api/me/views` response (`page.waitForResponse`) or await the server row via `apiClient` — the spec already fixtures through the real API and asserts the `saved_views` table row (D-05); extend that same server-side truth to the write-through path.
- For lazy-chunk surfaces, wait for the concrete rendered artifact (the popover option, the row) with `toBeVisible()` auto-retry rather than timing the import.
- Replace the coordinate dismiss (`mouse.click(5,400)`) with the app's own close path (a real close button, or `Escape` if the app handles it) — a pixel click on shared chrome is a flake generator and can misfire into a destructive action.
- Diagnose before treating: run the spec repeatedly against a pre-warmed server (`E2E_REUSE_SERVER=true`) and with `--repeat-each=10` to classify the flake (write-race vs chunk-race vs shared-fixture collision) BEFORE writing the fix. Keep `retries: 0` locally during diagnosis.
- If the shared OWNER account is the culprit (other specs mutating acme concurrently), the fix is run-unique fixtures following the file's own convention ("run-unique view names to never collide"), not cross-file locking.

**Detection:** any `waitForTimeout` appearing in the diff; a flake that disappears when `retries: 1` is set and reappears at 0 (that means the race is still there, you bought silence).

---

### Pitfall 4: Mobile tasks-table layout breaking the desktop layout or the column show/hide feature (CONS-02)

**What goes wrong:** Making the tasks table mobile-friendly without a framework means hand-rolled responsive CSS. The classic mistakes: (a) adding `overflow-x: auto` + `min-width` on the table so mobile scrolls but desktop regains a horizontal scrollbar it never had; (b) restyling the `<table>` into stacked cards with `display: block` globally instead of under a media query, silently changing desktop DOM rendering semantics; (c) implementing mobile truncation as a *separate render path* that reads the visible-columns list differently than the desktop path — so `setColumn` show/hide (Phase 57, debounced write-through) works on desktop and is ignored, duplicated, or stale on mobile; (d) fixing mobile with inline styles generated in JS, bypassing the stylesheet the overflow spec measures.

**Why it happens:** There is no framework grid to lean on; the temptation is a second code path for mobile. But the column show/hide feature IS the state contract (`prefs` + `saved_views`, D-09/D-10), and a second path forks the contract.

**Consequences:** Column visibility on mobile silently disagrees with the saved view; the columns popover (which the saved-views spec drives) breaks; desktop gets a regression that no mobile-only test catches; the spec `french-overflow` at 390 px starts measuring a different DOM than 1280 px.

**Prevention:**
- One render path, one source of truth: the mobile treatment (truncated rendering with the columns button, per the deferred Phase 57 UAT item) must consume the SAME visible-columns state the desktop table consumes. Hide/reorder via the same CSS classes the show/hide feature toggles (`hidden` class driven by the existing state), not a parallel data structure.
- Gate every change under the existing breakpoint media query; verify desktop is untouched by running the desktop-view e2e specs (projects-table, saved-views, french-overflow@1280) before/after — a visual diff of the desktop screenshot is the cheapest tripwire.
- Respect the app's own convention visible in this codebase: structural selectors exist in specs for layout roots ONLY (`.side`, `.topbar`, `.modal-f` — french-overflow header). If the mobile fix adds new structural classes the specs will need, catalogue them deliberately like the existing ones, or better, fix within the existing roots.
- Mobile here is the *table view's* layout; the 390 px proof in french-overflow already passes today — do not widen the mobile fix beyond the tasks table or the 390 px assertions of other routes will need re-baselining.

**Detection:** a diff touching table CSS outside a `@media` block; a new mobile-specific column list or per-column inline `style.width` computed in JS; the `projects-table` or `saved-views` specs needing selector changes (they drive the columns popover — if THEY break, the feature contract broke, and that's a stop-and-reconsider signal, not a selector update).

---

### Pitfall 5: CSS bloat blowing the 500 kB chunk gate, and new literals blowing the i18n gate (CONS-02 hard gates)

**What goes wrong:** The mobile fix is the one CONS item that ships user-facing UI, so it's the one that can break the two standing gates: (a) the D-02 gate — entry is at 499,780 B against the 500,000 B limit (`56-02-SUMMARY.md` line 214) with **220 bytes of headroom**; any new CSS/JS that lands in the entry chunk fails the build; (b) the i18n scan gate — any new uncatalogued user-facing literal ("No columns", truncated-label aria text, mobile empty-state copy) fails `scripts/i18n-scan.mjs` unless catalogued EN+FR.

**Why it happens:** 220 B is invisible headroom; a single new utility class string repeated in markup, or one `aria-label` hardcoded in English, passes locally and fails the gate.

**Consequences:** Blocked builds late in the plan; worse, the tempting remedy — *raising the gate threshold* — destroys the very invariant the milestone is standing on ("threshold never weakened" is an explicit 56-02 acceptance criterion).

**Prevention:**
- Mobile CSS changes go in the existing stylesheet (CSS is currently small relative to JS, but verify with the chunk-size test `test/build-chunk-size.test.mjs` after EVERY task, not at phase end).
- If entry headroom is the binding constraint, the fix follows the established pattern (56-02/57-01/61-02): move a low-frequency module to the lazy map — one map entry + import removal — never a gate bump.
- Any user-visible string introduced by the mobile layout gets an EN+FR catalogue key in the same commit; `aria-label`s count (the suite's own selectors read `fmt('act.columns')`, `fmt('a11y.mainNav')` etc. from the catalogue — hardcoded strings would also break those selectors' language-independence).
- Run `npm run build` + chunk test + `scripts/i18n-scan.mjs` as the plan's per-task verification triad, mirroring how 56-02 gated itself.

**Detection:** a diff adding a literal string in a template or `aria-label` without a matching `en.json`/`fr.json` pair; any edit to `test/build-chunk-size.test.mjs`'s threshold constant (rejection-worthy without an owner ruling).

---

### Pitfall 6: Dist staleness / temp-dir contamination producing phantom e2e failures across all three CONS items

**What goes wrong:** The suite is fail-closed on dist staleness (content-hash manifest check from 56, "fail-closed spawn test"). Repair sessions that rebuild dist mid-stream, leave leftover webServers on ports 4317/4318, or leave stale `test-results/` produce failures that look like the bug being repaired (documented: two concurrent playwright runs raced `test-results/` → ENOENT trace failures; leftover servers → "port already used"; Phase 12/53 notes the no-config invocation trap). In a consolidation milestone whose entire exit criterion is "suite green", phantom failures are maximally damaging — they either stop the work or get "fixed" with the wrong change.

**Why it happens:** Multiple spec runs in one session, worktree bisects (the 56-02 precedent), and demo-config vs main-config ports share state.

**Consequences:** A bisect that "proves" the wrong commit introduced a failure; a CONS-03 fix written against a phantom; hours lost misdiagnosing.

**Prevention:**
- Every e2e run in the repair plans goes through `npm run e2e -- <spec>` (the wired command with config + webServer), never bare `npx playwright test`.
- Between diagnosis runs, clean ports and `test-results/`; one run at a time; the 56-02 bisect-in-a-throwaway-worktree pattern is the model (it cleaned up after itself — copy that, including cleanup).
- After any CSS/src change relevant to CONS-02, rebuild dist before trusting a spec result — the staleness guard will (correctly) fail otherwise; treat that failure as a reminder, not a bug.

**Detection:** ECONNREFUSED with no config change in the diff; ENOENT under `test-results/`; "port already used" — all three are environment signatures, stop and clean before touching specs.

---

## Moderate Pitfalls

### Pitfall 7: French specs double as overflow regression — spec updates must not change what they measure
The 7 french-overflow failures are ALSO the suite's only 390 px overflow proof. Repairing them by skipping the 390 px viewport ("just test 1280 for now") or dropping routes from the `ROUTES` array removes the only mobile-overflow coverage right before CONS-02 CHANGES the mobile layout. **Prevention:** keep the full 16-route × 2-viewport matrix; if CONS-02 lands first, the repaired french-overflow specs are the acceptance test for it — sequence accordingly (see Phase-Specific Warnings).

### Pitfall 8: Silent `.catch(() => {})` lazy seams vs honest failures
The codebase's lazy-chunk error policy is deliberate silent degradation (`actions.js:452–455` — "degrades silently like the other lazy seams"). When diagnosing CONS-01/CONS-03, a swallowed chunk failure looks like "element never appeared". **Prevention:** during diagnosis, temporarily surface these (or use Playwright trace/console capture) — but do NOT change the app's silent-degradation policy as a "fix"; it's a shipped design decision (CR-02/T-56-01). Fix the spec's waiting, not the app's error policy.

### Pitfall 9: Touching Phase 38 suppression / no-double-send invariants while refactoring shared modules
CONS-01/02 repairs will edit shared files (`actions.js`, popovers, layout) that the suppression invariants and byte-level redaction/leak tests also exercise. A "harmless" reorder can break suppression ordering or redaction byte-identity. **Prevention:** the byte-level redaction/leak tests and Phase 38 suites must run in every task's verification, unmodified; a diff that edits the redaction/suppression test files themselves is rejection-worthy in this milestone (the constraint says untouched).

### Pitfall 10: Fixing mobile layout by feature-detecting touch/UA instead of viewport
UA/touch sniffing breaks on desktop touchscreens and emulator-based specs. The suite drives `devices['Desktop Chrome']` and explicit viewports (1280/390). **Prevention:** media queries / container queries keyed to viewport width only — matching how the specs exercise the app.

## Minor Pitfalls

### Pitfall 11: New structural classes colliding with spec selectors
If CONS-02 renames or adds classes inside `.side`/`.topbar`-adjacent chrome, `french-overflow`'s structural measurements shift. Prevention: prefer styling over existing classes; if new roots are unavoidable, update the spec's banner comment (its own convention documents which selectors are structural).

### Pitfall 12: FR typography rules in new mobile strings
New French catalogue strings for the mobile layout must follow the house style (no-break space before `:`, narrow no-break space before `?`, curly apostrophe, NFC) — the i18n scan and FR reviewers catch this late otherwise. Prevention: copy an existing adjacent key's punctuation pattern.

### Pitfall 13: `workers` default locally means spec files CAN run concurrently
`workers: 1` only on CI (`playwright.config.mjs:16`). Local diagnosis of VIEW-02 with default workers can hit shared-fixture collisions that never occur in CI — misdiagnosis risk. Prevention: diagnose with `--workers=1` to match CI semantics.

---

## Phase-Specific Warnings

| Repair | Likely Pitfall | Mitigation |
|--------|---------------|------------|
| CONS-01 (e2e repair) | Weakened assertions (Pitfall 1) | Per-failure drift-vs-regression classification first; assertion-strength diff review; no fix without better waiting |
| CONS-01 | webServer race "fixed" via retries/reuseExistingServer (Pitfall 2) | Fix readiness contract; keep `retries: 0` locally; leave config defaults alone |
| CONS-02 (mobile table) | Parallel mobile render path forking column state (Pitfall 4) | One render path, same visible-columns state, media-query-gated; projects-table/saved-views specs as tripwire |
| CONS-02 | 500 kB gate (220 B headroom) + i18n literals (Pitfall 5) | Per-task triad: build + chunk-size test + i18n scan; lazy-map remedy not threshold bump |
| CONS-03 (VIEW-02 de-flake) | waitForTimeout masking the debounce/chunk race (Pitfall 3) | Await `waitForResponse`/server row; replace coordinate dismiss; classify flake with `--repeat-each` first |
| All | Phantom failures from stale dist/ports/test-results (Pitfall 6) | Always `npm run e2e --`; clean between runs; worktree bisects self-cleaning |

## Recommended Phase/Plan Order

1. **CONS-01 first.** The repaired specs are the verification instrument for everything else: CONS-02 needs `french-overflow@390px` as its acceptance test, and CONS-03 needs a green baseline suite (retries stay 0) to prove de-flaking worked. Doing CONS-01 last would mean validating the mobile change and the flake fix against a red suite.
2. **Within CONS-01, land the ECONNREFUSED readiness fix (Pitfall 2) as its own small plan** before the 9-spec repair, so the spec work runs against a stable launcher.
3. **CONS-02 second**, in small plans each ending on the verification triad (build + chunk gate + i18n scan + desktop specs + repaired french-overflow). Small plans protect the 220 B headroom — a big-bang mobile plan is where gates get quietly raised.
4. **CONS-03 last.** De-flaking benefits from every other spec being green (no cross-file noise on the shared OWNER fixture) and from CONS-01's established awaiting patterns. Diagnosis plan (`--repeat-each`, pre-warmed server, workers=1) as a separate plan from the fix plan.

## Sources

- Codebase-verified (HIGH): `e2e/playwright.config.mjs`, `e2e/french-overflow.spec.mjs`, `e2e/saved-views.spec.mjs`, `src/shell/layout.js` (lazy map), `src/actions/actions.js` (debounced viewSync writes, `.catch(()=>{})` seams), `56-02-SUMMARY.md` (bisect of the 9 failures, ECONNREFUSED note, gate headroom), `deferred-items.md`, Phase 04/12/53 config-evolution notes (reuseExistingServer opt-in rationale, no-config invocation trap).
- Playwright community wisdom (MEDIUM-HIGH): webServer readiness vs first-request race; `waitForTimeout` as flake laundering; retries masking flake; coordinate clicks as flake sources; debounced writes needing awaited completion signals.
