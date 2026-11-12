---
phase: 57-views-columns-general-access
plan: 03
subsystem: workspace default visibility (VIEW-03)
tags: [default-private, prefs, doc-put-funnel, project-creation, seeding, lazy-chunk, i18n-guards, e2e]
requires: [D-51-15/16 stored-prefs-pref read convention (server.js mergeClientDoc), permCreate settings-toggle pattern, projectIsPrivate binary funnel, visibility e2e conventions]
provides:
  - prefs.defaultPrivate owner/admin workspace setting (doc-prefs storage, D-03)
  - server-side fail-closed normalization (non-boolean → false) + stored-doc-only reads for non-managers (T-57-07)
  - creation-time private seeding with server parity (A3) — explicit private always wins (D-04)
  - owner toggle in Settings > General (permCreate row pattern) + informational Access-tab hint (D-04)
  - client createProject seed — private key ABSENT unless the pref is on or the form chooses it
  - test/default-private.test.mjs (6 server pins) + e2e/default-visibility.spec.mjs (owner story)
  - lazy export-model chunk (DELIV-02 remedy) with constants.js DEFAULT_OPTIONS drift pin
affects: [58 (FTS) not affected — funnel untouched; future retro-apply/bulk actions remain rejected (D-02)]
tech-stack:
  added: []
  patterns: [lazy-chunk split under the DELIV-02 500 kB index gate (56-02/57-01/57-02 pattern — third application), stored-doc-pref trust convention (D-51-15/16 clone), seed-evidence capture BEFORE normalizeProjects]
key-files:
  created: [test/default-private.test.mjs, e2e/default-visibility.spec.mjs]
  modified: [server.js, src/actions/actions.js, src/pages/settings.js, src/overlays/modals.js, src/core/constants.js, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs, test/export-client.test.mjs, test/build-chunk-size.test.mjs]
decisions:
  - "Seeding evidence is captured BEFORE normalizeProjects(next): normalization fills private:false on every row and destroys the 'absent' evidence — seedPrivateIds is computed from the raw incoming doc, applied only to !prev rows in the create loop"
  - "Server seeding is role-independent (!prev only): client/server parity for owner AND member creations; an explicit private:true/false on the incoming row always wins (D-04)"
  - "Even an owner/admin prefs write is coerced fail-closed (next.prefs.defaultPrivate = incoming === true) — truthiness can never enter the stored doc"
  - "[Rule 3] export/model.js went lazy (third application of the DELIV-02 remedy): A.exportOpen awaits the import into S.ui.expMod before the modal opens; DEFAULT_OPTIONS copied to constants.js and pinned against model.js by a drift test (model.js keeps its NO-IMPORTS Node contract)"
  - "The hint shows the workspace default only — no 'use default' action exists (D-04); the per-project binary stays the sole authority"
requirements-completed: [VIEW-03]
metrics:
  duration: ~65 min
  completed: 2026-11-12
status: complete
plan_head_before: 8b34a151ca62fd4f17e9d0eb0a241f97a48575bf
plan_head_after: f6cbe33
commits: 3
actuals:
  tokens: 68000
  tasks: 2
  commits: 3
---

# Phase 57 Plan 03: Workspace Default Visibility (VIEW-03) Summary

**One-liner:** `prefs.defaultPrivate` — an owner toggle that seeds `private: true` on newly created projects (client `createProject` + server `mergeClientDoc` parity, stored-doc reads only, explicit choice always wins), an informational Access-tab hint, zero changes to the visibility funnel, proven by 6 server pins and a full owner-story e2e.

## What Was Built

- **Task 1 (TDD, commits 386ba1a + d1c3210):** `test/default-private.test.mjs` written first (RED: 3 intentional failures — trust boundary, coercion, seeding), then implemented. server.js `mergeClientDoc`: (a) `seedPrivateIds` — new incoming projects lacking an explicit `private` key, captured BEFORE `normalizeProjects(next)` fills `private: false`, only when the STORED pref is on; (b) creation-loop seeding `if (!prev && seedPrivateIds.has(p.id)) p.private = true`; (c) prefs normalization — non-managers get the stored value, managers get fail-closed boolean coercion. Client: settings.js owner toggle (`defaultPrivate`, permCreate row pattern, rides the doc-PUT prefs funnel), modals.js Access-tab `.faint` hint line reading the same pref (no action, D-04), actions.js `createProject` seeds `private: true` only when the pref is on or the form carries `private: true` — the key stays ABSENT otherwise. 4 catalogue keys en+fr (count 1838→1842). Visibility funnel (`projectIsPrivate`/`hiddenFor`) byte-identical (D-01).
- **Task 2 (commit f6cbe33):** e2e/default-visibility.spec.mjs — owner enables the default in Settings > General (server-stored pref polled before any dependent step), a member creates a project through the real UI modal → seeded `private: true`, absent from the non-invited member's redacted doc GET AND projects list; pref off → workspace-visible. Plus [Rule 3] the chunk-gate remedy (below) and the fr.json colon-typography fix (U+00A0).

## Verification

- `node --test test/default-private.test.mjs` — 6/6 pass (unset-pref merge, T-57-07 stored-doc trust, fail-closed coercion, A3 seeding, D-04 explicit-wins, D-02 no-retro-apply)
- Full chain: chunk gate 10/10 (index 493.4 kB ≤ 500,000 — ~6.6 kB headroom recovered) · `npm test` 1426 pass / 0 fail · eslint ✓ · i18n scan 0 violations ✓ · `npm run e2e` — full suite green modulo 2 concurrency-timing flakes (saved-views toast strict-mode, 2fa-fr) that each passed in isolated reruns, the same class 57-02 documented; the new default-visibility spec passed in both full runs

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] DELIV-02 500 kB index-chunk gate tripped (third time)**
- **Found during:** Task 2 verify (chunk gate)
- **Issue:** index had ~115 B headroom after 57-02; the new toggle/hint/seed code plus 4 catalogue keys pushed it to 500,558 B.
- **Fix:** the established lazy-chunk pattern — `export/model.js` (only statically imported by actions.js + modals.js, both user-triggered export paths) became a lazy chunk. `A.exportOpen` awaits the import and stashes the module on `S.ui.expMod` BEFORE the modal opens (the modal's count derives from `buildExportModel` synchronously — source-text contract preserved); `A.exportSubmit` awaits the same module. `DEFAULT_OPTIONS` moved to a synchronous `constants.js` copy with a drift pin in test/export-client.test.mjs (model.js keeps its documented NO-IMPORTS Node contract). `model-*.js` split-existence assertion added to build-chunk-size.test.mjs. Index landed at 493.4 kB — ~6.6 kB of future headroom recovered.
- **Files:** src/actions/actions.js, src/overlays/modals.js, src/core/constants.js, test/export-client.test.mjs, test/build-chunk-size.test.mjs
- **Commit:** f6cbe33

**2. [Rule 1 - Bug] French colon typography**
- **Found during:** Task 2 verify (french-typography gate)
- **Issue:** the new `modal.defaultPrivateOn/Off` strings used a plain/narrow space before `:` — the rule requires U+00A0 before a colon (U+202F is reserved for `; ! ?`).
- **Fix:** U+00A0 applied.
- **Files:** src/locales/fr.json
- **Commit:** f6cbe33

### Notes (by design, not stubs)
- Server-side, a stored project always carries an explicit `private` boolean (`normalizeProjects`) — the "absent key = non-private" shape is the client `createProject` contract, proven via the e2e + the funnel's `=== true` test.
- No retro-apply path exists anywhere — the pref only touches `!prev` rows (D-02 verified by test).

## Known Stubs

None — every wire is live (server normalization + seeding, owner toggle, hint line, client seed, e2e proof).

## Threat Flags

None — no new surface beyond the plan's `<threat_model>` (T-57-07 mitigated and tested: stored-doc-only reads for non-managers + fail-closed coercion; T-57-08 rides the existing settings funnel, no new permission surface; no packages added).

## Self-Check: PASSED

- test/default-private.test.mjs, e2e/default-visibility.spec.mjs — FOUND on disk
- Commits 386ba1a, d1c3210, f6cbe33 — FOUND in git log
- Commit count measured: `git rev-list --count 8b34a15..HEAD` = 3
