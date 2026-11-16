---
phase: 68-backlog-polish
reviewed: 2026-11-16T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/styles/responsive.css
  - src/views/table.js
  - db-adapter.mjs
  - server.js
  - test/responsive-css-scope.test.mjs
  - test/email-outbox.test.mjs
  - e2e/mobile-card-hidden.spec.mjs
  - e2e/mobile-tasks-table.spec.mjs
findings:
  critical: 1
  warning: 2
  info: 3
  total: 6
status: issues_found
---

# Phase 68: Code Review Report

**Reviewed:** 2026-11-16
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 68's claim-then-deliver engine is a faithful twin of the Phase 67 webhook engine: backoff math (`nextAttemptMs`/`isDead`) is shared verbatim and used with correct attempt semantics (verified: `emailFailDelivery` passes `d.attempt`, giving BACKOFF_MS[0] after attempt 1 — matching the test's 1 min / 5 min assertions); the guarded attempt claim (`attempt = attempt + 1 where attempt = ?`) prevents concurrent double-send; the SCHEMA/ensureColumn invariant (Pitfall P-B) holds — server.js:533-548 and db-adapter.mjs:364-379 are byte-identical DDL, and all three epoch columns (`created_at`, `next_attempt_at`, `delivered_at`) are already registered in `PG_EPOCH_COLUMNS`. The 68-01 CSS scoping is correct (no bare `.toolbar` rule remains in the ≤900px band) and the `[data-pop='cols']` hide rule is verifiably gone. The `.mcard` hidden[] filter honors priority/due/estimate/progress with status/title/key/assignees as deliberate D-01 minimum identity (confirmed against the e2e spec's own contract, not an oversight).

The one substantive defect is **not in the delivery state machine but in its atomicity claim on the Postgres backend**: the outbox INSERT rides the caller's transaction only on SQLite. This is a pre-existing architectural pattern (updateDoc, emitWebhookEvent, enqueueWebhookDeliveries behave the same way), but Phase 68 extends it to email and advertises the same-tx invariant, so it is reported at Critical severity with that context.

## Critical Issues

### CR-01: email_outbox claims do not ride the caller's transaction on the pg backend (Phase 38 no-double-send invariant is SQLite-only)

**File:** `server.js:2153` (queueNotifEmails claim), `server.js:2455` (digest claim); reads at `server.js:2073`, `server.js:2090`, `server.js:2103`
**Issue:** Both claim sites execute inside `db.tx(...)` bodies (the doc-PUT tx at server.js:6898 and the reminders_sent tx at server.js:2292/2429) but use the **module-level** `db.run`/`db.all` facade. On the Postgres backend, `db.run` → `pgRun` → `pool.query`, which runs on a *different* pooled connection in autocommit mode — outside the checked-out tx client. db-adapter.mjs documents this exact hazard ("on pg, module-level run() inside a tx body would land OUTSIDE the checked-out client (Pitfall 2)") and `syncTaskFts` threads the tx scope for precisely this reason; the email claim sites do not. Consequences on pg:

1. A rolled-back reminder/notif append (doc write failure, `assigneeOutOfScope` reject) leaves a **committed outbox claim** → the user receives an email about a notification that does not exist.
2. The reminders_sent ledger claim and the outbox transport claim can interleave on separate connections, reopening a double-send window the tx was supposed to close.
3. On SQLite (the default backend) the behavior is correct — every test passes against real SQLite — so the defect is invisible to the suite.

This pattern predates Phase 68 (updateDoc:3400 and emitWebhookEvent inserts behave identically inside txs), but 68-02's stated invariant — "reminders_sent ledger claim rides in the same tx as the outbox claim" — is only true on SQLite, and the new code adds user-visible email sends to the failure mode.
**Fix:** Either (a) thread the tx scope through the claim sites like `syncTaskFts` does (queueNotifEmails already receives `wsRow`/`nextDoc`; add a `scope` param defaulting to the module facade so the reminder-path call passes the tx scope, and the doc-PUT call passes `scope`), or (b) if a full scope-threading refactor is out of scope for 68, document the invariant as SQLite-only in PLAN/PLAN comments and file the pg gap as an explicit follow-up — do not leave the "commits together" comments at server.js:2149 and 2324-2328 claiming atomicity the pg backend does not provide.

## Warnings

### WR-01: `queued++` counts INSERT OR IGNORE collisions — `emailClaims` can be non-zero with zero new claims

**File:** `server.js:2153-2163`
**Issue:** `queued` is incremented unconditionally after the `insert or ignore`, even when the UNIQUE `dedup_key` collision suppressed the insert (`changes === 0`). The return value gates the post-commit kick (`if (emailClaims) runEmailDeliveryPass()` at server.js:6926). A replayed notification (same `n.id` re-diffed as "new", e.g. after a conflicting doc write) reports claims that don't exist, firing a pointless delivery pass. Harmless at runtime, but the return value misrepresents state and would mislead any future consumer (metrics, tests asserting claim counts).
**Fix:**
```js
const r = await db.run('insert or ignore into email_outbox ...', [...]);
if (r.changes) queued++;
```

### WR-02: wall-clock assertion makes the e2e outbox test timing-flaky

**File:** `test/email-outbox.test.mjs:149`
**Issue:** `assert.ok(attempted.next_attempt_at > Date.now(), 'retry scheduled ~1 minute out')` compares the kick-time-scheduled retry against the assertion-time wall clock. If the test runner stalls (CI pause, GC, slow startup) for more than BACKOFF_MS[0] (60 s) between the doc PUT and the assertion, the retry is legitimately past-due and the assert flakes. Everything else in the suite uses the injected clock; this one line reintroduces real time.
**Fix:** Assert against a lower bound derived from the row instead: `assert.ok(attempted.next_attempt_at >= rowCreated + 60_000 - 1000)` (backoff applied to the kick's now), or capture `Date.now()` before the PUT and assert `next_attempt_at > thatTimestamp`, which proves "scheduled in the future relative to the kick" without a 60 s freshness requirement.

## Info

### IN-01: test-route token comparison is not constant-time

**File:** `server.js:4950`
**Issue:** `req.headers['x-email-token'] !== process.env.EMAIL_TEST_TOKEN` is a non-constant-time string comparison of a secret. Impact is marginal (the route exists only while `EMAIL_TEST_TOKEN` is set, and the webhook twin at server.js:4924 uses the identical pattern — this is the established house pattern, not a 68 regression). Noted for completeness; `sha256` both sides + `timingSafeEqual` (the pattern already used at server.js:690) would close it fleet-wide.

### IN-02: "dead rows purge after 7 days" comment does not match the purge implementation

**File:** `server.js:2904` vs `server.js:2978`
**Issue:** The `emailFailDelivery` comment says "dead rows purge after 7 days", but the pass purges **every** status (`delete from email_outbox where created_at < ?`) — pending and failed rows older than 7 days are silently dropped too. This mirrors the webhook engine exactly (server.js:2867) and matches the D-08 "silent purge" decision, so the behavior is intentional; only the comment is wrong. One-word comment fix to prevent a future reader from "fixing" the purge to dead-only (or trusting the comment when reasoning about pending-row lifetime).

### IN-03: CSS band parser breaks on comments containing braces

**File:** `test/responsive-css-scope.test.mjs:39-61`
**Issue:** `parseRules` counts `{`/`}` depth without stripping comments from the band body (comments are only stripped from selectors). A future comment inside a rule body containing a `{` — e.g. a CSS example in a comment like `/* flex-shrink: 0 (see .page.flush .toolbar { ... }) */` — corrupts the depth count and silently misparses every subsequent rule in the band, potentially making the "no bare .toolbar" gate pass or fail spuriously. Passes against the current file; fragility only.
**Fix:** Strip comments from `band` once before parsing: `const clean = band.replace(/\/\*[\s\S]*?\*\//g, '')` and parse/run both assertions against `clean`.

---

**Verified clean (for the record):** byte-identical `email_outbox` DDL across server.js SCHEMA and db-adapter SQLITE_SCHEMA with the index; pg epoch widening covers all three outbox epoch columns via the existing `PG_EPOCH_COLUMNS` set; backoff attempt arithmetic (`d.attempt` not `newAttempt`) matches the webhook twin and the pinned test values; the `/api/internal/email-pass` route is token-gated and 404s when unset (same shape as the webhook twin); the 30 s tick piggyback is fail-absent (`try/catch` + `.catch` + `.unref()`); `MAILER.disabled` gates both producers and the drain (test pins rows-untouched); invites/2FA remain fire-and-forget (source asserts at test lines 305-345 confirm exactly two enqueue sites); the ≤900px band contains no bare `.toolbar` flex-shrink rule; the `.mcard` template escapes all user-controlled interpolations (`esc(t.title)`, `esc(t.key)`, `esc()` on assignee label, `esc(fmtEstimate(...))`).

---

_Reviewed: 2026-11-16T00:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
