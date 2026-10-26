---
phase: 13-investigation-invariant-pinning
plan: "02"
subsystem: docs
tags: [gap-closure, doc-contracts, 2fa, throttle, reconciliation]

# Dependency graph
requires:
  - "13-01 (the 13-DECISIONS.md artifact this plan reconciles, and 13-01-SUMMARY.md whose count it corrects)"
  - "13-VERIFICATION.md gaps 1–2 (the failed/partial truths this plan closes)"
provides:
  - "D-04 with one landing-phase answer: Phase 14 owns the replay-guard column (AUTH-02 additive migration + byte-identical second-boot test coverage), Phase 16 owns the guard behavior (login + settings verify paths) — stated identically in the D-04 Consumed-by and the Downstream consumer map row"
  - "D-13 with one override scope: the existing server.js:1235 429 copy is itself replaced with the pinned generic copy when Phase 17 touches the login flow — Scope resolution sentence in the body plus a matching Consumed-by extension"
  - "13-01-SUMMARY.md recording the verified citation count (16) in both count locations, with an erratum note attributing the correction"
affects: [14-schema-session-ground-truth, 16-totp-core-enrollment, 17-login-second-factor]

actuals:
  tokens: 5989
  tasks: 3
  commits: 3
plan_head_before: 1bf4ded003faf4e6e5c3b06b3e6662348911666c
plan_head_after: f282a71691bd4b2dcd8cc07ff4f0d13c46509da2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "gap-closure plan: verify chains assert BOTH removal of contradictory wording AND presence of the reconciled split, with grep-guarded counts as tamper detection"

key-files:
  created: []
  modified:
    - .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md
    - .planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md

key-decisions:
  - "D-04 resolution follows the verification's recommendation and three converging sources (ROADMAP Phase 14 goal + SC4, D-01's additive-migration assignment, D-04's own CONTEXT contract): Phase 14 = column + second-boot test coverage, Phase 16 = guard behavior"
  - "D-13 resolution: the override applies to the existing server.js:1235 string itself, not only to new endpoints — one logical login = one budget (D-03/D-11) forces identical disclosure (or none) on the password and 2FA steps; legacy-copy replacement is Phase 17's responsibility"
  - "Count correction uses grep -c line-count semantics (16), never grep -o occurrences (17 — one line carries two tags), matching the semantics every gate and check row in this phase records"

patterns-established: []

requirements-completed: []   # foundation phase — ROADMAP assigns no requirement IDs to Phase 13

coverage:
  - id: G1
    description: "Gap 1 (failed truth): D-04 cites to one landing phase — Phase 14 (column + byte-identical second-boot test coverage) / Phase 16 (guard behavior); no 'Phase 16 (migration' wording remains; consumer map row agrees"
    verification:
      - kind: other
        ref: "sed D-04..D-05 region | grep -ci 'Phase 16 (migration' => 0; region greps: 'Phase 14'+'AUTH-02' present, 'byte-identical second-boot' present, 'Phase 16 implements the guard behavior' present"
        status: pass
      - kind: other
        ref: "sed '/## Downstream consumer map/,$' | grep 'replay-guard column with byte-identical second-boot test coverage), Phase 16' => match; Phase 17 entry unchanged"
        status: pass
      - kind: other
        ref: "D-04 first contract line 'same migration as the other 2FA columns' unchanged (line 152)"
        status: pass
    human_judgment: false
  - id: G2
    description: "Gap 2 (partial truth): D-13 scope resolved — Scope resolution sentence present, server.js:1235 replacement obligation stated with D-03/D-11 shared-budget justification, Consumed-by extended with 'failure copy — including' clause, original no-copy-to-new-endpoints clause preserved"
    verification:
      - kind: other
        ref: "sed D-13..D-14 region greps: 'Scope resolution:', 'server.js:1235', '(\"Try again in 15 minutes.\")', 'is also replaced with the pinned generic copy', 'must disclose identically', 'failure copy — including', 'must NOT copy that string to new endpoints' => all match"
        status: pass
    human_judgment: false
  - id: IN01
    description: "Advisory IN-01: 13-01-SUMMARY.md count records corrected 11 → 16 in both locations, erratum note added, nothing else changed"
    verification:
      - kind: other
        ref: "grep -c '11 (>= 10)\\|11 (expected' 13-01-SUMMARY.md => 0; '=> 16 (>= 10)' present; '16 (expected ≥ 10)' present; erratum names 13-02; live grep -c '[VERIFIED: ' => 16 re-measured before edit"
        status: pass
      - kind: other
        ref: "git diff --stat on 13-01-SUMMARY.md => 7 insertions, 2 deletions (two count lines + erratum block only)"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-10-26
status: complete
---

# Phase 13 Plan 02: Gap Closure — D-04 Landing Phase, D-13 Override Scope, Count Refresh Summary

**13-DECISIONS.md now cites to one answer on both verification gaps: D-04's replay-guard column lands in Phase 14 (AUTH-02 migration) with Phase 16 owning the guard behavior, and D-13's generic-copy override covers the existing server.js:1235 429 string itself; 13-01-SUMMARY.md's citation count corrected 11 → 16 with erratum**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-10-26T13:00:58Z
- **Completed:** 2026-10-26T13:07Z
- **Tasks:** 3
- **Files modified:** 2 (13-DECISIONS.md: +14/−4 across three locations; 13-01-SUMMARY.md: +7/−2)

## Accomplishments

- **Gap 1 closed (failed truth):** D-04's Consumed-by line no longer names Phase 16 as the
  migrator. It now states the split — Phase 14 adds the replay-guard column in the AUTH-02
  additive migration (same migration as the other 2FA columns, with byte-identical
  second-boot test coverage); Phase 16 implements the guard behavior in the login and
  settings-page verify paths. The Downstream consumer map's "Pending-2FA login mechanism"
  row mirrors the same split and keeps its Phase 17 entry unchanged. A Phase 14 or Phase 16
  planner citing D-04 now gets exactly one answer.
- **Gap 2 closed (partial truth):** D-13 gained a bolded "Scope resolution:" sentence: the
  override applies to the existing string itself — when Phase 17 touches the login flow, the
  existing `server.js:1235` 429 copy ("Try again in 15 minutes.") is also replaced with the
  pinned generic copy, because the password and 2FA steps share one budget (D-03/D-11) and
  must disclose identically — or not at all. The Consumed-by line now reads "every throttle
  response's failure copy — including the replacement of the pre-existing `server.js:1235`
  429 copy on the login password step, landing when Phase 17 reworks the login flow." The
  original "must NOT copy that string to new endpoints" clause is preserved — both readings
  converge rather than one being deleted.
- **Advisory IN-01 closed:** 13-01-SUMMARY.md's two stale count records (frontmatter
  coverage ref, Verification Run table row) now read 16, matching the live measured
  `grep -c '\[VERIFIED: '` count (re-measured before editing, per the threat model T-13-06
  gate). A one-erratum note under the Verification Run table attributes the correction to
  13-02 and records the under-claiming nature (no gate outcome changed). Command text was
  left untouched; only the result values were stale.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): Reconcile D-04's landing phase** — `85cc20a` (docs)
2. **Task 2: Resolve D-13's override scope** — `6a4b6cb` (docs)
3. **Task 3: Advisory ride-along — 13-01-SUMMARY count correction** — `f282a71` (docs)

## Files Created/Modified

- `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md` — D-04 Consumed-by
  rewritten (2 → 5 lines, split ownership); D-13 body gains the Scope resolution sentence
  and its Consumed-by is extended; consumer map row gains the Phase 14/Phase 16 split. All
  17 D-NN entries, 16 [VERIFIED: citation lines (grep -c), five prohibitions, and both
  contract lines verified untouched.
- `.planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md` — two count values
  corrected (11 → 16) plus one erratum note; no other line touched.

No source, test, or config file was touched — documentation reconciliation only.

## Decisions Made

- **D-04 resolution = Phase 14 for the column, per the verification's `missing`
  recommendation.** Three independent sources converge: ROADMAP Phase 14's goal and success
  criterion 4 (AUTH-02 migration with byte-identical second boot), D-01's assignment of the
  additive `login_challenges` migration to Phase 14, and D-04's own CONTEXT contract ("in
  the same migration as the other 2FA columns"). Phase 16 owns behavior, not DDL.
- **D-13 resolution replaces the legacy string at Phase 17, not Phase 16.** The new throttle
  call sites belong to Phases 15–17; the login flow rework (where the legacy string lives)
  is Phase 17's responsibility — so the Consumed-by assigns the replacement there.
- **Edit formatting constrained by the verify greps.** The gates are line-based grep
  assertions, so the new prose was wrapped so each gated substring ("byte-identical
  second-boot", "must disclose identically") sits on a single line — substance unchanged.

## Deviations from Plan

None — plan executed exactly as written. Both tracer/auto verify chains passed as
specified (after line-wrap fixes to satisfy the line-based grep gates, with prose substance
identical to the plan's prescribed wording).

## Issues Encountered

None. The verify chains passed cleanly; the [VERIFIED: citation count held at 16 (grep -c)
through every task; the D-NN inventory stayed at 17 unique IDs; zero TODO/TBD/FIXME markers.

## Verification Run

| Check | Command | Result |
|-------|---------|--------|
| D-04: old wording removed | `sed -n '/^- \*\*D-04:/,/^- \*\*D-05:/p' 13-DECISIONS.md \| grep -ci 'Phase 16 (migration'` | 0 (expected 0) |
| D-04: Phase 14 + AUTH-02 present | region grep `'Phase 14'`/`'AUTH-02'` | match |
| D-04: second-boot attribution | region grep `'byte-identical second-boot'` | match |
| D-04: Phase 16 behavior clause | region grep `'Phase 16 implements the guard behavior'` | match |
| Consumer map row split | map grep `'replay-guard column with byte-identical second-boot test coverage), Phase 16'` | match; Phase 17 entry unchanged |
| D-13: scope sentence | region greps: `'Scope resolution:'`, `'server.js:1235'`, `'("Try again in 15 minutes.")'`, `'is also replaced with the pinned generic copy'`, `'must disclose identically'` | all match |
| D-13: Consumed-by extended | region grep `'failure copy — including'` | match |
| D-13: original clause kept | region grep `'must NOT copy that string to new endpoints'` | match (1) |
| Citation count unchanged | `grep -c '\[VERIFIED: ' 13-DECISIONS.md` | 16 (expected 16) — re-run after each task |
| D-NN inventory | `grep -oE '\*\*D-[0-9]{2}:' … \| sort -u \| wc -l` | 17 unique, no gaps |
| Prohibitions untouched | spot-grep prohibition 2 (D-13 no-timing-disclosure) | verbatim |
| Unfinished-work markers | `grep -cE 'TODO\|TBD\|\bFIXME\b' 13-DECISIONS.md` | 0 |
| SUMMARY count correction | `grep -c '11 (>= 10)\|11 (expected' 13-01-SUMMARY.md` | 0 (expected 0); `'=> 16 (>= 10)'` and `'16 (expected ≥ 10)'` both present; erratum naming 13-02 present |

## Known Stubs

None.

## User Setup Required

None — documentation-only plan.

## Next Phase Readiness

- Phase 14 planning can cite D-04 without a landing-phase contradiction: the replay-guard
  column belongs to the AUTH-02 additive migration, alongside the `login_challenges` DDL
  and the doc-field removal.
- Phase 16 planning implements the guard behavior (login + settings verify paths) but owns
  no replay-guard DDL.
- Phase 17 planning must budget the legacy `server.js:1235` copy replacement in the login
  flow rework, per D-13's resolved scope — the password step may not keep disclosing the
  window while the 2FA step does not.
- Both 13-VERIFICATION.md gaps are closed; a re-verification should now score 7/7.

## Self-Check

## Self-Check: PASSED

- `13-DECISIONS.md` and `13-01-SUMMARY.md` exist at the expected paths with the expected edits.
- Commits `85cc20a`, `6a4b6cb`, `f282a71` all exist in history (3 task commits,
  `1bf4ded..f282a71`).
- All verify chains pass; citation count 16 (grep -c); 17 unique D-NN entries; prohibitions
  verbatim.

---
*Phase: 13-investigation-invariant-pinning*
*Completed: 2026-10-26*
