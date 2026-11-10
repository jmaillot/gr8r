---
phase: 49
plan: 04
subsystem: visibility
tags: [visibility, docs, residual-sweep, migration, phase-close]
requires: [49-02 materializeVisibilityGrants sweep, 49-03 collapsed predicate + retired writers]
provides:
  - repo-wide residual grep gates at expected counts (zero untagged retired-term references)
  - docs/ProjectPermissions.md rewritten to the collapsed model; docs/WorkspacePermissions.md scope claims corrected
  - per-criterion evidence record for all five Phase 49 ROADMAP success criteria
affects: [Phase 51 client surfaces, Phase 52 transparency view]
tech-stack:
  added: []
  patterns: [dated-comment whitelist (D-49 tags) for historical retired-term mentions]
key-files:
  created: []
  modified:
    - server.js
    - mcp.js
    - docs/ProjectPermissions.md
    - docs/WorkspacePermissions.md
    - test/mcp.test.mjs
    - test/visibility-migration.test.mjs
    - test/helpers/visibility-fixture.mjs
key-decisions:
  - mcp.js mirror `private` field collapsed to `p.private === true` — legacy p.access fallback retired (sweep normalized it away before serving)
  - historical comments mentioning retired terms are D-49-tagged rather than deleted (dated-decision whitelist per plan)
  - Gate 3 (p.access) code hits confined to sweep/normalizeProjects machinery — whitelisted as sweep input, mirroring the plan's sweep-NULL-clear exemption
requirements-completed: [MIG-01, MIG-02, MIG-03, VIS-02, VIS-03]
coverage:
  - id: D1
    description: Repo free of dead-model machinery — zero untagged references to projectScope/inScopeProject/scopeGrants/teamIntersects; mcp legacy p.access fallback deleted
    requirement: MIG-02
    verification:
      - kind: other
        ref: "grep -rnE 'projectScope|inScopeProject|scopeGrants|teamIntersects' --include='*.js' --include='*.mjs' server.js mcp.js src test | grep -v D-49 | wc -l → 0"
      - kind: integration
        ref: "tests/test/visibility-migration.test.mjs (6/6 pass post-edit)"
      - kind: integration
        ref: "tests/test/mcp.test.mjs (32/32 pass post-edit)"
    human_judgment: false
  - id: D2
    description: docs/ProjectPermissions.md teaches exactly the collapsed model (private boolean + p.members + documented MCP admin-bypass residue); no current-tense team-share/scope-grant claims; WorkspacePermissions.md scope claims corrected
    requirement: MIG-01
    verification:
      - kind: other
        ref: "grep for required phrases (p.members ×9, booléen/p.private, admin/owner bypass) — all present; p.teams section deleted"
    human_judgment: false
  - id: D3
    description: Full suite green on the collapsed model; canaries byte-unmodified
    requirement: VIS-03
    verification:
      - kind: integration
        ref: "npm test → 1090 tests, 1079 pass, 0 fail, 11 skipped (all pre-existing)"
      - kind: other
        ref: "git diff --stat test/due-reminders.test.mjs test/digest.test.mjs → empty"
    human_judgment: false
  - id: D4
    description: Five ROADMAP Phase 49 success criteria individually evidenced (see Success Criteria Evidence)
    requirement: MIG-03
    verification:
      - kind: integration
        ref: "tests/test/visibility-migration.test.mjs#set-equality + second-boot byte-identity"
      - kind: integration
        ref: "tests/test/privacy.test.mjs (16/16) + test/mcp.test.mjs parity block + test/file-route-ordering.test.mjs (3/3)"
    human_judgment: false
metrics:
  duration: 40 min
  completed: 2026-11-07
  status: complete
actuals:
  tokens: 7300
  tasks: 2
  commits: 2
plan_head_before: 583ba9aea309171093899b09c0e6eff8f0007743
plan_head_after: f515b5e
---

# Phase 49 Plan 04: Phase Close — Residual Sweep, Docs Rewrite, Criteria Verification Summary

**Repo-wide residual sweep cleared (one real code fix: mcp legacy `p.access` fallback deleted), permissions docs rewritten to the collapsed model, all five Phase 49 success criteria individually evidenced — 1079 pass / 0 fail, canaries byte-unmodified.**

## Performance

- **Duration:** 40 min
- **Started:** 2026-11-07T22:02:03Z
- **Completed:** 2026-11-07
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Residual-reference sweep across server.js/mcp.js/src/test: zero untagged references to `projectScope|inScopeProject|scopeGrants|teamIntersects`; the mirror's last real legacy reference (`mcp.js` `p.access === 'private'` fallback in the project shape) collapsed to the boolean-only read; every surviving historical mention is a dated D-49 comment
- docs/ProjectPermissions.md rewritten: §5 replaced the p.teams/scope section with the collapsed-model story (boolean private + explicit p.members, one-boot sweep, dormant scope columns, MCP mirror parity with the documented ROLE_RANK admin bypass); §2/§3/§4/re-cap updated
- docs/WorkspacePermissions.md corrected: scope rows now describe dormant columns and vestigial client selectors (Phase 51 cleanup); `projectScope()`/promotion-clear claims removed; guest single-project scope rule noted as retired
- All five Phase 49 ROADMAP success criteria re-verified with named commands/tests (below)

## Task Commits

1. **Task 1: Repo-wide residual-reference sweep** — `b774269` (fix)
2. **Task 2: Documentation rewrite + success-criteria verification** — `f515b5e` (docs)

## Files Created/Modified

- `mcp.js` — mirror project `private` field reads only the boolean; legacy fallback deleted with dated comment
- `server.js` — D-49 tags on historical retired-term comments; stale file-route comment (scope funnel reads p.teams) reworded
- `docs/ProjectPermissions.md` — rewritten to the collapsed model
- `docs/WorkspacePermissions.md` — scope claims corrected to dormant/ignored
- `test/mcp.test.mjs`, `test/visibility-migration.test.mjs`, `test/helpers/visibility-fixture.mjs` — historical comments D-49-tagged

## Task 1 Gate Results

| Gate | Command | Result | Expected |
|------|---------|--------|----------|
| 1. retired terms | `grep -rnE "projectScope\|inScopeProject\|scopeGrants\|teamIntersects" --include="*.js" --include="*.mjs" server.js mcp.js src test \| grep -v D-49 \| wc -l` | **0** | 0 ✓ |
| 2. p.teams | `grep -n "p\.teams" server.js mcp.js` | only sweep reads/deletes (2321-2383) + one historical comment | no p.teams writes outside sweep ✓ |
| 3. p.access | `grep -rnE "p\.access\|access === 'private'" server.js mcp.js src` | code hits confined to sweepNeeded/normalize/sweep block (:835, :2213, :2323-2324) — sweep input machinery, whitelisted like the sweep NULL-clears | whitelisted-only ✓ |
| 4. scope writes | `grep -nE "set scope\|scope = \?" server.js` | only the two sweep NULL-clears (:2391-2392) | sweep-only ✓ |
| 5. client predicate copies | `grep -rnE "memberCanReadProject\|canSeeProject" src/` | 0 hits — client uses its own simple `canSee` (store.js:326), no server-predicate duplicate | 0 ✓ |
| TODO/FIXME | `grep -nE "TODO\|FIXME" server.js mcp.js docs/ProjectPermissions.md` | none | none ✓ |

## Success Criteria Evidence (ROADMAP §Phase 49, verbatim criteria)

1. **Set-equality after one reboot** — `node --test test/visibility-migration.test.mjs` → 6/6 pass, incl. the per-actor × per-project set-equality test asserting `postSweepIds(VISIBILITY_MODEL, actor, POST_SWEEP_SERVER_DELTA)` (team-derived, scope-derived incl. corrupt-scope fail-open cell, guest/private shapes).
2. **Non-private + explicit membership; removal hides on next read** — `node --test test/privacy.test.mjs` → 16/16 pass (collapsed-funnel cells + VIS-02 removal-flip cell).
3. **Byte-identical 404 through every door** — 404 matrix rows green: privacy.test.mjs (16/16), test/mcp.test.mjs (32/32), test/file-route-ordering.test.mjs (3/3).
4. **Consumers + mirror parity** — test/mcp.test.mjs parity block green (mirror === server on coinciding shapes; admin-bypass residue documented + pinned); reminder/digest/email-mirror send-time gates green via full suite; canaries unmodified.
5. **Second-boot byte identity + canaries** — visibility-migration second-boot byte-identity test green on SQLite (one backup, no churn); pg lane environment-gated (`POSTGRES_TEST_URL` unset → test/copy-sqlite-to-pg.test.mjs reports 4 skipped — same env-gated state as the repo baseline, no local pg test instance); `git diff --stat test/due-reminders.test.mjs test/digest.test.mjs` → empty (Phase 37/38 suppression + no-double-send invariants unmodified).

## Decisions Made

- mcp.js legacy `p.access` fallback deleted rather than preserved: the boot sweep normalizes every stored document before any request is served, so the fallback was dead code that could only resurrect the old model from a crafted pre-sweep document
- Historical comments kept but D-49-tagged (plan's dated-decision whitelist) rather than deleted — they document the migration intent for future readers

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Mirror retained a legacy `p.access` visibility fallback**
- **Found during:** Task 1 (Gate 3)
- **Issue:** `mcp.js:437` read `p.access === 'private'` when the boolean was absent — a real-code reference to the retired representation, contradicting the collapse
- **Fix:** collapsed to `p.private === true` with a dated comment; mcp.test.mjs parity suite re-run green
- **Files modified:** mcp.js
- **Committed in:** b774269 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug). **Impact:** the sweep was otherwise comment-only; no scope creep.

## Issues Encountered

- Gate 3 as written ("zero hits") is unachievable without breaking the 49-02 sweep, which by design reads legacy `p.access`/`p.teams`/scope columns to detect and migrate pre-sweep documents. Treated as within the acceptance-criteria whitelist's spirit (sweep machinery = sweep input, same family as the sweep NULL-clears exemption); recorded above with exact line numbers.

## Verification

- Full `npm test`: **1090 tests, 1079 pass, 0 fail, 11 skipped** (all pre-existing)
- All Task 1 grep gates at expected counts (table above)
- Canary files untouched (`git diff` empty)
- docs updated and phrase-checked

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Phase 49 closes: MIG-01..03, VIS-02, VIS-03 all evidenced; visibility model is boolean-private ∨ explicit access list across server, mirror and consumers
- Ready for Phase 50 (invite hierarchy + per-project toggles, server). Note for planners: scope columns are dormant sweep input — Phase 50 must not write them; client scope selectors and `memberScopeEligible` (store.js) are Phase 51's cleanup surface; error-codes allowlist carries six retired scope codes until Phase 51.

## Self-Check: PASSED

- Commits b774269, f515b5e verified via `git rev-list 583ba9a..HEAD` (2 commits)
- All 7 modified files present in the working tree; full suite green post-commit
