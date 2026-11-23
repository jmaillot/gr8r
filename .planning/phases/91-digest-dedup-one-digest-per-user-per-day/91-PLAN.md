---
phase: 91-digest-dedup-one-digest-per-user-per-day
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - test/digest.test.mjs
  - server.js
  - mailer.js
autonomous: true
requirements: [NOTIF-01]
estimate:
  tokens: 90000
  raw_tokens: 60000
  tasks: 4
  confidence: low
must_haves:
  truths:
    - A digest-enrolled user in 4 workspaces receives exactly ONE digest email per local day, containing 4 per-workspace sections (SC1)
    - The 4× duplicate is pinned red first, green after the fix (SC2)
    - Restart between partial claims and enqueue never double-sends; MAILER-disabled servers never enqueue (SC3)
    - Per-workspace reminders_sent claim keys stay byte-compatible `${wsId}:${userId}:digest:${localDate}` (SC4)
    - Unsubscribing from the single footer link disables email_digest across ALL the user's workspaces (D-02)
  artifacts:
    - test/digest.test.mjs (extended 4-ws regression + restart-hole assertions)
    - server.js:2815–2925 coalesced pass (Map["{userId}:{localDate}"], one post-loop enqueue tx, post-commit kick)
    - mailer.js buildDigestAggregatedMessage + 0x02 token encode helpers
    - test/unsubscribe-route.test.mjs (0x02 global-unsubscribe cases)
  key_links:
    - accumulate → INSERT OR IGNORE email_outbox dedup_key `digest:user:{userId}:{localDate}` (D-04) → post-commit runEmailDeliveryPass (POL-02 D-07)
    - deliverEmail dispatch (server.js:3401) → sendDigestAggregated
    - aggregated ctx unsubscribeUrl (0x02 token) → handleUnsubscribe 0x02 branch → all-membership email_digest:false
---

<objective>
Root-cause and fix the 4× daily digest duplication: a digest-enrolled user in N workspaces receives exactly ONE digest email per local day with per-workspace sections inside. Per-workspace `reminders_sent` claims stay byte-compatible (SC4); only the transport layer coalesces. Test-first (SC2), plus a global user-scoped unsubscribe (D-02).

Purpose: owner-observed 4× duplicate emails; SC2 mandates red-first pinning; D-02/D-03/D-04/D-05 locked.
Output: green pinned regression test, coalesced digest pass in server.js, `digest-aggregated` templating in mailer.js, 0x02 unsubscribe token + handler.
</objective>

<execution_context>
@/home/jmaillot/.config/opencode/gsd-core/workflows/execute-plan.md
@/home/jmaillot/.config/opencode/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md § Phase 91 (4 success criteria)
@.planning/REQUIREMENTS.md § NOTIF-01
@.planning/phases/91-digest-dedup-one-digest-per-user-per-day/91-CONTEXT.md
@.planning/phases/91-digest-dedup-one-digest-per-user-per-day/91-RESEARCH.md
@.planning/phases/91-digest-dedup-one-digest-per-user-per-day/91-VALIDATION.md
server.js lines 2815–2925 (the pass), 2874 (per-ws unsubscribeUrl), 2881–2912 (per-ws outbox insert — to be removed from the per-claim site), 3400–3404 (deliverEmail dispatch), 3428–3480 (runEmailDeliveryPass — unchanged), 11825–12000 (handleUnsubscribe), 678–693 (email_outbox schema — workspace_id NOT NULL, no FK; verified)
mailer.js lines 120–170 (frozen 0x01 token contract), 858–930 (buildDigestMessage pattern)
test/digest.test.mjs (SMTP capture harness line 120, DIGEST_ONLY prefs 103, reminder-pass trigger 33, waitFor 171, digestKeys 259)
test/unsubscribe-route.test.mjs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Pin the red regression test — 4 workspaces, ONE email, claims intact</name>
  <files>test/digest.test.mjs</files>
  <action>
Extend the existing `test/digest.test.mjs` harness (per D-04 and ROADMAP SC2 — write FIRST, must FAIL before Tasks 2–3). One new test case, reusing the established fixtures:
- Seed ONE user with `DIGEST_ONLY` prefs into 4 workspaces, each holding 1 due-today or overdue task assigned to them (same doc-seeding fixture pattern as line 50/103).
- Trigger once via `POST /api/internal/reminder-pass` (line 33 pattern).
- Assert ALL of:
  1. `waitFor(smtp, 1)` — exactly ONE email total (fails today with 4 — this is the pinned red).
  2. Exactly one `email_outbox` row with `dedup_key = 'digest:user:{userId}:{localDate}'` and `kind = 'digest-aggregated'`; ctx parses as `{ type:'digest-aggregated', sections:[…], logoUrl, unsubscribeUrl? }` with `sections.length === 4`, each section carrying `wsSlug`, `wsName`, `dueToday`, `overdue`.
  3. SC4 byte-compat: 4 `reminders_sent` rows with keys `` `${wsId}:${userId}:digest:${localDate}` `` (extend the `digestKeys` pattern at 259).
  4. The old per-ws transport key `digest:{wsId}:{userId}:{date}` appears NOWHERE in email_outbox.
  5. Trigger the pass a SECOND time → still 1 email, 0 new reminders_sent claims (dedup + catch-up honesty).
- Add a second test case pinning the restart hole (Q5): run the pass so claims land but the enqueue is interrupted (simulate by directly invoking the internal pass with a hook or by partial-state seeding — the honest mechanism: pre-insert 2 of the 4 reminders_sent rows for today, then trigger) → re-run produces exactly 1 email whose ctx still carries ALL 4 sections (sections accumulate independent of claim results; the outbox dedup key prevents double-send).
- Email subject/frame assertions: per-ws section titles present (D-03), locale fr|en only (D-05).
  </action>
  <verify>
    <automated>node --test test/digest.test.mjs</automated>
  </verify>
  <done>New 4-ws test exists and FAILS on exactly the duplication (4 emails / per-ws outbox keys); restart-hole test fails on section loss or double-send. Pre-existing digest tests still pass. Commit: test(91): pin 4x digest duplicate as failing regression</done>
</task>

<task type="auto">
  <name>Task 2: Coalesce the digest pass — per-user outbox row after the ws loop (D-01, D-04)</name>
  <files>server.js</files>
  <action>
Restructure server.js:2815–2925 per the research coalescing shape:
- KEEP byte-identical: recipient query (2815–2817), `resolveTz`/`localParts`/hour<8 gate (2824–2826), strict opt-in skip (2832), task filter (2835–2857), empty-digest honesty `continue` (2858–2859), and the whole `reminders_sent` claim tx (2861–2913) minus the outbox insert. Never move or reshape the per-ws claim (SC4, D-11/D-12/D-03).
- DELETE the per-ws outbox insert (2881–2912) from inside the claim tx site.
- Accumulate sections into `Map["${userId}:${localDate}"] → { email, locale, tz, sections: [] }` — gated on `MAILER.enabled` and the digest being non-empty, and INDEPENDENT of the claim result (already-claimed rows still contribute their section — this is the restart-hole fix; per research Q5). Per ws push `{ wsSlug: ws.slug, wsName: ws.name || 'Projects Studio', dueToday, overdue }` (D-03). Group by (userId, localDate), never userId alone (cross-tz users may legitimately get two digests — pitfall 1).
- After the ws loop: for each map entry with `sections.length >= 1` (empty sections never claim, never render — SC1 belt-and-braces), one fail-absent tx per user: `insert or ignore into email_outbox` with `workspace_id` = first section's ws id (verified: text NOT NULL, no FK — server.js:678–693), `dedup_key = 'digest:user:${userId}:${localDate}'` (D-04, replacing the per-ws key), `kind = 'digest-aggregated'`, ctx = `{ type:'digest-aggregated', sections, logoUrl, unsubscribeUrl, locale, appUrl }`.
- `unsubscribeUrl` uses the new global helper `unsubscribeUrlGlobal(unsubscribeHmacKey(), APP_URL, r.user_id)` (added in Task 3) ONLY under today's gates (MASTER_KEY present + `APP_URL.startsWith('https://')`, mirroring 2884–2886); omit otherwise.
- Delivery kick: ONE `runEmailDeliveryPass()` post-commit after the enqueue loop — NEVER inside a tx (POL-02 D-07). Log line's `digests` counter becomes users-enqueued count (2925).
- MAILER-disabled behavior unchanged: no accumulation, no enqueue; `runEmailDeliveryPass` still returns immediately (3439). Per-ws claims still run (existing asymmetry, research Q1).
  </action>
  <verify>
    <automated>node --test test/digest.test.mjs</automated>
  </verify>
  <done>Task 1's pinned tests go GREEN: 4-ws user → 1 email, `digest:user:` key, 4 sections, 4 byte-compat claims, second trigger deduped, restart-hole case passes. MAILER-disabled path still claims without enqueueing (existing test file coverage). Commit: feat(91): coalesce digest sends to one outbox row per user/day</done>
</task>

<task type="auto">
  <name>Task 3: digest-aggregated templating + dispatch branch (D-03, D-05)</name>
  <files>mailer.js, server.js</files>
  <action>
- mailer.js: add `buildDigestAggregatedMessage(config, msg)` mirroring `buildDigestMessage` (858–930): neutral app-level header (app name + `msg.logoUrl`), iterate `msg.sections` rendering each as « {wsName} — N tâche(s) » (D-03) with the same dueToday/overdue renderer and `${appUrl}/w/${slug}/task/${key}` deep links per section, ONE global footer with the single `msg.unsubscribeUrl` (D-02, no per-section links — that idea is deferred/out of scope).
- Locale: `locale === 'fr' ? 'fr' : 'en'` with the existing English-literal fallback frame pattern — email-side strings only, NO app-side i18n keys (D-05; ×5 rule not triggered). Do not widen locales for the email body.
- server.js `deliverEmail` dispatch (3401): add `if (kind === 'digest-aggregated') return MAILER.sendDigestAggregated(ctx);` — one branch; `runEmailDeliveryPass` (3428–3480) untouched; replay = pure re-render of the stored ctx (restart safety).
- mailer.js: add `makeUserUnsubscribeToken(key, userId)` — `payload = 0x02 ‖ userId(36B)` (37-byte), same HMAC-SHA256 framing + base64url as the frozen 0x01 contract (120–170), same key derivation — and `unsubscribeUrlGlobal(key, appUrl, userId)`. Do NOT mutate the 0x01 format or its pinned length check (pitfall 5; handler-side acceptance is Plan Task 4).
  </action>
  <verify>
    <automated>node --test test/digest.test.mjs</automated>
  </verify>
  <done>The captured email body shows the app header, 4 ws-titled sections, one footer with one unsubscribe link; locale fr|en; Task 1 tests still green. Commit: feat(91): aggregated digest email template with global unsubscribe link</done>
</task>

<task type="auto">
  <name>Task 4: Global unsubscribe — 0x02 token acceptance + all-membership handler (D-02)</name>
  <files>mailer.js, server.js, test/unsubscribe-route.test.mjs</files>
  <action>
- mailer.js `verifyUnsubscribeToken` (pinned length at 146–152): dispatch on payload LENGTH + version byte to accept EITHER 0x01 (73-byte, frozen) or 0x02 (37-byte); `decodeUnsubscribePayload` returns `{ wsId?, userId }` — `wsId` present only for 0x01. Backward compatible, no migration.
- server.js `handleUnsubscribe` (11825–12000): branch on decoded version. 0x02 + POST → loop ALL workspace memberships of `payload.userId` and merge `email_digest: false` into each ws's stored prefs via the existing `getStoredNotifPrefs` merge + write path. Preserve: idempotent convergent upsert, response a pure function of token validity, token never logged, IP-only 429 throttle, sameOrigin exemption, 0x01 behavior byte-unchanged.
- Extend `test/unsubscribe-route.test.mjs`: seed a user in 4 ws with digest enabled → build a 0x02 token → POST → assert `email_digest === false` in all 4 ws prefs; assert idempotent re-POST; assert a legacy 0x01 token still unsubs only its (wsId, userId) pair; assert invalid/tampered 0x02 token gets the same pure response as invalid 0x01 and the token never appears in logs.
  </action>
  <verify>
    <automated>node --test test/unsubscribe-route.test.mjs && node --test test/digest.test.mjs</automated>
  </verify>
  <done>0x02 POST disables digest across all memberships; 0x01 legacy path unchanged; both test files green. Commit: feat(91): global unsubscribe token (0x02) disabling digest across all workspaces</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| email recipient → /unsubscribe/{token} | Untrusted token input; gates a prefs mutation across MULTIPLE workspaces (amplified blast radius vs 0x01) |
| outbox ctx (stored JSON) → deliverEmail | Stored ctx replayed on delivery; malformed ctx must fail-absent |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-91-01 | Spoofing/Tampering | 0x02 unsubscribe token (mailer.js encode/verify, handleUnsubscribe) | high | mitigate | Same HMAC-SHA256 key derivation + framing as frozen 0x01; `verifyUnsubscribeToken` pins exact 37-byte length + version byte; handler response stays a pure function of token validity; token never logged |
| T-91-02 | Repudiation | Cross-ws prefs mutation via 0x02 handler | low | accept | Same audited `getStoredNotifPrefs` merge/write path per ws as 0x01; no new write surface |
| T-91-03 | DoS | reminder-pass coalescing loop (Map accumulation) | low | accept | In-memory map bounded by users×dates per tick; unchanged recipient query; no new external input |
| T-91-SC | Tampering | npm/pip/cargo installs | n/a | mitigate | No new packages this phase — server.js/mailer.js/test files only; T-{phase}-SC retained for the plan record |
</threat_model>

<verification>
- `node --test test/digest.test.mjs` green after every task commit (VALIDATION.md sampling rate)
- `node --test test/unsubscribe-route.test.mjs` green after Task 4
- `npm test` full suite green before `/gsd-verify-work`
- ROADMAP SC1–SC4 each mapped: SC1/SC2 → Task 1+2; SC3 → Task 1 (restart-hole case) + Task 2 gates; SC4 → Task 1 assertion 3
</verification>

<success_criteria>
- 4-ws digest user: exactly 1 email/day, 4 sections inside, `digest:user:{userId}:{localDate}` outbox row, zero per-ws outbox rows
- 4 byte-compatible `reminders_sent` rows per pass; second trigger claims nothing
- Restart hole closed (sections independent of claim results); MAILER-disabled servers never enqueue
- Aggregated email: app header, ws-titled sections (D-03), single global footer, fr|en locale (D-05)
- One global unsubscribe link disabling digest across ALL workspaces (D-02); 0x01 tokens still work
</success_criteria>

<output>
Create `.planning/phases/91-digest-dedup-one-digest-per-user-per-day/91-SUMMARY.md` when done
</output>
