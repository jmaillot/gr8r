---
phase: 67-project-webhooks
plan: 01
subsystem: webhooks-delivery
tags: [webhooks, delivery, ssrf, claim]
requires: []
provides:
  - webhook_hooks / webhook_deliveries tables (SQLite + pg, same commit)
  - src/core/webhook-events.js (8-event vocabulary + diffWebhookEvents, zero imports)
  - webhook-ssrf.js ssrfOk(url) per-attempt guard
  - webhook-retry.js D-05 backoff / Retry-After math
  - runWebhookDeliveryPass + 30s scheduler tick + D-07 7-day purge
  - doc-PUT tx claim wiring (task.created → exactly-once delivery)
affects: [67-02 formatter/events, 67-03 routes/UI, 67-04 badge/security, phase 68 POL-02]
tech-stack:
  added: [] # stdlib only (node:dns/promises, node:net, node:crypto, global fetch)
  patterns: [mirror-table SQLite+pg same-commit, reminders_sent INSERT OR IGNORE claim, runReminderPass-shaped unref'd tick, collect-in-tx / fire-after-commit]
key-files:
  created: [webhook-ssrf.js, webhook-retry.js, src/core/webhook-events.js, test/webhook-events.test.mjs, test/webhook-ssrf.test.mjs, test/webhook-retry.test.mjs, test/webhook-delivery.test.mjs]
  modified: [server.js, db-adapter.mjs, test/copy-sqlite-to-pg.test.mjs]
decisions:
  - "Claim/delivery state machine lives on webhook_deliveries alone (UNIQUE dedup_key = claim) — POL-02 (Phase 68) reuses the shape"
  - "Attempt claimed by guarded UPDATE (attempt+1 where attempt = seen) BEFORE fetch; 'delivered' written only after 2xx (never mark-then-send)"
  - "Retry-After honored on 429/5xx only; seconds form first, HTTP-date via Date.parse; absent/unparseable → D-05 table"
  - "D-07 purge piggybacks the 30s delivery tick (no new timer), count-only logging"
  - "Delivery body rebuilt from CURRENT doc at send time (no payload snapshot column) — tracer envelope is minimal teams-adaptive; full formatter is 67-02"
  - "SSRF refusal consumes the attempt and reschedules per D-05 — the guard is re-evaluated every attempt"
metrics:
  duration: 13 min
  completed: 2026-11-15T19:51:02Z
  tasks: 4
  commits: 7
  plan_head_before: 4e0f8bf094ae2dcdb19b02065a98fbd3450adb9b
  plan_head_after: 15a782c485942b1a9b8a52cd4bc31d14bb247fd5
status: complete
actuals:
  tokens: 133000 # chars/4 over the realized diff (~533k chars)
  tasks: 4
  commits: 7
estimate:
  tokens: 120000
  raw_tokens: 80000
  tasks: 4
---

# Phase 67 Plan 01: Tracer — delivery substrate, one event end-to-end Summary

**One-liner:** Exactly-once webhook delivery substrate — UNIQUE dedup_key claim, SSRF-guarded HMAC-signed fetch (redirect:'error' + 10s timeout), D-05 5-strike retry with Retry-After, D-07 7-day purge, and task.created wired doc-PUT → diff → in-tx claim → post-commit fire-and-forget.

## What Was Built

| Task | Commit | Content |
|------|--------|---------|
| 1 Mirror tables | 2bd201c | webhook_hooks + webhook_deliveries DDL in server.js SCHEMA AND db-adapter.mjs SQLITE_SCHEMA; PG_CONFLICT_TARGETS `webhook_deliveries: '(dedup_key)'`; PG_EPOCH_COLUMNS widen next_attempt_at/delivered_at to bigint; copy-sqlite-to-pg table list extended |
| 2 TDD guards | afa1bce (RED) + 8674206 (GREEN) | webhook-ssrf.js (https-only, per-attempt dns.lookup(all) deny-list incl. IPv6, fail-closed, injectable lookup) + webhook-retry.js (D-05 table, Retry-After seconds/HTTP-date with table fallback, isDead ≥ 5); 17 tests, zero network |
| 3 TDD engine | bc08942 (RED) + 82f6cba (GREEN) | runWebhookDeliveryPass (purge → due drain), guarded attempt claim, HMAC X-Gr8r-Signature, dead at 5, Retry-After honored, fail-absent, 30s unref'd tick with try/catch + .catch; test-only /api/internal/webhook-pass (WEBHOOK_TEST_TOKEN) injecting fetch/lookup/clock |
| 4 Tracer | 3056975 (RED) + 15a782c (GREEN) | src/core/webhook-events.js (zero-import, frozen 8-event vocabulary, diffWebhookEvents emitting task.created); doc-PUT tx: diff after docFromClient, claims commit in-tx (fail-absent), post-commit fire-and-forget pass |

## TDD Gate Compliance

- Task 2: RED commit afa1bce (10 intentional assertion failures vs skeleton modules, evidence `/tmp/opencode/tdd-red-evidence-67-01-t2.json` + `/tmp/opencode/red-t2.log`) → GREEN 8674206 (17/17).
- Task 3: RED commit bc08942 (9/9 failing on trigger-404 — route/engine absent) → GREEN 82f6cba (9/9).
- Task 4: RED commit 3056975 (6/9 failing — skeleton diff returns []) → GREEN 15a782c (19/19 combined).
- Tracer feedback gate: verify re-run end-to-end post-Task-4 — 19/19 webhook tests + 29/29 parity tests green, server boots clean.
- Note: `gsd_run check tdd-red-evidence` CLI unavailable in this environment; RED evidence recorded manually (records cited above, kept in /tmp/opencode/).

## Verification

- `node --test test/webhook-events.test.mjs test/webhook-ssrf.test.mjs test/webhook-retry.test.mjs test/webhook-delivery.test.mjs` → 45/45 pass (17 + 9 + 10 + 9)
- `node --test test/copy-sqlite-to-pg.test.mjs test/db-adapter.test.mjs` → 29 pass, 0 fail (6 pg-gated skips, no POSTGRES_TEST_URL)
- `grep -c "AbortSignal.timeout(10_000)" server.js` → 2 (engine + house-rule regions)
- `src/core/webhook-events.js` has zero import/require lines (asserted in-suite)

## Deviations from Plan

**1. [Rule 2 - Missing correctness] PG_EPOCH_COLUMNS widened for next_attempt_at / delivered_at**
- **Found during:** Task 1
- **Issue:** The plan's schema adds two new epoch-ms columns but db-adapter.mjs's pg variant widens only a fixed epoch column list — without the entry, next_attempt_at/delivered_at stay 32-bit int on pg and Date.now() values overflow.
- **Fix:** Added both names to PG_EPOCH_COLUMNS.
- **Files modified:** db-adapter.mjs
- **Commit:** 2bd201c

**2. [Rule 1 - Correctness] enqueue routes events per-event, not per-PUT projectId**
- **Found during:** Task 4
- **Issue:** The plan sketched `enqueueWebhookDeliveries(wsId, projectId, events)`, but a doc PUT can create tasks in SEVERAL projects — a single PUT-level projectId would misroute events to hooks of the wrong project.
- **Fix:** `enqueueWebhookDeliveries(workspaceId, next, events)` resolves each event's project from the outgoing doc's task map, then matches hooks by (project_id, event filter).
- **Files modified:** server.js
- **Commit:** 15a782c

**3. [Test fix] 172.15.255.255 is OUTSIDE 172.16/12**
- **Found during:** Task 2 GREEN
- **Issue:** Initial test expected 172.15.255.255 to be denied; the RFC1918 172.16/12 block spans 172.16.0.0–172.31.255.255, so 172.15.255.255 is public and must pass (matching the plan's "straddle" wording with 172.32.0.1).
- **Fix:** Test corrected to expect ok:true; 172.16.0.9/172.31.255.1 remain the inside-edge denials.
- **Commit:** 8674206

## Known Stubs

| File | What | Why | Resolved by |
|------|------|-----|-------------|
| server.js `webhookBodyFor` | Minimal inline teams-adaptive card only (no teams-messagecard/raw-json, no 28 KB cap/truncation, no AAD mention) | Plan Task 3 explicitly scopes the full formatter to 67-02; stub is fillable without architectural change | 67-02 |
| src/core/webhook-events.js | `diffWebhookEvents` emits ONLY task.created (7 events pending; `memberIds` param reserved) | Tracer scope per plan Task 4; expansion note in plan | 67-02 |

These stubs do not prevent this plan's goal (one event, claim-once, bounded retry, SSRF-guarded, fire-and-forget — proven end-to-end).

## Auth Gates

None.

## Notes for downstream plans

- The delivery engine rebuilds the body from the CURRENT doc at send time — 67-02's formatter replaces `webhookBodyFor` wholesale; keep the HMAC-over-raw-body + log-hygiene contract (host only, never URL query/secret).
- Test-only route `/api/internal/webhook-pass` (WEBHOOK_TEST_TOKEN) injects fetch/lookup/clock; 67-02 formatter tests can reuse it or test the pure formatter directly.
- POL-02 (Phase 68): reuse the webhook_deliveries claim/status-machine shape for SMTP retry.

## Self-Check: PASSED

- Files exist: webhook-ssrf.js, webhook-retry.js, src/core/webhook-events.js, 4 test files — FOUND (7 commits in `git log`)
- Commits 2bd201c, afa1bce, 8674206, bc08942, 82f6cba, 3056975, 15a782c — FOUND via `git rev-list --count 4e0f8bf..HEAD` = 7
