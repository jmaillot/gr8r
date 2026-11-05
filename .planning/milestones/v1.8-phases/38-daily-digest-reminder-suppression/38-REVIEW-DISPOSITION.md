---
phase: 38-daily-digest-reminder-suppression
review: 38-REVIEW.md
recorded: 2026-11-04T21:10:00Z
total: 5
open: 1
fixed: 3
skipped: 1
---

# Phase 38 — Code Review Disposition

One row per finding from `38-REVIEW.md`. Default disposition: `open`.

Updated after 38-03 gap-closure execution and re-verification (7/7 must-haves, gaps closed).

| Finding | Severity | File | Summary | Disposition | Reason |
|---------|----------|------|---------|-------------|--------|
| CR-01 | critical | server.js:1495-1511 | Digest task filter keyed on assignee's membership, never the recipient — no assignee===recipient filter; recipients get everyone's due/overdue tasks incl. ones they can't see | fixed | 38-03: `t.assignee === r.member_id` first filter at server.js:1500; multi-member CI pin (RED→GREEN); re-verification 7/7 passed |
| WR-01 | warning | test/digest.test.mjs | All fixtures single-member; suite structurally cannot catch CR-01; T-38-01 scope test never written | fixed | 38-03: multi-member recipient-scope pin via addPeerMember (test/digest.test.mjs:189+), suite now catches the leak class |
| WR-02 | warning | test/digest.test.mjs:246,248,279,351 | Four vacuous assertions (`|| true`/tautologies) on D-12/D-11 pins | fixed | 38-03: all four sites rewritten to real falsifiable assertions (grep `|| true`/`? 0 : 1` → 0 matches); note: plan's proposed `resB.digests === 0` at site 248 was falsified by correct overdue catch-up — pinned `=== 1` with wsB zero-contribution proven separately |
| IN-01 | info | server.js | Duplicate stored-prefs read per notif row in suppression gate | open | Performance nit, out of gap-closure scope |
| IN-02 | info | server.js | Digest lost on transient SMTP failure with only console.warn (accepted per T-38-03) | skipped | Accepted trade-off per T-38-03 decision |
