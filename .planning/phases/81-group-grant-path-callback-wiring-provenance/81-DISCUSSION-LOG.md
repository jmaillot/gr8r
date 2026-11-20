# Phase 81: Group Grant Path — Callback Wiring + Provenance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-20
**Phase:** 81-group-grant-path-callback-wiring-provenance
**Areas discussed:** Group×invite precedence, Re-assert vs downgrade, Audit shape & scope, Provenance column mechanics, Grant edges (dead mapping, onboarding, residuals), Grant failure semantics

---

## Group×invite precedence

| Option | Description | Selected |
|--------|-------------|----------|
| Provenance-filtered guard (Recommended) | Groups run first (GW-03 literal); DP-5 guard counts only non-group memberships. Unmapped users byte-identical; invites always reconcile. | ✓ |
| Literal GW-03, guard as-is | Any group grant anywhere suppresses pending-invite reconciliation this login; invites can starve. | |
| Invite wins outright | Move group grant after DP-5; deviates from GW-03's literal wording. | |

**User's choice:** Provenance-filtered guard
**Notes:** Same-workspace collision resolves via the upgrade-only rule over subsequent logins.

## Re-assert vs downgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 81: insert-only | Grant = insert-if-absent; existing rows untouched this phase. | |
| Full re-assert incl. downgrades | Group wins over any row, even downgrading manual owner — contradicts GS-03. | |
| Upgrade-only re-assert (Recommended) | Re-asserts only when mapped role is HIGHER; lower = leave untouched. Downgrades are Phase 82's GS-03. | ✓ |

**User's choice:** Upgrade-only re-assert
**Notes:** Follow-up: viewer ranks 0 so any mapped role upgrades a viewer row (pinned).

## Audit shape & scope

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid (Recommended) | Operator grant = full audit_log row in same db.tx (action `operator_promoted`, self-grant); workspace grants = logSecurity verbs. | ✓ |
| All audit_log rows | Every group change gets a full audit_log row. | |
| All security_log verbs | Verbs only; diverges from GO-02 wording. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Changes only (Recommended) | Audit only on actual writes; idempotent re-logins write zero group rows. | ✓ |
| Every mapped login | Heartbeat row per mapped login. | |

**User's choice:** Hybrid + changes-only
**Notes:** GO-02's "like a console promote" applies to the operator flag grant specifically.

## Provenance column mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Stamp all writers (Recommended) | group:<guid> / invite / manual stamped going forward; legacy rows NULL = immune. | ✓ |
| Group rows only | Only group grants write provenance; others stay NULL forever. | |
| Group + legacy backfill | One-time migration backfills all existing rows to 'manual'. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Extend addMembership (Recommended) | Optional provenance param; on-conflict updates role only — provenance keeps creation origin. | ✓ |
| Dedicated group helper | Separate grantGroupMembership helper; two insert sites. | |

**User's choice:** Stamp all writers + extend addMembership
**Notes:** NULL legacy rows treated as manual/invite (immune to group logic forever).

## Grant edges

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + logWarn (Recommended) | Dead/archived workspace mapping → skip grant, logWarn, login proceeds. | ✓ |
| Skip silently | Boot warning only; invisible at login. | |
| Fail login closed | Punishes users for operator config mistakes. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Natural skip (Recommended) | Grants before session mint → onboarding naturally skipped for mapped JIT users. | ✓ |
| Force onboarding anyway | Contradicts GW-01; needs bypass flag. | |

| Option | Description | Selected |
|--------|-------------|----------|
| Overage log shape | Pin the fixed logWarn message, never group data. | ✓ |
| Viewer upgrade rule | Pin viewer rank 0 — mapped role upgrades viewer rows. | ✓ |
| None — all discretion | (not selected) | |

**User's choice:** Skip + logWarn; natural onboarding skip; both residuals pinned.
**Notes:** Residuals now binding: overage = one fixed-message logWarn; viewer = rank 0 in upgrade comparison.

## Grant failure semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Fail closed (Recommended) | Grant block inside existing try; any throw → generic errorRedirect. No partial login. | ✓ |
| Skip-and-log | Log + skip grants, login proceeds as unmapped. | |
| Split: flag closed, grants soft | Two behaviors in one block. | |

**User's choice:** Fail closed
**Notes:** Matches the callback's existing fail-closed doctrine and no-oracle surface.

## the agent's Discretion

- Grant block placement/shape within the callback (after identity resolution, before DP-5)
- Exact logSecurity verb spellings (grep-able, self-describing)
- Test file organization (extend oidc-sso.test.mjs vs new groups-sso.test.mjs)
- DDL comment wording in both schema mirrors

## Deferred Ideas

- Removal sync, downgrades, guard funnel, skip-and-audit → Phase 82
- Mapping editor UI + dead-mapping console section → Phase 83
- Graph overage fallback recipe → Phase 84 (DEPLOY.md)
- `label` XSS escape at first render → Phase 83 watch-item
