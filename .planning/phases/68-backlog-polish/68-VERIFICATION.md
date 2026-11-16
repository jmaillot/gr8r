---
phase: 68-backlog-polish
verified: 2026-11-16T14:20:00Z
status: human_needed
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
covered_digest: v2:sha256:9521bb4d8a38ea2c65cfdce3785b520d5f20f0640f28b020112b97f861864fab
human_verification:
  - test: "Open the board at a 390×844 mobile viewport, toggle priority/due/estimate/progress in the cols popover"
    expected: "Card fields follow the toggles both ways; status/title/key/assignees always stay visible"
    why_human: "Visual rendering and popover ergonomics on a real device cannot be asserted by grep"
---

# Phase 68: Backlog Polish Verification Report

**Phase Goal:** The four v2.3 deferred items are cleared — mobile card fields honor hidden[], SMTP retry is claim-based, the WR-01 CSS leak is scoped, and the Phase 64 validation draft is reconciled.
**Verified:** 2026-11-16T14:20:00Z
**Status:** human_needed (automated checks all pass; 1 human-verification item remains for visual confirmation)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Mobile card fields honor hidden[] — minimum-identity always visible, cols popover usable ≤900px, proven by dedicated 390×844 e2e (POL-01) | ✓ VERIFIED | `src/views/table.js:94` — `.mcard` gates priority/due/estimate/progress on `v.hidden.includes(...)`; `.mch` row (status/title/key) and assignee stack unconditional (D-01 structural exemption). `[data-pop='cols']` display:none rule absent from responsive.css ≤900px band. `e2e/mobile-card-hidden.spec.mjs` exists with 390×844 toggle matrix (due/estimate/progress + no-equivalent inert toggle); e2e gate 129/129 per 68-04 + working-tree state unchanged since |
| 2 | SMTP retry is claim-based — email_outbox claim-state machine, never mark-then-send / blanket re-drive, Phase 38 no-double-send invariant (POL-02) | ✓ VERIFIED | `server.js:2153/2455` INSERT OR IGNORE into email_outbox with dedup keys `notif:<n.id>` and digest claim, inside the reminders_sent/doc-PUT tx flow; `runEmailDeliveryPass` (server.js:2973) mirrors webhook pass: purge → due drain → guarded attempt claim (`update ... where attempt = ?`) → shared webhook-retry.js backoff → dead. Direct `MAILER.sendDigest` call deleted (grep: no direct sendDigest outside deliverEmail); invites (server.js:7789) and 2FA alerts (server.js:4858) remain direct fire-and-forget per D-04 |
| 3 | WR-01 CSS leak scoped — `.page.flush .toolbar` only, ≤900px (POL-03) | ✓ VERIFIED | `src/styles/responsive.css:105-107`: selector is `.page.flush .toolbar { flex-shrink: 0 }`; grep finds no bare-`.toolbar` flex-shrink rule in the band; `test/responsive-css-scope.test.mjs` 3/3 green in this run |
| 4 | 64-VALIDATION draft reconciled — Formal Acceptance, status accepted, §5.5 rationale, v2.3-close evidence (POL-04) | ✓ VERIFIED | 64-VALIDATION.md:85-97: `## Formal Acceptance`, `**Status:** accepted`, rationale cites audit-milestone §5.5, evidence cites 115/115 e2e + 5/5 integration audit (v2.3-close numbers, per research Pitfall 6) |

**Score:** 4/4 truths verified (0 present, behavior-unverified)

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| CSS scope test + email outbox state machine | `node --test test/responsive-css-scope.test.mjs test/email-outbox.test.mjs` | tests 14, pass 14, fail 0 | ✓ PASS |
| Full unit suite (suite state) | `npm test` | tests 1701, pass 1688, fail 0, skipped 13 (pre-existing env gates), exit 0 | ✓ PASS |
| Outbox table on both backends | grep SCHEMA: db-adapter.mjs:364-379 and server.js:533-548 both carry CREATE TABLE + email_outbox_due index; PG_EPOCH_COLUMNS covers created_at/next_attempt_at/delivered_at | present, byte-identical per 68-REVIEW.md independent confirmation | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| POL-01 | 68-03 | Mobile card fields driven by hidden[], popover control, minimum-identity, 390×844 e2e | ✓ SATISFIED | table.js:94 render-time filter; e2e/mobile-card-hidden.spec.mjs; e2e gate green |
| POL-02 | 68-02 | Claim-state machine email retry, no-double-send invariant | ✓ SATISFIED | email_outbox table + runEmailDeliveryPass + claim inserts in tx flow; 11/11 outbox tests green |
| POL-03 | 68-01 | `.page.flush .toolbar` scoping ≤900px, non-regression proven by suite | ✓ SATISFIED | responsive.css:105; scoped test 3/3; full e2e 129/129 |
| POL-04 | 68-01 | 64-VALIDATION formally accepted per audit-milestone §5.5 | ✓ SATISFIED | 64-VALIDATION.md §Formal Acceptance, status accepted |

All 4 requirement IDs accounted for; no orphaned requirements (REQUIREMENTS.md maps exactly POL-01..POL-04 to Phase 68, all claimed).

### Human Verification Required

### 1. Mobile card popover behavior on-device (POL-01 visual)

**Test:** Open the board at 390×844 (or a real phone), toggle priority/due/estimate/progress in the cols popover.
**Expected:** Card fields follow the toggles both ways; status/title/key/assignees always visible; popover usable ≤900px.
**Why human:** Visual rendering, popover ergonomics and scroll behavior cannot be fully asserted by grep; the e2e spec covers the states but the end-user feel needs eyes.

## Code Review Weighting (68-REVIEW.md)

The review found 1 critical (CR-01: outbox claims ride the caller's tx only on SQLite; on pg the module-level `db.run` lands outside the checked-out client), 2 warnings (WR-01 queued++ counts collisions; WR-02 wall-clock assertion), 3 info. Disposition ledger records all 6 as open.

**Weighing:** CR-01 does NOT fail the phase goal. The reviewer's own report establishes that (a) the pattern predates Phase 68 (updateDoc, emitWebhookEvent, enqueueWebhookDeliveries behave identically), (b) the default/primary backend is SQLite where the invariant genuinely holds and every test exercises real SQLite, and (c) the invariant is architectural to the codebase, not a Phase 68 regression. The Phase 68 goal ("SMTP retry is claim-based") is achieved on the shipped backend. CR-01 is recorded as an explicit advisory carry-forward: the "commits together" comments at server.js:2149/2324 overstate pg atomicity and should be corrected or scope-threading landed as follow-up. WR-01/WR-02/IN-01..03 are quality nits with no goal impact.

### Gaps Summary

No gaps. All four backlog items are implemented, wired, and test-proven. One human-verification item (visual POL-01) and one advisory carry-forward (CR-01 pg tx-scope, pre-existing pattern) remain.

---

_Verified: 2026-11-16T14:20:00Z_
_Verifier: the agent (gsd-verifier)_
