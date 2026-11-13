---
phase: 58-full-text-search
verified: 2026-11-13T10:30:00Z
status: human_needed
score: 4/4 requirements verified
covered_files:
  - .planning/phases/58-full-text-search/58-01-PLAN.md
  - .planning/phases/58-full-text-search/58-01-SUMMARY.md
  - .planning/phases/58-full-text-search/58-02-PLAN.md
  - .planning/phases/58-full-text-search/58-02-SUMMARY.md
  - .planning/phases/58-full-text-search/58-03-PLAN.md
  - .planning/phases/58-full-text-search/58-03-SUMMARY.md
  - .planning/phases/58-full-text-search/58-04-PLAN.md
  - .planning/phases/58-full-text-search/58-04-SUMMARY.md
  - server.js
  - search-terms.mjs
  - db-adapter.mjs
  - src/core/search-server.js
  - src/overlays/palette.js
  - src/pages/search.js
  - test/palette-dispatch.test.mjs
  - test/search-fts.test.mjs
  - test/search-server.test.mjs
  - test/search-terms-drift.test.mjs
covered_digest: "v2:sha256:54ab63569b0a9cd36e015b4f927d59aa2a823b8c7633a397d75d517353d89472"
overrides_applied: 0
behavior_unverified: 1
behavior_unverified_items:
  - truth: "Ctrl-K palette (default cmd mode) merges server-only tasks with no duplicates and no flicker within ~250 ms perceived latency"
    test: "With the server running, open Ctrl-K (cmd mode), type keywords matching a task visible only server-side"
    expected: "Server-only tasks merge into the results within ~250 ms debounce, no duplicates, no flicker, no error toast; with the server down the palette silently degrades to local-only results"
    why_human: "Perceived merge latency and flicker-free rendering in a real browser session cannot be observed by grep or unit tests; dispatch/state are proven by test/palette-dispatch.test.mjs (5/5) and palette-touching e2e, but the live UX half of D-01 needs a human run"
re_verification:
  previous_status: human_needed
  previous_score: 18/21
  gaps_closed:
    - "G-58-2: cmd-mode palette never dispatched the server search — guard relaxed to `pl.mode === 'ws'` early-return (src/overlays/palette.js:78), locked by test/palette-dispatch.test.mjs (5/5 re-run during this verification: 5 pass / 0 fail)"
  gaps_remaining: []
  regressions: []
advisory:
  - finding: "CR-01 (pg tx atomicity in index write path) remains OPEN in 58-REVIEW-DISPOSITION.md — advisory, not blocking per disposition ledger"
    category: other
    reason: "Code review advisory gate; findings dispositioned but not yet fixed"
    evidence_status: "ledger exists; no fix commit yet"
---

# Phase 58: Full-Text Search — Verification Report (re-verification)

**Phase Goal:** Members find any task they can read by plain keywords — titles and descriptions, English or French, accents folded — from the existing Ctrl-K palette.
**Verified:** 2026-11-13T10:30:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (58-04 fixed G-58-2)

## Goal Achievement

### Requirements (ROADMAP success criteria / SEARCH-01..04)

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | SEARCH-01 — plain-keyword search of titles/descriptions from the existing Ctrl-K palette, grouped results + full /search page | ✓ VERIFIED (code + automated tests) | `GET /api/workspaces/:slug/search` route (server.js:5395) via `searchTerms` + `searchTasks`; palette merge via `serverOnlyTasks` (src/core/search-server.js) rendered in cmd/search modes; cmd-mode dispatch regression: `node --test test/palette-dispatch.test.mjs` → **5 pass / 0 fail** (re-run during this verification) |
| 2 | SEARCH-02 — results filtered server-side through `memberCanReadProject`, byte-level leak tests | ✓ VERIFIED | server.js:5415 enforces `memberCanReadProject` per hit, top-30 after filtering; byte-level leak test at test/search-fts.test.mjs:167 ("zero occurrences in the body bytes") |
| 3 | SEARCH-03 — index synced on every write path (funnel, bulk, MCP), boot rebuild sweep, SQLite FTS5 + pg parity | ✓ VERIFIED | FTS5 table (db-adapter.mjs:488) + pg `to_tsvector('simple', …)` GIN (db-adapter.mjs:477-528); funnel sync + sweep healing covered by test/search-fts.test.mjs (13/13), drift test, and db-adapter parity rows; UAT Test 1 (opt-in live pg run) — **pass** |
| 4 | SEARCH-04 — accented French text searchable, accent-insensitive ("elodie" finds "Élodie") | ✓ VERIFIED | `foldForSearch`/`search-terms.mjs` folding + tokenizer locked at table creation; accent parity rows in fts + db-adapter suites |

**Score:** 4/4 requirements verified (1 behavior-unverified item routed to human — live palette UX half of SEARCH-01/D-01)

### G-58-2 Closure Check (this round's focus)

- Fix present in code: `src/overlays/palette.js:78` — `if (!pl || pl.mode === 'ws') return;` (cmd + search both dispatch).
- Behavioral evidence: named test re-run by this verifier — `node --test test/palette-dispatch.test.mjs` → 5 pass / 0 fail (cmd dispatches, search dispatches, ws never, demo/empty gate, stale discard).
- Palette-touching e2e green per 58-04-SUMMARY (flows 46/46 against fresh dist); full suite 1458 pass / 0 fail per phase context.

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| cmd-mode dispatch matrix (G-58-2 fix) | `node --test test/palette-dispatch.test.mjs` | 5 pass / 0 fail (2239 ms) | ✓ PASS |
| Server-side permission enforcement | grep `memberCanReadProject` in /search route | server.js:5415, per-hit filter before output | ✓ PASS |
| Accent folding + FTS5/pg substrate | grep `to_tsvector('simple'` / `fts5` | db-adapter.mjs:477-528 | ✓ PASS |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| src/overlays/palette.js | src/core/search-server.js | dispatchServerSearch → createDebouncedSearch | ✓ WIRED | guard no longer blocks cmd mode |
| src/core/search-server.js | server.js /search route | `GET /api/workspaces/:slug/search` | ✓ WIRED | route at server.js:5395, memberCanReadProject funnel |
| server.js | db-adapter.mjs | searchTasks over FTS5/tsvector | ✓ WIRED | dual-backend index substrate |

## Human Verification Required

### 1. Live Ctrl-K hybrid-merge re-check (UAT Test 2 closure)

**Test:** With the server running, open Ctrl-K (default cmd mode) and type keywords matching a task that exists only server-side (not in the local doc). Then stop the server and type again.
**Expected:** Server-only tasks merge into the same tasks group within ~250 ms, no duplicates, no flicker; offline case silently degrades to local-only results with no error toast.
**Why human:** Perceived latency and flicker-free rendering in a real browser session are not observable by grep or unit tests; automated dispatch/state coverage already proves the mechanism.

## Gaps Summary

None outstanding at the code level. G-58-2 is closed with code + regression evidence re-confirmed by this verification. The single remaining item is the live browser re-run of UAT Test 2 (human judgment on perceived UX). CR-01 (pg tx atomicity) remains open as a dispositioned advisory — recommend tracking it as follow-up work.

---
_Verified: 2026-11-13T10:30:00Z_
_Verifier: the agent (gsd-verifier)_
