# Phase 56 Discussion Log

**Date:** 2026-11-12
**Mode:** discuss (default, interactive)
**Phase:** 56 — Delivery Infrastructure

## Gray areas presented

3 areas identified via codebase scouting; user selected all 3.

| Area | Why it was gray |
|---|---|
| DELIV-02: what to split | Entry chunk is 627 kB but locales already split, export writers server-side, zero dynamic imports in src/ |
| DELIV-01: stale detection + behavior | e2e/server.mjs only checks existence, never freshness |
| I18N-01: registry + fixture test | LOCALES registry hardcoded in src/core/i18n.js — add-a-locale today needs 2 files |

## DELIV-02 — chunk splitting

**Q: Splitting strategy for the 627 kB entry chunk?**
Presented: Vendor + seed (rec) / Vendor + seed + settings page / Agent decides at plan time with source-map evidence.
**Answer:** Vendor + seed — dynamic-import qrcode.js (2187 l., click-only) + seed.js (515 l., demo-only); actions.js stays in entry.

**Q: How is the ≤500 kB limit durably verified?**
Presented: Build test (rec) / Guard inside e2e/server.mjs / Vite warning only.
**Answer:** Build test — a test runs vite build and fails on any chunk > 500 kB.

**Q: Loading behavior for the dynamic QR chunk?**
Presented: Spinner + retry (rec) / Idle preload / Seed-only split.
**Answer:** Spinner + retry — spinner at click, error toast + retry on failure; no idle preload.

**Q: More questions on DELIV-02?**
**Answer:** Next area.

## DELIV-01 — stale dist guard

**Q: How to detect a stale dist/?**
Presented: Hash manifest (rec) / mtime dist vs src / Hash of sources.
**Answer:** Hash manifest — Vite `build.manifest: true`, hashes compared against a build-time stamp; mtime never trusted.

**Q: Behavior when dist/ is stale?**
Presented: Fail-closed refusal (rec) / Auto-rebuild / Refusal + env opt-in rebuild.
**Answer:** Fail-closed refusal — non-zero exit, message names the fix (`npm run build`). No auto-rebuild.

**Q: Where does the guard live?**
Presented: e2e/server.mjs (rec) / npm pretest hook.
**Answer:** e2e/server.mjs — beside the existing existence check; a pretest hook is bypassable.

**Q: More questions on DELIV-01?**
**Answer:** Next area.

## I18N-01 — add-a-locale-by-JSON

**Q: How to make add-a-locale-by-JSON true?**
Presented: Derived registry (rec) / Keep hardcoded registry + test.
**Answer:** Derived registry — LOCALES derives from the glob (code = filename) + known-language name map; unknown language falls back to raw code.

**Q: Shape of the proving test?**
Presented: End-to-end fixture (rec) / Unit tests only.
**Answer:** End-to-end fixture — fake locale (e.g. xx.json): offered by selector, loaded by loader, en/fr untouched, i18n-scan gate not tripped.

**Q: Does the build auto-ship every locale in src/locales/?**
Presented: Glob is source of truth (rec) / Keep LOCALES env whitelist as gatekeeper.
**Answer:** Glob is source of truth — default build ships every locale present; `LOCALES=en` stays the EN-only opt-out; localeSubset plugin derives the same way.

**Q: More questions on I18N-01?**
**Answer:** Next area.

## Wrap-up

**Q: Other gray areas to explore?**
Presented: Ready for context (chosen) / Explore more (stamp-in-git, build-test-CI interplay, i18n-scan on dynamic catalogues).
**Answer:** Ready for context.

## Deferred ideas

None — discussion stayed within phase scope.

## Decision summary captured in

`.planning/phases/56-delivery-infrastructure/56-CONTEXT.md` (D-01..D-09)
