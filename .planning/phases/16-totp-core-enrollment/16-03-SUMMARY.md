---
phase: 16-totp-core-enrollment
plan: 03
subsystem: auth-tfa-settings-ui
tags: [totp, enrollment-ui, qr, recovery-codes, one-time-modal, i18n, honest-copy]
requires:
  - 16-01 renderQrSvg (src/lib/qr.js + vendored encoder)
  - 16-02 /api/auth/tfa/enroll|enable|disable routes and their response/error-code shapes
provides:
  - api.tfaEnroll / tfaEnable / tfaDisable (src/core/api.js, auth-scoped family)
  - Settings 2FA inline card (D-56): off → password step-up → QR + copyable secret → live-code verify, on-state, disable with dual-shape code input
  - One-time recovery-codes modal with copy-all; codes held only in transient S.ui.recoveryCodes, cleared on dismiss (D-53/T-16-10)
  - server userPayload.twoFa — the on-state's server ground truth (T-16-13)
  - refreshTfa() mount hook on the settings security tabs
  - 17 new settings.tfa.* / err.* keys in EN+FR (catalogue 1554→1567)
affects: [phase 17 login second step, phase 18 real-device UAT]
tech-stack:
  added: []
  patterns: [inline-card states over server ground truth, transient render state for one-time secrets, stable-error-code → err.* mapping with a hard 503 generic-fallback rule]
key-files:
  created: []
  modified: [src/pages/settings.js, src/core/api.js, src/overlays/modals.js, src/actions/actions.js, server.js, src/locales/en.json, src/locales/fr.json, eslint.config.js, test/i18n-core-features.test.mjs, test/error-codes.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs]
decisions:
  - "The 2FA card lives in a dedicated settings tab ('Two-step sign-in') in the security group — the D-56 inline card with states, no wizard, no new routing"
  - "On-state reads api.user.twoFa, newly disclosed by server userPayload; refreshTfa() (api.me()) re-reads it on mount and after every tfa state change — the deleted 14-04 stub pattern stays deleted (T-16-13)"
  - "All non-2xx tfa errors map known stable codes explicitly; anything else renders err.masterKeyMissing (503) or err.serverUnreachable — the response body never reaches the DOM (D-58/T-16-11)"
  - "Recovery codes render in a dedicated 'recovery' modal type; A.recoveryDismiss nulls S.ui.recoveryCodes before closeModal — nothing is persisted (D-53/T-16-10)"
metrics:
  duration: ~50 min
  completed: 2026-10-27
status: complete
actuals:
  tokens: 74000
  tasks: 3
  commits: 3
commits: 3
plan_head_before: e22b67d7b19676737d23c25058bde46d136c89b3
plan_head_after: a71bd74
---

# Phase 16 Plan 03: Settings 2FA Enrollment Surface Summary

The full enrollment lifecycle in one inline settings card — password step-up, scannable QR (via 16-01's `renderQrSvg`) with a monospace copyable-secret fallback, live-code verify, the one-time recovery-codes modal with copy-all, and password + dual-shape-code disable — wired through three auth-scoped `api.tfa*` methods with honest EN+FR copy and no stub residue.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 | One client path (tracer, TDD): locale keys, api.tfa*, enroll→QR→code→enable card | 1b5af05 | src/locales/*, src/core/api.js, src/pages/settings.js, src/overlays/modals.js, src/actions/actions.js, server.js, eslint.config.js, 4 test-pin files |
| 2 | On-state, disable flow, one-time modal completion | b0cb8e4 | src/pages/settings.js |
| 3 | Full-suite and build gates | a71bd74 | settings.js, api.js, locales, modals.js, actions.js, server.js, totp.js, vendor, 16-01/16-02 test files (prettier only) |

## TDD Flow (Task 1)

- **RED:** `node --test test/catalogue.test.mjs test/build-locales.test.mjs` run first with the new-key expectations: red — the 16 settings.tfa.* additions (plus err.codeRequired) did not exist in the catalogues.
- **GREEN:** keys added EN+FR identically, api methods copied from the api.sessions family shape, card + modal built. Tracer gate: re-ran `node scripts/i18n-scan.mjs && node --test test/catalogue.test.mjs test/build-locales.test.mjs test/error-codes.test.mjs` end-to-end — green — before expanding to Task 2.
- No client render-test harness exists in-repo (Phase 14 pattern is server + i18n contract tests); the executable verify is the i18n scan, catalogue/error-code tests, and build gates per the plan's own verify block.

## Verification

- `node scripts/i18n-scan.mjs` — 0 literals / 0 pending / 0 unlisted / 0 stale / 0 unresolved / 0 placeholder-mismatch
- `node --test test/catalogue.test.mjs test/build-locales.test.mjs test/error-codes.test.mjs` — 0 fail
- `npm run lint && npm run format:check && npm run build` — all green (format:check red on entry; see deviations)
- `npm test` — 511 pass / 0 fail
- Acceptance greps: settings.js imports `renderQrSvg` from `../lib/qr.js`; no `D().tfa`, no hand-built SVG grid, no localStorage/sessionStorage write of recovery codes

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] server.js userPayload now discloses `twoFa`**
- **Found during:** Task 1 — the plan's "on-state renders only from server ground truth" had no ground truth to read: userPayload did not carry `two_fa_enabled`
- **Fix:** added `twoFa: !!user.two_fa_enabled` to `userPayload` (server.js); `refreshTfa()` re-reads it via `api.me()` on mount and after enroll/enable/disable
- **Files modified:** server.js, src/actions/actions.js

**2. [Rule 3 - Blocking] actions.js wiring + a 'recovery' modal type**
- **Found during:** Task 1 — the card needs mount-hook wiring (`refreshTfa` on the security tabs), nine `A.tfa*`/`A.recoveryDismiss` actions, and a modal renderer; none existed
- **Fix:** implemented in actions.js (refreshTfa + actions, D-58 hard rule: 503 → `err.masterKeyMissing`, unknown → `err.serverUnreachable`, body never rendered) and a `case 'recovery'` in overlays/modals.js (copy-all via the existing `copyText` action; dismiss nulls `S.ui.recoveryCodes` first)
- **Files modified:** src/actions/actions.js, src/overlays/modals.js

**3. [Rule 3 - Blocking] eslint config needed the new files**
- **Found during:** Task 3 — `totp.js` (top-level, not in the node-globals file list) errored `no-undef Buffer`; the vendored file (committed 16-01) tripped `no-unused-vars`
- **Fix:** added `totp.js` to the node-globals files list; `src/lib/vendor/**` gets `no-unused-vars: off` (upstream dist quirks)

**4. [Rule 1 - Bug] The expired-enrollment error was set but never rendered**
- **Found during:** Task 2 review — `noPendingEnrollment` wrote `e.tfaMsg` but the off-state markup had no slot for it
- **Fix:** off state renders `e.tfaMsg` via the existing `.err` field-error style
- **Commit:** b0cb8e4

**5. [Rule 3 - Blocking] format:check was red on entry**
- **Found during:** Task 3 — `npm run format:check` failed on 6 files committed in 16-01/16-02 (totp.js, vendored file, three test files) plus server.js
- **Fix:** prettier applied to all six plus this plan's files so the gate passes; formatting only (16-01/16-02 suites re-ran green: 54/0)

**6. [Note] i18n count pins updated in-commit (Phase 14 convention):** catalogue 1554→1567 (test/i18n-core-features.test.mjs), api verbs 25→28 (same file), data-a 430→440 (test/i18n-shell.test.mjs + test/i18n-toast.test.mjs), `err.codeRequired` added to the reverse-parity client-only allowlist (test/error-codes.test.mjs).

**7. [Note] Placement:** the card is a dedicated 'Two-step sign-in' nav entry in the security group (key `settings.tfa.nav`, EN+FR) rather than a second card inside the password tab — the security group is the D-56 home and avoids duplicating the lead copy on the password tab.

## Honest Copy

- Enable toast states what happened and what to do now ("Two-factor authentication is on. Save your recovery codes now."); disable toast states the off fact; no invented counts anywhere.
- FR strings use U+202F before `?` and `!` per the french-typography contract.

## Threat Model Compliance

- T-16-10: codes live only in `S.ui.recoveryCodes`, rendered once in the modal; copy-all is the single duplication path; dismiss nulls state before re-render; grep confirms no storage writes
- T-16-11: the client maps status 503 to the catalogued generic `err.masterKeyMissing` and unknown codes to `err.serverUnreachable` — the MASTER_KEY-naming body never reaches the DOM
- T-16-12: the QR renders exclusively through `renderQrSvg(S.ui.tfaOtpauth)`; the URI is never re-parsed or rebuilt client-side
- T-16-13: the on-state reads `api.user.twoFa` via `refreshTfa()` (me + mount hook + post-mutation refresh); no client flag anywhere
- T-16-SC: no package installs

## Known Stubs

None. The whole lifecycle is wired end to end against the 16-02 routes. Manual QR scan verification is the Phase 18 real-device UAT (recorded in 16-VALIDATION.md's manual-only table).

## Self-Check: PASSED

- Commits 1b5af05, b0cb8e4, a71bd74 present in git log (3 commits measured from the plan ledger e22b67d)
- `npm test` green at SUMMARY time (511 pass / 0 fail); lint, format:check, build green
