# Phase 28: Multi-Team Membership - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-01
**Phase:** 28-Multi-Team Membership
**Areas discussed:** Membership edit path, Migration source of truth, Roster UI shape, Invite flow

---

## Membership edit path

| Option | Description | Selected |
|--------|-------------|----------|
| Server API (Recommended) | New admin API routes; doc never carries membership; syncMemberTeams() and doc.teams members arrays deleted | ✓ |
| Doc-diff (extend current) | Keep doc.teams[].members as edit surface; server diffs into team_members rows | |

**User's choice:** Server API (Recommended)
**Notes:** Cleanest fit for TEAM-05 and the Phase 29 scope predicate.

---

## Migration source of truth

| Option | Description | Selected |
|--------|-------------|----------|
| memberships.team wins (Recommended) | One row per member in team_members; doc member lists ignored and dropped; teamless = no rows | ✓ |
| Union both sources | Union of memberships.team and doc.teams[].members; catches drift but non-deterministic | |

| Option | Description | Selected |
|--------|-------------|----------|
| Drop usage, keep column (Recommended) | Column stays (additive-only) but nothing reads/writes it; no primary-team concept | ✓ |
| Keep as primary team | Scalar column stays as member's primary team for pickers/prefill | |

**User's choice:** memberships.team wins + drop usage, keep column
**Notes:** None — both recommendations accepted.

---

## Roster UI shape

| Option | Description | Selected |
|--------|-------------|----------|
| Teams modal, multi-select (Recommended) | Teams modal is the single editing surface; members page read-only | |
| Both teams + members pages | Editable from teams modal and per-member editor on members page | ✓ |

**User's choice:** Both teams + members pages
**Notes:** Follow-up: on the members page, editing lives in the existing member edit modal
(gains a multi-select team picker next to role), not inline table checkboxes.

---

## Invite flow

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-team invites (Recommended) | invites.team → invites.teams JSON array; multi-select invite form; one row per team at acceptance | ✓ |
| Single-team invite | Invites stay single-team; extra teams added post-acceptance by admin | |

**User's choice:** Multi-team invites (Recommended)
**Notes:** None.

---

## the agent's Discretion

- Exact API route naming/shape for membership edits
- Server-side resolution mechanics for @team fan-out and assignment-intersection filtering
- Migration test specifics beyond the pinned `test/migration.test.mjs` byte-identical boot

## Deferred Ideas

- Per-team roles / per-membership permission levels — excluded by TEAM-01; Phase 29 adds
  scope (reach restriction), not elevation.
