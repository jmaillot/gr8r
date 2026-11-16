---
phase: 67-project-webhooks
plan: 03
subsystem: webhooks-routes
tags: [webhooks, routes, crud, gating, secret]
requires:
  - 67-01 delivery substrate (webhook_hooks/webhook_deliveries, deliverWebhook, runWebhookDeliveryPass)
  - 67-02 8-event vocabulary (WEBHOOK_EVENTS) + formatters
provides:
  - GET/POST /api/workspaces/:slug/projects/:pid/webhooks (list + create, canManageProject on both)
  - PATCH/DELETE /api/workspaces/:slug/projects/:pid/webhooks/:hookId (last-write-wins, audit-trail-preserving delete)
  - POST /api/workspaces/:slug/projects/:pid/webhooks/:hookId/test (D-11 send-test through the real deliverWebhook pipeline)
  - webhookHookView/webhookHookHealth/webhookValidateBody server helpers
  - err.webhookError catalogue key (en+fr)
affects: [67-04 badge/UI, WHK-01 verification]
tech-stack:
  added: [] # stdlib only (node:crypto randomBytes)
  patterns: [export-route funnel (requireWorkspace → sameOrigin → docForClient → 404 parity → canManageProject), show-once secret via explicit projection, server-side health derivation, WEBHOOK_TEST_TOKEN-guarded injectables]
key-files:
  created: [test/webhook-routes.test.mjs]
  modified: [server.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs]
decisions:
  - "Route paths carry the workspace slug (/api/workspaces/:slug/projects/:pid/webhooks) instead of the plan's /api/projects/:projId/webhooks — projId alone cannot resolve workspace membership; the export-route funnel (requireWorkspace → docForClient → 404 parity → canManageProject) is the house precedent"
  - "canManageProject gates EVERY route including GET list (D-08 gates the whole settings section; T-52-02 server gate = the control) — 5 new gate sites, criterion ≥4 met"
  - "All webhook route errors emit ONE coarse code 'webhookError' with the specific English message in fail() — the entry chunk sat 40 bytes under the 500 kB gate, so nine specific catalogue keys could not fit (Rule 3); 67-04 UI can split the key when it lazy-loads"
  - "The /test injectables (fetch/lookup/clock) ride the same WEBHOOK_TEST_TOKEN header guard as /api/internal/webhook-pass — session-authenticated callers get the real pipeline, never injectables"
  - "Test deliveries use a per-call uid() nonce subject (dedup exemption, D-11); the delivery row stays for the badge/audit and D-07 purges it"
metrics:
  duration: 28 min
  completed: 2026-11-15T20:51:15Z
  tasks: 2
  commits: 3
  plan_head_before: 2f29dd7733875b997188d6d5113bd872bb98f4ed
  plan_head_after: a8a3b09c1fa1166f5f2c2360d1ba3f67f0ae42cb
status: complete
actuals:
  tokens: 58000 # chars/4 over the realized diff (~232k chars)
  tasks: 2
  commits: 3
estimate:
  tokens: 90000
  raw_tokens: 60000
  tasks: 2
  confidence: low
---

# Phase 67 Plan 03: Hook CRUD routes, gating, show-once secret, send-test Summary

**One-liner:** Owner/admin/leader-gated hook CRUD (create/list/edit/delete) with a server-generated secret returned exactly once, https/format/event-filter validation, D-06 health derived from dead deliveries, and a D-11 send-test endpoint riding the identical SSRF-guarded, HMAC-signed, 10 s-timeout delivery pipeline with an immediate visible result.

## What Was Built

| Task | Commit(s) | Content |
|------|-----------|---------|
| 1 CRUD routes (TDD) | be45d9b (RED) + ff1962d (GREEN) | GET/POST list/create, PATCH/DELETE per-hook — every route behind requireWorkspace → sameOrigin → docForClient project 404 parity → canManageProject; POST returns { hook, secret } with crypto.randomBytes(32) hex, hook projected via webhookHookView (secret never serializable); validation (https-only, format enum, events ⊆ WEBHOOK_EVENTS ≤ 8, non-empty URL) → 400; mass-assignment guard (ws/project/created_by from ctx only, asserted by a hostile-PATCH test); D-06 health (disabled → 'disabled', any dead delivery in the 7-day window → 'failing'); DELETE keeps historical delivery rows (backstop) |
| 2 Send-test (D-11) | ff1962d (with Task 1 GREEN — see deviations) | POST .../webhooks/:hookId/test: event validated against WEBHOOK_EVENTS, fixed sample ctx envelope, per-call nonce subject (each press sends — 2 rapid calls → 2 rows while a REAL double-claim stays single-row, asserted), ONE awaited deliverWebhook attempt through the identical guarded pipeline (ssrfOk per attempt, HMAC, 10 s timeout, redirect:'error'); returns { ok, statusCode } immediately; injectables only under the WEBHOOK_TEST_TOKEN guard |
| — fixes | a8a3b09 | Rule 1: restored the session-revoke line an edit had joined onto its comment (SESS-03/SSO-05); Rule 3: consolidated the nine webhook error codes into one catalogue key err.webhookError (en+fr) to keep the 500 kB entry-chunk gate green (499995/500000) |

## TDD Gate Compliance

- Task 1: RED commit be45d9b — 11/12 tests failing intentionally on route-absent assertions (404 vs 201/403/400/200; the 12th — log hygiene — passes vacuously as a negative assertion); evidence record `/tmp/opencode/tdd-red-evidence-67-03-t1.json` (manual, `gsd_run check tdd-red-evidence` CLI unavailable in this environment, same as 67-01/67-02). GREEN ff1962d → 12/12.
- Task 2 is `type="auto"` (no TDD requirement). Its endpoint/tests landed inside Task 1's GREEN commit — see Deviations #3.

## Verification

- `node --test test/webhook-routes.test.mjs` → 12/12 pass
- `node --test test/webhook-routes.test.mjs test/webhook-delivery.test.mjs` (Task 2 verify) → 23/23 pass
- All six webhook suites → 71/71 pass
- `npm test` full suite → 1686 tests, 1673 pass, **0 fail** (13 pg-gated skips)
- `grep -c "canManageProject" server.js` → 11 (was 6; +5 ≥ 4 criterion)
- vite build entry chunk → 499,995 bytes ≤ 500,000 gate

## Deviations from Plan

**1. [Planner-discretion] Route paths carry the workspace slug**
- **Found during:** Task 1 implementation
- **Issue:** the plan's artifact named GET/POST `/api/projects/:projId/webhooks` and PATCH/DELETE `/api/webhooks/:hookId`; a bare projId/hookId cannot resolve workspace membership without an extra cross-table lookup, and an unscoped hook-id path invites cross-workspace id probing.
- **Fix:** `/api/workspaces/:slug/projects/:pid/webhooks[/:hookId[/test]]` — the export-route funnel resolves ws + membership + project with 404 parity in one path; PATCH/DELETE/test additionally scope the hook row by (workspace_id, project_id).
- **Files modified:** server.js, test/webhook-routes.test.mjs
- **Commit:** ff1962d

**2. [Rule 3 - Blocking] Nine error codes consolidated into one catalogue key**
- **Found during:** full-suite verification
- **Issue:** the error-codes standing gate requires an err.<code> key for every emitted fail() code, and en.json is bundled into the entry chunk whose headroom was 40 bytes (499,960/500,000) — nine verbose keys blew the 500 kB gate to 500,556.
- **Fix:** one coarse code `webhookError` for every webhook-route failure (the specific English message still rides fail()); one EN+FR key each; catalogue ledger test updated (1939). Entry chunk 499,995. 67-04 can split keys when the UI lazy-loads.
- **Files modified:** server.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/webhook-routes.test.mjs
- **Commit:** a8a3b09

**3. [Rule 1 - Bug] Session-revoke line restored (self-inflicted edit slip)**
- **Found during:** full-suite verification
- **Issue:** an intermediate edit joined the `/api/auth/sessions/:id` DELETE `db.run` onto its comment line, silently disabling per-row session revoke (SESS-03, SSO-05 failed with the plan's server but passed on baseline).
- **Fix:** restored the newline; both suites green.
- **Commit:** a8a3b09

**4. Task 2's endpoint committed within Task 1's GREEN commit**
- **Issue:** the RED test file was written covering both tasks' behaviors (routes + send-test), so the GREEN implementation necessarily delivered the /test endpoint in the same commit.
- **Mitigation:** Task 2 verified separately (`node --test test/webhook-routes.test.mjs test/webhook-delivery.test.mjs` → 23/23) and its behavior is independently asserted (SSRF refusal via injected lookup, nonce dedup exemption vs real-event single-row control).

## Known Stubs

None.

## Auth Gates

None.

## Threat Flags

None — no new surface beyond the plan's threat model (T-67-07..10 all mitigated in code; the mass-assignment guard and log hygiene are asserted by tests).

## Notes for downstream plans

- 67-04 (UI/badge): the list payload already carries `health` ('active'|'failing'|'disabled') — render it directly; the settings section must lazy-load (entry chunk has 5 bytes of headroom — do NOT add keys/copy to the EN entry bundle without splitting a lazy chunk).
- Error contract: webhook routes emit the coarse `webhookError` code with specific English messages; when the UI adds toasts, either reuse the key or split it — 67-04 owns the chunk-gate dance.
- The /test endpoint's injectables only activate when the `x-webhook-token` header matches WEBHOOK_TEST_TOKEN (server tests); production callers always get the real pipeline.

## Self-Check: PASSED

- Files exist: test/webhook-routes.test.mjs, server.js routes (grep webhookHookView/webhookValidateBody) — FOUND
- Commits be45d9b, ff1962d, a8a3b09 — FOUND (`git rev-list --count 2f29dd7..HEAD` = 3)
- No deletions in the range (`git diff --diff-filter=D HEAD~3..HEAD` empty)
