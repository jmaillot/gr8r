# Research Summary: Exports Verification (Test 11) — Milestone v2.6

**Domain:** Export round-trip verification (MSPDI / xlsx / CSV vs. MS Project)
**Researched:** 2026-11-17
**Overall confidence:** HIGH

## Executive Summary

Phase 65 item A1 asks whether the multi-level subtask tree survives a REAL round-trip with MS Project. The codebase is already shaped for it: the export model emits a DFS row walk with `depth` (0-based), and the MSPDI writer derives `OutlineLevel = depth + 1` (1-based) plus positional Summary flags that work at any depth. A 3-level tree therefore produces, structurally, OutlineLevel 1/1/2/2/1 with Summary=1 on the task and the level-2 subtask, and manual scheduling keeps parent dates from rolling up — the owner's established rule.

The research question is not "is the feature built?" but "is the ONE unverified step safe?": the writer's `OutlineLevel` sits between `Type` and `Start`, while Microsoft's canonical example places it after `OutlineNumber`/before `Priority`. All Task elements are optional and Project's reader proved tolerant at one level (Phase 54-05 human check), but a nested OutlineLevel has never been imported. Test 11 exists to confirm exactly this. Skipped levels and childless summaries — the two classic import hazards — are structurally impossible from gr8r's DFS emission and should be pinned by cheap string assertions.

xlsx and CSV do not carry a Project-importable hierarchy channel: xlsx uses cell-style indent (fixed 1 level regardless of depth — a 3-level readability gap), and MS Project's CSV import is flat by design. These are facts for the UAT procedure, not pre-approved fixes.

## Key Findings

- **Stack:** zero new dependencies — verification via existing `node:test` string/positional assertions + `test/helpers/unzip.mjs` (see VERIFICATION.md).
- **Architecture:** hierarchy channel per format — MSPDI: OutlineLevel+Summary+order (complete); xlsx: style indent+bold+dotted key (visual, depth-blind); CSV: dotted key+order only (flat).
- **Critical pitfall:** OutlineLevel element order inside Task deviates from the canonical sequence; unverified at level 2+. If Project repairs or drops levels, this is the first suspect (EXPORT-SURVEY.md gap 1).
- **Date semantics:** subtask rows always inherit the TOP-level task's due (`t.due`, model.js:227) — consistent at any depth, but the "parent's due" comment is imprecise for 3-level trees.

## Implications for Roadmap

1. **Phase A (automated pre-screen)** — extend test/export-mspdi.test.mjs + export-model tests to a 3-level fixture: OutlineLevel=depth+1 at every level, summary-iffollower-deeper re-derived from the serialized XML, no upward level skip, DFS order. Uses only existing tooling.
2. **Phase B (owner UAT)** — one manual import per format following VERIFICATION.md: XML Import Wizard "as new project" (primary), Excel paste (xlsx, expect flat), CSV wizard (expect flat). Capture wizard dialogs + Gantt screenshot.
3. **Phase C (verdict recording)** — document pass/fail and any repair dialog verbatim; only then close A1.

**Phase ordering rationale:** automation first reduces the owner's manual loop to a single import attempt; UAT verdict informs whether any export fix phase is needed (out of scope for this milestone unless UAT fails).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| MSPDI spec | HIGH | Official MicrosoftDocs repo + OutlineLevel element doc |
| Current implementation | HIGH | Code read directly with line refs |
| Automation feasibility | HIGH | Existing suites already assert this shape |
| MS Project import UI behavior | MEDIUM | Community/standard product knowledge; owner confirms live |

## Gaps to Address

- Whether Project 2016+/365 tolerates OutlineLevel out of canonical order at depth ≥2 — only Test 11 answers.
- Whether style-indent survives Excel→Project paste — owner's live check.
- CSV hierarchy expectations are a product decision (requirements), not a research fact.
