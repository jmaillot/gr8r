---
phase: 49
name: visibility-model-collapse-grant-materialization
verdict: SECURED
threats_total: 12
threats_closed: 12
threats_open: 0
asvs_level: 1
block_on: high
audited_at: 2026-11-07
---

# Phase 49 — Security Audit (SECURED)

Audit scope: 49-01/02/03/04 PLAN threat registers, verified against the phase diff
(server.js, mcp.js, test files). ASVS level not configured → L1 grep-level depth applied.
`block_on` not configured → default `high`.

## Threat Verification

| Threat ID | Category | Severity | Disposition | Evidence |
|-----------|----------|----------|-------------|----------|
| T-49-01 | Tampering | high | mitigate | test/helpers/visibility-fixture.mjs:166 hand-derived `VISIBILITY_MODEL` oracle with anti-tautology contract (fixture.mjs:4-19); `memberCanReadProject`/`canReadProject` appear only in comments — zero executable calls in expectation code; set-equality asserts test/visibility-migration.test.mjs:211,245-249 |
| T-49-02 | Elevation of Privilege | high | mitigate | Set-equality tests against `postSweepIds(VISIBILITY_MODEL, …)` in both directions (visibility-migration.test.mjs:211-249); sweep materializes old-predicate grant set (server.js:2275-2311) |
| T-49-03 | Tampering | critical | mitigate | "No backup = no mutation" return-on-catch at server.js:2237-2242 (T-49-03 tag in code); vacuum-into pattern server.js:2236; exactly-one-backup pin test/visibility-migration.test.mjs:230-240; per-workspace tx (doc write + scope-column clears atomic, server.js:2251-2258) |
| T-49-04 | Denial of Service | medium | mitigate | Fail-open parse: corrupt scope JSON → workspace-wide (server.js:2293-2311, T-49-04 tag); pinned by fail-open fixture cell (visibility-migration.test.mjs:3,14) |
| T-49-05 | Elevation of Privilege | high | mitigate | Lockstep mirror `canReadProject` mcp.js:182-189 (`p.private === true`); legacy `p.access` fallback deleted (mcp.js:438-440, D-49-tagged); server↔MCP parity suite test/mcp.test.mjs:605-768 (server ≡ MIRROR_MODEL per actor) |
| T-49-06 | Information Disclosure | high | mitigate | Byte-identical 404 body-equality tests against nonexistent-id baselines: privacy.test.mjs:516-560 (file serve, get_task, MCP doors), mcp.test.mjs 404 rows |
| T-49-07 | Tampering | medium | mitigate | Assignee guard on collapsed funnel: server.js:1073-1080 calls `memberCanReadProject` and throws `assigneeOutOfScope`; HTTP mapping server.js:4633 |
| T-49-08 | Information Disclosure | medium | mitigate | Repo-wide grep: server.js residuals = 5 hits, all sweep-machinery comments documenting the retired predicate (whitelisted); mcp.js = 0; docs/ProjectPermissions.md + WorkspacePermissions.md = 0 |
| T-49-09 | Repudiation | medium | mitigate | Canary files test/due-reminders.test.mjs, test/digest.test.mjs: last commits pre-phase (44-01 / 41-02) — phase diff empty |
| T-49-SC (49-01) | Tampering | high | mitigate | `git diff 583ba9a..HEAD -- package.json` empty — zero new packages |
| T-49-SC (49-02) | Tampering | high | mitigate | Same evidence — no install tasks executed |
| T-49-SC (49-03) | Tampering | high | mitigate | Same evidence — no install tasks executed |
| T-49-SC (49-04) | Tampering | high | mitigate | Same evidence — no install tasks executed |

## Unregistered Flags

None. SUMMARY.md files report no `## Threat Flags` sections; each "Threat surface scan"
section is consistent with the register (test-only / documented deviation in 49-01, none in 49-02/03/04).
49-03's `p.access` mirror-fallback bug was auto-fixed in commit b774269 and is covered by T-49-05 verification.

## Accepted Risks / Notes

- **pg-lane backup gap (A6, server.js:2245-2251):** on Postgres there is no vacuum-into
  equivalent, so boots run without a file backup; contained by per-scenario disposable
  fixture databases (pg-matrix). Documented in-code, accepted posture — not a register gap.
- Six retired scope error codes allowlisted as client-side-only in test/error-codes.test.mjs
  (49-03 deviation, dated Phase 51 note) — informational, not a threat disposition.

## Verdict

**SECURED** — 12/12 threats closed (including 4 duplicate T-49-SC entries across plans).
`threats_open: 0`. Suite evidence: full `npm test` 1090 tests / 1079 pass / 0 fail / 11 skipped
(pre-existing skips); visibility-migration suite 6/6 re-confirmed during audit.
