# Phase 64: Mobile Tasks Table & Suite Green - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Milestone-close phase with two deliverables: (1) the tasks table becomes honestly usable
on a phone under the owner's hide-the-button ruling — the Columns button is hidden below
the mobile breakpoint (pure CSS, no render fork), and the existing mobile card stack is
polished until it renders without truncation from the toolbar affordances; (2) the full
e2e suite closes 100% green (zero known failures, VIEW-02 stable per Phase 63) with all
standing gates green at milestone close. No features, no desktop behavior change, no
saved-view blob changes, no Playwright config changes (no second project, no second
webServer).

</domain>

<decisions>
## Implementation Decisions

### Breakpoint & gating (MOB-01)
- **D-01:** The Columns button hides at `max-width: 900px` — the same tier where the
  `.only-m` card stack flips (`src/styles/base.css:154`). One breakpoint keeps the button
  and the cards perfectly in sync; no inconsistent band between cut-offs.
- **D-02:** The hide is pure CSS (one rule in `src/styles/responsive.css`) — no JS-gated
  render, no `opt.cols` stripping. SC-3's one-render-path / one-source-of-truth is
  satisfied by construction; saved-view blobs stay byte-compatible because nothing in the
  view state changes.
- **D-03:** The rule is generic: any view that renders a Columns button
  (`data-pop="cols"`, `src/shell/view-engine.js:227`) loses it under the breakpoint —
  not scoped to the tasks-table key only. Future views with a Columns button inherit the
  mobile contract for free.
- **D-04:** Viewport width only — no `(pointer: coarse)` media feature. A desktop window
  resized under 900px gets the card stack without a Columns button, consistently.

### Card stack approach (MOB-02)
- **D-05:** Polish the existing `.only-m` `.panel` cards in `src/views/table.js:94`
  (the 55-07 A1 pattern) — no new mobile component (that would be the parallel render
  fork SC-3 forbids) and no replacement by CSS-restacking the `.trow` cells.
- **D-06:** Fixed card field set — status/title/key/priority/assignees/due/estimate/
  progress as today. `hidden[]`-driven card fields STAY DEFERRED: the owner was asked
  explicitly (scope check vs REQUIREMENTS.md deferred requirement) and confirmed
  keep-deferred.
- **D-07:** "Without truncation from the toolbar affordances" = the card stack renders
  completely (no clipped rows) with the toolbar visible (view/sort/new/search), for tasks
  with long titles, many assignees, labels, and estimates.
- **D-08:** Overflow policy is wrap-everything — long titles wrap to multiple lines, chips
  and assignee stacks wrap, `overflow-wrap` only, never clipped content, never
  ellipsis-plus-tap-to-expand (that would reintroduce truncation by design).

### Mobile e2e shape (MOB-02 verification)
- **D-09:** One dedicated spec file: `e2e/mobile-tasks-table.spec.mjs`.
- **D-10:** `setViewportSize({ width: 390, height: 844 })` (iPhone-ish) plus one boundary
  test just under the 900px breakpoint. Main config only — no second Playwright project,
  no second webServer (SC-2 and the locked anti-features).
- **D-11:** Assertions are web-first and auto-retrying: Columns button via `toBeHidden()`;
  card completeness via `scrollWidth <= clientWidth` (small tolerance) plus
  `toBeVisible()` / bounding-box width checks. No screenshots (explicitly forbidden by
  SC-2), no sleeps, no `networkidle` — assertions strengthened, never weakened.
- **D-12:** The truncation assertion exercises a purpose-built long-task fixture (very
  long title, 4+ assignees, labels, estimate) — deterministic content, no reliance on
  existing seed data.

### Suite close gate (E2E-03)
- **D-13:** "111/111" means the full suite 100% green — the existing 111 specs stay
  green AND the new mobile spec passes (N/N, whatever N becomes). SC-4's intent is zero
  known failures, not the literal number.
- **D-14:** VIEW-02 stability counts via one full parallel run (default workers) after
  the mobile change lands, VIEW-02 included — the same instrument Phase 63 D-02
  pre-validated. No re-run of the Phase 63 10× repeat proof; that phase is closed.
- **D-15:** All standing gates green at close: full unit suite (1524 + any new unit
  tests the card polish adds), lint clean, 500 kB chunk gate (only ~220 B headroom —
  the CSS polish must stay lean), EN+FR i18n gate.
- **D-16:** If the close run surfaces a new failure (mobile spec or otherwise), it is
  fixed in-phase before close — zero known failures, no waivers. The v2.2
  deferred-debt precedent (9 acknowledged failures) is exactly what Phases 62–63 spent
  repairing; it is not repeated.

### Standing constraints carried forward (from ROADMAP/STATE — restated for executors)
- No added sleeps, no `networkidle`, no raised global retries, no `reuseExistingServer`
  or `gracefulShutdown` changes, no chunk-gate edits, no second Playwright project or
  webServer. Desktop behavior unchanged; projects-table/saved-views specs pass unmodified.

### Agent's Discretion
- Exact card polish details (spacing, tap-target sizes, wrap behavior specifics) — the
  contract is "no truncation, wrap everything"; implementation choices are the planner/
  executor's.
- Placement of the new CSS rule within responsive.css and whether a unit test or two
  accompanies the card polish.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone & requirement context
- `.planning/ROADMAP.md` §Phase 64 — goal, success criteria SC-1..SC-4, per-task triad
  (`npm run build` + chunk-size gate per task, never a big-bang mobile plan)
- `.planning/REQUIREMENTS.md` §Mobile Tasks Table (CONS-02) — MOB-01, MOB-02 text;
  §Future Requirements — the deferred hidden[]-driven card-fields contract
- `.planning/REQUIREMENTS.md` §E2E Repair (CONS-01) — E2E-03 (111/111 close gate)
- `.planning/STATE.md` §Milestone decisions — anti-feature list (no retries/timeout/
  config inflation, no chunk-gate edits)

### Prior phase decisions that bind this one
- `.planning/phases/62-e2e-baseline-repair/62-CONTEXT.md` — D-03/D-04/D-05 helper
  conventions (role-based queries, waits in helpers, assertions inline spec-side);
  stable green baseline
- `.planning/phases/63-view-02-de-flake/63-CONTEXT.md` — D-02 (full parallel run as the
  flake instrument, pre-validating this phase's close gate); D-04 (no structural
  isolation); VIEW-02 determinism carried into the close

No external specs/ADRs — requirements fully captured in ROADMAP/REQUIREMENTS plus decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/views/table.js:94` — the existing `.only-m` `.panel` mobile card stack
  (55-07 A1 pattern); this phase polishes it, does not replace it
- `src/styles/responsive.css` (~line 149) — existing mobile tier restacking `.tlist
  .trow` cells; breakpoints at 1100/900/640px; the 900px tier is this phase's cut-off
- `src/styles/base.css:154` — the `.only-m` visibility flip that already syncs with the
  chosen 900px breakpoint
- `src/shell/view-engine.js:227` — the single Columns-button render site
  (`data-a="pop" data-pop="cols"`); the CSS hide targets this button generically

### Established Patterns
- Media-query-gated mobile treatment (`.only-m` + responsive.css) — the phase must stay
  inside it; a JS render fork is the Pitfall 4 tripwire
- Per-domain e2e spec files (e.g. `french-overflow.spec.mjs`) — the new mobile spec
  follows the same shape
- Per-task triad: `npm run build` + chunk-size gate + tests per task — mobile work
  lands incrementally, never big-bang

### Integration Points
- Toolbar affordances (view/sort/new/search controls in view-engine) remain the mobile
  entry to the card stack — no new mobile navigation
- Saved-view state (`src/core/savedViews.js`, `viewSync.js`) is untouched; blobs stay
  byte-compatible, verified by unmodified projects-table/saved-views specs

</code_context>

<specifics>
## Specific Ideas

- Hide-the-button ruling is the owner's (2026-11-14): the Columns button disappears on
  mobile entirely — no replacement mobile columns UI in this phase.
- "Honestly usable" is the bar: cards readable without truncation, not merely rendered.

</specifics>

<deferred>
## Deferred Ideas

- Card fields driven by `hidden[]` on mobile (popover hides/shows card fields) — the
  richer contract from REQUIREMENTS.md Future Requirements; owner re-confirmed
  keep-deferred during this discussion after an explicit scope check. Small feature for
  a later milestone.

</deferred>

---

*Phase: 64-Mobile Tasks Table & Suite Green*
*Context gathered: 2026-11-14*
