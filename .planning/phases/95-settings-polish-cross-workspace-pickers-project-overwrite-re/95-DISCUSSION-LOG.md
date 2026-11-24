# Phase 95: Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-24
**Phase:** 95-Settings Polish + Cross-Workspace Pickers + Project Overwrite Restore
**Areas discussed:** Project overwrite semantics, My Access layout, API Keys purge, Cross-workspace pickers + Edit-Teams, follow-ups (backups history, Workspace URL render, empty workspaces, purge permission)

## Project overwrite — replaced project content

| Option | Description | Selected |
|--------|-------------|----------|
| Total replacement | favorites/comments/activity of the replaced project deleted; archive supplies its own data; pre_restore snapshot is DR | ✓ |
| Conservative merge | existing favorites/comments kept and re-attached to restored project | |

**User's choice:** Total replacement
**Notes:** pre-restore snapshot (89-05) is the recovery path.

## Project overwrite — target selection & confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Project picker + confirm-name | same drawer picker, project-level selection, typed phrase vs CURRENT name (89-05) | ✓ |
| Simple confirmation | no typed phrase | |

**User's choice:** Project picker + confirm name

## Project overwrite — name collision

| Option | Description | Selected |
|--------|-------------|----------|
| Typed refusal | restoreNameCollision ×5 naming conflicts | ✓ |
| Auto suffix | "(restored)" appended | |

**User's choice:** Typed refusal

## Project overwrite — restore lock

| Option | Description | Selected |
|--------|-------------|----------|
| Global lock unchanged | one restore at a time, all triggers | ✓ |
| Parallelize | overwrite + import_new concurrently | |

**User's choice:** Global lock unchanged

## Project overwrite — permissions

| Option | Description | Selected |
|--------|-------------|----------|
| Same as Restore as new | Super Admin bypass + Restore Op membership | ✓ |
| Super Admin only | more restrictive | |

**User's choice:** Same as Restore as new

## Project overwrite — backups of replaced project

| Option | Description | Selected |
|--------|-------------|----------|
| History kept | run history is an operational journal | ✓ |
| Runs purged | replaced project's runs removed | |

**User's choice:** History kept

## My Access — layout

| Option | Description | Selected |
|--------|-------------|----------|
| Project icon grid | dashboard card idiom | ✓ |
| Column table | dense admin view | |
| Current list + real icons | minimal change | |

**User's choice:** Project icon grid

## My Access — grouping

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by workspace | per-group subtitle | ✓ |
| Flat grid | workspace in card subtext | |

**User's choice:** Grouped by workspace

## My Access — interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Click nav + role badge | cards navigate to project | |
| Read-only | pure overview | ✓ |

**User's choice:** Read-only cards

## My Access — empty workspaces

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden | no empty groups | ✓ |
| Shown with empty state | full membership display | |

**User's choice:** Hidden

## API Keys — purge confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| 2 clicks, conditional | revoke idiom; button only when revoked keys exist | ✓ |
| 1 click | toast after | |

**User's choice:** 2 clicks, conditional

## API Keys — post-purge view

| Option | Description | Selected |
|--------|-------------|----------|
| Removed from view + toast | "N keys removed" | ✓ |
| Stay visible (greyed) | redundant | |

**User's choice:** Removed from view + toast

## API Keys — server semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Rows deleted, audit keeps event | append-only trail preserves purge | ✓ |
| purged flag | rows kept | |

**User's choice:** Rows deleted, audit keeps event

## API Keys — purge permission

| Option | Description | Selected |
|--------|-------------|----------|
| Own keys only | per-user table already scoped | ✓ |
| Admin-only | more restrictive | |

**User's choice:** Own keys only

## Cross-workspace pickers — Run-now picker

| Option | Description | Selected |
|--------|-------------|----------|
| Align Backup on scopes payload | same as restore picker | ✓ |
| Restore picker only | Backup keeps current logic | |

**User's choice:** Align Backup on scopes

## Edit-Teams — picker contract

| Option | Description | Selected |
|--------|-------------|----------|
| Same as Teams > Edit team | mteamToggle + teamPickOpen | ✓ |
| Simplified invite version | chips only | |

**User's choice:** Same contract as Edit team

## Workspace URL — long value render

| Option | Description | Selected |
|--------|-------------|----------|
| Ellipsis + tooltip | full URL on hover | ✓ |
| Marquee scroll | avoided | |

**User's choice:** Ellipsis + tooltip

## the agent's Discretion

- My Access grid sizing/spacing (design tokens)
- Purge endpoint route shape + rate limit
- Internal staging of project-overwrite pipeline (extend unit vs new unit)

## Deferred Ideas

None — discussion stayed within phase scope.
