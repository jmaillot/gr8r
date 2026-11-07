# Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers - Research

**Researched:** 2026-11-05
**Domain:** RFC 8058 one-click unsubscribe headers + stateless HMAC token (Node.js, zero-dependency mailer)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Footer unsubscribe link (UNSUB-03)**
- **D-01:** Footer link points at `APP_URL + /w/:slug/settings#notifications` — never the token URL, never 404s.
- **D-02:** Link text is a new localized i18n key (e.g. `notif.digest.unsubscribe`) in `src/locales/en.json` + `src/locales/fr.json`, rendered via `tFor` — `npm run i18n:scan` gate stays green.
- **D-03:** Link sits INLINE after the existing footer sentence in both text and HTML parts, following existing plain-footer style.
- **D-04:** Exact settings-page anchor target is agent discretion (anchor id may not exist today); no Settings-page restructuring.

**Header render gates (SC-2, fail-open honestly)**
- **D-05:** TWO independent gates decide header rendering: `MASTER_KEY` is set AND `APP_URL` starts with `https://`. Either gate missing → headers omitted entirely (no broken links, no `http://` URLs). Each gate pinned by its own test.
- **D-06:** HTTPS gate is a deliberate owner decision (Google/Microsoft ignore non-HTTPS List-Unsubscribe URLs); do not "simplify" it away.

**DKIM caveat & DEPLOY.md (SC-4)**
- **D-07:** Ship-with-caveat: one-click headers ship unconditionally when both gates pass; DEPLOY.md documents the DKIM caveat. NO env-gating knob for `List-Unsubscribe-Post` — do not add one.
- **D-08:** Same DEPLOY.md section documents MASTER_KEY-rotation-invalidates-old-links semantics.

**Token URL contract (frozen this phase, consumed by Phase 42)**
- **D-09:** Opaque single path segment: `APP_URL + /unsubscribe/<base64url(payload || HMAC)>` — no query string, no readable identifiers.
- **D-10:** Payload = version byte (`0x01`) + wsId + userId (internal IDs), signed with HMAC-SHA256 over a domain-separated, purpose-tagged derivation from MASTER_KEY (never the raw AES key). Version byte lets Phase 42+ evolve the format.
- **D-11:** Token builder is an exported pure helper (e.g. `makeUnsubscribeToken`/`unsubscribeUrl`) — mirrors Phase 40 `encodeWord`/`truncate` named-export pattern. Unit tests freeze: deterministic signature, base64url alphabet, version-byte position, domain separation, tamper rejection, timing-safe verification path.
- **D-12:** Payload identifiers are internal IDs (wsId, userId), not the workspace slug.

### the agent's Discretion
- Exact helper/file placement (mailer.js vs server.js) — subject to D-11's export requirement.
- Exact purpose-tag string and key-derivation construction (HKDF-style vs `sha256(MASTER_KEY + purpose)`).
- Exact FR wording of the footer key following existing catalogue style.
- The inline separator between the footer sentence and the unsubscribe link.
- Which Settings surface/anchor the footer link targets (D-04).

### Deferred Ideas (OUT OF SCOPE)
- Email branding (logo `public/logo-light.svg` on notification emails) — its own future phase.
- No endpoint this phase (Phase 42), no migration, no table, no digest claim-key changes.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| UNSUB-01 | Digest emails carry `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers built on a stateless HMAC token over (wsId, userId), domain-separated from MASTER_KEY, timing-safe compare; headers omitted when MASTER_KEY absent; DKIM caveat in DEPLOY.md | RFC 8058 §3.1/§5 header syntax verified; `node:crypto` HMAC + `timingSafeEqual` precedents exist in-repo (server.js:162, 414); header insertion point verified in `buildDigestMessage` (mailer.js ~638) |
| UNSUB-03 | Plain footer unsubscribe link stays alongside one-click; Settings digest pref stays the re-subscribe path | Footer frames verified (mailer.js ~574/583/~625); `msg.appUrl` reaches the mailer (mailer.js:561); digest opt-in gate reads STORED `email_digest` (server.js:1531) — untouched |
</phase_requirements>

## Summary

Phase 41 is a mailer-side-only change: extend `buildDigestMessage` to conditionally emit two RFC 8058 headers and one footer link, plus a pure exported token helper frozen by unit tests, plus a DEPLOY.md caveat. Everything runs on `node:crypto` (HMAC, createHash, timingSafeEqual) — zero new packages, zero migrations, consistent with the project's zero-runtime-dependency invariant.

The RFC side is verified against the spec itself. RFC 8058 §3.1 requires the `List-Unsubscribe` header to contain one HTTPS URI that encodes enough information to identify list and recipient (there are no POST body arguments to lean on), and `List-Unsubscribe-Post` to contain exactly `List-Unsubscribe=One-Click`. §4 requires a valid DKIM signature covering both headers — this is the relay-signing caveat DEPLOY.md must document (self-hosted instances DKIM-sign at their SMTP relay; the app only emits headers). §6 / §3.1 recommend an opaque, hard-to-forge identifier in the URI and that the server verify it — exactly the HMAC token design D-09/D-10 lock in. `timingSafeEqual` for verification is the standard Node primitive and is already used in-repo.

The mailer is a pure renderer — it never touches MASTER_KEY. So the token/URL must be computed in server.js (where the key lives) and passed into `msg` (e.g. `msg.unsubscribeUrl` + a gate signal), or the derivation helper is exported from server.js and the send site passes the final URL. The cleanest shape honoring D-11: derivation + token helpers live in server.js (key scope), `buildDigestMessage` receives the pre-built URL and decides header/footer rendering from the two gates (headers render iff `msg.unsubscribeUrl` is provided AND starts with `https://` — the mailer-side test can pin both gates purely from `msg` shape without any key).

**Primary recommendation:** Derive a purpose-tagged HMAC key in server.js from MASTER_KEY, build `unsubscribeUrl(wsId, userId)` there, pass the URL into `sendDigest`, and gate both headers and no footer change on the two gates inside the mailer — pure helpers exported, tests freeze the token format, DEPLOY.md gets one new subsection under §14.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Token derivation & signing (HMAC over version||wsId||userId) | API/Backend (server.js, key scope) | — | MASTER_KEY only exists in server.js; mailer is pure renderer |
| Token URL construction (`/unsubscribe/<b64url>`) | API/Backend (server.js) | — | Needs APP_URL + token; consumed by Phase 42 route |
| `List-Unsubscribe`/`-Post` header rendering + HTTPS gate | Mailer (`buildDigestMessage`) | — | Headers are a message-render concern; mailer already owns the headers array |
| Footer unsubscribe link (settings anchor) | Mailer (both text + HTML frames) | i18n catalogues | Existing footer sentence renders in both parts; link goes inline after |
| i18n key catalogue (EN+FR) | `src/locales/{en,fr}.json` | — | i18n-scan gate scans server keys too |
| DKIM caveat + rotation semantics docs | DEPLOY.md §14 | — | Owner-validated ship-with-caveat |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` (createHmac, createHash, timingSafeEqual) | Node 24 (runtime v24.21.0, [VERIFIED: `node --version`]) | HMAC-SHA256 signing, key derivation, tamper-safe compare | Zero-dependency invariant; already used in-repo [VERIFIED: server.js:124,162,414] |
| `node:test` + `node:assert` | built-in | Token-freeze unit tests + integration tests | Existing test runner (`node --test --test-concurrency=2 test/*.test.mjs`, package.json:18) [VERIFIED: package.json] |

### Supporting
None — no new packages. **No external packages are installed by this phase** (Package Legitimacy Audit trivially passes: no installs).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `sha256(MASTER_KEY ‖ purpose)` derivation | HKDF (`crypto.hkdfSync`) | HKDF is the formally correct KDF, but `sha256` over key‖purpose matches the existing in-repo precedent (`deriveKeyWithKey`, server.js:435-437) and is simpler; HKDF adds a salt/info ceremony for no security gain here. Either is defensible — **discretion D-item; pick sha256‖purpose for consistency** |
| Token inside payload `JSON` | Compact binary payload (version byte + fixed-width IDs) | JSON inflates the URL; binary keeps `0x01 || wsId || userId || mac` shortest (D-12 internal IDs) |
| Signing in mailer | Signing in server.js, mailer renders | Mailer must stay key-free (pure renderer rule, Phase 40 precedent) |

**Version verification:** No npm installs; `node --version` = v24.21.0 [VERIFIED]. Node ≥12 implements `timingSafeEqual`, `hkdfSync` (≥14.8) — well under floor.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| *(none — this phase installs zero external packages)* | — | — | — | — | — | n/a |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 boot (server.js:115-137)                digest tick (server.js:~1531-1597)
 ┌──────────────────────┐                ┌───────────────────────────────────┐
 │ MASTER_KEY env       │                │ for each ws, member:              │
 │  → KEYRING (existing)│                │  stored email_digest===true?      │
 │  [unchanged]         │                │  build due/overdue → claim insert │
 └──────────┬───────────┘                └───────────────┬───────────────────┘
            │                                            │ claimed & MAILER.enabled
            ▼                                            ▼
 ┌──────────────────────────┐   unsubscribeUrl   ┌───────────────────────────┐
 │ NEW: purpose-tagged      │ ─────────────────► │ MAILER.sendDigest(msg)    │
 │ derivation:              │  in msg            │  msg.appUrl, msg.wsSlug,  │
 │  hmacKey = HMAC(KEY,     │                    │  msg.unsubscribeUrl?      │
 │   'unsubscribe:v1')      │                    └────────────┬──────────────┘
 │  token = ver||wsId||uid  │                                 ▼
 │         || HMAC(hmacKey, │                ┌───────────────────────────────┐
 │          payload)        │                │ buildDigestMessage (mailer)   │
 │  url = appUrl +          │                │  gates: url exists AND        │
 │   '/unsubscribe/' +      │                │   url startsWith https://     │
 │   base64url(token)       │                │  → 2 headers + footer link    │
 └──────────────────────────┘                │  else → headers omitted only  │
                                             │  (footer link still renders)  │
                                             └───────────────┬───────────────┘
                                                             ▼
                                             ┌───────────────────────────────┐
                                             │ SMTP relay (DKIM-signs there  │
                                             │ — RFC 8058 §4 caveat)         │
                                             └───────────────────────────────┘
 (Phase 42, out of scope: POST /unsubscribe/:token verifies the same token)
```

### Recommended Project Structure
No new files. Touches: `server.js` (derivation + token helper + send site), `mailer.js` (headers + footer + exports), `src/locales/en.json`/`fr.json` (one key), `test/digest.test.mjs` (or a new `test/unsubscribe-token.test.mjs`), `DEPLOY.md`.

### Pattern 1: Domain-separated key derivation (follow the in-repo precedent)
**What:** Derive the HMAC key from MASTER_KEY via a purpose tag, never use MASTER_KEY (or the raw AES key) directly.
**When to use:** The unsubscribe HMAC signing key.
**Example:**
```js
// server.js — near the keyring block; construction is agent discretion (CONTEXT D-item),
// this matches the existing sha256-over-material precedent at server.js:435-437
const UNSUB_PURPOSE = 'unsubscribe-tokens:v1';
const unsubscribeHmacKey = () =>
  crypto.createHash('sha256').update(MASTER_KEY).update(UNSUB_PURPOSE).digest();
```
A different purpose tag MUST produce a different key (domain separation) — that is a pinned test.

### Pattern 2: Frozen token format (D-09/D-10)
**What:** `payload = 0x01 ‖ wsId ‖ userId`; `token = payload ‖ HMAC-SHA256(hmacKey, payload)`; URL = `APP_URL + '/unsubscribe/' + base64url(token)`.
**Example:**
```js
// Exported pure helper(s) — D-11; split so verification (Phase 42) shares the primitives.
// key passed as argument keeps it test-pinnable without touching MASTER_KEY scope.
const VER = 0x01;
const makeUnsubscribeToken = (key, wsId, userId) => {
  const payload = Buffer.concat([Buffer.from([VER]), Buffer.from(wsId), Buffer.from(userId)]);
  const mac = crypto.createHmac('sha256', key).update(payload).digest();
  return Buffer.concat([payload, mac]).toString('base64url');
};
const unsubscribeUrl = (key, appUrl, wsId, userId) => appUrl + '/unsubscribe/' + makeUnsubscribeToken(key, wsId, userId);
```
Note: `Buffer.from(id)` is safe only if wsId/userId are fixed-internal-ID strings without ambiguity — if IDs are hex/uuid-like this is fine; if they are variable-length strings, Phase 42's parser needs deterministic splitting. **Recommend length-prefixed or fixed-length framing if IDs are arbitrary strings** (see Open Questions). `Buffer.prototype.toString('base64url')` is URL-safe (no `+/=`) — base64url alphabet requirement of D-09 is free [VERIFIED: Node docs behavior, node v24].

### Pattern 3: Gate-driven header rendering inside buildDigestMessage
**What:** Append two headers after `Subject` only when both gates pass; footer link renders independently (D-05 says only the HEADERS are omitted on gate failure — the footer link always renders, it's plain `appUrl`-based and needs no key).
**Example:**
```js
// mailer.js buildDigestMessage — headers array at ~line 638; add after Subject:
const unsub = msg.unsubscribeUrl && msg.unsubscribeUrl.startsWith('https://')
  ? [ `List-Unsubscribe: <${msg.unsubscribeUrl}>`,
      'List-Unsubscribe-Post: List-Unsubscribe=One-Click' ]
  : [];
const headers = [ ..., `Subject: ...`, ...unsub, `Date: ...` ];
```
Footer (text part, line ~602 join, and HTML part, line ~625 paragraph): append the localized link inline after the existing footer sentence. The HTML part must escape the URL/text (`escapeHtml` AFTER interpolation — existing catalogue rule, mailer.js:429).

### Anti-Patterns to Avoid
- **Signing inside the mailer:** mailer.js is a pure renderer (Phase 40 rule) and has no MASTER_KEY. Sign in server.js, pass the URL in `msg`.
- **Query-string tokens** (`/unsubscribe?t=...`): D-09 locks the opaque single path segment.
- **Env-knob for List-Unsubscribe-Post:** D-07 forbids it — do not add `LIST_UNSUBSCRIBE_POST=false`-style flags.
- **Reusing the AES/TOTP key envelope path:** D-10 says the HMAC key derives from MASTER_KEY with a purpose tag, never the raw AES key, never the `v2:keyId:iv:tag:ct` envelope format.
- **http:// fallback URL when APP_URL isn't https:** omit headers entirely; never downgrade the scheme (Google/Microsoft ignore http URLs, and a dead one-click harms deliverability).
- **Non-timing-safe compare in tests freeze:** verification path must be `crypto.timingSafeEqual` (the repo precedent at server.js:414; pin it in the frozen-contract tests so Phase 42 inherits it).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Timing-safe MAC comparison | `===` on hex/base64 strings | `crypto.timingSafeEqual` (length-guard first) | Classic timing oracle; repo precedent exists |
| URL-safe base64 | custom char-map encoder | `Buffer.toString('base64url')` | Built-in, exactly the RFC 4648 §5 alphabet D-09 needs |
| Domain separation | ad-hoc string concat with guessing | `sha256(MASTER_KEY ‖ purpose-tag)` or `hkdfSync` | Purpose-tag collisions between TOTP envelope path and unsubscribe path would let one leak into the other |
| Header/MIME formatting | bespoke header serializer | append strings to the existing headers array | The array already handles CRLF join, Message-ID, MIME boundaries correctly |

**Key insight:** every primitive this phase needs is one `node:crypto` call away; the actual work is *where the code lives* (key scope vs render scope) and *freezing the format in tests before Phase 42 consumes it*.

## Runtime State Inventory

Not a rename/refactor/migration phase — but audited for new runtime state anyway:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None created — no table, no migration (D-09; token is stateless) | None |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | MASTER_KEY reused via derivation — no new env vars; D-07 forbids a new knob | None |
| Build artifacts | None | None |

All five categories explicitly checked: this phase introduces zero runtime state by design.

## Common Pitfalls

### Pitfall 1: Headers emitted without the HTTPS gate
**What goes wrong:** Gmail/Yahoo/Microsoft ignore (or penalize) one-click URLs that aren't HTTPS; a `http://app.test` dev APP_URL would ship a dead header.
**Why it happens:** APP_URL in test fixtures is `http://app.test` (test/digest.test.mjs fixture).
**How to avoid:** The `startsWith('https://')` gate inside the mailer (D-05); pin both gates with separate tests — one omitting `unsubscribeUrl`, one passing an `http://` URL.
**Warning signs:** a test fixture digest unexpectedly carrying one-click headers.

### Pitfall 2: Footer link missing from the TEXT part
**What goes wrong:** The digest has two bodies (base64 text + base64 HTML, mailer.js ~640-658). Adding the link only to the HTML part breaks the plain-text contract (D-03).
**How to avoid:** Update both `textBody` join (~602) and the HTML footer paragraph (~625); assert the settings URL in both decoded parts.

### Pitfall 3: Variable-length ID framing makes Phase 42's parse ambiguous
**What goes wrong:** `0x01 ‖ wsId ‖ userId` without delimiters is unparseable if IDs are variable-length (where does wsId end?). A wrong guess breaks the FROZEN contract later.
**How to avoid:** Check what wsId/userId actually are (internal IDs — the claim-key id space, `${ws.id}:${r.user_id}`). If they're fixed-format (e.g. hex/uuid), fixed-width framing works; if arbitrary, length-prefix them inside the signed payload **now**, while the format is still free. This is a format decision frozen this phase — see Open Questions 1.
**Warning signs:** Phase 42 writing a `split` with guessing.

### Pitfall 4: base64url padding leaking into the URL path
**What goes wrong:** Standard base64 pads with `=`; in a URL path it's ugly and some proxies mishandle it.
**How to avoid:** Node's `'base64url'` encoding emits no padding — use it, don't hand-strip.
**Warning signs:** `=` in captured token URLs.

### Pitfall 5: i18n key added but not catalogued in both locales
**What goes wrong:** `npm run i18n:scan` fails the build (scan covers server keys, mailer included).
**How to avoid:** Add `notif.digest.unsubscribe` (or chosen name) to en.json AND fr.json in the same task; existing `notif.digest.*` block is at en.json:1687-1691 [VERIFIED: grep].
**Warning signs:** catalogue test or i18n-scan red.

### Pitfall 6: Breaking the byte-identical claim key / digest tests
**What goes wrong:** The claim key `${ws.id}:${r.user_id}:digest:${localDate}` must stay untouched (SC-5, STATE invariant) and Phase 38's tests must pass unmodified.
**How to avoid:** Only ADD fields to the `sendDigest` msg payload; never reorder/remove. Run the full suite (`npm test`) per task commit.

## Code Examples

### RFC 8058 header contract (verified verbatim from the RFC)
```text
List-Unsubscribe: <https://app.example.com/unsubscribe/<token>>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```
- §3.1: `List-Unsubscribe` MUST contain one HTTPS URI that identifies recipient + list (no POST body arguments exist); URI SHOULD contain an opaque hard-to-forge component that the server verifies. [CITED: RFC 8058 §3.1]
- §3.1: `List-Unsubscribe-Post` MUST contain the single pair `List-Unsubscribe=One-Click`. [CITED: RFC 8058 §3.1, §5 ABNF]
- §3.1: sender MUST NOT return an HTTPS redirect on the POST. [CITED: RFC 8058 §3.1] (Phase 42 concern — record it in DEPLOY.md wording if natural, implement in 42.)
- §4: message MUST carry a valid DKIM signature covering BOTH headers; receivers SHOULD NOT offer one-click without it. [CITED: RFC 8058 §4] — the DEPLOY.md caveat's exact basis: signing stays at the instance's relay.
- §3.2: the receiver POSTs the `List-Unsubscribe=One-Click` pair as form body. [CITED: RFC 8058 §3.2] (Phase 42.)

### Existing send-site shape (what the token integrates with)
```js
// server.js ~1583 — verified current shape; only ADD msg fields
MAILER.sendDigest({
  to: r.email,
  locale: r.locale === 'fr' ? 'fr' : 'en',
  workspace: ws.name || 'Projects Studio',
  wsSlug: ws.slug,
  appUrl: APP_URL,            // verified: mailer.js:561 reads msg.appUrl
  unsubscribeUrl: unsubscribeUrl(APP_URL, ws.id, r.user_id), // NEW — only when gates pass
  dueToday: [...], overdue: [...],
}).catch(err => logWarn(`digest email → ${r.email}: ${err.message}`));
```
Gate placement choice: compute `unsubscribeUrl` in server.js only when `MASTER_KEY && APP_URL.startsWith('https://')`, OR always compute and let the mailer's URL gate drop it. **Recommend both-layer defense:** server omits when MASTER_KEY missing (key simply unavailable); mailer additionally refuses non-https URLs — that makes the mailer-side gate testable without a key.

### timingSafeEqual precedent (Phase 42 will reuse; freeze the pattern in tests)
```js
// server.js:414 in-repo shape
return got.length === want.length && crypto.timingSafeEqual(got, want);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `List-Unsubscribe` mailto: / http URLs (RFC 2369) | RFC 8058 one-click HTTPS POST headers | RFC published Jan 2017; Gmail/Yahoo bulk-sender enforcement from Feb 2024 | One-click is effectively mandatory for bulk senders; headers must be HTTPS and DKIM-covered |
| per-message stateful unsubscribe tables | Stateless signed tokens (HMAC over ids) | Standard modern practice; matches this project's zero-migration invariant | Rotation = implicit invalidation (documented, D-08) |

**Deprecated/outdated:**
- mailto: unsubscribe links alone — insufficient for the 2024+ bulk-sender rules; keep only as optional companion.
- Confirmation-page redirect after one-click POST — RFC 8058 §3.1 forbids redirect on POST; Phase 42 must return a bare 2xx.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | wsId/userId are fixed-format internal IDs (hex/uuid-like), making delimiter-free payload framing unambiguous | Pattern 2 / Pitfall 3 | Frozen token format needs re-framing; caught in planning by reading the id-space source — planner MUST verify before freezing |
| A2 | `Buffer.toString('base64url')` emits RFC 4648 §5 alphabet without padding | Pattern 2 | Minor: token alphabet differs from assumed; tests freeze whatever is actual — harmless |
| A3 | `crypto.hkdfSync` is available on Node v24.21.0 | Alternatives Considered | None (sha256 variant chosen anyway) |

## Open Questions (RESOLVED — by planning, 2026-11-05)

1. **wsId/userId byte format (drives payload framing)** — RESOLVED: `crypto.randomUUID()` confirmed at server.js:394 (fixed 36-byte UUIDs); delimiter-free framing `version‖wsId‖userId` is unambiguous; pinned by the token-freeze unit tests in 41-01 Task 2.
   - What we know: D-10/D-12 fix payload = version byte + wsId + userId, "same id space as the digest claim key"; claim key format `${ws.id}:${r.user_id}:digest:${localDate}` verified at server.js:1580.
   - Resolution basis: planner read of the id-generation code; length-prefixed framing not needed.
2. **Settings anchor id (D-04 discretion)** — RESOLVED per D-04 discretion: plans target the existing `#notif-email` section surface; no Settings DOM restructuring.
   - What we know: `settings.notif.digest` i18n key exists (en.json:1245) so a digest toggle surface exists in Settings.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | everything | ✓ | v24.21.0 [VERIFIED: `node --version`] | — |
| npm test runner | token-freeze + integration tests | ✓ | built-in `node --test` [VERIFIED: package.json:18] | — |

No missing dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node:test` (built-in, Node v24.21.0) |
| Config file | none — glob via package.json `"test": "node --test --test-concurrency=2 test/*.test.mjs"` [VERIFIED: package.json:18] |
| Quick run command | `node --test test/unsubscribe-token.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| UNSUB-01 | token deterministic; base64url alphabet; version byte first; different purpose tag → different sig | unit (pure helper) | `node --test test/unsubscribe-token.test.mjs` | ❌ Wave 0 |
| UNSUB-01 | tamper (flip a payload byte / a MAC byte) → verification fails; timing-safe compare used | unit | same | ❌ Wave 0 |
| UNSUB-01 | digest with https URL carries both headers with exact RFC strings | integration (SMTP capture, `http://app.test` fixture needs override) | `node --test test/digest.test.mjs` | ⚠️ extend existing file |
| UNSUB-01/SC-2 | missing `unsubscribeUrl` in msg → NO List-Unsubscribe headers, footer link still renders | integration | same | ❌ Wave 0 |
| UNSUB-01/SC-2 | `http://` URL in msg → NO List-Unsubscribe headers (second gate pinned) | integration | same | ❌ Wave 0 |
| UNSUB-03 | footer link text (i18n key) + settings URL present in BOTH decoded text and HTML parts | integration | same | ⚠️ extend existing file |
| UNSUB-03 | Settings `email_digest` toggle → next digest arrives (existing Phase 38 invariant) | integration | `node --test test/digest.test.mjs` | ✅ unmodified |
| SC-5 | claim key byte-identical; no-double-send; second-boot tests pass unmodified | integration | `node --test test/digest.test.mjs` | ✅ unmodified |
| i18n | new key catalogued EN+FR, scan green | suite | `npm run i18n:scan` + `npm test` | ✅ existing gate |

Note: existing digest fixtures run with `APP_URL=http://app.test` (MASTER_KEY set, test/digest.test.mjs:216) — header-positive tests need an https APP_URL fixture variant; header-negative tests use the existing fixture as-is. **Important nuance:** with the current fixture, the gates produce headers omitted (http) — meaning today's tests pass unmodified automatically, and the https case is a new positive-path fixture.

### Sampling Rate
- **Per task commit:** `npm test` (full suite is fast — pure node:test, no heavy deps)
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green + `npm run i18n:scan` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `test/unsubscribe-token.test.mjs` — token format freeze (deterministic sig, alphabet, version byte position, domain separation, tamper rejection, timing-safe path)
- [ ] https-APP_URL digest fixture variant for header-positive assertions
- [ ] New i18n key in en.json + fr.json before mailer task lands

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — (Phase 42 route is anonymous by design; token is the bearer credential) |
| V3 Session Management | no | — |
| V4 Access Control | indirect | the unguessable HMAC token IS the capability; timing-safe verification |
| V5 Input Validation | no (render-only) | URLs interpolated into headers must be the internally-built one — never echo user input; existing `escapeHtml`/`encodeWord` discipline holds |
| V6 Cryptography | yes | `node:crypto` HMAC-SHA256 + `timingSafeEqual`; purpose-tagged key derivation; never hand-rolled MAC |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged unsubscribe token (attacker POSTs guesses to Phase 42 route) | Spoofing | HMAC-SHA256 with domain-separated key; timing-safe compare; opaque single-segment token (D-09) — RFC 8058 §3.1/§6 recommends exactly this |
| Purpose-tag collision (unsubscribe key reused for another MASTER_KEY consumer) | Tampering/Elevation | Distinct purpose-tag string; domain-separation test pins different-tag→different-sig |
| Token leaks wsId/userId in logs/URL referers | Information Disclosure | Internal IDs only (D-12), opaque base64url, no query string (D-09) |
| Header injection via URL into SMTP headers | Tampering | The URL is wholly server-built (`APP_URL + literal path + base64url`); still, assert no CRLF possible (base64url alphabet cannot contain CR/LF) — a cheap freeze-test assertion |
| MASTER_KEY rotation silently degrades links | DoS (honest) | Documented rotation semantics (D-08) in DEPLOY.md |

## Sources

### Primary (HIGH confidence)
- RFC 8058 full text — rfc-editor.org/rfc/rfc8058 (§3.1 sender requirements, §3.2 receiver POST, §4 DKIM requirement, §5 ABNF, §6 security) — fetched and read this session [CITED: RFC 8058]
- Codebase (read this session): `mailer.js` (buildDigestMessage ~554, headers array ~638, footer frames ~602/~625, exports ~846), `server.js` (MASTER_KEY block 115-137, timingSafeEqual 162/414, digest send site ~1531-1597, APP_URL 85/boot guard 5418-5423), `test/digest.test.mjs` (fixtures, MASTER_KEY at :216, `http://app.test`), `src/locales/en.json` `notif.digest.*` 1687-1691, `package.json:18` test script, DEPLOY.md §14 (~line 804)

### Secondary (MEDIUM confidence)
- SearXNG results confirming Gmail/Yahoo bulk-sender one-click enforcement (support.google.com/mail/answer/81126; 2026 bulk-sender compliance surveys) — corroborates D-06's HTTPS rationale

### Tertiary (LOW confidence)
- None material.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — node:crypto only, verified in-repo precedents
- Architecture: HIGH — send-site, header array, footer frames all read this session
- Pitfalls: HIGH — anchored in actual fixture values (`http://app.test`, locale line numbers)

**Research date:** 2026-11-05
**Valid until:** 2026-12-05 (stable; Node/Crypto APIs frozen)
