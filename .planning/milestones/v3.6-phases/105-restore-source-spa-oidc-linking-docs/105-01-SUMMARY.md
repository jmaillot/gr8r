---
phase: 105
plan: 01
subsystem: backup-restore-spa
tags: [restore, source-picker, probe, i18n, rsrc-04]
requires: ["104-01 probe route + sources[] payload", "89-06 restore drawer"]
provides: ["source picker in restore preview drawer", "per-source availability probe UI", "source transport on all 6 restore calls"]
affects: ["restore drawer UX", "i18n verb pin (85)"]
tech-stack:
  added: []
  patterns: ["chip-picker idiom (targetPicker copy)", "runId|source keyed ephemeral UI state", "restoreArmedSource mirror-guard"]
key-files:
  created: []
  modified:
    - src/actions/actions.js
    - src/pages/backup.js
    - src/core/api.js
    - src/locales/en.json
    - src/locales/de.json
    - src/locales/es.json
    - src/locales/fr.json
    - src/locales/nl.json
    - test/restore-client.test.mjs
    - test/i18n-core-features.test.mjs
    - test/backup-history-client.test.mjs
    - test/i18n-shell.test.mjs
    - test/i18n-toast.test.mjs
decisions:
  - "Per-source probe UX (chip-local icon button) chosen absent a discuss-phase lock (checker advisory I1) — the shared restoreprobe|<uid> 10/15-min operator budget favors owner-intent clicks over any check-all loop"
  - "Drawer-open kick guards on !S.ui.restoreSourcesById; the close action nulls the feed so every open re-fetches fresh sources[] (no staleness, one GET per open)"
  - "Default source = omit the param entirely (server registry order); only an explicitly armed non-default source is sent (mirror, never authority)"
  - "Download threads ?source= too (drawer-armed only, byte-identical URL otherwise) so every drawer-originated fetch is consistent"
metrics:
  duration: ~26 min
  completed: 2026-11-28
  tasks: 3
status: complete
commits: 3
plan_head_before: 2df1f5ffdca315f92f44996a56ffab07b055fa92
plan_head_after: 1f6c258f
actuals:
  tokens: 54000
  tasks: 3
  commits: 3
---

# Phase 105 Plan 01: Restore-Source SPA Summary

**One-liner:** restore preview drawer gains a chip source picker fed by server `sources[]` (enabled destinations only), a per-source on-demand availability probe with honest badge/toast, and the armed source threaded through all 6 restore calls — zero probes on load, no mid-run swap.

## What Was Built

- **Task 1 (tracer, d3bfae05):** `A.restorePreview` kicks `api.restoreBackups()` once per drawer open, staging `S.ui.restoreSourcesById` (runId → sources[]); fail-open without the feed. `sourcePicker` chip block in `restorePreviewBody` (targetPicker idiom, rendered only when `sources.length > 1`), `A.restoreSourcePick` arms `S.ui.restoreSource`, `restoreNew` sends `body.source` only for a non-default armed source. Reset coverage: close, different-runId reopen, all accepted-trigger paths.
- **Task 2 (TDD, a2558576):** RED structural assertions pinned first, then GREEN. `api.restoreProbe` POSTs the live probe route with the refusal-vocabulary doc block; verb pin 84→85 with the Phase-105 comment entry. `A.restoreProbe` is the ONLY probe caller (zero probes on load, D-89-14); state keyed `runId|source`; probe results toast through the existing `toast.*Probe*`/`err.*` families (s3/ftp/smb); refusals ride `restoreMissingToast`. Chips gain esc()d probe icon buttons (aria-busy pending) + honest ok/fail badges with the raw probe key in `title`; failed probes never disable a chip or mutate mirror flags (R-4).
- **Task 3 (1f6c258f):** armed source rides preview (`?source=`), download (`&source=`, byte-identical when default), verify/restoreNew/restoreOverwrite ×2/restoreInstance (`body.source` camelCase) via the `restoreArmedSource` mirror-guard. Test matrix extended: transport pins, zero-derivation guard (picker reads ONLY `sources[]`), total reset coverage (6 reset sites), structural probe-only-in-A.restoreProbe, 5-locale parity.

## Deviations from Plan

**1. [Rule 3 - Blocking] Test-window / pin updates demanded by the new code**
- **Found during:** Tasks 1-3
- **Issue:** structural pins sized to the old code: the refusal-toast-map 1600-char slice (A.restorePreview grew), the 95-05 overwrite POST exact-string contract, the tree-wide data-a counts (630→632), and the `api.backupVerifyChecksum(id)` substring.
- **Fix:** widened the slice to 2600 (commented), updated the contract strings and the data-a pins with `+2 (105-01)` D-12 comment entries.
- **Files:** test/restore-client.test.mjs, test/backup-history-client.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs
- **Commit:** d3bfae05 / 1f6c258f

**2. [Rule 1 - Bug] fr sourcePickHint used straight apostrophes**
- **Found during:** Task 3 full-suite gate
- **Issue:** the new French key added a NEW D-05 typography breach on top of the documented pre-existing failure.
- **Fix:** typographic apostrophes (’) — the key now contributes zero breaches.
- **Commit:** 1f6c258f

**3. [Rule 1 - Bug] Transient: an edit dropped the `A.restoreTargetPick` action header**
- **Found during:** Task 1 verify (caught by the 95-05 structural test before commit)
- **Fix:** header restored; verified `node --check` + suite.

**4. [Scope note] STATE.md/ROADMAP.md not updated by this executor**
- The parallel sibling (105-02) commits shared `.planning/` files in the same tree; per the wave isolation rules this executor committed ONLY its own SUMMARY to avoid clobbering shared mutable state. Orchestrator owns the state advance.

## Verification

- `node --test test/restore-client.test.mjs test/i18n-core-features.test.mjs test/backup-history-client.test.mjs test/restore-source-param.test.mjs test/restore-source-resolution.test.mjs` → 124 pass / 0 fail
- `npm test` → 2767 tests, 2734 pass, **2 failures — both documented pre-existing** (french-typography D-05 golden list, webhook-routes GET list D-06); the webhook-events due.reminder flake did not fire this run. No new failures.
- Greps: `S.ui.restoreProbe = null` ×6 reset sites; restoreProgress block contains zero source/probe markup; `api.restoreProbe(` appears exactly once (A.restoreProbe); 0 in pages; verb count = 85.

## Commits

- d3bfae05: feat(105-01): restore source picker — chips fed by server sources[], armed-state wiring (RSRC-04)
- a2558576: feat(105-01): per-source availability probe — api.restoreProbe, honest badge + detail toast (RSRC-04)
- 1f6c258f: feat(105-01): armed source rides all 6 restore calls + test matrix (RSRC-04, GD-4)

(Ledger range `2df1f5ff..HEAD` also contains the interleaved 105-02 docs commits 41fc2aee/8c0c8af6 — not this plan's work.)

## Per-Source Probe UX Note (checker advisory I1)

RSRC-04 left per-source vs check-all "decided at discuss-phase"; no 105-CONTEXT.md exists, so the researched recommendation was implemented: **per-source** probe buttons (one icon button per non-local chip). Rationale: the server's `restoreprobe|<uid>` budget (10 per 15 min per operator) is shared, so a check-all loop over N runs × 3 sources drains it; a per-source check is unambiguous owner intent. Markup adapts trivially to a check-all variant if the owner prefers one later.

## Threat Model Compliance

- T-105-01: every interpolated source/runId string is esc()d in data-* and title attributes; chip labels ride the RESTORE_LOCATION_KEYS fixed vocabulary (t()-rendered).
- T-105-02: no auto-probe on load/render (structural test pins one call site, inside A.restoreProbe); pending disables the button.
- T-105-03: accept (server audit covers probe + triggers).
- T-105-SC: zero new dependencies.

## Self-Check: PASSED

- Files exist: src/actions/actions.js, src/pages/backup.js, src/core/api.js, ×5 locales, 4 test files (verified via git log --stat).
- Commits exist: d3bfae05, a2558576, 1f6c258f (verified via git log).
- No stubs introduced (probe/badge/picker all wired to real payloads); no new threat surface beyond the plan's threat model.
