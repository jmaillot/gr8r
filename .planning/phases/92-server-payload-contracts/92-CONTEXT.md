# Phase 92: Server Payload Contracts - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The server serves every read-shape the client phases (93–95) render: roles aggregation payload, cron humanization descriptor, resolved workspace/project names, GFS-marked archive naming with a stored `gfs_bucket`, a unified multi-task runs surface, and an operator-gated scope listing — with the client still deriving nothing. Maps to BKNAME-01/02; phases 93–95 consume its contracts. No UI work in this phase.

</domain>

<decisions>
## Implementation Decisions

### Archive name collisions
- **D-01:** Collision suffix `-2`, `-3`, … appended before `.tar.gz` (`pjstudio-ws-marketing-daily-2026-11-23-2.tar.gz`). The sha256 sidecar is written from the FINAL uniquified filename — archives are never renamed post-creation (D-86 frozen format; sidecar carries the authoritative name). — **Reversibility:** reversible — naming-stage logic only.

### gfs_bucket backfill
- **D-02:** Deployment-time backfill: the ONE pure GFS function computes the bucket for existing succeeded runs (rotation already derives this data; the backfill reuses the same function so there is still exactly one definition). New runs store the bucket at creation. No "—" holes in the UI. Dual-engine DDL lockstep for the column + the backfill statement (SQLite AND Postgres same commit). — **Reversibility:** one-way (data migration) — additive column, so degradation is benign, but the plan must carry a `checkpoint:decision` gate per workflow rules unless waived.

### Instance name source
- **D-03:** `<instance-name>` comes from the `GR8R_INSTANCE_NAME` environment variable (ruling 2026-11-24: no settings table exists; env var is the zero-DDL mechanism), with a slugified hostname fallback when unset. Slugified once into the filename; read server-side at archive-creation time. — **Reversibility:** reversible.

### Cron descriptor shape
- **D-04:** `describeCron` (in export/cron.js, from `parseCron` output only) returns a STRUCTURED descriptor: `{ kind: 'daily'|'weekly'|'monthly'|'yearly'|'custom', weekday?, hour?, minute?, raw }`. The client localizes via `t()` keys (×5 locales, same commit as the emitting client code — that client work belongs to Phase 94, not here). `custom` (outside the 5-field subset) renders the raw expression honestly. No server-side translated strings. — **Reversibility:** reversible — additive payload field on `backupTaskShape`.

### Unified runs surface
- **D-05:** The FROZEN `GET /api/backup/runs` route gains an `?all=1` variant with filter params (`task`, `trigger`, `status`, `limit`, `offset`). Responses WITHOUT `?all=1` stay byte-identical (frozen contract per Phase 87/88 precedent, server.js:9238). Per-run scope authorization stays server-side and fail-closed (instance-scope via hasInstanceRole; workspace/project scope via live membership). — **Reversibility:** costly — touches a frozen route's query parsing; gating must be provably unchanged for legacy callers (grep gate + differential test).

### Operator scopes endpoint
- **D-06:** `GET /api/backup/scopes`, gated on Super Admin OR Backup Operator OR Restore Operator (hasInstanceRole family). Payload: `{ workspaces: [{ id, name, slug }] }` — minimal; no nested projects, no role echo (the UI already knows who the operator is). `workspacesForUser` (server.js:1282) stays byte-unchanged. — **Reversibility:** reversible — new endpoint.

### Agent's Discretion
- Exact descriptor key names and where `gfs_bucket` lands on the run row shape (`backupRunShape` if one exists).
- Backfill mechanics (idempotent `update … where gfs_bucket is null` sweep at startup vs one-time migration) — researcher/planner pick the safest dual-engine shape.
- Whether `instance_name` gets a settings UI now or reads config-only (no UI requirement in this phase; SET items belong to 95).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### GFS / rotation (single-function mandate)
- `server.js:3948–3991` — ISO week key (nearest-Thursday), exactly-one-bucket assignment (D-10), count-based retention per bucket. The pure function extracted here is THE definition; naming and rotation both consume it.
- `export/backup.js:534–552` — current filename builder + slugify; `export/backup.js:179` `completeRun(filename, sha256)` — sidecar write site for the final uniquified name.

### Frozen surfaces (do not break)
- `server.js:9092/9102` — POST /api/backup/runs; `server.js:9203` — /runs/current; `server.js:9238/9245` — GET /api/backup/runs (the route D-05 extends).
- `server.js:1282` — `workspacesForUser` (byte-unchanged mandate).
- `server.js:8770` — `backupTaskShape` (gains the cron descriptor field).

### Contracts for later phases
- Roles: `instance_roles` table server.js:725, operator email loops :3718/:3889 — the aggregation payload Phase 93 renders.
- `.planning/ROADMAP.md` § Phase 92 — 5 success criteria.
- `.planning/REQUIREMENTS.md` § BKNAME-01/02 + Out of Scope exclusions.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `slugify` (export/backup.js:543) — reuse for instance-name and scope slugs.
- ISO weekkey + bucket assignment (server.js:3948–3991) — extract into the shared pure function; rotation switches to stored `gfs_bucket` reads.
- `hasInstanceRole` / `isInstanceAdmin` / CAP machinery (roles.js import at server.js:117) — gate for the scopes endpoint.
- Existing per-task runs GET shape — extend, don't fork.

### Established Patterns
- Frozen-surface discipline: byte-identical legacy responses, additive params only (Phase 87/88 precedent).
- Additive DDL: `instance_roles` precedent (CREATE TABLE + unique index, dual-engine same commit).
- Audit funnel for any mutation (backfill is not user-triggered; document as migration, not mutation).

### Integration Points
- Archive creation path (export/backup.js) — filename builder + sidecar.
- `backupTaskShape` (server.js:8770) — add `schedule: describeCron(...)` descriptor.
- Startup/init DDL site (~server.js:722–780 region) — `gfs_bucket` column + backfill.

</code_context>

<specifics>
## Specific Ideas

- Owner ratified all six rulings in one pass, all on the recommended option: `-2/-3` collision suffix, deployment backfill, setting+hostname instance name, structured cron descriptor with client-side ×5 localization, `?all=1` on the frozen route, minimal 3-role scopes payload.
- Naming example ratified during requirements: `pjstudio-ws-marketing-daily-2026-11-23.tar.gz`; manual runs carry NO GFS marker (BKNAME-01).

</specifics>

<deferred>
## Deferred Ideas

- Nested projects in the scopes payload (deeper Restore picker) — revisit if Phase 95's UI needs it.
- Settings UI for `instance_name` — belongs to Phase 95's settings polish if anywhere.
- Pagination beyond limit/offset on the unified runs surface.

</deferred>

---

*Phase: 92-Server Payload Contracts*
*Context gathered: 2026-11-24*
