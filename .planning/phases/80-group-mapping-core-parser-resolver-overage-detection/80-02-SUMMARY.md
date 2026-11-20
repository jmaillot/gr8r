---
phase: 80-group-mapping-core-parser-resolver-overage-detection
plan: 02
subsystem: auth
tags: [entra-id, groups, group-mappings, operator-gate, keyed-refusals, i18n, dockerfile-contract, d82-6]

# Dependency graph
requires:
  - phase: 80-group-mapping-core-parser-resolver-overage-detection (80-01)
    provides: groups.js guidRefusal/roleTokenRefusal/canonicalizeGuid funnel + the group_mappings table (both schema mirrors, non-cascading FK, kind column, unique pair index)
provides:
  - POST /api/governance/group-mappings — operator-gated, fully-validated save route (sameOrigin → requireUser → isInstanceAdmin BEFORE any target lookup; four keyed 400 refusals; nothing invalid ever stored)
  - err.groupMappingBadGuid/UnknownWorkspace/BadRole/Duplicate keys in all 5 locales (same commit as the gate)
  - D-82-6 boot half — `group mappings: off|N` boot line + logWarn per dead mapping naming guid → workspace; empty config boots byte-identically
  - Dockerfile runtime stage ships groups.js + the dependencies.test.mjs COPY-target contract update
affects: [phase-81-callback-wiring, phase-82-removal-sync, phase-83-governance-ui]

# Actuals (#2632)
actuals:
  tokens: 86000   # chars/4 over the realized diff (345 insertions / 4 deletions, 10 files)
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Operator-gated config save: gate order verbatim from the Phase 78/79 operator family, refusal-code literals passed EXPLICITLY at the server.js call site (domains.js door precedent) so the error-codes reverse-parity scan sees them"
    - "Grep-able boot vocabulary line per config surface (D-11 style): zero rows → exactly one off-line and no dead-mapping query"

key-files:
  created:
    - test/groups-config-api.test.mjs
  modified:
    - server.js
    - Dockerfile
    - src/locales/en.json
    - src/locales/fr.json
    - src/locales/nl.json
    - src/locales/de.json
    - src/locales/es.json
    - test/dependencies.test.mjs
    - test/i18n-core-features.test.mjs

key-decisions:
  - "Refusal codes passed explicitly to guidRefusal/roleTokenRefusal at the route call site so the err.* reverse-parity scan (server.js source grep) sees the literals — the groups.js default-code path would have hidden them"
  - "logSecurity('group_mapping_saved') audit added at save (RESEARCH Open Q 3) — cheap now, avoids the Phase 83 retrofit"
  - "Boot block placed in the listen callback (made async): zero rows → exactly one `group mappings: off` line and no workspaces cross-check (byte-identical boot criterion)"

patterns-established:
  - "No-oracle config save: the operator gate runs before ANY target lookup, so bad-guid and bad-workspace are indistinguishable to non-operators (pinned by a same-response assertion)"
  - "Restart-on-same-DB test pattern: explicit mkdtemp dataDir owned by the test (the harness deletes owned dirs on stop)"

requirements-completed: [GM-01, GM-03]

coverage:
  - id: D1
    description: "POST /api/governance/group-mappings save route with the mandatory gate order (sameOrigin → requireUser → isInstanceAdmin BEFORE any target lookup) and keyed 400 refusals for bad guid / unknown workspace / bad role / duplicate pair — nothing invalid is ever stored"
    requirement: GM-01
    verification:
      - kind: integration
        ref: "test/groups-config-api.test.mjs#operator refusals: bad guid, unknown workspace, bad role, duplicate — 400 with the keyed code and ZERO rows stored"
        status: pass
      - kind: integration
        ref: "test/groups-config-api.test.mjs#operator + valid body → 200, row readable with the CANONICALIZED guid and the 3-token role"
        status: pass
      - kind: unit
        ref: "test/error-codes.test.mjs#every error code the server emits has a non-empty err.<code> entry in both catalogues"
        status: pass
    human_judgment: false
  - id: D2
    description: "No-oracle gate (T-80-04): unauthenticated, cross-origin, and non-operator callers cannot distinguish bad-guid from bad-workspace — the operator gate precedes any probing"
    requirement: GM-01
    verification:
      - kind: integration
        ref: "test/groups-config-api.test.mjs#unauthenticated POST → 401 signInRequired before any workspace probing (no oracle)"
        status: pass
      - kind: integration
        ref: "test/groups-config-api.test.mjs#cross-origin POST with a valid session → 403 crossOriginRejected (sameOrigin runs FIRST)"
        status: pass
      - kind: integration
        ref: "test/groups-config-api.test.mjs#non-operator authenticated POST → EXACT 403 operatorOnly regardless of body validity (no 403-vs-400 oracle)"
        status: pass
    human_judgment: false
  - id: D3
    description: "5-locale keyed refusals: err.groupMapping* keys present and non-empty in en/fr/nl/de/es in the same commit as the emitting gate"
    requirement: GM-01
    verification:
      - kind: unit
        ref: "test/groups-config-api.test.mjs#every new refusal code has a non-empty err.<code> entry in ALL FIVE locales (same-commit constraint)"
        status: pass
      - kind: unit
        ref: "test/error-codes.test.mjs#reverse parity: every catalogued err.* code is emitted by server.js or allowlisted as client-side"
        status: pass
    human_judgment: false
  - id: D4
    description: "D-82-6 boot half: a dead mapping (workspace deleted) leaves the row in place, the reboot logs a warning naming guid → workspace without refusing; zero mappings boot byte-identically with one off-line"
    requirement: GM-03
    verification:
      - kind: integration
        ref: "test/groups-config-api.test.mjs#dead-mapping survival: the mapping row SURVIVES workspace deletion and the reboot WARNS naming the pair (D-82-6)"
        status: pass
      - kind: integration
        ref: "test/groups-config-api.test.mjs#empty-config boot: exactly one `group mappings: off` line, no dead-mapping warnings"
        status: pass
    human_judgment: false
  - id: D5
    description: "Dockerfile runtime stage ships groups.js and the test/dependencies.test.mjs COPY-target contract includes it (both sides change together)"
    requirement: GM-03
    verification:
      - kind: unit
        ref: "test/dependencies.test.mjs#the Dockerfile runtime stage stays bare node + su-exec with exactly the pinned app COPY targets (D-12)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Inert-when-empty invariant: the FULL existing suite stays green with zero mappings stored (byte-identical standing criterion)"
    verification:
      - kind: integration
        ref: "command: npm test — 2000 tests, 0 fail, 13 skipped (pg-gated)"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-11-20
status: complete
---

# Phase 80 Plan 02: Group Mapping Save API + Boot Warning Summary

**Operator-gated POST /api/governance/group-mappings with four keyed 5-locale refusals, D-82-6 dead-mapping boot warnings, and the groups.js Dockerfile COPY contract — nothing invalid ever stored, empty config boots byte-identically**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-20T10:40:10Z
- **Completed:** 2026-11-20T10:45:56Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- `POST /api/governance/group-mappings` (server.js, beside the Phase 79 operator family): mandatory gate order verbatim (sameOrigin → requireUser → isInstanceAdmin BEFORE any target lookup — no 403-vs-400 existence oracle), then guidRefusal/roleTokenRefusal on the 80-01 funnel + workspace-existence and duplicate (guid, workspace) pre-checks — all validation completes before the single INSERT; success path stores the canonicalized GUID with `uid()` id, kind 'workspace', opaque display-only label, and a `logSecurity('group_mapping_saved')` audit
- Four refusal codes (groupMappingBadGuid / groupMappingUnknownWorkspace / groupMappingBadRole / groupMappingDuplicate) keyed into en/fr/nl/de/es in the same commit; error-codes reverse parity green
- D-82-6 boot half: `group mappings: off` (zero rows — one line, no dead-mapping query) or `group mappings: N` + one `logWarn` per dead mapping naming guid → workspace; boot never refuses on dead config
- Dockerfile runtime stage ships groups.js; `test/dependencies.test.mjs` COPY-target array updated with the Phase-80 comment (G-75-3 precedent)
- `test/groups-config-api.test.mjs` (NEW, 8 tests): gate order, no-oracle indistinguishability, every refusal with zero-rows-after, canonicalized success row, 5-locale parity, dead-mapping survival across a same-DB reboot, empty-config boot line

## Task Commits

Each task was committed atomically:

1. **Task 1: Operator-gated save/refuse route + 5-locale keyed refusals** - `f93c11cc` (feat)
2. **Task 2: Integration suite — dead-mapping survival + boot-log pins (with the boot block they pin)** - `ba7aa19a` (test)
3. **Task 3: Boot warning + `group mappings` log line + Dockerfile COPY contract** - `41de3b30` (chore; the boot block rode the Task-2 commit, see deviations)

## Files Created/Modified
- `server.js` - groups.js import, the save route (governance family), the boot group-mappings log block
- `test/groups-config-api.test.mjs` - NEW integration suite (8 tests)
- `src/locales/{en,fr,nl,de,es}.json` - 4 err.groupMapping* keys each (same commit as the gate)
- `Dockerfile` - runtime COPY of groups.js
- `test/dependencies.test.mjs` - COPY-target contract array + message
- `test/i18n-core-features.test.mjs` - catalogue-size assertion 2012 → 2016

## Decisions Made
- Refusal codes passed EXPLICITLY at the server.js call sites (`guidRefusal(body.groupGuid, 'groupMappingBadGuid', …)` — the domains.js door precedent): the error-codes reverse-parity test greps server.js source for code literals, and the groups.js default-code path would have hidden them
- `logSecurity(operator.id, 'group_mapping_saved')` on every save — RESEARCH Open Question 3 adopted now to avoid the Phase 83 retrofit
- Boot block lives in the (now-async) listen callback after the workspace-creation line, D-11 vocabulary; zero rows write exactly one line and skip the workspaces cross-check

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Explicit refusal-code literals at the route call sites**
- **Found during:** Task 1 (error-codes reverse-parity test red)
- **Issue:** `test/error-codes.test.mjs` verifies every catalogued `err.*` code appears in the server.js source; the plan's "use the groups.js funnel" reading (default codes inside groups.js) left the literals invisible to that scan
- **Fix:** Passed the code/message explicitly to `guidRefusal`/`roleTokenRefusal` at the call site — the same house pattern the domains.js doors use
- **Files modified:** server.js
- **Verification:** reverse-parity test green; suite green
- **Committed in:** f93c11cc (Task 1 commit)

**2. [Rule 3 - Blocking] i18n catalogue-size assertion bumped 2012 → 2016**
- **Found during:** Task 1
- **Issue:** `test/i18n-core-features.test.mjs` pins the exact EN catalogue key count; +4 err.* keys would break it (file not in the plan's files_modified list)
- **Fix:** Count updated to 2016 with the +4 provenance comment, following the file's own changelog convention
- **Files modified:** test/i18n-core-features.test.mjs
- **Verification:** i18n suite green
- **Committed in:** f93c11cc (Task 1 commit)

**3. [Task-order dependency] Task 2's tests 5–6 (dead-mapping survival, empty-config boot) pin Task 3's boot block**
- **Found during:** Task 2
- **Issue:** The plan sequences the survival/boot tests (Task 2) before the boot block they assert (Task 3) — the tests cannot be green before the behavior exists, and each commit must leave the suite green
- **Fix:** The boot block landed with the Task 2 commit (test + behavior together); Task 3's commit then carries the Dockerfile/dependency contract, which is the remaining Task 3 deliverable. Task 3's full-suite verification was run after both commits
- **Files modified:** server.js, test/groups-config-api.test.mjs (Task 2 commit); Dockerfile, test/dependencies.test.mjs (Task 3 commit)
- **Verification:** full npm test green after both commits
- **Committed in:** ba7aa19a + 41de3b30

**4. [Rule 3 - Blocking] Reverse-parity coverage of the four err.* keys**
- **Found during:** Task 1 — covered by deviation 1 (same root cause, same fix)

---

**Total deviations:** 3 auto-fixed (2 blocking test-contract updates, 1 task-order dependency collapse) + 1 duplicate root cause folded into #1
**Impact on plan:** No scope creep — every deviation is the minimum change to keep the standing test contracts (reverse parity, catalogue size, green-per-commit) true while delivering exactly the planned behavior.

## Issues Encountered
- The dead-mapping reboot test initially failed because `startServer({})` deletes its own mkdtemp dataDir on stop — the first boot wiped the DB before the reboot. Fixed by the test owning the dataDir explicitly (`mkdtempSync` + `startServer({ dataDir })`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 81 (callback wiring) can consume the save path's stored rows directly: mappings live in group_mappings keyed by canonical GUID; `resolve()`/`resolveGroupsClaim` contracts are pinned from 80-01 and unchanged
- Phase 83's governance UI can render the dead-mapping section from the same detection the boot block uses (workspace_id not in workspaces); the D-82-6 console section remains open there
- No DELETE route yet — editor/removal lands in Phase 83 (per plan); duplicates are blocked both by the pre-check and the unique index

---
*Phase: 80-group-mapping-core-parser-resolver-overage-detection*
*Completed: 2026-11-20*

## Self-Check: PASSED

All 10 created/modified files exist on disk; all 3 task commits verified in git log (f93c11cc, ba7aa19a, 41de3b30); each locale carries exactly the 4 err.groupMapping* keys; `npm test` 2000/0-fail/13-skipped (pg-gated) after the final commit.

