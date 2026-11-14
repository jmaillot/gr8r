---
phase: 58-full-text-search
verified: 2026-11-13T11:05:00Z
status: passed
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
  - .planning/phases/58-full-text-search/58-UAT.md
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
covered_digest: "v2:sha256:a9f6572b1b3703f506ba933473263fb8980d9fafe460c10b4a2763535dfd7e79"
overrides_applied: 0
behavior_unverified: 0
behavior_unverified_items: []
re_verification:
  previous_status: human_needed
  previous_score: 18/21
  gaps_closed:
    - "G-58-2: cmd-mode palette never dispatched the server search — guard relaxed to `pl.mode === 'ws'` early-return (src/overlays/palette.js:78), locked by test/palette-dispatch.test.mjs (5/5 re-run during this verification: 5 pass / 0 fail)"
    - "Live Ctrl-K hybrid-merge re-check (UAT Test 2) — re-run by orchestrator with headless Chromium against the fixed build: cmd-mode palette dispatches /search, server-only task merges within debounce, no duplicates, server-down silently degrades with no error toast. Recorded in 58-UAT.md (status: pass, 3/3; G-58-2 resolved); commit 71c214b"
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
**Verified:** 2026-11-13T11:05:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (58-04 fixed G-58-2) and live UAT Test 2 re-check (58-UAT.md updated 3/3 pass, commit 71c214b)

## Goal Achievement

### Requirements (ROADMAP success criteria / SEARCH-01..04)

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | SEARCH-01 — plain-keyword search of titles/descriptions from the existing Ctrl-K palette, grouped results + full /search page | ✓ VERIFIED (code + automated tests) | `GET /api/workspaces/:slug/search` route (server.js:5395) via `searchTerms` + `searchTasks`; palette merge via `serverOnlyTasks` (src/core/search-server.js) rendered in cmd/search modes; cmd-mode dispatch regression: `node --test test/palette-dispatch.test.mjs` → **5 pass / 0 fail** (re-run during this verification) |
| 2 | SEARCH-02 — results filtered server-side through `memberCanReadProject`, byte-level leak tests | ✓ VERIFIED | server.js:5415 enforces `memberCanReadProject` per hit, top-30 after filtering; byte-level leak test at test/search-fts.test.mjs:167 ("zero occurrences in the body bytes") |
| 3 | SEARCH-03 — index synced on every write path (funnel, bulk, MCP), boot rebuild sweep, SQLite FTS5 + pg parity | ✓ VERIFIED | FTS5 table (db-adapter.mjs:488) + pg `to_tsvector('simple', …)` GIN (db-adapter.mjs:477-528); funnel sync + sweep healing covered by test/search-fts.test.mjs (13/13), drift test, and db-adapter parity rows; UAT Test 1 (opt-in live pg run) — **pass** |
| 4 | SEARCH-04 — accented French text searchable, accent-insensitive ("elodie" finds "Élodie") | ✓ VERIFIED | `foldForSearch`/`search-terms.mjs` folding + tokenizer locked at table creation; accent parity rows in fts + db-adapter suites |

**Score:** 4/4 requirements verified — all behavior-dependent coverage now exercised (dispatch matrix test 5/5 + live headless-Chromium UAT re-check, 3/3 pass in 58-UAT.md)

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

None — the prior item has been satisfied.

### 1. Live Ctrl-K hybrid-merge re-check (UAT Test 2 closure) — ✓ SATISFIED

**Test:** With the server running, open Ctrl-K (default cmd mode) and type keywords matching a task that exists only server-side. Then stop the server and type again.
**Result:** Re-executed live by the orchestrator with headless Chromium against the fixed build — cmd-mode palette dispatches `/search`, server-only task merges within the debounce, no duplicates; server-down case silently degrades to local-only results with no error toast. Recorded in 58-UAT.md (status: pass, 3/3 passed, G-58-2: resolved) and committed (71c214b).

## Gaps Summary

None. G-58-2 is closed with code + regression evidence and the live browser re-run of UAT Test 2 has passed (3/3 in 58-UAT.md). CR-01 (pg tx atomicity) remains open as a dispositioned advisory — recommend tracking it as follow-up work.

---
_Verified: 2026-11-13T11:05:00Z_
_Verifier: the agent (gsd-verifier)_
