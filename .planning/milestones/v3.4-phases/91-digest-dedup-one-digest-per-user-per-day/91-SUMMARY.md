---
phase: 91
plan: 01
subsystem: notifications/email
tags: [digest, dedup, email, outbox, unsubscribe, RFC-8058]
requires: [phase-38-digest, phase-42-unsubscribe, phase-68-email-outbox]
provides:
  - "one digest email per user/day (transport-key digest:user:{userId}:{localDate})"
  - "sendDigestAggregated + buildDigestAggregatedMessage (multi-section aggregated template)"
  - "0x02 global user-scoped unsubscribe token (makeUserUnsubscribeToken / unsubscribeUrlGlobal / version-dispatching verify+decode)"
  - "serialized runEmailDeliveryPass (module-level promise chain)"
affects: [phase-42-unsubscribe-route, email-outbox claim sites, tz-dedup]
tech-stack:
  added: []
  patterns:
    - "aggregate-in-pass / enqueue-per-user (semantic per-ws claims preserved byte-identical)"
    - "promise-chain serialization of a delivery pass"
key-files:
  created:
    - test/digest.test.mjs (Phase 91 SC1/SC2 + SC3 regression tests — appended to existing suite)
  modified:
    - server.js
    - mailer.js
    - test/digest.test.mjs
    - test/email-outbox.test.mjs
decisions:
  - "D-05 app-level header: aggregated email branded by the APP (config.fromName / msg.logoUrl); no new i18n keys (locale fr|en fallback frame only) — supersedes the plan's SC3-locale section"
  - "Semantic per-ws reminders_sent claim keys stay byte-identical (SC4); only email_outbox coalesces to digest:user:{userId}:{localDate}"
  - "Footer fallback: without MASTER_KEY/https APP_URL the global unsubscribe link degrades to the first section's settings anchor — footer never disappears"
  - "runEmailDeliveryPass passes serialized on a module promise chain (same-tick double-kick from reminder loop + digest post-loop kick raced the attempt claim and double-sent)"
metrics:
  duration: ~3h (including cross-test contamination debugging)
  completed: 2026-11-23
status: complete
commits: 4
plan_head_before: a5ae1451ea149c7a350b39b3f474b3902c9bb40a
plan_head_after: cdf47523
---

# Phase 91 Plan 01: Digest Dedup — One Digest Per User Per Day Summary

One aggregated digest email per user per day: per-workspace sends coalesce into a single user/day outbox row rendered as a multi-section app-branded email, with a global (all-workspaces) 0x02 unsubscribe token.

## Root Cause

The 4× duplication originated in the **per-workspace outbox insert** at the end of each workspace's claim block (former server.js ~2881–2912): every opted-in workspace independently enqueued a `digest` row for the same user/day. The fix removes that per-ws insert entirely; the reminder pass now accumulates per-ws sections into `digestAcc` (keyed `${userId}:${localDate}`) and enqueues ONE `digest-aggregated` row per user/day after the workspace loop (fail-absent, INSERT OR IGNORE on the transport key).

**SC3-locale note:** the plan's SC3 (locale-aware app header section) is **superseded by locked decision D-05** (no new app i18n keys): the aggregated header/footer renders through the existing `notif.*` locale keys (fr|en discipline with English-literal fallback), with the workspace name carrying per-section identity.

## Tasks Delivered

| Task | Commit | What |
|------|--------|------|
| 1 — RED regression test | afdd6450 | Two tests pinning the 4× duplicate and the restart-hole (SC3) — verified failing against the pre-fix code |
| 2 — Coalescing pass | d7612a78 | digestAcc accumulation, per-ws outbox insert removed, post-loop enqueue loop + single delivery kick; SUBJ-01/D-11 rewritten to the aggregated semantics |
| 3 — Aggregated template | 1299d824 | `buildDigestAggregatedMessage` (app header, per-ws sections with deep links, ONE global footer), `sendDigestAggregated` in both createMailer branches, `makeUserUnsubscribeToken`/`unsubscribeUrlGlobal` (0x02), dispatch in deliverEmail |
| 4 — Global unsubscribe | cdf47523 | version+length-dispatching `verifyUnsubscribeToken` (0x01/105B and 0x02/69B), `decodeUnsubscribePayload` returns `{userId}` (no wsId) for 0x02, handler loops ALL memberships merging `email_digest: false`; 0x01 path byte-unchanged |

## Verification

- `node --test test/digest.test.mjs` — 22/22 pass (3× repeat run, no flake)
- `node --test test/unsubscribe-route.test.mjs` — 16/16 (includes the new 4-ws 0x02 test: all-flip + merge preservation + idempotent replay + legacy 0x01 + tampered neutral)
- `node --test test/tz-dedup.test.mjs test/email-outbox.test.mjs test/unsubscribe-token.test.mjs test/digest-logo.test.mjs test/due-reminders.test.mjs test/notif-i18n.test.mjs` — all pass
- Full suite `node --test --test-concurrency=2 test/*.test.mjs` — 2366/2392 pass; the only 2 failures are the documented pre-existing ones (Phase-88 french-typography fr keys; webhook-routes "GET list … D-06"). The 6 Phase-88-era failures present at plan start (tz-dedup D-11a/D-11b, email-outbox digest-row) were FIXED by this plan's test updates.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] T2 interim dispatch shim (superseded at T3)**
- **Found during:** Task 2 — `digest-aggregated` rows fell through to `sendNotif` and crashed every delivery.
- **Fix:** interim projection of the first section through `MAILER.sendDigest`; replaced by real `sendDigestAggregated` dispatch in Task 3 (1299d824).

**2. [Rule 3 - Blocking] "Safe forward reference" to `unsubscribeUrlGlobal` was not safe**
- **Found during:** Task 2 — the https fixture (UNSUB-01) has MASTER_KEY + https APP_URL, so enqueueing with an undefined symbol crashed the pass (`unsubscribeUrlGlobal is not defined` WARN, zero emails).
- **Fix:** T2 used the per-ws `unsubscribeUrl` on the first section; T3 swapped to `unsubscribeUrlGlobal` as planned. Also added the missing import at T3.

**3. [Rule 1 - Bug] Same-tick double-send race in the delivery pass**
- **Found during:** Task 3 — the reminder loop's post-commit kick and the aggregated digest's post-loop kick fired two concurrent `runEmailDeliveryPass` calls; a second pass re-selected a row whose attempt was already bumped and sent again (D-08/SUBJ-01 full-suite duplicates, 2 emails for one claim).
- **Fix:** passes are serialized on a module-level promise chain (`emailDeliveryChain`); every caller still gets its own full drain (server.js `runEmailDeliveryPass`).

**4. [Rule 1 - Bug] Shared-owner test contamination**
- **Found during:** Task 2/3 — digest.test.mjs's shared owner account carries stale opted-in workspaces that legitimately catch-up-claim on later dates, so absolute count assertions (and the pinned 4-section count) could never go green on the shared account.
- **Fix:** the Phase 91 tests enroll a FRESH peer user in exactly their four workspaces; other count-based assertions scoped to `smtp.payloads.slice(payloadsBefore)` / this test's task keys. SUBJ-01, D-11, D-08, SUBJ-02, UNSUB-01 (https + 2 gate negatives) updated to the aggregated semantics — body-template assertions stayed gated (red) until Task 3 per the plan's T2 done-scope.

**5. [Rule 1 - Bug] mailer.js comment corruption broke the i18n scanner's lexer**
- **Found during:** Task 3 verification — the T3 edit accidentally deleted the opening lines of the TFA-MAIL doc comment, leaving a stray `*/`; the i18n scanner (scripts/i18n-scan.mjs, shape-based key collection) silently mis-lexed mailer.js and reported 6 false "dead keys" (backup/restore alert). Comment restored; the scanner's lexer is additionally sensitive to apostrophes inside the verifyUnsubscribeToken comment — final comment wording keeps the frozen `Phase 42's` line and avoids apostrophes in added lines (scanner quirk noted, scanner itself untouched).

### Test rewrites (planned supersessions)

- SUBJ-01 (per-ws bracket subjects) — retired with the per-ws send; now pins one aggregated email carrying both workspaces.
- D-11 — rewritten to transport-scoped one-email semantics.
- UNSUB-01 token-framing assertions — updated to the 0x02 global token (69-byte, userId at bytes 1–36).
- email-outbox "one outbox row per claimed digest" — rewritten to the aggregated user/day row (`digest-aggregated`, ctx.sections, `digest:user:{userId}:{date}` key, sendDigestAggregated delivery).

## Threat Flags

None new: the 0x02 token reuses the frozen 0x01 HMAC framing/key derivation and the same server-built-only https gate for List-Unsubscribe headers; the handler remains pure-response-of-validity, token-never-logged, IP-only 429. The version+length dispatch keeps the hostile-token matrix green (a flipped version byte on a wrong-length token fails).

## Known Stubs

None.

## Self-Check: PASSED

- afdd6450, d7612a78, 1299d824, cdf47523 all present in git log.
- 4 commits measured from ledger `gsd-plan-head-before-91-01` (a5ae1451 → cdf47523).
- All targeted test files green at final state.
