---
phase: 80-group-mapping-core-parser-resolver-overage-detection
verified: 2026-11-20T12:05:00Z
status: passed
score: 11/11 must-haves verified
covered_files:
  - .planning/phases/80-group-mapping-core-parser-resolver-overage-detection/80-01-PLAN.md
  - .planning/phases/80-group-mapping-core-parser-resolver-overage-detection/80-01-SUMMARY.md
  - .planning/phases/80-group-mapping-core-parser-resolver-overage-detection/80-02-PLAN.md
  - .planning/phases/80-group-mapping-core-parser-resolver-overage-detection/80-02-SUMMARY.md
  - groups.js
  - server.js
  - db-adapter.mjs
  - Dockerfile
  - src/locales/en.json
  - src/locales/fr.json
  - src/locales/nl.json
  - src/locales/de.json
  - src/locales/es.json
  - test/groups-core.test.mjs
  - test/groups-config-api.test.mjs
  - test/db-adapter.test.mjs
  - test/dependencies.test.mjs
covered_digest: "v2:sha256:3810a091d12e2d689036d47b934dfffe2d8100c56c07a19365e5783a195ba8de"
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred:
  - truth: "GM-01 editor UI half — mappings edited in-app from the /governance page"
    addressed_in: "Phase 83"
    evidence: "REQUIREMENTS.md GM-01: 'the editor UI lands in Phase 83' (Owner decision 2026-11-20); storage+validation half explicitly shipped in Phase 80"
  - truth: "GM-02 login wiring — verifyIdToken() claims actually passed into resolveGroupsClaim/resolve at callback time"
    addressed_in: "Phase 81"
    evidence: "Phase goal: 'inert server module — nothing about login behavior changes yet'; groups.js header pins the Phase-81 contract; SUMMARY affects: phase-81-callback-wiring"
---

# Phase 80: Group Mapping Core / Parser / Resolver / Overage Detection Verification Report

**Phase Goal:** The mapping configuration and claim-ingestion primitives exist as a fully-tested, inert server module — nothing about login behavior changes yet.
**Verified:** 2026-11-20
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

The goal's two clauses both hold: (a) primitives exist and are fully tested — groups.js, the dual-mirror group_mappings DDL, the save route, boot warnings, and 2000-test green suite; (b) inert — server.js imports groups.js only for the save route (an operator-gated config path, not login); the login callback does NOT consume resolveGroupsClaim/resolve (wired in Phase 81 by design).

### Observable Truths

| # | Truth (source) | Status | Evidence |
|---|----------------|--------|----------|
| 1 | resolveGroupsClaim returns a DISTINCT outcome for each of the four claim shapes; overage never collapses to `[]` (80-01) | ✓ VERIFIED | groups.js:85-103 implements the discriminated shape; test/groups-core.test.mjs pins all four fixtures + hasgroups + non-array/shape (run: 60 tests, 59 pass, 1 pg-skip) |
| 2 | resolve() yields highest-role-wins grants and operatorFlag tri-state, never throws (80-01) | ✓ VERIFIED | groups.js:122-154; tests "member+admin → admin", "owner wins", "operator row → true / unmatched → null", "never throws" all green |
| 3 | GUID paste variants canonicalize to one lowercase-hyphenated key (80-01) | ✓ VERIFIED | groups.js:34-47 (brace strip, lowercase, 32-hex re-hyphenation); unit tests green |
| 4 | group_mappings exists in BOTH mirrors, non-cascading workspace ref, 3-token role CHECK (80-01) | ✓ VERIFIED | server.js:616-627 and db-adapter.mjs:385-397 DDL verbatim-identical (both read); workspace_id has no FK and no cascade; mirror test green |
| 5 | groups.js is a pure server-only module (no process.env, DB injected, zero-boot importable) (80-01) | ✓ VERIFIED | groups.js read: no process.env, no db import; unit suite imports it directly with no server boot |
| 6 | Malformed GUID / unknown workspace / bad role / duplicate → keyed 400, nothing stored (80-02) | ✓ VERIFIED | server.js:7133-7182 (validate-everything-then-single-INSERT); integration tests pin each refusal + zero-rows-after, green |
| 7 | Non-operator/unauthenticated caller cannot distinguish bad-guid from bad-workspace (80-02) | ✓ VERIFIED | server.js:7134-7140 gate order (sameOrigin → requireUser → isInstanceAdmin) precedes all target lookup; integration no-oracle tests green |
| 8 | Deleting a mapped workspace leaves the row and boot logs a dead-mapping warning (80-02) | ✓ VERIFIED | server.js:9403-9407 boot block; integration dead-mapping survival + reboot-warning test green |
| 9 | Zero mappings → one `group mappings: off` line, byte-identical behavior (80-02) | ✓ VERIFIED | server.js:9405; full npm test (2000 tests, 0 fail, 13 pg-skips) green with empty config |
| 10 | Every refusal code has err.<code> in all 5 locales (80-02) | ✓ VERIFIED | 4 keys × 5 locale files = 20 grep hits; locale parity + error-codes reverse-parity tests green |
| 11 | Dockerfile copies groups.js; dependencies.test.mjs COPY array includes it (80-02) | ✓ VERIFIED | Dockerfile:22-23; test/dependencies.test.mjs:100-104 exact-array with Phase-80 comment; test green |

**Score:** 11/11 truths verified (0 present-behavior-unverified)

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | GM-01 editor UI half (in-app mapping editor, D-82-6 console section) | Phase 83 | REQUIREMENTS.md GM-01 note; 80-02 SUMMARY Next-Phase Readiness |
| 2 | GM-02 login-time claim wiring (callback consumes resolveGroupsClaim/resolve) | Phase 81 | Phase goal explicitly inert; contract fixed and pinned in 80-01 |

Both deferrals are declared in REQUIREMENTS.md/ROADMAP scope, not silent gaps.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `groups.js` | Pure server-only core: canonicalization, refusal funnel, 4-outcome detector, D-82-1 resolver | ✓ VERIFIED | 154 lines, substantive, wired (imported by server.js for the save route) |
| `test/groups-core.test.mjs` | Zero-boot unit suite (four fixtures, canonicalization, resolver) | ✓ VERIFIED | 21 tests pass; imports groups.js directly |
| `test/groups-config-api.test.mjs` | Integration suite: gate order, no-oracle, refusals, survival, boot lines | ✓ VERIFIED | 8 tests pass |
| server.js save route + boot block | Operator-gated route, dead-mapping warning | ✓ VERIFIED | server.js:7133-7182, 9403-9407 |
| group_mappings DDL in both mirrors | Identical, non-cascading, 3-token CHECK, kind column | ✓ VERIFIED | server.js:616-627 ≡ db-adapter.mjs:385-397 |
| 5 locale files | 4 err.groupMapping* keys each | ✓ VERIFIED | 20 hits across en/fr/nl/de/es |
| Dockerfile + dependencies contract | groups.js shipped and pinned | ✓ VERIFIED | Dockerfile:22-23; test/dependencies.test.mjs array |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| save route (server.js:7146-7155) | groups.js validators | guidRefusal/roleTokenRefusal with explicit codes | ✓ WIRED | call-site literals keep reverse-parity green |
| save route | workspaces/group_mappings DB | db.get pre-checks + INSERT | ✓ WIRED | server.js:7152-7174 |
| server.js SCHEMA ↔ db-adapter.mjs SQLITE_SCHEMA | mirror test | deep-equal modulo comments | ✓ WIRED | test/db-adapter.test.mjs green |
| groups.js runtime | Dockerfile COPY + deps test array | both sides changed together | ✓ WIRED | test green |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Core + config-API + adapter suites | `node --test test/groups-core.test.mjs test/groups-config-api.test.mjs test/db-adapter.test.mjs` | 60 tests, 59 pass, 0 fail, 1 pg-skip | ✓ PASS |
| Full inert suite | `npm test` | 2000 tests, 1987 pass, 0 fail, 13 pg-skips | ✓ PASS |
| Locale keys | `grep -c groupMapping src/locales/*.json` | 20 total (4×5) | ✓ PASS |
| DDL mirrors | grep both schema files | identical DDL in server.js:616 & db-adapter.mjs:385 | ✓ PASS |

### Probe Execution

None declared — no probe-*.sh in the phase plans.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GM-01 | 80-02 | Operator-managed mapping config with keyed validation refusals | ✓ SATISFIED (storage/validation half; editor UI deferred to 83 per REQUIREMENTS) | save route + 5-locale refusals + tests |
| GM-02 | 80-01, 80-02 | groups claim read; `_claim_names` overage → unmapped, never empty list | ✓ SATISFIED (parser/resolver complete; login wiring deferred to 81 per phase goal) | resolveGroupsClaim + fixtures |
| GM-03 | 80-01, 80-02 | Config keys validated at boot; dead mappings warned, labels display-only | ✓ SATISFIED | DDL CHECK + boot block (server.js:9403-9407) + label opaque comment |

All three requirement IDs accounted for; no orphaned requirements.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/placeholder markers in phase-modified files; no stub returns in groups.js or the route.

### Human Verification Required

None. All behavior-dependent truths (no-oracle gate, dead-mapping survival, boot lines, four-outcome contract) are exercised by passing integration/unit tests — no runtime invariant is left unexercised.

### Gaps Summary

None. The SUMMARY claims cross-check cleanly against the code: every claimed artifact exists, is substantive, and is wired; the full suite is green. The phase goal's "inert" clause is honest — the login callback does not yet consume the resolver, exactly as scoped for Phase 81.

---

_Verified: 2026-11-20T12:05:00Z_
_Verifier: the agent (gsd-verifier)_
