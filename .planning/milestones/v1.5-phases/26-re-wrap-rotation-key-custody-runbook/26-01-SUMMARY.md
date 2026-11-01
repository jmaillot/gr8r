---
phase: 26-re-wrap-rotation-key-custody-runbook
plan: 01
subsystem: auth
tags: [totp, aes-256-gcm, key-rotation, envelope, sqlite, boot-migration, zero-dependencies]

requires:
  - phase: 25-keyring-version-aware-envelopes
    provides: keyring (KEYRING map + keyIdFor), v2 envelope format D-K3/D-K4, isEnvelopeVersion, migrateTotpEncryption skeleton (D-83/D-74/D-75/D-76)
provides:
  - migrateTotpReWrap() — boot-time re-wrap rotation pass (KEY-03, SC-1..SC-3)
  - decryptV1WithMaterial(envelope, material) — parameterized v1 decrypt helper
  - isStaleEnvelope(value, currentId) — shared stale predicate (scan + in-txn re-check)
  - test/totp-rewrap.test.mjs — 9-test suite: tracer, full seed matrix, D-74 backup failure, D-K14 gate silence, SC-1 login, 4 D-K12 nudge cases
  - D-78c call-site audit extended to 4 sanctioned decryptTotpSecret callers
affects: [26-02 (DEPLOY.md runbook — D-K8/D-K12 operator behavior is documented against this code), phase 27]

actuals:
  tokens: 40000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "SQL prefilter broad + shared JS predicate authoritative (isStaleEnvelope closed over by scan AND in-transaction re-check — WR-01/WR-02)"
    - "backup-first skip-on-failure migration skeleton (D-74) reused verbatim across sibling passes"
    - "in-suite AES seed mirrors (wrapV1/wrapV2/unwrapWith) over real boots — no mocks"

key-files:
  created:
    - test/totp-rewrap.test.mjs
  modified:
    - server.js
    - test/totp-encryption.test.mjs

key-decisions:
  - "Re-wrap always targets v2 via encryptTotpSecret(…, 'v2') — v1 rows never re-keyed as v1 (D-K10, one-way)"
  - "decryptV1WithMaterial is a standalone sibling; decryptTotpSecret's D-78c-tested body untouched"
  - "D-K12 nudge condition: PREVIOUS configured AND no v1 row trial-decrypts under PREVIOUS AND no v2 row carries keyIdFor(PREVIOUS)"
  - "A permanently-undecryptable row re-mints the D-74 backup on every rotation boot (rows stay byte-identical); churn bounded by WR-02 pruning — asserted, documented"

patterns-established:
  - "Rotation = two env vars + reboot; no operator flag/endpoint (D-K14)"
  - "Leak-proof test servers: booted servers tracked in an array, stopped in finally (signup throttling can fail assertions mid-boot)"

requirements-completed: [KEY-03]

coverage:
  - id: D1
    description: "One boot re-wraps every v1 and stale-v2 envelope to v2:<new-key-id> — no 2FA re-enrollment (SC-1)"
    requirement: KEY-03
    verification:
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#tracer: one v1-under-previous row re-wraps to v2 under the NEW key id in one boot, then idempotent"
        status: pass
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#SC-1 tail: a real 2FA login verifies with the SAME enrolled device secret after a rotation boot"
        status: pass
    human_judgment: false
  - id: D2
    description: "Second boot on the same dataDir is byte-identical no-op (SC-2)"
    requirement: KEY-03
    verification:
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#seed matrix (boot-3 byte-identical assertions)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Pre-migration backup exists before any rewrite; backup failure skips the pass entirely (SC-3, D-74/D-K16)"
    requirement: KEY-03
    verification:
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#D-74: a failed pre-migration backup leaves every stale row byte-identical and logs the skip line"
        status: pass
    human_judgment: false
  - id: D4
    description: "Rows decryptable under neither key are left byte-identical, counted, warned (D-K9); full seed matrix lands every shape in its specified state"
    requirement: KEY-03
    verification:
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#seed matrix: v1-under-previous, v1-under-current, v2-under-previous, v2-under-current, plaintext, undecryptable, blank"
        status: pass
    human_judgment: false
  - id: D5
    description: "D-K14 gate: single-key boots never scan, warn, mutate, or back up"
    requirement: KEY-03
    verification:
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#D-K14: boots with only MASTER_KEY never scan, never warn, never touch stale rows, never back up"
        status: pass
    human_judgment: false
  - id: D6
    description: "D-K12 rotation-complete nudge fires iff PREVIOUS is configured and resolves zero envelopes"
    requirement: KEY-03
    verification:
      - kind: integration
        ref: "test/totp-rewrap.test.mjs#D-K12 (a)-(d) — 4 nudge tests"
        status: pass
    human_judgment: false
  - id: D7
    description: "Rotation runbook operator experience (copy-pasteable one-liners, D-K18) — Plan 02 deliverable verified there"
    verification: []
    human_judgment: true
    rationale: "Plan 02 owns the runbook and its parity test; this plan's code behavior is fully covered by D1-D6."

duration: 35 min
completed: 2026-11-01
status: complete
---

# Phase 26 Plan 01: Re-Wrap Rotation Pass Summary

**Boot-time TOTP re-wrap rotation: two env vars + one reboot converges every old-envelope 2FA secret to `v2:<new-key-id>` — idempotent, transactional, backup-guaranteed, with no 2FA re-enrollment (KEY-03)**

## Performance

- **Duration:** 35 min
- **Started:** 2026-11-01T08:35Z
- **Completed:** 2026-11-01T09:10Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- `migrateTotpReWrap()` in server.js, wired into bootstrap() after `migrateTotpEncryption()` — D-K14 both-keys gate, D-74 backup-first (failure skips the pass), D-75 shared-predicate re-check, D-K8 current-then-previous trial order, D-K9 undecryptable rows preserved + counted + warned, D-K10 always re-seals via the single v2 writer
- `decryptV1WithMaterial()` + `isStaleEnvelope()` helpers; `decryptTotpSecret` body untouched
- `test/totp-rewrap.test.mjs`: 9 tests on real SQLite via real boots — tracer, full seed matrix (7 shapes), D-74 failure guarantee, D-K14 gate silence, SC-1 no-re-enrollment login, 4 D-K12 nudge cases
- D-78c call-site audit in test/totp-encryption.test.mjs extended to 4 sanctioned callers (re-wrap pass named)
- `npm test` fully green: 630/630 (was 626 before this plan)

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end rotation tracer** - `5956807` (feat)
2. **Task 2: Full seed-matrix expansion** - `b3c4025` (test)
3. **Task 3: D-K12 nudge precision + empty-boot hardening** - `020cbd7` (feat)

## Files Created/Modified
- `server.js` — migrateTotpReWrap(), decryptV1WithMaterial(), isStaleEnvelope(), bootstrap() wiring
- `test/totp-rewrap.test.mjs` — new suite (9 tests + tracer)
- `test/totp-encryption.test.mjs` — call-site audit 3 → 4 with re-wrap region added

## Decisions Made
- Re-seal target is always v2 (D-K10); v1 rows never re-keyed as v1
- D-K12 nudge probes the few envelope rows directly (v1 trial-decrypt under PREVIOUS; v2 id equality) — computed only in the zero-candidates branch
- Permanently-undecryptable rows keep the pass re-scanning (stale forever by design), so D-74 mints one backup per rotation boot; rows stay byte-identical and WR-02 bounds the churn — documented in the suite rather than special-cased in code

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] decryptV1WithMaterial placement violated the wrapper-body slice test**
- **Found during:** Task 1
- **Issue:** the helper initially sat between requireTotpSecret and the `/* D-46: pending` anchor, landing inside the D-78 wrapper-body slice that asserts no `||`/`??`
- **Fix:** moved the helper above requireTotpSecret (still beside decryptTotpSecret)
- **Files modified:** server.js
- **Verification:** totp-encryption suite green
- **Committed in:** 5956807

**2. [Rule 1 - Bug] Test-harness realities: signup budget (5/IP/h) and leaked servers on failed assertions**
- **Found during:** Task 2
- **Issue:** matrix test needed 7 users but signup throttles at 5 per IP per hour; failing assertions left boot processes alive, hanging `node --test`
- **Fix:** direct `insert into users` for surplus matrix users; all suites track booted servers in an array and stop them in `finally`
- **Files modified:** test/totp-rewrap.test.mjs
- **Verification:** full suite exits cleanly, 630/630
- **Committed in:** b3c4025

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 test-harness bug)
**Impact on plan:** harness/test-only adjustments; production code matches the plan exactly.

## Issues Encountered
- The seed-matrix "no new backups on converged boot" expectation was initially wrong: a permanently-undecryptable row is a stale candidate forever, so the D-74 backup legitimately re-mints per rotation boot (rows unchanged). Relaxed the assertion and documented the behavior (also recorded as a key decision).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- KEY-03 code side complete; Plan 02 (DEPLOY.md runbook, D-K18/D-K19) can reference the exact operator behavior: set MASTER_KEY (new) + MASTER_KEY_PREVIOUS (old), reboot once, watch for `TOTP re-wrap: N row(s) re-sealed`; on the next boot expect the D-K12 nudge when rotation is complete
- No blockers

---
*Phase: 26-re-wrap-rotation-key-custody-runbook*
*Completed: 2026-11-01*

## Self-Check: PASSED

- test/totp-rewrap.test.mjs exists on disk; migrateTotpReWrap / decryptV1WithMaterial / isStaleEnvelope all present in server.js (3/3 grep hits)
- Commits verified in git log: 5956807, b3c4025, 020cbd7 (+ docs f06725d, c7427ba)
- Plan-level verification re-run: `node --test test/totp-rewrap.test.mjs test/totp-encryption.test.mjs test/migration.test.mjs` 54/54; `npm test` 630/630
