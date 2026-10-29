# Phase 17: Login Second-Factor Flow - Research

**Researched:** 2026-10-27
**Domain:** Hand-rolled auth (server.js, node:sqlite, opaque cookies) — login challenge lifecycle, TOTP/recovery verify at login, structural pending=anonymity
**Confidence:** HIGH (all claims below are direct reads of the current codebase this session; no external packages involved)

## User Constraints (from CONTEXT.md)

### Locked Decisions
Copied verbatim from `17-CONTEXT.md` §decisions — the planner MUST honor all of D-60…D-75:

- **D-60:** Dedicated full-screen `s === '2fa'` branch in `src/pages/auth.js` rendering `authShell()` — no inline-swap on the login card.
- **D-61:** "Back to sign in" link **clears the challenge cookie**, abandons the challenge; shared throttle budget NOT reset.
- **D-62:** Code screen shows a **masked email** (`j***@d***.com` style).
- **D-63:** Masked email computed **server-side**, returned in the login response payload; nothing persisted, nothing client-computed.
- **D-64:** **One dual-shape code field** (`autocomplete="one-time-code"`) accepting 6-digit TOTP or `xxxx-xxxx` recovery code; server decides by shape. Reuses `normalizeRecoveryCode()`/`recoveryHash()`, mirrors D-57's disable precedent.
- **D-65:** **One generic error code** (e.g. `invalidTfaCode`) for both failure shapes — no oracle.
- **D-66:** Challenge lifecycle per D-03 exactly: 3 wrong codes or 5 minutes kills the challenge; shared budget governs; restart from password step. No override.
- **D-67:** Failure path per D-03/D-11 mechanics only — attempts counter on the `login_challenges` row + shared `tooMany()` budget, length-validate before `timingSafeEqual` (Pitfall 22), attempt increment BEFORE verify (race can't smuggle a 4th try). No artificial delay, no extra logging.
- **D-68:** Correct password on a 2FA-enabled account → `200 { pending2fa: true, maskedEmail }` + **only the challenge cookie** (~5 min Max-Age, never `SESSION_DAYS`). No session cookie, no user payload.
- **D-69:** Dedicated verify route (`POST /api/auth/tfa/login` suggested) with sameOrigin guard, `2fa-login|${ip}|${email}` throttle (D-11), consuming the challenge cookie. On success: atomically delete challenge row, mint session (`SESSION_DAYS`), set session cookie, return user payload. The password handler is NOT extended with a second identity-minting path.
- **D-70:** **No client persistence of pending state** — reload shows the login form again; no sessionStorage mirrors of auth state.
- **D-71:** 401-matrix proof scope: with challenge cookie held, assert 401 from a `requireUser()` API route, `GET /w/:slug/file/:id`, invite accept, `PATCH /api/auth/me`; plus `GET /api/auth/me` → `user: null`, and logout working from pending state (clears the challenge).
- **D-72:** Burned recovery code → straight to session, same as TOTP success; burn + session mint in the same transaction.
- **D-73:** Post-login banner "Recovery code used — you have N left" with settings link; N from the verify response.
- **D-74:** Last-remaining-code banner escalates copy; copy only, no behavior change.
- **D-75:** Post-verify landing = normal home/overview.

### the agent's Discretion
- Challenge-cookie name/serialization (separate from `projects_session`; ~5 min Max-Age; httpOnly/sameSite/Secure attributes matching `setSessionCookie` style).
- Exact verify-route path name and response key for remaining-recovery-count.
- Masking algorithm (never leak enough to enumerate).
- Test file placement per `test/` conventions (`tfa-enrollment.test.mjs` is the model); 401-matrix may be its own file.
- New locale keys EN+FR in-commit (i18n convention).
- Exact generic lockout replacement copy for the pre-existing 429 string, within D-13 (generic, no timing, no header).

### Deferred Ideas (OUT OF SCOPE)
None. Admin 2FA reset stays deferred from Phase 16; remember-me stays rejected. No e2e/i18n sweep (Phase 18), no settings-surface work (Phase 16 owns it).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TFA-05 | Enrolled users face a real second step at login; pending sign-in inert; recovery burn once; shared throttle budget, short-lived challenge | All findings below; the login handler branch, verify route, challenge lifecycle, and 401-matrix test design |

## Summary

Every primitive this phase needs already exists and was verified in the current code this session: the dormant `login_challenges` table ([VERIFIED: server.js:113-119] — `challenge_token_hash` PK, `user_id`, `expires_at`, `attempts default 0`, plus expiry index at :119), the recovery burn primitive (`normalizeRecoveryCode`/`recoveryHash` imported at [VERIFIED: server.js:49], defined at [VERIFIED: totp.js:96-99]), the TOTP verify with format gate + ±1 window + replay guard (`verifyTotpCode` [VERIFIED: totp.js:61-77]), the throttle (`tooMany` [VERIFIED: server.js:1257-1267]), the guards (`sameOrigin` :1179-1184, `requireUser` :1228-1235), and the session-mint recipe inside the current login handler ([VERIFIED: server.js:1352-1368]). This phase is wiring: branch the password-correct path, add one dedicated verify route, add the `s === '2fa'` client state, and prove anonymity with a 401-matrix test.

The security invariant is structural (D-02): the challenge lives under a **separate cookie name**, `requireUser()`/`currentUser()` ([VERIFIED: server.js:1213-1235]) read only the `projects_session` cookie (`COOKIE = 'projects_session'` [VERIFIED: server.js:78]) and only `sessions` rows — a pending sign-in matches zero session rows, so every endpoint family answers 401 with zero new code. The matrix test exists to prove the structural claim, not to enforce it.

**Primary recommendation:** one server plan (login branch + verify route + challenge lifecycle + D-13 copy replacement) and one client plan (`s === '2fa'` state + pending-response handling + post-login banner), with the 401-matrix test landing in the server plan; keep the `attempts.delete()` success-clear move as its own explicitly-verified task since it is the throttle-invariant crux (Pitfall 18).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Challenge issue + lifecycle (row, cookie, expiry, attempts) | API/Backend (server.js) | — | Identity and pending state are server-owned; client never computes auth state (D-63/D-70) |
| Code verify (TOTP + recovery dual-shape, burn) | API/Backend | — | Atomicity (delete challenge + mint session + burn in one transaction) is a DB concern |
| Session mint on success | API/Backend | — | Reuses the exact login-handler recipe; sessions table stays the only identity store (D-01) |
| Pending anonymity | Structural (server.js) | — | Separate cookie name; `currentUser()` untouched (D-02 — no deny-lists) |
| Masked email | API/Backend | — | Computed server-side per D-63, returned in login payload |
| `s === '2fa'` screen, code submit, back link, banner | Browser/Client (src/) | — | Presentation only; response payload drives all branching (D-68/D-73) |
| 401-matrix proof | Test (test/) | — | Real-server test, no mocks — project convention |

## Standard Stack

### Core
No new packages — zero runtime dependencies held (project core decision). Everything is `node:crypto`, `node:sqlite`, and existing in-repo helpers.

| Asset | Location | Purpose | Why Standard |
|-------|----------|---------|--------------|
| `login_challenges` table | server.js:113-119 | Pending-state store (already landed, Phase 14) | D-01: sessions table stays pure |
| `verifyTotpCode(secret, code, lastStep, nowSec)` | totp.js:61-77 | Login TOTP verify incl. replay guard | Same guard as settings path (D-04) |
| `normalizeRecoveryCode` / `recoveryHash` | totp.js:96-99 | Dual-shape recovery verify | One normalization across gen/burn sites |
| `tooMany(key, max, windowMs)` | server.js:1257-1267 | Shared throttle budget | D-11/D-14 in-memory primitive |
| `transaction(fn)` | server.js:840 | Atomic burn+delete+insert | Established pattern (used at :1419, :1481, :1508) |
| `setSessionCookie` / cookie attributes | server.js:1202-1211 | Attribute style to mirror for the challenge cookie | SameSite=Lax, HttpOnly, Secure/SECURE_COOKIE handling |
| `fail(res, status, code, msg)` | server.js:1143-1145 | Stable error codes | `err.*` client translation contract |
| `crypto.randomBytes(32).toString('base64url')` | server.js:1353 | Challenge token entropy | Same recipe as session tokens (Pitfall 13: pure random, never derived) |

**Installation:** none.

## Package Legitimacy Audit

Not applicable — this phase installs no external packages (zero-dependency project; all helpers exist in-repo from Phases 14/16).

## Architecture Patterns

### System Architecture Diagram

```
Login form (src/pages/auth.js, s='login')
   │  POST /api/auth/login  {email, password}
   ▼
POST /api/auth/login (server.js:1336)
   │  sameOrigin → readJson → tooMany(`${ip}|${email}`) [10/15min]
   │  scrypt verify (vs DUMMY_HASH when row absent)
   ├─ wrong password ──► 401 invalidCredentials
   ├─ 2FA disabled ────► attempts.delete() → sessions insert → setSessionCookie
   │                     → 200 {user}                      (existing path, unchanged shape)
   └─ 2FA enabled (D-68 branch — NEW)
         │  NO attempts.delete() here (D-03/Pitfall 18: budget carries over)
         │  token = randomBytes(32).base64url; insert login_challenges
         │    (sha256(token), user_id, now+5min, attempts=0)
         │  Set-Cookie challenge cookie (separate name, ~5min Max-Age)
         └─► 200 { pending2fa: true, maskedEmail }   (no session cookie, no user payload)
                                                │
   Client: S.ui.auth = '2fa' (D-60)             ▼
   dedicated code screen ── code ──► POST /api/auth/tfa/login {code}   (D-69, NEW)
                                       │  sameOrigin → tooMany(`2fa-login|${ip}|${email}`, 5, 15min)
                                       │  read challenge cookie → select login_challenges row
                                       │    (expired or absent → 401 challengeExpired/generic)
                                       │  attempts increment BEFORE verify (D-67)
                                       ├─ shape /^\d{6}$/ → decryptTotpSecret → verifyTotpCode(...,
                                       │     two_fa_last_step)   [replay-guarded]
                                       └─ else → recoveryHash(normalizeRecoveryCode(code))
                                             → update recovery_codes set used_at
                                               where ... used_at is null  (changes===1 wins)
                                       │
                                       ├─ fail → 400 invalidTfaCode (D-65, one code both shapes)
                                       │    └─ attempts>=3 or expired → delete challenge row
                                       │       → challenge dead; restart at password (D-66)
                                       └─ success → transaction:
                                            delete challenge row (atomic claim)
                                            + recovery burn (if recovery shape, D-72)
                                            + sessions insert (SESSION_DAYS)
                                            + users.last_login_at update
                                            → Set-Cookie session cookie (+clear challenge cookie)
                                            → 200 { user, recoveryRemaining? }  (D-73)
   401-matrix (D-71): challenge cookie held ⇒ 401 on requireUser route,
   GET /w/:slug/file/:id (requireWorkspace→requireUser, server.js:2251),
   POST /api/invites/:token/accept (session from currentUser, server.js:1984-1986),
   PATCH /api/auth/me; GET /api/auth/me → {user:null}; logout clears challenge.
```

### Recommended Project Structure
No new files required beyond tests; additions land in existing files:
```
server.js                  # login branch (D-68), verify route (D-69), D-13 copy swap, challenge sweeper
src/pages/auth.js          # s === '2fa' branch (D-60) in the render switch
src/actions/actions.js     # doLogin pending branch, doTfaLogin, back-link action (D-61/D-70)
src/core/api.js            # api.tfaLogin(code) — next to tfaEnroll/tfaEnable/tfaDisable (:257-264)
locales en/fr catalogues   # new keys EN+FR same commit
test/tfa-login.test.mjs    # new suite (challenge lifecycle, dual-shape, burn, budget carry-over)
test/tfa-pending-401.test.mjs (or extend tfa-login)  # the D-71 matrix
```

### Pattern 1: Dedicated-route endpoint contract (Pitfall 22 checklist)
**What:** Every new auth mutation follows: `sameOrigin(req)` first (before body read and throttle) → `tooMany(...)` → validate → `transaction(...)`.
**Example (the exact order, from the current login handler):**
```js
// Source: server.js:1336-1350
if (pathname === '/api/auth/login' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const body = await readJson(req);
  ...
  if (tooMany(`${clientIp(req)}|${email}`)) return fail(res, 429, 'tooManyLoginAttempts', 'Too many attempts. Try again in 15 minutes.');
  const row = db.prepare('select * from users where email = ?').get(email);
  const valid = verifyPassword(password, row?.password_hash || DUMMY_HASH) && !!row;
```
For the new verify route, the throttle call mirrors the Phase 16 enable route exactly: `tooMany(\`2fa-login|${clientIp(req)}|${user.email}\`, 5, 15 * 60 * 1000)` — the same shape as [VERIFIED: server.js:1457] (`2fa-verify|${ip}|${email}`, 5/15min, labeled "this exact budget shape is what Phase 17's login second step reuses").

### Pattern 2: Dual-shape verify inside one transaction (D-57 precedent)
**What:** The disable route already implements the exact dual-shape + burn primitive D-64/D-72 mirror. The login verify route reuses the same shape-testing and burn-SQL verbatim.
```js
// Source: server.js:1511-1525 (tfa/disable — the precedent)
if (/^\d{6}$/.test(code)) {
  const secret = decryptTotpSecret(fresh.two_fa_secret);
  if (!secret) return 'masterKey';
  if (!verifyTotpCode(secret, code, fresh.two_fa_last_step || null, Math.floor(now() / 1000)).ok) return 'code';
} else {
  const hash = recoveryHash(normalizeRecoveryCode(code));
  const burned = db.prepare('select id from recovery_codes where user_id = ? and code_hash = ? and used_at is null').get(user.id, hash);
  if (!burned) return 'code';
  db.prepare('update recovery_codes set used_at = ? where id = ?').run(now(), burned.id);
}
```
At login the differences are: the code arrives from the challenge route (not settings), the transaction additionally claims the challenge row and mints the session, and a recovery burn must be **race-safe by conditional update** — either burn first inside the transaction and check `changes === 1` (Pitfall 17), or rely on the single transaction serializing; the burn predicate `used_at is null` + `changes` check is the pattern to keep.

### Pattern 3: Session-mint recipe (verbatim reuse)
```js
// Source: server.js:1353-1368 — what the verify route does on success
const token = crypto.randomBytes(32).toString('base64url');
const t = now();
db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)').run(
  sha256(token), row.id, t, t + SESSION_DAYS * 86400 * 1000, ip, ua, t,
);
db.prepare('update users set last_login_at = ? where id = ?').run(t, row.id);
setSessionCookie(req, res, token);
return json(res, 200, { user: userPayload(row) });
```
The verify route repeats this with the challenge's `user_id`; plus `delete from login_challenges where challenge_token_hash = ?` inside the same `transaction()`.

### Pattern 4: Challenge lifecycle state machine (D-66)
- Row created only at the D-68 branch: `attempts = 0`, `expires_at = now + 5*60*1000`.
- Every verify attempt: `update login_challenges set attempts = attempts + 1 where challenge_token_hash = ?` **before** verify (D-67 anti-race), then check `attempts > 3` → delete row + generic failure.
- `expires_at <= now()` at read time → delete row + fail (no lazy-only expiry).
- Boot/hourly sweeper, matching the sessions cleaner pattern [VERIFIED: server.js:2486-2487]: `db.prepare('delete from login_challenges where expires_at <= ?').run(now())` at boot + `setInterval(..., 3600_000).unref()` — **no sweeper for this table exists yet** (verified by grep: only sessions :2486 and invites :1876 are swept).

### Anti-Patterns to Avoid
- **Reusing the session cookie for pending state** (Pitfall 15): the entire second factor is decorative if a pending request carries any `projects_session` value. Separate cookie name, structural anonymity (D-02).
- **`attempts.delete()` between steps** (Pitfall 18 / D-03): the success-clear at [VERIFIED: server.js:1352] must move so it runs only when login fully completes (i.e., on verify success) — not on the password-correct-but-pending branch.
- **`timingSafeEqual` on unvalidated length** (Pitfall 22b): it throws on length mismatch. `verifyTotpCode` already format-gates `/^\d{6}$/` [VERIFIED: totp.js:62-63]; the recovery branch normalizes to hex so hash comparison is fixed-length — keep both gates intact.
- **Copy-pasting `Max-Age=SESSION_DAYS` onto the challenge cookie** (Pitfall 15 warning / D-68).
- **A challenge-scoped replay counter**: `two_fa_last_step` on `users` is the guard for both paths (D-04) — do not add per-challenge counters.
- **Distinguishing error codes** between dead/stolen recovery code and wrong TOTP (D-65): one code, one message.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP verify | A new login-specific verifier | `verifyTotpCode` (totp.js:61) | Replay guard + format gate + window already tested |
| Recovery normalize/hash | New normalization at the login site | `normalizeRecoveryCode`/`recoveryHash` imported verbatim | One normalization across all sites — a second one breaks hash matching |
| Throttle | A second throttle map | `tooMany()` with D-11 keys | Pitfall 18 trap: two maps = divergent budgets |
| Atomic burn/mint | Multi-statement sequences outside `transaction()` | `transaction(fn)` (server.js:840) | The established 3 call sites (:1419/:1481/:1508) all use it |
| Cookie attribute handling | Hand-built Set-Cookie strings differing from session style | Mirror `setSessionCookie` (:1202-1206) with the challenge name + 5-min Max-Age | Consistent Secure/SameSite behavior |
| Masking | A persisted "display email" column | Pure function at response time (D-63) | Nothing to migrate, nothing to leak at rest |

**Key insight:** this phase's difficulty is ordering and invariants (budget carry-over, attempt-before-verify, atomic claim), not algorithms — all algorithms shipped in Phase 16.

## Common Pitfalls

### Pitfall 1: The `attempts.delete()` success-clear runs on the pending branch
**What goes wrong:** An attacker gets unlimited 2FA guesses: 10 password tries each clear the budget, and each correct-password try issues a fresh challenge.
**Why it happens:** The clear at server.js:1352 currently sits between password verification and session mint; the D-68 branch splits that path.
**How to avoid:** Move the clear to run only when the login fully completes (verify success — inside/after the mint transaction). Note D-66's "no reset between steps" also means the back-link (D-61) and challenge death do NOT clear the budget.
**Warning signs:** Test "budget survives password→2FA steps" missing; grep shows `attempts.delete` reachable from the pending branch.

### Pitfall 2: Stale line-number references from CONTEXT
**What goes wrong:** The plan cites `server.js:1350` for `attempts.delete()` and `server.js:1235` for the 429 string; the current file has them at **1352** and **1346** respectively ([VERIFIED: server.js:1352] `attempts.delete(...)`, [VERIFIED: server.js:1346] `'Too many attempts. Try again in 15 minutes.'`).
**Why it happens:** Phase 16 edits shifted lines after 17-CONTEXT was written.
**How to avoid:** The plan should anchor on unique code strings, not line numbers; both targets are unique greps.
**Warning signs:** Executor fails an exact-string edit on those lines.

### Pitfall 3: Challenge attempt counter checked after verify (race to a 4th try)
**What goes wrong:** Two concurrent submissions both read `attempts = 2` and both verify.
**How to avoid:** Increment-then-verify (D-67): the `update ... attempts = attempts + 1` runs before any code comparison; a 4th attempt sees `attempts > 3` and the row is deleted.
**Warning signs:** Test asserts 4 wrong codes accepted before death.

### Pitfall 4: Recovery burn not atomic with session mint, or not race-safe
**What goes wrong:** Burn succeeds but session mint fails (or vice versa) — a code is consumed for nothing; or two concurrent submissions both pass the `used_at is null` select.
**How to avoid:** D-72: one `transaction()` covering the burn predicate-update (check `changes === 1`), the challenge-row delete, and the sessions insert.
**Warning signs:** A test where a burned code leaves the user un-signed-in.

### Pitfall 5: 429 copy leaks timing (D-13 override not applied)
**What goes wrong:** The existing login 429 message "Too many attempts. Try again in 15 minutes." (server.js:1346) discloses the window; if only new endpoints get generic copy, the shared budget discloses inconsistently.
**How to avoid:** Replace that string in this phase with the pinned generic copy (no countdown, no window, no Retry-After header) — D-13 scope resolution explicitly assigns this to Phase 17. Use error code `tooManyAttempts` (already catalogued — used at :1408/:1440/:1457) rather than a new `tooManyLoginAttempts` variant if the message becomes identical (Pitfall 20: reuse codes where semantically identical).
**Warning signs:** `grep 'Try again in 15 minutes' server.js` still matches after the phase.

### Pitfall 6: Client misreads pending as signed-in
**What goes wrong:** `doLogin` treats the 200 as success and calls `enterApp()`.
**How to avoid:** D-68 payload shape: `{ pending2fa: true, maskedEmail }` with no `user` key — `doLogin` branches on `res.data.pending2fa` and sets `S.ui.auth = '2fa'` (D-60/D-70: no persistence of pending state; a reload lands back on the login form because `S.ui` is in-memory).
**Warning signs:** Any write of pending state to localStorage/sessionStorage; `api.user` populated pre-verify.

### Pitfall 7: The masked email is a mask, not a hash
**What goes wrong:** `j***@d***.com` still enables confirmation of a specific address (is this Jane's account?).
**How to avoid:** Discretion item (D-62) — keep first-char + fixed stars + domain first-char only, nothing length- or dot-preserving; computed per-request (D-63).
**Warning signs:** Mask preserves full domain TLD + local-part length.

### Pitfall 8: Logout from pending state, and the matrix gaps
**What goes wrong:** Pending user clicks logout → the challenge row lingers 5 minutes; or a matrix row is forgotten so a later refactor reintroduces a bypass.
**How to avoid:** D-71 pins the exact matrix: requireUser API route, `/w/:slug/file/:id` (note: it 401s via `requireWorkspace`→`requireUser` — [VERIFIED: server.js:2251] — actually the file route's unauthenticated path is 401 per the handler's ctx-null return), invite accept POST (session from `currentUser` at [VERIFIED: server.js:1984]), `PATCH /api/auth/me`, `GET /api/auth/me` → `user: null`, and logout clearing the challenge row + cookie.
**Warning signs:** Matrix test asserts only one endpoint family.

## Code Examples

### The login branch (D-68) — where it goes
```js
// server.js, inside the login handler after `if (!valid) return fail(... 401 ...)`:
// 2FA-enabled account → challenge, never a session (D-68).
// The attempts.delete() below moves to the verify-success path (D-03/Pitfall 18).
if (row.two_fa_enabled) {
  const challengeToken = crypto.randomBytes(32).toString('base64url');
  const t = now();
  db.prepare('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)')
    .run(sha256(challengeToken), row.id, t + 5 * 60 * 1000);
  setChallengeCookie(req, res, challengeToken); // discretion: name/attrs per D-61/D-68
  return json(res, 200, { pending2fa: true, maskedEmail: maskEmail(row.email) });
}
attempts.delete(`${clientIp(req)}|${email}`); // ← success-clear: only non-2FA logins AND verify success
// ...existing session mint (Pattern 3) for the non-2FA path...
```

### The verify route skeleton (D-69)
```js
if (pathname === '/api/auth/tfa/login' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const body = await readJson(req);
  const code = String(body?.code || '').trim();
  const challengeToken = parseCookies(req.headers.cookie)[CHALLENGE_COOKIE];
  if (!challengeToken) return fail(res, 401, 'challengeExpired', 'Start again — sign in once more');
  const email = String(body?.email || '').toLowerCase(); // or recover from challenge row; see Open Questions
  if (tooMany(`2fa-login|${clientIp(req)}|${email}`, 5, 15 * 60 * 1000))
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const outcome = transaction(() => {
    const ch = db.prepare('select * from login_challenges where challenge_token_hash = ?').get(sha256(challengeToken));
    if (!ch || ch.expires_at <= now()) { if (ch) db.prepare('delete from login_challenges where challenge_token_hash = ?').run(ch.challenge_token_hash); return 'dead'; }
    db.prepare('update login_challenges set attempts = attempts + 1 where challenge_token_hash = ?').run(ch.challenge_token_hash); // D-67: before verify
    if (ch.attempts + 1 > 3) { db.prepare('delete from login_challenges where challenge_token_hash = ?').run(ch.challenge_token_hash); return 'dead'; }
    const user = db.prepare('select * from users where id = ?').get(ch.user_id);
    let ok = false, recoveryRemaining = null;
    if (/^\d{6}$/.test(code)) {
      const secret = decryptTotpSecret(user.two_fa_secret);
      if (!secret) return 'masterKey';
      ok = verifyTotpCode(secret, code, user.two_fa_last_step || null, Math.floor(now() / 1000)).ok;
      if (ok) db.prepare('update users set two_fa_last_step = two_fa_last_step where id = ?').run(user.id); // no-op: guard is inside verifyTotpCode's matchedStep contract
    } else {
      const hash = recoveryHash(normalizeRecoveryCode(code));
      const burn = db.prepare('update recovery_codes set used_at = ? where user_id = ? and code_hash = ? and used_at is null').run(now(), user.id, hash);
      if (burn.changes !== 1) return 'code';
      ok = true;
      recoveryRemaining = db.prepare('select count(*) as n from recovery_codes where user_id = ? and used_at is null').get(user.id).n;
    }
    if (!ok) return 'code';
    db.prepare('delete from login_challenges where challenge_token_hash = ?').run(ch.challenge_token_hash);
    // ...session mint (Pattern 3, with user.id)...
    return { user, recoveryRemaining };
  });
  // 'code' → 400 invalidTfaCode (D-65); 'dead' → 401 challengeExpired; success → 200 {user, recoveryRemaining?}
}
```
(Skeleton — the executor refines details; note the replay guard's `matchedStep` must be captured from `verifyTotpCode`'s return and written to `two_fa_last_step`, exactly as the enable route does at [VERIFIED: server.js:1482].)

### Test model (no mocks, own server + temp DB)
```js
// Source: test/tfa-enrollment.test.mjs:19-23
server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-tfa-suite-key' } });
```
Live codes come from `totpAt(secret, Date.now() / 1000)` (test/tfa-enrollment.test.mjs:56); DB assertions via `withDb(server.dbPath, ...)`; login helpers exist in `test/helpers/server.mjs`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Login mints session straight after scrypt | 2FA-enabled accounts branch to challenge | This phase | Password alone no longer authenticates enrolled accounts (TFA-05) |
| `attempts.delete()` right after password verify | Success-clear only on completed login | This phase | One logical login = one budget (D-03) |
| "Try again in 15 minutes." 429 copy | Generic `tooManyAttempts` copy | This phase (D-13 scope resolution) | No timing disclosure anywhere on the shared budget |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The verify route should accept the email in the request body (for the D-11 throttle key `2fa-login|${ip}|${email}`) rather than deriving it solely from the challenge row — deriving from the row first is equally valid and avoids trusting the body; the throttle key just needs both values. The Code Example sketches body-carried email. | Pattern/verify skeleton | Minor — throttle key composition only; either source satisfies D-11/D-12 |
| A2 | `transaction()` is synchronous and its return value propagates (used that way at :1419 `const ok = transaction(...)` and :1508 `const outcome = transaction(...)`), so the skeleton's return-shape works. | Pattern/verify skeleton | Low — precedent at :1508 returns string sentinels already |
| A3 | The file route's unauthenticated answer is 401 via `requireWorkspace`'s `requireUser` fail path (401 `signInRequired`), not 404 — the matrix test asserts 401. | Pitfall 8 / D-71 | Low — test asserts whatever status `requireUser` emits (`signInRequired` 401); the matrix intent is "not authenticated" |

## Open Questions

1. **Throttle key email source at the verify route**
   - What we know: D-11/D-12 pin the key `2fa-login|${ip}|${email}`; the challenge row holds `user_id` from which email is derivable.
   - What's unclear: body-carried email vs row-derived (A1).
   - Recommendation: derive email from the challenge row's user (authoritative), keep the body field out entirely — fewer spoofable inputs; planner picks one.

2. **Replay-guard write on the login path**
   - What we know: `verifyTotpCode` returns `matchedStep`; the enable route writes it (server.js:1482). The login verify must capture and write it identically.
   - Recommendation: plan task explicitly includes "capture `verified.matchedStep` and update `two_fa_last_step` in the same transaction."

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node (server + node:test) | all tests | ✓ | 24 (project baseline) | — |
| `MASTER_KEY` env | verify route (decrypt → verify) | set per-test (`MASTER_KEY: 'projects-tfa-suite-key'` model, tfa-enrollment.test.mjs:23) | — | fail-closed 503 is the existing contract (D-06) — tests set a throwaway key |

No blocking missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (real server, real SQLite — no mocks, project convention) |
| Config file | none (npm script driven) |
| Quick run command | `node --test test/tfa-login.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TFA-05-1 | Correct password on enrolled account → `200 {pending2fa, maskedEmail}` + challenge cookie, no session cookie | integration | `node --test test/tfa-login.test.mjs` | ❌ Wave 0 |
| TFA-05-2 | TOTP code verifies → session minted; replayed code rejected (`two_fa_last_step` guard) | integration | same | ❌ |
| TFA-05-3 | Recovery code burns exactly once (2nd use fails, `invalidTfaCode`); session minted on first; remaining count in response | integration | same | ❌ |
| TFA-05-4 | Challenge dies at 3 wrong codes or 5 minutes (expired-row path); restart from password | integration | same | ❌ |
| TFA-05-5 | Budget carry-over: 10 password failures + continued 2FA failures → 429; `attempts.delete` not on the pending path | integration | same | ❌ |
| TFA-05-6 | 401 matrix (D-71): challenge cookie held → 401 on requireUser route, `/w/:slug/file/:id`, invite accept, `PATCH /api/auth/me`; `GET /api/auth/me` → `user: null`; logout from pending clears challenge | integration | `node --test test/tfa-login.test.mjs` (or dedicated file) | ❌ |
| TFA-05-7 | D-13: `grep 'Try again in 15 minutes' server.js` empty; 429s carry generic code `tooManyAttempts` | static/integration | part of suite + lint | ❌ |

### Sampling Rate
- **Per task commit:** the touched suite (`node --test test/tfa-login.test.mjs`)
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + `npm run lint && npm run format:check && npm run build` (i18n-scan gate covers the new locale keys) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/tfa-login.test.mjs` — covers TFA-05-1…7 (may split matrix into its own file per discretion)
- [ ] New locale keys catalogued EN+FR before build-gate scan (established convention — same commit)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | TOTP (RFC 6238 via totp.js) + single-use recovery codes; no new crypto |
| V3 Session Management | yes | Opaque DB-backed cookies; challenge is NOT identity (D-02); short-lived challenge (~5 min) |
| V4 Access Control | yes | Structural pending=anonymous; 401-matrix test proves it |
| V5 Input Validation | yes | Format gates before `timingSafeEqual` (`/^\d{6}$/` in totp.js:63; recovery normalize); readJson body caps |
| V6 Cryptography | yes | `node:crypto` only — sha256 hashes, timingSafeEqual, randomBytes(32) challenge tokens; never hand-roll comparison |
| V7 Error/Logging | yes | D-65 one generic error code; D-13 no timing disclosure |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Brute-force 6-digit code at challenge | Spoofing | D-11 throttle `2fa-login|ip|email` (5/15min) + D-66 3-attempts/5-min challenge death + budget carry-over |
| Pending-cookie used as identity | Elevation | Separate cookie name; zero sessions rows; 401-matrix (D-71) |
| Recovery-code oracle / reuse | Spoofing | `used_at is null` conditional update, `changes===1`, one error code (D-65) |
| CSRF on verify route | Tampering | `sameOrigin` first, before body read/throttle (Pitfall 22) |
| TOTP replay within window | Spoofing | `two_fa_last_step` matched-step guard (D-04), shared with settings path |
| Lockout-copy timing disclosure | Information disclosure | D-13 generic copy, no Retry-After |

## Sources

### Primary (HIGH confidence)
- Direct read this session: `server.js` (DDL 113-158; cookie/session helpers 1202-1235; throttle 1257-1267; login handler 1336-1369; password change 1401-1430; tfa enroll/enable/disable 1434-1537; sessions routes 1541-1578; invite accept 1972-2037; file route 2244-2303; sweepers 2486-2487)
- Direct read: `totp.js` (verifyTotpCode 61-77, normalizeRecoveryCode/recoveryHash 96-99, generateRecoveryCode 88-91)
- Direct read: `src/pages/auth.js` (auth state switch 35-126), `src/actions/actions.js` (doLogin 2617-2669), `src/core/api.js` (login/tfa methods 169-264)
- Direct read: `test/tfa-enrollment.test.mjs` (suite model), `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md`, `.planning/research/PITFALLS.md`

### Secondary (MEDIUM confidence)
- None needed — all claims are in-repo.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything is existing in-repo code read this session
- Architecture: HIGH — flow maps onto pinned D-01…D-14 contracts and live handler code
- Pitfalls: HIGH — Pitfall 15/18/22 already project-researched; line-number drift (Pitfall 2 above) is the only correction

**Research date:** 2026-10-27
**Valid until:** phase execution window (in-repo facts; re-verify only if earlier phases re-land)
