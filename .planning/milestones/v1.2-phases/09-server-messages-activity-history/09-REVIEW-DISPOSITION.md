---
phase: 09-server-messages-activity-history
review: 09-REVIEW.md
status: passed
recorded: 2026-10-24
recheck: 2026-10-24
counts:
  critical: 0
  warning: 0
  info: 2
  total: 18
open: 2
resolved: 16
recheck_commit: 15401dc
---

# Review Disposition — Phase 09

Updated after the gap-closure wave (09-04..09-07) and the re-review (`15401dc`).
All 16 findings from the initial review verified resolved in source; 2 new info-level
findings were introduced by the fix wave and remain open (advisory — non-blocking).

| Finding | Severity | Disposition | Note |
|---------|----------|-------------|------|
| CR-01 | critical | resolved | `13804a9` — codes on all 8 thrown httpError sites |
| CR-02 | critical | resolved | `4058b34` — whole-payload vars at api.js:62; e2e French no-braces test |
| CR-03 | critical | resolved | `235523c` — legacy prose suppressed at render; pin un-skipped |
| WR-01 | warning | resolved | `ff3ae40` — createdProject in projects filter |
| WR-02 | warning | resolved | `ff3ae40` — `e.value ?? ''` fallback for missing member |
| WR-03 | warning | resolved | `3278ff5` — TRUST_PROXY strictly opt-in |
| WR-04 | warning | resolved | `c748af4` — boot gate: SMTP_HOST without APP_URL exits 1 |
| WR-05 | warning | resolved | `13804a9` — readJson drains then 413 (integration-pinned) |
| WR-06 | warning | resolved | `13804a9` — UNIQUE → 409 accountExists |
| WR-07 | warning | resolved | `ec0c945` — sameOrigin on login/signup before body read |
| WR-08 | warning | resolved | `c88b115` — MOD → lazy modKey() getter, 6 call sites |
| WR-09 | warning | resolved | `235523c` — suppression pin enabled and green |
| IN-01 | info | resolved | `695e8c4` — bidirectional parity + payload-shape pins |
| IN-02 | info | resolved | `2ea5438` — esc re-exports escHtml (one table) |
| IN-03 | info | resolved | `4058b34` — invite row on whole-payload contract |
| IN-04 | info | resolved | `2ea5438` — uid() uses crypto.getRandomValues |
| IN-05 | info | open | New: readJson drains unbounded — cap + destroy after drain |
| IN-06 | info | open | New: malformed known-kind extra renders literal key — guard with has() |

Re-review verdict: **PASS** — 435/435 tests green. IN-05/IN-06 are advisory;
candidates for a future gap-closure pass or backlog items.
