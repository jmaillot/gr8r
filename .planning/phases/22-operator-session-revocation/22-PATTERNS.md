# Phase 22: Operator Session Revocation - Pattern Map

**Mapped:** 2026-10-29
**Files analyzed:** 8 (2 modified server, 1 modified page, 2 modified locales, 3 new test/e2e)
**Analogs found:** 8 / 8 (all in-repo, all verified git-tracked via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (modify: schema + boot stamp, D-112/D-113) | migration/model | transform (additive schema) | `server.js` openDb `ensureColumn` block (lines 171–201) + `migrateTenancy`/`migrateTotpEncryption` | exact |
| `server.js` (modify: `POST /api/auth/operator/users/:userId/revoke-sessions`) | route/controller | request-response (action POST) | `server.js:1888–1899` `/api/auth/sessions/others` DELETE | exact |
| `server.js` (modify: `GET /api/auth/operator/users`) | route/controller | request-response (read) | `server.js:1873–1886` `GET /api/auth/sessions` | exact |
| `server.js` (modify: `isInstanceAdmin` gate helper) | middleware/utility | request-response | `requireUser` (server.js:1364–1367), `logSecurity` (1425–1427) as helper-family precedents | role-match |
| `src/pages/settings.js` (modify: operator card) | component | request-response (render + confirm) | tfa card inline-stage (settings.js:391–432) | exact |
| `src/locales/en.json`, `src/locales/fr.json` (modify) | config (i18n) | — | existing `settings.tfa.*` namespace + `err.signedOutElsewhere` (en.json:1489) | exact |
| `test/operator-revoke.test.mjs` (new) | test (server, node:test) | batch | `test/tfa-disable.test.mjs` | exact |
| `e2e/operator-revoke-cycle.spec.mjs` (new, name at discretion) | test (e2e, Playwright) | event-driven (lifecycle) | `e2e/tfa-disable-cycle.spec.mjs` | exact |

## Pattern Assignments

### `server.js` — schema column + boot stamp (migration, D-112/D-113)

**Analog:** `server.js:171–174` (`ensureColumn`) and its call block at 185–199 inside `openDb()`.

**Additive column pattern** (lines 171–174, call sites 190, 197–199):
```js
function ensureColumn(conn, table, name, def) {
  const cols = conn.prepare(`pragma table_info(${table})`).all();
  if (!cols.some(c => c.name === name)) conn.exec(`alter table ${table} add column ${name} ${def}`);
}
// usage (note byte-identical def vs SCHEMA — comment at line 192, Pitfall P-B):
ensureColumn(db, 'users', 'two_fa_enabled', 'integer not null default 0');
```

**Boot-stamp insertion point** — `bootstrap()` (lines 954–959) and `ensureAdmin` (936–952):
```js
function ensureAdmin({ quiet = false } = {}) {
  if (db.prepare('select count(*) as n from users').get().n > 0) return; // ← early return: flag stamping must NOT live only here
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim();
  ...
  const user = createUser(email, name, password);
  addMembership(firstWorkspace(), user, 'owner'); // workspace-scoped role — independent of the new flag
}
function bootstrap(opts) {
  ensureWorkspace();
  migrateTenancy();
  migrateTotpEncryption();
  ensureAdmin(opts);
}
```
Pitfall 1 applies: on existing DBs `ensureAdmin` early-returns, so the D-113 stamp must be a separate step in `bootstrap()` gated on "no user currently flagged", using `collate nocase` email match (schema line 95 declares `email … collate nocase`).

**Users schema target** (lines 92–105): append the flag alongside the `two_fa_*` columns; keep the SCHEMA def byte-identical to the `ensureColumn` def.

---

### `server.js` — `POST /api/auth/operator/users/:userId/revoke-sessions` (route, request-response)

**Analog:** `server.js:1888–1899` — the revoke-others route. This is the exact envelope D-117 mandates.

**Full route shape** (lines 1888–1898):
```js
if (pathname === '/api/auth/sessions/others' && method === 'DELETE') {
  /* Exact-string match BEFORE the :id regex below — ordering is the auth family convention. */
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const user = requireUser(req, res);
  if (!user) return;
  const tokenHash = sha256(parseCookies(req.headers.cookie)[COOKIE]);   // line 1894 — operator token hash derivation
  // Keep-current (P-H): the caller's own session is excluded by the != clause.
  const del = db.prepare('delete from sessions where user_id = ? and token_hash != ?').run(user.id, tokenHash);
  const left = db.prepare('select count(*) as n from sessions where user_id = ? and expires_at > ?').get(user.id, now());
  return json(res, 200, { revoked: del.changes, remaining: left.n }); // live post-delete counts (Pitfall 10)
}
```
Phase 22 changes: add throttle + operator gate between `requireUser` and the delete; resolve target by `:userId` before lookup; 403 `ownerImmune` before any session query (D-119); keep the `!=` clause but scope to `target.id` with `operatorTokenHash` (D-118 — one statement serves self-target and other-target); insert `logSecurity(target.id, 'sessions_revoked_by_operator')` after the delete, before `json()` (D-117, mirrors D-107 placement verified at lines 1703–1705: `logSecurity(user.id, 'tfa_disabled')` immediately before the 200 return).

**Throttle helper** (lines 1391–1403):
```js
const attempts = new Map();
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) {
  const t = now();
  const row = attempts.get(key);
  if (!row || t > row.reset) { attempts.set(key, { n: 1, reset: t + windowMs }); ...; return false; }
  row.n += 1;
  return row.n > max;
}
```
D-116 usage: `tooMany(\`operator-revoke|${operator.id}\`, 5, 15 * 60 * 1000)` — every attempt consumes a try because `tooMany` increments on every call regardless of outcome, including 403 paths (Pitfall 3).

**Route comment/Guard-order convention** (line 1769, disable-2FA route): `// Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.` — copy this comment style for the new route.

**Path-param convention** (lines 1901–1907):
```js
const sessionMatch = pathname.match(/^\/api\/auth\/sessions\/([0-9a-f]{12})$/);
...
// P-F: always scoped to the caller's user_id — a foreign id can never be revoked.
```
Use a regex-constrained `:userId` and resolve the target row via a parameterized `select id, is_instance_admin from users where id = ?` (RESEARCH.md A3: verify the users id format — crypto.randomUUID, so uuid-shaped, not 12-hex — at planning time).

---

### `server.js` — `GET /api/auth/operator/users` (route, read)

**Analog:** `server.js:1873–1886` — `GET /api/auth/sessions` response shaping:
```js
return json(res, 200, {
  sessions: rows.map(r => ({ id: r.id, label: r.label, ip: r.ip, createdAt: r.created_at,
    lastSeenAt: r.last_seen_at, current: r.token_hash === tokenHash })),
});
```
Copy the `json(res, 200, {...})` shape; map rows to exactly `{ id, name, email, is_instance_admin, last_login_at }` (D-121 — no session data). Guards: `sameOrigin` → `requireUser` → operator gate; **no throttle** (D-121).

---

### `src/pages/settings.js` — operator card (component)

**Analog:** tfa card inline-stage pattern, lines 391–432. Key excerpts:

**Server-ground-truth + stage gating** (lines 398–410):
```js
const e = S.ui.errors;
const stage = S.ui.tfaStage;
const on = api.enabled && !!api.user?.twoFa;   // reads ONLY server ground truth, never a client flag
...
return (
  H(t('settings.tfa.lead')) +
  srow(t('settings.tfa.on'), t('settings.tfa.onDesc'),
    stage ? '' : `<button class="btn btn-secondary" data-a="tfaAskRegen">${t('settings.tfa.regenShort')}</button>...`),
```
**Inline confirmation form** (lines 412–418):
```js
(stage === 'disable'
  ? `<form data-submit="tfaDisableConfirm" class="col" style="gap:14px;max-width:400px;margin-top:14px">
       ...
       <div class="row"><button class="btn btn-danger" data-a="tfaDisableConfirm" id="tfa-off-save">${t('settings.tfa.turnOff')}</button><button type="button" class="btn btn-secondary" data-a="tfaCancel">${t('common.cancel')}</button></div>
     </form>`
  : '')
```
Operator card adaptation (D-120): a `settings.operator.*` card rendered only when the boot user payload says the viewer is flagged (`is_instance_admin`); list from `GET /api/auth/operator/users`; per-row revoke button revealing an inline `stage === 'revoke'`-style confirm; owner rows (`is_instance_admin === 1`) show disabled/hidden action + "owners are immune" hint; all copy via `t('settings.operator.*')` — zero raw literals (i18n-scan enforces). Defense-in-depth: UI hiding is cosmetic; the server gate is the boundary.

---

### `src/locales/en.json` / `fr.json` (config)

**Analog:** `settings.tfa.*` namespace (both files) and `"err.signedOutElsewhere": "You have been signed out from another device. Sign in again to continue."` (en.json:1489). Add every new string to **both** locales at authoring time; check `test/activity-verbs.test.mjs` for whether `sessions_revoked_by_operator` needs a catalogue entry (RESEARCH.md A2).

---

### `test/operator-revoke.test.mjs` (test, node:test)

**Analog:** `test/tfa-disable.test.mjs:1–40`.

**Header + imports + two-server harness** (lines 1–36):
```js
import assert from 'node:assert/strict';
...
import { after, before, test } from 'node:test';
import { login, signup, startServer, withDb } from './helpers/server.mjs';

let server;
let tempDir;
/* Second instance: signup is IP-throttled 5/hour and the suite needs more
   than 5 users, so the remaining families live on their own server. */
let server2;
let tempDir2;

before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'projects-tfa-disable-'));
  // D-10: a throwaway MASTER_KEY so production and tests exercise the same envelope path.
  server = await startServer({ dataDir: tempDir, env: { MASTER_KEY: 'projects-tfa-disable-key' } });
  ...
});
after(async () => { await server?.stop(); await server2?.stop(); });
```
Reuse for the privilege matrix (needs >5 users → two servers from day one). Direct DB assertion helper:
```js
function resetLastStep(email, srv = server) {
  withDb(srv.dbPath, db => db.prepare('update users set two_fa_last_step = 0 where email = ?').run(email));
}
```
→ use `withDb(srv.dbPath, db => db.prepare('select count(*) ... from sessions ...'))` for "target sessions intact" and owner-immunity assertions (D-122). The privilege-matrix fixture (Pitfall 4): create a user with workspace `owner` membership but `is_instance_admin = 0` — the two flags are independent by construction (`addMembership` vs users column, server.js:947).

---

### `e2e/operator-revoke-cycle.spec.mjs` (test, Playwright Chromium)

**Analog:** `e2e/tfa-disable-cycle.spec.mjs:1–42`.

**Header conventions** (lines 23–29, 31–42):
```js
import { test, expect } from '@playwright/test';
import { BASE_URL, PASSWORD, apiClient, clientIp, createAccount, newRunId } from './helpers/setup.mjs';
import { totpAt } from '../totp.js';
import en from '../src/locales/en.json' with { type: 'json' };
import fr from '../src/locales/fr.json' with { type: 'json' };
const CATALOGUE = { en, fr };
function fmt(key, vars, lang) { /* catalogue interpolation, plural via Intl.PluralRules, throws on missing key */ }
```
Non-negotiable conventions (from the spec header, lines 14–21): fixtures only through the real API (`helpers/setup.mjs`), TOTP via `totpAt` (no test backdoor), every account/context presents its own run-unique `clientIp`/X-Forwarded-For so throttle budgets never cross (Pitfall 5 — the FR parametric run doubles every budget), every asserted string resolves through `fmt()` (zero raw literals), helpers copied locally rather than imported from `flows.spec.mjs`. The D-106 two-cookie-jar-context pattern (separate browser context dies via `signedOutElsewhere` while the first stays signed in) is the direct template for the revoke-assertion in D-123.

---

### `server.js` — `isInstanceAdmin` gate helper (middleware)

**Analog:** `requireUser` (lines 1364–1367) — `function requireUser(req, res) { … fail(res, 401, 'signInRequired', 'Sign in to continue'); }` — and `logSecurity` (1425–1427):
```js
function logSecurity(userId, verb) {
  db.prepare('insert into security_log (id, user_id, verb, created_at) values (?,?,?,?)').run(uid(), userId, verb, now());
}
```
New helper shape: a small predicate over the user row (`user.is_instance_admin === 1`), reading the DB flag only — never `process.env.ADMIN_EMAIL`, never workspace role (D-112 anti-patterns). Call `logSecurity(target.id, 'sessions_revoked_by_operator')` after commit, before response.

## Shared Patterns

### Guard order (Pitfall 22)
**Source:** `server.js:1888–1894`, comment style at 1769
**Apply to:** both new routes
`sameOrigin` → `requireUser` → throttle (revoke route only) → operator gate → handler. Owner-immune check after target resolution, before any session query (D-119).

### Throttle band (D-11 / D-116)
**Source:** `server.js:1393` `tooMany(key, max, windowMs)`
**Apply to:** revoke route only (reads are not throttled, D-121)
`tooMany('operator-revoke|' + operator.id, 5, 15*60*1000)`; every attempt consumes a try (the helper increments on every call — 403 paths included).

### Response envelope + Cache-Control
**Source:** `server.js:1897–1898` (`json(res, 200, { revoked, remaining })`, live post-delete counts, `expires_at > now()` predicate)
**Apply to:** revoke route response; `json()` handles `no-store`.

### Zero-raw-literal i18n
**Source:** `e2e/tfa-disable-cycle.spec.mjs:29–42` (`fmt`) + `src/locales/{en,fr}.json`
**Apply to:** settings card copy and all e2e assertions; EN+FR written simultaneously (Pitfall 6).

### Honest 401 teardown (zero server work)
**Source:** `src/actions/actions.js:2131–2141` → `registerAuthRevokedHandler(signOutRevoked)`; `server.js:1364–1367`
**Apply to:** e2e assertions only — deleting session rows is the entire server mechanism; the browser's next request 401s and the central teardown signs out with `err.signedOutElsewhere`.

## No Analog Found

None — every Phase 22 construct has a verified in-repo analog. The two genuinely new constructs (`is_instance_admin` column + provisioning, `isInstanceAdmin` gate) are additive variants of existing migration/helper patterns, not new architecture.

## Metadata

**Analog search scope:** `server.js`, `src/pages/settings.js`, `src/locales/`, `test/`, `e2e/`
**Files scanned:** 9 (8 analogs read; members.js read for contrast per D-120 — rejected as surface)
**Tracked-source gate:** all analog paths confirmed git-tracked (`git ls-files` non-empty)
**Pattern extraction date:** 2026-10-29
