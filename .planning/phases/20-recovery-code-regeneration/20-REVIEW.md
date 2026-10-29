---
phase: 20-recovery-code-regeneration
reviewed: 2026-10-29T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - server.js
  - test/tfa-recovery-regen.test.mjs
  - src/core/api.js
  - src/pages/settings.js
  - src/actions/actions.js
  - src/locales/en.json
  - src/locales/fr.json
findings:
  critical: 0
  warning: 0
  info: 2
  total: 2
status: clean
---

# Phase 20: Code Review Report

**Reviewed:** 2026-10-29
**Depth:** standard
**Files Reviewed:** 7
**Status:** clean

## Summary

Adversarial review of the recovery-code regeneration phase (commits 9e4bb5c, d948c9d, 3f97303, 2b64532): the `POST /api/auth/tfa/recovery` route, `security_log` schema + `logSecurity` helper, the 5-test integration suite, and the client half (api method, settings-card regen stage, action handlers, EN/FR locale keys).

**Server route (server.js:1704-1755) — verified sound.** Guard order matches the sibling convention (sameOrigin → requireUser → `tooMany('tfa-regen|<uid>', 5, 15min)` → readJson). The D-85 structural invariant holds: the strict `/^\d{6}$/` gate has no else-branch and the route block contains zero reads of `recovery_codes` (grep-verified; only its own delete/insert writes). The burn-and-replace is a single `transaction()` (server.js:861-871, `BEGIN IMMEDIATE` with rollback on throw) containing a fresh re-select, password-then-TOTP verification (D-86), `requireTotpSecret` fail-closed decrypt (returns `{ok:false}` → 503 before any mutation), the D-87 `two_fa_last_step` update, delete-all + hash-insert, and the success-only `logSecurity` row. `json()` sets `Cache-Control: no-store` on the plaintext-code response (server.js:1238). `verifyTotpCode`'s format gate precedes `timingSafeEqual`, so the length-mismatch throw (Pitfall 1) is unreachable. 503 body copy is byte-distinct from the disable route's, honoring the D-81 guard.

**Client half — verified sound.** `tfaRecover` posts to the exact route; the regen stage's code field is 6-digit-only semantics (`inputmode="numeric"`, `autocomplete="one-time-code"`, dedicated `regenCodeLabel` — never the dual-shape disable `codeLabel`), satisfying the D-85 client half. Success order clears `S.ui.tfaStage` first (Pitfall 6), routes codes through transient `S.ui.recoveryCodes` into the reused D-53 modal; grep confirms no localStorage/sessionStorage write of `recoveryCodes` anywhere in `src/`. All mapped error codes (`wrongCurrentPassword`, `passwordRequired`, `codeRejected`, `tooManyAttempts`, `tfaNotEnabled`, `masterKeyMissing`) plus the client-only keys (`err.enterCurrentPassword`, `err.codeRequired`, `err.serverUnreachable`) and all six `settings.tfa.regen*` keys exist in both en.json and fr.json. Row-button mutual exclusion was correctly generalized (`stage ? '' :`), so both row buttons hide while any stage is open.

**Tests (test/tfa-recovery-regen.test.mjs) — verified sound.** Re-ran `node --test test/tfa-recovery-regen.test.mjs`: 5/5 pass on a real server + real SQLite. Coverage matches the plan's validation rows: happy path (10 distinct new hashes, old set burned, `used_at` null, last_step advanced, exactly one security_log row, no-store header), D-85 regression (captured plaintext code → 400 + byte-unchanged hash set), D-95 409 with zero mutation, D-93/D-94 throttle (5×403 then 429, code set untouched), stale-window 400 and corrupted-envelope 503 with zero mutation and no log row. Assertions are meaningful (hash-set deep-equality, header checks, mutation checks), not smoke tests.

Attempts to break the implementation failed: no injection surface (all statements are parameterized; no string-interpolated SQL with user input), no CSRF gap (sameOrigin first), no replay hole (D-04 guard updated in the same transaction as the burn), no plaintext-code persistence server- or client-side, no unhandled promise rejection in the new client handler (errors land in the mapped switch with a 503-specific branch). No critical or warning findings.

## Info

### IN-01: `security_log` is write-only with no retention or cleanup path

**File:** `server.js:162-168`
**Issue:** The table grows unbounded and has no reader until Phase 21's DIS-01 lands. Every successful regen (and, later, every Phase 21 event) adds a row forever; there is no pruning query anywhere.
**Fix:** Acceptable for now given D-99's deliberate minimalism and Phase 21 reusing the table verbatim. When Phase 21 introduces its first read, add a retention sweep (e.g., `delete from security_log where created_at < now() - RETENTION_MS`) alongside the heartbeat-style lazy sweeps already used for `attempts`/`pendingTfa`.

### IN-02: `logSecurity` prepares its insert statement on every call

**File:** `server.js:1425-1426`
**Issue:** `db.prepare('insert into security_log ...')` runs per call instead of using a cached prepared statement like the hottest paths do. One extra parse per successful regen — negligible, but it diverges from the cached-prepared-statement pattern used elsewhere in the file.
**Fix:** Hoist to a module-level `const insertSecurityLog = /* lazy */` or prepare inside `logSecurity` only once. Optional; fine to defer until Phase 21 makes this a hot path.

---

_Reviewed: 2026-10-29_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
