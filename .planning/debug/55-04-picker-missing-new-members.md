---
status: diagnosed
trigger: "Phase 55 assignee picker only offers members who were in the project before the last server boot; members invited+added to the project after boot are absent until a reboot."
created: 2026-11-11T00:00:00Z
updated: 2026-11-11T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED — the picker itself is fine; the inviter's client document is FROZEN. A project-scoped invite accept bumps the workspace revision server-side (updateDoc), the inviter's client never adopts it, its next doc write 409s, S.ui.conflict locks out the 30s poll hydration (the only roster refresh channel), and the picker candidates (D().members) stay at the pre-invite roster until a page reload.
test: live repro via test/helpers/server.mjs (two scripts, /tmp/opencode/picker-repro*.mjs)
expecting: revision bumps on project-invite accept; stale-revision PUT → 409; served roster always fresh (reboot-independent)
next_action: return diagnosis (diagnose-only mode; no fix applied)

## Symptoms

expected: newly invited members accepted and added to the project appear in the 55-04 assignee picker candidates
actual: picker offers only members present before the last server boot; new members absent until reboot
errors: none visible in picker; a transient 409 workspaceChanged save toast is the only server-side signal
reproduction: invite (guest invites REQUIRE a project) → member accepts → inviter writes doc (any UI mutation, incl. picker Apply) → 409 → conflict lock → roster frozen
started: after Phase 55 landed

## Eliminated

- hypothesis: server serves a stale roster / boot-built snapshot cached in memory
  evidence: live repro — doc GET and GET /members always carry new members with correct teams[] (syncProfiles completion loop, server.js:2204-2213); reboot changed nothing server-side
- hypothesis: boot backfill is the only roster writer and reads bypass it
  evidence: invite-revision.test.mjs asserts roster-on-read; repro confirmed served doc carries joiner profile pre-reboot
- hypothesis: form inputs (picker opened from new-task form '__form') mark doc dirty and block poll
  evidence: IN.form writes S.ui.form only (actions.js:871-877), never save()

## Evidence

- found: picker candidates = (D().members).filter(assignableInProject) — src/overlays/modals.js:513-514; D() is the client's local doc copy (src/core/store.js:331)
- found: project-scoped accept path: server.js:5946-5955 — `if (invite.project) { updateDoc(...) }`; updateDoc bumps revision unconditionally (server.js:2261)
- found: live repro 2: revision 2→3 on guest invite accept; inviter PUT with pre-accept revision → 409 workspaceChanged
- found: 409 on push sets S.ui.conflict (src/core/store.js:156-157, pushNow ~line 190); pollNotifs returns early while conflict (src/main.js:84) — the ONLY background hydrate channel
- found: S.ui.conflict cleared only in applyDoc (store.js:265, reached via hydrateFromServer at boot — main.js:348), the 409 toast's 9s "Reload" action (main.js:126-131), sign-out (actions.js:3018), or the dead "retry" loop (main.js:137 — retries the SAME stale revision, 409s again)
- found: server roster always fresh: syncProfiles completes the roster from memberships on every read (server.js:2174-2213), invited→active flip included
- found: observation (secondary): adding a member to a team-scoped project via Share (p.members push, actions.js:1933-1939) never makes them assignable — assignableInProject tests team intersection only (src/core/store.js:521-527); p.members is invisible to the predicate

## Resolution

root_cause: Project-scoped invite acceptance writes the workspace document via updateDoc, bumping the revision the inviter's client still holds; the client's next doc write 409s into S.ui.conflict, which permanently disables the 30s poll hydration — the only mechanism that refreshes D().members (the picker's candidate source). The picker therefore renders the roster as of the last successful hydrate (pre-invite). Recovery requires a page reload, which the UAT experienced as "fixed after reboot". The server itself serves a complete, fresh roster on every read; the bug is entirely client-freeze via a revision-contract violation in the project-invite accept path.
fix: (outline, not applied) honor the accept-must-not-move-revision contract on the project branch: perform the p.members grant without bumping the revision (e.g. write the doc with revision preserved, like the invite-accept non-project path's philosophy, or have the accept response + a light client adoptRevision channel propagate the new revision). Client hardening: on 409, hydrate (adopt revision) instead of dead-locking; make the "retry" action re-hydrate before re-pushing.
verification: two live harness repros (see Evidence); failing contract demonstrated at API level
files_changed: []
