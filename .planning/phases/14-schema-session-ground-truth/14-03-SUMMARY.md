---
phase: 14-schema-session-ground-truth
plan: 03
subsystem: session-revocation
tags: [sessions, revocation, rest, throttle, security, node-test]
requires:
  - 14-01 (8-column sessions table with ip/user_agent/last_seen_at landed dormant)
  - 14-02 (api.sessions()/revokeSession(id)/revokeAllSessions() client methods; err.signedOutElsewhere)
  - 13-DECISIONS.md D-18/D-20/D-22/D-23/D-24/D-25/D-26/D-27/D-28
provides:
  - metadata capture (ip, user_agent, last_seen_at=created_at) at all three sessions insert sites (login, signup, invite-accept)
  - touchLastSeen() throttled heartbeat — one write per session per 60s (LAST_SEEN_BAND), lastSeenNext in-memory map with bounded cleanup
  - GET /api/auth/sessions — caller's live sessions with opaque 12-char hex ids, current marker, no token_hash
  - DELETE /api/auth/sessions/:id — user-scoped, idempotent 204 (OQ4 resolution, no new error code)
  - DELETE /api/auth/sessions/others — keep-current SQL, live { revoked, remaining } counts
  - test/sessions.test.mjs — 5-test real-server suite (SESS-01/02/03, throttle band, D-28 teardown)
affects:
  - 14-04 (settings sessions page consumes these endpoints through the 14-02 client methods)
  - 15 (password change reuses the exact keep-current DELETE pattern — Phase 14 pinned contract)
tech-stack:
  added: []
  patterns:
    - opaque hash-prefix route ids (12-char regex-gated path param, LIKE-prefix SQL join back to token_hash)
    - write-throttled hot path (per-key in-memory eligibility map + DB-stored timestamp fallback)
    - server-restart test technique to clear in-memory throttle state (T-14-07 documented behavior)
key-files:
  created:
    - test/sessions.test.mjs
  modified:
    - server.js
decisions:
  - idempotent 204 for missing/foreign session ids (OQ4) — no sessionNotFound error code, no i18n keys, no CLIENT_ONLY_ERR_CODES entry
  - restart-the-server test technique for the out-of-band throttle probe — login never calls currentUser(), so aging rows before the first authenticated post-restart request isolates the write path; the in-restart GET response already reflects the post-touch value (requireUser runs currentUser before the endpoint SELECT)
  - route order: exact pathname === '/api/auth/sessions/others' before the [0-9a-f]{12} regex (defensive ordering, disjoint today)
metrics:
  duration: 4min
  completed: 2026-10-26
status: complete
estimate:
  tokens: 45000
actuals:
  tokens: 3941
  tasks: 3
  commits: 4
plan_head_before: 11c60d4667e4da70e9f2001a23280526d0a3efac
plan_head_after: 5adf3864f02e169f2b557f96c77d3cf102b4e129
commits: 4
---

# Phase 14 Plan 03: Server Session Revocation Primitive Summary

Three RESTful endpoints on /api/auth/sessions (list / revoke one / revoke all others) backed by real metadata capture at every session-creation site and a 60s-throttled last_seen heartbeat — the revocation primitive Phase 15's password change will reuse verbatim.

## What Was Built

### Task 1 — Metadata capture + throttled last_seen_at (commit f10b9cd)

- **All three insert sites byte-identical** (Pitfall P-L): login (POST /api/auth/login), signup (POST /api/auth/signup), invite-accept (POST /api/invites/:token via createUser path) now insert seven columns — `token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at` — with `ua = String(req.headers['user-agent'] || '')`, `ip = clientIp(req)`, and `last_seen_at = t` (a just-created session was seen at creation; D-25's NULL fallback only matters for pre-upgrade rows).
- **`label` never written server-side** (D-18) — the column stays NULL; the 14-02 `deviceLabel(ua)` client renderer owns it.
- **currentUser()** now selects `s.last_seen_at` alongside `u.*` and calls `touchLastSeen(tokenHash, row.last_seen_at, now())` after a successful join. No memoization (Pitfall 10), no expiry-behavior change.
- **touchLastSeen() + lastSeenNext Map + LAST_SEEN_BAND (60 * 1000)** beside the existing `attempts` throttle: in-memory next-eligible check first, then stored-timestamp band check, then the single `update sessions set last_seen_at` write, then bounded cleanup at size > 5000 (same pattern as `attempts`). State is lost on restart — accepted per T-14-07.

### Task 2 — Three revocation endpoints (commit 76d4c29, style pass 994b7f5)

- **GET /api/auth/sessions**: requireUser → all live sessions (`expires_at > now()`, `order by created_at desc`) → mapped to `{ id (12-char hex prefix), userAgent, ip, createdAt, lastSeenAt, current }`. The full `token_hash` never appears in any response body (D-27, T-14-01).
- **DELETE /api/auth/sessions/others**: exact `pathname ===` match **before** the `:id` regex (defensive ordering per plan); `sameOrigin(req)` first statement (P-K, T-14-04); keep-current SQL `delete ... where user_id = ? and token_hash != ?` (P-H, T-14-02); live post-delete counts `{ revoked, remaining }` from a fresh COUNT (Pitfall 10).
- **DELETE /api/auth/sessions/:id**: `[0-9a-f]{12}` regex path param; sameOrigin first; user-scoped `delete ... where user_id = ? and token_hash like ?` (P-F, T-14-03 — a foreign id can never be revoked); **idempotent 204** for both valid and missing/foreign ids (OQ4 resolution — no new error code, no i18n keys, no CLIENT_ONLY_ERR_CODES entry).
- No new auth middleware, no new error codes, no schema changes.

### Task 3 — test/sessions.test.mjs (commit 5adf386)

Five real-server tests (own temp dataDir, real SQLite, no mocks):

1. **SESS-01** — list shape (12-char hex id, non-empty userAgent/ip, numeric createdAt), no `tokenHash`/`token_hash` key anywhere in the response, `current === true` marker, and withDb proof that `ip`/`user_agent`/`last_seen_at` are non-NULL in the stored row.
2. **SESS-02** (Pitfall 9, both halves) — disconnect-all returns `{ revoked >= 1, remaining: 1 }`; the second browser's next request is 401 while the caller's `GET /api/auth/me` is 200.
3. **SESS-03** — three logins after a table reset → exactly 3 rows; revoking one non-current id kills exactly the victim (sorted `[200, 401]` across the two other clients) and a repeat DELETE is still 204 (idempotency).
4. **D-22/D-24 throttle** — two in-band GETs leave `lastSeenAt === createdAt` (no write); then a **server restart with the same dataDir** (documented T-14-07 behavior: in-memory map lost) + aging all stored `last_seen_at` past the band before any authenticated request proves the next GET fires exactly one write (DB `max(last_seen_at)` recent).
5. **D-28** — the revoked browser's 401 carries `code: 'signInRequired'` (the code the client maps to `err.signedOutElsewhere`); the revoking caller stays alive.

## Verification Performed

- `node --test test/sessions.test.mjs` — **5/5 pass**.
- `node --test test/migration.test.mjs` — **14/14 pass** (no regression from the insert-site changes).
- `npm test` — **455/456 pass**; the single failure is the pre-existing `test/i18n-prefs.test.mjs:243` ("roadmap carries the phase 6 section") already logged to deferred-items.md in 14-01 and reproduced at both prior plans' base commits — unrelated to 14-03.
- `npm run lint` — clean; `npx prettier --check` — clean (after style commit 994b7f5 folded the seven-column inserts to prettier's preferred single-line shape).
- `grep -c 'update sessions set last_seen_at' server.js` → **1** (the throttled write only).
- `grep -c 'insert into sessions' server.js` → **3** (login, signup, invite-accept).
- No `json(res` call site in server.js emits `token_hash`/`tokenHash` (grep-verified 0).

## Deviations from Plan

None — the plan was executed exactly as written. Two in-task clarifications worth recording (not deviations):

1. **Throttle test needed a server restart**: the plan's Test 4 outline ("set it to an old timestamp with withDb, then GET again") would be defeated by the plan's own Task 1 throttle semantics — the in-memory `lastSeenNext` entry set by the earlier GETs keeps throttling regardless of DB state. The test uses the harness-supported same-dataDir restart (map lost per T-14-07), ages the rows before the first post-restart authenticated request (login never calls `currentUser()`), and asserts the single fired write. This tests more truthfully: it exercises the DB-band branch, not just the map branch.
2. **Post-touch read order pinned in the test**: `requireUser()` runs `currentUser()` (including the touch) *before* the endpoint's own SELECT, so an out-of-band probe response already shows the post-touch timestamp — the test asserts the fired write through both the response and a persisted withDb read.

## Threat Model Compliance

- **T-14-01** (Info Disclosure): mitigated — opaque 12-char ids only; `token_hash` provably absent from every response body (test + grep).
- **T-14-02** (DoS): mitigated — keep-current SQL; both halves tested (other cookie 401, caller 200).
- **T-14-03** (EoP): mitigated — user-scoped WHERE on both DELETEs; user_agent/IP are display-only and never consulted for authorization.
- **T-14-04** (Tampering): mitigated — `sameOrigin(req)` is the first statement in both DELETE handlers, before any body read or auth check.
- **T-14-07** (Repudiation, accept): the throttle map is in-memory and lost on restart — one harmless extra write per session per restart; explicitly exercised (not just tolerated) by the throttle test.

## Auth Gates

None.

## Known Stubs

None. `lastSeenAt` may be NULL for pre-upgrade rows — that is the D-25 fallback contract consumed by the 14-04 renderer, not a stub. Every `<verify>` ran and passed.

## Self-Check: PASSED

- Files on disk: `server.js` (modified), `test/sessions.test.mjs` (created, 5/5).
- Commits verified in git log: `f10b9cd`, `76d4c29`, `994b7f5`, `5adf386`.
- `git rev-list --count 11c60d4..5adf386` = 4 (matches `commits: 4`).
