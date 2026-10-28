# Phase 15: Password Change End-to-End - Research

**Researched:** 2026-10-27
**Domain:** Server-backed password change on a zero-dependency Node.js/`node:sqlite` app
**Confidence:** HIGH

## Summary

Every primitive this phase needs already exists in the codebase — this is a wiring phase, not an
invention phase. The server has `hashPassword`/`verifyPassword` (scrypt with per-password salt,
`server.js:190-204`), a `transaction(fn)` helper (`server.js:779`), the Phase 14 keep-current
revocation SQL (verbatim at `server.js:1370`), the `tooMany` in-memory throttle
(`server.js:1196`), and the `sameOrigin` guard. The client already renders the full 3-field form
(`src/pages/settings.js:377-385`) and the stub `A.savePassword`
(`src/actions/actions.js:2378-2394`) already validates locally — it just fakes the server call.

The only genuinely new server code is one route block (`PATCH /api/auth/password`) of roughly
30–40 lines following the exact shape of the adjacent `/api/auth/sessions` DELETE routes. The only
new client work is replacing the `loadingBtn` fake in `A.savePassword` with a real
`api.changePassword` call, mapping two new error codes, clearing fields on success, refreshing the
sessions tab, and toasting the honest two-part message. New i18n keys (EN+FR) and the
`error-codes.test.mjs` catalogue checks are the main cross-cutting gates.

**Primary recommendation:** One server plan (route + transaction + throttle + tests) and one
client plan (API method + action rewiring + i18n keys + catalogue pins + tests), mirroring how
Phase 14 split 14-03/14-04.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Implementation Decisions
- **D-34:** Dedicated route `PATCH /api/auth/password` with body `{ currentPassword, newPassword }`
  — does NOT extend `PATCH /api/auth/me`. Matches D-26 flat noun-resource style; keeps the
  sensitive change out of `/me`'s mass-assignment guard (locale only).
- **D-35:** `sameOrigin(req)` guard required before any processing.
- **D-36:** Server-side strength validation uses the **same rules as signup** (`server.js:1396`:
  ≥ 10 chars + digit or symbol, existing `passwordTooWeak` code). Client validates first line;
  server enforces independently.
- **D-37:** Success response is minimal: `200 { ok: true }` — no `revokedCount` exposed.
- **D-38:** Dedicated error codes: `wrongCurrentPassword`, existing `passwordTooWeak`,
  `passwordRequired` (empty fields). Client translates via the `err.*` catalogue (ERR-01).
- **D-39:** On `wrongCurrentPassword`, client clears only the current-password field, keeps the new
  password input, shows the error under the current field — no full-form wipe.
- **D-40:** Throttle key is **`user_id`** via existing `tooMany()`, budget **10 tries / 15 min**.
- **D-41:** A wrong current-password attempt **consumes budget**.
- **D-42:** Lockout copy follows **D-13 exactly**: generic `tooManyAttempts` message, no timing,
  no `Retry-After`.
- **D-43:** After success: fields cleared, honest toast « Mot de passe mis à jour · autres
  sessions déconnectées », sessions tab refreshes (D-29 pattern), user stays signed in.
- **D-44:** Second (revoked) browser handled by the existing 14-05 central 401 intercept →
  `signOutRevoked()` with `err.signedOutElsewhere`. No new work — a test must verify the routing.
- **D-45:** Client strength rules identical to signup; existing `pwStrength` meter stays.

### the agent's Discretion
- Exact toast copy within the honest-copy rule (catalogued EN+FR).
- Test file placement following existing `test/` conventions.
- Handler ordering within the `/api/auth/*` route block.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. Explicitly out: TOTP behavior (Phase 16), login-flow
rework (Phase 17), e2e sweep (Phase 18).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PASS-01 | Change requires correct current password; wrong one fails with no change; new password logs in, old one does not | `verifyPassword` against `users.password` scrypt hash; whole mutation inside `transaction()` so a failed verify writes nothing |
| PASS-02 | Two browsers: change in one → other's next request 401, changing session stays signed in — one `transaction()` | `delete from sessions where user_id = ? and token_hash != ?` (keep-current SQL, `server.js:1370`) inside the same transaction as the rehash |
| PASS-03 | Success toast states exactly what happened (password updated, other sessions disconnected) | New toast key, count-free per D-37; catalogued EN+FR before the i18n-scan gate |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Current-password verification | API/Backend (server.js) | — | Secret material (scrypt hash) never leaves the DB; client can never verify |
| Strength validation | API/Backend | Client (UX-first) | Client validates first line (D-45); server re-enforces independently (D-36) |
| Rehash + revoke-others atomicity | API/Backend (transaction) | — | SQLite single-writer transaction; client has no role |
| Revoked-session 401 UX | Client (14-05 intercept) | API (401 emission) | Existing central teardown; Phase 15 only tests it |
| Honest success/failure copy | Client | — | Toast/error spans in settings form; i18n catalogue |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:crypto | built-in | `scryptSync` verify + rehash | Already used by `hashPassword`/`verifyPassword` [VERIFIED: server.js:190-204] |
| node:sqlite | built-in | sessions/users tables, `transaction()` | Project zero-dependency invariant [VERIFIED: STATE.md] |
| node:test | built-in | Server tests, own-server+temp-db per file | House test convention [VERIFIED: STATE.md] |

**No new packages.** Installation: none. Zero runtime dependencies is a pinned project invariant
— no `npm install` in this phase, so no Package Legitimacy Audit is required (no external
packages installed).

## Architecture Patterns

### System Architecture Diagram

```
Browser A (changing)                Browser B (other session)
     |                                    |
     | PATCH /api/auth/password           | any next request
     | {currentPassword,newPassword}      |
     v                                    |
[Client] A.savePassword                   |
  1. local validation (D-45)              |
  2. api.changePassword() ──fetch──>      |
                                          v
server.js route block:
  1. sameOrigin(req) → 403            [sessions join] currentUser()
  2. requireUser → 401                fails (row deleted) → 401 signInRequired
  3. tooMany(user_id, 10, 15min) → 429        |
  4. readJson; empty fields → passwordRequired|
  5. strength check → passwordTooWeak         v
  6. transaction(fn):                   [api.js 401 intercept (14-05)]
       verifyPassword(cur, hash)        signOutRevoked() → err.signedOutElsewhere
          ├─ wrong → wrongCurrentPassword 403
          └─ ok → update users.password = hashPassword(new)
                  delete sessions where user_id=? and token_hash != current
  7. 200 { ok: true }
     |
     v
[Client] clear 3 fields, refreshSessions(), toast « password updated ·
         other sessions disconnected » — stay signed in
```

### Recommended Handler Shape (server)

Pattern copied from the sibling routes (sameOrigin → requireUser → guard → readJson → business
logic). Verbatim strengths rule from signup [VERIFIED: server.js:1396-1398]:

```js
if (password.length < 10 || !/[0-9\W]/.test(password)) {
  return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
}
```

Verbatim keep-current revoke SQL to reuse [VERIFIED: server.js:1369-1370]:

```js
// Keep-current (P-H): the caller's own session is excluded by the != clause.
const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
```

Verbatim `transaction(fn)` [VERIFIED: server.js:779-788]:

```js
function transaction(fn) {
  db.exec('begin immediate');
  try {
    const out = fn();
    db.exec('commit');
    return out;
  } catch (err) {
    db.exec('rollback');
    throw err;
  }
}
```

Skeleton for the new route (order per D-35/D-40/D-36; exact copy strings below are `[ASSUMED]`
for the two new codes — see Assumptions Log):

```js
if (pathname === '/api/auth/password' && method === 'PATCH') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  if (tooMany(`pwchange|${user.id}`, 10, 15 * 60 * 1000))
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const body = await readJson(req);
  const cur = String(body?.currentPassword || '');
  const nw = String(body?.newPassword || '');
  if (!cur || !nw) return fail(res, 400, 'passwordRequired', 'Enter your current and new password');
  if (nw.length < 10 || !/[0-9\W]/.test(nw))
    return fail(res, 400, 'passwordTooWeak', 'Use at least 10 characters, including a number or symbol');
  const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);
  const ok = transaction(() => {
    if (!verifyPassword(cur, user.password)) return false;   // user.password from sessions join
    db.prepare('update users set password = ? where id = ?').run(hashPassword(nw), user.id);
    db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
    return true;
  });
  if (!ok) return fail(res, 403, 'wrongCurrentPassword', 'Current password is incorrect');
  return json(res, 200, { ok: true });
}
```

Notes on the skeleton:
- **`user.password` availability:** `currentUser()`'s select is `select u.*, ...` from the
  sessions join [VERIFIED: server.js:1171-1180], so the hash is on the user row — but re-reading
  the user row inside the transaction (fresh `select password from users where id = ?`) is safer
  and costless; either is acceptable, planner picks one.
- **Verify inside the transaction:** the `scryptSync` verify (~50–100 ms at N=16384) holds the
  `begin immediate` write lock briefly. Acceptable for this app's scale (single-node,
  single-writer SQLite already serializes writes); do NOT verify outside and write inside — the
  D-38/D-41 semantics require the attempt to be one atomic unit.
- **Throttle consumption on failure (D-41):** because `tooMany` is called before processing and
  the key persists across the request, a wrong-current-password 403 has already consumed one
  attempt. No extra bookkeeping needed.
- **Do NOT revoke self:** `token_hash != ?` with the *caller's* token hash — Pitfall 9
  (revoke-self-DoS). Getting the token hash from `parseCookies(req.headers.cookie)[COOKIE]` (same
  as `server.js:1346`) rather than from any body/param.

### Client Shape

Verbatim current stub to replace [VERIFIED: src/actions/actions.js:2378-2394] — note the local
validation block already matches D-45 and stays:

```js
A.savePassword = () => {
  const e = (S.ui.errors = {});
  const cur = $('#pw-cur').value,
    nw = $('#pw-new').value,
    cf = $('#pw-conf').value;
  S.ui.pwDone = false;
  if (!cur) e.pwCur = t('err.enterCurrentPassword');
  if (nw.length < 10 || !/[0-9\W]/.test(nw)) e.pwNew = t('err.passwordWeak');
  if (nw !== cf) e.pwConf = t('err.passwordMismatch');
  if (Object.keys(e).length) {
    render();
    return;
  }
  loadingBtn('pw-save', 800, () => {
    S.ui.pwDone = true;
    S.ui.pwNew = '';
    render();
    toast(t('toast.passwordUpdated'));
  });
};
```

API method pattern to copy [VERIFIED: src/core/api.js:237-245]:

```js
async revokeAllSessions() {
  return call('DELETE', '/api/auth/sessions/others');
},
```

New method: `async changePassword(currentPassword, newPassword) { return call('PATCH',
'/api/auth/password', { currentPassword, newPassword }); }` — auth-scoped, no slug guard, same
comment block as the sessions methods.

Error mapping (D-38/D-39): on `!res.ok`, set `e.pwCur`/`e.pwNew` from `t('err.' + res.data.code)`
for `wrongCurrentPassword` (clear only `#pw-cur`, keep `#pw-new` — the form already round-trips
`S.ui.pwNew` through `value="${esc(pw)}"` [VERIFIED: src/pages/settings.js:384]), `passwordTooWeak`
→ under new field, `passwordRequired` → under current field. Server error codes the client
doesn't know fall through to the existing generic error handling in `call()`.

Success (D-43): clear `#pw-cur`/`#pw-new`/`#pw-conf` + `S.ui.pwNew`, `S.ui.pwDone = true` (the
existing `.alert ok` banner at `settings.js:380` reuses `settings.pw.done`), `await
refreshSessions()` if the sessions tab pattern requires (refreshSessions is exported at
`actions.js:1800` and already called on settings mount at `actions.js:210`), toast the new
honest message.

### Anti-Patterns to Avoid
- **Faking success like the current stub:** `loadingBtn('pw-save', 800, …)` with no API call is
  exactly the lie this phase removes.
- **Putting the change on `PATCH /api/auth/me`:** D-34 forbids it (mass-assignment guard treats
  `/me` as locale-only).
- **Revoking all sessions including self:** `delete ... where user_id = ?` without the
  `token_hash != ?` clause logs the changing browser out (Pitfall 9).
- **Exposing `revokedCount`:** D-37 — `{ ok: true }` only.
- **Specific lockout copy / Retry-After:** D-42 forbids.
- **Verifying current password outside the transaction then writing inside:** two-step defeats
  PASS-02 atomicity (a wrong-password race could delete sessions with no rehash).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing/verify | New KDF or param change | `hashPassword`/`verifyPassword` [VERIFIED: server.js:190-204] | Existing scrypt format with `DUMMY_HASH`-style constant-time compare; changing params is out of scope |
| Atomicity | Manual begin/commit around statements | `transaction(fn)` [VERIFIED: server.js:779] | Rollback on throw already handled |
| Revoke-others | New SQL | Phase 14 keep-current SQL verbatim [VERIFIED: server.js:1370] | Tested in sessions.test.mjs; D-27/P-H semantics pinned |
| Throttling | Custom counter | `tooMany(key, max, windowMs)` [VERIFIED: server.js:1196-1202] | D-40 says "existing primitive" |
| Strength meter | New client logic | Existing `pwStrength`/`strengthMeter` (D-45) | Already rendered by the form |
| 401-on-revoked UX | New interceptor | 14-05 central intercept + `signOutRevoked()` [VERIFIED: actions.js:2123-2127] | D-44: no new work, only tests |

**Key insight:** every hard part (KDF, transactions, revocation, throttle, 401 teardown) landed in
Phases 13–14. The planner should resist any task that touches those primitives.

## Common Pitfalls

### Pitfall 1: Revoke-self-DoS (Pitfall 9 from .planning/research/PITFALLS.md)
**What goes wrong:** `token_hash != ?` omitted or fed the wrong hash → the changing browser's own
session is deleted mid-request; the success response then races a dead cookie.
**Avoid:** compute `tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE])` exactly as the
sessions GET does [VERIFIED: server.js:1346] and keep the `!=` clause.
**Warning signs:** success toast followed by an immediate `signInRequired` 401 on the next request.

### Pitfall 2: i18n-scan build gate
**What goes wrong:** new toast/error literals not catalogued EN+FR fail `node scripts/i18n-scan.mjs`
before the bundler runs [VERIFIED: STATE.md "i18n scan runs before the bundler"].
**Avoid:** add every new key (`err.wrongCurrentPassword`, `err.passwordRequired` if not present,
honest toast key) to BOTH `src/locales/en.json` and `src/locales/fr.json` in the same commit;
note `error-codes.test.mjs` also asserts every catalogued `err.*` code is emitted somewhere —
`wrongCurrentPassword` is emitted server-side so it passes the allowlist check
[VERIFIED: test/error-codes.test.mjs:257].

### Pitfall 3: Client cache of the verify result
**What goes wrong:** client treats any 401 after submit as "your session expired" instead of
letting the central intercept run — double teardown.
**Avoid:** `api.call()` already routes mid-session `signInRequired` 401s through the registered
teardown [VERIFIED: api.js:48 + auth-revoked.test.mjs header]; `A.savePassword` must not add its
own 401 branch (D-44).

### Pitfall 4: Stale user row in the transaction
**What goes wrong:** `user.password` from `currentUser()` was fetched before the transaction;
under concurrent changes the verify could compare against a stale hash.
**Avoid:** re-select the hash inside the transaction (cheap, single-node SQLite).

### Pitfall 5: Two-browser test flakiness
**What goes wrong:** test asserts browser B is dead before the transaction commits, or uses a
mocked DB.
**Avoid:** house convention — real server + temp DB, two real cookies against one server
[VERIFIED: STATE.md test conventions]; assert B's next authenticated request 401s and A's
succeeds after the 200.

## Code Examples

See Architecture Patterns for the route skeleton, the client action, and the verbatim primitives
(all quoted from source read this session).

## State of the Art

Not applicable — no library choices; everything is in-repo primitives. No deprecations touched.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Exact English copy for `wrongCurrentPassword` / `passwordRequired` server messages (skeleton strings) | Architecture Patterns | Cosmetic — the codes are pinned by D-38; copy is catalogued EN+FR and translated client-side (ERR-01), so server English text is low-stakes. Planner/user can adjust at review |
| A2 | `err.enterCurrentPassword`, `err.passwordWeak`, `err.passwordMismatch` keys already exist in locales (seen referenced in `A.savePassword` [VERIFIED: actions.js:2385-2387] but not grep-verified in `src/locales/*.json`) | Client Shape | If missing, i18n-scan fails loudly at build — cheap to catch; add to the i18n task if absent |
| A3 | Throttle key prefix naming (`pwchange|${user.id}`) | Route skeleton | Trivial — D-40 pins key=user_id and budget; prefix is cosmetic. Must not collide with login/signup keys |
| A4 | Verify-inside-transaction latency acceptable (~50–100ms lock hold) | Route skeleton | Negligible for single-node SQLite scale; alternative (verify outside, re-verify inside) adds complexity for no benefit here |

## Open Questions

1. **Does `settings.pw.done` banner stay alongside the new toast?**
   - What we know: the form has an existing `S.ui.pwDone` success banner (`settings.pw.done` key)
     and D-43 asks for a toast.
   - Recommendation: keep both (banner = "password updated", toast = the honest two-part message),
     or update the banner copy to match. Discretion area — planner picks.

2. **Should `PATCH /api/auth/password` also update the session's `last_seen_at`?**
   - What we know: `touchLastSeen` runs inside `currentUser()` already [VERIFIED: server.js:1178].
   - Recommendation: no extra work needed — the route is itself an authenticated request.

## Environment Availability

Step 2.6: SKIPPED — no external dependencies. Phase uses only built-in Node modules, the existing
Vite build, and the existing test harness. Verify commands from Phase 14 all confirmed present in
`package.json` conventions (npm test, node --test test/…, node scripts/i18n-scan.mjs).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (built-in), real-server + temp-DB per file |
| Config file | none needed — follow `test/sessions.test.mjs` / `test/auth-revoked.test.mjs` conventions |
| Quick run command | `node --test test/password-change.test.mjs` (new) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PASS-01 | Wrong current password → 403 `wrongCurrentPassword`, hash unchanged, sessions intact | integration (server) | `node --test test/password-change.test.mjs` | ❌ Wave 0 |
| PASS-01 | Correct change → old password fails login, new one succeeds | integration (server, uses login route) | same file | ❌ Wave 0 |
| PASS-01 | Empty fields → `passwordRequired`; weak new → `passwordTooWeak` | integration (server) | same file | ❌ Wave 0 |
| PASS-02 | Two cookies: after change, other cookie 401s, caller cookie still authenticates; one transaction (hash+revoke committed together) | integration (server, two cookies) | same file | ❌ Wave 0 |
| PASS-02/D-41 | 11 attempts within window → 429 generic `tooManyAttempts`, no `Retry-After` | integration (server) | same file | ❌ Wave 0 |
| PASS-02/D-44 | Revoked second browser: mid-session 401 routes through signOutRevoked with `signedOutElsewhere` | client (fetch-stubbed api.js) | `node --test test/auth-revoked.test.mjs` (extend) | ✅ extend |
| PASS-03 | Toast copy honest + count-free; keys catalogued EN+FR | i18n/catalogue | `node scripts/i18n-scan.mjs` && `node --test test/catalogue.test.mjs` | ✅ existing |
| Cross-origin | PATCH without same-origin headers → 403 `crossOriginRejected` | integration (server) | new file | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the new test file (server tasks) or extended auth-revoked + i18n-scan
  (client tasks)
- **Per wave merge:** `npm test`
- **Phase gate:** `npm run lint && npm run format:check && npm run build` (i18n-scan gate) +
  full `npm test` before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/password-change.test.mjs` — server integration file owning its server + temp DB
  (covers PASS-01/02 rows above)
- [ ] New locale keys in `src/locales/en.json` + `src/locales/fr.json` (before the scan gate)
- [ ] `test/error-codes.test.mjs` catalogue check passes automatically once the server emits
  `wrongCurrentPassword`; no file change expected unless the emit-heuristic misses the new route

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2.1 Password Security | yes | scrypt N=16384 rehash via `hashPassword`; strength rule ≥10 chars + digit/symbol (D-36) |
| V2.4 Credential Change | yes | Current-password verification required (PASS-01) — the core of this phase |
| V3 Session Invalidation | yes | Keep-current revoke-all inside the same transaction (PASS-02) |
| V4 Access Control | yes | `requireUser` 401; session scoped to `user_id` |
| V5 Input Validation | yes | `readJson`, string coercion, strength check server-side |
| V6 Cryptography | yes | node:crypto scrypt only — never hand-roll |
| V7.1.1 brute-force / anti-automation | yes | `tooMany(user_id, 10, 15min)` (D-40/41), generic lockout copy (D-42) |
| V9 CSRF / same-origin | yes | `sameOrigin(req)` 403 before processing (D-35) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Password guessing via stolen cookie | Spoofing | D-40/41: user_id-keyed budget, wrong attempts consume budget |
| Cross-origin password change | Tampering | sameOrigin 403 before body read |
| Session fixation post-change | Elevation | all other sessions revoked atomically; current session survives (D-43) |
| Timing oracle on current-password verify | Information Disclosure | `verifyPassword` uses `timingSafeEqual` [VERIFIED: server.js:202] |
| Feedback channel leaking account state | Information Disclosure | generic `tooManyAttempts` copy, no Retry-After (D-42); `{ ok: true }` only (D-37) |

## Sources

### Primary (HIGH confidence)
- `server.js` lines 190-204 (hash/verify), 779-788 (transaction), 1171-1180 (currentUser),
  1196-1202 (tooMany), 1340-1398 (sessions routes + signup strength) — read this session
- `src/actions/actions.js` lines 2378-2394 (savePassword stub), 210, 1800, 2123-2127 — read
- `src/pages/settings.js` lines 377-385 (password form) — read
- `src/core/api.js` lines 237-245 (auth-scoped API methods), line 48 (401 teardown) — read
- `src/locales/en.json`/`fr.json` line 1456/1472 (err.* catalogue) — read
- `test/auth-revoked.test.mjs`, `test/error-codes.test.mjs` — conventions read
- `.planning/phases/15-password-change-end-to-end/15-CONTEXT.md`, `.planning/STATE.md` — read

### Secondary
- `.planning/research/PITFALLS.md` Pitfall 9 (cited from CONTEXT.md; not re-read this session)

### Tertiary
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is in-repo and read verbatim this session
- Architecture: HIGH — route mirrors adjacent tested routes; no new primitives
- Pitfalls: HIGH — Pitfall 9 and i18n gate are established project invariants

**Research date:** 2026-10-27
**Valid until:** 2026-11-26 (in-repo facts; stable)
