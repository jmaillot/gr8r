---
phase: 33-membership-surface-hardening
verified: 2026-11-03T00:00:00Z
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
covered_digest: "v2:sha256:d50e5e0e542242d3079ba59566d077d81e55010241e3d5995509b5298241a83b"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 33: Membership-Surface Hardening Verification Report

**Phase Goal:** The invite-accept surface meets the v1.1 audit discipline: sameOrigin-guarded POST, no admin invites through the link-only path, no `firstWorkspace()` fallback on the accept route and its SSO-reconcile twin (both in one commit), spoof-proof accept body whitelist.
**Verified:** 2026-11-03
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Cross-origin POST to invite-accept rejected by `sameOrigin()` guard, ordered before body read/throttle, pinned by test | ✓ VERIFIED | `server.js:4414-4418` — guard at line 4415 executes before `tooMany()` (4416) and `readJson` (4432). Pins: hardening.test.mjs:32 (hostile-Origin 403, byte-identical no-oracle body), :52 (guard-before-throttle budget probe + Origin-less positive control). Both pass. |
| 2 | Admin-created invite cannot carry admin role via link-only path — enforced server-side, test-pinned; every accept is email-bound | ✓ VERIFIED | Three enforcement points: creation 400 `inviteAdminEmailRequired` before insert (`server.js:4306`), accept-side refusal of email-less admin/owner rows (`server.js:4428`), boot sweep update-only (`server.js:4984`). Pins: hardening.test.mjs:277 (HARD-02a), :301 (HARD-02b), :327 (HARD-02c, row still EXISTS update-only). All pass. |
| 3 | Both twins resolve workspace explicitly or fail closed (410 `workspaceGone`); one commit; protected `firstWorkspace()` sites untouched | ✓ VERIFIED | Accept twin: `server.js:4465-4468` explicit lookup + 410, no fallback. SSO twin: `server.js:2850-2890` explicit lookup, `else` branch consumes the one invite, no membership write, skips address-wide clearing, no `sso_invite_accepted` log, redirects `/login?sso=error`. Both edits in commit `4243600` (verified via `git show --stat`: server.js + both test files). Protected sites present and untouched: `firstWorkspace()` def :594, seed-boot :1716, read path :2235, slug route :4935. Pins: hardening.test.mjs:233 (HARD-03a), oidc-sso.test.mjs HARD-03b pin. Pass. |
| 4 | Spoof payload (role/name smuggling) rejected — body whitelist pinned by test | ✓ VERIFIED | `server.js:4441-4451` structural silent whitelist `{ name, email, password }`; role/teams/scope come only from the invite row (:4470-4490). Pins: hardening.test.mjs:158 (spoof outcome equals clean payload via direct DB reads), :358 (empty `{}` body hits validation path, no crash). Pass. |
| 5 | `sameOrigin()` and proxy-header readers agree on multi-value `x-forwarded-*` first-value discipline, pinned by test | ✓ VERIFIED | Shared `firstForwardedValue()` helper `server.js:2429` consumed by `proto()` :2435, `clientIp()` :2462, `sameOrigin()` :2469. Pins: hardening.test.mjs:89 (multi-value host passes on first value, TRUST_PROXY=true server), :110 (second value never consulted → 403), :133 (single-value regression). Pass. |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server.js` | Guard, helper, whitelist, twins fail-closed, sweep | ✓ VERIFIED | All six HARD edits present in code (see truths) |
| `test/hardening.test.mjs` | HARD-01/02a/b/c/03a/04/05 pins | ✓ VERIFIED | 11 tests, all pass |
| `test/oidc-sso.test.mjs` | HARD-03b twin pin | ✓ VERIFIED | 47 tests pass, incl. deleted-workspace SSO pin landing `/login?sso=error` |
| `src/locales/en.json` | `err.inviteAdminEmailRequired` | ✓ VERIFIED | Line 1605 |
| `src/locales/fr.json` | FR translation | ✓ VERIFIED | Line 1605 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| accept route head | `sameOrigin(req)` | guard first, before throttle/body | WIRED | server.js:4415 precedes :4416/:4432 |
| `firstForwardedValue()` | proto/clientIp/sameOrigin | one definition, three consumers | WIRED | server.js:2429 → :2435, :2462, :2469 |
| creation route role check | 400 before insert | `ROLE_RANK[role] >= ROLE_RANK.admin && emails.length === 0` | WIRED | server.js:4306, before insert loop |
| SSO twin `!ws` branch | invite-consume write → `/login?sso=error` | else branch | WIRED | server.js:2888-2889 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| HARD-01/02/03a/04/05 pin suite | `node --test test/hardening.test.mjs` | 11 pass, 0 fail | ✓ PASS |
| SSO twin + HARD-03b pin | `node --test test/oidc-sso.test.mjs` | 47 pass, 0 fail | ✓ PASS |
| i18n gate (new error code catalogued EN+FR) | `node --test test/error-codes.test.mjs` | 24 pass, 0 fail | ✓ PASS |

### Probe Execution

None declared — not a migration/tooling phase. Skipped per contract.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| HARD-01 | 33-01 | sameOrigin guard on accept route, guard-first ordering | ✓ SATISFIED | server.js:4415 + pins |
| HARD-02 | 33-02 | Link-only admin invites impossible (creation, accept, stored data) | ✓ SATISFIED | server.js:4306/:4428/:4984 + HARD-02a/b/c pins |
| HARD-03 | 33-02 | firstWorkspace() fallback removed from both twins, one commit, fail-closed | ✓ SATISFIED | server.js:4465/:2850 + commit 4243600 + HARD-03a/b pins |
| HARD-04 | 33-01 | Spoof-proof accept body whitelist pinned | ✓ SATISFIED | server.js:4446 + spoof pins |
| HARD-05 | 33-01 | First-value x-forwarded-* discipline unified + pinned | ✓ SATISFIED | server.js:2429 + pins |

All five requirement IDs claimed across the two plans; REQUIREMENTS.md traceability table (lines 98-102) lists all five mapped to Phase 33 — no orphans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | none — no TBD/FIXME/TODO/HACK/stub markers in server.js or test/hardening.test.mjs | — | — |

### Prohibitions (PLAN must_haves)

| Prohibition | Tier | Status |
|-------------|------|--------|
| No 400 on unknown accept-body fields (silent discard, D-06) | test | VERIFIED — spoof pin (:158) asserts outcome identity; a 400 regression would turn it red |
| Origin-less non-browser clients keep passing sameOrigin | test | VERIFIED — positive control in hardening.test.mjs:52 (Origin-less harness client completes a full accept) |
| Boot sweep never deletes legacy rows (update only) | test | VERIFIED — HARD-02c pin (:327) asserts the row still EXISTS with used_at set after reboot on the same dataDir |
| No success security-log verb for a consumed dead-workspace SSO invite | test | VERIFIED — HARD-03b pin asserts no `sso_invite_accepted` row; code at server.js:2881-2890 only logs inside the `if (ws)` branch |

### Human Verification Required

None — all truths are behavior-pinned by tests executed during this verification.

### Context Decisions Honored (33-CONTEXT.md)

- D-01 (two enforcement points) ✓, D-02 (update-only sweep) ✓, D-03 (consume semantics) ✓, D-04 (one generic `/login?sso=error` surface, no new error code) ✓, D-05 (one commit, protected sites untouched) ✓, D-06 (silent whitelist, no 400) ✓, D-07 (first-value helper) ✓, D-08 (guard-first ordering) ✓.

## Gaps Summary

None. All five roadmap success criteria are implemented, wired, and pinned by behavioral tests that pass in this verifier's own runs (hardening 11/11, oidc-sso 47/47, error-codes 24/24). Commit grouping matches the roadmap lock: HARD-01, HARD-05, HARD-04 in three 33-01 commits; both twins in the single commit 4243600; HARD-02 in 155e331.

---

_Verified: 2026-11-03_
_Verifier: the agent (gsd-verifier)_
