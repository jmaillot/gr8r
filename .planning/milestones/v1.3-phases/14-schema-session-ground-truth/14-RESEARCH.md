# Phase 14: Schema & Session Ground Truth - Research

**Researched:** 2026-10-26
**Domain:** Additive SQLite schema migration (`node:sqlite`), opaque-cookie session revocation API, server-rendered zero-dependency ES module client
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

Verbatim from `.planning/phases/14-schema-session-ground-truth/14-CONTEXT.md` `<decisions>`. These are
locked — research below serves them, it does not propose alternatives.

**Session metadata capture**

- **D-18:** Device label comes from the **raw User-Agent string**, stored per
  session at login in a `user_agent` column; the **client** renders the friendly
  label ('Mac · Chrome') from it using the existing `isMac`-style sniffing
  pattern (`src/core/utils.js:41`). The server stays dumb — no UA parsing
  server-side, zero-deps held, raw evidence preserved. — **Reversibility:**
  reversible — storing the raw string keeps every future parsing option open;
  only the client-side renderer would change.
- **D-19:** The **location column is dropped** — no `loc` data anywhere, no
  placeholder column. Geolocation is explicitly out of scope (REQUIREMENTS.md);
  the seed's 'San Francisco, US' entries die with the seed mirror. Sessions rows
  show device label + IP + last-seen only.
- **D-20:** **IP is captured once at login** via the existing `clientIp(req)`
  helper into an `ip` column — not updated per-request (a rotating IP won't
  churn the display; the hot path stays write-throttled).
- **D-21:** `last_seen_at` is an **epoch integer; the client renders relative
  time** ('Active now' / '2 hours ago') in the viewer's locale via the existing
  `t()` catalogue — no server-side date formatting, consistent with the i18n
  pattern (catalogues are client-side JSON, `t()` never escapes).

**last_seen_at freshness**

- **D-22:** **Throttled update:** `currentUser()` (`server.js:1125-1131`) writes
  `last_seen_at` only when the stored value is stale beyond a threshold
  (~60 s; exact constant is implementation discretion). One write per active
  minute max instead of a write per request on the hottest path.
- **D-23:** Throttle eligibility state lives in an **in-memory Map**
  (`token_hash → next-eligible-ts`), the same pattern as the existing `attempts`
  map (`server.js:1163`). A restart losing the map means one extra write after
  boot — harmless. No SQLite table for this.
- **D-24:** The throttled write touches **only `last_seen_at`** — login/logout
  paths keep their own writes; no other field is touched during request
  handling.
- **D-25:** Pre-existing sessions with `NULL last_seen_at` **fall back to
  `created_at` for display** — honest 'never seen since upgrade' semantics, no
  boot backfill (Pitfall 21 prohibits per-user generation at boot).

**API shape & 401 UX**

- **D-26:** **Three RESTful routes** on the existing `/api/auth/*` family:
  `GET /api/auth/sessions` (caller's rows), `DELETE /api/auth/sessions/:id`
  (one row), `DELETE /api/auth/sessions/others` (everything but the caller).
  Matches the flat noun-resource style of the existing auth endpoints
  (`server.js:1225-1315`).
- **D-27:** Per-row revoke uses **server-issued opaque short ids** (rowid or
  hash prefix) resolved server-side to the full `token_hash`; the token hash
  never leaves the server. — **Reversibility:** costly — the id scheme is baked
  into the client actions and the SESS-02/SESS-03 tests; changing it later
  means re-doing both test files and the client wiring.
- **D-28:** A revoked browser's next request hits the **401 handler: clear
  stale state, honest 'You have been signed out' toast, redirect to /login**
  — reuses the existing `signOut` action and the v1.2 honest-copy rule. No
  silent redirect, no interstitial page.
- **D-29:** The sessions list **refreshes on settings-tab mount and after each
  successful revoke** — no polling, no sockets. Settings-page staleness
  elsewhere is accepted.

**Legacy doc-field stripping**

- **D-30:** The `sessions`/`tfa` fields are stripped **in `normalizeDoc()`**
  (`server.js:759-810`): stop emitting them, drop them when present in stored
  docs — every doc load sanitizes and the next save persists the clean shape.
  One code path, converges on first load, zero extra migration machinery. The
  byte-identical second-boot test is unaffected because stripping converges on
  the first boot. — **Reversibility:** one-way — once client code stops
  reading these fields and the Phase 13 drift guard test pins their absence,
  re-adding them is a schema-contract change across server, client and seed.
- **D-31:** The additive migration lands the **full dormant column set now**:
  `sessions.label`, `sessions.ip`, `sessions.last_seen_at`,
  `sessions.user_agent` + the `login_challenges` table (D-01 shape:
  `challenge_token_hash` PK, `user_id`, `expires_at`, `attempts`) +
  `users.two_fa_enabled`, `users.two_fa_secret`, `users.two_fa_last_step`
  (replay guard, D-04). Phase 16 flips behavior onto the dormant columns; no
  second migration wave. Guarded-create / `ensureColumn` style
  (`server.js:134-137`); no backfill at boot (Pitfall 21).
- **D-32:** The Phase 13 drift guard is a **doc-shape unit test**: build
  `emptyDoc()` and `seedDoc()`, assert the JSON keys `sessions` and `tfa` are
  absent (build-locales.test.mjs-style); the byte-identical second-boot
  snapshot in `test/migration.test.mjs` proves no doc mutation churn.
- **D-33:** Client stubs referencing the doc fields — `A.revokeSession`
  (`src/actions/actions.js:2371`), `A.revokeAll` (:2377), `A.verify2fa`/`D().tfa`
  (:2409), the settings sessions/2FA renderer (`src/pages/settings.js:390-421`),
  the seed mirror (`src/data/seed.js:509-514`) — are **deleted or rewired to the
  new API in this same phase**. No dormant client references; the doc fields
  and their client echoes die together.

### the agent's Discretion

- The exact `last_seen_at` staleness threshold (D-22 band ~60 s) and the opaque
  id scheme details (D-27: rowid vs hash-prefix).
- The friendly UA-label rendering heuristics client-side (D-18), following the
  existing `isMac` sniff pattern.
- Test file placement following existing `test/` conventions; exact route
  handler ordering within the `/api/auth/*` family.
- Exact toast copy for D-28 within the honest-copy rule (catalogued EN+FR).

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

**Boundary restated from CONTEXT.md `<domain>`:** no password change (Phase 15),
no TOTP behavior (Phase 16 — this phase only lands the dormant columns), no
login second-factor flow (Phase 17).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESS-01 | User sees active sessions (device label, IP, last-seen, "this session" marker) from a real `GET /api/auth/sessions` backed by the `sessions` table | §Code Examples 5 (endpoint), §Code Examples 6 (client render); row payload derived from D-18/D-19/D-20/D-21; `srow()` + `SET_NAV` reuse verified |
| SESS-02 | "Disconnect all other sessions" — other cookie's next request is 401, caller stays signed in | §Code Examples 5 (keep-current SQL `token_hash != sha256(current cookie)`); Pitfall 9 verified in PITFALLS.md; §Validation Architecture test map |
| SESS-03 | Per-row revoke kills exactly that session | §Code Examples 5 (user-scoped id resolution — IDOR control); D-27 opaque-id scheme |
| AUTH-02 | Additive columns/tables only, byte-identical second boot, `sessions`/`tfa` removed from the workspace document | §Verified Schema & Code Contracts (the exact DDL surface); §Code Examples 4 (strip in BOTH doc paths — load-bearing finding); §Common Pitfalls P-A/P-B/P-D; migration fixture analysis in §Architecture Patterns |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Session metadata capture (label source, IP) | API / Backend | — | Captured at login from the HTTP request (`clientIp(req)`, `user-agent` header); the `sessions` table is the ground truth (D-18/D-20) |
| Device-label rendering ('Mac · Chrome') | Browser / Client | — | Explicitly locked (D-18): server stores the raw UA, client sniffs. No UA parsing server-side |
| Relative-time rendering ('2 hours ago') | Browser / Client | — | Locked (D-21); `ago()`/`formatRelativeTime()` already implement it via `Intl` + catalogue |
| `last_seen_at` freshness write | API / Backend | — | Throttled UPDATE in `currentUser()` (D-22/D-24) — the identity path owns the write |
| Revocation (revoke-one, revoke-others) | API / Backend | — | Pure SQL on `sessions`; the cookie is opaque + DB-backed so deleting a row kills the session (Pitfall 11 strength) |
| 401 → signed-out UX for a revoked browser | Browser / Client | — | Reuses `A.signOut` + the `projects:save-error` 401 branch (D-28) |
| Sessions list UI (mount refresh, post-revoke refresh) | Browser / Client | — | No polling, no sockets (D-29); server stays a pull API |
| Doc-field stripping (`sessions`/`tfa`) | API / Backend | — | Server-side sanitization only; the client stops emitting the fields, so both the read and write doc paths must drop them |
| Schema migration (new columns + `login_challenges`) | Database / Storage | API / Backend (boot) | `openDb()` runs `SCHEMA` + `ensureColumn`; no new migration module |
| Byte-identical second-boot guarantee | Database / Storage | — | Proven by the existing `test/migration.test.mjs` snapshot harness against the legacy fixture |
| 2FA columns + replay guard | Database / Storage | — | Dormant in this phase (Phase 16 flips behavior); D-04 pins the column to `users` because it guards both the login and settings verify paths |
</phase_requirements>

## Summary

Phase 14 is a **single coherent migration plus a three-endpoint revocation primitive**, entirely inside the
existing codebase with **zero new packages** (the zero-runtime-dependency decision is held — D-18 explicitly
forbids a UA-parser library, so the UA render is hand-rolled client-side on the existing `isMac` precedent).
There is no external technology to research; every claim below was verified by direct file reads in this
session. The useful output of this phase's research is not library selection but the **exact mechanical
surface**: which file must change for each locked decision, what the pre-existing code already gives you, and
the four places where a naive reading of the decisions produces a bug that the tests will not catch.

The single most load-bearing finding, discovered by reading the doc path rather than trusting the decision
text: **D-30's "strip in `normalizeDoc()`" is necessary but not sufficient.** `normalizeDoc()` (server.js:272)
is only on the *read* path (`docForClient`, :561-566). The *write* path is `docFromClient()`
(server.js:568-601), which never calls `normalizeDoc()` and instead carries its own explicit
`delete next.data.plan; delete next.data.invoices;` list (:596-598) — the `plan`/`invoices` removal is the
direct precedent. Stripping only in `normalizeDoc()` leaves the fields in the *stored* document, so a save
from any client whose stored copy still has them re-persists them forever. Both call sites need the
`delete`. §Common Pitfalls P-A and §Code Examples 4 spell this out.

Second: **the existing legacy migration fixture is already the correct AUTH-02 fixture — no new fixture is
needed.** `test/helpers/legacy-fixture.mjs` declares a pre-tenancy `sessions` table with exactly four columns
(:31-36) and a `users` table with neither `locale` nor any 2FA column (:22-30), and its stored document
carries `sessions: []` and `tfa: false` (:123, :125). Booting the real server against that file therefore
exercises *every* path this phase adds: `ensureColumn` for all seven new columns (`sessions` and `users`
already exist, so `CREATE TABLE` is a no-op for them), `CREATE TABLE IF NOT EXISTS login_challenges` for the
new table, and the doc-strip for a stored document that genuinely still has the fields. The second boot then
proves idempotency for free. The extension is ~10 lines of assertions mirroring the existing
`legacyColumns` capture.

Third: **the strip is safe for the byte-identical guarantee by construction**, because `docForClient()`
operates on `JSON.parse(JSON.stringify(doc || {}))` (server.js:562) — a copy. Stripping never mutates the
stored `workspaces.doc` string, so the snapshot's `doc: row.doc` is byte-identical across boots until a
client writes. That is why D-30's reasoning holds, and it also tells you exactly what the test *cannot*
assert (a clean stored doc) without performing a save first — the `plan`/`invoices` test at
`migration.test.mjs:147-163` is the template for the write-side assertion.

Fourth: **two mechanical gates will fail a careless implementation.** `test/error-codes.test.mjs` enforces
*bilateral* parity: every `fail(res, N, 'code', …)` literal in server.js must have a non-empty `err.<code>`
in **both** `en.json` and `fr.json`, **and** every catalogued `err.*` code that is not emitted by server.js
must be present in a hardcoded `CLIENT_ONLY_ERR_CODES` allowlist. Adding a client-composed toast key for D-28
without updating that array breaks the suite. `npm run build` runs `scripts/i18n-scan.mjs` as `prebuild` and
rejects uncatalogued UI literals.

**Primary recommendation:** implement D-31's schema additions in `openDb()` using the existing
`ensureColumn` pattern (add the columns to `SCHEMA` for fresh installs *and* `ensureColumn` for existing DBs
— the `users.locale` precedent does both), add the three endpoints beside the existing auth family with
keep-current scoping, strip `sessions`/`tfa` in **both** doc paths, rewire the five client stub sites, and
extend `test/migration.test.mjs` against the existing legacy fixture rather than authoring a new one.

## Standard Stack

**No new packages.** The phase installs nothing. Zero runtime dependencies is a PROJECT.md core decision and
is held here explicitly by D-18 (no UA-parser library) and by the fact that every needed primitive already
exists in-repo.

### Existing primitives this phase consumes (all verified present)

| Primitive | Location | Role in Phase 14 |
|-----------|----------|------------------|
| `node:sqlite` `DatabaseSync` | `server.js:142` (`new DatabaseSync(DB_PATH)`) | The only DB layer; schema + migration |
| `ensureColumn(conn, table, name, def)` | `server.js:134-137` | The additive-migration primitive for all 7 new columns |
| `SCHEMA` constant (`db.exec(SCHEMA)`) | `server.js:147` | Fresh-install DDL — new columns/tables land here too |
| `parseCookies` / `COOKIE` | `server.js:1095`, used at :1123, :1256 | Current-session identity for keep-current revocation |
| `sha256(token)` hashing of opaque cookies | `server.js:162`, :1130, :1245 | The stored `token_hash`; never returned to the client (D-27) |
| `clientIp(req)` | `server.js:1083-1086` | D-20 login-time IP capture (unchanged) |
| `sameOrigin(req)` | `server.js:1088-1093` | CSRF guard for both new DELETE routes |
| `tooMany` / `attempts` Map | `server.js:1161-1173` | The in-memory-map template D-23 copies for the throttle eligibility map |
| `fail(res, status, 'code', msg)` | e.g. `server.js:1137` | Error envelope contract (must stay `error`+`code`, flat) |
| `api.call()` client boundary | `src/core/api.js:39-64` | Every new client-side call; returns `{ok, status, data, error}` |
| `A.go` + `refreshMembers()` | `src/actions/actions.js:199-210`, :1766-1793 | The D-29 "fetch on tab mount, re-render after" template |
| `srow(t, d, ctl)` | `src/pages/settings.js:78-80` | Existing row layout for the sessions table |
| `isMac` | `src/core/utils.js:41` | D-18 UA-sniff pattern |
| `ago(ts)` → `formatRelativeTime` | `src/core/utils.js:91-92`, `src/core/i18n.js:426-438` | D-21 relative-time rendering (`common.justNow` for <1 min) |
| `projects:save-error` 401 branch | `src/main.js:70-78` | D-28 revoked-browser redirect path |
| `A.signOut` | `src/actions/actions.js:2081-2101` | State teardown for D-28 |
| `node --test` harness | `test/helpers/server.mjs` | Real-server suites; never mocks SQLite or HTTP |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled client-side UA sniff | `ua-parser-js` / `useragent` npm package | Rejected — violates the zero-runtime-dependency core decision; D-18 locks raw-string storage so a library can be added later without a data migration |
| A dedicated `migrate()` function | More `ensureColumn` calls in `openDb()` | Rejected — the existing pattern already works and is what the byte-identical test was built around; a new migration function would need its own idempotency proof |
| Polling / websockets for session freshness | Pull on tab mount + after revoke (D-29) | Locked — D-29; settings-page staleness elsewhere is accepted |
| Server-side device labels | Client-side render from raw UA (D-18) | Locked — reversibility (raw evidence preserved) |
| `sessions.pending_tfa` column | Separate `login_challenges` table (D-01) | Locked by Phase 13: the `sessions` table stays signed-in-or-nothing so the revocation primitive and every existing query stay untouched |

**Installation:** none.

## Package Legitimacy Audit

**Not applicable — this phase installs zero external packages.**

The phase's entire implementation surface is server.js (schema + 3 endpoints), `src/pages/settings.js`,
`src/actions/actions.js`, `src/data/seed.js`, `src/core/api.js`, two locale JSON files, and test files. No
`package.json` change, no `node_modules` change, no vendored file. (The vendored `qrcode.js` belongs to
Phase 16 — D-15 — and is out of scope here.)

No `package-legitimacy check` run was performed because there is no candidate package to check. The planner
should keep it that way: any temptation to add a UA parser, a QR renderer, or a TOTP helper in this phase
is a scope leak into Phase 16 *and* a zero-dep violation.

## Architecture Patterns

### System Architecture Diagram

```
                        BROWSER (client-rendered, zero deps)
  ┌─────────────────────────────────────────────────────────────────────────┐
  │  settings › Sessions tab                                                │
  │    mount ──A.go(sec=sessions)──► refreshSessions() ──┐                  │
  │    row "sign out" ──A.revokeSession──┐               │                  │
  │    "Sign out of all others" ──A.revokeAll──┐          │                  │
  │                                            │          │                  │
  │              src/core/api.js  call()  (fetch, credentials: same-origin) │
  └──────────────┬─────────────────────────────┼──────────┼──────────────────┘
                 │  GET /api/auth/sessions     │ DELETE   │
                 │  (row: id, user_agent, ip,  │ /:id     │ /others
                 │   created_at, last_seen_at, │          │
                 │   current)                  ▼          ▼
  ┌──────────────────────────────────────────────────────────────────────────┐
  │  server.js  (single process, node:sqlite)                                │
  │                                                                          │
  │  handleApi ─► sameOrigin(req) ─► requireUser() ─► currentUser(req)       │
  │                                              │              │            │
  │                                              │   SELECT u.* FROM sessions│
  │                                              │   JOIN users WHERE        │
  │                                              │   token_hash=sha256(cookie)
  │                                              │   AND expires_at > now()  │
  │                                              ▼              ▼            │
  │                                     [users]      D-22 throttled write:   │
  │                                     +2FA cols   UPDATE sessions SET       │
  │  openDb() at boot:                  │                   last_seen_at=?  │
  │    db.exec(SCHEMA)  ──► creates     │                   WHERE token_hash=?
  │    ensureColumn() x7 ──► adds       │                   (only when stale │
  │    [sessions] +4 cols               │                    past the band)  │
  │    [login_challenges] (new table)   ▼                                    │
  │                                    [sessions]                             │
  │                                     +label, +ip,                          │
  │                                     +last_seen_at, +user_agent            │
  │  doc paths:                                                                │
  │    read  GET /api/workspaces/:slug ─► docForClient ─► normalizeDoc ─┐      │
  │    write PUT /api/workspaces/:slug ─► docFromClient ────────────────┼──► deletes
  │    (server.js:561-566)                                              │    sessions/tfa
  │    (server.js:568-601)                                              │    from the copy
  └──────────────────────────────────────────────────────────────────────┴───►
                                              │
                          a revoked browser's next request
                          falls into requireUser → 401 signInRequired
                          ─► api.js call() ─► main.js projects:save-error 401
                          ─► A.signOut (clear state) ─► honest toast ─► /login
```

### Recommended Project Structure

No new files are required for the server half; the phase is a deliberate
**widening of existing files**, matching how every prior auth phase landed.

```
server.js                      # SCHEMA DDL + openDb() ensureColumn calls (:85-156)
                               # 3 new routes inside handleApi() beside :1225-1315
                               # 2 strip sites: normalizeDoc (:272-281), docFromClient (:568-601)
                               # 3 session inserts gain ip/user_agent/last_seen_at (:1244, :1307, :1714)
src/core/api.js                # + sessions(), revokeSession(id), revokeAllSessions()
src/actions/actions.js         # A.go hook (:199-210), A.revokeSession/A.revokeAll rewired (:2371-2390),
                               # A.verify2fa/A.disable2fa deleted (:2400-2427), + refreshSessions()
src/pages/settings.js          # 'sessions' case rewired (:390-403); '2fa' case (:404-422) retired/placeholder
src/data/seed.js               # sessions[] + tfa removed (:509-514)
src/locales/en.json            # new/renamed keys (i18n-scan gate)
src/locales/fr.json            # same keys, French
test/migration.test.mjs        # EXTENDED (existing harness + fixture reused)
test/sessions.test.mjs         # NEW (naming at planner discretion) — SESS-01/02/03
```

### Pattern 1: Additive column migration — DDL *and* guard

The established convention is to do **both**, and the `users.locale` column is the live precedent
(declared in the DDL at `server.js:93` *and* guarded at :153). Fresh installs get the column from
`CREATE TABLE`; existing installs get it from `ensureColumn`; a second boot writes nothing because
`pragma table_info` already reports the column. Source: `server.js:134-156` (read this session).

```js
// server.js — SCHEMA, inside the template literal (:85-101 area)
create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);
```

**Verified verbatim (server.js:95-101) — the table D-31 extends, and the only reason a new index may not be needed:**
```sql
create table if not exists sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);
create index if not exists sessions_expiry on sessions(expires_at);
```

Note the `users` DDL today has no 2FA columns at all — verified verbatim (`server.js:85-94`):
```sql
create table if not exists users (
  id            text primary key,
  email         text not null unique collate nocase,
  name          text not null,
  password_hash text not null,
  member_id     text,
  created_at    integer not null,
  last_login_at integer,
  locale        text
);
```

The `ensureColumn` primitive, verbatim (`server.js:134-137`):
```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
```

`def` is free-form column SQL, so `ensureColumn(db, 'users', 'two_fa_enabled', 'integer')` and
`ensureColumn(db, 'users', 'two_fa_secret', 'text')` are legal; `integer not null default 0` is also
legal SQLite for `ALTER TABLE ADD COLUMN` (a constant default does not rewrite existing rows). See
§Open Questions 1 for the nullability call.

### Pattern 2: The existing legacy fixture is the AUTH-02 fixture — do not author a new one

`test/helpers/legacy-fixture.mjs` already declares the pre-phase-14 shape. Verified verbatim
(`legacy-fixture.mjs:22-36`):
```sql
create table users (
  id            text primary key,
  email         text not null unique collate nocase,
  name          text not null,
  password_hash text not null,
  member_id     text,
  created_at    integer not null,
  last_login_at integer
);
create table sessions (
  token_hash text primary key,
  user_id    text not null references users(id) on delete cascade,
  created_at integer not null,
  expires_at integer not null
);
```

Consequences the planner can rely on:

| Fact | Consequence |
|------|-------------|
| `users` exists without `locale` and without 2FA columns | First boot exercises `ensureColumn` for all four new `users` columns (and for `locale`, already) |
| `sessions` exists with exactly 4 columns | First boot exercises `ensureColumn` for `label`, `ip`, `last_seen_at`, `user_agent` — `CREATE TABLE IF NOT EXISTS` is a no-op |
| `login_challenges` is absent | First boot exercises the new `CREATE TABLE IF NOT EXISTS login_challenges` |
| Stored doc carries `sessions: []` and `tfa: false` (`legacy-fixture.mjs:123`, `:125`) | The doc-strip is exercised against a document that genuinely still has the fields |
| Second boot: every `ensureColumn` guard fails, every `IF NOT EXISTS` is a no-op | Byte-identical snapshot with zero new machinery |

**⚠️ Do not "clean" the fixture.** Removing `sessions: []` / `tfa: false` from `legacyDoc()` would make the
drift-guard test prove nothing — they are the regression signal. The existing test already captures
`legacyColumns` for `workspaces`/`memberships`/`invites` before boot (`migration.test.mjs:29-39`) and asserts
absence at :52-56; extend that capture to `users` and `sessions` and mirror the assertions.

### Pattern 3: Every doc field removal needs two delete sites, not one

Verified verbatim — the read path (`server.js:561-566`):
```js
function docForClient(doc, ws, membership) {
  const out = normalizeDoc(JSON.parse(JSON.stringify(doc || {})), { name: ws.name, slug: ws.slug, color: ws.color || '#1D1C1A' });
  normalizeProjects(out);
  syncProfiles(out, ws.id);
  return membership ? redactDoc(out, membership.member_id) : out;
}
```

Verified verbatim — the write path (`server.js:568-601`), note it **never calls `normalizeDoc()`**:
```js
function docFromClient(incoming, stored, ws, role, membership) {
  const next = mergeClientDoc(incoming, stored, membership);
  delete next.data.workspaces;
  next.data.me = null;
  next.data.ws = { name: ws.name, url: ws.slug, c: ws.color || '#1D1C1A', brand: true };
  // …membership handling…
  // The plan and invoices fields are gone; a stale client's copy must never resurrect them.
  delete next.data.plan;
  delete next.data.invoices;
  normalizeProjects(next);
  return next;
}
```

`normalizeDoc()` verbatim (`server.js:272-281`) — the strip goes beside `delete out.data.workspaces`:
```js
function normalizeDoc(doc, meta) {
  const out = doc && typeof doc === 'object' ? doc : {};
  out.data = out.data && typeof out.data === 'object' ? out.data : {};
  out.data.savedViews = Array.isArray(out.data.savedViews) ? out.data.savedViews : [];
  out.data.recentSearches = Array.isArray(out.data.recentSearches) ? out.data.recentSearches : [];
  out.data.ws = { name: meta.name, url: meta.slug, c: meta.color, brand: true };
  out.data.me = null;
  delete out.data.workspaces;
  return out;
}
```

`mergeClientDoc(incoming, stored, membership)` (`server.js:472`) merges the client payload over the
*stored* doc, so a field the client no longer sends survives from storage unless `docFromClient` deletes it.
That is precisely why `plan`/`invoices` needed the write-side deletes, and it is the same trap for
`sessions`/`tfa`. Also remove the literals from `emptyDoc()` (`server.js:774-775`, verbatim `sessions: [],`
/ `tfa: false,`) and from the seed (`src/data/seed.js:509-514`).

### Pattern 4: Identity is re-derived per request — never memoize it

Verified verbatim (`server.js:1122-1141`):
```js
function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db
    .prepare(
      `select u.* from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`,
    )
    .get(sha256(token), now());
  return row || null;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    fail(res, 401, 'signInRequired', 'Sign in to continue');
    return null;
  }
  return user;
}
```

This is the whole reason revocation is a **delete, not an expiry**: a revoked row no longer matches the
join, so the very next request 401s with no cache to invalidate. D-22's throttled `last_seen_at` write must
be bolted onto this function *without* introducing any memoization (Pitfall 10) and *without* touching other
columns (D-24). The write belongs here because `currentUser()` already knows the `token_hash` and is on
every protected request.

### Pattern 5: Client "fetch on mount, re-render after"

Verified verbatim — the mount hook (`src/actions/actions.js:199-210`):
```js
A.go = el => {
  const r = el.dataset.r;
  const p = {};
  if (el.dataset.id) p.id = el.dataset.id;
  if (el.dataset.tab) p.tab = el.dataset.tab;
  else if (r === 'project') p.tab = S.prefs.defaultTab || 'board';
  if (el.dataset.sec) p.sec = el.dataset.sec;
  S.ui.palette = null;
  const tabOnly = r === 'project' && S.ui.route === 'project' && S.ui.params.id === p.id;
  go(r, p, { tab: tabOnly });
  if (r === 'members' && api.enabled) refreshMembers();
};
```

`A.go` already receives `data-sec` and sets `p.sec`, and the settings nav button already emits
`data-sec="${k}"` (`src/pages/settings.js:101`), so D-29's mount refresh is a one-line extension of this
hook: `if (r === 'settings' && p.sec === 'sessions' && api.enabled) refreshSessions();`. The existing
`refreshMembers()` (`actions.js:1766-1793`) is the body template — `api.X()` → store into `S.ui` →
`render()`.

### Anti-Patterns to Avoid

- **Stripping only in `normalizeDoc()`.** The stored doc keeps the fields forever and the drift guard
  passes while the bytes never change. (P-A)
- **`DELETE FROM sessions WHERE user_id = ?` for "sign out others".** Signs the caller out too — the CLI
  precedent at `server.js:2160` (`--set-password`) is exactly that one-liner and it is *wrong* here because
  it has no live request context. Pitfall 9.
- **Returning `token_hash` in the GET payload.** D-27 says the hash never leaves the server; an
  IDOR-capable client with a hash could target rows directly. (P-G)
- **A new `migrate2Fa()` function with backfill.** Writing recovery codes or defaults per user at boot
  breaks the byte-identical guarantee. Pitfall 21.
- **Copy-pasting column names from `PITFALLS.md`.** `PITFALLS.md:294` still lists the pre-decision names
  `totp_secret_enc`, `totp_last_step`, `tfa_enabled_at`, `recovery_codes`, `sessions.pending_tfa`. Those are
  superseded by D-31's names. (P-C)
- **Adding a UA parser to `package.json`.** Zero-dep violation; D-18 locks the raw-string approach.
- **`tfa_enabled` NOT NULL with a per-row write at boot.** Use a constant default (SQLite no-rewrite path)
  or nullable; never a boot UPDATE.
- **Polling the sessions list.** D-29 is explicit: mount + post-revoke only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relative time rendering ('2 hours ago') | A new formatter in settings.js | `ago(ts)` → `formatRelativeTime()` (`src/core/utils.js:91`, `src/core/i18n.js:426-438`) | Already locale-aware via `Intl.RelativeTimeFormat` + catalogue (`common.justNow` for <1 min); rebuilding it breaks the v1.2 date tests |
| Device/platform sniffing | A new regex set | The `isMac` pattern (`src/core/utils.js:41`), extended to a sibling helper | D-18 explicitly names this precedent; keeps the client-side-only rule |
| Session metadata storage | A new table or a new JSON blob | The existing `sessions` table + 4 `ensureColumn` calls | The table is already the revocation source of truth (D-02 purity) |
| Throttle/freshness bookkeeping | A SQLite table | An in-memory `Map` copying `attempts` (`server.js:1161-1173`) | D-23; a restart losing it costs one extra write |
| CSRF protection on the new DELETEs | A custom token check | `sameOrigin(req)` (`server.js:1088-1093`) | Established guard; Pitfall 22's checklist names revoke-others explicitly |
| Migration idempotency | A version table | `pragma table_info` + `ensureColumn` | The entire byte-identical guarantee is built on this |
| Byte-identical second boot | A new test file | Extend `test/migration.test.mjs` (`snapshot()` at :166-186, test at :188-196) + the legacy fixture | The harness already reboots against the same DB and deep-equals the snapshot |
| i18n for new strings | Hardcoded literals | `src/locales/en.json` + `fr.json` + the `t()` call | `prebuild` runs `scripts/i18n-scan.mjs`; uncatalogued literals fail the build |
| QR / TOTP / password change | Anything 2FA or password-related | Nothing — Phase 15/16/17 own those | Only the *dormant columns* land here; behavior is out of scope |

**Key insight:** this phase's difficulty is not inventing machinery but *not introducing any* — every
capability is a reuse of an existing primitive. The risks are all "added something new where a pattern
already exists" (a migration function, a polling loop, a second doc-strip path, a new formatter).

## Runtime State Inventory

This phase is a schema migration, so the runtime-state audit is mandatory. Question: *after every file in
the repo is updated, what runtime systems still carry the old shape?*

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | The live SQLite DB (`DATA_DIR/projects.db`): `sessions` (4 cols → 8), `users` (no 2FA cols → +3), new `login_challenges` table; and every stored `workspaces.doc` JSON that carries `sessions: []` / `tfa: false` | **Schema:** automatic on boot via `SCHEMA` + `ensureColumn` (additive, no rewrite). **Doc fields:** stripped from the *served* copy on first read, persisted clean on the next save — no data migration, no backfill. Covered by AUTH-02 + the extended second-boot test |
| Live service config | None. No external services hold auth state; the deployment is a single self-hosted process. No n8n/Datadog/Cloudflare configuration references sessions | None |
| OS-registered state | None. No cron entries, launchd plists, systemd units or scheduled tasks reference the schema or the doc fields | None |
| Secrets / env vars | No new env vars. D-26/D-27 introduce no configuration; `SESSION_DAYS` continues to govern session lifetime. (DEPLOY.md is not touched by this phase — see §Assumptions Log A1) | None. DEPLOY.md stays unchanged |
| Build artifacts | `seed.json` is a generated artifact (`npm run seed:json` → `scripts/export-seed.mjs`) and is **not committed** — a grep for `"tfa"` and `sessions:` across all `*.json` in the repo returned zero matches, so the only source of the seed fields is `src/data/seed.js:509-514`. `dist/` is rebuilt by `npm run build` | None beyond editing `src/data/seed.js`; regenerate only if the build pipeline requires a fresh `seed.json` |
| Test fixtures | `test/helpers/legacy-fixture.mjs` `LEGACY_SCHEMA` (`:22-36`) and `legacyDoc()` (`:123`, `:125`) intentionally encode the pre-phase-14 shape | **Keep as-is** — this is the AUTH-02 regression signal. Only the assertions in `test/migration.test.mjs` change |

**Nothing found in "Live service config", "OS-registered state", "Secrets/env vars" — verified explicitly,
not left blank.**

## Common Pitfalls

### P-A: Stripping only in `normalizeDoc()` — the stored document keeps the fields forever
**What goes wrong:** `normalizeDoc()` runs only on the *read* path (`docForClient`, `server.js:562`). The
*write* path (`docFromClient`, :568-601) never calls it and instead deletes retired fields explicitly
(`plan`, `invoices` at :597-598). Stripping only in `normalizeDoc()` means the served doc is clean but
`workspaces.doc` still contains `"sessions":[],"tfa":false` — and `mergeClientDoc(incoming, stored)`
resurrects stored fields the client no longer sends.
**Why it happens:** D-30 names one function; the write path has its own parallel delete list that the
decision text doesn't mention.
**How to avoid:** Add `delete out.data.sessions; delete out.data.tfa;` in `normalizeDoc()` **and**
`delete next.data.sessions; delete next.data.tfa;` beside `delete next.data.plan;` in `docFromClient()`.
**Warning signs:** A test that only asserts the served doc is clean; the stored `workspaces.doc` byte
string still containing `"tfa"`; the drift guard passing while the bytes never change.

### P-B: Adding columns to only one of the two migration surfaces
**What goes wrong:** Adding a column to `ensureColumn` calls only means a *fresh* install never has the
column (the `CREATE TABLE` DDL wins on a new DB) — or adding it to the DDL only means an *existing* install
never gets it (`CREATE TABLE IF NOT EXISTS` is a no-op). Either half alone silently breaks one of the two
populations, and the migration test only covers whichever half the fixture exercises.
**Why it happens:** The `users.locale` precedent (`server.js:93` + `:153`) does both, and it's easy to see
only one line of it.
**How to avoid:** For each of the 7 new columns: add to the `SCHEMA` template literal **and** add an
`ensureColumn` call. The new `login_challenges` table needs only the `CREATE TABLE IF NOT EXISTS` entry.
**Warning signs:** The legacy-fixture boot succeeds but a from-scratch `mkdtemp` boot is missing columns —
or vice versa. Assert post-boot `pragma table_info` for all four tables.

### P-C: Copying pre-decision column names from `PITFALLS.md`
**What goes wrong:** `PITFALLS.md:294` still names `totp_secret_enc`, `totp_last_step`, `tfa_enabled_at`,
`recovery_codes`, `sessions.pending_tfa` — names from before Phase 13 pinned the contracts. Using them
creates columns no later phase reads.
**Why it happens:** The pitfalls doc is cited in CONTEXT.md and predates `13-DECISIONS.md`.
**How to avoid:** The binding names are D-31's, verbatim: `sessions.label`, `sessions.ip`,
`sessions.last_seen_at`, `sessions.user_agent`; `login_challenges` with `challenge_token_hash` (PK),
`user_id`, `expires_at`, `attempts`; `users.two_fa_enabled`, `users.two_fa_secret`,
`users.two_fa_last_step`. Cite D-31/D-01/D-04, not the pitfalls doc.
**Warning signs:** Phase 16 can't find the column it needs; a `sessions.pending_tfa` column appearing,
which would also violate D-01's sessions-table purity.

### P-D: The two i18n/error-code gates
**What goes wrong:** `test/error-codes.test.mjs` enforces *bilateral* parity. Forward: every
`fail(res, N, 'code', …)` literal in server.js must have a non-empty `err.<code>` in **both** `en.json` and
`fr.json` (:19-29). Reverse: every catalogued `err.*` code not emitted by server.js must appear in the
hardcoded `CLIENT_ONLY_ERR_CODES` array (:192-259). Separately, `prebuild` runs `scripts/i18n-scan.mjs` and
rejects uncatalogued UI literals.
**Why it happens:** D-28 needs new toast copy, and adding a client-composed key without the allowlist entry
fails the reverse-parity test; adding a server code without both catalogue entries fails the forward test.
**How to avoid:** Every new key lands in both locale files; every client-only key is appended to
`CLIENT_ONLY_ERR_CODES`; run `npm test` + `npm run build` before calling it done.
**Warning signs:** `npm test` failing on `reverse parity:` or `missing err.<code>`; red `prebuild`.

### P-E: The revoked browser's 401 only reaches the login screen if the call goes through `api.js`
**What goes wrong:** The `projects:save-error` 401 branch (`src/main.js:70-78`) is dispatched only where the
caller re-dispatches it. A revoked browser doing *anything* new — the sessions fetch, a revoke click — must
route its 401 through the same teardown, or the user sees a hung tab, a raw error toast, or nothing at
all.
**Why it happens:** `IN.langSel` (`actions.js:2235-2237`) dispatches `projects:save-error` manually for its own
401; that dispatch is per-call-site, not automatic in `api.js call()`.
**How to avoid:** Either (a) extend the 401 branch in `main.js` and dispatch `projects:save-error` from each
new action, or (b) route the revoked-browser teardown through `A.signOut` (D-28 explicitly says "reuses the
existing `signOut` action"). Prefer calling `A.signOut()` directly with an honest toast — it already clears
`api.revision`, `clearLocalCache()`, `S.ui.conflict`, and resets `S.ui.auth = 'login'`.
**Warning signs:** A revoked tab where the next click silently no-ops; a 401 toast that doesn't redirect.

### P-F: Per-row revoke not scoped to the caller — IDOR
**What goes wrong:** Resolving the opaque id to a `token_hash` and deleting it without a `user_id`
predicate lets any signed-in user delete any session row they can guess.
**How to avoid:** `DELETE FROM sessions WHERE user_id = ? AND <id predicate>` — the caller's `user.id` is
always bound from `requireUser()`, never from the path.
**Warning signs:** A `WHERE token_hash = ?` clause with no `user_id`.

### P-G: Returning `token_hash` in the GET payload
**What goes wrong:** Leaking the hash enables D-27's target to be crafted and defeats the "the token hash
never leaves the server" contract.
**How to avoid:** The GET payload carries only the opaque id, `user_agent`, `ip`, `created_at`,
`last_seen_at`, `current`. No `token_hash`.
**Warning signs:** Any `token_hash` in a `json(res, …)` body.

### P-H: Self-DoS — "sign out others" revokes the caller (Pitfall 9)
**What goes wrong:** `DELETE FROM sessions WHERE user_id = ?` (the `--set-password` CLI form at
`server.js:2160`) removes the caller's own row too. The user is instantly signed out and thinks they were
kicked off their account.
**How to avoid:** `const token = parseCookies(req.headers.cookie)[COOKIE];` →
`delete from sessions where user_id = ? and token_hash != ?` bound with `user.id` and `sha256(token)`.
Test both halves: the second cookie is dead *and* the caller is still alive.
**Warning signs:** A test that only asserts the other session is gone.

### P-I: Returning a stale session list after revocation (Pitfall 10)
**What goes wrong:** Deleting rows then responding with the list captured *before* the delete shows a
session the user believes is alive.
**How to avoid:** Delete first, then re-select for the response (or return the remaining count and let the
client re-fetch — D-29 refreshes after each successful revoke anyway).
**Warning signs:** No `SELECT` after the `DELETE` in the handler.

### P-J: The `last_seen_at` write on the hottest path
**What goes wrong:** Unthrottled, every request on every active session writes a row — including requests
that never need it.
**How to avoid:** D-22/D-23/D-24 as locked: eligibility map keyed by `token_hash`, single-column UPDATE,
threshold ~60 s, and the login/logout paths keep their own writes untouched. Add bounded-map cleanup
mirroring `attempts.size > 5000` (`server.js:1168`) so the map cannot grow unboundedly across sessions.
**Warning signs:** `grep 'update sessions set'` finding more than one occurrence; a write inside the
login/verify handler.

### P-K: New DELETE routes missing the `sameOrigin` guard
**What goes wrong:** A cross-site DELETE revokes sessions CSRF-ably. Pitfall 22's new-mutation checklist
names revoke-others explicitly, and the guard must run *before* any body read or throttle (the login/signup
precedent at `server.js:1228`, `:1286`).
**How to avoid:** `if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');`
as the first line of both new DELETE handlers.
**Warning signs:** A `DELETE` handler whose first statement is not `sameOrigin`.

### P-L: Forgetting the third session insert
**What goes wrong:** `ip` and `user_agent` are captured "at login" (D-20), but there are **three** insert
sites — login (`server.js:1244`), signup (`:1307`), and invite-accept (`:1714`). Missing the third leaves
invite-created sessions with NULL metadata, which reads as "unknown device" in the settings UI.
**How to avoid:** Update all three with identical column lists. All three share the identical statement
`insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)`.
**Warning signs:** `grep 'insert into sessions'` returning rows with different column lists.

## Code Examples

All skeletons below reuse verified in-repo shapes; every quoted snippet is verbatim from a file read this
session.

### 1. Schema + `openDb()` migration (D-31)

```js
// server.js SCHEMA — extend the existing `create table if not exists sessions (...)` (:95-101)
// and `create table if not exists users (...)` (:85-94) in place, then add the new table:
create table if not exists login_challenges (
  challenge_token_hash text primary key,
  user_id              text not null references users(id) on delete cascade,
  expires_at           integer not null,
  attempts             integer not null default 0
);
create index if not exists login_challenges_expiry on login_challenges(expires_at);
```

```js
// server.js openDb() — beside the existing ensureColumn block (:148-154), same style
ensureColumn(db, 'sessions', 'label', 'text');
ensureColumn(db, 'sessions', 'ip', 'text');
ensureColumn(db, 'sessions', 'last_seen_at', 'integer');
ensureColumn(db, 'sessions', 'user_agent', 'text');
ensureColumn(db, 'users', 'two_fa_enabled', 'integer');
ensureColumn(db, 'users', 'two_fa_secret', 'text');
ensureColumn(db, 'users', 'two_fa_last_step', 'integer');
```

No backfill, no `UPDATE`, no per-user generation (D-31 + Pitfall 21). The columns land dormant and are
first written by Phase 16 (users) / never written at all in this phase (`label` — see §Open Questions 2).

### 2. Login-time metadata capture (D-18, D-20) — all three insert sites

```js
// server.js:1244 (login), :1307 (signup), :1714 (invite accept) — identical shape
const ua = String(req.headers['user-agent'] || '');
const ip = clientIp(req);
db.prepare(
  `insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)`,
).run(sha256(token), row.id, t, t + SESSION_DAYS * 86400 * 1000, ip, ua, t);
```

`last_seen_at` set to `created_at` at insert is honest ("active now" for a just-logged-in session) and
removes the need to rely on the D-25 fallback for new rows. `label` is deliberately not written (D-18
renders it client-side).

### 3. Throttled `last_seen_at` write (D-22, D-23, D-24)

```js
// server.js — beside the `attempts` map (:1161-1162)
const lastSeenNext = new Map(); // token_hash -> next-eligible epoch ms
const LAST_SEEN_BAND = 60 * 1000; // D-22: exact constant is implementation discretion

function touchLastSeen(tokenHash, storedLastSeen, nowTs) {
  const next = lastSeenNext.get(tokenHash);
  if (next && nowTs < next) return;
  if (storedLastSeen && nowTs - storedLastSeen < LAST_SEEN_BAND) {
    lastSeenNext.set(tokenHash, storedLastSeen + LAST_SEEN_BAND);
    return;
  }
  db.prepare('update sessions set last_seen_at = ? where token_hash = ?').run(nowTs, tokenHash);
  lastSeenNext.set(tokenHash, nowTs + LAST_SEEN_BAND);
  if (lastSeenNext.size > 5000) for (const [k, v] of lastSeenNext) if (nowTs > v) lastSeenNext.delete(k);
}
```

Bolt onto `currentUser()` after the join succeeds — the only place that already holds both the `token_hash`
and a valid `user` on every protected request. `currentUser()` currently returns `u.*` only, so the query
must additionally select `s.last_seen_at` (e.g. `select u.*, s.last_seen_at from sessions s join users u …`)
to know whether the write is eligible. Do **not** memoize the result (Pitfall 10), and do **not** write any
other column (D-24).

### 4. Doc-field strip — both paths (D-30)

```js
// server.js:272-281 normalizeDoc() — beside `delete out.data.workspaces;`
  delete out.data.workspaces;
  delete out.data.sessions;   // D-30: stop emitting, drop when present in stored docs
  delete out.data.tfa;
  return out;

// server.js:568-601 docFromClient() — beside `delete next.data.plan;` (:597-598)
  // The plan and invoices fields are gone; a stale client's copy must never resurrect them.
  delete next.data.plan;
  delete next.data.invoices;
  delete next.data.sessions;   // P-A: the write path has its own delete list
  delete next.data.tfa;
```

Plus remove the literals from `emptyDoc()` (`server.js:774-775`) and `src/data/seed.js:509-514`.

### 5. The three revocation endpoints (D-26, D-27) — beside the auth family at `server.js:1225-1315`

The `sessions` table's `token_hash` is the PK, so a text-PK table still has an implicit integer `rowid`
(the DDL at `server.js:95-100` declares no `WITHOUT ROWID`). A `hashPrefix` scheme is recommended (see
§Open Questions 3) because it survives `VACUUM`/row renumbering and needs no extra state:

```js
// Path-param routes follow the established regex-match style (precedent: server.js:1472, :1637)
if (pathname === '/api/auth/sessions' && method === 'GET') {
  const user = requireUser(req, res);
  if (!user) return;
  const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
  const rows = db.prepare(
    `select token_hash, created_at, last_seen_at, ip, user_agent
       from sessions where user_id = ? and expires_at > ? order by created_at desc`,
  ).all(user.id, now());
  return json(res, 200, {
    sessions: rows.map(r => ({
      id: r.token_hash.slice(0, 12),            // D-27: opaque id, never the hash itself
      userAgent: r.user_agent,
      ip: r.ip,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,               // may be NULL for pre-upgrade rows (D-25)
      current: r.token_hash === tokenHash,      // the "this session" marker
    })),
  });
}

const sessionMatch = pathname.match(/^\/api\/auth\/sessions\/([0-9a-f]{12})$/);
if (sessionMatch && method === 'DELETE') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  const res2 = db
    .prepare('delete from sessions where user_id = ? and token_hash like ?')   // P-F: always scoped to the caller
    .run(user.id, `${sessionMatch[1]}%`);
  if (!res2.changes) return fail(res, 404, 'sessionNotFound', 'This session no longer exists');
  return json(res, 204);
}

if (pathname === '/api/auth/sessions/others' && method === 'DELETE') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
  const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
  const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(user.id, now());
  return json(res, 200, { revoked: del.changes, remaining: left.n });   // Pitfall 10: live numbers, not pre-delete
}
```

Route ordering note: `DELETE /api/auth/sessions/others` must be tested **before** the generic
`/sessions/([0-9a-f]{12})` match if you used a loose regex — but the two are disjoint because `others` is
not hex, so placing the exact-string match first (as the auth family does with `pathname === …`) is safe.
`/api/auth/sessions/others` should be matched by exact `pathname ===` **before** any `sessions/…` prefix
regex.

If a new `sessionNotFound` code is introduced, it needs `err.sessionNotFound` in **both** locale files
(P-D). An alternative that avoids the new code entirely is an idempotent `204` for an already-dead id.

### 6. Client API + render + rewiring (D-29, D-33)

```js
// src/core/api.js — beside members() / setMember(), same call() shape
async sessions() {
  return call('GET', '/api/auth/sessions');
},
async revokeSession(id) {
  return call('DELETE', `/api/auth/sessions/${encodeURIComponent(id)}`);
},
async revokeAllSessions() {
  return call('DELETE', '/api/auth/sessions/others');
},
```

```js
// src/actions/actions.js — mount hook (extends A.go at :199-210)
  if (r === 'members' && api.enabled) refreshMembers();
  if (r === 'settings' && p.sec === 'sessions' && api.enabled) refreshSessions();

// refreshSessions() follows refreshMembers() (:1766-1793) — api call, store in S.ui, render
export async function refreshSessions() {
  if (!api.enabled) return null;
  const res = await api.sessions();
  if (!res.ok) return null;
  S.ui.sessions = res.data.sessions || [];
  S.ui.sessionsLoaded = true;
  render();
  return res.data;
}

// A.revokeSession (:2371) rewired — delete the doc mutation, call the endpoint, refresh
A.revokeSession = async el => {
  const id = el.dataset.id;
  const res = await api.revokeSession(id);
  if (!res.ok) {
    if (res.status === 401) return signOutRevoked();      // D-28
    return toast(res.error || t('err.sessionNotFound'), { kind: 'err' });
  }
  await refreshSessions();                                 // D-29
  toast(t('toast.sessionSignedOut'));
};

// A.revokeAll (:2377) rewired — keep the confirmDlg wrapper, replace the doc filter
  run: async () => {
    const res = await api.revokeAllSessions();
    if (!res.ok) {
      if (res.status === 401) return signOutRevoked();
      return toast(res.error, { kind: 'err' });
    }
    await refreshSessions();                               // D-29
    toast(t('toast.signedOutOthers'));
  },
```

```js
// src/pages/settings.js 'sessions' case (:390-403) — same srow() layout, server data
    case 'sessions': {
      const rows = S.ui.sessions || [];
      return (
        H(t('settings.sessions.lead')) +
        rows
          .map(s =>
            srow(
              `<span class="row" style="gap:8px">${ic(/iPhone|iPad|Android|Mobile/i.test(s.userAgent) ? 'smartphone' : 'monitor', 15)}${esc(deviceLabel(s.userAgent))}${s.current ? `<span class="badge green">${t('settings.sessions.thisDevice')}</span>` : ''}</span>`,
              `${esc(s.ip || '—')} · ${esc(s.lastSeenAt || s.createdAt ? ago(s.lastSeenAt || s.createdAt) : '—')}`,
              s.current ? '' : `<button class="btn btn-secondary btn-sm" data-a="revokeSession" data-id="${esc(s.id)}">${t('palette.signOut')}</button>`,
            ),
          )
          .join('') +
        `<div style="margin-top:16px"><button class="btn btn-danger-ghost" data-a="revokeAll" ${rows.length > 1 ? '' : 'disabled'}>${t('settings.sessions.revokeAll')}</button></div>`
      );
    }
```

`deviceLabel()` is the D-18 client-side renderer — a sibling of the existing `isMac` (`src/core/utils.js:41`):

```js
// src/core/utils.js — follows the isMac sniff pattern
export const deviceLabel = ua => {
  const u = String(ua || '');
  const os = /iPhone|iPad/.test(u) ? t('dev.ios')
    : /Android/.test(u) ? t('dev.android')
    : /Mac|Darwin/.test(u) ? t('dev.mac')
    : /Windows/.test(u) ? t('dev.windows')
    : /Linux/.test(u) ? t('dev.linux')
    : '';
  const br = /Edg\//.test(u) ? t('dev.edge')
    : /OPR\//.test(u) ? t('dev.opera')
    : /Chrome\//.test(u) ? t('dev.chrome')
    : /Firefox\//.test(u) ? t('dev.firefox')
    : /Safari\//.test(u) ? t('dev.safari')
    : '';
  return [os, br].filter(Boolean).join(' · ') || '—';
};
```

Every literal in that renderer is a catalogue key — `dev.*` must be added to `en.json` and `fr.json` or
`prebuild` fails (P-D). Relative time is `ago()` (`src/core/utils.js:91`), already locale-aware:

```js
// src/core/utils.js:91-92 (verbatim)
export function ago(ts) {
  return formatRelativeTime(ts, { pattern: dateFormat });
}
```

```js
// src/core/i18n.js:426-438 (verbatim) — note the <1 minute branch renders the catalogue 'common.justNow'
export function formatRelativeTime(timestamp, options = {}) {
  const ts = timestampOf(timestamp);
  if (!Number.isFinite(ts)) return '';
  const relative = { style: formatsFor(locale).relativeStyle, numeric: 'always' };
  const m = Math.round((Date.now() - ts) / 6e4);
  if (m < 1) return t('common.justNow');
  if (m < 60) return relativeFor(locale, relative).format(-m, 'minute');
  const h = Math.round(m / 60);
  if (h < 24) return relativeFor(locale, relative).format(-h, 'hour');
  const d = Math.round(h / 24);
  if (d < 7) return relativeFor(locale, relative).format(-d, 'day');
  return formatDate(isoDate(new Date(ts)), options);
}
```

`common.justNow` already exists in `en.json` (`"common.justNow": "just now"`), so the "Active now" cell
needs no new key.

**Deleted outright (D-33):** `A.verify2fa` (`actions.js:2400-2413`), `A.disable2fa` (`:2414-2427`),
`A.setup2fa`/`A.cancel2fa` (`:2391-2399`), the `D().sessions` mutations in `A.revokeSession`/`A.revokeAll`
(:2373, :2386), the settings `2fa` case (`settings.js:404-422` — includes the fake QR grid and the
hardcoded recovery codes), the doc-field literals in `emptyDoc()` (`server.js:774-775`) and
`src/data/seed.js:509-514`. A full grep confirms no other dormant references exist anywhere in `src/`.

### 7. D-28 — the revoked browser's teardown

```js
// src/main.js:70-78 (verbatim) — the 401 branch that already lands the user on /login
addEventListener('projects:save-error', e => {
  const { status, error } = e.detail || {};
  if (status === 401) {
    S.ui.auth = 'login';
    S.ui.errors = {};
    render();
    toast(tk('err.sessionExpired'), { kind: 'err' });
    return;
  }
```

`err.sessionExpired` today reads `"Your session expired. Sign in again."` (`en.json:1446`) — honest for an
*expiring* cookie but not for a *revoked* one. D-28 asks for distinct copy, so add a new key
(e.g. `err.signedOutElsewhere`) to **both** locales **and** to the `CLIENT_ONLY_ERR_CODES` array in
`test/error-codes.test.mjs:192-248` (P-D). D-28 also says "reuses the existing `signOut` action" —
`A.signOut` (`actions.js:2081-2101`) already clears the cache, resets `api.revision`, and sets
`S.ui.auth = 'login'`, so the new helper is:

```js
// src/actions/actions.js — beside A.signOut (:2081-2101)
async function signOutRevoked() {
  await A.signOut();
  toast(tk('err.signedOutElsewhere'), { kind: 'err' });
}
```

### 8. Test skeletons

```js
// test/sessions.test.mjs — follows the real-server harness (test/helpers/server.mjs); never mocks SQLite/HTTP
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { login, startServer, withDb } from './helpers/server.mjs';

let server;
before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

test('SESS-02: disconnect-all kills the second cookie and keeps the caller alive', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(b.status, 200);

  const res = await a.client.del('/api/auth/sessions/others');
  assert.equal(res.status, 200);

  // the other browser's next request is 401 — and /api/auth/me is a 200-with-null probe,
  // so assert against a requireUser-protected route (Pitfall 9's second assertion)
  assert.equal((await b.client.get('/api/workspaces/acme')).status, 401);
  // the caller is still signed in
  assert.equal((await a.client.get('/api/auth/me')).data.user.email, ADMIN.email);
});

test('SESS-03: per-row revoke kills exactly one row', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  const c = await login(server.base, ADMIN.email, ADMIN.password);

  const listed = await a.client.get('/api/auth/sessions');
  assert.equal(listed.status, 200);
  assert.equal(listed.data.sessions.length, 3);
  const other = listed.data.sessions.find(s => !s.current);

  // the token hash never leaves the server (D-27 / P-G)
  assert.equal(listed.data.sessions.some(s => 'tokenHash' in s || 'token_hash' in s), false);

  const del = await a.client.del(`/api/auth/sessions/${other.id}`);
  assert.equal(del.status, 204);
  assert.equal((await b.client.get('/api/workspaces/acme')).status, 200); // untouched
  assert.equal((await c.client.get('/api/workspaces/acme')).status, 401); // dead
});
```

`withDb(server.dbPath, db => …)` (`test/helpers/server.mjs:146-153`) is available for direct assertions on
the stored columns — e.g. that `ip`, `user_agent` and `last_seen_at` are populated after a login with a
custom `user-agent` header.

```js
// test/migration.test.mjs — EXTEND, do not author a new file. Mirror the existing capture (:29-39) and
// the existing absence assertions (:52-56), then prove the second boot is still a no-op (:188-196).
legacyColumns = withDb(path.join(dataDir, 'projects.db'), db =>
  Object.fromEntries(
    ['workspaces', 'memberships', 'invites', 'users', 'sessions'].map(table => [
      table,
      db.prepare(`pragma table_info(${table})`).all().map(c => c.name),
    ]),
  ),
);

// before boot:
assert.equal(legacyColumns.sessions.includes('ip'), false, 'fixture has no sessions.ip');
assert.equal(legacyColumns.users.includes('two_fa_enabled'), false, 'fixture has no users.two_fa_enabled');

// first boot lands the full dormant set:
assert.deepEqual(
  withDb(server.dbPath, db => db.prepare('pragma table_info(sessions)').all().map(c => c.name)),
  ['token_hash', 'user_id', 'created_at', 'expires_at', 'label', 'ip', 'last_seen_at', 'user_agent'],
);
assert.ok(withDb(server.dbPath, db =>
  db.prepare('select count(*) as n from sqlite_master where type = ? and name = ?').get('table', 'login_challenges').n === 1));

// the served document no longer carries the retired fields (the stored copy still has them until a write):
const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
assert.equal('sessions' in read.data.doc.data, false);
assert.equal('tfa' in read.data.doc.data, false);

// a write persists the clean shape (P-A — the plan/invoices precedent at :147-163):
//   ... PUT the doc, re-GET, then assert against the STORED row:
//   withDb(server.dbPath, db => { const row = workspaceRow(); assert.equal(JSON.stringify(row.doc).includes('"tfa"'), false); })

// the existing second-boot snapshot at :188-196 then proves byte-identical no-op for the new schema
```

The existing `snapshot()` (`migration.test.mjs:166-186`) already deep-equals `doc: row.doc`, so no new
comparison machinery is needed. Optionally add `two_fa_*` columns to the `users` selection at :179-184 so
the dormant NULLs are explicitly pinned as unchanged.

```js
// D-32 doc-shape guard — build-locales.test.mjs style. emptyDoc()/seedDoc() live inside server.js,
// which a test cannot import (it boots on load — noted in error-codes.test.mjs:3-4), so assert through
// the served document:
test('the served document carries no sessions or tfa fields', async () => {
  const s = await startServer();
  try {
    const signedIn = await login(s.base, ADMIN.email, ADMIN.password);
    const read = await signedIn.client.get('/api/workspaces/acme');
    const d = read.data.doc.data;
    assert.equal('sessions' in d, false, 'data.sessions is absent');
    assert.equal('tfa' in d, false, 'data.tfa is absent');
  } finally {
    await s.stop();
  }
});
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | No new environment variables are required by this phase, so DEPLOY.md is not touched. Cited from CONTEXT.md's canonical refs ("DEPLOY.md — env block context (SESSION_DAYS etc.); no new env vars required by this phase's decisions"). I did **not** read DEPLOY.md in this session. | Runtime State Inventory | Low — if a knob were needed (e.g. a throttle-band override), DEPLOY.md would need one section added. No code path requires it |
| A2 | The revoked-browser 401 for the *new* endpoints can be handled by calling `A.signOut()` directly, and the existing `projects:save-error` listener is not strictly needed for this phase. | Code Example 7, Pitfall P-E | Low-medium — both paths are available; picking `A.signOut()` avoids duplicating teardown logic. If a later phase adds more 401-emitting calls, a centralized listener may become preferable |
| A3 | `sessions` retains its implicit integer `rowid` because the DDL (`server.js:95-100`) declares no `WITHOUT ROWID`. | Code Example 5 | None for the recommended hash-prefix scheme; only relevant if the planner picks rowid as the opaque id |
| A4 | Phase 14 does not need a new `sessions` index on `user_id`: per-user session counts are tiny and no query is expected to scan many users. | Pattern 1 | Low — if revocation were ever called for many users at once (admin revocation is explicitly deferred in REQUIREMENTS.md), an index would help. Adding one is harmless either way |
| A5 | The i18n delta is small: `settings.sessions.lead`, `settings.sessions.thisDevice`, `settings.sessions.revokeAll`, `toast.sessionSignedOut`, `toast.signedOutOthers`, `palette.signOut` and `common.justNow` all already exist in both locales and are reusable. New keys are needed only for the `dev.*` device labels and the D-28 revocation toast. | Code Example 6 | Low-medium — if the planner wants a distinct per-row revoke toast rather than reusing `toast.sessionSignedOut`, one more key pair is needed. The gate is mechanical, not conceptual |
| A6 | `seed.json` is a build artifact, not a committed file (grep for `"tfa"` and `sessions:` across all `*.json` returned zero matches). | Runtime State Inventory | Low — if `seed.json` *were* committed somewhere not matched by the grep (e.g. gitignored but shipped in the image), it would need regeneration via `npm run seed:json` |
| A7 | The new columns' naming is exactly D-31's list, and Phase 16 will read those names. | Pattern 1, Pitfall P-C | Medium — a typo'd column name here is a silent failure that Phase 16 hits as "column does not exist". Mitigated by the post-boot `pragma table_info` assertion in Code Example 8 |

**No claim in this document required web research or an external documentation lookup.** The phase installs
no packages and all implementation surfaces exist in this repository; every factual claim was verified by
reading a file in this session.

## Open Questions

1. **`users.two_fa_enabled` — `NOT NULL DEFAULT 0` or nullable?**
   - What we know: D-31 pins the column; `ensureColumn`'s `def` argument accepts either; SQLite permits a
     constant `NOT NULL` default on `ALTER TABLE ADD COLUMN` without rewriting existing rows.
   - What's unclear: which reads better to Phase 16's code. `NOT NULL DEFAULT 0` makes "not enrolled" an
     explicit `0` everywhere; nullable makes "never touched" and "disabled" the same NULL, matching
     PITFALLS.md's "existing users simply have `tfa_enabled = 0` by absence" phrasing.
   - Recommendation: **`integer not null default 0`** — it removes a branch in Phase 16's reader and the
     SQLite constant-default path preserves the byte-identical guarantee either way.
2. **What happens to the Settings › 2FA tab in this phase?**
   - What we know: D-33 requires the `D().tfa` stubs (`A.verify2fa`, `A.disable2fa`, the fake QR grid, the
     hardcoded recovery codes) to be deleted in this phase, and CONTEXT.md's boundary says no TOTP
     behavior until Phase 16. The nav entry (`settings.nav.sessions` / `settings.nav.twoFactor`,
     `settings.js:72-75`) is user-visible.
   - What's unclear: delete the tab until Phase 16, or keep it with honest "coming soon" copy?
   - Recommendation: **remove the `2fa` entry from `SET_NAV` and the `case '2fa'` block**, restoring both
     in Phase 16. It is the most honest option (no fake QR, no dead button), it avoids shipping catalogued
     copy that Phase 16 will immediately rewrite, and Phase 16 adds the entry back in one line. If the
     planner prefers a placeholder, it must be honest copy with no QR and no code entry field.
3. **Opaque id scheme: `rowid` or hash prefix?**
   - What we know: D-27 locks "server-issued opaque short ids (rowid or hash prefix)" and explicitly
     flags the choice as costly to reverse.
   - What's unclear: nothing blocking — both are defensible.
   - Recommendation: **hash prefix of the first 12 hex chars of `token_hash`** — stable across `VACUUM` and
     database rewrites, needs no extra state or lookup table, and a truncated SHA-256 prefix cannot be
     reversed to the hash. Collision risk among one user's concurrent sessions is negligible. The client
     URL then needs no encoding beyond `encodeURIComponent`.
4. **New `err.sessionNotFound` code, or idempotent 204 for a dead id?**
   - What we know: `error-codes.test.mjs` requires both-catalogue entries for any new server code, or an
     allowlist entry for any client-only code.
   - What's unclear: which UX is better — telling the user "that session is already gone" or silently
     succeeding.
   - Recommendation: **idempotent 204**. Revoking a row that already vanished (e.g. expired between the
     list fetch and the click, or revoked in another tab) is not an error state worth surfacing, and it
     avoids a new error code entirely. If the planner prefers the explicit code, add `err.sessionNotFound`
     to both locales.
5. **Should the plan add an admin-adjacent index `sessions(user_id)`?**
   - What we know: the only existing index is `sessions_expiry on sessions(expires_at)` (the expiry sweeper
     needs it); the new queries filter `where user_id = ?`.
   - What's unclear: whether the planner wants defensive indexing for free.
   - Recommendation: **skip it** — per-user session counts are tiny, and no requirement implies a
     high-cardinality scan. Adding it is not harmful but adds a DDL line with no measured benefit.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 24 | `node:sqlite` in server.js; `engines` field [VERIFIED: package.json:24-26] | ✓ | v24.21.0 | — |
| `node:sqlite` `DatabaseSync` | Schema + migration | ✓ | Bundled with Node 24 (used at `server.js:142`) | — |
| `node --test` | Server test suites | ✓ | Built into Node 24 (`npm test` → `node --test --test-concurrency=2 test/*.test.mjs`) | — |
| npm | Build, lint, format | ✓ | devDependencies present (`vite`, `eslint`, `prettier`) | — |
| Playwright | Chromium e2e (`npm run e2e`) | ✓ (devDependency `@playwright/test` ^1.64.1) | Not required by Phase 14 — e2e coverage is Phase 18's AUTH-03 | `npm test` covers Phase 14 |
| New npm packages | — | n/a | **None required** | — |

**Missing dependencies with no fallback:** none.

**Missing dependencies with fallback:** none.

No new tooling, runtime, database or package manager is introduced. No external service is contacted.
Network access is not needed for this phase.

## Validation Architecture

Validation is enabled (no `workflow.nyquist_validation: false` key in `.planning/config.json`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` + `node:assert/strict` (no test framework dependency) |
| Config file | none — `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:18] |
| Quick run command | `node --test test/sessions.test.mjs` |
| Full suite command | `npm test` |
| Harness | `test/helpers/server.mjs` — spawns the real `server.js` on an ephemeral loopback port with an isolated `DATA_DIR`; never mocks SQLite or HTTP |
| Gate | `npm run build` runs `scripts/i18n-scan.mjs` as `prebuild` [VERIFIED: package.json:10-11] |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SESS-01 | `GET /api/auth/sessions` returns the caller's rows with device label source, IP, last-seen and a `current` marker; no `token_hash` in the payload | unit (real server) | `node --test test/sessions.test.mjs` | ❌ Wave 0 — new file |
| SESS-02 | `DELETE /api/auth/sessions/others` kills every row but the caller's; the other cookie's next `requireUser` request is 401 and the caller stays signed in (both halves) | unit (real server) | `node --test test/sessions.test.mjs` | ❌ Wave 0 — new file |
| SESS-03 | `DELETE /api/auth/sessions/:id` kills exactly that row; sibling rows and other users' rows untouched | unit (real server) | `node --test test/sessions.test.mjs` | ❌ Wave 0 — new file |
| SESS-03 (scope) | Per-row revoke is scoped to the caller — a foreign id returns nothing and cannot delete another user's session | unit (real server) | `node --test test/sessions.test.mjs` | ❌ Wave 0 — new file |
| AUTH-02 | Migration adds the 7 columns + `login_challenges`; second boot is a byte-identical no-op | unit (real server, existing harness) | `node --test test/migration.test.mjs` | ✅ exists — extend (:29-39, :52-56, :188-196) |
| AUTH-02 | The served workspace document has no `sessions` or `tfa` keys (drift guard) | unit (real server) | `node --test test/migration.test.mjs` | ✅ exists — extend |
| AUTH-02 | A write persists the stripped shape (the `plan`/`invoices` precedent) | unit (real server) | `node --test test/migration.test.mjs` | ✅ exists — extend (:147-163 pattern) |
| AUTH-01 (threaded) | Every new UI string is catalogued EN+FR; new server codes have `err.<code>` in both; client-only codes are allowlisted | unit (static + build) | `npm test && npm run build` | ✅ exists (`test/error-codes.test.mjs`, `test/i18n-scan.test.mjs`) |
| D-28 | A revoked browser's next request tears down state, shows an honest toast, and redirects to `/login` | unit (real server, 401 assertion) | `node --test test/sessions.test.mjs` | ❌ Wave 0 — new file |
| D-22/D-24 | `last_seen_at` updates at most once per band and never touches other columns | unit (real server, `withDb` column read) | `node --test test/sessions.test.mjs` | ❌ Wave 0 — new file |

### Sampling Rate

- **Per task commit:** `node --test test/sessions.test.mjs` (and `node --test test/migration.test.mjs` for
  any schema/doc change)
- **Per wave merge:** `npm test`
- **Phase gate:** `npm test && npm run lint && npm run format:check && npm run build` green
  (the build includes the `prebuild` i18n-scan gate)

### Wave 0 Gaps

- [ ] `test/sessions.test.mjs` — SESS-01, SESS-02, SESS-03, D-22/D-24, D-27 non-leakage, D-28 401 teardown.
      Follows the harness contract of `test/helpers/server.mjs` exactly (no mocks, own server + temp DB).
- [ ] `test/migration.test.mjs` **extension** (not a new file): widen the `legacyColumns` capture to
      `users` + `sessions`, add pre-boot absence assertions, post-boot `pragma table_info` assertions for the
      full column set + `login_challenges`, and the served/stored doc-shape assertions.
- [ ] Locale entries in `src/locales/en.json` + `fr.json` for `dev.*` labels and the D-28 toast key, plus
      the `CLIENT_ONLY_ERR_CODES` allowlist entry in `test/error-codes.test.mjs`.
- [ ] None for framework install — `node:test` is built into the required Node version.

## Security Domain

`security_enforcement` is not set to `false` in config, so this section applies. Phase 14 is primarily a
session-management phase — ASVS V3 is the center of gravity.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (no change to login credential verification) | Existing scrypt path untouched |
| V3 Session Management | **yes — primary** | DB-backed opaque random tokens (`crypto.randomBytes(32)`), `token_hash` stored as SHA-256 hex, revoke by row delete, `SESSION_DAYS` single tier, keep-current exclusion |
| V4 Access Control | **yes** | `requireUser()` + caller-scoped `WHERE user_id = ?` on every revocation; never a bare `WHERE token_hash = ?` |
| V5 Input Validation | yes | Path-param regex `[0-9a-f]{12}`; `sameOrigin()` before any mutation; no body on the DELETE routes |
| V6 Cryptography | no (no new crypto; no hand-rolled primitives) | Token hash is `crypto.createHash('sha256')`; the AES-256-GCM envelope is Phase 16 (D-05/D-07) |
| V7 Error Handling | yes | Standard `{error, code}` envelope; no stack traces; 404/idempotent-204 for missing ids |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Self-DoS — "sign out others" revokes the caller | Repudiation / denial of service | `token_hash != sha256(current cookie)`; test both halves (Pitfall 9) |
| IDOR — revoke another user's session via a guessed id | Elevation of privilege | Always bind `WHERE user_id = ?` from `requireUser()`; never accept a `token_hash` from the client (P-F) |
| Token-hash disclosure — leak the hash to enable precise targeting | Information disclosure | Opaque short id only; `token_hash` never in any response body (P-G, D-27) |
| CSRF — cross-site DELETE revokes sessions | Tampering | `sameOrigin(req)` as the first statement of both DELETE handlers, before body read and throttle (P-K, Pitfall 22) |
| Revocation not enforced — a cached identity survives the DELETE | Tampering | Identity is re-derived from the DB per request; do not memoize `currentUser()` (Pitfall 10) |
| Stale revocation response — list reflects pre-delete state | Spoofing | Re-select after delete, or return live counts (P-I, Pitfall 10) |
| Write amplification on the hottest auth path | Denial of service (performance) | Throttled single-column `last_seen_at` update with a bounded in-memory eligibility map (D-22/D-23/D-24, P-J) |
| Boot backfill corrupting the migration invariant | Tampering | Columns and tables only; NULL/dormant defaults; no per-user generation (Pitfall 21, D-31) |
| Forgotten third insert site — NULL metadata for invite-created sessions | Information disclosure (misleading UI) | Update all three `insert into sessions` sites identically (P-L) |
| Uncatalogued error strings / missing parity entries | — (build integrity) | Bilateral `err.*` parity + i18n-scan gate (P-D, AUTH-01) |

## Sources

### Primary (HIGH confidence — read directly this session)

- `server.js` — `:85-101` (users + sessions DDL), `:134-156` (`ensureColumn` + `openDb`), `:272-281`
  (`normalizeDoc`), `:472` (`mergeClientDoc`), `:561-566` (`docForClient`), `:568-601` (`docFromClient`),
  `:759-810` (`emptyDoc`/`seedDoc`/`ensureWorkspace`), `:1083-1093` (`clientIp`, `sameOrigin`),
  `:1122-1141` (`currentUser`, `requireUser`), `:1161-1173` (`attempts`/`tooMany`), `:1225-1315` (auth
  route family), `:1472`/`:1637` (path-param regex precedent), `:1700-1719` (invite-accept session insert)
- `src/core/api.js:39-64` (`call()`), `src/core/utils.js:41` (`isMac`), `:91-93` (`ago`),
  `src/core/i18n.js:426-438` (`formatRelativeTime`)
- `src/pages/settings.js:70-76` (`SET_NAV` security group), `:78-80` (`srow`), `:97-104` (`pageSettings`),
  `:390-422` (sessions + 2fa cases)
- `src/actions/actions.js:199-210` (`A.go`), `:2081-2101` (`A.signOut`), `:1766-1793` (`refreshMembers`),
  `:2225-2240` (`IN.langSel` 401 dispatch), `:2371-2390` (`A.revokeSession`/`A.revokeAll`),
  `:2391-2427` (2FA stubs)
- `src/main.js:70-78` (`projects:save-error` 401 branch), `src/data/seed.js:509-514` (seed doc fields)
- `src/locales/en.json:6,1446` and `fr.json:233-234,1249-1251` (reusable keys)
- `test/helpers/server.mjs` (harness), `test/helpers/legacy-fixture.mjs:22-36,123,125` (legacy schema +
  doc), `test/migration.test.mjs:29-39,52-56,147-163,166-196` (capture, absence assertions, write-then-clean
  precedent, snapshot + second-boot test), `test/error-codes.test.mjs:19-29,192-259` (bilateral parity)
- `package.json:8-35` (scripts, engines, devDependencies)
- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` (D-01…D-17 binding contracts)
- `.planning/research/PITFALLS.md:121-131` (Pitfall 9), `:135-145` (Pitfall 10), `:149-159` (Pitfall 11),
  `:292-302` (Pitfall 21), `:306-314` (Pitfall 22), `:334-341` (integration gotchas table)
- `.planning/REQUIREMENTS.md` (SESS-01..03, AUTH-02, out-of-scope list), `.planning/STATE.md`,
  `.planning/config.json`, `14-CONTEXT.md` (D-18…D-33)

### Secondary (MEDIUM)

None. Every claim is backed by a file read in this session.

### Tertiary (LOW)

None. No web search, no external documentation, and no package lookup was performed — the phase installs
nothing and every implementation surface is in-repo.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new packages; every consumed primitive verified present by direct read
- Architecture: **HIGH** — all call paths (`openDb` → `SCHEMA`/`ensureColumn`; `handleApi` → auth family;
  `docForClient`/`docFromClient`; `api.js` → `A.go`/`refreshMembers`) traced to exact lines
- Pitfalls: **HIGH** — the two most consequential (P-A the missing write-path strip, P-B the two-surface
  migration) were discovered by reading the code rather than trusting the decision text, and each has a
  concrete code-level warning sign

**Research date:** 2026-10-26
**Valid until:** 30 days — the codebase is small, single-file server, and this phase is the next one to
land; a re-read of `server.js` and `settings.js` is warranted if either file is edited before Phase 14
starts.
