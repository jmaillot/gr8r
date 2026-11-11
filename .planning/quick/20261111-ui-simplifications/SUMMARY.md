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

## Round 2 (owner feedback 2026-11-11)
1. **Assignee picker** — back to one member per line (owner preference over the
   pill row): compact `opt` rows with explicit checkbox box on the right
   (flex-direction:row override; the `.opt` class is column by default — that
   was the original space hog).
2. Member-edit teams-only: confirmed good.
3. **Invite access limits removed** — the scope section (Projects-they-can-see +
   Teams pickers, guest toggle, hints) left the invite form; Guest role removed
   from INVITE_ROLE_OPTIONS (guest invites required a scope pick). submitInvite
   already degrades absent scope to workspace-wide. Dead actions invProjToggle/
   invScopeTeamToggle/invGuest removed; 9 dead i18n keys removed.
Pins: data-a 486→485, data-v 80→79, catalogue 1819→1810. Suite 0 fail, i18n 0/0.

## Round 3 (owner feedback 2026-11-11)
1. **Guest role restored** in the invite form — selecting Guest swaps the Teams
   field for a single-project picker (radios, D-13 invariant: exactly one
   project). Send button disabled + hint until a project is picked; submitInvite
   guards the Enter path; scope rides guest invites only ({teams:[],projects:[id]}).
   New actions: invGuestProject. Re-added i18n keys: modal.guestProjectLabel/
   guestProjectHint/inviteGuestNeedsProject.
2. **Second Owner invitable** — server INV-01 revised: the ownerInviteForbidden
   gate now fires only for sub-owner inviters (admin/member); an owner may mint
   an owner invite (email required — HARD-02 unchanged, link-only owner invites
   still impossible; accept path already applies invite.role verbatim).
   invites role CHECK widened to include 'owner' with a boot table-rebuild
   migration for existing DBs (sqliteOnly-gated; legacy 'guest' rows
   pre-normalize to 'viewer' during the copy). Unknown roles still CHECK-reject.
   invite-hierarchy tests updated (owner invite 201/role owner; admin still 403).
Pins: data-a 485→486, data-v 79→80, catalogue 1810→1813. Suite 1385/0 fail,
i18n scan 0/0. Also touched: db-adapter.mjs SQLITE_SCHEMA mirror.

## Round 4 (owner feedback 2026-11-11)
Assignee picker candidates now use the exact Teams-picker visual: `.tmpls`
3-column card grid, `.opt` cards (avatar + bold name, check icon when on,
padding 8px) instead of the one-per-line checkbox rows. Search, cap-block,
draft chips and toggle semantics unchanged.

## Round 5 (owner feedback 2026-11-11)
1. **Owner self-promotion audit** — already safe: PATCH /members/:uid blocks
   self-modification (removeSelfViaLeave), owner grant requires an owner actor
   (ownerTransferOnly), admins can't touch admin/owner targets
   (ownerManagedRoles), last owner demote refused (needOwner). No change needed.
2. **Assignee picker** — back to one-per-line rows styled like the member-edit
   Teams list (`.opt` row buttons: avatar + bold name + check, padding 8px,
   row direction), replacing the round-4 card grid per owner preference.
