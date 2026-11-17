# 69-VERIFICATION.md — Owner UAT verdicts (Test 11)

Phase: 69-exports-verification-test-11 · Plan: 03 · Date: 2026-11-17 (verdict final)
UAT target (D-69-6): MS Project Desktop XML Import Wizard, "As a new project".
Verdict criterion (D-69-8): the hierarchy SURVIVING is the criterion, not zero dialogs — repair dialog + correct 3-level Gantt = PASS (with note); flat/lost/shifted hierarchy = FAIL.

## Per-format verdict table

| Format | Status | Verdict / Observation |
|--------|--------|----------------------|
| MSPDI (project-en.xml) | **Verdict — PASS (re-UAT criteria 1+2 met, round 5)** | 3-level hierarchy rendered correctly (D-69-8) AND all 18 rows carry the exact expected dates/durations — owner's rule "subtask end = parent end" honored. Canonical-sequence fix (1589095) + auto-scheduled Type=0 subtask fix (85115e4) landed and re-verified end-to-end |
| xlsx (project-en.xlsx) | N/A (observation) | Not an MS Project import channel — marked non-applicable (owner confirmation); expected-flat by design, cell-style indent is not a Project import channel |
| CSV (project-en.csv) | N/A (observation) | Wizard CSV mapping is expected FLAT by design; marked non-applicable (owner confirmation) — xlsx/CSV are not REQ-EXP-02 verdict channels |

## Test 11 FAIL → fix → re-UAT history (D-69-9, 2026-11-17)

**Initial evidence (gant.png, line-by-line):** hierarchy 3-level PASS, but the 5 subtask rows imported Duration 0 / Finish=Start despite correct PT56H/PT240H in the XML (all other 13 rows exact). 100% correlated with the presence of OutlineLevel.

**Root cause (proven by a 8-variant diagnostic matrix imported by the owner):** the decisive field is `Type`. On OutlineLevel rows, MS Project re-derives auto-scheduled **Fixed-Duration (Type=1)** rows from zero (V1 PC=0, V2 PC=100, V7 PC=50, V3 +Work, V4 no-constraint, V5 +Estimated=0, V8 dates-omitted ALL zeroed); **Fixed Units (Type=0)** rows keep the emitted duration (V6 = 7 jours). Manual schedules on child rows never survive (R1, R4). Canonical element ORDER was necessary (R1 → R2 fix) but not sufficient.

**Fix trail:**
- `1589095` — canonical Task element sequence (Manual before Type; WBS+OutlineNumber+OutlineLevel trio before Start; Manual* after Duration; Notes before PredecessorLink/ExtendedAttribute); plan-01 positional pins updated
- `2e28ead` — subtask rows auto-scheduled (Manual=0, no Manual* block; SNET pin kept)
- `bbe7005`, `b069491` — PC/Manual explorations (superseded by the diagnostic evidence)
- `85115e4` — **final: subtask rows Type=0 Fixed Units + Manual=0 + real PercentComplete; top-level rows unchanged (Manual=1 + Type=1)**

**Re-verification (D-69-9 closure gate):**
1. ✅ Automated pre-screen: export suites 142/142; `npm test` 1713 pass / 0 fail; lint 15 = baseline; chunk 499.94 kB ≤ 500 kB; zero new deps; samples regenerated with the final shape
2. ✅ **Owner re-UAT round 5 (2026-11-17): 18/18 rows exact** — Child one/two 7 j fin 14/01; Sub A.1/A.2/Sub B 30 j fin 20/02; hierarchy 3-level intact; all other rows unchanged from the pre-fix exact baseline

## MSPDI evidence (D-69-7)

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

All other rows matched the XML exactly (incl. Done task 0,38 j = PT3H, In progress 17 j) — the capture came from the current sample (owner-confirmed). 100% correlation: honored durations = rows WITHOUT OutlineLevel; zeroed = rows WITH OutlineLevel. (Superseded by the "FAIL → fix → re-UAT history" section above — kept as the round-1 evidence record.)

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

- [x] **Phase 65 item A1 (Test 11): CLOSED** — owner UAT executed per `.planning/research/VERIFICATION.md` Part 2; initial FAIL on subtask dates fixed through the D-69-9 branch (5 rounds, diagnostic-matrix-driven, final shape Type=0 Fixed Units on child rows); owner re-UAT round 5 = 18/18 rows exact (criteria 1+2 met). MSPDI verdict = **PASS**.
- [x] Phase 999.1 backlog entry: closed — the real MS Project round-trip passes end-to-end (hierarchy AND dates).

## Task 3 disposition (D-69-9)

**EXECUTED (FAIL branch) — COMPLETE.** The initial read of gant.png suggested a hierarchy-only PASS; the owner's line-by-line date checks exposed the real MSPDI defect (subtask Duration/Finish zeroed) and directed FAIL → fix now. Five rounds: canonical order (1589095), auto-scheduling (2e28ead), PC explorations (bbe7005, b069491), then a 8-variant diagnostic matrix imported by the owner isolating `Type` as the decisive field — final fix 85115e4 (child rows Type=0 Fixed Units + Manual=0 + real PercentComplete). Pre-screen green at every step; owner re-UAT round 5 = 18/18 exact. Diagnostic tooling kept: `test/make-diagnostic-xml.mjs` + `test-results/export-samples/diagnostic-children.xml`.
