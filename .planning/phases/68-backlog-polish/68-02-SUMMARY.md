---
phase: 68
plan: 02
subsystem: server (email claim machinery) + db-adapter
tags: [pol-02, email-outbox, claim-then-deliver, smtp-retry, no-double-send]
requires: [webhook-retry.js (Phase 67 D-05), webhook_deliveries SCHEMA + runWebhookDeliveryPass, reminders_sent ledger (D-12), MAILER.sendNotif/sendDigest]
provides: [email_outbox table (SQLite+pg byte-identical), queueNotifEmails → transport claim, runEmailDeliveryPass (drain+purge on the 30s tick), digest transport claim inside the D-12 tx, /api/internal/email-pass test route]
affects: [68-04 (full e2e gate)]
tech-stack:
  added: []
  patterns: [claim-then-deliver via UNIQUE dedup_key + INSERT OR IGNORE inside the semantic-claim tx, guarded attempt claim + guarded write-back (T-67-02 pattern), post-commit delivery kick + 30s tick piggyback]
key-files:
  created:
    - test/email-outbox.test.mjs
  modified:
    - db-adapter.mjs
    - server.js
    - test/notif-email-link.test.mjs
    - test/due-reminders.test.mjs
decisions:
  - Notif claims ride the caller's transaction (doc-PUT tx + reminders_sent claim tx), mirroring the WHK-02 webhook-claim pattern — plan's "tx-with-append" realized at the two actual append sites
  - MAILER-disabled producers skip claiming entirely and the pass returns early (research open question 2) — no SMTP configured means no email, as before
  - dedup keys: notif:<n.id> (n.id confirmed per-recipient unique, A2 verified) and digest:<ws>:<user>:<localDate> (derived from the ledger claim identity)
  - PG_EPOCH_COLUMNS needed NO new entries (created_at/next_attempt_at/delivered_at already registered by name, A5/Pitfall P-B verified)
  - Post-commit delivery kicks added beside the 30s tick (mirrors the webhook post-commit pass at the doc-PUT site) so first delivery is prompt and existing SMTP-wait tests keep their timings
metrics:
  duration: ~55min
  completed: 2026-11-16
status: complete
actuals:
  tokens: 173000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: a4c0102
plan_head_after: cf614b6
---

# Phase 68 Plan 02: Email Outbox Claim Machinery (POL-02) Summary

**One-liner:** Notification and digest emails moved from fire-and-forget to the Phase 67 claim-then-deliver machinery — a new `email_outbox` transport-claim table (byte-identical on SQLite+pg), claim inserts inside the semantic-claim transactions, and a `runEmailDeliveryPass` drain with webhook-identical backoff (1m→5m→30m→2h→8h), dead-state and 7-day silent purge.

## What Was Done

- **Task 1 (tracer, commit 64a351d):** TDD — wrote `test/email-outbox.test.mjs` first (RED: "no such table: email_outbox"), then: added the `email_outbox` CREATE TABLE + `email_outbox_due` index to BOTH `server.js` SCHEMA and the db-adapter mirror (byte-identical, Pitfall P-B); converted `queueNotifEmails` from a direct `MAILER.sendNotif` call into a claim function (INSERT OR IGNORE, dedup `notif:<n.id>`, ctx snapshot carrying everything sendNotif needs) riding the caller's transaction (doc-PUT tx + the reminders_sent reminder-claim tx, both fail-absent); added `runEmailDeliveryPass`/`deliverEmail`/`emailFailDelivery` mirroring the webhook engine (7-day purge → due drain → guarded attempt claim → ctx rebuild → shared webhook-retry.js backoff → dead), piggybacked on the 30s webhook tick plus post-commit kicks; added the `/api/internal/email-pass` test route (EMAIL_TEST_TOKEN, injectable clock + send). Two existing tests updated in place, never weakened: `notif-email-link.test.mjs` source extraction (the sendNotif site moved to the pass), `due-reminders.test.mjs` REM-05 (now asserts the retry claim instead of a log line). GREEN 7/7 + db-adapter/copy-pg green.
- **Task 2 (auto, commit a5048cf):** Digest articulation per D-07 — the reminders_sent ledger stays the semantic claim; exactly one `email_outbox` row (dedup `digest:<ws>:<user>:<localDate>`) is inserted inside the SAME db.tx, fail-absent; the direct `MAILER.sendDigest` call deleted, delivery rides the pass (ctx snapshot includes logoUrl/unsubscribeUrl/dueToday/overdue). Re-run idempotence and the empty-digest D-12 guard are test-enforced. GREEN.
- **Task 3 (auto, commit cf614b6):** D-04 scope-boundary source-assert tests — the outbox enqueue exists at exactly the two claim sites; sendInvite/sendSecurityAlert paths verified direct fire-and-forget with no outbox wiring; the rebuilt send calls live only inside deliverEmail. Full `npm test`: 1701 tests, 0 fail.

## Assumption Verification (A2/A4/A5)

- **A2:** `n.id` is the per-recipient unique notification id — confirmed in use at the failure-log line and the newNotifs diff; dedup `notif:<n.id>` adopted, no adjustment needed.
- **A4:** The pg DDL-rewrite path compiles the new CREATE TABLE from SCHEMA placement alone (proven by `copy-sqlite-to-pg.test.mjs` green); no separate pg definition needed.
- **A5:** `res.changes` is the portable affected-rows read for INSERT OR IGNORE on both backends (pattern already proven by reminders_sent/webhook_deliveries; the no-op duplicate insert asserts changes === 0 in the suite).

## Deviations from Plan

- **[Rule 3 - blocking detail] Task 1, internal test route added:** the plan's verify needed an injectable-clock/fake-MAILER harness; the email-pass internal route is the webhook-pass pattern (plan artifacts say "mirrors runWebhookDeliveryPass" — the route is that mirror's test seam, same as 67-01 added `/api/internal/webhook-pass`).
- **[Rule 1 - test contract updates, same-commit]:** `notif-email-link.test.mjs` URL extraction regex and `due-reminders.test.mjs` REM-05 asserted the old fire-and-forget behavior; both extended to the claim design (extraction stops at the claim insert; REM-05 now proves the retry claim). Never weakened.
- **[Design realization]:** the plan located the notif claim "at server.js ~2126"; the append actually happens at two sites (doc-PUT tx + reminder-claim tx) through `queueNotifEmails` — the claim lives in the function, riding both transactions, which is strictly stronger than the single-site tx-with-append the plan sketched.

## Known Stubs

None.

## Threat Flags

None — no new trust boundary beyond the plan's threat register; ctx carries server-derived email params only (no secrets; SMTP creds stay in env; last_error is server-side only per T-68-02/D-08).

## Verification

- `node --test test/email-outbox.test.mjs` → 11 pass / 0 fail
- `node --test test/db-adapter.test.mjs test/copy-sqlite-to-pg.test.mjs` → 0 fail (SQLite/pg parity)
- `node --test test/digest.test.mjs test/due-reminders.test.mjs test/notif-email-link.test.mjs test/notif-i18n.test.mjs test/webhook-delivery.test.mjs` → all green
- `npm test` → 1701 tests, 0 fail (baseline 1524 grown by the 11 email-outbox tests)
- Full e2e (Plan 68-04) remains the final phase gate.

## Self-Check: PASSED

All created files exist; commits 64a351d / a5048cf / cf614b6 verified in git log.

- `node --test test/db-adapter.test.mjs test/copy-sqlite-to-pg.test.mjs` → 0 fail (SQLite/pg parity)
- `node --test test/digest.test.mjs test/due-reminders.test.mjs test/notif-email-link.test.mjs test/notif-i18n.test.mjs test/webhook-delivery.test.mjs` → all green
- `npm test` → 1701 tests, 0 fail (baseline 1524 grown by the 11 email-outbox tests)
- Full e2e (Plan 68-04) remains the final phase gate.
