---
phase: 68-backlog-polish
verified: 2026-11-16T13:49:05Z
status: passed
score: 4/4 must-haves verified
behavior_unverified: 0
overrides_applied: 0
covered_files:
  - .planning/phases/68-backlog-polish/68-01-PLAN.md
  - .planning/phases/68-backlog-polish/68-02-PLAN.md
  - .planning/phases/68-backlog-polish/68-03-PLAN.md
  - .planning/phases/68-backlog-polish/68-04-PLAN.md
  - .planning/phases/68-backlog-polish/68-01-SUMMARY.md
  - .planning/phases/68-backlog-polish/68-02-SUMMARY.md
  - .planning/phases/68-backlog-polish/68-03-SUMMARY.md
  - .planning/phases/68-backlog-polish/68-04-SUMMARY.md
  - .planning/phases/68-backlog-polish/68-CONTEXT.md
  - src/styles/responsive.css
  - src/views/table.js
  - db-adapter.mjs
  - server.js
  - test/responsive-css-scope.test.mjs
  - test/email-outbox.test.mjs
  - e2e/mobile-card-hidden.spec.mjs
  - .planning/milestones/v2.3-phases/64-mobile-tasks-table-suite-green/64-VALIDATION.md

covered_digest: v2:sha256:967b4708c0916207d33bcb71d63ea6789ce833f52475d90c2bd9b4098748719f
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Open the board at a 390×844 mobile viewport, toggle priority/due/estimate/progress in the cols popover"
    expected: "Card fields follow the toggles both ways; status/title/key/assignees always stay visible"
    why_human: "Visual rendering and popover ergonomics on a real device cannot be asserted by grep"
---

# Phase 68: Backlog Polish Verification Report

**Phase Goal:** The four v2.3 deferred items are cleared — mobile card fields honor hidden[], SMTP retry is claim-based, the WR-01 CSS leak is scoped, and the Phase 64 validation draft is reconciled.
**Verified:** 2026-11-16T13:49:05Z
**Status:** passed (automated checks all pass; human-verification item listed below was previously surfaced and remains as UAT follow-up)
**Re-verification:** Yes — after stale-fingerprint detection. Commits 54827ed + 52ecd93 landed after the prior report (2026-11-16T14:20:00Z was recorded post-dated; both commits precede this re-run and touched `server.js`, a phase-68 covered file).

## Staleness Re-Check (2026-11-16)

`54827ed` (v2.4 audit tech debt) modified `server.js` (~70 lines) plus `webhook-ssrf.js`, `src/core/templates.js` and their tests. The changes touch **webhook delivery** (occurrence dedup key, pinnedFetch transport) and **template normalization** (unchanged-skip) — phase 67/66 scope. Diff inspection confirms **zero hunks touching the email outbox code path** (grep of the diff for `outbox|runEmailDeliveryPass|sendDigest|email`: no matches). `52ecd93` is docs-only (`.planning/`). Fresh evidence below re-anchors all truth line numbers, which shifted by the inserted lines.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Mobile card fields honor hidden[] — minimum-identity always visible, cols popover usable ≤900px, proven by dedicated 390×844 e2e (POL-01) | ✓ VERIFIED | `src/views/table.js:94` — `.mcard` gates priority/due/estimate/progress on `v.hidden.includes(...)`; `.mch` row (status/title/key) and assignee stack unconditional (D-01 structural exemption). `[data-pop='cols']` display:none rule absent from responsive.css ≤900px band. `e2e/mobile-card-hidden.spec.mjs` exists with 390×844 toggle matrix; unchanged since prior verification |
| 2 | SMTP retry is claim-based — email_outbox claim-state machine, never mark-then-send / blanket re-drive, Phase 38 no-double-send invariant (POL-02) | ✓ VERIFIED | `server.js:2155/2457` INSERT OR IGNORE into email_outbox with dedup keys `notif:<n.id>` and digest claim, inside the reminders_sent/doc-PUT tx flow; `runEmailDeliveryPass` (server.js:2997) mirrors webhook pass: purge → due drain → guarded attempt claim (`update email_outbox set attempt = attempt + 1 where id = ? and attempt = ? and status in (?, ?)` at server.js:2954) → shared webhook-retry.js backoff → dead. Direct `MAILER.sendDigest` call deleted from producer sites (only the pass-level dispatch at server.js:2972 remains); 54827ed diff confirmed zero outbox-path hunks. Invites and 2FA alerts remain direct fire-and-forget per D-04 |
| 3 | WR-01 CSS leak scoped — `.page.flush .toolbar` only, ≤900px (POL-03) | ✓ VERIFIED | `src/styles/responsive.css:105`: selector is `.page.flush .toolbar { ... }`; no bare-`.toolbar` flex-shrink rule in the band; `test/responsive-css-scope.test.mjs` 3/3 green in this run |
| 4 | 64-VALIDATION draft reconciled — Formal Acceptance, status accepted, §5.5 rationale, v2.3-close evidence (POL-04) | ✓ VERIFIED | 64-VALIDATION.md:85-87: `## Formal Acceptance`, `**Status:** accepted` |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| CSS scope test + email outbox state machine | `node --test test/responsive-css-scope.test.mjs test/email-outbox.test.mjs` | tests 14, pass 14, fail 0 | ✓ PASS |
| Outbox tests in isolation (post-staleness check) | `node --test test/email-outbox.test.mjs` | tests 11, pass 11, fail 0 (incl. end-to-end exactly-once) | ✓ PASS |
| Full unit suite (suite state) | `npm test` | Run 1: 1707 tests, 1692 pass, 2 flaky fails (parallel-test interference; outbox end-to-end passes in isolation); Run 2: 1707 tests, **1694 pass, 0 fail**, 13 skipped (pre-existing env gates) — matches 54827ed's recorded suite state | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| POL-01 | 68-03 | Mobile card fields driven by hidden[], popover control, minimum-identity, 390×844 e2e | ✓ SATISFIED | table.js:94 render-time filter; e2e/mobile-card-hidden.spec.mjs present and unchanged |
| POL-02 | 68-02 | Claim-state machine email retry, no-double-send invariant | ✓ SATISFIED | email_outbox table + runEmailDeliveryPass + claim inserts; 11/11 outbox tests green post-54827ed |
| POL-03 | 68-01 | `.page.flush .toolbar` scoping ≤900px, non-regression proven by suite | ✓ SATISFIED | responsive.css:105; scoped test 3/3; full suite green |
| POL-04 | 68-01 | 64-VALIDATION formally accepted per audit-milestone §5.5 | ✓ SATISFIED | 64-VALIDATION.md §Formal Acceptance, status accepted |

All 4 requirement IDs accounted for; no orphaned requirements.

### Human Verification Required

### 1. Mobile card popover behavior on-device (POL-01 visual)

**Test:** Open the board at 390×844 (or a real phone), toggle priority/due/estimate/progress in the cols popover.
**Expected:** Card fields follow the toggles both ways; status/title/key/assignees always visible; popover usable ≤900px.
**Why human:** Visual rendering, popover ergonomics and scroll behavior cannot be fully asserted by grep; the e2e spec covers the states but the end-user feel needs eyes.

## Code Review Weighting (68-REVIEW.md)

The review found 1 critical (CR-01: outbox claims ride the caller's tx only on SQLite; on pg the module-level `db.run` lands outside the checked-out client), 2 warnings (WR-01 queued++ counts collisions; WR-02 wall-clock assertion), 3 info. Disposition ledger records all 6 as open.

**Weighing (unchanged):** CR-01 does NOT fail the phase goal. The pattern predates Phase 68 (updateDoc, emitWebhookEvent, enqueueWebhookDeliveries behave identically), the default/primary backend is SQLite where the invariant holds and every test exercises real SQLite, and the invariant is architectural to the codebase, not a Phase 68 regression. Recorded as an explicit advisory carry-forward. WR-01/WR-02/IN-01..03 are quality nits with no goal impact.

### Gaps Summary

No gaps. All four backlog items remain implemented, wired, and test-proven after the 54827ed/52ecd93 staleness round — the intervening commit modified webhook/template code inside `server.js` but did not touch the email outbox path, and the full suite is green. One human-verification item (visual POL-01) and one advisory carry-forward (CR-01 pg tx-scope, pre-existing pattern) remain.

---

_Verified: 2026-11-16T13:49:05Z_
_Verifier: the agent (gsd-verifier)_
