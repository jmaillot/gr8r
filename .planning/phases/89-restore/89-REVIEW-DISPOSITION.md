---
phase: 89
review: 89-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "restoreInstanceUnit leaks the global restore_lock on early failure paths — instance wedged until reboot"
  - id: WR-01
    severity: warning
    disposition: fixed
    title: "DR team_members rows skip the team_id validation the overwrite path enforces — NULL crashes the whole DR tx unkeyed; dangling team refs insert silently"
  - id: WR-02
    severity: warning
    disposition: fixed
    title: "DR member_id dedupe is global across workspaces, but member_id is per-workspace scoped — valid roster rows get skipped"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "DR `delete from workspaces` silently cascade-deletes api_keys — an undisclosed destructive side effect outside the D-89-7 skip report"
  - id: WR-04
    severity: warning
    disposition: fixed
    title: "all three restore units buffer staged ndjson whole into memory — violates the module's own P3 posture, OOM risk on large operational tables"
  - id: IN-01
    severity: info
    disposition: open
    title: "dead code — import-as-new member_id collision fallback can never fire"
  - id: IN-02
    severity: info
    disposition: open
    title: "project-scope splice resolves member ids against one variant; the overwrite unit resolves against two"
  - id: IN-03
    severity: info
    disposition: open
    title: "`notifs` / `activity` / `events` ferry stale member_id references verbatim"
  - id: IN-04
    severity: info
    disposition: open
    title: "overwrite summary omits flagged (missingBlob) file restorations that the import summary reports"
  - id: IN-05
    severity: info
    disposition: open
    title: "backup archive-name collision guard gives up at 100 and then clobbers"
  - id: IN-06
    severity: info
    disposition: open
    title: "swap staging collides when a file id and a logo id share a value"
  - id: IN-07
    severity: info
    disposition: open
    title: "pre-existing 5-locale parity debt (not introduced by this phase)"
  - id: IN-08
    severity: info
    disposition: open
    title: "closing the preview drawer leaves `S.ui.restoreTarget` armed"
  - id: IN-09
    severity: info
    disposition: open
    title: "engine-side pre_restore audit rows record actor_name 'unknown'"
open: 9
total: 14
recorded: 2026-11-23T08:46:23.937Z
---

# Phase 89: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 89-REVIEW-FIX.md |
| WR-01 | warning | fixed | 89-REVIEW-FIX.md (hand-reconciled: fixer re-titled the finding; fix commit f86de580) |
| WR-02 | warning | fixed | 89-REVIEW-FIX.md (hand-reconciled: fixer re-titled the finding; fix commit b567fb68) |
| WR-03 | warning | fixed | 89-REVIEW-FIX.md (hand-reconciled: fixer re-titled the finding; fix commit 17508393) |
| WR-04 | warning | fixed | 89-REVIEW-FIX.md (hand-reconciled: fixer re-titled the finding; fix commit 0b1b0a8a) |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |
| IN-08 | info | open | - |
| IN-09 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
