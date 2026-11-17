# MSPDI (MS Project XML) Spec Essentials for Verification

**Scope:** v2.6 "Exports Verification (Test 11)" — multi-level subtask tree round-trip
**Researched:** 2026-11-17
**Confidence:** HIGH (official Microsoft docs, MicrosoftDocs/office-developer-msproject-xml-docs repo)

## OutlineLevel semantics

- Source: [OutlineLevel Element](https://msdn.microsoft.com/en-us/library/Bb968465(v=office.12)) (`project-xml-data-interchange/outlinelevel-element.md` in the MicrosoftDocs repo).
- "The number that indicates the level of a task in the project outline hierarchy." Integer, min occurrence 0, max 1 — **OutlineLevel is OPTIONAL**; absence means Project assigns its default (top level = 1).
- The documented Task example shows `<OutlineLevel>2</OutlineLevel>` paired with `<OutlineNumber>1.2</OutlineNumber>` and `<WBS>1.2</WBS>` — i.e. **OutlineLevel is 1-based**: top-level tasks = 1, first indent = 2. (In the *application UI*, outline level 0 is the project-summary row; in the XML, first tasks carry 1.)
- `OutlineNumber` (string "5.2.6") and `WBS` are separate OPTIONAL elements; **only OutlineLevel is required to reconstruct the tree**. A writer may omit OutlineNumber — Project recomputes it.
- Community reference (onplana.com MSPDI explainer) confirms: hierarchy is rebuilt from OutlineLevel, not from row order alone; but row ORDER is still positional — children must follow their parent in document order.

## Summary="1" marking rules

- Source: `summary-element.md` + the Task element doc: `<Summary>` is OPTIONAL, "Indicates whether a task is a summary task."
- Microsoft's own example marks `<Summary>1</Summary>` on a task whose WBS is 1.2 with children.
- On import, Project reconciles the flag with actual structure (community consensus, MEDIUM confidence — not spelled out in the official element doc):
  - a row marked Summary=1 **with children** renders as a bold summary task (dates roll up from children unless manually scheduled);
  - a row marked Summary=1 **with no children** becomes an ordinary task (the summary status is not sustainable);
  - a parent row WITHOUT Summary=1 that has children is usually promoted/corrected by Project, but explicit Summary=1 avoids ambiguity — this is the safe, documented-by-example practice.
- A manually-scheduled summary (`<Manual>1</Manual>` + ManualStart/ManualFinish/ManualDuration) keeps its own dates instead of rolling up — this is what gr8r relies on.

## Element ORDER inside Task (positional schema)

- mspdi_pj12.xsd defines Task children as an `xs:sequence` — document order matters. The official Task example order (relevant slice):

  `UID, ID, Name, Type, …, WBS, WBSLevel, OutlineNumber, OutlineLevel, Priority, Start, Finish, Duration, DurationFormat, …, Milestone, Summary, …, PercentComplete, …, ConstraintType, …, ConstraintDate, …, PredecessorLink*, ExtendedAttribute*, Notes`

- **Verification point for Test 11:** gr8r's writer emits `OutlineLevel` directly after `Type` (before Start), whereas the canonical example places it after OutlineNumber/before Priority. All elements are optional and Project's reader has historically been tolerant of order within Task (a one-level gr8r file was human-verified in Phase 54-05 Task 3), but a **nested** OutlineLevel has never been round-tripped in a real Project — exactly what Test 11 must confirm. If Project repairs or drops OutlineLevel, this ordering is the first suspect.
- Similarly `ManualStart/ManualFinish/ManualDuration/Manual` sit between DurationFormat and Milestone in gr8r's output; canonical position for the Manual* elements is late in the sequence (post-2007 schema). Same tolerance caveat.

## Skipped levels / summary without children on import

- Community/source knowledge (MEDIUM confidence — Project is forgiving, behavior is normalize-not-error):
  - OutlineLevel **skipping a level** (e.g. 1 → 3 with no 2): Project clamps the task to the nearest legal level (promotes to 2), it does not fail the import.
  - Summary with no children: demoted to a normal task (see above).
  - gr8r's DFS emission makes skips structurally impossible (a depth-n row always follows a depth-(n-1) row), so this failure mode cannot occur from the current writer — but the test suite should pin it anyway.

## Dates

- Format: `YYYY-MM-DDThh:mm:ss`, **no timezone suffix / no Z** (xsd:dateTime local form). Milestones at 08:00, finishes conventionally 17:00, starts 08:00 — matches gr8r's writer.
- Durations: `xsd:duration` (`PT8H0M0S`); at MinutesPerDay=480, one day = 8h. DurationFormat 7 = days.
- ConstraintType 4 = Start No Earlier Than (SNET), with `<ConstraintDate>`.

## Extended attributes

- Custom fields: project-level `<ExtendedAttributes>` defines each field once (`FieldID` + `FieldName`); task-level `<ExtendedAttribute>` carries `FieldID` + `Value`.
- Text1..Text5 FieldIDs are NOT sequential: `188743731 / 188743734 / 188743737 / 188743740 / 188743743` (gr8r pins these; Pitfall 9 from Phase 54). An empty Value should be omitted.
- There is no `<Text1>`-style shorthand element; `Notes` is the only free-text carrier.

## Namespace

- `xmlns="http://schemas.microsoft.com/project"` (no /2007 suffix) — confirmed by gr8r's Phase 54 human check. `SaveVersion` 12 is accepted.

## Sources

- MicrosoftDocs/office-developer-msproject-xml-docs (task-element.md, outlinelevel-element.md, summary-element.md) — HIGH
- onplana.com "MSPDI XML Explained" — MEDIUM (community)
- gr8r Phase 54-05 human Project import verification (recorded in export/mspdi.js header) — HIGH (empirical, one level only)
