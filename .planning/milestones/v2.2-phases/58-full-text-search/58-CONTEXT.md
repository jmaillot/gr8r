# Phase 58: Full-Text Search - Context

**Gathered:** 2026-11-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side full-text search over **task titles + descriptions only**, permission-filtered through `memberCanReadProject`, wired into the existing Ctrl-K palette (hybrid mode) and the existing `/search` results page, backed by an FTS5 index on SQLite and a behaviorally-identical implementation on pg through `db-adapter.mjs`. Accent-insensitive French/English matching (SEARCH-04) locked at table creation. Projects, people, files, comments stay client-side in-memory search (today's `searchAll` groups). No pagination, no query syntax, no saved-search features.

</domain>

<decisions>
## Implementation Decisions

### Query flow — palette consumption
- **D-01:** **Hybrid**: the palette keeps its instant in-memory `searchAll()` results exactly as today; a debounced server FTS query merges/dedupes into the same palette results. Single result surface, best responsiveness, server fills gaps the local redacted doc can't see.
- **D-02:** Server queries are **debounced (~250 ms) with AbortController** — a newer keystroke query cancels the in-flight request; results merge in as they arrive.
- **D-03:** **Demo/offline mode (api disabled) is unchanged**: local-only in-memory search, no FTS index, no server route. Same rule as `commands().filter(c => api.enabled || ...)`.

### Results scope & presentation
- **D-04:** The FTS index and server route cover **tasks only (title + description)**. Projects/people/comments/files results keep coming from the in-memory side, exactly as today.
- **D-05:** The **existing `src/pages/search.js` page is the full-results surface** — it switches to (merges with) the server route when online. Same URL, same UI shell; no new results view.
- **D-06:** Presentation = existing task-row markup with `hl()` highlight on titles, plus a **plain-text snippet around the first description match** (HTML stripped, same as `searchAll`'s `replace(/<[^>]+>/g, '')` treatment). **No FTS5 `snippet()`/`highlight()` markup** — no server-generated HTML surface.

### Index sync (SEARCH-03)
- **D-07:** **In-funnel, in-transaction**: `task_fts` upsert/delete happens inside the same transaction as the task diff produced by the doc-PUT funnel (the write site `.planning/research/ARCHITECTURE.md`'s flow diagram shows). Consistency by transaction, no findability window.
- **D-08:** **Boot sweep is a conditional rebuild**: on boot, a lightweight staleness marker check (count comparison or index-version row); rebuild `task_fts` per workspace only when stale/missing/empty. Same spirit as the Phase 57 D-06 one-pass sweep — cheap happy path, heals drift.
- **D-09:** **Manual upsert in the adapter, no SQLite triggers**: index maintenance is explicit INSERT/DELETE issued by `db-adapter.mjs` next to the task write, so SQLite and pg run the same code path and the DBA suite proves parity. Triggers rejected (two mechanisms to keep behaviorally identical; bypass paths silently miss).
- **D-10 (researcher directive):** verify **every** task write path (doc-PUT funnel, bulk import, MCP mirror) flows through the same funnel diff site — SEARCH-03's "any write path" hinges on this; any path that doesn't needs either routing through the funnel or its own in-tx upsert.

### Tokenizer & matching semantics (SEARCH-04)
- **D-11:** **SQLite: FTS5 `unicode61` with `remove_diacritics=2`** — folding happens at both index time and query time ("elodie" finds "Élodie"). Tokenizer decision is locked at `CREATE VIRTUAL TABLE` time (per SEARCH-04; changing it later requires a full index rebuild).
- **D-12:** **pg parity without extensions**: `to_tsvector('simple', …)` over a **JS-folded projection** of title/description (reusing `foldForSearch`-equivalent normalization) stored alongside the task row, so both backends fold identically. **No `unaccent` or `pg_trgm` extension dependency** on self-hosted pg. — **Reversibility:** one-way — the tokenizer is locked at table creation; changing it later means dropping/rebuilding the FTS table (and the pg projection column) for every workspace.
- **D-13:** Matching = **implicit AND of tokens, each token allowed as a prefix** ("elo" finds Élodie; "fiche carte" requires both words). No exposed query syntax: user input is folded/tokenized/sanitized **server-side** before it ever reaches `MATCH`/`to_tsquery` (never passed raw).
- **D-14:** Results = **ranked top-30** (FTS5 `rank`/bm25 on SQLite, `ts_rank` on pg). Palette caps display as today; `/search` shows all 30. No pagination, no total-count field this phase.
- **D-15:** **Minimum server query length = 2 folded characters**; shorter queries return empty from the route and rely on the in-memory path only.

### the agent's Discretion
- Merge/dedupe ordering when palette combines in-memory and server results (planner's call; constraint: no duplicates, single list)
- Palette error/loading treatment when the server route fails or is slow (silent degrade to local-only is acceptable)
- Exact staleness-marker mechanism for D-08 (count vs version row) and sweep placement in the server.js boot migration sequence
- Snippet construction details (chars around first match, ellipsis), snippet computed client-side or returned as plain text by the route
- Exact route shape (`GET /api/workspaces/:slug/search?q=` per ARCHITECTURE.md, or equivalent) and payload
- `task_fts` DDL details (external-content vs contentless) and the pg projection column placement, within the D-09/D-12 constraints
- i18n keys for new UI strings (en + fr catalogues; i18n gate stays green)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements
- `.planning/ROADMAP.md` §Phase 58 — goal, SEARCH-01..04, success criteria (incl. byte-level leak tests and tokenizer-locked-at-creation)
- `.planning/REQUIREMENTS.md` §Full-Text Search — SEARCH-01..04 definitions

### Milestone research
- `.planning/research/ARCHITECTURE.md` §1 (FTS index location/sync) and the flow diagram (`task diff ──▶ task_fts upsert/delete, inside the tx`) — the D-07 site; §Recommended Architecture precedents table (DBA-01..04 adapter suite, doc-PUT funnel)
- `.planning/research/PITFALLS.md` — private-project title leaking through FTS is the named security trap (SEARCH-02)
- `.planning/research/STACK.md` — SQLite/pg dual-backend constraints

### Prior-phase decisions that bind here
- `.planning/phases/57-views-columns-general-access/57-CONTEXT.md` — D-07 dedicated REST route style; D-06 boot-sweep precedent; per-user rows vs doc-blobs ruling (not directly applicable but the route/strip patterns are)
- `.planning/phases/56-delivery-infrastructure/56-CONTEXT.md` — DELIV-02 chunk budget (palette is a first-paint surface; `searchAll` was deliberately moved to the entry chunk — don't regress it)

### Existing implementation touchpoints
- `src/core/searchall.js` — today's in-memory `searchAll()`; stays the instant local path (D-01) and the demo-mode path (D-03); its HTML-strip treatment is the snippet model (D-06)
- `src/core/utils.js` — `foldForSearch` — the accent-folding primitive the pg projection mirrors (D-12)
- `src/overlays/palette.js` — Ctrl-K palette: `commands()`, `c-search` entry, `api.enabled` gating pattern (D-03)
- `src/pages/search.js` — the full-results page (D-05)
- `db-adapter.mjs` — the only SQL seam (D-09); DBA suite proves both backends pass
- `server.js` — `memberCanReadProject` (~line 928) and the doc-PUT funnel task diff — the filter (SEARCH-02) and sync (D-07) sites; boot migration sequence for the D-08 sweep

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `foldForSearch` (src/core/utils.js) — proven accent-folding; reuse for the pg projection and for folding the query before MATCH
- `searchAll` (src/core/searchall.js) — the local search path; untouched, extended by merge
- Palette `api.enabled` gating — exact pattern for D-03 demo-mode bypass
- `memberCanReadProject` funnel (server.js) — server-side filter; SEARCH-02's leak tests assert against this
- Boot-sweep precedent (Phase 57 D-06 `migrateTotpReWrap`-style) — template for the conditional rebuild

### Established Patterns
- doc-PUT funnel task diff (server.js ~1492-1647) — every write that matters flows through one diff site; index upsert joins it in-tx (D-07)
- db-adapter.mjs as sole SQL seam + DBA parity suite — D-09 keeps FTS maintenance in the adapter so both backends prove identical behavior
- Dedicated REST routes with server-side normalization (Phase 57 D-07) — the search route follows suit

### Integration Points
- Palette input handler — attach the debounce + AbortController server fetch (D-02)
- `/search` page loader — switch/merge to server route when `api.enabled`
- server.js boot migration sequence — conditional rebuild sweep (D-08)
- Task write funnel tx — `task_fts` upsert/delete (D-07)

</code_context>

<specifics>
## Specific Ideas

- The leak risk is the owner's stated top concern: a private-project task title surfacing through FTS is the one security trap (research PITFALLS.md) — byte-level leak tests (SEARCH-02) are non-negotiable and the filter must run server-side, never trust the client.
- "elodie finds Élodie" must work on BOTH backends identically — that's why pg parity is via a JS-folded projection rather than extension-dependent folding (D-12).
- No query syntax, ever, in the UI (SEARCH-01): all query sanitization happens server-side before MATCH.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (Result-count display ("showing 30 of N") and pagination were surfaced as options and explicitly excluded this phase.)

</deferred>

---

*Phase: 58-Full-Text Search*
*Context gathered: 2026-11-12*
