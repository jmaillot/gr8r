# Phase 51: Client surfaces, Permissions-page removal & project creation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-08
**Phase:** 51-Client surfaces, Permissions-page removal & project creation
**Areas discussed:** Toggle placement & shape, Share-modal team invite, Permissions-page teardown, Creation restriction UX

---

## Toggle placement & shape

| Option | Description | Selected |
|--------|-------------|----------|
| Share modal, in place | Replace the shareAccess select in the same general-access row | ✓ |
| Project header icon | Lock/unlock icon in header; share modal read-only | |
| Modal + header indicator | Full control in modal + read-only header icon | |

**User's choice:** Share modal, in place
**Notes:** Smallest diff; users already look there.

| Option | Description | Selected |
|--------|-------------|----------|
| Two-state toggle, same labels | Reuse 'Only invited' / 'Everyone at {workspace}' keys | ✓ |
| Segmented Private/Public | Explicit states, new i18n keys | |

| Option | Description | Selected |
|--------|-------------|----------|
| Refetch + honest not-found | Localized not-found on lost visibility | ✓ |
| Optimistic removal | Remove locally immediately | |

| Option | Description | Selected |
|--------|-------------|----------|
| Teams note in modal | Inline note listing teams with access | ✓ |
| No teams display | Discoverable via Phase 52 instead | |

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic + revert | Flip instantly, revert + toast on refusal | ✓ |
| Wait for ack | Simpler, slower | |

## Share-modal team invite

| Option | Description | Selected |
|--------|-------------|----------|
| Team list section | Teams section with per-team Invite action | ✓ |
| Unified typeahead | One input accepting emails and team names | |

**User's choice:** Team list section
**Notes (freeform, D-51-7):** "team invite makes members of that team 'Member role', if i want to make a team member as admin or owner, i'll add a separate invite with the individual member and select his role, the individual invite must precedes team role so he can do admin tasks"

| Option | Description | Selected |
|--------|-------------|----------|
| Live-following copy | Access follows team membership (D-50-5) | ✓ |
| Snapshot wording | Old roadmap wording, contradicts D-50-5 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Linked teams listed + removable | In teams note with remove action; excluded from invite list | ✓ |
| Re-invite allowed | 'Already has access' toast | |

## Permissions-page teardown

| Option | Description | Selected |
|--------|-------------|----------|
| permCreate → General | Workspace settings > General | ✓ |
| permCreate → Members | Next to role management | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete — superseded | Replaced by per-project p.allowInviteGuests | ✓ |
| Keep as global switch | Extra layer, contradicts minimal model | |

| Option | Description | Selected |
|--------|-------------|----------|
| Delete — model changed | No public-share-link concept in collapsed model | ✓ |
| Repurpose | New capability, out of scope | |

| Option | Description | Selected |
|--------|-------------|----------|
| Relocate to Members | Role table moves to settings > Members | ✓ |
| Delete entirely | Code + docs suffice | |

## Creation restriction UX

| Option | Description | Selected |
|--------|-------------|----------|
| Hide entirely | Not rendered for restricted members | |
| Disabled with tooltip | 'Restricted to admins' tooltip | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| 403 + localized toast | Standard refusal shape | ✓ |
| 404-style | Wrong shape — route isn't secret | |

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate effect | Next request, no cache | ✓ |
| Confirm/schedule | Unnecessary | |

| Option | Description | Selected |
|--------|-------------|----------|
| Member entry, workspace role | Consistent with D-50-1 (no per-project roles) | |
| New per-project lead role | Model change | ✓ |

**User's choice:** "creator become admin of that project" — refined with the agent into a per-project **lead** role.
**Notes:** Follow-up pinned the meaning: lead has project-manage rights (members/toggles/settings of that project); workspace admin/owner still outrank (D-51-17, supersedes D-50-1 in part).

---

## the agent's Discretion

- API route shape reuse (Phase 50 toggle/team-link routes), teams-note markup, visibility-epoch refetch mechanics, removed-key detection, server `permCreate` enforcement placement, lead-role storage representation, activity-log entries.

## Deferred Ideas

None — discussion stayed within phase scope.
