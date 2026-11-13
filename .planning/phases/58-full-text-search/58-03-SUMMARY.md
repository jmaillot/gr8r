---
phase: 58-full-text-search
plan: 03
subsystem: client-search
tags: [search, palette, debounce, abortcontroller, hybrid-search, i18n-gates]
requires: [GET /api/workspaces/:slug/search (58-01), api.js call() client, searchAll local core, palette overlay, pageSearch]
provides: [searchTasksServer (demo-gated abortable client fetch), serverOnlyTasks merge-dedupe, createDebouncedSearch dispatcher, palette hybrid merge (palServerSearch), /search page server merge (A.searchPageServer)]
affects: [phase verification (SEARCH-01 member experience)]
tech-stack:
  added: []           # zero new deps — AbortController/setTimeout are browser built-ins (T-58-SC honored)
  patterns: [pure-core node-safe client module (searchall.js analog), silent-degrade fetch wrapper, local-first merge with server-only append, frozen-count pin annotations]
key-files:
  created: [src/core/search-server.js, test/search-server.test.mjs]
  modified: [src/core/api.js, src/overlays/palette.js, src/actions/actions.js, src/pages/search.js, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
key-decisions:
  - "createDebouncedSearch lives in core (not the palette overlay) so abort/dedupe semantics are unit-testable from plain node --test; palette just wires it"
  - "api.js call() gained an optional AbortSignal passthrough instead of a raw fetch in search-server.js — one 401-revocation/JSON/credentials path for all clients"
  - "pageSearch fetch orchestration lives in A.searchPageServer (actions layer, which already owns render()) because page modules never import render.js — no import cycle"
  - "zero new i18n keys: server hits join the existing Tasks section and its counts"
  - "neutral fallback icon is stIcon('backlog') (inline SVG), not a new lucide name — the frozen icon baseline stays intact"
requirements-completed: [SEARCH-01, SEARCH-02]
duration: 41 min
completed: 2026-11-13
commits: 3
plan_head_before: 7a5218d81ffcb6e07811a39ea297b36d91c59a81
plan_head_after: 9e5a3f9
actuals:
  tokens: 64000   # chars/4 over the 8 changed files (~256k chars diff → 308+/16- lines plus tests)
  tasks: 3
  commits: 3
status: complete
---

# Phase 58 Plan 03: Hybrid Search Client Summary

**One-liner:** Entry-chunk-safe `searchTasksServer` (demo-gated, abortable, silent-degrading) with a 250 ms debounced AbortController dispatcher merging server tasks into the Ctrl-K palette's instant local list (deduped by id, local-first), and the /search page merging server-only rows into the existing task-row markup with hl() titles and plain-text snippets — all standing gates green.

## Accomplishments

- `src/core/search-server.js` (pure core, entry-chunk safe — no new lazy chunk, DELIV-02): `searchTasksServer(q, signal)` — returns `{ tasks: [] }` immediately when `api.enabled` is false (D-03, zero fetches), otherwise GETs `/api/workspaces/:slug/search?q=` through api.js `call()` with the caller's AbortSignal; ANY error/abort/non-2xx/non-JSON silently resolves `{ tasks: [] }` (discretion: no error surface). Plus `serverOnlyTasks(local, server)` (the D-01 dedupe: shared ids appear once, server-only ids append after local) and `createDebouncedSearch(run, delay=250)` (each dispatch clears the prior timer and aborts the prior controller synchronously — D-02 — and `isCurrent()` lets the caller discard stale responses).
- `api.js` `call()`: optional `signal` passthrough (one credentials/401-revocation/JSON path for all clients).
- `palette.js`: `palServerSearch(q)` wired into the palette input handler (`IN.palQ` in actions.js); when the fetch resolves for the current query, server-only tasks merge into the SAME tasks group with the exact local item shape (`html`/`name`/`sub`/`r`/`run`); status icon degrades — locally-known id reuses its real `stIcon`, unknown id gets the neutral dashed circle; snippet (plain text) becomes the `sub`, esc() runs in paletteHtml (T-58-06).
- `/search` page: server-only hits merge into the existing mini task-row markup (`data-a="openTask"`, no new view — D-05) with `hl(title, q)` titles and plain-text snippets (re-stripped `replace(/<[^>]+>/g, '')` before `esc()` — T-58-06); unknown tasks degrade (dashed-circle icon, no project chip); tabs + Tasks-section counts include server hits. `A.searchPageServer` does one fetch per query, aborts the prior on a newer keystroke, discards stale responses.
- `test/search-server.test.mjs`: 7 node --test tests (demo mode no-fetch D-03, rejected/aborted/403 silent degrade, AbortSignal reaches fetch, merge-dedupe D-01, dispatch-B-aborts-A D-02).
- Gate pins updated per convention: data-a tree-wide count 491 → 492 (both i18n-shell and i18n-toast).

## Task Results

| Task | Type | Commit | Result |
|------|------|--------|--------|
| 1 Tracer — search-server + palette merge | tracer | 80ac13e | 7 tests pass; build + chunk gate (entry 494.71 kB) + lint green; tracer `<verify>` automated-only, end-of-phase mode → no checkpoint |
| 2 /search page merge | auto | c847eff | i18n scan 0 violations, build green, lint clean |
| 3 Full standing-gate proof | auto | 9e5a3f9 | npm test 1465/0; lint, i18n, chunk gate green; e2e green modulo 2 documented flakes |

## Coverage

- kind: tests, ref: tests/search-server.test.mjs#demo mode no-fetch (D-03), status: pass, human_judgment: false
- kind: tests, ref: tests/search-server.test.mjs#rejected/aborted/403 silent degrade, status: pass, human_judgment: false
- kind: tests, ref: tests/search-server.test.mjs#merge dedupe (D-01) + abort semantics (D-02), status: pass, human_judgment: false
- kind: tests, ref: npm test (1465 pass / 0 fail) && npm run lint && node scripts/i18n-scan.mjs, status: pass, human_judgment: false
- kind: tests, ref: test/build-chunk-size.test.mjs (entry 494.84 kB ≤ 500 kB), status: pass, human_judgment: false
- kind: tests, ref: npm run e2e — 109/111, the 2 failures are the 57-03-documented concurrency-timing flake class (saved-views toast strict-mode, 2fa-fr), each passing in isolated reruns (verified this plan), status: pass, human_judgment: false
- human_judgment: true, rationale: the palette/server merge UX ergonomics (timing feel of the 250 ms debounce, snippet truncation length) are cosmetic judgments — verify-work should eyeball a live hybrid palette
- human_judgment: true, rationale: full-run e2e exit 0 was not achieved twice (same documented flake pair); verifier may accept isolated-rerun evidence per the 57-03/57-02 precedent or rerun the suite

## Deviations from Plan

**1. [Rule 3 - Blocker] api.js `call()` gained an AbortSignal passthrough**
- **Found during:** Task 1
- **Issue:** `call()` had no signal option; the plan requires the caller-owned AbortSignal to reach fetch. Fetching raw in search-server.js would fork credentials/401/JSON handling.
- **Fix:** `call(method, path, body, { keepalive, signal })` — backward compatible, one fetch path.
- **Files modified:** src/core/api.js (added to the plan's file list)
- **Verification:** signal-passthrough test asserts the exact caller signal reaches fetch.
- **Commit:** 80ac13e

**2. [Rule 3 - Blocker] Debounce/abort dispatcher lives in core, palette wiring crosses into actions.js**
- **Found during:** Task 1
- **Issue:** The plan located "the input handler" in palette.js, but it is `IN.palQ` in actions.js; also the acceptance criteria demand node-testable abort/dedupe semantics, and the palette overlay is not node-importable.
- **Fix:** `createDebouncedSearch` in core/search-server.js; `palServerSearch(q)` exported from palette.js and called by IN.palQ (one line). The merge stays in palette.js exactly as planned.
- **Files modified:** src/actions/actions.js (added to the plan's file list)
- **Verification:** abort-semantics + dedupe tests pass; no new dynamic import in palette.js.
- **Commit:** 80ac13e

**3. [Rule 1 - Bug] Frozen standing-gate pins tripped by the new rows**
- **Found during:** Task 3 (`npm test` red ×4)
- **Issue:** (a) the backticked word "signal" in a comment matched lucide's `Signal` in the quoted-token icon scan; (b) `ic('circle', 15)` added a new icon name, breaking the frozen pre-phase icon baseline; (c) the /search server-row template added a source `data-a="` occurrence, breaking the tree-wide 491 pin.
- **Fix:** comment reworded; neutral fallback switched to inline-SVG `stIcon('backlog', 15)`; data-a pin annotated 491 → 492 in both i18n-shell and i18n-toast.
- **Files modified:** src/core/search-server.js, src/overlays/palette.js, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Verification:** npm test 1465 pass / 0 fail.
- **Commit:** 9e5a3f9

**Total deviations:** 3 auto-fixed (2 structural placements, 3 gate-pin repairs under the same deviation). **Impact:** none on scope — every D-marker truth holds; the plan's file list grew by api.js and actions.js (both one-path additions).

## Authentication Gates

None.

## Known Stubs

None — every wire is live (helper → fetch → merge → render on both surfaces); demo mode is byte-identical to before (guarded by the no-fetch test).

## Threat Flags

None — implemented surface matches the plan's threat model: T-58-06 (all server strings pass esc()/hl(), snippets additionally re-stripped before esc(); no raw interpolation), T-58-07 (merge combines already-filtered server results, no client-side permission logic), T-58-SC (zero package installs).

## Verification

- `node --test test/search-server.test.mjs` → 7 pass / 0 fail
- `npm test` → 1465 pass / 0 fail; `npm run lint` → exit 0; `node scripts/i18n-scan.mjs` → 0 violations
- `npm run build` + chunk gate → entry chunk 494.84 kB (≤ 500 kB)
- `npm run e2e` → 109 passed / 2 failed (saved-views toast strict-mode, 2fa-fr) — the exact flake class documented in 57-03 and 57-02; both passed in isolated reruns during this plan (full specs rerun individually: 35/35 and 1/1)

## Self-Check: PASSED

- src/core/search-server.js, test/search-server.test.mjs exist on disk; all 8 touched files present
- Commits 80ac13e, c847eff, 9e5a3f9 present in git log; plan_head_before..HEAD = 3 commits
- All task acceptance criteria re-run green (debounce constant 250 + AbortController in core/palette path; no new dynamic import in palette.js; server rows reuse mini markup; i18n scan exit 0)
