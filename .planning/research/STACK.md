# Technology Stack

**Project:** Projects Studio — v1.7 "Team Visibility & Hardening"
**Researched:** 2026-11-02
**Mode:** Ecosystem (platform-capability research for six debt-closure items)
**Hard constraint:** zero runtime dependencies (held since v1.1; verified in PROJECT.md and `Dockerfile`)

## Runtime Ground Truth

**Node version: 24.** Both Dockerfile stages are `node:24-alpine` (build stage line 2, runtime stage line 12) — no Node upgrade is needed or desired for v1.7. Local dev matches: `node -v` → **v24.21.0**. All APIs below are verified against Node 24 docs/codebase reality.

## Recommended Stack (what v1.7 uses — all already in the codebase or in Node 24 built-ins)

### Core Runtime

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | 24 (node:24-alpine, Dockerfile) | Server runtime | Already the shipped image; Alpine SQLite build is fine for the DB sizes involved |
| `node:sqlite` (`DatabaseSync`) | introduced 22.5; unflagged since 22.13/23.4; release-candidate from 24.15/25.7 | All persistence, incl. the new per-user settings rows | Already used (`server.js:54`); in Node 24 the class is now `Database` with `DatabaseSync` kept as a documented deprecated alias (DEP0210) — existing imports keep working, do NOT churn them for v1.7 |
| `node:crypto` | Node 24 | Nothing new needed | scrypt, `timingSafeEqual`, `randomBytes`, `createHash` (sha256 `keyIdFor`), AES-256-GCM keyring all exist (`server.js:83–101`); v1.7 adds no cryptography |
| `node:http` | Node 24 | `req.headers` origin/host handling for HARD | Already parsed by hand throughout; no HTTP framework anywhere |

### Per-Item Capability Map

| Item | Node capability used | Codebase reuse |
|------|---------------------|----------------|
| VIS | `node:sqlite` prepared statements (`prepare().all()` on `team_members` + project doc `teams[]`) | `team_members` table + `team_members_user` index already exist (`server.js:227–234`); the Phase-29 `projectScope`/`hiddenFor` redaction funnel (`server.js:~700–880`) is the single choke point to extend with the team-intersection rule — no new machinery |
| UNDO | Client-side only: existing `restore(snap)` toast pattern + `setMemberTeams` PUT | `A.delTeam` in `src/actions/teams.js:119` already captures a doc snapshot; the fix is capturing per-member `before` team sets and re-PUTting them (or suppressing the undo offer) — zero server capability required |
| HARD | `req.headers.origin`, `x-forwarded-host`, `x-forwarded-proto` | `sameOrigin()` already exists (`server.js:2389–2394`) and is already applied to ~35 routes — HARD item 1 is adding one call to the invite-accept route, which verifiably lacks it (`server.js:4316–4320` has throttle + token lookup, no `sameOrigin`) |
| SEARCH | `String.toLowerCase().includes` + existing redaction | `referencesHidden()` (`server.js:837`), `mergeRecentSearches()` (`server.js:844`), `hiddenProjectTerms()` already do substring redaction; SEARCH is closing their gaps (empty-term edge, free-text limitation doc) — no new API |
| SETTINGS | `node:sqlite` `CREATE TABLE` / `ALTER TABLE` additive migration + `prepare().run()` | Migration machinery proven: `vacuum into` backup (`server.js:1727` et al.), guarded one-time backfill precedent (team_members, `server.js:1693–1741`), byte-identical second boot pinned by `test/migration.test.mjs`; per-user precedent exists — `locale` column (v1.2) and `notifications` per-recipient rows (v1.4) |
| DEPLOY | docker-compose `environment:` passthrough | Server already reads `MASTER_KEY_PREVIOUS` (`server.js:88–101`); only the compose file line is missing (verified: `docker-compose.yml:8–45` has no `MASTER_KEY_PREVIOUS`) |

## Platform API Details & Pitfalls (verified)

### `node:sqlite` (Node 24)

- **Type conversion table (doc-verified):** booleans bind as INTEGER 1/0; `undefined` binds as NULL; integers outside safe range throw unless `readBigInts` is on. The codebase already binds 1/0 explicitly — keep that style; do not rely on boolean binding, which only landed in 24.21 (too new to assume on any 24.x patch).
- **JSON columns:** there is no native JS↔JSON column type. Follow the established `workspaces.doc` pattern: `JSON.stringify` into a TEXT column, `JSON.parse` on read. For per-user settings, one row per `(workspace_id, user_id)` with a small TEXT JSON payload (or flat columns for `notifPrefs` toggles) — flat columns are preferred because each toggle becomes an updatable column with a default, matching the `notifPrefs`-default-ON semantics (`D-27-5` in `test/due-reminders.test.mjs`).
- **Transactions:** no `.transaction()` helper — the codebase's existing `db.exec('BEGIN')/COMMIT` inline pattern is correct. `db.isTransaction` (added 24.0/22.16) exists if a guard is wanted. Additive migration must stay inside the existing backup-then-transaction boot flow.
- **`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`** are the additive-migration primitives already used at boot (`server.js:160–234`) — no `ALTER TABLE` needed if the new settings table is new-shaped.
- **`DatabaseSync` deprecation nuance:** `DatabaseSync`/`StatementSync` are deprecated *aliases* (DEP0210/DEP0211) as of late Node 24.x. Not a v1.7 concern (renaming touches every call site for zero behavior change), but note it in STATE.md deferred items.

### Origin / Referer parsing for the `sameOrigin` check (HARD)

- The existing `sameOrigin()` compares the raw `Origin` header string against `` `${proto(req)}://${host}` `` — an exact string compare, **no URL parsing**. This is the right design to extend: `new URL(origin)` would normalize the default port away (`https://x:443` → `https://x`) and make the comparison *stricter than needed* or introduce case/port surprises. Keep the string compare.
- **Pitfall 1 — proxy headers:** `proto()` and the host both honor `x-forwarded-*` but take `.split(',')[0].trim()` of proto (`server.js:2357–2360`) while `sameOrigin` uses `x-forwarded-host` *without* the first-value split (`server.js:2392`). A multi-hop `X-Forwarded-Host: real, internal` makes the origin comparison fail (closed proxy setups) — and a spoofable chain header makes it *pass* for an attacker if TRUST_PROXY is on and Traefik doesn't strip inbound `X-Forwarded-Host`. Any HARD work here should mirror the first-value discipline used by `proto()`/`clientIp()` (`server.js:2384–2387`).
- **Pitfall 2 — missing Origin:** `sameOrigin` returns `true` when Origin is absent (non-browser clients; `server.js:2391`). Correct for CSRF but means "sameOrigin on invite accept" is not a fix for non-browser abuse — the route keeps its per-IP throttle (`tooMany`, `server.js:4318`) as the real control. Do not tighten this to Origin-required: same-site navigations from older browsers and the `/join` GET legitimately omit Origin.
- **Pitfall 3 — Referer:** do NOT add Referer-based fallback. Referer parsing needs `new URL(referer)` and a `.origin` comparison, which reintroduces URL-normalization pitfalls (port, case, punycode) for marginal benefit; the Origin check plus `SameSite=Lax` cookie (already set, `server.js:2415`) covers the CSRF window.
- **Pitfall 4 — Origin `null`:** sandboxed iframes and redirects send `Origin: null`; the exact string compare rejects it correctly, which is the desired outcome. No special case.

### Search redaction (SEARCH)

- `referencesHidden` does `term.toLowerCase().includes(name)` (server.js:837). Known residual leak classes: (a) a hidden term that is itself empty/whitespace matches everything — guard `hiddenTerms.some(name => name && ...)`; (b) free-text search hitting task titles/comments is *not* redacted and cannot be, without indexing — that limitation is what the milestone says to **document**, not fix. No platform API beyond `toLowerCase`/`includes`/`Intl.Collator` (already used for accent-insensitive matching elsewhere per PROJECT.md).

### HTTP/misc

- `fetch` (global, used in the healthcheck, Dockerfile:36) — unaffected by v1.7.
- `crypto.randomUUID()` for row ids — already the house pattern for authority rows (`team_members.id`-style text PKs); reuse for per-user settings rows.
- `Date.now()` epoch-ms integers for `created_at` — house pattern in every table (`server.js:161–233`).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Per-user settings storage | New table, one row per (workspace_id, user_id) | Keep in workspace doc under per-user keys | Defeats the point: the doc is shared, redacted and merged on every read/write — the milestone explicitly moves settings OUT of it |
| Settings columns | Flat columns with defaults | One JSON TEXT blob | Defaults + `D-27-5` all-ON semantics are expressible in SQL; JSON blob re-creates the doc-merge problem at row scale |
| Invite-accept origin guard | Reuse existing `sameOrigin()` | New `parseOrigin`/Referer check | URL-normalization pitfalls (see above); the existing guard is battle-tested across ~35 routes |
| delTeam undo | Capture per-member `before` team sets, re-PUT on undo | New server-side undo log table | Massive overbuild for a client-side optimistic action; re-PUT reuses the `PUT /members/:uid/teams` route unchanged |
| VIS enforcement | Extend the single `projectScope`/`hiddenFor` funnel | Per-route visibility checks | Per-route checks are exactly the drift the v1.6 funnel was built to prevent (PROJECT.md Phase 29) |
| Node upgrade | None | node:25-alpine | No v1.7 item needs it; bumps `node:sqlite` from experimental-adjacent to RC but risks behavioral churn mid-debt-milestone |

## Installation

```bash
# Nothing. Zero runtime dependencies held.
# Dev dependency remains @playwright/test only (package.json).
```

## Reusable Codebase Inventory (checked, do not rebuild)

| Existing piece | Location | Reused by |
|----------------|----------|-----------|
| `sameOrigin(req)` | server.js:2389 | HARD (one new call site) |
| `proto(req)` / `clientIp(req)` first-value proxy discipline | server.js:2357, 2384 | HARD (make `x-forwarded-host` consistent) |
| `team_members` table + index | server.js:227–234 | VIS |
| `projectScope`/`hiddenFor` read funnel | server.js:~700–880 | VIS |
| `referencesHidden` / `mergeRecentSearches` / `hiddenProjectTerms` | server.js:837/844/868 | SEARCH |
| `vacuum into` backup + guarded one-time backfill migration pattern | server.js:1693–1741, 1727 | SETTINGS |
| `setMemberTeams` PUT route | server.js:3990+ | UNDO |
| Keyring reading `MASTER_KEY_PREVIOUS` | server.js:88–101 | DEPLOY (compose line only) |
| `restore(snap)` toast-undo client pattern | src/actions/actions.js:699+ | UNDO |
| Per-user `locale` column precedent (per-user state outside doc) | v1.2, PROJECT.md | SETTINGS |

## Sources

- `Dockerfile` (lines 2, 12) — node:24-alpine, both stages [HIGH]
- `docker-compose.yml` lines 8–45 — no `MASTER_KEY_PREVIOUS` today [HIGH, file-verified]
- `server.js` — all line references above, read directly [HIGH]
- `.planning/PROJECT.md`, `STATE.md`, `milestones/v1.6-phases/28-multi-team-membership/28-REVIEW.md` — UNDO root cause (WR-02/WR-03, deferred-item 28-02) [HIGH]
- Node.js official `sqlite.md` docs (pinned to main, introduced_in v22.5; changes log verified for 24.x) [HIGH]
- Local runtime check: `node -v` → v24.21.0 [HIGH]
