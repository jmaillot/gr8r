# Phase 79: Governance Surface - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 79-Governance Surface
**Areas discussed:** Operator mgmt placement, Archive vs delete semantics, Orphaned member disposition, Listing endpoint & leak guard

---

## Operator mgmt placement (WSG-09)

| Option | Description | Selected |
|--------|-------------|----------|
| Relocate (Recommended) | Move promote/demote into governance page as a section; Settings keeps at most a link | ✓ |
| Link to console | Keep Phase 78 console UI; governance page adds a link | |
| Both | Keep Settings card AND duplicate in governance page | |

**Follow-up: fate of Phase 78 operatorCard**

| Option | Description | Selected |
|--------|-------------|----------|
| Remove from Settings (Recommended) | Delete operatorCard UI entirely; governance page is the only place | ✓ |
| Keep as pointer | Card remains, clicking sends operators to governance page | |

**User's choice:** Relocate + remove from Settings.
**Notes:** Ratifies the roadmap's open "linked or relocated" question.

---

## Archive vs delete semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Soft flag, reversible (Rec.) | New `archived` column; hidden from listing/entry; reversible by operator | ✓ |
| Archive AND delete | Two distinct actions, operator picks per case | |
| Delete only | Skip archive; hard delete only | |

**Follow-up: hard-delete eligibility**

| Option | Description | Selected |
|--------|-------------|----------|
| Empty-only delete (Rec.) | Hard delete only for empty/shadow workspaces; content-bearing must archive | ✓ |
| Any, with strong confirm | Hard-delete anything, content included | |

**Follow-up: confirmation strength**

| Option | Description | Selected |
|--------|-------------|----------|
| Modal confirm (Rec.) | Existing modal pattern suffices | |
| Type-to-confirm | Operator types the workspace slug to confirm | ✓ |

**User's choice:** Soft reversible archive; empty-only hard delete; type-to-confirm on all destructive actions.
**Notes:** Owner deviated from the recommendation on confirmation strength — chose the stronger type-to-confirm.

---

## Orphaned member disposition

| Option | Description | Selected |
|--------|-------------|----------|
| Per-member choice (Recommended) | Operator resolves each member: reassign or release | ✓ |
| Bulk reassign | Pick one target workspace, all members move | |
| Release only | No reassignment; members drop to await-access | |

**Follow-up: block vs proceed**

| Option | Description | Selected |
|--------|-------------|----------|
| Block until resolved (Recommended) | Delete cannot run while any member lacks a disposition | ✓ |
| Auto-release rest | Proceed; unresolved members drop to await-access | |

**Follow-up: archive vs orphan flow**

| Option | Description | Selected |
|--------|-------------|----------|
| Archive keeps rows (Rec.) | Archived workspace freezes member rows; orphan flow only on hard delete | ✓ |
| Archive clears members | Archiving also releases members | |

**Follow-up: reassignment control**

| Option | Description | Selected |
|--------|-------------|----------|
| Pick target + role (Rec.) | Dropdown of workspaces; operator assigns role in same step | ✓ |
| Target only, default role | Operator picks workspace only; member lands as plain member | |

**User's choice:** Per-member choice; block until resolved; archive keeps member rows; target + role control.

---

## Listing endpoint & leak guard

| Option | Description | Selected |
|--------|-------------|----------|
| 403 for non-ops (Rec.) | Non-operators get 403 forbidden | ✓ |
| Empty payload | HTTP 200 with empty array | |

**Follow-up: route shape**

| Option | Description | Selected |
|--------|-------------|----------|
| /api/auth/operator/* (Rec.) | New operator-gated family mirroring Phase 78 console endpoints | ✓ |
| Extend /api/workspaces | Operator scope added to the user-facing family | |

**Follow-up: client placement**

| Option | Description | Selected |
|--------|-------------|----------|
| Admin-area slot (Rec.) | Governance page slots into Phase 60 power-admin admin area | ✓ |
| Standalone page | Own route outside the admin area | |

**User's choice:** 403; /api/auth/operator/workspaces family; admin-area slot.

---

## the agent's Discretion

- Listing payload shape and pagination
- Unarchive UX details
- Refusal key names and locale phrasing
- Whether operatorCard markup is moved as a component or rewritten for the governance layout

## Deferred Ideas

- Workspace settings editing (rename/slug) from governance page — carried from Phase 78
- Bulk member operations across workspaces
- Workspace content transfer/merge tooling
