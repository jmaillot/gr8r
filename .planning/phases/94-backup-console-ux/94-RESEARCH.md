# Phase 94: Backup Console UX - Research

**Researched:** 2026-11-24
**Domain:** Backup page client rework (src/pages/backup.js) over frozen Phase-92 server contracts; one additive server field (`schedule.preset`)
**Confidence:** HIGH (all findings read directly from source this session)

## Summary

The page is render-only over three payloads: `GET /api/backup/tasks` (tasks + `canBackup`/`canRestore` flags, each task shaped by `backupTaskShape` = `{...row, scope, schedule: describeCron(row.cron)}`), `GET /api/backup/runs/current` (poll), and `GET /api/backup/runs?taskId=` (per-task history). Phase 94 replaces the per-task `taskCard` panel with a real table, replaces `historyCard` with one unified sblock riding `?all=1`, pre-fills the Edit form, and adds two more retention inputs. Doctrine everywhere: client renders payload verbatim through `esc()`, never derives cron/roles/location, stages form state in `S.ui.backupTaskForm` (never the DOM), i18n keys added+used in the same commit (the `i18n:scan` prebuild gate fails dead keys).

The only server change is D-02: a `cronToPreset(expr)` export in `export/cron.js` derived from `parseCron` output (same discipline as `describeCron`), surfaced as `schedule.preset` on `backupTaskShape` (server.js:8840). `next_run_at` is already a persisted column on the task row computed server-side per write (`{...row}` carries it through `backupTaskShape` verbatim); the client already renders it via `fmtDate` (backup.js:226–227) — nothing new needed.

**Primary recommendation:** Server: add `cronToPreset` beside `describeCron` (returns `'daily'|'weekly'|'monthly'|'yearly'|null`), append `preset` to the descriptor in `backupTaskShape`. Client: replace `taskCard` with a table whose cells read the descriptor + `next_run_at` + a client-side last-run badge; extend `backupTaskEdit` to reverse-map `schedule.preset` into `form.preset`/`form.fields`; add monthly/yearly retention inputs; build the unified sblock over `api.backupRuns({ all: 1, task, trigger, status, limit, offset })` with staged filter state.

<user_constraints>
## User Constraints (from CONTEXT.md) — LOCKED

- **D-01:** badge 4 states — succeeded green / running neutral / failed red / succeeded-with-`checksum_ok === false` yellow "warning". Client-side derivation from fields the history/runs payload already carries.
- **D-02:** Edit pre-fills (name, scope, tz, retention, enabled); server-side `cronToPreset` in export/cron.js from parseCron output only; `schedule.preset: 'daily'|'weekly'|'monthly'|'yearly'|null` on `backupTaskShape`; preset matches → dropdowns pre-selected; else builder locked to readonly "custom schedule" raw display + hint. Header "Edit backup task" ABOVE the form block. NO free-text cron input; client never evaluates cron.
- **D-03:** four aligned numeric retention inputs (day/week/month/year) with existing `gfsDaily/Weekly/Monthly/Yearly` label keys; staged in `S.ui.backupTaskForm.retention`; always sent with save; no per-scale hints.
- **D-04:** one sblock "Run history" BELOW the task table; three selects (task incl. "manual" = `task_id NULL`; trigger manual|scheduled; status); simple limit/offset pagination; 5-segment runLabel + GFS badge + status + date per row; "manual runs are not retained" hint when task filter = manual; rides `?all=1` unchanged; supersedes `historyCard`.
- Deferred (out of scope): per-scale retention hints, history CSV export, date-range filter, per-run detail drawer, any cron DSL/free-text input.
</user_constraints>

## Standard Stack

No new packages. Everything exists in-repo:

| Asset | Location | Purpose |
|---|---|---|
| `parseCron` / `describeCron` | export/cron.js:83 / :115 | preset mapper joins them; grammar: star, lists, ranges, steps, dow 0=7 |
| `backupTaskShape` | server.js:8837–8841 | `{ ...row, scope, schedule: describeCron(row.cron) }` — add `preset` to descriptor |
| `GET /api/backup/runs?all=1` | server.js:9345–9419 | unified history, filters task/trigger/status/limit/offset, fail-closed per-row auth |
| `runLabel` | export/backup.js (imported server.js:87) | already resolved server-side into row `label` field (:9415) — render verbatim |
| `S.ui.backupTaskForm` + `cronFromForm` | actions.js:5016–5046 | staged form; serializer preset+fields → 5-field cron |
| `refreshBackupTasks` / `backupHistoryFetch` | actions.js | fill loops to extend |
| `esc()`, `fmtDate`, `t()`, badge classes, `empty()` | src/core, src/ui | existing idioms |

**Package Legitimacy Audit:** none — zero new dependencies (T-87-01 doctrine: no npm deps under export/cron.js; no new deps anywhere in this phase).

## Answers to the 5 research questions

### 1. backup.js anatomy & actions.js handlers

- **`taskCard(task, manage)`** (backup.js:217–254): a `panel` with `panel-h` (name + enabled badge) and a definition-grid of 5 `detail(label,value)` cells: scope, **raw cron** (`esc(task.cron)` — BKUI-01's complaint), tz, retention as `daily/weekly/monthly/yearly` slashes, next run (`fmtDate(new Date(task.next_run_at))` — already correct, reuse). Actions row at :228–236: `data-a` = `backupTaskRunNow` / `backupTaskEdit` / `backupTaskHistory` / `backupTaskToggle` / `backupTaskDelete`, each `data-id="${esc(task.id)}"`, rendered only when `flags.canBackup`. `historyCard` renders inside the card when `S.ui.backupHistoryOpen.has(task.id)` (:252).
- **`historyCard`** (backup.js:195–211): reads `S.ui.backupHistory[task.id]` — `{err}` | `{runs: [...]}`; rows via `runRow(run)` (:144–193) which renders: status badge (`RUN_STATUS_KEYS` :125–133 — verbatim enum: `running, succeeded, failed, upload_failed, interrupted, skipped_overlap, deleted`), location badge, missing-blob warn, `keptPosition` GFS badge, trigger (`RUN_TRIGGER_KEYS` :134), date, duration, size, sha slice, filename, download/verify CTAs, `checksum_ok === 1|0` green/red badges (:182), error toggle.
- **Edit today:** `A.backupTaskEdit` (actions.js:5096–5127) DOES pre-fill name/scope/tz/retention(daily,weekly only)/s3 — but sets `preset: 'custom'` with default fields, so the operator sees Custom with `*` fields and cannot see the real schedule. **This is the D-02 gap**: derive `preset`/`fields` from `task.schedule.preset` + `task.schedule.{hour,minute,weekday}` instead. `cronDirty: false` guard (:5110–5121) means an untouched schedule is not re-sent — **preserve this** when pre-selecting dropdowns (pre-fill must NOT set `cronDirty=true`).
- **Form defaults** (actions.js:5016–5034): `BACKUP_TASK_FIELD_DEFAULTS = { minute:'0', hour:'3', dom:'1', mon:'*', dow:'1' }`; `retention: { daily:7, weekly:4 }` → D-03 adds `monthly`/`yearly` keys here and in `backupTaskEdit` preload (`task.retention_monthly`, `task.retention_yearly`) and in the save body (actions.js:5162) and the two new `IN.backupTaskRetention` inputs (staging handler already generic — `data-f="monthly"` just works, actions.js:5077–5082).
- **`IN.backupTaskPreset` / `IN.backupTaskField`** set `cronDirty=true` (:5061–5074) — for D-02 "custom locked readonly", when `schedule.preset` is null the preset select should render disabled or be replaced by the readonly raw display + hint (planner's call; keep `cronDirty` semantics: touching nothing = cron not re-sent).
- **History toggle:** `A.backupTaskHistory` (actions.js:5247–5260) + `backupHistoryFetch` (:5261–5274, uses `api.backupRuns({taskId})`) + `refreshOpenBackupHistories` piggyback (:5278–5282). Under D-04 these fold into the unified sblock's fetch; the History button becomes scroll-to + set task filter.

### 2. cronToPreset (export/cron.js)

`parseCron` (:83–102) returns `{minute,hour,dom,mon,dow}` Sets + `domRestricted`/`dowRestricted` (set-size based). `describeCron` (:115–136) already classifies: `daily` (dom+dow unrestricted, singleton hour+minute, returns `{kind,hour,minute,raw}`), `weekly` (`{kind,weekday,hour,minute,raw}`), `yearly` (`{kind,hour,minute,raw}`), `monthly` (`{kind,hour,minute,raw}`). **cronToPreset is therefore a trivial projection of describeCron's output** (or parseCron's — D-02 says from parseCron output only, same discipline):

- `'daily' | 'weekly' | 'monthly' | 'yearly'` when the kind matches; `null` for custom/malformed.
- Dropdown pre-fill needs the *field values* too: `describeCron` already returns `hour`/`minute` (+ `weekday` for weekly; yearly/monthly need `dom`/`mon` singletons which describeCron currently does NOT emit for monthly/yearly). **Decision point for the planner:** either extend describeCron's descriptor additively (emit `dom`/`mon` singletons where present) or derive the fields in `cronToPreset` itself and return e.g. `{ preset, fields: {minute,hour,dow?,dom?,mon?} }` — CONTEXT allows either ("same-module decision").
- Malformed parse (`parseCron` null) → `describeCron` returns `{kind:'custom', raw}` — preset null, readonly raw display.
- **`next_run_at` is server-computed already**: it is a persisted column written per task write (see backupTaskToggle comment, actions.js:5193–5194: "the server recomputes next_run_at in the SAME write"), carried by `{...row}` in `backupTaskShape`. `nextRunAt()` in export/cron.js:169 does the DST-safe minute-scan. The table just renders it (existing :226–227 code).
- Pin: `cronToPreset` must live in export/cron.js (root, never src/) — the no-src-imports prohibition test.

### 3. Unified history `?all=1` row shape (server.js:9345–9419, read verbatim)

Select columns (:9376): `id, task_id, scope, uploaded, checksum_ok, checksum_checked_at, missing_blob_count, trigger, status, started_at, finished_at, duration_ms, size_bytes, sha256, filename, error, created_at, gfs_bucket`. Output row = `{...pub (scope stripped), location: 'local'|'s3'|'missing', label}` where **`label` IS the 5-segment runLabel resolved server-side** (:9408–9416) — the client composes nothing, render `run.label` verbatim.

- **D-01 badge inputs present:** `status` + `checksum_ok` (0/1/null) + `checksum_checked_at` — all in the row. ✓ No payload change needed.
- Filters: `task` (`'manual'` → `task_id is null`; else `^[A-Za-z0-9_-]{1,64}$`), `trigger` (`manual|scheduled` only), `status` (`running, succeeded, failed, upload_failed, deleted` — note: NOT interrupted/skipped_overlap), `limit` (default 50, clamp 1–200), `offset` (default 0). Unknown filter values → empty `runs` array (fail-closed). Response: `{ runs: [...] }` only — **no total count**; pagination is naive next/prev on offset (planner: fetch limit+1 or disable-next heuristic).
- Auth: route gate = BACKUP_MANAGE or RESTORE_USE (:9333); per-row fail-closed visibility (instance ✓, workspace/project = live membership or super-access), unauthorized rows **dropped, never error'd** (:9383–9402). This is the BKUI-04 / Restore-Op e2e surface.
- Per-task variant (`?taskId=`, legacy) stays byte-frozen (golden fixture test; grep gate forbids new params on the legacy path).

### 4. i18n inventory (src/locales/en.json `page.backup.*`, ×5 locales en/fr/nl/de/es)

Existing (reuse): `tasksTitle, taskFormTitle, taskEditTitle, scheduleLabel, nextRunLabel, retentionLabel, retentionDaily, retentionWeekly, presetDaily..Custom, fieldMinute/Hour/DayOfMonth/Month/DayOfWeek, statusRunning/Succeeded/Failed/UploadFailed/Interrupted/SkippedOverlap/Deleted, triggerManual/Scheduled, gfsDaily/Weekly/Monthly/Yearly, historyTitle, historyCap, historyEmpty/Loading/Unavailable, taskEnabled/Disabled, checksumOk/Fail`.

New keys needed (~13–18): table column headers ×5 (task/name, scope, schedule, next run, last run); warning badge label (D-01 yellow); custom-schedule readonly hint; "Edit backup task" — **already exists as `taskEditTitle`** (check its current wording matches D-02); history filter labels (task/trigger/status selects, "manual" task entry); manual-not-retained hint; unified pagination labels if any. `retentionMonthly`/`retentionYearly` input labels: **do not exist** — D-03 says use the existing `gfsMonthly`/`gfsYearly` keys as labels instead (locked decision; no new keys there). Discipline: `scripts/i18n-scan.mjs` runs as `prebuild` gate — add key + use it in the SAME commit; ×5 locale parity asserted in the governance-tabs-client test pattern.

### 5. Test landscape

- **Static-assertion precedent (the workhorse):** `test/backup-history-client.test.mjs` fs-reads `src/pages/backup.js` / `src/actions/actions.js` / `src/core/api.js` and pins wiring structurally (esc() discipline, **no `parseCron`/`nextRunAt` under src/** — a new preset derivation must NOT appear client-side, extend these negatives), no free-text cron input (`data-in="backupTaskCron"` absent). `test/governance-tabs-client.test.mjs` (Phase 93) is the fresher pattern: source assertions **plus direct JSON imports of all 5 locale files** for ×5 parity checks — reuse that shape for the new keys.
- **Unit surface for cronToPreset:** `test/backup-cron.test.mjs` already has a describeCron block (:119–146, deepEqual on the descriptor objects) — append cronToPreset cases: daily/weekly/monthly/yearly expressions, `*/15 * * * *` → null, ranges/multi-values → null, malformed → null, dow-7 fold.
- **Unified history server surface:** `test/backup-scopes.test.mjs` (per-row visibility) and `test/backup-routes.test.mjs` cover the ?all=1 route — check they pin `label`; extend if the filter matrix needs it. `test/fixtures/backup-runs-legacy-golden.json` pins the legacy path byte-identity — do not touch.
- **Restore-Op e2e pin (roadmap SC):** harness precedent = `e2e/admin-revoke-cycle.spec.mjs` / `e2e/operator-revoke-cycle.spec.mjs` — real API fixtures via `e2e/helpers/setup.mjs` (`createAccount`, workspace invites) and TOTP codes; instance roles grant via `api.instanceRoleGrant(userId, role)` (src/core/api.js:551, `POST /api/auth/operator/instance-roles`) — grant Restore-Op to a second account, log in as it, open Backup, drive the unified history, assert instance-scope rows visible and workspace/project rows for non-member scopes are dropped (names-not-ids: assert task *names* and `label` text, never raw ids).
- Commands: unit `node --test test/backup-cron.test.mjs test/backup-history-client.test.mjs`; full `npm test`; e2e `npm run e2e`.

## Architecture Patterns

### System Architecture Diagram

```
Browser (src/pages/backup.js — render-only, esc() everywhere)
   │  GET /api/backup/tasks ──► server.js backupTaskShape (schedule = describeCron + NEW preset)
   │  GET /api/backup/runs?all=1&task&trigger&status&limit&offset ──► fail-closed per-row filter
   │       └─ rows carry server-resolved `label` (runLabel), location, checksum_ok
   │  GET /api/backup/runs/current (poll, unchanged)
   ▼
Actions (actions.js — staged state in S.ui.*, fill loops, keyed toasts)
   │  backupTaskEdit ← pre-fill from task.schedule.preset (D-02)
   │  backupTaskSave → cronFromForm (client serializer; NO parser)
   ▼
export/cron.js (server-only, root — parseCron → describeCron + NEW cronToPreset; nextRunAt DST scan)
```

### Pattern rules (doctrine, non-negotiable)
- Client never parses/evaluates cron — preset mapping is server-side; the static test enforces `parseCron`/`nextRunAt` absence under src/.
- All payload fields through `esc()`; statuses/triggers via keyed label maps (unknown → `statusUnknown`/`triggerUnknown`).
- Form state in `S.ui.backupTaskForm`, never the DOM; `cronDirty` gates whether cron is re-sent.
- `backupTaskShape` additive only — legacy `?taskId=` path byte-frozen.

### Anti-patterns to avoid
- Composing runLabel client-side from segments — it arrives complete as `run.label`.
- Pre-selecting dropdowns without checking `cronDirty` (would silently rewrite schedules on name-only edits).
- Retaining manual runs or offering a date-range filter (deferred/out of scope).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---|---|---|
| Cron → preset | client parser | `cronToPreset` in export/cron.js sharing parseCron |
| Pagination metadata | count queries | offset increments + limit-clamp fetch (no total in payload) |
| Table styles | new CSS | existing badge/panel/`row` idioms (governance table precedent) |
| Date rendering | custom formatting | `fmtDate` (already used for next_run_at) |

## Common Pitfalls

1. **Silent schedule rewrite on Edit:** pre-filled dropdowns must keep `cronDirty=false` until the user touches a control; otherwise every rename edits the cron.
2. **i18n dead keys:** prebuild gate fails on unused keys — add+use per commit, all 5 locales.
3. **Status filter enum mismatch:** `?all=1` status filter accepts only `running|succeeded|failed|upload_failed|deleted` — an `interrupted` option in the status select narrows to empty. Either omit it from the filter or accept it narrows (fail-closed by design).
4. **`task` filter values are task IDs, names for display:** build the task select from `S.ui.backupTasks.tasks` (name label, id value) + a synthetic "manual" entry — names-not-ids SC means the *display* is the task name, the *request* uses the id.
5. **Paging without totals:** `?all=1` returns only `{runs}` — a "next" button should probe (request limit+1) or gray out on short pages, not guess.
6. **DescribeCron lacks dom/mon for monthly/yearly pre-fill:** emit them additively or derive inside cronToPreset — don't re-parse the raw string client-side.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | `taskEditTitle`'s current wording is acceptable as the "Edit backup task" header (key exists; exact copy not read) | i18n | trivial copy fix, ×5 |
| A2 | `instanceRoleGrant` role value for Restore-Op is the governance seg value `restore` (superSegRestore) | Tests | e2e grant fails → read server instance-roles route during planning |
| A3 | `keptPosition` is NOT present on `?all=1` rows (not in the select) — GFS badge under D-04 shows `gfs_bucket`-derived label only | Q3 | badge design adjusts (label already embeds GFS segment) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | node:test (`node --test`), Playwright for e2e |
| Config file | package.json scripts; e2e/playwright.config.mjs |
| Quick run command | `node --test test/backup-cron.test.mjs test/backup-history-client.test.mjs test/backup-tasks-api.test.mjs` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req | Behavior | Test Type | Automated Command | File Exists? |
|-----|----------|-----------|-------------------|-------------|
| BKUI-01 | table + humanized schedule + next/last run + 4-state badge | static assertions (extend backup-history-client pattern) | `node --test test/backup-history-client.test.mjs` | ✅ extend |
| BKUI-02 | pre-filled Edit incl. cronToPreset | unit (cronToPreset deepEqual) + static (pre-fill keeps cronDirty=false) | `node --test test/backup-cron.test.mjs` | ✅ extend |
| BKUI-03 | 4 retention inputs staged+sent | static assertions on actions.js/backup.js + locale parity ×5 | `node --test test/backup-history-client.test.mjs` | ✅ extend |
| BKUI-04 | unified history + filters + fail-closed + Restore-Op e2e pin | server route tests + static + Playwright spec | `node --test test/backup-scopes.test.mjs` ; `npm run e2e` | ✅ extend / new spec |

### Wave 0 Gaps
- [ ] New e2e spec (e.g. `e2e/backup-console-restore-op.spec.mjs`) — grant Restore-Op via instanceRoleGrant, drive unified history
- [ ] cronToPreset describeCron-consistency cases in test/backup-cron.test.mjs
- None else — existing infra covers all requirements.

**Validation gate reminder:** `npm run prebuild` (i18n-scan) must pass — dead keys fail the build.
