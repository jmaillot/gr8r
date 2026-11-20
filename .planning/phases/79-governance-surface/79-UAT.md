---
status: testing
phase: 79-governance-surface
source: [79-VERIFICATION.md]
started: 2026-11-20T00:00:00Z
updated: 2026-11-20T00:00:00Z
---

## Current Test

number: 1
name: Browser walkthrough of /governance as instance operator
expected: |
  Operator exercises filter/seg, archive (typed confirm), unarchive, empty delete,
  orphan-modal reassign+release; non-operator deep-link sees the 403 fullstate.
  Amber archived badge, honest '—' creator, distinct keyed toasts, no layout
  breakage with long names/emails.
awaiting: user response

## Tests

### 1. Browser walkthrough of /governance — operator surface
expected: As an instance operator: the governance nav entry is visible; the page lists ALL workspaces (name, slug, member count, creator, created) including ones you are not a member of; filter/seg (all/active/archived) works; archiving requires a typed slug confirm and shows an amber archived badge afterwards; unarchive restores access; deleting an empty workspace works after typed confirm; deleting a workspace WITH members opens the orphan disposition modal where every member must be reassigned (destination + role) or released before Delete enables; distinct keyed toasts fire; a non-operator deep-linking /governance sees the 403 full state. No layout breakage with long workspace names/emails.

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
