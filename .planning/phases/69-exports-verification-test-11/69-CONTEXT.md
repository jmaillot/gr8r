# Phase 69: Exports Verification (Test 11) - Context

**Gathered:** 2026-11-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the multi-level subtask tree survives a REAL round-trip with MS Project — close Phase 65 item A1 (Test 11). Automated structural pre-screen with existing tooling first, then one manual owner import per format (MSPDI primary), verdict recorded. Export fixes ONLY if the UAT fails. No new export formats, no CSV/xlsx hierarchy enrichment, no incoming-import feature.

</domain>

<decisions>
## Implementation Decisions

### Fixture 3 niveaux
- **D-69-1** — Extend the EXISTING fixture chain (`test/fixtures/export-fixtures.mjs` + `test/make-export-samples.mjs`), do not create a separate fixture file. The Phase 54 fixture tree gains a 3-level branch and the generator writes the new sample files used by the pre-screen AND the owner's UAT. — **Reversibility:** reversible
- **D-69-2** — Fixture content: ONE rich 3-level tree (root task → subtask → sub-subtask, plus at least a second root) with varied dates/offsets, one milestone, notes, partial completion — maximum signals in a single export. Not minimal, no separate edge-case fixtures (edge behavior stays covered by unit tests, not the UAT file).

### Pré-screen automatisé
- **D-69-3** — Assertions live in the EXISTING suites (`test/export-mspdi.test.mjs`, `test/export-model.test.mjs` etc.), extended with 3-level cases. No new test file. — **Reversibility:** reversible
- **D-69-4** — MSPDI assertions target the SERIALIZED XML (string/positional), not the in-memory model — that is what MS Project reads. Summary re-derived from the serialized XML, OutlineLevel = depth+1 at every level, no upward level skip, DFS order.
- **D-69-5** — UAT import files are produced by extending `test/make-export-samples.mjs` (standalone, no server, no deps) — NOT via e2e UI export. Keep the existing locale pair (en/fr) if cheap, 3-level tree mandatory.

### Procédure UAT
- **D-69-6** — UAT target: MS Project DESKTOP (XML Import Wizard "as new project") — the reference for item A1. xlsx via Excel paste and CSV via wizard are recorded as expected-flat observations, not verdicts.
- **D-69-7** — Evidence kept: Gantt screenshot of the 3-level tree in MS Project + any wizard/repair dialog described verbatim, stored in the phase directory (`.planning/phases/69-*/`).

### Critère de verdict
- **D-69-8** — A repair dialog with the 3-level hierarchy rendered CORRECTLY in the Gantt = PASS (with note). Flat/lost hierarchy or shifted levels = FAIL. The hierarchy surviving is the criterion, not zero dialogs.
- **D-69-9** — If FAIL: the fix re-aligns the MSPDI writer on the CANONICAL Microsoft Task element sequence (OutlineLevel after OutlineNumber, before Priority) — full canonical alignment, not a spot patch — then re-verifies through pre-screen + owner UAT before closure. — **Reversibility:** reversible

</decisions>

<canonical_refs>
## Canonical References

- `.planning/research/MSPDI-SPEC.md` — OutlineLevel/Summary/date/ExtendedAttribute spec facts with citations (1-based level, optional Summary reconciled on import, no-timezone dates)
- `.planning/research/EXPORT-SURVEY.md` — what each format emits today for a 3-level tree + gap table (xlsx indent fixed at 1 level; CSV flat)
- `.planning/research/VERIFICATION.md` — zero-dep automation assertions + the owner's manual MS Project UAT procedure (follow this for D-69-6/7)
- `.planning/research/SUMMARY.md` — milestone-scoped summary
- `export/mspdi.js` — current writer (OutlineLevel = depth+1, positional Summary, element order Type→OutlineLevel→Start)
- `export/xlsx.js` — xlsx writer (cell-style indent, depth-blind)
- `src/export/model.js` — export model (DFS rows with depth; subtask rows inherit top-level task's due, model.js:227)
- `test/make-export-samples.mjs` — Phase 54 sample generator to extend
- `test/fixtures/export-fixtures.mjs` — Phase 54 fixture factories to extend
- `.planning/REQUIREMENTS.md` — REQ-EXP-01/02/03, NFR-01/02/03, out-of-scope
</canonical_refs>

<code_context>
## Code Context

- 8 existing export suites (`test/export-{client,csv,gantt,model,mspdi,prohibition,route,xlsx}.test.mjs`) — extend, don't duplicate
- `test/helpers/unzip.mjs` — existing xlsx inspection helper for xlsx assertions
- Phase 65 already pinned the nested-row contract in `test/export-model.test.mjs` (DFS order, per-level keys, parent ids, depth) — build on it
- Standing gates apply: zero new deps, chunk ≤500 kB (499940/500000), EN+FR i18n, 1705+ unit grow-only, e2e 132/132, lint 15-error baseline
- If UI touched at all (unlikely): import-label keys must not collide with Lucide icon names (docs/project-templates.md §3.4 trap)
</code_context>

<deferred>
## Deferred Ideas

- CSV/xlsx hierarchy enrichment (indent depth channel for xlsx) — product decision deferred unless UAT forces a fix
- Incoming MSPDI import feature — separate milestone
- Round-trip automation with a dependency (MPXJ) — rejected for now per NFR-01
</deferred>
