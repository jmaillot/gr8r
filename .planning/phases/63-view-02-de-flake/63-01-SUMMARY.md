---
phase: 63-view-02-de-flake
plan: 01
subsystem: e2e-triage
tags: [flaky, playwright, saved-views, triage]
requires: []
provides: [63-TRIAGE.md verdict gating Plans 02/03]
affects: [63-02, 63-03]
tech-stack:
  added: []
  patterns: [trace.network JSONL extraction, error-context DOM snapshots]
key-files:
  created:
    - .planning/phases/63-view-02-de-flake/63-TRIAGE.md
  modified: []
decisions:
  - D-03 ruled NOT PROVEN — no app fix lands; Plan 03 documents no-bug and runs gates only
  - Plan 02 fix scope = scoped toast assertions + Escape dismissal + awaited network signals
metrics:
  duration: ~45 min
  completed: 2026-11-14
  tasks: 2
  commits: 1
  plan_head_before: 5777f88d23d8aa4abed349936a0a62f32860c699
  plan_head_after: 5b0bbd7
status: complete
---

# Phase 63 Plan 01: VIEW-02 Triage Summary

**One-liner:** Reproduced the VIEW-02 failure 10/10 in fast serial runs and 0/10 under full parallel load (112/112), proving the root cause is the spec's unscoped toast locator racing the app's 4200 ms toast lifetime — all three ROADMAP hypotheses eliminated, D-03 app bug ruled NOT PROVEN.

## What was done

- **Round A** — `--repeat-each=10 --workers=1 --retries=0`: **10/10 failed** (7× strict-mode toast violation at spec line 125; 3× missing empty-state at line 132).
- **Round B** — same + `--trace on`: 10/10 failed; trace.network extraction showed all 6 `/api/me/views` PUTs HTTP 200 in normal order (no dropped/delayed writes → H1 eliminated); error-context DOM snapshot captured the decisive evidence — three coexisting toasts (`saved`/`applied`/`saved`).
- **Round C** — full parallel suite, retries=0: **112 passed (6.9m)**, VIEW-02 included → the failure is triggered by *speed*, not load (inverts the historical assumption).
- **Round D** — single cold run: passed (bounds the race window to the ~4.2 s toast lifetime).
- Wrote `63-TRIAGE.md` (D-05): verbatim commands, three evidenced H-rows, A1/A3 confirmed + A2 carried forward, verdict with the NOT-PROVEN D-03 ruling and Plan 02 fix scope.

## Deviations from Plan

None — plan executed as written. (Two supplementary actions, both within triage discretion: a Round D single cold run to bound the race window, and a `sed` reformat of the three H-rows so the plan's own verify grep `^| H[123]` matches — the grep contract was the commit-5777f88 concern and the verify initially failed on `| **H1**`.)

## Known Stubs

None. No code was changed in this plan (`git diff --stat src/ e2e/` across the plan's commits: empty).

## Verification

- Task 1: all three+ logs non-empty with Playwright summaries (`grep "passed\|failed"` on each) ✓
- Task 2: `grep -c "^| H[123]" 63-TRIAGE.md` → 3; "verdict" and "not proven" present; file tracked in git ✓
- Plan-level: no src/ or e2e/ changes in plan commits ✓

## Self-Check: PASSED

- FOUND: .planning/phases/63-view-02-de-flake/63-TRIAGE.md (tracked, commit 5b0bbd7)
- Evidence logs retained at /tmp/opencode/phase63-triage-{a,b,c,d}.log (ephemeral, never committed per T-63-01)

## Deferred Issues

- Per-run `WARN login failed` double-login bounce (127.0.0.1 + 10.x IP, test still proceeds) — pre-existing, unrelated to the flake; out of scope per the opportunistic-repair rule.
- Popover double-refresh ordering race (§4.6 of TRIAGE) — plausible app-side stale-write, NOT proven to violate a contract; Plan 02 closes the window spec-side via awaited signals.
