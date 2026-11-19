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
covered_digest: "v2:sha256:62d840928e18379e66b1b3e31e86a57d3416e205c928d6bfb4687116c13c40cf"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 9/9
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 76: OIDC/SSO Doors & Immunity Hardening Verification Report

**Phase Goal:** The SSO surface honors the same door matrix — JIT provisioning is gated, SSO invite reconciliation filters refused invites — and existing accounts are provably immune to list changes, with operators able to see the resolved matrix at boot.
**Verified:** 2026-11-19
**Status:** passed
**Re-verification:** Yes — after phase 77 modified covered source files (server.js dead-code removal, including WEBHOOK_MAX_ATTEMPTS)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence (current tree) |
|---|-------|--------|--------------------------|
| 1 | Out-of-list SSO email refused JIT provisioning after email_verified gate, fresh-provision arm only, generic `/login?sso=error` redirect (SC1/DOM-06) | ✓ VERIFIED | DP-4 gate intact at server.js:5143 (`emailDomainRefusal(email, SIGNUP_DOMAINS)`), inside the `!verifiedEmail → return errorRedirect()` else-arm (comment block DP-4 at :5136); generic redirect at :5064; suite DP-4 section drives the real authorize→callback flow |
| 2 | In-list / wildcard emails provision normally; unset ALLOW_SIGNUP_DOMAINS stays fail-open | ✓ VERIFIED | domain-admission-sso suite green (re-run this verification), including in-list provision rows and unset-var fail-open rows |
| 3 | Out-of-list pending invite filtered BEFORE branching (DP-5): normal `/` redirect, invite not consumed, loosening revives (SC3/DOM-05) | ✓ VERIFIED | server.js:5197 `.filter(invite => emailDomainRefusal(invite.email, INVITE_DOMAINS) === null)` on pendingInvites, `pendingInvites.length === 1` branches on the filtered array only; DP-5 comment block at :5187; suite rows "DP-5: loosening the list revives…" green |
| 4 | Boot logs ONE combined 5-door matrix line; D-06 per-var lines unchanged (SC4/D-11) | ✓ VERIFIED | server.js:8952 single combined `domains: door matrix` line with signup/invite-create/invite-accept/sso-jit/sso-reconcile; D-11 suite section (test/domain-admission-sso.test.mjs:438-512) green |
| 5 | DP-4 refusal log carries domain only, never full email (D-09) | ✓ VERIFIED | server.js:5148 `logInfo(\`sso signup domain refused — domain: ${emailFromEmail(email)}\`)`; emailFromEmail import at :184; suite asserts the log format |
| 6 | Every new gate composes emailDomainRefusal — no inline Set.has bypass (T-75-16) | ✓ VERIFIED | grep: 0 `Set.has` hits in server.js; DP-4 (:5143) and DP-5 (:5197) plus all Phase 75 doors (:6774, :7810, :7992, :8023, :8041) compose the funnel |
| 7 | Three named immunity rows exist and pass (DOM-05/D-12) | ✓ VERIFIED | test/domain-admission-sso.test.mjs:301, 335, 368 — all three 'immunity' rows pass in the re-run |
| 8 | Admission ≠ authentication: tightening never blocks repeat linked-identity logins (SC2) | ✓ VERIFIED | immunity rows 1-2 green; short-circuit for established (issuer, subject) identity at server.js:5122-5125 precedes all doors |
| 9 | DEPLOY.md documents SSO doors + boot matrix line for operators | ✓ VERIFIED | docs/DEPLOY.md SSO door section intact (unchanged by phase 77) |

**Option B amendment note (carried from initial verification):** immunity row 3 (:368) pins the AMENDED truth — accept-time re-validation applies to ALL admits; an existing out-of-list member re-invited under a tightened list gets 403 `inviteDomainNoLonger`, invite NOT consumed, membership and logins untouched. Owner-approved amendment, not a gap.

**Score:** 9/9 truths verified (0 present, behavior-unverified)

### Phase-77 Interaction Check

Phase 77 deleted dead code in server.js (including WEBHOOK_MAX_ATTEMPTS). Verified this did not touch any phase-76 artifact:

| Artifact | Previous line | Current line | Intact? |
|----------|--------------|--------------|---------|
| DP-4 comment + gate | :5134 | :5136 / :5143 | ✓ |
| DP-4 refusal log (D-09) | :5139 | :5148 | ✓ |
| DP-5 filter | :5188 | :5197 | ✓ |
| D-11 combined matrix line | :8943 | :8952 | ✓ |
| emailDomainRefusal import | :183 | :183 | ✓ |
| Generic sso=error redirect | :5053 | :5064 | ✓ |

WEBHOOK_MAX_ATTEMPTS: 0 references remain in server.js (dead-code removal complete, no dangling dependency on phase-76 code).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| server.js DP-4 gate | Fresh-provision arm, after email_verified | ✓ VERIFIED | :5136-5152 |
| server.js DP-5 filter | pendingInvites filter before branching | ✓ VERIFIED | :5187-5197, silent/non-consuming |
| server.js D-11 matrix line | Combined 5-door boot log | ✓ VERIFIED | :8952 |
| server.js emailFromEmail import | domains.js import block | ✓ VERIFIED | :184, used at :5148 |
| test/helpers/oidc-idp.mjs | Fake IdP harness | ✓ VERIFIED | used by domain-admission-sso suite |
| test/domain-admission-sso.test.mjs | D-12 contract suite | ✓ VERIFIED | all sections present, green in re-run |
| docs/DEPLOY.md | SSO doors + matrix doc | ✓ VERIFIED | intact |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js OIDC callback | domains.js emailDomainRefusal | :5143 funnel composition | WIRED | import :183; no inline Set.has bypass |
| server.js SSO-07 reconciliation | emailDomainRefusal filter | :5197 filter; branching consumes filtered array | WIRED | silent per D-10 |
| test/domain-admission-sso.test.mjs | oidc-idp.mjs → server.js callback | real authorize→callback 302 flow | WIRED | green in re-run |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| DP-4 gate | email | OIDC verified claims after token exchange | yes | ✓ FLOWING |
| DP-5 filter | invite.email | invites table SQL row | yes | ✓ FLOWING |
| D-11 line | SIGNUP_DOMAINS / INVITE_DOMAINS | boot-resolved lists via domains.js | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase-relevant targeted suites | `node --test test/domain-admission-sso.test.mjs test/oidc-sso.test.mjs test/domain-admission.test.mjs` | 97 pass / 0 fail | ✓ PASS |
| Full workspace suite | `npm test` | 1854 pass / 0 fail / 13 env skips (exit 0) | ✓ PASS |
| Lint gate | `npm run lint` | exit 0, no findings | ✓ PASS |

### Probe Execution

None declared — no probe scripts in PLAN files or scripts/*/tests for this phase. SKIPPED (no probes declared).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| DOM-05 | 76-01, 76-02 | Existing accounts immune: list changes never block logins / re-invites per owner decision | ✓ SATISFIED | Immunity rows 1-3 green; DP-5 filter verbatim DP-3 semantics; DEPLOY.md intact |
| DOM-06 | 76-01 | OIDC JIT creation honors ALLOW_SIGNUP_DOMAINS (fresh-provision only) | ✓ SATISFIED | DP-4 gate at :5143 in fresh-provision arm after email_verified; contract rows green |

No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (none) | — | No TBD/FIXME/XXX/placeholder markers in phase-modified files; no Set.has bypass; no locale edits | — | — |

**Note on a transient environmental issue during re-verification:** the first `npm test` run reported 8 failures, all traced to an uncommitted leftover i18n-scan fixture line (`export const probe = 'A literal that was never extracted';`) in `src/views/table.js` — contamination from a crashed earlier test run, not production code and not a phase-76 or phase-77 regression. The line was reverted via `git checkout` (restoring committed state); the subsequent full run was 1854/1854 green. `test/inbox-burst.test.mjs` and `test/workspace-logo.test.mjs` also pass in isolation, confirming the rest were pollution effects.

### Human Verification Required

None. Every truth — including the behavior-dependent ones (DP-4 refusal transition, DP-5 silent/non-consuming/revivable invariant, immunity state transitions across reboots) — is exercised by passing behavioral tests in test/domain-admission-sso.test.mjs. All five PLAN prohibitions re-checked directly against the current tree (no Set.has; domain-only log line; exact `/login?sso=error` Location at :5064; fresh-provision-arm-only gating; no src/locales changes).

### Prohibitions (must-NOTs)

| Prohibition | Verification | Status |
|-------------|-------------|--------|
| No inline Set.has bypass in DP-4/DP-5 | grep server.js: 0 hits; both compose emailDomainRefusal | ✓ VERIFIED |
| Never log full email on DP-4 refusal | :5148 logs `emailFromEmail(email)` only | ✓ VERIFIED |
| No domain-revealing query param | errorRedirect Location is exactly `/login?sso=error` (:5064) | ✓ VERIFIED |
| Never gate already-linked / existing-account link arm | DP-4 lives only in fresh-provision else-arm; immunity rows 1-2 pass | ✓ VERIFIED |
| No catalogue/locale edits | git status: no src/locales changes | ✓ VERIFIED |

### Gaps Summary

None. Phase goal achieved in the current tree: both SSO doors (DP-4 JIT gate :5143, DP-5 reconcile filter :5197) survived phase 77's dead-code removal intact (line numbers shifted only), immunity rows are green, the combined five-door matrix boot log (:8952) is asserted, and operator documentation is intact. All gates re-run green: lint 0 findings, full suite 1854 pass / 0 fail / 13 env skips, targeted phase suites 97/97.

---

_Verified: 2026-11-19_
_Verifier: the agent (gsd-verifier)_
