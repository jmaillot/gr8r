# Phase 42: One-Click Unsubscribe Endpoint - Context

**Gathered:** 2026-11-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Server-side half of RFC 8058 one-click unsubscribe (UNSUB-02): the anonymous route `POST /unsubscribe/:token` (plus a stateless no-op GET on the same URL) verifies the Phase 41 HMAC token and flips `email_digest=false` for exactly that (workspace, user) stored prefs row. First anonymous mutating route — ships with a written security contract (token model, method allow-list, replay posture, response matrix, throttle on the login-family budget) pinned by tests before/with the route. Also folds the "coming soon" badge on the three inert Push toggles in Settings (email-audit follow-up). NO per-type unsubscribe tokens (deferred with push/toasts), NO push backend, NO token burn or 410 semantics, NO migration or table.

</domain>

<decisions>
## Implementation Decisions

### Response matrix (no existence oracle)
- **D-01:** A valid POST returns **200 + a minimalist self-contained HTML page** ("you will no longer receive these digests") — inline styles, zero external assets, safe to render inside a mail client's webview.
- **D-02:** Page language resolves from the **workspace of the token** (wsId is inside the payload) — load the workspace's default language after token verification; fall back deterministically (EN or workspace-table default) when the row is missing. This is a post-verification concern only.
- **D-03:** Invalid / stale / rotated-out / forged tokens receive **200 + the same HTML page with neutral generic text** ("your request has been processed") — never an error status, never a page that asserts the unsubscription happened. Identical envelope (status, content-type, caching headers) across all outcomes; only the body text differs between the verified and neutral variants.
- **D-04:** The verified/neutral text split is the ONLY observable difference in the response matrix — timing-safe verification per Phase 41 helpers, and the response must not leak which branch ran via status codes, headers, or body length parity beyond the localized string.

### Method allow-list & guards
- **D-05:** `POST /unsubscribe/:token` performs the mutation; **`GET /unsubscribe/:token` returns the same neutral HTML page with zero mutation** (stateless no-op — a pasted URL shows a clear page instead of an error, provider retries are harmless).
- **D-06:** Every other method (PUT/DELETE/HEAD/OPTIONS/…) → **405** with the generic JSON error envelope. Allow-list is exactly {GET, POST} and documented at the route.
- **D-07:** The route is **sameOrigin-exempt** (the unguessable token IS the CSRF defence, per REQUIREMENTS UNSUB-02) — it must explicitly bypass the Fetch-Metadata navigation guard and any session requirement; the exemption is documented in a route-level comment per the codebase's D-notation style.

### Throttle & replay posture
- **D-08:** The route consumes the **existing login-family IP rate limiter** (same budget as `/api/auth/*`) — no new counter, no dedicated throttle. Abuse from one IP gets blocked by the already-proven mechanism.
- **D-09:** Replay posture: **no token burn, no 410, no claim key** — repeat/replayed POSTs re-write `email_digest=false` (idempotent convergent upsert creating the row if sparse) and receive the identical response. Exactly the ROADMAP SC-2 semantics.

### Mutation semantics (carried from prior phases, restated for the planner)
- **D-10:** The upsert writes the **stored prefs row** via the Phase 38 `getStoredNotifPrefs`/stored-row path (D-08 Phase 38: stored rows, not merged views) for (token.wsId, token.userId) only — individual reminder emails resume per Phase 38 suppression semantics on the next pass.

### Push "coming soon" badge (folded from email audit)
- **D-11:** A "coming soon" badge (new i18n key, EN+FR, `npm run i18n:scan` green) is added to the **three inert push toggles only** (`push_mention`, `push_assign`, `push_comment` in `src/pages/settings.js` case `notif-push`). `due_reminder`/`past_due` in the same section are functional and stay badge-free.
- **D-12:** The toggles stay as they are today (rendered, clickable) — no disabling, no behavior change; the badge is purely informational. Real push + toasts is ROADMAP backlog 999.2.

### Security contract artifact (SC-4)
- **D-13:** The written security contract (token model reference, method allow-list, replay posture, response matrix, throttle budget, sameOrigin exemption) lives at/near the route in `server.js` as a consolidated comment block, and is pinned by tests in the same plan as the route — before/with implementation, never after.

### the agent's Discretion
- Exact HTML page construction (inline style values, minimal layout) within D-01's constraints.
- Exact i18n mechanism for the two page text variants (server-side key lookup consistent with the existing server i18n pattern; keys catalogued in both locales).
- Exact 405 JSON envelope reuse (the existing `fail()` shape).
- Whether the neutral page needs a `<meta noindex>` / `X-Robots-Tag` (agent judgment; document in the contract comment).
- Log-redaction mechanics for the token path (never written to request logs or activity rows — ROADMAP SC-3) at the researcher/planner's choice of implementation point.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` § UNSUB-02 — route definition (anonymous, throttled, sameOrigin-exempt, convergent, GET no-op)
- `.planning/ROADMAP.md` § Phase 42 — all five success criteria are test-pinned obligations
- `.planning/STATE.md` § Blockers + Recent Decisions — security-contract-first directive, Phase 38 stored-rows rule

### Prior-phase context
- `.planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-CONTEXT.md` — frozen token contract (D-09→D-12), rotation semantics (D-08), render gates
- `.planning/phases/41-unsubscribe-tokens-list-unsubscribe-headers/41-01-SUMMARY.md` — exported helpers `makeUnsubscribeToken`/`verifyUnsubscribeToken` in `mailer.js`
- `.planning/phases/38-*` context if present — suppression invariant the mutation must honor

### Implementation anchors (source of truth in code)
- `server.js` — `unsubscribeHmacKey()` derivation; route insertion point in the request router; `fail()` JSON envelope (~line 2789); Fetch-Metadata navigation guard (~line 5315) that must exempt this route; login-family rate limiter (the throttle budget to consume)
- `mailer.js` — exported token helpers (Phase 41 consumer contract)
- `src/pages/settings.js` — case `notif-push` (~line 391): the three inert toggles receiving the badge
- `src/locales/en.json` / `src/locales/fr.json` — badge + page text keys
- `scripts/i18n-scan.mjs` — i18n gate (server keys included)
- `test/digest.test.mjs` — suite that must pass unmodified (Phase 38 suppression invariant, second-boot/no-duplicate)
- `DEPLOY.md` §14 — one-click docs; route behavior note if the operator docs need a line

No external ADRs/specs — RFC 8058 semantics are captured in the requirements and decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `makeUnsubscribeToken` / `verifyUnsubscribeToken` (mailer.js, Phase 41 exports) — verification is already timing-safe and version-byte aware; the route is a thin consumer.
- `fail(res, status, code, message)` (server.js:2789) — generic JSON error envelope for the 405 path.
- Login-family IP rate limiter — direct budget reuse per D-08, no new mechanism.
- `tFor`/server i18n pattern + `scripts/i18n-scan.mjs` — page text and badge keys catalogue through the existing gate.
- Phase 40/41 pure-helper export pattern — the HTML page builder should be an exported pure function (test-pinnable) per the established named-export convention.

### Landmines
- The Fetch-Metadata navigation guard (~server.js:5315) must exempt this route EXPLICITLY — a mail-client POST carries no Sec-Fetch headers and no cookies; the default guard behavior would 302 it to /login.
- Do NOT resolve page language from a session (there is none) — workspace lookup post-verification only (D-02).
- The three push toggles are inert BY DESIGN; do not wire them, do not disable them (D-12).
- Traefik sits in front of production: the UAT trigger path for digest emails is the injected-clock internal endpoint, not a direct curl to the public URL.

</code_context>

<deferred>
## Noted for Later
- Per-type one-click unsubscribe (mention/assign/comment emails carrying their own headers) — deferred follow-up from Phase 41 UAT, revisit with the push/toasts phase (backlog 999.2).
- Real push notifications + toasts (the badge-marked toggles) — ROADMAP backlog 999.2.

</deferred>
