# Phase 83: Governance — Workspace Rename & Slug Edit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 83-governance-workspace-rename-slug-edit
**Areas discussed:** Rename UX shape, Slug validation & API shape, Dead-mapping warning section, i18n & test strategy

---

## Rename UX shape

| Option | Description | Selected |
|--------|-------------|----------|
| Row edit modal | "Edit" per row opens small modal with Name + Slug (govOrphanPick/confirm patterns) | ✓ |
| Inline row editing | Editable inputs directly in the table row | |
| Detail panel/drawer | Full-page/drawer editor, new navigation pattern | |

**User's choice:** Row edit modal
**Notes:** —

## Confirm gate (Rename UX)

| Option | Description | Selected |
|--------|-------------|----------|
| Slug-change-only confirm | Confirm dialog only when slug changed; name-only saves with toast | ✓ |
| Confirm every save | Every save goes through explicit confirm | |
| Inline two-stage confirm | D-90-style inline confirm inside the modal | |

**User's choice:** Slug-change-only confirm

## After-save UX (Rename UX)

| Option | Description | Selected |
|--------|-------------|----------|
| Warn in confirm + toast | Confirm body warns old slug 404s permanently; refresh + toast after | ✓ |
| Also redirect own view | Additionally navigate operator to new slug URL | |
| Minimal | Toast only; 404 policy documented in DEPLOY.md only | |

**User's choice:** Warn in confirm + toast

## Where listed (Rename UX)

| Option | Description | Selected |
|--------|-------------|----------|
| Per-row action | Edit beside govArchive/govUnarchive/govDeleteAsk | ✓ |
| Sub-view | Dedicated workspace settings sub-view | |

**User's choice:** Per-row action

---

## Slug validation & API shape

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse creation rules | sanitizeSlug verbatim + same invalidSlug/slugTaken keys | ✓ |
| Different rules | Stricter/looser rules for rename only | |

**User's choice:** Reuse creation rules

## API shape

| Option | Description | Selected |
|--------|-------------|----------|
| Operator rename route | POST /api/auth/operator/workspaces/:id/rename, archive guard order | ✓ |
| PATCH-style update | PATCH semantics, partial updates | |
| Extend user routes | Operator override in /api/workspaces (breaks D-10) | |

**User's choice:** Operator rename route

## Audit

| Option | Description | Selected |
|--------|-------------|----------|
| logInfo precedent | Like 'workspace deleted (governance)' | ✓ |
| audit_log row | Structured trail row per rename | |
| Split by severity | audit_log for slug change, logInfo for name-only | |

**User's choice:** logInfo precedent

## Collision UX

| Option | Description | Selected |
|--------|-------------|----------|
| 409 + suggestion | Reuse slugTaken + suggestion payload, one-click adopt | ✓ |
| 409 only | Plain refusal, manual retyping | |
| Client pre-check too | Extra client-side check against loaded list | |

**User's choice:** 409 + suggestion

---

## Dead-mapping warning section

| Option | Description | Selected |
|--------|-------------|----------|
| Dead rows + trail | Orphaned mappings + guard-refused/dead-workspace audit rows | ✓ |
| Dead rows only | Only unknown-workspace mappings | |
| GUID staleness heuristic | Heuristic detection of never-seen GUIDs | |

**User's choice:** Dead rows + trail
**Notes:** Deleted group GUIDs not heuristically detected (claims-only semantics).

## Data source

| Option | Description | Selected |
|--------|-------------|----------|
| Derived on read | GET /api/auth/operator/dead-mappings, no schema change | ✓ |
| Boot-time snapshot | Compute at boot, store snapshot | |
| Bundle into workspaces GET | Add deadMappings field to existing payload | |

**User's choice:** Derived on read

## Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Top warning card | Card above table, hidden when zero items | ✓ |
| Inline badges | Warnings on affected rows + summary strip | |
| Separate tab | Governance page tab/segment | |

**User's choice:** Top warning card

## Actions

| Option | Description | Selected |
|--------|-------------|----------|
| Display-only | No mutation actions; cleanup deferred with editor | ✓ |
| Allow deletion | Per-row remove-dead-mapping action | |
| Link to workspace | Scroll/highlight link to workspace row | |

**User's choice:** Display-only

---

## i18n & test strategy

| Option | Description | Selected |
|--------|-------------|----------|
| New + extend | New test/governance-rename.test.mjs + extend governance-client.test.mjs | ✓ |
| One file | Everything in governance-client.test.mjs | |
| groups suite | Tests in test/groups-sso.test.mjs | |

**User's choice:** New + extend

## E2e scope

| Option | Description | Selected |
|--------|-------------|----------|
| No new e2e | Unit/fixture pins only; e2e is Phase 84 (BP-02) | ✓ |
| Small e2e now | Rename e2e spec now, suite red until 84 | |
| API-level only | Integration test of 404-no-redirect without browser | |

**User's choice:** No new e2e

## Old-slug 404 pin

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated 404 pin | Assert exact 404, no Location header, after rename | ✓ |
| Implicit | Covered only via rename route test | |

**User's choice:** Dedicated 404 pin

---

## Agent's Discretion

- Modal markup/key naming; label XSS escape at first render (carried watch-item)
- Dead-mappings trail lookback window
- Throttle budgets for the two new routes
- logInfo wording for rename
- Archived-workspace renameability — decide in planning, document

## Deferred Ideas

- Dead-mapping cleanup actions + mapping editor UI (already deferred in REQUIREMENTS.md)
- Deleted-group-GUID detection (needs Graph or claim-history heuristics — out of scope)
- Rename e2e spec (Phase 84, BP-02)
