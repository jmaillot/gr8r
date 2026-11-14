---
phase: 58-full-text-search
plan: 01
subsystem: server-search
tags: [fts5, search, sqlite, security, index-sync]
requires: [db-adapter facade, doc-PUT funnel tx, memberCanReadProject, visibility fixture]
provides: [search-terms.mjs (foldForSearch/searchTerms), db-adapter ensureSearchIndex/syncTaskFts/searchTasks/ftsSweep, GET /api/workspaces/:slug/search, task_fts shadow index]
affects: [58-02 (pg parity), 58-03 (client merge)]
tech-stack:
  added: []           # zero new deps — node:sqlite FTS5 built-in (Node ≥24)
  patterns: [duplicate-with-drift-pin, tx-scope threading, filter-before-cap, conditional boot rebuild]
key-files:
  created: [search-terms.mjs, test/search-fts.test.mjs, test/search-terms-drift.test.mjs]
  modified: [db-adapter.mjs, server.js, mcp.js]
key-decisions:
  - "task_fts carries a ws_id UNINDEXED column so deletes/rebuilds and queries are per-workspace (multi-workspace correctness; plan DDL omitted it)"
  - "plain FTS5 table (probed DDL), not content='' contentless — plain DELETE works per row without the 'delete' command form"
  - "mcp.js writeDoc snapshots storedDoc before the in-place edit, else the diff compares the doc with itself"
  - "boot sweep skips corrupt doc blobs (T-34-05 discipline) — full suite caught the crash regression"
  - "searchTerms tokens [a-z0-9]+ only; adapter is the sole site appending the prefix '*' to build the MATCH expression"
requirements-completed: [SEARCH-01, SEARCH-02, SEARCH-03]
duration: 18 min
completed: 2026-11-13
commits: 3
plan_head_before: 19512a783cc2898e3e0d6ea8f08c7cb39aed3389
plan_head_after: 1e1f4ee
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
status: complete
---

# Phase 58 Plan 01: Server-side FTS Core Summary

**One-liner:** Contentless task_fts shadow index (FTS5 unicode61 remove_diacritics 2) synced in-transaction from both write sites (doc-PUT funnel + MCP writeDoc), membership-gated GET /api/workspaces/:slug/search route with byte-level-leak-proof per-hit filtering, and a conditional boot sweep that heals drift.

## Accomplishments

- `search-terms.mjs`: verbatim `foldForSearch` duplicate (byte-identity drift-pinned against src/core/utils.js) + `searchTerms(q)` sanitizer — fold → split /[^a-z0-9]+/ → drop <2-char tokens (D-13/D-15). Zero deps.
- `db-adapter.mjs`: `ensureSearchIndex()` (tokenizer locked at creation, D-11), `syncTaskFts(scope, wsId, storedDoc, next)` (in-tx diff sync through the tx scope — Pitfall 2 pg-safe; no-op when unchanged; unindexes deletions), `searchTasks(wsId, terms, limit)` (`tok*` implicit-AND match built ONLY here from pre-sanitized tokens, bm25 rank with task_id tiebreak, ws-scoped), `ftsSweep(wsId, doc)` (marker+count staleness check, conditional rebuild, cheap happy path).
- `server.js`: funnel `db.tx(async scope => …)` now calls `syncTaskFts` inside the transaction (D-07); `GET /api/workspaces/:slug/search?q=` — requireWorkspace(member) + sameOrigin gate, per-hit `memberCanReadProject` resolved BEFORE payload build and BEFORE the 30 cap (fetch 60 pre-filter), constant `{ tasks: [...] }` shape, plain-text snippets (searchall strip idiom + fold-index mapping, no FTS5 markup); boot runs `ensureSearchIndex()` + per-workspace sweep after migrateUserViews with load-bearing-order comment.
- `mcp.js`: writeDoc binds the tx scope and syncs the index in-tx after the doc update (D-10/Pitfall 1), with a storedDoc snapshot taken before the in-place edit.
- Tests: 13 FTS suite tests + 4 drift-pin tests; full suite 1444 pass / 0 fail; lint clean.

## Task Results

| Task | Type | Commit | Result |
|------|------|--------|--------|
| 1 Tracer — funnel→index→route | tracer | 97b0a31 | 12 tests pass; tracer verify green end-to-end (automated-only, end-of-phase mode → no checkpoint) |
| 2 MCP mirror sync | auto | 8c3c4fa | writeDoc syncs in-tx; real /mcp handshake → create_task → route finds it; mcp.test.mjs 38/38 |
| 3 Boot sweep | auto | 1e1f4ee | drift-heal + rowid-stability no-op + real-reboot heal tests; full suite green |

## Coverage

- kind: tests, ref: tests/search-fts.test.mjs#funnel findable immediately (D-07), status: pass, human_judgment: false
- kind: tests, ref: tests/search-fts.test.mjs#BYTE-LEVEL leak test (SEARCH-02, body bytes), status: pass, human_judgment: false
- kind: tests, ref: tests/search-fts.test.mjs#operator chars harmless (D-13), status: pass, human_judgment: false
- kind: tests, ref: tests/search-fts.test.mjs#D-15 short queries → [], status: pass, human_judgment: false
- kind: tests, ref: tests/search-fts.test.mjs#MCP writeDoc findable (D-10), status: pass, human_judgment: false
- kind: tests, ref: tests/search-fts.test.mjs#ftsSweep drift-heal + no-op + real-reboot heal (D-08), status: pass, human_judgment: false
- kind: tests, ref: tests/search-terms-drift.test.mjs#foldForSearch drift pin + Élodie fixture (SEARCH-04), status: pass, human_judgment: false
- kind: tests, ref: npm test (1444 pass / 0 fail) && npm run lint, status: pass, human_judgment: false
- kind: tests, ref: searchTasks pg branch returns [] until 58-02 (no error surface), status: pass, human_judgment: false — parity itself is deferred to 58-02 and NOT verified here
- human_judgment: true, rationale: snippet window sizing (±40/80 chars around first match) and route ergonomics are cosmetic judgments — verifier should eyeball real responses in 58-03 integration

## Deviations from Plan

**1. [Rule 2 - Missing critical] `ws_id` column added to task_fts DDL**
- **Found during:** Task 1
- **Issue:** The plan's DDL had no workspace column; task_fts is a single global table and task ids are only unique per doc — without ws_id, per-workspace deletes (syncTaskFts), the ftsSweep rebuild, and searchTasks would all touch or return other workspaces' rows.
- **Fix:** `ws_id UNINDEXED` column; deletes/rebuilds/query filter by `ws_id = ?`.
- **Files modified:** db-adapter.mjs
- **Verification:** "No cross-workspace bleed" test passes.
- **Commit:** 97b0a31

**2. [Rule 1 - Bug] Boot sweep crashed on corrupt doc blobs (T-34-05 regression)**
- **Found during:** Task 3 (`npm test` red: migration.test.mjs plants an intentionally malformed JSON workspace doc and pins that boot survives it)
- **Issue:** The sweep loop's bare `JSON.parse(ws.doc)` crashed the boot on that row.
- **Fix:** per-row try/catch skip with a logWarn — the same guard discipline the prefs backfill pins.
- **Files modified:** server.js
- **Verification:** full suite 1444 pass / 0 fail.
- **Commit:** 1e1f4ee

**3. [Rule 3 - Blocker] ensureSearchIndex added to boot in Task 1 (plan placed it in Task 3)**
- **Issue:** Without the table existing at boot, the funnel sync and route would fail on any fresh database — Task 1's own verify could not pass.
- **Fix:** boot call added in Task 1 with a comment; Task 3 extended it with the sweep loop and the full load-bearing-order comment.
- **Commit:** 97b0a31, extended in 1e1f4ee

**Total deviations:** 3 auto-fixed (2 correctness, 1 ordering). **Impact:** none on scope; all plan truths hold.

## Authentication Gates

None.

## Known Stubs

None. (pg branch of searchTasks/syncTaskFts/ftsSweep deliberately no-ops/returns [] until 58-02 — documented plan deferral, not a stub; the route degrades to an empty result with no error surface.)

## Threat Flags

None — implemented surface matches the plan's threat model: T-58-01 (per-hit memberCanReadProject before payload+cap, byte-level leak tests pass), T-58-02 (whitelisted tokens only; only the adapter appends `*`), T-58-03 (constant `{tasks:[...]}` shape, no counts).

## Verification

- `node --test test/search-fts.test.mjs test/search-terms-drift.test.mjs test/db-adapter.test.mjs` → 42 pass / 0 fail
- `npm test` → 1444 pass / 0 fail; `npm run lint` → exit 0
- Leak tests assert on raw body bytes (`res.text()`), not status codes

## Self-Check: PASSED

- search-terms.mjs, test/search-fts.test.mjs, test/search-terms-drift.test.mjs exist on disk
- Commits 97b0a31, 8c3c4fa, 1e1f4ee present in git log
- All acceptance criteria re-run green (incl. `grep -c "syncTaskFts" server.js` = 2, both inside tx bodies)
