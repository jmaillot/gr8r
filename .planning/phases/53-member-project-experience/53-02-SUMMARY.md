---
phase: 53-member-project-experience
plan: 02
subsystem: invite-modal
tags: [invite, draft-persistence, chips, guest-invariant, i18n, e2e, data-in]

requires:
  - phase: 50-live-team-links
    provides: guest one-project behavior-only invariant (D-50-11), per-project allowInviteGuests toggle (VIS-04)
  - phase: 53-member-project-experience
    provides: 53-01 per-team perm model (sibling suites shared fixtures)
provides:
  - data-in="inviteDraft" silent-state binding + IN.inviteDraft handler (draft survives every re-render, EN+FR)
  - Projects chips row listing visibleProjects() feeding S.ui.inviteScope.projects into the POST scope
  - D-06 client disable+hint on inv-submit (modal.inviteGuestNeedsProject, EN+FR) — no clamping, no role downgrade
  - validateGuestInviteShape shared server validator on create + membership-edit + accept (Task 2, commit c92147e)
  - err.inviteGuestProjectRequired / err.inviteGuestProjectSingle catalogue keys (EN+FR, catalogue 1714)
affects: [53-03-project-settings-modal, 53-05-teams-polish]

tech-stack:
  added: []
  patterns: [data-in silent-state binding (draft) vs re-rendered fields (chips/role), one shared server validator across all write paths, disable+hint instead of clamp (D-06), catalogue-size pin test]

key-files:
  created: []
  modified: [src/overlays/modals.js, src/actions/actions.js, src/locales/en.json, src/locales/fr.json, e2e/invite.spec.mjs, server.js, test/perm.test.mjs, test/membership.test.mjs, test/tenancy.test.mjs, test/upload.test.mjs, test/invite-hierarchy.test.mjs, test/i18n-core-features.test.mjs]

key-decisions:
  - "Draft is the ONLY silent field (IN.inviteDraft never renders); chips and role keep full re-renders so the D-06 disable+hint state re-evaluates on every toggle"
  - "Guest invariant expressed client-side as disable+hint only (D-06) — the clamp in A.invProjToggle was removed, chips stay multi-select for every role; the server is the enforcement point"
  - "Fixed a pre-existing swapped role-constant destructure (ROLE_MEMBER_UI='Admin', ROLE_ADMIN_UI='Member' since 29-04 ff3dc2a): invites defaulted to the Admin role (hiding the scope section) and every member invite POSTed scope:null — the chips could never reach the body"
  - "Sibling suites updated to the new invariant instead of weakening it: guest invites in fixtures now carry one real project with the toggle ON (membership/tenancy/upload/invite-hierarchy)"

requirements-completed: [INVT-01, INVT-02, INVT-03]

coverage:
  - id: INVT-01
    description: "Typed emails survive role changes, team/project chip toggles and background re-renders (EN+FR)"
    requirement: INVT-01
    verification:
      - kind: e2e
        ref: "e2e/invite.spec.mjs#typed invite emails survive role changes, team chip toggles and project chip toggles (EN) + (FR)"
        status: pass
    human_judgment: false
  - id: INVT-02
    description: "Projects chips list PROJECTS below Team, multi-select, both ids ride the POST scope"
    requirement: INVT-02
    verification:
      - kind: e2e
        ref: "e2e/invite.spec.mjs#project chips feed the invite scope: toggling two project chips sends both ids (INVT-02)"
        status: pass
    human_judgment: false
  - id: INVT-03-server
    description: "Guest invite with zero/2 projects refused server-side on create regardless of inviter tier; edit + accept re-derive the invariant"
    requirement: INVT-03
    verification:
      - kind: integration
        ref: "test/perm.test.mjs#create/edit/accept rows + test/invite-hierarchy.test.mjs#member/admin guest rows"
        status: pass
    human_judgment: false
  - id: INVT-03-client
    description: "Guest with !=1 project: send disabled + localized hint (EN+FR); one project enables; no clamping"
    requirement: INVT-03
    verification:
      - kind: e2e
        ref: "e2e/invite.spec.mjs#guest role with zero projects disables send with an English/French hint"
        status: pass
    human_judgment: false
  - id: MCP-ceiling
    description: "MCP exposes exactly three tools, none invite-creating — ceiling pinned by test"
    requirement: INVT-03
    verification:
      - kind: integration
        ref: "test/perm.test.mjs#MCP tool-list row"
        status: pass
    human_judgment: false

metrics:
  duration: ~55 min (continuation; Tasks 1-2 in a prior session)
  completed: 2026-11-09
  status: complete
actuals:
  tokens: 62000
  tasks: 3
  commits: 3
  plan_head_before: cb50798
  plan_head_after: f5fb08d
commits: 3
---

# Phase 53 Plan 02: Invite modal polish Summary

**Invite email draft bound with a silent `data-in` binding, Projects chips feeding the invite scope, and the guest = exactly-one-project invariant enforced by one shared server validator across create/edit/accept — with D-06 disable+hint in EN+FR and the MCP invite-tool ceiling pinned by test.**

## Performance

- **Duration:** ~55 min (this continuation session; Tasks 1-2 completed in the interrupted prior session)
- **Tasks:** 3/3
- **Files modified:** 12

## Accomplishments

- `data-in="inviteDraft"` on the invite textarea + silent `IN.inviteDraft` handler: typed emails survive role changes, team/project chip toggles and background re-renders, proven by e2e in EN and FR
- Projects chips row lists `visibleProjects()` (previously it rendered the TEAMS list into the projects slot), multi-select for every role, feeding `S.ui.inviteScope.projects` into the POST body (both ids asserted)
- D-06: guest with ≠1 project renders the send button disabled + localized hint (`modal.inviteGuestNeedsProject`, EN+FR); selecting exactly one project re-enables; the auto-clamp in `A.invProjToggle` is gone — no silent selection replacement anywhere
- Shared `validateGuestInviteShape(role, projects)` in server.js wired into invite create (all inviter tiers), project-membership edit routes and the accept path (Task 2, commit c92147e), with keyed refusals catalogued in EN+FR
- MCP ceiling verified and pinned: exactly daily-standup / triage-backlog / prepare-review, asserted by a test row so a future MCP invite tool cannot silently bypass the invariant
- FIXED a pre-existing bug that blocked INVT-02 end-to-end: swapped role-constant destructure (since 29-04) that defaulted the invite modal to Admin and sent `scope:null` on every member invite

## Task Commits

1. **Task 1: End-to-end draft survival — data-in binding + silent handler** - `6635276` (feat, prior session)
2. **Task 2: Shared guest validator — create, membership-edit, accept; MCP ceiling** - `c92147e` (feat, prior session)
3. **Task 3: Projects chips + D-06 disable and hint (EN+FR) + invariant fallout fixes** - `f5fb08d` (feat)

## Files Created/Modified

- `src/overlays/modals.js` — Projects chips render projects; guestNeedsProject disable+hint on inv-submit
- `src/actions/actions.js` — IN.inviteDraft (Task 1); invProjToggle clamp removed; role-constant destructure fixed
- `src/locales/en.json`, `src/locales/fr.json` — modal.inviteGuestNeedsProject + err.inviteGuestProjectRequired/Single
- `server.js`, `test/perm.test.mjs` — shared validator + create/edit/accept/MCP-ceiling rows (Task 2)
- `e2e/invite.spec.mjs` — 5 specs: draft survival EN/FR, D-06 EN/FR, chips→POST scope
- `test/membership.test.mjs`, `test/tenancy.test.mjs`, `test/upload.test.mjs`, `test/invite-hierarchy.test.mjs` — guest fixtures carry one real project (toggle ON); admin zero-project row now asserts the new refusal
- `test/i18n-core-features.test.mjs` — catalogue pin 1711 → 1714

## Decisions Made

See key-decisions; the decisive one is the role-constant fix — without it the scope chips could never reach the POST body because `role === ROLE_ADMIN_UI` matched every Member invite and nulled the scope.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Swapped role-constant destructure made every invite Admin and dropped the scope**
- **Found during:** Task 3 (e2e: chips toggled on-screen but POST body had `scope: null`)
- **Issue:** `const [ROLE_MEMBER_UI, ROLE_ADMIN_UI, ROLE_GUEST_UI] = Object.keys(API_ROLE).filter(r => r !== 'Owner')` bound ROLE_MEMBER_UI='Admin', ROLE_ADMIN_UI='Member' (pre-existing since 29-04, commit ff3dc2a). `A.invite` defaulted S.ui.inviteRole to 'Admin' (scope section hidden) and `A.submitInvite`'s `role === ROLE_ADMIN_UI` check nulled the scope for member invites.
- **Fix:** Corrected the destructure order to (ADMIN, MEMBER, GUEST) with an explanatory comment.
- **Files modified:** src/actions/actions.js
- **Verification:** e2e INVT-02 asserts both project ids in the POST scope; invite modal now opens on Member
- **Commit:** f5fb08d

**2. [Rule 2 - Missing catalogue keys] Task 2's refusal codes had no i18n entries**
- **Found during:** plan-level verification (`npm test`)
- **Issue:** error-codes.test.mjs failed: `en missing err.inviteGuestProjectRequired`.
- **Fix:** Added both keys to src/locales/en.json and fr.json; bumped the catalogue pin 1711 → 1714 in test/i18n-core-features.test.mjs.
- **Commit:** f5fb08d

**3. [Rule 1 - Test fallout] Sibling suites asserted the pre-invariant guest semantics**
- **Found during:** plan-level verification (15 failures across membership/tenancy/upload/invite-hierarchy)
- **Issue:** Tests invited viewers with zero projects (now a 400 keyed refusal) and the admin zero-project row asserted 201; the member no-project row expected `inviteMemberProjectRequired` (now the guest key fires first, by design).
- **Fix:** Guest-invite fixtures now create one real project with `allowInviteGuests: true` and pass it; admin zero-project row asserts the keyed 400; member no-project row expects `inviteGuestProjectRequired`. No production behavior weakened — the tests now encode T-53-05.
- **Files modified:** test/membership.test.mjs, test/tenancy.test.mjs, test/upload.test.mjs, test/invite-hierarchy.test.mjs
- **Commit:** f5fb08d

**4. [Rule 3 - Test infra] e2e spec fixes for the new chips row**
- **Found during:** Task 3
- **Issue:** Draft-survival specs toggled a project chip in projectless workspaces (chip no longer exists now that the row lists real projects); the chips spec asserted scope labels while the modal sat on the Admin role (scope section hidden).
- **Fix:** Project fixtures added to the draft specs; the chips spec selects Member before asserting the row.
- **Commit:** f5fb08d

**Total deviations:** 4 auto-fixed (1 bug, 1 missing critical, 2 test fallout/infra). **Impact:** positive — the role-constant fix makes the invite scope actually functional; all sibling failures were assertions of the behavior this plan explicitly replaces.

## Issues Encountered

- `test/totp-rewrap.test.mjs` still fails suite-wide (DEPLOY.md ENOENT from the parallel docs split) — pre-existing, out of scope, already logged in 53-01 and deferred-items.md.
- The e2e suite serves the built `dist/`; a rebuild was needed mid-debugging to trust the probe results.

## Verification

- `npx playwright test e2e/invite.spec.mjs` — 5/5 pass (draft EN+FR, D-06 EN+FR, chips→scope)
- `node --test test/perm.test.mjs` — pass (create/edit/accept + MCP-ceiling rows)
- `npm test` — 1147 pass, 1 fail (pre-existing totp-rewrap DEPLOY.md ENOENT), 11 skipped
- `npm run i18n:scan` — 0 dead / 0 stale / 0 pending
- `grep -c validateGuestInviteShape server.js` — 5 (1 definition + 4 call sites: create, 2 membership-edit, accept)

## Known Stubs

None.

## Self-Check: PASSED

- Commits 6635276, c92147e, f5fb08d present in `git log`.
- e2e/invite.spec.mjs, src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs exist on disk with the expected content (verified via the test runs above).
- All task acceptance criteria re-run: single `data-in="inviteDraft"` match; IN.inviteDraft body has no render(); e2e EN+FR present and passing; invProjToggle has no silent reassignment; i18n:scan exits 0; `git diff mcp.js` empty in this plan.
