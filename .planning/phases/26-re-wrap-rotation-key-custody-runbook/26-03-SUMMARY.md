---
phase: 26-re-wrap-rotation-key-custody-runbook
plan: 03
subsystem: auth
tags: [totp, key-rotation, runbook, deploy-docs, gap-closure, parity-tests]

requires:
  - phase: 26-re-wrap-rotation-key-custody-runbook
    plan: 01
    provides: migrateTotpReWrap() boot pass, D-K7 scan wording, D-K14 gate, keyring (MASTER_KEY/MASTER_KEY_PREVIOUS)
  - phase: 26-re-wrap-rotation-key-custody-runbook
    plan: 02
    provides: DEPLOY.md §14 runbook structure, env-only key-id discovery pattern, doc-parsing parity tests
provides:
  - DEPLOY.md §14 pre-rotation precondition block (image currency + key-id coverage) — a stale image or a keyring missing the old key is caught BEFORE rotating (G-26-1)
  - DEPLOY.md §14 recovery note: D-K7 line with no re-wrap line ⇒ old key absent from keyring; restore old key as MASTER_KEY, rows byte-identical, no data loss
affects: []

actuals:
  tokens: 1227
  tasks: 2
  commits: 1

tech-stack:
  added: []
  patterns:
    - "Precondition gate in a runbook: copy-pasteable check with expected output, stated failure mode, and a stop rule (never rotate on a failed check)"

key-files:
  created: []
  modified:
    - DEPLOY.md

key-decisions:
  - "Preconditions gate the top of 'Running a rotation' as a numbered pair with explicit expected outputs — an operator who skips them hits the stated lock-out symptom in the prose"
  - "Key-id coverage compares distinct substr(two_fa_secret,1,11) prefixes (v2: + 8 hex = 11 chars) against id(MASTER_KEY_PREVIOUS) read from the container env — keys never on argv (T-26-08)"
  - "Recovery note conditions explicitly on D-K7 line present AND no 'TOTP re-wrap:' line, cross-referencing the neither-key manual path for the other failure mode (T-26-09)"

requirements-completed: [KEY-04]

coverage:
  - id: D1
    description: "§14 pre-rotation precondition block: image-currency grep (migrateTotpReWrap ≥ 1) and key-id coverage check (id(MASTER_KEY_PREVIOUS) vs DB-stamped v2 envelope ids), each copy-pasteable with expected output and the G-26-1 failure mode stated"
    requirement: KEY-04
    verification:
      - kind: command
        ref: "grep -c migrateTotpReWrap DEPLOY.md → 2"
        status: pass
      - kind: command
        ref: "grep -c MASTER_KEY_PREVIOUS DEPLOY.md → 11 (was 7)"
        status: pass
      - kind: test
        ref: "test/totp-rewrap.test.mjs#runbook parity (both tests pass against the edited §14 — parsed anchors intact)"
        status: pass
    human_judgment: false
  - id: D2
    description: "§14 recovery note: D-K7 line + no re-wrap line ⇒ old key absent from keyring; restore OLD key as MASTER_KEY to recover login; rows byte-identical, no data loss; then fix env/image and re-run from the preconditions"
    requirement: KEY-04
    verification:
      - kind: command
        ref: "grep -ci 'no data loss' DEPLOY.md → 1"
        status: pass
      - kind: command
        ref: "grep -c 'unrecognized secret envelope version' DEPLOY.md → ≥1 (D-K7 wording quoted verbatim from server.js:1308)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Runbook-parity suite and full suite stay green against the edited §14 (no test changes needed)"
    verification:
      - kind: unit
        ref: "node --test test/totp-rewrap.test.mjs → 11 pass / 0 fail"
        status: pass
      - kind: unit
        ref: "npm test → 632 pass / 0 fail"
        status: pass
    human_judgment: false
  - id: D4
    description: "Operator-readability of the hardened §14 (would the checks actually stop a repeat of the staging incident?)"
    verification: []
    human_judgment: true
    rationale: "Whether the precondition prose actually gates an operator mid-rotation is a judgment call — the commands and the no-data-loss guarantee are machine-verified, the gating narrative is not."

duration: 4 min
completed: 2026-11-01
status: complete
commits: 1
plan_head_before: 785226e6c1e0a305fdfa74f8980826e9794a1d9d
plan_head_after: a4e28fc300348c3e844c408e1e01551011292bd6
---

# Phase 26 Plan 03: §14 Pre-Rotation Preconditions & Recovery Note (G-26-1 Closure) Summary

**DEPLOY.md §14 now stops a broken keyring BEFORE rotating — image-currency grep (`migrateTotpReWrap ≥ 1`) and key-id coverage (`id(MASTER_KEY_PREVIOUS)` vs DB-stamped `v2:` ids) — and a no-data-loss recovery note covers the D-K7-without-re-wrap signature (closes gap G-26-1)**

## Performance

- **Duration:** 4 min
- **Started:** 2026-11-01T09:35:37Z
- **Completed:** 2026-11-01T09:38:38Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- §14 "Running a rotation" is gated by "Before you rotate — two checks": (1) image currency — `docker compose exec projects sh -c 'grep -c migrateTotpReWrap server.js'` must print ≥ 1, else the image predates the re-wrap pass and the operator rebuilds first; (2) key-id coverage — the id of `MASTER_KEY_PREVIOUS` read from the container env (env-only, never argv, per T-26-08) must match every distinct `substr(two_fa_secret, 1, 11)` prefix stamped on `v2:` rows (sqlite3 + container one-liner variants, D-K13 query style), with the current-generation case and the one-generation stop rule stated
- New subsection "If the rotation boot logged an unrecognized-version line but no re-wrap line": conditions on the verbatim D-K7 log line (server.js:1308) AND the absence of any `TOTP re-wrap:` line; recovery restores the OLD key as `MASTER_KEY` (remove PREVIOUS) and reboots — the row's key id resolves again and login works; rows are byte-identical, **no data loss**; then fix env/image and re-run from the preconditions. Explicitly cross-references the neither-key manual-recovery path for the different failure signature (T-26-09)
- Both checks state WHY: skipping them means the D-K14 gate never opens, no re-wrap runs, and 2FA verification fails closed (503 `masterKeyMissing`) — exactly the G-26-1 staging incident
- No server.js changes; no other DEPLOY.md sections renumbered (§14 through Appendix unchanged in numbering)

## Task Commits

1. **Task 1: §14 pre-rotation preconditions + keyring-miss recovery note** - `a4e28fc` (docs)
2. **Task 2: Runbook-parity suite green against the edited §14** - no commit (no changes needed; doc-parsing anchors unaffected by the additions — recorded per plan)

## Files Created/Modified
- `DEPLOY.md` — +88 lines in §14 only (precondition block in "Running a rotation"; recovery-note subsection after it)

## Decisions Made
- Preconditions placed at the top of "Running a rotation" as a numbered pair before step 1 (edit the .env), each with expected output and the stop rule — matching the plan's "Before you rotate — two checks" framing
- Key-id precondition uses the existing container-env `node -e` pattern adapted to `process.env.MASTER_KEY_PREVIOUS`; no echo-pipe variant documented (Pitfall 5, T-26-08)
- The DB-side listing uses `substr(two_fa_secret, 1, 11)` (`v2:` + 8 hex = 11 chars) with both sqlite3 and `docker compose exec` variants, mirroring the D-K13 query presentation

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - documentation-only plan.

## Next Phase Readiness
- G-26-1 closed at the documentation layer: an operator following §14 cannot repeat the staging incident without ignoring two explicit stop-gates, and the recovery note restores login with zero data loss if it happens anyway
- Phase 26 complete (26-01, 26-02, 26-03); ready for re-verification of the UAT Test 1 flow on staging by a human
- No blockers

---
*Phase: 26-re-wrap-rotation-key-custody-runbook*
*Completed: 2026-11-01*
