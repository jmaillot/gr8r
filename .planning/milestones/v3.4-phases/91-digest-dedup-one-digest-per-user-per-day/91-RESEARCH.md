# Phase 91: Digest Dedup — One Digest Per User Per Day - Research

**Researched:** 2026-11-23
**Domain:** server.js reminder/digest pass restructure + mailer templating + unsubscribe contract
**Confidence:** HIGH (all claims below read directly from source this session)

## User Constraints (from 91-CONTEXT.md — LOCKED)

- **D-01:** per-recipient-tz trigger kept; coalesce in-memory per (user, localDate) inside the global tick; no fixed server-clock send time.
- **D-02:** ONE global unsubscribe link; unsubscribing disables `email_digest` across ALL of the user's workspaces. Needs a new user-scoped HMAC signature scope (current frozen contract signs `(wsId, userId)`).
- **D-03:** neutral app header + per-workspace-titled sections + single footer. No per-section logos.
- **D-04:** ONE outbox row per user/day, ctx `type:'digest-aggregated'` `{sections:[{wsSlug,wsName,dueToday[],overdue[]}], logoUrl, unsubscribeUrl}`; dedup key `digest:user:{userId}:{localDate}`; per-ws `reminders_sent` claims stay byte-compatible; no per-ws outbox rows.
- **D-05:** email locale stays `locale === 'fr' ? 'fr' : 'en'`; no new app i18n keys (server/email only — ×5 rule not triggered).
- **Deferred (OUT OF SCOPE):** per-section unsubscribe; email-body locales beyond fr/en.

## Requirement Mapping

| Req | Description | Research support |
|-----|-------------|------------------|
| NOTIF-01 | One digest/day/user across all workspaces | Coalescing shape (below), dedup key, pinned test harness in `test/digest.test.mjs` |

## Verified Code Map

| Site | What's there [VERIFIED: read this session] |
|------|------|
| `server.js:2815–2920` | The per-ws digest loop: memberships⋈users recipient query (2815–2817), `resolveTz` + `localParts` + `hour < 8` gate (2824–2826), strict stored opt-in `email_digest !== true` skip (2832), per-recipient task filter (2835–2857), empty-digest honesty `continue` (2858–2859), claim tx (2861–2913): `insert or ignore into reminders_sent` key `${ws.id}:${r.user_id}:digest:${localDate}` (2862–2866), then per-ws outbox insert key `digest:${ws.id}:${r.user_id}:${localDate}` kind `'digest'` (2887–2908, fail-absent try/catch 2909–2911), post-commit `runEmailDeliveryPass()` kick (2919). |
| `server.js:3400–3404` | `deliverEmail` dispatch: `if (kind === 'digest') return MAILER.sendDigest(a);` — `kind` IS the ctx `type`. Adding `'digest-aggregated'` is one new branch here. |
| `server.js:3428–3480` | `runEmailDeliveryPass({ now, send })` — injectable clock + send fn, drains `pending|failed` rows, MAILER-disabled returns immediately, per-row fail-absent. Unchanged by this phase. |
| `server.js:315` | `unsubscribeHmacKey() = sha256(MASTER_KEY ‖ 'unsubscribe-tokens:v1')`; null without MASTER_KEY. Gate also requires `APP_URL.startsWith('https://')` (2884). |
| `mailer.js:120–170` | FROZEN token contract: `payload = 0x01 ‖ wsId(36B) ‖ userId(36B)`, `token = payload ‖ HMAC-SHA256`, base64url; `verifyUnsubscribeToken` pins exact length + version byte; `decodeUnsubscribePayload` → `{ wsId, userId }`. |
| `server.js:11825–12000` | `handleUnsubscribe` — verify → decode; POST merges `email_digest: false` scoped to `(payload.wsId, payload.userId)`; idempotent convergent upsert; response a pure function of token validity; token never logged. |
| `mailer.js:858–930` | `buildDigestMessage(config, msg)` — reads `msg.workspace`, `msg.wsSlug`, `msg.appUrl`, `msg.logoUrl`, `msg.dueToday[]`, `msg.overdue[]`, `msg.unsubscribeUrl`; locale `fr|en` with English-literal fallback frame; deep links `${appUrl}/w/${slug}/task/${key}`. |
| `test/digest.test.mjs` | Full harness precedent: local SMTP capture (`net.createServer`, line 120), `DIGEST_ONLY` prefs fixture (103), trigger via `POST /api/internal/reminder-pass` (33), `waitFor(smtp, n)` (171), claim assertion `digestKeys(ws.id)` == `` `${ws.id}:${userId}:digest:2026-01-15` `` (259–260). |

**Schema change: NONE needed.** `reminders_sent` and `email_outbox` already carry this phase's needs — `email_outbox` has `workspace_id` (used for the per-ws row today; the aggregated row can carry the "primary"/first ws or keep any one ws id — check FK/NOTNULL constraints at boot `runSchema`; likely keep the row's `workspace_id` = first section's ws, it is informational for the digest kind). `[VERIFIED: outbox insert columns at server.js:2887]`; exact column constraints of `email_outbox.workspace_id` NOT NULL-ness not read — planner should confirm in one grep of runSchema before finalizing.

## Answers to the 5 Research Questions

### Q1 — Coalescing shape (server.js:2815–2925)

Recommended: **accumulate-then-enqueue-after-loop**.

- Keep the per-ws loop exactly as is for tz resolution, opt-in gate, task filtering, empty-digest honesty, and the `reminders_sent` claim tx (byte-compatible per ROADMAP SC4). Delete ONLY the per-ws outbox insert (2881–2912) from inside the tx.
- Build an in-memory `Map<userId, { email, locale, localDate, tz, sections: [] }>`; per ws push `{ wsSlug: ws.slug, wsName: ws.name || 'Projects Studio', dueToday: mapped[{key,title,project}], overdue: mapped }` when the digest would have been non-empty and claimed.
- **Key subtlety — MAILER-disabled gate placement:** today the producer skips claiming entirely when `MAILER.enabled` is false (2878, and the `claimed && MAILER.enabled` guard means claims also don't happen without MAILER... actually claims DO happen: the reminders_sent insert is unconditional at 2862; only the outbox insert is gated at 2881). Preserve that asymmetry: semantic claim always runs (digest-honesty ledger), transport accumulation only when `MAILER.enabled`. Never claim per-ws when MAILER is off and then send later — the gate stays per SC3.
- **After the ws loop, one enqueue tx per user:** `insert or ignore into email_outbox ... dedup_key 'digest:user:{userId}:{localDate}', kind 'digest-aggregated'` with the full aggregated ctx. Wrap in its own `db.tx` + fail-absent try/catch (same shape as 2909–2911). Restart mid-tick costs at most re-claiming per-ws rows that then collide on the user/day outbox key → no double-send.
- **Delivery kick:** one `runEmailDeliveryPass()` post-commit after the enqueue loop (or reuse a single kick) — NEVER inside a tx (POL-02 D-07).
- `digests` counter becomes users-enqueued count for the log line at 2925.

Edge: user's tz differs per ws membership → `localDate` can differ across ws for the same user. Group by `(userId, localDate)`, not userId alone — key the map as `${userId}:${localDate}` and derive the outbox dedup key `digest:user:${userId}:${localDate}` from it (D-04 key stays exact).

### Q2 — sendDigest / templating (mailer.js)

- Delivery pass dispatches on ctx `type` (server.js:3401). Add `if (kind === 'digest-aggregated') return MAILER.sendDigestAggregated(a);` (or extend `sendDigest` to branch on `msg.sections`).
- New builder mirrors `buildDigestMessage` (858) but iterates `msg.sections`, rendering per-section title « {wsName} — N tâche(s) » (D-03) with the same dueToday/overdue section renderer and `${appUrl}/w/${slug}/` deep links per section. Header = app name / `msg.logoUrl`; single footer + single `msg.unsubscribeUrl`.
- Same i18n frame pattern: `tFor(locale, 'notif.digest.*')` + English-literal fallback; locale stays fr|en (D-05). New frame keys may live in the email-side strings only — **no app-side i18n keys** (D-05: none expected).
- **Empty-section handling (SC1):** sections are only pushed when that ws had ≥1 task for the user (empty-digest honesty at 2858–2859), so an aggregated digest always has ≥1 section — no empty-section render path needed; still guard `sections.length === 0 → do not enqueue` at the producer (belt-and-braces).
- **Restart replay safety:** ctx is rebuilt from the stored outbox row each delivery attempt (`deliverEmail` reads `ctx`, 3397) — replay is a pure re-render + re-send of the same ctx. Retries/backoff/retry-cap machinery in `runEmailDeliveryPass` is untouched. One row = one send = exactly-once per the dedup key.

### Q3 — Global unsubscribe (D-02)

- **New token version:** the current contract is frozen at version `0x01` with fixed 73-byte payload (`1 + 36 + 36`) and pinned length in `verifyUnsubscribeToken` (mailer.js:146–152). Do NOT mutate it. Add version `0x02`: `payload = 0x02 ‖ userId(36B)` (37-byte payload), same HMAC framing, same key derivation. `verifyUnsubscribeToken` accepts EITHER version by length+version-byte dispatch; `decodeUnsubscribePayload` returns `{ wsId?, userId }`. Old per-ws tokens keep working (backward compat, no migration).
- New helper `unsubscribeUrlGlobal(key, appUrl, userId)` / `makeUserUnsubscribeToken(key, userId)`.
- **Handler:** `handleUnsubscribe` (11825) branches on version: `0x02` + POST → loop all memberships of `payload.userId` and merge `email_digest: false` into each ws's stored prefs (the existing `getStoredNotifPrefs` merge + write, called per wsId). Keep: idempotent convergent upsert, response a pure function of token validity, token never logged, IP-only 429 throttle, sameOrigin exemption.
- **Ctx gating:** aggregated ctx carries `unsubscribeUrl` only under the same gates as today (MASTER_KEY + https APP_URL, mirroring 2884–2886) — otherwise omit (headers omitted precedent, D-10).

### Q4 — Pinned regression test (test/digest.test.mjs)

Extend or sibling the existing `test/digest.test.mjs` harness (everything needed already exists):

- Seed ONE user with `DIGEST_ONLY` prefs into **4 workspaces** (each with 1 due-today or overdue task assigned to them, via the same doc-seeding fixture pattern used today, line 50/103).
- Trigger once via `POST /api/internal/reminder-pass` (line 33 pattern).
- Assert: `waitFor(smtp, 1)` — **exactly 1 email** total (today this fails with 4 — that's the pinned red test, write it FIRST per SC2); 1 outbox row with `dedup_key = 'digest:user:{userId}:{localDate}'` and `kind='digest-aggregated'`; ctx parses with `sections.length === 4`; **4 reminders_sent rows** still present with keys `` `${wsId}:${userId}:digest:${localDate}` `` (SC4 byte-compat); subject carries per-ws sections; trigger the pass a second time → still 1 email, 0 new claims (dedup + catch-up honesty).
- Also assert the old per-ws key `digest:{wsId}:{userId}:{date}` NO LONGER appears in email_outbox (only in reminders_sent in ws-scoped form).

### Q5 — Restart / MAILER-disabled

- Today: `reminders_sent` claim insert is unconditional; outbox insert gated on `claimed && MAILER.enabled` (2881); MAILER-disabled servers never enqueue and `runEmailDeliveryPass` returns immediately (3439). **Keep both behaviors.**
- Aggregated path: accumulate only when `MAILER.enabled`; enqueue after the loop gated identically. A restart between claim-tx and enqueue-tx re-runs the tick: claims already exist (`insert or ignore` → `changes === 0` → `claimed=false` at 2872), sections are NOT re-accumulated for already-claimed (user,ws,day) — so the re-run produces no duplicate user/day row. But note: **if the crash happened after some ws claims and before the user's enqueue, the re-run must still enqueue** — the re-run's already-claimed ws rows must still contribute their section. Resolution: accumulate sections keyed on "would this ws's digest fire" INCLUDING previously-claimed ws rows, i.e. accumulate BEFORE/independent of the claim result, and gate only on opt-in + non-empty + MAILER.enabled; the dedup collision on the outbox key is what prevents double-SEND. This is the safest shape — claims guarantee per-ws ledger honesty, outbox key guarantees transport exactly-once. (Today's code has the same property per-ws: claim collision doesn't suppress the outbox insert for a fresh day.) ⚠ Planner should pin this explicitly as a test: kill after partial claims, re-run, exactly 1 email with all 4 sections.

## Architecture Patterns

### Diagram

```
global tick → for each ws → for each member:
  resolveTz → hour<8 gate → opt-in gate → task filter → empty check
       └→ reminders_sent INSERT OR IGNORE (per ws, unchanged tx)
       └→ MAILER.enabled? accumulate Map["{userId}:{localDate}"] += section
after ws loop → for each map entry:
  INSERT OR IGNORE email_outbox (dedup_key digest:user:{userId}:{localDate},
                                 kind 'digest-aggregated', aggregated ctx)
  → post-commit runEmailDeliveryPass()
      → deliverEmail dispatch kind → sendDigestAggregated(ctx.sections)
      → retry/backoff on failure; replay = re-render same ctx
/unsubscribe/{token}: 0x02 → disable email_digest in ALL member ws prefs
```

## Don't Hand-Roll

| Problem | Use instead |
|---------|-------------|
| Exactly-once transport | Existing `email_outbox` INSERT OR IGNORE dedup_key (server.js:2887) |
| Delivery retry/attempt/dead machinery | `runEmailDeliveryPass` unchanged (3428) |
| HMAC token framing/verify | mailer.js helpers — extend with version 0x02, don't rewrite |
| TZ resolution / local window | `resolveTz` / `localParts` (2824–2825) |
| Test SMTP + time travel | `test/digest.test.mjs` harness + `/api/internal/reminder-pass` + injectable `now` |

## Common Pitfalls

1. **Grouping by userId alone** — cross-tz users can legitimately get two digests (different localDate). Key the map on `(userId, localDate)`. (D-04 key includes localDate for this reason.)
2. **Moving the reminders_sent claim out of the per-ws tx** — breaks SC4 byte-compat and D-11/D-12. Never touch the claim.
3. **Suppressing section accumulation on claim collision** — see Q5 restart hole; accumulate independent of claim result.
4. **Delivery kick inside the enqueue tx** — POL-02 D-07 violation; post-commit only.
5. **Mutating the frozen 0x01 token format** — length is pinned by verify; add 0x02 as a new branch.
6. **New app-side i18n keys without ×5** — D-05: there should be none; keep email strings in the mailer frame path.

## Assumptions Log

| # | Claim | Risk |
|---|-------|------|
| A1 | `email_outbox.workspace_id` accepts any of the user's ws ids (NOT NULL but no FK strictness) — aggregated row uses first-section ws | Low; planner verifies in runSchema (one grep) |
| A2 | `sendDigest` can gain an aggregated sibling without touching notif-path code | Low — dispatch is a one-line branch (3401) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (`.test.mjs`), existing `test/digest.test.mjs` harness with local SMTP capture |
| Config file | none needed — node:test convention |
| Quick run command | `node --test test/digest.test.mjs` |
| Full suite command | `node --test test/` |

### Phase Requirements → Test Map
| Req | Behavior | Test | File |
|-----|----------|------|------|
| NOTIF-01 SC1/SC2 | 4-ws user → exactly 1 email, 1 aggregated outbox row | pinned regression FIRST (red), then green | `test/digest.test.mjs` (extend) |
| SC3 | restart after partial claims → 1 email, all 4 sections; MAILER-disabled → no enqueue | harness re-trigger + disabled-MAILER server variant | same file |
| SC4 | per-ws `reminders_sent` keys unchanged | `digestKeys()`-style assertion ×4 | same file |
| D-02 | 0x02 token POST disables digest in all 4 ws prefs | extend `test/unsubscribe-route.test.mjs` | that file |

### Sampling Rate
- Per task commit: `node --test test/digest.test.mjs`
- Phase gate: full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- None — existing harness covers everything; the pinned red test is itself Task 1.
