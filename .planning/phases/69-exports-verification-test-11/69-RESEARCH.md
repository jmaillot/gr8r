# Phase 69: Exports Verification (Test 11) - Research

**Researched:** 2026-11-17
**Domain:** Export verification — MSPDI/xlsx/CSV round-trip with MS Project Desktop (automated structural pre-screen + owner manual UAT)
**Confidence:** HIGH for automation (code + prior research docs read directly); MEDIUM for MS Project UI behavior (community/standard product knowledge, already captured in VERIFICATION.md)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-69-1** — Extend the EXISTING fixture chain (`test/fixtures/export-fixtures.mjs` + `test/make-export-samples.mjs`), do not create a separate fixture file. The Phase 54 fixture tree gains a 3-level branch and the generator writes the new sample files used by the pre-screen AND the owner's UAT.
- **D-69-2** — Fixture content: ONE rich 3-level tree (root task → subtask → sub-subtask, plus at least a second root) with varied dates/offsets, one milestone, notes, partial completion — maximum signals in a single export. Not minimal, no separate edge-case fixtures.
- **D-69-3** — Assertions live in the EXISTING suites (`test/export-mspdi.test.mjs`, `test/export-model.test.mjs` etc.), extended with 3-level cases. No new test file.
- **D-69-4** — MSPDI assertions target the SERIALIZED XML (string/positional), not the in-memory model. Summary re-derived from the serialized XML, OutlineLevel = depth+1 at every level, no upward level skip, DFS order.
- **D-69-5** — UAT import files are produced by extending `test/make-export-samples.mjs` (standalone, no server, no deps) — NOT via e2e UI export. Keep the existing locale pair (en/fr) if cheap, 3-level tree mandatory.
- **D-69-6** — UAT target: MS Project DESKTOP (XML Import Wizard "as new project") — the reference for item A1. xlsx via Excel paste and CSV via wizard are recorded as expected-flat observations, not verdicts.
- **D-69-7** — Evidence kept: Gantt screenshot of the 3-level tree in MS Project + any wizard/repair dialog described verbatim, stored in the phase directory (`.planning/phases/69-*/`).
- **D-69-8** — A repair dialog with the 3-level hierarchy rendered CORRECTLY in the Gantt = PASS (with note). Flat/lost hierarchy or shifted levels = FAIL. The hierarchy surviving is the criterion, not zero dialogs.
- **D-69-9** — If FAIL: the fix re-aligns the MSPDI writer on the CANONICAL Microsoft Task element sequence (OutlineLevel after OutlineNumber, before Priority) — full canonical alignment, not a spot patch — then re-verifies through pre-screen + owner UAT before closure.

### the agent's Discretion
(implicit from CONTEXT): exact fixture task shapes, exact assertion wording/placement inside the existing suites, generator output filenames.

### Deferred Ideas (OUT OF SCOPE)
- CSV/xlsx hierarchy enrichment (indent depth channel for xlsx) — product decision deferred unless UAT forces a fix
- Incoming MSPDI import feature — separate milestone
- Round-trip automation with a dependency (MPXJ) — rejected for now per NFR-01
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-EXP-01 | Automated structural pre-screen with a 3-level export fixture | Existing zero-dep suites extended (D-69-3/4); OutlineLevel/Summary/DFS/position assertions detailed below; fixture chain extension points identified (fixtures `makeMspdiDoc`, generator `make-export-samples.mjs`) |
| REQ-EXP-02 | Owner UAT: real MS Project import per format | VERIFICATION.md Part 2 procedure (XML Import Wizard "as new project" primary; xlsx paste / CSV wizard expected-flat); sample files via extended generator (D-69-5) |
| REQ-EXP-03 | Verdict recording + backlog closure (fix-in-phase if FAIL) | D-69-8/9 verdict criterion; canonical Task element sequence documented in MSPDI-SPEC.md for the conditional fix |
| NFR-01 | Zero new dependencies | All assertions use node:test string/positional patterns + `test/helpers/unzip.mjs` (node:zlib) — nothing to install |
| NFR-02 | Standing gates hold (chunk ≤500000, i18n, grow-only suites, e2e 132/132) | Phase touches only fixtures/tests/generator; entry chunk untouched; verification commands listed |
| NFR-03 | 2-level export behavior unchanged | Grow-only suite keeps all existing assertions (2-level contract pinned in 65-05) — extend, never modify |
</phase_requirements>

## Summary

This is a verification phase, not a feature phase. Phase 65 already shipped the 3-level-capable writers (MSPDI emits `OutlineLevel = depth+1` and positional `Summary`; xlsx indents child titles; CSV carries dotted keys) and pinned the 2-level contract in tests. The remaining work is: (1) extend the existing fixture chain with one rich 3-level tree, (2) add 3-level structural assertions to the existing suites against the **serialized** MSPDI XML, (3) generate UAT sample files with the standalone generator, (4) run the owner's manual MS Project procedure from `.planning/research/VERIFICATION.md`, (5) record a per-format verdict. A fix is in scope ONLY if the UAT fails, and per D-69-9 that fix is a full canonical Task-element-sequence realignment, not a spot patch.

Key technical facts: the MSPDI document is a **positional** schema (`xs:sequence` in mspdi_pj12.xsd) — gr8r emits `OutlineLevel` between `Type` and `Start`, which deviates from the canonical example (after `OutlineNumber`, before `Priority`) but was human-verified OK at level 1 in Phase 54-05. Nested (level 2+) import has never been verified — that is exactly Test 11. OutlineLevel is 1-based and is the only element required to reconstruct the tree; `Summary=1` rows with `<Manual>1</Manual>` keep their own dates (gr8r's parent-due rule). gr8r's DFS emission makes upward level skips structurally impossible, but the suite should pin it anyway.

**Primary recommendation:** Fixture + assertions first (fully automatable, zero deps), generator output second, then a single owner UAT attempt per format with the VERIFICATION.md capture checklist; record the verdict in the phase verification doc and check off item A1.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 3-level export fixture | Test fixtures (repo `test/`) | — | Pure data factories; no app code touched |
| MSPDI structural assertions | Test suite (`test/export-mspdi.test.mjs`) | — | Serialized-XML string/positional asserts, node:test only |
| xlsx/CSV structural assertions | Test suites (`export-xlsx` / `export-csv`) | `test/helpers/unzip.mjs` | node:zlib unzip for sheet XML; string asserts for CSV |
| UAT sample generation | Node script (`test/make-export-samples.mjs`) | — | Standalone, no server, no deps (D-69-5) |
| MS Project import verdict | Owner's machine (MS Project Desktop) | — | Cannot be automated without MPXJ (rejected by NFR-01) |
| Verdict recording | Planning docs (`69-*/69-VERIFICATION.md`) | STATE/backlog | Human-recorded artifact |

## Standard Stack

### Core
No new libraries — this is mandated (NFR-01). Everything below already exists in-repo [VERIFIED: package.json + file reads this session]:

| Tool | Version (in-repo) | Purpose | Why Standard |
|------|-------------------|---------|--------------|
| node:test runner | Node v24.21.0 (`node --test --test-concurrency=2 test/*.test.mjs`) | Run extended suites | Existing harness [VERIFIED: package.json scripts.test] |
| `test/helpers/unzip.mjs` | existing (node:zlib) | Inspect xlsx sheet XML without the broken library reader | Pinned pattern since Phase 54 [VERIFIED: test/helpers/] |
| `test/make-export-samples.mjs` | existing | Generates en/fr xlsx+xml UAT samples into `test-results/export-samples/` | D-69-5 explicitly extends it [VERIFIED: file read, lines 13-56] |
| `test/fixtures/export-fixtures.mjs` | existing | Fixture factories incl. `makeMspdiDoc()` (the extension point) | D-69-1 explicitly extends it [VERIFIED: file read, makeMspdiDoc at lines 692-758] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@office-kit/xlsx` | 0.26.1 | Workbook writer (already a runtime dep) | Indirectly — generator calls `buildWorkbook` [VERIFIED: make-export-samples.mjs:16,43] |
| MS Project Desktop | owner's install | The UAT verdict authority | REQ-EXP-02 only |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| String/positional XML asserts | Real XML parser | Any parser = new dep (NFR-01 violation); output is fully writer-generated so a balance/positional check is honest [VERIFIED: VERIFICATION.md item 4] |
| e2e UI export for UAT files | `make-export-samples.mjs` | Generator is deterministic, no server; D-69-5 locks it |
| MPXJ round-trip automation | Owner manual import | MPXJ rejected by NFR-01 and CONTEXT deferred list |

**Installation:** none — zero new packages by design.

**Version verification:** N/A — no packages installed this phase.

## Package Legitimacy Audit

No packages are installed in this phase (NFR-01, D-69-x all extend existing zero-dep tooling). Audit table: empty.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
 test/fixtures/export-fixtures.mjs        (extend: 3-level branch in makeMspdiDoc / makeDoc tree)
        │  fresh doc objects
        ▼
 src/export/model.js (buildExportModel)   ── unchanged: DFS rows with depth/key/parent
        │
        ├─► export/mspdi.js (buildMspdi)  ── unchanged unless UAT FAILS (D-69-9)
        ├─► export/xlsx.js (buildWorkbook)── unchanged (xlsx enrichment deferred)
        └─► src/export/csv.js (toCsv)     ── unchanged (flat by design)
        │
        ├─[test suites: export-mspdi / export-model / export-xlsx / export-csv]
        │      extended 3-level assertions on SERIALIZED output  ← REQ-EXP-01
        │
 test/make-export-samples.mjs             (extend: also writes the 3-level UAT files)
        ▼
 test-results/export-samples/*.xml|xlsx   ── owner imports each into MS Project / Excel
        ▼
 Owner UAT (VERIFICATION.md Part 2)  →  verdict PASS/FAIL per format  →  69-VERIFICATION.md
        └─(FAIL only)→ canonical-sequence fix in export/mspdi.js → re-run suites + re-UAT
```

### Recommended Project Structure
No new files. Touches only:
```
test/fixtures/export-fixtures.mjs      # 3-level branch added to fixture factories
test/export-mspdi.test.mjs             # 3-level serialized-XML assertions
test/export-model.test.mjs             # (if needed) 3-level model assertions
test/export-xlsx.test.mjs              # 3-level DFS/indent/dotted-key assertions
test/export-csv.test.mjs               # 3-level DFS/dotted-key assertions
test/make-export-samples.mjs           # writes 3-level UAT samples
.planning/phases/69-*/                 # verdict doc + UAT evidence (screenshot, dialogs)
```

### Pattern 1: Serialized-XML positional assertion (the accepted Phase 54 pattern)
**What:** Assert the MSPDI output as a string — the exact bytes Project reads — rather than the in-memory model.
**When to use:** Every MSPDI 3-level assertion (D-69-4).
**Example** (shape used by the existing suite; writer output is positional template strings, `export/mspdi.js:302-304` [VERIFIED: export/mspdi.js:300-303]):
```js
const xml = buildMspdi(buildExportModel(doc, 'p_msp', opts, deps));
// verbatim values the writer emits for a depth-1 nested row (depth 0 → level 1):
assert.match(xml, /<OutlineLevel>1<\/OutlineLevel>/);   // subtask row
assert.match(xml, /<OutlineLevel>2<\/OutlineLevel>/);   // sub-subtask row (NEW for 3-level)
// OutlineLevel is emitted between Type and Start [VERIFIED: mspdi.js:300-303]
assert.ok(xml.includes('<Type>1</Type><OutlineLevel>'));
// Summary adjacency: summaryAt = next row's depth === this depth + 1 [VERIFIED: mspdi.js:214-219]
assert.match(xml, /<Summary>1<\/Summary>/);
```

### Pattern 2: Summary re-derivation from the serialized XML
**What:** Walk `<Task>` blocks in document order, extract each row's OutlineLevel, and assert: a row with a following row exactly one level deeper carries `<Summary>1</Summary>`; others `<Summary>0</Summary>`. Implementable with a regex split over the Tasks block (writer emits one flat `<Task>…</Task>` per row, `mspdi.js:302`) — no parser needed.
**When to use:** The core REQ-EXP-01 check; extends the 2-level version already in the suite to depth 2.

### Pattern 3: Upward-skip monotonicity walk
**What:** For consecutive Task rows in serialized order, OutlineLevel may increase by at most +1 and may drop arbitrarily. gr8r's DFS emission makes skips impossible (`model.js` DFS walk, `mspdi.js:300` derives level from `row.depth`), but pin it as a regression fence [CITED: .planning/research/VERIFICATION.md item 1].

### Pattern 4: xlsx inspection via unzip helper
**What:** `test/helpers/unzip.mjs` (node:zlib) opens the generated workbook; assert the Tasks sheet shared strings contain dotted keys (`T.1.1`) in DFS order. Today's indent is fixed at 1 level for every child row (`indentCell(..., 1)` when `r.parent`, xlsx.js:336) — pin CURRENT shape (fixed-1 indent), do not enrich (deferred per CONTEXT) [VERIFIED: EXPORT-SURVEY.md xlsx section, citing xlsx.js:309-341].

### Pattern 5: CSV flat-shape pinning
**What:** Plain string asserts — rows in DFS order, dotted `key` column intact, no outline column [VERIFIED: VERIFICATION.md item 7; CSV writer at src/export/csv.js].

### Anti-Patterns to Avoid
- **Asserting the in-memory model instead of the serialized XML (MSPDI):** D-69-4 forbids it — Project reads the bytes, and positional element order is a failure mode.
- **Creating a new fixture file or new test file:** D-69-1/D-69-3 explicitly extend existing ones. A separate file would also break the "grow-only" gate accounting narrative.
- **Pre-applying fixes for the gaps (OutlineNumber/WBS omission, element order):** EXPORT-SURVEY lists them as *facts to verify in Test 11, not fixes to pre-apply* — the writers are unchanged unless the UAT FAILS.
- **Treating a repair dialog as automatic FAIL:** D-69-8 — the criterion is the hierarchy surviving in the Gantt, not zero dialogs.
- **Mutating existing 2-level assertions:** NFR-03 — extend only.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unzipping xlsx for inspection | a zip reader | `test/helpers/unzip.mjs` | Already proven on node:zlib; the @office-kit/xlsx reader is broken for round-trip checks [VERIFIED: VERIFICATION.md] |
| XML parsing for asserts | XML parser install | string/positional slicing + balanced-tag counter | Zero-dep constraint; output is fully writer-generated |
| UAT sample generation | e2e browser export | `test/make-export-samples.mjs` | Deterministic dates, no server, en/fr pair already wired |
| UAT procedure steps | invented checklist | `.planning/research/VERIFICATION.md` Part 2 | Owner procedure + capture checklist already researched |
| MSPDI spec facts | re-derivation | `.planning/research/MSPDI-SPEC.md` | Cited Microsoft docs: OutlineLevel 1-based/optional, Summary semantics, positional xs:sequence, date format, FieldIDs |

**Key insight:** The writers and model already carry all the semantics; this phase only needs *proof artifacts*, so every task should reuse existing tooling verbatim.

## Common Pitfalls

### Pitfall 1: Element order inside `<Task>` (positional schema)
**What goes wrong:** mspdi_pj12.xsd is an `xs:sequence`; gr8r emits `OutlineLevel` between `Type` and `Start` while the canonical example places it after `OutlineNumber`/before `Priority`. Project has historically tolerated this at level 1 (Phase 54-05 human check), but nested levels were never verified.
**Why it happens:** All elements are optional and the reader has been tolerant — until some element triggers the repair prompt.
**How to avoid:** Do not fix preemptively (D-69-9 makes the canonical realignment the *contingent* fix). The pre-screen asserts order as-is.
**Warning signs:** XML Import Wizard repair dialog naming an element; OutlineLevel dropped on import.
**Provenance:** [CITED: .planning/research/MSPDI-SPEC.md — outlinelevel-element.md / task-element.md, MicrosoftDocs/office-developer-msproject-xml-docs]

### Pitfall 2: Summary with no children / skipped level on import
**What goes wrong:** Project normalizes rather than errors: Summary=1 with no children demotes to a normal task; OutlineLevel 1→3 clamps to 2.
**How to avoid:** gr8r's DFS emission makes both structurally impossible; assert the invariant anyway (Pattern 2/3).
**Provenance:** [CITED: MSPDI-SPEC.md — community consensus, MEDIUM confidence]

### Pitfall 3: Subtask due inheritance is from the TOP-LEVEL task, not the immediate parent
**What goes wrong:** A 3-level tree means S1a inherits T's due, not S1's. A test author assuming per-parent inheritance will write wrong expected dates.
**Why it happens:** model.js:227 uses the top-level task `t` (the comment there says "parent's" — imprecise, fact not defect). Parent SUBTASK rows never carry their own due in the data model, so output is consistent.
**How to avoid:** Derive expected Start/Finish per row from the model contract: `due = t.due` always; `start = s.start || t.start || ''` [VERIFIED: EXPORT-SURVEY.md row contract, citing model.js:226-227].
**Warning signs:** assertions failing on sub-subtask Finish dates.

### Pitfall 4: ExtendedAttribute FieldIDs are not sequential
**What goes wrong:** Text1..Text5 FieldIDs are `188743731/188743734/188743737/188743740/188743743` — guessing sequential IDs corrupts the custom-field columns.
**How to avoid:** Already pinned in `mspdi.js:114-120`; don't touch.
**Provenance:** [VERIFIED: export/mspdi.js:114-120, quoted verbatim above]

### Pitfall 5: Excel cell-style indent is NOT a Project import channel
**What goes wrong:** xlsx hierarchy signal is cell-style indent fixed at 1 level; MS Project paste reads leading tab characters in text, not style indents — so xlsx/CSV imports land flat.
**How to avoid:** Record xlsx/CSV as expected-flat observations (D-69-6); hierarchy evidence = dotted key + Excel visual validation.
**Provenance:** [CITED: VERIFICATION.md / EXPORT-SURVEY.md — community-documented behavior, MEDIUM-MEDIUM-HIGH]

### Pitfall 6: Dated manual rows must not collapse to lines
**What goes wrong:** Zero duration collapses Finish onto Start → Gantt "lines, not blocks" (owner bug fixed in Phase 54/55 via minimum 480-min duration for dated rows).
**How to avoid:** Fixture should include dated + undated + partial-completion rows; UAT checklist verifies bars ≥1 day [VERIFIED: mspdi.js:153-180 taskSchedule minimum-duration logic].

### Pitfall 7: Fixture chain must stay server-independent
**What goes wrong:** Importing app/server code into the fixture or generator breaks the standalone promise (and the prohibition test enforces src/ boundaries for `export/mspdi.js` living at repo root).
**How to avoid:** Generator imports only fixture factories + pure writers + i18n `tFor` [VERIFIED: make-export-samples.mjs:13-20].

## Runtime State Inventory

SKIPPED — not a rename/refactor/migration phase. (Writers are modified only in the conditional FAIL branch, and that fix is a code edit, not a data migration.)

## Code Examples

### Extending the fixture with a 3-level tree (D-69-1/2)
The subtask data model is nested plain objects inside `task.subtasks` (each `{ title, done, ... }`); sub-subtasks are `subtasks` inside a subtask. Existing 2-level shape [VERIFIED: test/fixtures/export-fixtures.mjs:736-743]:
```js
subtasks: [
  { title: 'Child one', done: true },
  { title: 'Child two', done: false },
],
```
The 3-level extension inside `makeMspdiDoc()` should add one task like (shape to confirm against src/export/model.js subtask walker before coding):
```js
T('t_x13', 'MSP-13', 'Deep tree task', 13, {
  start: '2026-03-04', due: '2026-03-20',
  desc: 'Owner note for the 3-level UAT',      // Notes channel (descriptions:true)
  subtasks: [
    { title: 'Sub A', done: false, subtasks: [
      { title: 'Sub A.1 (deepest)', done: true },
      { title: 'Sub A.2', done: false },
    ]},
    { title: 'Sub B', done: false },
  ],
}),
```
Per D-69-2 the UAT fixture also needs: a second root, a milestone (already in makeMspdiDoc project), a dependency between two top-level tasks (already: t_x2 deps t_x1), partial completion, varied dates. **Also extend `makeDoc()`** (D-69-1 says "the Phase 54 fixture tree" — the generator currently uses `makeDoc()`/project `p_alpha` [VERIFIED: make-export-samples.mjs:20,38], while `makeMspdiDoc()` feeds the test suite; check whether the 3-level branch goes in one or both so both the suite and the generated samples carry it).

### Generator extension (D-69-5)
`make-export-samples.mjs` writes `project-{locale}.{xlsx,xml}` into `test-results/export-samples/` from `makeDoc()`. Extension: keep the same loop, ensure the model's project contains the 3-level tree, optionally add CSV output if the UAT needs a `.csv` sample (currently the generator writes NO csv — decide: either add `toCsv` output there or hand the owner the CSV path from the running app; the D-69-6 procedure needs a CSV file). Zero deps either way [VERIFIED: make-export-samples.mjs full read].

### Serialized-XML Summary re-derivation sketch (Pattern 2)
```js
const tasksBlock = xml.slice(xml.indexOf('<Tasks>'), xml.indexOf('</Tasks>'));
const rows = [...tasksBlock.matchAll(/<Task>(.*?)<\/Task>/g)].map(m => m[1]);
const levels = rows.map(r => { const m = /<OutlineLevel>(\d+)<\/OutlineLevel>/.exec(r); return m ? Number(m[1]) : 1; });
// top-level rows emit NO OutlineLevel → Project default 1 [VERIFIED: mspdi.js:295-300]
for (let i = 0; i < rows.length; i++) {
  const isSummary = i + 1 < rows.length && levels[i + 1] === levels[i] + 1;
  assert.ok(rows[i].includes(`<Summary>${isSummary ? 1 : 0}</Summary>`), `row ${i}`);
  if (i > 0) assert.ok(levels[i] <= levels[i - 1] + 1, 'no upward skip');
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 1-level MSPDI verified by human check (Phase 54) | 3-level writers shipped in Phase 65, awaiting round-trip proof | v2.4/v2.6 | Test 11 closes item A1 |
| Parent-id summary set | Positional adjacency summary (`summaryAt`, 65-05) | Phase 65 | Already correct at any depth |
| 2-level fixture chain | +3-level branch in same factories | this phase | Grow-only |

**Deprecated/outdated:** MPXJ round-trip automation — rejected (NFR-01); incoming import — separate milestone.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | MS Project's XML Import Wizard "As a new project" path and repair-dialog behavior as described in VERIFICATION.md Part 2 is accurate for the owner's Project version | Owner UAT procedure | UAT steps need adjustment; low cost (owner-facing) [CITED: community/standard product knowledge, MEDIUM] |
| A2 | Subtask objects in the data model accept nested `subtasks` for the 3rd level via the same shape used by makeDoc/makeMspdiDoc | Fixture extension | Fixture shape wrong → suite fails at build time (immediately visible, cheap fix); planner should add a verify step reading `src/export/model.js` subtask walker first |
| A3 | Generator can be extended to also emit a CSV sample without breaking its standalone contract | Code Examples | If wrong, owner takes the CSV from the running app instead (fallback documented) |
| A4 | `test-results/export-samples/` is gitignored and suitable to hand files to the owner | Generator section | Minor — files could be written elsewhere in test-results |

## Open Questions (RESOLVED — see plans 69-01/02/03)

1. **Which fixture factory feeds the UAT samples — makeDoc (p_alpha) or makeMspdiDoc (p_msp)?**
   - **RESOLVED:** 3-level tree lives in `makeDoc()`'s p_alpha (69-02 T1); the MSPDI suite tests the same model path via 69-01 T1's fixture entries — no duplicated tree. NOTE: fixture entries are FLAT `{ id, parentId, position, title, done }` grouped by `parentId` in the walker (model.js:201-247), not nested `subtasks` arrays as sketched below.
   - What we know: The generator imports and uses `makeDoc()` with project `p_alpha` [VERIFIED: make-export-samples.mjs:20,38]; `makeMspdiDoc()` feeds only the test suite.
   - Recommendation: Put the 3-level branch in `makeDoc()`'s p_alpha tree (so samples carry it) AND let the MSPDI suite test either the same factory or `makeMspdiDoc` — planner should pick one consistent home per D-69-1 ("the Phase 54 fixture tree") and avoid duplicating the tree.
2. **CSV sample file for the UAT** — **RESOLVED:** generator emits `toCsv` output alongside xlsx+xml (69-02 must_haves names it; zero-dep).
3. **Exact canonical Task sequence for the contingent fix (D-69-9)** — **RESOLVED (as disposition):** structured as the conditional FAIL branch in 69-03 Task 3 — skip on PASS; if the fix triggers, re-verify against the MicrosoftDocs repo before editing `mspdi.js`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | all test runs + generator | ✓ | v24.21.0 | — |
| node:test runner | suites | ✓ | built-in | — |
| MS Project Desktop | REQ-EXP-02 owner UAT | ✗ (not on dev machine — owner machine only) | — | None; inherently manual (D-69-6) |
| Excel (owner machine) | xlsx paste path | owner machine | — | Visual validation in Excel per VERIFICATION.md |
| Playwright | e2e gate (standing) | ✓ | ^1.64.1 | — |

**Missing dependencies with no fallback:** MS Project Desktop on the dev machine — by design; the UAT is the owner's manual step.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (Node v24.21.0), `--test-concurrency=2` |
| Config file | none — glob `test/*.test.mjs` via package.json `test` script |
| Quick run command | `node --test test/export-mspdi.test.mjs test/export-model.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-EXP-01 (MSPDI) | 3-level: OutlineLevel=depth+1 at all levels, Summary re-derived from serialized XML, no upward skip, DFS order | unit (serialized-XML string asserts) | `node --test test/export-mspdi.test.mjs` | ✅ (extend) |
| REQ-EXP-01 (model) | 3-level DFS rows, keys `T.1.1`, parent ids, depth | unit | `node --test test/export-model.test.mjs` | ✅ (extend) |
| REQ-EXP-01 (xlsx) | 3-level rows in DFS order, dotted keys, pinned current indent shape | unit + unzip helper | `node --test test/export-xlsx.test.mjs` | ✅ (extend) |
| REQ-EXP-01 (CSV) | DFS order, dotted key, no outline column | unit | `node --test test/export-csv.test.mjs` | ✅ (extend) |
| REQ-EXP-02 | Owner MS Project import per format | manual-only (justification: real MS Project Desktop verdict authority; automation would require MPXJ — rejected by NFR-01) | — | n/a |
| REQ-EXP-03 | Verdict recorded in phase doc + A1 closed | manual (doc artifact) | — | n/a |
| NFR-03 | 2-level behavior unchanged | regression | `npm test` (all existing assertions untouched) | ✅ |

### Sampling Rate
- **Per task commit:** `node --test test/export-{mspdi,model,xlsx,csv}.test.mjs`
- **Per wave merge:** `npm test` + `npm run lint` (15-error baseline) + `npm run build` (chunk ≤500000 gate)
- **Phase gate:** full suite green + owner UAT verdict recorded before `/gsd-verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements; the phase itself *is* the extension. (Generator run `node test/make-export-samples.mjs` is a task action, not a gap.)

## Security Domain

Phase is verification-only with no new attack surface: no new inputs parsed (assertions read writer output), no new routes, no UI changes, no new deps. Writers' existing escaping (`escapeXml`, CSV formula-injection guard `'` prefix) is already pinned by the suites and must remain untouched (NFR-03). The fixture keeps the existing injection/escaping probe tasks (`=1+1`, `A & <B>`, script-tag desc) so escaping is re-exercised on the 3-level output — no new ASVS category applies beyond V5 input validation, which is covered by these existing escapes.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (keep pinned) | escapeXml (mspdi.js:44-51), CSV `'` guard — existing suites |
| V2/V3/V4/V6 | no | n/a — no auth/session/access/crypto surface in this phase |

## Sources

### Primary (HIGH confidence)
- gr8r code read this session: `export/mspdi.js` (full), `test/fixtures/export-fixtures.mjs` (full), `test/make-export-samples.mjs` (full), `package.json`, `test/helpers/` listing
- `.planning/research/MSPDI-SPEC.md` — MicrosoftDocs/office-developer-msproject-xml-docs citations (OutlineLevel, Summary, xs:sequence, dates, FieldIDs)
- `.planning/research/EXPORT-SURVEY.md` — line-referenced code survey of all three writers for a 3-level tree
- `.planning/research/VERIFICATION.md` — zero-dep automation assertions + owner UAT procedure

### Secondary (MEDIUM confidence)
- MS Project UI behavior (XML Import Wizard modes, repair dialogs, CSV mapping, paste-indentation) — community/standard product knowledge, captured in VERIFICATION.md; carried into Assumptions A1
- onplana.com MSPDI explainer (via MSPDI-SPEC.md)

### Tertiary (LOW confidence)
- None outstanding — MEDIUM items are isolated to the owner-manual procedure and flagged as assumptions.

## Project Constraints (from AGENTS.md)
- Global instructions apply: verify before asserting APIs/paths/values (done above with file reads); no opportunistic fixes outside scope (the writers are untouched unless UAT FAILS); GSD cycle respected — plan exists before coding.
- Standing gates: zero new deps, entry chunk ≤500000 bytes (499940 current), EN+FR i18n, 1705+ unit tests grow-only, e2e 132/132, lint 15-error baseline [VERIFIED: CONTEXT.md code_context].

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new stack; all tooling read in-repo this session
- Architecture: HIGH — extension-only changes over documented Phase 54/65 patterns
- Pitfalls: HIGH for code facts (file-verified); MEDIUM for MS Project UI behavior (community knowledge, assumption A1)

**Research date:** 2026-11-17
**Valid until:** 2026-12-17 (stable: verification-only phase over shipped v2.4 code)
