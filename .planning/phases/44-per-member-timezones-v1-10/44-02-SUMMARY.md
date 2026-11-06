---
phase: 44-per-member-timezones-v1-10
plan: 02
subsystem: doc-merge
tags: [timezone, save-path, access-control, doc-merge, i18n]
requires: [44-01 resolveTz funnel (tz.js), docFromClient role gates, PUT /api/workspaces/:slug]
provides: [self-tz-only carve-out in docFromClient (members[*].tz save path), test/settings-tz.test.mjs regression suite]
affects: [Plan 44-03 combobox save handler (writes members[me].tz via the doc PUT), digest/reminder per-member read path (now fed by real saved values)]
tech-stack:
  added: []   # zero runtime dependencies preserved
  patterns: [self-only carve-out in merge path (Option A), funnel-at-save (D-06/D-10), coerce-on-invalid]
key-files:
  created: [test/settings-tz.test.mjs]
  modified: [server.js]
decisions:
  - "Coerce-to-Paris on invalid tz submits (D-10 planner discretion) — no new error strings, catalogue untouched; empty submits store '' verbatim (resolves to Paris on read, D-07)"
  - "Carve-out captures the incoming self-tz BEFORE the role gates and applies it AFTER both paths (non-admin replacement + admin pinning), mirroring the Phase 43 pinned-fields merge family"
  - "Test fixture seeds the stored roster via withDb — backfillMemberships is boot-only, so joined members only exist in the read-repaired roster within a live server"
metrics:
  duration: ~25m
  completed: 2026-11-06
  tasks: 2
  files: 2
status: complete
estimate:
  tokens: 39000
actuals:
  tokens: 2500       # chars/4 over the realized diff (200+/0-, 2 files)
  tasks: 2
  commits: 2         # measured: git rev-list --count 8b79cad..HEAD
plan_head_before: 8b79cade0b4c1a6c5e31b599354a1612c4f1b65e
plan_head_after: 94be8ab
---

# Phase 44 Plan 02: Tz Save-Path (Self-Tz-Only Carve-Out) Summary

**One-liner:** The pre-existing tz save-path disconnect is closed — a member-role client's doc PUT now lands their own tz on `doc.data.members[me].tz` through a resolveTz-validated, self-only carve-out in `docFromClient`, pinned by a 7-case real-server regression suite.

## What Was Built

- **server.js `docFromClient`:** captures `incomingSelfTz` from the incoming member matching `membership.member_id` (own-key `'tz' in m` check — unrelated member-array submissions never clobber the field) BEFORE the role gates; applies it AFTER both paths (non-admin `storedMembers` replacement ~1686 and admin pinned-fields block ~1692-1704). Empty string submits store `''` (D-07: resolves to Europe/Paris on read); anything else stores `resolveTz(incomingTz)` — valid IANA as submitted, legacy labels mapped, invalid/hostile coerced to `Europe/Paris`, never stored raw (D-10 coerce variant, T-44-04). Exactly one field on exactly one member; no other property ever taken from the incoming array beyond the existing admin pins. D-09/D-10 comment cites the merge-pinning precedent.
- **test/settings-tz.test.mjs (new):** real-server harness, 7 cases — self-tz persists through re-GET AND in the stored doc (direct SQLite read); cross-member tz write blocked (bob stays `''`); single-field carve-out (role/name/status mutations in the same member object never land); `<script>alert(1)</script>` → `Europe/Paris`; `''` → `''`; `(GMT+01:00) Berlin` → `Europe/Berlin`; admin pinned-field block intact (role/email/status pinned, tz still flows).
- TDD: RED evidence captured — with the carve-out reverted, 5/7 fail (the self-tz-persists Pitfall 1 signature); 7/7 green with the carve-out.

## Deviations from Plan

**1. [Rule 3 - Blocking issue] Test fixture seeds the stored roster via `withDb` instead of an admin PUT**
- **Found during:** Task 2
- **Issue:** joined members reach the STORED doc only through `backfillMemberships` (boot-only); within a live server, `docFromClient`'s admin path drops account-backed profiles not already stored (official-map guard returns null), so the planned "admin saves once to persist the roster" never lands — stored members stayed `[]` and the carve-out had nothing to write onto.
- **Fix:** seed `doc.data.members` directly from `memberships ⋈ users` (memberProfile shape) via `withDb`, matching the 44-01 harness conventions.
- **Files:** test/settings-tz.test.mjs
- **Commit:** 94be8ab

### Auto-fixed Issues

None otherwise — plan executed exactly as written.

## Known Stubs

None.

## Threat Flags

None new — T-44-03 (self-tz-only carve-out) and T-44-04 (funnel validation at save) both mitigated and pinned by test; T-44-SC holds (no new packages).

## Verification

- `node --test test/settings-tz.test.mjs` → 7/7 pass
- `node --test test/due-reminders.test.mjs test/digest.test.mjs test/tz-resolve.test.mjs test/tz-dedup.test.mjs` → 49/49 pass
- `npm test` → 1020/1021 pass; the single failure (`totp-rewrap` D-74) is **pre-existing** (identical at 44-01 baseline and earlier; logged to `deferred-items.md`, out of scope)
- Prohibition holds: carve-out writes `doc.data.members[*].tz` only; no `prefs.tz` read/write introduced; no second tz mapping (`resolveTz` from tz.js is the only validator)

## Self-Check: PASSED

- FOUND: test/settings-tz.test.mjs
- FOUND: eb8230e, 94be8ab (`git log --oneline`)
