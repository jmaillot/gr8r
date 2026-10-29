# Phase 17: Login Second-Factor Flow - Pattern Map

**Mapped:** 2026-10-27
**Files analyzed:** 6 (2 modified server, 3 modified client, 1 new test file)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (login branch D-68 + verify route D-69 + challenge cookie + sweeper + D-13 copy swap) | controller (+ model writes) | request-response | `server.js` `/api/auth/tfa/disable` route (1511-1537) + login handler (1336-1369) | exact |
| `src/pages/auth.js` (`s === '2fa'` branch) | component | request-response | `src/pages/auth.js` `s === 'forgot'`/`'reset'` states (100-118) | exact (same file, sibling states) |
| `src/actions/actions.js` (`doLogin` pending branch, `doTfaLogin`, back-link) | controller (client) | request-response | `doLogin` in `src/actions/actions.js:2617-2669` + `tfaDisableConfirm` settings action | exact |
| `src/core/api.js` (`api.tfaLogin`) | service (client API client) | request-response | `api.tfaEnroll/tfaEnable/tfaDisable` (`src/core/api.js:257-265`) | exact |
| `src/locales/en.json`, `src/locales/fr.json` | config (i18n) | static | existing `settings.tfa.*` keys (`en.json:1276` / `fr.json:1276`) | exact |
| `test/tfa-login.test.mjs` (new) | test | integration | `test/tfa-enrollment.test.mjs` | exact |

All analog paths verified `git ls-files`-tracked (no mirrors).

## Pattern Assignments

### `server.js` — login branch (D-68) and verify route (D-69) (controller, request-response)

**Analog A (dual-shape verify + transaction):** `server.js:1494-1537` (`/api/auth/tfa/disable`)
**Analog B (throttle budget shape):** `server.js:1452-1458` (`/api/auth/tfa/enable`)
**Analog C (session mint):** `server.js:1336-1369` (login handler)

**Guard order pattern** (lines 1336-1346 — sameOrigin BEFORE body read AND throttle):
```js
if (pathname === '/api/auth/login' && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const body = await readJson(req);
  ...
  if (tooMany(`${clientIp(req)}|${email}`)) return fail(res, 429, 'tooManyLoginAttempts', 'Too many attempts. Try again in 15 minutes.');
```

**D-11 throttle budget shape for the new verify route** (lines 1456-1458 — comment names this exact reuse):
```js
// D-11: this exact budget shape is what Phase 17's login second step reuses.
if (tooMany(`2fa-verify|${clientIp(req)}|${user.email}`, 5, 15 * 60 * 1000))
  return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```
The login verify route uses key `2fa-login|${ip}|${email}` with the same (5, 15min) constants.

**Dual-shape verify + burn inside `transaction()`** (lines 1508-1532 — D-64/D-72 copy this verbatim):
```js
const outcome = transaction(() => {
  const fresh = db.prepare('select password_hash, two_fa_secret, two_fa_last_step from users where id = ?').get(user.id);
  ...
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
  ...
  return 'ok';
});
if (outcome === 'code') return fail(res, 400, 'codeRejected', 'That code is not valid');
```
For the login route: string-sentinel returns (`'code'`, `'dead'`) map to `400 invalidTfaCode` (D-65 — one generic code, do NOT reuse `codeRejected` with two different codes) and `401 challengeExpired`. At login the burn must be the race-safe conditional form — `update recovery_codes set used_at = ? where ... and used_at is null` and check `.changes === 1` — plus `delete from login_challenges where challenge_token_hash = ?` and the sessions insert in the SAME transaction (D-72).

**Replay-guard write** (line 1482 — capture `matchedStep` from verify and persist in the same transaction):
```js
db.prepare('update users set two_fa_enabled = 1, two_fa_secret = ?, two_fa_last_step = ? where id = ?').run(envelope, verified.matchedStep, user.id);
```

**Session-mint recipe** (lines 1352-1368 — repeated verbatim by the verify route with the challenge's `user_id`):
```js
attempts.delete(`${clientIp(req)}|${email}`);   // ← moves to verify-success only (Pitfall 18/D-03)
const token = crypto.randomBytes(32).toString('base64url');
const t = now();
const ua = String(req.headers['user-agent'] || '');
const ip = clientIp(req);
db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)').run(
  sha256(token), row.id, t, t + SESSION_DAYS * 86400 * 1000, ip, ua, t,
);
db.prepare('update users set last_login_at = ? where id = ?').run(t, row.id);
setSessionCookie(req, res, token);
return json(res, 200, { user: userPayload(row) });
```

**Challenge cookie pattern** — mirror `setSessionCookie` (`server.js:1202-1206`) with a separate cookie name and ~5-min Max-Age (never `SESSION_DAYS`):
```js
function setSessionCookie(req, res, token) {
  const secure = SECURE_COOKIE === 'true' || (SECURE_COOKIE === 'auto' && proto(req) === 'https');
  const maxAge = SESSION_DAYS * 86400;
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`);
}
```
Read side: `parseCookies(req.headers.cookie)[COOKIE]` (see logout, lines 1371-1376) — the challenge token is read the same way under its own name. Logout (1371-1376) is the analog for D-71's "logout clears the challenge" (delete row by hash + clear cookie).

**Sweeper pattern** (lines 2486-2487 — add a matching `login_challenges` cleaner next to these):
```js
db.prepare('delete from sessions where expires_at <= ?').run(now());
setInterval(() => db.prepare('delete from sessions where expires_at <= ?').run(now()), 3600_000).unref();
```

**D-13 copy swap target** (line 1346, unique grep string): replace `'Too many attempts. Try again in 15 minutes.'` with generic copy and the code `tooManyAttempts` (already catalogued at :1440/:1457/:1499).

**Error contract** — `fail(res, status, code, msg)` returns `{ code, message }`; the client translates via `err.*` locale keys. No throw/catch pattern in route handlers; sentinels + early `return fail(...)`.

---

### `src/pages/auth.js` — `s === '2fa'` branch (component, request-response)

**Analog:** same file — the state switch `renderAuth()` (lines 35-126). Every state renders `authShell(card)`; the `forgot` state (100-105) is the closest sibling (single field + back-to-sign-in link).

**State-switch pattern** (lines 35-44, 100-105):
```js
export function renderAuth() {
  const s = S.ui.auth;
  const e = S.ui.errors;
  ...
  if (s === 'forgot')
    return authShell(`<form class="auth-card${S.ui.fx.auth ? ' fx-auth' : ''}" data-submit="doForgot" novalidate>
    <div style="display:flex;justify-content:center"><span class="ftype" style="--c:var(--accent);width:44px;height:44px;border-radius:11px">${ic('key-round', 20)}</span></div><h1>${t('page.auth.resetTitle')}</h1><p class="sub">${t('page.auth.resetSubtitle')}</p>
    <div class="field"><label class="label" for="f-email">${t('common.email')}</label><input class="input input-lg ${icls('email')}" id="f-email" type="email" value="${esc(f.email)}" autocomplete="email">${ferr('email')}</div>
    <button class="btn btn-primary btn-lg btn-block" data-a="doForgot" id="forgot-btn">${t('page.auth.sendResetLink')}</button>
    <p class="auth-foot"><button type="button" class="link row" style="display:inline-flex;gap:6px" data-a="auth" data-v="login">${ic('arrow-left', 14)}${t('page.auth.backToSignIn')}</button></p></form>`);
```
The `s === '2fa'` branch copies this shape: `data-submit="doTfaLogin"`, one code input, `${ferr('login')}` alert slot (as in the login card, line 44), and the back link `data-a="auth" data-v="login"` extended to also clear the challenge cookie (D-61 — needs a new action or `data-a` handler, not the bare `auth` action).

**Dual-shape input markup analog:** `src/pages/settings.js:413-417` (disable form) — label copy `t('settings.tfa.codeLabel')` = "6-digit code or recovery code" (`en.json:1276`), input attrs `autocomplete="one-time-code"`. The 2FA screen mirrors: one input, no client branching.

**Imports** (lines 2-9): `esc`, `t`, `ic`, `S/D`, `api` — nothing new needed.

---

### `src/actions/actions.js` — `doLogin` pending branch + `doTfaLogin` (client controller)

**Analog:** `doLogin` (lines 2617-2669, read 2617-2669) and `enterApp` (2611-2616).

**Action + loading-button + error-slot pattern** (lines 2635-2647):
```js
loadingBtn('login-btn', 0, async () => {
  const btn = document.getElementById('login-btn');
  const done = () => { btn?.classList.remove('is-loading'); btn?.removeAttribute('aria-busy'); };
  const res = await api.login(em, pw);
  if (!res.ok) {
    done();
    S.ui.errors = { login: res.error || t('err.signinFailed') };
    render();
    return;
  }
```
The pending branch slots in right after `res.ok`: `if (res.data.pending2fa) { done(); S.ui.auth = '2fa'; S.ui.maskedEmail = res.data.maskedEmail; render(); return; }` — D-70: NO localStorage/sessionStorage writes; `S.ui` is in-memory so a reload naturally lands back on the login form. D-73/D-74: on verify success with `recoveryRemaining`, call `enterApp(...)`/`toast(...)` (see `enterApp(msg)` at 2611-2616 — toast pattern) with the banner key; escalate the key when `recoveryRemaining === 0`. Post-verify landing is the normal flow — no special routing (D-75); reuse the `?next=` / queued-invite handling already in `doLogin` if the planner routes verify success through it.

---

### `src/core/api.js` — `api.tfaLogin` (client service)

**Analog:** the auth-scoped 2FA methods (lines 253-265 — docstring notes the family convention):
```js
async tfaEnroll(currentPassword) {
  return call('POST', '/api/auth/tfa/enroll', { currentPassword });
},
async tfaEnable(code) {
  return call('POST', '/api/auth/tfa/enable', { code });
},
async tfaDisable(currentPassword, code) {
  return call('POST', '/api/auth/tfa/disable', { currentPassword, code });
},
```
`api.tfaLogin(code)` is `call('POST', '/api/auth/tfa/login', { code })` — NO `applyUser` call in the method (unlike `login` at 169-173, which does `applyUser(r.data)`); the actions layer decides when to adopt the user so a pending response can never populate `api.user` (Pitfall 6). Note `login` at :169-173 calls `applyUser(r.data)` on ok — `applyUser` must not run when `pending2fa` is set; either guard inside `login`/`applyUser` or branch in actions before adopting.

---

### `src/locales/en.json` / `src/locales/fr.json` — new keys (config, i18n)

**Analog:** the `settings.tfa.*` block (en.json/fr.json line 1276) and `err.*` codes (line 1486). Convention: flat `"dot.key": "string"` map, identical key sets in both files, same line number in en/fr (1276/1486 align). New keys needed (catalogued EN+FR in the same commit, before the build-gate i18n scan):
- code screen: title, subtitle (masked-email slot), code label, verify button, back-to-sign-in
- errors: `err.invalidTfaCode`, `err.challengeExpired` (or the client-side equivalents of the 401/400 codes)
- banner: recovery-used copy, escalated last-code copy, settings-link label
- `err.tooManyAttempts` already exists for the D-13 generic copy — reuse, do not add a variant.

---

### `test/tfa-login.test.mjs` — new suite (test, integration)

**Analog:** `test/tfa-enrollment.test.mjs` (read 1-70).

**Suite skeleton pattern** (lines 1-56):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { totpAt, recoveryHash } from '../totp.js';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tfa-'));
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-tfa-suite-key' } });
});
after(async () => { await server?.stop(); fs.rmSync(tempDir, { recursive: true, force: true }); ... });

async function makeUser(name) {
  const s = await signup(server.base, { name, email: `${name}@test.local`, password: GOOD });
  assert.equal(s.status, 201);
  return s.client;                       // client with .post()/.get()/.patch helpers
}
const liveCode = secret => totpAt(secret, Date.now() / 1000);   // real TOTP codes, no mocks
function userRow(email) {
  return withDb(server.dbPath, db => db.prepare('select * from users where email = ?').get(email));
}
```
- Real server + real SQLite, zero mocks (project convention). `signup(server.base, ...)` returns `{ client }` — the client is the enrollment/login driver; login helper exists at `test/helpers/server.mjs:133` (`login(base, email, password)`).
- For the 401-matrix (D-71): enroll+enable a user, login (expect `pending2fa`), keep the challenge cookie on that client, then assert 401 from a `requireUser` route, `GET /w/:slug/file/:id`, invite accept, `PATCH /api/auth/me`; `GET /api/auth/me` → `user: null`; logout clears the challenge (assert via `withDb` that `login_challenges` row is gone).
- Throttle/budget carry-over test (TFA-05-5) must isolate per-user emails since signup is IP-throttled at 5/hour (see comment at tfa-enrollment.test.mjs:36-38).

---

## Shared Patterns

### Dedicated-route endpoint contract (Pitfall 22 checklist)
**Source:** `server.js:1336-1346` and `:1494-1499`
**Apply to:** the new `/api/auth/tfa/login` route
Order is fixed: `sameOrigin(req)` → `readJson` → `tooMany(...)` → validate → `transaction(...)`. sameOrigin comes before the body read and throttle so cross-origin POSTs never consume budget. Stable error codes via `fail(res, status, code, msg)`; client translates with `err.*` keys.

### Atomic transaction with string-sentinel outcomes
**Source:** `server.js:1508-1532` (tfa/disable), :1481-1490 (tfa/enable)
**Apply to:** the verify route's claim+burn+mint unit. Return `'code'`/`'dead'` sentinels from `transaction(() => ...)`; map to responses after. All writes (attempt increment, burn, challenge delete, sessions insert, `two_fa_last_step` write) inside one `transaction()`; increment attempts BEFORE any code comparison (D-67).

### Cookie set/clear style
**Source:** `server.js:1202-1211`
**Apply to:** the challenge cookie set (login branch) and clear (verify success, back-link, logout-from-pending). Same `SECURE_COOKIE`/`proto(req)` handling, `HttpOnly; SameSite=Lax`, `Path=/`; only the name and Max-Age differ (~5 min, never `SESSION_DAYS`).

### Expiry sweeper
**Source:** `server.js:2486-2487`
**Apply to:** `login_challenges` — boot-time delete + hourly `setInterval(...).unref()` alongside the sessions sweeper.

### Client state machine + error slot
**Source:** `src/pages/auth.js:35-126`; `src/actions/actions.js:2635-2647`
**Apply to:** `s === '2fa'` screen and the pending branch in `doLogin`. `S.ui.auth = '2fa'` + `render()`; errors land in `S.ui.errors` and render via `ferr('login')`/alert-danger block; all button actions go through `loadingBtn(...)` with the `done()` cleanup. No storage writes of pending state (D-70).

### i18n EN+FR same-commit
**Source:** `src/locales/en.json` / `fr.json` (aligned key sets, `settings.tfa.codeLabel` at :1276 both files)
**Apply to:** every new user-facing string (code screen, banner, escalated banner, error copy). Reuse `err.tooManyAttempts` for the D-13 generic copy.

## No Analog Found

None — every file in this phase has an exact in-repo analog. The only genuinely new logic (challenge attempt counter `update login_challenges set attempts = attempts + 1` before verify, and `maskEmail`) composes the analogs above; `maskEmail` is a small pure function per D-62/D-63 (first char + fixed stars + domain first char, computed per-request, nothing persisted).

## Metadata

**Analog search scope:** `server.js`, `src/pages/`, `src/actions/`, `src/core/`, `src/locales/`, `test/`
**Files scanned:** 8 (6 read in depth)
**Pattern extraction date:** 2026-10-27
