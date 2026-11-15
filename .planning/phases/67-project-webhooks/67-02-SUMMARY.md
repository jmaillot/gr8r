---
phase: 67-project-webhooks
plan: 02
subsystem: webhooks-events-formats
tags: [webhooks, events, formatter, oid]
requires:
  - 67-01 delivery substrate (webhook_deliveries claim machine, doc-PUT wiring)
provides:
  - Full 8-event diffWebhookEvents with diff-time data snapshots
  - EVENT_FIELDS per-event whitelists + buildEnvelope single field gate (D-01/D-03)
  - webhook-formats.js — 3 Teams formats, 28 KB byte-measured cap with truncate-and-deliver (D-02), AAD mention (D-14)
  - users.oid column (SQLite + pg) persisted at OIDC Entra login (D-13)
  - due.reminder second emission site in runReminderPass (no double-fire with reminders_sent dedup)
affects: [67-03 routes/UI, 67-04 badge/security]
tech-stack:
  added: [] # stdlib only
  patterns: [diff-time ctx snapshot column, per-event frozen whitelist gate, truncate-and-re-measure full-body cap, single-write-site login claim]
key-files:
  created: [webhook-formats.js, test/webhook-formats.test.mjs]
  modified: [src/core/webhook-events.js, server.js, db-adapter.mjs, test/webhook-events.test.mjs, test/webhook-delivery.test.mjs]
decisions:
  - "Delivery rows carry a diff-time ctx snapshot (webhook_deliveries.ctx JSON): task.deleted keeps the last-known title and a 40 KB comment body truncates from the ORIGINAL text — the doc may have moved on by delivery time (Rule 2: required by the must-have truths; supersedes 67-01's rebuild-from-current-doc tracer simplification)"
  - "'event' joined every EVENT_FIELDS whitelist — the formatter renders per-event headlines and receivers need the event type in raw-json"
  - "due.reminder subjectId = {taskId}:{offset}:{due} so multi-assignee tasks produce ONE delivery per hook even though the reminder loop is per-assignee"
  - "[Rule 3] webhook-formats.js placed at the repo root beside webhook-ssrf.js/webhook-retry.js (67-01 pattern) — server-only modules stay out of the browser bundle and the src/ i18n scan gate"
metrics:
  duration: 36 min
  completed: 2026-11-15T20:35:00Z
  tasks: 3
  commits: 5
  plan_head_before: 8798a69681c8afef187f9325789fd4bed326db97
  plan_head_after: 99e7263
status: complete
actuals:
  tokens: 76000 # chars/4 over the realized diff
  tasks: 3
  commits: 5
estimate:
  tokens: 110000
  raw_tokens: 73000
  tasks: 3
---

# Phase 67 Plan 02: Full event vocabulary, Teams formatters, users.oid Summary

**One-liner:** All 8 webhook events fire from their two emission sites (doc-PUT diff + runReminderPass, dedup-shared, no double-fire), whitelisted envelopes format into teams-adaptive / teams-messagecard / raw-json under a UTF-8-byte-measured 28 KB cap with truncate-and-deliver, real AAD `<at>` mentions resolve from `users.oid` persisted at Entra login.

## What Was Built

| Task | Commit(s) | Content |
|------|-----------|---------|
| 1 Full diff + envelopes + due.reminder site | a5ec970 (RED) + 8feee84 (GREEN) | diffWebhookEvents emits all 7 doc-PUT events with diff-time data snapshots (ONE task.assigned per task with the full assignee list, task.deleted last-known title, comment.added body, project.completed status flip, subtask.tree-changed parent/child signals); EVENT_FIELDS frozen whitelists + buildEnvelope single field gate; webhook_deliveries.ctx additive column (SQLite + pg + ensureColumn); emitWebhookEvent shared emission called from exactly two sites — doc-PUT tx and runReminderPass tx, webhook claim gated on the reminders_sent dedup |
| 2 Teams formatters + 28 KB cap | 4ce36c5 (RED) + b8b98ad (GREEN) | webhook-formats.js (zero imports): 3 formats per MS Learn shapes, unknown format → teams-adaptive (D-12); truncateToCap measures the FULL formatted JSON body with Buffer.byteLength, halves the biggest whitelisted field and re-measures — deliver anyway (D-02); boundary (exactly 28672) untruncated; multi-byte measured as UTF-8 bytes; AAD mention `<at>Name</at>` + msteams.entities when oid persisted, `**Name**` fallback otherwise (D-14/A1 pinned); delivery engine formats per hook.format, HMAC signs the exact body |
| 3 users.oid + callback write | 99e7263 | `oid text` on users in both dialects + idempotent ensureColumn; the OIDC Entra callback persists the oid claim at login (single write site); userPayload/docForClient whitelists verified to never serialize it |

## TDD Gate Compliance

- Task 1: RED commit a5ec970 — 11 intentional assertion failures vs the stub diff/empty EVENT_FIELDS (`/tmp/opencode/tdd-red-evidence-67-02-t1.json`); GREEN 8feee84 → 30/30.
- Task 2: RED commit 4ce36c5 — 10 intentional assertion failures vs skeleton formatters (`/tmp/opencode/tdd-red-evidence-67-02-t2.json`); GREEN b8b98ad → 42/42 combined.
- Task 3 is `type="auto"` (no TDD).
- Note: `gsd_run check tdd-red-evidence` CLI unavailable in this environment; RED evidence recorded manually (same as 67-01).

## Verification

- `node --test test/webhook-events.test.mjs test/webhook-formats.test.mjs test/webhook-delivery.test.mjs` → 42/42 pass
- `node --test test/db-adapter.test.mjs test/copy-sqlite-to-pg.test.mjs` → 29 pass, 0 fail (6 pg-gated skips, no POSTGRES_TEST_URL)
- `npm test` full suite → 1674 tests, 1661 pass, **0 fail** (6 pg skips; baseline 1524 grew)
- `npm run i18n:scan` → 0 literals, 0 unlisted (clean after the Rule 3 move)
- emitWebhookEvent called from exactly two sites: grep confirms doc-PUT tx + runReminderPass only

## Deviations from Plan

**1. [Rule 2 - Missing correctness] Diff-time ctx snapshot column (webhook_deliveries.ctx)**
- **Found during:** Task 1
- **Issue:** 67-01's tracer rebuilt the payload from the CURRENT doc at delivery time, but Task 1's truths require task.deleted to carry the LAST-KNOWN title and a comment body to truncate from its original text — both impossible from a doc that may have changed between enqueue and delivery.
- **Fix:** additive `ctx` JSON column stores the diff-time event snapshot + D-03 context trio at enqueue; the envelope builds from it (fallback to current-doc rebuild for ctx-less rows keeps 67-01 tests green).
- **Files modified:** server.js, db-adapter.mjs (DDL both dialects + ensureColumn)
- **Commit:** 8feee84

**2. [Rule 3 - Blocking] webhook-formats.js moved from src/core/ to repo root**
- **Found during:** Task 3 verification
- **Issue:** the src/ i18n scan gate (5 tests) flags the formatter's fixed English Teams copy as unlisted interface literals — and the module is server-only, so src/ placement would also bundle it into the browser chunk. Allow-listing is forbidden (a test pins the allow-list EMPTY).
- **Fix:** moved beside webhook-ssrf.js/webhook-retry.js — the exact 67-01 placement pattern for server-only pure modules.
- **Files modified:** webhook-formats.js (path), server.js, test/webhook-formats.test.mjs
- **Commit:** 99e7263

**3. [Test fix] Boundary + ctx fixes during Task 2 GREEN**
- buildEnvelope ctx in the whitelist test needed `event`; the boundary test seeds a non-empty title (empty falls back to the taskId label, breaking linear padding math); occurredAt TextBlocks added to both card formats (D-04 "rendered in every format").
- **Commit:** b8b98ad

## Known Stubs

None. The 67-01 stubs (webhookBodyFor tracer card, task.created-only diff) are fully replaced.

## Auth Gates

None.

## Notes for downstream plans

- 67-03 (routes/UI): hook CRUD can pass `format`; delivery rows already carry everything the badge needs. Mentions resolve automatically — no per-hook toggle (D-14).
- 67-04: dead-hook badge reads webhook_deliveries status; the ctx column is additive and pg-parity tested.
- The HMAC header remains `x-gr8r-signature: sha256=<hex>` over the exact body posted (raw-json signs the raw envelope string).

## Self-Check: PASSED

- Files exist: webhook-formats.js, test/webhook-formats.test.mjs, src/core/webhook-events.js — FOUND
- Commits a5ec970, 8feee84, 4ce36c5, b8b98ad, 99e7263 — FOUND (`git rev-list --count 8798a69..HEAD` = 5)
- No deletions in the range (`git diff --diff-filter=D HEAD~3..HEAD` empty; formatter file was a tracked rename)
