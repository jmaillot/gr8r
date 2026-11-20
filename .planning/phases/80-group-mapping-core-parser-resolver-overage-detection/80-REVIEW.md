---
phase: 80-group-mapping-core-parser-resolver-overage-detection
reviewed: 2026-11-20T12:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
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
  - test/dependencies.test.mjs
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 80: Code Review Report

**Reviewed:** 2026-11-20
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Reviewed the Phase 80 group-mapping core (groups.js, dual schema mirrors, operator-gated save route, boot warning block, locales, Dockerfile contract, and the three test suites). The implementation is solid overall: the four-outcome claim detector is correctly fail-closed, GUID canonicalization collapses all paste variants to one key before both the unique-pair pre-check and storage, the operator gate strictly precedes any target lookup (no existence oracle — pinned by tests), and the DDL is byte-consistent across both schema mirrors with the non-cascading workspace ref as designed. `node --test test/groups-core.test.mjs test/groups-config-api.test.mjs` → 29/29 pass.

No critical issues. Two warnings (a save-path race surfaced as a generic 500, and an unhandled-rejection hazard in the async listen callback) and two info items below.

## Warnings

### WR-01: Duplicate pre-check race resolves to a generic 500 instead of the keyed 400

**File:** `server.js:7154-7168`
**Issue:** The `(group_guid, workspace_id)` duplicate check is a read-then-insert (TOCTOU). Two concurrent saves of the same pair both pass the pre-check; the second INSERT violates `group_mappings_pair` and throws. The route has no try/catch, so the outer request handler converts it to a generic 500 `Internal server error` rather than the keyed `groupMappingDuplicate` 400 the contract promises. No data corruption (the unique index holds), but the keyed-refusal contract is violated on the race and the raw constraint error is logged as a 500-class server error.
**Fix:**
```js
try {
  await db.run('insert into group_mappings (...) values (?,?,?,?,?,?,?,?,?)', [...]);
} catch (err) {
  if (/group_mappings_pair|UNIQUE constraint/i.test(String(err.message))) {
    return fail(res, 400, 'groupMappingDuplicate', 'That group is already mapped to this workspace');
  }
  throw err;
}
```

### WR-02: Async listen callback has no rejection handler — a boot DB error kills the process outside `main().catch`

**File:** `server.js:9368-9413`
**Issue:** Phase 80 made the `server.listen(PORT, HOST, async () => {...})` callback async to accommodate the awaited group-mappings block (`db.all` at 9403, workspaces cross-check at 9408). `listen()` ignores the returned promise: any rejection inside (transient DB failure, lock contention at boot) becomes an `unhandledRejection`, which terminates the Node process with no log context from `main().catch` — the exact crash mode the codebase guards against elsewhere (reminder/webhook interval ticks carry both try/catch and `.catch`, per the house comments at server.js:9340-9366).
**Fix:**
```js
server.listen(PORT, HOST, () => { Promise.resolve(bootSummary()).catch(err => logError(err)); });
// or: wrap the group-mappings block body in try/catch (logError, continue boot)
```

## Info

### IN-01: Save route has no throttle while sibling mutation doors do

**File:** `server.js:7133`
**Issue:** `POST /api/governance/group-mappings` performs two DB reads + an insert per request with no `tooMany` budget. Auth-adjacent mutations (signup, etc.) throttle by IP. The route is operator-only and sameOrigin-gated, so exposure is minimal — noting for consistency, not as a defect.
**Fix:** Optional: `if (tooMany(`gm|${clientIp(req)}`, 30, 60_000)) return fail(res, 429, 'tooManyAttempts', ...)` after the operator gate, matching house pattern.

### IN-02: Equal-role ties in `resolve()` are row-order dependent

**File:** `groups.js:144-147`
**Issue:** When two claimed mappings grant the same winning role to one workspace, the reported `groupGuid` is whichever row arrives first. Deterministic per query but not specified; Phase 81 consumers should not treat `groupGuid` as meaningful for ties. Behavior is harmless today (role is what drives grants).
**Fix:** Optional: document the tie-break in the `resolve()` JSDoc ("first row wins on equal roles").

---

_Reviewed: 2026-11-20T12:00:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
