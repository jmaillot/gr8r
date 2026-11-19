---
phase: 73
review: 73-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    title: "onBip() judges `canShow()` before hydration — the real Chromium banner never renders"
  - id: WR-01
    severity: warning
    disposition: open
    title: "CTA strip renders the same string twice — text span and button are identical copy"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`renderStrip()` early-return ignores flavour and can stack strips during the exit window"
  - id: WR-03
    severity: warning
    disposition: fixed
    title: "e2e stub's 150 ms dispatch couples the suite to localhost boot latency, masking CR-01"
  - id: IN-01
    severity: info
    disposition: open
    title: "Double `hide(el)` on the unexpected-outcome path"
  - id: IN-02
    severity: info
    disposition: open
    title: "160 ms exit constant duplicated between CSS and JS"
  - id: IN-03
    severity: info
    disposition: open
    title: "Silent chunk-load failures swallow the whole feature"
  - id: IN-04
    severity: info
    disposition: open
    title: "300-frame retry budget is frame-count-based (~2.5 s at 120 Hz, stalls in background tabs)"
  - id: IN-05
    severity: info
    disposition: open
    title: "Unit test header comment still describes the pre-73-03 one-shot shape"
open: 7
total: 9
recorded: 2026-11-18T23:25:00.000Z
---

# Phase 73: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 73-03 commit f6661c5 — onBip bounded rAF retry; verified fixed in re-review |
| WR-01 | warning | open | re-reported (carryover) |
| WR-02 | warning | open | re-reported (carryover; reachability reduced by 73-03 caller guards) |
| WR-03 | warning | fixed | 73-03 commit 769b1b8 — rAF-timed pre-hydration e2e scenario; verified fixed in re-review |
| IN-01 | info | open | re-reported (carryover) |
| IN-02 | info | open | re-reported (carryover) |
| IN-03 | info | open | re-reported (carryover; matches pushMod house pattern) |
| IN-04 | info | open | new in 73-03 re-review |
| IN-05 | info | open | new in 73-03 re-review |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
