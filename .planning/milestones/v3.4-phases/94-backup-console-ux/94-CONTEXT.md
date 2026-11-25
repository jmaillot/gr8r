# Phase 94: Backup Console UX - Context

**Gathered:** 2026-11-24
**Status:** Ready for planning

<domain>
## Phase Boundary

The operator's Backup page becomes an honest console: a real task table (no blocks-in-blocks) with humanized schedule + Next run + Last run status badge, a pre-filled task editor with a proper header, retention editing across all four GFS scales, and a unified cross-task run history with filters. Presentation over the Phase-92 contracts (`task.schedule` descriptor, `?all=1` filtered history, `gfs_bucket`, 5-segment run labels) — no new server surface except the locked D-94-01 reverse-mapper field.

</domain>

<decisions>
## Implementation Decisions

### Last-run status badge
- **D-01:** Four states: `succeeded` → green; `running` → neutral; `failed` → red; and succeeded-with-`checksum_ok === false` → yellow "warning" badge (verified but integrity-flagged). Derivation client-side from fields the history/runs payload already carries (no payload change required unless the planner finds a missing field — then additive only). — **Reversibility:** reversible.

### Task editor pre-fill
- **D-02:** Clicking Edit pre-fills the form (name, scope, tz, retention, enabled) and reverse-maps the stored cron: a `cronToPreset(expr)` mapper lives SERVER-SIDE in export/cron.js (from parseCron output only — same discipline as describeCron), returned as an additive field on `backupTaskShape` (e.g. `schedule.preset: 'daily'|'weekly'|'monthly'|'yearly'|null`). When it matches a builder preset → dropdowns pre-selected; when it doesn't (steps, ranges, multi-values) → builder mode locked to a readonly "custom schedule" display of the raw expression with an honest hint. Header "Edit backup task" sits ABOVE the form block. NO free-text cron input anywhere (T-87-11 / D-87-01 unchanged); the client still never evaluates cron. — **Reversibility:** reversible — additive payload field + form logic.

### Retention form — 4 scales
- **D-03:** Four aligned numeric inputs (day / week / month / year) with the existing ×5 GFS keys (gfsDaily/Weekly/Monthly/Yearly) as labels; staged in `S.ui.backupTaskForm.retention` like today, always sent with save. No per-scale hints (that payload consumption is deferred). — **Reversibility:** reversible.

### Unified run history
- **D-04:** One sblock "Run history" BELOW the task table: three selects (task — including a "manual" entry matching task_id NULL; trigger manual|scheduled; status), simple limit/offset pagination; one row per run showing the 5-segment runLabel + GFS badge + status + date; hint "manual runs are not retained" visible when the task filter is on manual. Rides `GET /api/backup/runs?all=1` (Phase 92) unchanged. The old per-task history card is superseded (its data lives in the unified sblock filtered on that task). — **Reversibility:** reversible — client consumption of an existing route.

### Agent's Discretion
- Badge markup/class reuse (existing badge idiom) and exact column set of the tasks table (name/scope + schedule + next run + last run + actions) — planner's call, respecting the table-not-blocks mandate.
- Where `cronToPreset` lands in describeCron's descriptor vs a sibling field — same-module decision.
- Whether "Next run" comes from `next_run_at` (already on the shape) rendered via existing date formatting.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The page being reworked
- `src/pages/backup.js` — whole page: blocks rendering (:68+), task detail rows incl. raw cron :246 + retention line :248, actions row :230–234, form staging :273+, per-task history card :195 (`historyCard`), builder doctrine comments :12–30/:112–114.

### Server contracts (Phase 92 — consumed, not modified)
- `server.js` `backupTaskShape` (~:8840) — `{ ...row, scope, schedule: describeCron(row.cron) }`; D-02 adds `schedule.preset` via export/cron.js.
- `GET /api/backup/runs?all=1` (~:9345) — filters task/trigger/status/limit/offset, fail-closed per-run scope.
- `runLabel` + `gfs_bucket` on run rows (Phase 92 naming).
- export/cron.js — parseCron :83, describeCron (Phase 92) — `cronToPreset` joins them.

### Locked invariants
- `.planning/ROADMAP.md` § Phase 94 (5 SCs: real table + humanized schedule + Next/Last run; pre-filled editor; 4 retention scales + DST-locked labels; unified history fail-closed per-row + Restore-Op e2e pin; names-not-ids + no-retention hint).
- `.planning/REQUIREMENTS.md` BKUI-01..04 + Out of Scope (no cron DSL, no manual-run retention).
- i18n ×5 same-commit; esc() discipline; T-87-11 (no client cron eval).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GFS_SCALE_KEYS` map (backup.js:141) — retention labels already ×5.
- Builder form staging (`S.ui.backupTaskForm`) — extend retention to 4 fields.
- `historyCard` fetch/refresh logic — its payload handling migrates to the unified sblock.
- Badge idioms + `detail()` rows — table cells replace them.
- `describeCron` (export/cron.js) — `cronToPreset` sits beside it sharing parseCron.

### Established Patterns
- Server-side derivation, client renders only (Phase 92 doctrine) — hence D-02 server-side preset mapping.
- Fail-closed row-level authorization already enforced by the ?all=1 route.
- i18n ×5 same-commit; i18n-scan prebuild gate punishes dead keys (Phase 93 lesson — key add + use in ONE commit).

### Integration Points
- Task actions row (Run now / Edit / History / Enable / Delete) — History button now scrolls/filters the unified sblock instead of opening a card.
- Edit action → pre-filled form with header (D-02).

</code_context>

<specifics>
## Specific Ideas

- Owner's original complaints: blocks-in-blocks unreadable, raw cron displayed instead of humanized text, editor empty on Edit, retention missing month/year, history scattered per task — D-01..D-04 answer each directly.
- Restore-Op e2e pin (roadmap SC): the unified history must be exercised as a Restore Operator (scope-checked rows), reusing the e2e harness precedent (admin-revoke-cycle.spec.mjs).

</specifics>

<deferred>
## Deferred Ideas

- Per-scale retention hints from gfsKeptPositions (more payload consumption).
- History CSV export; date-range filter; per-run detail drawer beyond existing fields.
- Any cron DSL / free-text input (explicitly out of scope forever-ish).

</deferred>

---

*Phase: 94-Backup Console UX*
*Context gathered: 2026-11-24*
