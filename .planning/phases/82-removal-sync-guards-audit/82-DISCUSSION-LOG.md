# Phase 82: Removal Sync + Guards + Audit - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 82-removal-sync-guards-audit
**Areas discussed:** Downgrade detection, Operator guard scope, Audit GUID+reason shape, Sync mechanics

---

## Downgrade detection

| Option | Description | Selected |
|--------|-------------|----------|
| Provenance follows role (Recommended) | Group-driven role changes update provenance to group:<guid>; group logic owns rows it touched; untouched rows immune forever. Amends D-81-7. | ✓ |
| Separate role_source column | New column tracks who set the CURRENT role; provenance stays creation-origin. | |
| Accept immunity gap | Group-upgraded invite rows immune to downgrade forever — contradicts D-82-2's spirit. | |

**User's choice:** Provenance follows role
**Notes:** GS-01 delete filter and GS-03 downgrade filter become the same predicate (provenance LIKE 'group:%'). Phase 81 test pin on provenance-preservation changes for the group writer only.

## Operator guard scope

| Option | Description | Selected |
|--------|-------------|----------|
| Owner guard only (Recommended) | Removal-sync never touches is_instance_admin (D-82-3 stands); lastOperator guard structurally unreachable; guard funnel protects workspace owners. | ✓ |
| Defensive operator check | Redundant invariant assert before any group write. | |
| Full operator sync | Clear flag on lost operator-mapping — contradicts D-82-3. | |

**User's choice:** Owner guard only
**Notes:** Unreachable-guard reasoning documented in the plan; no schema/code for operator protection.

## Audit GUID+reason shape

| Option | Description | Selected |
|--------|-------------|----------|
| Encoded action string (Recommended) | group_<delta>:group:<guid>:<reason> in existing action column; zero schema change. | ✓ |
| New audit_log columns | group_guid + reason nullable columns via adapterEnsureColumn. | |
| Dedicated group_audit table | Second trail — duplicate actor-snapshot pattern. | |

**User's choice:** Encoded action string
**Notes:** Fixed reason vocabulary: lost-claim, mapped-lower, guard-refused, dead-workspace, archived-workspace. Phase 83 splits on first colon.

## Sync mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| One reconcile pass (Recommended) | Phase 81 grant block becomes a single diff pass (delete/downgrade/upgrade/no-op per workspace), guards count-before-write inside the pass; overage skips the whole pass. | ✓ |
| Separate removal pass | Grants then removals — two audit stories for one reconcile. | |
| Sync after DP-5 | Reorders settled GW-03 ordering. | |

**User's choice:** One reconcile pass
**Notes:** Never delete-then-reinsert; guard refusal = skip + logWarn + audit guard-refused + login succeeds (GS-02 skip-and-audit).

## Agent Discretion

- Reconcile helper shape (single pass mandatory, structure free)
- Exact encoded-action spellings within the D-82-9 format
- Guard refusal log wording (loud, never fatal)
- Test file placement (groups-sso.test.mjs is home)
- Delete path: direct guarded delete outside addMembership (insert facade), tx boundary kept

## Deferred Ideas

- Mapping editor UI + dead-mapping console section → Phase 83
- `label` XSS escape at first render → Phase 83 watch-item
- Graph overage fallback recipe → Phase 84 (DEPLOY.md)
- Operator-flag clearing → permanently out of scope (D-82-3 owner ruling)
