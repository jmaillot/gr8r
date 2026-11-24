# Discussion Log — Phase 94 (Backup Console UX)

**Date:** 2026-11-24 · **Mode:** default · **Areas selected:** 4/4

| Area | Decision |
|------|----------|
| Last run badge | **D-01** — 4 states: succeeded green / running neutral / failed red / succeeded+checksum_ok=false → yellow warning; client-side from existing fields |
| Editor pre-fill | **D-02** — server-side `cronToPreset` in export/cron.js on backupTaskShape (`schedule.preset`); preset match → dropdowns pre-selected; else readonly "custom schedule" raw + hint; header above form; still no client cron eval |
| Retention form | **D-03** — 4 aligned numeric inputs (day/week/month/year) with existing ×5 GFS keys; staged like today; no per-scale hints (deferred) |
| Unified history | **D-04** — sblock below the task table; 3 selects (task incl. manual / trigger / status) + limit/offset; 5-segment runLabel + GFS badge per row; "manual runs are not retained" hint on manual filter; supersedes the per-task history card; rides ?all=1 unchanged |

**Deferred:** per-scale retention hints; CSV export; date-range filter; run detail drawer.
