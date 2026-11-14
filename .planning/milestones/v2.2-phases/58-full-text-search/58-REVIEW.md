---
phase: 58-full-text-search
reviewed: 2026-11-13T00:00:00Z
depth: standard
files_reviewed: 16
files_reviewed_list:
  - db-adapter.mjs
  - mcp.js
  - search-terms.mjs
  - server.js
  - src/actions/actions.js
  - src/core/api.js
  - src/core/search-server.js
  - src/overlays/palette.js
  - src/pages/search.js
  - test/db-adapter.test.mjs
  - test/i18n-shell.test.mjs
  - test/i18n-toast.test.mjs
  - test/palette-dispatch.test.mjs
  - test/search-fts.test.mjs
  - test/search-server.test.mjs
  - test/search-terms-drift.test.mjs
findings:
  critical: 1
  warning: 1
  info: 4
  total: 6
status: findings
---

# Phase 58: Code Review Report

**Reviewed:** 2026-11-13
**Depth:** standard
**Files Reviewed:** 16
**Status:** findings

## Summary

Phase 58 delivers server-side FTS (FTS5 + pg `tsvector` projection), the membership-gated `/api/workspaces/:slug/search` route, the `/search` page merge, and the Ctrl-K palette hybrid merge. The security posture of the route is strong: queries are sanitized server-side through `searchTerms` (pure `[a-z0-9]+` tokens, no operator characters survive), every hit is re-resolved in the full doc and filtered through `memberCanReadProject` before the payload is built, the byte-level leak test (test/search-fts.test.mjs:167) asserts raw-body absence of private titles/ids, and all client render sites escape (`hl()` escapes its three slices, `esc()` wraps snippets/keys/ids). The G-58-2 cmd-mode dispatch fix is correctly guarded (`ws` blocked, `cmd`/`search` dispatch) and regression-tested.

The one serious defect is architectural: on the pg backend, the "in-transaction" FTS sync rides a transaction whose doc write itself escapes the transaction (`db.run` → `pool.query`), so the D-07 atomicity guarantee the new code claims does not actually hold on pg — and the count-only staleness marker cannot heal the resulting content drift. The rest are minor robustness/consistency issues.

## Critical Issues

### CR-01: D-07 in-transaction FTS sync is not atomic on pg — doc write escapes the tx (Pitfall 2), and count-only sweep cannot heal the resulting drift

**File:** `mcp.js:185-192`, `server.js:5461-5496`, `db-adapter.mjs:402-422`
**Issue:** Phase 58's core consistency claim (D-07, server.js:5490-5495: "index writes must roll back with the doc write") is implemented as `syncTaskFts(scope, …)` inside `db.tx`. That part is correct — the adapter itself documents that on pg a module-level `db.run` inside a tx body lands OUTSIDE the checked-out client (db-adapter.mjs:453-455, Pitfall 2). But both callers still perform the doc update and doc read via the module-level facade inside the same tx body: `await db.run('update workspaces set doc = …')` (mcp.js:190, server.js:5489) goes through `pgRun` → `pool.query` (db-adapter.mjs:370-372), i.e. **outside** the tx, committed immediately. Consequences on pg:

1. If `syncTaskFts` throws (any SQL error/timeout), the tx rolls back — but the doc write has already committed. The index now misses the just-committed task changes, `fts_meta` was never updated (its write is inside the rolled-back tx), so counts can still coincidentally match `tasks.length`, and `ftsSweep`'s healthy check (`marker.n === tasks.length && indexed.n === tasks.length`, db-adapter.mjs:603) reports healthy forever. Result: a permanently stale/wrong search index on pg with no self-heal path until an unrelated task write happens to trigger a sync.
2. The reverse interleaving is also possible: the doc commit lands before the FTS tx commits, so a crash between them leaves a findability window — exactly what D-07 forbids.

SQLite is unaffected (`sqliteTxScope.run` writes on the same connection). This is a pre-existing `db.run`-inside-tx pattern, but Phase 58 is the change that (a) asserted the rollback guarantee in load-bearing comments and (b) added a second table whose consistency depends on it, so the guarantee must be made real or scoped honestly.

**Fix:** route the doc write (and the tx-body reads) through the tx scope in both write sites, so the whole write is on the checked-out client:

```js
// mcp.js writeDoc / server.js PUT tx body (pg-correct):
const row = await scope.get('select doc from workspaces where id = ?', [ws.id]);
…
await scope.run('update workspaces set doc = ?, revision = revision + 1, updated_at = ? where id = ?', [JSON.stringify(doc), now(), ws.id]);
await syncTaskFts(scope, ws.id, storedDoc, doc);
```

Alternatively, if the facade-wide fix is out of scope for this phase, add a content-bearing staleness signal (e.g. store the doc revision in `fts_meta` and compare it against `workspaces.revision` in `ftsSweep`) so pg drift self-heals at boot instead of relying on counts that can match by coincidence.

## Warnings

### WR-01: Palette server merge silently drops results for queries with surrounding whitespace (trimmed-vs-raw mismatch)

**File:** `src/overlays/palette.js:88-91, 94, 185`
**Issue:** `palServerSearch(el.value)` is called with the raw input (actions.js:2968-2973) and stores `pl.serverQ = q` with the raw string (palette.js:82). But `paletteItems()` compares against the **trimmed** query: `const q = pl.q.trim()` (line 94) and `pl.serverQ === q ? serverOnlyTasks(…)` (line 185). Typing "elo" then "elo " (trailing space — trivially common before continuing a phrase) leaves `serverQ = "elo "` ≠ `"elo"`, so the server tasks group vanishes even though the effective query is identical and was fetched. The same asymmetry exists for leading whitespace. `/search` is unaffected (both sides use the raw `S.ui.searchQ`).

**Fix:** normalize at the boundary — dispatch and store the trimmed query:

```js
export function palServerSearch(q) {
  q = String(q ?? '').trim();
  if (!api.enabled || !q) return;
  dispatchServerSearch(q);
}
```

(`dispatchServerSearch`'s stale check `pl.q !== q` then needs the same trimmed value; compare `pl.q.trim() !== q` there.)

## Info

### IN-01: Server search payload entries are not shape-validated client-side

**File:** `src/core/search-server.js:28-29`
**Issue:** `searchTasksServer` validates only `Array.isArray(r.data?.tasks)`; individual entries are trusted to carry `id/title/key/snippet/projectId`. A malformed entry (our server won't send one today, but proxies/tests might) surfaces as `st.title` = `undefined` → `hl(undefined)` renders empty, and `A.openTask({ dataset: { id: undefined } })` opens nothing. Not exploitable (server is first-party), just fragile.
**Fix:** filter entries: `.filter(t => t && typeof t.id === 'string')` before returning.

### IN-02: `createDebouncedSearch` can produce an unhandled promise rejection if `run` throws

**File:** `src/core/search-server.js:62-64`
**Issue:** The timer invokes `run(q, mine.signal, …)` — an async function (palette.js:76-84) whose body calls `render()` after the await. `searchTasksServer` never rejects, but a `render()` throw rejects the promise with no `.catch`, producing an unhandled rejection (console noise, and under strict handlers a crash).
**Fix:** `run(q, mine.signal, () => mySeq === seq)?.catch(() => {})` — or wrap the palette callback body in try/catch.

### IN-03: Misleading "Contentless-safe" comment on a contentful FTS5 table

**File:** `db-adapter.mjs:499`
**Issue:** The comment says "Contentless-safe: plain FTS5 delete + insert per changed row", but `task_fts` (line 488) is a regular contentful FTS5 table — plain `DELETE … WHERE` works *because* it is not contentless (a contentless table requires the special `'delete'` INSERT command, which this code does not use). The comment documents the opposite of the actual constraint and could mislead a future edit toward `content=`/`contentless_delete` decisions.
**Fix:** Reword: "regular (contentful) FTS5 table — plain DELETE works; if the table ever becomes contentless/external-content, delete must switch to the FTS5 delete command."

### IN-04: Route over-fetch can starve visible hits when private hits dominate the top-60

**File:** `server.js:5402, 5407-5423`
**Issue:** `searchTasks(wsId, terms, 60)` fetches the ranked top-60, then the privacy filter runs before the 30 cap. If more than 30 of the top-60 ranked hits sit in projects the caller cannot read, visible hits ranked below 60 are silently dropped from a query the member could legitimately see results for. This is the documented Pitfall 5 trade-off (no info leak either way — the shape stays a plain array), so it is a quality note, not a bug.
**Fix:** If hit quality complaints arrive, either raise the over-fetch or loop-page the ranked query until 30 visible hits or exhaustion (bounded).

---

_Reviewed: 2026-11-13_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
