---
phase: 13-investigation-invariant-pinning
reviewed: 2026-10-26T11:19:18Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - .planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md
  - .planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md
  - .planning/WINDOWS.md
  - .planning/ROADMAP.md
  - .planning/STATE.md
findings:
  critical: 0
  warning: 1
  info: 2
  total: 3
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-10-26T11:19:18Z
**Depth:** deep (doc-only phase — every citation re-verified against live source; classification tiers: major ≡ warning, minor ≡ info)
**Files Reviewed:** 5 (13-DECISIONS.md, 13-01-SUMMARY.md, WINDOWS.md, ROADMAP.md/STATE.md consistency pass; source files read read-only as evidence)
**Status:** issues_found

## Summary

Phase 13 is doc-only: the deliverable is `13-DECISIONS.md` (canonical D-01…D-17 citation
target for Phases 14–18) plus summary/state updates. Scope commits reviewed: 4af8b06,
65d92a6, 398ef57, 8c476d5 (+ planning prep bb8ca75, 4482016, 61380e9, 491ac06). No source
code was touched — correct for this phase type.

The core contract-integrity checks **pass**:

- **Decision IDs:** 17 unique `**D-NN:` definitions, zero duplicates, no gaps
  (`grep -oE '\*\*D-[0-9]{2}:' | sort | uniq -c` → 17×1). All cross-references
  (D-06→D-09, D-07→D-05/D-07/D-08, prohibitions → their owning IDs) resolve correctly.
- **[VERIFIED: file:line] citations:** all 16 tagged lines re-verified against live source,
  exact-line accurate — server.js:95-100/774-775/1125-1141/1163-1173/1225-1315/1235/1241/1288,
  seed.js:509-514, actions.js:2351-2375/2408-2411, settings.js:408/410-417, DEPLOY.md:141-158,
  test/migration.test.mjs:188-196, `src/lib/` absence, scrypt usage. Pitfall cross-references
  (15, 18, 19, 21) match PITFALLS.md content. The D-15 vendor pin (`qrcode-generator@2.0.4`,
  MIT) was sanity-checked against the npm registry: version exists, is `latest`, license MIT.
- **Reversibility clauses:** exactly 3, on the one-way decisions D-01 (line 131), D-05
  (line 162), D-08 (line 191), each naming downstream consumers.
- **Hygiene:** zero TODO/TBD/FIXME/placeholder markers; substance matches 13-CONTEXT.md
  D-01…D-17 (additions are enrichments with verified citations, no weakening).
- **State updates:** WINDOWS.md item 3 (pre-existing `i18n-prefs` test failure) independently
  reproduced — `## Phase 6` count in ROADMAP is 0, the assertion fails at test/i18n-prefs.test.mjs:246,
  and the failure predates the phase (v1.3 roadmap commit 8542c98; 61380e9's ROADMAP diff only
  adds the plan checkbox). Summary metadata (306 lines / 18 334 chars, commits 4af8b06+65d92a6)
  matches the artifact exactly.

One substantive defect was found: a phase-attribution contradiction inside the canonical
citation document (WR-01 below), plus two minor accuracy items.

## Warnings

### WR-01: D-04's Consumed-by line contradicts the Downstream consumer map on which phase's migration adds the replay-guard column (major)

**File:** `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md:154-155` (vs `:301`)
**Issue:** D-04 pins the TOTP replay-guard column to "**Consumed by:** Phase 16 (migration
adds the column with the other 2FA columns; the replay guard serves both verify paths)".
The Downstream consumer map's Area-1 row states the opposite landing: "Phase 14 (AUTH-02
migration: `login_challenges` DDL, **replay-guard column**)". The document contradicts
itself on WHERE the schema migration for this column lands — Phase 14 or Phase 16. For a
document whose sole purpose is to be the unambiguous D-NN citation target, this is exactly
the ambiguity the phase exists to eliminate. The surrounding evidence favors **Phase 14**
for the column (ROADMAP Phase 14: "sessions and 2FA fields live in per-user rows",
requirements SESS-01..03 + AUTH-02; D-01 already assigns the additive migration's
`login_challenges` DDL to Phase 14; the removal-scope section pins the boot migration —
with `tfa_enabled = 0` by absence — to Phase 14, and D-04 itself requires "the same
migration as the other 2FA columns"; Pitfall 21 assigns all new columns to that guarded
migration), leaving D-04's "Phase 16" Consumed-by the outlier. Cost of leaving it: the
Phase 14 and Phase 16 planners will read different landing phases for the same column;
the byte-identical second-boot test's coverage scope (which migration test must prove the
column) becomes ambiguous.

**Fix:** Align the two statements. Recommended edit to `13-DECISIONS.md:154-155` (choose
one resolution consistently in both places):

```markdown
  **Consumed by:** Phase 14 (AUTH-02 additive migration adds the column with the other
  2FA columns) and Phase 16 (the replay guard serves both verify paths — login verify and
  settings verify — using the column the Phase 14 migration created).
```

Mirror the same split in the consumer map row (`:301`) so column-vs-behavior ownership is
explicit: Phase 14 owns migration + byte-identical test coverage for the column; Phase 16
owns the guard behavior.

## Info

### IN-01: SUMMARY records a stale [VERIFIED] citation count — 11, actual 16 lines / 17 occurrences (minor)

**File:** `.planning/phases/13-investigation-invariant-pinning/13-01-SUMMARY.md:65` and `:177`
**Issue:** The coverage-gate record ("`grep -c '\[VERIFIED: '` → 11 (≥ 10)") matches the
doc state after task 1 (verified: `git show 4af8b06` → 11), not the completed artifact
after 65d92a6, where the count is 16 matching lines / 17 occurrences. The check still
passes (≥ 10) and the direction is under-claiming, so no gate was falsely passed — but a
recorded verification value that does not reproduce against the final artifact undermines
the audit trail's reproducibility (this reviewer initially chased it as a possible
inconsistency).

**Fix:** Update the two recorded values (frontmatter coverage D1 ref and Verification Run
table) to the final count (16 / 17), or annotate counts as measured-at-commit so the
provenance is explicit.

### IN-02: D-13's scope is stated two ways — "new endpoints" in the body vs "every throttle response" in its Consumed-by (minor)

**File:** `.planning/phases/13-investigation-invariant-pinning/13-DECISIONS.md:229-235`
**Issue:** D-13's body restricts the override to "Phase 16/17 must NOT copy that string to
**new endpoints**" (leaving the existing `server.js:1235` "Try again in 15 minutes." text
untouched by implication), while D-13's Consumed-by line reads "Phases 15–17 (every
throttle response's failure copy)" — which would include replacing the existing string.
The two readings diverge on a security-relevant point: D-03/D-11 pin "one logical login =
one budget", so under the narrow reading the password step keeps disclosing the window
("15 minutes") while the 2FA step on the same budget does not — the exact timing
disclosure D-13 prohibits survives on step 1 of the flow Phase 17 modifies anyway.

**Fix:** One sentence in D-13 resolving the scope, e.g.: "When Phase 17 touches the login
flow, the existing `server.js:1235` 429 copy is also replaced with the pinned generic
copy — the password and 2FA steps share one budget and must disclose identically (or not
at all)."

---

_Reviewed: 2026-10-26T11:19:18Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
