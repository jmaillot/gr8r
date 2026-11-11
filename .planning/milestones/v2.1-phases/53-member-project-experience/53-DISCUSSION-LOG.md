# Phase 53: Member & Project Experience - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-09
**Phase:** 53-Member & Project Experience
**Areas discussed:** Full access powers, Default perm for new teams, Unified modal layout, Guest without project, Settings gear placement

---

## Team "Full access" powers

| Option | Description | Selected |
|--------|-------------|----------|
| Content-only | Full content rights but Access list stays owner/admin/lead-only; canManageProject unchanged | ✓ |
| Includes access management | Team with Full access can also add/remove teams and members | |

**User's choice:** Content-only
**Notes:** Matches today's model where p.perms never grants management; a linked team can never lock the owner out.

---

## Default perm for newly linked teams

| Option | Description | Selected |
|--------|-------------|----------|
| Can edit | Owner's original words: "For teams, they can edit"; admin can lower per team | ✓ |
| Can view | Least privilege — read-only until raised | |
| Remember last choice | Dropdown remembers last assigned level in the session | |

**User's choice:** Can edit
**Notes:** Directly reflects the owner's original feature request phrasing.

---

## Unified modal layout

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked sections | One scrollable modal, General then Access | |
| Two tabs | General and Access tabs inside the modal | ✓ |
| Tabs + deep-link | Tabs by default; Share deep-links to Access | (superseded by follow-up) |

**User's choice:** Two tabs
**Notes:** Follow-up question: Share button → opens directly on the Access tab; gear → General. Owner selected the deep-link behavior in the follow-up.

---

## Guest without project

| Option | Description | Selected |
|--------|-------------|----------|
| Disable + hint | Send button disables with localized "Guests need exactly one project" | ✓ |
| Clamp last chip | Last selected project can't be deselected while role = Guest | |
| Auto-downgrade role | Deselecting the only project switches role back to Member | |

**User's choice:** Disable + hint
**Notes:** Honest, no surprise, no silent behavior.

---

## Settings gear placement

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone icon | Small gear as last column next to the ⋯ menu — one click | ✓ |
| Inside ⋯ menu | Menu item — cleaner rows, one extra click | |

**User's choice:** Standalone icon
**Notes:** Project page already has a gear button; this adds the per-row one in Workspace > Projects.

---

## the agent's Discretion

- Chip/dropdown styling within existing tokens and modal patterns
- Tab bar visual treatment
- Members-count tooltip wording (coarse only — T-52-03)
- Un-select lifecycle details beyond the disable+hint decision

## Deferred Ideas

None — discussion stayed within phase scope.
