# Phase 63: VIEW-02 De-Flake - Context

**Gathered:** 2026-11-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Diagnosis-then-fix phase: (1) prove the VIEW-02 flake's root cause with evidence from a
repeated-run trace (retries=0, pre-warmed server, `--workers=1`), confirming or eliminating
each ROADMAP hypothesis (debounced `persistLiveView` write-through race, coordinate-click
popover dismissal, shared OWNER/acme live-state coupling); (2) make the spec deterministic
at `retries=0` — semantic dismissal replaces `mouse.click(5,400)`×3, the debounced view
write is awaited on its real completion signal (`waitForResponse` on `/api/me/views`
PUT/POST); (3) fix any app-side async-contract bug the triage proves, in the app, pinned by
a regression test. No features, no global retries/timeout/config changes, no structural
spec isolation.

</domain>

<decisions>
## Implementation Decisions

### Proof protocol (FLAKY-02 acceptance bar)
- **D-01:** Determinism is proven by `--repeat-each 10` with retries=0, `--workers=1`,
  pre-warmed server — one clean 10× pass is the acceptance bar. N=10 is sized for a flake
  that fails ~1-in-5; a rarer race would surface at the full-suite gate, not be chased
  with a bigger N here.
- **D-02:** Isolated proof alone is NOT sufficient: the fixed VIEW-02 must also pass one
  full parallel e2e suite run (all specs, default workers) this phase — the flake manifests
  under inter-spec load, so the fix is measured in the conditions that trigger it. This
  pre-validates Phase 64's 111/111 close gate.

### App-bug policy
- **D-03:** If triage proves an app-side async-contract bug (e.g. a real `persistLiveView`
  write-through race), the executor fixes it in-phase without stopping — per ROADMAP SC-4
  ("fixed in the app, not laundered in the spec"). This deliberately overrides the Phase 62
  D-07 flag-and-stop precedent for THIS phase: the ROADMAP already rules fix-in-phase here.
  The fix and its regression test land as a separate commit; the owner reviews at phase
  verification/UAT. Never mask the bug in the spec.

### Isolation scope
- **D-04:** No structural isolation — VIEW-02 must pass inside the standard parallel run.
  No `test.describe.serial`, no per-file workers override, no quarantine. If triage shows
  cross-spec OWNER/acme state coupling, the fix is real awaited completion signals and
  run-unique state, not moving the spec out of the parallel lane; isolation would hide a
  race rather than fix it.

### Evidence artifacts (FLAKY-01)
- **D-05:** The root-cause evidence lives in `.planning/phases/63-view-02-de-flake/63-TRIAGE.md`
  — a hypothesis × evidence table (confirmed / eliminated per ROADMAP hypothesis), trace
  output excerpts, exact run commands, and the verdict. Committed; the phase SUMMARY.md
  links it. Guesses are not evidence: every confirmed/eliminated row cites trace output.

### Standing constraints carried forward (from ROADMAP/STATE — restated for executors)
- No added sleeps, no `networkidle`, no raised global retries, no `reuseExistingServer`
  or `gracefulShutdown` changes, no chunk-gate edits. Assertions strengthened, never
  weakened.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone & requirement context
- `.planning/ROADMAP.md` §Phase 63 — goal, success criteria SC-1..SC-4 (evidence trace,
  retries=0 determinism, semantic dismissal + waitForResponse, app-fix-not-laundered)
- `.planning/REQUIREMENTS.md` §Flaky Stabilization (CONS-03) — FLAKY-01/02 text and the
  three named hypotheses
- `.planning/STATE.md` §Milestone decisions — anti-feature list (no retries/timeout/config
  inflation)

### Prior phase decisions that bind this one
- `.planning/phases/62-e2e-baseline-repair/62-CONTEXT.md` — stable green baseline this
  phase measures against; D-03/D-04/D-05 helper conventions (role-based queries, waits in
  helpers, assertions inline spec-side); D-07 precedent (amended for this phase by D-03)

No external specs/ADRs — requirements fully captured in ROADMAP/REQUIREMENTS plus decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `e2e/saved-views.spec.mjs` — the VIEW-02 spec; `setColumn()` (line ~53) already performs
  the coordinate-click dismissal (`page.mouse.click(5,400)` + `toHaveCount(0)`) that the
  semantic-dismissal decision replaces; `signIn()`/`openTasksTable()` helpers are the
  entry path; run-unique view names via `newRunId()` already prevent cross-run collisions
- `e2e/helpers/setup.mjs` — Phase 62's composable-helper convention (`openSettings()`,
  `selectLanguage()` with `waitForResponse`); the same awaited-signal pattern extends to
  the views PUT/POST wait
- `e2e/playwright.config.mjs` — webServer readiness (Phase 62 D-01) already provides the
  pre-warmed server the trace protocol needs; global `retries` untouched

### Established Patterns
- `waitForResponse` on the real network completion (Phase 62 D-08) — the exact signal
  VIEW-02's debounced write lacks; `persistLiveView` fires the PUT/POST to `/api/me/views`
- Run-unique naming (`newRunId()`) + fixtures through the real API only — extended if the
  shared OWNER/acme live-state hypothesis is confirmed
- Comments citing decision provenance (D-xx / UAT) at changed lines

### Integration Points
- `src/core/viewSync.js:23` — `persistLiveView(key)`, the debounce under suspicion;
  callers at `src/actions/actions.js:1402` (columns toggle) and `src/views/savedViewsUi.js:128`
- `src/core/savedViews.js` / `src/core/store.js` — saved-view write-through path; server
  side `/api/me/views` (`saved_views` table, D-05 rows-not-doc)
- Suspect interaction cluster in the spec: `setColumn()` dismissal → immediate saved-view
  action — the debounce vs dismissal race window

</code_context>

<specifics>
## Specific Ideas

- Evidence-first sequencing: the triage trace lands BEFORE any fix plan is written — the
  fix is shaped by the confirmed root cause, not by the hypothesis list.
- The full-suite confirmation run (D-02) is the last gate of the phase, mirroring what
  Phase 64 will re-run at milestone close.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 63-VIEW-02 De-Flake*
*Context gathered: 2026-11-14*
