---
phase: 21-disable-2fa-verification-closure
review: 21-REVIEW.md
dispositioned: 2026-10-29
totals:
  critical: 0
  warning: 2
  info: 3
---

| Finding | Severity | Disposition | Note |
|---------|----------|-------------|------|
| WR-01 | warning | open | disable route missing `two_fa_enabled` check — 503 instead of 409; candidate gap/quick fix |
| WR-02 | warning | open | `tfa_disabled` verb logged outside transaction (500 on post-commit insert failure) |
| IN-01 | info | open | unused `server2` arg in enableTfa test call sites |
| IN-02 | info | open | e2e `loginWith2fa` approximate consumed step (retry-absorbed) |
| IN-03 | info | open | mailer speculative AUTH PLAIN when no AUTH advertised |
