---
status: testing
phase: 83-governance-workspace-rename-slug-edit
source: [83-VERIFICATION.md]
started: 2026-11-20T15:30:00Z
updated: 2026-11-20T16:10:00Z
---

## Current Test

number: 4
name: Refusals render keyed 5-locale messages (D-04, D-12)
expected: |
  Trigger workspaceNameRequired / invalidSlug / slugTaken refusals and check the toast text in each of the 5 locales — keyed toast text matching per locale, no raw code strings shown
awaiting: user response (throttle window has had time to clear — retry the name-required and invalid-slug refusals now)

## Tests

### 1. Edit modal opens (D-01, D-02)
expected: Open /governance as operator, click Edit on a workspace row → modal opens with Name and Slug fields pre-filled, Cancel/Save footer
result: [passed]

### 2. Confirm fork — name-only vs slug change (D-03)
expected: Edit a workspace changing only the name → direct save + success toast (governanceRenamed). Then edit again changing the slug → danger dialog appears with the bold esc() old slug and type-to-confirm on the old slug
result: [passed]

### 3. 409 slugTaken → suggestion + one-click adopt (D-07)
expected: Rename a workspace to a slug already taken by another workspace → modal stays open, shows slugTakenHint with suggested slug and an Adopt button that fills the slug field
result: [passed]

### 4. Refusals render keyed 5-locale messages (D-04, D-12)
expected: Trigger workspaceNameRequired / invalidSlug / slugTaken refusals and check the toast text in each of the 5 locales — keyed toast text matching per locale, no raw code strings shown
result: [blocked] — throttle (tooManyAttempts) engaged during testing; keyed fr toast observed ("Trop de tentatives. Réessayez plus tard.") but target refusals not yet triggered. Retry later in session.

### 5. Dead-mapping warning card renders and hides at zero (D-08, D-10, D-11)
expected: As operator, seed a dead group_mapping + a guard-refused audit row, load /governance → card appears with escaped orphan/trail rows (first-colon split visible: delta | ns | guid | reason). Remove them and reload → card disappears entirely
result: [passed] — seeded orphan via direct SQL (FK-off insert; mapping-editor UI deferred per D-11). Card rendered localized fr title + escaped orphan row (kind/label/guid→ws pair), trail section header present with empty list. After cleanup delete + reload, card gone entirely.

### 6. WR-01 — no stale old-slug client state after rename
expected: After a slug rename, navigate/click any link or view referencing the workspace's old slug (workspace header, mapping editor, other pages) — client state refreshes to the new slug via the renameWorkspaceLocal reconcile (fix 1086497b, wired at actions.js:4740), no stale old-slug references or broken actions left in the session UI
result: [pending]

## Summary

total: 6
passed: 4
issues: 0
pending: 1
skipped: 0
blocked: 1

## Gaps
