---
phase: 75-domain-admission-core
verified: 2026-11-19T21:28:48Z
status: passed
score: 5/5 must-haves verified
covered_files: [".planning/phases/75-domain-admission-core/75-01-PLAN.md", ".planning/phases/75-domain-admission-core/75-01-SUMMARY.md", ".planning/phases/75-domain-admission-core/75-02-PLAN.md", ".planning/phases/75-domain-admission-core/75-02-SUMMARY.md", "domains.js", "server.js", "mcp.js", "eslint.config.js", "docs/DEPLOY.md", "src/locales/en.json", "src/locales/fr.json", "src/locales/nl.json", "src/locales/de.json", "src/locales/es.json", "test/domain-admission.test.mjs", "test/i18n-core-features.test.mjs"]
covered_digest: "v2:sha256:6744424ba33fca28e41b431de73ce6c44a5294286579f6c3d4c9c447075b01de"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "Human verification item 1 (localized refusal rendering in a real browser) — closed by UAT test 8, pass"
    - "Human verification item 2 (operator deny-all / unset walkthrough) — closed by UAT tests 4/7/10, pass"
  gaps_remaining: []
  regressions: []
human_verification: []
---

# Phase 75: Domain Admission Core Verification Report

**Phase Goal:** Instance operators can restrict who enters through signup and invitations by email domain — with one shared canonicalizing validator, exact-domain matching, and localized refusals — before any SSO surface exists.
**Verified:** 2026-11-19T21:28:48Z
**Status:** passed
**Re-verification:** Yes — after Phases 76/77 modified covered source files (server.js, src/*, locale catalogues)

## Goal Achievement

**The goal holds on the real codebase — re-confirmed against the current tree after Phases 76/77.** All four admission doors (signup DP-1 server.js:6774-6775, invite-create DP-2 server.js:7810-7811, invite-accept DP-3 server.js:7991-8042 covering row / link-only body / session-accept gates, MCP `invite_member` mcp.js:948, plus the Phase 76 SSO doors riding the same lists at server.js:5143 and 5197) compose ONE shared canonicalizing funnel (`domains.js` — `parseDomainList`/`emailDomainRefusal`/`canonicalizeDomain`, boot-frozen `SIGNUP_DOMAINS`/`INVITE_DOMAINS` with `??` inheritance). Phase 77's dead-code deletions and commit 0b660e76 (LOCALE_CODES derived from the shipped locale registry) touched none of the door chains — DP-1/DP-2/DP-3 remain intact and ordered before any write. 32 integration tests booting real servers pass (`node --test test/domain-admission.test.mjs` — 32/32); full workspace suite 1854 pass / 0 fail / 13 skipped; lint exit 0.

**Re-verification regression checks (current tree):**
- DP-1/DP-2/DP-3 gates present and wired (grep evidence above); accept region still references `INVITE_DOMAINS` only — never `SIGNUP_DOMAINS` (DOM-03 one-door-one-rule holds).
- Exact `Set.has` matching intact — `endsWith` appears only in comments and unrelated path/extension code, nowhere in admission paths (DOM-07 holds).
- All 3 refusal keys (`err.signupDomainNotAllowed`, `err.inviteDomainNotAllowed`, `err.inviteDomainNoLonger`) present in all 5 locale catalogues (en/fr/nl/de/es), including post-77 nl/de/es persisted catalogues.
- Commit 0b660e76's LOCALE_CODES change (server.js) is a locale-account gate fix, not an admission door; its regression pin (test/locale-account.test.mjs round-trips all five codes) is green in the full run.
- Phase 76 added the SSO doors and the door-matrix boot log (server.js:8944-8952); they ride the same boot-frozen consts — no drift from the Phase 75 contract.

### Observable Truths (roadmap Success Criteria)

| # | Truth (SC) | Status | Evidence |
|---|------------|--------|----------|
| 1 | SC1 — signup allowlist enforced; out-of-list refused keyed+localized; in-list creates account; unset = fail-open byte-identical | ✓ VERIFIED | DP-1 gate at server.js:6774 between password checks and createUser; tests: signup allow/refuse + unset-fail-open regression row |
| 2 | SC2 — invite-create per-email keyed refusal; unset inherits signup list; explicit set stands alone (may be wider) | ✓ VERIFIED | DP-2 per-email loop at server.js:7803-7811 before db.tx with `{ email }` extra; tests: DP-2 inheritance + standalone `''` deny-all rows |
| 3 | SC3 — invited user from invite-only domain accepts, creates account, logs in; accept path never consults the signup list | ✓ VERIFIED | DP-3 gates use only `INVITE_DOMAINS`; tests: gmail SC3 scenario + accept-path isolation (a.com signup / b.com invites same process) + source invariant asserting the accept region never references the signup const |
| 4 | SC4 — tightened list refuses pending invite fail-closed, row-based email, refusal non-consuming, localized refusal | ✓ VERIFIED | server.js:7991-7993 returns 403 `inviteDomainNoLonger` before any write, no row mutation on the refusal path (D-08: no inviter notification — refusal returns immediately, no email/mention call); tests: reboot-same-DB tighten/loosen harness (row survives, loosening revives) |
| 5 | SC5 — exact canonicalized matching: NFKC/homoglyph-＠, trailing dots, suffix attacks refused, no subdomain wildcards, tri-state env matrix pinned | ✓ VERIFIED | `emailFromEmail` NFKC-before-last-@ split; exact `Set.has` only — `endsWith` appears nowhere in admission paths; tests: 8-row adversarial table incl. `evil-a.com`, `sub.a.com`, fullwidth ＠/FF0E, and 6-cell tri-state matrix + WR-01 malformed-entry regression |

**Score:** 5/5 truths verified (0 present, behavior-unverified)

## Locked Decisions D-01..D-08 — Delivered in Code

| Decision | Claim | Code evidence | Status |
|----------|-------|---------------|--------|
| D-01 | set-empty = deny-all (both vars) | `domains.js:46` — `raw === undefined` returns null (off); any set-but-empty value parses to an empty Set which `??` never overrides; test matrix cells `'a.com/''`, `''/unset` | ✓ VERIFIED |
| D-02 | unset inherits via `??` | `domains.js:67` — `parseDomainList(process.env.ALLOW_INVITE_DOMAINS, ...) ?? SIGNUP_DOMAINS`; test: DP-2 inheritance row | ✓ VERIFIED |
| D-03 | per-email refusal payload | server.js:7811 — `fail(..., { email })` flat extra next to the field; batch loop before `db.tx` → zero rows on refusal (test asserts) | ✓ VERIFIED |
| D-04 | generic copy, no list reveal | All 3 keys' messages contain no domain details; tests assert no allowed-domain reveal and flat `{code,error}` payload | ✓ VERIFIED |
| D-05 | warn-and-clean incl. malformed non-empty entries | `domains.js:50-55` — `DOMAIN_SHAPE` regex rejects `@example.com`, `.example.com`, `example .com` with a console.warn drop; post-WR-01-fix regression test passes | ✓ VERIFIED |
| D-06 | source-tagged boot logs | server.js:8944-8945 — `domains: ALLOW_SIGNUP_DOMAINS: ... (source: own)` / `(source: own\|inherit)` with deny-all/off states; grep-able | ✓ VERIFIED |
| D-07 | non-consuming accept refusal | DP-3 refusal `return fail(res, 403, ...)` before any write; no `update invites set used_at` on the refusal path; tighten/loosen test proves revival | ✓ VERIFIED |
| D-08 | no inviter notification on refusal | Refusal paths return immediately after `fail()`; no email/mention call reachable from the refusal branches; gmail SC3 + tighten tests green | ✓ VERIFIED |

**DOM-03 one-door-one-rule:** the accept route (server.js:7991-8042) references `INVITE_DOMAINS` only; a source-reading invariant test plus the accept-path isolation test (a.com signup list active, b.com invite accepted in the same process) prove the signup list is never consulted there.

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
| `test/domain-admission.test.mjs` | Table-driven adversarial suite | ✓ VERIFIED | 32 tests, all pass (re-run in this re-verification) |
| `docs/DEPLOY.md` | Both vars documented | ✓ VERIFIED | Lines 154-180: dotenv block + tri-state posture paragraph + boot-log + tighten semantics |
| `eslint.config.js` | domains.js registered | ✓ VERIFIED | Node-globals file list updated |

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| server.js signup route | domains.js funnel | `emailDomainRefusal(email, SIGNUP_DOMAINS)` | WIRED | :6774 |
| server.js invite-create | domains.js funnel | `emailDomainRefusal(email, INVITE_DOMAINS, 'inviteDomainNotAllowed', ...)` | WIRED | :7810 |
| server.js accept route (3 gates) | domains.js funnel | row / link-only body / session-accept | WIRED | :7993, :8024, :8042 |
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
| Domain admission suite | `node --test test/domain-admission.test.mjs` | 32/32 pass, 0 fail | ✓ PASS |
| Full workspace suite | `npm test` | 1854 pass / 0 fail / 13 skipped (re-run 2026-11-19; incl. error-codes extraction gate + pinned i18n counts) | ✓ PASS |
| Lint gate | `npm run lint` | exit 0 | ✓ PASS |

## Probe Execution

None declared — no `scripts/*/tests/probe-*.sh` for this phase; the integration suite is the phase's behavioral evidence.

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| domains.js | 53 | `console['warn']` instead of the structured log pipeline (review IN-02) | ℹ️ Info | Deliberate — observable survives log-level plumbing; documented in code |
| server.js | 8944 | Boot-log `source` tag re-derives tri-state instead of module exposing it (review IN-03) | ℹ️ Info | Cosmetic; correct output verified |
| server.js | 6774 | DP-1 runs before email-shape validation so door-on malformed emails report the domain key not `enterValidEmail` (review IN-01) | ℹ️ Info | Errno-key cosmetics only; refusal is still fail-closed |
| server.js (pre-existing) | — | Email normalization inconsistency between storage paths (review WR-02, warning) | ⚠️ Warning | Pre-existing, outside phase scope; does not break any DOM truth (row-email invariant test passes) |

No TODO/FIXME/TBD/XXX debt markers in any phase file. No stubs — every wired surface is fully functional.

### Review disposition note

`75-REVIEW-DISPOSITION.md` records CR-01 and WR-01 **fixed in code** (verified: session-accept gate at server.js:7996-8005; DOMAIN_SHAPE malformed-entry fix at domains.js:40 with a passing regression test) and 4 findings **open** (WR-02, IN-01, IN-02, IN-03 — all cosmetic/pre-existing, none block a must-have). Carrying them forward as informational is acceptable; they are not phase-goal gaps.

## Human Verification Required

None outstanding. Both items reserved at initial verification were closed by UAT (75-UAT.md, status complete):
1. Localized refusal rendering in a real browser — UAT test 8 "Refusal localized in 5 locales": pass.
2. Operator deny-all / unset walkthrough — UAT tests 4 ("Empty list deny-all"), 7 ("Boot logs and warn-and-clean"), 10 ("Invite-door tri-state"): all pass.

## Gaps Summary

None. All 5 roadmap Success Criteria, all 5 in-scope requirements, and all 8 locked decisions are delivered in code and behaviorally proven by 32 passing integration tests plus a green 1867-test workspace suite (1854 pass / 0 fail / 13 skipped) and lint exit 0. The phase goal — operator-restrictable signup and invitation entry by exact canonicalized email domain, one shared validator across all four doors, localized refusals, no SSO surface touched — is achieved. **Status: passed** — both human-verification walkthroughs reserved at initial verification were closed by UAT (75-UAT.md test 8 covers the localized refusal rendering; tests 4/7/10 cover the deny-all / boot-log / unset-parity operator walkthrough), all pass.

---

_Verified: 2026-11-19T14:30:00Z_
_Verifier: the agent (gsd-verifier)_
