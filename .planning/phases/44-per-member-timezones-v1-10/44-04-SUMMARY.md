---
phase: 44-per-member-timezones-v1-10
plan: 04
subsystem: timezone-funnel
tags: [gap-closure, wr-01, wr-02, d-10, canonicalization]
requires: [44-01, 44-02, 44-03]
provides: [canonicalizing resolveTz, funneled admin doc-PUT tz path, UTC in zone list, hostile-PUT + preselect + claim-key-equivalence pins]
affects: [server.js docFromClient, tz.js, src/lib/timezones.js]
tech-stack:
  added: []
  patterns: [single-funnel canonicalization via Intl resolvedOptions, build-time round-trip drift guard]
key-files:
  created: []
  modified:
    - tz.js
    - test/tz-resolve.test.mjs
    - scripts/gen-timezones.mjs
    - src/lib/timezones.js
    - server.js
    - test/settings-tz.test.mjs
    - test/settings-tz-combobox.test.mjs
    - test/tz-dedup.test.mjs
decisions:
  - "A2 consciously changed (approved): aliases and case variants are accepted but stored canonical — resolveTz returns Intl resolvedOptions().timeZone, not the trimmed input"
  - "WR-01 fix route = funneling (not stripping) doc-only members' tz — preserves the admin's ability to edit another member's tz through the doc (pinned by the existing Asia/Tokyo test)"
  - "UTC added to gen-timezones.mjs output as a build-time supplement (absent from supportedValuesOf); round-trip drift guard added (T-44-06)"
  - "Preselect pins assert via resolveTz + TIMEZONES membership (settings.js uses Vite virtual: imports and cannot load in Node); tzPreselect's exact-match against the same list stays pinned structurally"
metrics:
  duration: ~35 min
  completed: 2026-11-07
  tasks: 3
  commits: 3
  plan_head_before: 54c92f4
  plan_head_after: 57292aa
status: complete
actuals:
  tokens: 22000
  tasks: 3
  commits: 3
---

# Phase 44 Plan 04: Gap closure G-44-3 (WR-01 + WR-02) Summary

**One-liner:** Canonicalizing resolveTz (aliases accepted, stored canonical) plus a funneled admin doc-PUT path restore the D-10 "never arbitrary strings stored" invariant and make every valid stored tz preselect itself instead of degrading to Europe/Paris.

## Gap Closed

**G-44-3** — review warnings WR-01 (admin doc-PUT stores raw hostile `tz` for any member) and WR-02 (valid-but-non-canonical stored tz — `US/Pacific`, case variants, `UTC` — preselects Paris and one save rewrites it).

## What Was Done

### Task 1 — Canonicalize resolveTz (WR-02) · commit 6d218e2
- `tz.js resolveTz` now returns `new Intl.DateTimeFormat('en-CA', { timeZone: v }).resolvedOptions().timeZone` on successful validation (per-zone resolution, NOT `supportedValuesOf` enumeration — D-03 intact), falling back to Europe/Paris on falsy resolution.
- D-06/D-07 comment block documents the canonicalization contract.
- `scripts/gen-timezones.mjs`: `UTC` appended before map/sort (build-time supplement — the residual WR-02 gap from the diagnosis), plus a round-trip drift guard (T-44-06): every emitted id must resolve to itself, throwing on ICU-variance canonical-target drift.
- `src/lib/timezones.js` regenerated — 419 zones, deterministic (byte-identical re-run verified), contains `UTC`.
- A2 pin consciously updated: renamed, asserts `US/Pacific` → `America/Los_Angeles` and `america/new_york` → `America/New_York`, `UTC` → `UTC`; idempotency test re-asserts canonical outputs are fixed points.

### Task 2 — Funnel the admin doc-PUT path (WR-01) · commit c01ac1b
- `server.js docFromClient` admin branch: account-backed members now funnel tz exactly like the self carve-out — `undefined` keeps `prev.tz` (an omitted-tz admin snapshot cannot wipe a stored value), `''`/whitespace-only clears to `''` (D-07), anything else goes through `resolveTz`.
- Doc-only members (`!m?.userId`): previously passed through wholly verbatim; now spread with the tz funnel — the unpinned path cannot smuggle a raw string.
- "never stored raw" comment updated to be true for all members.
- Non-admin branch and IN-02 untouched (out of scope, as planned).
- 6 new hostile tests: hostile string, 10k string, `US/Pacific`→canonical, omitted-tz keeps stored value, whitespace-only clears, doc-only hostile member.

### Task 3 — Preselect + claim-key equivalence pins · commit 57292aa
- `test/settings-tz-combobox.test.mjs`: stored `US/Pacific`/`UTC`/`america/new_york` resolve into the selectable `TIMEZONES` list and never to Paris; `''` still defers to the browser zone.
- `test/tz-dedup.test.mjs`: `localParts('US/Pacific', d)` deep-equals `localParts('America/Los_Angeles', d)` across instants spanning both DST transitions — proving D-11/D-12 claim keys (`ws:id:offset:due`, `ws:user:digest:localDate`) are byte-identical for alias vs canonical input.

## Key Decisions

1. **A2 canonicalization change (deliberate, consciously approved — not a deviation):** aliases are still *accepted* but no longer *stored as-submitted*. `resolveTz('US/Pacific')` → `'America/Los_Angeles'`. This is the mechanism that makes WR-02's preselect fix fall out of the funnel with zero UI change.
2. **ICU-variance discovered and pinned to reality:** this environment's ICU canonicalizes `America/Argentina/Buenos_Aires` → `America/Buenos_Aires` (a supported id, confirmed present in `supportedValuesOf`). The plan's assumed literal was wrong for this ICU; the pin asserts the actual canonical target, and the new generator round-trip guard exists precisely for this class of drift.
3. **Funneling over stripping** for doc-only members, per the diagnosis's recommended route (keeps admin tz-edit capability pinned by the existing Asia/Tokyo test).
4. **Preselect pins via `resolveTz` + list membership:** `src/pages/settings.js` imports Vite `virtual:` modules and cannot load under Node; the structural test still pins that `tzPreselect` exact-matches the same `TIMEZONES` list through the same funnel.

## Deviations from Plan

1. **[Rule 1 - Bug (plan assumption)] Multi-segment canonical target differs under this ICU**
   - **Found during:** Task 1 (A2 pin run)
   - **Issue:** plan behavior listed `resolveTz('America/Argentina/Buenos_Aires') === 'America/Argentina/Buenos_Aires'`, but this ICU resolves it to `America/Buenos_Aires` (verified present in `supportedValuesOf`, so still selectable).
   - **Fix:** pin asserts the environment's actual canonical target with an explanatory message.
   - **Files modified:** test/tz-resolve.test.mjs (already within plan scope)
2. **[Rule 3 - Blocking] Task 3's `node --test` initially ran against stashed edits** — a diagnostic `git stash -q` (my error, against worktree discipline) temporarily hid the two uncommitted test edits; recovered via `git stash pop`, tests re-run (16 pass), then committed. No content lost.

No other deviations — plan executed as written otherwise.

## Test & Gate Results

- Pinned suites: `tz-resolve` 6/6, `settings-tz` 13/13, `settings-tz-combobox` + `tz-dedup` 16/16 — all green.
- Full `npm test`: **1042 tests, 1038 pass, 1 fail, 3 skipped** — the single failure is the pre-existing totp-rewrap D-74 (EACCES fixture), unchanged from baseline. Net new passing tests vs baseline: +8.
- `npm run i18n:scan`: clean (0 literals, 0 pending, 0 stale...).
- `npm run lint`: 12 errors — **all 12 pre-existing at baseline HEAD~2 (verified via a baseline worktree run); this plan introduces 0 new lint errors.** Per scope boundary, pre-existing lint debt in untouched files was not fixed.
- `node scripts/gen-timezones.mjs` idempotent (byte-identical re-run); `UTC` present in the generated list.

## Commits

- `6d218e2` fix(44): canonicalize resolveTz + UTC supplement in zone generator (WR-02, G-44-3)
- `c01ac1b` fix(44): funnel every incoming member tz on the admin doc-PUT path (WR-01, G-44-3)
- `57292aa` test(44): preselect-not-Paris and alias claim-key equivalence pins (WR-02, G-44-3)

## Self-Check: PASSED

- All 8 modified files committed across the 3 task commits (`git log`/`git show --stat` verified).
- `git rev-list --count 54c92f4..HEAD` = 3, matching `commits:`.
- `.planning/REQUIREMENTS.md` left untouched (known pre-existing dirty file, deliberately never staged).
