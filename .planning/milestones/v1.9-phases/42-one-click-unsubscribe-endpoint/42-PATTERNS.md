# Phase 42: One-Click Unsubscribe Endpoint - Pattern Map

**Mapped:** 2026-11-06
**Files analyzed:** 7 (create/modify)
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `server.js` (route block, ~L5305) | route (top-level chain) | request-response | `server.js` file-route branch (L5301-5341) | exact |
| `server.js` (prefs mutation) | model/service | CRUD (SQLite upsert) | `server.js` prefs PUT merge-upsert (L3449-3467) | exact |
| `server.js` (throttle + 405 + i18n locale) | middleware/utility | request-response | `tooMany` (L2949), `fail` (L2789), locale clamp (L1298-1303) | exact |
| `mailer.js` (decode helper + `buildUnsubscribePage`) | utility (pure exports) | transform | `mailer.js` token helpers (L129-162, export L921) | exact |
| `test/unsubscribe-route.test.mjs` (new) | test (integration) | request-response | `test/file-route-ordering.test.mjs` + `test/helpers/server.mjs` fixtures | role-match |
| `test/i18n-core-features.test.mjs` (pin bump) | test (static) | transform | same file, Phase 41 trail-comment precedent | exact |
| `src/pages/settings.js` (badge, case `notif-push`) | component (client) | transform (render) | same case block (L391-399) | exact |
| `src/locales/en.json` / `fr.json` | config (catalogue) | static | existing `settings.notif.*` / `notif.*` keys | exact |

All analogs verified git-tracked (`git ls-files` non-empty for every path named).

## Pattern Assignments

### Route interception (top-level chain, `server.js` ~L5305) — route, request-response

**Analog:** `server.js` L5301-5341 (upload + file route branches, "intercepted before serveStatic" precedent)

**Chain ordering pattern** (L5301-5303, L5342-5348):
```js
/* Upload POST must be intercepted before serveStatic (which 405s non-GET). */
const uploadMatch = url.pathname.match(/^\/w\/([a-z0-9-]{2,40})\/files$/);
if (uploadMatch && req.method === 'POST') {
  await handleUpload(req, res, uploadMatch[1]);
} else if (/^\/w\/...$/.test(url.pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
  /* ... multi-line D-notation comment block constraining the route ... */
  await serveFileBinary(req, res, fileMatch[1], fileMatch[2]);
} else if (url.pathname.startsWith('/api/')) {
  await handleApi(req, res, url);
  res.on('finish', () => {
    if (url.pathname !== '/api/health') logDebug(`${req.method} ${url.pathname} ${res.statusCode} ${now() - started}ms`);
  });
} else {
  serveStatic(req, res, url);
}
```
Key points for the new route:
- Insert a `/^\/unsubscribe\/([A-Za-z0-9_-]+)$/` branch **before** the `/api/` branch and `serveStatic` (serveStatic 405s non-GET at L5045-5046 and SPA-fallbacks GET — both wrong here). Use `.match()` once, pass `match[1]` — not `RegExp.$1`.
- Top-level (non-`/api/`) routes are NOT logged by the finish handler (L5344-5345) — this is the SC-3 log-redaction mechanism by construction. The route must live OUTSIDE `/api/` and never call `logSecurity`/`logAct`/`logDebug` with the token.
- The file-route comment block (L5306-5331) is the model for the consolidated security-contract comment (D-13): inline at the branch, D-notation tagged, enumerating allow-list, replay posture, response matrix, throttle budget, sameOrigin exemption.
- Note the Fetch-Metadata 302-to-login guard lives INSIDE the file-route branch (L5333-5340), not as a global middleware — a new top-level branch is structurally sameOrigin-exempt, but D-07 still requires the explicit route-level comment documenting why.

### Merge-upsert of stored prefs (`server.js`) — CRUD

**Analog:** `server.js` L3449-3466 (prefs PUT) + `getStoredNotifPrefs` L1191-1212

**Merge pattern** (L3449-3466):
```js
// Merge into the existing row instead of replacing it: a partial body must
// never erase keys the caller omits ...
const existingRow = db
  .prepare('select prefs from user_notif_prefs where workspace_id = ? and user_id = ?')
  .get(ws.id, user.id);
let existing = {};
try {
  const parsed = JSON.parse(existingRow?.prefs ?? '{}');
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) existing = parsed;
} catch {
  /* corrupt stored blob: start from a clean object rather than crash */
}
const prefs = { ...existing };
for (const key of Object.keys(incoming)) prefs[key] = Boolean(incoming[key]);
db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)').run(ws.id, user.id, JSON.stringify(prefs));
```
For Phase 42: the merge source MUST be `getStoredNotifPrefs(userId, wsId)` (L1191 — whitelist-filtered, K-10) so legacy keys are never written back:
```js
const merged = { ...getStoredNotifPrefs(userId, wsId), email_digest: false };
db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)')
  .run(wsId, userId, JSON.stringify(merged));
```
Performed unconditionally for valid tokens (Open Question 2 posture — no existence gate; both outcomes return the verified-looking page; orphan rows are harmless because the digest gate joins memberships).

### Throttle, 405 envelope, locale clamp (`server.js`) — middleware/utility

**Throttle analog** `tooMany` (L2947-2959) — consume directly, IP-keyed, never token-keyed:
```js
function tooMany(key, max = 10, windowMs = 15 * 60 * 1000) { ... }  // in-memory map, D-08 reuse
// route usage (pwchange precedent, L3479):
if (tooMany(`unsub|${clientIp(req)}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
```
`clientIp(req)` at server.js:2828 (per research; firstForwardedValue-based).

**Error envelope analog** `fail` (L2789) — the 405 path reuses this exactly:
```js
function fail(res, status, code, message, extra) {
  return json(res, status, { error: message, code, ...extra });
}
// 405 usage:
return fail(res, 405, 'methodNotAllowed', 'Method not allowed', { Allow: 'GET, POST' });
```

**Locale clamp analog** (I18N-01, L1298-1303) — D-02 language resolution, post-verification only:
```js
/* Anything but an exact 'fr' clamps to EN, so doc-only members (no row),
   NULL locales and malformed stored values ('fr-FR') all degrade to the base locale */
const recipientLocale = authority.get(n.to)?.locale === 'fr' ? 'fr' : 'en';
```
Route equivalent: read the token user's `users.locale` row post-verification, clamp to `'fr'`/`'en'` exactly this way (workspaces table has no language column — research finding 3).

### Token helpers + page builder (`mailer.js`) — utility, transform

**Analog:** `mailer.js` L129-162 (frozen framing + helpers) and the pure-export convention at L914-921.

**Frozen framing the decode helper must honor** (L129-132):
```js
const UNSUB_TOKEN_VERSION = 0x01;
const UNSUB_ID_BYTES = 36; // internal ids are UUIDs — pinned by the freeze tests
const UNSUB_MAC_BYTES = 32; // HMAC-SHA256
const UNSUB_PAYLOAD_BYTES = 1 + 2 * UNSUB_ID_BYTES;
```

**verify pattern** (L150-162) — the route consumes this as-is, never re-implements:
```js
function verifyUnsubscribeToken(key, tokenB64url) {
  try {
    const raw = Buffer.from(String(tokenB64url), 'base64url');
    if (raw.length !== UNSUB_PAYLOAD_BYTES + UNSUB_MAC_BYTES) return false;
    if (raw[0] !== UNSUB_TOKEN_VERSION) return false;
    const payload = raw.subarray(0, UNSUB_PAYLOAD_BYTES);
    const mac = raw.subarray(UNSUB_PAYLOAD_BYTES);
    const want = crypto.createHmac('sha256', key).update(payload).digest();
    return mac.length === want.length && crypto.timingSafeEqual(mac, want);
  } catch {
    return false;
  }
}
```

**Pure-export convention** (L914-921) — new `decodeUnsubscribePayload` + `buildUnsubscribePage` follow it (keys as arguments, module never touches MASTER_KEY, exported for unit tests):
```js
/* Phase 41 (UNSUB-01, D-11): makeUnsubscribeToken / unsubscribeUrl /
   verifyUnsubscribeToken exported pure — the token contract Phase 42's
   endpoint consumes, frozen by test/unsubscribe-token.test.mjs. Keys are
   arguments; the mailer module itself never touches MASTER_KEY. */
export { encodeWord, truncate, buildDigestMessage, makeUnsubscribeToken, unsubscribeUrl, verifyUnsubscribeToken };
```

**Key derivation consumed in server.js, not mailer.js** (L144-146) — mailer stays key-free:
```js
const UNSUB_TOKENS_PURPOSE = 'unsubscribe-tokens:v1';
const unsubscribeHmacKey = () =>
  MASTER_KEY ? crypto.createHash('sha256').update(MASTER_KEY).update(UNSUB_TOKENS_PURPOSE).digest() : null;
```
Fail-open-null: null key → treat as verification failure → neutral page (never 500).

### i18n lookup (`src/core/i18n.js`) — utility

**Analog:** `tFor` (L187-206) — server-safe, no singleton race, clamps to base locale:
```js
export function tFor(code, key, vars) {
  const known = LOCALES.some(l => l.code === code);
  const target = known ? code : BASE_LOCALE;
  const active = catalogues.get(target);
  let value = active && Object.hasOwn(active, key) ? active[key] : undefined;
  if (value === undefined) {
    const base = catalogues.get(BASE_LOCALE);
    value = base && Object.hasOwn(base, key) ? base[key] : undefined;
  }
  if (typeof value === 'string') return interpolate(value, vars);
  ...
}
```
Page text keys go in the `notif.unsubscribe.*` namespace (both `src/locales/en.json` and `fr.json`) — the i18n-scan server family + EN↔FR parity gate is bounded to `notif.*` (`scripts/i18n-scan.mjs:1182-1250`). `tFor` never HTML-escapes: the `buildUnsubscribePage` template must `escHtml` the interpolated message itself.

### Push "coming soon" badge (`src/pages/settings.js`) — component

**Analog:** case `'notif-push'` (L391-399) — modify only these three rows:
```js
case 'notif-push':
  return (
    H(t('settings.notif.pushLead')) +
    srow(t('settings.notif.mentions'), '', tog('push_mention', np.push_mention, 'np')) +
    srow(t('settings.notif.assignments'), '', tog('push_assign', np.push_assign, 'np')) +
    srow(t('settings.notif.comments'), '', tog('push_comment', np.push_comment, 'np')) +
    srow(t('settings.notif.dueReminder'), t('settings.notif.dueReminderDesc'), tog('due_reminder', np.due_reminder, 'np')) +
    srow(t('settings.notif.pastDue'), t('settings.notif.pastDueDesc'), tog('past_due', np.past_due, 'np'))
  );
```
The badge rides the `srow` description slot (second argument, currently `''`) for the three push rows only — `due_reminder`/`past_due` keep their real descriptions and stay badge-free. Toggles remain rendered and clickable (D-12); pure render addition, no behavior change.

### New test suite (`test/unsubscribe-route.test.mjs`) — test, integration

**Analog:** `test/file-route-ordering.test.mjs` (ordering-pin + fixture boot pattern, L1-45):
```js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { ADMIN, ROOT, login, startServer } from './helpers/server.mjs';
...
test('authenticated file GET returns the stored bytes before the SPA fallback can claim them', async () => {
  const server = await startServer({});
  try {
    ...
    const res = await fetch(`${server.base}/w/acme/file/f_order1`, { headers: { cookie: admin.client.cookie() } });
    assert.equal(res.status, 200);
```
Adapt: boot with `startServer({ env: { MASTER_KEY: ..., APP_URL: 'https://app.test' } })` (per the digest.test.mjs second-fixture pattern), fetch `${server.base}/unsubscribe/<token>` WITHOUT cookies/Sec-Fetch headers (the mail-client posture), mint tokens via `makeUnsubscribeToken` with the same key derivation (`sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1')` — mirror `unsubscribeHmacKey` at server.js:145-146). Cover: method matrix {GET,POST} vs 405, envelope parity (status/content-type/cache headers identical, bodies differ only by the localized string), replay idempotence, forged/stale/no-MASTER_KEY → neutral page, throttle token-blindness, ordering pin, and a source-inspection pin on the security-contract comment block (D-13).

---

## Shared Patterns

### Zero-dependency route discipline
**Source:** `server.js` L5301-5354
**Apply to:** the new route block
Raw `node:http` if/else chain, `await` handler calls inside try/catch (L5350-5354 central handler catches thrown errors). No framework, no new packages.

### Single error constructor
**Source:** `server.js` L2789 (`fail`)
**Apply to:** the 405 path (and 429 path). Never build an error object by hand. The verified/neutral 200 paths never use `fail` — they always answer HTML.

### D-notation inline security comment
**Source:** `server.js` L5306-5331 (file-route T-12-13/D-13 block); L138-143 (Phase 41 key-derivation comment)
**Apply to:** the route — one consolidated contract comment covering token model reference, method allow-list {GET, POST}, replay posture (no burn/no 410), response matrix (all token outcomes → 200 HTML), throttle budget (`unsub|<ip>`, 10 / 15 min), sameOrigin exemption rationale (SC-4/D-13).

### Pure named-export helpers with unit-test freezing
**Source:** `mailer.js` L914-921
**Apply to:** `decodeUnsubscribePayload`, `buildUnsubscribePage` — pure functions, keys/locale passed as arguments, exported on the existing export line.

### Locale clamp to en/fr
**Source:** `server.js` L1298-1303
**Apply to:** page locale resolution (post-verification only; no session exists).

### i18n catalogue + gate discipline
**Source:** `src/core/i18n.js` L194-206; `scripts/i18n-scan.mjs` notif.* family (L1182-1250); `test/i18n-core-features.test.mjs` catalogue-size pin
**Apply to:** all new keys in `src/locales/en.json` + `fr.json` under `notif.unsubscribe.*` / a `settings.notif.*` badge key; bump the catalogue-size pin with a trail comment (`+ notif.unsubscribe.*, phase 42 plan 1` — Pitfall 4); `npm run i18n:scan` must stay green.

## No Analog Found

None — every file in scope has an exact or role-match analog in the codebase. The HTML page itself is new, but its testability contract copies the pure-export convention (mailer.js L914-921); within it, use the existing inline-style/minimal-HTML habits visible in mailer.js digest rendering.

## Landmines (from research — restate for the planner)

1. Route MUST sit before `serveStatic` and outside `/api/` (serveStatic 405s non-GET at L5045-5046; the `/api/` finish handler logs pathnames at L5344-5345 → token leak, SC-3).
2. Merge-upsert, never blind-replace (destroys other stored prefs).
3. Throttle key is `unsub|<clientIp>` only — never the token (budget-burn + 429 oracle).
4. Never read the POST body.
5. `unsubscribeHmacKey()` is null without MASTER_KEY → neutral page, never 500 (pin with a test).
6. HEAD → 405 with `Allow: 'GET, POST'` (D-06 exactly; conflicts with serveStatic's `GET, HEAD` habit).
7. Throttle fires BEFORE verification; 429 is token-blind and orthogonal to the D-03 response matrix — document in the contract comment.
8. One `buildUnsubscribePage` template, one message-string parameter — nothing else varies between verified/neutral (D-04).

## Metadata

**Analog search scope:** `server.js`, `mailer.js`, `src/core/i18n.js`, `src/pages/settings.js`, `src/locales/`, `test/`
**Files scanned:** 10 (7 tracked-source analogs + i18n-scan script + helpers + locales)
**Pattern extraction date:** 2026-11-06
**Tracked-source gate:** all named analogs verified via `git ls-files` (none are gitignored mirrors)
