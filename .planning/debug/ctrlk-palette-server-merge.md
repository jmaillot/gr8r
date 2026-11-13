---
status: diagnosed
trigger: "Ctrl-K palette (default cmd mode) never dispatches the server search — server-only tasks only appear after Tab to search mode"
created: 2026-11-13T00:00:00Z
updated: 2026-11-13T00:00:00Z
goal: find_root_cause_only
---

## Current Focus

hypothesis: CONFIRMED — the `pl.mode !== 'search'` guard in dispatchServerSearch is an implementation gap, not a design decision.
test: Static trace + git archaeology (done by orchestrator + this session)
expecting: n/a
next_action: (diagnose-only) plan-phase --gaps applies the fix

## Symptoms

expected: Server-only tasks merge into Ctrl-K palette within ~250 ms debounce (cmd mode default).
actual: Zero /search requests fire in cmd mode; merge only works in search mode (/search page).
errors: None (silent).
reproduction: 58-UAT.md Test 2.
started: Introduced in commit 80ac13e (58-03 tracer).

## Evidence

- checked: src/overlays/palette.js:76-91
  found: dispatchServerSearch early-returns `if (!pl || pl.mode !== 'search') return;` (line 78) BEFORE any fetch. palServerSearch (line 88) gates only on api.enabled + non-empty q, then calls the dispatcher — so the input path is mode-agnostic; the mode guard inside the dispatcher kills every cmd-mode fetch.
  implication: The wiring (IN.palQ → palServerSearch → debounce → fetch) was built to run on every keystroke in ANY mode; the guard contradicts it.
- checked: src/actions/actions.js:2971 + 2945
  found: IN.palQ calls palServerSearch on every keystroke; openPalette sets mode:'cmd'. Confirms orchestrator evidence.
- checked: Plan/spec text (58-03-PLAN.md, 58-CONTEXT.md, 58-03-SUMMARY.md)
  found: PLAN line 89: "In the input handler, add a 250 ms setTimeout debounce… merge server tasks into the palette's tasks group" — no mode restriction anywhere. D-01: hybrid merge into "the same palette results". SUMMARY claims merge works in the Ctrl-K palette's instant local list.
  implication: Spec/plan never excluded cmd mode — the guard is not traceable to any design decision.
- checked: Git history (80ac13e, 9e5a3f9 commit messages; grep of phase docs)
  found: No comment, commit note, or doc justifying cmd-mode exclusion. The only palette.js comment block (lines 66-75) describes the merge as unconditional hybrid behavior.
  implication: No intentional-design evidence exists; guard introduced silently in 80ac13e.
- checked: Render path (palette.js:147, 185)
  found: cmd mode renders the tasks group with sc='all'; line 185 merge hook `pl.serverQ === q ? serverOnlyTasks(...)` is mode-independent — it activates whenever serverQ/serverTasks are set.
  implication: The render side is already ready for cmd-mode merge; only the dispatcher guard blocks it.

bug_class: Bohrbug (deterministic)

## Eliminated

- hypothesis: Guard is an intentional design decision (cmd mode = commands only)
  evidence: No comment/commit/plan text anywhere justifies cmd-mode exclusion; D-01/PLAN/SUMMARY all describe unconditional hybrid merge in the palette.
  timestamp: 2026-11-13

## Resolution

root_cause: Implementation gap — dispatchServerSearch's `pl.mode !== 'search'` early-return (palette.js:78) silently discards every cmd-mode dispatch, contradicting D-01, 58-03-PLAN.md Task 1 ("input handler → debounce → merge into the same list", no mode restriction), and 58-03-SUMMARY.md claims. The render path already supports cmd-mode merge (sc='all', mode-independent serverQ hook at line 185).
fix: (direction, non-binding) Relax the dispatcher guard to allow dispatch in cmd mode too — e.g. `if (!pl || pl.mode === 'ws') return;` or check `['cmd','search'].includes(pl.mode)`. Stale-response discard (`pl.q !== q`) already handles Tab mode-switch mid-flight.
verification: pending (fix phase)
files_changed: []
