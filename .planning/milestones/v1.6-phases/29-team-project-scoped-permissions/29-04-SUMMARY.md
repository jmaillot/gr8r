---
phase: 29-team-project-scoped-permissions
plan: 04
subsystem: server+client+tests
tags: [scope, invites, guest, ui, i18n, 404-matrix, tdd]
status: complete
requires: [invites.scope + memberships.scope columns (29-01), scope PUT route + memberScope()/hiddenFor() funnel (29-01), inviteTeams picker pattern (28-03), memberTeams modal (28-02)]
provides:
  - invite POST body.scope — validated with the member-scope mirror (whitelist, caps, shape codes) and stored as invites.scope JSON (SCOPE-05, T-29-12)
  - D-13 guest rule: viewer + multi-project scope answered 400 guestSingleProject (server-side, creation time)
  - D-04 elevation guard: admin/owner invite with scope answered 400 scopeNotAllowed
  - acceptance plumbing: invite.scope → addMembership 5th arg → memberships.scope (coalesce-on-conflict, legacy callers untouched)
  - invite form scope section: teams+projects multi-selects by name, guest toggle (single-select projects), hidden for Admin role; copy-link/resend honour the scope
  - member modal scope editor: same pickers, PUT /members/:uid/scope, untouched-editor-never-writes guard, admin/owner targets fixed workspace-wide
  - MATRIX family 6 live (invite-carried scope probes) + D-06 workspace-level rows (activity feed, recent searches, cross-project search) — zero placeholder rows
affects: [/gsd-verify-work UAT, Phase 30 SSO JIT-provisioning (invited-member shape)]
tech-stack:
  added: []
  patterns: [validation-mirror reuse (member-scope route), 5th-default-arg signature extension, client-side scope cache keyed by userId (D-05 write-around), untouched-editor-never-writes, catalogue-pin increments]
key-files:
  created: []
  modified: [server.js, src/overlays/modals.js, src/actions/actions.js, src/core/api.js, src/locales/en.json, src/locales/fr.json, test/scope.test.mjs, test/i18n-core-features.test.mjs, test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/error-codes.test.mjs]
key-decisions:
  - "Guest path UI: the existing role select's Guest option is the guest mode source of truth; the checkbox toggle mirrors it; the projects picker degrades to single-select when guest (D-13 exactly-one, server-enforced anyway)"
  - "D-05 payload silence vs modal prefill: memberPayload still never projects scope, so the member modal's scope editor starts empty+untouched and a submit without touching the pickers never writes scope — a blind clear could not distinguish workspace-wide from unknown. Values set in-session are cached in S.ui.memberScopes and reflected on reopen"
  - "addMembership scope lands via coalesce(excluded.scope, memberships.scope) so the legacy internal callers (which pass nothing) can never erase a stored scope"
  - "inviteRole() has no owner tier ('owner' degrades to member), so the D-04 expressible surface is the admin invite; the server gate covers both ranks"
requirements-completed: [SCOPE-05, SCOPE-06]
duration: ~30 min
completed: 2026-11-02T10:04:00Z
estimate:
  tokens: 100000
actuals:
  tokens: 96000
  tasks: 3
  commits: 4
plan_head_before: 113aedc
plan_head_after: 9d658cc
commits: 4
coverage:
  - deliverable: "Invite carrying scope is validated (whitelist/caps/shape) and stored as invites.scope JSON"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#invite scope ids are whitelisted and shaped like the member scope route", status: pass }, { kind: tests, ref: "404-matrix [family 6] invite-carried scope — inScope/outOfScope/unknown", status: pass }]
    human_judgment: false
  - deliverable: "Guest rule (D-13): viewer + multi-project scope 400 guestSingleProject; D-04 admin+scope 400 scopeNotAllowed"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#an invite carrying a multi-project viewer scope is refused (D-13 guestSingleProject)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#an admin or owner invite never carries scope (D-04 scopeNotAllowed)", status: pass }]
    human_judgment: false
  - deliverable: "Acceptance lands the scope on the membership; unscooped invites stay null"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#acceptance lands the invite scope on the membership (SCOPE-05)", status: pass }, { kind: tests, ref: "test/scope.test.mjs#an invite without a scope field leaves memberships.scope null (unscooped regression)", status: pass }]
    human_judgment: false
  - deliverable: "Guest sees exactly their one PRIVATE project and nothing else; viewer write refused (D-03/D-14/D-15)"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#the guest sees exactly their one private project and nothing else (D-03 grant, D-14)", status: pass }]
    human_judgment: false
  - deliverable: "Both admin UI surfaces express the scope model; EN+FR complete; no D-11 self-indicator string"
    verification: [{ kind: tests, ref: "full suite: node --test --test-concurrency=2 test/*.test.mjs — 749 tests, 746 pass, 0 fail, 3 intentional skips", status: pass }, { kind: tests, ref: "test/i18n-core-features.test.mjs#catalogue pin 1653 (EN+FR parity enforced by build-locales/catalogue suites)", status: pass }]
    human_judgment: true
    note: "UI rendering is exercised by the i18n scanner suites + byte-identity pins, not a browser session — /gsd-verify-work should click both surfaces once."
  - deliverable: "D-06: scoped member's activity feed, recent-search terms and cross-project search carry zero out-of-scope references"
    verification: [{ kind: tests, ref: "test/scope.test.mjs#404-matrix [D-06] the scoped member's activity feed and recent searches carry zero out-of-scope references", status: pass }, { kind: tests, ref: "test/scope.test.mjs#404-matrix [D-06] a cross-project search over the client-visible payload returns no out-of-scope hits", status: pass }]
    human_judgment: false
---

# Phase 29 Plan 04: Invite-Carried Scope & Guest Collaborator Summary

**One-liner:** Invitations now carry a validated scope (`invites.scope`) that lands on the membership at acceptance, the guest collaborator model rides viewer + exactly-one-project (server-enforced `guestSingleProject`, private projects included via the D-03 grant), and both admin UI surfaces — invite form scope section and member modal scope editor — express the same id-based scope model with EN+FR strings at write time and no scoped-member self-indicator.

## Accomplishments

- **Invite POST scope (Task 1, TDD):** `body.scope` validated with the exact mirror of the PUT members/:uid/scope route (shape codes `scopeRequired`/`teamsRequired`/`projectsRequired`, per-item trim + 40-char slice, Set-dedup, cap 25, whitelist `unknownTeam`/`unknownProject`). D-04: role admin/owner with any scope ⇒ 400 `scopeNotAllowed`. D-13: viewer + >1 project ⇒ 400 `guestSingleProject`. Scope stored as JSON on `invites.scope` and echoed in the 201 rows (T-29-14: the inviting admin sees the carried scope).
- **Acceptance plumbing:** the accept route parses `invite.scope` defensively (same shape as `invite.teams`) and passes it as addMembership's 5th argument; addMembership writes it inside its existing transaction with `coalesce(excluded.scope, memberships.scope)` so legacy internal callers can never erase a stored scope.
- **UI surfaces (Task 2):** `inviteModal` gains the scope section — teams + projects multi-selects by display name, guest toggle, hidden when the role is Admin (D-04) — submitted as `body.scope {teams, projects}`; the guest path degrades the projects picker to single-select. The `memberTeams` modal gains the same pickers PUTting `/members/:uid/scope`; admin/owner targets show a fixed workspace-wide note instead of an editor. `api.createInvites` gained an optional scope arg and `api.setMemberScope` is new. No badge/notice for the scoped member anywhere (D-11); no new navigation (D-08).
- **Matrix complete (Task 3):** family 6 probes live (invite scope stored verbatim for in/out ids, unknown id refused byte-identical `unknownProject`); the family-3 skip row resolved into the checked-not-affected comment block — `grep -c "covered by Plan"` = 0. D-06 rows: the scoped fixture member's activity feed lists no out-of-scope event, recent-search terms naming one are scrubbed, and a client `searchAll` over the redacted payload finds no out-of-scope task or project while in-scope ones stay findable.
- **Catalogues:** +9 keys (err.guestSingleProject + 8 UI strings) in both EN and FR, pin 1644 → 1653; `err.changeScope` added to the client-only reverse-parity allowlist; i18n scanner/data-a/data-v/call-site pins bumped.

## TDD Gate Compliance

- **Task 1 (tdd=true):** RED commit `eaff9e2` — 4 failing probes (guestSingleProject, scopeNotAllowed, invite fixture, acceptance) against pre-plumbing code. GREEN commit `5f66663` — all pass (63 tests, 58 pass + 5 then-intentional skips). REFACTOR: none needed (one test-side fix: the D-04 loop dropped the non-existent owner tier; the unscooped regression got a dedicated unscooped invite+accept because the fixture member's scope state at that point was not null).
- **Task 2/3** are not TDD-marked; Task 2 is covered by the i18n scanner suites (literal scan, byte-identity pins, catalogue parity) — full suite green before commit.

## Deviations from Plan

**1. [Rule 2 - Missing critical functionality] `err.guestSingleProject` catalogue key + pin bump**
- **Found during:** Task 1 GREEN run
- **Issue:** `test/error-codes.test.mjs` enforces a non-empty `err.<code>` entry in EN+FR for every server-emitted code.
- **Fix:** added the key to both locales; pin 1644 → 1645 (later 1653 with the UI strings).
- **Files modified:** src/locales/en.json, src/locales/fr.json, test/i18n-core-features.test.mjs (commit 5f66663)

**2. [Rule 2 - Missing critical functionality] i18n machine-identity pin updates (data-a 466→468, data-v 79→81, api call sites 39→40, catalogue scanner clean-up)**
- **Found during:** Task 2 full-suite run
- **Issue:** the new pickers/actions shift tree-wide byte-identity pins; new UI strings must be catalogue keys (no literals).
- **Fix:** bump pins with comments; replaced role-string literals in actions.js/modals.js with derived constants (`ROLE_MEMBER_UI`/`ROLE_ADMIN_UI`/`ROLE_GUEST_UI` from API_ROLE keys, `INVITE_ROLE_OPTIONS` in modals.js) so the literal scanner stays clean.
- **Files modified:** test/i18n-shell.test.mjs, test/i18n-toast.test.mjs, test/i18n-core-features.test.mjs, src/actions/actions.js, src/overlays/modals.js (commit ff3dc2a)

**3. [Planner-discretion documented] Member-modal scope prefill under D-05**
- **Issue:** D-05 keeps `memberPayload` silent about scope, so the editor cannot read back a scope set by another admin/session. The plan's "reflects the saved value on reopen" is satisfied in-session via `S.ui.memberScopes` (written on each successful PUT); first edit starts empty+untouched and **never writes scope unless the admin touches the pickers** — preventing a blind clear of an invite-carried scope.
- **Impact:** cross-session, cross-admin prefill would need a scoped read-back route (a D-05 policy change) — surfaced for /gsd-verify-work to adjudicate if the UX feels wrong.

## Verification Results

- `node --test test/scope.test.mjs` — 67 tests: 64 pass, 3 intentional skips (unknown-id reminders/fanout/doc-put pre-phase semantics), 0 fail
- `node --test --test-concurrency=2 test/*.test.mjs` — **749 tests, 746 pass, 0 fail, 3 intentional skips** (phase gate)
- `grep -c "covered by Plan" test/scope.test.mjs` — 0
- `grep -c "guestSingleProject" server.js test/scope.test.mjs` — ≥1 each

## Issues Encountered

None beyond the documented deviations.

## Next Phase Readiness

Phase 29 is functionally complete: SCOPE-01..06 all landed, the 404/behavior matrix is finished with zero placeholder rows, and the milestone invariants hold (zero new runtime dependencies, EN+FR at write time, additive-only columns from 29-01, full suite green). Ready for /gsd-verify-work UAT (recommended clicks: invite form scope section incl. guest toggle, member modal scope editor, and the guest's one-project view).

## Self-Check: PASSED

- 29-04-SUMMARY.md exists with `status: complete`
- All 6 commits verified in git log (eaff9e2, 5f66663, ff3dc2a, 9d658cc, 29750ba, 7e3a312)
- Full suite green at concurrency 2: 749 tests, 746 pass, 0 fail, 3 intentional skips
- Matrix placeholder check: `grep -c "covered by Plan" test/scope.test.mjs` = 0
