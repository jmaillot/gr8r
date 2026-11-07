---
phase: 44-per-member-timezones-v1-10
plan: 01
subsystem: scheduler
tags: [timezone, scheduler, reminders, digest, exactly-once, i18n]
requires: [Phase 37/38 scheduler window predicates, Phase 27 reminders_sent ledger, Phase 34 stored notif prefs]
provides: [resolveTz funnel (tz.js), TZ_BY_LABEL 6-entry legacy map, per-member (localDate, hour) resolution in runReminderPass]
affects: [runReminderPass reminder loop, digest loop, future tz consumers (any resolution site must call resolveTz)]
tech-stack:
  added: []   # zero runtime dependencies preserved — node:Intl built-ins only
  patterns: [single-funnel choke point (D-06), resolve-on-read legacy labels (D-05), deterministic fallback (D-07), claim-key invariance (D-11/D-12)]
key-files:
  created: [tz.js, test/tz-resolve.test.mjs, test/tz-dedup.test.mjs]
  modified: [server.js, test/due-reminders.test.mjs]
decisions:
  - "Funnel extracted to tz.js instead of exported from server.js — importing server.js boots the server and opens the DB, so tests could not import it (Rule 3 deviation; intent preserved: named-export test seam, Phase 40 A2 precedent)"
  - "Legacy labels resolve on read only — no migration writes to members[*].tz (D-05); TZ_BY_LABEL gains the client default '(GMT-07:00) Pacific Time' as a 6th entry"
  - "Empty/unknown/hostile/non-string tz → Europe/Paris (deliberately replaces the legacy UTC fallback, D-07); REM-02 re-pinned"
  - "(localDate, hour) computed per assignee/recipient inside each loop — never hoisted, never cached (Pitfall 3); claim keys byte-identical (D-11/D-12)"
metrics:
  duration: ~35m (checkpoint paused between tasks 1 and 2)
  completed: 2026-11-06
  tasks: 4
  files: 5
status: complete
estimate:
  tokens: 78000
actuals:
  tokens: 9800        # chars/4 over the realized diff (343+/49-, 5 files)
  tasks: 4
  commits: 3          # measured: git rev-list --count c5e7669..HEAD (code commits; docs commit follows)
plan_head_before: c5e7669
plan_head_after: cede92f
---

# Phase 44 Plan 01: Per-Member Timezone Windows Summary

**One-liner:** One `resolveTz` funnel (6 legacy labels + Intl-validated IANA + Europe/Paris fallback) now drives per-member `(localDate, hour)` windows in both scheduler loops, replacing the deleted workspace-shared tz lookup — exactly-once ledger keys byte-identical.

## What Was Built

- **tz.js (new):** `TZ_BY_LABEL` (6 entries — the 5 server fixtures + client default `(GMT-07:00) Pacific Time`), `resolveTz(value)` (trim → legacy map → Intl `en-CA` construction as the only validator inside try/catch → `Europe/Paris` fallback, never throws), `localParts` (Intl math byte-identical to pre-44, `% 24` midnight guard intact).
- **server.js:** `workspaceTzLabel` + the workspace-level `localParts(workspaceTzLabel(...), at)` deleted (D-09 confirmed via checkpoint). Reminder loop resolves the assignee's tz from `doc.data.members[*].tz` through `resolveTz` INSIDE `for (const t of tasks)` with per-task `hour < 8` gate; digest loop resolves per recipient from `r.member_id` before the opt-in gate. D-11/D-12 D-notation comment at the digest claim key. String compares and claim keys untouched.
- **test/tz-resolve.test.mjs (new):** 6 tests pinning all 6 legacy labels, all D-07 fallback edges, hostile-input-no-throw (T-44-01), valid-IANA/alias acceptance, trim/idempotence.
- **test/tz-dedup.test.mjs (new):** 4 tests — digest no-refire on same-localDate tz switch, exactly-one-new-claim on different-localDate re-window (key shape asserted byte-identical), reminder-variant no-refire, Paris/LA multi-member ordering determinism + idempotence.
- **test/due-reminders.test.mjs:** REM-02 fallback re-pinned `2026-01-15T07:00:00Z` with D-07 comment (single deliberate re-pin; SC-5).

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Funnel extracted to `tz.js` instead of named exports on server.js**
- **Found during:** Task 2 (tracer)
- **Issue:** Plan specified exporting `resolveTz`/`TZ_BY_LABEL` from server.js, but server.js has zero exports and runs `main()` + `openDb()` at module top level — no test imports it today (all prior "imports" are `fs.readFileSync` source assertions), and importing it would boot a server and open the default DB.
- **Fix:** `tz.js` at repo root holds `TZ_BY_LABEL`, `resolveTz`, `localParts`; server.js imports all three. Tests import `../tz.js` directly.
- **Files:** tz.js (new), server.js, test/tz-resolve.test.mjs
- **Commit:** b5e48d2

### Auto-fixed Issues

None — plan executed exactly as written otherwise.

## Known Stubs

None.

## Threat Flags

None — no new trust surface; T-44-01 (hostile tz input) mitigated by the funnel's try/catch Intl validation + Paris fallback, pinned by test.

## Verification

- `node --test test/tz-resolve.test.mjs` → 6/6 pass
- `node --test test/tz-dedup.test.mjs` → 4/4 pass
- `node --test test/due-reminders.test.mjs` → 19/19 pass · `node --test test/digest.test.mjs` → 20/20 pass
- `npm test` → 1013/1014 pass; the single failure (`totp-rewrap` D-74) is **pre-existing** — verified identical failure at pre-plan commit c5e7669; logged to `deferred-items.md` (Phase 43 logos-mkdir vs D-74's 0o555 DATA_DIR fixture; out of scope, untouched)
- `grep -c workspaceTzLabel server.js` → 0; no `prefs.tz` read in the scheduler (prohibition holds); no tz-keyed doc writes (resolve-on-read only)

## Self-Check: PASSED

- FOUND: tz.js, test/tz-resolve.test.mjs, test/tz-dedup.test.mjs
- FOUND: b5e48d2, 793f894, cede92f (`git log --oneline --all`)
