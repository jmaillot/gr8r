---
phase: 91-digest-dedup-one-digest-per-user-per-day
verified: 2026-11-23T23:59:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - ".planning/phases/91-digest-dedup-one-digest-per-user-per-day/91-PLAN.md"
  - ".planning/phases/91-digest-dedup-one-digest-per-user-per-day/91-SUMMARY.md"
  - "mailer.js"
  - "server.js"
  - "test/digest.test.mjs"
  - "test/email-outbox.test.mjs"
  - "test/unsubscribe-route.test.mjs"
covered_digest: "v2:sha256:68182af7ac169c19c59fd8f530951e699020935e5a21ca0c7ffc6997ab6a6bdf"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 91: Digest Dedup — One Digest Per User Per Day — Verification Report

**Phase Goal:** A digest-enrolled user in multiple workspaces receives exactly one digest email per day, with sections grouped per workspace — instead of one email per workspace (observed 4× duplicate).
**Verified:** 2026-11-23T23:59:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (goal-backward)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | SC1: 4-ws digest user receives exactly ONE email/day, 4 per-ws sections inside, empty sections never claim/render | ✓ VERIFIED | `node --test test/digest.test.mjs` → 22/22 pass (5.98s). Test `Phase 91 SC1/SC2` (line 913): `digest:user:{userId}:{DUE}` outbox row, `ctx.sections.length === 4`, empty-digest `continue` (server.js D-12 honesty) + enqueue loop `if (!acc.sections.length) continue` (server.js ~2948) |
| 2 | SC2: 4× duplicate pinned RED FIRST, green after fix; only transport coalesces | ✓ VERIFIED | Commit afdd6450 (22:47) adds only test/digest.test.mjs +125 lines, preceding fix commits d7612a78/1299d824/cdf47523; pinned test asserts exactly 1 email + 1 `digest:user:` outbox row + 4 byte-compat claims + zero per-ws transport keys. GREEN in live run |
| 3 | SC3 (D-05 superseded): restart + MAILER-disabled paths never double-send | ✓ VERIFIED | Restart-hole test `Phase 91 SC3` (line 997): 2 pre-inserted claims → re-run yields exactly 1 email, ALL 4 sections survive. Source: accumulation `if (MAILER.enabled)` and gate-independent of claim result (server.js ~2925); kick gated `if (MAILER.enabled && digestAcc.size)`; serialized pass `emailDeliveryChain` (server.js:3496–3499). Locale clause superseded by locked D-05 (fr\|en email-only) per 91-CONTEXT.md |
| 4 | SC4: per-ws `reminders_sent` claims byte-compatible | ✓ VERIFIED | Claim tx untouched: `insert or ignore into reminders_sent` with key `` `${ws.id}:${r.user_id}:digest:${localDate}` `` (server.js ~2870–2885); pinned test asserts 4 rows + second trigger adds 0 claims |
| 5 | D-02: single footer 0x02 link disables digest across ALL workspaces | ✓ VERIFIED | `node --test test/unsubscribe-route.test.mjs` → 16/16 (7.8s). Handler (server.js:11947–12000): `payload.wsId ? [wsId] : all memberships` loop merging `email_digest: false`; 0x01 path byte-unchanged; tampered 0x02 gets neutral response |
| 6 | ONE `runEmailDeliveryPass()` post-commit, never inside tx | ✓ VERIFIED | server.js:2981 — single post-loop kick with `.catch(logWarn)`; POL-02 D-07 comment block present |
| 7 | Frozen 0x01 token contract intact (length-pinned) | ✓ VERIFIED | mailer.js:130–133 (`0x01`, 36B ids, `1+2*36` payload) unmuted; `verifyUnsubscribeToken` dispatches on version byte + payload length (0x01 / 0x02 / 0 → reject), length = part of version identity |
| 8 | `deliverEmail` dispatch branch for `digest-aggregated` | ✓ VERIFIED | server.js:3461 `if (kind === 'digest-aggregated') return MAILER.sendDigestAggregated(a);`; `sendDigestAggregated` exported from both createMailer branches (mailer.js:1356 exports) |
| 9 | No migration added (no new DDL) | ✓ VERIFIED | `git show` on all 4 code commits greps CREATE TABLE/ALTER TABLE/ADD COLUMN/CREATE INDEX/migration → zero matches; tables reused (`email_outbox`, `reminders_sent`, `user_notif_prefs`) |

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| NOTIF-01 | 91-PLAN.md | One digest email per user per day across workspaces; root cause documented; pinned multi-ws regression | ✓ SATISFIED | Truths 1, 2, 4; 91-SUMMARY.md § Root Cause names the per-ws outbox insert (former server.js ~2881–2912) explicitly |

### Probe / Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Pinned 4-ws dedup regression (22 tests) | `node --test test/digest.test.mjs` | 22 pass / 0 fail | ✓ PASS |
| Unsubscribe routes 0x01 + 0x02 (16 tests) | `node --test test/unsubscribe-route.test.mjs` | 16 pass / 0 fail | ✓ PASS |
| No DDL in phase commits | `git show {afdd6450,d7612a78,1299d824,cdf47523} \| grep DDL` | zero matches | ✓ PASS |

### Key Source Invariants (Level 3/4 wiring)

| Invariant | Location | Status |
|-----------|----------|--------|
| Accumulate → INSERT OR IGNORE `digest:user:{userId}:{localDate}` → post-commit kick | server.js ~2895–2981 | ✓ WIRED |
| Restart hole: accumulation independent of claim result | server.js ~2924–2940 (`if (MAILER.enabled)` after claim tx, no `claimed` gate) | ✓ WIRED |
| MAILER-disabled: no accumulation, no enqueue, kick skipped | server.js ~2925, 2948, 2981 | ✓ WIRED |
| 0x02 handler loops all memberships, merge-upsert prefs | server.js:11947–12000 | ✓ WIRED |
| Token verify: length+version dispatch, timingSafeEqual | mailer.js:173–190 | ✓ WIRED |

### Deviations Accepted

1. **SC3 locale clause superseded by locked D-05** (fr|en email-only, no app i18n keys). 91-SUMMARY.md documents both the supersession AND the root cause (per-ws outbox insert) explicitly — verified in SUMMARY § Root Cause and § SC3-locale note.
2. **Serialized delivery pass** (`emailDeliveryChain`, server.js:3496) — added beyond plan to fix a same-tick double-send race found in T3; strengthens SC3, no contract change.
3. Four documented SUMMARY deviations (T2 interim shim, unsafe forward reference, race, test contamination) — all interim or test-scoping, resolved by final commits; live test runs confirm green end-state.

### Known Pre-Existing Failures (out of scope)

webhook-events/webhook-routes family, Phase-88 french-typography fr keys, export/backup.js:666 logo name, scheduler-overlap flake — excluded per contract; none touched by this phase's commits.

### Human Verification Required

None. All truths verified via executable tests run in this verification.

### Gaps Summary

None. All 4 ROADMAP success criteria and NOTIF-01 are satisfied with behavioral evidence; no migrations, no stubs, no debt markers in phase-modified files.

---

_Verified: 2026-11-23T23:59:00Z_
_Verifier: the agent (gsd-verifier)_
