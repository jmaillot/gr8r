---
phase: 35-honest-undo-deploy-gap
verified: 2026-11-03
verdict: gaps_found
score: 12/14 must-haves verified
gaps: 2
---

# Phase 35 Verification — Honest Undo & Deploy Gap

## Verdict: gaps_found

Two warnings from the code review are confirmed by direct code inspection as real defects that must be fixed before this phase can be marked complete. Both fall squarely inside the phase's must-have surface: SC1 ("undo restores the purged memberships") is not honestly delivered when the undo path can hard-fail on a lost push (WR-01) or self-inflict a false conflict-lock mid-undo (WR-02). The three info findings are recorded, no action required for completion.

## What Was Verified (automated, passing)

| Check | Result |
|---|---|
| `node --test test/undo-membership.test.mjs` | 5 pass / 0 fail |
| `node --test test/compose-config.test.mjs` | 3 pass / 0 fail (both cases ran live) |
| Full suite `npm test` | 894 pass / 0 fail / 3 skips (baseline) |
| UNDO-01 — restore + union replay + awaited `pushNow()` sequencing | ✓ implemented (teams.js:179–195, store.js:162) |
| UNDO-02 — no-clobber regression (newer team_c survives) | ✓ test-pinned (undo-membership.test.mjs) |
| D-06 — local-mode restore-unconditional pin | ✓ source-scan test |
| DEPLOY-01 — compose `:-` form + two-case config test | ✓ (docker-compose.yml:40, both cases verified live) |
| DEPLOY-01 — §14 key-custody walkthrough | ✓ present, consistent with D-08 |
| Regression gate — 11 prior-phase test files | ✓ 263 tests, 0 fail |

## Gaps Found

### Gap 1 — UNDO-01 hard-fail path: union PUTs fire after a failed push (WR-01)

`src/actions/teams.js:181–198` (undo `onAction`): the result of
`await pushNow()` (`pushed`) is **not checked before** `await Promise.all(affected.map(...setMemberTeams...))`.
If `pushNow()` fails (network loss, 401, 403, 409), the code still fires N membership PUTs
against a server doc that does **not** contain the restored team — the server whitelists team
ids against the stored doc, so every PUT is a guaranteed `400 unknownTeam`. This is the exact
premature-PUT failure UNDO-01's own negative test proves is fatal to the undo.

Consequences:
- The user gets an `err.changeTeam` toast for an undo that had no chance of succeeding.
- If the server doc *does* still contain the team id (a newer doc re-added it), a PUT can
  succeed even though the doc push failed — leaving membership rows and doc state divergent
  while the client shows an error toast.

**Required fix:** early-return (with the existing `err.changeTeam` toast) when `pushed.ok === false`,
before any `setMemberTeams` PUT. Keep the per-result loop as-is for partial failures.

### Gap 2 — `pushNow()` does not take the `pushing` mutex (WR-02)

`src/core/store.js:162–177`: `pushNow()` waits out an in-flight push (poll loop on `pushing`)
but never sets `pushing = true` while its own `putWorkspace` PUT is in flight. A `save()`
triggered during that window (any user edit between the undo click and the PUT settling)
schedules a debounced `push()` that can overlap `pushNow()`'s in-flight PUT → two concurrent
PUTs of the same doc → one receives `409 Conflict` → `S.ui.conflict = true` → **full-app
conflict lock from a false positive**, precisely during an undo the user is watching.

**Required fix:** `pushNow()` must take the same `pushing` flag (and release it in its
finally) so its PUT is serialized against `push()`/`save()` exactly like a normal push. The
`_saveT`/`_pushT` clearTimeout stays; the mutex is the missing piece.

## Info (recorded, no action required for completion)

- **IN-01** — `pushed.ok === false` vs `!r?.ok` mixed idioms at teams.js:195; harmless but a
  regression bait for future null-shape changes.
- **IN-02** — undo tests replay HTTP sequences and the D-06 pin is a regex scan; the actual
  `onAction` closure (where Gap 1 lives) has no executable unit coverage. Acceptable within
  the browser-closure harness limits; noted for the record.
- **IN-03** — `restore(snap)` rewinds the whole doc and (via the now-awaited `pushNow()`)
  persists that snapshot server-side, clobbering edits made during the ~5 s toast window.
  Documented D-05/D-06 design tradeoff, pre-existing behavior in local mode; flagged for the
  record only.

## Must-Haves Score

12 of 14 verified. The 2 unverified must-haves (honest undo on the failure path; conflict-free
sequencing) are exactly Gaps 1 and 2 above.

## Next

`/gsd-plan-phase 35 --gaps` → gap plans from this report → `/gsd-execute-phase 35 --gaps-only` → re-verify.
