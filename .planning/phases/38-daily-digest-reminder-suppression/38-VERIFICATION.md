---
phase: 38-daily-digest-reminder-suppression
verified: 2026-11-04T20:55:00Z
status: passed
score: 7/7 must-haves verified
covered_files:
  - .planning/phases/38-daily-digest-reminder-suppression/38-01-PLAN.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-02-PLAN.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-03-PLAN.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-01-SUMMARY.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-02-SUMMARY.md
  - .planning/phases/38-daily-digest-reminder-suppression/38-03-SUMMARY.md
  - server.js
  - mailer.js
  - src/core/notifPrefs.js
  - src/locales/en.json
  - src/locales/fr.json
  - test/digest.test.mjs
covered_digest: "v2:394720c1a08d6a5f029b9afb96f8cc531944126b54ac72ff89dcfb074406dd11" # recomputed at HEAD 9611fec1ee79 (gsd_run unavailable in this session): sha256 over sorted "path:sha256" lines of covered_files
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 6/7
  gaps_closed:
    - "CR-01 closed: digest task filter gated on t.assignee === r.member_id (server.js:1500, first filter); SCOPE-04 checks now evaluate against the RECIPIENT's membership — confirmed at current HEAD and pinned by the multi-member test"
    - "WR-01 closed: multi-member recipient-scope pin added (addPeerMember helper, test/digest.test.mjs:189, 288+) — M2 payload excludes K-A1/K-A2, includes K-B1; M1 payload includes K-A1/K-A2, excludes K-B1; 11/11 suite green at HEAD"
    - "WR-02 closed: zero `|| true` / `? 0 : 1` tautologies remain in test/digest.test.mjs (grep exit 1 at HEAD); the four sites carry falsifiable assertions (e.g. K-F1 exclusion pin at line 353)"
  gaps_remaining: []
  regressions: []
---

# Phase 38: Daily Digest & Reminder Suppression — Verification Report

**Phase Goal:** Users can opt into a single daily digest email (09:00 workspace-local) listing tasks due today and overdue, which replaces individual reminder emails when enabled — mentions, assignments and comment emails flow unchanged.
**Verified:** 2026-11-04T20:55:00Z
**Status:** passed
**Re-verification:** Yes — stale-digest regeneration at current HEAD 9611fec1ee79; full goal-backward re-run, all previously-closed gaps (CR-01, WR-01, WR-02) confirmed still closed.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Opted-in member receives ONE localized digest at 09:00 workspace-local listing THEIR due-today + overdue tasks, deep-linked (DIGEST-01) | ✓ VERIFIED | server.js:1500 `if (t.assignee !== r.member_id) continue;` is the FIRST filter in the digest task loop (exactly one match at HEAD); SCOPE-04 checks run against the recipient (comment cites D-06); multi-member pin proves M2 sees only K-B1 (no K-A1/K-A2) and M1 sees only K-A1/K-A2 (no K-B1) — test passes at HEAD in `node --test test/digest.test.mjs` (11/11) |
| 2 | Empty digest → no email, no ledger claim (D-12) | ✓ VERIFIED | server.js:1519-1520 empty-list gate before transaction; D-12 pin green at HEAD |
| 3 | Idempotent across restarts — one `ws:{userId}:digest:{localDate}` claim, post-commit send | ✓ VERIFIED | server.js insert-or-ignore transaction, post-commit `MAILER.sendDigest`; SC-2 pin green at HEAD |
| 4 | Catch-up after missed 09:00 delivers late with content at send instant | ✓ VERIFIED | `hour >= 9` gate; D-01/D-02 pins green at HEAD |
| 5 | Digest user loses reminder emails; notif rows + revision intact; push/inbox never suppressed (DIGEST-02) | ✓ VERIFIED | Suppression branch keys on `email_reminder` only (unchanged at HEAD); D-11/D-08 pins green — regression check: due-reminders suite 17/17 at HEAD |
| 6 | Mention/assignment/comment emails unchanged for digest users | ✓ VERIFIED | Suppression branch untouched by 38-03 (diff confined to digest block + test file); SC-3 pin green at HEAD |
| 7 | `email_digest` undefined-falsy default; settings toggle + copy EN+FR (DIGEST-03) | ✓ VERIFIED | Whitelist-only key, notifPrefs default comment, locales EN+FR — untouched by 38-03; DIGEST-03 pin green; full suite 942 pass / 0 fail / 3 skipped at HEAD |

**Score:** 7/7 truths verified (0 present-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `server.js` digest loop | Recipient-scoped filter | ✓ VERIFIED | Gate at :1500, one match exactly at HEAD; stale "sees exactly what the assignee sees" comment absent (grep 0 matches); reminder loop byte-identical |
| `test/digest.test.mjs` | 11 pins incl. multi-member leak detector | ✓ VERIFIED | addPeerMember helper (:189); CR-01 pin asserts falsifiable M2/M1 payload conditions; zero tautologies (`grep -nE '\|\| true\|\? 0 : 1'` → exit 1 at HEAD) |
| `mailer.js` buildDigestMessage/sendDigest | Sibling methods | ✓ VERIFIED | Unchanged from initial verification |
| `src/locales/*.json` notif.digest.* | 4 keys EN+FR | ✓ VERIFIED | Unchanged; i18n scan at HEAD: 0 literals, 0 pending, 0 unresolved |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | --- | --- | ------ | ------- |
| Digest task filter | recipient membership row | `t.assignee !== r.member_id` gate from the memberships⋈users recipient loop | ✓ WIRED | server.js:1500 at HEAD, exactly one occurrence, inside the digest task loop |
| Digest loop | reminders_sent ledger | transaction insert-or-ignore `ws:{userId}:digest:{localDate}` | ✓ WIRED | server.js (unchanged from initial verification) |
| Digest loop | MAILER.sendDigest | post-commit fire-and-forget | ✓ WIRED | Unchanged |
| buildDigestMessage | tFor notif.digest.* + deep link | literal keys; `${APP_URL}/w/{slug}/task/{key}` | ✓ WIRED | Unchanged; multi-member pin asserts real deep links in payloads |
| queueNotifEmails | suppression gate | `prefKey==='email_reminder' && stored email_digest===true` | ✓ WIRED | Unchanged by 38-03 |
| Multi-member pin | SMTP capture | out-of-scope titles absent from M2's decoded payload | ✓ WIRED | `digestFor(msgs, peer.email, ws.slug)` — asserts `!includes('K-A1')`, `!includes('K-A2')`, `includes('K-B1')` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| Digest payload | tasks due today / overdue | server.js digest loop queries workspace tasks filtered by recipient assignee + due date | Yes (SMTP-captured payloads assert real task keys) | ✓ FLOWING |
| Settings toggle copy | notif.digest.* | src/locales/en.json + fr.json via tFor | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Digest suite (11 pins incl. CR-01 multi-member pin) | `node --test test/digest.test.mjs` | 11 pass, 0 fail (at HEAD) | ✓ PASS |
| Phase 37 reminder regression | `node --test test/due-reminders.test.mjs` | 17 pass, 0 fail (at HEAD) | ✓ PASS |
| Full suite | `npm test` | 942 pass, 0 fail, 3 skipped (at HEAD) | ✓ PASS |
| WR-02 tautology scan | `grep -nE '\|\| true\|\? 0 : 1' test/digest.test.mjs` | no matches (exit 1) | ✓ PASS |
| Gate presence + uniqueness | `grep -n "t.assignee !== r.member_id" server.js` | exactly one match at :1500 | ✓ PASS |
| Stale comment removed | `grep -n "sees exactly what the assignee sees" server.js` | no matches (exit 1) | ✓ PASS |
| i18n gate | `npm run i18n:scan` | 0 literals, 0 pending, 0 unresolved (at HEAD) | ✓ PASS |

### Probe Execution

No phase-declared or conventional probes (`scripts/*/tests/probe-*.sh`) found for this phase; the integration suites above serve as the behavioral evidence.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| DIGEST-01 | 38-01, 38-03 | Opt-in 09:00 digest lists THE RECIPIENT'S due-today + overdue tasks, deep-linked, localized; silent when nothing due | ✓ SATISFIED | CR-01 closed and confirmed at HEAD: assignee===recipient gate + recipient-evaluated SCOPE-04 checks; multi-member pin proves no cross-member leakage and no out-of-scope titles/deep links |
| DIGEST-02 | 38-01, 38-02 | Reads tasks directly; transactional claim (idempotent); type-scoped suppression; push/inbox untouched | ✓ SATISFIED | Unchanged from initial verification; regression-confirmed at HEAD (due-reminders 17/17) |
| DIGEST-03 | 38-02 | email_digest removed from default layer (opt-in); settings toggle + copy EN+FR | ✓ SATISFIED | Unchanged from initial verification; i18n scan green at HEAD |

No orphaned requirements — REQUIREMENTS.md maps exactly DIGEST-01/02/03 to Phase 38; 38-03's frontmatter claims DIGEST-01 (the previously BLOCKED one); DIGEST-02/03 remain claimed by 38-01/38-02.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none) | — | — | — | All previous findings resolved at HEAD: server.js:1500 gate present; test/digest.test.mjs has zero tautologies; multi-member fixtures cover the cross-member surface |

### Human Verification Required

None. All delivery, content-scope, suppression, idempotence, and opt-in mechanics are exercised by the integration suite; no UI/visual/real-time items outstanding (settings toggle covered by the DIGEST-03 pin).

### Gaps Summary

None. The single blocking gap CR-01 remains closed at current HEAD (server.js:1500 — `t.assignee !== r.member_id` as the first filter in the digest task loop, with the SCOPE-04 comment corrected to state that the checks now evaluate against the recipient, per D-06's one-visibility-pipeline rule) and observable in CI (the multi-member pin exercises the transition: M2's payload excludes K-A1/K-A2 and includes K-B1; M1's includes both own tasks and excludes K-B1 — a real falsifiable behavioral pin, not symbol presence). WR-01 and WR-02 confirmed closed at HEAD; the 10 pre-existing pins were not restructured and remain green. Reminder behavior (Phase 37 surface) regression-checked green; full 945-test suite green. Phase goal achieved.

---

_Verified: 2026-11-04T20:55:00Z_
_Verifier: the agent (gsd-verifier)_
