# Phase 63: VIEW-02 Triage — Hypothesis × Evidence (FLAKY-01, D-05)

**Executed:** 2026-11-14
**Method:** D-01 trace protocol — isolated 10× repro (retries=0, workers=1), forced-trace 10× run, full parallel suite at retries=0. Zero code changes in this plan.

## 1. Run commands (verbatim)

```bash
# Round A — isolated deterministic repro (D-01 baseline)
rm -rf test-results && npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 2>&1 | tee /tmp/opencode/phase63-triage-a.log

# Round B — forced-trace run for evidence
rm -rf test-results && npm run e2e -- e2e/saved-views.spec.mjs --repeat-each=10 --workers=1 --retries=0 --trace on 2>&1 | tee /tmp/opencode/phase63-triage-b.log

# Round C — full parallel suite under load (H3 conditions, retries=0)
rm -rf test-results && npm run e2e -- --retries=0 2>&1 | tee /tmp/opencode/phase63-triage-c.log

# Round D (supplementary) — single cold isolated run to bound the race window
rm -rf test-results && npm run e2e -- e2e/saved-views.spec.mjs --workers=1 --retries=0 2>&1 | tee /tmp/opencode/phase63-triage-d.log
```

All logs retained in `/tmp/opencode/phase63-triage-{a,b,c,d}.log` (local test-server traffic only, T-63-01 accepted — never committed).

## 2. Results summary

| Round | Run | Result |
|-------|-----|--------|
| A | saved-views 10× serial, retries=0 | **10 failed** (7× strict-mode toast violation at spec line 125; 3× "No saved views yet" missing at line 132) |
| B | same + `--trace on` | **10 failed** (4× line 125 strict violation; rest line 132/other assertion variants — log: `10 failed`) |
| C | full parallel suite, retries=0 | **112 passed (6.9m)** — VIEW-02 passed (test #90, 9.5s) |
| D | single cold isolated run | **1 passed (7.7s)** |

## 3. Hypothesis × evidence table

| Hypothesis | Status | Evidence (cited excerpt) |
|-----------|--------|--------------------------|
| H1 — debounced `persistLiveView` write-through race (silent PUT drop / stale PUT before assertion) | **Eliminated** as the cause of today's reproduced failures. Trace network extraction (Round B, repeat 0, `1-trace.network`) shows every `/api/me/views` PUT completing HTTP 200 in normal sequence, none missing and none arriving after a failing assertion — the failures are Playwright **strict-mode locator violations and a stale-popover assertion**, not missing writes: `Error: strict mode violation: locator('.toast').filter({ hasText: 'View "Runbook mwgcj5dd-6oka" saved' }) resolved to 2 elements` (6 PUTs observed, all `status=200`: 11:52:36.082Z → 11:52:39.579Z, i.e. the expected live+named cadence; failing assertion at line 125 is a locator resolution failure, not a timing failure). **D-03 silent-drop ruling:** the applyTableView→toggle clearTimeout coalescing variant is **by-design debounce semantics, not a proven bug** — no dropped or late write was observed in any trace; the PUTs land in order well within the 450 ms debounce window. |
| H2 — coordinate-click dismissal (`mouse.click(5,400)`) leaves the popover open | **Eliminated** as the cause of today's reproduced failures. Every failure occurred *after* dismissal succeeded — the error-context page snapshot at the line-125 failure shows no `.pop.floating` open, only the toast stack: `- status [ref=e218]: … View "Runbook mwgcj5dd-6oka" saved / - status [ref=e227]: … applied / - status [ref=e236]: … saved`. The `toHaveCount(0)` dismissal assertions at spec lines 58/70/117 never appear in any of the 24 failure reports across Rounds A–B. (Note: H2 remains a *latent risk* under viewport variance; the SC-3 Escape replacement is still mandated independently of this triage.) |
| H3 — shared OWNER/acme live-state coupling under parallel load | **Eliminated** as the cause of today's reproduced failures — with an **inversion**: Round C, the maximum-interference condition (full suite, OWNER specs co-running, retries=0) passed clean, `112 passed (6.9m)` including VIEW-02 (`✘`-free: `✓ 90 … saved-views.spec.mjs:61:1 … (9.5s)`). The live row's server state never diverged: the Round B trace GET `/api/me/views` responses are all `status=200`. Load does not trigger the failure; **speed** does (see verdict). |

## 4. Confirmed root cause (the actual mechanism)

The reproduced failure is a **spec-side assertion race against toast lifetime**, not any ROADMAP hypothesis:

1. `toast()` gives each toast a **4200 ms life** (`src/ui/toast.js:27`, `setTimeout(kill, opt.ms || 4200)`).
2. The spec asserts toasts with an **unscoped** locator — `page.locator('.toast', { hasText: fmt('toast.savedTableView', …) })` (spec lines 79 and 125) — which matches *any* live toast with that text, not the newest one.
3. The initial save (line 79) and the update (line 125) both emit the identical toast `View "<name>" saved`. In **fast serial runs** the save→apply→update stretch completes in **< 4.2 s**, so the stale first toast is still alive when line 125 asserts → strict-mode violation (`resolved to 2 elements`).
4. The page snapshot proves all three toasts coexisted at failure: `saved` / `applied` / `saved` (Round B repeat-0 `error-context.md`, refs e218/e227/e236).
5. **Load inversion explains the historical flake:** Round C under full parallel load passed 112/112 — slower inter-action gaps (> 4.2 s) let the stale toast expire before the assertion. The flake fires when the machine is *fast*, which is exactly why it never reproduced under the load conditions everyone assumed caused it (D-01's N=10 serial protocol reproduces it 10/10; a loaded suite hides it).
6. **Variant at line 132** ("No saved views yet" missing after delete, 3/10 in Round A): the views popover has two async refresh paths — the refetch-on-open (`refreshViewsPop`, D-52) and the post-delete rebuild in `deleteTableView` (`savedViewsUi.js:140`, `if (S.ui.pop?.type === 'views') S.ui.pop.html = popHtml(...)`). If the open-time `refreshNamedViews` GET resolves **after** the post-delete rebuild (fast runs shrink the ordering margin), the stale last-writer re-renders the deleted row into `S.ui.pop.html` and the empty-state text never appears. Plausible from source reading; the deleted-row reappearance was not directly captured in a trace (test-results/ is ephemeral and was cleaned between rounds per the standing trap) — carried to Plan 02 as a scoped-assertion/awaited-signal fix target, same flake class (fast-serial ordering), same remedy.

## 5. Assumption resolution

| # | Assumption | Ruling | Evidence |
|---|-----------|--------|----------|
| A1 | `--repeat-each` yields a unique VIEW_NAME per repetition | **Confirmed** | Round A log: 10 distinct names in failures — `Runbook mwgc51lu-sr40`, `mwgc5iar-302p`, `mwgc5q4j-lrz4`, `mwgc6aja-7msv`, `mwgc6uuj-dxog`, `mwgc71nh-pgdx`, `mwgc798x-c78n` (7 shown; 28 `Runbook` occurrences across 10 repeats) — no collisions |
| A2 | Escape reaches the `S.ui.pop` branch | **Carried forward** | Not testable in this plan (no Escape path exists in the spec yet); risk unchanged from RESEARCH — the kept `toHaveCount(0)` assertion makes a swallowed Escape fail fast and visibly |
| A3 | 450 ms debounce + lazy import is the complete live-PUT delay chain | **Confirmed** | Round B trace: live PUTs land ~0.5–1.2 s after their triggering actions (11:52:36.082Z → 36.777Z → 37.883Z → 38.688Z), consistent with the 450 ms trailing debounce; no unexplained latency |

## 6. Verdict

**Confirmed root cause:** the VIEW-02 failures reproduce at N=10 serial (24/24 failures across Rounds A–B share the two mechanisms above) and are caused by the **spec's unscoped toast locator racing the app's 4200 ms toast lifetime**, with a secondary **last-writer-wins popover-refresh race** behind the line-132 variant. Neither the debounce write-through (H1), the coordinate click (H2), nor shared live-state (H3) fired in any round.

**D-03 app-side async-contract bug: NOT PROVEN.** No dropped, delayed, or mis-ordered `persistLiveView` write was observed in any trace; the clearTimeout coalescing variant is ruled by-design debounce semantics. Per the plan's gate: **Plan 03 documents no-bug and runs gates only** — no app fix lands. (The popover double-refresh ordering in §4.6 is noted as a candidate for a future awaited-signal hardening but is not proven to violate any app contract; it is fixable spec-side by asserting state only after awaited signals.)

**Round C full-suite failures belonging to saved-views: none** — 112/112 passed.

**Shape for Plan 02 (unchanged from RESEARCH, now evidence-backed):**
1. Scope toast assertions to the newest toast (e.g. `.toast` filtered to `last()`, or await the specific toast after dismissing/prior expiry) — kills both line-125 and line-132-adjacent variants.
2. Replace `mouse.click(5,400)` with `Escape` (SC-3, mandated regardless — H2 remains latent).
3. Await the real network signals (`waitForResponse` on the live/named PUT by body shape) around popover mutations before asserting popover content — closes the refresh-ordering window.
No sleeps, no isolation, no retries — assertions strengthened only (D-04, standing constraints).

## 7. Observation (out of scope, no action this phase)

Each run logs two `WARN login failed` lines (one from `127.0.0.1`, one from a `10.x` pod IP) per OWNER sign-in even when the test proceeds successfully — appears to be a first-attempt rate-limit/bounce followed by a successful retry. Pre-existing, unrelated to the flake; recorded in the phase deferred register.
