# Phase 86: Export Core ("gr8r backup v1") - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-21
**Phase:** 86-export-core-gr8r-backup-v1
**Areas discussed:** File collection per scope, Run UX & destination, Trigger API shape

---

## File collection per scope

| Option | Description | Selected |
|--------|-------------|----------|
| Strict containment | Instance = everything; workspace = member projects' files + own logo; project = own files | ✓ |
| Containment + logos | Workspace scope also carries instance logos | |
| Always everything | All scopes carry all of DATA_DIR; restore filters | |

| Option | Description | Selected |
|--------|-------------|----------|
| By file id | files/<owner-dir>/<id>.<ext>, entity-addressable | ✓ |
| By friendly path | Human-browsable, name collisions | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same policy | Logos follow the owning scope's rules | ✓ |
| Exclude logos in v1 | formatVersion bump later | |

| Option | Description | Selected |
|--------|-------------|----------|
| Record + continue | Manifest flags missing blob, run succeeds | ✓ |
| Fail the run | One orphan blocks every backup | |
| Drop silently | Restore can't tell truncation from intent | |

| Option | Description | Selected |
|--------|-------------|----------|
| No dedup v1 | Export what exists; restore re-links | ✓ |
| Row-referenced only | Skip dangling blobs | |

| Option | Description | Selected |
|--------|-------------|----------|
| Skip + flag | Symlink escapes skipped, flagged in manifest | ✓ |
| Follow symlinks | Archive target content | |
| Fail the run | Strictest | |

**User's choice:** Strict containment, id-addressed files, logos same-policy, record-and-continue, no dedup, skip+flag escapes.
**Notes:** User repeatedly selected "More questions" on this area — six questions total, all answered with the conservative option.

---

## Run UX & destination

| Option | Description | Selected |
|--------|-------------|----------|
| Background run + poll | Trigger returns run id; page polls stages | ✓ |
| Synchronous request | Blocks until done; gateway timeout risk | |

| Option | Description | Selected |
|--------|-------------|----------|
| DATA_DIR/backups | Single directory Phase 87 also uses | ✓ |
| Env-configurable dir | BACKUP_DIR env | |

| Option | Description | Selected |
|--------|-------------|----------|
| Trigger+progress now | Download arrives in Phase 90 | ✓ |
| Download endpoint now | Instead of waiting | |

| Option | Description | Selected |
|--------|-------------|----------|
| Refuse concurrent | Keyed backupRunInProgress | ✓ |
| Allow parallel | Two pipelines | |
| Queue them | Queue model | |

| Option | Description | Selected |
|--------|-------------|----------|
| In-memory v1 | Crash clears state; history is Phase 87 | ✓ |
| Persist minimal row | Pre-builds Phase 87 schema | |

| Option | Description | Selected |
|--------|-------------|----------|
| Stages only | collecting/archiving/verifying/done|failed | ✓ |
| Per-table progress | Counts as they stream | |

| Option | Description | Selected |
|--------|-------------|----------|
| No cancel v1 | Boot sweep owns staging leftovers | ✓ |
| Cancel action | Extra states and cleanup | |

| Option | Description | Selected |
|--------|-------------|----------|
| Named + timestamped | backup-<kind>-<id>-<stamp>.tar.gz | ✓ |
| Run id only | Opaque names | |

| Option | Description | Selected |
|--------|-------------|----------|
| No partials | Failed runs leave nothing | ✓ |
| Keep failed archives | failed/ subfolder | |

**User's choice:** All recommended/conservative options.
**Notes:** User again selected "More questions" before moving on — eight questions total.

---

## Trigger API shape

| Option | Description | Selected |
|--------|-------------|----------|
| New /runs family | POST /api/backup/runs + GET .../current; tasks stub stays refusing | ✓ |
| Reuse tasks route | Breaks frozen surface in Phase 87 | |

| Option | Description | Selected |
|--------|-------------|----------|
| scope {kind,id} | Envelope body | ✓ |
| Flat fields | scopeKind/scopeId | |

| Option | Description | Selected |
|--------|-------------|----------|
| UUID | Unguessable run ids | ✓ |
| Sequential id | Enumerates counts | |

| Option | Description | Selected |
|--------|-------------|----------|
| Full status | One endpoint, complete payload | ✓ |
| Split endpoints | Stage only + detail route | |

| Option | Description | Selected |
|--------|-------------|----------|
| Audit refused too | All attempts on the trail | ✓ |
| Audit success only | Refusals are just errors | |

| Option | Description | Selected |
|--------|-------------|----------|
| Throttled like roles | Operator-keyed tooMany | ✓ |
| No throttle | Concurrency refusal bounds cost | |

| Option | Description | Selected |
|--------|-------------|----------|
| Same 403 | backupRoleRequired for non-holders | ✓ |
| Neutral 200 | Hides existence, complicates page | |

| Option | Description | Selected |
|--------|-------------|----------|
| No MCP mirror v1 | HTTP-only frozen surface | ✓ |
| MCP mirror now | More surface to pin | |

**User's choice:** All recommended options.
**Notes:** User selected "More questions" once more; throttle and non-holder gate questions followed, then "Ready for context".

---

## the agent's Discretion

None — the user made an explicit choice on every question presented; no "you decide" answers were given.

## Deferred Ideas

- Download/verify-checksum UI → Phase 90
- Env-configurable destination → revisit at Phase 88
- Persisted run history → Phase 87
- Cancel action → Phase 87 if needed
- MCP backup endpoints → Phase 89 gap decision
