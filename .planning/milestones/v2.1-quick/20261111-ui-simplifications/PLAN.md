---
slug: ui-simplifications
created: 2026-11-11
status: in-progress
source: owner requests 2026-11-11 (post-Phase-55 UAT session)
---

# Quick: UI simplifications (assignee picker, member teams, new project)

Owner requests, 2026-11-11:

1. **Assignee picker "Assign to…"** — candidate list takes too much space; make members
   inline (compact chips) and/or selectable with a checkbox. Current: full-width rows
   (`opt` buttons, `padding:8px`) in a scroll box.
2. **User edit → Teams** — keep ONLY team selection; drop the "Access limits" (scope)
   section entirely.
3. **New project form** — remove the team-selection chips (create path keeps working;
   teams can be linked afterwards via Access tab).

## Tasks

### T1 — Assignee picker: compact inline members
File: `src/overlays/modals.js` (assigneePickModal ~507-545).
Replace the full-width `opt` row list with a compact wrap-grid: same checkbox
semantics (`role=checkbox`, aria-checked, aria-disabled, same actions
`assigneePickToggle`), same candidate filter, avatar + name, smaller padding,
`flex-wrap` layout. Draft chips row and cap hint unchanged.

### T2 — Member edit modal: teams only
File: `src/overlays/modals.js` (memberEdit scope block ~80-100).
Remove the `scopeBlock` (projects + teams scope pickers and hints) from the
memberEdit modal; keep the Teams fieldset. `submitMemberTeams` continues to send
teams only — verify it does not write scope (check actions.js memberTeams submit);
the untouched-scope contract (SCOPE-01 note: submitting without touching pickers
never writes scope) is trivially satisfied once the pickers are gone.

### T3 — New project form: no team chips
File: `src/overlays/modals.js` (project form teamsField ~179-185).
Remove the create-path team chips field (`teamsField` becomes '' unconditionally).
`submitProject` create path passes `f.teams` (default []) — empty array is the
existing no-teams default; teams get linked afterwards via the Access tab.
Also drop the now-dead `pformTeamToggle` action handler and the `f.teams`
initialization if unused elsewhere (invite form has its own state — verify).

## Verification
- node --check on touched files
- npm test (i18n-shell actions sweep will catch a dead action key; update pins if needed)
- npm run i18n:scan (removed hints/labels may become dead keys — remove or allowlist)
