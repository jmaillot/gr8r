---
phase: 67-project-webhooks
verified: 2026-11-15T23:40:00Z
status: human_needed
score: 16/16 must-haves verified
behavior_unverified: 0
covered_files: [".planning/phases/67-project-webhooks/67-01-PLAN.md", ".planning/phases/67-project-webhooks/67-01-SUMMARY.md", ".planning/phases/67-project-webhooks/67-02-PLAN.md", ".planning/phases/67-project-webhooks/67-02-SUMMARY.md", ".planning/phases/67-project-webhooks/67-03-PLAN.md", ".planning/phases/67-project-webhooks/67-03-SUMMARY.md", ".planning/phases/67-project-webhooks/67-04-PLAN.md", ".planning/phases/67-project-webhooks/67-04-SUMMARY.md", "db-adapter.mjs", "e2e/webhooks.spec.mjs", "server.js", "src/core/webhook-events.js", "src/locales/en.json", "src/locales/fr.json", "src/overlays/modals.js", "src/overlays/webhooks-labels.json", "src/overlays/webhooks-settings.js", "test/webhook-delivery.test.mjs", "test/webhook-events.test.mjs", "test/webhook-formats.test.mjs", "test/webhook-routes.test.mjs", "test/webhook-retry.test.mjs", "test/webhook-ssrf.test.mjs", "webhook-formats.js", "webhook-retry.js", "webhook-ssrf.js"]
covered_digest: "v2:sha256:12521d5249c7b5e1a154fb2f183f2f3882e55008a0bbc30673c3807b9a9e66d2"
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/16
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 67: Project Webhooks Verification Report

**Phase Goal:** Project owners/admins/leaders can register per-project webhooks that deliver MS Teams payloads for the 8-event vocabulary — async, exactly-once, SSRF-hardened.
**Verified:** 2026-11-15T23:40:00Z
**Status:** human_needed (1 live-Teams delivery check)
**Re-verification:** Yes — digest re-stamp after review artifacts were committed post-verification (no source change)

## Re-Verification Basis

The prior VERIFICATION.md (2026-11-15T22:55:00Z) went stale because 67-REVIEW.md and 67-REVIEW-DISPOSITION.md were committed after its digest was computed. Deterministic re-checks this run:

1. **Fingerprint:** `gsd_run query verification.fingerprint` over all 26 covered files → `v2:sha256:12521d5249c7b5e1a154fb2f183f2f3882e55008a0bbc30673c3807b9a9e66d2`. (A prior re-stamp used a `v4:` version prefix this GSD install does not recognise — versions {1,2} — which the staleness check correctly failed closed on as unrecomputable. Re-stamped under the canonical v2 fingerprint with the identical 26-file covered set.)
2. **Behavioral regression:** `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` → **71 pass / 0 fail** (matches prior 28+43 split).
3. **Git history:** commits since prior verification (`b0bc68c`, `7c0fb97`) touch only `.planning/phases/67-project-webhooks/*` review/tracking docs.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner/admin/leader can register, edit, disable, delete hooks; member/viewer 403 on every route | ✓ VERIFIED | Routes at server.js:6181–6300 (regex-matched), `canManageProject` gate on ALL routes (list, create, patch, delete, test); test/webhook-routes.test.mjs "POST as plain member → 403; GET list as member → 403" passes |
| 2 | Secret generated server-side, shown ONLY in POST create response, never in list/get/patch/log/client doc | ✓ VERIFIED | `webhookHookView()` projection (server.js:2858+) built column-by-column, no secret field; D-10 comment at create site; test "T-67-08: the secret and full hook URL never appear in any log line" + "GET list: no secret field anywhere" pass |
| 3 | 8-event vocabulary from correct sources (7 from doc-PUT diff, due.reminder from runReminderPass), no double-fire | ✓ VERIFIED | `WEBHOOK_EVENTS` frozen 8-name list (src/core/webhook-events.js:33); `emitWebhookEvent` called from doc-PUT tx (server.js:2258) and reminder pass (server.js:2627); test "a due task with a subscribed hook yields exactly ONE due.reminder delivery per reminder claim (no double-fire)" passes |
| 4 | Exactly-once claim (dedup_key UNIQUE + INSERT OR IGNORE), replay is a no-op | ✓ VERIFIED | `webhook_deliveries.dedup_key` UNIQUE in both dialects (server.js:505, db-adapter.mjs:341); PG_CONFLICT_TARGETS `'(dedup_key)'` (db-adapter.mjs:48); tests "double enqueue … claims exactly ONE row", "the same PUT replayed claims nothing new", "two concurrent passes cannot both send" pass |
| 5 | Bounded retry honoring Retry-After (seconds + HTTP-date), 5 strikes → dead | ✓ VERIFIED | webhook-retry.js BACKOFF_MS D-05 table + nextAttemptMs + isDead; tests "Retry-After as an HTTP-date wins", "five strikes → dead", "unparseable Retry-After falls back" pass |
| 6 | Delivery strictly post-commit fire-and-forget, never awaited into the response | ✓ VERIFIED | server.js:6708 `if (webhookClaims) runWebhookDeliveryPass().catch(...)` — fire-and-forget next to sendPushFor, post-commit |
| 7 | SSRF: https-only, per-attempt resolved-IP deny-list, redirect:'error', fail-closed | ✓ VERIFIED | webhook-ssrf.js deny-list incl. IPv6 + boundary tests (172.32/172.15 pass, multi-IP adjacency); per-attempt re-check at server.js:2726 before fetch (server.js:2748 `redirect:'error'`, `AbortSignal.timeout(10_000)`); test "SSRF guard refuses a private resolved IP BEFORE any HTTP call (per-attempt re-check)" passes |
| 8 | 7-day retention purge (D-07) | ✓ VERIFIED | test "retention (D-07): a row older than 7 days is purged; a 6.9-day row survives" passes; WEBHOOK_RETENTION_MS used in pass |
| 9 | 3 Teams formats valid per MS Learn shapes; 28 672-byte cap with truncate-and-deliver; UTF-8 byte measurement | ✓ VERIFIED | webhook-formats.js (root, documented deviation); tests: adaptive/messagecard/raw-json shapes, "40 KB body truncated… still delivered (D-02)", "exactly 28672 bytes passes UNTRUNCATED", "multi-byte text measured in UTF-8 bytes" pass |
| 10 | AAD `<at>` mention when assignee has persisted oid; bold-name fallback otherwise | ✓ VERIFIED | users.oid column (db-adapter.mjs:158 pg; server.js:615 idempotent `adapterEnsureColumn`); single write at OIDC callback server.js:4997; tests "with a persisted oid renders a real AAD <at> mention", "without an oid falls back to bold-name" pass |
| 11 | Whitelist-only envelopes (D-01), no enriched fields | ✓ VERIFIED | `EVENT_FIELDS` frozen per-event whitelists; test "EVENT_FIELDS is a frozen whitelist for every event; buildEnvelope is the single field gate" passes |
| 12 | UI: Webhooks tab in projectSettings, lazy chunk, event checkboxes, show-once secret dialog, test button, health badge | ✓ VERIFIED | src/overlays/modals.js:364 (tab gated by canManage), :379–383 lazy-load `S.ui.whMod`; src/overlays/webhooks-settings.js (12.8 kB) with whPath → 67-03 routes; e2e/webhooks.spec.mjs 5/5 passing (show-once proven at DOM level, FR flow, member blocked) |
| 13 | EN+FR i18n parity, entry chunk under 500 kB gate | ✓ VERIFIED | Documented deviation: EN labels live in src/overlays/webhooks-labels.json (chunk budget), fr.json carries webhook.* keys (32); test/build-locales.test.mjs:150 pins EN↔FR key parity; build-locales + build-chunk-size tests pass (22 green); entry chunk 499.2 kB ≤ 500 kB |
| 14 | Doc-PUT with zero subscribed hooks → diff runs, zero rows, no error | ✓ VERIFIED | test "a doc-PUT with zero subscribed hooks yields zero rows and no error (empty edge)" passes |
| 15 | 67-SECURITY.md threat model closed, threats_open: 0 | ✓ VERIFIED | 67-SECURITY.md present with threats_open: 0 (register checked by orchestrator); consolidates T-67-01…T-67-10 |
| 16 | Mass-assignment guard: workspace_id/project_id/created_by from ctx, never body | ✓ VERIFIED | Create INSERT at server.js ~6208 builds columns from resolved ctx (project/ws from slug), body supplies only url/format/events; webhookHookView projection confirms no client-writable path to scope columns |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| webhook_hooks/webhook_deliveries DDL (server.js) | SQLite schema | ✓ VERIFIED | server.js:478, 505 |
| pg twins + PG_CONFLICT_TARGETS (db-adapter.mjs) | pg parity same commit | ✓ VERIFIED | db-adapter.mjs:325, 341, :48 |
| src/core/webhook-events.js | pure 8-event diff + envelopes | ✓ VERIFIED | 0 imports/require, WEBHOOK_EVENTS, diffWebhookEvents, buildEnvelope |
| webhook-ssrf.js + webhook-retry.js | server-only guards | ✓ VERIFIED | root modules, wired at server.js:65 and delivery pass |
| webhook-formats.js | 3-format Teams formatter | ✓ VERIFIED | at repo root (documented deviation from planned src/core path) |
| users.oid column | additive, both dialects, single write | ✓ VERIFIED | db-adapter.mjs:158, server.js:615, write at :4997 |
| Hook CRUD + /test routes | gated routes | ✓ VERIFIED | server.js:6181–6300 |
| test/webhook-{events,ssrf,retry,delivery,routes,formats}.test.mjs | behavioral tests | ✓ VERIFIED | 71 tests in this run's spot-check, 0 fail |
| src/overlays/webhooks-settings.js + modals.js tab | lazy UI | ✓ VERIFIED | present + wired via S.ui.whMod |
| src/locales webhook.* (fr.json) + webhooks-labels.json (EN twins) | EN+FR parity | ✓ VERIFIED | parity test pins both |
| e2e/webhooks.spec.mjs | UI-level proof | ✓ VERIFIED | 5 scenarios, all passing (per orchestrator gate run) |
| 67-SECURITY.md | threats_open: 0 | ✓ VERIFIED | present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| doc-PUT tx | diffWebhookEvents → claim | emitWebhookEvent inside tx (server.js:2258) | ✓ WIRED | claim → INSERT with dedup_key |
| post-commit | delivery pass | runWebhookDeliveryPass().catch() (server.js:6708) | ✓ WIRED | never awaited into response |
| scheduler | delivery pass | tick at server.js:8572 with .catch + unref'd interval | ✓ WIRED | |
| delivery pass | ssrfOk before fetch | server.js:2726 → 2748/2749 | ✓ WIRED | redirect:'error' + 10 s timeout |
| runReminderPass | due.reminder claim | server.js:2627 emitWebhookEvent | ✓ WIRED | shared dedup, no double-fire |
| OIDC callback | users.oid write | server.js:4997 single UPDATE | ✓ WIRED | |
| Webhooks tab | lazy module | modals.js:379–383 → S.ui.whMod | ✓ WIRED | |
| webhooks-settings.js | 67-03 routes | whPath → /api/workspaces/:slug/projects/:pid/webhooks | ✓ WIRED | paths match route regexes |
| POST /test | real pipeline | nonce dedup_key (server.js ~6302) → same engine | ✓ WIRED | "rides the real pipeline" test passes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| Hook list UI | hooks | GET route → db.all(webhook_hooks) → webhookHookView | Yes (server db) | ✓ FLOWING |
| Health badge | health | webhookHookHealth() from webhook_deliveries dead-count | Yes | ✓ FLOWING |
| Delivery engine | due rows | db select on webhook_deliveries (server.js:2793) | Yes | ✓ FLOWING |

No static/mock data paths found in the phase surface.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full webhook test corpus (re-run this verification) | `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` | 71 pass / 0 fail | ✓ PASS |

(Full-suite context from orchestrator gates: 1674 unit pass / 0 fail; e2e webhooks 5/5; build entry chunk 499.2 kB ≤ 500 kB; security register threats_open: 0.)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WHK-01 | 67-03, 67-04 | Owner/admin/leader register/edit/delete hooks via UI, secrets shown once, no MCP management | ✓ SATISFIED | Gated routes + UI tab + show-once secret (e2e DOM proof) |
| WHK-02 | 67-01, 67-02 | 8-event vocabulary, pure diff at funnel point, fire-and-forget | ✓ SATISFIED | webhook-events.js + two emission sites + post-commit pass |
| WHK-03 | 67-01 | Async fail-absent delivery, bounded retries w/ Retry-After, exactly-once claim table, 28 KB cap | ✓ SATISFIED | dedup_key UNIQUE claim, 5-strike dead, truncate-and-deliver tests |
| WHK-04 | 67-02, 67-04 | Valid MS Teams payloads, 3 formats, AAD mention w/ oid fallback | ✓ SATISFIED | webhook-formats.js tests against MS Learn shapes; users.oid write |
| WHK-05 | 67-01, 67-03, 67-04 | SSRF mitigations, mirror tables only, SQLite+pg parity same commit | ✓ SATISFIED | webhook-ssrf.js + per-attempt re-check; both dialects same commit (parity tests green) |

All 5 requirement IDs accounted for across plans; no orphaned requirements (REQUIREMENTS.md maps WHK-01…WHK-05 to Phase 67 exclusively).

### Prohibition Verification (must-NOTs)

| Prohibition | Verification | Status |
|-------------|--------------|--------|
| No mark-then-send (status delivered before 2xx) | judgment | ✓ SATISFIED — guarded attempt-claim test ("two concurrent passes cannot both send") exercises the transition |
| Secret/URL never in logs or client payloads | test | ✓ SATISFIED — T-67-08 log test + webhookHookView projection + list "no secret field" test pass |
| No doc-PUT awaits a delivery HTTP call | judgment | ✓ SATISFIED — code inspection server.js:6708 fire-and-forget; DoS test "pass answers 200" on fetch throw |
| Hook config never in client doc/docForClient | judgment | ✓ SATISFIED — no webhook_hooks/webhook_deliveries reference in any doc serialization path (grep clean); UI talks only to API routes |
| users.oid never in client payload/docForClient | judgment | ✓ SATISFIED — mention envelope is server-side only; no serialization path selects oid for clients |
| No MCP webhook-management route | judgment | ✓ SATISFIED — routes exist only under /api/workspaces/... regex family |
| Every webhook.* key in BOTH locales same commit | test | ✓ SATISFIED — build-locales parity test pins EN twins (webhooks-labels.json) ↔ fr.json webhook.* keys |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 4997 | users.oid write positioned after the 2FA early-return path (WR-04 review warning, dispositioned) | ⚠️ Warning (advisory) | An oid-bearing login that early-returns into 2FA setup won't persist oid on that login; next successful login writes it. Review-dispositioned warning — does not fail the phase, intersects WHK-04 mention fidelity only for 2FA-flow users. |
| webhook-formats.js | root | Module at repo root instead of planned src/core path | ℹ️ Info | Documented deviation; zero-import discipline still enforced by test |
| src/locales/en.json | — | EN webhook twins in webhooks-labels.json instead of en.json | ℹ️ Info | Documented deviation (chunk budget); parity enforced by build-locales test |

The 67-REVIEW.md findings (1 Critical + 4 Warnings) are dispositioned in 67-REVIEW-DISPOSITION.md and carried forward as advisory; none changed since the prior verification (digest-identical sources).

### Human Verification Required

### 1. Live delivery to a real MS Teams Workflows endpoint

**Test:** Register a real hook against an actual Teams Workflows URL (`https://*.logic.azure.com/...`) in a dev workspace, press « Envoyer un test », then create a task and verify the message lands in the channel and the HMAC (X-Gr8r-Signature) verifies with the shown secret.
**Expected:** The Adaptive Card (or chosen format) renders in the channel; the test result shows the real status code.
**Why human:** All pipeline tests inject fetch/clock/lookup; payload shape is pinned against MS Learn docs, but no test can prove a real Workflows endpoint accepts the payload and posts it. External-service integration is outside programmatic reach.

### Gaps Summary

No gaps. All 16 must-have truths remain verified (fingerprint-identical sources), all 5 WHK requirements satisfied, all 7 prohibitions hold. Status is human_needed solely for the single live-Teams delivery check that no test can perform.

---

_Verified: 2026-11-15T23:40:00Z_
_Verifier: the agent (gsd-verifier)_
