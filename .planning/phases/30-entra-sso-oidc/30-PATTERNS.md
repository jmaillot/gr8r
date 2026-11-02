# Phase 30: Entra SSO (OIDC) - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 7 (3 new, 4 modified)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `oidc.js` (new) | utility (protocol module) | request-response (IdP HTTP + crypto) | `mailer.js` (raw protocol, env-gated factory); `totp.js` (pure crypto module) | exact |
| `server.js` (modify) | controller/routes | request-response | `server.js` itself — login route (2582-2630), config route (2571-2580), env block (10-34), SCHEMA (113+) | exact (self-extend) |
| `src/pages/auth.js` (modify) | component (SPA view) | render-from-config | `src/pages/auth.js` login view (40-53) — `api.enabled`/`socialBtns()` gating pattern | exact (self-extend) |
| `src/locales/en.json` / `fr.json` (modify) | config (i18n catalogue) | transform | existing `page.auth.*` keys (read by `t()` in auth.js) | role-match |
| `test/oidc-sso.test.mjs` (new) | test (integration + mock IdP) | event-driven (http servers) | `test/tfa-login.test.mjs` (suite structure, raw() helper, dual-server pattern) + `test/helpers/server.mjs` | role-match |
| `test/migration.test.mjs` (modify) | test (schema pinning) | batch | itself — boot-two-cephalopod pattern at lines 27-43 (extend with `oidc_identities`) | exact (self-extend) |
| `DEPLOY.md`/env docs (modify) | docs | — | `server.js` lines 10-34 Env block comment | role-match |

All analog paths verified git-tracked (`git ls-files` non-empty for mailer.js, totp.js, server.js, src/pages/auth.js, locales, all test files).

## Pattern Assignments

### `oidc.js` (utility, request-response / IdP protocol)

**Analog 1:** `mailer.js` — the zero-dependency raw-protocol module with env-gated factory. Copy its **shape**: header comment block listing every env var (lines 1-22), `readConfig(env)` returning `null`/`{error}` on partial config (lines 107-147), and the `createMailer(env)` factory returning `{ enabled, error, ... }` where unconfigured = `enabled:false` with throwing methods (lines 652-668).

**Factory pattern** (mailer.js:652-668):
```js
export function createMailer(env = process.env) {
  const config = readConfig(env);
  if (!config || config.error) {
    const error = config?.error || null;
    return {
      enabled: false,
      error,
      ...
      async sendInvite() { throw new Error(error || 'Email delivery is not configured'); },
    };
  }
  return { enabled: true, error: null, ... };
}
```
→ `oidc.js` should export `createOidc(env)` (or a similar factory) returning `{ enabled, ssoOnly, defaultRole, ... startAuthUrl(), exchangeCode(), verifyIdToken() }`. D-02's "complete var set or disabled" maps directly onto `readConfig`'s return-null-on-missing-host pattern.

**Env flag parsing** (mailer.js:92-98):
```js
function flag(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}
```

**Fetch-with-timeout precedent** (mailer.js:170-174 sets per-command timeout; server-side discipline): every outbound fetch (discovery, JWKS, token POST) must carry `signal: AbortSignal.timeout(10_000)` — RESEARCH Pitfall 7 cites `SMTP_TIMEOUT_MS` (mailer.js:22) as the reason this is house style.

**Analog 2:** `totp.js` — the pure-crypto module contract. Copy its **style**: zero imports beyond `node:crypto` (line 16), named exported pure functions, `{ ok: true/false, reason }` result objects instead of throws for expected failures (lines 61-77), and header comments that tie every branch to a decision id:
```js
// TOTP core (TFA-01) — RFC 4226 / RFC 6238 SHA-1 via node:crypto.
// Zero runtime dependencies. Server-side only: NOT under src/ so Vite
// never bundles server crypto.
```
→ `oidc.js` lives at repo root next to these two (NOT under `src/` — same Vite rule), header comment cites SSO-01/D-01/D-02, and `verifyIdToken` returns `{ ok, reason }` with fail-closed reasons (`alg`, `kid`, `signature`, `iss`, `aud`, `exp`, `nonce`) exactly like RESEARCH Pattern 1.

---

### `server.js` (modify — routes, schema, env, config)

**Analog:** itself. Four extension sites with verbatim recipes:

**1. Env block** (server.js:10-34) — add the OIDC_* rows to the `Env:` comment list, following `SMTP_HOST  optional; enables automatic invite emails` style. Module imports at lines 48-49 show the convention:
```js
import { createMailer } from './mailer.js';
import { buildOtpauthUri, generateRecoveryCode, ... } from './totp.js';
```
→ add `import { createOidc } from './oidc.js';` and a `const OIDC = createOidc();` beside `const MAILER = createMailer();` (line 108).

**2. Schema** (server.js:113-222) — additive `create table if not exists` inside `SCHEMA`. Copy the FK shape from `totp_factors` (lines 135-143), whose comment (128-134) is the model for documenting an additive table; and the Phase-28-settled identity-column decision is already written at lines 179-185:
```js
   /* ... any
      future identity table joins users(id) independently — this shape is additive. */
```
→ `oidc_identities` follows `totp_factors` verbatim: `id text primary key`, `user_id text not null references users(id) on delete cascade`, `create index if not exists oidc_identities_user on oidc_identities(user_id)`.

**3. Config ground truth** (server.js:2571-2580):
```js
  if (pathname === '/api/config' && method === 'GET') {
    return json(res, 200, {
      app: 'projects',
      signup: ALLOW_SIGNUP,
      mail: MAILER.enabled,
      url: appBase(req),
      ...
    });
  }
```
→ add `oidcEnabled: OIDC.enabled` (and `oidcSsoOnly: OIDC.ssoOnly`) beside `mail: MAILER.enabled` — D-10's exact mechanism.

**4. Login route composition** (server.js:2582-2630) — the SSO callback copies these two blocks VERBATIM, only substituting how `row` is resolved:

Challenge-then-stop (2598-2611):
```js
    if (row.two_fa_enabled) {
      const challengeToken = crypto.randomBytes(32).toString('base64url');
      db.prepare('insert into login_challenges (challenge_token_hash, user_id, expires_at, attempts) values (?,?,?,0)').run(
        sha256(challengeToken),
        row.id,
        now() + CHALLENGE_TTL_MS,
      );
      setChallengeCookie(req, res, challengeToken);
      return json(res, 200, { pending2fa: true, maskedEmail: maskEmail(row.email) });
    }
```

Session mint (2613-2629):
```js
    const token = crypto.randomBytes(32).toString('base64url');
    const t = now();
    const ua = String(req.headers['user-agent'] || '');
    const ip = clientIp(req);
    db.prepare('insert into sessions (token_hash, user_id, created_at, expires_at, ip, user_agent, last_seen_at) values (?,?,?,?,?,?,?)').run(
      sha256(token),
      row.id,
      t,
      t + SESSION_DAYS * 86400 * 1000,
      ip,
      ua,
      t,
    );
    db.prepare('update users set last_login_at = ? where id = ?').run(t, row.id);
    setSessionCookie(req, res, token);
    return json(res, 200, { user: userPayload(row) });
```
(The SSO callback is a browser navigation, so the final `json(...)` becomes a 302 redirect into the SPA — keep the mint lines identical.)

**5. 404-no-oracle gate** (server.js:2562-2565, the REMINDER_TEST_TOKEN route):
```js
    if (!process.env.REMINDER_TEST_TOKEN || req.headers['x-reminder-token'] !== process.env.REMINDER_TEST_TOKEN) {
      return fail(res, 404, 'notFound', 'Not found');
    }
```
→ `!OIDC.enabled` → `return fail(res, 404, 'notFound', 'Not found')` at the top of both OIDC routes; same shape for `/api/auth/login` when `OIDC.ssoOnly` (D-07).

**Helper call sites** (all already exist; never reinvent):
- `sameOrigin(req)` — 2348-2353 (SSO start is a GET navigation; callback must still be same-origin-aware for cookies)
- `setSessionCookie` / `setChallengeCookie` / `appendCookie` — 2371-2403 (callback may need TWO cookies; `appendCookie` is the multi-cookie mechanism)
- `tooMany(key)` — 2464-2474 (throttle the start route by IP: `tooMany(\`oidc|${clientIp(req)}\`)`)
- `logSecurity(userId, verb)` — 2496-2498 (new verbs like `sso_login` land in `security_log`; catalogue-gated — Pitfall 8)
- `maskEmail` — 2407-2411; `sha256`, `uid()`, `now()` — used throughout
- `fail(res, status, code, message)` — 2312 (every new code needs EN+FR catalogue + error-codes entries)
- `createUser` — 2247+ (JIT provisioning reuses it; `password_hash` NOT NULL at line 118 → pass a random scrypt hash, never a constant — Pitfall 5)
- `addMembership(ws, user, role, teams, scope)` — used by invite acceptance (server.js:4030-4097, the reconciliation surface SSO-07 reuses)
- `DUMMY_HASH` — 334 (the verify-against-garbage-hash constant; JIT hash should be generated like it but random)

---

### `src/pages/auth.js` (modify — component)

**Analog:** itself. The button placement pattern already exists as decorative `socialBtns()` (lines 29-32), and the server-config gating pattern is `api.enabled` ternaries (lines 46, 50-52):
```js
    ${api.enabled ? '' : `<div class="or">${t('page.auth.or')}</div>${socialBtns()}`}
```
→ The real Microsoft button must render only when the server says so (D-10): follow the `api.enabled` conditional shape but gate on a new config field (e.g. `api.oidcEnabled`), and on `oidcSsoOnly` hide the password form/fields in the `s === 'login'` branch (lines 40-53). The button is a real link/navigation to `/api/auth/oidc/start` (or an action handler), not the inert `data-a="socialAuth"` decoration — do not reuse `socialBtns()` unmodified. The pending-2FA client state it must compose with is `s === '2fa'` (lines 100-106), which reads `S.ui.maskedEmail` — the callback redirect must land the SPA in exactly the state the password flow produces (RESEARCH Pitfall 9).

**i18n convention:** every user-visible string goes through `t('page.auth.…')` (lines 25-131 are saturated with it) → any new label gets keys in BOTH `src/locales/en.json` and `fr.json` (catalogue gate, Pitfall 8).

---

### `test/oidc-sso.test.mjs` (new — integration + mock IdP)

**Analog 1:** `test/tfa-login.test.mjs` — suite skeleton:
```js
import { after, before, test } from 'node:test';
import { totpAt } from '../totp.js';
import { signup, startServer, withDb } from './helpers/server.mjs';

let A;
before(async () => {
  dirA = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tfa-login-a-'));
  A = await startServer({ dataDir: dirA, env: { MASTER_KEY: 'projects-tfa-suite-key' } });
});
```
plus its `raw()` fetch helper (lines 42-55) for non-JSON responses (302s, HTML error pages) — the OIDC callback is a navigation, so the suite needs `redirect: 'manual'` fetches, which `raw()` is the starting point for.

**Analog 2:** `test/helpers/server.mjs` — the harness contract:
- `startServer({ dataDir, env })` spawns real `server.js` with per-test env overrides (lines 43-59) — the SSO suite passes `OIDC_ENABLED`, `OIDC_TENANT_ID`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` plus a mock-issuer override here
- passing `undefined` deletes a var (lines 51-54) — how to test the D-02 partial-config-never-enables matrix
- `client(base)` cookie jar already captures both auth cookies by name (lines 111-115) — if the OIDC flow introduces a third transient cookie name, this allowlist must be extended (planner note)
- `withDb(dbPath, fn)` (lines 163-170) — assert `oidc_identities` rows directly

**Mock IdP:** a `node:http` server created in the test file (RESEARCH §Harness) serving static discovery, JWKS (test RSA key), and a table-driven token endpoint. The Issuer URL must be pointable at the mock (test-only env knob — RESEARCH flags this as a planner decision within agent discretion).

---

### `test/migration.test.mjs` (modify — schema pinning)

**Analog:** itself, lines 27-43 — capture `pragma table_info(...)` BEFORE boot and assert the additive table appears with exact columns:
```js
  legacyColumns = withDb(path.join(dataDir, 'projects.db'), db =>
    Object.fromEntries(
      ['workspaces', 'memberships', 'invites', 'users', 'sessions', 'totp_factors'].map(table => [
        table,
        db.prepare(`pragma table_info(${table})`).all().map(c => c.name),
      ]),
    ),
  );
```
→ add `oidc_identities` to the snapshot lists + a second-boot idempotency assertion (the suite already proves second-boot byte-identity for `totp_factors` — copy that test body).

---

## Shared Patterns

### Zero new dependencies (milestone invariant)
**Source:** `test/dependencies.test.mjs:20-26` (fails if `package.json` gains `dependencies`)
**Apply to:** everything — `oidc.js` imports only `node:crypto` + global `fetch`, exactly like `mailer.js` (net/tls/os/crypto) and `totp.js` (crypto).

### Env-gated enablement with server ground truth
**Source:** `mailer.js:107-147` + `652-668`; exposed at `server.js:2571-2580` (`mail: MAILER.enabled`)
**Apply to:** `oidc.js` factory + `/api/config` + `src/pages/auth.js` rendering. Client NEVER reads env (D-10).

### 404-no-oracle
**Source:** `server.js:2562-2565` (`fail(res, 404, 'notFound', 'Not found')`)
**Apply to:** OIDC routes when unconfigured; `/api/auth/login` under SSO-only (D-07 — 404, never 403-with-message).

### Hash tokens at rest, timing-safe compares
**Source:** every insert above (`sha256(token)`), `totp.js:61-77` (format-gate BEFORE `timingSafeEqual` — it THROWS on length mismatch)
**Apply to:** state/nonce/verifier cookie storage and callback comparison (RESEARCH Anti-Patterns).

### Cookies: HttpOnly, SameSite=Lax, Secure-in-prod, hashed values
**Source:** `setSessionCookie`/`challengeCookieAttrs` (server.js:2371-2391); multi-cookie via `appendCookie` (2395-2399)
**Apply to:** the transient OIDC state cookie (short Max-Age like `CHALLENGE_TTL_MS`).

### Audit + i18n catalogue gates
**Source:** `logSecurity` (2496-2498), `fail()` codes → `src/locales/en.json`+`fr.json` and error-codes catalogue
**Apply to:** every new user-visible string and every new `fail()` code (Pitfall 8) — the existing i18n-scan/catalogue/error-codes tests will fail otherwise.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| (none) | — | — | Every file has a strong in-repo analog; the mock IdP (`node:http` in-test) is new surface but follows the harness conventions above |

## Metadata

**Analog search scope:** repo root (`*.js`), `src/pages/`, `src/locales/`, `test/`, `test/helpers/`
**Files scanned:** ~12 (mailer.js, totp.js, server.js ×4 sections, src/pages/auth.js, test/helpers/server.mjs, test/migration.test.mjs, test/tfa-login.test.mjs, test/dependencies.test.mjs refs)
**Pattern extraction date:** 2026-11-02
