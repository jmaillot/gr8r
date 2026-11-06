# Phase 42: One-Click Unsubscribe Endpoint - Research

**Researched:** 2026-11-06
**Domain:** Anonymous mutating HTTP route (RFC 8058 one-click POST) in a zero-dependency Node.js server — token auth, idempotent prefs upsert, no-oracle response matrix
**Confidence:** HIGH — this is a codebase-internal phase; every anchor was read in-source this session

## Summary

Phase 42 is a thin consumer of the Phase 41 frozen token contract. The route is the **first anonymous mutating route** in the project and the first top-level route that is neither `/api/*` nor a file/upload path. All the hard parts — timing-safe verification, token framing, key derivation — already exist as exported pure helpers (`makeUnsubscribeToken`/`verifyUnsubscribeToken` in `mailer.js:134-162`, `unsubscribeHmacKey()` in `server.js:145-149`). The route itself is: intercept the path in the top-level request chain before `serveStatic`, allow-list {GET, POST}, verify the HMAC token, decode the (wsId, userId) payload, upsert the stored prefs row with `email_digest=false`, and answer with one of two self-contained HTML pages whose **only** observable difference is the localized body text.

Three findings materially shape the plan. **(1)** `verifyUnsubscribeToken` returns only a boolean — the route needs the (wsId, userId) payload to target the prefs row, so a decode-after-verify step (or a combined exported helper following the Phase 40/41 pure-export convention) must be added. **(2)** The upsert must **merge** into the stored row (read via `getStoredNotifPrefs`, spread, flip one key), not blind-replace — the existing PUT precedent at `server.js:3455-3466` shows the merge shape; a blind `insert or replace` of a one-key blob would destroy the user's other stored prefs. **(3)** D-02 says the page language resolves from "the workspace's default language" — but the `workspaces` table has **no language column** (`server.js:247-256`). The only real locale signals in the app are `users.locale` and the global base locale. The planner must pin the interpretation (recommended: the token user's `locale`, clamped to en/fr via the I18N-01 pattern, falling back to `'en'`).

**Primary recommendation:** Security contract comment block + tests first (SC-4/D-13), then a pure exported `buildUnsubscribePage`/decode helper pair in `mailer.js`, then the route in the top-level chain at `server.js` (~line 5305, file-route precedent) — never under `/api/` (the finish-handler request log at `server.js:5344-5345` logs every `/api/` pathname, which would write the token to logs).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** A valid POST returns **200 + a minimalist self-contained HTML page** ("you will no longer receive these digests") — inline styles, zero external assets, safe to render inside a mail client's webview.
- **D-02:** Page language resolves from the **workspace of the token** (wsId is inside the payload) — load the workspace's default language after token verification; fall back deterministically (EN or workspace-table default) when the row is missing. This is a post-verification concern only.
- **D-03:** Invalid / stale / rotated-out / forged tokens receive **200 + the same HTML page with neutral generic text** ("your request has been processed") — never an error status, never a page that asserts the unsubscription happened. Identical envelope (status, content-type, caching headers) across all outcomes; only the body text differs.
- **D-04:** The verified/neutral text split is the ONLY observable difference in the response matrix — timing-safe verification, no status/header/body-length leak beyond the localized string.
- **D-05:** `POST /unsubscribe/:token` performs the mutation; **`GET /unsubscribe/:token` returns the same neutral HTML page with zero mutation** (stateless no-op).
- **D-06:** Every other method (PUT/DELETE/HEAD/OPTIONS/…) → **405** with the generic JSON error envelope. Allow-list is exactly {GET, POST}, documented at the route.
- **D-07:** The route is **sameOrigin-exempt** (the unguessable token IS the CSRF defence) — it must explicitly bypass the Fetch-Metadata navigation guard and any session requirement; the exemption is documented in a route-level comment per the codebase's D-notation style.
- **D-08:** The route consumes the **existing login-family IP rate limiter** (same budget as `/api/auth/*`) — no new counter, no dedicated throttle.
- **D-09:** Replay posture: **no token burn, no 410, no claim key** — repeat/replayed POSTs re-write `email_digest=false` (idempotent convergent upsert creating the row if sparse) and receive the identical response.
- **D-10:** The upsert writes the **stored prefs row** via the Phase 38 `getStoredNotifPrefs`/stored-row path for (token.wsId, token.userId) only.
- **D-11:** A "coming soon" badge (new i18n key, EN+FR, `npm run i18n:scan` green) on the **three inert push toggles only** (`push_mention`, `push_assign`, `push_comment` in `src/pages/settings.js` case `notif-push`). `due_reminder`/`past_due` stay badge-free.
- **D-12:** The toggles stay as they are today (rendered, clickable) — no disabling, no behavior change.
- **D-13:** The written security contract lives at/near the route in `server.js` as a consolidated comment block, and is pinned by tests in the same plan as the route — before/with implementation, never after.

### the agent's Discretion
- Exact HTML page construction (inline style values, minimal layout) within D-01's constraints.
- Exact i18n mechanism for the two page text variants (server-side key lookup consistent with the existing server i18n pattern; keys catalogued in both locales).
- Exact 405 JSON envelope reuse (the existing `fail()` shape).
- Whether the neutral page needs a `<meta noindex>` / `X-Robots-Tag` (agent judgment; document in the contract comment).
- Log-redaction mechanics for the token path (never written to request logs or activity rows) at the researcher/planner's choice of implementation point.

### Deferred Ideas (OUT OF SCOPE)
- Per-type one-click unsubscribe (mention/assign/comment emails carrying their own headers) — revisit with the push/toasts phase (backlog 999.2).
- Real push notifications + toasts (the badge-marked toggles) — ROADMAP backlog 999.2.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UNSUB-02 | `POST /unsubscribe/:token` — anonymous, throttled, sameOrigin-exempt, convergent/replay-safe with identical generic responses (no existence oracle), GET a stateless no-op — flips `email_digest=false` for that (workspace, user) prefs row only; reminder emails resume per Phase 38 suppression semantics | Token verify helpers exist (`mailer.js:134-162`); route insertion point + 405/throttle/sameOrigin-exemption mechanics documented below; merge-upsert shape at `server.js:3455-3466`; digest gate reads stored `email_digest !== true` (`server.js:1551`), so the flip resumes reminders automatically |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token verification + payload decode | API/Backend (server.js route) | mailer.js pure helpers | HMAC key lives in server.js; mailer stays key-free (pure-renderer rule) |
| Prefs mutation (email_digest=false) | Database/Storage (SQLite upsert) | — | Stored rows keyed (workspace_id, user_id), `user_notif_prefs` table |
| HTML response page | API/Backend (server-rendered string) | mailer.js pure builder | Must be test-pinnable as an exported pure function (Phase 40/41 convention) |
| Page locale resolution | API/Backend (post-verification) | — | No session exists; resolve from persisted locale data only |
| Rate limiting | API/Backend (in-memory `tooMany`) | — | Existing login-family mechanism, direct reuse |
| Push "coming soon" badge | Browser/Client (settings.js) | i18n catalogues | Pure client-render addition, no backend |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:http (existing server) | Node v24.21.0 | Route handling in the existing top-level chain | The project has zero runtime dependencies; no framework [VERIFIED: node --version] |
| mailer.js exported helpers | (Phase 41, in-repo) | `makeUnsubscribeToken`/`verifyUnsubscribeToken`/`unsubscribeUrl` — frozen token contract | Already tested by `test/unsubscribe-token.test.mjs` (10 blocks) [VERIFIED: mailer.js:921] |
| `tooMany()` throttle | (in-repo, server.js:2949) | Login-family IP budget | D-08 mandates reuse |
| `tFor()` + catalogue | (in-repo, src/core/i18n.js) | Server-side key lookup for the two page text variants | I18N-01 precedent — FR catalogue registered at boot from the same src/locales files (server.js:59-70) |

**No new packages. Package Legitimacy Audit: none required (zero external installs).**

## Architecture Patterns

### System Architecture Diagram

```
Mail client (logged out, no cookies, no Sec-Fetch headers)
        │  POST /unsubscribe/<base64url token>        GET → no-op (D-05)
        ▼
server.js top-level request chain (~L5300)
        │  1. intercept /unsubscribe/* BEFORE serveStatic
        │     (serveStatic 405s non-GET and SPA-fallbacks GET — both wrong here)
        │  2. method allow-list {GET, POST} → else 405 fail() envelope (D-06)
        │  3. tooMany('unsub|'+clientIp) → 429 (D-08; login-family budget)
        │  4. verifyUnsubscribeToken(unsubscribeHmacKey(), token)
        │        │
        │   ┌────┴─────┐
        │   │ valid    │ forged/stale/no-MASTER_KEY
        │   ▼          ▼
        │  decode payload {wsId, userId}      (skip mutation)
        │   ▼
        │  merge-upsert user_notif_prefs:
        │  {...stored, email_digest:false}    (convergent, replay-safe, D-09/D-10)
        │   ▼
        └─ 200 text/html — self-contained page
              verified → "you will no longer receive these digests"
              neutral  → "your request has been processed"
           (identical status/headers; only body text differs — D-03/D-04)
```

### Recommended Project Structure
```
mailer.js                          # + decode/verify-and-decode helper + buildUnsubscribePage (exported pure fns)
server.js                          # + security-contract comment block, route in top-level chain (~L5305)
src/pages/settings.js              # + badge on 3 inert push toggles (case 'notif-push')
src/locales/en.json, fr.json       # + notif.unsubscribe.* page keys, settings badge key
test/unsubscribe-route.test.mjs    # new suite pinning the security contract (SC-4)
test/i18n-core-features.test.mjs   # catalogue-size pin bump (+ trail comment)
```

### Pattern 1: decode-after-verify (the payload gap)
**What:** `verifyUnsubscribeToken` returns only `true/false` — the route needs (wsId, userId). Verification covers the MAC over the payload, so decoding the payload *after* a successful verify is safe.
**When to use:** In the route; implement as an exported pure helper in mailer.js per the Phase 40/41 named-export convention.
**Example:**
```js
// Frozen framing [VERIFIED: mailer.js:129-132]:
//   UNSUB_TOKEN_VERSION = 0x01; UNSUB_ID_BYTES = 36; UNSUB_MAC_BYTES = 32;
//   UNSUB_PAYLOAD_BYTES = 1 + 2 * UNSUB_ID_BYTES
function decodeUnsubscribePayload(tokenB64url) {
  try {
    const raw = Buffer.from(String(tokenB64url), 'base64url');
    if (raw.length !== UNSUB_PAYLOAD_BYTES + UNSUB_MAC_BYTES) return null;
    if (raw[0] !== UNSUB_TOKEN_VERSION) return null;
    const wsId = raw.subarray(1, 1 + UNSUB_ID_BYTES).toString('utf8');
    const userId = raw.subarray(1 + UNSUB_ID_BYTES, UNSUB_PAYLOAD_BYTES).toString('utf8');
    return { wsId, userId };
  } catch { return null; }
}
// route: const ok = verifyUnsubscribeToken(key, token); const p = ok ? decode(token) : null;
```

### Pattern 2: merge-upsert of stored prefs (convergent, non-destructive)
**What:** Flip exactly one stored key, preserving all others; create the row if sparse.
**Example:**
```js
// Shape follows the PUT precedent [VERIFIED: server.js:3455-3466]:
//   select prefs ... → merge → insert or replace into user_notif_prefs (workspace_id, user_id, prefs)
// Merge source MUST be getStoredNotifPrefs (whitelist-filtered, K-10),
// so legacy/unwhitelisted keys are never written back:
const merged = { ...getStoredNotifPrefs(userId, wsId), email_digest: false };
db.prepare('insert or replace into user_notif_prefs (workspace_id, user_id, prefs) values (?,?,?)')
  .run(wsId, userId, JSON.stringify(merged));
```

### Pattern 3: route interception ordering (file-route precedent)
**What:** Top-level routes live in the `if/else` chain in the server handler before `serveStatic`.
**Why it matters:** `serveStatic` 405s non-GET (`server.js:5045-5046` — `res.writeHead(405, { Allow: 'GET, HEAD' })`) and SPA-fallbacks GET; both behaviors are wrong for this route. The upload route comment at `server.js:5301-5302` ("intercepted before serveStatic") is the standing constraint. Add an ordering pin test — `test/file-route-ordering.test.mjs` is the established precedent for exactly this class of regression.

### Anti-Patterns to Avoid
- **Never put the route under `/api/`:** the finish handler logs `req.method + url.pathname` for every `/api/` request (`server.js:5344-5345`) — the token would land in request logs, violating SC-3. Top-level routes are not logged. Also never call `logSecurity`/`logAct`/`logDebug` with the token.
- **Do not blind-replace the prefs row:** an `insert or replace` with `{email_digest:false}` alone destroys the user's other stored prefs (email_reminder etc.).
- **Do not key the throttle on the token:** per-token keys let an attacker burn a victim's budget and probe token validity through 429-vs-200 differences. IP-only key (`clientIp(req)` — server.js:2828).
- **Do not read the request body:** the POST needs no body; never call the body reader on this route. Node discards unread request bodies when the response ends.
- **Do not resolve page language from a session** — there is none (Landmine from 42-CONTEXT).
- **Do not wire or disable the three push toggles** (D-12).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token verification | Any new HMAC compare | `verifyUnsubscribeToken` (mailer.js:150-162) | Length-guard-then-timingSafeEqual, version-byte aware, already frozen by 10 unit blocks |
| HMAC key derivation | Anything | `unsubscribeHmacKey()` (server.js:145-149) | Domain-separated purpose tag, fail-open-null |
| Rate limiting | New counter/map | `tooMany(key, max, windowMs)` (server.js:2949) | Login-family budget per D-08; proven eviction |
| Error envelope | Custom JSON | `fail(res, status, code, message)` (server.js:2789) | Single error constructor discipline |
| i18n lookup | Ad-hoc string tables | `tFor(locale, key)` (src/core/i18n.js:194) | Server-safe (no singleton race), FR catalogue registered at boot |
| SMTP end-to-end test harness | New capture server | The `smtp-server` fixture pattern in `test/digest.test.mjs` | Established boot + capture fixtures in test/helpers/server.mjs |

## Common Pitfalls

### Pitfall 1: `unsubscribeHmacKey()` is null without MASTER_KEY
**What goes wrong:** `verifyUnsubscribeToken(null, token)` — HMAC with a null key throws inside `createHmac`.
**Why:** Phase 41's fail-open-null design (headers omitted when MASTER_KEY absent).
**How to avoid:** Treat null key as "verification fails" → neutral page. The helper's internal try/catch likely catches it, but do not rely on that — pin it with a test (boot without MASTER_KEY → POST returns the neutral page, no mutation, no 500).
**Warning signs:** A 500 from the route on a MASTER_KEY-less dev instance.

### Pitfall 2: The 429 is part of the response matrix
**What goes wrong:** Tests (or reviewers) count the 429 as an existence-oracle leak.
**Why:** D-03 requires identical envelopes for token outcomes; D-08 deliberately accepts IP-throttling as a separate, non-token-correlated signal (same as `/api/auth/*`).
**How to avoid:** Document in the security-contract comment: the response matrix covers *token outcomes* (all 200); the throttle is orthogonal and token-blind. Pin that a throttled response never depends on token validity (throttle fires BEFORE verification).

### Pitfall 3: Response body-length parity
**What goes wrong:** Verified vs neutral pages differ in byte length in a way that encodes more than the localized string (D-04 says the text split is the only observable difference).
**Why:** The two page variants are the same template with one string swapped — but only if built that way.
**How to avoid:** One builder function, one parameter (the message string). Test: identical status, content-type, cache headers; bodies differ only by the localized text. Note honestly: HTML escaping means the two EN strings will have different lengths — D-04 permits exactly this ("beyond the localized string"). Build both variants from the same template so nothing else varies.

### Pitfall 4: Catalogue-size pin breaks the suite
**What goes wrong:** `test/i18n-core-features.test.mjs` pins the exact catalogue size (1677 after Phase 41); new keys fail the full suite.
**Why:** Established Rule-3 blocking fix pattern (41-01 Deviation 1).
**How to avoid:** Bump the pin with the trail comment (`+ notif.unsubscribe.*, phase 42 plan 1`).

### Pitfall 5: Server i18n key namespace
**What goes wrong:** New server-side keys outside `notif.*` are invisible to the i18n-scan server family gate.
**Why:** `scripts/i18n-scan.mjs:1230` — "the family is bounded to the notif.* namespace (D-08)"; the EN↔FR parity gate (`notifParity`) likewise only covers `notif.*` [VERIFIED: scripts/i18n-scan.mjs:1182-1250 region, read this session].
**How to avoid:** Page text keys go in the `notif.unsubscribe.*` namespace in BOTH `src/locales/en.json` and `fr.json`.

### Pitfall 6: HEAD/OPTIONS handling
**What goes wrong:** The generic chain (serveStatic) treats HEAD as GET with Allow: 'GET, HEAD' (server.js:5045-5046) — conflicting habits.
**Why:** D-06 allow-list is exactly {GET, POST}; HEAD → 405.
**How to avoid:** Intercept before serveStatic and 405 HEAD explicitly with `Allow: 'GET, POST'`. (Provider retries use POST or GET; no real-world HEAD traffic on this URL.)

## Code Examples

### Route shape (top-level chain insertion)
```js
// Source: server.js chain pattern (~L5300-5355); file-route precedent
} else if (/^\/unsubscribe\/([A-Za-z0-9_-]+)$/.test(url.pathname)) {
  await handleUnsubscribe(req, res, RegExp.$1);
}
```
(A named capture via `.match()` is cleaner than `RegExp.$1` — match once, pass the token. Order: place BEFORE the `/w/:slug/file/` branch or after — either works since the paths are disjoint; the ordering pin test documents the choice.)

### Throttle + verify + mutate (route core)
```js
// Source: tooMany (server.js:2949), clientIp (server.js:2828), verifyUnsubscribeToken (mailer.js:150)
if (method !== 'GET' && method !== 'POST') return fail(res, 405, 'methodNotAllowed', 'Method not allowed'); // + Allow header
if (tooMany(`unsub|${clientIp(req)}`, 10, 15 * 60 * 1000)) return fail(res, 429, 'tooManyAttempts', 'Too many attempts. Try again later.');
const key = unsubscribeHmacKey();
const valid = key && verifyUnsubscribeToken(key, token);
if (valid && method === 'POST') {
  const { wsId, userId } = decodeUnsubscribePayload(token);
  /* merge-upsert (Pattern 2) — only when both ids resolve to live rows? see Open Question 2 */
}
res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
res.end(buildUnsubscribePage(valid ? tFor(locale, 'notif.unsubscribe.verified') : tFor(locale, 'notif.unsubscribe.neutral')));
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Unsubscribe reply-to/confirm pages | RFC 8058 one-click POST, bare 2xx, no redirects | RFC 8058 (2017); project decision Phase 39 | POST path must not redirect (REQUIREMENTS Out-of-Scope: "RFC 8058 forbids redirects on the POST path; bare 2xx") [VERIFIED: REQUIREMENTS.md:52] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | D-02's "workspace's default language" is best implemented as the token user's `users.locale` clamped to en/fr (I18N-01 pattern, server.js:1298-1302), fallback `'en'` — the workspaces table has no language column [VERIFIED: server.js:247-256, read this session] | Pitfalls / Open Questions | Page renders in the wrong language; still functional |
| A2 | The neutral page does not need `noindex`/`X-Robots-Tag` — decide in plan; low stakes either way | Discretion | Cosmetic; document in contract comment |
| A3 | Unread POST request bodies are safely discarded by Node when the response ends without reading | Code Examples | Theoretical socket edge; a `req.resume()` drain is a cheap belt-and-braces if the planner prefers |

## Open Questions

1. **D-02 language source (blocking for the plan):**
   - What we know: No workspace-language column exists; `users.locale` is the only per-person signal (nullable, malformed values possible — the clamp pattern at server.js:1298-1302 handles all of it).
   - What's unclear: Did D-02 intend users.locale (likely — it was written loosely) or a truly workspace-level default that doesn't exist?
   - Recommendation: Pin "token user's `users.locale`, clamped, fallback EN" in the plan; it is deterministic, post-verification, and degrades to EN exactly as D-02's fallback requires. No schema change.

2. **Mutate on valid token whose wsId/userId match no rows:**
   - What we know: A validly-signed token can reference a deleted user/workspace (users are deleted on member removal? verify in plan) — the upsert would create an orphan prefs row.
   - What's unclear: Whether to gate the mutation on existence of the membership/user row.
   - Recommendation: Existence-gate the INSERT on the membership (or user) row existing — this is NOT an existence oracle because both outcomes still return the verified-looking page... **no** — careful: if the page text differs, gating changes the observable. Simplest safe posture: perform the upsert unconditionally for valid tokens (an orphan row is harmless — the digest gate joins memberships, so an orphan row is never read), keeping the response a pure function of token validity. Prefer this; document in the contract comment.

3. **Throttle max for this route:**
   - What we know: Login-family uses 5-10 attempts / 15 min / various keys; D-08 says "same budget as /api/auth/*" loosely.
   - Recommendation: `tooMany('unsub|' + ip, 10, 15*60*1000)` (the default budget) — one-click POSTs are rare per IP; 10 is generous for provider retries from shared mail-infrastructure IPs. Pin the exact numbers in the contract comment.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.21.0 | — |
| npm test (node --test) | validation | ✓ | suite script | — |
| MASTER_KEY env | token verification path | test-only (set in fixtures) | — | Neutral-page path (Pitfall 1) |
| smtp-server (dev dep, test capture) | end-to-end digest tests | ✓ (used by digest.test.mjs) | — | — |

**Missing dependencies with no fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node v24.21.0 built-in) |
| Config file | none — `npm test` = `node --test --test-concurrency=2 test/*.test.mjs` [VERIFIED: package.json:18] |
| Quick run command | `node --test test/unsubscribe-route.test.mjs` |
| Full suite command | `npm test` (963 tests as of Phase 41) + `npm run i18n:scan` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UNSUB-02 | Valid POST → 200 verified page + stored row email_digest=false (row created if sparse) | integration | `node --test test/unsubscribe-route.test.mjs` | ❌ Wave 0 |
| UNSUB-02 | Replay/repeat POST convergent — same response, no burn, idempotent row | integration | same | ❌ Wave 0 |
| UNSUB-02 | GET = no-op neutral page, zero mutation | integration | same | ❌ Wave 0 |
| UNSUB-02 | Forged/stale/wrong-version/garbage/no-MASTER_KEY → 200 neutral page, no mutation | integration | same | ❌ Wave 0 |
| UNSUB-02 | Method matrix: {GET,POST} allowed; PUT/DELETE/HEAD/OPTIONS → 405 | integration | same | ❌ Wave 0 |
| UNSUB-02 | Envelope parity: verified vs neutral identical status/headers; body differs only by text | integration | same | ❌ Wave 0 |
| UNSUB-02 | Throttle: 429 after budget, token-blind, fires before verification | integration | same | ❌ Wave 0 |
| UNSUB-02 | Route ordering pin (before serveStatic/SPA fallback) | static/req | same | ❌ Wave 0 |
| UNSUB-02 | Reminder emails resume for unsubscribed digest user (Phase 38 semantics) | integration | `node --test test/digest.test.mjs` (additive test) | ✅ (suite exists; new test added to route suite or digest suite) |
| SC-4/D-13 | Security-contract comment block present at route (source-inspection pin) | static | same | ❌ Wave 0 |
| D-11 | Badge key present on 3 push toggles, absent on due_reminder/past_due | static/client | i18n + settings tests / `npm run i18n:scan` | ❌ Wave 0 |
| — | Suppression invariant + second-boot/no-digest-duplicate tests pass UNMODIFIED | regression | `node --test test/digest.test.mjs` | ✅ |
| — | i18n keys EN+FR, catalogue-size pin bumped | static | `npm run i18n:scan` && `node --test test/i18n-core-features.test.mjs` | ✅ (pin bump owed) |

### Sampling Rate
- **Per task commit:** `node --test test/unsubscribe-route.test.mjs` (plus touched suites)
- **Per wave merge:** `npm test` full suite + `npm run i18n:scan`
- **Phase gate:** full suite green, digest.test.mjs unmodified-passing, i18n gate green

### Wave 0 Gaps
- [ ] `test/unsubscribe-route.test.mjs` — new suite (boots server with MASTER_KEY + APP_URL=https://app.test per the digest.test.mjs second-fixture pattern; mints tokens via the same key derivation and mailer helpers)
- [ ] Catalogue-size pin bump in `test/i18n-core-features.test.mjs` (Pitfall 4)
- Framework install: none needed (node:test built-in; smtp-server already a dev dep)

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (novel) | The unguessable HMAC token IS the credential — 256-bit MAC over 73-byte payload, no enumeration possible |
| V3 Session Management | no | Route is deliberately session-free |
| V4 Access Control | yes | Scope is exactly (token.wsId, token.userId) — no user-controlled ws/user params; no cross-tenant write |
| V5 Input Validation | yes | Strict token framing (length + version byte) before any use; base64url decode in try/catch |
| V6 Cryptography | yes | `crypto.timingSafeEqual` via existing helper — never hand-roll |

### Known Threat Patterns for this route

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Token brute-force / forgery | Spoofing | 256-bit HMAC, timing-safe compare, throttle on IP (D-08) |
| Existence oracle via status/header differences | Information Disclosure | Uniform 200 envelope, one-template page (D-03/D-04), pinned by tests |
| Token leakage into logs/audit | Information Disclosure | Route outside `/api/` (unlogged chain), no logSecurity/logAct calls, contract comment forbids it (SC-3) |
| Unauthenticated CSRF/mutation abuse | Tampering | Unguessable token as auth (D-07), sameOrigin exemption documented, IP throttle bounds abuse |
| Log/DB flooding by replay | DoS | Idempotent upsert (no unbounded rows), login-family IP budget |
| Orphan prefs rows for deleted users | (integrity, minor) | Harmless by construction — digest gate joins memberships (see Open Question 2) |

## Sources

### Primary (HIGH confidence — read in-source this session)
- `mailer.js:120-162, 917-921` — frozen token framing, makeUnsubscribeToken/unsubscribeUrl/verifyUnsubscribeToken + export line
- `server.js:145-149` — unsubscribeHmacKey purpose-tag derivation; `:2828-2836` clientIp; `:2949-2961` tooMany; `:2789` fail(); `:1189-1218` getStoredNotifPrefs; `:247-256` workspaces schema (no language column); `:3455-3466` prefs PUT merge-upsert precedent; `:1551` digest suppression gate; `:5300-5355` top-level route chain + /api-only request logging; `:5045-5046` serveStatic 405/Allow
- `scripts/i18n-scan.mjs:1182-1250` — server notif.* bounded family + parity gate
- `test/digest.test.mjs` (suite inventory), `test/helpers/server.mjs` (startServer/freePort/login fixtures), `test/file-route-ordering.test.mjs` (ordering-pin precedent)
- `src/pages/settings.js:389-399` — case 'notif-push' rows
- `src/core/i18n.js:8-56, 194` — tFor, BASE_LOCALE, boot catalogue registration
- `.planning/phases/41-.../41-01-SUMMARY.md` — helper exports, i18n pin trail pattern, fixture pattern

### Secondary (MEDIUM confidence)
- None needed — no external library surface.

### Tertiary (LOW confidence)
- None.

## Project Constraints (from AGENTS.md / STATE.md)
- Zero runtime dependencies, zero migrations, full suite green (standing invariant).
- All new user-facing strings EN+FR, `npm run i18n:scan` green, server keys included.
- Phase 38 suppression invariant + second-boot/no-duplicate digest tests pass **unmodified**.
- Security-contract-first: tests pin the contract before/with the route (D-13, STATE.md blocker directive).
- Claim key `${ws.id}:${user_id}:digest:${localDate}` stays byte-identical (no double-send on deploy day) — this phase must not touch the digest send path.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all in-repo, read this session
- Architecture: HIGH — route chain, throttle, upsert precedents all read in-source
- Pitfalls: HIGH — each grounded in a specific verified code location; A1-A3 flagged as assumptions

**Research date:** 2026-11-06
**Valid until:** 2026-12-06 (stable in-repo domain)
