# Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers - Context

**Gathered:** 2026-11-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Mailer-side half of RFC 8058 one-click unsubscribe (UNSUB-01, UNSUB-03): digest emails carry `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers whose URL embeds a stateless HMAC-SHA256 token over (wsId, userId) — domain-separated from the MASTER_KEY keyring, purpose-tagged, timing-safe-verifiable, format frozen by unit tests. Headers render only under two gates (MASTER_KEY set AND APP_URL is https); a plain footer unsubscribe link (settings anchor) renders alongside; DEPLOY.md documents the DKIM caveat and rotation semantics. NO endpoint (Phase 42 consumes the frozen token contract), no migration, no table, no digest claim-key changes.

</domain>

<decisions>
## Implementation Decisions

### Footer unsubscribe link (UNSUB-03)
- **D-01:** The footer unsubscribe link points at `APP_URL + /w/:slug/settings#notifications` (settings anchor) — works today, still works after Phase 42, never 404s. One-click unsubscribe stays header-only; the footer link is NOT the token URL.
- **D-02:** Link text is a new localized i18n key (e.g. `notif.digest.unsubscribe`) added to `src/locales/en.json` and `src/locales/fr.json`, rendered via `tFor` — the `npm run i18n:scan` gate stays green.
- **D-03:** The link sits INLINE after the existing footer sentence in both the text and HTML parts (separator choice at render discretion), following the existing plain-footer style.
- **D-04:** The exact settings-page anchor target is agent discretion — the anchor id may not exist today; the planner picks the closest existing Settings surface. No Settings-page restructuring this phase.

### Header render gates (SC-2, fail-open honestly)
- **D-05:** TWO independent gates decide whether `List-Unsubscribe`/`-Post` headers render: `MASTER_KEY` is set AND `APP_URL` starts with `https://`. Either gate missing → headers omitted entirely — no broken links, no `http://` URLs. Each gate is pinned by its own test. — **Reversibility:** one-way — once real digest emails have carried one-click headers, removing the feature silently changes the published email contract for receivers; format is frozen by tests.
- **D-06:** Owner initially chose trust-APP_URL but explicitly reverted after the provider-rejection tradeoff was surfaced (Google/Microsoft ignore non-HTTPS List-Unsubscribe URLs). The HTTPS gate is a deliberate owner decision, not over-caution.

### DKIM caveat & DEPLOY.md (SC-4)
- **D-07:** Ship-with-caveat confirmed by the owner: one-click headers ship unconditionally when the two gates pass; DEPLOY.md documents that DKIM signing stays at the instance's relay (RFC 8058 §4 — one-click is honored on DKIM-authenticated mail). NO env-gating knob for `List-Unsubscribe-Post` — do not add one.
- **D-08:** The same DEPLOY.md section documents MASTER_KEY-rotation-invalidates-old-links semantics: rotation makes previously emailed unsubscribe tokens stop verifying (no migration, no table; Phase 42 answers generically). STATE.md blocker items D-K1/D-K2 are both resolved by D-07/D-08.

### Token URL contract (frozen this phase, consumed by Phase 42)
- **D-09:** Opaque single path segment: `APP_URL + /unsubscribe/<base64url(payload || HMAC)>` — no query string, no readable identifiers in the URL.
- **D-10:** Payload = version byte (e.g. `0x01`) + wsId + userId (internal IDs — same id space as the digest claim key), signed with HMAC-SHA256 over a domain-separated, purpose-tagged derivation from MASTER_KEY (never the raw AES key; per the v1.9 roadmap decision). The version byte lets Phase 42+ evolve the format without invalidating verification of old tokens beyond what rotation already does.
- **D-11:** The token builder is an exported pure helper (e.g. `makeUnsubscribeToken`/`unsubscribeUrl`) — mirrors the Phase 40 `encodeWord`/`truncate` named-export pattern. Unit tests freeze: deterministic signature, base64url alphabet, version byte position, domain-separation (different purpose tag → different sig), tamper rejection, timing-safe verification path.
- **D-12:** Payload identifiers are internal IDs (wsId, userId), not the workspace slug — shortest token, no slug leak if the token ever lands in logs.

### the agent's Discretion
- Exact helper/file placement (mailer.js vs server.js) for the token builder, subject to D-11's export requirement.
- Exact purpose-tag string and key-derivation construction (HKDF-style vs `sha256(MASTER_KEY + purpose)` — researcher picks the domain-separation mechanism).
- Exact FR wording of the footer key following existing catalogue style.
- The inline separator between the footer sentence and the unsubscribe link.
- Which Settings surface/anchor the footer link targets (D-04).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § UNSUB — UNSUB-01/02/03 definitions (token model, no existence oracle, footer + settings re-subscribe path)
- `.planning/ROADMAP.md` § Phase 41 — all five success criteria are test-pinned obligations
- `.planning/STATE.md` § Recent Decisions + Blockers — keyring/fail-open decisions this phase must honor

### Prior-phase context
- `.planning/phases/40-digest-subject-task-lines/40-CONTEXT.md` — digest builder anchors, named-export test pattern (A2), mailer-is-pure-renderer rule

### Implementation anchors (source of truth in code)
- `mailer.js` — `buildDigestMessage` (line ~554), headers array (line ~640), footer frames (lines ~574/583), exported helpers (`encodeWord`, `truncate`, line ~846)
- `server.js` — `MASTER_KEY` boot block (lines ~115–137) and keyring `keyIdFor` — the domain-separation precedent
- `server.js` — digest send call site (~line 1588, `appUrl: APP_URL`)
- `server.js` — `APP_URL` boot guard (~line 5418: mail refuses to start without APP_URL when SMTP is set)
- `src/locales/en.json` / `src/locales/fr.json` — `notif.digest.*` keys
- `scripts/i18n-scan.mjs` — scan that must stay green (server keys included)
- `test/digest.test.mjs` — existing digest tests that must pass unmodified
- `DEPLOY.md` § MASTER_KEY (~line 804) — where the DKIM caveat + rotation note land

No external ADRs/specs — RFC 8058 semantics are captured in the requirements and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `buildDigestMessage(config, msg)` (mailer.js): the only digest send path; headers array is a plain list — append the two headers conditionally after `Subject`.
- `msg.appUrl` already reaches the mailer (mailer.js:551) — the footer link and header URL can build from it without new plumbing; the https gate reads the same value.
- MASTER_KEY/KEYRING boot block (server.js:115): the derivation precedent (`sha256` of key material, `keyIdFor` domain tagging).
- Phase 40 named-export pattern: pure helpers exported for test pinning (`encodeWord`, `truncate`, `buildDigestMessage`).
- `tFor` + SC-5 fallback frame: footer key renders through the same localized-frame mechanism.

### Established Patterns
- Mailer is a pure renderer — it never touches the DB; token signing needs the key, so the signed URL/headers must arrive pre-built in `msg` from server.js (or the key derivation helper lives where the key lives and the mailer receives the final headers/URL).
- Fail-open honestly: like TOTP encryption deferral, a missing MASTER_KEY degrades loudly-documented rather than pretending.
- Zero runtime dependencies: HMAC via `node:crypto` only.
- i18n-scan gate: any new user-visible string must be catalogued EN+FR.

### Integration Points
- `server.js` digest send site: compute the unsubscribe URL/token per (wsId, userId) after the claim insert, pass into `MAILER.sendDigest`.
- `mailer.js` headers array + footer frames: conditional headers, inline footer link.
- `DEPLOY.md`: new caveat subsection under the MASTER_KEY section.

</code_context>

<specifics>
## Specific Ideas

- Footer link wording: a settings-page anchor, not the token URL — "never 404s" was the deciding property.
- HTTPS gate: owner reverted trust-the-operator after hearing providers ignore non-HTTPS one-click URLs.
- Version byte inside the signed payload (not a URL prefix) — format evolution without breaking old links beyond rotation.

</specifics>

<deferred>
## Deferred Ideas

- Email branding: include the logo `public/logo-light.svg` at the top of notification emails, centered, text below it (owner request mid-discussion) — new capability, its own phase; not Phase 41 scope.
- None otherwise — discussion stayed within phase scope.

</deferred>

---

*Phase: 41-Unsubscribe Tokens & List-Unsubscribe Headers*
*Context gathered: 2026-11-05*
