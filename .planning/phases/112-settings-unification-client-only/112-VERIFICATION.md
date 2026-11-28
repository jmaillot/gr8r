---
phase: 112-settings-unification-client-only
verified: 2026-11-29T00:00:00Z
status: passed
score: 4/4 success criteria verified
verdict: VERIFIED WITH NOTES
re_verification: No — initial verification
notes:
  - "Members perm-t table (settings.js:432) lacks the one-line 'min-width deliberately omitted' comment that the other 5 narrow tables carry (D-112-A says 'each with a one-line comment'). Cosmetic; the omission itself is correct."
---

# Phase 112: Settings Unification — Client Only Verification Report

**Phase Goal:** All 6 settings data lists on the design language (R-14); preference rows untouched (R-17).
**Verified:** 2026-11-29
**Verdict:** VERIFIED WITH NOTES
**Commits under review:** 86333561, 4bfa5979, 89df6323 (diff base 9ea74684)

## Per-Criterion Verification

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| SC-1 | All 6 data lists render perm-t; R-17 keep-list untouched; min-width:880 only on apikeys | ✓ VERIFIED | 6 perm-t tables confirmed in src/pages/settings.js: members :432, projects active :467 + archived :493, push devices :571, tfa factors :697, apikeys :833 (`min-width:880px`), sessions :870. All in `<div class="panel" style="overflow-x:auto">` with named th rows (`padding-left:14px` first th, trailing empty gutter th). Keep-list verified intact: projects defaultView/showDone srows, push master srow + 6 toggle srows, tfa master row + staged forms, apikeys purge action bar (srow ask/confirm), revoke-all outside tables, my-access cards untouched. min-width appears exactly once on a perm-t table (:833); narrow tables carry the omission comment at :466/:493/:570/:696/:867 — **members (:432) does NOT** (note below). |
| SC-2 | When columns from served fields only; members+projects ship without When, documented | ✓ VERIFIED | Sessions: `esc(s.lastSeenAt \|\| s.createdAt ? ago(...) : '—')` — D-25 verbatim. Keys: ago(expiresAt) / ago(lastUsedAt) with '—' fallbacks. Devices: `dev.created_at ? esc(ago(dev.created_at)) : '—'`. Factors: `f.lastStep > 0 ? esc(ago(f.lastStep * 30 * 1000)) : '—'` verbatim. Members table carries the NO-When comment citing the workspace-doc profile array (no served joined field; joinedAt-bearing feed not consumed). Projects: no When column, no served field, min-width comment documents conversion. No payload extension anywhere — see SC-4 server diff. |
| SC-3 | settings-client pins green with no re-alignment; net-zero counts; esc() on payload cells | ✓ VERIFIED | Ran the file: settings-client + i18n-shell + i18n-core-features + i18n-pages = **70 pass / 0 fail**. Literal pins (c) :56–58 and D-09 :96–101 pass against the new table markup unchanged. i18n-shell.test.mjs:349–351 assert 635/94/64 and i18n-core-features.test.mjs:171 asserts 86 — all green, no D-12 re-alignment needed. esc() verified on every payload cell: sessions (deviceLabel, ip, When), keys (label, prefix, workspaceName, both When cells), projects (name, team names, status), push (label, When), tfa (name via t(), When), members (name, email); all data-a data-id attributes esc'd. `${m.role}` and `${m.id}` un-escaped — confirmed byte-identical carry-over from the pre-existing mini-card markup (diff shows verbatim move, not a new regression). |
| SC-4 | 12 new settings.* keys ×5 parity; i18n:scan clean; zero server/api diff | ✓ VERIFIED | All 12 keys (`colDevice, colIp, colKey, colProject, colTeams, colStatus, colMember, sessions.colLastSeen, sessions.noSessions, notif.colRegistered, tfa.colFactor, tfa.colLastStep`) present in all 5 locales (grep count 12/12 per file, same commit 4bfa5979). `npm run i18n:scan`: 0 literals / 0 pending / 0 stale / 0 dead. `git diff 9ea74684..89df6323 --stat`: only settings.js + 5 locales + planning docs — **server.js and src/core/api.js untouched** (zero server diff confirmed). |
| — | Full suite at baseline (2836, fail ∈ [2,3]) | ✓ VERIFIED | Ran full suite once: **2836 tests, 2803 pass, fail 2** — webhook-routes GET list visible in output (documented baseline); within allowed band [2,3]. |

### SC-4 overage ruling (12 keys vs research ceiling ≤8)

**Rationale accepted.** The plan mandates 6 tables × 2–5 named headers ≈ 22 header slots; only 5 slots reuse existing truthful keys (`settings.apikeys.scope/workspace/expires/lastUsed`, `modal.role`). W4 forbids page.* cross-page borrowing. Header families are shared (`colDevice` serves sessions+push, `colStatus` serves projects+members), keeping the set at 12 rather than ~17. 12 keys is the honest minimum under the constraints; the overage was declared in the SUMMARY rather than smuggled. Ruled reasonable.

### Deviation review: API-keys empty-state dedup (Rule 1, 86333561)

**Reasonable.** The table renders `rows.length ? table : ''` and the pre-existing gated hint `!rows.length && !stage && !S.ui.newKey ? settings.apikeys.empty` remains the sole keyed empty state. A table-with-empty-branch would have duplicated the hint. No behavior lost; the empty hint gates on exactly the states where the table is absent.

## Notes

1. **Members table missing omission comment** (settings.js:432) — D-112-A specifies every narrow table carries a one-line `min-width deliberately omitted` comment; members is the only one of the 6 without it. Cosmetic documentation gap; the omission itself is correct (4-column table). Suggest adding the comment in a housekeeping commit.
2. Sessions empty state now keyed (`settings.sessions.noSessions`) — new key included in the 12 × 5 parity.
3. SUMMARY claims match codebase on every point checked (table line numbers, pin values, key counts, deviation record).

## Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Pin suites green | `node --test test/settings-client.test.mjs test/i18n-shell.test.mjs test/i18n-core-features.test.mjs test/i18n-pages.test.mjs` | 70 pass / 0 fail | ✓ PASS |
| Locale parity | grep 12 keys × 5 locales | 12/12 each | ✓ PASS |
| i18n:scan | `npm run i18n:scan` | all zeros | ✓ PASS |
| Full suite | `npm test` | 2836 tests, fail 2 | ✓ PASS (baseline) |

## Conclusion

Phase goal achieved: all 6 settings data lists are on the perm-t design language with R-17 preference rows untouched, When columns derive from served fields only, pins are green net-zero without re-alignment, i18n is clean at ×5 parity with a declared-and-reasonable key overage, and there is zero server diff. One cosmetic documentation note (members omission comment).

_Verified: 2026-11-29_
_Verifier: the agent (gsd-verifier)_
