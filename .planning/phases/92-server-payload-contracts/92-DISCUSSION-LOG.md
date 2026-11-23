# Discussion Log — Phase 92 (Server Payload Contracts)

**Date:** 2026-11-24 · **Mode:** default · **Areas selected:** 6/6

| Area | Decision |
|------|----------|
| Archive name collisions | **D-01** — suffix `-2`, `-3` before `.tar.gz`; sidecar written from FINAL uniquified name; never renamed post-creation |
| gfs_bucket backfill | **D-02** — deployment-time backfill of existing succeeded runs via the same pure function; dual-engine same commit |
| Instance name source | **D-03** — `instance_name` setting (free-form) with slugified hostname fallback; slugified once into filename |
| Cron descriptor | **D-04** — structured `{kind, weekday?, hour?, minute?, raw}`; client localizes via t() ×5 (client work = Phase 94); `custom` → honest raw |
| Unified runs | **D-05** — `?all=1` + `task/trigger/status/limit/offset` on the FROZEN GET; legacy responses byte-identical; fail-closed per-run scope check |
| Scopes endpoint | **D-06** — `GET /api/backup/scopes`, gated Super Admin ∨ Backup Op ∨ Restore Op; `{workspaces:[{id,name,slug}]}`; `workspacesForUser` byte-unchanged |

**Deferred:** nested projects in scopes payload; `instance_name` settings UI; pagination beyond limit/offset.
