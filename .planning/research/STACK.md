# Stack Research

**Domain:** Digest email enhancements — RFC 8058 one-click unsubscribe + per-workspace subject rendering (Projects Studio, zero-runtime-dependency constraint)
**Researched:** 2026-11-05
**Confidence:** HIGH (RFC verified from primary source; all recommendations are Node built-ins already in the image)

## Headline Answer

**Zero new runtime dependencies. Zero new dev dependencies.** Both features are pure `node:crypto` + `node:sqlite` + existing mailer/header plumbing. The only genuine stack question RFC 8058 raises is **DKIM signing** — see the decision point below — and even that is implementable with `node:crypto` if the owner chooses in-repo signing.

---

## Recommended Stack

### Core Technologies (all already in the image)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Node.js built-ins | ≥ 24 (current Docker base) | Everything: header emission, HMAC tokens, POST route, sqlite claims | The zero-dep constraint is a standing project decision; nothing here needs more. RFC 8058 needs exactly one HTTPS POST route and two SMTP headers — adding a mail library for this would be net-negative. |
| `node:crypto` — HMAC | stable | Unsubscribe token: `HMAC-SHA256(APP_SECRET, "unsub:" + workspace_id + ":" + user_id)` → hex/base64url segment in the URL | RFC 8058 §6/§3.1: "The URI SHOULD include an opaque identifier or another hard-to-forge component." A stateless HMAC token satisfies this with **no new table and no migration** — the server recomputes and compares. Alternative (a `unsubscribe_tokens` SQLite table) is also zero-dep but adds a migration and cleanup logic for no gain. |
| `node:crypto` — timing-safe compare | stable | `crypto.timingSafeEqual()` for token validation | Prevents trivially forged unsubscribe POSTs (an attacker can POST to a victim's unsubscribe URL to unsubscribe them — RFC explicitly calls this out). |
| `node:http` (existing server.js router) | stable | `POST /w/:slug/unsubscribe` (or a top-level `/unsubscribe/:token` route) | The endpoint must be reachable **without cookies or authorization** (RFC §3.1: "The POST request MUST NOT include cookies, HTTP authorization, or any other context information"). This is the one structural difference from every existing route: it bypasses `requireWorkspace` and authenticates solely by token. |
| `node:sqlite` | stable | The POST handler flips the existing `notif_prefs.email_digest` row to 0 (same accessor from Phase 34) | Idempotent, additive-only (no schema change at all if tokens are HMAC). Also reuse the transactional-claim pattern if you want exactly-once unsubscribe confirmation. |
| Hand-rolled SMTP mailer (existing) | — | Emit two additional headers on the digest message | `List-Unsubscribe: <https://APP_URL/unsubscribe/<token>>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Header injection into the existing fire-and-forget SMTP writer is a one-line addition per header. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| *(none)* | — | — | Nothing. RFC 8058 is header syntax + one form-POST endpoint; `List-Unsubscribe=One-Click` is a fixed string. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@playwright/test` (existing dev dep) | E2E: click unsubscribe link in a rendered digest | Only for the GET landing-page variant if you add one; the RFC POST path is better covered by a node unit test that fires an `http.request` POST against a test server with a 200/410 expectation. |
| node:test (existing) | Unit tests: token sign/verify roundtrip, timing-safe mismatch, header emission snapshot | Follows the project's established test conventions. |

## Installation

```bash
# Nothing to install. Both features ship on existing infrastructure.
npm install    # no-op — package.json unchanged
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Stateless HMAC token in URL (no migration) | Opaque token stored in a new SQLite table | Only if tokens must be revocable or single-use. For a digest toggle, revocation matters little (the token only flips one boolean to `off`), so HMAC wins on simplicity. |
| Top-level route `/unsubscribe/<token>` (token encodes workspace+user, route ignores slugs) | Workspace-scoped `POST /w/:slug/unsubscribe?u=<user>&sig=<sig>` | The top-level token route is simpler and matches how one-click POSTs arrive (mail clients POST the URL verbatim, RFC example §8.1). Prefer it — no slug parsing, no workspace-name-in-URL privacy leak. |
| Hand-rolled DKIM signing in `dkim.js` via `node:crypto.createSign('RSA-SHA256')` over relaxed/relaxed canonicalization | Delegate DKIM to the instance's outbound SMTP relay (common for self-hosted installs: postfix/opendkim, or a transactional relay) | Sign in-repo only if instances send straight from the container without a signing relay. If the deployment already runs postfix or a relay, sign there and keep `dkim.js` out of scope. **Do not buy a dependency (e.g. `mailauth`, `dkim-signer`) — but honestly, hand-rolling DKIM is ~150 lines of canonicalization-fiddly code and the relay route is operationally safer for a self-hosted product.** |
| `List-Unsubscribe-Post: List-Unsubscribe=One-Click` on digest only | Also on every per-type notification email | Digest first (it's the bulk-mail-shaped message); rolling to all notification email is a trivial follow-up but touches more templates/tests. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Any npm mail/DKIM library (`nodemailer`, `mailauth`, `dkim-signer`, `mailparser`) | Breaks the zero-runtime-dependency standing constraint; the existing hand-rolled SMTP writer already sends headers fine; these libs pull transitive dep trees | Built-in header emission + `node:crypto` for any signing |
| `http://` unsubscribe URL | RFC 8058 §3.1: "The List-Unsubscribe header field MUST contain one HTTPS URI." Gmail/Outlook additionally require the whole domain be TLS-served | `APP_URL` behind Traefik already terminates TLS — verify `APP_URL` is the public https URL (it must be, since email deep links from Phase 23 use it) |
| HTTP 3xx redirect on the unsubscribe POST | RFC 8058 §3.1: "MUST NOT return an HTTPS redirect, since redirected POST actions have historically not worked reliably" | Answer `200` (text/plain or tiny HTML) directly |
| Cookie/session-based auth on the unsubscribe route | RFC forbids cookies/authorization context on the POST; Gmail's POST arrives with zero browser state | HMAC token as the sole authenticator |
| A per-message (nonce) token | Digests fire daily per user; nonces force a table write per send and stale-token 410s when users click an old email | Stable per-(workspace,user) HMAC — an old digest's link keeps working, which is correct behavior |

## Stack Patterns by Variant

**If the instance sends via a signing SMTP relay (postfix+opendkim, Mailgun, etc.):**
- Emit the two headers from the hand-rolled mailer and stop there.
- DKIM coverage of `List-Unsubscribe`/`List-Unsubscribe-Post` happens at the relay; nothing in-repo.
- This is the recommended v1 of the feature.

**If the instance must sign DKIM in-repo (container sends raw SMTP, no relay):**
- New hand-rolled `dkim.js`: relaxed/relaxed canonicalization, `rsa-sha256`, `crypto.createSign('RSA-SHA256')` with a PEM key from env (`DKIM_PRIVATE_KEY`, `DKIM_DOMAIN`, `DKIM_SELECTOR`), `h=` covering `from:to:subject:date:message-id:list-unsubscribe:list-unsubscribe-post`.
- All primitives exist in `node:crypto`; the risk is canonicalization corner cases (header folding, CRLF normalization), mitigated by a fixture test against a known-good signed message.
- Note: Phase 39's audit already recorded the honest deferral — "one-click deferred to a DKIM milestone" — so the owner is aware DKIM is the real prerequisite, not the headers.

**TLS/APP_URL interaction:** one-click POSTs go to the public `APP_URL` domain, so no server-side TLS code is needed — Traefik terminates HTTPS exactly as for existing deep links (`/w/:slug/task/:key`). The only checks: `APP_URL` must be `https://`, and Traefik must not strip or reject the unauthenticated POST (no sameOrigin/csrf middleware on this route — it is intentionally cross-context).

## Version Compatibility

| Component | Compatible With | Notes |
|-----------|-----------------|-------|
| Node ≥ 18 `crypto.timingSafeEqual`, `createHmac` | All | Stable for years; Node 24 base has them. |
| `node:sqlite` | Node ≥ 22.5 | Already in use since v1.5-era scheduler work. |
| RFC 8058 | RFC 2369 (List-Unsubscribe), RFC 6376 (DKIM), RFC 7578 (form encoding) | POST body arrives as `application/x-www-form-urlencoded` or `multipart/form-data` — parse defensively but treat the body as opaque (the fixed value is in the header, not the body). |
| Gmail/Yahoo/Microsoft bulk-sender rules (2024+) | — | Gmail requires one-click support + DKIM/SPF for bulk senders; emitting the headers is what unlocks the "Unsubscribe" button. |

## Feature-Specific Notes (SUBJ — per-workspace subject)

No stack additions at all. The digest send loop already iterates per user and resolves workspace via `tFor()` locale catalogues:
1. New catalogue keys, e.g. `digest.subject` = `"{workspace} — Digest"` / `"« {workspace} » — Résumé quotidien"` (EN↔FR parity gate applies).
2. Subject line = workspace `name` interpolated + each task line rendered as `"{projectName} — {taskName}"` — both strings are already in scope in the reminder-pass harness; the em dash is a literal in the template, not a catalogue value.
3. **Header safety:** workspace/project/task names are user-controlled. The mailer must RFC 2047-encode non-ASCII subjects (`=?UTF-8?B?<base64>?=`) and strip CR/LF from interpolated names to prevent SMTP header injection — a small hardening the existing mailer may not yet do for dynamic subjects (static subjects never exercised it). This is the only real new code in SUBJ, and it's ~15 lines in the mailer.

## Sources

- RFC 8058 (rfc-editor.org, primary text fetched and read in full 2026-11-05) — sender requirements §3.1, header syntax §5, security §6, examples §8 — **HIGH**
- Gmail Email Sender Guidelines (bulk-sender one-click expectations) — **MEDIUM** (widely known, not re-fetched this session)
- `.planning/PROJECT.md` — Phase 34 notif_prefs accessor, Phase 23 APP_URL deep links, Phase 39 audit decision record — **HIGH**
- Node.js `crypto`/`http`/`sqlite` API stability — **HIGH** (long-stable built-ins)

---
*Stack research for: Projects Studio digest email — RFC 8058 one-click unsubscribe + per-workspace subject*
*Researched: 2026-11-05*
