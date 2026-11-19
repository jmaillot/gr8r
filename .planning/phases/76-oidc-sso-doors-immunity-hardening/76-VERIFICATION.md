---
phase: 76-oidc-sso-doors-immunity-hardening
verified: 2026-11-19T00:00:00Z
status: passed
score: 9/9 must-haves verified
covered_files:
  - ".planning/phases/76-oidc-sso-doors-immunity-hardening/76-01-PLAN.md"
  - ".planning/phases/76-oidc-sso-doors-immunity-hardening/76-01-SUMMARY.md"
  - ".planning/phases/76-oidc-sso-doors-immunity-hardening/76-02-PLAN.md"
  - ".planning/phases/76-oidc-sso-doors-immunity-hardening/76-02-SUMMARY.md"
  - "docs/DEPLOY.md"
  - "server.js"
  - "test/domain-admission-sso.test.mjs"
  - "test/helpers/oidc-idp.mjs"
  - "test/oidc-sso.test.mjs"
covered_digest: "v2:sha256:87a3b0eae8e2d5363d4e97e1ee1349a1a296ed4ec5d2a695150a7784c492b005"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 76: OIDC/SSO Doors & Immunity Hardening Verification Report

**Phase Goal:** The SSO surface honors the same door matrix — JIT provisioning is gated, SSO invite reconciliation filters refused invites — and existing accounts are provably immune to list changes, with operators able to see the resolved matrix at boot.
**Verified:** 2026-11-19
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Out-of-list SSO email refused JIT provisioning after email_verified gate, fresh-provision arm only, generic `/login?sso=error` redirect (SC1/DOM-06) | ✓ VERIFIED | DP-4 gate at server.js:5134 (`emailDomainRefusal(email, SIGNUP_DOMAINS)`), inside the `!verifiedEmail → return errorRedirect()` else-arm; suite DP-4 section drives the real authorize→callback flow (test/domain-admission-sso.test.mjs) |
| 2 | In-list / wildcard emails provision normally; unset ALLOW_SIGNUP_DOMAINS stays fail-open | ✓ VERIFIED | 18/18 pass on `node --test test/domain-admission-sso.test.mjs`, including in-list provision rows; unset-var fail-open rows in the suite |
| 3 | Out-of-list pending invite filtered BEFORE branching (DP-5): normal `/` redirect, invite not consumed, loosening revives (SC3/DOM-05) | ✓ VERIFIED | server.js:5188 `.filter(invite => emailDomainRefusal(invite.email, INVITE_DOMAINS) === null)` on pendingInvites, branching consumes only filtered array; suite rows "DP-5: loosening the list revives..." (boot 1/2/3 flow: used_at IS NULL after tightened login, auto-accept after loosening) |
| 4 | Boot logs ONE combined 5-door matrix line; D-06 per-var lines unchanged (SC4/D-11) | ✓ VERIFIED | server.js:8943 single logInfo line with signup/invite-create/invite-accept/sso-jit/sso-reconcile; suite D-11 section (line 438-444) asserts the line and per-var source lines |
| 5 | DP-4 refusal log carries domain only, never full email (D-09) | ✓ VERIFIED | server.js:5139 `logInfo(\`sso signup domain refused — domain: ${emailFromEmail(email)}\`)`; suite line 85 asserts the log line format |
| 6 | Every new gate composes emailDomainRefusal — no inline Set.has bypass (T-75-16) | ✓ VERIFIED | grep: no `Set.has` anywhere in server.js; both DP-4 (:5134) and DP-5 (:5188) call the funnel imported at server.js:183 |
| 7 | Three named immunity rows exist and pass (DOM-05/D-12) | ✓ VERIFIED | test/domain-admission-sso.test.mjs:301, 335, 368 — all three names contain 'immunity', all pass |
| 8 | Admission ≠ authentication: tightening never blocks repeat linked-identity logins (SC2) | ✓ VERIFIED | immunity rows 1-2: reboot-same-dataDir with tightened list, login succeeds, no 'sso signup domain refused' in output, no new user row; short-circuit at server.js:5112-5115 |
| 9 | DEPLOY.md documents SSO doors + boot matrix line for operators | ✓ VERIFIED | docs/DEPLOY.md:184-201 — SSO door behavior, linked-identity carve-out, silent reconcile/revival, `domains: door matrix` line listing all five doors |

**Option B amendment note:** immunity row 3 (line 368) pins the AMENDED truth — accept-time re-validation applies to ALL admits, so an existing out-of-list member re-invited under a tightened list gets 403 `inviteDomainNoLonger`, invite NOT consumed (used_at IS NULL count asserted), existing membership and logins untouched. This matches the owner decision in 76-02-SUMMARY / execution notes; the amendment itself is not a gap. The amended truth is what's pinned, with behavioral evidence.

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js DP-4 gate | Fresh-provision arm, after email_verified | ✓ VERIFIED | :5134, comment block DP-4 (Phase 76, DOM-06) |
| server.js DP-5 filter | pendingInvites filter before branching | ✓ VERIFIED | :5188, silent/non-consuming, filters on stored invite.email |
| server.js D-11 matrix line | Combined 5-door boot log | ✓ VERIFIED | :8943 |
| server.js emailFromEmail import | Added to domains.js import block | ✓ VERIFIED | :184, used at :5139 |
| test/helpers/oidc-idp.mjs | Extracted fake IdP harness | ✓ VERIFIED | exists, used by domain-admission-sso suite |
| test/domain-admission-sso.test.mjs | D-12 contract suite, DP-4/DP-5/D-11 + immunity sections | ✓ VERIFIED | 18 tests, all sections present, 18/18 pass |
| docs/DEPLOY.md | SSO doors + matrix doc | ✓ VERIFIED | lines 184-201 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js OIDC callback | domains.js emailDomainRefusal | funnel composition at :5134 | WIRED | import at :183; no reimplement (no Set.has) |
| server.js SSO-07 reconciliation | emailDomainRefusal filter | :5188 filter, branching consumes filtered array only | WIRED | `pendingInvites.length === 1` branches on filtered result |
| test/domain-admission-sso.test.mjs | oidc-idp.mjs → server.js callback | full authorize→callback 302 flow | WIRED | suite drives real HTTP flows (runFlow helpers), passes |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| DP-4 gate | email | OIDC verified claims after token exchange | yes | ✓ FLOWING |
| DP-5 filter | invite.email | invites table SQL row | yes | ✓ FLOWING |
| D-11 line | SIGNUP_DOMAINS / INVITE_DOMAINS | boot-resolved lists via domains.js | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| D-12 contract suite (DP-4/DP-5/D-11 + immunity) | `node --test test/domain-admission-sso.test.mjs` | 18 pass / 0 fail | ✓ PASS |
| OIDC SSO regression suite | `node --test test/oidc-sso.test.mjs` | 47 pass / 0 fail | ✓ PASS |
| Phase 75 domain-admission regression | `node --test test/domain-admission.test.mjs` | 32 pass / 0 fail | ✓ PASS |
| Commits exist | `git cat-file -e` on 4edca91d, 04c578fa, 3fefd070, e42e9c72, b14d4fe7, 80ab89f4 | all 6 present | ✓ PASS |

Full-suite claim (1846 pass / 13 env skips) not independently re-run; the three phase-relevant suites were run directly and are green.

### Probe Execution

None declared — no probe scripts in PLAN files or scripts/*/tests for this phase. SKIPPED (no probes declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| DOM-05 | 76-01, 76-02 | Existing accounts immune: list changes never block logins / re-invites per owner decision | ✓ SATISFIED | Immunity rows 1-3 green; DP-5 filter verbatim DP-3 semantics; DEPLOY.md documents |
| DOM-06 | 76-01 | OIDC JIT creation honors ALLOW_SIGNUP_DOMAINS (fresh-provision only) | ✓ SATISFIED | DP-4 gate at :5134 in fresh-provision arm after email_verified; contract rows green |

No orphaned requirements — REQUIREMENTS.md maps exactly DOM-05, DOM-06 to Phase 76, both claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/placeholder markers in phase-modified files; no locale edits in diff | — | — |

### Human Verification Required

None. Every truth — including the behavior-dependent ones (DP-4 refusal transition, DP-5 silent/non-consuming/revivable invariant, immunity state transitions across reboots) — is exercised by passing behavioral tests in test/domain-admission-sso.test.mjs, which drive the real server over HTTP with reboot-same-DB idiom. No judgment-tier prohibition was left unverified: the five PLAN prohibitions were each checked directly (no Set.has; domain-only log line; exact `/login?sso=error` Location in errorRedirect at :5053-5056; fresh-provision-arm-only gating with immunity rows green; no src/locales changes).

### Prohibitions (must-NOTs)

| Prohibition | Verification | Status |
|-------------|-------------|--------|
| No inline Set.has bypass in DP-4/DP-5 | grep server.js: 0 hits; both compose emailDomainRefusal | ✓ VERIFIED |
| Never log full email on DP-4 refusal | :5139 logs `emailFromEmail(email)` only | ✓ VERIFIED |
| No domain-revealing query param | errorRedirect Location is exactly `/login?sso=error` (:5053-5056); suite asserts 302 | ✓ VERIFIED |
| Never gate already-linked / existing-account link arm | DP-4 lives only in fresh-provision else-arm; immunity rows 1-2 pass | ✓ VERIFIED |
| No catalogue/locale edits | git diff shows no src/locales changes | ✓ VERIFIED |

### Gaps Summary

None. Phase goal achieved: both SSO doors (DP-4 JIT gate, DP-5 reconcile filter) are present, wired, and behaviorally pinned by a passing contract suite; existing-account immunity is provable via three named reboot-same-DB rows (row 3 pins the owner-approved Option B amended truth); the combined five-door matrix boot log exists and is asserted; operator documentation is in DEPLOY.md. All six claimed commits exist. Code review reported 0 critical / 0 warning (2 advisory info items open in 76-REVIEW.md — advisory only, do not block).

---

_Verified: 2026-11-19_
_Verifier: the agent (gsd-verifier)_
