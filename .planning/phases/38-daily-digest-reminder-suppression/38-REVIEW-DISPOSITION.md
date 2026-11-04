---
phase: 38-daily-digest-reminder-suppression
review: 38-REVIEW.md
recorded: 2026-11-04T00:00:00Z
total: 5
open: 5
fixed: 0
skipped: 0
---

# Phase 38 — Code Review Disposition

One row per finding from `38-REVIEW.md`. Default disposition: `open`.

| Finding | Severity | File | Summary | Disposition | Reason |
|---------|----------|------|---------|-------------|--------|
| CR-01 | critical | server.js:1495-1511 | Digest task filter keyed on assignee's membership, never the recipient — no assignee===recipient filter; recipients get everyone's due/overdue tasks incl. ones they can't see | open | — |
| WR-01 | warning | test/digest.test.mjs | All fixtures single-member; suite structurally cannot catch CR-01; T-38-01 scope test never written | open | — |
| WR-02 | warning | test/digest.test.mjs:246,248,279,351 | Four vacuous assertions (`|| true`/tautologies) on D-12/D-11 pins | open | — |
| IN-01 | info | server.js | Duplicate stored-prefs read per notif row in suppression gate | open | — |
| IN-02 | info | server.js | Digest lost on transient SMTP failure with only console.warn (accepted per T-38-03) | open | Flagged for the record; T-38-03 accepted this trade-off |
