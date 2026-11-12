# Phase 58: Full-Text Search - Research

**Researched:** 2026-11-12
**Domain:** Server-side FTS (SQLite FTS5 + pg parity) over task titles/descriptions in a JSON-doc monolith, permission-filtered, wired into the existing Ctrl-K palette
**Confidence:** HIGH (all code claims verified by direct file reads this session; FTS5 behavior verified by a live probe on this machine's Node)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01** Hybrid palette: instant in-memory `searchAll()` results stay; debounced server FTS results merge/dedupe into the same palette list.
- **D-02** Server queries debounced ~250 ms with AbortController; newer keystroke cancels the in-flight request.
- **D-03** Demo/offline mode (`api.enabled === false`) unchanged: local-only search, no FTS index, no server route. Gate pattern: `commands().filter(c => api.enabled || …)` [VERIFIED: src/overlays/palette.js:59 — verbatim: `.filter(c => api.enabled || c.id !== 'c-ws');`].
- **D-04** Index + route cover **tasks only** (title + description). Projects/people/comments/files stay client-side.
- **D-05** Existing `src/pages/search.js` is the full-results surface (same URL, same shell); it merges server results when online.
- **D-06** Presentation = existing task-row markup with `hl()` on titles + plain-text snippet around first description match (HTML stripped, `replace(/<[^>]+>/g, '')` treatment). **No FTS5 `snippet()`/`highlight()` server markup**.
- **D-07** `task_fts` upsert/delete **inside the doc-PUT transaction**, at the same funnel diff site. No findability window.
- **D-08** Boot sweep = conditional rebuild per workspace (cheap staleness check; rebuild only when stale/missing/empty). Same spirit as Phase 57's `migrateTotpReWrap` one-pass sweep [VERIFIED: server.js:2492 — `await migrateTotpReWrap();` sits in the boot migration sequence].
- **D-09** Manual upsert in the adapter, **no SQLite triggers** — explicit INSERT/DELETE issued by `db-adapter.mjs` next to the task write so SQLite and pg run the same code path.
- **D-10** Verify **every** task write path (doc-PUT funnel, bulk import, MCP mirror) flows through the same funnel diff site; any path that doesn't needs routing through the funnel or its own in-tx upsert. *(Research finding: mcp.js does NOT — see Pitfall 1.)*
- **D-11** SQLite: FTS5 `unicode61` with `remove_diacritics=2`, locked at `CREATE VIRTUAL TABLE` time.
- **D-12** pg parity via `to_tsvector('simple', …)` over a **JS-folded projection** of title/description stored alongside the row. **No `unaccent`/`pg_trgm` extension**. One-way reversibility: changing the tokenizer = full rebuild.
- **D-13** Matching = implicit AND of tokens, each token allowed as prefix. No query syntax; user input folded/tokenized/sanitized **server-side** before MATCH/`to_tsquery` — never raw.
- **D-14** Ranked top-30 (bm25 `rank` on SQLite, `ts_rank` on pg). Palette caps display as today; `/search` shows all 30. No pagination, no total-count.
- **D-15** Minimum server query length = **2 folded characters**; shorter → route returns empty, in-memory path only.

### the agent's Discretion
- Merge/dedupe ordering when palette combines in-memory + server results (constraint: no duplicates, single list)
- Palette error/loading treatment on route failure (silent degrade to local-only acceptable)
- Exact staleness-marker mechanism (count vs version row) and sweep placement in the boot migration sequence
- Snippet construction details; snippet computed client-side or returned as plain text by the route
- Exact route shape (`GET /api/workspaces/:slug/search?q=` per ARCHITECTURE.md, or equivalent) and payload
- `task_fts` DDL details (external-content vs contentless) and pg projection column placement, within D-09/D-12
- i18n keys for new UI strings (en + fr; i18n gate stays green)

### Deferred Ideas (OUT OF SCOPE)
- Result-count display ("showing 30 of N") and pagination — explicitly excluded this phase.
- Comments/projects/people/files FTS (future requirement; client-side stays).
- Saved searches, query syntax — excluded.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEARCH-01 | Plain-keyword search of task titles/descriptions from Ctrl-K, no query syntax | FTS5 implicit-AND + prefix syntax verified live; query sanitization pattern (fold → tokenize → quoted bare terms) in Code Examples |
| SEARCH-02 | Server-side `memberCanReadProject` filtering, byte-level leak tests | Predicate located [VERIFIED: server.js:928-933]; leak-test strategy + route gating pattern in Architecture Patterns |
| SEARCH-03 | Index syncs with every task write (funnel diff + boot sweep), identical on SQLite & pg | Funnel tx site located [VERIFIED: server.js:5373-5403]; MCP bypass path found (Pitfall 1); boot sweep template at server.js:2492 |
| SEARCH-04 | Accent-insensitive FR/EN, tokenizer locked at table creation | `remove_diacritics 2` probed live on this machine: "elodie" matches "Élodie", prefix `elo*` works, implicit AND works; `foldForSearch` read [VERIFIED: src/core/utils.js:22-34] |
</phase_requirements>

## Project Constraints (from AGENTS.md / project conventions)

No ./AGENTS.md or CLAUDE.md exists. Standing constraints from STATE.md apply:
- Full suite green; EN+FR i18n gate (server keys included); lint clean
- Zero migrations where feasible; additive rows use the Phase 34 guarded recipe (ensureTable, pre-backup, byte-identical second boot)
- All search results route `memberCanReadProject`, byte-level leak tests
- Runtime dependencies stay `{ pg }` (+ approved web-push in 59) — FTS adds **no new deps**
- DELIV-02: no chunk over 500 kB; palette is a first-paint surface — `searchAll` was deliberately kept in the entry chunk, don't regress it
- Phase 56 guarded e2e: e2e runs against `dist/` with the staleness guard

## Summary

Tasks live inside one JSON workspace document (`workspaces.doc`) written through a single
doc-PUT funnel (revision-checked `db.tx()`). There is no per-task table, so FTS needs a
**shadow table** maintained in-transaction by the adapter (D-07/D-09), not triggers and not
rebuild-on-write. The funnel diff site is at server.js ~5388-5395 (`storedFileIds`/`newNotifs`
pattern) — the `task_fts` diff joins the same pass, but note the diff must be computed
**inside** the tx body and written with the tx scope, unlike the fire-and-forget email fan-out
which runs post-commit.

The live probe confirmed everything SEARCH-04 needs on this machine's Node v24.21.0:
`create virtual table … using fts5(x, tokenize='unicode61 remove_diacritics 2')` works,
"elodie" matches "Élodie", `elo*` prefix works, bare-term implicit AND works. The
STATE.md flag ("FTS5 needs Node ≥22.16, probe at boot") is resolved — engines pins
node >=24, which ships `node:sqlite` with FTS5 enabled.

One critical D-10 discovery: **mcp.js has its own write transaction** ("The same shape as
server.js's PUT path: one immediate transaction", mcp.js:174-183) that updates
`workspaces.doc` directly — it does not flow through the server.js doc-PUT funnel. The MCP
mirror path needs its own in-tx `task_fts` sync (best shape: a shared `syncTaskFts(wsId,
storedDoc, next)` helper called by both tx bodies).

**Primary recommendation:** adapter-owned `searchTasks(wsId, foldedQ)` seam + `task_fts`
maintenance functions, called in-tx from both write sites (server.js funnel + mcp.js),
conditional-rebuild sweep in the boot sequence after `migrateTotpReWrap`, one membership-gated
GET route filtering through `memberCanReadProject`, and a debounced/abortable palette merge.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Index maintenance (upsert/delete on task diff) | Database/Storage (db-adapter seam) | API/Backend (both tx call sites) | D-09: adapter owns SQL so both backends prove parity; call sites are the two tx bodies |
| Query execution + ranking | Database/Storage (FTS5 bm25 / pg ts_rank) | — | Native ranking; adapter neutralizes dialect |
| Permission filtering of results | API/Backend (route) | — | SEARCH-02: never trust client; `memberCanReadProject` lives server-side |
| Query sanitization/folding | API/Backend (route) | — | D-13/D-15: folded+tokenized server-side before MATCH |
| Palette instant results | Browser/Client (`searchAll`) | — | D-01: unchanged in-memory path |
| Palette server merge (debounce/abort) | Browser/Client | API/Backend | D-02: client owns debounce + AbortController |
| `/search` page merge | Browser/Client | — | D-05: same page, merges when online |
| Snippet construction | Browser/Client | — | D-06: no server-generated HTML; plain text or client-side |
| Boot drift sweep | API/Backend (server.js boot) | Database/Storage | D-08: one-pass per workspace at boot |
| Demo mode | Browser/Client | — | D-03: `api.enabled` gate, no server involvement |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:sqlite` (DatabaseSync) FTS5 | built-in, Node 24.21.0 present | Shadow `task_fts` virtual table, bm25 ranking | Zero deps; FTS5 verified working this session [VERIFIED: live probe] |
| `foldForSearch` (src/core/utils.js:22-34) | existing | Accent folding for query side + pg projection | Proven, index-map highlight still lands correctly [VERIFIED: src/core/utils.js:18-34] |
| `db-adapter.mjs` facade (get/all/run/tx) | existing | Sole SQL seam; dialect neutralization | D-09; DBA suite proves parity [VERIFIED: db-adapter.mjs:431-444] |
| `pg` `to_tsvector('simple', …)` | existing dep | pg parity over JS-folded projection | D-12: no unaccent/pg_trgm extensions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `memberCanReadProject` (server.js:928) | existing | Server-side read filter | Every route result before serialization [VERIFIED: server.js:928-933] |
| `hl()` (src/ui/helpers.js:74) | existing | Client highlight on folded text | Title + snippet highlighting, D-06 |
| AbortController + setTimeout debounce | browser built-ins | D-02 client behavior | Palette input handler |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shadow `task_fts` table | SQLite triggers on `workspaces` | Rejected (D-09/PITFALLS anti-pattern): triggers see the JSON blob, not tasks; drift guaranteed; two mechanisms vs adapter parity |
| `remove_diacritics=2` | pg `unaccent` extension | Rejected (D-12): extension dependency on self-hosted pg; JS-folded projection keeps both backends folding identically |
| FTS5 `snippet()`/`highlight()` | client plain-text snippet | Rejected (D-06): server HTML surface; client already has `hl()` + strip treatment |
| contentless FTS5 table | external-content table | Both viable — planner's discretion (CONTEXT). External-content with `content=''` contentless avoids double storage but can't return column values; route returns ids then fetches task bodies anyway, so contentless is the natural fit. Either passes D-09. |

**Installation:** None — zero new dependencies (engines: node >=24 [VERIFIED: package.json]).

## Package Legitimacy Audit

No external packages installed this phase (`node:sqlite` FTS5 is built into Node 24; `pg` is
the existing approved dep). Audit table: not applicable — no installs.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 WRITE PATHS                                   READ PATH
 ───────────                                   ──────────
 Browser doc-PUT ──▶ PUT /api/workspaces/:slug
                       db.tx() body (server.js ~5373):
                       storedDoc vs next diff ─┬─▶ newNotifs (existing)
                                               ├─▶ storedFileIds (existing)
                                               └─▶ task diff ──▶ adapter syncTaskFts()
                                                                  ├─ SQLite: insert/delete into task_fts
                                                                  └─ pg: insert/delete into task_projection (folded tsvector)
 MCP tool write ──▶ mcp.js saveDoc tx (~174) ──▶ same syncTaskFts()  [same helper, both sites]
                                                              (all inside the tx — D-07)
 boot ──▶ after migrateTotpReWrap (server.js:2492) ──▶ staleness check
          (count/version marker) ──▶ conditional rebuild per workspace (D-08)

 Ctrl-K palette ──▶ searchAll(q) instant (local, unchanged)
        └─(250ms debounce, AbortController)──▶ GET /api/workspaces/:slug/search?q=
              route: requireWorkspace(member) → fold+tokenize query (D-13/15)
              → db.searchTasks(wsId, terms) (adapter seam)
              → map ids → memberCanReadProject filter (SEARCH-02)
              → { id, key, title, snippet, projectId } top-30 ranked
        ◀── merge + dedupe into palette groups (D-01)
 /search page ──▶ same route when api.enabled, merges with local tasks section (D-05)
```

### Recommended Project Structure
```
db-adapter.mjs            # + ensureSearchIndex(), syncTaskFts(wsId, stored, next), searchTasks(wsId, q), ftsSweep(wsId, doc)
server.js                 # + funnel tx diff call (in-tx), boot sweep call, GET /api/workspaces/:slug/search route
mcp.js                    # + same syncTaskFts call inside its saveDoc tx (Pitfall 1 fix)
src/core/searchall.js     # unchanged (D-01/D-03)
src/core/api.js           # + debounced/abortable searchFetch helper (or new src/core/search-server.js)
src/overlays/palette.js   # + server-result merge into tasks group
src/pages/search.js       # + server task results merge (D-05)
test/search-fts.test.mjs  # new: adapter parity, sanitization, leak tests, sweep
test/db-adapter.test.mjs  # extended: DBA suite rows for the FTS seam
```

### Pattern 1: diff-at-the-funnel (P4-f), in-tx variant
**What:** derive `task_fts` writes from the stored-vs-next diff computed once inside the
`db.tx()` body. **Unlike the email fan-out, index writes are IN the transaction** (D-07) —
the tx scope's `run()` must be used, not the fire-and-forget post-commit site.
**When to use:** every doc write that can add/rename/delete a task.
**Example** (shape; exact code in server.js:5384-5402):
```js
// Source: server.js:5384-5402 (verified read) — insert beside the existing diffs, INSIDE db.tx
const storedTasks = new Set((storedDoc?.data?.tasks || []).map(t => t?.id).filter(Boolean));
const nextTasks   = new Map((next?.data?.tasks || []).map(t => [t?.id, t]).filter(([id]) => id));
// upsert changed/new, delete vanished — via db adapter helpers using the TX scope
```
Caveat [VERIFIED: db-adapter.mjs:405-409, 422-429]: the tx body receives a **scope** with
`get/all/run`; the current call sites use module-level `db.get/db.run` inside the tx body —
on pg those would run OUTSIDE the checked-out tx client. The FTS sync (and ideally note this
to the planner: the existing funnel's `db.get/update` inside the tx body has this same latent
property) must use the scope passed to `fn` for true in-tx writes on pg. Plan for
`db.tx(scope => …)` and pass scope into `syncTaskFts(scope, …)`.

### Pattern 2: adapter seam with per-dialect branch
**What:** one exported function per operation; dialect branch inside, callsites stay portable.
**Example:**
```js
// Source: db-adapter.mjs:347-350 (runSchema) and :431-444 (facade) — follow the same shape
export async function searchTasks(wsId, foldedTerms, limit = 30) {
  if (backendKind === 'pg') {
    // select over task_projection: websearch_to_tsquery('simple', foldedQ) @@ projection
    //   or: build implicit-AND tsquery from already-tokenized terms
    // order by ts_rank desc limit ?
  }
  // SQLite: select task_id from task_fts where task_fts match ? order by rank limit ?
  //   match argument = foldedTerms.join(' ') with each token prefix-escaped (see Code Examples)
}
```
The SQLite MATCH argument and the pg query are **both built in the adapter** — server.js only
ever passes the folded raw string. This keeps D-13's "never raw into MATCH" enforceable at
one site, pinned by tests.

### Pattern 3: guarded additive migration (boot sweep)
**What:** `task_fts` creation + per-workspace conditional rebuild in the boot sequence, after
`migrateTotpReWrap` (server.js:2492) — the established load-bearing-order discipline
[VERIFIED: server.js:2492-2494 comment "AFTER migrateTotpReWrap — the same load-bearing-order
discipline"]. Staleness marker (planner's choice per D-08): a small `fts_meta(workspace_id,
task_count, index_version)` row compared against a fresh doc count is cheap and survives
crashed rebuilds; empty index + nonzero doc count ⇒ rebuild.

### Anti-Patterns to Avoid
- **SQLite triggers on `workspaces.doc`** — fires on every doc write with no diff knowledge; can't diff JSON (ARCHITECTURE.md anti-pattern, D-09).
- **Raw user input into `MATCH`** — FTS5 syntax errors/injection (PITFALLS Pitfall 7). Always fold → tokenize → controlled match expression.
- **Server-side `snippet()`/`highlight()` HTML** — new HTML surface; D-06 says plain text + client `hl()`.
- **Filtering results client-side only** — the server doc the client holds is redacted, but the FTS route sees the full doc; `memberCanReadProject` must run server-side per result (SEARCH-02).
- **Client-side FTS of the redacted doc as the only server-results sanity check** — merge must dedupe by task id, and the server list must be authoritative for tasks the local redacted doc can't see (D-01's stated reason the server path exists).
- **Rebuilding the whole index on every PUT** — breaks the one-tx-one-diff shape; only the diff rows move (ARCHITECTURE.md §1).
- **New lazy chunk for palette search fetch** — palette is first-paint (DELIV-02); the debounce/abort helper must live in the entry chunk or a chunk palette already eagerly loads.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Accent folding | custom NFD strip (again) | `foldForSearch` (utils.js:22) | Proven, keeps orig-index map for `hl()` [VERIFIED: src/core/utils.js:22-34] |
| Tokenizer/ranking | custom scoring over LIKE | FTS5 bm25 `rank` / pg `ts_rank` | Native, indexed, prefix-capable; verified working |
| SQL dialect differences | per-callsite `if pg` | adapter seam (D-09) | DBA suite proves parity in one place |
| Additive table migration | ad-hoc DDL in route | boot-sequence guarded recipe (Phase 34 style, after line 2492) | pre-backup + byte-identical second boot discipline |
| HTML stripping for snippets | new regex site | reuse `replace(/<[^>]+>/g, '')` treatment from searchAll [VERIFIED: src/core/searchall.js:17] | One idiom, matches D-06 |

## Runtime State Inventory

Not a rename/refactor/migration phase — but D-08 makes drift state explicit, so:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `workspaces.doc` holds all tasks in JSON; **no task rows exist** [VERIFIED: db-adapter.mjs:194-203 schema] | New `task_fts` (+ pg projection) created at boot; sweep seeds from existing docs |
| Live service config | `scripts/copy-sqlite-to-pg.mjs` copies tables between backends [VERIFIED: file exists] | Script must carry/create the new FTS structures on the pg side (or rely on the boot sweep to rebuild after copy — planner's call; sweep healing is the safety net) |
| OS-registered state | None — verified: single Node process, no external task registrations | none |
| Secrets/env vars | None added — no VAPID/SMTP-style config this phase | none |
| Build artifacts | None — no new npm packages, no compiled output beyond existing Vite dist | none |

## Common Pitfalls

### Pitfall 1: MCP mirror writes bypass the funnel (D-10 verification result)
**What goes wrong:** mcp.js `saveDoc` runs "the same shape as server.js's PUT path: one
immediate transaction" and writes `workspaces.doc` directly [VERIFIED: mcp.js:174-183,
verbatim: `return await db.tx(async () => {` … `await db.run('update workspaces set doc = ?,
revision = revision + 1, updated_at = ?', …)`]. A `task_fts` sync hooked only into the
server.js funnel leaves every MCP-created/edited task unindexed.
**Why it happens:** the MCP path predates FTS and intentionally mirrors the PUT shape.
**How to avoid:** extract `syncTaskFts(wsId, storedDoc, next, scope)` (adapter module or
server helper importable by mcp.js) and call it in **both** tx bodies. Add a test that an
MCP write is findable via `searchTasks` immediately.
**Warning signs:** SEARCH-03 e2e passes via browser but the MCP task never appears in results.

### Pitfall 2: pg tx-scope bypass
**What goes wrong:** inside `db.tx(fn)`, pg runs `fn(scope)` on a checked-out client
[VERIFIED: db-adapter.mjs:400-420]; using module-level `db.run` inside the tx body goes
through `pgRun`/`pool.query` — outside the transaction. An index write done that way is not
atomic with the doc write, silently breaking D-07's consistency guarantee on pg only.
**How to avoid:** thread the tx `scope` into the FTS sync; SQLite path is unaffected (module
calls serialize on the same connection) which makes the bug pg-only — exactly what the DBA
suite exists to catch.
**Warning signs:** parity suite passes on SQLite, interleaving flake on pg.

### Pitfall 3: FTS5 MATCH syntax errors from raw queries
**What goes wrong:** quotes, `NEAR`, `*`, `AND/OR`, `col:` in user input break `MATCH`
(PITFALLS Pitfall 7 — 500s or injection risk).
**How to avoid (D-13):** server-side: fold via `foldForSearch().text`, split on
non-alphanumeric, drop empties, drop terms shorter than 2 (D-15 applies to the whole query;
empty term list ⇒ empty result), then build the match expression in the adapter — e.g. each
token as `tok*` joined by spaces (implicit AND of prefixes). Sanitize tokens to `[a-z0-9]+`
(after folding) so no FTS5 operator character survives. Verified prefix + implicit AND
behavior this session [VERIFIED: live probe].
**Warning signs:** 500s on queries containing quotes/colons; a test suite asserting
`'"quo*te'`-style inputs return 200 + sane results.

### Pitfall 4: tokenizer/query normalization mismatch
**What goes wrong:** `remove_diacritics 2` folds the index, but the query must be normalized
compatibly — querying with raw accents won't match the folded index tokens for all cases
(PITFALLS 7c).
**How to avoid:** fold the query with the same `foldForSearch` before building the match
expression; on pg, the projection is JS-folded with `foldForSearch` (D-12) so query folding
matches by construction. unicode61 also strips punctuation as separators — folded
`[a-z0-9 ]` queries align.
**Warning signs:** "Élodie" typed WITH accents fails while "elodie" works.

### Pitfall 5: private-project title leak through the route
**What goes wrong:** the FTS index spans the whole workspace doc including private projects;
a member querying a private task's title would receive title/snippet unless the route
filters (the named top security trap, PITFALLS + CONTEXT specifics).
**How to avoid:** route handler: `requireWorkspace(req, res, slug, 'member')` → run
`searchTasks` → for each result id, resolve its project in the doc and
`await memberCanReadProject(p, wsId, memberId)` → drop failures BEFORE building the payload;
return at most 30 **after** filtering (fetch a few more than 30 pre-filter, or re-query, so
private hits don't consume the budget — planner's discretion). Byte-level tests: member
session querying a known private task title/yield zero occurrences of the title substring
anywhere in the response body.
**Warning signs:** any test that only checks status codes, not body bytes.

### Pitfall 6: i18n gate breakage / chunk regression
**What goes wrong:** new UI strings (merge indicator, "view all" merge copy) missing from en
or fr catalogues fail `scripts/i18n-scan.mjs` (prebuild hook); palette changes can push the
entry chunk over the 500 kB DELIV-02 gate (Phase 57 left only ~6.6 kB headroom at 493.4 kB
[VERIFIED: STATE.md execution decisions]).
**How to avoid:** add keys to both catalogues in the same task; keep palette additions tiny
(no new imports beyond the api helper); run `npm run build` + chunk-size test per task.
**Warning signs:** `build-chunk-size.test.mjs` red.

## Code Examples

### SQLite side: table creation + prefix-AND query (verified live this session)
```sql
-- Source: live probe on Node v24.21.0 node:sqlite (create/insert/select all returned OK)
create virtual table if not exists task_fts using fts5(
  task_id UNINDEXED, project_id UNINDEXED, title, body,
  tokenize = 'unicode61 remove_diacritics 2'
);
-- query: implicit AND of prefix tokens; match string built in the adapter:
--   'elodie' → 'elodie*' ; 'fiche carte' → 'fiche* carte*'
select task_id, project_id from task_fts where task_fts match ? order by rank limit 30;
```
Probe results [VERIFIED: live probe]: `match 'elodie'` returned the row containing
"Élodie fiche carte"; `match 'elo*'` matched; `match 'fiche carte'` matched (implicit AND).
Prefix matching must be explicit (`tok*`) — bare `'elo'` would NOT prefix-match (only the
full-term forms were exercised with plain terms; treat bare-token-prefix as unverified and
always emit `tok*`).

### Query sanitization (server-side, before the adapter)
```js
// Pattern per D-13/D-15 — every operator character gone before MATCH sees it
import { foldForSearch } from './core-normalize.js'; // server-side copy or extracted shared module
function searchTerms(q) {
  const folded = foldForSearch(String(q ?? '')).text;          // lower + NFD strip [VERIFIED: utils.js:22-34]
  if (folded.trim().length < 2) return [];                     // D-15
  return folded.split(/[^a-z0-9]+/).filter(t => t.length >= 2); // [a-z0-9] only — no FTS5 operators survive
}
// adapter: terms.map(t => t + '*').join(' ')
```
Note: server.js cannot import from `src/core/utils.js` (browser module, imports i18n/DOM
patterns). `foldForSearch` is 12 lines — either extract to a shared zero-dep module or
duplicate with a drift-pinning test (the codebase's established pattern, e.g. PERMS ladder
duplicated with `test/perm-drift.test.mjs` [VERIFIED: server.js:976-978 comment]).

### pg side: folded projection (D-12)
```sql
-- projection column maintained by the same syncTaskFts in the adapter:
--   projection = to_tsvector('simple', foldedTitle || ' ' || foldedBody)
create table if not exists task_search_projection (
  workspace_id text not null, task_id text not null, project_id text not null,
  folded text not null,            -- plain folded text (snippet source)
  projection tsvector not null,
  primary key (workspace_id, task_id)
);
create index if not exists task_search_projection_ts on task_search_projection using gin (projection);
-- query (terms pre-tokenized to [a-z0-9], joined ' & '):
select task_id, project_id, folded from task_search_projection
 where workspace_id = ? and projection @@ to_tsquery('simple', ?)
 order by ts_rank(projection, to_tsquery('simple', ?)) desc limit 30;
```
Storing the folded plain text in the row keeps snippet construction identical across
backends (route slices around the first folded match — the client maps it onto the original
via the same philosophy as `foldForSearch`'s map, or the route returns a plain-text snippet
from the folded body; planner's discretion per D-06).

### Route shape (follow Phase 57 dedicated-route style)
```js
// GET /api/workspaces/:slug/search?q= — membership-gated, sameOrigin, server-side everything
if (wsMatch && method === 'GET' && wsMatch[2] === 'search') { …
  const user = await requireUser(req, res); if (!user) return;
  // + membership check + fold/tokenize + db.searchTasks + memberCanReadProject per hit
  // payload: { tasks: [{ id, key, title, projectId, snippet }] } — plain strings only
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LIKE '%q%' scans | FTS5 shadow index + bm25 rank | this phase | indexed, ranked, prefix, accent-folded |
| Client-only search | hybrid local + server route | this phase | server sees past redaction limits; local stays instant |
| node:sqlite without FTS certainty | Node ≥22.16 ships FTS5; engines pins ≥24 | resolved | no boot probe needed for capability; keep a console warn if FTS5 is somehow unavailable, degrade route to 503 (client silently degrades per D-03 spirit) |

**Deprecated/outdated:** none relevant.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | FTS5 bare token does NOT prefix-match (only `tok*` verified; bare `'elo'` exact-term behavior inferred, not probed) | Code Examples | Query builder emits `tok*` anyway — plan already correct; low risk |
| A2 | `copy-sqlite-to-pg.mjs` copies tables verbatim (not read line-by-line) | Runtime State | If it whitelists tables, new projection table needs adding; boot sweep is the safety net |
| A3 | Snippet client-side mapping via fold-index map is feasible at plan level (route returning folded text vs plain snippet left to planner) | Discretion | Cosmetic; either shape satisfies D-06 |
| A4 | to_tsquery('simple', 'a & b*') ranking quality comparable to bm25 for this scale | pg pattern | Worst case: acceptable-but-cruder ordering on pg; D-14 only requires ranked top-30 |

## Open Questions

1. **Scope discipline in the funnel tx body**
   - What we know: existing tx body calls module-level `db.get/db.run` [VERIFIED: server.js:5374, 5401]; pg tx scope exists [VERIFIED: db-adapter.mjs:400-420]
   - What's unclear: whether Phase 58 should also convert the existing doc-write calls to scope (out-of-scope creep) or only ensure the new FTS sync uses scope
   - Recommendation: FTS sync uses the tx scope; leave the existing calls untouched (note in plan as known latent issue, no opportunistic repair per project rules)

2. **contentless vs external-content `task_fts` DDL**
   - What we know: route returns ids then builds payload from the doc, so stored column values are unneeded; UNINDEXED id columns are convenient either way
   - Recommendation: contentless (`content=''`) — smallest storage; the boot sweep and in-tx sync both write explicitly, which suits contentless's insert-only discipline (delete requires the 'delete' command form on contentless — verify in the DBA test)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node with FTS5-capable `node:sqlite` | SQLite backend | ✓ (probed) | 24.21.0 | — (engines pins ≥24) |
| `pg` with tsvector/GIN | pg backend | ✓ (existing dep, pg ^8.23.1) | 8.x | boot sweep heals; DBA suite pins parity |
| Playwright/e2e harness | SEARCH-02/03 e2e | ✓ (Phase 56 guarded dist) | ^1.64.1 | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` (built-in), Playwright for e2e |
| Config file | none needed (test/*.test.mjs glob; `npm test`) |
| Quick run command | `node --test test/search-fts.test.mjs` |
| Full suite command | `npm test` (1426+ tests, concurrency 2) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEARCH-01 | plain keywords, no syntax, prefix+AND, top-30 ranked | unit (adapter + sanitization) | `node --test test/search-fts.test.mjs` | ❌ Wave 0 |
| SEARCH-02 | private-project hits absent from response bytes, per role | unit route-level + e2e | `node --test test/search-fts.test.mjs -x` + `npm run e2e` | ❌ Wave 0 (byte-level leak tests are the non-negotiable) |
| SEARCH-03 | funnel write findable in-tx; MCP write findable; sweep heals deleted row | unit (both tx sites) + e2e | `node --test test/search-fts.test.mjs` | ❌ Wave 0 |
| SEARCH-04 | "elodie"→"Élodie", both backends | unit (DBA parity suite) | `node --test test/db-adapter.test.mjs` | ✅ (extend) |
| i18n/chunk standing gates | catalogue keys, ≤500 kB chunks | unit/build | `npm run build` + `build-chunk-size.test.mjs` | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/search-fts.test.mjs test/db-adapter.test.mjs`
- **Per wave merge:** `npm test` + `npm run lint` + i18n scan
- **Phase gate:** full suite + `npm run e2e` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/search-fts.test.mjs` — sanitization, both-backend parity, leak tests, sweep, MCP-path coverage
- [ ] DBA suite rows for `searchTasks`/`syncTaskFts` in `test/db-adapter.test.mjs`
- [ ] Drift-pin test if `foldForSearch` is duplicated server-side (open question: extract vs duplicate)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V4 Access Control | **yes — core of SEARCH-02** | `memberCanReadProject` per result, server-side only [VERIFIED: server.js:928-933] |
| V5 Input Validation | yes | server-side fold/tokenize/`[a-z0-9]` whitelist before MATCH/to_tsquery (D-13); parameterized SQL throughout the adapter (T-45-01) |
| V3 Session Management | yes (route) | existing `requireUser`/`requireWorkspace(member)` + `sameOrigin` gate pattern (every route in server.js) |
| V2 Authentication | no (inherits existing) | — |
| V6 Cryptography | no | — |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Private-project content disclosure via search | Information Disclosure | server-side per-hit `memberCanReadProject`; byte-level body assertions in tests (not status codes) |
| FTS5/pg query-syntax injection | Tampering | token whitelist to `[a-z0-9]`, prefix-suffixed, parameterized; never raw interpolation |
| Over-fetch oracle (member probes private titles via result counts) | Information Disclosure | constant shape: always `{tasks: [...]}`, filter before cap; no count/total field (D-14 excludes it — also a security win) |

## Sources

### Primary (HIGH confidence)
- Live FTS5 probe on this machine (Node 24.21.0, node:sqlite): `unicode61 remove_diacritics 2` creation, elodie→Élodie, prefix, implicit AND — all returned OK
- `server.js` read: memberCanReadProject (928-933), canSeeProject (915-920), doc-PUT funnel tx (5351-5430), boot sequence (2492), ensureColumn list (459-475)
- `db-adapter.mjs` read in full (547 lines): facade, tx scopes, schema, pg rewrite layer
- `src/core/searchall.js`, `src/core/utils.js` (foldForSearch), `src/overlays/palette.js`, `src/pages/search.js` read in full
- `mcp.js` grep-verified: own saveDoc tx at lines 174-183
- `.planning/research/ARCHITECTURE.md` §1, `.planning/research/PITFALLS.md` (Pitfalls 3, 5, 7)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md` (dual-backend constraints, cited by CONTEXT)
- SQLite FTS5 docs semantics (via milestone PITFALLS.md HIGH-confidence research)

### Tertiary (LOW confidence)
- pg ts_rank ordering-quality equivalence (A4)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new deps; FTS5 probed live; all integration points read this session
- Architecture: HIGH — funnel tx site, adapter facade, palette, search page all read directly
- Pitfalls: HIGH — MCP bypass and pg tx-scope issue are code-verified, not speculative

**Research date:** 2026-11-12
**Valid until:** 2026-12-12 (stable; codebase-grounded)
