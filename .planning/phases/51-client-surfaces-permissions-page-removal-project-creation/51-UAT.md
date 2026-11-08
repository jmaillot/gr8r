---
status: passed
phase: 51-client-surfaces-permissions-page-removal-project-creation
source: [51-VERIFICATION.md]
started: 2026-11-08T14:10:00Z
updated: 2026-11-08T14:10:00Z
---

## Current Test

number: 3
name: Toggle + Teams section visual behavior in the running app
expected: |
  As a lead (non-admin), open the share modal: flip the private/public toggle, then invite a team and remove it.
  Expected: Toggle flips optimistically and persists (reverts with a localized toast on refusal); Teams section lists unlinked teams with Invite actions, linked teams in the note with remove actions; live-semantics hint visible; non-managers see the lock hint and no controls.
awaiting: none — all tests executed

## Tests

### 1. Cold Start Smoke Test
expected: Kill any running server/service. Clear ephemeral state (temp DBs, caches, lock files). Start the application from scratch. Server boots without errors, any seed/migration completes, and a primary query (health check, homepage load, or basic API call) returns live data.
result: pass — fresh boot on PORT=8137 (DATA_DIR=/tmp/opencode/gr8r-uat): schema ready, GET / -> 200, bootstrap account created (owner@gr8r.test, instance admin), login via /api/auth/login succeeds and /api/auth/me returns the live user with workspace ws_default.
expected: |
  As a Member in a workspace with `permCreate === true`, open the running app: check the Projects-page create button (disabled + tooltip "La création de projets est réservée aux admins" in FR), then trigger creation from the command palette, command popover, Overview header, Home header, sidebar layout button, and the `P` keyboard shortcut; submit the modal each time.
  Expected: Projects page: disabled with localized tooltip. Other entry points (WR-02, known): the modal opens but submitting is refused by the server with the localized `err.projectCreateForbidden` toast and no project is created. No crash, no silent lie.
result: pass — Playwright as member@gr8r.test in ws_default (permCreate=true): Projects-page "New project" button disabled=true with data-tip "Project creation is restricted to admins" (EN default locale; FR string `page.projects.createRestricted` verified in src/locales/fr.json). Other entry points exercised: sidebar "New project", command palette (Ctrl+K → Create project), `P` shortcut, Home header, Overview header — all open the modal; submitting yields the localized `err.projectCreateForbidden` toast ("Only admins can create projects in this workspace.") each time, modal stays open, no crash; server doc confirms only "Projet Alpha" exists (nothing created). The "New" popover shares the same action (not separately driven). Matches WR-02 known behavior.
expected: |
  As a lead (non-admin), open the share modal: flip the private/public toggle, then invite a team and remove it.
  Expected: Toggle flips optimistically and persists (reverts with a localized toast on refusal); Teams section lists unlinked teams with Invite actions, linked teams in the note with remove actions; live-semantics hint visible; non-managers see the lock hint and no controls.
result: pass — Playwright, three accounts. Lead (member@gr8r.test, project lead of Projet Alpha): private/public toggle flips optimistically (false→true) and persists server-side (doc `private: true`); no revert needed (server mode, WR-01 local-mode revert not exercised). Teams section: unlinked teams Dev/Design with Invite actions, live-semantics hint visible ("Current members of the team have access, and access follows team membership…"); Invite Dev → toast "The Dev team now has access", server `teams: ['t_dev']`, linked row with remove action; remove → toast "The Dev team no longer has access", server `teams: []`, chip restored. Non-manager (m2@gr8r.test, member, not lead): Teams section not rendered, general-access toggle disabled, access is read-only — lock/no-controls behavior confirmed.

total: 3
passed: 3
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps
