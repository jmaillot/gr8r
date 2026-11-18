---
status: resolved
trigger: "the subtasks status are not aligned with parent task status column"
created: 2026-11-18
updated: 2026-11-18
---

## Current Focus

hypothesis: Subrow status chip content is visually offset ~7px from the parent's status pill because the parent renders `<button class="pillbtn">` (padding 0 7px) while the subrow renders `<label class="stchip">` (no padding); the Playwright spec measures cell content-boxes, which DO align, so it passes while the visible chip content does not.
test: CSS/HTML diff of parent status cell (task-list.js:27, components.css:595) vs subrow status cell (subtask-popovers.js:85, list.css:190).
expecting: .pillbtn has 7px horizontal padding; .stchip does not → icon/text left edges differ by 7px inside aligned cells.
next_action: confirm prPill parent vs subrow wrapper padding too, then report diagnosis (no fix).

## Symptoms

expected: subrow STATUS chip visually aligned under parent status pill / header
actual: user reports STATUS column misaligned despite pixel spec passing
errors: none
reproduction: List view, expand task with subtasks
started: after 71-01/71-02 fixes

## Evidence

- 2026-11-18: Spec e2e/subtask-align.spec.mjs measures cell CONTENT-BOX left edges (contentLeftX) — not the chip content. Cell boxes can align while inner chip content is offset.
- 2026-11-18: Parent status cell = `<button class="pillbtn">${stPill}</button>` (src/components/task-list.js:27); .pillbtn = `padding: 0 7px; gap: 6px` (src/styles/components.css:595).
- 2026-11-18: Subrow status cell = `<div class="c-meta c-status"><label class="stchip">${toggle}${stPill(...)}</label></div>` (src/features/subtask-popovers.js:85); .stchip styled only in list.css:190 — `display:inline-flex; gap:6px`, NO padding, NO height/border-radius/background.
- 2026-11-18: Other surfaces (drawer checklist drawer.js:122, board popover subPop.subs) use compact/no-columns mode → no status chip there; the only subtask status chip surface is List/My Tasks subrows — same one the spec covers, but the spec's metric misses the inner 7px offset.

## Eliminated

- hypothesis: user looking at a different surface (drawer checklist / board popover)
  evidence: those render compact mode without columns → no status chip rendered there
- hypothesis: --ind applied to container shifting tracks
  evidence: list.css:145-178 comment + code — indent rides .subhead margin-left only

## Resolution

root_cause: subrow status chip visual offset — parent .pillbtn has 0 7px padding, subrow .stchip had none
fix: commit `02fb2dc` (fix 71-04) — `.subrow .c-status .stchip` now carries the .pillbtn padding/height/radius contract (alignment, not restyle). G-71-4 follow-up (`bdd73d5`) wrapped assignee/priority/due content in the same contract.
verification: pin added in 71-04 (`3fedacb`, inner-chip-content alignment vs parent pill content); human re-check UAT after closure (`d9bc7fc`, `8bf5a08`) — passed; confirmed in v2.6 milestone audit (71 visual UAT passed post G-71-3/G-71-4 closure).
files_changed: [src/styles/views/list.css]
