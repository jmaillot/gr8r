# Phase 14: Schema & Session Ground Truth — Pattern Map

**Mapped:** 2026-10-26
**Files analyzed:** 22 (12 files touched + 1 new test file; `server.js` carries 7 distinct edit sites)
**Analogs found:** 22 / 22 (all exact or role-match; this is a zero-new-file, single-file-server codebase)

**Scope note:** Phase 14 installs **zero packages** and creates **one new file** (`test/sessions.test.mjs`).
Everything else is a widening of existing files. Every analog is a same-file or adjacent-file precedent, so
the planner can point each task at a concrete line range and the executor can copy the shape rather than
invent it. The single most consequential pattern finding (from `14-RESEARCH.md` §Code Examples 4, Pitfall P-A):
the doc-field strip needs **two delete sites, not one** — `normalizeDoc()` *and* `docFromClient()`.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `server.js` SCHEMA + `openDb()` (DDL + `ensureColumn` x7) | db-schema-migration | additive-migration | `server.js:84-156` (self: SCHEMA + `ensureColumn` + `openDb`, `users.locale` precedent) | exact |
| `server.js` `normalizeDoc()` strip | data-transform (read path) | transform | `server.js:279` (`delete out.data.workspaces`) | exact |
| `server.js` `docFromClient()` strip | data-transform (write path) | transform | `server.js:596-598` (`delete next.data.plan; delete next.data.invoices;`) | exact |
| `server.js` `emptyDoc()` literal removal | data-fixture | transform | `server.js:774-775` (`sessions: [],` / `tfa: false,`) | exact |
| `server.js` 3 session inserts (login/signup/invite) | db-write | CRUD-write | `server.js:1244-1249`, `:1307-1312`, `:1714-1719` (3 identical inserts) | exact |
| `server.js` `currentUser()` throttled `last_seen_at` write | auth-identity (request path) | throttled-write | `server.js:1122-1131` (`currentUser`) + `:1161-1173` (`attempts` Map / `tooMany`) | role-match |
| `server.js` 3 new `/api/auth/sessions*` routes | http-handler | CRUD (read + revoke) | `server.js:1225-1315` (auth family) + `:1472`/`:1637` (path-regex) | exact |
| `src/core/api.js` (+ `sessions`, `revokeSession`, `revokeAllSessions`) | api-client boundary | request-response | `src/core/api.js:219-271` (`members`/`setMember`/`removeMember`/`revokeInvite`) | exact |
| `src/core/utils.js` (+ `deviceLabel()`) | utility | transform (UA → label) | `src/core/utils.js:41` (`isMac`) | role-match |
| `src/actions/actions.js` `A.go` mount hook | action-handler | navigation | `src/actions/actions.js:199-210` (self) | exact |
| `src/actions/actions.js` (+ `refreshSessions()`) | action-handler | fetch-on-mount | `src/actions/actions.js:1766-1793` (`refreshMembers`) | exact |
| `src/actions/actions.js` `A.revokeSession`/`A.revokeAll` rewire | action-handler | request-response | `src/actions/actions.js:2371-2390` (self, rewired) + `:2377-2390` (`confirmDlg`) | exact |
| `src/actions/actions.js` (+ `signOutRevoked()`) | action-handler | teardown | `src/actions/actions.js:2081-2101` (`A.signOut`) | exact |
| `src/actions/actions.js` delete 2FA stubs | action-handler | delete | `src/actions/actions.js:2391-2427` (`setup2fa`/`cancel2fa`/`verify2fa`/`disable2fa`) | exact |
| `src/pages/settings.js` `'sessions'` case rewire | page-view | render | `src/pages/settings.js:390-403` (self) + `:78-80` (`srow`) | exact |
| `src/pages/settings.js` `'2fa'` case retire + `SET_NAV` entry | page-view | render/config | `src/pages/settings.js:69-76` (`SET_NAV`) + `:404-422` (`2fa` case) | exact |
| `src/data/seed.js` sessions[] + tfa removal | data-fixture | seed | `src/data/seed.js:509-514` | exact |
| `src/locales/en.json` + `fr.json` (+ `dev.*`, D-28 key) | i18n-catalogue | data | `en.json:1249-1251`, `fr.json:1249-1251`, `en.json:232-233`, `:6`, `:1446` | exact |
| `test/migration.test.mjs` (EXTEND) | test (integration, real server) | snapshot + reboot | `test/migration.test.mjs` (self: `:29-39`, `:52-56`, `:147-163`, `:166-196`) | exact |
| `test/error-codes.test.mjs` (allowlist entry) | test (static parity) | validation | `test/error-codes.test.mjs:192-259` (`CLIENT_ONLY_ERR_CODES`) | exact |
| `test/sessions.test.mjs` (**NEW**) | test (integration, real server) | CRUD + auth over HTTP | `test/membership.test.mjs:1-46` (harness + `before`/`after`) + `test/helpers/server.mjs` | role-match |

**No analog found:** none. Every change has a same-codebase precedent.

**No new packages:** confirmed — `package.json` untouched; no `node_modules` change. (14-RESEARCH.md §Package Legitimacy Audit.)

---

## Pattern Assignments

### `server.js` — SCHEMA DDL + `openDb()` migration (D-31)

**Analog:** `server.js:84-156` (the `users.locale` precedent: declared in DDL *and* guarded by `ensureColumn`)

**Why this analog:** Every prior additive column landed in **both** the `SCHEMA` template literal (fresh
installs) and an `ensureColumn` call (existing installs). The `locale` column at `:93` (DDL) + `:153`
(`ensureColumn`) is the live precedent. Adding to only one surface silently breaks one population (Pitfall P-B).

**Imports pattern** — none; this is the `SCHEMA` template literal and the `openDb()` function, already in place.

**Core pattern — SCHEMA additions** (extend the existing table DDL in place, add the new table after `:131`):
```js
// server.js SCHEMA — extend the existing `create table if not exists users (...)` (:85-94)
// by adding three columns, and the existing `create table if not exists sessions (...)` (:95-100)
// by adding four columns, then append the new table after the invites index (:131).
create table if not exists login_challenges (
  challenge_token_hash text primary key,
  user_id              text not null references users(id) on delete cascade,
  expires_at           integer not null,
  attempts             integer not null default 0
);
create index if not exists login_challenges_expiry on login_challenges(expires_at);
```

**Core pattern — `ensureColumn` calls** (append beside the existing block at `:149-153`):
```js
// server.js openDb() — beside ensureColumn(db, 'users', 'locale', 'text'); (:153)
ensureColumn(db, 'sessions', 'label', 'text');
ensureColumn(db, 'sessions', 'ip', 'text');
ensureColumn(db, 'sessions', 'last_seen_at', 'integer');
ensureColumn(db, 'sessions', 'user_agent', 'text');
ensureColumn(db, 'users', 'two_fa_enabled', 'integer not null default 0');
ensureColumn(db, 'users', 'two_fa_secret', 'text');
ensureColumn(db, 'users', 'two_fa_last_step', 'integer');
```

**The primitive being reused, verbatim (`server.js:134-137`):**
```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
```

**Error handling:** none — `db.exec` throws on schema error and boot fails loudly (correct behavior).

**Critical constraints (planner must enforce):**
- **No `UPDATE`, no backfill, no per-user generation** at boot (Pitfall 21 + D-31). Columns land dormant.
- **No new `migrate()` function** — extend `openDb()` in place (14-RESEARCH.md §Alternatives Considered).
- `def` for `two_fa_enabled` uses a **constant default** (`integer not null default 0`) — SQLite's
  no-rewrite path for `ALTER TABLE ADD COLUMN`, preserving the byte-identical guarantee. Open Question 1.
- Column names are **D-31's verbatim names** — do NOT copy `PITFALLS.md:294`'s pre-decision names
  (`totp_secret_enc`, `sessions.pending_tfa`, etc.) (Pitfall P-C).

---

### `server.js` — doc-field strip: BOTH read and write paths (D-30)

**Analog (read):** `server.js:272-281` `normalizeDoc()`, specifically `:279` `delete out.data.workspaces;`
**Analog (write):** `server.js:596-598` `docFromClient()`, specifically:
```js
  // The plan and invoices fields are gone; a stale client's copy must never resurrect them.
  delete next.data.plan;
  delete next.data.invoices;
```

**Why both:** `normalizeDoc()` runs only on the *read* path (`docForClient`, `:562`). The *write* path
(`docFromClient`, `:568-601`) never calls `normalizeDoc()` and carries its own explicit delete list.
`mergeClientDoc(incoming, stored, membership)` (`:472`) merges the client payload *over the stored doc*, so
a field the client no longer sends survives from storage unless `docFromClient` deletes it. Stripping only in
`normalizeDoc()` leaves `"sessions":[],"tfa":false` in the stored `workspaces.doc` forever — the served doc
is clean but the bytes never change. **This is Pitfall P-A, the single most consequential finding of the
research.** (14-RESEARCH.md §Summary, §Common Pitfalls P-A, §Code Examples 4.)

**Core pattern — read path** (beside `:279`):
```js
// server.js normalizeDoc() (:272-281)
  delete out.data.workspaces;
  delete out.data.sessions;   // D-30: stop emitting, drop when present in stored docs
  delete out.data.tfa;
  return out;
```

**Core pattern — write path** (beside `:597-598`):
```js
// server.js docFromClient() (:596-600)
  // The plan and invoices fields are gone; a stale client's copy must never resurrect them.
  delete next.data.plan;
  delete next.data.invoices;
  delete next.data.sessions;   // P-A: the write path has its own delete list
  delete next.data.tfa;
  normalizeProjects(next);
  return next;
```

**Safety note (14-RESEARCH.md §Summary, third finding):** `docForClient()` operates on
`JSON.parse(JSON.stringify(doc || {}))` (`:562`) — a copy — so stripping never mutates the stored
`workspaces.doc` string. The snapshot's `doc: row.doc` is byte-identical across boots until a client writes.

**Error handling:** none — `delete` on a missing key is a no-op.

---

### `server.js` — `emptyDoc()` literal removal (D-30)

**Analog:** `server.js:759-792` `emptyDoc()`, the literals at `:774-775`:
```js
// server.js emptyDoc() — delete these two lines (:774-775)
        sessions: [],
        tfa: false,
```

**Why:** `emptyDoc()` is the cold-start doc shape. If it still emits `sessions`/`tfa`, a fresh workspace
ships the dead fields and the drift guard never catches them. Delete both lines; `normalizeDoc()` then runs
over the reduced shape and adds nothing back.

---

### `server.js` — 3 session inserts gain `ip`/`user_agent`/`last_seen_at` (D-18, D-20, P-L)

**Analog:** three identical `insert into sessions` statements at `server.js:1244-1249` (login),
`:1307-1312` (signup), `:1714-1719` (invite-accept). **All three share the identical statement** — update
all three identically.

**Existing statement, verbatim (`server.js:1244-1249`):**
```js
    db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at) values (?,?,?,?)').run(
      sha256(token),
      row.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
    );
```

**New statement (replace at all 3 sites — login `:1244`, signup `:1307`, invite `:1714`):**
```js
// server.js — beside each of the 3 insert sites. Capture UA + IP before the insert.
    const ua = String(req.headers['user-agent'] || '');
    const ip = clientIp(req);
    db.prepare(
      'insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)',
    ).run(sha256(token), row.id, t, t + SESSION_DAYS * 86400 * 1000, ip, ua, t);
```

**`label` is deliberately NOT written** (D-18: the client renders it from the raw UA string). `last_seen_at`
is set to `created_at` at insert — honest "active now" for a just-logged-in session, and it removes reliance
on the D-25 NULL fallback for new rows.

**Reuse, verbatim:**
- `clientIp(req)` (`server.js:1083-1086`) — unchanged, reused for the D-20 login-time IP capture.
- `req.headers['user-agent']` — the raw string, no parsing server-side (D-18, zero-dep held).

**Critical constraint (Pitfall P-L):** forgetting the **third** insert (invite-accept at `:1714`) leaves
invite-created sessions with NULL metadata, which reads as "unknown device" in the settings UI. Verify with
`grep 'insert into sessions'` returning three rows with **identical** column lists.

---

### `server.js` — throttled `last_seen_at` write in `currentUser()` (D-22, D-23, D-24)

**Analog (the join):** `server.js:1122-1131` `currentUser()` — the identity re-derivation path, on every
protected request.
**Analog (the in-memory Map + bounded cleanup):** `server.js:1161-1173` `attempts` Map / `tooMany()`.

**Existing `currentUser()`, verbatim (`server.js:1122-1131`):**
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
```

**The `attempts` Map template, verbatim (`server.js:1161-1173`):**
```js
/* In-memory throttle: a handful of attempts per IP+email per window. */
const attempts = new Map();
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const t = now();
  const row = attempts.get(key);
  if (!row || t > row.reset) {
    attempts.set(key, { n: 1, reset: t + windowMs });
    if (attempts.size > 5000) for (const [k, v] of attempts) if (t > v.reset) attempts.delete(k);
    return false;
  }
  row.n += 1;
  return row.n > max;
}
```

**New throttle Map + helper — append beside the `attempts` Map (after `:1173`):**
```js
// server.js — beside the `attempts` Map (:1161). D-23: token_hash -> next-eligible epoch ms.
const lastSeenNext = new Map();
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

**Modified `currentUser()` — bolt the write onto the existing join (D-22/D-24):**
```js
function currentUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const tokenHash = sha256(token);
  const nowTs = now();
  // Select s.last_seen_at too so the throttle knows whether a write is eligible.
  const row = db
    .prepare(
      `select u.*, s.last_seen_at as _last_seen from sessions s join users u on u.id = s.user_id
       where s.token_hash = ? and s.expires_at > ?`,
    )
    .get(tokenHash, nowTs);
  if (!row) return null;
  touchLastSeen(tokenHash, row._last_seen, nowTs);  // D-24: single-column write, no other field touched
  delete row._last_seen;                              // don't leak the alias into the user payload
  return row;
}
```

**Critical constraints:**
- **Do NOT memoize** `currentUser()` (Pitfall 10) — identity is re-derived per request. That is the whole
  reason revocation is a *delete, not an expiry*.
- **D-24:** the throttled write touches **only `last_seen_at`**. Login/logout paths keep their own writes.
- **Bounded-map cleanup** (`lastSeenNext.size > 5000`) mirrors `attempts` at `:1168` so the map cannot grow
  unboundedly across sessions.
- The login/logout/expiry-sweeper paths (`:1257`, `:2173-2174`) are **unchanged** — revoked rows simply
  vanish from the GET list.
- Add bounded-map cleanup **and** never a write inside the login/verify handler (Pitfall P-J warning signs).

---

### `server.js` — 3 new `/api/auth/sessions*` routes (D-26, D-27)

**Analog (route shape + guards):** `server.js:1225-1315` (the auth family: `sameOrigin` first, `requireUser`,
`fail`/`json` envelope).
**Analog (path-param regex):** `server.js:1472` and `:1637` (existing `pathname.match(/^\/api\/.../)` style).
**Analog (error envelope):** `server.js:1038-1054` `json()` + `fail()`.
**Analog (current-session identity for keep-current):** `parseCookies(req.headers.cookie)[COOKIE]` + `sha256()`,
used at `:1256` (logout).

**`json()` / `fail()` envelopes, verbatim (`server.js:1038-1054`):**
```js
function json(res, status, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```

**The three routes — insert beside the auth family, immediately after `:1315` (`/api/auth/signup`):**
```js
// server.js — beside the auth family (:1225-1315). Route order: exact-string '/others' match
// BEFORE any /sessions/<hex> regex (disjoint: 'others' is not hex, but the order is safe either way).

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
  const del = db
    .prepare('delete from sessions where user_id = ? and token_hash like ?')   // P-F: always scoped to the caller
    .run(user.id, `${sessionMatch[1]}%`);
  if (!del.changes) return fail(res, 404, 'sessionNotFound', 'This session no longer exists');
  return json(res, 204);
}

if (pathname === '/api/auth/sessions/others' && method === 'DELETE') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
  const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
  const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(user.id, now());
  return json(res, 200, { revoked: del.changes, remaining: left.n });   // P-I: live numbers, not pre-delete
}
```

**Critical constraints (planner must enforce — these are the load-bearing security properties):**
- **P-F / IDOR:** every DELETE is `WHERE user_id = ?` bound from `requireUser()` — **never** a bare
  `WHERE token_hash = ?`. The `user.id` is never taken from the path.
- **P-H / self-DoS (Pitfall 9):** "sign out others" is `token_hash != sha256(current cookie)` — **never**
  `DELETE FROM sessions WHERE user_id = ?` (the `--set-password` CLI form at `:2160` is exactly that and
  is *wrong* here: no live request context). Test **both** halves: the second cookie is dead *and* the
  caller is still alive.
- **P-G / token-hash disclosure:** the GET payload carries only the opaque id, `user_agent`, `ip`,
  `created_at`, `last_seen_at`, `current`. **No `token_hash`** in any `json(res, …)` body.
- **P-K / CSRF:** `sameOrigin(req)` is the **first statement** of both DELETE handlers, before any body
  read or throttle (precedent: login `:1228`, signup `:1286`).
- **P-I (Pitfall 10):** delete first, then re-select for the response — never return a pre-delete list.
- **Route ordering:** `/api/auth/sessions/others` matched by exact `pathname ===` **before** any
  `/sessions/…` prefix regex.
- **`sessionNotFound` vs idempotent 204 (Open Question 4):** the recommended path is idempotent `204` —
  revoking an already-dead id is not worth surfacing, and it avoids a new error code. If the planner picks
  the explicit `err.sessionNotFound` code, it needs `err.sessionNotFound` in **both** locales (P-D).

---

### `src/core/api.js` — 3 new client methods (D-29)

**Analog:** `src/core/api.js:219-271` (`members()`, `setMember()`, `removeMember()`, `revokeInvite()`) —
the `call()`-wrapped, slug-scoped, `{ok, status, data, error}` envelope.

**The `call()` boundary, verbatim (`src/core/api.js:39-64`):**
```js
async function call(method, path, body, { keepalive = false } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      keepalive,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, status: 0, error: t('err.serverUnreachable') };
  }
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { /* non-JSON response */ }
  }
  return { ok: res.ok, status: res.status, data, error: data?.code ? tErr(data.code, data, data?.error) : data?.error };
}
```

**Existing analog method, verbatim (`src/core/api.js:219-223`):**
```js
  async members() {
    const slug = state.workspace?.slug;
    if (!slug) return { ok: false, status: 0, error: t('err.noWorkspaceLoaded') };
    return call('GET', `/api/workspaces/${encodeURIComponent(slug)}/members`);
  },
```

**New methods — append beside `members()`/`setMember()` (after `:230`):**
```js
// src/core/api.js — beside members() / setMember() (:219-230), same call() shape.
// These are account-scoped, not workspace-scoped, so no slug guard.
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

**Note:** the auth methods (`login`, `logout`, `me`, `patchMe`) at `:135-205` are the precedent for
**non-workspace-scoped** endpoints — they skip the slug guard and go straight to `call()`. The three new
session methods follow that shape, not the `members()` slug-guard shape.

---

### `src/core/utils.js` — `deviceLabel()` UA renderer (D-18)

**Analog:** `src/core/utils.js:41` `isMac` — the established client-side UA-sniff pattern.

**Existing analog, verbatim (`src/core/utils.js:41`):**
```js
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
```

**New `deviceLabel()` — add beside `isMac` (after `:41`), following the same regex-sniff idiom:**
```js
// src/core/utils.js — sibling of isMac (:41). D-18: the server stores the raw UA; the client renders.
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

**Critical constraint:** **every literal** in that renderer is a catalogue key — `dev.*` must be added to
**both** `en.json` and `fr.json`, or `prebuild` fails (Pitfall P-D). The `'—'` fallback and the `' · '`
separator are non-translatable UI punctuation and may stay literal. `utils.js` already imports `t` at `:4`
from `./i18n.js`, so no new import.

**Do not hand-roll:** relative time uses `ago(ts)` (`src/core/utils.js:91-92`), already locale-aware via
`Intl.RelativeTimeFormat` + catalogue. `common.justNow` already exists in `en.json:6` — the "Active now"
cell needs no new key. (14-RESEARCH.md §Don't Hand-Roll.)

---

### `src/actions/actions.js` — mount hook, `refreshSessions()`, rewire, delete 2FA stubs (D-29, D-33)

**Analog (mount hook):** `src/actions/actions.js:199-210` `A.go` (self).
**Analog (fetch-on-mount body):** `src/actions/actions.js:1766-1793` `refreshMembers()`.
**Analog (teardown):** `src/actions/actions.js:2081-2101` `A.signOut()`.
**Analog (delete targets):** `src/actions/actions.js:2391-2427` (`setup2fa`/`cancel2fa`/`verify2fa`/`disable2fa`).

**Existing `A.go` mount hook, verbatim (`src/actions/actions.js:199-210`):**
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

**New hook line — append to `A.go` (after `:209`):**
```js
  if (r === 'members' && api.enabled) refreshMembers();
  if (r === 'settings' && p.sec === 'sessions' && api.enabled) refreshSessions();
```

**`refreshSessions()` — new exported function, follows `refreshMembers()` (`:1766-1793`) body shape:**
```js
// src/actions/actions.js — beside refreshMembers() (:1766). api call -> S.ui -> render.
export async function refreshSessions() {
  if (!api.enabled) return null;
  const res = await api.sessions();
  if (!res.ok) return null;
  S.ui.sessions = res.data.sessions || [];
  S.ui.sessionsLoaded = true;
  render();
  return res.data;
}
```

**`A.revokeSession` rewire (replaces `:2371-2376`)** — delete the doc mutation, call the endpoint, refresh:
```js
// src/actions/actions.js — replaces A.revokeSession (:2371-2376)
A.revokeSession = async el => {
  const id = el.dataset.id;
  const res = await api.revokeSession(id);
  if (!res.ok) {
    if (res.status === 401) return signOutRevoked();      // D-28
    return toast(res.error || t('err.sessionNotFound'), { kind: 'err' });
  }
  await refreshSessions();                                 // D-29: refresh after each successful revoke
  toast(t('toast.sessionSignedOut'));
};
```

**`A.revokeAll` rewire (replaces `:2377-2390`)** — keep the `confirmDlg` wrapper, replace the doc filter:
```js
// src/actions/actions.js — replaces A.revokeAll (:2377-2390). Keep the confirmDlg shape.
A.revokeAll = () =>
  confirmDlg({
    title: t('act.signOutOthersTitle'),
    body: t('act.signOutOthersBody'),
    ok: t('act.signOutOthers'),
    danger: true,
    icon: 'log-out',
    run: async () => {
      const res = await api.revokeAllSessions();
      if (!res.ok) {
        if (res.status === 401) return signOutRevoked();   // D-28
        return toast(res.error, { kind: 'err' });
      }
      await refreshSessions();                             // D-29
      toast(t('toast.signedOutOthers'));
    },
  });
```

**`signOutRevoked()` — new helper beside `A.signOut` (`:2081-2101`)** (D-28):
```js
// src/actions/actions.js — beside A.signOut (:2081-2101). D-28: reuse signOut, honest toast.
async function signOutRevoked() {
  await A.signOut();
  toast(tk('err.signedOutElsewhere'), { kind: 'err' });
}
```
`A.signOut()` already clears `api.revision`, `clearLocalCache()`, resets `S.ui.auth = 'login'`, clears
`S.ui.conflict`/`S.ui.pop`/`S.ui.palette`/`S.ui.drawer`/`S.ui.modals`/`S.ui.wantedSlug`/`S.ui.errors` —
exactly the teardown D-28 asks for. No duplicating that logic.

**Deleted outright (D-33)** — remove these blocks entirely:
- `A.setup2fa` (`:2391-2395`), `A.cancel2fa` (`:2396-2399`), `A.verify2fa` (`:2400-2413`),
  `A.disable2fa` (`:2414-2427`).
- The `D().sessions` mutations inside the old `A.revokeSession` (`:2373`) and `A.revokeAll` (`:2386`).
- The `D().tfa` mutation inside `A.verify2fa` (`:2409`).

**Pitfall P-E note:** the revoked-browser 401 only reaches `/login` if the call goes through the same
teardown. Calling `A.signOut()` directly (as `signOutRevoked` does) is the correct path — the existing
`gr8r:save-error` listener in `src/main.js:70-78` is **not** strictly needed for this phase (Assumption A2).
A full grep confirms no other dormant `D().sessions` / `D().tfa` references exist in `src/`.

---

### `src/pages/settings.js` — `'sessions'` case rewire, `'2fa'` case retire, `SET_NAV` entry (D-29, D-33)

**Analog (row layout):** `src/pages/settings.js:78-80` `srow()`.
**Analog (existing case):** `src/pages/settings.js:390-403` `'sessions'` case (self, rewired).
**Analog (nav config):** `src/pages/settings.js:69-76` `SET_NAV` security group.

**Existing `srow()`, verbatim (`src/pages/settings.js:78-80`):**
```js
export function srow(t, d, ctl) {
  return `<div class="srow"><div><div class="t">${t}</div>${d ? `<div class="d">${d}</div>` : ''}</div><div class="row">${ctl}</div></div>`;
}
```

**Existing `'sessions'` case (replaces `:390-403`) — server data, same `srow()` layout:**
```js
// src/pages/settings.js — replaces the 'sessions' case (:390-403). Server data, not D().sessions.
    case 'sessions': {
      const rows = S.ui.sessions || [];
      return (
        H(t('settings.sessions.lead')) +
        rows
          .map(s =>
            srow(
              `<span class="row" style="gap:8px">${ic(/iPhone|iPad|Android|Mobile/i.test(s.userAgent) ? 'smartphone' : 'monitor', 15)}${esc(deviceLabel(s.userAgent))}${s.current ? `<span class="badge green">${t('settings.sessions.thisDevice')}</span>` : ''}</span>`,
              `${esc(s.ip || '—')} · ${s.lastSeenAt || s.createdAt ? ago(s.lastSeenAt || s.createdAt) : '—'}`,
              s.current ? '' : `<button class="btn btn-secondary btn-sm" data-a="revokeSession" data-id="${esc(s.id)}">${t('palette.signOut')}</button>`,
            ),
          )
          .join('') +
        `<div style="margin-top:16px"><button class="btn btn-danger-ghost" data-a="revokeAll" ${rows.length > 1 ? '' : 'disabled'}>${t('settings.sessions.revokeAll')}</button></div>`
      );
    }
```

**Import additions to `src/pages/settings.js`** — `deviceLabel` and `ago` are both from `../core/utils.js`;
the file already imports from that path at `:5` (`dOff, esc, fmtDate`). Add `deviceLabel, ago`:
```js
// src/pages/settings.js :5 — add deviceLabel, ago
import { dOff, esc, fmtDate, deviceLabel, ago } from '../core/utils.js';
```

**`'2fa'` case retire (D-33)** — delete the entire `case '2fa':` block (`:404-422`), including the fake QR
grid (`:410-419`) and the hardcoded recovery codes (`:408`).

**`SET_NAV` entry retire** — remove the `['2fa', 'settings.nav.twoFactor', 'shield-check']` entry from the
security group at `:74`. Per Open Question 2, removing the tab is the most honest option (no fake QR, no dead
button); Phase 16 restores both in one line.

**Critical constraints:**
- `s.lastSeenAt || s.createdAt` — D-25 fallback: NULL `last_seen_at` for pre-upgrade rows falls back to
  `created_at`, honest "never seen since upgrade" semantics.
- `ago()` is already locale-aware (`src/core/utils.js:91-92` → `src/core/i18n.js:426-438`); `common.justNow`
  exists for <1 min. Do **not** hand-roll a relative-time formatter.
- `esc()` every interpolated server value (`s.ip`, `s.userAgent`, `s.id`) — the row values are user-controlled.
- Every catalogue key (`settings.sessions.*`, `palette.signOut`, `toast.*`) must exist in **both** locales.

---

### `src/data/seed.js` — sessions[] + tfa removal (D-33)

**Analog:** `src/data/seed.js:509-514` (self).

**Delete these lines (`src/data/seed.js:509-514`):**
```js
    sessions: [
      { id: 'se1', dev: 'MacBook Pro · Chrome', loc: 'San Francisco, US', at: 'Active now', cur: true },
      { id: 'se2', dev: 'iPhone 15 · Gr8r app', loc: 'San Francisco, US', at: '2 hours ago' },
      { id: 'se3', dev: 'Windows · Edge', loc: 'Oakland, US', at: 'Sep 12' },
    ],
    tfa: false,
```

**Why:** these are the seed's mirror of the dead doc fields. The `'San Francisco, US'` location entries die
here (D-19: location column dropped, no placeholder). `seed.json` is a build artifact (not committed), so
regenerating it via `npm run seed:json` is only needed if the build pipeline requires it (Assumption A6).

---

### `src/locales/en.json` + `fr.json` — new keys (D-18, D-28, P-D)

**Analog:** existing `settings.sessions.*` keys (`en.json:1249-1251`, `fr.json:1249-1251`), `toast.*` keys
(`en.json:232-233`), `common.justNow` (`en.json:6`), `err.sessionExpired` (`en.json:1446`).

**Keys that ALREADY exist and are reusable (no new entry needed):**
- `settings.sessions.lead`, `settings.sessions.thisDevice`, `settings.sessions.revokeAll` — both locales
- `toast.sessionSignedOut`, `toast.signedOutOthers` — both locales
- `palette.signOut` — both locales
- `common.justNow` — both locales (the "Active now" cell)
- `act.signOutOthersTitle`, `act.signOutOthersBody`, `act.signOutOthers` — used by the existing `A.revokeAll`

**New keys needed — `dev.*` device labels (D-18), add to BOTH `en.json` and `fr.json`:**
```json
// en.json — add beside settings.sessions.* (:1249-1251) or in a dev.* block
"dev.ios": "iOS",
"dev.android": "Android",
"dev.mac": "Mac",
"dev.windows": "Windows",
"dev.linux": "Linux",
"dev.edge": "Edge",
"dev.opera": "Opera",
"dev.chrome": "Chrome",
"dev.firefox": "Firefox",
"dev.safari": "Safari"
```
```json
// fr.json — French equivalents
"dev.ios": "iOS",
"dev.android": "Android",
"dev.mac": "Mac",
"dev.windows": "Windows",
"dev.linux": "Linux",
"dev.edge": "Edge",
"dev.opera": "Opera",
"dev.chrome": "Chrome",
"dev.firefox": "Firefox",
"dev.safari": "Safari"
```
(Device names are brand names — typically unchanged in French, but the catalogue must still carry them for
the i18n-scan gate.)

**New key needed — D-28 revocation toast, add to BOTH locales:**
```json
// en.json — beside err.sessionExpired (:1446)
"err.signedOutElsewhere": "You have been signed out from another session."
```
```json
// fr.json — beside the fr.json equivalent
"err.signedOutElsewhere": "Vous avez été déconnecté depuis une autre session."
```

**Critical constraint (Pitfall P-D):** `err.signedOutElsewhere` is composed **client-side only** (in
`signOutRevoked()`), never emitted by `server.js`. It **must** be appended to the `CLIENT_ONLY_ERR_CODES`
allowlist in `test/error-codes.test.mjs:192-259` or the reverse-parity test fails. If instead the planner
picks the explicit `err.sessionNotFound` server code (Open Question 4), that code needs `err.sessionNotFound`
in **both** locales (forward parity). Run `npm test && npm run build` — `prebuild` runs
`scripts/i18n-scan.mjs` and rejects uncatalogued UI literals.

---

### `test/migration.test.mjs` — EXTEND, do not author a new file (AUTH-02, D-32)

**Analog:** `test/migration.test.mjs` itself — the `legacyColumns` capture (`:29-39`), the absence
assertions (`:52-56`), the plan/invoices write-then-clean precedent (`:147-163`), the `snapshot()` +
second-boot test (`:166-196`).

**Existing `legacyColumns` capture (extend `:29-39`):**
```js
// test/migration.test.mjs — extend the table list at :31 to include users and sessions
legacyColumns = withDb(path.join(dataDir, 'gr8r.db'), db =>
  Object.fromEntries(
    ['workspaces', 'memberships', 'invites', 'users', 'sessions'].map(table => [
      table,
      db.prepare(`pragma table_info(${table})`).all().map(c => c.name),
    ]),
  ),
);
```

**Pre-boot absence assertions — extend the existing test at `:52-56`:**
```js
test('first boot writes exactly one pre-migration backup and logs its path', () => {
  // ... existing assertions ...
  assert.equal(legacyColumns.sessions.includes('ip'), false, 'fixture has no sessions.ip');
  assert.equal(legacyColumns.sessions.includes('user_agent'), false, 'fixture has no sessions.user_agent');
  assert.equal(legacyColumns.sessions.includes('last_seen_at'), false, 'fixture has no sessions.last_seen_at');
  assert.equal(legacyColumns.users.includes('two_fa_enabled'), false, 'fixture has no users.two_fa_enabled');
  assert.equal(legacyColumns.users.includes('two_fa_secret'), false, 'fixture has no users.two_fa_secret');
  assert.equal(legacyColumns.users.includes('two_fa_last_step'), false, 'fixture has no users.two_fa_last_step');
  // ...
});
```

**Post-boot column-set assertions (new test, after the existing first-boot tests):**
```js
test('first boot lands the full dormant column set and the login_challenges table', () => {
  assert.deepEqual(
    withDb(server.dbPath, db => db.prepare('pragma table_info(sessions)').all().map(c => c.name)),
    ['token_hash', 'user_id', 'created_at', 'expires_at', 'label', 'ip', 'last_seen_at', 'user_agent'],
  );
  const uCols = withDb(server.dbPath, db => db.prepare('pragma table_info(users)').all().map(c => c.name));
  for (const c of ['two_fa_enabled', 'two_fa_secret', 'two_fa_last_step'])
    assert.ok(uCols.includes(c), `users.${c} is present`);
  assert.equal(
    withDb(server.dbPath, db => db.prepare('select count(*) as n from sqlite_master where type = ? and name = ?').get('table', 'login_challenges').n,
    1,
    'login_challenges table exists',
  );
});
```

**Served + stored doc-shape assertions (the P-A regression signal — mirror the plan/invoices precedent at `:147-163`):**
```js
test('a legacy document carrying sessions and tfa hydrates and saves without them', async () => {
  const signedIn = await login(server.base, 'alice@legacy.local', LEGACY_PASSWORD);

  const read = await signedIn.client.get(`/api/workspaces/${SLUG}`);
  assert.equal(read.status, 200, 'a legacy document with sessions/tfa hydrates');
  assert.equal('sessions' in read.data.doc.data, false, 'the served doc drops sessions');
  assert.equal('tfa' in read.data.doc.data, false, 'the served doc drops tfa');

  const doc = structuredClone(read.data.doc);
  const saved = await signedIn.client.put(`/api/workspaces/${SLUG}`, { revision: read.data.revision, doc });
  assert.equal(saved.status, 200, 'the legacy document saves');

  // P-A: the STORED row must be clean after a write, not just the served copy
  withDb(server.dbPath, db => {
    const row = db.prepare('select doc from workspaces where id = ?').get('ws_legacy');
    assert.equal(JSON.stringify(row.doc).includes('"tfa"'), false, 'the stored doc drops tfa after a write');
    assert.equal(JSON.stringify(row.doc).includes('"sessions"'), false, 'the stored doc drops sessions after a write');
  });
});
```

**The existing `snapshot()` (`:166-186`) already deep-equals `doc: row.doc`** — no new comparison machinery.
Optionally add the `two_fa_*` columns to the `users` selection at `:179-184` so the dormant NULLs are
explicitly pinned as unchanged. The existing second-boot test at `:188-196` then proves byte-identical no-op
for the new schema with zero new machinery.

**Critical constraint:** **do NOT clean the fixture** (`test/helpers/legacy-fixture.mjs:123`, `:125`).
Removing `sessions: []` / `tfa: false` from `legacyDoc()` would make the drift-guard test prove nothing —
they are the regression signal. The fixture is kept as-is; only the assertions in `test/migration.test.mjs`
change. (14-RESEARCH.md Pattern 2, §Runtime State Inventory.)

---

### `test/error-codes.test.mjs` — `CLIENT_ONLY_ERR_CODES` allowlist entry (P-D)

**Analog:** `test/error-codes.test.mjs:192-259` `CLIENT_ONLY_ERR_CODES` array (self).

**Append beside the existing entries (after `:234`, the last `workspaceLoadFailed` entry):**
```js
// test/error-codes.test.mjs CLIENT_ONLY_ERR_CODES — append
  'signedOutElsewhere', // toast composed in actions.js signOutRevoked() after a revoked 401
```

**Why:** `err.signedOutElsewhere` is catalogued in both locales but never emitted by `server.js` — it is
composed client-side only. The reverse-parity test (`:189-191`) diffs the `en.json` `err.*` namespace against
the server source and fails any catalogued code absent from both the server *and* this allowlist.

---

### `test/sessions.test.mjs` — NEW file (SESS-01, SESS-02, SESS-03, D-22/24, D-27, D-28)

**Analog (harness contract):** `test/membership.test.mjs:1-46` (the real-server `before`/`after` pattern),
`test/helpers/server.mjs` (`startServer`, `client`, `login`, `withDb`).

**The harness contract, verbatim (`test/helpers/server.mjs:133-153`):**
```js
export async function login(base, email, password) {
  const account = client(base, email);
  const res = await account.post('/api/auth/login', { email, password });
  return { client: account, status: res.status, data: res.data };
}
export function withDb(dbPath, fn) {
  const db = new DatabaseSync(dbPath);
  try { return fn(db); } finally { db.close(); }
}
```

**The `client()` HTTP helper (`test/helpers/server.mjs:97-131`):**
```js
export function client(base, name = 'client') {
  let cookie = '';
  async function request(method, pathname, body) {
    const headers = {};
    if (cookie) headers.cookie = cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(base + pathname, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const line of res.headers.getSetCookie?.() || []) {
      const pair = line.split(';')[0];
      if (pair.startsWith('gr8r_session=')) cookie = pair;
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    return { status: res.status, data, name };
  }
  return { name, cookie: () => cookie, get: ..., post: ..., put: ..., patch: ..., del: ... };
}
```

**New file skeleton — follows `test/membership.test.mjs:1-46` exactly (no mocks, own server + temp DB):**
```js
/* Phase 14 session ground truth over HTTP: metadata capture, per-row revoke,
   revoke-others (keep-current), opaque-id non-leakage, throttled last_seen_at,
   and the revoked-browser 401 teardown. Real server, isolated DATA_DIR, no mocks. */
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { ADMIN, login, startServer, withDb } from './helpers/server.mjs';

let server;

before(async () => { server = await startServer(); });
after(async () => { await server?.stop(); });

test('SESS-01: GET /api/auth/sessions returns the caller rows with current marker and no token_hash', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const listed = await a.client.get('/api/auth/sessions');
  assert.equal(listed.status, 200);
  assert.equal(listed.data.sessions.length, 1);
  const s = listed.data.sessions[0];
  assert.equal(s.current, true, 'the caller row is marked current');
  assert.equal(typeof s.id, 'string');
  assert.equal(s.id.length, 12, 'opaque id is the 12-char hash prefix');
  assert.equal(listed.data.sessions.some(x => 'tokenHash' in x || 'token_hash' in x), false, 'D-27: no token_hash');
  // D-22/D-24 metadata: ip + user_agent populated at login
  assert.ok(s.ip, 'ip is captured at login');
  assert.ok(s.userAgent, 'user_agent is captured at login');
  assert.ok(typeof s.lastSeenAt === 'number', 'last_seen_at is set at insert');
});

test('SESS-02: revoke-others kills the second cookie and keeps the caller alive', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const b = await login(server.base, ADMIN.email, ADMIN.password);
  assert.equal(b.status, 200);

  const res = await a.client.del('/api/auth/sessions/others');
  assert.equal(res.status, 200);

  // Pitfall 9: both halves — the other browser is dead AND the caller is still alive
  assert.equal((await b.client.get('/api/workspaces/acme')).status, 401, 'the revoked cookie 401s');
  const stillIn = await a.client.get('/api/auth/me');
  assert.equal(stillIn.data.user.email, ADMIN.email, 'the caller is still signed in');
});

test('SESS-03: per-row revoke kills exactly one row; foreign ids are scoped', async () => {
  const a = await login(server.base, ADMIN.email, ADMIN.password);
  const c = await login(server.base, ADMIN.email, ADMIN.password);

  const listed = await a.client.get('/api/auth/sessions');
  assert.equal(listed.data.sessions.length, 2);
  const other = listed.data.sessions.find(s => !s.current);

  const del = await a.client.del(`/api/auth/sessions/${other.id}`);
  assert.equal(del.status, 204);
  assert.equal((await c.client.get('/api/workspaces/acme')).status, 401, 'the targeted row is dead');
  assert.equal((await a.client.get('/api/auth/me')).data.user.email, ADMIN.email, 'the caller survives');
});
```

**Critical constraints for this test file:**
- **Never mock SQLite or HTTP** — each test file owns its server + temp database (v1.1 carry-forward).
- **Pitfall 9 (self-DoS):** SESS-02 must assert **both** halves — the second cookie 401s *and* the caller
  is still alive. A test that only asserts the other session is gone misses the self-DoS.
- **P-G (D-27 non-leakage):** SESS-01 asserts no `token_hash` / `tokenHash` in any response row.
- **D-22/D-24:** use `withDb(server.dbPath, db => …)` for direct column assertions (e.g. that only
  `last_seen_at` is touched and no other column churns). The threshold is ~60 s, so a test that makes
  two requests within a band should see at most one write.
- **Throttle budget (precedent from `membership.test.mjs:3-5`):** the server throttles login attempts to
  five per IP per window. This suite should spend its attempts deliberately or use separate
  `signup()`-created accounts to avoid burning the budget.
- **D-28 401 teardown:** the server-side assertion is simply that the revoked cookie's next request 401s
  (the client-side toast/redirect is exercised by the `gr8r:save-error` listener, not by this node:test suite).

---

## Shared Patterns

### Authentication / identity
**Source:** `server.js:1122-1141` (`currentUser`, `requireUser`)
**Apply to:** All 3 new routes; the `currentUser` modification itself.
```js
function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    fail(res, 401, 'signInRequired', 'Sign in to continue');
    return null;
  }
  return user;
}
```
Every new route calls `requireUser(req, res)` and returns early on null. The caller's `user.id` is always
bound from `requireUser()` — never from the path param (P-F).

### CSRF guard on mutations
**Source:** `server.js:1088-1093` (`sameOrigin`)
**Apply to:** Both new DELETE handlers (and it is already on the existing POST handlers at `:1228`, `:1286`).
```js
if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
```
**Must be the first statement** of both new DELETE handlers, before any body read or throttle (P-K).

### Error envelope
**Source:** `server.js:1038-1054` (`json`, `fail`)
**Apply to:** All 3 new routes.
```js
function json(res, status, body) { /* Content-Type: application/json, Cache-Control: no-store */ }
function fail(res, status, code, message, extra) { return json(res, status, { error: message, code, ...extra }); }
```
Every error is `{ error, code }` flat. No route builds an error object by hand.

### Client API boundary
**Source:** `src/core/api.js:39-64` (`call()`)
**Apply to:** All 3 new `api.*` methods. Returns `{ok, status, data, error}`; `error` is translated via
`tErr()` when the server sends a `code`. Never call `fetch` directly from `actions.js` or `settings.js`.

### In-memory throttle Map with bounded cleanup
**Source:** `server.js:1161-1173` (`attempts` Map / `tooMany()`)
**Apply to:** The new `lastSeenNext` Map (D-23). Same pattern: `new Map()`, keyed by token_hash, cleanup
when `size > 5000`. No SQLite table for this (D-23).

### Fetch-on-mount + re-render after
**Source:** `src/actions/actions.js:199-210` (`A.go`) + `:1766-1793` (`refreshMembers`)
**Apply to:** `A.go` hook extension + `refreshSessions()`. Pattern: `api.X()` → store in `S.ui` → `render()`.
No polling, no sockets (D-29).

### i18n catalogue (EN + FR bilateral)
**Source:** `src/locales/en.json` + `fr.json`; gate at `scripts/i18n-scan.mjs` (prebuild) +
`test/error-codes.test.mjs` (bilateral `err.*` parity).
**Apply to:** Every new UI string (`dev.*`, `err.signedOutElsewhere`). Every client-only key appended to
`CLIENT_ONLY_ERR_CODES`. Run `npm test && npm run build` before calling it done.

### Real-server test harness
**Source:** `test/helpers/server.mjs` (`startServer`, `client`, `login`, `signup`, `withDb`) +
`test/helpers/legacy-fixture.mjs` (`createLegacyDb`, `legacyDoc`)
**Apply to:** `test/sessions.test.mjs` (new) and `test/migration.test.mjs` (extended). Never mock SQLite
or HTTP; each suite owns its server + temp DB.

### Doc-field strip (read + write)
**Source:** `server.js:272-281` (`normalizeDoc`) + `server.js:568-601` (`docFromClient`)
**Apply to:** The `sessions`/`tfa` removal. **Two delete sites** — read path (`delete out.data.X`) *and*
write path (`delete next.data.X`). Precedent: `plan`/`invoices` at `:597-598`. (Pitfall P-A.)

---

## No Analog Found

None. Every file and every edit site has a same-codebase precedent. The only "new" file (`test/sessions.test.mjs`)
follows the `test/membership.test.mjs` + `test/helpers/server.mjs` harness contract exactly.

---

## Metadata

**Analog search scope:** `server.js` (full), `src/core/api.js`, `src/core/utils.js`, `src/actions/actions.js`,
`src/pages/settings.js`, `src/data/seed.js`, `src/main.js`, `src/locales/{en,fr}.json`,
`test/migration.test.mjs`, `test/membership.test.mjs`, `test/error-codes.test.mjs`,
`test/helpers/{server,legacy-fixture}.mjs`.

**Files scanned:** 22 (12 touched + 1 new + 9 analog-only).

**Pattern extraction date:** 2026-10-26.

**Planner notes — the four mechanical traps that will fail a careless implementation** (from
14-RESEARCH.md §Summary):
1. **Strip in BOTH doc paths** (`normalizeDoc` *and* `docFromClient`) — P-A. One site alone leaves the
   stored doc dirty forever.
2. **Add columns to BOTH migration surfaces** (SCHEMA DDL *and* `ensureColumn`) — P-B. One alone breaks
   fresh or existing installs.
3. **Two i18n/error-code gates** — forward parity (every `fail(res, N, 'code')` in server.js needs
   `err.<code>` in both locales) and reverse parity (every catalogued client-only `err.*` code needs a
   `CLIENT_ONLY_ERR_CODES` entry) + the `prebuild` i18n-scan gate — P-D.
4. **Update all 3 session inserts** (login, signup, invite-accept) identically — P-L. Forgetting the
   third leaves invite sessions with NULL metadata.

**Planner notes — open questions to resolve before planning** (from 14-RESEARCH.md §Open Questions):
- OQ1: `users.two_fa_enabled` → recommended `integer not null default 0` (constant default, no rewrite).
- OQ2: Settings › 2FA tab → recommended: remove the `2fa` entry from `SET_NAV` and the `case '2fa'` block;
  Phase 16 restores both. Most honest option.
- OQ3: Opaque id scheme → recommended: hash prefix (first 12 hex chars of `token_hash`); survives VACUUM,
  needs no extra state.
- OQ4: New `err.sessionNotFound` or idempotent 204 → recommended: idempotent 204 (avoids a new error code).
