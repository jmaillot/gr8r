# Project Research Summary

**Project:** Projects Studio — milestone v1.9 (SUBJ: workspace-named digest subjects + UNSUB: RFC 8058 one-click unsubscribe)
**Domain:** Notification email enhancements for a zero-runtime-dependency self-hosted PM app
**Researched:** 2026-11-05
**Confidence:** HIGH

## Executive Summary

Both features are additive surface work on shipped infrastructure (Phase 38 digest loop, Phase 34 `notif_prefs`, Phase 23 `APP_URL` deep links, existing hand-rolled SMTP mailer). Research is unanimous on the headline: **zero new runtime or dev dependencies.** SUBJ is a rendering-only change — the per-workspace digest split already exists (the send loop iterates workspaces and the claim key `${ws.id}:${user_id}:digest:${localDate}` is already workspace-scoped), so it reduces to a new localized subject key, "Project — Task" line format, and one real piece of new code: RFC 2047 subject encoding + CRLF stripping for user-controlled workspace names in a header (the mailer has only ever written static subjects). UNSUB is the larger surface: two SMTP headers (`List-Unsubscribe` HTTPS + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`), a stateless HMAC token, and the codebase's **first anonymous mutating route** — `POST /unsubscribe/:token` with no cookies, no sameOrigin guard (RFC 8058 forbids that context; the token IS the auth), idempotent convergent semantics (never token-burn/410), and a bare 2xx response.

The recommended approach per research: SUBJ first (independent, shippable alone, zero interaction with UNSUB), then UNSUB in two steps (token + headers, then route). HMAC tokens derived from a domain-separated `MASTER_KEY` beat a token table — no migration, no cleanup, old links keep working (correct for a convergent operation), and the token only flips one boolean off. The codebase's exactly-once instincts are the main hazard: unsubscribe is **convergent, not consumed** — repeat POSTs must be identical 200s, and responses must never distinguish valid from stale tokens (404-no-oracle discipline).

Key risks, ranked: (1) **DKIM gap** — RFC 8058 §4 expects one-click only on DKIM-signed mail and the mailer signs nothing; Phase 39 already deferred DKIM to its own milestone, so this milestone ships headers + endpoint with a documented DEPLOY.md caveat (self-hosted instances behind a signing relay get DKIM for free). Do not hand-roll DKIM here. (2) **Header injection via workspace names** (`Foo\r\nBcc: victim@x`) — a CR-class security surface, mitigated by one hardened subject-builder with hostile-name tests. (3) **Project-name leak (CR-01 class)** — task lines enriched with project names must route through the existing `memberCanReadProject` funnel, with private-project and guest-collaborator fixtures. (4) **Token hygiene** — bearer credential in URL paths: redact in logs, never in audit rows, fail-open honestly (omit headers if `MASTER_KEY` unset rather than send a broken link).

One scoping note: PITFALLS.md raises an aggregation-policy D-decision (N emails vs one multi-section email per user). Per the milestone context, **the owner has already decided per-workspace emails** — so the anti-feature ruling stands: one email per workspace, empty digest = no email, per-workspace unsubscribe token. The remaining invariant to protect is Phase 38's suppression rule (digest-on suppresses individual reminders) verified unmodified after the refactor.

## Key Findings

### Recommended Stack

Nothing to install — both features ship on Node ≥ 24 built-ins and existing plumbing. Full detail in `.planning/research/STACK.md`.

**Core technologies:**
- `node:crypto` HMAC — stateless unsubscribe token `HMAC-SHA256(derived(MASTER_KEY), "unsub:" + wsId + ":" + userId)`, base64url; satisfies RFC 8058 §6 opaque/hard-to-forge requirement with **no table and no migration**
- `crypto.timingSafeEqual` — token validation; prevents forged-unsubscribe vandalism (RFC explicitly calls this attack out)
- `node:http` existing router — the one structural anomaly: `POST /unsubscribe/:token` authenticates **solely by token**, bypassing `requireWorkspace`, session, sameOrigin, and CSRF (intentionally cross-context; invite-accept route family minus sameOrigin is the template)
- `node:sqlite` existing accessor — POST upserts `notif_prefs.email_digest=false` for that one (workspace_id, user_id) row (rows are sparse; must create a minimal row when absent)
- Existing SMTP mailer — two additional headers + RFC 2047 encode-word helper (~15 lines; new capability, not a dependency)

**Explicitly rejected:** npm mail/DKIM libs (breaks the standing zero-dep constraint), `http://` URLs (RFC §3.1 requires HTTPS), 3xx redirects on the POST, per-message nonce tokens (force a write per send and break old links).

### Expected Features

Full detail in `.planning/research/FEATURES.md`.

**Must have (table stakes):**
- Workspace name in digest subject, localized via new `tFor` key with `{workspace}` slot (EN+FR parity gate) — indistinguishable subjects collide in Gmail threads
- "Project — Task" task lines (em dash, body-HTML-escaped) — matches Linear/GitHub/GitHub norms of parent context on notification lines
- `List-Unsubscribe` (HTTPS) + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers on digest emails only
- Anonymous idempotent POST endpoint; immediate effect (pref read at send time — no scheduler change)
- `List-Id: <digest.<slug>.<host>>` per workspace (RFC 2919) — list identity + filtering
- Works while logged out (POST comes from Gmail infrastructure, not the user's browser)

**Should have (differentiators):**
- Token scoped to (workspace, user) with a purpose tag — per-workspace opt-out granularity; can't be replayed against future unsubscribe surfaces
- Footer note naming which workspace(s) the email covers and which unsubscribe it performs
- Re-subscribe is the existing Settings toggle — no confirmation flows either direction

**Defer (v2+):**
- DKIM signing — milestone-sized, Phase 39 already deferred it; document the caveat, revisit only if a provider enforces it
- One-click for other notification types — needs its own audit ruling (D-05 class)

### Architecture Approach

Zero new files, zero migration. The digest loop payload gains additive keys only (`project` on items, `unsubUrl` on the message) — old mailer contract preserved. The claim key stays **byte-identical** (changing it risks duplicate digests on deploy morning via the Phase 37 catch-up window). New components: a ~10-line token helper in server.js and one throttled anonymous POST route. Full detail in `.planning/research/ARCHITECTURE.md`.

**Major components:**
1. Digest loop (server.js:1416) — payload enrichment only; claim/ledger untouched
2. `buildDigestMessage` (mailer.js:525) — subjectWs key, "Project — Task" lines, header pair, RFC 2047 encode
3. Unsub token helper — domain-separated HMAC derivation (`sha256(MASTER_KEY + "unsub")`, not the raw AES key); digest sender omits headers entirely if `MASTER_KEY` is unset (honest degradation, never a broken link)
4. `POST /unsubscribe/:token` — throttle (login-family budget), timing-safe verify, per-workspace prefs upsert, bare 2xx / generic 404-no-oracle

### Critical Pitfalls

Top five; all eight in `.planning/research/PITFALLS.md` with phase mapping.

1. **DKIM gap masquerading as compliance** — ship headers + endpoint, but document in DEPLOY.md that Gmail/Yahoo honor one-click only on DKIM-authenticated mail; never claim full RFC 8058 compliance silently
2. **Header injection / mojibake via workspace names** — one `buildDigestSubject()` with CRLF strip + RFC 2047 encode + folding; hostile-name tests (emoji, `é`, embedded `\r\n`, 200 chars)
3. **CR-01-class project-name leak** — every line's project name resolved through `memberCanReadProject` at line-build time; private/team-scoped/guest fixtures; policy: omit the prefix rather than invent a placeholder
4. **Convergent, not consumed** — no token burn, no 410 on replay, identical generic responses for all states; a provider retry after transient failure must not error
5. **Token hygiene** — bearer credential: redact path in request logs, never in activity-log rows, watch for the old-token rotation question (with HMAC, `MASTER_KEY` rotation invalidates old links — acceptable and must be documented)

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Digest subject — workspace name + Project—Task lines (SUBJ)
**Rationale:** Fully independent of UNSUB, smallest risk surface, and the user-visible fix for the backlog defect; shippable alone.
**Delivers:** Localized `subjectWs` catalogue key, "Project — Task" task lines, hardened RFC 2047 subject-builder, EN+FR keys passing the i18n gate.
**Addresses:** SUBJ table-stakes items 1–2.
**Avoids:** Pitfalls 6 (encoding/injection) and 7 (name leak — funnel fixtures required); claim key stays byte-identical (Pitfall 5's anti-pattern).

### Phase 2: Unsubscribe tokens + List-Unsubscribe headers (UNSUB part 1)
**Rationale:** Token format must be frozen (test pins) before the route exists; headers are inert without the route but the plumbing is coherent alone.
**Delivers:** HMAC token helper (domain-separated, purpose-tagged), `unsubUrl` plumbing, both headers in `buildDigestMessage` (omitted when `MASTER_KEY` absent), List-Id header, DEPLOY.md DKIM caveat.
**Avoids:** Pitfall 1 (https-only URL asserted by raw-header unit test), Pitfall 8 (token hygiene contract written here).

### Phase 3: One-click POST endpoint (UNSUB part 2)
**Rationale:** Depends on Phase 2's frozen token format; this is the milestone's Phase-30-class security surface and deserves the security-contract-first treatment.
**Delivers:** Throttled anonymous `POST /unsubscribe/:token` — timing-safe verify, per-workspace `notif_prefs` upsert (creates missing rows), idempotent/convergent, no-oracle responses, GET no-op.
**Avoids:** Pitfalls 2 and 3 (no-cookie contract, replay semantics); sameOrigin explicitly exempted and documented at the route.

### Phase Ordering Rationale

- SUBJ has zero dependency on UNSUB (confirmed independently by FEATURES and ARCHITECTURE dependency maps) — landing it first delivers user value immediately.
- UNSUB's natural internal order is token → headers → route: token format is the shared contract; headers are trivial once `unsubUrl` exists; the route is the only genuinely new attack surface and goes last with its own test matrix.
- If a 2-phase shape is preferred, Phases 2+3 merge cleanly into one UNSUB phase (total surface is still small — ~150 lines + tests).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (POST route):** only because it's the first anonymous mutating route — the security contract (token model, method allow-list, replay posture, response matrix) should be pinned in plan-phase, ideally after a discuss-phase. No external research needed; RFC 8058 is fully covered here.

Phases with standard patterns (skip research-phase):
- **Phase 1 (SUBJ):** pure rendering + catalogue work on documented internal patterns (`tFor`, i18n gate, mailer templates).
- **Phase 2 (token + headers):** HMAC and header emission are long-stable primitives; ARCHITECTURE.md already specifies derivation and fail-open behavior.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | RFC 8058 read in full from primary source; everything else is Node built-ins already in the image |
| Features | HIGH | RFC verified + Gmail/Yahoo bulk-sender rules corroborated across 2024–2026 sources; competitor norms (Linear/GitHub/GitLab) checked |
| Architecture | HIGH | Every integration claim verified against live code with line numbers (server.js, mailer.js, notification-audit.md) |
| Pitfalls | HIGH | RFC + vendor requirements + project-local evidence from Phases 27/29/32/34/37/38/39 |

**Overall confidence:** HIGH

### Gaps to Address

- **DKIM posture for this instance's relay:** research recommends ship-with-caveat over in-repo signing; confirm during requirements that the owner accepts the documented DEPLOY.md caveat (and consider whether `List-Unsubscribe-Post` should be env-gated — research favors the caveat, owner rules)
- **MASTER_KEY rotation semantics:** rotation invalidates previously emailed unsubscribe links — acceptable, but state it in DEPLOY.md and confirm no other consumer depends on old links surviving
- **Suppression invariant after refactor:** the Phase 38 test asserting "digest-on suppresses individual reminders" must pass **unmodified** — treat as the milestone's highest-value regression test
- **Deploy timing relative to 09:00:** with the claim key untouched this should be moot, but the transition test (old-shape claim rows fixture → zero sends) is cheap insurance regardless
- **Subject format choice:** `"{workspace} — {digest}"` vs `"[{workspace}] {digest}"` — research offers both; pick via catalogue frame in discuss-phase, FR house style applies

## Sources

### Primary (HIGH confidence)
- RFC 8058 (rfc-editor.org) — read in full: §3.1 HTTPS/no-redirect/no-cookies, §3.2 receiver POST semantics, §4 DKIM, §5 headers, §6 opaque-token security, §8 examples
- Live code: server.js:1416-1601 (digest loop, claim key), server.js:157/414 (timing-safe, keyring), mailer.js:513-624/816-848 (buildDigestMessage, sendDigest), docs/notification-audit.md:89-90 (Phase 39 DKIM deferral)
- PROJECT.md phases 23/25/29/32/33/34/36/37/38/39, v1.8 CR-01, v1.2 decisions 5/11

### Secondary (MEDIUM–HIGH confidence)
- Gmail Email Sender Guidelines + Yahoo/Microsoft bulk-sender requirements (one-click for bulk senders, honored within two days)
- RFC 2919 List-Id convention; GitLab per-project List-Id precedent
- RFC 2369 (legacy mailto remains valid; mixed-URI header allowed), RFC 2047/5322 (encode-words, folding)

### Tertiary (MEDIUM confidence)
- Scanner/link-prefetch behaviors (SafeLinks, Google proxy) — vendor-documented, exact POST-prefetch semantics vary

---
*Research completed: 2026-11-05*
*Ready for roadmap: yes*
