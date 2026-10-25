---
phase: 12
review: 12-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: skipped
    title: "`.modal.xl` width invariant silently fails below ~816px viewport width — the exact regression G-12-6 fixes reappears on narrow screens"
  - id: IN-01
    severity: info
    disposition: skipped
    title: "G-12-6 is a Firefox-specific behavior proven only in the Chromium project"
  - id: IN-02
    severity: info
    disposition: open
    title: "Width assertion (`toBeGreaterThan(800)`) is looser than the documented ≥866px invariant"
  - id: CR-01
    severity: critical
    disposition: open
open: 2
total: 4
recorded: 2026-10-25T17:55:26Z
---

# Phase 12: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | skipped | UAT round 3 test 5: user accepted the narrow-viewport fallback — below ~816px the toolbar collapses but the footer Download button still saves the file; tested by the user at ~700-800px |
| IN-01 | info | skipped | UAT round 3 test 4: pass in real Firefox AND Chrome — the human re-run replaces the Chromium-only proxy concern |
| IN-02 | info | open | - |
| CR-01 | critical | open | Suffix range on a zero-byte stored file produces a malformed 206 (`bytes 0--1/0`) and a synchronous `ERR_OUT_OF_RANGE` throw after headers are sent (server.js:1982-1985) (not in the current review) |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
