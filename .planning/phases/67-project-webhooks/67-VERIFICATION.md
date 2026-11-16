---
phase: 67-project-webhooks
verified: 2026-11-16T12:24:20Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
covered_files: [".planning/phases/67-project-webhooks/67-01-PLAN.md", ".planning/phases/67-project-webhooks/67-01-SUMMARY.md", ".planning/phases/67-project-webhooks/67-02-PLAN.md", ".planning/phases/67-project-webhooks/67-02-SUMMARY.md", ".planning/phases/67-project-webhooks/67-03-PLAN.md", ".planning/phases/67-project-webhooks/67-03-SUMMARY.md", ".planning/phases/67-project-webhooks/67-04-PLAN.md", ".planning/phases/67-project-webhooks/67-04-SUMMARY.md", ".planning/phases/67-project-webhooks/67-05-PLAN.md", ".planning/phases/67-project-webhooks/67-05-SUMMARY.md", ".planning/phases/67-project-webhooks/67-UAT.md", "db-adapter.mjs", "e2e/webhooks.spec.mjs", "server.js", "src/core/webhook-events.js", "src/locales/en.json", "src/locales/fr.json", "src/overlays/modals.js", "src/overlays/webhooks-labels.json", "src/overlays/webhooks-settings.js", "test/webhook-delivery.test.mjs", "test/webhook-events.test.mjs", "test/webhook-formats.test.mjs", "test/webhook-routes.test.mjs", "test/webhook-retry.test.mjs", "test/webhook-ssrf.test.mjs", "webhook-formats.js", "webhook-retry.js", "webhook-ssrf.js"]
covered_digest: "v2:sha256:460e812c90e81f6f3c660ab6cb338649259aa568b0eb568cdba946e0f56fb99b"
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 16/16
  gaps_closed:
    - "G-67-1: Dockerfile missing webhook modules — resolved via UAT (commit 429cc48, live delivery confirmed working in Teams)"
    - "G-67-2: test payload body read « This is a test payload sent from gr8r. » — closed by commit c7a27ca (server.js sampleCtx.body now reads « This is a test payload sent from Projects Studio. »); post-fix UAT re-run PASSED (67-UAT.md commit fb1c2fa): user confirmed the delivered Teams card reads « This is a test payload sent from Projects Studio. »"
  gaps_remaining: []
  regressions: []
---

# Phase 67: Project Webhooks Verification Report

**Phase Goal:** Project owners/admins/leaders can register per-project webhooks that deliver MS Teams payloads for the 8-event vocabulary — async, exactly-once, SSRF-hardened.
**Verified:** 2026-11-16T12:24:20Z
**Status:** passed
**Re-verification:** Yes — digest refresh after UAT resolution; prior verified truths carried forward

## Re-Verification Basis

Prior VERIFICATION.md (2026-11-16T14:30:00Z) was `human_needed` solely pending the live Teams card re-observation. This refresh run:

1. **UAT closure (the focus of this run):** 67-UAT.md post-fix re-run (commit fb1c2fa) records `passed: 1, issues: 0` — the user confirmed the live-delivered Teams card body reads « This is a test payload sent from Projects Studio. ». The sole human-verification item is now resolved.
2. **Source drift check:** `git diff c7a27ca..HEAD -- server.js db-adapter.mjs webhook-*.js src/ test/ Dockerfile e2e/` → empty. No source file changed since the prior run (last source commit c7a27ca); only `.planning/` docs moved.
3. **Behavioral regression:** `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` → **71 pass / 0 fail** (single run).
4. **Source truth re-check:** `server.js` sampleCtx body reads « This is a test payload sent from Projects Studio. » (grep re-confirmed; zero `sent from gr8r` matches in payload path; only `x-gr8r-signature` header remains, by design).
5. **Threat model:** `67-SECURITY.md` `threats_open: 0` re-confirmed.
6. **Requirements cross-reference:** REQUIREMENTS.md maps WHK-01…WHK-05 to Phase 67 exclusively; no orphaned requirements.
7. **Fingerprint:** `verification.fingerprint` over the same 29 covered files → `v2:sha256:460e812c90e81f6f3c660ab6cb338649259aa568b0eb568cdba946e0f56fb99b` (fresh — 67-UAT.md is now covered at its post-fb1c2fa content).

All 16 must-have truths below are carried forward from the prior audit (spot-checked, not re-derived): presence, wiring, and data-flow evidence unchanged (no source drift).

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
| 15 | 67-SECURITY.md threat model closed, threats_open: 0 | ✓ VERIFIED | re-confirmed this run |
| 16 | Mass-assignment guard: workspace_id/project_id/created_by from ctx, never body | ✓ VERIFIED | create INSERT builds scope columns from resolved ctx; projection confirms no client-writable path |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| webhook_hooks/webhook_deliveries DDL (server.js) | SQLite schema | ✓ VERIFIED | unchanged since prior verification |
| pg twins + PG_CONFLICT_TARGETS (db-adapter.mjs) | pg parity same commit | ✓ VERIFIED | unchanged |
| src/core/webhook-events.js | pure 8-event diff + envelopes | ✓ VERIFIED | unchanged |
| webhook-ssrf.js + webhook-retry.js | server-only guards | ✓ VERIFIED | unchanged |
| webhook-formats.js | 3-format Teams formatter | ✓ VERIFIED | unchanged; zero `gr8r` occurrences |
| users.oid column | additive, both dialects, single write | ✓ VERIFIED | unchanged |
| Hook CRUD + /test routes | gated routes | ✓ VERIFIED | /test sampleCtx carries the corrected body |
| test/webhook-{events,ssrf,retry,delivery,routes,formats}.test.mjs | behavioral tests | ✓ VERIFIED | 71 pass / 0 fail this run |
| src/overlays/webhooks-settings.js + modals.js tab | lazy UI | ✓ VERIFIED | unchanged |
| e2e/webhooks.spec.mjs | UI-level proof | ✓ VERIFIED | 5 scenarios (prior gate run) |
| Dockerfile | runtime stage ships webhook modules (G-67-1) | ✓ VERIFIED | commit 429cc48; live delivery proven by UAT (fb1c2fa) |
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
| G-67-2 source truth | grep server.js sampleCtx body | body reads « This is a test payload sent from Projects Studio. » | ✓ PASS |
| No user-visible « gr8r » in payload path | `grep -rn "sent from gr8r" server.js test/ src/` | zero matches; only `x-gr8r-signature` header remains | ✓ PASS |
| No source drift since prior run | `git diff c7a27ca..HEAD -- <source paths>` | empty diff | ✓ PASS |

### UAT Resolution (previously human verification item)

### 1. UAT Test 1 re-run: corrected card text observed live in Teams — RESOLVED

**Test:** Re-run UAT Test 1 (« Envoyer un test » on a real Teams Workflows hook).
**Result:** PASSED — 67-UAT.md (commit fb1c2fa) records the delivered card body reading « This is a test payload sent from Projects Studio. », `passed: 1, issues: 0`. No open human-verification items remain.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WHK-01 | 67-03, 67-04 | Owner/admin/leader register/edit/delete hooks via UI, secrets shown once, no MCP management | ✓ SATISFIED | Gated routes + UI tab + show-once secret (e2e DOM proof) |
| WHK-02 | 67-01, 67-02 | 8-event vocabulary, pure diff at funnel point, fire-and-forget | ✓ SATISFIED | webhook-events.js + two emission sites + post-commit pass |
| WHK-03 | 67-01 | Async fail-absent delivery, bounded retries w/ Retry-After, exactly-once claim table, 28 KB cap | ✓ SATISFIED | dedup_key UNIQUE claim, 5-strike dead, truncate-and-deliver tests |
| WHK-04 | 67-02, 67-04 | Valid MS Teams payloads, 3 formats, AAD mention w/ oid fallback | ✓ SATISFIED | webhook-formats.js tests; users.oid write |
| WHK-05 | 67-01, 67-03, 67-04 | SSRF mitigations, mirror tables only, SQLite+pg parity same commit | ✓ SATISFIED | webhook-ssrf.js + per-attempt re-check; parity tests green |

All 5 requirement IDs accounted for; REQUIREMENTS.md maps WHK-01…WHK-05 to Phase 67 exclusively; no orphaned requirements.

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

### Gaps Summary

No gaps. G-67-1 (Dockerfile runtime modules) and G-67-2 (legacy « gr8r » in the test payload body) are both closed: the source fix (c7a27ca) was re-verified fresh, and the UAT post-fix re-run (fb1c2fa) confirms the live Teams card now reads « This is a test payload sent from Projects Studio. » — `passed: 1, issues: 0`. No source files changed since the prior run (c7a27ca is the last source commit; git diff empty over all phase source paths). 71/71 webhook tests green, threats_open: 0. All 16 must-have truths verified; phase goal achieved.

---

_Verified: 2026-11-16T12:24:20Z_
_Verifier: the agent (gsd-verifier)_
