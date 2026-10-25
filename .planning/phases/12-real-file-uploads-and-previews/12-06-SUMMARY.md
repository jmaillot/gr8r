---
phase: 12-real-file-uploads-and-previews
plan: 06
subsystem: api
tags: [upload-cap, i18n, interpolation, config-payload, e2e, max-upload-mb]

requires:
  - phase: 12-real-file-uploads-and-previews (12-02, 12-04)
    provides: the MAX_UPLOAD_MB knob (server.js:71), the files tab with the dropzone hint, the e2e/upload shared harnesses
provides:
  - /api/config exposes maxUploadMb — the live MAX_UPLOAD_MB knob crosses the server→client boundary
  - api.maxUploadMb in client state (25 fallback for demo/no-server paths), interpolated into the dropzone cap hint
  - Both catalogues carry page.files.dropLimit in the {n} placeholder form (placeholder parity kept)
  - Proofs: integration /api/config assertion at a non-default knob value; e2e rendered-hint assertion in en+fr (never 250)
affects: [phase verification, UAT re-run (12-UAT.md test 3)]

actuals:
  tokens: 1852
  tasks: 2
  commits: 2
  plan_head_before: 4922d7e797a8684f31e5a137dec08fdde67725fe
  plan_head_after: 73cb414

tech-stack:
  added: []
  patterns:
    - "knob pass-through: an operator env knob reaches the UI in five hops — env → /api/config payload → api.init() state → t() call-site vars → catalogue {n} placeholder; any single missing hop re-breaks the label (the debug session's AND-gate)"

key-files:
  created: []
  modified:
    - server.js
    - test/upload.test.mjs
    - src/core/api.js
    - src/views/files.js
    - src/locales/fr.json
    - src/locales/en.json
    - e2e/flows.spec.mjs

key-decisions:
  - "The {n} var is passed at the t() call site from api.maxUploadMb (state default 25 = the server default) — the hint is always numeric, never a raw {n} literal, on demo/no-server paths"
  - "The e2e assertion pins the rendered hint to the boot knob (MAX_UPLOAD_MB=1 → '1') via a locale-independent selector on the dropzone span, and also asserts 250 is unreachable"
  - "Operational: e2e must follow the FULL build — `npm run build:en` overwrites dist/ with an EMPTY French stub chunk, so running e2e after build:en fails all 25 French-surface tests; the verification battery's build must be the last build before e2e (both builds stay green individually)"

patterns-established:
  - "i18n-scan placeholder gate doubles as the regression guard: {n} in a catalogue without call-site vars (or vice versa) fails `npm run build` — no separate scan test needed"

requirements-completed: []  # I18N-01 was completed in phase 6; this plan re-uses the contract phase-scoped (new literals in both catalogues + parity), per 12-VERIFICATION.md's ledger note

coverage:
  - id: G-12-3
    description: "The dropzone cap label reflects the live MAX_UPLOAD_MB knob: /api/config carries maxUploadMb, api.init() reads it, and the hint interpolates it in both locales"
    requirement: I18N-01
    verification:
      - kind: integration
        ref: "test/upload.test.mjs#/api/config carries maxUploadMb from the MAX_UPLOAD_MB env knob (G-12-3) — harness MAX_UPLOAD_MB=7 asserts exactly 7 (knob pass-through, not a hardcoded default)"
        status: pass
      - kind: e2e
        ref: "e2e/flows.spec.mjs#file uploads and previews › a real PNG upload previews real bytes (en+fr) — rendered dropzone hint contains the boot knob value 1 and NOT 250"
        status: pass
    human_judgment: false
  - id: D-2
    description: "Manual UAT re-run of 12-UAT.md test 3: set MAX_UPLOAD_MB to a distinctive value locally and see the hint move"
    verification: []
    human_judgment: true
    rationale: "Operator-visible knob reflection is human-verifiable in a real browser by design; automated layers pin the payload and the rendered text."

# Metrics
duration: 18min
completed: 2026-10-25
status: complete
---

# Phase 12 Plan 6: Gap closure — MAX_UPLOAD_MB crosses into the client dropzone cap hint Summary

**`/api/config` now discloses `maxUploadMb`, `api.init()` carries it into client state, and the dropzone hint in both locales interpolates the live knob (`{n}` placeholder at files.js:42) — an operator who turns MAX_UPLOAD_MB sees the cap they turned; the hardcoded 250 is unreachable, pinned by integration + e2e proofs.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-10-25T07:55:41Z
- **Completed:** 2026-10-25T08:13:27Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- G-12-3 closed at all five hops of the AND-gate: `server.js` `/api/config` payload gains `maxUploadMb: MAX_UPLOAD_MB` (one field, existing consumers untouched); `api.init()` reads it into state (`Number(r.data?.maxUploadMb) || 25`), with the same 25 as the state default and an `api.maxUploadMb` getter; both catalogues convert `page.files.dropLimit` to the `{n}` placeholder form («— jusqu'à {n} Mo chacun» / «— up to {n} MB each»); the single render site passes `{ n: api.maxUploadMb }`
- Proof: `test/upload.test.mjs` boots a harness server with `MAX_UPLOAD_MB=7` and asserts `/api/config` returns exactly `7` — distinguishing knob pass-through from any hardcoded default
- Proof: `e2e/flows.spec.mjs` (phase-12 files tab, en+fr) asserts the rendered dropzone span contains the boot knob value `1` (e2e/server.mjs boots `MAX_UPLOAD_MB: '1'`) and does NOT contain `250`
- The i18n-scan placeholder-parity gate stays green: `{n}` in both catalogues matches the call-site vars (scan: 0 placeholder-mismatch), so a future uninterpolated call fails `npm run build`

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose maxUploadMb through /api/config and prove it in the integration suite** - `e0a40e5` (feat)
2. **Task 2: Carry the knob into client state and interpolate it into the dropzone hint (both locales), proven by e2e** - `73cb414` (feat)

## Files Created/Modified

- `server.js` — one field added to the `/api/config` payload (`maxUploadMb: MAX_UPLOAD_MB`); payload shape otherwise unchanged
- `test/upload.test.mjs` — new integration test boots the shared harness at `MAX_UPLOAD_MB=7` and asserts the /api/config field equals exactly 7
- `src/core/api.js` — `state.maxUploadMb` (default 25), `api.maxUploadMb` getter, and the `init()` read with the 25 fallback for demo/no-server paths
- `src/views/files.js` — the dropzone hint call site passes `{ n: api.maxUploadMb }` (dropHere/browse untouched)
- `src/locales/fr.json`, `src/locales/en.json` — `page.files.dropLimit` to placeholder form; no other key changes
- `e2e/flows.spec.mjs` — `uploadDict` gains `dropLimit` (boot-knob interpolated, n=1); the phase-12 test asserts the rendered hint in both locales

## Decisions Made

- **Fallback 25 in state, single read in init()**: the 25 fallback covers the demo/no-server paths where no /api/config answer exists, keeping the hint numeric; it mirrors the server's own default (server.js:71)
- **e2e asserts value + absence**: `toContainText(d.dropLimit)` (boot knob interpolated per locale) plus a `not.toContain('250')` guard — the old hardcoded value must be unreachable, not merely absent
- **Operational (e2e build order)**: `npm run build:en` leaves an empty French stub chunk in `dist/`; running e2e after `build:en` fails all 25 French-surface tests (independently verified green again after a full `npm run build`). The verification battery's commands were each proven green — with the full build as the last build before e2e. Documented here as the run-order rule the phase verification must follow.

## Deviations from Plan

None — plan executed exactly as written. (The e2e build-order discovery above is an operational note on the verification battery ordering, not a plan deviation; the per-task `<verify>` commands `npm test` and `npm run build && npm run e2e` were followed as specified.)

---

**Total deviations:** 0
**Impact on plan:** none.

## Issues Encountered

- Two e2e runs (25 failed / 18 passed) traced to a run-order artifact, not a code defect: e2e executed after `npm run build:en` overwrote `dist/` with an empty French stub (`_virtual_locale-empty_fr-*.js`), plus one orphaned e2e server child (a crashed run left `node server.js` bound to 4317 with its throwaway DATA_DIR ungleaned). After killing the orphan and re-running the full build, the suite passed 43/43. Recommendation carried to phase verification: always `npm run build` as the last build before `npm run e2e`.
- Pre-existing repo-wide lint (8 errors, incl. the intentional 12-02 `no-control-regex`) and format drift (~19 files) remain per deferred-items.md — none introduced by this plan's edits (all plan files individually eslint-clean; prettier diffs confined to pre-existing regions).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All three UAT gaps of phase 12 (G-12-1, G-12-2, G-12-3) are closed at code level and pinned by automated proofs; `12-UAT.md` test 3 re-runs as a manual check (set MAX_UPLOAD_MB to a distinctive value, watch the hint move)
- The phase has no remaining plans — 6/6 executed; next step is phase verification / `12-UAT.md` re-run
- Pre-existing lint/format drift (deferred-items.md) still trips the lint/format gate repo-wide and needs a dedicated cleanup task before ship

---
*Phase: 12-real-file-uploads-and-previews*
*Completed: 2026-10-25*

## Self-Check: PASSED
