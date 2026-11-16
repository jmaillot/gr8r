---
phase: 66
review: 66-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Editor delete pops the confirm modal but leaves a stale editor modal behind"
  - id: WR-02
    severity: warning
    disposition: open
    title: "`A.tplSave` closes the editor before the push settles — a transient failure destroys the edited draft"
  - id: WR-03
    severity: warning
    disposition: open
    title: "New lazy-modal openers in `actions.js` have no `.catch` — chunk-load failure is a dead button and an unhandled rejection"
  - id: WR-04
    severity: warning
    disposition: open
    title: "Priority select displays `medium` for a stored unset priority — UI state diverges from what is saved"
  - id: WR-05
    resolved_commit: 54827ed
    resolution: "normalizeTemplatesData now skips the wholesale validateSubtree walk for unchanged sanitized bodies (subSig65 semantics); the heal still runs, so a resend of a stored cyclic tree is healed in place instead of permanently 400ing doc PUTs"
    severity: warning
    disposition: fixed
    title: "Templates write gate lacks the Phase 65 \"unchanged tree\" skip — one poisoned stored template permanently 400s every doc PUT"
  - id: WR-06
    severity: warning
    disposition: open
    title: "`KEY.tplAddSub` accepts an empty title and pushes a blank subtask row"
  - id: IN-01
    severity: info
    disposition: open
    title: "Duplicate dead `IN;` statements"
  - id: IN-02
    severity: info
    disposition: open
    title: "Two parallel caching mechanisms for the same lazy chunk"
  - id: IN-03
    severity: info
    disposition: open
    title: "MCP templates uid factory uses the subtask prefix for template-record ids"
  - id: IN-04
    severity: info
    disposition: open
    title: "`saveAsTemplate` captures the localized \"no description\" placeholder as real description text"
  - id: IN-05
    severity: info
    disposition: open
    title: "Brittle source-string assertions pin the action module"
  - id: IN-06
    severity: info
    disposition: open
    title: "e2e offsets recomputed with a private copy of `offsetIso`"
open: 11
total: 12
recorded: 2026-11-15T18:27:35.445Z
---

# Phase 66: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| WR-05 | warning | fixed | 54827ed — unchanged-body skip in normalizeTemplatesData + heal preserved |
| WR-06 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved.
