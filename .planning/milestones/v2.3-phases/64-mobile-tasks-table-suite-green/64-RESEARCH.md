# Phase 64: Mobile Tasks Table & Suite Green - Research

**Researched:** 2026-11-14
**Domain:** CSS-only mobile gating of a table toolbar + Playwright mobile-viewport e2e (main config)
**Confidence:** HIGH (all claims verified against local source this session)

## Summary

This phase is small in code and precise in verification. The Columns-button hide is a
single CSS rule; the card polish touches one template in `src/views/table.js` plus
`responsive.css`; the new e2e spec follows the existing per-domain spec shape
(`french-overflow.spec.mjs` is the closest precedent and already does viewport-scoped
bounding-box assertions at 390×844). No new packages, no config changes — the Package
Legitimacy Audit is N/A.

**The one planning-critical discovery:** the CONTEXT's D-01 rationale ("the same tier
where the `.only-m` card stack flips" at 900px) does not match the current CSS. The
`.only-m` flip lives in a `@media (max-width: 640px)` block
(`src/styles/base.css:154-159` [VERIFIED: src/styles/base.css:154-159]), and the desktop
table wrapper `.tbl-wrap` carries an inline `hide-m` class
(`src/views/table.js:84` [VERIFIED: src/views/table.js:84]) — but `.hide-m
{ display: none !important; }` is defined *inside the 640px tier*
(`src/styles/responsive.css:139-141` [VERIFIED: src/styles/responsive.css:139-141]).
Result: today there is a 641–900px band where the **desktop table renders and the card
stack does not**. The locked decision (hide Columns at 900px, D-01) still stands, but the
planner must decide explicitly what that band shows:

- **Option A (recommended, minimal):** hide the Columns button at ≤900px and leave the
  band as-is (table without Columns). The boundary e2e just-under-900px asserts
  Columns hidden + table visible. The card stack keeps its 640px cut. No CSS beyond the
  one hide rule.
- **Option B (aligns with D-01's stated intent):** also move the `.only-m` flip and/or
  `.hide-m` definition to the 900px tier so table→cards swap happens at 900px. This is a
  second, behavior-widening CSS change — more desktop-resize surface changed; D-04
  ("a desktop window resized under 900px gets the card stack without a Columns button,
  consistently") actually *requires* this: under D-04's wording, a 700px desktop window
  must show cards, which today it does not.

Read D-04 literally and **Option B is the compliant reading**. The planner should put a
one-line decision/checkpoint on this: it determines whether the CSS task touches
`base.css` (flip `.only-m` at 900px) in addition to the one rule in `responsive.css`.

**Primary recommendation:** one CSS task (hide rule + breakpoint alignment per the
band decision), one card-polish task, one e2e spec task, then a full-suite close run.
Per-task triad (build + chunk gate + tests) as CONTEXT requires — the chunk gate has
~220 B headroom, so keep CSS byte-lean (no added utility frameworks).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Columns button hides at `max-width: 900px` (same tier as `.only-m` card stack flip — see Critical Finding above: the flip is currently at 640px; alignment is needed to satisfy D-01's stated intent)
- **D-02:** Pure CSS hide — no JS-gated render, no `opt.cols` stripping; saved-view blobs stay byte-compatible
- **D-03:** Rule is generic: any view with a Columns button (`data-pop="cols"`) loses it under the breakpoint, not scoped to tasks-table only
- **D-04:** Viewport width only — no `(pointer: coarse)`; resized desktop windows behave the same
- **D-05:** Polish the existing `.only-m` `.panel` cards (`src/views/table.js:94`) — no new mobile component, no CSS-restacked `.trow`
- **D-06:** Fixed card field set (status/title/key/priority/assignees/due/estimate/progress); `hidden[]`-driven card fields STAY DEFERRED
- **D-07:** "Without truncation" = card stack renders completely with toolbar visible, for long titles, many assignees, labels, estimates
- **D-08:** Overflow policy: wrap-everything — `overflow-wrap` only, never clipped, never ellipsis-plus-tap-to-expand
- **D-09:** One spec file: `e2e/mobile-tasks-table.spec.mjs`
- **D-10:** `setViewportSize({ width: 390, height: 844 })` + one boundary test just under 900px; main config only — no second project/webServer
- **D-11:** Web-first auto-retrying assertions: `toBeHidden()` for Columns; `scrollWidth <= clientWidth` (small tolerance) + `toBeVisible()`/bounding-box width checks for completeness. No screenshots, no sleeps, no `networkidle`
- **D-12:** Purpose-built long-task fixture (very long title, 4+ assignees, labels, estimate) — deterministic
- **D-13:** "111/111" = full suite 100% green (N/N, whatever N becomes)
- **D-14:** VIEW-02 stability via one full parallel run after the mobile change lands; no 10× re-run
- **D-15:** All gates green: 1524+ unit tests, lint, 500 kB chunk gate (~220 B headroom), EN+FR i18n gate
- **D-16:** Any close-run failure fixed in-phase before close — no waivers

### the agent's Discretion
- Exact card polish details (spacing, tap targets, wrap specifics) — contract is "no truncation, wrap everything"
- Placement of the new CSS rule within responsive.css; optional unit test(s) for card polish

### Deferred Ideas (OUT OF SCOPE)
- `hidden[]`-driven mobile card fields (owner re-confirmed keep-deferred)
</user_constraints>

## Standard Stack

### Core (all already in repo — nothing to install)
| Tool | Version/loc | Purpose | Why |
|------|-------------|---------|-----|
| CSS media queries | `src/styles/responsive.css` | breakpoint gating | existing pattern (1100/900/640 tiers) [VERIFIED: src/styles/responsive.css:4,16,99] |
| `@playwright/test` | repo dep | mobile e2e | existing suite, main config `e2e/playwright.config.mjs` [VERIFIED: e2e/playwright.config.mjs] |
| `setViewportSize` / `page.setViewportSize` | Playwright built-in | mobile viewport | used today in `french-overflow.spec.mjs` via context `viewport` option [VERIFIED: e2e/french-overflow.spec.mjs:71-78] |
| node --test | `npm test` | unit gate | 1524 tests [VERIFIED: package.json:19 + STATE.md:42] |

**Package Legitimacy Audit:** N/A — zero new packages. No `npm install` in this phase.

## Architecture Patterns

### Current mobile CSS map (verified this session)

```
breakpoint tiers in src/styles/responsive.css:
  @media (max-width: 1100px)   line 4
  @media (max-width: 900px)    line 16   ← .tlist .trow card-restacking (list views)
                                           ← this is where the Columns hide rule goes (D-01)
  @media (max-width: 640px)    line 99   ← .only-m flip (base.css:154) + .hide-m def (responsive.css:139)
```

### Pattern 1: The generic Columns hide (D-02/D-03)
**What:** inside the 900px tier of `responsive.css`:
```css
/* Source: D-02/D-03 — targets the single render site src/shell/view-engine.js:227 */
[data-pop="cols"] { display: none !important; }
```
`!important` matches the file's existing convention (`.hide-m` uses it). Attribute
selector keeps it generic (D-03) and keeps the rule out of view-engine.js (D-02 — one
render path preserved; the button still *renders*, it is just not visible; `toBeHidden()`
passes for `display:none` elements).

### Pattern 2: Boundary e2e just under 900px (D-10)
Assert with width 899 (and optionally 900/901 sanity) — Playwright `toBeHidden()` is
auto-retrying; no sleeps. Precedent for viewport-scoped bounding-box expectations:
`e2e/french-overflow.spec.mjs:117-121` (`expectWithin` helper) [VERIFIED].

### Pattern 3: Truncation assertion (D-11)
For each long-task card:
```js
const overflow = await card.evaluate((el) => el.scrollWidth - el.clientWidth);
expect(overflow).toBeLessThanOrEqual(2); // small tolerance per D-11
```
Plus a document-level `document.documentElement.scrollWidth <= window.innerWidth + tol`
guard — the card can wrap yet still push the page wide if the toolbar or an inline
`width:64px` span refuses to shrink.

### Anti-Patterns to Avoid
- **JS render fork / second mobile component** — the SC-3 / Pitfall-4 tripwire; D-05 forbids
- **`@media (pointer: coarse)`** — D-04 forbids
- **Screenshots, sleeps, `networkidle`, second project/webServer** — all locked out (D-10/D-11 + STATE anti-features)
- **Editing the chunk-gate threshold** to absorb CSS bytes — forbidden; keep CSS lean (remedy for byte pressure is lazy-map moves per STATE.md:89, not threshold edits)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auto-retrying visibility checks | manual polling | `toBeHidden()` / `toBeVisible()` web-first assertions | D-11 mandates; already the suite convention |
| Mobile device emulation project | second Playwright project | `setViewportSize` in-test | locked (SC-2) |
| Wrap/ellipsis logic in JS | measuring text | CSS `overflow-wrap: anywhere` (or `break-word`) on card children | D-08; long unbroken strings (keys/estimates) need `anywhere`, not just `break-word` |

## Code Examples

### The card markup to polish (verbatim from source)
`src/views/table.js:94` [VERIFIED] — each card:
```html
<div class="panel" style="padding:12px;margin-bottom:8px" data-a="openTask" data-id="...">
  <div class="row" style="margin-bottom:8px">
    {stIcon} <b style="font-weight:500" class="grow">{title}</b>
    <span class="mono faint" style="font-size:11px">{key}</span>
  </div>
  <div class="row" style="flex-wrap:wrap;gap:10px;font-size:12px" class="muted">
    {prPill}{avStack}... {dueHtml}{estimate}{progress span width:64px}
  </div>
</div>
```
Polish-relevant observations (all verified from this markup):
- **Title `b.grow` has no `overflow-wrap`** — a long unbroken title will not wrap unless
  `.grow` or a new rule adds it. Check `.grow` in base.css.
- **Inline styles everywhere** — polish may move styles into responsive.css classes to
  stay byte-lean vs the chunk gate (CSS bytes count in the 500 kB gate).
- **Duplicate `class` attribute** on the second div (`class="row" ... class="muted"`) —
  HTML parsers keep only the first; `muted` is currently inert. Cosmetic; can be fixed
  during polish (one-attribute edit) or left alone — planner's discretion area.
- **Fixed `width:64px` progress span** — fine at 390px but contributes to row width;
  wrap-everything policy should let the *row* wrap, keep the span fixed.

### Known nowrap/ellipsis sites that may fight the wrap policy
Grep found `white-space: nowrap` at `base.css:93-94,119`, `components.css` (6 sites),
`responsive.css:287` — the polish task must verify none of these classes reach the card
children on mobile (most apply to chips/toolbars, but `.mono`/chip classes should be
checked) [VERIFIED: grep across src/styles/*.css this session].

## Common Pitfalls

### Pitfall 1: The 641–900px band (see Critical Finding)
**What goes wrong:** planner assumes cards show under 900px (per D-01 rationale); they
only show under 640px today. **Avoid:** make the band decision explicit (checkpoint or
locked reading of D-04) before writing the CSS task; write the boundary e2e to assert
what the band *actually* shows post-change.

### Pitfall 2: Chunk gate byte pressure
**What goes wrong:** verbose polish CSS pushes the 500 kB gate (~220 B headroom) over.
**Avoid:** reuse existing classes/variables, terse selectors; run `npm run build` +
chunk test per task (per-task triad). STATE.md:89 documents the remedy if needed.

### Pitfall 3: `toBeHidden` vs element existence
`toBeHidden()` passes for both `display:none` and detached elements — that is desired
here (CSS hide keeps the element in DOM). Do not also assert absence via locator count;
that would tempt a JS render fork.

### Pitfall 4: Desktop spec regressions
The hide rule is generic (D-03) — **all** existing specs that click a Columns button run
at Desktop Chrome default viewport (1280×720 per `devices['Desktop Chrome']`) [VERIFIED:
playwright.config.mjs:31], which is above 900px, so they are unaffected. But any spec
using a narrow custom context (check before finalizing; grep showed none below 900 among
`viewport` mentions except french-overflow's 390px run) could break. `french-overflow`
runs at 390px — verify it doesn't click Columns (it enumerates routes; likely safe, but
the close run is the proof).

### Pitfall 5: viewSync/saved-view blobs
Saved views persist visible-column state. Because the hide is CSS-only (D-02), the
`opt.cols` / `v.hidden[]` state is untouched — projects-table.spec.mjs and
saved-views.spec.mjs must pass **unmodified** (locked standing constraint). Any urge to
touch `src/core/savedViews.js` is a scope violation.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Chromium (Playwright) | mobile e2e | ✓ | repo-managed | — |
| node --test | unit gate | ✓ | repo setup | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (unit, `npm test`), `@playwright/test` (e2e, `npx playwright test -c e2e/playwright.config.mjs`) |
| Quick run | `npm test` / `npx playwright test e2e/mobile-tasks-table.spec.mjs` |
| Full suite | `npm test` + `npx playwright test` (full parallel run = D-14 close instrument) |

### Phase Requirements → Test Map
| Req | Behavior | Test | Command |
|-----|----------|------|---------|
| MOB-01 | Columns hidden ≤900px, desktop unchanged | e2e boundary test + unmodified projects-table/saved-views specs | `npx playwright test e2e/mobile-tasks-table.spec.mjs e2e/projects-table.spec.mjs e2e/saved-views.spec.mjs` |
| MOB-02 | Card stack no truncation at 390×844 | new spec, D-12 fixture | `npx playwright test e2e/mobile-tasks-table.spec.mjs` |
| E2E-03 | Full suite green + all gates | full run + `npm test` + lint + chunk + i18n | per-task triad, then full close run |

### Wave 0 Gaps
- None — spec file is the phase's own deliverable; framework/config exist.

## Security Domain

Not applicable — CSS presentation + e2e only. No auth, input, crypto surface changes.
`security_enforcement` effectively no-op for this phase (config-only UI changes).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Reading D-04 literally implies the `.only-m` flip should move to 900px (Option B in Summary) | Critical Finding | Boundary e2e asserts the wrong band state; cheap to re-scope but needs the planner/user to pick A or B |
| A2 | No existing spec uses a viewport <900px and clicks Columns | Pitfall 4 | A close-run spec failure — handled in-phase per D-16 anyway |

## Open Questions (RESOLVED)

1. **Band behavior 641–900px (A vs B in Summary)** — **(RESOLVED: Option B).** Per D-04's
   locked wording ("columns hidden below 900px"), Option B is the compliant reading.
   Implemented in 64-01: one rule per selector in responsive.css's 900px tier
   (`.hide-m { display: none !important; }` + `.only-m { display: block; }`),
   overriding base.css's 640px flip; boundary pinned by 64-01 Task 1's e2e band tests.
2. **`french-overflow.spec.mjs` at 390px** — **(RESOLVED: safe).** It enumerates routes
   and never clicks a Columns button (verified by grep in 64-01 Task 2's read-first
   step, and proven by 64-01 Task 2 running it unmodified at --workers=1 --retries=0
   plus the 64-03 full close run).

## Sources

### Primary (HIGH confidence — read this session)
- `src/styles/base.css:154-159` — `.only-m` 640px flip
- `src/styles/responsive.css:4,16,99,139-141` — breakpoint tiers, `.hide-m` def, `.trow` restacking
- `src/shell/view-engine.js:227` — single Columns-button render site (`data-a="pop" data-pop="cols"`)
- `src/views/table.js:84,94` — `.tbl-wrap hide-m` + card-stack template (verbatim above)
- `e2e/playwright.config.mjs` — one chromium project, one webServer, Desktop Chrome
- `e2e/french-overflow.spec.mjs` — viewport/bounding-box assertion precedent
- `.planning/STATE.md:42,63,89` — gates, anti-features, chunk headroom

## Metadata

**Confidence breakdown:** Stack HIGH (all local, verified); Architecture HIGH (source-read); Pitfalls HIGH (1 & 2 grounded in verified file facts; band question flagged not guessed).

**Research date:** 2026-11-14  **Valid until:** n/a (local codebase)
