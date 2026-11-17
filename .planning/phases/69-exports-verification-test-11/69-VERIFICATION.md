# 69-VERIFICATION.md — Owner UAT verdicts (Test 11)

Phase: 69-exports-verification-test-11 · Plan: 03 · Date: 2026-11-17
UAT target (D-69-6): MS Project Desktop XML Import Wizard, "As a new project".
Verdict criterion (D-69-8): the hierarchy SURVIVING is the criterion, not zero dialogs — repair dialog + correct 3-level Gantt = PASS (with note); flat/lost/shifted hierarchy = FAIL.

## Per-format verdict table

| Format | Status | Verdict / Observation |
|--------|--------|----------------------|
| MSPDI (project-en.xml) | **Verdict — FAIL on dates (hierarchy PASS)** | 3-level hierarchy rendered correctly (D-69-8 hierarchy criterion met), BUT MS Project zeroed Duration/Finish on ALL 5 subtask rows despite correct PT56H/PT240H in the XML → canonical fix landed (1589095), **re-UAT pending** |
| xlsx (project-en.xlsx) | N/A (observation) | Not an MS Project import channel — marked non-applicable (owner confirmation); expected-flat by design, cell-style indent is not a Project import channel |
| CSV (project-en.csv) | N/A (observation) | Wizard CSV mapping is expected FLAT by design; marked non-applicable (owner confirmation) — xlsx/CSV are not REQ-EXP-02 verdict channels |

## Test 11 FAIL fix (D-69-9, executed 2026-11-17)

**Evidence line-by-line comparison (gant.png vs project-en.xml):**

| Row | XML (Start → Finish, Duration) | Capture gant.png |
|---|---|---|
| Subtasked task (8) | 06/01 → 14/01, PT56H | 06/01 → 14/01, 7 j ✅ |
| Child one (9) | 06/01 → 14/01, PT56H | 06/01 → 06/01, **0 jour** ❌ |
| Child two (10) | 06/01 → 14/01, PT56H | 06/01 → 06/01, **0 jour** ❌ |
| Deep tree task (14) | 12/01 → 20/02, PT240H | 12/01 → 20/02, 30 j ✅ |
| Sub A (15) | 12/01 → 20/02, PT240H | 12/01 → 20/02, 30 j ✅ |
| Sub A.1 (16) | 12/01 → 20/02, PT240H | 12/01 → 12/01, **0 jour** ❌ |
| Sub A.2 (17) | 12/01 → 20/02, PT240H | 12/01 → 12/01, **0 jour** ❌ |
| Sub B (18) | 12/01 → 20/02, PT240H | 12/01 → 12/01, **0 jour** ❌ |

All other rows matched the XML exactly (incl. Done task 0,38 j = PT3H, In progress 17 j) — the capture came from the current sample (owner-confirmed). 100% correlation: honored durations = rows WITHOUT OutlineLevel; zeroed = rows WITH OutlineLevel.

**Root cause:** gr8r's Task emission violated the canonical Project element sequence four ways (verified against a real Project 2016 export in MPXJ ground truth + the 2007 XSD): `Manual` emitted last instead of right after Name/before Type; `OutlineLevel` right after Type without the canonical `WBS`/`OutlineNumber` pairing; `ManualStart/ManualFinish/ManualDuration` after `DurationFormat` instead of after `Duration`; `Notes` after `ExtendedAttribute` instead of before `PredecessorLink*`/`ExtendedAttribute*`. MS Project honors Manual* dates only in canonical order for OutlineLevel rows.

**Fix (commit 1589095):** full canonical realignment in `export/mspdi.js` — Manual flag before Type; canonical `WBS`+`OutlineNumber`+`OutlineLevel` trio (dotted task.sibling paths, e.g. 8.1, 14.1.1) before Start; Manual* between Duration and DurationFormat; Notes before PredecessorLink*/ExtendedAttribute*. Plan-01 positional assertions updated (69-01 pin Type→OutlineLevel → canonical trio pin); new element-order assertions added.

**Re-verification criteria 1+2 (D-69-9 closure gate):**
1. Automated pre-screen: `node --test test/export-{mspdi,model,xlsx,csv}.test.mjs` — 142/142 ✅; `npm test` 1713 pass / 0 fail ✅; lint 15 = baseline ✅; chunk 499.94 kB ≤ 500 kB ✅; zero new deps ✅; samples regenerated, canonical order + dates verified in project-en.xml ✅
2. **Owner re-UAT: PENDING** — owner must re-import the regenerated `project-en.xml` and confirm subtask rows carry the parent span (Child one/two 7 j ending 14/01; Sub A.1/A.2/Sub B 30 j ending 20/02). Closure requires this re-pass.

## MSPDI evidence (D-69-7)

Evidence file: `gant.png` (this directory) — Gantt screenshot captured after importing
`test-results/export-samples/project-en.xml` via the XML Import Wizard, "As a new project".
Title bar: "project-en - Project Professionnel" (MS Project Professional, French UI). 18 task rows.

Observed in the capture (vision analysis, model outside the session):

- **3-level hierarchy correctly rendered:**
  - `Subtasked task` (bold, expanded disclosure triangle, summary bar) → `Child one`, `Child two` indented beneath.
  - `Deep tree task` (bold, summary bar) → `Sub A` (bold, own summary bar, one level indented) → `Sub A.1 (deepe…)` / `Sub A.2` (further level indented); `Sub B` aligned with `Sub A`, not with the grandchildren.
- **No error / warning / repair / import dialog visible** in the capture.
- Consistency with the plan-02 sample set: the Alpha p_alpha chain (Todo/In progress/Backlog idea/Review/Done/Second done/Overdue…), the 3-level `Deep tree task` tree, milestone diamonds (05/01–12/01), a dependency connector between the first two bars, resources `Léa Lead`, `Pat Plain`, `[200%]`/`[0%]` loading, dates Jan–Feb 2026 (e.g. Subtasked task 06/01/26 → 14/01/26, 7 j; Deep tree task 12/01/26 → 20/02/26, 30 j).
- No WBS/Outline-number column displayed (row numbers only) — irrelevant to the verdict: the indent levels themselves prove the tree survived.

**Verdict rationale (D-69-8):** children indented under parents, grand-children a further level under Sub A, summary bars on both summary rows — the 3-level tree SURVIVED the real MS Project round-trip. Zero repair dialogs observed (better than the anticipated PASS-with-note case). **PASS.**

## Automated pre-screen (plan 01) — green

- `node --test test/export-mspdi.test.mjs test/export-model.test.mjs test/export-xlsx.test.mjs test/export-csv.test.mjs` — 142 tests, 142 pass
- Sample self-check: `node test/make-export-samples.mjs` exit 0, asserts `<OutlineLevel>2</OutlineLevel>` in the XML and the 3-segment dotted key in the CSV

## Item A1 closure (REQ-EXP-03)

- [ ] **Phase 65 item A1 (Test 11): OPEN — pending owner re-UAT** after the D-69-9 canonical fix (1589095). Hierarchy criterion passed; dates criterion failed on subtask rows; fix landed and pre-screen green. A1 closes ONLY on the re-UAT pass (criteria 1+2, D-69-9).
- [ ] Phase 999.1 backlog entry: stays open until the re-UAT pass.

## Task 3 disposition (D-69-9)

**EXECUTED (FAIL branch triggered)** — the initial read of gant.png suggested a hierarchy-only PASS, but the owner's line-by-line date check exposed a real MSPDI defect (subtask Duration/Finish zeroed). Owner directed FAIL → fix now. The fix is the canonical Task element sequence realignment of `export/mspdi.js` per D-69-9, re-verified against the MSPDI-SPEC citations and a real Project 2016 export; plan-01 positional assertions updated; suites green. **69-VERIFICATION.md finalization and A1 closure wait for the owner re-UAT pass.**
