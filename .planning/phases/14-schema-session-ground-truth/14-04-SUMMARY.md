---
phase: 14-schema-session-ground-truth
plan: 04
subsystem: client-sessions-ui
tags: [sessions, settings, revocation, 2fa-removal, i18n-pins]
requires:
  - 14-01 (strip-free docs — D().sessions/D().tfa no longer exist)
  - 14-02 (api.sessions()/revokeSession(id)/revokeAllSessions(); deviceLabel(); err.signedOutElsewhere)
  - 14-03 (GET /api/auth/sessions + the two DELETE endpoints; { id, userAgent, ip, createdAt, lastSeenAt, current })
  - 13-DECISIONS.md D-19/D-25/D-28/D-29/D-33
provides:
  - settings sessions tab rendered from server API ground truth (S.ui.sessions), device label + IP + relative last-seen + this-device badge
  - per-row and disconnect-all revoke actions calling the real DELETE endpoints with D-29 refresh-after-success
  - signOutRevoked() D-28 teardown helper beside A.signOut
  - refreshSessions() export + settings/sessions mount hook in A.go
  - client 2FA surface fully deleted (stubs + tab), Phase 16 restores with real TOTP
affects:
  - 15 (password change reuses signOutRevoked()/the revocation primitive)
  - 16 (rebuilds the 2FA enrollment UI; may reuse settings.tfa.* catalogue keys kept in place)
tech-stack:
  added: []
  patterns:
    - fetch-on-mount action pattern (refreshSessions beside refreshMembers)
    - in-commit byte-identity pin maintenance (icon baseline, section ids, data-a counts)
key-files:
  created: []
  modified:
    - src/actions/actions.js
    - src/pages/settings.js
    - test/fixtures/icons-baseline.json
    - test/i18n-core-features.test.mjs
    - test/i18n-pages.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - '2FA catalogue keys (settings.tfa.*, err.tfaCode, act.disable2fa*, toast.twoFa*) stay in en.json/fr.json — Phase 16 reuses them; the i18n scan only fails on unresolved keys, not unused ones'
  - toast fallback for a failed revoke is err.sessionExpired (the plan's chosen key), never an empty toast and never the research's err.sessionNotFound (D-26/OQ4 removed that code in 14-03)
  - guard pins updated in the same commit as their cause (14-02 pattern): icon baseline lost shield-off (Task 1) then shield-check/shield-alert (Task 2); data-a pin 434 → 430; settings section-id list drops '2fa' with an anti-regression assert
metrics:
  duration: 13min
  completed: 2026-10-26
status: complete
estimate:
  tokens: 35000
actuals:
  tokens: 3351
  tasks: 2
  commits: 2
plan_head_before: cb7898dc722cb4db30f205329b5ab5ddefcf5a78
plan_head_after: ad2557b79d87a4d235d82f207221df19ba72aa1a
commits: 2
---

# Phase 14 Plan 04: Client UI Wiring for Sessions Revocation Summary

The settings sessions tab now renders real server ground truth through GET /api/auth/sessions, revoke buttons call the real DELETE endpoints with refresh-after-success, a revoked browser gets the honest D-28 teardown, and the dormant 2FA stubs and tab are deleted for Phase 16 to rebuild with real TOTP.

## What Was Built

### Task 1 — actions.js: mount hook, refreshSessions(), rewired revokes, signOutRevoked(), stub deletion (commit 0b3e657)

- **Mount hook (D-29):** `A.go` gains `if (r === 'settings' && p.sec === 'sessions' && api.enabled) refreshSessions();` beside the members hook.
- **refreshSessions()** exported beside `refreshMembers()`: `api.sessions()` → `S.ui.sessions` (the `{ id, userAgent, ip, createdAt, lastSeenAt, current }` shape 14-03 serves) + `S.ui.sessionsLoaded` → `render()` → returns data.
- **A.revokeSession** rewired from doc mutation to `api.revokeSession(id)`: 401 → `signOutRevoked()`; other failure → toast with `res.error || t('err.sessionExpired')` (fallback per plan; `err.sessionNotFound` from the research skeleton no longer exists after 14-03's OQ4 idempotent-204 decision); success → `await refreshSessions()` + `t('toast.sessionSignedOut')`.
- **A.revokeAll** keeps its confirmDlg wrapper; the run callback now calls `api.revokeAllSessions()` with the same 401/error/success handling and `t('toast.signedOutOthers')`.
- **signOutRevoked()** beside `A.signOut()`: `await A.signOut()` then `toast(t('err.signedOutElsewhere'), { kind: 'err' })` — the D-28 honest teardown (14-03 proved the 401 carries `code: 'signInRequired'` which maps to this key).
- **2FA stubs deleted outright (D-33):** `A.setup2fa`, `A.cancel2fa`, `A.verify2fa`, `A.disable2fa` — dead code whose `D().tfa` mutations would throw after 14-01's doc strip.
- **Rule 3 (in-task):** removing `A.disable2fa` orphaned the `shield-off` icon — `test/fixtures/icons-baseline.json` drops it and the `test/i18n-core-features.test.mjs` count pin moves 172 → 171 in the same commit.

### Task 2 — settings.js: sessions rewire, 2FA case deletion, SET_NAV cleanup (commit ad2557b)

- Import: `ago, dOff, deviceLabel, esc, fmtDate` from utils.js (alphabetical).
- SET_NAV security group: the `['2fa', 'settings.nav.twoFactor', 'shield-check']` entry removed — the tab is gone; Phase 16 restores it.
- The `'sessions'` case reads `S.ui.sessions` and renders via `srow()`: icon (`smartphone` when the UA matches iPhone/iPad/Android/Mobile else `monitor`) + `esc(deviceLabel(s.userAgent))` + green badge `t('settings.sessions.thisDevice')` when `s.current`; description `esc(s.ip || '—') · ago(s.lastSeenAt || s.createdAt)` (D-25 fallback, D-19 no location anywhere); control `data-a="revokeSession" data-id="${esc(s.id)}"` with `t('palette.signOut')` for non-current rows.
- Disconnect-all button: `data-a="revokeAll"`, disabled when `rows.length <= 1`, `t('settings.sessions.revokeAll')`.
- The `'2fa'` case deleted entirely — fake 11×11 QR grid, hardcoded recovery codes, setup/cancel/verify/disable flow.
- **Rule 3 (in-task):** the deleted case orphaned `shield-check` and `shield-alert` — baseline drops both (169 total), count pin 171 → 169; the settings section-id pin in `test/i18n-pages.test.mjs` drops `'2fa'` and gains an anti-regression assert; the tree-wide `data-a` count pin (434 → 430, −4 action buttons) is updated in both `test/i18n-shell.test.mjs` and its duplicate in `test/i18n-toast.test.mjs`.

## Verification Performed

- `npm test` — **455/456 pass**; the single failure is the pre-existing `test/i18n-prefs.test.mjs:243` ("the roadmap carries the phase 6 section") logged to deferred-items.md in 14-01 and reproduced at every prior plan's base — unrelated to 14-04.
- `npm run build` — passes, including the prebuild i18n-scan gate (0 unresolved t() keys; the dormant `settings.tfa.*` keys are unused but legal — the scan does not fail on unreviewed-removal, only on unresolved/unlisted).
- `npm run lint` — clean; `npx prettier --check` — clean on all 7 touched files.
- Plan grep gates, all zero: `D().sessions|D().tfa` in both files; `A.setup2fa|A.cancel2fa|A.verify2fa|A.disable2fa` anywhere in src/; `'2fa'` in settings.js; legacy doc fields `s.dev/s.loc/s.at` gone.
- Positive-shape greps: sessions case contains `S.ui.sessions`, `deviceLabel(`, `ago(`, `s.current`, `s.lastSeenAt || s.createdAt`; no `s.loc`.

## Tracer Feedback Gate

N/A — both tasks are `type="auto"` (the plan carries no tracer); each task's `<verify>` (`npm test`) was re-run after its commit and passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Icon baseline lost shield-off (Task 1) and shield-check/shield-alert (Task 2)**
- **Found during:** Task 1 / Task 2 verification (`test/build-locales.test.mjs` frozen-baseline guards)
- **Issue:** the byte-identity icon scans froze a 172-name baseline; deleting the 2FA stubs/case removed the only users of three shield icons.
- **Fix:** baseline entries removed and the count pin updated in the same commit as each cause (14-02 precedent: pins live to force intentional updates).
- **Files modified:** test/fixtures/icons-baseline.json, test/i18n-core-features.test.mjs
- **Commit:** 0b3e657, ad2557b

**2. [Rule 3 - Blocking] Settings section-id and data-a count pins**
- **Found during:** Task 2 verification (`test/i18n-pages.test.mjs:613`, `test/i18n-shell.test.mjs:327`, duplicate `test/i18n-toast.test.mjs:290`)
- **Issue:** the '2fa' section id disappeared from settings.js and four data-a buttons (setup/cancel/verify/disable) left the tree.
- **Fix:** pins updated in-commit; the section list gains an explicit `!src.includes("'2fa'")` anti-regression assert; the duplicate count test in the toast wave file was found by running the full suite (it passed standalone — a real catch for measure-twice).
- **Files modified:** test/i18n-pages.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Commit:** ad2557b

**3. [Rule 3 - Blocking, self-inflicted then fixed] Malformed edit in i18n-pages.test.mjs**
- **Found during:** post-edit suite run (456-test file crashed to 440 — parse error cascade)
- **Issue:** my pin edit left a stray closing brace, breaking the file.
- **Fix:** brace removed; suite restored to 456 tests.
- **Files modified:** test/i18n-pages.test.mjs
- **Commit:** ad2557b

Two plan-vs-research divergences, resolved in the plan's favor (not deviations): the revoke-error fallback uses `t('err.sessionExpired')` (plan <action>) instead of the research skeleton's `t('err.sessionNotFound')` (deleted by 14-03's OQ4), and `signOutRevoked()` toasts via the directly imported `t()` rather than the research snippet's `tk()` alias (actions.js has no `tk` binding).

## Threat Model Compliance

No new threats — the plan's register holds: every server-supplied value (userAgent-derived label, ip, timestamps) reaches the DOM through `esc()` at the render site; revoke requests go to 14-03 endpoints already behind sameOrigin + requireUser + user-scoped WHERE; `signOutRevoked()` reuses the trusted `A.signOut()` teardown. The threat scan found no surface outside the plan's `<threat_model>`.

## Auth Gates

None.

## Known Stubs

None. The 2FA surface is deleted by design (D-33) — Phase 16 restores it with real TOTP behavior and a vendored QR generator; the unused `settings.tfa.*` catalogue keys are intentionally kept as its vocabulary. Every `<verify>` ran and passed.

## Self-Check: PASSED

- Files on disk: `src/actions/actions.js`, `src/pages/settings.js` modified; all 5 test/fixture files committed.
- Commits verified in git log: `0b3e657`, `ad2557b`.
- `git rev-list --count cb7898d..ad2557b` = 2 (matches `commits: 2`).
- Content spot check: baseline carries no `shield-off`/`shield-check`/`shield-alert` (only the still-used `shield`).
