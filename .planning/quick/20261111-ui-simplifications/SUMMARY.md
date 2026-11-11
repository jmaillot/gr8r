---
status: complete
completed: 2026-11-11
tasks: 3
---
# Summary: UI simplifications (owner requests 2026-11-11)

1. **Assignee picker inline** — candidates now render as a compact wrapping row of
   pill-style checkbox chips (avatar + name, same toggle semantics/actions); scroll
   box capped at 240px. Draft chips + cap hint unchanged.
2. **Member edit → Teams only** — the SCOPE-01 scope editor (projects/teams pickers,
   hints) removed from the memberEdit modal; submitMemberTeams writes teams exclusively,
   untouched-scope contract trivially satisfied. Dead actions mScopeProjToggle/
   mScopeTeamToggle removed.
3. **New project — no team chips** — teamsField dropped from the create form; projects
   start unlinked, teams connect via the Access tab. Dead action pformTeamToggle removed;
   submitProject create path unchanged (empty teams default).

**i18n:** modal.scopeFixedHint + modal.teamsHint deleted (dead); scan 0/0.
**Pins:** data-a 488→486, data-v 82→80, catalogue 1821→1819 (all annotated).
**Tests:** npm test 0 fail (11 pre-existing skips); node --check ok; i18n:scan 0 dead.
