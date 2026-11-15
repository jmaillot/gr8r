# Phase 63: VIEW-02 De-Flake - Research

**Researched:** 2026-11-14
**Domain:** Playwright e2e flake triage — debounced write-through race, popover dismissal semantics, cross-spec state coupling
**Confidence:** HIGH (codebase claims verified by reading source this session; triage outcome itself is intentionally open)

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Determinism proven by `--repeat-each 10`, retries=0, `--workers=1`, pre-warmed server — one clean 10× pass is the acceptance bar.
- **D-02:** Isolated proof NOT sufficient: fixed VIEW-02 must also pass one full parallel e2e suite run (all specs, default workers) this phase — pre-validates Phase 64's 111/111 close gate.
- **D-03:** If triage proves an app-side async-contract bug, executor fixes it in-phase without stopping (overrides Phase 62 D-07 flag-and-stop for THIS phase). Fix + regression test land as a separate commit. Never mask the bug in the spec.
- **D-04:** No structural isolation — no `test.describe.serial`, no per-file workers override, no quarantine. Fix = real awaited completion signals + run-unique state.
- **D-05:** Root-cause evidence lives in `.planning/phases/63-view-02-de-flake/63-TRIAGE.md` — hypothesis × evidence table, trace excerpts, exact run commands, verdict. Every confirmed/eliminated row cites trace output.
- Standing constraints: no added sleeps, no `networkidle`, no raised global retries, no `reuseExistingServer`/`gracefulShutdown` changes, no chunk-gate edits. Assertions strengthened, never weakened.

### the agent's Discretion
(63-CONTEXT.md declares none explicitly; within phase scope: triage method details, which hypothesis-fix ordering, regression test placement.)

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FLAKY-01 | Flake root cause diagnosed with evidence | Trace protocol (§Architecture Patterns), hypotheses mechanism analysis (§The Three Hypotheses) |
| FLAKY-02 | VIEW-02 passes deterministically, retries=0 | waitForResponse arming subtleties, Escape dismissal path, `npm run e2e --` command form |
</phase_requirements>

## Summary

VIEW-02 (`e2e/saved-views.spec.mjs`) exercises the saved-views lifecycle: toggle columns (each firing a debounced 450 ms live-row PUT), sort, save a named view (an awaited PUT with `name` in the body), API read-back, apply a named view (which re-fires the debounced live PUT), update, delete. All three ROADMAP hypotheses have concrete mechanisms in the code:

1. **Debounce race (leading hypothesis, confirmed plausible by code):** `persistLiveView` (`src/core/viewSync.js:23-35`) fires a PUT to `/api/me/views` **450 ms after the last call**, via `clearTimeout` + `setTimeout`, through a lazy dynamic `import()` — and `applyTableView` (`src/views/savedViewsUi.js:121-133`) calls `persistLiveView` after applying a named view. Any subsequent action that re-arms the timer can indefinitely postpone or coalesce pending writes; a spec or assertion that assumes "the toggle landed" without awaiting the PUT races this window.
2. **Coordinate-click dismissal:** `setColumn()` dismisses the columns popover with `page.mouse.click(5, 400)` (`saved-views.spec.mjs:57,116`) — a raw viewport click near the left edge with no guarantee of hitting inert chrome. The app's semantic path exists: the global `keydown` handler (`src/actions/keyboard.js:162-166`) calls `closePop()` (`src/overlays/popovers.js:87-92`) on `Escape` when `S.ui.pop` is set — a synchronous `render()` clears the popover. `Escape` is the replacement.
3. **Shared OWNER/acme live-state:** OWNER is reused across specs and its `saved_views` live row (`key=tasks`) is server-side shared state; `hydrateViews()` runs at every workspace entry. Plausible but weakest — named views are per-user rows with run-unique names, and the spec's API read-back reads `views.named` only, so triage must confirm/eliminate.

**Primary recommendation:** Plan as triage-first — plan 01 produces the trace + `63-TRIAGE.md` with zero code changes; plan 02 applies the spec fixes (Escape dismissal + scoped `waitForResponse`) which are correct regardless of which hypothesis wins; plan 03 (conditional) fixes any proven app-side async-contract bug with a regression test; final gate is the D-01 10× run plus the D-02 full-suite run.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Popover dismissal | Client (app JS) | Spec | `closePop()` via `keyboard.js` owns dismissal; spec just triggers `Escape` |
| Live-view write-through | Client (app JS) → API | Spec (awaits signal) | `persistLiveView` debounce is app code; spec must await the real PUT, never sleep |
| Named-view save/apply/delete | Client → API (`/api/me/views`) | — | Already awaited (`saveNamedView` is async, awaited in `savedViewsUi.js` modal `run`) |
| Triage evidence | Tooling (Playwright trace) | Docs (`63-TRIAGE.md`) | `trace: 'retain-on-failure'` already configured; `--trace on` for forced capture |

## Standard Stack

No new packages. Existing tooling only [VERIFIED: package.json:26-30, npx playwright --version]:

| Tool | Version | Purpose |
|------|---------|---------|
| @playwright/test | ^1.64.1 (installed: 1.64.1) | e2e runner, `--repeat-each`, `--trace on`, `waitForResponse` |
| Node | >=24 (installed: 24.21.0) | runtime |
| `npm run e2e -- <spec>` | — | **Mandatory invocation form** — never bare `npx playwright test` (stale dist/ports trap, STATE.md standing note) |

**No installs → no Package Legitimacy Audit needed.**

## Architecture Patterns

### System Architecture Diagram (the suspect interaction cluster)

```
Spec action: toggle column checkbox
        │
        ▼
A.toggleCol2 (actions.js:1395-1404)
  save() + render() + dynamic import('viewSync.js') ──► persistLiveView(key)
                                                          │ clearTimeout + setTimeout(450ms)
                                                          ▼
                                              PUT /api/me/views  (live row, no `name` in body)
                                                          ▲
Spec: "Save current view" / "Apply view" ── may re-arm this timer, or race it
        │                                                  (applyTableView:121-133 calls
        ▼                                                   persistLiveView after apply)
saveNamedView ──► PUT /api/me/views (named row, `name` in body) ── awaited

Spec dismissal today: page.mouse.click(5,400) ×3  ──replace──►  keyboard.press('Escape')
                                                                  └─► closePop() ─► render()
```

### Pattern 1: Await the debounced PUT on its real completion signal
**What:** Arm `page.waitForResponse` with a predicate matching the live-row PUT, immediately before the FINAL action that triggers it.
**Critical subtlety (this is where a naive fix flakes differently):**
- The PUT fires 450 ms after the **last** `persistLiveView` call, plus the dynamic-import delay on the first call of a chunk [VERIFIED: src/core/viewSync.js:23-35; src/actions/actions.js:1402].
- Arming `waitForResponse` *before* a later toggle that re-arms the timer means the previously-armed waiter can hang past its timeout or bind to a stale PUT. Arm it after the last trigger action, or re-arm per trigger.
- Both live and named writes PUT to `/api/me/views`. Distinguish by body: live PUT's `postData` JSON has **no `name` field**; named PUT has `name` [VERIFIED: src/core/viewSync.js:5-6 (`putViews` vs `putViewsNamed`)].
- Established in-repo pattern: `e2e/helpers/setup.mjs:119` — `page.waitForResponse(r => r.url().endsWith('/api/me/views') && r.request().method() === 'PUT')` style, returning the promise, awaiting it around the triggering click [VERIFIED: e2e/helpers/setup.mjs:119-123].
- Do NOT put the wait in a global helper that changes other specs' behavior unless triage proves they need it; this phase scopes to VIEW-02.

### Pattern 2: Semantic popover dismissal
**What:** Replace `await page.mouse.click(5,400); await expect(.pop.floating).toHaveCount(0)` with:
```js
await page.keyboard.press('Escape');
await expect(page.locator('.pop.floating')).toHaveCount(0);
```
**Why safe:** `keyboard.js:162-166` — on `Escape`, if `S.ui.pop` set → `closePop()`; `closePop()` (`popovers.js:87-92`) sets `S.ui.pop = null` and synchronously `render()`s, so the `toHaveCount(0)` assertion is a genuine completion signal, not a sleep [VERIFIED: both files, this session].
**Caveat:** `Escape` handling is ordered — the palette/`S.ui.pl` branch returns earlier (`keyboard.js:150-157`); as long as the palette is closed when the popover is open, `S.ui.pop` branch is reached. Keep the `toHaveCount(0)` assertion as proof the dismissal took effect.

### Pattern 3: Triage trace protocol (FLAKY-01)
```bash
# isolated, deterministic reproduction attempt (D-01)
npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0

# with forced trace for evidence
npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 --trace on

# under load (hypothesis 3 / D-02 conditions)
npm run e2e -- --retries=0
```
Config facts: local `retries: 0` already (CI: 1); `trace: 'retain-on-failure'`; webServer on port 4318/`E2E_PORT` with health-check readiness [VERIFIED: e2e/playwright.config.mjs]. Traces land in `playwright-report/`/`test-results/` — **clean stale `test-results/` between runs** (STATE.md environmental trap).

### Anti-Patterns to Avoid
- **Sleeping past the debounce** (`waitForTimeout(600)`): forbidden by standing constraints and masks the race.
- **`networkidle`:** forbidden; app may have other traffic.
- **Arming `waitForResponse` before the last re-arming toggle:** produces a different flake (hang) — see Pattern 1 subtlety.
- **Isolating the spec** (serial, per-file workers): forbidden by D-04.
- **Fixing in the spec what triage proves is an app bug:** forbidden by D-03/SC-4.

## The Three Hypotheses (mechanism analysis for triage)

### H1: Debounced `persistLiveView` write-through race — LEADING
**Mechanism [VERIFIED: src/core/viewSync.js:23-35]:** 450 ms trailing debounce; `applyTableView` re-arms it after applying a named view (`savedViewsUi.js:128`); `toggleCol2` fires it fire-and-forget via dynamic import (`actions.js:1402`). The spec toggles columns then immediately opens popovers/saves — the named-save read-back (`snapshotView`) reads in-memory `S.views[key]`, so the *named row* is safe; the *live row* PUT may land mid-subsequent-action, or be coalesced away by a later toggle's `clearTimeout`. Where the spec (or a future assertion) depends on the live row having landed, it races. **Also a candidate app-side contract bug (D-03):** `applyTableView`'s `persistLiveView` call can be cancelled by a subsequent toggle, silently dropping the applied state's write-through.
**Test-visible symptom:** failures near column toggles / apply; trace shows PUT arriving after the assertion or not at all.

### H2: Coordinate-click dismissal
**Mechanism:** `mouse.click(5,400)` targets viewport coordinates; under different viewport/font states (parallel load, font timing) the click can land on interactive content (nav rail, table rows — a row click can open a drawer, `main.js:180-199` closes pop on task open) or miss the outside-click target entirely, leaving the popover open so the next popover action double-fires.
**Fix regardless of root cause:** Escape dismissal (Pattern 2) — this fix is mandated by SC-3 independent of triage outcome.

### H3: Shared OWNER/acme live-state coupling
**Mechanism:** OWNER's `saved_views` live row (`key=tasks`) is server state shared by any spec signed in as OWNER on the tasks table; `hydrateViews()` adopts it at workspace entry [VERIFIED: viewSync.js:38-73]. VIEW-02 itself reads only `views.named` via API and does not re-hydrate mid-test, so direct interference is limited — but triage must confirm/eliminate by checking whether failures correlate with co-running OWNER specs and whether the live row's server content diverges at failure time.
**If confirmed:** fix is run-unique state / awaited signals (D-04), NOT isolation.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Awaiting async app writes | sleeps, polling loops | `page.waitForResponse` predicate | app exposes a real network signal [VERIFIED: helpers/setup.mjs:119 pattern] |
| Dismissing popover | coordinate math | `keyboard.press('Escape')` | app's own semantic path [VERIFIED: keyboard.js:162-166] |
| Failure evidence | console.log instrumentation | Playwright `--trace on` + trace viewer | already configured, zero code change |
| Repetition | shell loops | `--repeat-each=10` | native, per-test isolation |

## Common Pitfalls

### Pitfall 1: Waiting for the wrong PUT
**What goes wrong:** `waitForResponse` on `/api/me/views` catches the *named* PUT when the test meant the *live* PUT (or vice versa) — the wait "passes" while the race persists.
**Avoid:** predicate on `request().postData()` — live PUT has no `name` field [VERIFIED: viewSync.js:5-6].

### Pitfall 2: Stale environment
**What goes wrong:** stale `dist/`, orphaned port 4317/4318 server, leftover `test-results/` poison runs and produce phantom flakes.
**Avoid:** always `npm run e2e -- <spec>`; clean `test-results/` between triage rounds (STATE.md standing trap).

### Pitfall 3: `--repeat-each` interacts with module-level `const run = newRunId()`
**What goes wrong:** `newRunId()` runs once per **module load**, not per repeat — repeat-each re-imports per worker repetition in Playwright, but the fixture IP/name reuse must be checked during triage; a fixed VIEW_NAME across repeats would collide in `saved_views` uniqueness.
**Avoid:** verify in triage that each repeat gets a unique name; if not, that itself is evidence.

### Pitfall 4: Escape swallowed by another overlay
**What goes wrong:** if the command palette or a modal is open, `Escape` closes that instead of the popover.
**Avoid:** keep the existing `toHaveCount(0)` assertion — it turns a swallowed Escape into a fast, clear failure, not a silent wrong-state continuation.

## Code Examples

### Scoped live-PUT wait (spec-side fix)
```js
// After the FINAL toggle that should land, per Phase 63 SC-3:
const livePut = page.waitForResponse(
  r => r.url().endsWith('/api/me/views')
    && r.request().method() === 'PUT'
    && !JSON.parse(r.request().postData() || '{}').name   // live row, not named
);
await page.keyboard.press('Escape');                       // semantic dismissal (replaces mouse.click(5,400))
await expect(page.locator('.pop.floating')).toHaveCount(0);
await livePut;                                             // real completion signal, not a timeout
```
*Source pattern:* `e2e/helpers/setup.mjs:119-123` (Phase 62 D-08 awaited-signal convention).

### Regression test placement (if app bug proven)
Unit regression in `test/` (node --test, e.g. a `viewSync` debounce test asserting the last-armed write is never dropped), or an e2e pin inside the stabilized spec — follow whichever layer the bug lives at; app fix and test land as their own commit (D-03).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node | everything | ✓ | 24.21.0 | — |
| @playwright/test | triage + fix | ✓ | 1.64.1 | — |
| Chromium (playwright browsers) | e2e | ✓ (suite runs in Phase 62) | — | — |

No missing dependencies. No new packages installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (unit) + @playwright/test 1.64.1 (e2e) |
| Config file | `e2e/playwright.config.mjs` |
| Quick run command | `npm run e2e -- e2e/saved-views.spec.mjs --workers=1 --retries=0` |
| Full suite command | `npm run e2e` (D-02 gate); `npm test` (unit, 1524 green) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FLAKY-01 | Root cause evidenced | triage artifact | triage run: `npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 --trace on` | ❌ Wave 0 (`63-TRIAGE.md`) |
| FLAKY-02 | Deterministic pass | e2e | same 10× run green, then full `npm run e2e` (D-02) | ✅ spec exists |

### Sampling Rate
- Per task commit: stabilized-spec quick run
- Per wave merge: 10× repeat run
- Phase gate: 10× green (D-01) + full parallel suite green (D-02) + 1524 unit tests + lint + i18n gate

### Wave 0 Gaps
- [ ] `.planning/phases/63-view-02-de-flake/63-TRIAGE.md` skeleton (hypothesis × evidence table) — D-05
- None in code — spec, helpers, and config all exist.

## Security Domain

`security_enforcement` not disabled in `.planning/config.json`, but this phase changes no auth, session, crypto, or input-validation surface — it touches a test spec and possibly a debounce timing in client view-sync. Applicable ASVS categories: none newly affected. Standing note: the spec's API read-back uses the existing cookie-bearing `apiClient` helper — do not introduce credential handling changes. No new threat patterns.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `--repeat-each` gives each repetition a fresh module evaluation, so `newRunId()` yields unique names per repeat (needs triage confirmation) | Pitfall 3 | Name collisions across repeats would create a *new* flake during the proof run |
| A2 | Escape always reaches the `S.ui.pop` branch when a popover is open (palette closed) | Pattern 2 | Dismissal fails visibly — caught by the kept `toHaveCount(0)` assertion; low risk |
| A3 | The 450 ms debounce value and lazy-import delay are the complete delay chain on the live PUT | H1 | Triage may reveal server-side latency coupling; trace will show it |

## Open Questions (resolved by the triage plan 63-01 — owned, not dangling; verdicts recorded in 63-TRIAGE.md)

1. **Which hypothesis actually fires?** Intentionally unresolved — the phase's first plan exists to answer it with trace evidence (D-05). Planning should NOT pre-commit fix order beyond the unconditional SC-3 spec fixes.
2. **Is the apply-then-toggle coalescing (H1's silent-drop variant) an app bug or by-design debounce semantics?** — Triage decides; if bug, D-03 fix-in-phase applies.

## Sources

### Primary (HIGH confidence — read this session)
- `e2e/saved-views.spec.mjs` — full spec incl. `mouse.click(5,400)` at lines 57/116
- `src/core/viewSync.js:23-35` — `persistLiveView` debounce; `:5-6` putViews vs putViewsNamed; `:100-124` saveNamedView
- `src/actions/actions.js:1395-1404` — `toggleCol2` fire-and-forget dynamic import
- `src/views/savedViewsUi.js:121-133` — `applyTableView` → `persistLiveView`
- `src/actions/keyboard.js:162-166` — Escape → closePop; `src/overlays/popovers.js:87-92` — closePop
- `e2e/playwright.config.mjs` — retries/trace/webServer config
- `e2e/helpers/setup.mjs:119-123` — waitForResponse convention
- `.planning/phases/62-e2e-baseline-repair/62-CONTEXT.md` conventions (referenced via 63-CONTEXT)

### Secondary
- `.planning/ROADMAP.md`, `REQUIREMENTS.md`, `STATE.md` — hypotheses, constraints, environmental traps

## Metadata

**Confidence breakdown:**
- Spec/app mechanics: HIGH — every claim read from source this session
- Triage outcome: deliberately open (that IS the phase)
- Fix patterns: HIGH — same patterns proven in Phase 62

**Research date:** 2026-11-14
**Valid until:** 2026-12-14 (repo-stable; no external deps)
