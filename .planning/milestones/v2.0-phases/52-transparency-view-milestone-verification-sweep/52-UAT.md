---
status: complete
phase: 52-transparency-view-milestone-verification-sweep
source: [52-01-SUMMARY.md, 52-02-SUMMARY.md, 52-03-SUMMARY.md]
started: 2026-11-08T20:05:00Z
updated: 2026-11-09T00:00:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server, start from scratch. Server boots without errors and the homepage loads.
result: pass

### 2. Admin Sees Member Access List
expected: Log in as an admin/owner. Open the Members page of a workspace. Click the chevron expander on a member row. A detail row appears showing exactly the projects that member can access (non-private + explicit invites), with an access reason label next to each project.
result: pass

### 3. Reason Labels Are Correct (First-Match)
expected: For members with different access shapes, the reason badge matches reality: a project visible to everyone shows "Tout le monde"/"Everyone"; a project where the member is lead shows "Responsable"/"Lead"; a project where the member is a plain member shows "Membre"/"Member"; a project granted only via a team shows "Équipe"/"Team".
result: pass

### 4. Non-Admin Cannot See the Expander
expected: Log in as a regular member (not admin/owner). The Members page shows no expander chevron on member rows.
result: pass

### 5. Refetch on Every Open
expected: Expand a member, note the list. (Have a second session change that member's access, e.g. remove an invite.) Collapse and re-expand the row: the list reflects the new reality without reloading the page. Navigating away and back also re-fetches (no stale cache).
result: pass

### 6. Empty State
expected: Expand a member whose only access is projects visible to everyone — the list renders; if a member has no accessible projects at all, an empty-state message ("no accessible projects") appears instead of a blank panel.
result: pass

### 7. Non-Admin Rejected at the API
expected: As a regular member (browser devtools or curl with their session), GET /api/workspaces/:slug/members/:memberId/visibility returns 403; an unknown or non-member member id returns a keyed 404 (no existence oracle).
result: pass
note: "Verified live: regular member got 403 adminOnly for both a real target (m_3439344c) and a nonexistent id (m_doesnotexist) — the admin gate precedes the lookup, so non-admins cannot probe existence (anti-oracle). Keyed-404 rows pinned by test/transparency.test.mjs."

### 8. Bilingual Labels
expected: Switch the interface language EN ↔ FR. The reason labels and aria-label render in the selected language (e.g. "Lead"/"Responsable"), with no English leakage in FR.
result: pass

### 9. Docs Reflect the Shipped Model
expected: docs/WorkspacePermissions.md and docs/ProjectPermissions.md describe the transparency view (§7 / §6) with the admin gate as the control, first-match reason semantics, and member self-view noted as deferred — citations match the live server.js line numbers.
result: pass

## Summary

total: 9
passed: 9
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
