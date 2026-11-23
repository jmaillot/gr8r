# Phase 89: Restore - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-22
**Phase:** 89-restore
**Areas discussed:** Overwrite concurrency model, Row-shaped tables in restore, Preview + listing + MCP mirror, S3 fetch + snapshot + instance restore, Post-restore verification + progress UI, PG parity + locks

---

## Overwrite concurrency model

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse while run active | Restore refuses while a backup run is active (86-D-10 keyed vocabulary); zero new UI | ✓ |
| Maintenance banner | Advisory banner on the Backup page during overwrite | |
| Read-only window | Instance read-only during overwrite; most machinery | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mutual refusal | Backup and restore refuse each other — one shared busy refusal | ✓ |
| Restore refuses only | Backup runs allowed during restore with a carve-out | |

| Option | Description | Selected |
|--------|-------------|----------|
| Restore rows, one at a time | Persisted restore-run rows, keyed refusal for a second | ✓ |
| Synchronous, no run row | Holds HTTP open, no history | |

| Option | Description | Selected |
|--------|-------------|----------|
| One global lock | Any restore blocks any restore + any backup run | ✓ |
| Parallel import-as-new allowed | Concurrent disjoint-target restores | |

| Option | Description | Selected |
|--------|-------------|----------|
| Single tx, all-or-nothing | Whole overwrite in one transaction | ✓ (as DB layer) |
| Snapshot-repair on failure | Repair from pre-restore snapshot | ✓ (as file layer) |

| Option | Description | Selected |
|--------|-------------|----------|
| Never auto-deleted | Snapshots outside rotation, manual delete only (87-D-11) | ✓ |
| Rotate via GFS | Snapshots enter daily tier | |
| Keep last N per target | App deletes older snapshots | |

**User's choice:** Refuse-while-active + mutual refusal + restore-run rows + one global lock; failure model = tx-for-DB + snapshot-for-files (composition chosen after the assistant surfaced that SC-3 requires the single transaction and file blobs are non-transactional); snapshots never auto-deleted.
**Notes:** User initially picked snapshot-repair for DB failures; resolved to the composition to keep roadmap SC-3 intact.

---

## Row-shaped tables in restore

| Option | Description | Selected |
|--------|-------------|----------|
| Data-only + skip report | Only data tables restored; operational rows skipped + reported | ✓ |
| Scoped op tables too | saved_views/webhook_hooks restored for scope | |
| Opt-in per table | Per-table toggle | |

| Option | Description | Selected |
|--------|-------------|----------|
| Run-row summary | Skipped tables + counts on history UI + audit | ✓ |
| Log + audit only | No UI surface | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rebuild instance_roles | DR exception so you're not locked out | ✓ |
| Skip all, live roles win | Zero exceptions | |

| Option | Description | Selected |
|--------|-------------|----------|
| Restorer only, archive skipped | BKRST-02 literal membership | ✓ |
| Disabled archive memberships | Remapped-but-disabled membership rows | |

| Option | Description | Selected |
|--------|-------------|----------|
| Projects come along | Workspace restore is self-contained | ✓ |
| Workspace shell only | Projects restored individually | |

| Option | Description | Selected |
|--------|-------------|----------|
| Full data replacement | Target ends exactly as archive data tables | ✓ |
| Replace only archived rows | Merge-flavored | |

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-counter suffix | `-restored`, `-restored-2`, … | ✓ |
| Refuse on collision | Operator renames first | |

| Option | Description | Selected |
|--------|-------------|----------|
| Fresh map, validate-then-insert | Remap totality pre-write | ✓ |
| Validate during insert | Fails mid-transaction | |

| Option | Description | Selected |
|--------|-------------|----------|
| Remap to new ids | File rows/blobs get fresh ids | ✓ |
| Keep archive file ids | Collision chaos | |

| Option | Description | Selected |
|--------|-------------|----------|
| Full DR replacement | Live workspaces replaced (true DR) | ✓ |
| Import-as-new at scale | Duplicates everywhere | |

| Option | Description | Selected |
|--------|-------------|----------|
| Staged swap + snapshot repair | Blobs staged, atomic swap | ✓ |
| Direct copy, repair on failure | Half-written blobs possible | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same machinery | Logos ride staged-swap + snapshot repair | ✓ |
| Logos excluded | Live logos survive DR | |

**User's choice:** Data-only + skip report; run-row summary; instance_roles rebuild exception (threat-modeled); restorer-only membership; projects come along; full replacement; auto-counter suffix; fresh map validate-then-insert; files remap to new ids; full DR replacement; staged swap; logos same machinery.

---

## Preview + listing + MCP mirror

| Option | Description | Selected |
|--------|-------------|----------|
| Run rows local+S3 | Run rows as source of truth; no ListObjectsV2 | ✓ |
| Run rows + live S3 list | Merge live bucket listing | |
| Local only in v1 | S3 restore-invisible | |

| Option | Description | Selected |
|--------|-------------|----------|
| Server manifest endpoint | Stream manifest from archive, no unpack | ✓ |
| Sidecar manifest file | Two sources of truth for integrity | |

| Option | Description | Selected |
|--------|-------------|----------|
| No MCP in v1 | Extends 86-D-23 | ✓ |
| Read-only MCP mirror | List+preview via MCP only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Backup-page card | One-surface doctrine (D-22) | ✓ |
| Separate Restore page | Second nav entry | |

| Option | Description | Selected |
|--------|-------------|----------|
| Own history card | Restore runs get their own card | ✓ |
| Merged into run history | One timeline, mixed semantics | |

| Option | Description | Selected |
|--------|-------------|----------|
| Re-verify at preview | sha256 re-checked while streaming manifest | ✓ |
| Trust stored sha256 | Faster, weaker | |

| Option | Description | Selected |
|--------|-------------|----------|
| S3 restore-eligible via seam | 88-01 download seam consumer | ✓ |
| Listed but restore-locked | Phase 90 wires the path | |

| Option | Description | Selected |
|--------|-------------|----------|
| Honest dual-location | Local/S3 badge; gone-from-both refuses keyed | ✓ |
| Local-present only | Hides S3 DR value | |

| Option | Description | Selected |
|--------|-------------|----------|
| SC-5 mapping verbatim | Per-route hasInstanceRole tiering | ✓ |
| Higher gate than SC-1 | Backup Operator for preview | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same throttle+audit | 86-D-21 throttle + 86-D-20 audit funnel | ✓ |
| No throttle | Lock is the only control | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live rights at trigger | Archive never grants authority | ✓ |
| Instance-level gate | Stricter than SC-2 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Member-workspace picker | Live membership decides landing | ✓ |
| Archive-shape deterministic | No picker | |

---

## S3 fetch + snapshot + instance restore

| Option | Description | Selected |
|--------|-------------|----------|
| Revoke all incl. initiator | Everyone re-logs-in after DR commit | ✓ |
| Keep initiator session | One pre-DR session survives | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live instance, lock only | No maintenance mode (consistent with D-89-1) | ✓ |
| Maintenance mode | Read-only during DR | |

| Option | Description | Selected |
|--------|-------------|----------|
| Exact-name type-to-confirm | Target name / RESTORE-INSTANCE phrase | ✓ |
| Type manifest id | Number instead of name | |

| Option | Description | Selected |
|--------|-------------|----------|
| Operator email only | email_outbox transition gate; DR notify = re-login wall | ✓ |
| No emails | History card + audit only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Full instance snapshot | gr8r-format; restore-of-restore possible | ✓ |
| DB dump only | Not restorable in-app | |
| No snapshot | Wrong-archive DR unrecoverable | |

| Option | Description | Selected |
|--------|-------------|----------|
| All four threats covered | Priv-esc + SQL-injection + path-traversal + DR-roles abuse | ✓ |
| Privilege escalation only | SC-4 minimum | |

| Option | Description | Selected |
|--------|-------------|----------|
| restore-staging + sweep | BACKUPS_DIR/restore-staging + boot sweep | ✓ |
| OS tmp | Escapes sweep + containment | |

---

## Post-restore verification + progress UI (second pass)

| Option | Description | Selected |
|--------|-------------|----------|
| Full mirror of export verify | Counts + remap + blob presence + re-hash | ✓ |
| Counts + remap only | Faster, weaker | |

| Option | Description | Selected |
|--------|-------------|----------|
| 5 coarse stages | fetching → validating → restoring → verifying → done/failed | ✓ |
| Single stage | Blind for long DR | |

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror Run-now card | Stage progress + keyed labels + toasts | ✓ |
| Toast-only | No stage progress | |

| Option | Description | Selected |
|--------|-------------|----------|
| Overlay dialog | Consequence text + typed confirm | ✓ |
| Inline confirm | Lighter, less visibility | |

---

## PG parity + locks (second pass)

| Option | Description | Selected |
|--------|-------------|----------|
| Row-claim lock, no DDL | Engine-neutral restore_lock row + stale sweep | ✓ |
| Per-engine locks | pg_advisory_lock / BEGIN IMMEDIATE branching | |

| Option | Description | Selected |
|--------|-------------|----------|
| Engine-native ids | Existing schema conventions via adapter | ✓ |
| UUID pre-generation | Deviates from schema conventions | |

| Option | Description | Selected |
|--------|-------------|----------|
| Topological order | Schema-derived insert order, deferred FK pass | ✓ |
| Manifest order | Brittle to ordering changes | |

---

## the agent's Discretion

None — every gray area was decided by the user.

## Deferred Ideas

None captured — all discussion stayed within the phase boundary.
