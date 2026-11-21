---
phase: 80-group-mapping-core-parser-resolver-overage-detection
verified: 2026-11-21T00:00:00Z
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
covered_digest: "v2:sha256:9e9f0248b276780c500249f96724d7a0998d02e24cfc0edcab899ad90a4ae8f5"
behavior_unverified: 0
overrides_applied: 0
gaps: []
deferred:
  - truth: "GM-01 editor UI half — mappings edited in-app from the /governance page"
    addressed_in: "Phase 83"
    evidence: "REQUIREMENTS.md GM-01: 'the editor UI lands in Phase 83' (Owner decision 2026-11-20); storage+validation half shipped in Phase 80 — CONFIRMED LANDED in current tree (governance dead-mapping card, 83-02 commits)"
  - truth: "GM-02 login wiring — verifyIdToken() claims passed into resolveGroupsClaim/resolve at callback time"
    addressed_in: "Phase 81"
    evidence: "Phase 80 goal was explicitly inert; wiring contract pinned in groups.js header — CONFIRMED LANDED in current tree (server.js:5359 callback reconcile pass, Phase 81/82 markers)"
re_verification:
  previous_status: passed
  previous_score: 11/11
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 80: Group Mapping Core / Parser / Resolver / Overage Detection — Verification Report (Stale-Refresh)

**Phase Goal:** The mapping configuration and claim-ingestion primitives exist as a fully-tested, inert server module — nothing about login behavior changes yet.
**Verified:** 2026-11-21 (stale-verification refresh #4682 after post-ship quick-task commits)
**Status:** passed
**Re-verification:** Yes — digest refresh; prior report 2026-11-20T12:05:00Z, status passed 11/11

## Why Refreshed

Post-ship commits touched covered source files after the prior verification:
- `6ab89e63` / `6b4aa830` — operator super-access gate (server.js)
- `18b75806` — me() crash fix + Super-Admin rename (client + server.js)
- `39d69094` — SUPER_ACCESS env docs (server.js boot, .env.example, DEPLOY.md)

All later-phase work (Phases 81–84) also landed in server.js since the prior run. Every Phase-80 claim below was re-validated against the CURRENT tree — not carried forward.

## Goal Achievement

Both goal clauses hold in the current tree: (a) primitives exist, substantive, and fully tested; (b) the Phase-80 surfaces are unchanged in shape — save route, boot block, DDL, locales, Docker contract all verbatim. Post-ship callback wiring (Phase 81/82) is legitimate later-phase work, not a regression of the "inert at Phase 80" clause; both deferred items are confirmed landed.

### Observable Truths (re-validated against current tree)

| # | Truth (source) | Status | Current evidence |
|---|----------------|--------|------------------|
| 1 | resolveGroupsClaim returns a DISTINCT outcome for each of the four claim shapes; overage never collapses to `[]` (80-01) | ✓ VERIFIED | groups.js:85-103 intact (154 lines, unchanged shape); test/groups-core.test.mjs green |
| 2 | resolve() yields highest-role-wins grants and operatorFlag tri-state, never throws (80-01) | ✓ VERIFIED | groups.js:122-154 intact; unit tests green |
| 3 | GUID paste variants canonicalize to one lowercase-hyphenated key (80-01) | ✓ VERIFIED | groups.js:34-47 intact; unit tests green |
| 4 | group_mappings exists in BOTH mirrors, non-cascading workspace ref, 3-token role CHECK (80-01) | ✓ VERIFIED | server.js:645-657 ≡ db-adapter.mjs:387-398 verbatim-identical; mirror test green |
| 5 | groups.js is a pure server-only module (no process.env, DB injected, zero-boot importable) | ✓ VERIFIED | no TODO/FIXME/XXX markers; unit suite imports it directly, no server boot |
| 6 | Malformed GUID / unknown workspace / bad role / duplicate → keyed 400, nothing stored (80-02) | ✓ VERIFIED | server.js:7462-7525 save route intact — gate order → validate-everything-then-single-INSERT; integration tests green |
| 7 | Non-operator/unauthenticated caller cannot distinguish bad-guid from bad-workspace (80-02) | ✓ VERIFIED | server.js:7481-7484 gate (sameOrigin → requireUser → isInstanceAdmin) precedes all target lookup; no-oracle tests green |
| 8 | Deleting a mapped workspace leaves the row and boot logs a dead-mapping warning (80-02) | ✓ VERIFIED | server.js:9782-9794 boot block intact; survival + reboot-warning tests green |
| 9 | Zero mappings → one `group mappings: off` line, byte-identical behavior (80-02) | ✓ VERIFIED | server.js:9784; full suite green with empty config |
| 10 | Every refusal code has err.<code> in all 5 locales (80-02) | ✓ VERIFIED | 4 × `err.groupMapping*` keys in each of en/fr/nl/de/es (20 hits) |
| 11 | Dockerfile copies groups.js; dependencies.test.mjs COPY array includes it (80-02) | ✓ VERIFIED | Dockerfile:22-23; test/dependencies.test.mjs:103 exact array with GM-01 pin; deps test green |

**Score:** 11/11 truths verified (0 present-behavior-unverified)

### Deferred Items

Both deferrals from the prior report are now CONFIRMED LANDED — recorded for provenance, no longer pending:

| # | Item | Addressed In | Current-tree evidence |
|---|------|-------------|----------------------|
| 1 | GM-01 editor UI half (governance console section) | Phase 83 | 83-02 commits in log: governance rename modal, dead-mapping card + 5-locale keys |
| 2 | GM-02 login-time claim wiring | Phase 81/82 | server.js:5359 callback reconcile pass consumes resolveGroupsClaim/resolve (Phase 81/82 markers in code) |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `groups.js` | Pure server-only core: canonicalization, refusal funnel, 4-outcome detector, D-82-1 resolver | ✓ VERIFIED | 154 lines, substantive, wired (server.js:109 import) |
| `test/groups-core.test.mjs` | Zero-boot unit suite | ✓ VERIFIED | green in targeted run |
| `test/groups-config-api.test.mjs` | Integration suite: gate order, no-oracle, refusals, survival, boot lines | ✓ VERIFIED | green in targeted run |
| server.js save route + boot block | Operator-gated route, dead-mapping warning | ✓ VERIFIED | server.js:7462-7525, 9782-9794 |
| group_mappings DDL in both mirrors | Identical, non-cascading, 3-token CHECK, kind column | ✓ VERIFIED | server.js:645 ≡ db-adapter.mjs:387 |
| 5 locale files | 4 err.groupMapping* keys each | ✓ VERIFIED | 20 hits across en/fr/nl/de/es |
| Dockerfile + dependencies contract | groups.js shipped and pinned | ✓ VERIFIED | Dockerfile:22-23; dependencies.test.mjs:103 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| save route (server.js:7489-7493) | groups.js validators | guidRefusal/roleTokenRefusal with explicit codes | ✓ WIRED | call-site literals intact |
| save route | workspaces/group_mappings DB | db.get pre-checks + single INSERT | ✓ WIRED | server.js:7494-7516 |
| server.js SCHEMA ↔ db-adapter.mjs SQLITE_SCHEMA | mirror test | deep-equal modulo comments | ✓ WIRED | test green |
| groups.js runtime | Dockerfile COPY + deps test array | both sides changed together | ✓ WIRED | deps test green |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Core + config-API + adapter + dependencies suites | `node --test test/groups-core.test.mjs test/groups-config-api.test.mjs test/db-adapter.test.mjs test/dependencies.test.mjs` | 62 tests, 61 pass, 0 fail, 1 pg-skip | ✓ PASS |
| Full inert suite (re-run this refresh) | `npm test` | 2063 tests, 2050 pass, 0 fail, 13 pg-skips, exit 0 | ✓ PASS |
| Locale keys | `grep -c "err.groupMapping" src/locales/*.json` | 4 per file × 5 | ✓ PASS |
| DDL mirrors | sed both schema blocks | verbatim-identical | ✓ PASS |

Full suite grew 2000 → 2063 since the prior run (Phases 81–84 tests added) with zero failures — the Phase-80 surfaces survive all post-ship changes.

### Probe Execution

None declared — no probe-*.sh in the phase plans.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| GM-01 | 80-02 | Operator-managed mapping config with keyed validation refusals | ✓ SATISFIED (storage/validation half; editor UI landed in Phase 83 — confirmed in current tree) | save route + 5-locale refusals + tests |
| GM-02 | 80-01, 80-02 | groups claim read; `_claim_names` overage → unmapped, never empty list | ✓ SATISFIED (parser/resolver complete; login wiring landed in Phase 81/82 — confirmed in current tree) | resolveGroupsClaim + fixtures |
| GM-03 | 80-01, 80-02 | Config keys validated at boot; dead mappings warned, labels display-only | ✓ SATISFIED | DDL CHECK + boot block (server.js:9782-9794) |

All three requirement IDs accounted for; no orphaned requirements.

### Anti-Patterns Found

None. No TBD/FIXME/XXX/placeholder markers in groups.js; no stub returns in the route or core module.

### Advisory (New Scope, Unevidenced)

None — this refresh ran with deterministic evidence (targeted + full suite green, static surfaces re-read).

### Human Verification Required

None. All behavior-dependent truths are exercised by passing tests in the current tree.

### Gaps Summary

None. The refresh confirms the prior verdict: every Phase-80 artifact exists, is substantive, and is wired; the full suite is green on the current tree. Post-ship commits (super-access gate, me() fix, env docs) and Phases 81–84 landed on top without disturbing any Phase-80 surface; both prior deferrals (editor UI → 83, login wiring → 81/82) are confirmed landed.

---

_Verified: 2026-11-21 (stale-refresh)_
_Verifier: the agent (gsd-verifier)_
