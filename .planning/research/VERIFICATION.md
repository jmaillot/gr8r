# Verification & UAT Research — Test 11 (MS Project Round-Trip)

**Scope:** v2.6. How to verify partly automated without MS Project (ZERO new dependencies), and what the owner does manually.
**Researched:** 2026-11-17
**Confidence:** HIGH for automation (existing tooling read directly); MEDIUM for MS Project UI steps (community/standard product knowledge).

## Part 1 — Automation without new dependencies (YES, feasible)

Standing constraint: zero new runtime or dev dependencies → no MPXJ, no xml2js, no xlsx reader additions. Automation must be **structural assertions with existing tooling**:

### Already in place (extend, don't add)
- `node:test` suites with **string/regex assertions on the serialized MSPDI** (`test/export-mspdi.test.mjs`) — the accepted pattern since Phase 54 (Pitfall 8: the document is positional, so string assertions are the honest check).
- `test/export-model.test.mjs` pins DFS order/depth/keys for nested trees.
- `test/helpers/unzip.mjs` (node:zlib) — xlsx round-trip verification without the (broken) library reader.
- `test/make-export-samples.mjs` — sample generator for fixtures.

### Automatable structural assertions (zero-dep, MEDIUM effort)
1. **OutlineLevel monotonicity**: for every consecutive row pair in serialized Task order, OutlineLevel may increase by at most 1 and may drop arbitrarily — walk the emitted XML, assert no level skip upward. This is the "skipped level" failure mode pinned structurally.
2. **Summary iff follower is deeper**: re-derive the summary set from the XML itself and compare against the positional rule (already partially asserted at 2 levels; extend to 3).
3. **OutlineLevel = depth + 1** for the full 3-level fixture (65-05 test covers 2 levels; add depth-2 rows).
4. **Well-formedness without a parser**: node's built-in options are limited (no XML parser in stdlib). A cheap zero-dep proxy: balanced-tag counter / the existing positional-slice assertions. (Node 22 experimental `node --experimental-sqlite`-style extras don't include XML; regex/balance check is the pragmatic choice — LOW risk since output is fully writer-generated.)
5. **Re-parse round-trip via gr8r's own code only**: not applicable — gr8r has no MSPDI reader, and adding one is out of scope.
6. **xlsx**: unzip via `test/helpers/unzip.mjs`, assert the Tasks sheet shared strings contain the dotted keys in DFS order and the styles.xml references indent levels on child-title cells. Depth-scaled indentation, if changed, is assertable the same way.
7. **CSV**: trivial string asserts — rows in DFS order, keys dotted, no outline column (pin current shape or the agreed shape).

Verdict: a real MS Project import can NOT be replaced by automation; it can only be **pre-screened**. The suite should reduce the owner's manual iteration to a single import attempt per format.

## Part 2 — Manual owner procedure in MS Project

### MSPDI (.xml) — the primary round-trip
1. Generate the export with **subtasks enabled** on a project containing a genuine 3-level tree (task → subtask → sub-subtask), at least one dated parent, one dated subtask, one undated row, and a dependency between two top-level tasks.
2. In MS Project: **File ▸ Open** ▸ select the `.xml` file. Project shows the **XML Import Wizard** (or "Open as new project" shortcut). Choose **"As a new project"** (default) — not "Merge/Append".
3. Accept the default full-import mapping; Project may show a repair/diagnostic dialog — capture it verbatim (it names the offending element; Project sometimes auto-repairs and writes a repaired copy).
4. Verify in Gantt Chart view:
   - Indentation shows 3 levels; sub-subtasks indented under their subtask.
   - Summary rows bold; their dates = the row's own due (manual summaries don't roll up).
   - Every subtask's Finish = the parent task's due (gr8r rule: subtask end = parent end).
   - No "lines, not blocks": each dated row shows a bar of ≥1 day.
   - Predecessor links drawn between the two top-level tasks.
   - ExtendedAttributes Text1–Text5 visible via Insert Column ▸ Text1..Text5 (Key, Status, Priority, Labels, Estimate).
5. Optional cross-check: **File ▸ Save As ▸ XML**, and diff the re-exported OutlineLevel/Summary structure against gr8r's file (Project's own serializer is the ground truth).

### CSV — flat by design
MS Project's **CSV Import Wizard** (File ▸ Open ▸ .csv) maps named columns to task fields but has **no outline/indent channel**; the import lands flat. Expected owner check: rows import in gr8r's DFS order with the dotted `key` intact; hierarchy must be re-created by manual indenting. If the milestone's acceptance wants more, that is a requirements decision — research records only the flat fact.

### XLSX — indirect path
MS Project cannot open `.xlsx`. Owner path: open in Excel ▸ select the Tasks sheet ▸ copy ▸ paste into an empty Project sheet with the first column = Task Name. Project builds hierarchy from **tab indentation carried in the pasted text** — cell-style indentation does NOT translate (MEDIUM confidence, community-verified behavior). With gr8r's current style-indent, a straight paste yields a FLAT list; the dotted key column remains the only structure evidence. Also acceptable: owner visually validates the 3-level tree in Excel itself (indent + bold parents + dotted keys), which is what Phase 54 originally scoped xlsx for.

### Capture checklist for the UAT record
- Project version + build used.
- Any wizard/repair dialogs verbatim.
- Screenshot of the 3-level Gantt.
- For each format: PASS/FAIL per check (3 levels visible, summaries bold, dates honored, bars not lines, links drawn, Text1–5 populated).

## Sources

- gr8r code: export/mspdi.js, export/xlsx.js, src/export/csv.js, src/export/model.js, test/export-mspdi.test.mjs, test/export-model.test.mjs, test/make-export-samples.mjs — HIGH
- MicrosoftDocs/office-developer-msproject-xml-docs repo — HIGH
- MS Project import wizard behavior (XML import modes, CSV mapping, paste-indentation) — MEDIUM (standard product knowledge, community-documented)
