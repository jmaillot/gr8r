# Phase 41: Unsubscribe Tokens & List-Unsubscribe Headers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 41-Unsubscribe Tokens & List-Unsubscribe Headers
**Areas discussed:** Footer link shape, HTTPS enforcement, DKIM caveat confirm, Token URL contract

---

## Footer link shape

| Option | Description | Selected |
|--------|-------------|----------|
| Settings anchor (Recommended) | Footer shows "Unsubscribe from digest" pointing at APP_URL + /w/:slug/settings#notifications — works today, still works after Phase 42, never 404s | ✓ |
| Token URL | Footer link points at the HMAC token URL too — would 404 between Phase 41 deploy and Phase 42 | |
| Settings now, token later | Generic settings link now; Phase 42 swaps it for the token URL | |

| Option | Description | Selected |
|--------|-------------|----------|
| Localized key (Recommended) | New i18n key (notif.digest.unsubscribe) EN+FR via tFor — i18n-scan stays green | ✓ |
| English literal | No locale key, no i18n-scan entry | |

| Option | Description | Selected |
|--------|-------------|----------|
| Inline after footer | Keeps existing sentence, separator, then link — minimal visual change | ✓ |
| Separate paragraph | Link on its own paragraph below the footer sentence | |

| Option | Description | Selected |
|--------|-------------|----------|
| You decide (Recommended) | Exact settings anchor is agent discretion | ✓ |
| Pin anchor in plan | Phase must also create/adjust a notifications anchor on Settings | |

**User's choice:** Settings anchor, localized key, inline after footer, anchor = agent discretion.
**Notes:** Deciding property was "never 404s" — the token URL route doesn't exist until Phase 42.

---

## HTTPS enforcement

| Option | Description | Selected |
|--------|-------------|----------|
| HTTPS-only headers (Recommended) | Headers render only when APP_URL starts with https:// | (after revert) |
| Trust APP_URL | Build URL from APP_URL verbatim | initially chosen |

**User's choice:** Initially chose Trust APP_URL; reverted to HTTPS-only after confirmation follow-up.
**Notes:** The revert was explicit: surfaced that Google/Microsoft reject/ignore non-HTTPS List-Unsubscribe URLs, so an http:// APP_URL would silently lose one-click in real inboxes. Final rule: two independent gates (MASTER_KEY set AND APP_URL https) → headers; otherwise omitted, each gate pinned by its own test.

---

## DKIM caveat confirm

| Option | Description | Selected |
|--------|-------------|----------|
| Ship with caveat (Recommended) | Headers unconditional when gates pass; DEPLOY.md documents the relay-DKIM caveat; no env-gating | ✓ |
| Env-gate the headers | Add UNSUB_ONE_CLICK-style env flag | |

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, rotation note too (Recommended) | Same DEPLOY.md section documents MASTER_KEY-rotation-invalidates-old-links | ✓ |
| DKIM note only | Rotation semantics documented elsewhere/later | |

**User's choice:** Ship-with-caveat + rotation note in the same DEPLOY.md section.
**Notes:** Resolves both Phase 41 blocker items flagged in STATE.md.

---

## Token URL contract

| Option | Description | Selected |
|--------|-------------|----------|
| Opaque single segment (Recommended) | /unsubscribe/<base64url(payload‖HMAC)> — one unguessable blob, no query string | ✓ |
| Query params | Readable but leaks wsId/userId in logs/referrers | |

| Option | Description | Selected |
|--------|-------------|----------|
| Version byte in payload (Recommended) | Payload = version byte + wsId + userId; future format evolution without breaking old tokens | ✓ |
| No version byte | Smallest token; any format change breaks verification of emailed links | |

| Option | Description | Selected |
|--------|-------------|----------|
| Exported helper + tests (Recommended) | Pure exported helper; unit tests freeze signature/alphabet/version byte/tamper rejection — Phase 40 A2 pattern | ✓ |
| Inline, test via headers | Tested only through the header output string | |

| Option | Description | Selected |
|--------|-------------|----------|
| Internal IDs (Recommended) | wsId + userId raw — shortest token, same id space as the digest claim key | ✓ |
| Slug + user id | Human-decodable but longer; leaks slugs in logs | |

**User's choice:** Opaque single segment, version byte, exported helper + tests, internal IDs.
**Notes:** HMAC domain-separated, purpose-tagged, derived from MASTER_KEY — never the raw AES key (standing v1.9 decision).

---

## the agent's Discretion

- Exact settings-page anchor target (D-04) — closest existing Settings surface.
- Helper/file placement for the token builder (subject to the export requirement).
- Purpose-tag string and key-derivation construction (researcher picks the domain-separation mechanism).
- FR wording of the footer key; inline separator between footer sentence and link.

## Deferred Ideas

- Email branding: include the logo `public/logo-light.svg` at the top of notification emails, centered, text below it (owner request mid-discussion) — new capability, its own phase.
