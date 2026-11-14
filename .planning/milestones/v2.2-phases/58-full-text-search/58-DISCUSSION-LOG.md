# Phase 58: Full-Text Search - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-12
**Phase:** 58-Full-Text Search
**Areas discussed:** Query flow & responsiveness, Results scope & presentation, Index sync strategy, Tokenizer & matching semantics

---

## Gray-area selection (multiSelect)

Selected: all four proposed areas — Query flow & responsiveness, Results scope & presentation, Index sync strategy, Tokenizer & matching semantics.

## Query flow & responsiveness

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid | Palette keeps instant in-memory searchAll; debounced server FTS merges/dedupes in | ✓ |
| Server-always | Every query hits the server (debounced); single source of truth, replaces instant local search | |
| Server on results page only | Palette stays in-memory; only /search queries FTS | |

| Option | Description | Selected |
|--------|-------------|----------|
| Debounced + abort | ~250ms debounce, AbortController cancels in-flight on newer query | ✓ |
| Keystroke + abort | Fire per keystroke, abort previous | |
| Lazy (500ms or Enter) | Server query only on longer pause or results page | |

| Option | Description | Selected |
|--------|-------------|----------|
| Local-only, as today | Demo/offline mode unchanged, no FTS, no server route | ✓ |
| Client-side index in demo | Build a client mini-index to match online behavior | |

**User's choice:** Hybrid; Debounced + abort; Local-only, as today
**Notes:** Merge/dedupe ordering left to planner discretion.

---

## Results scope & presentation

| Option | Description | Selected |
|--------|-------------|----------|
| Tasks only | FTS index = task titles+descriptions; other groups stay in-memory | ✓ |
| Tasks + projects | Also index project names/descriptions | |
| Everything | Index all searchable entity types | |

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse /search page | Existing src/pages/search.js becomes the server-backed full-list surface | ✓ |
| New results view | Dedicated new view; two pages to maintain | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rows + plain snippet | hl() on titles, plain-text snippet around first description match, HTML stripped | ✓ |
| FTS snippet markup | FTS5 snippet()/highlight() markup (sanitization risk) | |
| Titles only | No description excerpts | |

**User's choice:** Tasks only; Reuse /search page; Rows + plain snippet
**Notes:** None.

---

## Index sync strategy

| Option | Description | Selected |
|--------|-------------|----------|
| In-funnel, in-tx | task_fts upsert/delete inside the same tx as the doc-PUT funnel task diff | ✓ |
| Dirty-queue flush | Writes mark dirty; deferred flush updates index (findability window) | |
| Rebuild-only | Only boot rebuild maintains index (fails SEARCH-03) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Conditional rebuild | Boot checks staleness marker; rebuild per workspace only when stale/missing/empty | ✓ |
| Full rebuild every boot | Drop and rebuild all workspaces every start | |
| No sweep | In-funnel writes only; no self-healing | |

| Option | Description | Selected |
|--------|-------------|----------|
| Manual upsert in adapter | Explicit INSERT/DELETE in db-adapter.mjs next to the task write; no triggers | ✓ |
| SQLite triggers | AFTER INSERT/UPDATE/DELETE triggers on tasks; pg needs mirror logic | |

**User's choice:** In-funnel in-tx; Conditional rebuild; Manual upsert in adapter
**Notes:** Researcher directed to verify all write paths (doc-PUT, bulk, MCP mirror) hit the funnel site.

---

## Tokenizer & matching semantics

| Option | Description | Selected |
|--------|-------------|----------|
| unicode61 fold-both | FTS5 unicode61 remove_diacritics=2; pg parity via JS-folded projection (no extensions) | ✓ |
| Trigram substring | SQLite trigram + pg_trgm; real substring match, extension dependency | |
| Fold query only | Default tokenizer, fold only at query time | |

| Option | Description | Selected |
|--------|-------------|----------|
| AND + prefix | Implicit AND, each token allowed as prefix; server sanitizes query | ✓ |
| Exact AND | Full tokens only | |
| OR | Any token matches | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ranked top-30 | bm25/ts_rank order, cap 30, no pagination | ✓ |
| Unbounded | Return everything | |
| Top-30 + count | Cap plus total-count field (sets up pagination later) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Min 2 chars | Server ignores <2 folded chars; single chars use in-memory path | ✓ |
| Min 1 char | Any non-empty query | |
| Min 3 chars | Stricter floor | |

**User's choice:** unicode61 fold-both; AND + prefix; Ranked top-30; Min 2 chars
**Notes:** pg intentionally free of unaccent/pg_trgm extension dependencies.

---

## the agent's Discretion

- Palette merge/dedupe ordering; error/loading treatment on server failure (silent local-only degrade acceptable)
- Staleness-marker mechanism and sweep placement in boot sequence
- Snippet construction and route shape/payload details
- task_fts DDL (external-content vs contentless) and pg projection placement
- i18n keys for new UI strings

## Deferred Ideas

- Pagination / "showing 30 of N" result counts — explicitly excluded this phase
