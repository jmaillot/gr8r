---
phase: 33-membership-surface-hardening
verified: 2026-11-04T00:00:00Z
status: passed
score: 5/5 must-haves verified
covered_files:
  - .planning/phases/33-membership-surface-hardening/33-01-PLAN.md
  - .planning/phases/33-membership-surface-hardening/33-02-PLAN.md
  - .planning/phases/33-membership-surface-hardening/33-01-SUMMARY.md
  - .planning/phases/33-membership-surface-hardening/33-02-SUMMARY.md
  - server.js
  - test/hardening.test.mjs
  - test/oidc-sso.test.mjs
  - src/locales/en.json
  - src/locales/fr.json
covered_digest: "v2:sha256:8d7ffe5d259d0ae28318cceaf3d10f424cb675f63e53a0e8372e9df2233191e4"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 5/5
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 33: Membership-Surface Hardening Verification Report

**Phase Goal:** The invite-accept surface meets the v1.1 audit discipline: sameOrigin-guarded POST, no admin invites through the link-only path, no `firstWorkspace()` fallback on the accept route and its SSO-reconcile twin (both in one commit), spoof-proof accept body whitelist.
**Verified:** 2026-11-04
**Status:** passed
**Re-verification:** Yes — stale-verification refresh after post-verification changes (phase 34 touched server.js and locale files; line numbers shifted by ~190).

## Goal Achievement

All five hardening mechanisms re-verified against the CURRENT codebase. Every HARD marker survived phase 34/35 edits intact — the shifted line numbers below are fresh greps, not the prior report's.

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence (current code) |
|---|-------|--------|--------------------------|
| 1 | Cross-origin POST to invite-accept rejected by `sameOrigin()` guard, ordered before body read/throttle, pinned by test | ✓ VERIFIED | `server.js:4606` guard precedes `tooMany()` (:4607) and `readJson` (:4623) on the accept route, with the "Pitfall 22 order" comment. Pins: hardening.test.mjs hostile-Origin 403 + guard-before-throttle budget probe + Origin-less positive control — all pass in this run (11/11). |
| 2 | Admin-created invite cannot carry admin role via link-only path — enforced server-side, test-pinned; every accept is email-bound | ✓ VERIFIED | Three enforcement points intact: creation 400 `inviteAdminEmailRequired` before insert (`server.js:4500-4506`), accept-side refusal of email-less admin/owner rows (`server.js:4623-4628`), boot sweep UPDATE-only (`server.js:5180-5182`). HARD-02a/b/c pins pass. |
| 3 | Both twins resolve workspace explicitly or fail closed (410 `workspaceGone`); one commit; protected `firstWorkspace()` sites untouched | ✓ VERIFIED | Accept twin: `server.js:4664-4667` explicit lookup + 410, "no firstWorkspace() fallback" comment, no fallback branch. SSO twin: `server.js:2994-3033` explicit lookup, `else` branch (:3026-3033) consumes the one invite, no membership write, skips address-wide clearing, no `sso_invite_accepted` log, redirects `/login?sso=error`. Both edits remain in commit `4243600` (git history unchanged). Protected sites intact: `firstWorkspace()` def :606, seed-boot :1778, read path :2379 (6 total references, all protected/non-accept). HARD-03a/b pins pass. |
| 4 | Spoof payload (role/name smuggling) rejected — body whitelist pinned by test | ✓ VERIFIED | `server.js:4640-4651` structural silent whitelist `{ name, email, password }`; role/teams/scope come only from the invite row. Spoof pins pass. |
| 5 | `sameOrigin()` and proxy-header readers agree on multi-value `x-forwarded-*` first-value discipline, pinned by test | ✓ VERIFIED | Shared `firstForwardedValue()` helper `server.js:2573` consumed by proto :2579, clientIp :2606, `sameOrigin()` :2610-2613. HARD-05 pins pass. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` | Guard, helper, whitelist, twins fail-closed, sweep | ✓ VERIFIED | All HARD edits present at shifted line numbers; phase 34 additions (notif-prefs migration, WR-01/WR-02) are additive and did not touch the hardening surface |
| `test/hardening.test.mjs` | HARD-01/02a/b/c/03a/04/05 pins | ✓ VERIFIED | 11 tests, 11 pass, 0 fail in this run |
| `test/oidc-sso.test.mjs` | HARD-03b twin pin | ✓ VERIFIED | fail 0 in this run, incl. deleted-workspace SSO pin landing `/login?sso=error` |
| `src/locales/en.json` | `err.inviteAdminEmailRequired` | ✓ VERIFIED | Line 1607 |
| `src/locales/fr.json` | FR translation | ✓ VERIFIED | Line 1607 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| accept route head | `sameOrigin(req)` | guard first, before throttle/body | WIRED | server.js:4606 precedes :4607/:4623 |
| `firstForwardedValue()` | proto/clientIp/sameOrigin | one definition, three consumers | WIRED | server.js:2573 → :2579, :2606, :2610 |
| creation route role check | 400 before insert | `ROLE_RANK[role] >= ROLE_RANK.admin && emails.length === 0` | WIRED | server.js:4500-4506 |
| SSO twin `!ws` branch | invite-consume write → `/login?sso=error` | else branch | WIRED | server.js:3026-3033 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| HARD pin suite | `node --test test/hardening.test.mjs` | 11 pass, 0 fail | ✓ PASS |
| SSO twin + HARD-03b pin | `node --test test/oidc-sso.test.mjs` | 0 fail | ✓ PASS |
| i18n gate | `node --test test/error-codes.test.mjs` | 24 pass, 0 fail | ✓ PASS |
| Full baseline | `npm test` | 899 tests, 896 pass, 0 fail, 3 skipped — matches baseline (896 pass / 0 fail / 3 skips; +3 tests from phase 34 pins, none failing) | ✓ PASS |

### Probe Execution

None declared — not a migration/tooling phase. Skipped per contract.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HARD-01 | 33-01 | sameOrigin guard on accept route, guard-first ordering | ✓ SATISFIED | server.js:4606 + pins |
| HARD-02 | 33-02 | Link-only admin invites impossible (creation, accept, stored data) | ✓ SATISFIED | server.js:4500/:4623/:5180 + HARD-02a/b/c pins |
| HARD-03 | 33-02 | firstWorkspace() fallback removed from both twins, one commit, fail-closed | ✓ SATISFIED | server.js:4664/:2994 + commit 4243600 + HARD-03a/b pins |
| HARD-04 | 33-01 | Spoof-proof accept body whitelist pinned | ✓ SATISFIED | server.js:4640 + spoof pins |
| HARD-05 | 33-01 | First-value x-forwarded-* discipline unified + pinned | ✓ SATISFIED | server.js:2573 + pins |

No orphaned requirements — all five mapped to Phase 33 in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | none — 0 TBD/FIXME/TODO/HACK/XXX markers in server.js and test/hardening.test.mjs (grep-verified this run) | — | — |

### Prohibitions (PLAN must_haves)

| Prohibition | Tier | Status |
|-------------|------|--------|
| No 400 on unknown accept-body fields (silent discard, D-06) | test | VERIFIED — spoof pin asserts outcome identity; passes |
| Origin-less non-browser clients keep passing sameOrigin | test | VERIFIED — positive control passes |
| Boot sweep never deletes legacy rows (update only) | test | VERIFIED — server.js:5181 is UPDATE-only; HARD-02c pin passes |
| No success security-log verb for a consumed dead-workspace SSO invite | test | VERIFIED — `sso_invite_accepted` at server.js:3024 is inside the `if (ws)` branch only; HARD-03b pin passes |

### Human Verification Required

None — all truths are behavior-pinned by tests executed in this verifier's own runs.

### Context Decisions Honored (33-CONTEXT.md)

D-01 ✓, D-02 ✓, D-03 ✓, D-04 ✓, D-05 ✓, D-06 ✓, D-07 ✓, D-08 ✓ — all unchanged.

## Gaps Summary

None. Phase 34 changes (notif-prefs work, f0a95a7..5f280a8) were purely additive to server.js and shifted line numbers; no hardening mechanism, protected site, test pin, or locale entry was weakened or removed. Full suite matches baseline with 0 failures.

**Digest note:** `gsd_run` CLI unavailable in this environment; `covered_digest` recomputed as sha256 over the concatenated covered files (same file list as prior report).

---

_Verified: 2026-11-04_
_Verifier: the agent (gsd-verifier)_
