---
phase: 53-member-project-experience
review: REVIEW.md
reviewed: 2026-11-09
critical: 1
warning: 3
info: 3
---

# Phase 53 — Review Disposition

One row per finding in REVIEW.md. Default disposition: `open` — a triaged finding is
distinguishable downstream from a forgotten one.

| ID | Severity | Finding | Disposition | Notes |
|----|----------|---------|-------------|-------|
| CR-01 | critical | Per-team content-write gate bypassable: keyed on incoming row's `project`, `mergeList` replaces rows wholesale; omitted project passes gate; re-pointing `project` rewrites view-only content ("move" without source check). Fix: gate on `prev?.project \|\| t.project`, fail closed, pin with perm.test row | fixed | Gate built by 53-01 itself — in-phase defect. Fixed 2026-11-09: task AND file gates resolve the project from the STORED row first (`prev?.project \|\| t.project`, "stored parent wins" — comment-gate rule); unresolvable ids fail closed (refused+held, never `continue` past the gate); keyed `projectPermDenied` refusal shape unchanged. Regression pinned in `test/perm.test.mjs` rows 16 (binding-stripped PUT refused, stored row byte-identical), 17 (re-point to editable `p_teamboth` refused, source content intact), 18 (same for file records). Commit: `879c251` |
| WR-01 | warning | `submitProject` edit branch lacks snapshot/pushNow/409 conflict honesty (Access-tab handlers have it; General tab toasts success before debounced push settles) | fixed (5ca7a26) | Folded into the 2026-11-09 owner rulings: the edit branch now snapshots, settles pushNow before toasting, restores on refusal (409 → modal.settingsConflict, else err.projectSaveFailed) — same contract as IN.teamPerm. The same commit stopped the edit submit from writing p.teams (General-tab team chips removed on edit; team linking lives in Access only) |
| WR-02 | warning | 11 red e2e at close-out labelled "pre-existing" but bisect baseline (6e90e59) is post-53-03/53-04 — flows share-modal/creation ×4 are in-phase regressions deferred rather than fixed | fixed (9167c83) | The 4 in-phase regressions are fixed: flows share-modal test rewritten for the unified modal's Access tab (gear entry point, shareAccess checkbox instead of the removed select), project-creation test deduped to .first() (two newProject buttons on the page). flows.spec now 33/33 green. The remaining 7 failures (tenancy ×4, locale ×2, french-overflow ×1) genuinely pre-date the phase (verified at aedd30c) and stay in deferred-items.md |
| WR-03 | warning | Admins can mint guest invites to `allowInviteGuests=false` projects (201 + shareable link) that 403 on every accept — dead-on-arrival invites, fail-closed but misleading | open | Validator gap in 53-02 |
| IN-01 | info | Duplicated `PROJECT_PERMS`/`PERMS` literals with no drift guard | fixed (pending commit) | New `test/perm-drift.test.mjs`: extracts both literals from source and asserts byte-identity including order, plus the tier-ladder invariants (view first, Full access last). Both sides carry cross-reference comments |
| IN-02 | info | `toast.permChanged` leaks raw English perm value in FR | fixed (pending commit) | `permLabel` exported from modals.js; both perm-change toasts (member + team) interpolate `permLabel(el.value)` — FR renders « Peut modifier », not "Can edit" |
| IN-03 | info | `JSON.stringify`-based change detection is key-order sensitive (fails safe) | fixed (pending commit) | `stableJson`/`jsonEqual` in core/utils.js (recursive key-sort; arrays keep order). All three sites migrated: `applyPatch` skip-unchanged, `submitMemberTeams` teamsChanged, `go()` same-route. Pinned in `test/json-equal.test.mjs` |
