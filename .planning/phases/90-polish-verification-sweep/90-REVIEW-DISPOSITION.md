# Phase 90 — Review Disposition Ledger

> One row per finding from 90-REVIEW.md. Default `open`; triaged rows record what happened and why.
> Review: status `issues_found` — 0 critical, 2 warning, 4 info (6 total).

| Finding | Severity | Summary | Disposition | Reason |
|---------|----------|---------|-------------|--------|
| WR-01 | warning | DR S3-fallback staged temp leaks on 4 early failure exits (snapshot-fail/catch, streamVerifyArchive fail, restoreTargetMismatch) — full instance credentials archive lingers in restore-staging until the boot-only sweep | fixed (b3a2e8fd) | snapshot-fail + snapshot-catch get explicit `dropStagedTmp()`; all post-snapshot failure exits covered by folding the drop into `cleanup()` (never on the success path before the D-89-30 in-tx re-hash — refusal classes untouched). Regression test in test/restore-instance.test.mjs (S3-sink harness, fails pre-fix) |
| WR-02 | warning | Cancel-during-flight race re-stages a stale rotation projection onto an unrelated New/Edit task form | fixed (da20260e) | `A.backupPreviewDeletions` captures the mounted form object before the await and bails if `S.ui.backupTaskForm !== form` after the response (the form object IS the token — no new global); `A.backupTaskNew` clears `S.ui.backupDeletions` as defense in depth. Source-assertion regression test in test/backup-rotation-preview.test.mjs (fails pre-fix) |
| IN-01 | info | Dead roster branch (unreachable render path) | open | Polish |
| IN-02 | info | Audit-before-stream TOCTOU on successful download | open | Acceptable per D-90-10 (audit on success); note for hardening backlog |
| IN-03 | info | Downloadable `deleted` runs from S3 | open | Consistent with tiering (capability is run-rights-based, not lifecycle-based); flag for owner decision |
| IN-04 | info | Unguarded preview button (double-click during in-flight projection) | open | Minor UX; throttle covers server cost |

## Fix commits (90-review --fix, 2026-11-23)

- `b3a2e8fd` — fix(90-review): drop the DR staged S3 temp on the four early failure exits (WR-01)
- `da20260e` — fix(90-review): stage-guard the rotation projection response on the mounted form (WR-02)
