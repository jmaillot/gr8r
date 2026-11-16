---
phase: 67-project-webhooks
verified: 2026-11-16T13:53:57Z
status: passed
score: 16/16 must-haves verified
behavior_unverified: 0
covered_files: [".planning/phases/67-project-webhooks/67-01-PLAN.md", ".planning/phases/67-project-webhooks/67-01-SUMMARY.md", ".planning/phases/67-project-webhooks/67-02-PLAN.md", ".planning/phases/67-project-webhooks/67-02-SUMMARY.md", ".planning/phases/67-project-webhooks/67-03-PLAN.md", ".planning/phases/67-project-webhooks/67-03-SUMMARY.md", ".planning/phases/67-project-webhooks/67-04-PLAN.md", ".planning/phases/67-project-webhooks/67-04-SUMMARY.md", ".planning/phases/67-project-webhooks/67-05-PLAN.md", ".planning/phases/67-project-webhooks/67-05-SUMMARY.md", ".planning/phases/67-project-webhooks/67-UAT.md", "db-adapter.mjs", "e2e/webhooks.spec.mjs", "server.js", "src/core/templates.js", "src/core/webhook-events.js", "src/locales/en.json", "src/locales/fr.json", "src/overlays/modals.js", "src/overlays/webhooks-labels.json", "src/overlays/webhooks-settings.js", "test/webhook-delivery.test.mjs", "test/webhook-events.test.mjs", "test/webhook-formats.test.mjs", "test/webhook-routes.test.mjs", "test/webhook-retry.test.mjs", "test/webhook-ssrf.test.mjs", "webhook-formats.js", "webhook-retry.js", "webhook-ssrf.js"]
covered_digest: "v2:sha256:7b2c5ca3409a142b4e4810ab2ea0575541efe31e0a30c82752640d48c4300eb9"
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 16/16
  gaps_closed:
    - "CR-01 (commit 54827ed): webhook dedup_key now carries the diff's occurredAt as the occurrence component — repeat real-world events for the same subject claim a NEW delivery instead of being silently dropped forever; same-occurrence replays stay exactly-once. Proven by the new CR-01 behavioral test + updated doc-PUT claim-key assertions."
    - "WR-01 (commit 54827ed): ssrfOk returns the VERIFIED address set and the default delivery transport is pinnedFetch — the TLS connect resolves through the validated set, closing the within-attempt DNS rebinding window. Proven by the 3 new pinnedFetch tests (fail-closed / pin + SNI / transport errors + abort) and the re-read delivery wiring (server.js:2827 guard → 2844 send)."
  gaps_remaining: []
  regressions: []
---

# Phase 67: Project Webhooks Verification Report

**Phase Goal:** Project owners/admins/leaders can register per-project webhooks that deliver MS Teams payloads for the 8-event vocabulary — async, exactly-once, SSRF-hardened.
**Verified:** 2026-11-16T13:53:57Z
**Status:** passed
**Re-verification:** Yes — stale-digest refresh after commit 54827ed (v2.4 audit tech-debt fixes touching covered source files)

## Re-Verification Basis

The prior VERIFICATION.md (2026-11-16T12:24:20Z) was `passed` but stale: commit **54827ed** (2026-11-16T14:29 local) modified covered source files. This run re-verified fresh — no prior result trusted:

1. **Staleness scope:** `git show 54827ed --stat` → `server.js` (dedup key + delivery transport), `webhook-ssrf.js` (pinnedFetch), `src/core/templates.js` (unchanged-skip heal — Phase 66 scope, but covered here via the bundle), plus 4 test files (`webhook-delivery`, `webhook-events`, `webhook-ssrf`, `templates`). 3 of the 5 webhook truths whose behavior depends on these files were re-derived from the diff, not carried forward.
2. **Diff read (not trusted):** CR-01 — `webhookDedupKey()` (server.js:2632–2635) appends the occurrence; doc-PUT emission passes `ev.occurredAt` (server.js:2728); callers without an occurrence (test nonce, reminder site — subjectId already encodes offset:due) keep the 3-part key. WR-01 — `ssrfOk` returns `{ ok, addresses }` (webhook-ssrf.js:71); `pinnedFetch` fail-closed on empty/non-https; delivery engine `const send = fetchFn || ((u,o) => pinnedFetch(u, { addresses: guard.addresses, ...o }))` where `guard = await ssrfOk(...)` (server.js:2827→2844). The `/test` route's `fetchFn` fallback now also routes through pinnedFetch with the validated set — the injection contract is unchanged, the default path is strictly hardened.
3. **Full suite (fresh, ×2 runs):** `npm test` (node --test --test-concurrency=2) → **1707 tests / 1694 pass / 0 fail / 13 pre-existing env skips** — matching the commit's claim. One intermediate run showed 3 flaky failures (email-outbox end-to-end, i18n-scan scanner, upload unlink) — cross-test interference under concurrency, all three pass in isolation (`node --test test/email-outbox.test.mjs test/upload.test.mjs test/i18n-scan.test.mjs` → 64/64) and none touch the changed webhook code; the parent commit's full run was clean, confirming interference, not regression.
4. **Webhook corpus:** `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` → **75 pass / 0 fail** (up from 71 — 4 new webhook tests: CR-01 occurrence dedup, pinnedFetch fail-closed/pin/abort).
5. **Client bundle:** `npm run build` → index chunk **499.33 kB < 500 kB** gate (src/core/templates.js is bundled; unchanged-skip heal adds no weight).
6. **Threat model:** `67-SECURITY.md` `threats_open: 0` re-confirmed.
7. **Requirements cross-reference:** REQUIREMENTS.md maps WHK-01…WHK-05 to Phase 67 exclusively; no orphaned requirements.
8. **Fingerprint:** `verification.fingerprint` over 30 covered files (now including `src/core/templates.js`) → `v4:sha256:6a78766fcb20cb734ed5db54a121a1c626e37bf41b2f50321d76bd1859e15c1a`.

Truths 1–2, 5–6, 8–16 were spot-checked for presence/wiring drift and carry forward (their supporting files were not modified by 54827ed); truths 3, 4, 7 are re-derived below with fresh behavioral evidence.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Owner/admin/leader can register, edit, disable, delete hooks; member/viewer 403 on every route | ✓ VERIFIED | `canManageProject` gate on all routes (server.js:6181–6300); routes test passes (75/75 corpus run) |
| 2 | Secret generated server-side, shown ONLY in POST create response, never in list/get/patch/log/client doc | ✓ VERIFIED | `webhookHookView()` projection without secret; T-67-08 log test + list "no secret field" test pass |
| 3 | 8-event vocabulary from correct sources (7 from doc-PUT diff, due.reminder from runReminderPass), no double-fire | ✓ VERIFIED (re-derived) | WEBHOOK_EVENTS frozen list (src/core/webhook-events.js:33); `occurredAt` present in all 8 envelope whitelists (:49–56); doc-PUT emission now passes `occurrence: ev.occurredAt` (server.js:2728); reminder site unchanged (no occurrence → 3-part key; subjectId encodes offset:due); no-double-fire test passes |
| 4 | Exactly-once claim (dedup_key UNIQUE + INSERT OR IGNORE), replay is a no-op | ✓ VERIFIED (re-derived) | dedup_key UNIQUE both dialects unchanged (server.js:505, db-adapter.mjs:341); NEW CR-01 test: same-occurrence replay claims 0, a NEW occurrence claims 1 and is delivered (`wh-occ:task.created:t1:{occ}` rows asserted); doc-PUT claim keys now carry ≥4 components (test asserted) |
| 5 | Bounded retry honoring Retry-After (seconds + HTTP-date), 5 strikes → dead | ✓ VERIFIED | webhook-retry.js D-05 table; retry tests pass |
| 6 | Delivery strictly post-commit fire-and-forget, never awaited into the response | ✓ VERIFIED | server.js `runWebhookDeliveryPass().catch(...)` unchanged |
| 7 | SSRF: https-only, per-attempt resolved-IP deny-list, redirect:'error', fail-closed | ✓ VERIFIED (re-derived) | ssrfOk returns the VERIFIED address set (webhook-ssrf.js:71); default transport is pinnedFetch bound to `guard.addresses` (server.js:2827→2844) — the TLS connect resolves THROUGH the validated set, closing the within-attempt rebinding window; 3 new pinnedFetch tests pass (fail-closed, pin+SNI, transport/abort); all legacy ssrf tests still green |
| 8 | 7-day retention purge (D-07) | ✓ VERIFIED | retention test passes |
| 9 | 3 Teams formats valid; 28 672-byte cap with truncate-and-deliver; UTF-8 byte measurement | ✓ VERIFIED | webhook-formats.js tests pass (adaptive/messagecard/raw-json, cap edge, UTF-8) |
| 10 | AAD `<at>` mention when assignee has persisted oid; bold-name fallback otherwise | ✓ VERIFIED | users.oid both dialects; single write at server.js:4997; both tests pass |
| 11 | Whitelist-only envelopes (D-01), no enriched fields | ✓ VERIFIED | EVENT_FIELDS frozen whitelist test passes |
| 12 | UI: Webhooks tab, lazy chunk, event checkboxes, show-once secret dialog, test button, health badge | ✓ VERIFIED | modals.js:364/:379–383 → S.ui.whMod → webhooks-settings.js; e2e 5/5 (prior gate) |
| 13 | EN+FR i18n parity, entry chunk under 500 kB gate | ✓ VERIFIED | webhooks-labels.json (EN) ↔ fr.json webhook.* parity test; chunk re-built this run: 499.33 kB ≤ 500 kB |
| 14 | Doc-PUT with zero subscribed hooks → diff runs, zero rows, no error | ✓ VERIFIED | empty-edge test passes |
| 15 | 67-SECURITY.md threat model closed, threats_open: 0 | ✓ VERIFIED | re-confirmed this run |
| 16 | Mass-assignment guard: workspace_id/project_id/created_by from ctx, never body | ✓ VERIFIED | create INSERT builds scope columns from resolved ctx; projection confirms no client-writable path |

**Score:** 16/16 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| webhook_hooks/webhook_deliveries DDL (server.js) | SQLite schema | ✓ VERIFIED | unchanged by 54827ed (dedup_key column semantics changed, schema not) |
| pg twins + PG_CONFLICT_TARGETS (db-adapter.mjs) | pg parity same commit | ✓ VERIFIED | unchanged |
| src/core/webhook-events.js | pure 8-event diff + envelopes | ✓ VERIFIED | unchanged; supplies occurredAt consumed by the new occurrence key |
| webhook-ssrf.js + webhook-retry.js | server-only guards | ✓ VERIFIED | ssrfOk now returns `{ ok, addresses }`; pinnedFetch added (WR-01), fail-closed, request injectable |
| webhook-formats.js | 3-format Teams formatter | ✓ VERIFIED | unchanged; zero `gr8r` occurrences |
| users.oid column | additive, both dialects, single write | ✓ VERIFIED | unchanged |
| Hook CRUD + /test routes | gated routes | ✓ VERIFIED | /test enqueue now forwards `occurrence`; fetchFn fallback hardened to pinnedFetch |
| test/webhook-{events,ssrf,retry,delivery,routes,formats}.test.mjs | behavioral tests | ✓ VERIFIED | 75 pass / 0 fail this run (+4 since prior) |
| src/overlays/webhooks-settings.js + modals.js tab | lazy UI | ✓ VERIFIED | unchanged |
| e2e/webhooks.spec.mjs | UI-level proof | ✓ VERIFIED | 5 scenarios (prior gate run) |
| Dockerfile | runtime stage ships webhook modules (G-67-1) | ✓ VERIFIED | commit 429cc48; live delivery proven by UAT (fb1c2fa) |
| 67-SECURITY.md | threats_open: 0 | ✓ VERIFIED | re-confirmed |
| src/core/templates.js | unchanged-skip heal (WR-05, 54827ed) | ✓ VERIFIED | normalizeTemplatesData accepts `{ storedTemplates }`; +2 template tests pass; bundle 499.33 kB |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| doc-PUT tx | diffWebhookEvents → claim | emitWebhookEvent inside tx, occurrence: ev.occurredAt (server.js:2728) | ✓ WIRED | re-wired by 54827ed; verified fresh |
| post-commit | delivery pass | runWebhookDeliveryPass().catch() | ✓ WIRED | unchanged |
| scheduler | delivery pass | tick with .catch + unref'd interval | ✓ WIRED | unchanged |
| delivery pass | ssrfOk before fetch | guard = ssrfOk (server.js:2827) → send pins to guard.addresses (server.js:2844) | ✓ WIRED | re-wired by 54827ed — the guard's verdict now feeds the transport |
| runReminderPass | due.reminder claim | server.js:2627 (no occurrence → 3-part key) | ✓ WIRED | unchanged; subjectId already encodes offset:due |
| OIDC callback | users.oid write | server.js:4997 | ✓ WIRED | unchanged |
| Webhooks tab | lazy module | modals.js:379–383 → S.ui.whMod | ✓ WIRED | unchanged |
| webhooks-settings.js | 67-03 routes | whPath → /api/workspaces/.../webhooks | ✓ WIRED | unchanged |
| POST /test | real pipeline | nonce dedup_key → same engine | ✓ WIRED | fetchFn may be undefined → pinnedFetch with validated set; injection contract unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| Hook list UI | hooks | GET route → db.all(webhook_hooks) → webhookHookView | Yes | ✓ FLOWING |
| Health badge | health | webhookHookHealth() from webhook_deliveries dead-count | Yes | ✓ FLOWING |
| Delivery engine | due rows | db select on webhook_deliveries | Yes | ✓ FLOWING |
| Guard address set | guard.addresses | ssrfOk's live dns.lookup resolution | Yes | ✓ FLOWING (new — flows from guard to pinnedFetch) |
| Test card body | sampleCtx.body | hardcoded sample literal | Intentional static sample (it IS the sample payload) | ✓ N/A (by design) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Webhook corpus regression | `node --test test/webhook-{delivery,ssrf,retry,events,formats,routes}.test.mjs` | 75 pass / 0 fail | ✓ PASS |
| Full suite (fresh, ×2) | `npm test` | 1707 tests / 1694 pass / 0 fail / 13 env skips — both runs | ✓ PASS |
| Flaky-failure triage | `node --test test/email-outbox.test.mjs test/upload.test.mjs test/i18n-scan.test.mjs` (isolation) | 64/64 pass — the one-time full-run failures were cross-test interference, not regression | ✓ PASS |
| Occurrence dedup (CR-01) | same-occurrence replay → 0 claims; new occurrence → 1 claim + delivered (webhook-delivery test) | asserted in passing test | ✓ PASS |
| Pinned-fetch fail-closed (WR-01) | empty address set / http:// / abort / ECONNREFUSED (webhook-ssrf tests) | all reject, never connect | ✓ PASS |
| Client bundle gate | `npm run build` | index chunk 499.33 kB < 500 kB | ✓ PASS |
| G-67-2 source truth | grep server.js sampleCtx body | body reads « This is a test payload sent from Projects Studio. » | ✓ PASS |
| No user-visible « gr8r » in payload path | `grep -rn "sent from gr8r" server.js test/ src/` | zero matches; only `x-gr8r-signature` header remains | ✓ PASS |

### UAT Resolution (previously human verification item)

### 1. UAT Test 1 re-run: corrected card text observed live in Teams — RESOLVED

**Test:** Re-run UAT Test 1 (« Envoyer un test » on a real Teams Workflows hook).
**Result:** PASSED — 67-UAT.md (commit fb1c2fa) records the delivered card body reading « This is a test payload sent from Projects Studio. », `passed: 1, issues: 0`. No open human-verification items remain. (54827ed does not change the /test payload path; the injection contract is unchanged.)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WHK-01 | 67-03, 67-04 | Owner/admin/leader register/edit/delete hooks via UI, secrets shown once, no MCP management | ✓ SATISFIED | Gated routes + UI tab + show-once secret (e2e DOM proof) |
| WHK-02 | 67-01, 67-02 | 8-event vocabulary, pure diff at funnel point, fire-and-forget | ✓ SATISFIED | webhook-events.js + two emission sites + post-commit pass; occurredAt rides the diff→claim link |
| WHK-03 | 67-01 | Async fail-absent delivery, bounded retries w/ Retry-After, exactly-once claim table, 28 KB cap | ✓ SATISFIED | occurrence-bearing dedup_key UNIQUE claim (CR-01 hardened), 5-strike dead, truncate-and-deliver tests |
| WHK-04 | 67-02, 67-04 | Valid MS Teams payloads, 3 formats, AAD mention w/ oid fallback | ✓ SATISFIED | webhook-formats.js tests; users.oid write |
| WHK-05 | 67-01, 67-03, 67-04 | SSRF mitigations, mirror tables only, SQLite+pg parity same commit | ✓ SATISFIED | ssrfOk + pinnedFetch (WR-01: within-attempt rebinding window closed); parity tests green |

All 5 requirement IDs accounted for; REQUIREMENTS.md maps WHK-01…WHK-05 to Phase 67 exclusively; no orphaned requirements.

### Prohibition Verification (must-NOTs)

| Prohibition | Verification | Status |
|-------------|--------------|--------|
| No mark-then-send (status delivered before 2xx) | judgment | ✓ SATISFIED — guarded attempt-claim test exercises the transition |
| Secret/URL never in logs or client payloads | test | ✓ SATISFIED — T-67-08 + projection + list test pass |
| No doc-PUT awaits a delivery HTTP call | judgment | ✓ SATISFIED — fire-and-forget unchanged; DoS test passes |
| Hook config never in client doc/docForClient | judgment | ✓ SATISFIED — grep clean |
| users.oid never in client payload/docForClient | judgment | ✓ SATISFIED — server-side mention only |
| No MCP webhook-management route | judgment | ✓ SATISFIED — routes only under /api/workspaces/... |
| Every webhook.* key in BOTH locales same commit | test | ✓ SATISFIED — build-locales parity test |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| server.js | 4997 | users.oid write after the 2FA early-return path (review-dispositioned) | ⚠️ Warning (advisory) | carried forward; unchanged by 54827ed |
| webhook-formats.js | root | Module at repo root instead of planned src/core path | ℹ️ Info | documented deviation |
| src/overlays/webhooks-labels.json | — | EN webhook twins outside en.json | ℹ️ Info | documented deviation (chunk budget); parity test pins |
| test suite | — | 3 tests (email-outbox e2e, i18n-scan, upload) interfere under full-suite concurrency | ℹ️ Info | flaky interference only; pass in isolation; not webhook code |

### Gaps Summary

No gaps. The stale digest was caused by commit 54827ed, which hardened two Phase 67 truths and both were re-derived fresh: CR-01 (occurrence-bearing dedup key — repeat real-world events now claim new deliveries, same-occurrence replays stay exactly-once, proven by the new behavioral test) and WR-01 (pinnedFetch default transport — the guard's validated address set feeds the TLS connect, closing the within-attempt DNS rebinding window, proven by 3 new fail-closed tests). Full suite 1694 pass / 0 fail / 13 env skips across two fresh runs; webhook corpus 75/75; bundle 499.33 kB < 500 kB; threats_open: 0. All 16 must-have truths verified; phase goal achieved.

---

_Verified: 2026-11-16T13:53:57Z_
_Verifier: the agent (gsd-verifier)_
