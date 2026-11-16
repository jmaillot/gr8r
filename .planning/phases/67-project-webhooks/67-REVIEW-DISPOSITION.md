---
phase: 67
review: 67-REVIEW.md
titles: json
findings:
  - id: CR-01
    severity: critical
    disposition: fixed
    resolved_commit: 54827ed
    resolution: "dedup_key carries the diff's occurredAt as the occurrence component for doc-PUT events; same-occurrence replays stay exactly-once (test/webhook-delivery.test.mjs occurrence test)"
    title: "Repeat real-world events for the same subject are permanently dropped (dedup_key has no occurrence component)"
  - id: WR-01
    severity: warning
    disposition: fixed
    resolved_commit: 54827ed
    resolution: "ssrfOk returns the VERIFIED address set; the default delivery transport is pinnedFetch — the TLS connect resolves through the validated set (fail-closed), closing the within-attempt rebinding window"
    title: "SSRF guard is vulnerable to within-attempt DNS rebinding (TOCTOU between resolution and fetch)"
  - id: WR-02
    severity: warning
    disposition: open
    title: "IPv4-mapped and non-canonical IPv6 addresses bypass the deny-list"
  - id: WR-03
    severity: warning
    disposition: open
    title: "Hook-deleted dead-letter write can clobber a concurrent delivered status (unguarded UPDATE)"
  - id: WR-04
    severity: warning
    disposition: open
    title: "users.oid is never persisted for 2FA-enabled Entra accounts — D-14 mentions silently degrade"
  - id: IN-01
    severity: info
    disposition: open
    title: "truncateToCap truncates the first designated field, not the biggest"
  - id: IN-02
    severity: info
    disposition: open
    title: "events filter accepts duplicates"
  - id: IN-03
    severity: info
    disposition: open
    title: "unknown hook format renders a raw i18n key in the UI"
  - id: IN-04
    severity: info
    disposition: open
    title: "send-test route can block the HTTP response up to ~10 s per call"
open: 7
total: 9
recorded: 2026-11-16T12:12:47.126Z
---

# Phase 67: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| CR-01 | critical | fixed | 54827ed — occurrence component in the dedup key (occurredAt) |
| WR-01 | warning | fixed | 54827ed — pinnedFetch: connect resolves through the validated set |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
