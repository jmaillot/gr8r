---
phase: 75-domain-admission-core
verified: 2026-11-19T14:30:00Z
status: human_needed
score: 5/5 must-haves verified
covered_files: [".planning/phases/75-domain-admission-core/75-01-PLAN.md", ".planning/phases/75-domain-admission-core/75-01-SUMMARY.md", ".planning/phases/75-domain-admission-core/75-02-PLAN.md", ".planning/phases/75-domain-admission-core/75-02-SUMMARY.md", "domains.js", "server.js", "mcp.js", "eslint.config.js", "docs/DEPLOY.md", "src/locales/en.json", "src/locales/fr.json", "src/locales/nl.json", "src/locales/de.json", "src/locales/es.json", "test/domain-admission.test.mjs", "test/i18n-core-features.test.mjs"]
covered_digest: "v2:sha256:097d2ee57f61c40f5b916809880f7ddba6898e4791a80dc69466076325483198"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Set ALLOW_SIGNUP_DOMAINS=a.com on a dev instance, restart, and attempt signup from a non-a.com email with the browser locale set to fr (or nl/de/es)."
    expected: "Signup refused with the localized French 'err.signupDomainNotAllowed' copy rendered inline in the form — not the EN fallback."
    why_human: "The client-side localized rendering of the err.<code> key in a real browser is not exercised by the integration suite (which asserts keyed server refusals); only a human in a browser can confirm the end-to-end locale path."
  - test: "Operator walkthrough: set ALLOW_INVITE_DOMAINS='' (deny-all), restart, confirm the boot log line reads 'domains: ALLOW_INVITE_DOMAINS:  (source: own)' / deny-all, then invite any email from the admin UI and confirm refusal; unset both vars and confirm signup/invite behavior is byte-identical to pre-phase."
    expected: "deny-all posture honored on the invite doors; unset posture is fail-open with no observable change."
    why_human: "The tri-state matrix is integration-tested, but the operator-facing restart + boot-log reading + unset-parity walkthrough is a live-instance workflow a suite does not certify."
---

# Phase 75: Domain Admission Core Verification Report

**Phase Goal:** Instance operators can restrict who enters through signup and invitations by email domain — with one shared canonicalizing validator, exact-domain matching, and localized refusals — before any SSO surface exists.
**Verified:** 2026-11-19T14:30:00Z
**Status:** human_needed (goal achieved; 2 operator/UX walkthroughs reserved for human)
**Re-verification:** No — initial verification

## Goal Achievement

**The goal holds on the real codebase.** All four admission doors (signup DP-1 server.js:6737, invite-create DP-2 server.js:7773, invite-accept DP-3 server.js:7951-8005 including the post-review session-accept gate, MCP `invite_member` mcp.js:948) compose ONE shared canonicalizing funnel (`domains.js` — `parseDomainList`/`emailDomainRefusal`/`canonicalizeDomain`, boot-frozen `SIGNUP_DOMAINS`/`INVITE_DOMAINS` with `??` inheritance). 28 integration tests booting real servers pass (`node --test test/domain-admission.test.mjs` — 28/28); full workspace suite 1824 pass / 0 fail / 13 skipped.

### Observable Truths (roadmap Success Criteria)

| # | Truth (SC) | Status | Evidence |
|---|------------|--------|----------|
| 1 | SC1 — signup allowlist enforced; out-of-list refused keyed+localized; in-list creates account; unset = fail-open byte-identical | ✓ VERIFIED | DP-1 gate at server.js:6737 between passwordTooWeak and createUser; tests: signup allow/refuse + unset-fail-open regression row |
| 2 | SC2 — invite-create per-email keyed refusal; unset inherits signup list; explicit set stands alone (may be wider) | ✓ VERIFIED | DP-2 per-email loop at server.js:7766-7775 before db.tx with `{ email }` extra; tests: DP-2 inheritance + standalone `''` deny-all rows |
| 3 | SC3 — invited user from invite-only domain accepts, creates account, logs in; accept path never consults the signup list | ✓ VERIFIED | DP-3 gates use only `INVITE_DOMAINS`; tests: gmail SC3 scenario + accept-path isolation (a.com signup / b.com invites same process) + source invariant asserting the accept region never references the signup const |
| 4 | SC4 — tightened list refuses pending invite fail-closed, row-based email, refusal non-consuming, localized refusal | ✓ VERIFIED | server.js:7954-7956 returns 403 `inviteDomainNoLonger` before any write, no row mutation on the refusal path (D-08: no inviter notification — refusal returns immediately, no email/mention call); tests: reboot-same-DB tighten/loosen harness (row survives, loosening revives) |
| 5 | SC5 — exact canonicalized matching: NFKC/homoglyph-＠, trailing dots, suffix attacks refused, no subdomain wildcards, tri-state env matrix pinned | ✓ VERIFIED | `emailFromEmail` NFKC-before-last-@ split; exact `Set.has` only — `endsWith` appears nowhere in admission paths; tests: 8-row adversarial table incl. `evil-a.com`, `sub.a.com`, fullwidth ＠/FF0E, and 6-cell tri-state matrix + WR-01 malformed-entry regression |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

## Locked Decisions D-01..D-08 — Delivered in Code

| Decision | Claim | Code evidence | Status |
|----------|-------|---------------|--------|
| D-01 | set-empty = deny-all (both vars) | `domains.js:46` — `raw === undefined` returns null (off); any set-but-empty value parses to an empty Set which `??` never overrides; test matrix cells `'a.com/''`, `''/unset` | ✓ VERIFIED |
| D-02 | unset inherits via `??` | `domains.js:67` — `parseDomainList(process.env.ALLOW_INVITE_DOMAINS, ...) ?? SIGNUP_DOMAINS`; test: DP-2 inheritance row | ✓ VERIFIED |
| D-03 | per-email refusal payload | server.js:7774 — `fail(..., { email })` flat extra next to the field; batch loop before `db.tx` → zero rows on refusal (test asserts) | ✓ VERIFIED |
| D-04 | generic copy, no list reveal | All 3 keys' messages contain no domain details; tests assert no allowed-domain reveal and flat `{code,error}` payload | ✓ VERIFIED |
| D-05 | warn-and-clean incl. malformed non-empty entries | `domains.js:50-55` — `DOMAIN_SHAPE` regex rejects `@example.com`, `.example.com`, `example .com` with a console.warn drop; post-WR-01-fix regression test passes | ✓ VERIFIED |
| D-06 | source-tagged boot logs | server.js:8906-8908 — `domains: ALLOW_SIGNUP_DOMAINS: ... (source: own)` / `(source: own\|inherit)` with deny-all/off states; grep-able | ✓ VERIFIED |
| D-07 | non-consuming accept refusal | DP-3 refusal `return fail(res, 403, ...)` before any write; no `update invites set used_at` on the refusal path; tighten/loosen test proves revival | ✓ VERIFIED |
| D-08 | no inviter notification on refusal | Refusal paths return immediately after `fail()`; no email/mention call reachable from the refusal branches; gmail SC3 + tighten tests green | ✓ VERIFIED |

**DOM-03 one-door-one-rule:** the accept route (server.js:7947-8005) references `INVITE_DOMAINS` only; a source-reading invariant test plus the accept-path isolation test (a.com signup list active, b.com invite accepted in the same process) prove the signup list is never consulted there.

## Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| DOM-01 | ✓ SATISFIED | DP-1 gate + tri-state resolver; unset fail-open regression test |
| DOM-02 | ✓ SATISFIED | DP-2 gate + `??` inheritance + standalone-set test rows |
| DOM-03 | ✓ SATISFIED | gmail SC3 + accept-isolation + source-invariant tests |
| DOM-04 | ✓ SATISFIED | DP-3 fail-closed re-derivation, non-consuming, 3 keyed refusal surfaces (row / link-only body / session-accept), 5-locale `inviteDomainNoLonger` |
| DOM-07 | ✓ SATISFIED | Exact Set.has, NFKC pipeline, adversarial table suite, D-06 boot logs. (Boot logs the per-var resolved lists, not the full door matrix — the door-matrix log is explicitly Phase 76 SC4.) |
| DOM-05/06 | n/a — Phase 76 | Correctly absent (no OIDC/SSO/immunity changes made) |

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `domains.js` | Shared canonicalizing funnel + boot-frozen consts | ✓ VERIFIED | Substantive (78 lines), imported by server.js:181-183 and mcp.js:41; single `split('@')`/`lastIndexOf('@')` call site |
| `server.js` doors | DP-1/DP-2/DP-3 wired | ✓ VERIFIED | All three gates present, ordered correctly (before writes/createUser), guard chains untouched |
| `mcp.js` | MCP invite_member fourth door | ✓ VERIFIED | Gate at :948 after shape check, before roster check/insert; same funnel + same Set objects |
| `src/locales/*.json` ×5 | 3 keys per locale | ✓ VERIFIED | `err.signupDomainNotAllowed`, `err.inviteDomainNotAllowed`, `err.inviteDomainNoLonger` present with real translations in en/fr/nl/de/es (verified by grep, lines ~339-342) |
| `test/domain-admission.test.mjs` | Table-driven adversarial suite | ✓ VERIFIED | 28 tests, all pass (run in this verification) |
| `docs/DEPLOY.md` | Both vars documented | ✓ VERIFIED | Lines 154-180: dotenv block + tri-state posture paragraph + boot-log + tighten semantics |
| `eslint.config.js` | domains.js registered | ✓ VERIFIED | Node-globals file list updated |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js signup route | domains.js funnel | `emailDomainRefusal(email, SIGNUP_DOMAINS)` | WIRED | :6737 |
| server.js invite-create | domains.js funnel | `emailDomainRefusal(email, INVITE_DOMAINS, 'inviteDomainNotAllowed', ...)` | WIRED | :7773 |
| server.js accept route (3 gates) | domains.js funnel | row / link-only body / session-accept | WIRED | :7955, :7986, :8004 |
| mcp.js invite_member | domains.js funnel | `emailDomainRefusal(email, INVITE_DOMAINS, ...)` | WIRED | :948-949 |
| fail() emissions | locale catalogues | `err.<code>` keys | WIRED | 3 keys × 5 locales + error-codes extraction gate + pinned i18n count tests |

## Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| domains.js | SIGNUP_DOMAINS / INVITE_DOMAINS | `process.env` at module load, strict `undefined` check | Yes | ✓ FLOWING |
| DP-1..DP-3 refusals | `domainRefusal.message` | Funnel output derived from the email under test | Yes | ✓ FLOWING |

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Domain admission suite | `node --test test/domain-admission.test.mjs` | 28/28 pass, 0 fail | ✓ PASS |
| Full workspace suite | `npm test` | 1824 pass / 0 fail / 13 skipped (incl. error-codes extraction gate + pinned i18n count 1949) | ✓ PASS |

## Probe Execution

None declared — no `scripts/*/tests/probe-*.sh` for this phase; the integration suite is the phase's behavioral evidence.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| domains.js | 53 | `console['warn']` instead of the structured log pipeline (review IN-02) | ℹ️ Info | Deliberate — observable survives log-level plumbing; documented in code |
| server.js | 8907 | Boot-log `source` tag re-derives tri-state instead of module exposing it (review IN-03) | ℹ️ Info | Cosmetic; correct output verified |
| server.js | 6737 | DP-1 runs before email-shape validation so door-on malformed emails report the domain key not `enterValidEmail` (review IN-01) | ℹ️ Info | Errno-key cosmetics only; refusal is still fail-closed |
| server.js (pre-existing) | — | Email normalization inconsistency between storage paths (review WR-02, warning) | ⚠️ Warning | Pre-existing, outside phase scope; does not break any DOM truth (row-email invariant test passes) |

No TODO/FIXME/TBD/XXX debt markers in any phase file. No stubs — every wired surface is fully functional.

### Review disposition note

`75-REVIEW-DISPOSITION.md` records CR-01 and WR-01 **fixed in code** (verified: session-accept gate at server.js:7996-8005; DOMAIN_SHAPE malformed-entry fix at domains.js:40 with a passing regression test) and 4 findings **open** (WR-02, IN-01, IN-02, IN-03 — all cosmetic/pre-existing, none block a must-have). Carrying them forward as informational is acceptable; they are not phase-goal gaps.

## Human Verification Required

### 1. Localized refusal rendering in a real browser

**Test:** Set `ALLOW_SIGNUP_DOMAINS=a.com`, restart, attempt signup with a non-a.com email under a non-EN browser locale.
**Expected:** The localized refusal copy (e.g. French) rendered inline, not the EN fallback.
**Why human:** Client-side err.<code> → locale rendering is not exercised by the integration suite.

### 2. Operator deny-all / unset walkthrough

**Test:** Set `ALLOW_INVITE_DOMAINS=''`, restart, read the boot log line, attempt an invite; then unset both vars and confirm pre-phase behavior.
**Expected:** deny-all posture on invite doors; unset = byte-identical fail-open behavior.
**Why human:** Live restart + log reading + parity judgment is an operator workflow.

## Gaps Summary

None. All 5 roadmap Success Criteria, all 5 in-scope requirements, and all 8 locked decisions are delivered in code and behaviorally proven by 28 passing integration tests plus a green 1837-test workspace suite. The phase goal — operator-restrictable signup and invitation entry by exact canonicalized email domain, one shared validator across all four doors, localized refusals, no SSO surface touched — is achieved. Status is `human_needed` solely to reserve the two operator/UX walkthroughs above.

---

_Verified: 2026-11-19T14:30:00Z_
_Verifier: the agent (gsd-verifier)_
