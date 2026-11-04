# Phase 33: Membership-Surface Hardening - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 2 (server.js edits + new test pin file)
**Analogs found:** 2 / 2 (both verified git-tracked via `git ls-files`)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` — accept route guard (HARD-01) | route/middleware | request-response | `server.js` `/api/auth/tfa/login` handler (:3471-3473) | exact |
| `server.js` — invite-creation 400 (HARD-02) | route | request-response | same file, invite-creation route (:4217+) — edits in place | exact (in-file) |
| `server.js` — boot sweep (HARD-02) | bootstrap/utility | batch | `main()` boot-cleanup block (:4937-4941) | exact (in-file) |
| `server.js` — twin fail-closed (HARD-03) | route | request-response | accept route `410 workspaceGone` body (:4424); SSO twin (:2842-2871) | exact (in-file) |
| `server.js` — body whitelist (HARD-04) | route/validation | request-response | existing field-scoped reads at :4405-4409 | exact (in-file) |
| `server.js` — `firstForwardedValue()` (HARD-05) | utility | transform | `proto()`/:2427, `clientIp()`/:2454, `publicBase()`/:2432-2438 | exact (in-file) |
| `test/hardening.test.mjs` (new, placement at discretion) | test | integration | `test/error-codes.test.mjs` (WR-07 sameOrigin pin :474-500) | exact |

## Pattern Assignments

### HARD-01 — accept route guard (route, request-response)

**Analog:** `server.js` `/api/auth/tfa/login` handler, :3471-3489 (verbatim house pattern)

**Core pattern** (Pitfall-22 order — sameOrigin FIRST, before throttle/body):
```js
// Source: server.js:3471-3485
if (pathname === '/api/auth/tfa/login' && method === 'POST') {
  // Pitfall 22 order: sameOrigin FIRST, before any body read or throttle.
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  ...
  if (tooMany(`2fa-login|${clientIp(req)}|${challenge.email}`, 5, 15 * 60 * 1000))
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  const body = await readJson(req);
```
Second mirror (prose-comment variant) at :4159-4170 (admin revoke route):
```js
if (adminRevokeMatch && method === 'POST') {
  if (!sameOrigin(req)) return fail(res, 403, 'crossOriginRejected', 'Cross-origin request rejected');
  const actor = requireUser(req, res);
  if (!actor) return;
  if (tooMany(...)) return fail(res, 429, 'tooManyAttempts', ...);
```

**Current accept route head to change** (`server.js:4385-4389`):
```js
const acceptMatch = pathname.match(/^\/api\/invites\/([A-Za-z0-9_-]{16,128})\/accept$/);
if (acceptMatch && method === 'POST') {
  if (tooMany(`invite|${clientIp(req)}`, 5, 60 * 60 * 1000)) {
    return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
  }
```
**Change:** insert the `sameOrigin` guard + the same Pitfall-22 comment line immediately after `if (acceptMatch && method === 'POST') {`, before the `tooMany(...)` throttle. Nothing else in the route head moves.

**fail() helper** (used by every guard site, `server.js:~2420`):
```js
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
```

---

### HARD-02 — creation-side 400 (route, request-response)

**Analog:** invite-creation route itself, `server.js:4217-4313` — the edit lands inside it.

**Existing in-file idioms to copy:**
- Role-ladder check already used in the same route (:4264 idiom): `if (ROLE_RANK[role] >= ROLE_RANK.admin) return fail(res, 400, 'scopeNotAllowed', ...)` — copy the `ROLE_RANK[role] >= ROLE_RANK.admin` comparison shape (covers admin AND owner, Pitfall 6).
- House role-membership idiom (:599): `role in ('owner','admin')` — use for the boot-sweep SQL.
- Link-only branch is `emails: [null]` at :4289; emails array is normalized at :4268-4279, insert loop at :4286. The 400 goes after normalization, before the insert loop.
- ⚠️ Error code: every 4xx code must be catalogued EN+FR in `src/locales/en.json` + `fr.json` (i18n-scan gate). Planner must grep the locale files for a fitting existing code (emailRequired family) or add a new key to BOTH files. Research flags this as the phase's only likely new-string decision.

---

### HARD-02 — boot sweep (bootstrap, batch)

**Analog:** `main()` boot-cleanup block, `server.js:4937-4941`:
```js
bootstrap();
db.prepare('delete from sessions where expires_at <= ?').run(now());
setInterval(() => db.prepare('delete from sessions where expires_at <= ?').run(now()), 3600_000).unref();
/* D-66 lifecycle: expired login challenges are swept at boot and hourly. */
db.prepare('delete from login_challenges where expires_at <= ?').run(now());
setInterval(() => db.prepare('delete from login_challenges where expires_at <= ?').run(now()), 3600_000).unref();
```
**Copy:** unconditional boot-time prepared-statement `.run(now())` with a D-comment above it. New sweep (update only — no delete, no schema change):
```js
db.prepare("update invites set used_at = ? where email is null and role in ('owner','admin') and used_at is null").run(now());
```
Note: this is a one-shot boot sweep (D-02 says "marks them used_at = now"); whether to also `setInterval` is planner discretion, but the expired-invite delete route cleanup at :4288 must NOT be the home (Pitfall 1 — route-scoped, not boot-time).

---

### HARD-03 — twins fail closed (route, request-response)

**Analog A (accept route):** current code at `server.js:4423-4424`:
```js
const ws = db.prepare('select * from workspaces where id = ?').get(invite.workspace_id) || firstWorkspace();
if (!ws) return fail(res, 410, 'workspaceGone', 'This workspace no longer exists');
```
**Change:** drop the `|| firstWorkspace()` — the `410 workspaceGone` line already handles the miss and stays verbatim.

**Analog B (SSO twin):** current code at `server.js:2842-2871`:
```js
const invite = pendingInvites[0];
const ws = db.prepare('select * from workspaces where id = ?').get(invite.workspace_id) || firstWorkspace();
if (ws) {
  addMembership(ws, row, invite.role, ...);          // verbatim recipe, keep
  db.prepare('update invites set used_at = ?, used_by = ? where token_hash = ?')
    .run(now(), row.id, invite.token_hash);          // :2868 — consume shape to reuse
  db.prepare('update invites set used_at = ? where workspace_id = ? and email = ? and used_at is null')
    .run(now(), ws.id, invite.email);                // :2869 — address-wide clear; SKIP when ws missing (no ws.id)
  logSecurity(row.id, 'sso_invite_accepted');        // do NOT fire on the consume path
}
```
**Change:** remove `|| firstWorkspace()`; when `!ws`, consume the one invite with the :2868-shaped write and fall through to the generic `ssoError` landing (Phase-30 one-generic surface; no new error code, no membership write, no :2869 write, no `sso_invite_accepted` log). Planner must read :2878-2920 (post-reconcile flow) to lock the exact fall-through wiring (Research A3).

**Protected sites — do not touch:** `firstWorkspace()` definition :594, seed-boot :1716, read path :2235, slug route :4891. Both twin edits land in ONE commit (D-05, roadmap-locked).

---

### HARD-04 — silent body whitelist (route/validation, request-response)

**Analog:** the accept route's own field-scoped reads, `server.js:4405-4409`:
```js
const name = String(body?.name || '').trim();
const email = String(body?.email || '').trim().toLowerCase();
const password = String(body?.password || '');
```
**Change (D-06):** make it structural — destructure exactly `{name, email, password}` from `body || {}` and discard the rest. Do NOT 400 on unknown keys (no schema probe). Role/teams/scope continue to come only from the invite row (:4429-4446, SCOPE-05 comments already in place — untouched).

---

### HARD-05 — shared first-value helper (utility, transform)

**Analog:** header readers, `server.js:2426-2463`:
```js
function proto(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-proto']) return String(req.headers['x-forwarded-proto']).split(',')[0].trim();
  return req.socket.encrypted ? 'https' : 'http';
}
function publicBase(req) {
  const forwarded = TRUST_PROXY ? String(req.headers['x-forwarded-host'] || '').split(',')[0].trim() : '';
  return `${proto(req)}://${forwarded || req.headers.host || 'localhost'}`;
}
function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // curl / non-browser clients; CSRF needs a browser
  const host = (TRUST_PROXY && req.headers['x-forwarded-host']) || req.headers.host;  // ← the raw-read gap D-07 closes
  return origin === `${proto(req)}://${host}`;
}
```
**Note:** `publicBase()` (:2432-2438) already splits first-value — a fourth consumer worth aligning or leaving alone at planner discretion; the three named in D-07 are `proto()`, `clientIp()`, `sameOrigin()`. Helper shape (signature at discretion):
```js
function firstForwardedValue(req, header) {
  const raw = req.headers[header];
  return raw ? String(raw).split(',')[0].trim() : '';
}
```
Behavior pin: first-value semantics identical to today's `proto()`/`clientIp()`; `sameOrigin()` must treat `x-forwarded-host: a.com, evil.com` exactly as `a.com`.

---

### `test/hardening.test.mjs` (test, integration) — new file, placement at discretion

**Primary analog:** `test/error-codes.test.mjs:474-500` — the WR-07 sameOrigin pin, the exact template for HARD-01/HARD-05 pins:
```js
// Source: test/error-codes.test.mjs:480-499
test('a hostile Origin is rejected on login and signup with the standard crossOriginRejected 403 (WR-07)', async () => {
  const server = await startServer();
  try {
    for (const pathname of ['/api/auth/login', '/api/auth/signup']) {
      const res = await fetch(`${server.base}${pathname}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'https://evil.example' },
        body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password, name: 'Evil' }),
      });
      assert.equal(res.status, 403, `${pathname} must reject a hostile Origin`);
      const data = await res.json();
      assert.equal(data.code, 'crossOriginRejected');
      assert.equal(data.error, 'Cross-origin request rejected', 'the message is byte-identical to the other guard sites');
      assert.deepEqual(Object.keys(data).sort(), ['code', 'error']);
    }
  } finally {
    await server.stop();
  }
});
```

**Secondary analogs:**
- `test/oidc-sso.test.mjs:665-694` (SSO-07 twin tests) — the HARD-03b pattern: `startServer({ env: { OIDC_ENABLED: 'true', ... } })`, `withDb(inviteServer.dbPath, db => seedInvite(...))`, `runFlow(...)`, then direct DatabaseSync assertions on `memberships`, `invites.used_at/used_by`, `security_log` verbs. HARD-02b/02c row-seeding uses the same `withDb` direct-insert pattern.
- `test/scope.test.mjs:1-70` — accept-budget ledger discipline ("1 of 5 accept budget" comment); any suite spending accepts must either spawn its own server or ledger (Pitfall 2).
- `test/helpers/server.mjs:35-44, 100-115` — harness: `startServer({ dataDir, env })` supports arbitrary env overrides (needed for `TRUST_PROXY: 'true'` on HARD-05) and explicit `dataDir` for reboot-against-same-DB (needed for the HARD-02c boot-sweep pin). The harness client sends NO Origin header, so all existing accept tests keep passing after the guard lands (Pitfall 3).
- `test/locale-account.test.mjs:29` / `test/scope.test.mjs:68` — reuse the existing `inviteToken()` helper; never regex per test.

**Test conventions to copy:** `node:test` (`test(...)` + `assert`), one-topic-per-file suites, `try { ... } finally { await server.stop() }`, byte-identical error-message assertions, `Object.keys(data).sort()` no-oracle body pins, security_log/DB direct assertions via DatabaseSync.

## Shared Patterns

### Guard ordering (Pitfall-22)
**Source:** `server.js:3471-3473` (canonical), :4159-4170 (prose mirror)
**Apply to:** accept route (HARD-01). sameOrigin → throttle → lookup → body read, with the house comment line.

### fail() error bodies
**Source:** `server.js:~2420` + `:4424` (`workspaceGone`), `:3471` (`crossOriginRejected`)
**Apply to:** all new rejection paths. Existing codes only — except the one creation-side 400 code decision (HARD-02), which must be catalogued EN+FR in both locale files if new.

### Boot-cleanup idiom
**Source:** `server.js:4937-4941`
**Apply to:** HARD-02 sweep. Unconditional prepared-statement run at boot with a decision-comment above.

### Invite-consume write shape
**Source:** `server.js:2868` / `:4447` — `update invites set used_at = ?, used_by = ? where token_hash = ?`
**Apply to:** SSO twin consume path (D-03) and boot sweep (D-02, minus used_by).

### Test harness + WR-07 pin
**Source:** `test/helpers/server.mjs` + `test/error-codes.test.mjs:474-500`
**Apply to:** every new pin. Fresh `startServer()` per suite (own throttle budget), raw `fetch` for hostile-Origin/header-smuggling cases, DatabaseSync for row outcomes.

## No Analog Found

None — every edit has an in-file analog; the codebase is the pattern source (single-file server.js discipline, 60 existing node:test suites).

## Metadata

**Analog search scope:** `server.js` (targeted ranges), `test/` (error-codes, oidc-sso, scope, helpers)
**Files scanned:** 7 (all verified git-tracked via `git ls-files`; no mirror paths)
**Pattern extraction date:** 2026-11-02
