# Phase 63: VIEW-02 De-Flake - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 63-view-02-de-flake
**Areas discussed:** Proof protocol N, App-bug policy, Isolation scope, Evidence artifacts

---

## Proof protocol N

| Option | Description | Selected |
|--------|-------------|----------|
| N=10 (Recommended) | 10 iterations, retries=0, --workers=1, pre-warmed server; strong signal for a ~1-in-5 flake | ✓ |
| N=5 | Fastest signal; risk of a rare race slipping through to Phase 64 | |
| N=20 | Near-certain proof but slow; overkill unless timing-marginal | |
| Tiered 5→20 | N=5 during fix loop, one final N=20 confirmation | |

**User's choice:** N=10
**Notes:** Follow-up: isolated proof alone judged insufficient (flake manifests under
inter-spec load) → one full parallel suite run added as a phase gate (D-02).
Alternatives considered: isolated only (defer to Phase 64), full suite ×2 (extra cost).

---

## App-bug policy

| Option | Description | Selected |
|--------|-------------|----------|
| Fix now, review later (Recommended) | Fix in-phase per ROADMAP SC-4; fix + regression test as separate commit; owner reviews at verification/UAT | ✓ |
| Flag and stop (D-07) | Carry Phase 62 precedent: stop for owner ruling before any app change | |
| Fix contained, halt wide | Fix only if contained to persistLiveView debounce; halt for anything wider | |

**User's choice:** Fix now, review later
**Notes:** Explicitly overrides Phase 62 D-07 for this phase — ROADMAP SC-4 already rules
fix-in-app.

---

## Isolation scope

| Option | Description | Selected |
|--------|-------------|----------|
| No isolation (Recommended) | VIEW-02 must pass in the default parallel run; fix = real awaited signals, not quarantine | ✓ |
| Serial if coupled | Allow test.describe.serial for saved-views file only if cross-spec coupling proven | |
| Per-file workers=1 | Per-file config override; weakens parallel contract for that file | |

**User's choice:** No isolation
**Notes:** Isolation would hide a race rather than fix it.

---

## Evidence artifacts

| Option | Description | Selected |
|--------|-------------|----------|
| 63-TRIAGE.md (Recommended) | Phase-dir triage doc: hypothesis × evidence table, trace excerpts, run commands, verdict; committed; SUMMARY links it | ✓ |
| SUMMARY-only | Evidence embedded in plan SUMMARY.md only — lighter, harder to audit | |
| Triage doc + spec comments | TRIAGE.md plus inline spec comments citing root cause at changed lines | |

**User's choice:** 63-TRIAGE.md
**Notes:** None.

---

## the agent's Discretion

None — all four gray areas explicitly decided by the owner.

## Deferred Ideas

None — discussion stayed within phase scope.
