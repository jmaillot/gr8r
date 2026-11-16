---
phase: 67-project-webhooks
verified: 2026-11-16T14:30:00Z
status: human_needed
score: 16/16 must-haves verified
behavior_unverified: 0
covered_files: [".planning/phases/67-project-webhooks/67-01-PLAN.md", ".planning/phases/67-project-webhooks/67-01-SUMMARY.md", ".planning/phases/67-project-webhooks/67-02-PLAN.md", ".planning/phases/67-project-webhooks/67-02-SUMMARY.md", ".planning/phases/67-project-webhooks/67-03-PLAN.md", ".planning/phases/67-project-webhooks/67-03-SUMMARY.md", ".planning/phases/67-project-webhooks/67-04-PLAN.md", ".planning/phases/67-project-webhooks/67-04-SUMMARY.md", ".planning/phases/67-project-webhooks/67-05-PLAN.md", ".planning/phases/67-project-webhooks/67-05-SUMMARY.md", ".planning/phases/67-project-webhooks/67-UAT.md", "db-adapter.mjs", "e2e/webhooks.spec.mjs", "server.js", "src/core/webhook-events.js", "src/locales/en.json", "src/locales/fr.json", "src/overlays/modals.js", "src/overlays/webhooks-labels.json", "src/overlays/webhooks-settings.js", "test/webhook-delivery.test.mjs", "test/webhook-events.test.mjs", "test/webhook-formats.test.mjs", "test/webhook-routes.test.mjs", "test/webhook-retry.test.mjs", "test/webhook-ssrf.test.mjs", "webhook-formats.js", "webhook-retry.js", "webhook-ssrf.js"]
covered_digest: "v2:sha256:6242d6c06d64f5f7f2953a581747b073ea1d596e84bc48cfbca623662452e346"
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/16
  gaps_closed:
    - "G-67-1: Dockerfile missing webhook modules — resolved via UAT (commit 429cc48, live delivery confirmed working in Teams)"
    - "G-67-2: test payload body read « This is a test payload sent from gr8r. » — closed by commit c7a27ca (server.js sampleCtx.body now reads « This is a test payload sent from Projects Studio. »)"
  gaps_remaining: []
  regressions: []
---

# Phase 67: Project Webhooks Verification Report

**Phase Goal:** Project owners/admins/leaders can register per-project webhooks that deliver MS Teams payloads for the 8-event vocabulary — async, exactly-once, SSRF-hardened.
**Verified:** 2026-11-16T14:30:00Z
**Status:** human_needed (1 UAT re-run: corrected card text not yet re-observed live in Teams)
**Re-verification:** Yes — after gap closure G-67-2 (commit c7a27ca) and UAT resolution of G-67-1

## Re-Verification Basis

Prior VERIFICATION.md (2026-11-15T23:40:00Z) was stale: UAT (cbffd61) and gap-closure plan 67-05 (c7a27ca) landed after its digest. This run's fresh checks:

1. **G-67-2 closure (the focus of this run):**
   - `server.js` sampleCtx (line ~6505): `body: 'This is a test payload sent from Projects Studio.'` — VERIFIED in source.
   - `grep -rn "sent from gr8r" server.js test/ src/` → zero matches.
   - Remaining `gr8r` occurrences in the payload path: only the protocol header `x-gr8r-signature` (server.js:2828, :3020) — protocol-level, intentionally unchanged per 67-05 diagnosis; not user-visible text.
   - `grep -c gr8r` in webhook-formats.js, webhooks-settings.js, webhooks-labels.json, fr.json → all zero.
   - No test pinned the old string (67-05 grep re-confirmed; conditional test update was a no-op).
2. **G-67-1:** resolved via UAT — commit 429cc48 added the webhook modules to the Dockerfile runtime stage; the user's live test then delivered successfully into Teams (67-UAT.md Test 1).
3. **Behavioral regression:** `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` → **71 pass / 0 fail** (single run, matches prior corpus).
4. **Git history:** commits since prior verification (`5e357fa`, `cbffd61`, `c7a27ca`, `ee0a497`, `280877f`, `a5a1a27`, `d38cd77`, `0374274`) touch only `server.js` (c7a27ca, 1 line) and `.planning/` docs — no other source drift.
5. **Fingerprint:** `verification.fingerprint` over 29 covered files (prior 26 + 67-05-PLAN/SUMMARY + 67-UAT.md) → `v2:sha256:6242d6c06d64f5f7f2953a581747b073ea1d596e84bc48cfbca623662452e346`.
6. `67-SECURITY.md` `threats_open: 0` re-confirmed.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner/admin/leader can register, edit, disable, delete hooks; member/viewer 403 on every route | ✓ VERIFIED | `canManageProject` gate on all routes (server.js:6181–6300); routes test passes (corpus run) |
| 2 | Secret generated server-side, shown ONLY in POST create response, never in list/get/patch/log/client doc | ✓ VERIFIED | `webhookHookView()` projection without secret; T-67-08 log test + list "no secret field" test pass |
| 3 | 8-event vocabulary from correct sources (7 from doc-PUT diff, due.reminder from runReminderPass), no double-fire | ✓ VERIFIED | WEBHOOK_EVENTS frozen list (src/core/webhook-events.js:33); emission at server.js:2258 + :2627; no-double-fire test passes |
| 4 | Exactly-once claim (dedup_key UNIQUE + INSERT OR IGNORE), replay is a no-op | ✓ VERIFIED | dedup_key UNIQUE both dialects (server.js:505, db-adapter.mjs:341); concurrent/replay tests pass |
| 5 | Bounded retry honoring Retry-After (seconds + HTTP-date), 5 strikes → dead | ✓ VERIFIED | webhook-retry.js D-05 table; retry tests pass |
| 6 | Delivery strictly post-commit fire-and-forget, never awaited into the response | ✓ VERIFIED | server.js:6708 `runWebhookDeliveryPass().catch(...)` |
| 7 | SSRF: https-only, per-attempt resolved-IP deny-list, redirect:'error', fail-closed | ✓ VERIFIED | webhook-ssrf.js + per-attempt re-check at server.js:2726→2748; ssrf tests pass |
| 8 | 7-day retention purge (D-07) | ✓ VERIFIED | retention test passes |
| 9 | 3 Teams formats valid; 28 672-byte cap with truncate-and-deliver; UTF-8 byte measurement | ✓ VERIFIED | webhook-formats.js tests pass (adaptive/messagecard/raw-json, cap edge, UTF-8) |
| 10 | AAD `<at>` mention when assignee has persisted oid; bold-name fallback otherwise | ✓ VERIFIED | users.oid both dialects; single write at server.js:4997; both tests pass |
| 11 | Whitelist-only envelopes (D-01), no enriched fields | ✓ VERIFIED | EVENT_FIELDS frozen whitelist test passes |
| 12 | UI: Webhooks tab, lazy chunk, event checkboxes, show-once secret dialog, test button, health badge | ✓ VERIFIED | modals.js:364/:379–383 → S.ui.whMod → webhooks-settings.js; e2e 5/5 (prior gate) |
| 13 | EN+FR i18n parity, entry chunk under 500 kB gate | ✓ VERIFIED | webhooks-labels.json (EN) ↔ fr.json webhook.* parity test (documented deviation); chunk 499.3 kB ≤ 500 kB |
| 14 | Doc-PUT with zero subscribed hooks → diff runs, zero rows, no error | ✓ VERIFIED | empty-edge test passes |
| 15 | 67-SECURITY.md threat model closed, threats_open: 0 | ✓ VERIFIED | re-confirmed this run (frontmatter line 6) |
| 16 | Mass-assignment guard: workspace_id/project_id/created_by from ctx, never body | ✓ VERIFIED | create INSERT builds scope columns from resolved ctx; projection confirms no client-writable path |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified) — no regressions from the G-67-2 fix.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| webhook_hooks/webhook_deliveries DDL (server.js) | SQLite schema | ✓ VERIFIED | unchanged since prior verification |
| pg twins + PG_CONFLICT_TARGETS (db-adapter.mjs) | pg parity same commit | ✓ VERIFIED | unchanged |
| src/core/webhook-events.js | pure 8-event diff + envelopes | ✓ VERIFIED | unchanged |
| webhook-ssrf.js + webhook-retry.js | server-only guards | ✓ VERIFIED | unchanged |
| webhook-formats.js | 3-format Teams formatter | ✓ VERIFIED | unchanged; zero `gr8r` occurrences |
| users.oid column | additive, both dialects, single write | ✓ VERIFIED | unchanged |
| Hook CRUD + /test routes | gated routes | ✓ VERIFIED | /test sampleCtx now carries the corrected body |
| test/webhook-{events,ssrf,retry,delivery,routes,formats}.test.mjs | behavioral tests | ✓ VERIFIED | 71 pass / 0 fail this run |
| src/overlays/webhooks-settings.js + modals.js tab | lazy UI | ✓ VERIFIED | unchanged |
| e2e/webhooks.spec.mjs | UI-level proof | ✓ VERIFIED | 5 scenarios (prior gate run) |
| Dockerfile | runtime stage ships webhook modules (G-67-1) | ✓ VERIFIED | commit 429cc48; live delivery proven by UAT |
| 67-SECURITY.md | threats_open: 0 | ✓ VERIFIED | re-confirmed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| doc-PUT tx | diffWebhookEvents → claim | emitWebhookEvent inside tx (server.js:2258) | ✓ WIRED | unchanged |
| post-commit | delivery pass | runWebhookDeliveryPass().catch() (server.js:6708) | ✓ WIRED | unchanged |
| scheduler | delivery pass | tick with .catch + unref'd interval | ✓ WIRED | unchanged |
| delivery pass | ssrfOk before fetch | server.js:2726 → 2748/2749 | ✓ WIRED | unchanged |
| runReminderPass | due.reminder claim | server.js:2627 | ✓ WIRED | unchanged |
| OIDC callback | users.oid write | server.js:4997 | ✓ WIRED | unchanged |
| Webhooks tab | lazy module | modals.js:379–383 → S.ui.whMod | ✓ WIRED | unchanged |
| webhooks-settings.js | 67-03 routes | whPath → /api/workspaces/.../webhooks | ✓ WIRED | unchanged |
| POST /test | real pipeline | nonce dedup_key → same engine, corrected sampleCtx body | ✓ WIRED | c7a27ca touched only the body string |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| Hook list UI | hooks | GET route → db.all(webhook_hooks) → webhookHookView | Yes | ✓ FLOWING |
| Health badge | health | webhookHookHealth() from webhook_deliveries dead-count | Yes | ✓ FLOWING |
| Delivery engine | due rows | db select on webhook_deliveries | Yes | ✓ FLOWING |
| Test card body | sampleCtx.body | hardcoded sample literal | Intentional static sample (it IS the sample payload) | ✓ N/A (by design) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Webhook corpus regression (single run) | `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` | 71 pass / 0 fail | ✓ PASS |
| G-67-2 source truth | `sed -n 6500p server.js` + grep | body reads « This is a test payload sent from Projects Studio. » | ✓ PASS |
| No user-visible « gr8r » in payload path | `grep -rn "sent from gr8r" server.js test/ src/` | zero matches; only `x-gr8r-signature` header remains | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WHK-01 | 67-03, 67-04 | Owner/admin/leader register/edit/delete hooks via UI, secrets shown once, no MCP management | ✓ SATISFIED | Gated routes + UI tab + show-once secret (e2e DOM proof) |
| WHK-02 | 67-01, 67-02 | 8-event vocabulary, pure diff at funnel point, fire-and-forget | ✓ SATISFIED | webhook-events.js + two emission sites + post-commit pass |
| WHK-03 | 67-01 | Async fail-absent delivery, bounded retries w/ Retry-After, exactly-once claim table, 28 KB cap | ✓ SATISFIED | dedup_key UNIQUE claim, 5-strike dead, truncate-and-deliver tests |
| WHK-04 | 67-02, 67-04 | Valid MS Teams payloads, 3 formats, AAD mention w/ oid fallback | ✓ SATISFIED | webhook-formats.js tests; users.oid write |
| WHK-05 | 67-01, 67-03, 67-04 | SSRF mitigations, mirror tables only, SQLite+pg parity same commit | ✓ SATISFIED | webhook-ssrf.js + per-attempt re-check; parity tests green |

All 5 requirement IDs accounted for; no orphaned requirements (REQUIREMENTS.md maps WHK-01…WHK-05 to Phase 67 exclusively).

### Prohibition Verification (must-NOTs)

| Prohibition | Verification | Status |
|-------------|--------------|--------|
| No mark-then-send (status delivered before 2xx) | judgment | ✓ SATISFIED — guarded attempt-claim test exercises the transition |
| Secret/URL never in logs or client payloads | test | ✓ SATISFIED — T-67-08 + projection + list test pass |
| No doc-PUT awaits a delivery HTTP call | judgment | ✓ SATISFIED — server.js:6708 fire-and-forget; DoS test passes |
| Hook config never in client doc/docForClient | judgment | ✓ SATISFIED — grep clean |
| users.oid never in client payload/docForClient | judgment | ✓ SATISFIED — server-side mention only |
| No MCP webhook-management route | judgment | ✓ SATISFIED — routes only under /api/workspaces/... |
| Every webhook.* key in BOTH locales same commit | test | ✓ SATISFIED — build-locales parity test |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 4997 | users.oid write after the 2FA early-return path (review-dispositioned) | ⚠️ Warning (advisory) | carried forward from prior verification; unchanged |
| webhook-formats.js | root | Module at repo root instead of planned src/core path | ℹ️ Info | documented deviation |
| src/overlays/webhooks-labels.json | — | EN webhook twins outside en.json | ℹ️ Info | documented deviation (chunk budget); parity test pins |

### Human Verification Required

### 1. UAT Test 1 re-run: corrected card text observed live in Teams

**Test:** Re-run UAT Test 1 (/gsd-verify-work 67): press « Envoyer un test » on a real Teams Workflows hook and confirm the delivered Adaptive Card body reads « This is a test payload sent from Projects Studio. » (no « gr8r »).
**Expected:** The corrected card renders in the channel; the branding gap stays closed end-to-end.
**Why human:** The fix is proven in source (deterministic checks above), but the live-delivered card text was only observed pre-fix (67-UAT.md reported « gr8r »). No test can prove what a real Workflows endpoint renders.

### Gaps Summary

No gaps. G-67-1 (Dockerfile runtime modules) resolved via UAT; G-67-2 (legacy « gr8r » in the test payload body) closed by commit c7a27ca and re-verified fresh in this run: source truth, zero grep matches, protocol header unchanged by design, 71/71 webhook tests green. All 16 must-have truths remain verified with no regressions. Status remains human_needed solely for the UAT re-run of the corrected live Teams card text — the one observation no programmatic check can perform.

---

_Verified: 2026-11-16T14:30:00Z_
_Verifier: the agent (gsd-verifier)_
