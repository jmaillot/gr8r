# Architecture Research

**Domain:** Digest email splitting per workspace + RFC 8058 one-click unsubscribe — integration into the existing reminder-pass/mailer architecture (subsequent milestone, zero runtime dependencies held)
**Researched:** 2026-11-05
**Confidence:** HIGH (all claims verified against live code: server.js:1416-1601, mailer.js:513-624/816-848, docs/notification-audit.md:89-90)

## Standard Architecture

### System Overview (target state, new/modified marked)

```
┌────────────────────────────────────────────────────────────────────┐
│                     runReminderPass (server.js:1416)               │
│        per-workspace loop → per-membership digest loop             │
├────────────────────────────────────────────────────────────────────┤
│  digest loop (unchanged shape)                                     │
│    memberships⋈users per ws → stored email_digest===true gate     │
│    → scope-filtered dueToday/overdue                               │
│    → NEW: items carry {key, title, project} (project NAME)         │
│    → claim `${ws.id}:${r.user_id}:digest:${localDate}`             │
│      ★ UNCHANGED — already per-(workspace, user); the "split"      │
│        per workspace already exists. SUBJ is a rendering change.   │
├────────────────────────────────────────────────────────────────────┤
│  MAILER.sendDigest (mailer.js:816/848)  — fire-and-forget          │
│    → NEW: msg.unsubUrl (APP_URL + /unsub/<token>)                  │
│    → buildDigestMessage (mailer.js:525)                            │
│         MOD: subject carries workspace name (new catalogue key)    │
│         MOD: task lines "Project Name — Task Name"                 │
│         NEW: List-Unsubscribe + List-Unsubscribe-Post headers      │
├────────────────────────────────────────────────────────────────────┤
│  NEW: stateless unsub token (server.js helper)                     │
│    HMAC-SHA256(MASTER_KEY, "unsub:" + wsId + ":" + userId)         │
│    → base64url, timing-safe compare via server.js:157 helper       │
├────────────────────────────────────────────────────────────────────┤
│  NEW: POST /api/unsub/:token  (auth-free, no session, no CSRF      │
│  cookie context — mail clients POST cross-origin per RFC 8058)     │
│    → verify token → upsert notif_prefs email_digest=false          │
│      for THAT (workspace_id, user_id) only                         │
└────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Status |
|-----------|----------------|--------|
| `runReminderPass` digest loop | Recipient enumeration, scope filtering, exactly-once claim | **Modified** — payload only (adds project names, unsubUrl); claim key untouched |
| `reminders_sent` ledger | Exactly-once per (workspace, user, localDate) | **Unchanged** — key `${ws.id}:${r.user_id}:digest:${localDate}` is already per-workspace, so multi-workspace users already receive one email per workspace |
| `buildDigestMessage` (mailer.js:525) | Subject/body rendering, MIME, headers | **Modified** — subject key, task-line format, two new headers |
| Unsub token helper | Stateless, unguessable, verifiable link tokens | **New** — ~10 lines, `node:crypto` HMAC, no table |
| `POST /api/unsub/:token` | One-click unsubscribe write | **New** route in server.js |
| `notif_prefs` rows (workspace_id, user_id) | Where `email_digest=false` lands | **Unchanged** — needs an upsert path (rows are sparse; a user may have no stored row) |
| Catalogues (`notif.digest.*`) | EN+FR strings | **Modified** — new subject key + task-line key; i18n-scan build gate applies |

## Architectural Patterns

### Pattern 1: Stateless HMAC link tokens (chosen for UNSUB)

**What:** The unsubscribe token is `HMAC-SHA256(MASTER_KEY, "unsub:" + workspaceId + ":" + userId)`, base64url-encoded, truncated to ~16 bytes. Verification recomputes and compares with the existing fixed-length timing-safe compare (server.js:157). No new table, no migration, no second-boot concern — this satisfies the additive-only constraint at zero cost.
**Why not a table/stateful token:** invites use stored random tokens because they expire and are single-purpose; unsubscribe links are the opposite — permanent, replayable, idempotent. State would only add a migration and a sweep.
**Key material:** derive from `MASTER_KEY` (already mandatory-in-practice; the TOTP envelope machinery depends on it). Use a domain-separated derivation (`sha256(MASTER_KEY + "unsub")`) rather than the raw AES key. **Rotation caveat (document in DEPLOY.md):** MASTER_KEY rotation invalidates old links — acceptable, links live in already-delivered emails; the next digest carries fresh tokens.
**Fail-open edge:** if `MASTER_KEY` is unset, tokens cannot be minted — the digest sender should then omit the `List-Unsubscribe` headers entirely (header-only, honest degradation) rather than sending a broken link.

### Pattern 2: Auth-free route with the invite-accept hardening shape

**What:** `POST /api/unsub/:token` is the first non-invite anonymous mutating route. Copy the Phase 33 invite-accept contract **minus sameOrigin**:
- Throttle first (same budget family as login/accept — an unauthenticated write).
- **Explicitly exempt from `sameOrigin()`** and document why at the route: RFC 8058 §4 one-click is a POST from the recipient's mail client with **no cookies and no preflight** — it is cross-origin by construction. Enforcing sameOrigin would break the feature.
- **CSRF analysis:** the classic CSRF risk (browser ambiently sends session cookies on a cross-site POST) does not apply — the request carries no session, and the only authority is the unguessable token in the path. Residual risk is an attacker brute-forcing or replaying a token to force-unsubscribe a victim: token space is HMAC-wide (not brute-forceable), the action is idempotent, reversible in Settings, and denial-grade only. Do **not** add a body or JSON content-type requirement — Gmail's one-click POST sends an empty body and mail clients send no Accept headers worth negotiating.
- Response: bare `2xx` (Gmail treats non-2xx as failure and may retry; never render the SPA or an HTML error). Unknown token → generic `404`-family body, no validity oracle worth leaking (token space is 128+ bits).

### Pattern 3: One visibility pipeline, rendering-only digest changes (SUBJ)

**What:** Feature 1 (SUBJ) touches **zero** scheduling/claim/visibility code. The per-workspace split already exists: the digest loop iterates workspaces and enumerates `memberships` per workspace, and the claim key already embeds `ws.id` — a user in three workspaces receives up to three emails with three separate claims. What changes is purely what the mailer renders:
1. **Subject carries the workspace name:** the loop already passes `workspace: ws.name` (server.js:1586); add a new catalogue key (e.g. `notif.digest.subjectWs`, `{workspace, count}`) with the current count-only subject kept as fallback for a missing name (the code already defaults `'Projects Studio'`, mailer.js:530).
2. **Task lines read "Project Name — Task Name":** the payload currently maps to `{key, title}` only (server.js:1589-1590). Resolve each task's project name from the `projects` Map already computed at server.js:1426 — pass `{key, title, project}`. Rendering side: `- ${project} — ${title}` (em dash, consistent with the FR house style of a narrow-no-break space before punctuation; use `escapeHtml` after interpolation, T-36-01). **Fallback:** project missing/deleted/archived-from-doc → omit the prefix (render just the title) rather than inventing a placeholder. Reuse the existing `dueToday`/`overdue` structure — do not reshape the message contract.
3. Push the FR catalogue + i18n-scan gate as usual (both new keys must exist in EN and FR or the build fails).

### Anti-Pattern: "fix" the per-workspace splitting in the claim key

**What people do:** assume the ledger key must change for per-workspace digests and redesign `${ws.id}:${r.user_id}:digest:${localDate}`.
**Why it's wrong:** the loop is already workspace-outer, membership-inner; the key is already scoped by workspace. Changing it risks double-sends for existing installs (an old-format claim row no longer matches).
**Do this instead:** leave the claim key byte-identical; treat SUBJ as a mailer + payload change only.

### Anti-Pattern: global unsubscribe from a workspace-scoped email

**What people do:** one-click sets `email_digest=false` for every workspace the user belongs to.
**Why it's wrong:** `notif_prefs` is deliberately keyed `(workspace_id, user_id)` (Phase 34); each digest email is workspace-specific and its unsubscribe link embeds that workspace's id. A global flip from one workspace's email contradicts the prefs model and surprises users who opted into another workspace's digest.
**Do this instead:** the token encodes (workspace, user); the route upserts `email_digest=false` on that one row. The email footer can note that other workspaces have separate settings (optional catalogue key).

### Anti-Pattern: shipping `List-Unsubscribe-Post` while silent about DKIM

**What people do:** add both headers, declare RFC 8058 done.
**Why it's wrong:** the Phase 39 audit (docs/notification-audit.md:89-90) already established that RFC 8058 §4 says a sender **SHOULD NOT offer one-click without a valid DKIM signature**, and this mailer signs nothing (`grep` confirms zero DKIM code). Gmail/Yahoo enforce one-click only for authenticated bulk mail.
**Do this instead:** this milestone ships both headers + the endpoint as scoped, with an explicit documented caveat in DEPLOY.md (one-click is honoured by Gmail/Yahoo only when the instance's relay/MTA DKIM-signs; self-hosted instances behind an authenticating relay typically get this for free). Alternatively gate the `-Post` header behind an env flag — recommend the documented caveat first (simpler, and the endpoint is still correct for compliant receivers); let the owner rule during requirements.

## Data Flow

### Digest send (SUBJ-relevant delta in **bold**)

```
tick (≥09:00 local, catch-up eligible) → runReminderPass
  → per ws: tasks, projects Map, localDate (unchanged)
  → per membership: stored email_digest===true → filter assignee+scope (unchanged)
  → transaction: claim `${ws.id}:${user_id}:digest:${localDate}` (unchanged)
  → post-commit fire-and-forget:
      MAILER.sendDigest({
        to, locale, workspace: ws.name, wsSlug, appUrl,
        dueToday: [{key, title, **project**}],
        overdue:  [{key, title, **project**}],
        **unsubUrl: `${APP_URL}/unsub/${token(ws.id, user_id)}`**,   ← NEW
      })
  → buildDigestMessage: **subjectWs key**, **"Project — Task" lines**,
    **List-Unsubscribe headers**, base64 parts (unchanged bones)
```

### One-click unsubscribe (new flow)

```
mail client POST /api/unsub/:token        (no cookies, cross-origin — by design)
  → throttle (login-family budget)
  → split/validate token shape → recompute HMAC → timing-safe compare
  → match: SELECT id FROM workspaces + users implied by token
  → transaction: upsert notif_prefs (workspace_id, user_id) → email_digest=false
      (idempotent; row may not exist — create the minimal row)
  → 200, empty/1-line body
  mismatch → 404-family, no oracle
```

Note the route needs the route-shape convention check: this is the first anonymous non-SPA POST; mount it beside the invite-accept route family and keep the response contract bare so SPA routing never intercepts it.

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| server.js digest loop ↔ mailer.js | `sendDigest` payload object | Only additive keys (`project` on items, `unsubUrl`); old contract preserved so mailer tests diff cleanly |
| unsub route ↔ notif_prefs accessor | New upsert sibling of `getUserNotifPrefs` | Must follow Phase 34's stored-vs-merged discipline: write `email_digest:false` into the stored row, never touch the merged defaults |
| unsub token ↔ MASTER_KEY keyring | Domain-separated HMAC key | Does NOT use the `v2:` AES envelope format; separate derivation, no key-id embedding needed (single current key suffices for tokens) |
| new catalogue keys ↔ i18n-scan gate | Build-time | EN↔FR parity enforced; `subjectWs` needs `{workspace}` and `{count}` placeholders in both |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| SMTP relay (existing `mailer.js`) | Unchanged fire-and-forget | Headers ride the existing hand-rolled MIME assembly (mailer.js:592-603 block) |
| Gmail/Yahoo one-click | `List-Unsubscribe-Post: List-Unsubscribe=One-Click` + 2xx POST endpoint | Honoured only when mail is DKIM-authenticated — documented caveat (see anti-pattern 3) |
| RFC 2369 receivers | `List-Unsubscribe: <https://…/unsub/:token>` header-only | Works for everyone today; no server change needed beyond the route |

## Recommended Project Structure (delta only)

```
server.js        # MOD: digest loop payload (+project, +unsubUrl); NEW: unsub token
                 #      helper + POST /api/unsub/:token route (throttled, anonymous)
mailer.js        # MOD: buildDigestMessage — subject key, task-line format, 2 headers,
                 #      unsubUrl plumbing into text+HTML footers
src/core/i18n    # MOD: catalogues — notif.digest.subjectWs, task-line frame, footer note
test/            # NEW: token determinism/timing-safe pins, unsub route matrix
                 #      (valid/unknown/rotated token, upsert on missing row),
                 #      digest subject + line-format snapshot, header presence
DEPLOY.md        # MOD: DKIM/one-click caveat + MASTER_KEY-rotation token note
```

No new files, no migration, no new dependency — consistent with every standing constraint.

## Suggested Build Order

1. **SUBJ (mailer-first)** — payload `{project}` resolution in the digest loop, subjectWs key, "Project — Task" lines, EN+FR catalogues, tests. Zero interaction with UNSUB; shippable alone.
2. **UNSUB token + headers** — HMAC helper, `unsubUrl` plumbed through `sendDigest`, `List-Unsubscribe`/`List-Unsubscribe-Post` headers in `buildDigestMessage` (header-only when MASTER_KEY absent), DEPLOY.md caveat.
3. **UNSUB route** — `POST /api/unsub/:token` with throttle, timing-safe verify, per-workspace prefs upsert, response contract; route matrix tests + token pins.

Rationale: 1 has no dependency on 2/3; 2's headers are inert without 3's endpoint but both are small and coherent; 3 depends on 2's token format being frozen (test pins).

## Anti-Patterns (summary)

- Redesigning the digest claim key — already per-workspace (anti-pattern 1).
- Global unsubscribe from a workspace-scoped link — violates the Phase 34 prefs model (anti-pattern 2).
- Claiming RFC 8058 compliance without acknowledging the DKIM gap (anti-pattern 3).
- Enforcing sameOrigin on the one-click POST — breaks RFC 8058 mail-client behaviour; the token is the CSRF defence.
- Rendering the SPA or HTML errors on the unsub POST — receivers require a bare 2xx.

## Sources

- server.js:1416-1601 — `runReminderPass` digest loop, claim key, payload shape (read directly, HIGH)
- server.js:1533-1592 — per-workspace membership enumeration + `ws.name`/payload passed to sendDigest (HIGH)
- server.js:157, 414, 432-487 — timing-safe compare helper, `v2:` keyring envelopes, MASTER_KEY derivation patterns (HIGH)
- mailer.js:513-624 — `buildDigestMessage`: subject frame, task lines, MIME header block (HIGH)
- mailer.js:816/848 — `sendDigest` dispatch (HIGH)
- docs/notification-audit.md:89-90 — Phase 39 decision: plain header now, one-click deferred pending DKIM; RFC 8058 §4 citation (HIGH)
- Phase 33 HARD-01..05 (PROJECT.md:430) — sameOrigin-first anonymous-route contract being adapted (HIGH)
- Phase 34 SETTINGS-01..03 (PROJECT.md:436) — notif_prefs keyed (workspace_id, user_id), stored-vs-merged discipline (HIGH)

---
*Architecture research for: v-next digest features (SUBJ + UNSUB)*
*Researched: 2026-11-05*
