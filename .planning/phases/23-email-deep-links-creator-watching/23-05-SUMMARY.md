---
phase: 23-email-deep-links-creator-watching
plan: 05
subsystem: notifications
tags: [email, notifications, gap-closure, authority-rows]
requires: [memberships⋈users authority rows, queueNotifEmails (23-01 LINK-01)]
provides: [authority-first byline/recipient resolution in queueNotifEmails]
affects: [server.js PUT notification email fan-out]
tech-stack:
  added: []
  patterns: [static-extraction TDD (house pattern), authority-first lookup with doc-profile fallback]
key-files:
  created: []
  modified: [server.js, test/notif-email-link.test.mjs]
key-decisions:
  - "Authority rows queried once per queueNotifEmails call (memberships ⋈ users, workspace-scoped via wsRow.id) rather than reusing membersOf — the byline/recipient maps need only member_id/user_id/name/email"
  - "Doc-profiles Map retained as fallback for doc-only members; 'Un membre' kept as final fallback literal (no new user-facing strings)"
  - "Recipient resolution order: authority.email → profile.userId→emailByUserId → emailByMemberEmail; no-email skip path unchanged"
requirements-completed: [LINK-01]
coverage:
  - deliverable: "Byline shows the account name of an account-backed author (never 'Un membre' for account members)"
    verification: [{ kind: tests, ref: "test/notif-email-link.test.mjs#byline: an account-backed author resolves to their account name even with an empty doc roster", status: pass }, { kind: tests, ref: "test/notif-email-link.test.mjs#byline: authority wins over the doc profile; neither → the Un membre fallback", status: pass }]
    human_judgment: false
  - deliverable: "Account-backed recipient receives their email even when the stored doc has no profile for them"
    verification: [{ kind: tests, ref: "test/notif-email-link.test.mjs#recipient: an account-backed recipient gets their email even when the doc profile is absent", status: pass }]
    human_judgment: false
  - deliverable: "Doc-only members keep resolving byline/recipient from their document profile; unresolvable recipients still skipped"
    verification: [{ kind: tests, ref: "test/notif-email-link.test.mjs#byline: a doc-only member still resolves from the doc profile", status: pass }, { kind: tests, ref: "test/notif-email-link.test.mjs#recipient: a doc-only profile still resolves via userId → emailByUserId, then member email", status: pass }, { kind: tests, ref: "test/notif-email-link.test.mjs#recipient: authority wins over the profile path; neither → undefined (skipped as today)", status: pass }]
    human_judgment: false
  - deliverable: "URL construction and route ordering untouched (pinned tests still pass)"
    verification: [{ kind: tests, ref: "test/notif-email-link.test.mjs (all 14 URL/authority tests)", status: pass }, { kind: tests, ref: "test/file-route-ordering.test.mjs", status: pass }]
    human_judgment: false
status: complete
duration: ~15 min
completed: 2026-10-31
actuals:
  tokens: 34000
  tasks: 2
  commits: 3
---

# Phase 23 Plan 05: Gap Closure G-23-1 — Email Byline Authority Resolution Summary

**One-liner:** queueNotifEmails now resolves the byline and recipient email from the memberships⋈users authority rows (workspace-scoped), so account-backed authors show their real name instead of "Un membre" and account-backed recipients are never silently skipped.

## Accomplishments

- G-23-1 closed: notification emails for account-backed authors carry `users.name`; recipient emails resolve via authority rows when the stored doc's members array is empty of account profiles.
- Authority-first resolution added inside `queueNotifEmails` (server.js:703-712): one workspace-scoped query `select m.member_id, m.user_id, u.name, u.email from memberships m join users u on u.id = m.user_id where m.workspace_id = ?` keyed by member_id; byline = `authority.get(n.by)?.name || profiles.get(n.by)?.name || 'Un membre'`; recipient = `authority.get(n.to)?.email || (profile && emailByUserId.get(profile.userId)) || emailByMemberEmail.get(n.to)`.
- 8 new tests in test/notif-email-link.test.mjs pin the behavior via the house static-extraction pattern (authority map build, byline × 3 cases, recipient × 3 cases, authority-precedence).
- URL construction (`const url =` … `MAILER.sendNotif`) untouched — pinned byte-wise by the notifUrlBuilder extraction tests; syncProfiles/docFromClient untouched.

## Tasks Completed

| Task | Name | Commit | Files |
| ---- | ---- | ------ | ----- |
| 1 (TDD RED) | Authority-first byline/recipient tests (RED) | c75c6ac | test/notif-email-link.test.mjs |
| 1 (TDD GREEN) | queueNotifEmails authority resolution | d2caf49 | server.js, test/notif-email-link.test.mjs |
| 2 | Full regression suite | — (verification only, no files) | — |

## Verification

- `node --test test/notif-email-link.test.mjs` → 14/14 pass (RED first: 7 new tests failing against the old implementation, confirmed before implementing)
- `node --test test/file-route-ordering.test.mjs` → 3/3 pass
- `npm test` → 593/593 pass (baseline 585 + 8 new)
- grep: the authority query exists inside the queueNotifEmails slice; `Un membre` appears exactly once in server.js, as the final byline fallback

## Deviations from Plan

None - plan executed exactly as written. (One test-harness fix during GREEN: the extracted authority-map expression needed `wsRow` as a compile parameter — test-side only, fixed before first green run.)

## Threat Model

T-23-06 (Information Disclosure, low, accept): the authority query is workspace-scoped via `where m.workspace_id = ?` — names/emails only flow to co-members of the same workspace, identical exposure to the prior doc-profile path. T-23-SC: zero package installs.

## Authentication Gates

None.

## Known Stubs

None.

## Next

Phase 23 remaining gap closure: G-23-4 (team URL 404) per 23-04-PLAN.md.
